// The Brands directory (/brands): gear makers people can browse by name,
// cottage or not, and what they make. The site owner keeps it at
// Owner → Brands. A brand's "Visit" link goes through /go/brand/:id, which
// picks the affiliate link the same way catalog Buy buttons do
// (server/affiliate.js): Supporters always get the plain link.

import express from 'express';

import knex from './db.js';
import { GEAR_TYPE_IDS } from '../client/brand-types.js';
import { optionalUser, authenticateAdmin } from './auth.js';
import { destination, getSettings } from './affiliate.js';
import { isSupporter } from './billing.js';
import { isUuid } from './catalog.js';
import { logWithRequest } from './log.js';
import { copyRemoteImage, isLocalImage, localImagePath, RemoteImageError } from './remote-image.js';

const router = express.Router();

const LIMITS = { name: 80, description: 300, url: 2000, country: 40 };

const httpUrl = (v) => {
    const s = String(v || '').trim();
    if (!s) return '';
    try {
        const u = new URL(s);
        return /^https?:$/.test(u.protocol) ? u.toString() : null;
    } catch {
        return null;
    }
};

// Uploaded logos live under /userimages; pasted links are copied there on
// save (server/remote-image.js).
const logoUrl = (v) => {
    const s = String(v || '').trim();
    if (!s) return '';
    if (/^\/userimages\/[\w/.-]+$/.test(s)) return s;
    // Our own copy by its full link: kept, not fetched again.
    const own = localImagePath(s);
    if (own && /^\/userimages\/[\w/.-]+$/.test(own)) return own;
    return httpUrl(s);
};

export function slugify(name) {
    return String(name).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'brand';
}

// Owner input -> a row, or { error }.
export function cleanBrand(input = {}) {
    const name = String(input.name || '').trim().slice(0, LIMITS.name);
    if (!name) return { error: 'A brand needs a name.' };
    const url = httpUrl(input.url);
    if (url === null) return { error: 'The website must be an http(s) link.' };
    const affiliateUrl = httpUrl(input.affiliateUrl);
    if (affiliateUrl === null) return { error: 'The affiliate link must be an http(s) link.' };
    if (affiliateUrl && !url) return { error: 'Add the brand\'s own website too: Supporters, and anyone when affiliate links are off, go there.' };
    const logo = logoUrl(input.logoUrl);
    if (logo === null) return { error: 'The logo must be uploaded, or a link to an image.' };
    const types = [...new Set((Array.isArray(input.gearTypes) ? input.gearTypes : []).map(String))];
    const unknown = types.find((t) => !GEAR_TYPE_IDS.has(t));
    if (unknown) return { error: `Unknown gear type: ${unknown}.` };
    return {
        row: {
            name,
            description: String(input.description || '').trim().replace(/\s+/g, ' ').slice(0, LIMITS.description),
            logo_url: logo,
            url,
            affiliate_url: affiliateUrl,
            cottage: Boolean(input.cottage),
            gear_types: types,
            country: String(input.country || '').trim().slice(0, LIMITS.country),
            status: input.status === 'published' ? 'published' : 'draft',
        },
    };
}

export const brandEntry = (r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    logoUrl: r.logo_url,
    url: r.url,
    affiliateUrl: r.affiliate_url,
    cottage: r.cottage,
    gearTypes: r.gear_types || [],
    country: r.country,
    status: r.status,
});

async function uniqueSlug(name, exceptId) {
    const base = slugify(name);
    for (let n = 1; n < 100; n++) {
        const slug = n === 1 ? base : `${base}-${n}`;
        const q = knex('brands').where({ slug });
        if (exceptId) q.whereNot({ id: exceptId });
        if (!(await q.first('id'))) return slug;
    }
    return `${base}-${Date.now().toString(36)}`;
}

export async function publishedBrands() {
    return knex('brands').where({ status: 'published' }).orderByRaw('lower(name)');
}

// The public page's filters; the same rules run in the browser
// (client/social.js, initBrands) so filtering doesn't reload the page.
export function matchesBrand(b, { q = '', cottage = false, type = '' } = {}) {
    if (cottage && !b.cottage) return false;
    if (type && !(b.gear_types || b.gearTypes || []).includes(type)) return false;
    const needle = String(q).trim().toLowerCase();
    return !needle || b.name.toLowerCase().includes(needle);
}

const admin = (handler) => (req, res) => authenticateAdmin(req, res, async (req, res, user) => {
    try {
        await handler(req, res, user);
    } catch (err) {
        logWithRequest(req, { message: 'brands admin error', err });
        if (!res.headersSent) res.status(500).json({ message: 'An error occurred.' });
    }
});

router.get('/api/admin/brands', admin(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const rows = await knex('brands').orderByRaw('lower(name)');
    const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const clicks = await knex('brand_clicks').where('day', '>=', since).groupBy('brand_id')
        .select('brand_id', knex.raw('sum(clicks)::int as clicks'));
    const byId = new Map(clicks.map((c) => [c.brand_id, c.clicks]));
    res.json({ brands: rows.map((r) => ({ ...brandEntry(r), clicks30: byId.get(r.id) || 0 })) });
}));

// A pasted logo link is copied here before saving, so the directory never
// loads it from the brand's own site.
async function localizeLogo(row) {
    if (!row.logo_url || isLocalImage(row.logo_url)) return null;
    try {
        row.logo_url = (await copyRemoteImage(row.logo_url, 'site')).imageUrl;
        return null;
    } catch (err) {
        if (err instanceof RemoteImageError) return `Couldn't copy the logo: ${err.message}`;
        throw err;
    }
}

router.post('/api/admin/brands', admin(async (req, res) => {
    const { row, error } = cleanBrand(req.body);
    if (error) return res.status(400).json({ message: error });
    const logoError = await localizeLogo(row);
    if (logoError) return res.status(400).json({ message: logoError });
    const dupe = await knex('brands').whereRaw('lower(name) = lower(?)', [row.name]).first('id');
    if (dupe) return res.status(409).json({ message: `${row.name} is already in the directory.` });
    const [created] = await knex('brands').insert({ ...row, slug: await uniqueSlug(row.name) }).returning('*');
    res.status(201).json({ brand: brandEntry(created) });
}));

router.put('/api/admin/brands/:id', admin(async (req, res) => {
    const { id } = req.params;
    if (!isUuid(id)) return res.status(404).json({ message: 'No such brand.' });
    const { row, error } = cleanBrand(req.body);
    if (error) return res.status(400).json({ message: error });
    const logoError = await localizeLogo(row);
    if (logoError) return res.status(400).json({ message: logoError });
    const dupe = await knex('brands').whereRaw('lower(name) = lower(?)', [row.name]).whereNot({ id }).first('id');
    if (dupe) return res.status(409).json({ message: `${row.name} is already in the directory.` });
    const [updated] = await knex('brands').where({ id })
        .update({ ...row, slug: await uniqueSlug(row.name, id), updated_at: knex.fn.now() }).returning('*');
    if (!updated) return res.status(404).json({ message: 'No such brand.' });
    res.json({ brand: brandEntry(updated) });
}));

router.delete('/api/admin/brands/:id', admin(async (req, res) => {
    const { id } = req.params;
    if (!isUuid(id)) return res.status(404).json({ message: 'No such brand.' });
    await knex('brands').where({ id }).del();
    res.json({ ok: true });
}));

router.get('/go/brand/:id', async (req, res) => {
    const id = String(req.params.id);
    res.set('Cache-Control', 'private, no-store');
    res.set('X-Robots-Tag', 'noindex, nofollow');
    if (!isUuid(id)) return res.status(404).send('No such brand.');
    try {
        const row = await knex('brands').where({ id, status: 'published' }).first('id', 'url', 'affiliate_url');
        if (!row) return res.status(404).send('No such brand.');
        const viewer = await optionalUser(req);
        const { url, affiliate } = destination(row, await getSettings(), isSupporter(viewer));
        if (!/^https?:\/\//i.test(url)) return res.redirect(302, '/brands');
        knex('brand_clicks').insert({ brand_id: id, affiliate, clicks: 1 })
            .onConflict(['brand_id', 'day', 'affiliate'])
            .merge({ clicks: knex.raw('brand_clicks.clicks + 1') })
            .catch((err) => logWithRequest(req, { message: 'brand click count failed', err }));
        res.set('Referrer-Policy', 'no-referrer-when-downgrade');
        res.redirect(302, url);
    } catch (err) {
        logWithRequest(req, { message: 'brand link error', err });
        res.status(500).send('An error occurred.');
    }
});

export default router;
