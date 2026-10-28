// The curated trail list, kept in memory: matching what a hiker typed
// ("PCT", "pacific crest", "A.T.") to a trail happens on every save, so it
// mustn't cost a query. Refreshed every minute and whenever the owner edits
// trails. Only depends on the database, so anything can import it.

import knex from './db.js';

const TTL_MS = 60 * 1000;
let index = { at: 0, byId: new Map(), bySlug: new Map(), byName: new Map(), list: [] };
let loading = null;

// "Pacific Crest Trail" -> "pacific crest trail"; punctuation and spacing
// don't matter ("A.T." matches "AT").
export const keyOf = (s) => String(s || '').toLowerCase().replace(/[.'’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

function build(rows) {
    const byId = new Map();
    const bySlug = new Map();
    const byName = new Map();
    for (const r of rows) {
        const t = {
            id: r.id,
            slug: r.slug,
            name: r.name,
            short: r.short_name || '',
            aliases: r.aliases || [],
            region: r.region || '',
            country: r.country || '',
            lengthKm: r.length_km === null ? null : Number(r.length_km),
            notes: Array.isArray(r.notes) ? r.notes : [],
            parentId: r.parent_id,
            status: r.status,
        };
        byId.set(t.id, t);
        bySlug.set(t.slug, t);
        if (t.status !== 'published') continue;
        for (const n of [t.name, t.short, t.slug, ...t.aliases]) {
            const k = keyOf(n);
            if (k && !byName.has(k)) byName.set(k, t.id);
        }
    }
    return { at: Date.now(), byId, bySlug, byName, list: [...byId.values()] };
}

export async function ensureTrails({ force = false } = {}) {
    if (!force && index.at > Date.now() - TTL_MS) return index;
    if (!loading) {
        loading = knex('trails').select('*')
            .then((rows) => { index = build(rows); })
            // Before the trails migration has run (the relational migration
            // saves libraries): no trails yet.
            .catch(() => { index = build([]); })
            .finally(() => { loading = null; });
    }
    await loading;
    return index;
}

export function trailIndex() {
    return index;
}

// The trail id for what someone typed, or null when there's no match yet.
export function resolveTrail(name) {
    const k = keyOf(name);
    return k ? index.byName.get(k) ?? null : null;
}

// A trail and its sections, for counting packs.
export function withSections(id) {
    const ids = [id];
    for (const t of index.list) if (t.parentId === id) ids.push(t.id);
    return ids;
}
