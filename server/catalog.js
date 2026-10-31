// The site owner's gear catalog.
//
// Users pick catalog entries in the list editor instead of typing gear in.
// A picked item remembers its catalogId; while its catalogSync flag is on,
// applyCatalog() refreshes it from the catalog whenever the library is
// loaded, so a corrected weight reaches every list that uses the item.

import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

import knex from './db.js';
import weightUtils from '../client/utils/weight.js';
import { parseShops, shopsToApi, publicShops, SHOP_CSV_COLUMNS, MAX_SHOPS } from './shops.js';
import { absoluteImageUrl, localImagePath } from './remote-image.js';
import { readSpec, readSpecs, specInput, specTypeFor, filterKind, matchKey, SPEC_FIELDS, SPEC_KEYS } from '../client/utils/gear-specs.js';

export const UNITS = ['g', 'kg', 'oz', 'lb'];
export const CSV_COLUMNS = [
    'sku', 'name', 'brand', 'category', 'description', 'weight', 'unit', 'price', 'currency',
    'url', 'image_url', 'worn_default', 'consumable_default', 'tags', 'status', 'affiliate_url',
    // Where to buy, besides url: up to four more shops (server/shops.js).
    ...SHOP_CSV_COLUMNS,
    // Specs (client/utils/gear-specs.js), one column per field; only the
    // fields for the row's type are read ("20F", "14 oz", "Freestanding").
    ...SPEC_KEYS,
];
export const MAX_IMPORT_ROWS = 5000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

// ---- shapes ----------------------------------------------------------------

// Database row -> what the API and client see.
export function toApi(row) {
    return {
        id: row.id,
        sku: row.sku || '',
        name: row.name,
        brand: row.brand,
        category: row.category,
        description: row.description,
        weightMg: row.weight_mg,
        unit: row.unit,
        weight: weightUtils.MgToWeight(row.weight_mg, row.unit),
        price: row.price === null ? null : Number(row.price),
        currency: row.currency,
        url: row.url,
        imageUrl: row.image_url,
        wornDefault: row.worn_default,
        consumableDefault: row.consumable_default,
        tags: row.tags || [],
        status: row.status,
        // Owner-only: public routes drop it (publicEntry).
        affiliateUrl: row.affiliate_url || '',
        // Where to buy besides url; each shop's affiliate link is owner-only too.
        shops: shopsToApi(row.shops),
        // Stored units (gear-specs.js); formatSpec/specRows show them.
        specs: row.specs || {},
        updatedAt: row.updated_at,
    };
}

// What anyone may see of a catalog entry: everything but the affiliate link,
// which only the /go redirect uses.
export function publicEntry(entry) {
    const { affiliateUrl, ...rest } = entry; // eslint-disable-line no-unused-vars
    return { ...rest, shops: publicShops(rest.shops) };
}

const truthy = (v) => /^(1|true|yes|y|x)$/i.test(String(v ?? '').trim());
const isSafeUrl = (v) => v === '' || /^https?:\/\/[^\s]+$/i.test(v);

// Validate one entry from a form or a CSV row. Accepts either the API's
// camelCase names or the CSV's snake_case ones. Returns { value, errors }:
// value is ready for the database, errors is a list of strings.
export function validateEntry(input) {
    const get = (...keys) => {
        for (const k of keys) {
            if (input[k] !== undefined && input[k] !== null) return input[k];
        }
        return undefined;
    };
    const str = (v, max) => String(v ?? '').trim().slice(0, max);
    const errors = [];

    const name = str(get('name'), 200);
    if (!name) errors.push('name is required');

    const unit = str(get('unit'), 4).toLowerCase() || 'oz';
    if (!UNITS.includes(unit)) errors.push(`unit must be one of ${UNITS.join(', ')}`);

    let weightMg = 0;
    const rawWeightMg = get('weightMg');
    const rawWeight = get('weight');
    // weight + unit is what people type and what CSVs carry, so it wins;
    // weightMg is accepted on its own for callers that already have it.
    if (rawWeight !== undefined && String(rawWeight).trim() !== '') {
        const w = Number(String(rawWeight).trim());
        weightMg = UNITS.includes(unit) ? Math.round(weightUtils.WeightToMg(w, unit)) : NaN;
    } else if (rawWeightMg !== undefined && rawWeightMg !== '') {
        weightMg = Math.round(Number(rawWeightMg));
    }
    if (!Number.isFinite(weightMg) || weightMg < 0 || weightMg > 2_000_000_000) {
        errors.push('weight must be a number of zero or more');
        weightMg = 0;
    }

    let price = null;
    const rawPrice = get('price');
    if (rawPrice !== undefined && String(rawPrice).trim() !== '') {
        price = Number(String(rawPrice).replace(/[$,\s]/g, ''));
        if (!Number.isFinite(price) || price < 0 || price >= 1e8) {
            errors.push('price must be a number of zero or more');
            price = null;
        } else {
            price = Math.round(price * 100) / 100;
        }
    }

    const url = str(get('url'), 2000);
    if (!isSafeUrl(url)) errors.push('url must start with http:// or https://');
    // Only set when given, so a CSV without the column keeps existing links.
    const rawAffiliate = get('affiliateUrl', 'affiliate_url');
    const affiliateUrl = rawAffiliate === undefined ? undefined : str(rawAffiliate, 2000);
    if (affiliateUrl && !/^https:\/\/[^\s]+$/i.test(affiliateUrl)) errors.push('affiliate_url must start with https://');
    // Affiliate networks (AvantLink, Impact...) hand out tracking links that
    // say nothing about the product. The normal product link has to be there
    // too: Supporters always get it, and it's what the gear page shows.
    if (affiliateUrl && !url) errors.push('add the normal product link (url) too: Supporters get that one, never the affiliate link');
    // A photo already copied here comes back as its path or its full link on
    // this site; both are stored as the copy's path, never fetched again.
    let imageUrl = str(get('imageUrl', 'image_url'), 2000);
    const ownCopy = localImagePath(imageUrl);
    if (ownCopy) imageUrl = ownCopy;
    else if (!isSafeUrl(imageUrl)) errors.push('image_url must be a link starting with http:// or https://');

    const status = str(get('status'), 20).toLowerCase() || 'published';
    if (!['published', 'draft'].includes(status)) errors.push('status must be published or draft');

    let tags = get('tags');
    if (typeof tags === 'string') tags = tags.split(/[;|]/);
    tags = Array.isArray(tags) ? [...new Set(tags.map((t) => str(t, 40)).filter(Boolean))].slice(0, 20) : [];

    const sku = str(get('sku'), 80) || null;
    const currency = (str(get('currency'), 3).toUpperCase() || 'USD');
    if (!/^[A-Z]{3}$/.test(currency)) errors.push('currency must be a 3-letter code like USD');

    // Where to buy (server/shops.js). Badges aren't stored on the item: they're
    // saved per shop website after the item is (badges).
    const shopInput = parseShops(input, url);
    errors.push(...shopInput.errors);

    // Specs: an object from the editor ({ temp_comfort: '20F', ... }), or a
    // sheet's spec columns. Neither given: the item keeps the specs it has.
    const category = str(get('category'), 80);
    let specs;
    if (input.specs && typeof input.specs === 'object' && !Array.isArray(input.specs)) {
        specs = readSpecs(category, input.specs);
    } else if (SPEC_KEYS.some((k) => k in input)) {
        specs = readSpecs(category, Object.fromEntries(SPEC_KEYS.map((k) => [k, input[k]])));
    }
    if (specs) errors.push(...specs.errors);

    return {
        errors,
        badges: shopInput.badges,
        value: {
            sku,
            name,
            brand: str(get('brand'), 120),
            category,
            description: str(get('description'), 1000),
            weight_mg: weightMg,
            unit,
            price,
            currency,
            url,
            image_url: imageUrl,
            worn_default: truthy(get('wornDefault', 'worn_default')) || get('wornDefault') === true,
            consumable_default: truthy(get('consumableDefault', 'consumable_default')) || get('consumableDefault') === true,
            tags,
            status,
            ...(affiliateUrl === undefined ? {} : { affiliate_url: affiliateUrl }),
            ...(shopInput.shops === undefined ? {} : { shops: JSON.stringify(shopInput.shops) }),
            ...(specs === undefined ? {} : { specs: JSON.stringify(specs.specs) }),
        },
    };
}

// ---- queries ---------------------------------------------------------------

function escapeLike(s) {
    return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Spec filters from a query string: spec_<key>=a,b (any of) for choices and
 * yes/no, spec_<key>_min / spec_<key>_max for measures ("2lb", "20F", "40").
 * Returns [{ key, any } | { key, min, max }]; unknown keys are ignored.
 */
export function specFilters(query = {}) {
    const out = [];
    for (const key of SPEC_KEYS) {
        const kind = filterKind(key);
        if (kind === 'match' && query[`spec_${key}`] !== undefined) {
            const any = String(query[`spec_${key}`]).split(',').slice(0, 10).map((v) => readSpec(key, v).value).filter((v) => v !== undefined);
            if (any.length) out.push({ key, any: any.map((v) => matchKey(key, v)), text: SPEC_FIELDS[key].kind === 'text' });
        }
        if (kind === 'range') {
            const min = query[`spec_${key}_min`] !== undefined ? readSpec(key, query[`spec_${key}_min`]).value : undefined;
            const max = query[`spec_${key}_max`] !== undefined ? readSpec(key, query[`spec_${key}_max`]).value : undefined;
            if (min !== undefined || max !== undefined) out.push({ key, min, max });
            // A choice measured in numbers (fill power) can also be matched.
            if (query[`spec_${key}`] !== undefined) {
                const any = String(query[`spec_${key}`]).split(',').slice(0, 10).map((v) => readSpec(key, v).value).filter((v) => v !== undefined);
                if (any.length) out.push({ key, any: any.map(String) });
            }
        }
    }
    return out;
}

export async function search({ q = '', category = '', status = 'published', limit = 50, offset = 0, ids, specs = [] } = {}) {
    const query = knex('catalog_items');
    for (const f of specs) {
        if (!SPEC_KEYS.includes(f.key)) continue;
        if (f.any && f.text) query.whereRaw('lower(specs->>?) = any(?)', [f.key, f.any]);
        else if (f.any) query.whereRaw('specs->>? = any(?)', [f.key, f.any]);
        if (f.min !== undefined) query.whereRaw("jsonb_typeof(specs->?) = 'number' and (specs->>?)::numeric >= ?", [f.key, f.key, f.min]);
        if (f.max !== undefined) query.whereRaw("jsonb_typeof(specs->?) = 'number' and (specs->>?)::numeric <= ?", [f.key, f.key, f.max]);
    }
    if (status && status !== 'all') query.where({ status });
    if (category) query.where({ category });
    if (ids) query.whereIn('id', ids.filter(isUuid));
    const term = String(q).trim();
    if (term) {
        // Every word must appear in the name, brand, category or SKU.
        for (const word of term.split(/\s+/).slice(0, 8)) {
            const like = `%${escapeLike(word)}%`;
            query.where((w) => w.whereILike('name', like).orWhereILike('brand', like)
                .orWhereILike('category', like).orWhereILike('sku', like));
        }
    }
    const [{ count }] = await query.clone().count({ count: '*' });
    const rows = await query
        .orderByRaw('lower(category), lower(name)')
        .limit(Math.min(Math.max(Number(limit) || 50, 1), 200))
        .offset(Math.max(Number(offset) || 0, 0));
    return { total: Number(count), items: rows.map(toApi) };
}

export async function categories({ includeDrafts = false } = {}) {
    const query = knex('catalog_items').select('category').count({ count: '*' })
        .whereNot({ category: '' }).groupBy('category').orderByRaw('lower(category)');
    if (!includeDrafts) query.where({ status: 'published' });
    return (await query).map((r) => ({ name: r.category, count: Number(r.count) }));
}

export async function getById(id) {
    if (!isUuid(id)) return null;
    const row = await knex('catalog_items').where({ id }).first();
    return row ? toApi(row) : null;
}

// Price changes go into the item's history (server/prices.js). Imported
// lazily: prices.js imports this module.
const recordPrices = async (ids) => (await import('./prices.js')).recordPrices(ids);

export async function create(value) {
    const [row] = await knex('catalog_items').insert(value).returning('*');
    await recordPrices([row.id]);
    return toApi(row);
}

export async function update(id, value) {
    if (!isUuid(id)) return null;
    const [row] = await knex('catalog_items').where({ id })
        .update({ ...value, updated_at: knex.fn.now() }).returning('*');
    if (row) await recordPrices([row.id]);
    return row ? toApi(row) : null;
}

export async function remove(id) {
    if (!isUuid(id)) return 0;
    return knex('catalog_items').where({ id }).del();
}

// ---- library integration --------------------------------------------------

// Refresh catalog-linked items in a serialized library (the JSON stored in
// users.library) from the current catalog. Mutates and returns it. Items the
// user has edited have catalogSync false and are left alone.
export async function applyCatalog(library) {
    const items = (library && Array.isArray(library.items)) ? library.items : [];
    const linked = items.filter((i) => i.catalogId && i.catalogSync && isUuid(i.catalogId));
    if (!linked.length) return library;

    const rows = await knex('catalog_items').whereIn('id', [...new Set(linked.map((i) => i.catalogId))]);
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const item of linked) {
        const row = byId.get(item.catalogId);
        if (!row) continue; // entry deleted: keep the user's copy as it was
        item.name = row.name;
        item.weight = row.weight_mg;
        if (row.price !== null) item.price = Number(row.price);
        item.url = row.url;
        if (row.image_url) item.imageUrl = row.image_url;
    }
    return library;
}

// ---- CSV -------------------------------------------------------------------

// Spreadsheet apps execute a cell that starts with = + - @ (or a tab/CR
// before one). Prefix those with a quote so an export can't carry a formula.
export function neutralizeFormula(value) {
    const s = value === null || value === undefined ? '' : String(value);
    return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

// badges: domain -> { name, badgeUrl } (shops.badgesFor), for the badge
// columns. Photos and badges copied here export as full links to this site,
// which import back as the same copies.
export function toCsv(items, badges = new Map()) {
    const shopCells = (i) => Array.from({ length: MAX_SHOPS }, (_, n) => {
        const shop = (i.shops || [])[n];
        if (!shop) return ['', '', '', ''];
        const b = badges.get(shop.domain) || {};
        return [shop.name, absoluteImageUrl(b.badgeUrl || ''), shop.url, shop.affiliateUrl || ''];
    }).flat();
    const rows = items.map((i) => [
        i.sku, i.name, i.brand, i.category, i.description, i.weight, i.unit,
        i.price === null ? '' : i.price.toFixed(2), i.currency, i.url, absoluteImageUrl(i.imageUrl),
        i.wornDefault ? 'true' : 'false', i.consumableDefault ? 'true' : 'false',
        (i.tags || []).join(';'), i.status, i.affiliateUrl || '', ...shopCells(i),
        ...SPEC_KEYS.map((k) => (specTypeFor(i.category) && i.specs && i.specs[k] !== undefined ? specInput(k, i.specs[k]) : '')),
    ].map(neutralizeFormula));
    return stringify([CSV_COLUMNS, ...rows]);
}

export function templateCsv() {
    return stringify([
        CSV_COLUMNS,
        ['WG-0001', 'Example tent, 1 person', 'Example Brand', 'Tent', 'Single wall, trekking-pole pitched',
            '28', 'oz', '399.00', 'USD', 'https://example.com/tent', '', 'false', 'false', 'tent;1p', 'draft',
            // affiliate_url: the tracking link from your affiliate network,
            // optional. url above stays the normal product page.
            'https://www.avantlink.com/click.php?tt=cl&mi=12345&pw=67890&url=https%3A%2F%2Fexample.com%2Ftent',
            // Where to buy, besides url: per shop, its name, a badge image link
            // (copied to Waymark; leave blank to use the shop's own icon), the
            // normal product link, then an affiliate link (optional).
            'Example Outdoor Store', 'https://example-store.com/logo.png', 'https://example-store.com/p/tent', 'https://example-store.sjv.io/c/1/2/3',
            ...Array(SHOP_CSV_COLUMNS.length - 4).fill(''),
            // Specs: only a type's own columns are read (this row is a Tent);
            // see "Gear specs" in the catalog help for every column.
            ...SPEC_KEYS.map((k) => ({ capacity: '1P', pitch: 'Trekking pole', trail_weight: '26 oz', min_weight: '24 oz', double_wall: 'no', vestibules: '1', floor_width: '30 in', floor_length: '90 in', peak_height: '48 in', packed_size: '14 x 5 x 5 in' }[k] || ''))],
    ]);
}

function parseCsv(text) {
    const records = parse(String(text).replace(/^\uFEFF/, ''), {
        columns: (header) => header.map((h) => String(h).trim().toLowerCase().replace(/\s+/g, '_')),
        skip_empty_lines: true,
        relax_column_count: true,
        trim: true,
        max_record_size: 20_000,
    });
    return records;
}

const COMPARED = ['sku', 'name', 'brand', 'category', 'description', 'weight_mg', 'unit', 'price', 'currency',
    'url', 'image_url', 'worn_default', 'consumable_default', 'tags', 'status', 'affiliate_url', 'shops', 'specs'];

// Same specs, whatever order the keys are in.
const sameSpecs = (a, b) => {
    const norm = (o) => JSON.stringify(Object.keys(o || {}).sort().map((k) => [k, o[k]]));
    return norm(a) === norm(b);
};

function differs(row, value) {
    return COMPARED.some((k) => {
        if (k === 'price') return (row.price === null ? null : Number(row.price)) !== value.price;
        if (k === 'tags') return (row.tags || []).join('\u0000') !== value.tags.join('\u0000');
        if (k === 'affiliate_url' && value[k] === undefined) return false;
        if (k === 'shops') return value.shops !== undefined && JSON.stringify(row.shops || []) !== value.shops;
        if (k === 'specs') return value.specs !== undefined && !sameSpecs(row.specs, JSON.parse(value.specs));
        return (row[k] ?? null) !== (value[k] ?? null);
    });
}

// Work out what an import would do without changing anything.
// Rows match an existing entry on SKU, then on brand + name.
export async function planImport(text) {
    let records;
    try {
        records = parseCsv(text);
    } catch (err) {
        return { error: `Could not read the CSV: ${err.message}` };
    }
    if (!records.length) return { error: 'The file has no rows.' };
    if (records.length > MAX_IMPORT_ROWS) return { error: `Import at most ${MAX_IMPORT_ROWS} rows at a time.` };
    if (!('name' in records[0])) return { error: 'The header row needs at least a "name" column. Download the template to see every column.' };

    const existing = await knex('catalog_items').select('*');
    const bySku = new Map(existing.filter((r) => r.sku).map((r) => [r.sku.toLowerCase(), r]));
    const byName = new Map(existing.map((r) => [`${r.brand.toLowerCase()}\u0000${r.name.toLowerCase()}`, r]));

    const seen = new Set();
    const rows = records.map((record, index) => {
        const line = index + 2; // 1-based, after the header
        const { value, errors, badges } = validateEntry(record);
        const key = value.sku ? `sku:${value.sku.toLowerCase()}` : `name:${value.brand.toLowerCase()}\u0000${value.name.toLowerCase()}`;
        if (seen.has(key)) errors.push('duplicate of an earlier row in this file');
        seen.add(key);
        if (errors.length) return { line, action: 'error', errors, name: value.name };

        const match = (value.sku && bySku.get(value.sku.toLowerCase()))
            || byName.get(`${value.brand.toLowerCase()}\u0000${value.name.toLowerCase()}`);
        if (!match) return { line, action: 'new', name: value.name, value, badges };
        if (!differs(match, value)) return { line, action: 'unchanged', name: value.name, id: match.id, badges };
        return { line, action: 'update', name: value.name, id: match.id, value, badges };
    });

    const summary = { new: 0, update: 0, unchanged: 0, error: 0 };
    for (const r of rows) summary[r.action]++;
    return { rows, summary };
}

// Apply an import in one transaction. Rows with errors are skipped, never
// half-applied; the caller shows them from planImport first.
export async function applyImport(text) {
    const plan = await planImport(text);
    if (plan.error) return plan;
    const touched = [];
    await knex.transaction(async (trx) => {
        for (const row of plan.rows) {
            if (row.action === 'new') {
                const [created] = await trx('catalog_items').insert(row.value).returning('id');
                touched.push(created.id);
            } else if (row.action === 'update') {
                await trx('catalog_items').where({ id: row.id }).update({ ...row.value, updated_at: trx.fn.now() });
                touched.push(row.id);
            }
        }
    });
    await recordPrices(touched);
    // Shop badges and names from the sheet, and every shop it mentions (the
    // caller saves and fetches badges in the background: it can take a while).
    const ok = plan.rows.filter((r) => r.action !== 'error');
    const badges = ok.flatMap((r) => r.badges || []);
    const domains = ok.flatMap((r) => (r.value && r.value.shops ? JSON.parse(r.value.shops).map((x) => x.domain) : []));
    return { summary: plan.summary, errors: plan.rows.filter((r) => r.action === 'error'), badges, domains };
}
