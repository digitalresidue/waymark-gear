// Published kits: lists their owners chose to show on Explore and the
// homepage. Mirrored into public_kits on every save so public pages never
// parse anyone's library, and so unpublishing takes effect immediately.

import knex from './db.js';
import { Library } from '../client/dataTypes.js';
import { isUuid } from './catalog.js';

const LB = 453592; // mg

// Base-weight classes, lightest first. `max` is exclusive, in mg.
export const WEIGHT_CLASSES = [
    { id: 'sul', label: 'Ultra-UL', range: 'under 5 lb', max: 5 * LB },
    { id: 'ul', label: 'Ultralight', range: '5–10 lb', max: 10 * LB },
    { id: 'lw', label: 'Lightweight', range: '10–20 lb', max: 20 * LB },
    { id: 'trad', label: 'Traditional', range: '20 lb +', max: Infinity },
];

export function weightClassFor(baseWeightMg) {
    return WEIGHT_CLASSES.find((c) => baseWeightMg < c.max).id;
}

// Summaries of every published list in a serialized library.
export function publishedKits(serializedLibrary) {
    const library = new Library();
    library.load(JSON.parse(JSON.stringify(serializedLibrary)));
    const kits = [];
    for (const list of library.lists) {
        if (!list.published || !list.externalId) continue;
        list.calculateTotals();
        const catalogIds = new Set();
        let itemCount = 0;
        const categories = [];
        for (const categoryId of list.categoryIds) {
            const category = library.getCategoryById(categoryId);
            if (!category) continue;
            for (const ci of category.categoryItems) {
                const item = library.getItemById(ci.itemId);
                if (!item) continue;
                itemCount += 1;
                if (item.catalogId && isUuid(item.catalogId)) catalogIds.add(item.catalogId);
            }
            categories.push({
                name: category.name || 'Untitled',
                weightMg: Math.round(category.subtotalWeight - category.subtotalWornWeight - category.subtotalConsumableWeight),
            });
        }
        kits.push({
            externalId: list.externalId,
            name: list.name || 'Untitled list',
            description: list.description || '',
            baseWeightMg: Math.round(list.totalBaseWeight),
            wornWeightMg: Math.round(list.totalWornWeight),
            consumableWeightMg: Math.round(list.totalConsumableWeight),
            totalWeightMg: Math.round(list.totalWeight),
            itemCount,
            categories,
            catalogIds: [...catalogIds],
            shakedown: Boolean(list.shakedown),
        });
    }
    return kits;
}

// Bring public_kits in line with what this user has published. Featured
// flags set by the site owner survive republishing.
export async function syncPublishedKits(user, serializedLibrary, db = knex) {
    const kits = publishedKits(serializedLibrary);
    const owned = kits.length
        ? new Set((await db('list').where({ user_id: user.user_id })
            .whereIn('external_id', kits.map((k) => k.externalId)).select('external_id')).map((r) => r.external_id))
        : new Set();
    // A list can only be published under a share id this user owns.
    const valid = kits.filter((k) => owned.has(k.externalId));

    await db.transaction(async (trx) => {
        const keep = valid.map((k) => k.externalId);
        const stale = trx('public_kits').where({ user_id: user.user_id });
        if (keep.length) stale.whereNotIn('external_id', keep);
        await stale.del();

        for (const k of valid) {
            const row = {
                external_id: k.externalId,
                user_id: user.user_id,
                username: user.username,
                name: k.name.slice(0, 200),
                description: k.description.slice(0, 2000),
                base_weight_mg: k.baseWeightMg,
                worn_weight_mg: k.wornWeightMg,
                consumable_weight_mg: k.consumableWeightMg,
                total_weight_mg: k.totalWeightMg,
                item_count: k.itemCount,
                weight_class: weightClassFor(k.baseWeightMg),
                categories: JSON.stringify(k.categories),
                catalog_ids: k.catalogIds,
                shakedown: k.shakedown,
                updated_at: trx.fn.now(),
            };
            await trx('public_kits').insert(row).onConflict('external_id')
                .merge(Object.keys(row).filter((key) => key !== 'external_id'));
        }
    });
    return valid.length;
}

export function kitToApi(row) {
    return {
        externalId: row.external_id,
        username: row.username,
        name: row.name,
        description: row.description,
        baseWeightMg: Number(row.base_weight_mg),
        wornWeightMg: Number(row.worn_weight_mg),
        consumableWeightMg: Number(row.consumable_weight_mg),
        totalWeightMg: Number(row.total_weight_mg),
        itemCount: row.item_count,
        weightClass: row.weight_class,
        categories: row.categories,
        featured: row.featured,
        featuredRank: row.featured_rank,
        shakedown: Boolean(row.shakedown),
        updatedAt: row.updated_at,
    };
}

// Kits for the homepage: featured ones first, topped up with the most
// recently updated published kits.
export async function featuredKits({ weightClass, limit = 6 }) {
    const rows = await knex('public_kits')
        .where({ weight_class: weightClass })
        .orderBy([{ column: 'featured', order: 'desc' }, { column: 'featured_rank', order: 'asc' }, { column: 'updated_at', order: 'desc' }])
        .limit(Math.min(Number(limit) || 6, 24));
    return rows.map(kitToApi);
}

// One person's published kits, newest first (their profile page).
export async function kitsForUser(userId, db = knex) {
    const rows = await db('public_kits').where({ user_id: userId }).orderBy('updated_at', 'desc').limit(100);
    return rows.map(kitToApi);
}

export async function listKits({ weightClass, q = '', featuredOnly = false, shakedownOnly = false, limit = 24, offset = 0 } = {}) {
    const query = knex('public_kits');
    if (weightClass) query.where({ weight_class: weightClass });
    if (featuredOnly) query.where({ featured: true });
    if (shakedownOnly) query.where({ shakedown: true });
    const term = String(q).trim();
    if (term) {
        const like = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
        query.where((w) => w.whereILike('name', like).orWhereILike('username', like).orWhereILike('description', like));
    }
    const [{ count }] = await query.clone().count({ count: '*' });
    const rows = await query
        .orderBy([{ column: 'featured', order: 'desc' }, { column: 'updated_at', order: 'desc' }])
        .limit(Math.min(Number(limit) || 24, 100)).offset(Math.max(Number(offset) || 0, 0));
    return { total: Number(count), kits: rows.map(kitToApi) };
}

// The catalog gear that shows up in the most published kits.
export async function commonGear({ category = '', limit = 10 } = {}) {
    const [{ total }] = await knex('public_kits').count({ total: '*' });
    const kitCount = Number(total);
    if (!kitCount) return { kitCount, items: [] };

    const query = knex.with('uses', (qb) => qb.select(knex.raw('unnest(catalog_ids) as catalog_id')).from('public_kits'))
        .select('c.id', 'c.name', 'c.brand', 'c.category', 'c.weight_mg', 'c.unit')
        .count({ kits: '*' })
        .from('uses')
        .join('catalog_items as c', 'c.id', 'uses.catalog_id')
        .where('c.status', 'published')
        .groupBy('c.id')
        .orderBy([{ column: 'kits', order: 'desc' }, { column: 'c.name', order: 'asc' }])
        .limit(Math.min(Number(limit) || 10, 50));
    if (category) query.where('c.category', category);
    const rows = await query;
    return {
        kitCount,
        items: rows.map((r) => ({
            id: r.id,
            name: r.name,
            brand: r.brand,
            category: r.category,
            weightMg: r.weight_mg,
            unit: r.unit,
            kits: Number(r.kits),
            share: Number(r.kits) / kitCount,
        })),
    };
}

export async function setFeatured(externalId, { featured, featuredRank }) {
    const patch = {};
    if (typeof featured === 'boolean') patch.featured = featured;
    if (Number.isInteger(featuredRank)) patch.featured_rank = featuredRank;
    if (!Object.keys(patch).length) return null;
    const [row] = await knex('public_kits').where({ external_id: String(externalId) }).update(patch).returning('*');
    return row ? kitToApi(row) : null;
}
