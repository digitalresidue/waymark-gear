// Follow: an activity timeline of the hikers you follow, newest first, all of
// them in one stream (client/views/follow.vue at /follow).
//
// What shows, and from where:
//   published   a list they published (public_kits.published_at)
//   shakedown   a list they asked to have shaken down (public_kits.shakedown_at)
//   pack        gear added to or taken out of a published list, and its base
//               weight before and after (pack_updates, written on save)
//   trip        a trip journal they shared (trips.shared_at)
//   entry       a day added to a shared trip (trip_entries.created_at)
//   review      a gear review they wrote (gear_reviews.created_at)
//
// Only what the follower may already see: published lists, public trips and
// trips shared with followers, reviews that aren't hidden. Read live from
// those tables, so a list unpublished or a trip made private leaves the
// timeline at once. Members can keep their updates out of timelines
// altogether (users.share_activity); hidden profiles never show.
//
// While it's being tried out, only the site owner sees Follow; the owner
// opens it to everyone from the page itself (site_settings.follow_feed).
//
// Limits, so it stays quick as the site grows:
//   - The timeline goes back 12 months (HISTORY_DAYS). Older updates are
//     still on each backpacker's profile, lists and trips; the timeline is
//     for what's new. It also keeps every page of it cheap: each source is
//     read newest-first through an index on (who, when), never scanned.
//   - pack_updates, the one thing kept only for the timeline, is trimmed to
//     the same 12 months once a day (schedulePackUpdatePrune).
//   - A member follows at most MAX_FOLLOWING backpackers (server/follows.js).
//   - A page is 30 updates (60 at most).

import knex from './db.js';
import { canUseStage, isStage, seesEarly } from './early-access.js';

export class ActivityError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}

// ---- who can use it -------------------------------------------------------------------

// Follow's stage (server/early-access.js): the owner only, Supporters
// first (early access), or every member. Saved before stages as
// { open: true|false }, which reads as everyone|owner.
const SETTING = 'follow_feed';
let stage = 'owner';
let loadedAt = 0;

async function refreshOpen() {
    try {
        const row = await knex('site_settings').where({ key: SETTING }).first('value');
        const v = (row && row.value) || {};
        stage = isStage(v.stage) ? v.stage : (v.open ? 'everyone' : 'owner');
    } catch {
        // No table yet (first start): stays with the owner.
    }
    loadedAt = Date.now();
}

/** Follow's stage. Cached for a minute (several instances). */
export function followFeedStage() {
    if (Date.now() - loadedAt > 60_000) {
        loadedAt = Date.now();
        refreshOpen();
    }
    return stage;
}

/** Is Follow open to every member? */
export function followFeedOpen() {
    return followFeedStage() === 'everyone';
}

export async function followFeedState() {
    await refreshOpen();
    return { open: stage === 'everyone', stage };
}

export async function setFollowFeedStage(value) {
    const next = isStage(value) ? value : 'owner';
    await knex('site_settings').insert({ key: SETTING, value: JSON.stringify({ stage: next, open: next === 'everyone' }), updated_at: knex.fn.now() })
        .onConflict('key').merge();
    return followFeedState();
}

export function setFollowFeedOpen(value) {
    return setFollowFeedStage(value ? 'everyone' : 'owner');
}

/** Can this member use Follow? The owner always; Supporters from early access; everyone once it's open. */
export function canFollowFeed(user) {
    return canUseStage(followFeedStage(), user);
}

/** Is this member seeing Follow early, as a Supporter? */
export function followFeedEarly(user) {
    return seesEarly(followFeedStage(), user);
}

function requireAccess(user) {
    // A 404, not a 403, while it's being tried out: nothing to see here yet.
    if (!canFollowFeed(user)) throw new ActivityError('Not found.', 404);
}

// ---- recording pack changes -----------------------------------------------------------

// Edits within this long of the last change to the same list fold into one
// update, so tuning a list over an evening is one entry, not twenty.
const FOLD_MS = 12 * 60 * 60 * 1000;
const MAX_NAMES = 50;

/**
 * Called from syncPublishedKits when an already-published list's gear
 * changed. Items are [[itemId, name], ...]; without the earlier ones (a list
 * saved before this existed) only the weight change is told.
 */
export async function recordPackUpdate(trx, { userId, externalId, beforeItems, afterItems, baseBeforeMg, baseAfterMg }) {
    const was = new Map((beforeItems || []).map(([id, name]) => [String(id), name]));
    const now = new Map((afterItems || []).map(([id, name]) => [String(id), name]));
    const added = beforeItems ? [...now].filter(([id]) => !was.has(id)) : [];
    const removed = beforeItems ? [...was].filter(([id]) => !now.has(id)) : [];

    const last = await trx('pack_updates').where({ external_id: externalId })
        .where('updated_at', '>', new Date(Date.now() - FOLD_MS)).orderBy('updated_at', 'desc').first();
    if (!last) {
        if (!added.length && !removed.length && baseBeforeMg === baseAfterMg) return;
        await trx('pack_updates').insert({
            user_id: userId,
            external_id: externalId,
            added: JSON.stringify(added.slice(0, MAX_NAMES)),
            removed: JSON.stringify(removed.slice(0, MAX_NAMES)),
            base_before_mg: baseBeforeMg ?? null,
            base_after_mg: baseAfterMg ?? null,
        });
        return;
    }
    // Fold in: something added then taken out again cancels, and so on.
    const a = new Map((last.added || []).map(([id, name]) => [String(id), name]));
    const r = new Map((last.removed || []).map(([id, name]) => [String(id), name]));
    for (const [id, name] of added) {
        if (r.has(id)) r.delete(id);
        else a.set(id, name);
    }
    for (const [id, name] of removed) {
        if (a.has(id)) a.delete(id);
        else r.set(id, name);
    }
    if (!a.size && !r.size && Number(last.base_before_mg) === baseAfterMg) {
        await trx('pack_updates').where({ id: last.id }).del();
        return;
    }
    await trx('pack_updates').where({ id: last.id }).update({
        added: JSON.stringify([...a].slice(0, MAX_NAMES)),
        removed: JSON.stringify([...r].slice(0, MAX_NAMES)),
        base_after_mg: baseAfterMg ?? null,
        updated_at: trx.fn.now(),
    });
}

// ---- the timeline ---------------------------------------------------------------------

const PAGE = 30;
export const HISTORY_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;
const excerpt = (s, n) => {
    const t = String(s || '').replace(/[#*_>`[\]]/g, '').replace(/\s+/g, ' ').trim();
    return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};
const day = (d) => (d ? (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10)) : null);
const photoList = (p) => (Array.isArray(p) ? p : []).map((x) => (typeof x === 'string' ? x : x && x.url)).filter((u) => typeof u === 'string' && u.startsWith('/userimages/'));

// The people this member follows whose updates may show.
function followees(user) {
    return knex('follows').join('users', 'users.user_id', 'follows.followee_id')
        .where('follows.follower_id', user.user_id)
        .where('users.profile_hidden', false)
        .where('users.share_activity', true)
        .select('users.user_id');
}

/**
 * The timeline, newest first. `before` (an ISO time from the last page's
 * `next`) pages back.
 */
export async function timeline(user, { before, limit = PAGE } = {}) {
    requireAccess(user);
    const n = Math.min(Math.max(Number(limit) || PAGE, 1), 60);
    const until = before && !Number.isNaN(Date.parse(before)) ? new Date(before) : new Date(Date.now() + 60_000);
    const since = new Date(Date.now() - HISTORY_DAYS * DAY_MS);
    const who = followees(user);

    const [published, shakedowns, packs, trips, entries, reviews] = await Promise.all([
        knex('public_kits as k').whereIn('k.user_id', who).where('k.published_at', '<', until).where('k.published_at', '>', since)
            .leftJoin('trails as t', 't.id', 'k.trail_id')
            .select('k.*', 't.name as trail_name', 't.slug as trail_slug', 'k.published_at as at')
            .orderBy('k.published_at', 'desc').limit(n),
        knex('public_kits as k').whereIn('k.user_id', who).whereNotNull('k.shakedown_at').where('k.shakedown_at', '<', until).where('k.shakedown_at', '>', since)
            .select('k.external_id', 'k.user_id', 'k.name', 'k.base_weight_mg', 'k.item_count', 'k.shakedown_at as at')
            .orderBy('k.shakedown_at', 'desc').limit(n),
        knex('pack_updates as u').join('public_kits as k', 'k.external_id', 'u.external_id')
            .whereIn('u.user_id', who).where('u.updated_at', '<', until).where('u.updated_at', '>', since)
            .select('u.*', 'k.name', 'k.item_count', 'k.weight_class', 'u.updated_at as at')
            .orderBy('u.updated_at', 'desc').limit(n),
        knex('trips as t').whereIn('t.user_id', who).whereIn('t.visibility', ['public', 'followers'])
            .whereRaw('coalesce(t.shared_at, t.created_at) < ?', [until])
            .whereRaw('coalesce(t.shared_at, t.created_at) > ?', [since])
            .select('t.*', knex.raw('coalesce(t.shared_at, t.created_at) as at'),
                knex.raw('(select count(*) from trip_entries e where e.trip_id = t.id) as entry_count'))
            .orderByRaw('coalesce(t.shared_at, t.created_at) desc').limit(n),
        knex('trip_entries as e').join('trips as t', 't.id', 'e.trip_id')
            .whereIn('t.user_id', who).whereIn('t.visibility', ['public', 'followers']).where('e.created_at', '<', until).where('e.created_at', '>', since)
            .select('e.*', 't.user_id', 't.title as trip_title', 't.start_date', 'e.created_at as at')
            .orderBy('e.created_at', 'desc').limit(n),
        knex('gear_reviews as r').join('catalog_items as c', 'c.id', 'r.catalog_id')
            .whereIn('r.author_id', who).whereNull('r.hidden_at').where('r.created_at', '<', until).where('r.created_at', '>', since)
            .select('r.*', 'r.author_id as user_id', 'c.name as gear_name', 'c.brand', 'c.image_url', 'r.created_at as at')
            .orderBy('r.created_at', 'desc').limit(n),
    ]);

    const items = [
        ...published.map((k) => ({
            kind: 'published',
            userId: k.user_id,
            at: k.at,
            list: {
                externalId: k.external_id,
                name: k.name,
                description: excerpt(k.description, 220),
                baseWeightMg: Number(k.base_weight_mg),
                itemCount: k.item_count,
                weightClass: k.weight_class,
                tripType: k.trip_type || '',
                categories: (k.categories || []).slice(0, 8),
                trail: k.trail_name ? { name: k.trail_name, slug: k.trail_slug } : null,
            },
        })),
        ...shakedowns.map((k) => ({
            kind: 'shakedown',
            userId: k.user_id,
            at: k.at,
            list: { externalId: k.external_id, name: k.name, baseWeightMg: Number(k.base_weight_mg), itemCount: k.item_count },
        })),
        ...packs.map((u) => ({
            kind: 'pack',
            userId: u.user_id,
            at: u.at,
            list: { externalId: u.external_id, name: u.name, itemCount: u.item_count, weightClass: u.weight_class },
            added: (u.added || []).map(([, name]) => name).filter(Boolean),
            removed: (u.removed || []).map(([, name]) => name).filter(Boolean),
            baseBeforeMg: u.base_before_mg === null ? null : Number(u.base_before_mg),
            baseAfterMg: u.base_after_mg === null ? null : Number(u.base_after_mg),
        })),
        ...trips.map((t) => ({
            kind: 'trip',
            userId: t.user_id,
            at: t.at,
            trip: {
                id: Number(t.id),
                title: t.title,
                summary: excerpt(t.summary, 280),
                startDate: day(t.start_date),
                endDate: day(t.end_date),
                coverUrl: String(t.cover_url || '').startsWith('/userimages/') ? t.cover_url : '',
                entryCount: Number(t.entry_count),
                followersOnly: t.visibility === 'followers',
            },
        })),
        ...entries.map((e) => ({
            kind: 'entry',
            userId: e.user_id,
            at: e.at,
            trip: { id: Number(e.trip_id), title: e.trip_title },
            entry: {
                id: Number(e.id),
                title: e.title,
                date: day(e.entry_date),
                day: e.entry_date && e.start_date ? Math.round((Date.parse(day(e.entry_date)) - Date.parse(day(e.start_date))) / 86400000) + 1 : null,
                body: excerpt(e.body, 320),
                photos: photoList(e.photos).slice(0, 4),
                distanceKm: e.distance_km === null ? null : Number(e.distance_km),
            },
        })),
        ...reviews.map((r) => ({
            kind: 'review',
            userId: r.user_id,
            at: r.at,
            review: {
                catalogId: r.catalog_id,
                gear: r.gear_name,
                brand: r.brand || '',
                imageUrl: String(r.image_url || '').startsWith('/userimages/') ? r.image_url : '',
                rating: r.rating,
                title: r.title,
                body: excerpt(r.body, 260),
            },
        })),
    ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, n);

    // Who each update is from.
    const ids = [...new Set(items.map((i) => i.userId))];
    const people = ids.length
        ? new Map((await knex('users').whereIn('user_id', ids).select('user_id', 'username', 'display_name', 'avatar_url'))
            .map((u) => [u.user_id, { username: u.username, displayName: u.display_name || '', avatarUrl: u.avatar_url || '' }]))
        : new Map();
    const following = Number((await knex('follows').where({ follower_id: user.user_id }).count({ c: '*' }))[0].c);

    return {
        items: items.map(({ userId, at, ...rest }) => ({ ...rest, at: new Date(at).toISOString(), by: people.get(userId) || null }))
            .filter((i) => i.by),
        // Another page if this one was full.
        next: items.length === n ? new Date(items[items.length - 1].at).toISOString() : null,
        following,
        historyDays: HISTORY_DAYS,
    };
}

// ---- keeping it trim -------------------------------------------------------------------

/** Pack updates older than the timeline's window: nothing shows them. */
export async function prunePackUpdates(db = knex) {
    return db('pack_updates').where('updated_at', '<', new Date(Date.now() - HISTORY_DAYS * DAY_MS)).del();
}

/** Once a day (and ten minutes after start), on each instance; deletes are idempotent. */
export function schedulePackUpdatePrune(logger) {
    const run = async () => {
        try {
            const removed = await prunePackUpdates();
            if (removed) logger.info({ message: 'pack updates pruned', removed });
        } catch (err) {
            logger.error({ message: 'pack update prune failed', err });
        }
    };
    setTimeout(run, 10 * 60 * 1000).unref();
    setInterval(run, DAY_MS).unref();
}

// ---- finding people to follow ---------------------------------------------------------

/**
 * Hikers with something public to follow (a published list or a public
 * trip), most recently active first; or, with `q`, those whose username or
 * name starts with it. Leaves out the viewer and the people they already
 * follow.
 *
 * Built to stay quick with a big membership: candidates come from walking
 * the newest lists and trips (or the name indexes), and only the 24 shown
 * get their counts.
 */
export async function discover(user, { q = '' } = {}) {
    requireAccess(user);
    const query = String(q || '').trim().toLowerCase().slice(0, 60);
    const SHOW = 24;
    const skip = new Set([user.user_id, ...await knex('follows').where({ follower_id: user.user_id }).pluck('followee_id')]);

    let ids;
    if (query) {
        const prefix = `${query.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
        const rows = await knex('users')
            .where('profile_hidden', false)
            .where((w) => w.whereRaw('lower(username) like ?', [prefix]).orWhereRaw("lower(display_name) like ?", [prefix]))
            .orderByRaw('lower(username)')
            .limit(400)
            .pluck('user_id');
        ids = rows.filter((id) => !skip.has(id));
    } else {
        // Whoever published or updated a list, or shared a trip, most recently.
        const [kits, trips] = await Promise.all([
            knex('public_kits').orderBy('updated_at', 'desc').limit(600).select('user_id', 'updated_at as at'),
            knex('trips').where('visibility', 'public').orderBy('updated_at', 'desc').limit(600).select('user_id', 'updated_at as at'),
        ]);
        const seen = new Set();
        ids = [...kits, ...trips].sort((x, y) => new Date(y.at) - new Date(x.at))
            .map((r) => r.user_id)
            .filter((id) => !skip.has(id) && !seen.has(id) && seen.add(id));
    }
    if (!ids.length) return { people: [] };

    const rows = await knex('users as u')
        .whereIn('u.user_id', ids.slice(0, SHOW * 3))
        .where('u.profile_hidden', false)
        .select('u.user_id', 'u.username', 'u.display_name', 'u.avatar_url', 'u.trail_name',
            knex.raw('(select count(*) from public_kits k where k.user_id = u.user_id) as packs'),
            knex.raw("(select count(*) from trips t where t.user_id = u.user_id and t.visibility = 'public') as trips"),
            knex.raw('(select count(*) from follows f where f.followee_id = u.user_id) as followers'));
    const order = new Map(ids.map((id, i) => [id, i]));
    const people = rows
        // Something public to follow, searched for or not.
        .filter((r) => Number(r.packs) || Number(r.trips))
        .sort((x, y) => order.get(x.user_id) - order.get(y.user_id))
        .slice(0, SHOW);
    return {
        people: people.map((r) => ({
            username: r.username,
            displayName: r.display_name || '',
            avatarUrl: r.avatar_url || '',
            trailName: r.trail_name || '',
            packs: Number(r.packs),
            trips: Number(r.trips),
            followers: Number(r.followers),
        })),
    };
}

// ---- your own terms -------------------------------------------------------------------

export async function settings(user) {
    requireAccess(user);
    const row = await knex('users').where({ user_id: user.user_id }).first('share_activity');
    return { shareActivity: row ? row.share_activity !== false : true };
}

export async function saveSettings(user, input = {}) {
    requireAccess(user);
    await knex('users').where({ user_id: user.user_id }).update({ share_activity: input.shareActivity !== false });
    return settings(user);
}
