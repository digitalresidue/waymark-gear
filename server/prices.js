// Catalog price history and wishlist price-drop alerts (Phase 7).
//
// Whenever the owner changes a catalog price (by hand or by CSV import), the
// new price is added to that item's history. When it's lower than before,
// everyone with the item on their wishlist gets a notification.

import knex from './db.js';
import { isUuid } from './catalog.js';
import { notify, sendNotificationEmails } from './notify.js';
import { logger } from './log.js';

export async function recordPrices(ids) {
    const list = [...new Set((ids || []).filter(isUuid))];
    if (!list.length) return [];
    const items = await knex('catalog_items').whereIn('id', list).whereNotNull('price').select('id', 'name', 'brand', 'price', 'currency');
    if (!items.length) return [];
    const last = await knex('catalog_price_history as h')
        .whereIn('h.catalog_id', items.map((i) => i.id))
        .distinctOn('h.catalog_id')
        .orderBy([{ column: 'h.catalog_id' }, { column: 'h.recorded_at', order: 'desc' }, { column: 'h.id', order: 'desc' }])
        .select('h.catalog_id', 'h.price');
    const before = new Map(last.map((r) => [r.catalog_id, Number(r.price)]));
    const changed = items.filter((i) => before.get(i.id) !== Number(i.price));
    if (!changed.length) return [];
    await knex('catalog_price_history').insert(changed.map((i) => ({ catalog_id: i.id, price: i.price, currency: i.currency || 'USD' })));
    const drops = changed.filter((i) => before.has(i.id) && Number(i.price) < before.get(i.id))
        .map((i) => ({ ...i, was: before.get(i.id) }));
    if (drops.length) await alertDrops(drops).catch((err) => logger.error({ message: 'price alert failed', err: { message: err.message } }));
    return changed.map((i) => i.id);
}

const money = (n, currency) => `${!currency || currency === 'USD' ? '$' : `${currency} `}${Number(n).toFixed(2).replace(/\.00$/, '')}`;

async function alertDrops(drops) {
    const wanted = await knex('gear_items').whereIn('catalog_id', drops.map((d) => d.id))
        .where({ wishlist: true, retired: false }).distinct('user_id', 'catalog_id');
    if (!wanted.length) return;
    const byId = new Map(drops.map((d) => [d.id, d]));
    const jobs = await knex.transaction((trx) => notify(trx, wanted.map((w) => {
        const d = byId.get(w.catalog_id);
        const name = [d.brand, d.name].filter(Boolean).join(' ');
        return {
            recipientId: w.user_id,
            kind: 'price',
            actor: 'waymark',
            listName: `${name}: ${money(d.price, d.currency)} (was ${money(d.was, d.currency)})`,
            url: `/g/${d.id}`,
        };
    })));
    sendNotificationEmails(jobs);
}

export async function priceHistory(catalogId, limit = 60) {
    if (!isUuid(catalogId)) return [];
    const rows = await knex('catalog_price_history').where({ catalog_id: catalogId })
        .orderBy([{ column: 'recorded_at', order: 'desc' }, { column: 'id', order: 'desc' }]).limit(limit);
    return rows.reverse().map((r) => ({ price: Number(r.price), currency: r.currency, at: r.recorded_at }));
}
