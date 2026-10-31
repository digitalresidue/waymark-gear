// Where to buy: the shops besides a catalog item's own product link.
//
// An item has up to MAX_SHOPS shops, stored on it (catalog_items.shops) as
// [{ name, domain, url, affiliate_url }]. A shop's badge is kept once per
// website in shop_badges, so Backcountry's badge serves every item it sells.
// Badges given in the editor or the import sheet are copied here (never
// hotlinked); a shop without one gets its own site icon, fetched once, or a
// letter tile when it has none we can use.

import knex from './db.js';
import { copyRemoteImage, isLocalImage, localImagePath, RemoteImageError } from './remote-image.js';

export const MAX_SHOPS = 4;
export const SHOP_CSV_COLUMNS = Array.from({ length: MAX_SHOPS }, (_, i) => [
    `shop${i + 1}_name`, `shop${i + 1}_badge`, `shop${i + 1}_url`, `shop${i + 1}_affiliate_url`,
]).flat();

const http = /^https?:\/\/[^\s]+$/i;

export function domainOf(url) {
    try {
        return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
        return '';
    }
}

/**
 * Shops from an editor form ({ shops: [{ name, badge, url, affiliateUrl }] })
 * or an import row (shopN_name, shopN_badge, shopN_url, shopN_affiliate_url).
 * Returns { shops, badges, errors }; shops is undefined when the input says
 * nothing about shops (a sheet without the columns keeps what's there).
 */
export function parseShops(input, productUrl = '') {
    let raw;
    if (Array.isArray(input.shops)) {
        raw = input.shops;
    } else if (SHOP_CSV_COLUMNS.some((c) => c in input)) {
        raw = Array.from({ length: MAX_SHOPS }, (_, i) => ({
            name: input[`shop${i + 1}_name`],
            badge: input[`shop${i + 1}_badge`],
            url: input[`shop${i + 1}_url`],
            affiliateUrl: input[`shop${i + 1}_affiliate_url`],
        }));
    } else {
        return { shops: undefined, badges: [], errors: [] };
    }
    const errors = [];
    const shops = [];
    const badges = [];
    const seen = new Set([domainOf(productUrl)].filter(Boolean));
    raw.forEach((s, i) => {
        const str = (v, max) => String(v ?? '').trim().slice(0, max);
        const name = str(s && s.name, 60);
        const url = str(s && s.url, 2000);
        const affiliateUrl = str(s && (s.affiliateUrl ?? s.affiliate_url), 2000);
        // Our own copy (its path, or its full link on this site) stays as is.
        const rawBadge = str(s && s.badge, 2000);
        const badge = localImagePath(rawBadge) || rawBadge;
        if (!name && !url && !affiliateUrl && !badge) return;
        const n = i + 1;
        if (!url) {
            errors.push(`shop ${n}: add the shop's normal link (shop${n}_url); Supporters get that one`);
            return;
        }
        if (!http.test(url)) errors.push(`shop${n}_url must start with http:// or https://`);
        if (affiliateUrl && !/^https:\/\/[^\s]+$/i.test(affiliateUrl)) errors.push(`shop${n}_affiliate_url must start with https://`);
        if (badge && !http.test(badge) && !isLocalImage(badge)) errors.push(`shop${n}_badge must be a link to an image`);
        const domain = domainOf(url);
        if (seen.has(domain)) errors.push(`shop ${n}: ${domain} is already listed for this item`);
        seen.add(domain);
        shops.push({ name, domain, url, affiliate_url: affiliateUrl });
        if (badge || name) badges.push({ domain, name, badge });
    });
    if (shops.length > MAX_SHOPS) errors.push(`at most ${MAX_SHOPS} shops besides the product link`);
    return { shops: shops.slice(0, MAX_SHOPS), badges, errors };
}

/** Stored shops -> what the owner's API sees (affiliate links included). */
export const shopsToApi = (shops) => (shops || []).map((s) => ({
    name: s.name || '', domain: s.domain, url: s.url, affiliateUrl: s.affiliate_url || '',
}));

/** What anyone may see: no affiliate links. */
export const publicShops = (shops) => (shops || []).map(({ affiliateUrl, ...rest }) => rest); // eslint-disable-line no-unused-vars

// ---- badges ---------------------------------------------------------------

/** domain -> { name, badgeUrl } for the given domains. */
export async function badgesFor(domains) {
    const list = [...new Set(domains.filter(Boolean))];
    if (!list.length) return new Map();
    const rows = await knex('shop_badges').whereIn('domain', list);
    return new Map(rows.map((r) => [r.domain, { name: r.name, badgeUrl: r.badge_url }]));
}

/**
 * Save badges and names given for shops. Badge links are copied here first;
 * one that can't be fetched is reported and the shop keeps its old badge.
 */
export async function saveBadges(badges, { log = () => {} } = {}) {
    const failed = [];
    for (const b of badges) {
        let badgeUrl;
        if (b.badge) {
            try {
                badgeUrl = isLocalImage(b.badge) ? b.badge : (await copyRemoteImage(b.badge, 'site')).imageUrl;
            } catch (err) {
                failed.push({ domain: b.domain, error: err instanceof RemoteImageError ? err.message : 'Couldn\'t copy it.' });
                if (!(err instanceof RemoteImageError)) log(err);
            }
        }
        const row = { domain: b.domain, updated_at: knex.fn.now() };
        if (b.name) row.name = b.name;
        if (badgeUrl) row.badge_url = badgeUrl;
        await knex('shop_badges').insert({ name: '', badge_url: '', ...row }).onConflict('domain').merge(Object.keys(row));
    }
    return failed;
}

/**
 * Shops with no badge yet: try their own site icon (once a week at most),
 * so the Where to buy menu isn't all letter tiles.
 */
export async function fetchMissingBadges(domains, { log = () => {} } = {}) {
    const list = [...new Set(domains.filter(Boolean))];
    if (!list.length) return;
    const known = await knex('shop_badges').whereIn('domain', list);
    const byDomain = new Map(known.map((r) => [r.domain, r]));
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const domain of list) {
        const row = byDomain.get(domain);
        if (row && (row.badge_url || new Date(row.updated_at).getTime() > weekAgo)) continue;
        let badgeUrl = '';
        for (const path of ['/apple-touch-icon.png', '/apple-touch-icon-precomposed.png', '/favicon.png']) {
            try {
                badgeUrl = (await copyRemoteImage(`https://${domain}${path}`, 'site')).imageUrl;
                break;
            } catch (err) {
                if (!(err instanceof RemoteImageError)) log(err);
            }
        }
        await knex('shop_badges').insert({ domain, name: '', badge_url: badgeUrl, updated_at: knex.fn.now() })
            .onConflict('domain').merge({ badge_url: badgeUrl, updated_at: knex.fn.now() });
    }
}

// ---- the Where to buy menu --------------------------------------------------

const initialOf = (s) => (String(s || '').replace(/^www\./, '').charAt(0) || '?').toUpperCase();

/**
 * Everywhere to buy an item, for a page: the product link first, then its
 * shops. Each has the index /go/:id?shop= takes (0 is the product link).
 */
export function buyOptions(item, badges) {
    const out = [];
    if (item.url) {
        const domain = domainOf(item.url);
        const b = badges.get(domain) || {};
        out.push({ index: 0, name: b.name || item.brand || domain, domain, badgeUrl: b.badgeUrl || '', initial: initialOf(b.name || item.brand || domain) });
    }
    (item.shops || []).forEach((s, i) => {
        const b = badges.get(s.domain) || {};
        const name = s.name || b.name || s.domain;
        out.push({ index: i + 1, name, domain: s.domain, badgeUrl: b.badgeUrl || '', initial: initialOf(name) });
    });
    return out;
}
