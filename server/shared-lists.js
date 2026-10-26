// Planning together: a list's owner invites hiking partners, who can then
// edit that one list (not the rest of the owner's library) in the regular
// editor, live.
//
// - Members open /plan/:owner/:listId. They load a one-list library (that
//   list, its categories, the gear in it) and save changes to it.
// - applySharedChanges only lets through changes to that list: its name,
//   description and trip settings, its categories and their items, and gear
//   that is new or already in the list. Publishing, sharing, other lists,
//   library settings and the rest of the owner's closet stay the owner's.
// - New gear a member adds lives in the owner's library (it's the owner's
//   list), marked with the member as its carrier.

import knex from './db.js';
import { loadLibrary, applyChanges, LibraryError } from './library-store.js';
import { notify, sendNotificationEmails } from './notify.js';
import { announce } from './live.js';

export class PlanError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}

const isId = (v) => Number.isSafeInteger(v) && v > 0;

async function userNamed(username) {
    const u = await knex('users').whereRaw('lower(username) = ?', [String(username || '').toLowerCase()]).first();
    if (!u) throw new PlanError('No hiker with that username.', 404);
    return u;
}

async function ownedList(ownerId, listId) {
    const id = Number(listId);
    if (!isId(id)) throw new PlanError('No such list.', 404);
    const list = await knex('pack_lists').where({ user_id: ownerId, id }).first();
    if (!list) throw new PlanError('No such list.', 404);
    return list;
}

// Who may open /plan/:owner/:listId, and as what.
export async function planAccess(user, ownerUsername, listId) {
    if (!user) throw new PlanError('Sign in to plan this list.', 401);
    const owner = await userNamed(ownerUsername);
    const list = await ownedList(owner.user_id, listId);
    if (owner.user_id === user.user_id) return { owner, list, role: 'owner' };
    const member = await knex('list_members').where({ owner_id: owner.user_id, list_id: list.id, member_id: user.user_id }).first();
    if (!member) throw new PlanError("You haven't been invited to plan this list.", 403);
    return { owner, list, role: member.role };
}

export async function members(ownerId, listId) {
    const owner = await knex('users').where({ user_id: ownerId }).first('username', 'display_name', 'avatar_url');
    const rows = await knex('list_members').join('users', 'users.user_id', 'list_members.member_id')
        .where({ owner_id: ownerId, list_id: listId })
        .select('users.username', 'users.display_name', 'users.avatar_url', 'list_members.role')
        .orderBy('list_members.created_at');
    const person = (r, role) => ({ username: r.username, displayName: r.display_name || '', avatarUrl: r.avatar_url || '', role });
    return [person(owner, 'owner'), ...rows.map((r) => person(r, r.role))];
}

// Everyone involved with a list (owner and members), as user ids.
export async function participantIds(ownerId, listId) {
    const ids = await knex('list_members').where({ owner_id: ownerId, list_id: listId }).pluck('member_id');
    return [ownerId, ...ids];
}

// Lists of `ownerId` that have members, so their saves reach them live.
export async function sharedListIds(ownerId) {
    return knex('list_members').where({ owner_id: ownerId }).distinct('list_id').pluck('list_id');
}

export async function invite(owner, listId, username) {
    const list = await ownedList(owner.user_id, listId);
    const member = await userNamed(username);
    if (member.user_id === owner.user_id) throw new PlanError("That's you: you already plan this list.");
    const count = await knex('list_members').where({ owner_id: owner.user_id, list_id: list.id }).count({ n: '*' });
    if (Number(count[0].n) >= 20) throw new PlanError('A list can be planned by up to 20 people.');
    const emails = await knex.transaction(async (trx) => {
        const added = await trx('list_members').insert({ owner_id: owner.user_id, list_id: list.id, member_id: member.user_id })
            .onConflict(['owner_id', 'list_id', 'member_id']).ignore().returning('member_id');
        if (!added.length) return [];
        return notify(trx, [{
            recipientId: member.user_id, kind: 'invite', actor: owner.username, listName: list.name || 'a list',
            url: `/plan/${owner.username}/${list.id}`,
        }]);
    });
    sendNotificationEmails(emails);
    return members(owner.user_id, list.id);
}

// The owner removes someone, or a member leaves.
export async function removeMember(user, ownerUsername, listId, username) {
    const owner = await userNamed(ownerUsername);
    const list = await ownedList(owner.user_id, listId);
    const target = await userNamed(username);
    if (user.user_id !== owner.user_id && user.user_id !== target.user_id) throw new PlanError('Only the list owner can remove people.', 403);
    await knex('list_members').where({ owner_id: owner.user_id, list_id: list.id, member_id: target.user_id }).del();
    return members(owner.user_id, list.id);
}

export async function sharedWithMe(user) {
    const rows = await knex('list_members')
        .join('pack_lists', function on() {
            this.on('pack_lists.user_id', 'list_members.owner_id').andOn('pack_lists.id', 'list_members.list_id');
        })
        .join('users', 'users.user_id', 'list_members.owner_id')
        .where({ member_id: user.user_id })
        .select('users.username as owner', 'pack_lists.id as listId', 'pack_lists.name as name')
        .orderBy('list_members.created_at', 'desc');
    return rows.map((r) => ({ owner: r.owner, listId: Number(r.listId), name: r.name || 'Untitled list' }));
}

// The owner's library cut down to one list, in the Library.save() shape.
export async function loadPlan(ownerId, listId) {
    const full = await loadLibrary(ownerId);
    if (!full) throw new PlanError('No such list.', 404);
    const list = full.lists.find((l) => l.id === Number(listId));
    if (!list) throw new PlanError('No such list.', 404);
    const categories = full.categories.filter((c) => list.categoryIds.includes(c.id));
    const itemIds = new Set(categories.flatMap((c) => c.categoryItems.map((ci) => ci.itemId)));
    return {
        ...full,
        defaultListId: list.id,
        // Kits are personal; the closet is just what's in this list.
        kits: undefined,
        lists: [list],
        categories,
        items: full.items.filter((i) => itemIds.has(i.id)),
    };
}

// Keep a member's save to what they may change (see top of file).
export async function filterPlanChanges(ownerId, listId, changes) {
    if (!changes || typeof changes !== 'object') throw new LibraryError('No changes sent.');
    const id = Number(listId);
    const current = await loadPlan(ownerId, id);
    const list = current.lists[0];
    const listCategoryIds = new Set(list.categoryIds);
    const listItemIds = new Set(current.items.map((i) => i.id));
    const ownerItemIds = new Set(await knex('gear_items').where({ user_id: ownerId }).pluck('id').then((ids) => ids.map(Number)));

    const out = {};
    const upsertLists = (changes.lists && Array.isArray(changes.lists.upsert)) ? changes.lists.upsert : [];
    const mine = upsertLists.find((l) => l && l.id === id);
    let newCategoryIds = new Set();
    if (mine) {
        // Member-editable list fields; the rest stays as the owner set it.
        const categoryIds = Array.isArray(mine.categoryIds) ? mine.categoryIds.filter(isId) : list.categoryIds;
        newCategoryIds = new Set(categoryIds.filter((cid) => !listCategoryIds.has(cid)));
        out.lists = {
            upsert: [{
                ...list,
                name: mine.name,
                description: mine.description,
                categoryIds,
                ...(mine.trip ? { trip: mine.trip } : { trip: undefined }),
                tripType: mine.tripType,
            }],
            delete: [],
        };
    }
    const allowedCategory = (cid) => listCategoryIds.has(cid) || newCategoryIds.has(cid);
    const cats = changes.categories || {};
    out.categories = {
        upsert: (Array.isArray(cats.upsert) ? cats.upsert : []).filter((c) => c && allowedCategory(c.id)),
        delete: (Array.isArray(cats.delete) ? cats.delete : []).filter((cid) => listCategoryIds.has(cid)),
    };
    const items = changes.items || {};
    out.items = {
        // Gear already in this list, or brand new (not some other of the
        // owner's gear, which the member can't see).
        upsert: (Array.isArray(items.upsert) ? items.upsert : []).filter((i) => i && isId(i.id)
            && (listItemIds.has(i.id) || !ownerItemIds.has(i.id))),
        // Deleting gear only if it was in this list and nowhere else.
        delete: [],
    };
    // A category may only hold gear the member can see: what's in the list
    // already, or what they're adding now.
    const visibleItems = new Set([...listItemIds, ...out.items.upsert.map((i) => i.id)]);
    out.categories.upsert = out.categories.upsert.map((c) => ({
        ...c,
        categoryItems: (Array.isArray(c.categoryItems) ? c.categoryItems : []).filter((ci) => ci && visibleItems.has(ci.itemId)),
    }));
    const wantDelete = (Array.isArray(items.delete) ? items.delete : []).filter((iid) => listItemIds.has(iid));
    if (wantDelete.length) {
        const elsewhere = new Set(await knex('pack_list_items').join('pack_list_categories', function on() {
            this.on('pack_list_categories.user_id', 'pack_list_items.user_id').andOn('pack_list_categories.id', 'pack_list_items.category_id');
        }).where('pack_list_items.user_id', ownerId).whereNot('pack_list_categories.list_id', id)
            .whereIn('pack_list_items.item_id', wantDelete).pluck('pack_list_items.item_id').then((r) => r.map(Number)));
        out.items.delete = wantDelete.filter((iid) => !elsewhere.has(iid));
    }
    return out;
}

export async function applyPlanChanges(ownerId, listId, changes) {
    const filtered = await filterPlanChanges(ownerId, listId, changes);
    await knex.transaction(async (trx) => {
        await applyChanges(ownerId, filtered, trx);
        await trx('users').where({ user_id: ownerId }).update({ sync_token: trx.raw('sync_token + 1') });
    });
    const { sync_token: syncToken } = await knex('users').where({ user_id: ownerId }).first('sync_token');
    return { syncToken: Number(syncToken) };
}

// After any change to someone's library: their other tabs, and everyone
// planning one of their shared lists, re-fetch what they show.
export async function announceLibraryChange(ownerId, ownerUsername, by) {
    const memberIds = await knex('list_members').where({ owner_id: ownerId }).distinct('member_id').pluck('member_id');
    announce([ownerId, ...memberIds], { owner: ownerUsername, by });
}
