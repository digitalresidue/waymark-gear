// Live updates over server-sent events (/api/live).
//
// Each signed-in tab keeps one connection. When a library changes, every
// connection of the people involved gets a small "changed" event and
// re-fetches what it shows (only if it has nothing unsaved). Connections
// say which list they're looking at (?watch=owner/listId), which is how
// "who's here" (presence) works on shared lists.
//
// In-memory and per process: with several app instances, put a pub/sub
// (e.g. Postgres LISTEN/NOTIFY) between them.

const byUser = new Map(); // userId -> Set<conn>
const byWatch = new Map(); // "owner/listId" -> Set<conn>
const MAX_PER_USER = 12;
let nextId = 1;

function send(conn, event, data) {
    try {
        conn.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
        // Closed; cleaned up by its close handler.
    }
}

function presence(watch) {
    const conns = byWatch.get(watch);
    const people = new Map();
    for (const c of conns || []) people.set(c.username, { username: c.username, displayName: c.displayName });
    const data = { watch, people: [...people.values()] };
    for (const c of conns || []) send(c, 'presence', data);
}

export function openStream(req, res, user) {
    const watch = /^[A-Za-z0-9_.-]{1,64}\/\d{1,17}$/.test(String(req.query.watch || '')) ? String(req.query.watch).toLowerCase() : '';
    const conns = byUser.get(user.user_id) || new Set();
    if (conns.size >= MAX_PER_USER) {
        // Drop the oldest rather than refuse: a stale tab is the usual cause.
        const oldest = conns.values().next().value;
        oldest.res.end();
    }
    res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    const conn = { id: nextId++, res, userId: user.user_id, username: user.username, displayName: user.display_name || '', watch };
    conns.add(conn);
    byUser.set(user.user_id, conns);
    if (watch) {
        if (!byWatch.has(watch)) byWatch.set(watch, new Set());
        byWatch.get(watch).add(conn);
        presence(watch);
    }
    send(conn, 'hello', { id: conn.id });
    const ping = setInterval(() => {
        try {
            res.write(': ping\n\n');
        } catch {
            // closing
        }
    }, 25000);
    req.on('close', () => {
        clearInterval(ping);
        const mine = byUser.get(user.user_id);
        if (mine) {
            mine.delete(conn);
            if (!mine.size) byUser.delete(user.user_id);
        }
        if (watch && byWatch.has(watch)) {
            byWatch.get(watch).delete(conn);
            if (!byWatch.get(watch).size) byWatch.delete(watch);
            else presence(watch);
        }
    });
}

// Tell these people something changed. `data` says what: { owner, listId, by }.
export function announce(userIds, data) {
    for (const id of new Set(userIds)) {
        for (const conn of byUser.get(id) || []) send(conn, 'changed', data);
    }
}

export function liveStats() {
    let connections = 0;
    for (const s of byUser.values()) connections += s.size;
    return { users: byUser.size, connections };
}
