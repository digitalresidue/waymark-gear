import path from 'path';
import fs from 'fs';
import express from 'express';
import Mustache from 'mustache';
import { Marked } from 'marked';
import { thumbnailUrl } from './images.js';
import config from 'config';
import { logWithRequest, logger } from './log.js';
import weightUtils from '../client/utils/weight.js';
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
import { getById as catalogItem, isUuid } from './catalog.js';

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
    { path: '/explore' },
    { path: '/owner/catalog' },
    { path: '/owner/kits' },
    { path: '/register' },
    { path: '/forgot-password' },
    { path: '/reset-password/:token' },
    { path: '/moderation' },
    { path: '/trips' },
    { path: '/trips/:id' },
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
    const source = fs.readFileSync(path.join(import.meta.dirname, '..', doc.file), 'utf8');
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
let sitemap = { xml: '', built: 0 };
const xmlEscape = (v) => String(v).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

router.get('/sitemap.xml', async (req, res) => {
    try {
        if (!sitemap.xml || Date.now() - sitemap.built > 30 * 60 * 1000) {
            const base = config.get('deployUrl');
            const kits = await knex('public_kits').select('external_id', 'updated_at').orderBy('updated_at', 'desc').limit(40000);
            const people = await knex('public_kits').join('users', 'users.user_id', 'public_kits.user_id')
                .where('users.profile_hidden', false)
                .groupBy('users.username').select('users.username').max({ updated_at: 'public_kits.updated_at' }).limit(9000);
            const url = (loc, lastmod) => `<url><loc>${xmlEscape(loc)}</loc>${lastmod ? `<lastmod>${new Date(lastmod).toISOString()}</lastmod>` : ''}</url>`;
            sitemap = {
                built: Date.now(),
                xml: [
                    '<?xml version="1.0" encoding="UTF-8"?>',
                    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
                    url(`${base}/welcome`),
                    url(`${base}/explore`),
                    ...kits.map((k) => url(`${base}/r/${k.external_id}`, k.updated_at)),
                    ...people.map((p) => url(`${base}/@${p.username}`, p.updated_at)),
                    '</urlset>',
                ].join('\n'),
            };
        }
        res.set('Cache-Control', 'public, max-age=1800');
        res.type('application/xml').send(sitemap.xml);
    } catch (err) {
        logWithRequest(req, { message: 'error building sitemap', err });
        res.status(500).end();
    }
});

// ---- link-preview images -----------------------------------------------------

// What a list's preview card shows. `library` must have `list` totals computed.
function listCard(library, list, username, avatarUrl = '') {
    const categories = list.categoryIds.map((cid) => library.getCategoryById(cid)).filter(Boolean)
        .map((c) => ({ weightMg: c.subtotalWeight - c.subtotalWornWeight - c.subtotalConsumableWeight }));
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
        const html = Mustache.render(profileTemplate, model, { kitCard: templates.t_kitCard || '' });
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
        sendFresh(res, Mustache.render(tripTemplate, model));
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
                average: summary.average,
                stars: summary.average ? STARS(Math.round(summary.average)) : '',
                countLabel: `${summary.count} ${summary.count === 1 ? 'review' : 'reviews'}`,
                kitCount,
                kitCountLabel: `${kitCount} public ${kitCount === 1 ? 'list' : 'lists'}`,
                searchName: encodeURIComponent(item.name),
                reviews: reviews.map(reviewModel),
            },
        };
        sendFresh(res, Mustache.render(gearTemplate, model, { reviewCard: templates.t_reviewCard || '' }));
    } catch (err) {
        logWithRequest(req, { message: 'error rendering gear page', err });
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
        sendFresh(res, Mustache.render(gearTemplate, model, { reviewCard: templates.t_reviewCard || '' }));
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
            ogImage: `${config.get('deployUrl')}/og/r/${id}.png?v=${listImageVersion(listCard(library, list, user.username, user.avatar_url))}`,
            baseWeight: formatWeightMg(list.totalBaseWeight, 'lb'),
            weightClass: (WEIGHT_CLASSES.find((c) => c.id === weightClassFor(list.totalBaseWeight)) || {}).label,
            itemCount: list.categoryIds.reduce((n, cid) => n + ((library.getCategoryById(cid) || { categoryItems: [] }).categoryItems.length), 0),
            deployUrl: config.get('deployUrl'),
            metaDescription: `${list.name || 'A gear list'} by @${user.username}: ${formatWeightMg(list.totalBaseWeight, 'lb')} base weight. Built with Waymark Gear.`,
        };

        Object.assign(model, templates);
        model.cspNonce = NONCE_PLACEHOLDER;
        return sendCachedPage(req, res, storePage(cacheKey, Mustache.render(shareTemplate, model), user.user_id));
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

    // Photos and review videos open in a lightbox (client/utils/lightbox.js).
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
    });

    return Mustache.render(args.categoryTemplate, temp);
};

const renderList = function (list, args) {
    args.showPrices = list.optionalFields.price;
    args.showImages = list.optionalFields.images;
    args.listOptionalFields = list.optionalFields;
    let out = '';
    for (const i in list.categoryIds) {
        const category = list.library.getCategoryById(list.categoryIds[i]);
        if (category) out += renderCategory(category, args);
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
    let totalBaseWeight = 0;
    let totalPackWeight = 0;
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
