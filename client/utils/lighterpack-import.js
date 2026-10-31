// Reading gear lists from files: LighterPack's CSV export (and Waymark's,
// which is the same), other apps' CSV exports (Packstack, Hikt, GearGrams...)
// and spreadsheets saved as CSV or pasted from Sheets or Excel. Used by the
// browser for uploads and pastes and by the server for pasted lighterpack.com
// links, so both produce the same result.
//
// LighterPack's export columns:
//   Item Name, Category, desc, qty, weight, unit, url, price, worn, consumable
// Other files are read by their column names (many spellings, see HEADERS);
// a file without a header row is read in LighterPack's column order. Commas,
// semicolons (European Excel) and tabs (pasted cells) all work, and a weight
// can carry its own unit ("394 g", "1 lb 4 oz") or take it from the header
// ("Weight (g)").

import weightUtils from './weight.js';

export const MAX_IMPORT_ROWS = 2000;

const UNITS = {
    ounce: 'oz', ounces: 'oz', oz: 'oz', 'oz.': 'oz',
    pound: 'lb', pounds: 'lb', lb: 'lb', lbs: 'lb', 'lb.': 'lb', 'lbs.': 'lb',
    gram: 'g', grams: 'g', g: 'g', gr: 'g', gms: 'g',
    kilogram: 'kg', kilograms: 'kg', kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg',
};
const unitOf = (text) => UNITS[String(text || '').trim().toLowerCase()] || null;

// Column names, lower-cased, without punctuation or a unit in brackets.
const HEADERS = {
    name: ['item name', 'name', 'item', 'gear', 'gear name', 'gear item', 'product', 'product name', 'title', 'model'],
    brand: ['brand', 'manufacturer', 'maker', 'make', 'company'],
    category: ['category', 'categories', 'group', 'section', 'pack category', 'list category'],
    description: ['desc', 'description', 'notes', 'note', 'details', 'comment', 'comments'],
    qty: ['qty', 'quantity', 'count', 'pieces', 'pcs', 'number', 'no'],
    weight: ['weight', 'weight each', 'unit weight', 'item weight', 'weight per item', 'single weight', 'wt', 'grams', 'ounces', 'g', 'oz'],
    unit: ['unit', 'units', 'weight unit', 'uom', 'unit of measure'],
    url: ['url', 'link', 'product url', 'product link', 'website', 'web', 'buy link', 'purchase link', 'shop link'],
    price: ['price', 'cost', 'msrp', 'retail price'],
    worn: ['worn', 'is worn', 'wearing'],
    consumable: ['consumable', 'consumables', 'is consumable'],
    // One column saying worn / consumable / base, as some apps export.
    kind: ['type', 'weight type', 'weight class', 'carry type', 'kind'],
    // The heading a category sits under (Clothing over Base Layer...), as
    // Waymark exports it. Read after category: a sheet with only "Group"
    // means its categories.
    group: ['category group', 'group'],
};
const POSITIONAL = ['name', 'category', 'description', 'qty', 'weight', 'unit', 'url', 'price', 'worn', 'consumable'];

// The delimiter the first line uses most (outside quotes): , ; or tab.
export function sniffDelimiter(text) {
    const line = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).find((l) => l.trim()) || '';
    const counts = { ',': 0, ';': 0, '\t': 0 };
    let quoted = false;
    for (const c of line) {
        if (c === '"') quoted = !quoted;
        else if (!quoted && c in counts) counts[c]++;
    }
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return best[1] > 0 ? best[0] : ',';
}

// RFC 4180: quoted fields, doubled quotes, delimiters and newlines inside quotes.
export function parseCsv(text, delimiter = ',') {
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
        } else if (c === delimiter) {
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
    return Boolean(v) && !['0', 'false', 'no', 'n', '-'].includes(v);
}

// "1,234.5", or "1,5" in a file whose decimal mark is a comma.
function number(value, decimalComma = false) {
    let v = cell(value);
    v = decimalComma ? v.replace(/\./g, '').replace(',', '.') : v.replace(/,/g, '');
    const n = parseFloat(v.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : NaN;
}

/**
 * A weight cell: "21", "394 g", "13.9oz", "1 lb 4 oz", "1.2 kg".
 * Returns { value, unit } (unit null when the cell doesn't say), or null.
 */
export function readWeight(text, decimalComma = false) {
    const v = cell(text).toLowerCase();
    if (!v) return null;
    const lbOz = v.match(/^(\d+(?:[.,]\d+)?)\s*(?:lbs?|pounds?)\.?\s*(\d+(?:[.,]\d+)?)\s*(?:oz|ounces?)\.?$/);
    if (lbOz) {
        const oz = number(lbOz[1], decimalComma) * 16 + number(lbOz[2], decimalComma);
        return Number.isFinite(oz) ? { value: oz, unit: 'oz' } : null;
    }
    const m = v.match(/^(-?[\d.,]+)\s*([a-z.]*)$/);
    if (!m) return null;
    const value = number(m[1], decimalComma);
    if (!Number.isFinite(value)) return null;
    if (!m[2]) return { value, unit: null };
    const unit = unitOf(m[2]);
    return unit ? { value, unit } : null;
}

// "Weight (g)" -> { key: 'weight', unit: 'g' }
function readHeader(text) {
    const raw = cell(text).toLowerCase();
    const bracket = raw.match(/[([]\s*([a-z.]+)\s*[)\]]/);
    const key = raw.replace(/[([][^)\]]*[)\]]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
    return { key, unit: (bracket && unitOf(bracket[1])) || unitOf(key) };
}

function columnsFor(header) {
    const heads = header.map(readHeader);
    if (!heads.some((h) => HEADERS.name.includes(h.key))) return null;
    const cols = {};
    for (const [field, names] of Object.entries(HEADERS)) {
        // The first spelling that matches wins: "Item Name" over "Name".
        for (const n of names) {
            const at = heads.findIndex((h, i) => h.key === n && !Object.values(cols).includes(i));
            if (at > -1) {
                cols[field] = at;
                break;
            }
        }
    }
    if (cols.weight !== undefined && heads[cols.weight].unit) cols.weightUnit = heads[cols.weight].unit;
    return cols;
}

// The header names a file's columns were read from, for the preview.
const LABELS = { name: 'Name', brand: 'Brand', category: 'Category', description: 'Notes', qty: 'Qty', weight: 'Weight', unit: 'Unit', url: 'Link', price: 'Price', worn: 'Worn', consumable: 'Consumable', kind: 'Worn/consumable', group: 'Group' };

/**
 * → { name, description, categories: [{ name, items: [...] }], itemCount, skipped,
 *     columns: [{ field, label, from }], unitAssumed }
 * Each item: { name, description, qty, weightMg, unit, url, price, worn, consumable }.
 * `unit`: the unit for weights that don't say (default oz, as LighterPack).
 */
export function parseGearCsv(text, { name = '', unit: fallbackUnit = 'oz' } = {}) {
    const delimiter = sniffDelimiter(text);
    const decimalComma = delimiter === ';';
    const rows = parseCsv(text, delimiter).filter((r) => r.some((c) => cell(c)));
    let cols = null;
    if (rows.length) cols = columnsFor(rows[0]);
    const header = cols ? rows[0] : null;
    const body = cols ? rows.slice(1) : rows;
    if (!cols) cols = Object.fromEntries(POSITIONAL.map((k, i) => [k, i]));
    const defaultUnit = unitOf(fallbackUnit) || 'oz';

    const categories = [];
    const byName = new Map();
    let itemCount = 0;
    let skipped = 0;
    let unitAssumed = false;

    for (const r of body) {
        if (itemCount >= MAX_IMPORT_ROWS) {
            skipped++;
            continue;
        }
        const get = (key) => (cols[key] === undefined ? '' : r[cols[key]]);
        let itemName = cell(get('name'));
        const brand = cell(get('brand'));
        if (brand && !itemName.toLowerCase().includes(brand.toLowerCase())) itemName = `${brand} ${itemName}`.trim();
        itemName = itemName.slice(0, 200);
        const weight = readWeight(get('weight'), decimalComma);
        // The weight's own unit, else the unit column, else the header's.
        let unit = weight && weight.unit;
        if (!unit && cols.unit !== undefined) unit = unitOf(get('unit'));
        if (!unit && cols.unit === undefined) {
            unit = cols.weightUnit || defaultUnit;
            if (!cols.weightUnit && weight && weight.value > 0) unitAssumed = true;
        }
        if (!itemName || !unit || !weight || weight.value < 0) {
            skipped++;
            continue;
        }
        const qtyRaw = number(get('qty'), decimalComma);
        const qty = Number.isFinite(qtyRaw) && qtyRaw >= 0 ? Math.min(qtyRaw, 10000) : 1;
        const price = number(get('price'), decimalComma);
        const url = cell(get('url'));
        const kind = cell(get('kind')).toLowerCase();
        const categoryName = cell(get('category')).slice(0, 200) || 'Imported';

        let category = byName.get(categoryName.toLowerCase());
        if (!category) {
            category = { name: categoryName, items: [] };
            byName.set(categoryName.toLowerCase(), category);
            categories.push(category);
        }
        const groupName = cell(get('group')).slice(0, 100);
        if (groupName && !category.group) category.group = groupName;
        category.items.push({
            name: itemName,
            description: cell(get('description')).slice(0, 1000),
            qty,
            weightMg: Math.round(weightUtils.WeightToMg(weight.value, unit)),
            unit,
            url: /^https?:\/\//i.test(url) ? url.slice(0, 2000) : '',
            price: Number.isFinite(price) && price > 0 ? Math.round(price * 100) / 100 : 0,
            worn: flag(get('worn')) || /\bworn\b|wearing/.test(kind),
            consumable: flag(get('consumable')) || /consum/.test(kind),
        });
        itemCount++;
    }

    const columns = header
        ? Object.keys(LABELS).filter((f) => cols[f] !== undefined).map((f) => ({ field: f, label: LABELS[f], from: cell(header[cols[f]]) }))
        : [];
    return { name: String(name).slice(0, 200), description: '', categories, itemCount, skipped, columns, unitAssumed };
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
