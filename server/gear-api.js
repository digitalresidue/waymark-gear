// What the REST API (/api/v1) and the MCP server (/mcp) can do with
// someone's gear: read their closet and lists, check a list, search the
// catalog, and (with a write token) add and change gear and lists.
//
// Writes go through the same path as the editor: load the library, change
// it with the shared Library class, diff, applyChanges. Open tabs are told
// to refresh, published lists and cached pages are brought up to date.

import knex from './db.js';
import { Library } from '../client/dataTypes.js';
import { diffLibrary } from '../client/utils/library-diff.js';
import weightUtils from '../client/utils/weight.js';
import { checkEssentials, listRows, readinessLabel } from '../client/utils/insights.js';
import { tripEstimates } from '../client/utils/trip.js';
import { categoryKey } from '../client/utils/gear-meta.js';
import { loadLibrary, applyChanges } from './library-store.js';
import { applyCatalog, search as catalogSearch, specFilters, isUuid } from './catalog.js';
import { specRows } from '../client/utils/gear-specs.js';
import { listInsights } from './insights.js';
import { syncPublishedKits } from './kits.js';
import { forgetUserPages } from './page-cache.js';
import { announceLibraryChange } from './shared-lists.js';

export class GearApiError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}

const UNITS = ['g', 'kg', 'oz', 'lb'];

async function libraryFor(user) {
    const serialized = await loadLibrary(user.user_id);
    const library = new Library();
    if (serialized) library.load(await applyCatalog(serialized));
    else library.firstRun();
    return library;
}

const weight = (mg, unit) => ({ mg, display: `${weightUtils.MgToDisplayWeight(mg, unit)} ${unit}` });

function gearOut(item, unit) {
    return {
        id: item.id,
        name: item.name,
        description: item.description || '',
        weight: weight(item.weight || 0, item.authorUnit || unit),
        price: item.price || null,
        url: item.url || '',
        closetCategory: item.closetCategory || '',
        catalogId: item.catalogId || null,
        retired: Boolean(item.retired),
        wishlist: Boolean(item.wishlist),
        condition: item.condition || '',
        purchasedOn: item.purchasedOn || '',
        lifeYears: item.lifeYears ?? null,
    };
}

function listSummary(library, list) {
    list.calculateTotals();
    const unit = library.totalUnit;
    return {
        id: list.id,
        name: list.name || 'Untitled list',
        published: Boolean(list.published),
        shareUrl: list.published && list.externalId ? `/r/${list.externalId}` : null,
        tripType: list.tripType || null,
        trail: list.trail ? { name: list.trail.name, slug: list.trail.slug || null, year: list.trail.year || null, direction: list.trail.direction || null } : null,
        baseWeight: weight(list.totalBaseWeight, unit),
        totalWeight: weight(list.totalWeight, unit),
        wornWeight: weight(list.totalWornWeight, unit),
        consumableWeight: weight(list.totalConsumableWeight, unit),
        itemCount: listRows(library, list).length,
    };
}

function findList(library, listId) {
    const list = library.getListById(Number(listId));
    if (!list || !library.lists.includes(list)) throw new GearApiError('No such list.', 404);
    return list;
}

// ---- reading -------------------------------------------------------------------

export async function me(user) {
    const library = await libraryFor(user);
    const owned = library.items.filter((i) => !i.retired && !i.wishlist && (i.name || i.weight));
    return {
        username: user.username,
        unit: library.totalUnit,
        lists: library.lists.length,
        gear: owned.length,
        wishlist: library.items.filter((i) => i.wishlist && !i.retired).length,
    };
}

export async function closet(user, { include = 'owned', q = '' } = {}) {
    const library = await libraryFor(user);
    const needle = String(q).toLowerCase();
    return library.items
        .filter((i) => i.name || i.weight)
        .filter((i) => {
            if (include === 'all') return true;
            if (include === 'wishlist') return i.wishlist && !i.retired;
            if (include === 'retired') return i.retired;
            return !i.retired && !i.wishlist;
        })
        .filter((i) => !needle || `${i.name} ${i.description} ${i.closetCategory || ''}`.toLowerCase().includes(needle))
        .map((i) => gearOut(i, library.itemUnit));
}

export async function lists(user) {
    const library = await libraryFor(user);
    return library.lists.map((l) => listSummary(library, l));
}

export async function listDetail(user, listId) {
    const library = await libraryFor(user);
    const list = findList(library, listId);
    return {
        ...listSummary(library, list),
        description: list.description || '',
        trip: list.trip || null,
        categories: list.categoryIds.map((id) => library.getCategoryById(id)).filter(Boolean).map((c) => ({
            id: c.id,
            name: c.name || '',
            // The heading it sits under (e.g. Clothing), if any.
            group: (c.groupId && (list.getGroupById(c.groupId) || {}).name) || '',
            items: c.categoryItems.map((ci) => {
                const item = library.getItemById(ci.itemId);
                if (!item || !(item.name || item.weight)) return null;
                return { ...gearOut(item, library.itemUnit), qty: ci.qty, worn: Boolean(ci.worn), consumable: Boolean(ci.consumable) };
            }).filter(Boolean),
        })),
    };
}

// The gear check: essentials, readiness, lighter options, and the calorie
// estimate when the trip has details.
export async function checkList(user, listId) {
    const library = await libraryFor(user);
    const list = findList(library, listId);
    list.calculateTotals();
    const rows = listRows(library, list);
    const trip = list.trip || {};
    const essentials = checkEssentials(rows, { tripType: list.tripType, tempLowC: trip.tempLowC, tempHighC: trip.tempHighC, dismissed: list.notNeeded });
    const { alternatives, favorites } = await listInsights(rows);
    const unit = library.totalUnit;
    const estimate = list.trip ? tripEstimates(list.trip, (list.totalBaseWeight || 0) + (list.totalConsumableWeight || 0)) : null;
    return {
        list: listSummary(library, list),
        readiness: { score: essentials.score, label: readinessLabel(essentials.score) },
        missing: essentials.missing,
        covered: essentials.covered,
        notNeeded: essentials.dismissed,
        notes: essentials.notes,
        lighterOptions: alternatives.map((a) => ({
            item: a.item.name,
            weight: weight(a.item.weightMg, unit),
            options: a.options.map((o) => ({ catalogId: o.id, name: `${o.brand} ${o.name}`.trim(), weight: weight(o.weightMg, unit), saves: weight(o.savesMg, unit), usedInPublicLists: `${o.share}%` })),
        })),
        popularWithOthers: favorites.map((f) => ({ catalogId: f.id, name: `${f.brand} ${f.name}`.trim(), category: f.category, weight: weight(f.weightMg, unit), usedInPublicLists: `${f.share}%` })),
        calories: estimate ? { kcalPerDay: estimate.kcalPerDay, macrosGrams: estimate.macros, waterLitersPerDay: estimate.waterLitersPerDay, trip: estimate.totals } : null,
    };
}

export async function searchCatalog({ q = '', category = '', limit = 10, query = {} } = {}) {
    const { items } = await catalogSearch({
        q: String(q).slice(0, 200), category: String(category).slice(0, 80), limit: Math.min(Number(limit) || 10, 25), specs: specFilters(query),
    });
    return items.map((i) => ({
        catalogId: i.id,
        name: i.name,
        brand: i.brand,
        category: i.category,
        weight: weight(i.weightMg, i.unit),
        price: i.price,
        url: i.url,
        page: `/g/${i.id}`,
        // Readable specs ("Trail weight": "26 oz (737.1 g)"), when it has any.
        specs: Object.fromEntries(specRows(i.category, i.specs).map((r) => [r.label, r.text])),
    }));
}

// ---- writing -----------------------------------------------------------------------

async function change(user, by, fn) {
    const library = await libraryFor(user);
    const before = library.save();
    const result = await fn(library);
    const changes = diffLibrary(before, library.save());
    if (changes) {
        await knex.transaction(async (trx) => {
            await applyChanges(user.user_id, changes, trx);
            await trx('users').where({ user_id: user.user_id }).update({ sync_token: trx.raw('sync_token + 1') });
        });
        try {
            await syncPublishedKits(user, await loadLibrary(user.user_id));
        } catch {
            // The change is saved; the public copy catches up on the next save.
        }
        forgetUserPages(user.user_id);
        announceLibraryChange(user.user_id, user.username, by).catch(() => {});
    }
    return result;
}

function toMg(value, unit) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > 1e6) throw new GearApiError('Weight must be a number.');
    if (!UNITS.includes(unit)) throw new GearApiError('Unit is g, kg, oz or lb.');
    return Math.round(weightUtils.WeightToMg(n, unit));
}

const text = (v, max) => String(v ?? '').trim().slice(0, max);

async function catalogEntry(catalogId) {
    if (!isUuid(catalogId)) throw new GearApiError('No such catalog item.', 404);
    const { items } = await catalogSearch({ ids: [catalogId], limit: 1 });
    if (!items.length) throw new GearApiError('No such catalog item.', 404);
    return items[0];
}

// Add gear to the closet, from the catalog or by hand. { catalogId } or
// { name, weight, unit, description, closetCategory }, plus wishlist.
export async function addGear(user, input = {}) {
    const entry = input.catalogId ? await catalogEntry(input.catalogId) : null;
    return change(user, 'api', (library) => {
        let item;
        if (entry) {
            item = library.newItemFromCatalog({ category: null, entry });
        } else {
            const name = text(input.name, 300);
            if (!name) throw new GearApiError('Name the gear, or give a catalogId.');
            const unit = UNITS.includes(input.unit) ? input.unit : library.itemUnit;
            item = library.newItem({});
            item.name = name;
            item.description = text(input.description, 2000);
            item.weight = input.weight === undefined ? 0 : toMg(input.weight, unit);
            item.authorUnit = unit;
        }
        if (input.closetCategory) item.closetCategory = text(input.closetCategory, 60);
        if (input.wishlist) item.wishlist = true;
        return gearOut(item, library.itemUnit);
    });
}

// Change a closet item: name, description, weight+unit, closetCategory,
// condition, retired, wishlist.
export async function updateGear(user, gearId, input = {}) {
    return change(user, 'api', (library) => {
        const item = library.getItemById(Number(gearId));
        if (!item || !library.items.includes(item)) throw new GearApiError('No such gear.', 404);
        const patch = { id: item.id };
        if (input.name !== undefined) patch.name = text(input.name, 300);
        if (input.description !== undefined) patch.description = text(input.description, 2000);
        if (input.weight !== undefined) {
            const unit = UNITS.includes(input.unit) ? input.unit : item.authorUnit;
            patch.weight = toMg(input.weight, unit);
            patch.authorUnit = unit;
        }
        library.updateItem(patch);
        if (input.closetCategory !== undefined) item.closetCategory = text(input.closetCategory, 60);
        if (input.condition !== undefined) item.condition = ['new', 'good', 'worn', 'replace', ''].includes(input.condition) ? input.condition : item.condition;
        if (input.retired !== undefined) item.retired = Boolean(input.retired) || undefined;
        if (input.wishlist !== undefined) item.wishlist = Boolean(input.wishlist) || undefined;
        return gearOut(item, library.itemUnit);
    });
}

export async function createList(user, input = {}) {
    return change(user, 'api', (library) => {
        const list = library.newList();
        list.name = text(input.name, 300) || 'New list';
        if (input.description) list.description = text(input.description, 20000);
        const names = Array.isArray(input.categories) && input.categories.length ? input.categories.slice(0, 30) : ['Gear'];
        for (const n of names) {
            const c = library.newCategory({ list });
            c.name = text(n, 200);
        }
        return listSummary(library, list);
    });
}

// Put gear in a list: an existing closet item (gearId), a catalog item
// (catalogId), or new gear (name, weight, unit). The category is found by
// name and made if the list doesn't have it.
export async function addToList(user, listId, input = {}) {
    const entry = input.catalogId ? await catalogEntry(input.catalogId) : null;
    return change(user, 'api', (library) => {
        const list = findList(library, listId);
        const catName = text(input.category, 200) || 'Gear';
        // The list's category however it's spelled ("Mid-layers" for "Mid
        // Layer"); a new one is filed like the editor files it (Clothing).
        let category = list.categoryIds.map((id) => library.getCategoryById(id)).find((c) => c && categoryKey(c.name) === categoryKey(catName));
        if (!category) {
            category = library.newCategory({ list });
            category.name = catName;
            list.placeInDefaultGroup(category, catName);
        }
        let item;
        if (input.gearId !== undefined) {
            item = library.getItemById(Number(input.gearId));
            if (!item || !library.items.includes(item)) throw new GearApiError('No such gear.', 404);
            if (category.getCategoryItemById(item.id)) throw new GearApiError('That gear is already in this category.');
            category.addItem({ itemId: item.id });
        } else if (entry) {
            item = library.newItemFromCatalog({ category, entry });
        } else {
            const name = text(input.name, 300);
            if (!name) throw new GearApiError('Give a gearId, a catalogId, or a name.');
            const unit = UNITS.includes(input.unit) ? input.unit : library.itemUnit;
            item = library.newItem({ category });
            item.name = name;
            item.description = text(input.description, 2000);
            item.weight = input.weight === undefined ? 0 : toMg(input.weight, unit);
            item.authorUnit = unit;
        }
        const ci = category.getCategoryItemById(item.id);
        const qty = Number(input.qty);
        if (Number.isInteger(qty) && qty > 0 && qty <= 1000) ci.qty = qty;
        if (input.worn) ci.worn = 1;
        if (input.consumable) ci.consumable = true;
        return { list: listSummary(library, list), added: { ...gearOut(item, library.itemUnit), category: category.name, qty: ci.qty } };
    });
}

export async function removeFromList(user, listId, gearId) {
    return change(user, 'api', (library) => {
        const list = findList(library, listId);
        const category = library.findCategoryWithItemById(Number(gearId), list.id);
        if (!category) throw new GearApiError('That gear isn\'t in this list.', 404);
        category.removeItem(Number(gearId));
        return listSummary(library, list);
    });
}
