// "Report a problem" → tickets the site staff work through: wrong specs in
// the catalog, a broken list, a bug. Anyone can file one (signed in or not);
// owners and moderators see the queue, set status, priority and assignee.

import knex from './db.js';

export const KINDS = { catalog: 'Gear catalog error', list: 'Problem with a list', bug: 'Site bug', other: 'Something else' };
export const STATUSES = ['open', 'in_progress', 'resolved', 'wont_fix'];
export const PRIORITIES = ['low', 'normal', 'high', 'urgent'];

export class TicketError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}

const sameSitePath = (v) => {
    const s = String(v || '').trim();
    return /^\/[^\s]*$/.test(s) && !s.startsWith('//') ? s.slice(0, 500) : '';
};

export async function fileTicket(reporter, input = {}) {
    const body = String(input.body || '').trim();
    if (body.length < 5) throw new TicketError('Tell us a little about the problem.');
    const [row] = await knex('tickets').insert({
        kind: KINDS[input.kind] ? input.kind : 'other',
        target_url: sameSitePath(input.targetUrl),
        target_label: String(input.targetLabel || '').trim().slice(0, 200),
        body: body.slice(0, 4000),
        reporter_id: reporter ? reporter.user_id : null,
        reporter_username: reporter ? reporter.username : '',
    }).returning(['id']);
    return { id: Number(row.id) };
}

function toApi(r) {
    return {
        id: Number(r.id),
        kind: r.kind,
        kindLabel: KINDS[r.kind] || r.kind,
        targetUrl: r.target_url,
        targetLabel: r.target_label,
        body: r.body,
        reporter: r.reporter_username || '',
        status: r.status,
        priority: r.priority,
        assignee: r.assignee,
        staffNotes: r.staff_notes,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
    };
}

const PRIORITY_ORDER = knex.raw("case priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end");

export async function listTickets({ status = 'active' } = {}) {
    const q = knex('tickets');
    if (status === 'active') q.whereIn('status', ['open', 'in_progress']);
    else if (STATUSES.includes(status)) q.where({ status });
    const rows = await q.orderBy([{ column: PRIORITY_ORDER }, { column: 'created_at', order: 'asc' }]).limit(500);
    const [{ open }] = await knex('tickets').whereIn('status', ['open', 'in_progress']).count({ open: '*' });
    return { tickets: rows.map(toApi), activeCount: Number(open) };
}

export async function updateTicket(id, input = {}) {
    const patch = { updated_at: knex.fn.now() };
    if (input.status !== undefined) {
        if (!STATUSES.includes(input.status)) throw new TicketError('Unknown status.');
        patch.status = input.status;
    }
    if (input.priority !== undefined) {
        if (!PRIORITIES.includes(input.priority)) throw new TicketError('Unknown priority.');
        patch.priority = input.priority;
    }
    if (input.assignee !== undefined) patch.assignee = String(input.assignee).trim().slice(0, 64);
    if (input.staffNotes !== undefined) patch.staff_notes = String(input.staffNotes).slice(0, 4000);
    const [row] = await knex('tickets').where({ id: Number(id) || 0 }).update(patch).returning('*');
    if (!row) throw new TicketError('No such ticket.', 404);
    return toApi(row);
}
