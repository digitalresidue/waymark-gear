// Lighter alternatives and community favorites for a pack list, from the
// gear catalog and the lists people have published.
//
// The client sends the rows of one list (name, category, weight, catalogId).
// Nothing is stored; the same function backs the editor, the API and MCP.

import knex from './db.js';
import { isUuid } from './catalog.js';

const MAX_ROWS = 200;
const LIGHTER_BY = 0.9; // at least 10% lighter to be worth suggesting

function cleanRows(rows) {
    return (Array.isArray(rows) ? rows : []).slice(0, MAX_ROWS).map((r) => ({
        itemId: Number.isSafeInteger(r.itemId) ? r.itemId : null,
        name: String(r.name || '').slice(0, 200),
        category: String(r.category || '').slice(0, 80),
        weightMg: Math.max(0, Number(r.weightMg) || 0),
        catalogId: isUuid(r.catalogId) ? r.catalogId : null,
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
        ? await knex('catalog_items').whereIn('id', [...ownedIds]).select('id', 'category')
        : [];
    const linkedCategory = new Map(linked.map((r) => [r.id, r.category]));
    const catalogCategories = await knex('catalog_items').where({ status: 'published' }).distinct('category').pluck('category');
    const byLower = new Map(catalogCategories.filter(Boolean).map((c) => [c.toLowerCase(), c]));
    const categoryOf = (r) => (r.catalogId && linkedCategory.get(r.catalogId)) || byLower.get(r.category.toLowerCase()) || null;

    const categories = [...new Set(rows.map(categoryOf).filter(Boolean))];
    if (!categories.length) return { alternatives: [], favorites: [] };

    const pool = await knex('catalog_items')
        .leftJoin(knex.select('catalog_id').count({ uses: '*' }).from(usage()).groupBy('catalog_id').as('c'), 'c.catalog_id', 'catalog_items.id')
        .where('catalog_items.status', 'published')
        .whereIn('catalog_items.category', categories)
        .where('catalog_items.weight_mg', '>', 0)
        .select('catalog_items.id', 'catalog_items.name', 'catalog_items.brand', 'catalog_items.category',
            'catalog_items.weight_mg', 'catalog_items.price', 'catalog_items.url', knex.raw('coalesce(c.uses, 0)::int as uses'));
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

    const alternatives = [];
    for (const r of rows) {
        const cat = categoryOf(r);
        if (!cat || !r.weightMg) continue;
        const lighter = (byCategory.get(cat) || [])
            .filter((p) => p.id !== r.catalogId && !ownedIds.has(p.id) && p.weight_mg <= r.weightMg * LIGHTER_BY)
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

    // The most used item in each of the list's categories that you don't have.
    const favorites = [];
    for (const cat of categories) {
        const top = (byCategory.get(cat) || []).filter((p) => p.uses > 0 && !ownedIds.has(p.id)).sort((a, b) => b.uses - a.uses)[0];
        if (top) favorites.push(present(top));
    }
    favorites.sort((a, b) => b.uses - a.uses);
    return { alternatives: alternatives.slice(0, 12), favorites: favorites.slice(0, 6) };
}
