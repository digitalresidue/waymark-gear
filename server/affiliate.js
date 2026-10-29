// Affiliate links for catalog gear (Phase 7).
//
// Every "Buy" link goes through /go/:catalogId. At click time it picks:
//   - Supporters: the plain product link, always;
//   - everyone else: the item's own affiliate link if the owner set one,
//     else the product link with the site-wide rule for its shop applied
//     (e.g. amazon.com gets tag=yourtag-20), else the plain link.
// Clicks are counted per item per day, so the owner can see what earns.
// Affiliate links never change which gear is suggested or how it's ranked.

import express from 'express';

import knex from './db.js';
import { isUuid } from './catalog.js';
import { optionalUser, authenticateAdmin } from './auth.js';
import { isSupporter } from './billing.js';
import { logWithRequest } from './log.js';

const router = express.Router();
const SOURCES = ['gear', 'compare', 'list', 'insights', 'review', ''];
const CACHE_MS = 60 * 1000;
let cached = null;

export const DEFAULT_SETTINGS = { enabled: true, rules: [] };

export function cleanSettings(input = {}) {
    const rules = (Array.isArray(input.rules) ? input.rules : []).slice(0, 30).map((r) => ({
        domain: String(r.domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').slice(0, 100),
        param: String(r.param || '').trim().slice(0, 40),
        value: String(r.value || '').trim().slice(0, 200),
    })).filter((r) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(r.domain) && /^[A-Za-z0-9_.-]+$/.test(r.param) && r.value);
    return { enabled: input.enabled !== false, rules };
}

export async function getSettings() {
    if (cached && cached.at > Date.now() - CACHE_MS) return cached.value;
    const row = await knex('site_settings').where({ key: 'affiliate' }).first();
    const value = row ? cleanSettings(row.value) : DEFAULT_SETTINGS;
    cached = { at: Date.now(), value };
    return value;
}

export async function saveSettings(input) {
    const value = cleanSettings(input);
    await knex('site_settings').insert({ key: 'affiliate', value: JSON.stringify(value), updated_at: knex.fn.now() })
        .onConflict('key').merge();
    cached = null;
    return value;
}

// The product link with the shop's rule applied, or null if no rule fits.
export function applyRules(url, rules) {
    let u;
    try {
        u = new URL(url);
    } catch {
        return null;
    }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const rule = rules.find((r) => host === r.domain || host.endsWith(`.${r.domain}`));
    if (!rule) return null;
    u.searchParams.set(rule.param, rule.value);
    return u.toString();
}

// { url, affiliate } for this catalog row and reader.
export function destination(row, settings, supporter) {
    const plain = row.url || '';
    if (supporter || !settings.enabled) return { url: plain, affiliate: false };
    if (row.affiliate_url) return { url: row.affiliate_url, affiliate: true };
    const ruled = plain ? applyRules(plain, settings.rules) : null;
    return ruled ? { url: ruled, affiliate: true } : { url: plain, affiliate: false };
}

router.get('/go/:id', async (req, res) => {
    const id = String(req.params.id);
    res.set('Cache-Control', 'private, no-store');
    res.set('X-Robots-Tag', 'noindex, nofollow');
    if (!isUuid(id)) return res.status(404).send('No such gear.');
    try {
        const item = await knex('catalog_items').where({ id, status: 'published' }).first('id', 'url', 'affiliate_url', 'shops');
        if (!item) return res.status(404).send('No such gear.');
        // ?shop=N: one of the item's other shops (Where to buy); 0 or none is
        // the product link. Same affiliate rule for each.
        const n = Number(req.query.shop);
        const shop = Number.isInteger(n) && n >= 1 ? (item.shops || [])[n - 1] : null;
        if (req.query.shop && n >= 1 && !shop) return res.redirect(302, `/g/${id}`);
        const row = shop ? { url: shop.url, affiliate_url: shop.affiliate_url } : item;
        const viewer = await optionalUser(req);
        const { url, affiliate } = destination(row, await getSettings(), isSupporter(viewer));
        if (!/^https?:\/\//i.test(url)) return res.redirect(302, `/g/${id}`);
        const source = SOURCES.includes(req.query.from) ? req.query.from : '';
        knex('outbound_clicks').insert({ catalog_id: id, source, affiliate, shop: shop ? shop.domain : '', clicks: 1 })
            .onConflict(['catalog_id', 'day', 'source', 'affiliate', 'shop'])
            .merge({ clicks: knex.raw('outbound_clicks.clicks + 1') })
            .catch((err) => logWithRequest(req, { message: 'click count failed', err }));
        res.set('Referrer-Policy', 'no-referrer-when-downgrade');
        res.redirect(302, url);
    } catch (err) {
        logWithRequest(req, { message: 'outbound link error', err });
        res.status(500).send('An error occurred.');
    }
});

// For the owner: clicks per item over the last `days` days.
export async function clickReport(days = 30) {
    const since = new Date(Date.now() - Math.min(Math.max(Number(days) || 30, 1), 365) * 86400000).toISOString().slice(0, 10);
    const rows = await knex('outbound_clicks as o').join('catalog_items as c', 'c.id', 'o.catalog_id')
        .where('o.day', '>=', since)
        .groupBy('c.id', 'c.name', 'c.brand')
        .select('c.id', 'c.name', 'c.brand',
            knex.raw('sum(o.clicks)::int as clicks'),
            knex.raw('sum(case when o.affiliate then o.clicks else 0 end)::int as affiliate_clicks'))
        .orderBy('clicks', 'desc')
        .limit(100);
    const total = rows.reduce((n, r) => n + r.clicks, 0);
    const affiliate = rows.reduce((n, r) => n + r.affiliate_clicks, 0);
    return { since, total, affiliate, items: rows.map((r) => ({ id: r.id, name: [r.brand, r.name].filter(Boolean).join(' '), clicks: r.clicks, affiliateClicks: r.affiliate_clicks })) };
}

const admin = (handler) => (req, res) => authenticateAdmin(req, res, async (req, res, user) => {
    try {
        await handler(req, res, user);
    } catch (err) {
        logWithRequest(req, { message: 'affiliate admin error', err });
        if (!res.headersSent) res.status(500).json({ message: 'An error occurred.' });
    }
});

router.get('/api/admin/affiliate', admin(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ settings: await getSettings(), clicks: await clickReport(req.query.days) });
}));

router.put('/api/admin/affiliate', admin(async (req, res) => {
    if (!req.is('application/json')) return res.status(415).json({ message: 'Send JSON.' });
    res.json({ settings: await saveSettings(req.body || {}) });
}));

export default router;
