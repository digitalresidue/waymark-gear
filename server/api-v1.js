// Public REST API, version 1. Authenticated with a personal token:
//   Authorization: Bearer wg_...
// Read tokens can GET; write tokens can also POST/PATCH/DELETE.
// Documented in API.md.

import express from 'express';
import config from 'config';
import rateLimit from 'express-rate-limit';

import * as gear from './gear-api.js';
import { bearer, userForToken } from './tokens.js';
import { logWithRequest } from './log.js';

const router = express.Router();

const limit = config.get('rateLimit').enabled
    ? rateLimit({
        windowMs: 60 * 1000,
        limit: 120,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        keyGenerator: (req) => bearer(req) || req.ip,
        handler: (req, res, _next, options) => res.status(options.statusCode).json({ error: 'rate_limited', message: 'Slow down: 120 requests a minute.' }),
    })
    : (_req, _res, next) => next();

export async function tokenAuth(req, res, next) {
    const auth = await userForToken(bearer(req)).catch(() => null);
    if (!auth) {
        res.set('WWW-Authenticate', 'Bearer realm="waymark"');
        return res.status(401).json({ error: 'unauthorized', message: 'Send a valid token: Authorization: Bearer wg_…' });
    }
    if (req.method !== 'GET' && auth.scope !== 'write') {
        return res.status(403).json({ error: 'read_only', message: 'This token can only read. Make a write token to change gear.' });
    }
    req.apiUser = auth.user;
    next();
}

const handle = (fn) => async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        res.json(await fn(req, req.apiUser));
    } catch (err) {
        if (err instanceof gear.GearApiError) return res.status(err.status).json({ error: 'bad_request', message: err.message });
        logWithRequest(req, { message: 'api v1 error', url: req.originalUrl, err });
        if (!res.headersSent) res.status(500).json({ error: 'server_error', message: 'An error occurred.' });
    }
};

const json = express.json({ limit: '100kb' });

router.use('/api/v1', limit, tokenAuth);

router.get('/api/v1/me', handle((req, user) => gear.me(user)));
router.get('/api/v1/gear', handle((req, user) => gear.closet(user, { include: String(req.query.include || 'owned'), q: String(req.query.q || '') }).then((g) => ({ gear: g }))));
router.post('/api/v1/gear', json, handle((req, user) => gear.addGear(user, req.body || {})));
router.patch('/api/v1/gear/:id', json, handle((req, user) => gear.updateGear(user, req.params.id, req.body || {})));
router.get('/api/v1/lists', handle((req, user) => gear.lists(user).then((l) => ({ lists: l }))));
router.post('/api/v1/lists', json, handle((req, user) => gear.createList(user, req.body || {})));
router.get('/api/v1/lists/:id', handle((req, user) => gear.listDetail(user, req.params.id)));
router.get('/api/v1/lists/:id/check', handle((req, user) => gear.checkList(user, req.params.id)));
router.post('/api/v1/lists/:id/items', json, handle((req, user) => gear.addToList(user, req.params.id, req.body || {})));
router.delete('/api/v1/lists/:id/items/:gearId', handle((req, user) => gear.removeFromList(user, req.params.id, req.params.gearId)));
router.get('/api/v1/catalog', handle((req) => gear.searchCatalog({ q: req.query.q, category: req.query.category, limit: req.query.limit, query: req.query }).then((c) => ({ items: c }))));

router.use('/api/v1', (req, res) => res.status(404).json({ error: 'not_found', message: 'No such endpoint. See API.md.' }));

export default router;
