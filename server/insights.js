// Lighter alternatives and community favorites for a pack list, from the
// gear catalog and the lists people have published.
//
// The client sends the rows of one list (name, category, weight, catalogId).
// Nothing is stored; the same function backs the editor, the API and MCP.

import knex from './db.js';
import { isUuid } from './catalog.js';
import { gearKind } from '../client/utils/insights.js';
import { bigThreeKind, likeForLike, worthSwapping, sameCategory, KINDS, SLOTS } from '../client/utils/big-three.js';
import { fitsLike } from '../client/utils/fit.js';

const MAX_ROWS = 200;

function cleanRows(rows) {
    return (Array.isArray(rows) ? rows : []).slice(0, MAX_ROWS).map((r) => ({
        itemId: Number.isSafeInteger(r.itemId) ? r.itemId : null,
        name: String(r.name || '').slice(0, 200),
        description: String(r.description || '').slice(0, 500),
        category: String(r.category || '').slice(0, 80),
        weightMg: Math.max(0, Number(r.weightMg) || 0),
        catalogId: isUuid(r.catalogId) ? r.catalogId : null,
        // Worn and consumable gear isn't base weight: no swaps suggested.
        worn: Boolean(r.worn),
        consumable: Boolean(r.consumable),
    }));
}

// How many published lists use each catalog item.
const usage = () => knex.select(knex.raw('unnest(catalog_ids) as catalog_id')).from('public_kits').as('u');

export async function listInsights(input) {
    const rows = cleanRows(input);
    const ownedIds = new Set(rows.map((r) => r.catalogId).filter(Boolean));

    // Which catalog category each row belongs to: the linked item's, or a
    // catalog category with the same name as the row's list category.
    const linked = ownedIds.size
        ? await knex('catalog_items').whereIn('id', [...ownedIds]).select('id', 'category', 'specs', 'brand')
        : [];
    const linkedCategory = new Map(linked.map((r) => [r.id, r.category]));
    const linkedSpecs = new Map(linked.map((r) => [r.id, r.specs || {}]));
    const linkedBrand = new Map(linked.map((r) => [r.id, r.brand || '']));
    const bigThree = await bigThreeSwaps(rows.filter((r) => !r.worn && !r.consumable), { linkedCategory, linkedSpecs, linkedBrand, ownedIds });
    const catalogCategories = await knex('catalog_items').where({ status: 'published' }).distinct('category').pluck('category');
    const byLower = new Map(catalogCategories.filter(Boolean).map((c) => [c.toLowerCase(), c]));
    const categoryOf = (r) => (r.catalogId && linkedCategory.get(r.catalogId)) || byLower.get(r.category.toLowerCase()) || null;

    const categories = [...new Set(rows.map(categoryOf).filter(Boolean))];
    if (!categories.length) return { bigThree, alternatives: [], favorites: [] };

    const pool = await knex('catalog_items')
        .leftJoin(knex.select('catalog_id').count({ uses: '*' }).from(usage()).groupBy('catalog_id').as('c'), 'c.catalog_id', 'catalog_items.id')
        .where('catalog_items.status', 'published')
        .whereIn('catalog_items.category', categories)
        .where('catalog_items.weight_mg', '>', 0)
        .select('catalog_items.id', 'catalog_items.name', 'catalog_items.brand', 'catalog_items.category', 'catalog_items.description',
            'catalog_items.weight_mg', 'catalog_items.price', 'catalog_items.url', 'catalog_items.specs', knex.raw('coalesce(c.uses, 0)::int as uses'));
    const byCategory = new Map();
    for (const p of pool) {
        if (!byCategory.has(p.category)) byCategory.set(p.category, []);
        byCategory.get(p.category).push(p);
    }
    const kitCount = Number((await knex('public_kits').count({ n: '*' }).first()).n) || 0;
    const present = (p) => ({
        id: p.id,
        name: p.name,
        brand: p.brand,
        category: p.category,
        weightMg: p.weight_mg,
        price: p.price === null ? null : Number(p.price),
        uses: p.uses,
        share: kitCount ? Math.round((p.uses / kitCount) * 100) : 0,
    });

    // Like for like: same catalog category and the same kind of gear.
    const kindOf = new Map(pool.map((p) => [p.id, gearKind(p.name, p.description)]));
    // Smaller swaps: everything but the big three, at least 20% lighter.
    const alternatives = [];
    for (const r of rows) {
        if (r.worn || r.consumable) continue;
        const cat = categoryOf(r);
        const kind = gearKind(r.name, r.description);
        if (!cat || !kind || !r.weightMg) continue;
        // Big-three gear is above; everything else, same catalog category.
        if (bigThreeKind({ ...r, catalogCategory: r.catalogId ? linkedCategory.get(r.catalogId) || '' : '', brand: r.catalogId ? linkedBrand.get(r.catalogId) : '' })) continue;
        const lighter = (byCategory.get(cat) || [])
            .filter((p) => kindOf.get(p.id) === kind)
            .filter((p) => p.id !== r.catalogId && !ownedIds.has(p.id) && worthSwapping(r.weightMg, p.weight_mg))
            // The same size and volume: an XL jacket never gets a Small.
            .filter((p) => fitsLike({ name: r.name, specs: r.catalogId ? linkedSpecs.get(r.catalogId) : null }, p, kind))
            .sort((a, b) => b.uses - a.uses || a.weight_mg - b.weight_mg)
            .slice(0, 2);
        if (lighter.length) {
            alternatives.push({
                item: { itemId: r.itemId, name: r.name, weightMg: r.weightMg },
                options: lighter.map((p) => ({ ...present(p), savesMg: r.weightMg - p.weight_mg })),
            });
        }
    }
    // Biggest savings first.
    alternatives.sort((a, b) => b.options[0].savesMg - a.options[0].savesMg);

    // The most used item in each of the list's categories that you don't
    // have; for big-three gear, only the kinds the list already uses (no
    // tents for a hammock sleeper).
    const ownKinds = new Set(rows.map((r) => bigThreeKind({ ...r, catalogCategory: r.catalogId ? linkedCategory.get(r.catalogId) : '' })).filter(Boolean));
    const favorites = [];
    for (const cat of categories) {
        const top = (byCategory.get(cat) || [])
            .filter((p) => p.uses > 0 && !ownedIds.has(p.id))
            .filter((p) => {
                const k = bigThreeKind({ name: p.name, description: p.description, brand: p.brand, catalogCategory: p.category, strict: true });
                return !k || ownKinds.has(k);
            })
            .sort((a, b) => b.uses - a.uses)[0];
        if (top) favorites.push(present(top));
    }
    favorites.sort((a, b) => b.uses - a.uses);
    return { bigThree, alternatives: alternatives.slice(0, 8), favorites: favorites.slice(0, 6) };
}

// ---- the big three -------------------------------------------------------------------

const PER_ITEM = 3;

/**
 * Shelter, sleep system and pack: each piece of the list's, with up to three
 * catalog swaps of the same kind (client/utils/big-three.js) that are at
 * least 20% lighter and like for like. Pieces with nothing lighter are kept,
 * so the panel can say they're already light.
 */
async function bigThreeSwaps(rows, { linkedCategory, linkedSpecs, linkedBrand, ownedIds }) {
    const mine = rows
        .filter((r) => r.weightMg > 0)
        .map((r) => {
            const catalogCategory = r.catalogId ? linkedCategory.get(r.catalogId) || '' : '';
            const specs = r.catalogId ? linkedSpecs.get(r.catalogId) : null;
            const brand = r.catalogId ? linkedBrand.get(r.catalogId) : '';
            return { ...r, specs, catalogCategory, kind: bigThreeKind({ ...r, catalogCategory, specs, brand }) };
        })
        .filter((r) => r.kind);
    if (!mine.length) return { slots: [], totalMg: 0, bestSavingsMg: 0 };

    // Catalog gear of those kinds, lighter than the heaviest of them.
    const heaviest = Math.max(...mine.map((r) => r.weightMg));
    const kitCount = Number((await knex('public_kits').count({ n: '*' }).first()).n) || 0;
    const candidates = (await knex('catalog_items')
        .leftJoin(knex.select('catalog_id').count({ uses: '*' }).from(usage()).groupBy('catalog_id').as('c'), 'c.catalog_id', 'catalog_items.id')
        .where('catalog_items.status', 'published')
        .where('catalog_items.weight_mg', '>', 0)
        .where('catalog_items.weight_mg', '<', heaviest)
        .select('catalog_items.id', 'catalog_items.name', 'catalog_items.brand', 'catalog_items.category', 'catalog_items.description',
            'catalog_items.weight_mg', 'catalog_items.price', 'catalog_items.specs', knex.raw('coalesce(c.uses, 0)::int as uses')))
        // Strict: the catalog category says what it is, never its name or
        // brand ("Hammock Gear Ground Cloth" isn't a hammock).
        .map((p) => ({ ...p, kind: bigThreeKind({ name: p.name, description: p.description, brand: p.brand, catalogCategory: p.category, specs: p.specs, strict: true }) }))
        .filter((p) => p.kind);

    const slots = SLOTS.map((s) => ({ ...s, items: [] }));
    let totalMg = 0;
    let bestSavingsMg = 0;
    for (const r of mine) {
        const options = candidates
            .filter((p) => p.kind === r.kind && p.id !== r.catalogId && !ownedIds.has(p.id))
            // Gear from the catalog: the very same catalog category, too.
            .filter((p) => !r.catalogCategory || sameCategory(p.category, r.catalogCategory))
            .filter((p) => worthSwapping(r.weightMg, p.weight_mg))
            .filter((p) => likeForLike(r.kind, r.specs, p.specs || {}))
            // The same volume and size, from specs or names (fit.js).
            .filter((p) => fitsLike(r, p, r.kind))
            // Proven picks first (used in public lists), then the lightest.
            .sort((a, b) => (b.uses > 0) - (a.uses > 0) || a.weight_mg - b.weight_mg)
            .slice(0, PER_ITEM)
            .map((p) => ({
                id: p.id,
                name: p.name,
                brand: p.brand,
                category: p.category,
                weightMg: p.weight_mg,
                price: p.price === null ? null : Number(p.price),
                uses: p.uses,
                share: kitCount ? Math.round((p.uses / kitCount) * 100) : 0,
                savesMg: r.weightMg - p.weight_mg,
                savesPct: Math.round((1 - p.weight_mg / r.weightMg) * 100),
            }));
        totalMg += r.weightMg;
        if (options.length) bestSavingsMg += Math.max(...options.map((o) => o.savesMg));
        slots.find((s) => s.id === KINDS[r.kind].slot).items.push({
            item: { itemId: r.itemId, name: r.name, weightMg: r.weightMg, kind: r.kind, kindLabel: KINDS[r.kind].label },
            options,
        });
    }
    return { slots: slots.filter((s) => s.items.length), totalMg, bestSavingsMg };
}
