// Trails (Phase 8): what people carry on each trail.
//
// Lists carry a trail tag (client/utils/trails.js). Published lists are
// mirrored into public_kits with the matched trail and their gear features,
// so a trail page is a few queries over public_kits, whatever the number of
// trails or lists.

import knex from './db.js';
import { listKits, kitToApi } from './kits.js';
import { PACK_FEATURES } from '../client/utils/trails.js';
import { ensureTrails, trailIndex, withSections, keyOf } from './trails-index.js';

export class TrailError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}

const KM_PER_MI = 1.609344;
export const miles = (km) => (km ? Math.round(km / KM_PER_MI).toLocaleString('en-US') : '');

function present(t, count = 0) {
    return {
        id: t.id,
        slug: t.slug,
        name: t.name,
        short: t.short,
        region: t.region,
        country: t.country,
        lengthKm: t.lengthKm,
        lengthMi: t.lengthKm ? Math.round(t.lengthKm / KM_PER_MI) : null,
        parentId: t.parentId,
        count,
    };
}

// Published packs per trail, sections counted toward their parent too.
async function packCounts() {
    const rows = await knex('public_kits').whereNotNull('trail_id').groupBy('trail_id').select('trail_id').count({ n: '*' });
    const idx = trailIndex();
    const counts = new Map();
    for (const r of rows) {
        const id = r.trail_id;
        counts.set(id, (counts.get(id) || 0) + Number(r.n));
        const t = idx.byId.get(id);
        if (t && t.parentId) counts.set(t.parentId, (counts.get(t.parentId) || 0) + Number(r.n));
    }
    return counts;
}

const published = (t) => t.status === 'published';

// The most-packed trails, for the picker's chips.
export async function topTrails(limit = 8) {
    await ensureTrails();
    const counts = await packCounts();
    return trailIndex().list.filter(published).filter((t) => !t.parentId)
        .map((t) => present(t, counts.get(t.id) || 0))
        // Ties (a new site: all zero) keep the curated order: AT, PCT, CDT...
        .sort((a, b) => b.count - a.count || a.id - b.id)
        .slice(0, Math.min(Number(limit) || 8, 24));
}

// The trails someone has tagged their own lists with, most used first.
export async function myTrails(userId) {
    await ensureTrails();
    const rows = await knex('pack_lists').where({ user_id: userId }).whereNotNull('trail_id')
        .groupBy('trail_id').select('trail_id').count({ n: '*' }).orderBy('n', 'desc');
    const idx = trailIndex();
    return rows.map((r) => idx.byId.get(r.trail_id)).filter(Boolean).filter(published).map((t) => present(t));
}

// Type-ahead: name, short name, alias or region; most-packed first.
export async function searchTrails(q, limit = 10) {
    await ensureTrails();
    const k = keyOf(q);
    if (!k) return topTrails(limit);
    const counts = await packCounts();
    const scored = [];
    for (const t of trailIndex().list.filter(published)) {
        const names = [t.name, t.short, ...t.aliases].map(keyOf);
        let rank = 0;
        if (names.some((n) => n === k)) rank = 3;
        else if (names.some((n) => n.startsWith(k) || n.split(' ').some((w) => w.startsWith(k)))) rank = 2;
        else if (names.some((n) => n.includes(k)) || keyOf(t.region).includes(k)) rank = 1;
        if (rank) scored.push({ rank, t });
    }
    return scored
        .sort((a, b) => b.rank - a.rank || (counts.get(b.t.id) || 0) - (counts.get(a.t.id) || 0) || a.t.name.localeCompare(b.t.name))
        .slice(0, Math.min(Number(limit) || 10, 25))
        .map(({ t }) => present(t, counts.get(t.id) || 0));
}

// A trail that a list's name points to ("PCT 2025" -> PCT), for suggesting a tag.
export async function matchName(name) {
    await ensureTrails();
    const words = keyOf(name).split(' ');
    const idx = trailIndex();
    // Longest run of words first, so "john muir trail" beats "trail".
    for (let len = Math.min(words.length, 6); len >= 1; len--) {
        for (let i = 0; i + len <= words.length; i++) {
            const id = idx.byName.get(words.slice(i, i + len).join(' '));
            if (id) return present(idx.byId.get(id));
        }
    }
    return null;
}

// Everything, for the directory page: grouped by country, A to Z.
export async function allTrails() {
    await ensureTrails();
    const counts = await packCounts();
    return trailIndex().list.filter(published)
        .map((t) => present(t, counts.get(t.id) || 0))
        .sort((a, b) => a.name.localeCompare(b.name));
}

const median = (xs) => {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

// Summary numbers for a set of trail ids.
async function trailStats(ids) {
    const rows = await knex('public_kits').whereIn('trail_id', ids).select('base_weight_mg', 'features', 'catalog_ids');
    if (!rows.length) return { packs: 0 };
    const share = (f) => Math.round((100 * rows.filter((r) => (r.features || []).includes(f)).length) / rows.length);
    const features = Object.fromEntries(Object.keys(PACK_FEATURES).map((f) => [f, share(f)]));
    const weights = rows.map((r) => Number(r.base_weight_mg));
    return { packs: rows.length, medianMg: median(weights), lightestMg: Math.min(...weights), features };
}

// The most used catalog item in each of a few categories.
const CARRIED = ['Shelter', 'Sleep', 'Packs', 'Footwear'];
async function mostCarried(ids, packs) {
    if (!packs) return [];
    const rows = await knex.with('uses', (qb) => qb.select(knex.raw('distinct external_id, unnest(catalog_ids) as catalog_id')).from('public_kits').whereIn('trail_id', ids))
        .select('c.id', 'c.name', 'c.brand', 'c.category', 'c.weight_mg', 'c.unit')
        .count({ n: '*' })
        .from('uses').join('catalog_items as c', 'c.id', 'uses.catalog_id')
        .whereIn('c.category', CARRIED).where('c.status', 'published')
        .groupBy('c.id').orderBy([{ column: 'n', order: 'desc' }, { column: 'c.name', order: 'asc' }]);
    // The top three in each category, most carried first.
    const out = [];
    for (const cat of CARRIED) {
        const items = rows.filter((r) => r.category === cat).slice(0, 3).map((r, i) => ({
            rank: i + 1,
            id: r.id,
            name: [r.brand, r.name].filter(Boolean).join(' '),
            weightMg: r.weight_mg,
            unit: r.unit,
            share: Math.round((100 * Number(r.n)) / packs),
        }));
        if (items.length) out.push({ category: cat, items });
    }
    return out;
}

export const SORTS = { top: 'Top', light: 'Lightest', new: 'Newest', shakedown: 'Shakedown requests', year: 'This year' };

export async function trailPage(slug, { sort = 'top' } = {}) {
    await ensureTrails();
    const t = trailIndex().bySlug.get(String(slug));
    if (!t || !published(t)) return null;
    const ids = withSections(t.id);
    const year = new Date().getFullYear();
    const sortKey = Object.prototype.hasOwnProperty.call(SORTS, sort) ? sort : 'top';
    const { kits, total } = await listKits({
        trailIds: ids,
        sort: sortKey === 'light' ? 'light' : sortKey === 'new' ? 'new' : 'top',
        shakedownOnly: sortKey === 'shakedown',
        trailYear: sortKey === 'year' ? year : null,
        limit: 48,
    });
    const stats = await trailStats(ids);
    const parent = t.parentId ? trailIndex().byId.get(t.parentId) : null;
    const sections = trailIndex().list.filter((s) => s.parentId === t.id && published(s)).map((s) => present(s));
    return {
        trail: { ...present(t), aliases: t.aliases, notes: t.notes, lengthMiLabel: miles(t.lengthKm) },
        parent: parent ? present(parent) : null,
        sections,
        stats,
        carried: await mostCarried(ids, stats.packs),
        kits,
        total,
        sort: sortKey,
        year,
    };
}

// The trail compared with the two most-packed others.
export async function comparison(slug) {
    const top = await topTrails(4);
    const others = top.filter((t) => t.slug !== slug && t.count > 0).slice(0, 2);
    const me = trailIndex().bySlug.get(slug);
    const list = [present(me), ...others];
    const out = [];
    for (const t of list) out.push({ trail: t, stats: await trailStats(withSections(t.id)) });
    return out;
}

// ---- the owner's side --------------------------------------------------------

const cleanSlug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const cleanList = (v, max = 20) => (Array.isArray(v) ? v : String(v || '').split(/[;\n]/)).map((x) => String(x).trim()).filter(Boolean).slice(0, max);

export function cleanTrail(input = {}) {
    const name = String(input.name || '').trim().slice(0, 120);
    if (!name) throw new TrailError('Give the trail a name.');
    const slug = cleanSlug(input.slug || input.short || name);
    if (!slug) throw new TrailError('The trail needs a web address (slug).');
    const km = input.lengthKm === '' || input.lengthKm === null || input.lengthKm === undefined ? null : Number(input.lengthKm);
    if (km !== null && (!Number.isFinite(km) || km <= 0 || km > 20000)) throw new TrailError('Length is in kilometres, more than 0.');
    return {
        slug,
        name,
        short_name: String(input.short || '').trim().slice(0, 20),
        aliases: cleanList(input.aliases).map((a) => a.slice(0, 80)),
        region: String(input.region || '').trim().slice(0, 160),
        country: String(input.country || '').trim().toUpperCase().slice(0, 2),
        length_km: km,
        notes: JSON.stringify(cleanList(input.notes, 8).map((n) => n.slice(0, 200))),
        parent_id: Number.isSafeInteger(Number(input.parentId)) && Number(input.parentId) > 0 ? Number(input.parentId) : null,
        status: input.status === 'draft' ? 'draft' : 'published',
    };
}

// Point lists whose typed trail matches this trail's names at it. Called
// whenever names change, so "Appalachian Trl" lists join the AT after a merge.
async function relink(trailId) {
    await ensureTrails({ force: true });
    const t = trailIndex().byId.get(trailId);
    const keys = t ? [t.name, t.short, t.slug, ...t.aliases].map(keyOf).filter(Boolean) : [];
    if (!keys.length) return 0;
    const lists = await knex('pack_lists').where('trail_text', '<>', '').select('user_id', 'id', 'trail_text', 'trail_id', 'external_id');
    const hits = lists.filter((l) => keys.includes(keyOf(l.trail_text)) && l.trail_id !== trailId);
    for (const l of hits) {
        await knex('pack_lists').where({ user_id: l.user_id, id: l.id }).update({ trail_id: trailId });
        if (l.external_id) await knex('public_kits').where({ external_id: l.external_id }).update({ trail_id: trailId });
    }
    return hits.length;
}

export async function ownerTrails() {
    await ensureTrails({ force: true });
    const counts = await packCounts();
    const lists = await knex('pack_lists').whereNotNull('trail_id').groupBy('trail_id').select('trail_id').count({ n: '*' });
    const listCounts = new Map(lists.map((r) => [r.trail_id, Number(r.n)]));
    return trailIndex().list.sort((a, b) => a.name.localeCompare(b.name)).map((t) => ({
        ...present(t, counts.get(t.id) || 0),
        aliases: t.aliases,
        notes: t.notes,
        status: t.status,
        lists: listCounts.get(t.id) || 0,
    }));
}

export async function createTrail(input) {
    const row = cleanTrail(input);
    if (await knex('trails').where({ slug: row.slug }).first()) throw new TrailError('A trail already has that web address.');
    const [created] = await knex('trails').insert(row).returning('id');
    await relink(created.id);
    return created.id;
}

export async function updateTrail(id, input) {
    const row = cleanTrail(input);
    const clash = await knex('trails').where({ slug: row.slug }).whereNot({ id: Number(id) }).first();
    if (clash) throw new TrailError('Another trail has that web address.');
    if (row.parent_id === Number(id)) throw new TrailError('A trail can\'t be a section of itself.');
    const n = await knex('trails').where({ id: Number(id) }).update({ ...row, updated_at: knex.fn.now() });
    if (!n) throw new TrailError('No such trail.', 404);
    await relink(Number(id));
    return Number(id);
}

export async function deleteTrail(id) {
    await knex('pack_lists').where({ trail_id: Number(id) }).update({ trail_id: null });
    await knex('trails').where({ id: Number(id) }).del();
    await ensureTrails({ force: true });
    return { ok: true };
}

// Trail names hikers typed that match nothing yet, with how many people used
// them. Ignored names drop out.
export async function suggestions() {
    await ensureTrails({ force: true });
    const ignored = new Set(await knex('trail_ignored').pluck('name_lower'));
    const rows = await knex('pack_lists').where('trail_text', '<>', '').whereNull('trail_id')
        .select('trail_text', 'user_id', 'published');
    const groups = new Map();
    for (const r of rows) {
        const k = keyOf(r.trail_text);
        if (!k || ignored.has(k)) continue;
        const g = groups.get(k) || { key: k, name: r.trail_text, users: new Set(), lists: 0, published: 0 };
        g.users.add(r.user_id);
        g.lists += 1;
        if (r.published) g.published += 1;
        groups.set(k, g);
    }
    return [...groups.values()]
        .map((g) => ({ key: g.key, name: g.name, hikers: g.users.size, lists: g.lists, published: g.published }))
        .sort((a, b) => b.hikers - a.hikers || b.lists - a.lists)
        .slice(0, 200);
}

// Approve a suggestion as a new trail, or merge it into an existing one (it
// becomes an alias).
export async function approveSuggestion(name, input = {}) {
    const typed = String(input.suggestion || name).trim();
    return createTrail({ ...input, name: input.name || typed, aliases: [...cleanList(input.aliases), typed] });
}

export async function mergeSuggestion(name, trailId) {
    const t = await knex('trails').where({ id: Number(trailId) }).first();
    if (!t) throw new TrailError('No such trail.', 404);
    const aliases = [...new Set([...(t.aliases || []), String(name).trim().slice(0, 80)])];
    await knex('trails').where({ id: t.id }).update({ aliases, updated_at: knex.fn.now() });
    await relink(t.id);
    return t.id;
}

export async function ignoreSuggestion(name) {
    await knex('trail_ignored').insert({ name_lower: keyOf(name) }).onConflict('name_lower').ignore();
    return { ok: true };
}

export { kitToApi };
