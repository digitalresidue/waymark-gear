// Reading a PackWizard list. A share link (packwizard.com/s/<id>) is backed
// by a public JSON endpoint, /api/packs/getSharedPackWithId?shareableId=<id>,
// which the server fetches (server/import-links.js); this turns that JSON
// into the same shape parseGearCsv returns, so the rest of the import is the
// same as for LighterPack.
//
// The JSON, as PackWizard serves it:
//   { packName, packDescription, tableData: [
//       { title, subtitle, defaultCategory, rows: { <rowId>: {
//           item, brand, description, weight, unit (g|kg|oz|lb), quantity,
//           price, url, affiliateLink, imageUrl, weightType (0 base, 1 worn, 2 consumable) } } } ] }

import weightUtils from './weight.js';
import { MAX_IMPORT_ROWS } from './lighterpack-import.js';

const UNITS = { g: 'g', kg: 'kg', oz: 'oz', lb: 'lb', lbs: 'lb' };
const str = (v, max) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, max) : '');
const http = (v) => (/^https?:\/\/[^\s]+$/i.test(str(v, 2000)) ? str(v, 2000) : '');

// packwizard.com/s/AbC123x, with or without scheme or www. Returns the id or
// null. `host` lets tests point elsewhere.
export function packWizardId(input, host = 'packwizard.com') {
    const raw = String(input || '').trim();
    if (!raw) return null;
    let url;
    try {
        url = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
    } catch {
        return null;
    }
    if (url.host.toLowerCase().replace(/^www\./, '') !== host.toLowerCase().replace(/^www\./, '')) return null;
    const m = url.pathname.match(/^\/s\/([A-Za-z0-9_-]{3,40})\/?$/);
    return m ? m[1] : null;
}

/** PackWizard JSON → { name, description, categories, itemCount, skipped } (plus imageUrl on items). */
export function packWizardToList(data) {
    if (!data || typeof data !== 'object' || !Array.isArray(data.tableData)) return null;
    const categories = [];
    let itemCount = 0;
    let skipped = 0;
    for (const table of data.tableData) {
        if (!table || typeof table !== 'object') continue;
        const rows = table.rows && typeof table.rows === 'object' ? Object.values(table.rows) : [];
        const category = { name: str(table.title, 200) || str(table.defaultCategory, 200) || 'Imported', items: [] };
        for (const row of rows) {
            if (itemCount >= MAX_IMPORT_ROWS) {
                skipped++;
                continue;
            }
            if (!row || typeof row !== 'object') continue;
            let name = str(row.item, 200);
            const brand = str(row.brand, 100);
            if (brand && !name.toLowerCase().includes(brand.toLowerCase())) name = `${brand} ${name}`.trim().slice(0, 200);
            const unit = UNITS[str(row.unit, 10).toLowerCase()];
            const weight = Number(row.weight);
            if (!name || !unit || !Number.isFinite(weight) || weight < 0) {
                skipped++;
                continue;
            }
            const qty = Number(row.quantity);
            const price = Number(row.price);
            category.items.push({
                name,
                description: str(row.description, 1000),
                qty: Number.isFinite(qty) && qty >= 0 ? Math.min(qty, 10000) : 1,
                weightMg: Math.round(weightUtils.WeightToMg(weight, unit)),
                unit,
                url: http(row.url),
                price: Number.isFinite(price) && price > 0 ? Math.round(price * 100) / 100 : 0,
                worn: row.weightType === 1,
                consumable: row.weightType === 2,
                imageUrl: http(row.imageUrl),
            });
            itemCount++;
        }
        if (category.items.length) categories.push(category);
    }
    return {
        name: str(data.packName, 200) || 'Imported from PackWizard',
        description: str(data.packDescription, 2000),
        categories,
        itemCount,
        skipped,
    };
}
