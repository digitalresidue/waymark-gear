// Referral report per brand, for the owner to send to brands: how many
// visitors Waymark Gear sent them in a calendar month, to which products,
// from which parts of the site. Built from the per-day click counts that
// /go/:id (product links) and /go/brand/:id (brand sites) already keep.

import knex from './db.js';

// Where on the site a buy click came from, as a brand would read it.
export const SOURCE_LABELS = {
    gear: 'gear pages',
    list: 'shared gear lists',
    compare: 'side-by-side comparisons',
    insights: 'lighter-option suggestions',
    review: 'gear reviews',
    '': 'other pages',
    brand: 'their brand page',
};

const brandKey = (name) => String(name || '').trim().toLowerCase();

// "2026-10" -> { from: '2026-10-01', to: '2026-11-01', label: 'October 2026' }.
// Anything else -> last month.
export function monthRange(month, now = new Date()) {
    let y;
    let m;
    const match = /^(\d{4})-(\d{2})$/.exec(String(month || ''));
    if (match && Number(match[2]) >= 1 && Number(match[2]) <= 12) {
        y = Number(match[1]);
        m = Number(match[2]) - 1;
    } else {
        y = now.getUTCFullYear();
        m = now.getUTCMonth() - 1;
        if (m < 0) {
            m = 11;
            y -= 1;
        }
    }
    const from = new Date(Date.UTC(y, m, 1));
    const to = new Date(Date.UTC(y, m + 1, 1));
    const iso = (d) => d.toISOString().slice(0, 10);
    return {
        month: iso(from).slice(0, 7),
        from: iso(from),
        to: iso(to),
        label: from.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    };
}

// The last `n` months, newest first, for the month picker.
export function recentMonths(n = 12, now = new Date()) {
    const out = [];
    for (let i = 0; i < n; i++) {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
        out.push(monthRange(d.toISOString().slice(0, 7)));
    }
    return out.map(({ month, label }) => ({ month, label }));
}

const listing = (parts) => (parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);
const plural = (n, one, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

// One paragraph the owner can paste into an email.
export function summaryText(brand, period, site = 'Waymark Gear') {
    if (!brand.total) return `${site} didn't send ${brand.name} any visitors in ${period.label}.`;
    const parts = [];
    if (brand.productVisits) parts.push(`${plural(brand.productVisits, 'visit')} to product pages`);
    if (brand.siteVisits) parts.push(`${plural(brand.siteVisits, 'visit')} to ${brand.name}'s own site`);
    let text = `${site} sent ${brand.name} ${plural(brand.total, 'visitor')} in ${period.label}: ${listing(parts)}.`;
    const top = brand.items.slice(0, 3).map((i) => `${i.name} (${i.clicks})`);
    if (top.length) text += ` Most clicked: ${listing(top)}.`;
    const from = brand.sources.slice(0, 2).map((s) => s.label);
    if (from.length) text += ` Most came from ${listing(from)}.`;
    return text;
}

export async function brandReport(month, db = knex) {
    const period = monthRange(month);
    const items = await db('outbound_clicks as o').join('catalog_items as c', 'c.id', 'o.catalog_id')
        .where('o.day', '>=', period.from).where('o.day', '<', period.to)
        .whereRaw("coalesce(c.brand, '') <> ''")
        .groupBy('c.id', 'c.name', 'c.brand', 'o.source')
        .select('c.id', 'c.name', 'c.brand', 'o.source',
            db.raw('sum(o.clicks)::int as clicks'),
            db.raw('sum(case when o.affiliate then 0 else o.clicks end)::int as tagged'));
    const sites = await db('brand_clicks as b').join('brands as r', 'r.id', 'b.brand_id')
        .where('b.day', '>=', period.from).where('b.day', '<', period.to)
        .groupBy('r.id', 'r.name')
        .select('r.id', 'r.name', db.raw('sum(b.clicks)::int as clicks'),
            db.raw('sum(case when b.affiliate then 0 else b.clicks end)::int as tagged'));
    const known = await db('brands').select('id', 'name', 'url');

    const byKey = new Map();
    const entry = (name) => {
        const key = brandKey(name);
        if (!byKey.has(key)) {
            const page = known.find((b) => brandKey(b.name) === key);
            byKey.set(key, {
                name: page ? page.name : String(name).trim(), brandId: page ? page.id : null, url: page ? page.url : '',
                total: 0, productVisits: 0, siteVisits: 0, tagged: 0, items: new Map(), sources: new Map(),
            });
        }
        return byKey.get(key);
    };
    for (const r of items) {
        const b = entry(r.brand);
        b.productVisits += r.clicks;
        b.tagged += r.tagged;
        const it = b.items.get(r.id) || { id: r.id, name: r.name, clicks: 0 };
        it.clicks += r.clicks;
        b.items.set(r.id, it);
        b.sources.set(r.source || '', (b.sources.get(r.source || '') || 0) + r.clicks);
    }
    for (const r of sites) {
        const b = entry(r.name);
        b.siteVisits += r.clicks;
        b.tagged += r.tagged;
        b.sources.set('brand', (b.sources.get('brand') || 0) + r.clicks);
    }
    const brands = [...byKey.values()].map((b) => {
        const out = {
            ...b,
            total: b.productVisits + b.siteVisits,
            items: [...b.items.values()].sort((x, y) => y.clicks - x.clicks),
            sources: [...b.sources.entries()].map(([key, clicks]) => ({ key, label: SOURCE_LABELS[key] || SOURCE_LABELS[''], clicks }))
                .sort((x, y) => y.clicks - x.clicks),
        };
        out.summary = summaryText(out, period);
        return out;
    }).sort((x, y) => y.total - x.total || x.name.localeCompare(y.name));
    return { period, months: recentMonths(), brands };
}
