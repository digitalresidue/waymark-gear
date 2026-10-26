// Comments on published lists (Phase 3.6).
//
// - Threads go three levels deep; a reply to a third-level comment joins
//   that conversation at the same level rather than indenting forever.
// - "Suggestion" comments are for shakedowns: they can name the item they're
//   about, and the list owner sees them called out.
// - Deleting keeps a placeholder when there are replies, so threads stay
//   readable. Moderators hide rather than delete, and can restore.
// - Each new comment notifies the list owner and the person replied to, in
//   the app and (at most every 15 minutes per person) by email.

import knex from './db.js';
import { isModerator } from './auth.js';
import { notify, sendNotificationEmails } from './notify.js';

export const COMMENT_MAX = 2000;
const MAX_DEPTH = 2;

export class CommentError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}

async function kitFor(externalId, db = knex) {
    return db('public_kits').where({ external_id: String(externalId) }).first();
}

function cleanBody(body) {
    const text = Array.from(String(body ?? '')).filter((ch) => {
        const c = ch.charCodeAt(0);
        return c >= 0x20 || c === 0x0A || c === 0x09;
    }).join('').replace(/\r\n?/g, '\n').trim();
    if (!text) throw new CommentError('Write something first.');
    if (text.length > COMMENT_MAX) throw new CommentError(`Comments can be up to ${COMMENT_MAX} characters.`);
    return text;
}

function present(row, { viewer, ownerId }) {
    const moderator = viewer && isModerator(viewer.username);
    const removed = Boolean(row.deleted_at);
    const hidden = Boolean(row.hidden_at);
    const mine = viewer && viewer.user_id === row.author_id;
    const showBody = !removed && (!hidden || moderator || mine);
    return {
        id: Number(row.id),
        parentId: row.parent_id === null ? null : Number(row.parent_id),
        depth: row.depth,
        kind: row.kind,
        itemName: showBody ? row.item_name : '',
        body: showBody ? row.body : '',
        removed,
        hidden,
        author: removed ? null : {
            username: row.username,
            displayName: row.display_name || '',
            avatarUrl: row.avatar_url || '',
            isListOwner: row.author_id === ownerId,
        },
        createdAt: row.created_at,
        editedAt: row.edited_at,
        canEdit: Boolean(mine && !removed),
        canDelete: Boolean(!removed && viewer && (mine || viewer.user_id === ownerId || moderator)),
        canReport: Boolean(!removed && viewer && !mine),
        canModerate: Boolean(moderator),
    };
}

export async function listComments(externalId, viewer) {
    const kit = await kitFor(externalId);
    if (!kit) throw new CommentError('Comments are only open on published lists.', 404);
    const rows = await knex('comments')
        .leftJoin('users', 'users.user_id', 'comments.author_id')
        .select('comments.*', 'users.username', 'users.display_name', 'users.avatar_url')
        .where({ external_id: kit.external_id })
        .orderBy('comments.created_at', 'asc')
        .limit(1000);
    const ownerId = kit.user_id;
    // A removed comment with no remaining replies has nothing left to show.
    const hasReplies = new Set(rows.filter((r) => !r.deleted_at).map((r) => String(r.parent_id)));
    const visible = rows.filter((r) => !r.deleted_at || hasReplies.has(String(r.id)));
    return {
        listName: kit.name,
        owner: kit.username,
        shakedown: Boolean(kit.shakedown),
        viewer: viewer ? { username: viewer.username, isOwner: viewer.user_id === ownerId } : null,
        comments: visible.map((r) => present(r, { viewer, ownerId })),
    };
}

export async function addComment(user, externalId, input = {}) {
    const body = cleanBody(input.body);
    const kind = input.kind === 'suggestion' ? 'suggestion' : 'comment';
    const itemName = kind === 'suggestion' ? String(input.itemName || '').trim().slice(0, 200) : '';
    const emails = [];

    const result = await knex.transaction(async (trx) => {
        const kit = await kitFor(externalId, trx);
        if (!kit) throw new CommentError('Comments are only open on published lists.', 404);

        let parent = null;
        let depth = 0;
        if (input.parentId !== undefined && input.parentId !== null) {
            parent = await trx('comments').where({ id: Number(input.parentId), external_id: kit.external_id }).first();
            if (!parent || parent.deleted_at) throw new CommentError("That comment isn't there anymore.", 404);
            depth = Math.min(parent.depth + 1, MAX_DEPTH);
            // Past the deepest level, replies join the parent's conversation.
            if (parent.depth >= MAX_DEPTH) parent = { ...parent, id: parent.parent_id };
        }

        const [row] = await trx('comments').insert({
            external_id: kit.external_id,
            list_owner_id: kit.user_id,
            author_id: user.user_id,
            parent_id: parent ? parent.id : null,
            depth,
            kind,
            item_name: itemName,
            body,
        }).returning('*');

        const item = (recipientId, notifyKind) => ({
            recipientId,
            kind: notifyKind,
            actor: user.username,
            listName: kit.name || 'your list',
            excerpt: body.length > 300 ? `${body.slice(0, 300)}…` : body,
            externalId: kit.external_id,
            commentId: Number(row.id),
        });
        const items = [];
        if (kit.user_id !== user.user_id) items.push(item(kit.user_id, kind));
        const repliedTo = input.parentId !== undefined && input.parentId !== null
            ? await trx('comments').where({ id: Number(input.parentId) }).first() : null;
        if (repliedTo && repliedTo.author_id && repliedTo.author_id !== user.user_id && repliedTo.author_id !== kit.user_id) {
            items.push(item(repliedTo.author_id, 'reply'));
        }
        emails.push(...await notify(trx, items));
        return { row, ownerId: kit.user_id };
    });

    sendNotificationEmails(emails);
    const author = await knex('users').where({ user_id: user.user_id }).first();
    return present({ ...result.row, username: author.username, display_name: author.display_name, avatar_url: author.avatar_url }, { viewer: user, ownerId: result.ownerId });
}

async function commentFor(id) {
    const row = await knex('comments').where({ id: Number(id) || 0 }).first();
    if (!row) throw new CommentError("That comment isn't there anymore.", 404);
    return row;
}

export async function editComment(user, id, body) {
    const row = await commentFor(id);
    if (row.author_id !== user.user_id || row.deleted_at) throw new CommentError('You can only edit your own comments.', 403);
    await knex('comments').where({ id: row.id }).update({ body: cleanBody(body), edited_at: knex.fn.now() });
    return { ok: true };
}

export async function deleteComment(user, id) {
    const row = await commentFor(id);
    const allowed = row.author_id === user.user_id || row.list_owner_id === user.user_id || isModerator(user.username);
    if (!allowed) throw new CommentError("You can't delete that comment.", 403);
    await knex('comments').where({ id: row.id }).update({ deleted_at: knex.fn.now(), body: '', item_name: '' });
    return { ok: true };
}

export async function reportComment(user, id, reason) {
    const row = await commentFor(id);
    if (row.author_id === user.user_id) throw new CommentError("You can't report your own comment.");
    await knex('comment_reports').insert({
        comment_id: row.id,
        reporter_id: user.user_id,
        reason: String(reason || '').trim().slice(0, 500),
    }).onConflict(['comment_id', 'reporter_id']).ignore();
    return { ok: true };
}

// ---- notifications ----------------------------------------------------------

export async function notificationsFor(user, limit = 30) {
    // Follows link to the follower's profile; everything else to the list.
    const rows = await knex('notifications').where({ user_id: user.user_id })
        .orderBy('created_at', 'desc').limit(Math.min(Number(limit) || 30, 100));
    const [{ count }] = await knex('notifications').where({ user_id: user.user_id }).whereNull('read_at').count({ count: '*' });
    return {
        unread: Number(count),
        items: rows.map((r) => ({
            id: Number(r.id),
            kind: r.kind,
            actor: r.actor_username,
            listName: r.list_name,
            url: r.url || (r.kind === 'follow' ? `/@${r.actor_username}` : `/r/${r.external_id}${r.comment_id ? `#comment-${r.comment_id}` : ''}`),
            createdAt: r.created_at,
            read: Boolean(r.read_at),
        })),
    };
}

export async function markNotificationsRead(user) {
    await knex('notifications').where({ user_id: user.user_id }).whereNull('read_at').update({ read_at: knex.fn.now() });
    return { ok: true };
}

// ---- moderation ---------------------------------------------------------------

export async function openReports() {
    const rows = await knex('comment_reports')
        .join('comments', 'comments.id', 'comment_reports.comment_id')
        .leftJoin('users as author', 'author.user_id', 'comments.author_id')
        .join('users as reporter', 'reporter.user_id', 'comment_reports.reporter_id')
        .whereNull('comment_reports.resolved_at')
        .select(
            'comments.id', 'comments.body', 'comments.external_id', 'comments.hidden_at', 'comments.deleted_at',
            'author.username as author', 'reporter.username as reporter',
            'comment_reports.reason', 'comment_reports.created_at',
        )
        .orderBy('comment_reports.created_at', 'asc')
        .limit(200);
    const byComment = new Map();
    for (const r of rows) {
        const id = Number(r.id);
        if (!byComment.has(id)) {
            byComment.set(id, {
                id,
                body: r.body,
                author: r.author || '(deleted account)',
                url: `/r/${r.external_id}#comment-${id}`,
                hidden: Boolean(r.hidden_at),
                removed: Boolean(r.deleted_at),
                reports: [],
            });
        }
        byComment.get(id).reports.push({ reporter: r.reporter, reason: r.reason, createdAt: r.created_at });
    }
    return [...byComment.values()];
}

export async function moderateComment(moderator, id, action) {
    const row = await commentFor(id);
    if (action === 'hide') {
        await knex('comments').where({ id: row.id }).update({ hidden_at: knex.fn.now(), hidden_by: moderator.username });
    } else if (action === 'restore') {
        await knex('comments').where({ id: row.id }).update({ hidden_at: null, hidden_by: null });
    } else if (action !== 'dismiss') {
        throw new CommentError('Unknown action.');
    }
    await knex('comment_reports').where({ comment_id: row.id }).whereNull('resolved_at').update({ resolved_at: knex.fn.now() });
    return { ok: true };
}
