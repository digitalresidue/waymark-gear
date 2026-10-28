// Reading gear lists exported from LighterPack (and from Waymark Gear, which
// writes the same CSV). Used by the browser for file uploads and by the
// server for pasted lighterpack.com links, so both produce the same result.
//
// LighterPack's export columns:
//   Item Name, Category, desc, qty, weight, unit, url, price, worn, consumable
// Older files and hand-made spreadsheets may stop after "unit"; that's fine.

import weightUtils from './weight.js';

export const MAX_IMPORT_ROWS = 2000;

const UNITS = {
    ounce: 'oz', ounces: 'oz', oz: 'oz',
    pound: 'lb', pounds: 'lb', lb: 'lb', lbs: 'lb',
    gram: 'g', grams: 'g', g: 'g',
    kilogram: 'kg', kilograms: 'kg', kg: 'kg', kgs: 'kg',
};

const HEADERS = {
    name: ['item name', 'name', 'item'],
    category: ['category'],
    description: ['desc', 'description'],
    qty: ['qty', 'quantity'],
    weight: ['weight'],
    unit: ['unit', 'units'],
    url: ['url', 'link'],
    price: ['price'],
    worn: ['worn'],
    consumable: ['consumable'],
};
const POSITIONAL = ['name', 'category', 'description', 'qty', 'weight', 'unit', 'url', 'price', 'worn', 'consumable'];

// RFC 4180: quoted fields, doubled quotes, commas and newlines inside quotes.
export function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    const s = String(text || '').replace(/^\uFEFF/, '');
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (quoted) {
            if (c === '"') {
                if (s[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    quoted = false;
                }
            } else {
                field += c;
            }
        } else if (c === '"' && field === '') {
            quoted = true;
        } else if (c === ',') {
            row.push(field);
            field = '';
        } else if (c === '\n' || c === '\r') {
            if (c === '\r' && s[i + 1] === '\n') i++;
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
        } else {
            field += c;
        }
    }
    if (field !== '' || row.length) {
        row.push(field);
        rows.push(row);
    }
    return rows;
}

// Our own export prefixes cells that start with = + - @ with an apostrophe so
// spreadsheets don't run them as formulas (server/csv.js). Undo that.
function cell(value) {
    const v = String(value ?? '').trim();
    return /^'[=+\-@]/.test(v) ? v.slice(1) : v;
}

function flag(value) {
    const v = cell(value).toLowerCase();
    return Boolean(v) && !['0', 'false', 'no', 'n'].includes(v);
}

function number(value) {
    const n = parseFloat(cell(value).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : NaN;
}

function columnsFor(header) {
    const lower = header.map((h) => cell(h).toLowerCase());
    if (!lower.some((h) => HEADERS.name.includes(h))) return null;
    const cols = {};
    for (const [key, names] of Object.entries(HEADERS)) {
        const at = lower.findIndex((h) => names.includes(h));
        if (at > -1) cols[key] = at;
    }
    return cols;
}

// → { name, description, categories: [{ name, items: [...] }], itemCount, skipped }
// Each item: { name, description, qty, weightMg, unit, url, price, worn, consumable }.
export function parseGearCsv(text, { name = '' } = {}) {
    const rows = parseCsv(text).filter((r) => r.some((c) => cell(c)));
    let cols = null;
    if (rows.length) cols = columnsFor(rows[0]);
    const body = cols ? rows.slice(1) : rows;
    if (!cols) cols = Object.fromEntries(POSITIONAL.map((k, i) => [k, i]));

    const categories = [];
    const byName = new Map();
    let itemCount = 0;
    let skipped = 0;

    for (const r of body) {
        if (itemCount >= MAX_IMPORT_ROWS) {
            skipped++;
            continue;
        }
        const get = (key) => (cols[key] === undefined ? '' : r[cols[key]]);
        const itemName = cell(get('name')).slice(0, 200);
        const unit = UNITS[cell(get('unit')).toLowerCase()] || (cols.unit === undefined ? 'oz' : null);
        const weight = number(get('weight'));
        if (!itemName || !unit || !Number.isFinite(weight) || weight < 0) {
            skipped++;
            continue;
        }
        const qtyRaw = number(get('qty'));
        const qty = Number.isFinite(qtyRaw) && qtyRaw >= 0 ? Math.min(qtyRaw, 10000) : 1;
        const price = number(get('price'));
        const url = cell(get('url'));
        const categoryName = cell(get('category')).slice(0, 200) || 'Imported';

        let category = byName.get(categoryName.toLowerCase());
        if (!category) {
            category = { name: categoryName, items: [] };
            byName.set(categoryName.toLowerCase(), category);
            categories.push(category);
        }
        category.items.push({
            name: itemName,
            description: cell(get('description')).slice(0, 1000),
            qty,
            weightMg: Math.round(weightUtils.WeightToMg(weight, unit)),
            unit,
            url: /^https?:\/\//i.test(url) ? url.slice(0, 2000) : '',
            price: Number.isFinite(price) && price > 0 ? Math.round(price * 100) / 100 : 0,
            worn: flag(get('worn')),
            consumable: flag(get('consumable')),
        });
        itemCount++;
    }

    return { name: String(name).slice(0, 200), description: '', categories, itemCount, skipped };
}

// lighterpack.com/r/abc123, /e/abc123, /csv/abc123, with or without scheme
// or www. Returns the list id, or null. `host` lets tests point elsewhere.
export function lighterPackId(input, host = 'lighterpack.com') {
    const raw = String(input || '').trim();
    if (!raw) return null;
    let url;
    try {
        url = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
    } catch {
        return null;
    }
    const h = url.host.toLowerCase().replace(/^www\./, '');
    if (h !== host.toLowerCase()) return null;
    const m = url.pathname.match(/^\/(?:r|e|csv)\/([a-z0-9]{1,32})\/?$/i);
    return m ? m[1] : null;
}
