// Relational storage for each user's gear.
//
//   users
//     └─ gear_items            the closet: everything the user owns
//     └─ pack_lists            trip lists, in the user's order
//          └─ pack_list_categories
//               └─ pack_list_items   a closet item in a category, with qty,
//                                    worn, consumable, star
//     └─ library_settings      units, preferences, last-open list
//
// Every key includes user_id, so a row can only ever point at the same
// user's rows: one person's edit can't reach another person's list.
//
// The browser still works with the serialized Library shape from
// client/dataTypes.js (version 0.4). loadLibrary() assembles it from the
// tables; replaceLibrary() writes a whole one; applyChanges() applies the
// per-entity changes client/utils/library-diff.js produces, so two tabs
// editing different things both keep their work.

import knex from './db.js';
import { Library } from '../client/dataTypes.js';
import { normalizeTrip } from '../client/utils/trip.js';
import { TRIP_TYPES, youTubeId, CONDITIONS } from '../client/utils/gear-meta.js';
import { ESSENTIALS } from '../client/utils/insights.js';
import { normalizeTrailTag } from '../client/utils/trails.js';
import { ensureTrails, resolveTrail, trailIndex } from './trails-index.js';

const UNITS = ['g', 'kg', 'oz', 'lb'];
const LIMITS = { items: 20000, categories: 5000, lists: 1000, itemsPerCategory: 2000, categoriesPerList: 500 };

export class LibraryError extends Error {
    constructor(message) {
        super(message);
        this.status = 400;
    }
}

// ---- validation -------------------------------------------------------------

const isId = (v) => Number.isSafeInteger(v) && v > 0;
const str = (v, max) => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v)).slice(0, max);
const num = (v, { min = 0, max = 1e12 } = {}) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : 0;
};
const bool = (v) => v === true || v === 1 || v === 'true';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireId(v, what) {
    if (!isId(v)) throw new LibraryError(`Invalid ${what} id.`);
    return v;
}

function plainObject(v, maxKeys = 50) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    const out = {};
    for (const [k, val] of Object.entries(v).slice(0, maxKeys)) {
        if (k.length > 60) continue;
        if (['string', 'number', 'boolean'].includes(typeof val)) {
            out[k] = typeof val === 'string' ? val.slice(0, 100) : val;
        }
    }
    return out;
}


function itemRow(userId, item) {
    const catalogId = typeof item.catalogId === 'string' && UUID_RE.test(item.catalogId) ? item.catalogId : null;
    return {
        user_id: userId,
        id: requireId(item.id, 'item'),
        name: str(item.name, 500),
        description: str(item.description, 2000),
        weight_mg: num(item.weight),
        author_unit: UNITS.includes(item.authorUnit) ? item.authorUnit : 'oz',
        price: num(item.price, { max: 1e9 }),
        image: str(item.image, 200),
        image_url: str(item.imageUrl, 2000),
        url: str(item.url, 2000),
        catalog_id: catalogId,
        catalog_sync: catalogId ? bool(item.catalogSync) : false,
        retired: bool(item.retired),
        closet_category: str(item.closetCategory, 60),
        photos: JSON.stringify(ownPhotos(item.photos)),
        video_url: youTubeId(item.videoUrl) ? str(item.videoUrl, 300) : '',
        qty_owned: Number.isInteger(item.qtyOwned) && item.qtyOwned >= 0 && item.qtyOwned <= 10000 ? item.qtyOwned : null,
        // Gear lifecycle: "YYYY-MM", condition, expected life in years.
        purchased_on: /^\d{4}-(0[1-9]|1[0-2])$/.test(item.purchasedOn || '') ? item.purchasedOn : '',
        condition: CONDITIONS.includes(item.condition) ? item.condition : '',
        life_years: Number.isFinite(item.lifeYears) && item.lifeYears > 0 && item.lifeYears <= 50 ? item.lifeYears : null,
        // Gear you want but don't own yet (Phase 7).
        wishlist: bool(item.wishlist),
    };
}

// Gear photos must be our own uploads (server/images.js), at most 6.
const PHOTO_RE = /^\/userimages\/[0-9a-f]{2}\/[0-9a-f]{16}\/[0-9a-f]{16}_photo\.webp$/;
function ownPhotos(photos) {
    return Array.isArray(photos) ? photos.filter((p) => typeof p === 'string' && PHOTO_RE.test(p)).slice(0, 6) : [];
}

// Category colors are {r, g, b} objects (client/utils/color.js), stored as
// JSON. Anything else is dropped, so the column can't carry arbitrary data.
function categoryColor(color) {
    if (!color || typeof color !== 'object') return null;
    const channel = (v) => Math.round(Math.min(Math.max(Number(v) || 0, 0), 255));
    return JSON.stringify({ r: channel(color.r), g: channel(color.g), b: channel(color.b) });
}

function categoryRow(userId, category, listId, position) {
    return {
        user_id: userId,
        id: requireId(category.id, 'category'),
        list_id: listId,
        position,
        name: str(category.name, 200),
        color: categoryColor(category.color),
        collapsed: bool(category.collapsed),
    };
}

function categoryItemRows(userId, category, knownItemIds) {
    const seen = new Set();
    const rows = [];
    const list = Array.isArray(category.categoryItems) ? category.categoryItems.slice(0, LIMITS.itemsPerCategory) : [];
    list.forEach((ci, position) => {
        const itemId = ci && ci.itemId;
        if (!isId(itemId) || seen.has(itemId) || !knownItemIds.has(itemId)) return;
        seen.add(itemId);
        rows.push({
            user_id: userId,
            category_id: category.id,
            item_id: itemId,
            position,
            qty: num(ci.qty, { max: 1e6 }),
            worn: Math.round(num(ci.worn, { max: 1e6 })),
            consumable: bool(ci.consumable),
            star: Math.round(num(ci.star, { max: 3 })),
            packed: bool(ci.packed),
            carrier: typeof ci.carrier === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(ci.carrier) ? ci.carrier : '',
            unused: bool(ci.unused),
        });
    });
    return rows;
}

function listRow(userId, list, position) {
    return {
        user_id: userId,
        id: requireId(list.id, 'list'),
        position,
        name: str(list.name, 300),
        description: str(list.description, 20000),
        external_id: str(list.externalId, 40) || null,
        optional_fields: JSON.stringify(plainObject(list.optionalFields)),
        pinned: bool(list.pinned),
        published: bool(list.published),
        shakedown: bool(list.shakedown),
        trip_type: TRIP_TYPES.includes(list.tripType) ? list.tripType : '',
        trip: tripSettings(list.trip),
        not_needed: JSON.stringify(notNeeded(list.notNeeded)),
        ...trailColumns(list.trail),
    };
}

// The trail tag: kept as typed, matched to the curated list when it can be
// (callers run ensureTrails() first).
function trailColumns(input) {
    const t = normalizeTrailTag(input);
    if (!t) return { trail_text: '', trail_id: null, trail_year: null, trail_direction: '' };
    return { trail_text: t.name, trail_id: resolveTrail(t.name), trail_year: t.year ?? null, trail_direction: t.direction || '' };
}

// Essentials marked "not needed" on this list: known ids only.
function notNeeded(ids) {
    return Array.isArray(ids) ? ESSENTIALS.map((e) => e.id).filter((id) => ids.includes(id)) : [];
}

// Trip planner settings, bounded to sensible ranges.
function tripSettings(trip) {
    if (!trip || typeof trip !== 'object') return null;
    return JSON.stringify(normalizeTrip(trip));
}

function settingsRow(userId, s) {
    return {
        user_id: userId,
        total_unit: UNITS.includes(s.totalUnit) ? s.totalUnit : 'oz',
        item_unit: UNITS.includes(s.itemUnit) ? s.itemUnit : 'oz',
        default_list_id: isId(s.defaultListId) ? s.defaultListId : null,
        sequence: Number.isSafeInteger(s.sequence) && s.sequence >= 0 ? s.sequence : 0,
        show_sidebar: s.showSidebar === undefined ? true : bool(s.showSidebar),
        preferences: JSON.stringify(plainObject(s.preferences)),
        currency_symbol: str(s.currencySymbol, 8) || '$',
        kits: JSON.stringify(cleanKits(s.kits)),
    };
}

// Gear kits: named bundles of closet items added to a list in one go.
function cleanKits(kits) {
    if (!Array.isArray(kits)) return [];
    return kits.slice(0, 100).filter((k) => k && isId(k.id)).map((k) => ({
        id: k.id,
        name: str(k.name, 80),
        items: (Array.isArray(k.items) ? k.items : []).slice(0, 200)
            .filter((i) => i && isId(i.itemId))
            .map((i) => ({ itemId: i.itemId, qty: Math.max(0, Math.min(num(i.qty, { max: 1e4 }) || 1, 1e4)) })),
    }));
}

// ---- reading ----------------------------------------------------------------

// The serialized library (Library.save() shape) for a user, or null if they
// have none.
export async function loadLibrary(userId, db = knex) {
    await ensureTrails();
    const settings = await db('library_settings').where({ user_id: userId }).first();
    if (!settings) return null;

    const [items, lists, categories, categoryItems] = await Promise.all([
        db('gear_items').where({ user_id: userId }).orderBy('seq'),
        db('pack_lists').where({ user_id: userId }).orderBy([{ column: 'position' }, { column: 'id' }]),
        db('pack_list_categories').where({ user_id: userId }).orderBy([{ column: 'position' }, { column: 'id' }]),
        db('pack_list_items').where({ user_id: userId }).orderBy([{ column: 'position' }, { column: 'item_id' }]),
    ]);

    const itemsByCategory = new Map();
    for (const ci of categoryItems) {
        if (!itemsByCategory.has(ci.category_id)) itemsByCategory.set(ci.category_id, []);
        itemsByCategory.get(ci.category_id).push({
            qty: Number(ci.qty),
            worn: ci.worn,
            consumable: ci.consumable,
            star: ci.star,
            itemId: ci.item_id,
            ...(ci.packed ? { packed: true } : {}),
            ...(ci.carrier ? { carrier: ci.carrier } : {}),
            ...(ci.unused ? { unused: true } : {}),
        });
    }
    const categoriesByList = new Map();
    for (const c of categories) {
        if (!categoriesByList.has(c.list_id)) categoriesByList.set(c.list_id, []);
        categoriesByList.get(c.list_id).push(c);
    }

    const outCategories = [];
    const outLists = lists.map((l) => {
        const cats = categoriesByList.get(l.id) || [];
        for (const c of cats) {
            const out = { id: c.id, name: c.name, categoryItems: itemsByCategory.get(c.id) || [] };
            if (c.color) out.color = { r: c.color.r, g: c.color.g, b: c.color.b };
            if (c.collapsed) out.collapsed = true;
            outCategories.push(out);
        }
        const out = {
            id: l.id,
            name: l.name,
            categoryIds: cats.map((c) => c.id),
            description: l.description,
            externalId: l.external_id || '',
            optionalFields: l.optional_fields || {},
        };
        if (l.pinned) out.pinned = true;
        if (l.published) out.published = true;
        if (l.shakedown) out.shakedown = true;
        if (l.trip_type) out.tripType = l.trip_type;
        if (l.trip) out.trip = normalizeTrip(l.trip);
        if (Array.isArray(l.not_needed) && l.not_needed.length) out.notNeeded = l.not_needed;
        if (l.trail_text) {
            const t = l.trail_id ? trailIndex().byId.get(l.trail_id) : null;
            out.trail = { name: l.trail_text };
            if (t) Object.assign(out.trail, { id: t.id, slug: t.slug, short: t.short });
            if (l.trail_year) out.trail.year = l.trail_year;
            if (l.trail_direction) out.trail.direction = l.trail_direction;
        }
        return out;
    });

    return {
        version: '0.4',
        totalUnit: settings.total_unit,
        itemUnit: settings.item_unit,
        defaultListId: settings.default_list_id ?? (outLists[0] ? outLists[0].id : 1),
        sequence: Number(settings.sequence),
        showSidebar: settings.show_sidebar,
        preferences: settings.preferences || {},
        currencySymbol: settings.currency_symbol,
        ...(Array.isArray(settings.kits) && settings.kits.length ? { kits: settings.kits } : {}),
        items: items.map((i) => {
            const out = {
                id: i.id,
                name: i.name,
                description: i.description,
                weight: Number(i.weight_mg),
                authorUnit: i.author_unit,
                price: Number(i.price),
                image: i.image,
                imageUrl: i.image_url,
                url: i.url,
            };
            if (i.catalog_id) {
                out.catalogId = i.catalog_id;
                out.catalogSync = i.catalog_sync;
            }
            if (i.retired) out.retired = true;
            if (i.closet_category) out.closetCategory = i.closet_category;
            if (Array.isArray(i.photos) && i.photos.length) out.photos = i.photos;
            if (i.video_url) out.videoUrl = i.video_url;
            if (i.qty_owned !== null && i.qty_owned !== undefined) out.qtyOwned = i.qty_owned;
            if (i.purchased_on) out.purchasedOn = i.purchased_on;
            if (i.condition) out.condition = i.condition;
            if (i.life_years !== null && i.life_years !== undefined) out.lifeYears = Number(i.life_years);
            if (i.wishlist) out.wishlist = true;
            return out;
        }),
        categories: outCategories,
        lists: outLists,
    };
}

// ---- writing a whole library -------------------------------------------------

// Normalize any library a client or an old export sends: Library.load runs
// the format upgrades and repairs (duplicate ids, dangling references), and
// save() drops anything it doesn't know.
export function normalizeLibrary(input) {
    let parsed = input;
    if (typeof input === 'string') {
        try {
            parsed = JSON.parse(input);
        } catch {
            throw new LibraryError('Unable to parse library.');
        }
    }
    if (!parsed || typeof parsed !== 'object') throw new LibraryError('Unable to parse library.');
    const library = new Library();
    try {
        library.load(JSON.parse(JSON.stringify(parsed)));
    } catch (err) {
        throw new LibraryError(err.code === 'VERSION_TOO_NEW' ? err.message : 'Unable to read library.');
    }
    const saved = library.save();
    if (saved.items.length > LIMITS.items || saved.categories.length > LIMITS.categories || saved.lists.length > LIMITS.lists) {
        throw new LibraryError('This library is larger than Waymark Gear allows.');
    }
    return saved;
}

// Replace everything a user has with `serialized`. Runs in the caller's
// transaction when given one.
export async function replaceLibrary(userId, serialized, db = knex) {
    await ensureTrails();
    const lib = normalizeLibrary(serialized);
    const run = async (trx) => {
        await trx('pack_lists').where({ user_id: userId }).del(); // cascades categories and their items
        await trx('gear_items').where({ user_id: userId }).del();

        await trx('library_settings').insert(settingsRow(userId, lib))
            .onConflict('user_id').merge();

        const itemRows = lib.items.map((i) => itemRow(userId, i));
        for (let i = 0; i < itemRows.length; i += 500) await trx('gear_items').insert(itemRows.slice(i, i + 500));
        const knownItems = new Set(itemRows.map((r) => r.id));

        const categoriesById = new Map(lib.categories.map((c) => [c.id, c]));
        const listRows = lib.lists.map((l, position) => listRow(userId, l, position));
        if (listRows.length) await trx('pack_lists').insert(listRows);

        const catRows = [];
        const ciRows = [];
        const placed = new Set();
        for (const list of lib.lists) {
            (list.categoryIds || []).slice(0, LIMITS.categoriesPerList).forEach((cid, position) => {
                const category = categoriesById.get(cid);
                if (!category || placed.has(cid)) return; // a category lives in exactly one list
                placed.add(cid);
                catRows.push(categoryRow(userId, category, list.id, position));
                ciRows.push(...categoryItemRows(userId, category, knownItems));
            });
        }
        for (let i = 0; i < catRows.length; i += 500) await trx('pack_list_categories').insert(catRows.slice(i, i + 500));
        for (let i = 0; i < ciRows.length; i += 1000) await trx('pack_list_items').insert(ciRows.slice(i, i + 1000));
    };
    return db.isTransaction ? run(db) : db.transaction(run);
}

// ---- applying changes ----------------------------------------------------------

function changeSet(group) {
    const upsert = Array.isArray(group && group.upsert) ? group.upsert : [];
    const del = Array.isArray(group && group.delete) ? group.delete.filter(isId) : [];
    return { upsert, delete: del };
}

// Apply the changes from client/utils/library-diff.js. Last writer wins per
// entity: two tabs editing different items both persist; two tabs editing
// the same item keep whichever saved last.
export async function applyChanges(userId, changes, db = knex) {
    if (!changes || typeof changes !== 'object') throw new LibraryError('No changes sent.');
    await ensureTrails();
    const items = changeSet(changes.items);
    const categories = changeSet(changes.categories);
    const lists = changeSet(changes.lists);
    if (items.upsert.length > LIMITS.items || categories.upsert.length > LIMITS.categories || lists.upsert.length > LIMITS.lists) {
        throw new LibraryError('Too many changes in one save.');
    }

    const run = async (trx) => {
        if (!(await trx('library_settings').where({ user_id: userId }).first('user_id'))) {
            await trx('library_settings').insert(settingsRow(userId, {}));
        }

        // Lists first (rows only), so new categories have a list to join.
        const listOrder = Array.isArray(changes.listOrder) ? changes.listOrder.filter(isId) : null;
        const positionOf = (id) => (listOrder && listOrder.includes(id) ? listOrder.indexOf(id) : null);
        for (const list of lists.upsert) {
            const row = listRow(userId, list, 0);
            const existing = await trx('pack_lists').where({ user_id: userId, id: row.id }).first('position');
            row.position = positionOf(row.id) ?? (existing ? existing.position : -1);
            await trx('pack_lists').insert(row).onConflict(['user_id', 'id']).merge();
        }

        // Items next, so categories can reference new ones.
        for (const item of items.upsert) {
            const row = itemRow(userId, item);
            await trx('gear_items').insert(row).onConflict(['user_id', 'id']).merge();
        }

        // Which list each category in this save belongs to.
        const listOfCategory = new Map();
        for (const list of lists.upsert) {
            (list.categoryIds || []).forEach((cid, position) => {
                if (isId(cid)) listOfCategory.set(cid, { listId: list.id, position });
            });
        }

        if (categories.upsert.length) {
            const knownItems = new Set((await trx('gear_items').where({ user_id: userId }).select('id')).map((r) => r.id));
            for (const category of categories.upsert) {
                const id = requireId(category.id, 'category');
                const existing = await trx('pack_list_categories').where({ user_id: userId, id }).first('list_id', 'position');
                const placement = listOfCategory.get(id) || (existing && { listId: existing.list_id, position: existing.position });
                if (!placement) continue; // in no list: nothing to attach it to
                const listExists = await trx('pack_lists').where({ user_id: userId, id: placement.listId }).first('id');
                if (!listExists) continue;
                await trx('pack_list_categories').insert(categoryRow(userId, category, placement.listId, placement.position))
                    .onConflict(['user_id', 'id']).merge();
                await trx('pack_list_items').where({ user_id: userId, category_id: id }).del();
                const rows = categoryItemRows(userId, category, knownItems);
                if (rows.length) await trx('pack_list_items').insert(rows);
            }
        }

        // Category order within each list that changed.
        for (const [cid, { listId, position }] of listOfCategory) {
            await trx('pack_list_categories').where({ user_id: userId, id: cid })
                .update({ list_id: listId, position });
        }

        if (listOrder) {
            for (const [position, id] of listOrder.entries()) {
                await trx('pack_lists').where({ user_id: userId, id }).update({ position });
            }
        }

        if (categories.delete.length) await trx('pack_list_categories').where({ user_id: userId }).whereIn('id', categories.delete).del();
        if (items.delete.length) await trx('gear_items').where({ user_id: userId }).whereIn('id', items.delete).del();
        if (lists.delete.length) await trx('pack_lists').where({ user_id: userId }).whereIn('id', lists.delete).del();

        if (changes.settings && typeof changes.settings === 'object') {
            const current = await trx('library_settings').where({ user_id: userId }).first();
            const merged = {
                totalUnit: current.total_unit,
                itemUnit: current.item_unit,
                defaultListId: current.default_list_id,
                sequence: Number(current.sequence),
                showSidebar: current.show_sidebar,
                preferences: current.preferences,
                currencySymbol: current.currency_symbol,
                kits: current.kits,
                ...changes.settings,
            };
            // Sequence only moves forward, whichever tab saves.
            merged.sequence = Math.max(Number(current.sequence) || 0, Number(merged.sequence) || 0);
            const row = settingsRow(userId, merged);
            await trx('library_settings').where({ user_id: userId }).update(row);
        }

        const [{ count }] = await trx('gear_items').where({ user_id: userId }).count({ count: '*' });
        if (Number(count) > LIMITS.items) throw new LibraryError('This library is larger than Waymark Gear allows.');
    };
    return db.isTransaction ? run(db) : db.transaction(run);
}

// Counts for operator tools and moderation.
export async function libraryCounts(userId, db = knex) {
    const [[items], [lists]] = await Promise.all([
        db('gear_items').where({ user_id: userId }).count({ n: '*' }),
        db('pack_lists').where({ user_id: userId }).count({ n: '*' }),
    ]);
    return { items: Number(items.n), lists: Number(lists.n) };
}

// The owner of a share id, with their library, for share pages and embeds.
export async function libraryForExternalId(externalId, db = knex) {
    const row = await db('users').join('list', 'users.user_id', 'list.user_id')
        .select('users.user_id', 'users.username', 'users.avatar_url').where({ 'list.external_id': String(externalId) }).first();
    if (!row) return null;
    const library = await loadLibrary(row.user_id, db);
    return library ? { ...row, library } : null;
}
