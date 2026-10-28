import crypto from 'node:crypto';

import config from 'config';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';

import { logWithRequest } from './log.js';

// Per-request nonce for the few inline <script> blocks the server-rendered
// share page still has (templates/share.mustache). Everything else loads from
// this origin.
export function cspNonce(req, res, next) {
    res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
    next();
}

// Security headers. The CSP is only enforced when serving built assets: in
// dev, Vite's middleware injects its HMR client and websocket, and policing
// that buys nothing. CI and the e2e suite run against a build, so they
// exercise the policy as production sees it.
export function securityHeaders({ enforceCsp }) {
    return helmet({
        contentSecurityPolicy: enforceCsp
            ? {
                useDefaults: false,
                directives: {
                    defaultSrc: ["'self'"],
                    baseUri: ["'self'"],
                    objectSrc: ["'none'"],
                    formAction: ["'self'"],
                    frameAncestors: ["'self'"],
                    scriptSrc: ["'self'", (_req, res) => `'nonce-${res.locals.cspNonce}'`],
                    // Category swatches and legend colors are user-chosen and
                    // rendered as style attributes.
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    // Item photos can be any https URL the user pastes in.
                    imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
                    fontSrc: ["'self'"],
                    connectSrc: ["'self'"],
                    // Gear videos play in a lightbox, from YouTube's
                    // privacy-enhanced domain only.
                    frameSrc: ['https://www.youtube-nocookie.com'],
                    upgradeInsecureRequests: config.get('environment') === 'production' ? [] : null,
                },
            }
            : false,
        // Embeds (/e/:id) pull this site's stylesheets, fonts and item images
        // into other people's pages, so resources must be loadable cross-origin.
        crossOriginResourcePolicy: { policy: 'cross-origin' },
        // Helmet defaults to no-referrer, which would also blank the referrer
        // in our own access log. This is what browsers do by default anyway.
        referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
        // HSTS only means something behind TLS, which is production.
        strictTransportSecurity: config.get('environment') === 'production',
    });
}

// Brute-force protection for the endpoints that take a password or send
// email. Counts per client IP, which is correct because app.js trusts exactly
// one proxy hop. In-memory, so the limit is per process; put a shared store
// behind it if you ever run more than one instance.
//
// Must be mounted after the body parsers: authenticateUser (server/auth.js)
// accepts a username and password in the body of *any* authenticated POST,
// so limiting /signin alone would leave every other endpoint open as a
// password-guessing oracle. Any request carrying a password counts.
export function authRateLimit() {
    const opts = config.get('rateLimit');
    if (!opts.enabled) {
        return (_req, _res, next) => next();
    }
    return rateLimit({
        windowMs: Number(opts.authWindowMinutes) * 60 * 1000,
        limit: Number(opts.authMaxPerWindow),
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        skip: (req) => req.method !== 'POST'
            || !(rateLimitedPaths.includes(req.path) || (req.body && req.body.password)),
        handler: (req, res, _next, options) => {
            logWithRequest(req, { message: 'rate limited', url: req.originalUrl });
            res.status(options.statusCode).json({
                message: 'Too many attempts. Please wait a few minutes and try again.',
            });
        },
    });
}

export const rateLimitedPaths = [
    '/signin',
    '/register',
    '/forgotPassword',
    '/forgotUsername',
    '/resetPassword',
    '/account',
    '/delete-account',
];
