// The homepage for visitors who aren't signed in (waymarkgear.com/). It's
// rendered here, not by the app, so search engines read the whole page: the
// app shell has nothing in it until JavaScript runs. Signed-in members (and
// anyone with an account-less library in this browser) get the app at / as
// before; /welcome stays the community page.
//
// Everything on it is the same for every visitor, so the live parts (trail
// stats, counts, shakedown requests) are worked out at most once a minute.

import knex from './db.js';
import * as trails from './trails.js';
import { listKits } from './kits.js';
import { trailIndex } from './trails-index.js';

// The weight classes as the page names them. Ultra-UL is "super ultralight"
// here: it's what people search for.
export const LANDING_CLASSES = [
    { id: 'sul', name: 'Super ultralight (SUL)', short: 'SUL', range: 'Under 5 lb', blurb: 'Tarps, frameless packs, thin pads and every gram counted. The catalog has the real weights, so the numbers add up.' },
    { id: 'ul', name: 'Ultralight', short: 'ultralight', range: 'Under 10 lb', blurb: 'The thru-hiker sweet spot. Find lighter options for your big three and see the grams saved before you buy.' },
    { id: 'lw', name: 'Lightweight', short: 'lightweight', range: '10 to 20 lb', blurb: 'Comfort and a lighter pack. Most weekend backpacking trips land here, and a shakedown often finds a few easy pounds.' },
    { id: 'trad', name: 'Traditional backpacking', short: 'traditional', range: '20 lb and up', blurb: 'Framed packs, roomy tents, winter trips and family hikes. Plan food and water by day and know what every person carries.' },
];

// The FAQ: shown on the page and given to search engines as FAQPage data,
// so the two always match.
export const LANDING_FAQ = [
    {
        q: 'What is base weight in backpacking?',
        a: "Base weight is the weight of your pack and everything in it, minus consumables (food, water, fuel) and what you wear. It's the number hikers compare because it stays the same from the first day of a trip to the last.",
    },
    {
        q: 'What counts as ultralight or super ultralight?',
        a: 'Ultralight usually means a base weight under 10 lb (4.5 kg). Super ultralight, or SUL, is under 5 lb (2.3 kg). Lightweight is 10 to 20 lb, and traditional backpacking is anything over 20 lb. Waymark Gear shows your class as you build your list.',
    },
    {
        q: 'How do I make a backpacking gear list?',
        a: "Start with the big three (pack, shelter, sleep system), then clothing, cooking, water and the essentials. On Waymark Gear you can copy a list hikers published for your trail, pick each item from a catalog with real weights, and mark what's worn or consumable.",
    },
    {
        q: 'Is Waymark Gear really free?',
        a: "Yes. Every feature is free, with no paywalls and no trial. It's open source too. The optional Supporter plan removes affiliate links and adds a badge; it doesn't unlock anything.",
    },
    {
        q: 'Can I import my LighterPack or PackWizard list?',
        a: 'Yes. Paste a LighterPack share link or upload a CSV from either app. Categories, weights, quantities, worn and consumable items all come across.',
    },
    {
        q: 'Does it work on my phone on the trail?',
        a: 'Yes. Add waymarkgear.com to your home screen and use Pack mode to check items off as you pack. It works offline.',
    },
];

const TTL_MS = 60 * 1000;
let cached = null;

const safe = (p, fallback) => p.catch(() => fallback);

async function load() {
    const [top, stats, all, kitCount, catalogCount, classRows, shakedowns] = await Promise.all([
        safe(trails.topTrails(6), []),
        safe(trails.packStats(), new Map()),
        safe(trails.allTrails(), []),
        safe(knex('public_kits').count({ n: '*' }).first().then((r) => Number(r.n)), 0),
        safe(knex('catalog_items').where({ status: 'published' }).count({ n: '*' }).first().then((r) => Number(r.n)), 0),
        safe(knex('public_kits').groupBy('weight_class').select('weight_class').count({ n: '*' }), []),
        safe(listKits({ shakedownOnly: true, sort: 'needsHelp', limit: 3 }).then((r) => r.kits), []),
    ]);
    const byClass = Object.fromEntries(classRows.map((r) => [r.weight_class, Number(r.n)]));
    // Loaded by topTrails above; a trail name is a nicety, so none is fine.
    let index = null;
    try {
        index = trailIndex();
    } catch {
        index = null;
    }
    return {
        trails: top.map((t) => ({ ...t, avgBaseWeightMg: (stats.get(t.id) || {}).avgBaseWeightMg || null })),
        trailCount: all.length,
        kitCount,
        catalogCount,
        byClass,
        shakedowns: shakedowns.map((k) => {
            const trail = index && k.trailId ? index.byId.get(k.trailId) : null;
            return { ...k, trailName: trail ? trail.short || trail.name : '' };
        }),
    };
}

/** The live parts of the homepage, at most a minute old. */
export async function landingData(now = Date.now()) {
    if (cached && now - cached.at < TTL_MS) return cached.data;
    const data = await load();
    cached = { at: now, data };
    return data;
}

/** For tests: forget the cached data. */
export function resetLandingCache() {
    cached = null;
}

// Query parameters that mean "open the app" (the dashboard reads them):
// importing, copying a shared list, starting an account-less list, the
// Google sign-up return. Tracking parameters (utm_*, gclid...) don't.
const APP_PARAMS = ['import', 'copy', 'start', 'welcome', 'list', 'shared'];

/**
 * Should / show the app instead of the homepage? Yes for a signed-in
 * browser (session cookie), one with an account-less library (wg_local,
 * set by the app), or a link that asks the app to do something.
 */
export function wantsApp(req) {
    const c = req.cookies || {};
    if (c.lp || c.lp_loggedin || c.wg_local) return true;
    return APP_PARAMS.some((k) => req.query && req.query[k] !== undefined);
}
