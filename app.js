import http from 'http';

import config from 'config';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';

import knex from './server/db.js';
import { logger } from './server/log.js';
import endpoints from './server/endpoints.js';
import moderationEndpoints from './server/moderation-endpoints.js';
import apiEndpoints from './server/api.js';
import apiV1 from './server/api-v1.js';
import mcp from './server/mcp.js';
import oauth from './server/oauth.js';
import billing, { webhookHandler as stripeWebhook } from './server/billing.js';
import affiliate from './server/affiliate.js';
import brands from './server/brands.js';
import headTags, { injectHeadTags, loadHeadTags } from './server/head-tags.js';
import googleAuth from './server/google.js';
import views, { hasBuiltAssets } from './server/views.js';
import { authRateLimit, cspNonce, securityHeaders } from './server/security.js';

// Backstop: a rejected promise that escapes a handler (e.g. a transient DB
// error on a detached async call) would otherwise terminate the process on
// modern Node. Log it and keep serving.
process.on('unhandledRejection', (err) => {
    logger.error({ message: 'Unhandled promise rejection', err: { message: err?.message, stack: err?.stack } });
});

// Apply pending schema migrations before taking traffic. Knex's lock table
// makes this safe when several instances start together.
if (config.get('migrateOnStart')) {
    const [batch, applied] = await knex.migrate.latest();
    if (applied.length) {
        logger.info({ message: `Applied migrations (batch ${batch})`, migrations: applied });
    }
}

const app = express();
app.disable('x-powered-by');

// Trust exactly as many X-Forwarded-For hops as there are proxies in front of
// node (config trustProxy / TRUST_PROXY; default 1, for nginx). Trusting more
// than that lets the client pick its own req.ip: anyone could forge the
// address in the access log below, and the per-IP rate limit would be a header
// away from useless. Exposed directly with no proxy, set it to 0; with a CDN
// ahead of nginx, 2.
app.set('trust proxy', Number(config.get('trustProxy')));

app.use((req, res, next) => {
    req.uuid = uuidv4();
    const startTime = Date.now();
    res.on('finish', () => {
        logger.info({
            requestid: req.uuid,
            'remote-addr': req.ip,
            method: req.method,
            'http-version': `${req.httpVersionMajor}.${req.httpVersionMinor}`,
            'user-agent': req.headers['user-agent'],
            url: req.originalUrl,
            status: res.statusCode,
            referrer: req.headers.referer || req.headers.referrer,
            'content-length': res.getHeader('content-length'),
            'response-time': Date.now() - startTime,
            username: req.lighterpackusername,
        });
    });
    next();
});

// Liveness/readiness for Docker and load balancers. Answers before any other
// middleware so a probe never touches sessions or static files.
app.get('/healthz', async (_req, res) => {
    try {
        await knex.raw('select 1');
        res.set('Cache-Control', 'no-store').json({ status: 'ok' });
    } catch {
        res.status(503).set('Cache-Control', 'no-store').json({ status: 'unavailable' });
    }
});

app.use(cspNonce);
app.use(securityHeaders({ enforceCsp: hasBuiltAssets }));

const oneDay = 86400000;

app.use((req, _res, next) => {
    req.cookies = {};
    for (const part of (req.headers.cookie || '').split(';')) {
        const [key, ...val] = part.trim().split('=');
        if (!key) continue;
        try {
            req.cookies[decodeURIComponent(key)] = decodeURIComponent(val.join('='));
        } catch {
            // A malformed %-sequence in someone else's cookie on this domain
            // shouldn't turn every request into a 500.
        }
    }
    next();
});

// The whole library travels in one request (see /saveLibrary), so this has
// to stay generous; 10mb is far above any real library and far below the
// 50mb this used to allow.
const bodyLimit = config.get('jsonBodyLimit');
// Stripe signs the exact bytes it sends, so this one reads the raw body.
app.post('/stripe/webhook', express.raw({ type: 'application/json', limit: '1mb' }), stripeWebhook);
app.use(express.json({ limit: bodyLimit }));
app.use(express.urlencoded({ extended: true, limit: bodyLimit }));

app.use(authRateLimit());

app.use(express.static(`${import.meta.dirname}/public/`, { maxAge: oneDay }));

// The owner's verification <meta> tags (Owner → Revenue), in every page.
await loadHeadTags();
app.use(injectHeadTags);

const server = http.createServer(app);

// Dev without a build: run Vite in-process so its modules and HMR socket share
// this origin. A production box with a failed build must fall through to the
// broken-asset path rather than quietly start compiling source on demand.
if (!hasBuiltAssets && config.get('environment') !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
        root: import.meta.dirname,
        appType: 'custom',
        server: { middlewareMode: true, hmr: { server } },
    });
    app.use(vite.middlewares);
}

app.use('/', apiV1);
app.use('/', mcp);
app.use('/', oauth);
app.use('/', billing);
app.use('/', affiliate);
app.use('/', brands);
app.use('/', headTags);
app.use('/', endpoints);
app.use('/', moderationEndpoints);
app.use('/', apiEndpoints);
app.use('/', googleAuth);
app.use('/', views);

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    const status = err.status || err.statusCode || 500;
    logger.error({
        requestid: req.uuid,
        message: 'Unhandled request error',
        status,
        err: { message: err.message, stack: err.stack, type: err.type },
        url: req.originalUrl,
        method: req.method,
    });
    if (res.headersSent) return;
    if (status === 413) {
        return res.status(413).json({ message: 'That request is too large.' });
    }
    if (status < 500) {
        return res.status(status).json({ message: 'Invalid request.' });
    }
    return res.status(500).json({ message: 'An unexpected error occurred.' });
});

logger.info({ message: 'Starting up Waymark Gear...' });
server.listen(config.get('port'), () => {
    logger.info({ message: `Listening on ${config.get('port')}` });
});

// Docker and most process managers send SIGTERM and wait a few seconds before
// killing. Stop accepting connections, let in-flight saves finish, close the
// pool, then exit.
let shuttingDown = false;
function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ message: `${signal} received, shutting down` });
    const force = setTimeout(() => process.exit(1), 10_000);
    force.unref();
    server.close(async () => {
        await knex.destroy().catch(() => {});
        process.exit(0);
    });
    server.closeIdleConnections();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
