// The site team (server/auth.js has the roles), the activity log, the
// owner's approval queue, and the owner's list of everyone who signed up.
//
// Admins can change things freely except for the few that are hard to undo:
// deleting catalog gear, brands or trails, and catalog imports that touch 25
// or more rows. Those are stored as a request with everything needed to carry
// them out, and run only when an owner approves.

import express from 'express';

import knex from './db.js';
import { authenticateOwner, isOwner, refreshTeam, roleOf } from './auth.js';
import { logWithRequest } from './log.js';
import { isSupporter } from './billing.js';

const router = express.Router();

export const BIG_IMPORT_ROWS = 25;

// ---- approvals ----------------------------------------------------------------

const executors = new Map();

// What each kind of request does once approved: (payload, owner) => result.
export function registerAction(action, run, describe = () => '') {
    executors.set(action, { run, describe });
}

export function needsApproval(user) {
    return !isOwner(user.username);
}

// Queue `action` for the owner and answer the admin with 202. The request's
// own activity-log entry is this one, so the generic logger stands down.
export async function requestApproval(req, res, user, action, payload, summary) {
    const [row] = await knex('admin_actions').insert({
        username: user.username, action, summary: String(summary || '').slice(0, 300), status: 'pending', payload: JSON.stringify(payload),
    }).returning(['id']);
    res.locals.loggedAction = true;
    return res.status(202).json({
        pending: true,
        id: Number(row.id),
        message: 'Sent to the site owner to approve. It will happen once they OK it.',
    });
}

export async function decide(owner, id, approve, note = '') {
    const row = await knex('admin_actions').where({ id: Number(id) || 0 }).first();
    if (!row) return { error: 'No such request.', status: 404 };
    if (row.status !== 'pending') return { error: 'That request was already decided.', status: 409 };
    const decided = { decided_by: owner.username, decided_at: knex.fn.now(), note: String(note || '').slice(0, 500) };
    if (!approve) {
        await knex('admin_actions').where({ id: row.id }).update({ ...decided, status: 'rejected' });
        return { status: 'rejected' };
    }
    const exec = executors.get(row.action);
    if (!exec) return { error: 'This kind of request can no longer be carried out.', status: 400 };
    try {
        await exec.run(row.payload || {}, owner);
        await knex('admin_actions').where({ id: row.id }).update({ ...decided, status: 'approved' });
        return { status: 'approved' };
    } catch (err) {
        await knex('admin_actions').where({ id: row.id }).update({ ...decided, status: 'failed', note: String(err.message || err).slice(0, 500) });
        return { error: `Approved, but it didn't work: ${err.message || err}`, status: 500 };
    }
}

// ---- the team -------------------------------------------------------------------

export async function listTeam() {
    const rows = await knex('team_members as t').join('users as u', 'u.user_id', 't.user_id')
        .select('u.username', 'u.display_name', 't.role', 't.added_by', 't.added_at').orderBy('t.added_at');
    return rows.map((r) => ({ username: r.username, name: r.display_name || '', role: r.role, addedBy: r.added_by, addedAt: r.added_at }));
}

export async function setMember(owner, username, role) {
    if (!['admin', 'moderator'].includes(role)) return { error: 'Pick admin or moderator.', status: 400 };
    const user = await knex('users').whereRaw('lower(username) = lower(?)', [String(username || '').trim()]).first('user_id', 'username');
    if (!user) return { error: 'No one has that username.', status: 404 };
    if (isOwner(user.username)) return { error: 'That account is a site owner already.', status: 400 };
    await knex('team_members').insert({ user_id: user.user_id, role, added_by: owner.username })
        .onConflict('user_id').merge(['role', 'added_by']);
    await refreshTeam();
    return { team: await listTeam() };
}

export async function removeMember(username) {
    const user = await knex('users').where({ username: String(username) }).first('user_id');
    if (user) await knex('team_members').where({ user_id: user.user_id }).del();
    await refreshTeam();
    return { team: await listTeam() };
}

// ---- the activity log --------------------------------------------------------------

export async function activity({ status = '', limit = 100, offset = 0 } = {}) {
    const q = knex('admin_actions');
    if (status) q.where({ status });
    const rows = await q.orderBy('created_at', 'desc').limit(Math.min(Number(limit) || 100, 200)).offset(Math.max(Number(offset) || 0, 0));
    const pending = Number((await knex('admin_actions').where({ status: 'pending' }).count({ n: '*' }))[0].n);
    return {
        pending,
        actions: rows.map((r) => ({
            id: Number(r.id), username: r.username, role: roleOf(r.username) || 'former', action: r.action, summary: r.summary,
            status: r.status, decidedBy: r.decided_by, decidedAt: r.decided_at, note: r.note, at: r.created_at,
            detail: r.status === 'pending' && executors.has(r.action) ? executors.get(r.action).describe(r.payload || {}) : '',
        })),
    };
}

// ---- everyone who signed up (owner only: includes emails) ----------------------------

export async function listUsers({ q = '', supporter = '', limit = 50, offset = 0 } = {}) {
    const query = knex('users as u');
    const term = String(q).trim();
    if (term) {
        const like = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
        query.where((w) => w.whereILike('u.username', like).orWhereILike('u.email', like).orWhereILike('u.display_name', like));
    }
    const isSupporterSql = "(u.plan = 'supporter' and (u.plan_until is null or u.plan_until > now()))";
    if (supporter === 'yes') query.whereRaw(isSupporterSql);
    if (supporter === 'no') query.whereRaw(`not ${isSupporterSql}`);
    const [{ n }] = await query.clone().count({ n: '*' });
    const rows = await query
        .select('u.username', 'u.display_name', 'u.trail_name', 'u.email', 'u.registered', 'u.last_seen', 'u.plan', 'u.plan_until', 'u.plan_source',
            knex.raw('(select count(*) from list l where l.user_id = u.user_id)::int as lists'),
            knex.raw('(select count(*) from public_kits k where k.user_id = u.user_id)::int as published'))
        .orderBy('u.registered', 'desc')
        .limit(Math.min(Number(limit) || 50, 200)).offset(Math.max(Number(offset) || 0, 0));
    const [{ supporters }] = await knex('users as u').whereRaw(isSupporterSql).count({ supporters: '*' });
    return {
        total: Number(n),
        supporters: Number(supporters),
        users: rows.map((r) => ({
            username: r.username,
            name: r.display_name || '',
            trailName: r.trail_name || '',
            email: r.email,
            joined: r.registered,
            lastSeen: r.last_seen,
            supporter: isSupporter(r),
            supporterUntil: r.plan === 'supporter' ? r.plan_until || null : null,
            supporterSource: r.plan === 'supporter' ? r.plan_source || '' : '',
            lists: r.lists,
            published: r.published,
            role: roleOf(r.username),
        })),
    };
}

// ---- routes (owner only) -----------------------------------------------------------

const owner = (handler) => (req, res) => authenticateOwner(req, res, async (req, res, user) => {
    try {
        await handler(req, res, user);
    } catch (err) {
        logWithRequest(req, { message: 'owner api error', url: req.originalUrl, err });
        if (!res.headersSent) res.status(500).json({ message: 'An error occurred.' });
    }
});
const send = (res, result) => (result.error ? res.status(result.status).json({ message: result.error }) : res.json(result));

router.get('/api/owner/team', owner(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ team: await listTeam() });
}));

router.post('/api/owner/team', owner(async (req, res, user) => {
    if (!req.is('application/json')) return res.status(415).json({ message: 'Send JSON.' });
    send(res, await setMember(user, req.body && req.body.username, req.body && req.body.role));
}));

router.delete('/api/owner/team/:username', owner(async (req, res) => {
    send(res, await removeMember(req.params.username));
}));

router.get('/api/owner/activity', owner(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(await activity({ status: ['pending', 'done', 'approved', 'rejected', 'failed'].includes(req.query.status) ? req.query.status : '', limit: req.query.limit, offset: req.query.offset }));
}));

router.post('/api/owner/activity/:id/:decision', owner(async (req, res, user) => {
    if (!['approve', 'reject'].includes(req.params.decision)) return res.status(404).json({ message: 'Approve or reject?' });
    res.locals.loggedAction = true;
    send(res, await decide(user, req.params.id, req.params.decision === 'approve', req.body && req.body.note));
}));

router.get('/api/owner/users', owner(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(await listUsers({
        q: String(req.query.q || '').slice(0, 100),
        supporter: ['yes', 'no'].includes(req.query.supporter) ? req.query.supporter : '',
        limit: req.query.limit,
        offset: req.query.offset,
    }));
}));

export default router;
