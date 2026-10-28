// JSON API for the gear catalog, Explore, and the site owner's screens.
//
// Public:  GET /api/config, /api/catalog, /api/catalog/categories,
//          /api/explore/featured, /api/explore/kits, /api/explore/common
// Owner:   /api/admin/catalog (CRUD, CSV import/export), /api/admin/kits

import express from 'express';

import * as catalog from './catalog.js';
import { libraryForExternalId } from './library-store.js';
import { Library } from '../client/dataTypes.js';
import * as kits from './kits.js';
import config from 'config';
import rateLimit from 'express-rate-limit';
import {
    authenticateAdmin, authenticateUser, authenticateModerator, optionalUser,
} from './auth.js';
import * as comments from './comments.js';
import * as follows from './follows.js';
import * as tickets from './tickets.js';
import * as plans from './shared-lists.js';
import * as trips from './trips.js';
import * as reviews from './reviews.js';
import { listInsights } from './insights.js';
import * as tokens from './tokens.js';
import * as trails from './trails.js';
import { openStream } from './live.js';
import { LibraryError } from './library-store.js';
import { forgetUserPages } from './page-cache.js';
import { KINDS as NOTIFY_KINDS, preferences as notifyPreferences, cleanPreferences } from './notify.js';
import { mailEnabled } from './mail.js';
import knex from './db.js';
import { youTubeId, TRIP_TYPES } from '../client/utils/gear-meta.js';
import { profileForEditing, updateProfile, ProfileError } from './profiles.js';
import { googleEnabled } from './google.js';
import { logWithRequest } from './log.js';
import { importFromLighterPack, importRateLimit, ImportError } from './lighterpack.js';

const router = express.Router();

// Owner endpoints that change data only accept JSON. Browsers can't send a
// cross-site JSON body without a CORS preflight this server never answers,
// which closes off form-based request forgery on top of SameSite cookies.
function requireJson(req, res, next) {
    if (!req.is('application/json')) {
        return res.status(415).json({ message: 'Send JSON.' });
    }
    next();
}

const admin = (handler) => (req, res) => authenticateAdmin(req, res, async (req, res, user) => {
    try {
        await handler(req, res, user);
    } catch (err) {
        logWithRequest(req, { message: 'admin api error', url: req.originalUrl, err });
        if (!res.headersSent) res.status(500).json({ message: 'An error occurred.' });
    }
});

const pub = (handler) => async (req, res) => {
    try {
        await handler(req, res);
    } catch (err) {
        logWithRequest(req, { message: 'api error', url: req.originalUrl, err });
        if (!res.headersSent) res.status(500).json({ message: 'An error occurred.' });
    }
};

const validClass = (c) => kits.WEIGHT_CLASSES.some((w) => w.id === c);

// ---- your profile ----------------------------------------------------------

const signedIn = (handler) => (req, res) => authenticateUser(req, res, async (req, res, user) => {
    try {
        await handler(req, res, user);
    } catch (err) {
        if (err instanceof ProfileError) return res.status(400).json({ message: err.message, field: err.field });
        if (err instanceof LibraryError) return res.status(400).json({ message: err.message });
        if (err instanceof comments.CommentError || err instanceof follows.FollowError || err instanceof tickets.TicketError || err instanceof plans.PlanError
            || err instanceof trips.TripError || err instanceof reviews.ReviewError || err instanceof tokens.TokenError || err instanceof trails.TrailError) {
            return res.status(err.status).json({ message: err.message });
        }
        logWithRequest(req, { message: 'api error', url: req.originalUrl, err });
        if (!res.headersSent) res.status(500).json({ message: 'An error occurred.' });
    }
});

router.get('/api/profile', signedIn(async (req, res, user) => {
    res.set('Cache-Control', 'no-store');
    res.json(await profileForEditing(user));
}));

router.put('/api/profile', requireJson, signedIn(async (req, res, user) => {
    res.json(await updateProfile(user, req.body || {}));
}));

// ---- comments, shakedowns, notifications ----------------------------------

const commentLimit = config.get('rateLimit').enabled
    ? rateLimit({
        windowMs: 10 * 60 * 1000,
        limit: 20,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        handler: (req, res, _next, options) => res.status(options.statusCode).json({ message: "You're commenting fast. Give it a few minutes." }),
    })
    : (_req, _res, next) => next();

router.get('/api/kits/:id/comments', pub(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        res.json(await comments.listComments(String(req.params.id), await optionalUser(req)));
    } catch (err) {
        if (err instanceof comments.CommentError) return res.status(err.status).json({ message: err.message });
        throw err;
    }
}));

router.post('/api/kits/:id/comments', requireJson, commentLimit, signedIn(async (req, res, user) => {
    res.status(201).json(await comments.addComment(user, String(req.params.id), req.body || {}));
}));

router.patch('/api/comments/:id', requireJson, signedIn(async (req, res, user) => {
    res.json(await comments.editComment(user, req.params.id, req.body && req.body.body));
}));

router.delete('/api/comments/:id', signedIn(async (req, res, user) => {
    res.json(await comments.deleteComment(user, req.params.id));
}));

router.post('/api/comments/:id/report', requireJson, commentLimit, signedIn(async (req, res, user) => {
    res.json(await comments.reportComment(user, req.params.id, req.body && req.body.reason));
}));

router.get('/api/notifications', signedIn(async (req, res, user) => {
    res.set('Cache-Control', 'no-store');
    res.json(await comments.notificationsFor(user, req.query.limit));
}));

router.post('/api/notifications/read', requireJson, signedIn(async (req, res, user) => {
    res.json(await comments.markNotificationsRead(user));
}));

const moderator = (handler) => (req, res) => authenticateModerator(req, res, async (req, res, user) => {
    try {
        await handler(req, res, user);
    } catch (err) {
        if (err instanceof comments.CommentError || err instanceof tickets.TicketError) return res.status(err.status).json({ message: err.message });
        logWithRequest(req, { message: 'moderation api error', url: req.originalUrl, err });
        if (!res.headersSent) res.status(500).json({ message: 'An error occurred.' });
    }
});

router.get('/api/moderation/comments', moderator(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ reports: await comments.openReports() });
}));

router.post('/api/moderation/comments/:id', requireJson, moderator(async (req, res, user) => {
    res.json(await comments.moderateComment(user, req.params.id, String((req.body && req.body.action) || '')));
}));

// ---- follows, votes, settings, tickets, videos (Phase 4) ------------------

const publicJson = (handler) => pub(async (req, res) => {
    try {
        await handler(req, res);
    } catch (err) {
        if (err.status && err.message) return res.status(err.status).json({ message: err.message });
        throw err;
    }
});

router.get('/api/users/:username/follow', publicJson(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(await follows.followState(await optionalUser(req), req.params.username));
}));

router.post('/api/users/:username/follow', requireJson, commentLimit, signedIn(async (req, res, user) => {
    res.json(await follows.follow(user, req.params.username));
}));

router.delete('/api/users/:username/follow', signedIn(async (req, res, user) => {
    res.json(await follows.unfollow(user, req.params.username));
}));

router.get('/api/following', signedIn(async (req, res, user) => {
    res.set('Cache-Control', 'no-store');
    res.json({ following: await follows.followingList(user) });
}));

router.get('/api/kits/:id/votes', pub(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const viewer = await optionalUser(req);
    res.json(await kits.voteSummary(String(req.params.id), viewer && viewer.user_id));
}));

router.post('/api/kits/:id/vote', requireJson, commentLimit, signedIn(async (req, res, user) => {
    const result = await kits.castVote(user, String(req.params.id), req.body && req.body.value);
    if (result.error) return res.status(result.status).json({ message: result.error });
    res.json(result);
}));

router.get('/api/notifications/settings', signedIn(async (req, res, user) => {
    res.set('Cache-Control', 'no-store');
    const prefs = notifyPreferences(user);
    res.json({
        emailAvailable: mailEnabled(),
        kinds: Object.entries(NOTIFY_KINDS).map(([kind, spec]) => ({ kind, label: spec.label, ...prefs[kind] })),
    });
}));

router.put('/api/notifications/settings', requireJson, signedIn(async (req, res, user) => {
    const prefs = cleanPreferences(req.body && req.body.prefs);
    const anyEmail = Object.values(prefs).some((p) => p.email);
    await knex('users').where({ user_id: user.user_id }).update({ notify_prefs: JSON.stringify(prefs), notify_email: anyEmail });
    res.json({ ok: true });
}));

router.put('/api/preferences', requireJson, signedIn(async (req, res, user) => {
    const theme = req.body && req.body.theme;
    if (!['system', 'light', 'dark'].includes(theme)) return res.status(400).json({ message: 'Theme is system, light or dark.' });
    await knex('users').where({ user_id: user.user_id }).update({ theme_pref: theme });
    res.json({ theme });
}));

const ticketLimit = config.get('rateLimit').enabled
    ? rateLimit({
        windowMs: 60 * 60 * 1000,
        limit: 10,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        handler: (req, res, _next, options) => res.status(options.statusCode).json({ message: "You've sent a lot of reports. Try again later." }),
    })
    : (_req, _res, next) => next();

router.post('/api/tickets', requireJson, ticketLimit, publicJson(async (req, res) => {
    res.status(201).json(await tickets.fileTicket(await optionalUser(req), req.body || {}));
}));

router.get('/api/staff/tickets', moderator(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(await tickets.listTickets({ status: String(req.query.status || 'active') }));
}));

router.patch('/api/staff/tickets/:id', requireJson, moderator(async (req, res) => {
    res.json(await tickets.updateTicket(req.params.id, req.body || {}));
}));

// A gear video was opened in the lightbox: count it. One count per IP per
// video per hour is plenty precise for "how often is this watched".
const recentViews = new Map();
router.post('/api/videos/:id/view', pub(async (req, res) => {
    const id = youTubeId(`https://youtu.be/${req.params.id}`);
    if (!id) return res.status(404).json({ message: 'Unknown video.' });
    const key = `${req.ip}|${id}`;
    const now = Date.now();
    let row;
    if ((recentViews.get(key) || 0) > now - 60 * 60 * 1000) {
        row = await knex('video_views').where({ video_id: id }).first();
    } else {
        recentViews.set(key, now);
        if (recentViews.size > 50000) recentViews.clear();
        [row] = await knex('video_views').insert({ video_id: id, views: 1 })
            .onConflict('video_id').merge({ views: knex.raw('video_views.views + 1') }).returning('*');
    }
    res.json({ views: row ? Number(row.views) : 0 });
}));

// ---- planning together (Phase 5) -------------------------------------------

router.get('/api/live', signedIn(async (req, res, user) => {
    openStream(req, res, user);
}));

router.get('/api/plans', signedIn(async (req, res, user) => {
    res.set('Cache-Control', 'no-store');
    res.json({ sharedWithMe: await plans.sharedWithMe(user) });
}));

router.get('/api/plan/:owner/:listId', signedIn(async (req, res, user) => {
    const { owner, list, role } = await plans.planAccess(user, req.params.owner, req.params.listId);
    const { sync_token: syncToken } = await knex('users').where({ user_id: owner.user_id }).first('sync_token');
    res.set('Cache-Control', 'no-store');
    res.json({
        owner: owner.username,
        listId: Number(list.id),
        role,
        syncToken: Number(syncToken),
        members: await plans.members(owner.user_id, list.id),
        library: await plans.loadPlan(owner.user_id, list.id),
    });
}));

router.post('/api/plan/:owner/:listId/changes', requireJson, signedIn(async (req, res, user) => {
    const { owner, list } = await plans.planAccess(user, req.params.owner, req.params.listId);
    const result = await plans.applyPlanChanges(owner.user_id, list.id, req.body && req.body.changes);
    forgetUserPages(owner.user_id);
    plans.announceLibraryChange(owner.user_id, owner.username, user.username).catch(() => {});
    res.json(result);
}));

router.get('/api/plan/:owner/:listId/members', signedIn(async (req, res, user) => {
    const { owner, list } = await plans.planAccess(user, req.params.owner, req.params.listId);
    res.set('Cache-Control', 'no-store');
    res.json({ members: await plans.members(owner.user_id, list.id) });
}));

router.post('/api/plan/:owner/:listId/members', requireJson, signedIn(async (req, res, user) => {
    const { list, role } = await plans.planAccess(user, req.params.owner, req.params.listId);
    if (role !== 'owner') return res.status(403).json({ message: 'Only the list owner can invite people.' });
    res.json({ members: await plans.invite(user, list.id, req.body && req.body.username) });
}));

router.delete('/api/plan/:owner/:listId/members/:username', signedIn(async (req, res, user) => {
    res.json({ members: await plans.removeMember(user, req.params.owner, req.params.listId, req.params.username) });
}));

// ---- trip journals and gear reviews (Phase 6) ------------------------------

router.get('/api/trips', signedIn(async (req, res, user) => {
    res.set('Cache-Control', 'no-store');
    res.json({ trips: await trips.myTrips(user) });
}));

router.post('/api/trips', requireJson, signedIn(async (req, res, user) => {
    res.status(201).json(await trips.createTrip(user, req.body || {}));
}));

// Anyone may read a trip they're allowed to see; the owner gets it for editing.
router.get('/api/trips/:id', publicJson(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const viewer = await optionalUser(req);
    const view = await trips.viewTrip(req.params.id, viewer);
    if (!view) return res.status(404).json({ message: 'That trip could not be found.' });
    const { ownerId, ...rest } = view;
    res.json({ ...rest, mine: Boolean(viewer && viewer.user_id === ownerId) });
}));

router.put('/api/trips/:id', requireJson, signedIn(async (req, res, user) => {
    res.json(await trips.updateTrip(user, req.params.id, req.body || {}));
}));

router.delete('/api/trips/:id', signedIn(async (req, res, user) => {
    res.json(await trips.deleteTrip(user, req.params.id));
}));

router.post('/api/trips/:id/entries', requireJson, signedIn(async (req, res, user) => {
    res.status(201).json(await trips.addEntry(user, req.params.id, req.body || {}));
}));

router.put('/api/trips/:id/entries/:entryId', requireJson, signedIn(async (req, res, user) => {
    res.json(await trips.updateEntry(user, req.params.id, req.params.entryId, req.body || {}));
}));

router.delete('/api/trips/:id/entries/:entryId', signedIn(async (req, res, user) => {
    res.json(await trips.deleteEntry(user, req.params.id, req.params.entryId));
}));

router.get('/api/users/:username/trips', publicJson(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const owner = await knex('users').whereRaw('lower(username) = ?', [String(req.params.username).toLowerCase()]).first('user_id');
    if (!owner) return res.status(404).json({ message: 'No such hiker.' });
    res.json({ trips: await trips.tripsOnProfile(owner.user_id, await optionalUser(req)) });
}));

router.get('/api/reviews', pub(async (req, res) => {
    res.set('Cache-Control', 'public, max-age=60');
    res.json({ reviews: await reviews.latestReviews({ limit: req.query.limit }) });
}));

router.get('/api/reviews/ratings', pub(async (req, res) => {
    res.set('Cache-Control', 'public, max-age=60');
    res.json(await reviews.ratingsFor(String(req.query.ids || '').split(',').slice(0, 200)));
}));

router.get('/api/catalog/:id/reviews', pub(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(await reviews.reviewsFor(String(req.params.id), await optionalUser(req)));
}));

router.post('/api/catalog/:id/reviews', requireJson, commentLimit, signedIn(async (req, res, user) => {
    res.json(await reviews.saveReview(user, String(req.params.id), req.body || {}));
}));

router.delete('/api/reviews/:id', signedIn(async (req, res, user) => {
    res.json(await reviews.deleteReview(user, req.params.id));
}));

router.post('/api/reviews/:id/moderate', requireJson, signedIn(async (req, res, user) => {
    res.json(await reviews.moderateReview(user, req.params.id, String((req.body && req.body.action) || '')));
}));

// ---- gear insights (Phase 7) -----------------------------------------------

// Lighter alternatives and favorites for the rows of one list. Works without
// an account, like the rest of the editor.
router.post('/api/insights', requireJson, pub(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(await listInsights(req.body && req.body.items));
}));

// ---- API tokens (Phase 7) ----------------------------------------------------

router.get('/api/tokens', signedIn(async (req, res, user) => {
    res.set('Cache-Control', 'no-store');
    res.json({ tokens: await tokens.listTokens(user) });
}));

router.post('/api/tokens', requireJson, signedIn(async (req, res, user) => {
    res.set('Cache-Control', 'no-store');
    res.status(201).json(await tokens.createToken(user, { name: req.body && req.body.name, scope: req.body && req.body.scope }));
}));

router.delete('/api/tokens/:id', signedIn(async (req, res, user) => {
    res.json(await tokens.revokeToken(user, req.params.id));
}));

// ---- trails (Phase 8) -----------------------------------------------------------

router.get('/api/trails/search', pub(async (req, res) => {
    res.set('Cache-Control', 'public, max-age=60');
    res.json({ trails: await trails.searchTrails(String(req.query.q || '').slice(0, 80), req.query.limit) });
}));

router.get('/api/trails/top', pub(async (req, res) => {
    res.set('Cache-Control', 'public, max-age=60');
    res.json({ trails: await trails.topTrails(req.query.limit) });
}));

// A trail the list's name points to, to suggest tagging it.
router.get('/api/trails/match', pub(async (req, res) => {
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ trail: await trails.matchName(String(req.query.name || '').slice(0, 300)) });
}));

router.get('/api/trails/mine', signedIn(async (req, res, user) => {
    res.set('Cache-Control', 'no-store');
    res.json({ trails: await trails.myTrails(user.user_id) });
}));

const trailAdmin = (handler) => admin(async (req, res, user) => {
    try {
        await handler(req, res, user);
    } catch (err) {
        if (err instanceof trails.TrailError) return res.status(err.status).json({ message: err.message });
        throw err;
    }
});

router.get('/api/admin/trails', trailAdmin(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ trails: await trails.ownerTrails(), suggestions: await trails.suggestions() });
}));

router.post('/api/admin/trails', requireJson, trailAdmin(async (req, res) => {
    res.status(201).json({ id: await trails.createTrail(req.body || {}) });
}));

router.put('/api/admin/trails/:id', requireJson, trailAdmin(async (req, res) => {
    res.json({ id: await trails.updateTrail(req.params.id, req.body || {}) });
}));

router.delete('/api/admin/trails/:id', trailAdmin(async (req, res) => {
    res.json(await trails.deleteTrail(req.params.id));
}));

router.post('/api/admin/trails/suggestions/:action', requireJson, trailAdmin(async (req, res) => {
    const name = String((req.body && req.body.name) || '').trim();
    if (!name) return res.status(400).json({ message: 'Which suggestion?' });
    if (req.params.action === 'approve') return res.json({ id: await trails.approveSuggestion(name, req.body || {}) });
    if (req.params.action === 'merge') return res.json({ id: await trails.mergeSuggestion(name, req.body && req.body.trailId) });
    if (req.params.action === 'ignore') return res.json(await trails.ignoreSuggestion(name));
    res.status(404).json({ message: 'Unknown action.' });
}));

// ---- public ----------------------------------------------------------------

// Read a public LighterPack list from its share link. Returns the parsed list;
// the browser adds it to the library like any other edit, so this works the
// same for signed-in and account-less users.
router.post('/api/import/lighterpack', requireJson, importRateLimit(), async (req, res) => {
    try {
        const list = await importFromLighterPack(String((req.body && req.body.url) || '').slice(0, 500));
        res.set('Cache-Control', 'no-store');
        res.json(list);
    } catch (err) {
        if (err instanceof ImportError) return res.status(err.status).json({ message: err.message });
        logWithRequest(req, { message: 'lighterpack import error', err });
        res.status(500).json({ message: 'An error occurred.' });
    }
});

router.get('/api/config', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ googleEnabled: googleEnabled(), weightClasses: kits.WEIGHT_CLASSES.map(({ id, label, range }) => ({ id, label, range })) });
});

router.get('/api/catalog', pub(async (req, res) => {
    const ids = req.query.ids ? String(req.query.ids).split(',').slice(0, 200) : undefined;
    const result = await catalog.search({
        q: String(req.query.q || '').slice(0, 200),
        category: String(req.query.category || '').slice(0, 80),
        limit: req.query.limit,
        offset: req.query.offset,
        ids,
    });
    res.set('Cache-Control', 'public, max-age=60');
    res.json({ ...result, items: result.items.map(catalog.publicEntry) });
}));

router.get('/api/catalog/categories', pub(async (req, res) => {
    res.set('Cache-Control', 'public, max-age=60');
    res.json({ categories: await catalog.categories() });
}));

router.get('/api/explore/featured', pub(async (req, res) => {
    const weightClass = String(req.query.class || 'ul');
    if (!validClass(weightClass)) return res.status(400).json({ message: 'Unknown weight class.' });
    res.set('Cache-Control', 'public, max-age=60');
    res.json({ kits: await kits.featuredKits({ weightClass, limit: req.query.limit }) });
}));

router.get('/api/explore/kits', pub(async (req, res) => {
    const weightClass = req.query.class ? String(req.query.class) : undefined;
    if (weightClass && !validClass(weightClass)) return res.status(400).json({ message: 'Unknown weight class.' });
    // "Following" is personal: never cached, needs a signed-in reader.
    let followerId = null;
    if (req.query.following === '1') {
        const viewer = await optionalUser(req);
        if (!viewer) return res.status(401).json({ message: 'Sign in to see hikers you follow.' });
        followerId = viewer.user_id;
        res.set('Cache-Control', 'no-store');
    } else {
        res.set('Cache-Control', 'public, max-age=60');
    }
    res.json(await kits.listKits({
        followerId,
        weightClass,
        q: String(req.query.q || '').slice(0, 200),
        shakedownOnly: req.query.shakedown === '1',
        tripType: TRIP_TYPES.includes(req.query.trip) ? req.query.trip : undefined,
        sort: String(req.query.sort || 'featured'),
        limit: req.query.limit,
        offset: req.query.offset,
    }));
}));

router.get('/api/explore/common', pub(async (req, res) => {
    res.set('Cache-Control', 'public, max-age=300');
    res.json(await kits.commonGear({ category: String(req.query.category || '').slice(0, 80), limit: req.query.limit }));
}));

// A shared list as data, for "Copy to my lists". Anything with a share link
// is already viewable by anyone holding it, so this exposes nothing more.
router.get('/api/kits/:externalId', pub(async (req, res) => {
    const id = String(req.params.externalId).trim().slice(0, 40);
    const row = await libraryForExternalId(id);
    if (!row) return res.status(404).json({ message: 'That list could not be found.' });
    const library = new Library();
    library.load(await catalog.applyCatalog(row.library));
    const list = library.lists.find((l) => l.externalId === id);
    if (!list) return res.status(404).json({ message: 'That list could not be found.' });
    const categories = list.categoryIds.map((cid) => library.getCategoryById(cid)).filter(Boolean).map((c) => ({
        name: c.name,
        items: c.categoryItems.map((ci) => {
            const item = library.getItemById(ci.itemId);
            if (!item) return null;
            return {
                name: item.name,
                description: item.description,
                weight: item.weight,
                authorUnit: item.authorUnit,
                price: item.price,
                url: item.url,
                imageUrl: item.imageUrl,
                catalogId: item.catalogId || '',
                qty: ci.qty,
                worn: ci.worn,
                consumable: ci.consumable,
            };
        }).filter(Boolean),
    }));
    res.set('Cache-Control', 'public, max-age=60');
    res.json({ name: list.name, username: row.username, categories });
}));

// ---- owner: catalog ----------------------------------------------------------

router.get('/api/admin/catalog', admin(async (req, res) => {
    const status = ['published', 'draft'].includes(req.query.status) ? req.query.status : 'all';
    res.json(await catalog.search({
        q: String(req.query.q || '').slice(0, 200),
        category: String(req.query.category || '').slice(0, 80),
        status,
        limit: req.query.limit || 100,
        offset: req.query.offset,
    }));
}));

router.get('/api/admin/catalog/categories', admin(async (req, res) => {
    res.json({ categories: await catalog.categories({ includeDrafts: true }) });
}));

router.post('/api/admin/catalog', requireJson, admin(async (req, res, user) => {
    const { value, errors } = catalog.validateEntry(req.body || {});
    if (errors.length) return res.status(400).json({ errors });
    try {
        const item = await catalog.create(value);
        logWithRequest(req, { message: 'catalog item created', id: item.id, username: user.username });
        return res.status(201).json({ item });
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ errors: ['That SKU is already in the catalog.'] });
        throw err;
    }
}));

router.put('/api/admin/catalog/:id', requireJson, admin(async (req, res, user) => {
    const { value, errors } = catalog.validateEntry(req.body || {});
    if (errors.length) return res.status(400).json({ errors });
    try {
        const item = await catalog.update(req.params.id, value);
        if (!item) return res.status(404).json({ message: 'Not found.' });
        logWithRequest(req, { message: 'catalog item updated', id: item.id, username: user.username });
        return res.json({ item });
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ errors: ['That SKU is already in the catalog.'] });
        throw err;
    }
}));

router.delete('/api/admin/catalog/:id', admin(async (req, res, user) => {
    const removed = await catalog.remove(req.params.id);
    if (!removed) return res.status(404).json({ message: 'Not found.' });
    logWithRequest(req, { message: 'catalog item deleted', id: req.params.id, username: user.username });
    res.json({ message: 'success' });
}));

const csvHeaders = (res, filename) => {
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${filename}"`);
    res.set('Cache-Control', 'no-store');
};

router.get('/api/admin/catalog/export.csv', admin(async (req, res) => {
    const { items } = await catalog.search({ status: 'all', limit: 200, offset: 0 });
    // search() caps a page at 200; walk the rest.
    let all = items;
    for (let offset = 200; all.length === offset; offset += 200) {
        const next = await catalog.search({ status: 'all', limit: 200, offset });
        all = all.concat(next.items);
        if (!next.items.length) break;
    }
    csvHeaders(res, `waymark-catalog-${new Date().toISOString().slice(0, 10)}.csv`);
    res.send(catalog.toCsv(all));
}));

router.get('/api/admin/catalog/template.csv', admin(async (req, res) => {
    csvHeaders(res, 'waymark-catalog-template.csv');
    res.send(catalog.templateCsv());
}));

router.post('/api/admin/catalog/import/preview', requireJson, admin(async (req, res) => {
    const plan = await catalog.planImport(String(req.body?.csv || ''));
    if (plan.error) return res.status(400).json({ message: plan.error });
    // The client doesn't need the parsed values back, only what will happen.
    res.json({
        summary: plan.summary,
        rows: plan.rows.map(({ line, action, name, errors }) => ({ line, action, name, errors })),
    });
}));

router.post('/api/admin/catalog/import/apply', requireJson, admin(async (req, res, user) => {
    const result = await catalog.applyImport(String(req.body?.csv || ''));
    if (result.error) return res.status(400).json({ message: result.error });
    logWithRequest(req, { message: 'catalog import applied', summary: result.summary, username: user.username });
    res.json(result);
}));

// ---- owner: featured kits -----------------------------------------------------

router.get('/api/admin/kits', admin(async (req, res) => {
    const weightClass = req.query.class && validClass(req.query.class) ? req.query.class : undefined;
    res.json(await kits.listKits({
        weightClass,
        q: String(req.query.q || '').slice(0, 200),
        featuredOnly: req.query.featured === '1',
        limit: req.query.limit || 50,
        offset: req.query.offset,
    }));
}));

router.put('/api/admin/kits/:externalId', requireJson, admin(async (req, res, user) => {
    const kit = await kits.setFeatured(req.params.externalId, {
        featured: req.body?.featured,
        featuredRank: req.body?.featuredRank,
    });
    if (!kit) return res.status(404).json({ message: 'Not found.' });
    logWithRequest(req, { message: 'kit featured flag changed', externalId: kit.externalId, featured: kit.featured, username: user.username });
    res.json({ kit });
}));

export default router;
