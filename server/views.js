import path from 'path';
import fs from 'fs';
import express from 'express';
import Mustache from 'mustache';
import { Marked } from 'marked';
import { analyticsMeta, applyAnalyticsBlocks } from './analytics.js';
import { thumbnailUrl } from './images.js';
import config from 'config';
import { logWithRequest, logger } from './log.js';
import weightUtils from '../client/utils/weight.js';
import { specRows, specTypeFor } from '../client/utils/gear-specs.js';
import { marked, isSafeHref } from '../client/utils/markdown.js';
import { Library } from '../client/dataTypes.js';
import { listToCsv } from './csv.js';
import { applyCatalog } from './catalog.js';
import { libraryForExternalId } from './library-store.js';
import { WEIGHT_CLASSES, weightClassFor } from './kits.js';
import knex from './db.js';
import { formatWeightMg } from '../client/utils/format.js';
import { publicProfile, publicGear } from './profiles.js';
import { youTubeId, TRIP_TYPE_LABELS } from '../client/utils/gear-meta.js';
import { listImage, listImageVersion, profileImage, profileImageVersion } from './og.js';
import { cachedPage, storePage, sendCachedPage, NONCE_PLACEHOLDER } from './page-cache.js';
import { optionalUser } from './auth.js';
import { viewTrip, tripsOnProfile } from './trips.js';
import { reviewsFor, latestReviews } from './reviews.js';
import { getById as catalogItem, isUuid, search as catalogSearch, categories as catalogCategories, toApi as catalogToApi } from './catalog.js';
import {
    exploreIndex, resolveSection, filterItem, facetsFor, readFilters, matchesFilters, sortItems, rangeLabel, formatWeightG, activeFilterCount,
} from '../client/utils/explore.js';
import { priceHistory } from './prices.js';
import * as trails from './trails.js';
import { badgesFor, buyOptions } from './shops.js';
import { publishedBrands, matchesBrand } from './brands.js';
import { ensureSitemap, sitemapFile } from './sitemap.js';
import { GEAR_TYPES, GEAR_TYPE_IDS, gearTypeLabel } from '../client/brand-types.js';
import { PACK_FEATURES, DIRECTIONS } from '../client/utils/trails.js';
import { ratingsFor } from './reviews.js';
import { renderPage } from './site-chrome.js';

const router = express.Router();


const templates = {};
let shareTemplate = '';
let embedTemplate = '';
let embedJTemplate = '';
// Absolute, unlike the style links: the embed runs on another origin.
const embedScriptUrls = [];

const vueRoutes = [ /* TODO - get this from same data source as Vue */
    { path: '/' },
    { path: '/signin' },
    { path: '/signin/reset-password' },
    { path: '/signin/forgot-username' },
    { path: '/pack' },
    { path: '/plan/:owner/:listId' },
    { path: '/profile' },
    { path: '/notifications' },
    { path: '/leaderboard' },
    { path: '/print' },
    { path: '/report' },
    { path: '/staff/tickets' },
    { path: '/gear' },
    { path: '/welcome' },
    { path: '/kits' },
    { path: '/owner/catalog' },
    { path: '/owner/kits' },
    { path: '/register' },
    { path: '/forgot-password' },
    { path: '/reset-password/:token' },
    { path: '/moderation' },
    { path: '/trips' },
    { path: '/trips/:id' },
    { path: '/developers' },
    { path: '/supporter' },
    { path: '/owner/revenue' },
    { path: '/owner/trails' },
    { path: '/owner/brands' },
];

let index = fs.readFileSync(path.join(import.meta.dirname, '../_index.html'), 'utf8');
let shareStylesHtml = '';
const shareStylesLinks = [];
let shareScriptsHtml = '';
let appScriptsHtml = '';
let appStylesHtml = '';
let docStylesHtml = '';

const manifestPath = path.join(import.meta.dirname, '../public/dist/.vite/manifest.json');
export const hasBuiltAssets = fs.existsSync(manifestPath);

if (hasBuiltAssets) {
    // Production / test: serve pre-built Vite assets
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    // An entry's stylesheets include those of the chunks it imports: CSS
    // shared between entries (the web fonts, for one) lands in a shared chunk,
    // and nothing loads it unless it's linked here.
    const entryCss = (key, seen = new Set()) => {
        const chunk = manifest[key];
        if (!chunk || seen.has(key)) return [];
        seen.add(key);
        const own = chunk.css || [];
        const imported = (chunk.imports || []).flatMap((k) => entryCss(k, seen));
        return [...new Set([...imported, ...own])];
    };

    // App entry
    const appEntry = manifest['client/lighterpack.js'];
    if (appEntry) {
        appScriptsHtml += `<script type="module" src='/dist/${appEntry.file}'></script>`;
        entryCss('client/lighterpack.js').forEach((cssFile) => {
            appStylesHtml += `<link rel='stylesheet' href='/dist/${cssFile}' />`;
        });
    }

    // Share entry
    const shareEntry = manifest['client/share-entry.js'];
    if (shareEntry) {
        shareScriptsHtml += `<script type="module" src='/dist/${shareEntry.file}'></script>`;
        entryCss('client/share-entry.js').forEach((cssFile) => {
            shareStylesHtml += `<link rel='stylesheet' href='/dist/${cssFile}' />`;
            shareStylesLinks.push(cssFile);
        });
    }

    const embedEntry = manifest['client/embed-entry.js'];
    if (embedEntry) {
        embedScriptUrls.push(`${config.get('deployUrl')}/e/dist/${embedEntry.file.replace('assets/', '')}`);
    }

    // Doc entry is CSS-only, so the manifest points `file` straight at the
    // stylesheet and there is no `css` array to walk.
    const docEntry = manifest['client/css/doc.scss'];
    if (docEntry) {
        docStylesHtml += `<link rel='stylesheet' href='/dist/${docEntry.file}' />`;
    }
} else {
    // Dev without a build: Vite runs as middleware on this same origin.
    appStylesHtml = '';
    appScriptsHtml = '<script type="module" src="/@vite/client"></script>'
        + '<script type="module" src="/client/lighterpack.js"></script>';
    shareStylesHtml = '';
    shareScriptsHtml = '<script type="module" src="/@vite/client"></script>'
        + '<script type="module" src="/client/share-entry.js"></script>';
    embedScriptUrls.push(`${config.get('deployUrl')}/client/embed-entry.js`);
    // Vite serves scss as a JS module that injects a style tag, so in dev the
    // doc pages do load a script even though the built version never does.
    docStylesHtml = '<script type="module" src="/@vite/client"></script>'
        + '<script type="module" src="/client/css/doc.scss"></script>';
}

// Google Analytics ID, if the owner set one, for the app and the public
// pages (never embeds, which live on other people's sites).
appScriptsHtml += analyticsMeta();
shareScriptsHtml += analyticsMeta();

index = index.replace('{{styles}}', appStylesHtml);
index = index.replace('{{scripts}}', appScriptsHtml);
// Social previews need an absolute image URL.
index = index.replace('content="/images/og-image.png"', `content="${config.get('deployUrl')}/images/og-image.png"`);

// Long-form document pages (/privacy, /terms) are rendered from markdown once
// at startup and served as static HTML — no JS, no database, nothing
// per-request to get wrong. The shared marked renderer is hardened for
// untrusted list descriptions: it drops inline HTML and stamps
// target="_blank" rel="nofollow ugc" on every link. That is wrong for a
// first-party document, so these get a default Marked instance of their own.
const docMarked = new Marked();

const docPages = [
    {
        path: '/privacy',
        file: 'PRIVACY.md',
        title: 'Privacy Policy',
        description: 'What Waymark Gear collects, who else handles it, and how to delete it.',
    },
    {
        path: '/terms',
        file: 'TERMS.md',
        title: 'Terms of Use',
        description: 'The house rules for using Waymark Gear, in plain English.',
    },
];

const docTemplate = fs.readFileSync(path.join(import.meta.dirname, '../templates/doc.mustache'), 'utf8');

function renderDocPage(doc, sibling) {
    const source = applyAnalyticsBlocks(fs.readFileSync(path.join(import.meta.dirname, '..', doc.file), 'utf8'));
    // Wide tables must scroll inside their own box rather than widening the
    // page on a phone; marked has no hook for wrapping a block-level token.
    const content = docMarked.parse(source)
        .replace(/<table>/g, '<div class="lpDocTableScroll"><table>')
        .replace(/<\/table>/g, '</table></div>');

    return Mustache.render(docTemplate, {
        styles: docStylesHtml,
        content,
        title: doc.title,
        description: doc.description,
        siblingPath: sibling.path,
        siblingTitle: sibling.title,
    });
}

docPages.forEach((doc, i) => {
    // Each doc links to the next one in the list, so the two policies stay
    // reachable from each other without either page hardcoding the other.
    const sibling = docPages[(i + 1) % docPages.length];
    let page = '';
    try {
        page = renderDocPage(doc, sibling);
    } catch (err) {
        logger.error({ message: `Error rendering ${doc.file}`, err });
    }

    router.get(doc.path, (req, res) => {
        if (!page) {
            return res.status(500).send(`${doc.title} is temporarily unavailable.`);
        }
        res.set('Cache-Control', 'public, max-age=3600');
        return res.send(page);
    });
});

for (let i = 0; i < vueRoutes.length; i++) {
    router.get(vueRoutes[i].path, (req, res) => {
        res.send(index);
    });
}

// ---- search engines -----------------------------------------------------------

router.get('/robots.txt', (req, res) => {
    res.set('Cache-Control', 'public, max-age=86400');
    res.type('text/plain').send([
        'User-agent: *',
        'Allow: /',
        'Disallow: /api/',
        'Disallow: /moderation',
        'Disallow: /owner/',
        'Disallow: /profile',
        'Disallow: /pack',
        'Disallow: /gear',
        'Disallow: /csv/',
        `Sitemap: ${config.get('deployUrl')}/sitemap.xml`,
        '',
    ].join('\n'));
});

// Published lists and the profiles of the people who published them.
// Rebuilt at most every 30 minutes.
// The sitemap index and its files, built daily from the database
// (server/sitemap.js). Served from disk; the very first request after a
// start waits for the first build.
const sendSitemap = (name) => async (req, res) => {
    try {
        await ensureSitemap(knex, { log: (err) => logWithRequest(req, { message: 'error building sitemap', err }) });
        const file = sitemapFile(name || `${req.params.name}.xml`);
        if (!file) return res.status(404).end();
        res.set('Cache-Control', 'public, max-age=3600');
        res.type('application/xml').sendFile(file);
    } catch (err) {
        logWithRequest(req, { message: 'error serving sitemap', err });
        res.status(500).end();
    }
};
router.get('/sitemap.xml', sendSitemap('sitemap.xml'));
router.get('/sitemaps/:name.xml', sendSitemap());

// ---- link-preview images -----------------------------------------------------

// What a list's preview card shows. `library` must have `list` totals computed.
function listCard(library, list, username, avatarUrl = '') {
    // One bar per category, or per category group.
    const categories = list.groupedCategories().map((block) => ({
        weightMg: block.categories.reduce((sum, c) => sum + c.subtotalWeight - c.subtotalWornWeight - c.subtotalConsumableWeight, 0),
    }));
    return {
        name: list.name,
        username,
        avatarUrl: avatarUrl || '',
        // Plain text, first ~2 lines' worth: markdown marks would look odd.
        description: String(list.description || '').replace(/[#*_`>[\]()!]/g, '').replace(/\s+/g, ' ').trim(),
        baseWeightMg: list.totalBaseWeight,
        itemCount: list.categoryIds.reduce((n, cid) => n + ((library.getCategoryById(cid) || { categoryItems: [] }).categoryItems.length), 0),
        weightClass: (WEIGHT_CLASSES.find((c) => c.id === weightClassFor(list.totalBaseWeight)) || {}).label || '',
        shakedown: Boolean(list.published && list.shakedown),
        categories,
    };
}

function sendPng(req, res, { png, etag }) {
    res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    res.set('ETag', `"${etag}"`);
    if (req.get('If-None-Match') === `"${etag}"`) return res.status(304).end();
    res.type('png').send(png);
}

router.get('/og/r/:file', async (req, res) => {
    const m = String(req.params.file).match(/^([a-z0-9]{1,32})\.png$/i);
    if (!m) return res.status(404).end();
    try {
        const found = await libraryForExternalId(m[1]);
        if (!found) return res.status(404).end();
        const library = new Library();
        library.load(await applyCatalog(found.library));
        const list = library.lists.find((l) => l.externalId === m[1]);
        if (!list) return res.status(404).end();
        list.calculateTotals();
        sendPng(req, res, await listImage(listCard(library, list, found.username, found.avatar_url)));
    } catch (err) {
        logWithRequest(req, { message: 'error rendering list image', err });
        res.status(500).end();
    }
});

router.get('/og/@:file', async (req, res) => {
    const m = String(req.params.file).match(/^([A-Za-z0-9_.-]{1,64})\.png$/);
    if (!m) return res.status(404).end();
    try {
        const found = await publicProfile(m[1]);
        if (!found) return res.status(404).end();
        const { profile, kits } = found;
        sendPng(req, res, await profileImage({
            name: profile.displayName || `@${profile.username}`,
            username: profile.username,
            trailName: profile.trailName,
            kitCount: kits.length,
            lightest: kits.length ? formatWeightMg(Math.min(...kits.map((k) => k.baseWeightMg)), 'lb') : '',
            initial: (profile.displayName || profile.username).trim().charAt(0).toUpperCase(),
            avatarUrl: profile.avatarUrl,
        }));
    } catch (err) {
        logWithRequest(req, { message: 'error rendering profile image', err });
        res.status(500).end();
    }
});

// ---- public @profiles --------------------------------------------------------

const profileTemplate = fs.readFileSync(path.join(import.meta.dirname, '../templates/profile.mustache'), 'utf8');
const NETWORK_LABELS = { youtube: 'YouTube', x: 'X', instagram: 'Instagram', website: 'Website' };

function kitCardModel(kit) {
    return {
        externalId: kit.externalId,
        name: kit.name,
        baseWeight: formatWeightMg(kit.baseWeightMg, 'lb'),
        weightClass: (WEIGHT_CLASSES.find((c) => c.id === kit.weightClass) || {}).label || '',
        itemCount: `${kit.itemCount} ${kit.itemCount === 1 ? 'item' : 'items'}`,
        description: kit.description ? kit.description.replace(/[#*_`>[\]()]/g, '').slice(0, 140) : '',
    };
}

router.get('/@:username', async (req, res) => {
    const username = String(req.params.username || '');
    if (!/^[A-Za-z0-9_.-]{1,64}$/.test(username)) return res.status(404).send('No such profile.');
    const cacheKey = `p:${username.toLowerCase()}:${req.query.view === 'gear' ? 'gear' : 'lists'}`;
    // Trips depend on who's reading (followers-only trips), so that tab is never cached.
    const tripsView = req.query.view === 'trips';
    const hit = !tripsView && cachedPage(cacheKey);
    if (hit) return sendCachedPage(req, res, hit);
    try {
        const found = await publicProfile(username);
        if (!found) return res.status(404).send('No such profile.');
        const { profile, featured, others, kits } = found;
        const gearView = req.query.view === 'gear';
        const trips = tripsView ? await tripsOnProfile(found.userId, await optionalUser(req)) : [];
        const gear = await publicGear(found.userId, kits.map((k) => k.externalId));
        const name = profile.displayName || `@${profile.username}`;
        const lightest = kits.length ? formatWeightMg(Math.min(...kits.map((k) => k.baseWeightMg)), 'lb') : '';
        const links = Object.entries(profile.links)
            .filter(([network, url]) => NETWORK_LABELS[network] && /^https:\/\//.test(url))
            .map(([network, url]) => ({ network, url, label: NETWORK_LABELS[network] }));
        const deployUrl = config.get('deployUrl');

        const model = {
            styles: shareStylesHtml,
            cspNonce: NONCE_PLACEHOLDER,
            deployUrl,
            username: profile.username,
            name,
            initial: (profile.displayName || profile.username).trim().charAt(0).toUpperCase(),
            trailName: profile.trailName,
            supporter: found.supporter,
            avatarUrl: profile.avatarUrl,
            bannerUrl: profile.bannerUrl,
            ogImage: `${deployUrl}/og/@${profile.username}.png?v=${profileImageVersion({
                name, trailName: profile.trailName, avatarUrl: profile.avatarUrl, kitCount: kits.length, lightest,
            })}`,
            bioHtml: profile.bio ? marked(profile.bio) : '',
            links,
            hasLinks: links.length > 0,
            kitCount: kits.length,
            gearCount: gear.length,
            lightest,
            featured: featured.map(kitCardModel),
            others: others.map(kitCardModel),
            hasFeatured: featured.length > 0,
            hasOthers: others.length > 0,
            listsView: !gearView && !tripsView,
            tripsView,
            trips: trips.map((t) => ({
                ...t,
                dateRange: tripDateRange(t.startDate, t.endDate),
                entryLabel: `${t.entryCount} ${t.entryCount === 1 ? 'entry' : 'entries'}`,
                visibilityLabel: VISIBILITY_LABELS[t.visibility] || '',
                excerpt: plain(t.summary).slice(0, 160),
            })),
            hasTrips: trips.length > 0,
            gearView,
            scripts: shareScriptsHtml,
            tags: [...profile.tags.activities, ...profile.tags.seasons, ...profile.tags.custom],
            gear: gear.map((g) => ({
                ...g,
                photosJson: g.photos.length ? JSON.stringify(g.photos) : '',
                photoCount: g.photos.length,
                videoUrl: youTubeId(g.videoUrl) ? g.videoUrl : '',
                // The grid thumbnail: an uploaded gear photo, else the item image.
                thumbUrl: g.photos[0] || g.thumbUrl,
                initial: g.name.trim().charAt(0).toUpperCase(),
                weight: `${weightUtils.MgToDisplayWeight(g.weightMg, g.unit)} ${g.unit}`,
            })),
            metaDescription: `${name} on Waymark Gear: ${kits.length} published ${kits.length === 1 ? 'list' : 'lists'}${lightest ? `, lightest base weight ${lightest}` : ''}.`,
        };
        const html = renderPage(profileTemplate, model, { kitCard: templates.t_kitCard || '' }, req.path);
        if (tripsView) return sendFresh(res, html);
        return sendCachedPage(req, res, storePage(cacheKey, html, found.userId));
    } catch (err) {
        logWithRequest(req, { message: 'error rendering profile', err });
        res.status(500).send('An error occurred.');
    }
});

// ---- trip journals (/t/:id) and gear pages (/g/:id, /reviews) ------------

const tripTemplate = fs.readFileSync(path.join(import.meta.dirname, '../templates/trip.mustache'), 'utf8');
const gearTemplate = fs.readFileSync(path.join(import.meta.dirname, '../templates/gear-item.mustache'), 'utf8');
const compareTemplate = fs.readFileSync(path.join(import.meta.dirname, '../templates/compare.mustache'), 'utf8');
const trailsTemplate = fs.readFileSync(path.join(import.meta.dirname, '../templates/trails.mustache'), 'utf8');
const exploreGearTemplate = fs.readFileSync(path.join(import.meta.dirname, '../templates/explore-gear.mustache'), 'utf8');
const brandsTemplate = fs.readFileSync(path.join(import.meta.dirname, '../templates/brands.mustache'), 'utf8');
const VISIBILITY_LABELS = { followers: 'Followers only', private: 'Only you' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function shortDate(iso, withYear = true) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    return `${MONTHS[m - 1]} ${d}${withYear ? `, ${y}` : ''}`;
}

export function tripDateRange(start, end) {
    if (!start) return '';
    if (!end || end === start) return shortDate(start);
    const sameYear = start.slice(0, 4) === end.slice(0, 4);
    return `${shortDate(start, !sameYear)} – ${shortDate(end)}`;
}

const kmLabel = (km, imperial) => (imperial ? `${(km * 0.621371).toFixed(1)} mi` : `${km.toFixed(1)} km`);
const plain = (md) => String(md || '').replace(/[#*_`>[\]()!]/g, '').replace(/\s+/g, ' ').trim();

// For other modules' server-rendered pages (the OAuth consent page).
export const shareAssets = () => ({ styles: shareStylesHtml, scripts: shareScriptsHtml });

function shareHead() {
    return { styles: shareStylesHtml, scripts: shareScriptsHtml, deployUrl: config.get('deployUrl') };
}

// Pages that depend on who's reading: rendered every time, never cached.
function sendFresh(res, html) {
    res.set('Cache-Control', 'private, no-store');
    res.type('html').send(html.split(NONCE_PLACEHOLDER).join(res.locals.cspNonce || ''));
}

router.get('/t/:id', async (req, res) => {
    try {
        const viewer = await optionalUser(req);
        const view = await viewTrip(req.params.id, viewer);
        if (!view) return res.status(404).send('That trip could not be found.');
        const { trip, author, list } = view;
        const imperial = !list || !['g', 'kg'].includes(list.unit);
        const totalKm = trip.entries.reduce((n, e) => n + (e.distanceKm || 0), 0);
        const days = trip.startDate && trip.endDate ? Math.round((Date.parse(trip.endDate) - Date.parse(trip.startDate)) / 86400000) + 1 : 0;
        const authorName = author.displayName || `@${author.username}`;
        const deployUrl = config.get('deployUrl');
        const model = {
            ...shareHead(),
            cspNonce: NONCE_PLACEHOLDER,
            id: trip.id,
            title: trip.title,
            username: author.username,
            authorName,
            mine: Boolean(viewer && viewer.username === author.username),
            isPublic: trip.visibility === 'public',
            visibilityLabel: VISIBILITY_LABELS[trip.visibility] || '',
            dateRange: tripDateRange(trip.startDate, trip.endDate),
            days: days > 0 ? days : '',
            entryCount: trip.entries.length,
            distance: totalKm ? kmLabel(totalKm, imperial) : '',
            coverUrl: trip.coverUrl,
            ogImage: trip.coverUrl ? `${deployUrl}${trip.coverUrl}` : '',
            summaryHtml: trip.summary ? marked(trip.summary) : '',
            list: list ? {
                name: list.name,
                baseWeight: formatWeightMg(list.baseWeightMg, imperial ? 'lb' : 'kg'),
                href: list.externalId && list.published ? `/r/${list.externalId}` : '',
            } : null,
            entries: trip.entries.map((e) => ({
                id: e.id,
                day: e.day && e.day > 0 ? e.day : '',
                date: e.date ? shortDate(e.date) : '',
                title: e.title,
                distance: e.distanceKm ? kmLabel(e.distanceKm, imperial) : '',
                bodyHtml: e.body ? marked(e.body) : '',
                photos: e.photos.map((url, i) => ({
                    url,
                    alt: `${trip.title}${e.day ? `, day ${e.day}` : ''}: photo ${i + 1}`,
                    set: JSON.stringify([...e.photos.slice(i), ...e.photos.slice(0, i)]),
                })),
            })),
            metaDescription: `${trip.title}: a trip journal by ${authorName}${tripDateRange(trip.startDate, trip.endDate) ? `, ${tripDateRange(trip.startDate, trip.endDate)}` : ''}. ${plain(trip.summary).slice(0, 140)}`.trim(),
        };
        sendFresh(res, renderPage(tripTemplate, model, {}, req.path));
    } catch (err) {
        logWithRequest(req, { message: 'error rendering trip', err });
        res.status(500).send('An error occurred.');
    }
});

const STARS = (n) => '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);

function reviewModel(r) {
    const d = new Date(r.createdAt);
    return {
        ...r,
        stars: STARS(r.rating),
        when: `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`,
        bodyHtml: marked(r.body),
        hasProsCons: Boolean(r.pros || r.cons),
        itemName: r.item ? [r.item.brand, r.item.name].filter(Boolean).join(' ') : '',
    };
}

// The Buy button: one shop goes straight there; more open a Where to buy
// menu (templates/t_buy.mustache). Every link goes through /go, which picks
// the affiliate link or, for Supporters, the plain one.
function buyModel(item, badges, { from, testid, btnClass }) {
    const safe = { ...item, url: /^https:\/\//.test(item.url || '') ? item.url : '' };
    const options = buyOptions(safe, badges).map((o) => ({ ...o, href: `/go/${item.id}?from=${from}${o.index ? `&shop=${o.index}` : ''}` }));
    return {
        testid,
        btnClass,
        any: options.length > 0,
        single: options.length === 1 ? { href: options[0].href } : null,
        menu: options.length > 1 ? { count: options.length, options } : null,
    };
}

router.get('/g/:id', async (req, res) => {
    const id = String(req.params.id);
    if (!isUuid(id)) return res.status(404).send('No such gear.');
    try {
        const item = await catalogItem(id);
        if (!item || item.status !== 'published') return res.status(404).send('No such gear.');
        const viewer = await optionalUser(req);
        const { reviews, summary } = await reviewsFor(id, viewer);
        const uses = await knex('public_kits').whereRaw('? = any(catalog_ids)', [id]).count({ n: '*' }).first();
        const kitCount = Number(uses.n);
        const fullName = [item.brand, item.name].filter(Boolean).join(' ');
        const history = await priceHistory(id);
        const badges = await badgesFor([...(item.shops || []).map((x) => x.domain), item.url && new URL(item.url).hostname.replace(/^www\./, '')]);
        const model = {
            ...shareHead(),
            cspNonce: NONCE_PLACEHOLDER,
            path: `/g/${id}`,
            pageTitle: `${fullName}: weight and reviews`,
            metaDescription: `${fullName}, ${weightUtils.MgToDisplayWeight(item.weightMg, item.unit)} ${item.unit}.${summary.average ? ` Rated ${summary.average}/5 in ${summary.count} ${summary.count === 1 ? 'review' : 'reviews'} on Waymark Gear.` : ''}`,
            item: {
                ...item,
                initial: item.name.trim().charAt(0).toUpperCase(),
                weight: `${weightUtils.MgToDisplayWeight(item.weightMg, item.unit)} ${item.unit}`,
                price: item.price ? `${item.currency === 'USD' || !item.currency ? '$' : `${item.currency} `}${item.price}` : '',
                url: /^https:\/\//.test(item.url) ? item.url : '',
                buy: buyModel(item, badges, { from: 'gear', testid: 'gear-buy', btnClass: 'wgBtnGhost' }),
                average: summary.average,
                stars: summary.average ? STARS(Math.round(summary.average)) : '',
                countLabel: `${summary.count} ${summary.count === 1 ? 'review' : 'reviews'}`,
                kitCount,
                kitCountLabel: `${kitCount} public ${kitCount === 1 ? 'list' : 'lists'}`,
                searchName: encodeURIComponent(item.name),
                reviews: reviews.map(reviewModel),
                prices: priceModel(history),
                // "Trail weight: 26 oz (737.1 g)"... (client/utils/gear-specs.js)
                specs: specRows(item.category, item.specs),
            },
        };
        sendFresh(res, renderPage(gearTemplate, model, { reviewCard: templates.t_reviewCard || '', buy: templates.t_buy || '' }, req.path));
    } catch (err) {
        logWithRequest(req, { message: 'error rendering gear page', err });
        res.status(500).send('An error occurred.');
    }
});

const moneyLabel = (n, currency) => `${!currency || currency === 'USD' ? '$' : `${currency} `}${Number(n).toFixed(2).replace(/\.00$/, '')}`;

// Price history for the gear page: a small line, the lowest price and the
// changes, oldest first.
function priceModel(history) {
    if (history.length < 2) return null;
    const values = history.map((h) => h.price);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const w = 240;
    const h = 48;
    const points = history.map((p, i) => {
        const x = (i / (history.length - 1)) * w;
        const y = hi === lo ? h / 2 : h - 4 - ((p.price - lo) / (hi - lo)) * (h - 8);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return {
        points,
        lowest: moneyLabel(lo, history[0].currency),
        changes: history.slice(-6).reverse().map((p) => ({ price: moneyLabel(p.price, p.currency), when: shortDate(new Date(p.at).toISOString().slice(0, 10)) })),
    };
}

// Side-by-side comparison of up to four catalog items: /compare?ids=a,b,c
router.get('/compare', async (req, res) => {
    try {
        const ids = [...new Set(String(req.query.ids || '').split(',').map((x) => x.trim()).filter(isUuid))].slice(0, 4);
        const found = ids.length ? (await catalogSearch({ ids, limit: 4 })).items : [];
        const items = ids.map((id) => found.find((f) => f.id === id)).filter(Boolean);
        const ratings = await ratingsFor(items.map((i) => i.id));
        const compareBadges = await badgesFor(items.flatMap((i) => [...(i.shops || []).map((x) => x.domain), i.url ? new URL(i.url).hostname.replace(/^www\./, '') : '']));
        const lowestRows = items.length ? await knex('catalog_price_history').whereIn('catalog_id', items.map((i) => i.id))
            .groupBy('catalog_id').select('catalog_id', knex.raw('min(price)::float as low')) : [];
        const lowest = new Map(lowestRows.map((r) => [r.catalog_id, r.low]));
        const uses = items.length ? await knex.select('catalog_id').count({ n: '*' })
            .from(knex.select(knex.raw('unnest(catalog_ids) as catalog_id')).from('public_kits').as('u'))
            .whereIn('catalog_id', items.map((i) => i.id)).groupBy('catalog_id') : [];
        const useCount = new Map(uses.map((u) => [u.catalog_id, Number(u.n)]));
        const minWeight = Math.min(...items.map((i) => i.weightMg).filter((w) => w > 0));
        const priced = items.filter((i) => i.price);
        const minPrice = priced.length > 1 ? Math.min(...priced.map((i) => i.price)) : null;
        const names = items.map((i) => [i.brand, i.name].filter(Boolean).join(' '));
        const model = {
            ...shareHead(),
            cspNonce: NONCE_PLACEHOLDER,
            pageTitle: names.length ? `Compare: ${names.join(' vs ')}` : 'Compare gear',
            metaDescription: names.length ? `${names.join(', ')}: weight, price, ratings side by side.` : 'Compare backpacking gear side by side.',
            idsCsv: items.map((i) => i.id).join(','),
            hasItems: items.length > 0,
            items: items.map((i) => {
                const r = ratings[i.id];
                const buy = buyModel(i, compareBadges, { from: 'compare', testid: 'compare-buy', btnClass: 'wgBtnPrimary' });
                return {
                    ...i,
                    initial: i.name.trim().charAt(0).toUpperCase(),
                    weight: `${weightUtils.MgToDisplayWeight(i.weightMg, i.unit)} ${i.unit}`,
                    lightest: items.length > 1 && i.weightMg === minWeight,
                    price: i.price ? moneyLabel(i.price, i.currency) : '',
                    cheapest: minPrice !== null && i.price === minPrice,
                    lowest: lowest.has(i.id) ? moneyLabel(lowest.get(i.id), i.currency) : '',
                    average: r ? r.average : null,
                    stars: r ? STARS(Math.round(r.average)) : '',
                    reviewCount: r ? r.count : 0,
                    uses: useCount.get(i.id) || 0,
                    description: i.description.slice(0, 300),
                    removeUrl: `/compare?ids=${items.filter((x) => x.id !== i.id).map((x) => x.id).join(',')}`,
                    buy,
                };
            }),
        };
        sendFresh(res, renderPage(compareTemplate, model, { buy: templates.t_buy || '' }, req.path));
    } catch (err) {
        logWithRequest(req, { message: 'error rendering comparison', err });
        res.status(500).send('An error occurred.');
    }
});

// ---- trails (Phase 8) ---------------------------------------------------------

const lbLabel = (mg) => (mg || mg === 0 ? formatWeightMg(mg, 'lb') : '—');
const pct = (v) => (v === undefined || v === null ? '—' : `${v}%`);
// The three feature tiles worth showing for a trail: the ones that set it
// apart, so the PCT shows bear canisters and the CDT ice axes.
const TILE_ORDER = ['bear-canister', 'ice-axe', 'messenger', 'umbrella', 'hammock', 'cold-soak'];

function trailBodyModel(data, comparison) {
    const { trail, stats } = data;
    const f = stats.features || {};
    const distinctive = TILE_ORDER.filter((k) => f[k] > 0).slice(0, 1);
    const tiles = ['quilt', 'trail-runners', ...(distinctive.length ? distinctive : ['messenger'])];
    const shortOrName = trail.short || trail.name;
    const compareKeys = [['packs', 'Packs'], ['median', 'Median base weight'], ['lightest', 'Lightest'], ...['quilt', 'trail-runners', 'bear-canister', 'ice-axe', 'messenger'].map((k) => [k, PACK_FEATURES[k].label])];
    return {
        pageTitle: `What people carry on the ${shortOrName}`,
        trail: { ...trail, shortOrName, notes: trail.notes || [] },
        parent: data.parent,
        sections: data.sections,
        hasSections: data.sections.length > 0,
        hasNotes: (trail.notes || []).length > 0,
        stats,
        median: lbLabel(stats.medianMg),
        lightest: lbLabel(stats.lightestMg),
        statTiles: stats.packs ? tiles.map((k) => ({ label: PACK_FEATURES[k].label.replace(' instead of a bag', 's'), value: pct(f[k]) })) : [],
        carried: data.carried.map((c) => ({ ...c, items: c.items.map((i) => ({ ...i, weight: `${weightUtils.MgToDisplayWeight(i.weightMg, i.unit)} ${i.unit}` })) })),
        hasCarried: data.carried.length > 0,
        sorts: Object.entries(trails.SORTS).map(([id, label]) => ({ id, label: id === 'year' ? `${data.year} class` : label, on: id === data.sort })),
        kits: data.kits.map((k) => {
            const total = k.categories.reduce((n, c) => n + Math.max(c.weightMg, 0), 0) || 1;
            return {
                ...k,
                baseWeight: lbLabel(k.baseWeightMg),
                tag: [k.trailYear, DIRECTIONS[k.trailDirection]].filter(Boolean).join(' '),
                comments: `${k.commentCount || 0} ${k.commentCount === 1 ? 'comment' : 'comments'}`,
                score: k.score || 0,
                bars: k.categories.filter((c) => c.weightMg > 0).map((c, i) => ({ flex: Math.max(1, Math.round((c.weightMg / total) * 100)), i: i % 6 })),
            };
        }),
        hasKits: data.kits.length > 0,
        sortNote: data.sort === 'shakedown' ? 'asking for a shakedown' : data.sort === 'year' ? `for ${data.year}` : '',
        hasComparison: comparison.length > 1,
        comparison: comparison.map((c, i) => ({ slug: c.trail.slug, label: c.trail.short || c.trail.name, me: i === 0 })),
        compareRows: compareKeys.map(([key, label]) => ({
            label,
            cells: comparison.map((c, i) => {
                const st = c.stats;
                let value;
                if (key === 'packs') value = String(st.packs);
                else if (!st.packs) value = '—';
                else if (key === 'median') value = lbLabel(st.medianMg);
                else if (key === 'lightest') value = lbLabel(st.lightestMg);
                else value = pct(st.features[key]);
                return { value, me: i === 0 };
            }),
        })),
    };
}

// The Brands directory. Every published brand is in the page (there are
// dozens, not thousands), with the ones the filters rule out hidden, so the
// browser can filter in place and the URL still works without JavaScript.
// ---- Explore gear: the catalog by category, then one category with filters ----

// Links to the old Explore kits page (/explore?class=ul, ?q=...) go to /kits.
const KIT_PARAMS = ['class', 'q', 'trip', 'sort', 'featured', 'shakedown', 'following', 'trail', 'year', 'page'];

router.get('/explore', async (req, res) => {
    if (KIT_PARAMS.some((k) => k in req.query)) {
        const qs = new URLSearchParams(req.query).toString();
        return res.redirect(301, `/kits${qs ? `?${qs}` : ''}`);
    }
    try {
        const index = exploreIndex(await catalogCategories());
        const label = (n) => `${n} ${n === 1 ? 'item' : 'items'}`;
        const shape = (s) => ({ ...s, countLabel: s.count ? label(s.count) : 'Coming soon', children: s.children.map((c) => ({ ...c, parentSlug: s.slug })) });
        const model = {
            ...shareHead(),
            cspNonce: NONCE_PLACEHOLDER,
            path: '/explore',
            canonicalPath: '/explore',
            pageTitle: 'Explore gear',
            metaDescription: 'Backpacking gear by category: packs, shelters, sleep systems, clothing and more, with weights, prices and specs to filter by.',
            index: {
                parents: index.filter((s) => s.children !== undefined && ['pack', 'shelter', 'sleep-system', 'clothing'].includes(s.slug)).map(shape),
                others: index.filter((s) => !['pack', 'shelter', 'sleep-system', 'clothing'].includes(s.slug)).map(shape),
            },
        };
        sendFresh(res, renderPage(exploreGearTemplate, model, {}, req.path));
    } catch (err) {
        logWithRequest(req, { message: 'error rendering explore', err });
        res.status(500).send('An error occurred.');
    }
});

const SORTS = [['weight', 'Lightest first'], ['price', 'Price, low to high'], ['name', 'Name']];
// Enough for any one category; filtering happens on the page.
const MAX_SECTION_ITEMS = 3000;

router.get('/explore/:slug', async (req, res) => {
    const slug = String(req.params.slug).toLowerCase();
    if (!/^[a-z0-9-]{1,80}$/.test(slug)) return res.status(404).send('Not found.');
    try {
        const categories = await catalogCategories();
        const section = resolveSection(slug, categories);
        if (!section) return res.redirect(302, '/explore');
        const rows = section.categories.length
            ? await knex('catalog_items').where({ status: 'published' }).whereIn('category', section.categories).limit(MAX_SECTION_ITEMS)
            : [];
        const entries = rows.map(catalogToApi);
        const items = entries.map(filterItem);
        // The section's own gear types offer their filters even before
        // the catalog has those specs filled in.
        const facets = facetsFor(items, { categories: section.categories });
        const filters = readFilters(req.query);
        const shown = items.filter((i) => matchesFilters(i, filters));
        const byId = new Map(entries.map((e) => [e.id, e]));

        const rangeOf = (key, label, facet, chosen, stops) => ({
            key,
            label,
            min: facet.min,
            max: facet.max,
            step: stops ? (stops.every((n) => n % 50 === 0) ? 50 : 1) : facet.step,
            stops: stops ? stops.join(',') : '',
            lo: chosen.min ?? facet.min,
            hi: chosen.max ?? facet.max,
            text: rangeLabel(key, chosen.min, chosen.max, facet),
        });
        const on = (list, value) => list.includes(value);
        // The filter column, in order: category, weight, price, then the
        // section's specs in their type's order (a pack's max carry, volume,
        // pack type, straps...), then brand.
        const packs = section.categories.length > 0 && section.categories.every((c) => (specTypeFor(c) || {}).id === 'pack');
        const blocks = [];
        if (facets.weight) blocks.push({ range: rangeOf('weight', packs ? 'Pack weight' : 'Weight', facets.weight, filters.weight) });
        if (facets.price) blocks.push({ range: rangeOf('price', 'Price', facets.price, filters.price) });
        for (const f of facets.specs) {
            if (f.kind === 'range') blocks.push({ range: rangeOf(f.key, f.label, f, filters.specs[f.key] || {}, f.stops) });
            else {
                blocks.push({
                    match: {
                        ...f,
                        options: f.options.map((o) => {
                            const checked = Boolean(filters.specs[f.key] && filters.specs[f.key].any.includes(o.value));
                            // Nothing in the catalog has it yet: shown, not pickable.
                            return { ...o, key: f.key, on: checked, off: !o.count && !checked };
                        }),
                    },
                });
            }
        }
        const total = items.length;
        const active = activeFilterCount(filters);
        const model = {
            ...shareHead(),
            cspNonce: NONCE_PLACEHOLDER,
            path: req.path,
            canonicalPath: `/explore/${slug}`,
            pageTitle: `${section.title}: compare by weight, price and specs`,
            metaDescription: `${total} ${section.title.toLowerCase()} ${total === 1 ? 'item' : 'items'} on Waymark Gear. Filter by weight, price, brand and specs.`,
            section: {
                slug,
                title: section.title,
                note: section.note,
                parent: section.parent,
                activeLabel: active ? `(${active})` : '',
                sort: filters.sort,
                sorts: SORTS.map(([value, label]) => ({ value, label, on: value === filters.sort })),
                facets: {
                    cats: facets.cats.length > 1 ? facets.cats.map((c) => ({ ...c, on: on(filters.cats, c.value) })) : [],
                    brands: facets.brands.length > 1 ? facets.brands.map((b) => ({ ...b, on: on(filters.brands, b.value) })) : [],
                },
                blocks,
                total,
                anyShown: shown.length > 0,
                countLabel: shown.length === total ? `${total} ${total === 1 ? 'item' : 'items'}` : `${shown.length} of ${total} items`,
                items: sortItems(items, filters.sort).map((i) => {
                    const e = byId.get(i.id);
                    return {
                        ...i,
                        brand: e.brand,
                        brandKey: i.brand.toLowerCase(),
                        sortName: `${e.brand} ${e.name}`.trim(),
                        initial: e.name.trim().charAt(0).toUpperCase(),
                        thumbUrl: thumbnailUrl(e.imageUrl || ''),
                        weightText: formatWeightG(i.weight),
                        priceValue: i.price === null ? '' : String(i.price),
                        priceText: i.price ? `$${Number(i.price).toFixed(0)}` : '',
                        specsJson: JSON.stringify(i.specs),
                        keySpecs: specRows(e.category, e.specs).slice(0, 3),
                        shown: matchesFilters(i, filters),
                    };
                }),
            },
        };
        sendFresh(res, renderPage(exploreGearTemplate, model, {}, req.path));
    } catch (err) {
        logWithRequest(req, { message: 'error rendering explore section', err });
        res.status(500).send('An error occurred.');
    }
});

router.get('/brands', async (req, res) => {
    try {
        const type = GEAR_TYPE_IDS.has(String(req.query.type)) ? String(req.query.type) : '';
        const filters = { q: String(req.query.q || '').trim().slice(0, 80), cottage: req.query.cottage === '1', type };
        const rows = await publishedBrands();
        const brands = rows.map((b) => ({
            id: b.id,
            name: b.name,
            initial: b.name.charAt(0).toUpperCase(),
            description: b.description,
            logoUrl: b.logo_url,
            url: b.url,
            cottage: b.cottage,
            country: b.country,
            hasMeta: Boolean(b.cottage || b.country),
            typeIds: (b.gear_types || []).join(' '),
            typeLabels: (b.gear_types || []).map(gearTypeLabel),
            shown: matchesBrand(b, filters),
        }));
        const shown = brands.filter((b) => b.shown).length;
        const model = {
            ...shareHead(),
            cspNonce: NONCE_PLACEHOLDER,
            path: '/brands',
            pageTitle: 'Gear brands',
            metaDescription: 'Backpacking gear makers, from big brands to cottage shops: search by name or by what they make.',
            filters,
            types: GEAR_TYPES.map((t) => ({ ...t, on: t.id === type })),
            brands,
            total: brands.length,
            anyShown: shown > 0,
            countLabel: shown === brands.length ? `${brands.length} ${brands.length === 1 ? 'brand' : 'brands'}` : `${shown} of ${brands.length} brands`,
        };
        sendFresh(res, renderPage(brandsTemplate, model, {}, req.path));
    } catch (err) {
        logWithRequest(req, { message: 'error rendering brands', err });
        res.status(500).send('An error occurred.');
    }
});

router.get('/trails', async (req, res) => {
    if (req.query.t) return res.redirect(301, `/trails/${encodeURIComponent(String(req.query.t))}`);
    const top = await trails.topTrails(1).catch(() => []);
    if (!top.length) return res.redirect(302, '/trails/all');
    res.redirect(302, `/trails/${top[0].slug}`);
});

router.get('/trails/all', async (req, res) => {
    try {
        const q = String(req.query.q || '').trim().slice(0, 80);
        const list = q ? await trails.searchTrails(q, 25) : await trails.allTrails();
        const COUNTRY = { US: 'United States', CA: 'Canada', NZ: 'New Zealand', AU: 'Australia', GB: 'United Kingdom', FR: 'France', ES: 'Spain', CH: 'Switzerland', SE: 'Sweden', TR: 'Turkey', NP: 'Nepal' };
        const groups = new Map();
        for (const t of list) {
            const label = COUNTRY[t.country] || 'Elsewhere';
            if (!groups.has(label)) groups.set(label, []);
            groups.get(label).push(t);
        }
        const model = {
            ...shareHead(),
            cspNonce: NONCE_PLACEHOLDER,
            path: '/trails/all',
            pageTitle: 'All trails',
            metaDescription: 'Every trail on Waymark Gear, with the pack lists hikers have published for each.',
            directory: { q, count: list.length, groups: [...groups].map(([label, ts]) => ({ label, trails: ts })) },
        };
        sendFresh(res, renderPage(trailsTemplate, model, { trailBody: templates.t_trailBody || '' }, req.path));
    } catch (err) {
        logWithRequest(req, { message: 'error rendering trail directory', err });
        res.status(500).send('An error occurred.');
    }
});

router.get('/trails/:slug', async (req, res) => {
    try {
        const data = await trails.trailPage(req.params.slug, { sort: String(req.query.sort || 'top') });
        if (!data) return res.status(404).send('No such trail. See /trails/all.');
        const body = trailBodyModel(data, await trails.comparison(data.trail.slug));
        // The picker swaps just the body in place.
        if (req.query.partial === '1') {
            res.set('Cache-Control', 'no-store');
            return res.type('html').send(Mustache.render(templates.t_trailBody || '', body));
        }
        const top = await trails.topTrails(8);
        const chips = [...top];
        if (!chips.some((t) => t.slug === data.trail.slug)) chips.unshift(data.trail);
        const model = {
            ...shareHead(),
            cspNonce: NONCE_PLACEHOLDER,
            path: `/trails/${data.trail.slug}`,
            metaDescription: `${data.stats.packs} pack lists for the ${data.trail.name}${data.stats.packs ? `: median base weight ${lbLabel(data.stats.medianMg)}` : ''}. What hikers carry, and how it compares.`,
            ...body,
            trailView: true,
            chips: chips.map((t) => ({ slug: t.slug, label: t.short || t.name, count: t.count || 0, on: t.slug === data.trail.slug })),
        };
        sendFresh(res, renderPage(trailsTemplate, model, { trailBody: templates.t_trailBody || '' }, req.path));
    } catch (err) {
        logWithRequest(req, { message: 'error rendering trail', err });
        res.status(500).send('An error occurred.');
    }
});

router.get('/reviews', async (req, res) => {
    try {
        const reviews = await latestReviews({ limit: 30 });
        const model = {
            ...shareHead(),
            cspNonce: NONCE_PLACEHOLDER,
            path: '/reviews',
            pageTitle: 'Gear reviews',
            metaDescription: 'Long-term backpacking gear reviews from the Waymark Gear team.',
            latest: { reviews: reviews.map(reviewModel), openReviews: config.has('openReviews') && config.get('openReviews') },
        };
        sendFresh(res, renderPage(gearTemplate, model, { reviewCard: templates.t_reviewCard || '' }, req.path));
    } catch (err) {
        logWithRequest(req, { message: 'error rendering reviews', err });
        res.status(500).send('An error occurred.');
    }
});

router.get('/r/:id', (req, res) => {
    renderListView(req, res);
});

async function renderListView(req, res) {
    const id = String(req.params.id).trim();

    if (!id) {
        res.status(400).send('No list specified!');
        return;
    }

    const cacheKey = `r:${id}`;
    const hit = cachedPage(cacheKey);
    if (hit) return sendCachedPage(req, res, hit);

    try {
        const user = await libraryForExternalId(id);

        if (!user) {
            res.status(400).send('Invalid list specified.');
            return;
        }

        const library = new Library();
        let list;

        if (typeof (user.library) === 'undefined') {
            logWithRequest(req, `Undefined user library with list ID ${id}`);
            return res.status(500).send('Unknown error.');
        }

        library.load(await applyCatalog(user.library));
        for (const i in library.lists) {
            if (library.lists[i].externalId && library.lists[i].externalId == id) {
                library.defaultListId = library.lists[i].id;
                list = library.lists[i];
                break;
            }
        }

        if (!list) { //List is in the DB but not the library
            res.status(400).send('Invalid list specified.');
            return;
        }

        const chartData = escape(JSON.stringify(list.renderChart('total', false)));
        const renderedCategories = renderLibrary(library, {
            itemTemplate: templates.t_itemShare,
            categoryTemplate: templates.t_categoryShare,
            optionalFields: list.optionalFields,
            unitSelectTemplate: templates.t_unitSelect,
            currencySymbol: library.currencySymbol,
        });

        const renderedTotals = renderLibraryTotals(library, templates.t_totals, templates.t_unitSelect);

        let model = {
            listName: list.name,
            chartData,
            renderedCategories,
            renderedTotals,
            optionalFields: list.optionalFields,
            renderedDescription: marked(list.description),
            scripts: shareScriptsHtml,
            styles: shareStylesHtml,
            cspNonce: res.locals.cspNonce,
            externalId: id,
            username: user.username,
            published: Boolean(list.published),
            shakedown: Boolean(list.published && list.shakedown),
            tripTypeLabel: TRIP_TYPE_LABELS[list.tripType] || '',
            trailLabel: list.trail ? [list.trail.short || list.trail.name, list.trail.year, DIRECTIONS[list.trail.direction]].filter(Boolean).join(' ') : '',
            trailSlug: list.trail && list.trail.slug ? list.trail.slug : '',
            ogImage: `${config.get('deployUrl')}/og/r/${id}.png?v=${listImageVersion(listCard(library, list, user.username, user.avatar_url))}`,
            baseWeight: formatWeightMg(list.totalBaseWeight, 'lb'),
            weightClass: (WEIGHT_CLASSES.find((c) => c.id === weightClassFor(list.totalBaseWeight)) || {}).label,
            itemCount: list.categoryIds.reduce((n, cid) => n + ((library.getCategoryById(cid) || { categoryItems: [] }).categoryItems.length), 0),
            deployUrl: config.get('deployUrl'),
            metaDescription: `${list.name || 'A gear list'} by @${user.username}: ${formatWeightMg(list.totalBaseWeight, 'lb')} base weight. Built with Waymark Gear.`,
        };

        Object.assign(model, templates);
        model.cspNonce = NONCE_PLACEHOLDER;
        return sendCachedPage(req, res, storePage(cacheKey, renderPage(shareTemplate, model, {}, req.path), user.user_id));
    } catch (err) {
        logWithRequest(req, {message: 'error rendering list', err});
        return res.status(500).send('An error occurred.');
    }
}

// The embed's bundle, served from a path we control so it can carry CORS —
// module scripts are fetched cors-mode, and /dist is served by Apache. The
// whole asset dir, not just the entry: the entry imports its chunks relatively.
// Filenames are content-hashed, hence immutable.
router.use('/e/dist', express.static(path.join(import.meta.dirname, '../public/dist/assets'), {
    immutable: true,
    maxAge: '1y',
    setHeaders: (res) => res.set('Access-Control-Allow-Origin', '*'),
}));

router.get('/e/:id', (req, res) => {
    renderEmberView(req, res);
});

async function renderEmberView(req, res) {
    const id = String(req.params.id).trim();

    if (!id) {
        res.status(400).send('No list specified!');
        return;
    }

    try {
        const user = await libraryForExternalId(id);

        if (!user) {
            res.status(400).send('Invalid list specified.');
            return;
        }

        const library = new Library();
        let list;

        if (typeof (user.library) === 'undefined') {
            logWithRequest(req, `Undefined user library with list ID ${id}`);
            return res.status(500).send('Unknown error.');
        }

        library.load(await applyCatalog(user.library));
        for (const i in library.lists) {
            if (library.lists[i].externalId && library.lists[i].externalId == id) {
                library.defaultListId = library.lists[i].id;
                list = library.lists[i];
                break;
            }
        }

        if (!list) { // List is in the DB but not the library
            res.status(400).send('Invalid list specified.');
            return;
        }

        const chartData = escape(JSON.stringify(list.renderChart('total', false)));

        const renderedCategories = renderLibrary(library, {
            itemTemplate: templates.t_itemShare,
            categoryTemplate: templates.t_categoryShare,
            optionalFields: list.optionalFields,
            unitSelectTemplate: templates.t_unitSelect,
            renderedDescription: marked(list.description),
            currencySymbol: library.currencySymbol,
        });

        const renderedTotals = renderLibraryTotals(library, templates.t_totals, templates.t_unitSelect);

        let model = {
            externalId: id,
            listName: list.name,
            chartData,
            renderedCategories,
            renderedTotals,
            optionalFields: list.optionalFields,
            renderedDescription: marked(list.description),
            baseUrl: config.get('deployUrl'),
            styles: shareStylesLinks,
            scripts: embedScriptUrls,
        };
        Object.assign(model, templates);
        model.renderedTemplate = escape(Mustache.render(embedTemplate, model));
        res.type('application/javascript');
        res.send(Mustache.render(embedJTemplate, model));
    } catch (err) {
        logWithRequest(req, {message: 'error rendering ember', err});
        return res.status(500).send('An error occurred.');
    }
}

router.get('/csv/:id', (req, res) => {
    renderListCSV(req, res);   
});

async function renderListCSV(req, res) {
    const id = req.params.id;

    if (!id) {
        res.status(400).send('No list specified!');
        return;
    }

    try {
        const user = await libraryForExternalId(id);

        if (!user) {
            res.status(400).send('Invalid list specified.');
            return;
        }

        const library = new Library();
        let list;

        if (typeof (user.library) === 'undefined') {
            logWithRequest(req, `Undefined user library with list ID ${id}`);
            return res.status(500).send('Unknown error.');
        }

        library.load(await applyCatalog(user.library));
        for (var i in library.lists) {
            if (library.lists[i].externalId && library.lists[i].externalId == id) {
                library.defaultListId = library.lists[i].id;
                list = library.lists[i];
                break;
            }
        }

        if (!list) {
            res.status(400).send('Invalid list specified.');
            return;
        }

        const out = listToCsv(library, list);

        let filename = list.name;
        if (!filename) filename = id;
        filename = filename.replace(/[^a-z0-9-]/gi, '_');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment;filename=${filename}.csv`);
        res.send(out);
    } catch (err) {
        logWithRequest(req, {message: 'error rendering csv', err});
        return res.status(500).send('An error occurred.');
    }
}

function init() {
    fs.readdir(path.join(import.meta.dirname, '../templates'), (err, files) => {
        if (err) {
            logger.error({message: 'Error loading templates', err});
        }
        files.filter((file) => (file.substr(0, 2) == 't_' && file.substr(-9) == '.mustache')).forEach((file) => {
            const fileShort = file.substr(0, file.length - 9);
            const data = fs.readFileSync(path.join(import.meta.dirname, '../templates/', file));
            templates[fileShort] = data.toString();
        });

        fs.readFile(path.join(import.meta.dirname, '../templates/share.mustache'), (err, data) => {
            if (!err) {
                shareTemplate = data.toString();
                shareTemplate = shareTemplate.replace(/\r?\n|\r/g, '');
            } else {
                logger.error({message: 'ERROR reading share.mustache', err});
            }
        });

        fs.readFile(path.join(import.meta.dirname, '../templates/embed.mustache'), (err, data) => {
            if (!err) {
                embedTemplate = data.toString();
                embedTemplate = embedTemplate.replace(/\r?\n|\r/g, '');
            } else {
                logger.error({message: 'ERROR reading embed.mustache', err});
            }
        });

        fs.readFile(path.join(import.meta.dirname, '../templates/embed.jmustache'), (err, data) => {
            if (!err) {
                embedJTemplate = data.toString();
            } else {
                logger.error({message: 'ERROR reading embed.jmustache', err});
            }
        });

        // fs.writeFile(filePath, data, function(err) {
        logger.info({message: 'views init complete.'});
    });
}

const renderItem = function (item, args) {
    let classes = '';
    if (args.classes) classes = args.classes;
    if (item.deleteIfEmpty) classes += ' deleteIfEmpty';

    let unit = item.authorUnit;
    if (args.unit) unit = args.unit;

    const displayWeight = weightUtils.MgToDisplayWeight(item.weight, unit);

    const displayPrice = item.price ? item.price.toFixed(2) : '0.00';

    const unitSelect = renderUnitSelect(unit, args.unitSelectTemplate, item.weight);

    const starClass = item.star ? `lpStar${item.star}` : '';
    const out = {
        classes, unit, displayWeight, unitSelect, showImages: args.showImages, showPrices: args.showPrices, starClass, displayPrice, currencySymbol: args.currencySymbol,
    };
    Object.assign(out, item);
    out.imageThumbUrl = thumbnailUrl(item.imageUrl);

    // Mustache escapes HTML but not URL schemes, so drop unsafe hrefs
    // (javascript:, data:, ...) before the item name is rendered as a link.
    if (out.url && !isSafeHref(out.url)) out.url = '';
    // Catalog gear still showing the catalog's link goes through /go, which
    // picks the affiliate or plain link per reader (server/affiliate.js).
    // Absolute, because embeds render this on other sites.
    if (out.url && item.catalogId && item.catalogSync) {
        out.url = `${config.get('deployUrl')}/go/${item.catalogId}?from=list`;
        out.sponsored = true;
    }

    // Photos and videos open in a lightbox (client/utils/lightbox.js).
    const photos = Array.isArray(item.photos) ? item.photos.filter((p) => /^\/userimages\//.test(p)) : [];
    out.photoCount = photos.length;
    out.photosJson = photos.length ? JSON.stringify(photos) : '';
    out.videoUrl = youTubeId(item.videoUrl) ? item.videoUrl : '';
    out.hasMedia = Boolean(photos.length || out.videoUrl);

    return Mustache.render(args.itemTemplate, out);
};

const renderCategory = function (category, args) {
    let items = '';
    for (const i in category.categoryItems) {
        const categoryItem = category.categoryItems[i];
        const item = category.library.getItemById(categoryItem.itemId);
        if (!item) continue; // defensive: skip a dangling itemId instead of throwing
        Object.assign(item, categoryItem);
        items += renderItem(item, args);
    }

    category.calculateSubtotal(args.listOptionalFields);
    category.subtotalWeightDisplay = weightUtils.MgToDisplayWeight(category.subtotalWeight, args.totalUnit);
    category.subtotalPriceDisplay = category.subtotalPrice ? category.subtotalPrice.toFixed(2) : '0.00';
    // Mirrors displayQty in utils-mixin.js.
    category.subtotalQtyDisplay = Math.round(category.subtotalQty * 100) / 100;
    let temp = Object.assign({}, category);
    Object.assign(temp, {
        items, subtotalUnit: args.totalUnit, currencySymbol: args.currencySymbol, showPrices: args.showPrices,
        groupClass: args.groupClass || '', groupId: args.groupId || '',
    });

    return Mustache.render(args.categoryTemplate, temp);
};

const renderList = function (list, args) {
    args.showPrices = list.optionalFields.price;
    args.showImages = list.optionalFields.images;
    args.listOptionalFields = list.optionalFields;
    let out = '';
    // Category groups (List.groups): a heading over each group's categories.
    for (const block of list.groupedCategories()) {
        if (!block.group) {
            out += renderCategory(block.categories[0], args);
            continue;
        }
        let members = '';
        block.categories.forEach((category, i) => {
            members += renderCategory(category, {
                ...args, groupId: block.group.id, groupClass: i === block.categories.length - 1 ? 'wgInGroup wgGroupLast' : 'wgInGroup',
            });
        });
        const weight = block.categories.reduce((sum, c) => sum + c.subtotalWeight, 0);
        out += Mustache.render(templates.t_groupShare, {
            id: block.group.id,
            name: block.group.name || 'Group',
            count: block.categories.length,
            countLabel: block.categories.length === 1 ? 'category' : 'categories',
            weight,
            weightDisplay: weightUtils.MgToDisplayWeight(weight, args.totalUnit),
            unit: args.totalUnit,
        }) + members;
    }
    return out;
};

var renderLibrary = function (library, args) {
    Object.assign(args, { itemUnit: library.itemUnit, totalUnit: library.totalUnit });
    return renderList(library.getListById(library.defaultListId), args);
};

const renderListTotals = function (list, totalsTemplate, unitSelectTemplate, unit) {
    let totalWeight = 0;
    let totalWornWeight = 0;
    let totalConsumableWeight = 0;
    let totalBaseWeight;
    let totalPackWeight;
    let totalQty = 0;
    let totalPrice = 0;
    let totalConsumablePrice = 0;
    const out = { categories: [] };

    for (const i in list.categoryIds) {
        const category = list.library.getCategoryById(list.categoryIds[i]);

        if (category) {
            category.calculateSubtotal(list.optionalFields);
            category.subtotalWeightDisplay = weightUtils.MgToDisplayWeight(category.subtotalWeight, unit);
            category.subtotalUnit = unit;

            totalWeight += category.subtotalWeight;
            totalPrice += category.subtotalPrice;
            totalWornWeight += category.subtotalWornWeight;
            totalConsumableWeight += category.subtotalConsumableWeight;
            totalConsumablePrice += category.subtotalConsumablePrice;
            totalQty += category.subtotalQty;
            out.categories.push(category);
        }
    }

    totalBaseWeight = totalWeight - (totalWornWeight + totalConsumableWeight);
    totalPackWeight = totalWeight - totalWornWeight;

    // The table's rows: categories, with each group's row over its own.
    const priceText = (n) => (n ? n.toFixed(2) : '0.00');
    out.rows = [];
    for (const block of list.groupedCategories()) {
        if (block.group) {
            const weight = block.categories.reduce((sum, c) => sum + c.subtotalWeight, 0);
            const price = block.categories.reduce((sum, c) => sum + c.subtotalPrice, 0);
            out.rows.push({
                isGroup: true,
                id: block.group.id,
                name: block.group.name || 'Group',
                displayColor: block.categories[0].displayColor,
                subtotalWeight: weight,
                subtotalWeightDisplay: weightUtils.MgToDisplayWeight(weight, unit),
                subtotalUnit: unit,
                subtotalPriceDisplay: priceText(price),
            });
        }
        for (const category of block.categories) {
            out.rows.push(Object.assign(Object.create(category), {
                isGroup: false, inGroup: Boolean(block.group), subtotalPriceDisplay: priceText(category.subtotalPrice),
            }));
        }
    }

    out.totalWeight = totalWeight;
    out.totalWeightDisplay = weightUtils.MgToDisplayWeight(totalWeight, unit);
    out.totalUnit = renderUnitSelect(unit, unitSelectTemplate, totalWeight);
    out.subtotalUnit = unit;
    out.totalWornWeight = totalWornWeight;
    out.totalWornWeightDisplay = weightUtils.MgToDisplayWeight(totalWornWeight, unit);
    out.totalConsumableWeight = totalConsumableWeight;
    out.totalConsumableWeightDisplay = weightUtils.MgToDisplayWeight(totalConsumableWeight, unit);
    out.totalBaseWeight = totalBaseWeight;
    out.totalBaseWeightDisplay = weightUtils.MgToDisplayWeight(totalBaseWeight, unit);
    out.shouldDisplayBaseWeight = totalBaseWeight !== totalWeight;
    out.totalPackWeight = totalPackWeight;
    out.totalPackWeightDisplay = weightUtils.MgToDisplayWeight(totalPackWeight, unit);
    out.showPackWeight = list.optionalFields.packWeight;
    out.totalQty = totalQty;
    out.totalPrice = totalPrice;
    out.totalPriceDisplay = totalPrice ? totalPrice.toFixed(2) : '';
    out.totalConsumablePrice = totalConsumablePrice;
    out.totalConsumablePriceDisplay = totalConsumablePrice ? totalConsumablePrice.toFixed(2) : '';
    out.showPrices = list.optionalFields.price;
    out.currencySymbol = list.library.currencySymbol;

    return Mustache.render(totalsTemplate, out);
};

var renderLibraryTotals = function (library, totalsTemplate, unitSelectTemplate) {
    return renderListTotals(library.getListById(library.defaultListId), totalsTemplate, unitSelectTemplate, library.totalUnit);
};

function renderUnitSelect(unit, unitSelectTemplate, weight) {
    const temp = { unit, units: [{ unit: 'oz', selected: (unit == 'oz') }, { unit: 'lb', selected: (unit == 'lb') }, { unit: 'g', selected: (unit == 'g') }, { unit: 'kg', selected: (unit == 'kg') }], weight };
    return Mustache.render(unitSelectTemplate, temp);
}

init();

export default router;
