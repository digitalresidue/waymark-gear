// "Sign in with Waymark Gear" for AI assistants (OAuth 2.1 for MCP).
//
// An assistant such as Claude or ChatGPT finds us through the 401 from /mcp,
// reads the metadata below, registers itself (dynamic client registration),
// sends the person to /oauth/authorize, where they sign in and choose read
// or read-and-write, then trades the one-time code (with PKCE) for a token.
// The token is an ordinary API token (server/tokens.js): listed on the
// /developers page and revoked there.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import express from 'express';
import config from 'config';
import { renderPage } from './site-chrome.js';
import rateLimit from 'express-rate-limit';

import knex from './db.js';
import { optionalUser } from './auth.js';
import { createToken, hashToken } from './tokens.js';
import { shareAssets } from './views.js';
import { NONCE_PLACEHOLDER } from './page-cache.js';
import { logWithRequest } from './log.js';

const router = express.Router();
const consentTemplate = fs.readFileSync(path.join(import.meta.dirname, '../templates/oauth-consent.mustache'), 'utf8');
const CODE_TTL_MS = 10 * 60 * 1000;
const base = () => config.get('deployUrl');

const limit = config.get('rateLimit').enabled
    ? rateLimit({ windowMs: 60 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false })
    : (_req, _res, next) => next();

// Metadata and token endpoints are called by assistants' servers or
// browsers, without cookies: allow any origin.
function open(req, res, next) {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, MCP-Protocol-Version');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
}

export function protectedResource() {
    return {
        resource: `${base()}/mcp`,
        authorization_servers: [base()],
        scopes_supported: ['read', 'write'],
        bearer_methods_supported: ['header'],
        resource_name: 'Waymark Gear',
        resource_documentation: `${base()}/developers`,
    };
}

export function authorizationServer() {
    return {
        issuer: base(),
        authorization_endpoint: `${base()}/oauth/authorize`,
        token_endpoint: `${base()}/oauth/token`,
        registration_endpoint: `${base()}/oauth/register`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none'],
        scopes_supported: ['read', 'write'],
    };
}

for (const p of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp']) {
    router.all(p, open, (req, res) => res.json(protectedResource()));
}
router.all('/.well-known/oauth-authorization-server', open, (req, res) => res.json(authorizationServer()));

// Redirects go back to the assistant: https anywhere, or http on this
// computer (desktop apps and command-line tools listen on localhost).
export function validRedirect(uri) {
    try {
        const u = new URL(uri);
        if (u.hash) return false;
        if (u.protocol === 'https:') return true;
        return u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
    } catch {
        return false;
    }
}

router.options('/oauth/register', open);
router.post('/oauth/register', open, limit, async (req, res) => {
    const body = req.body || {};
    const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.map(String).slice(0, 10) : [];
    if (!uris.length || !uris.every(validRedirect)) {
        return res.status(400).json({ error: 'invalid_redirect_uri', error_description: 'redirect_uris must be https, or http on localhost.' });
    }
    const name = Array.from(String(body.client_name || 'AI assistant')).filter((c) => c.charCodeAt(0) >= 0x20).join('').trim().slice(0, 60) || 'AI assistant';
    const clientId = `wgc_${crypto.randomBytes(16).toString('hex')}`;
    await knex('oauth_clients').insert({ client_id: clientId, name, redirect_uris: JSON.stringify(uris) });
    res.status(201).json({
        client_id: clientId,
        client_name: name,
        redirect_uris: uris,
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code'],
        response_types: ['code'],
    });
});

const PARAMS = ['client_id', 'redirect_uri', 'state', 'code_challenge', 'code_challenge_method', 'scope', 'resource'];

async function checkRequest(q) {
    const client = await knex('oauth_clients').where({ client_id: String(q.client_id || '') }).first();
    if (!client) return { error: 'Unknown app. Try connecting again from your assistant.' };
    const uri = String(q.redirect_uri || '');
    if (!client.redirect_uris.includes(uri)) return { error: "That app's return address doesn't match what it registered." };
    if (q.response_type !== undefined && q.response_type !== 'code') return { client, redirect: { error: 'unsupported_response_type' } };
    if (!/^[A-Za-z0-9._~-]{43,128}$/.test(String(q.code_challenge || '')) || q.code_challenge_method !== 'S256') {
        return { client, redirect: { error: 'invalid_request', error_description: 'PKCE with S256 is required.' } };
    }
    return { client };
}

function backTo(uri, params) {
    const u = new URL(uri);
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') u.searchParams.set(k, v);
    return u.toString();
}

// Ties the consent form to this signed-in session, so another site can't
// submit it on someone's behalf.
const formSignature = (user, fields) => crypto.createHmac('sha256', String(user.token || user.user_id))
    .update(JSON.stringify(PARAMS.map((p) => fields[p] || ''))).digest('hex');

router.get('/oauth/authorize', async (req, res) => {
    try {
        const q = req.query;
        const check = await checkRequest(q);
        if (check.error) return res.status(400).type('text').send(check.error);
        if (check.redirect) return res.redirect(303, backTo(q.redirect_uri, { ...check.redirect, state: q.state }));
        const user = await optionalUser(req);
        if (!user) return res.redirect(303, `/signin?next=${encodeURIComponent(req.originalUrl)}`);
        const fields = Object.fromEntries(PARAMS.map((p) => [p, String(q[p] || '')]));
        const html = renderPage(consentTemplate, {
            ...shareAssets(),
            cspNonce: NONCE_PLACEHOLDER,
            clientName: check.client.name,
            // The name is whatever the app registered with; where it sends
            // you back is the part that can't be faked.
            redirectHost: new URL(fields.redirect_uri).host,
            username: user.username,
            wantsWrite: String(q.scope || '').split(' ').includes('write'),
            fields: [...Object.entries(fields).map(([name, value]) => ({ name, value })), { name: 'sig', value: formSignature(user, fields) }],
        });
        res.set('Cache-Control', 'no-store');
        // The consent page must not be framed by the app asking for access.
        res.set('X-Frame-Options', 'DENY');
        // Allowing sends the browser on to the assistant's address; the
        // page's form-action has to permit that redirect.
        for (const h of ['Content-Security-Policy', 'Content-Security-Policy-Report-Only']) {
            const csp = res.get(h);
            if (csp) res.set(h, csp.replace("form-action 'self'", `form-action 'self' ${new URL(fields.redirect_uri).origin}`).replace("frame-ancestors 'self'", "frame-ancestors 'none'"));
        }
        res.type('html').send(html.split(NONCE_PLACEHOLDER).join(res.locals.cspNonce || ''));
    } catch (err) {
        logWithRequest(req, { message: 'oauth authorize error', err });
        res.status(500).send('An error occurred.');
    }
});

router.post('/oauth/authorize', async (req, res) => {
    try {
        const b = req.body || {};
        const check = await checkRequest(b);
        if (check.error) return res.status(400).type('text').send(check.error);
        if (check.redirect) return res.redirect(303, backTo(b.redirect_uri, { ...check.redirect, state: b.state }));
        const user = await optionalUser(req);
        if (!user) return res.status(401).type('text').send('Sign in first.');
        const fields = Object.fromEntries(PARAMS.map((p) => [p, String(b[p] || '')]));
        const expected = formSignature(user, fields);
        const sig = String(b.sig || '');
        if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
            return res.status(400).type('text').send('This form has expired. Start connecting again from your assistant.');
        }
        if (b.decision !== 'allow') return res.redirect(303, backTo(b.redirect_uri, { error: 'access_denied', state: b.state }));
        const code = crypto.randomBytes(32).toString('base64url');
        await knex('oauth_codes').insert({
            code_hash: hashToken(code),
            client_id: check.client.client_id,
            user_id: user.user_id,
            redirect_uri: fields.redirect_uri,
            code_challenge: fields.code_challenge,
            scope: b.write === '1' ? 'write' : 'read',
            expires_at: new Date(Date.now() + CODE_TTL_MS),
        });
        res.redirect(303, backTo(fields.redirect_uri, { code, state: b.state }));
    } catch (err) {
        logWithRequest(req, { message: 'oauth consent error', err });
        res.status(500).send('An error occurred.');
    }
});

const tokenError = (res, error, description, status = 400) => res.status(status).json({ error, error_description: description });

router.options('/oauth/token', open);
router.post('/oauth/token', open, limit, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const b = req.body || {};
    if (b.grant_type !== 'authorization_code') return tokenError(res, 'unsupported_grant_type', 'Only authorization_code is supported.');
    const row = await knex('oauth_codes').where({ code_hash: hashToken(String(b.code || '')) }).first();
    // One use only, whatever happens next.
    if (row) await knex('oauth_codes').where({ code_hash: row.code_hash }).del();
    if (!row || new Date(row.expires_at).getTime() < Date.now()) return tokenError(res, 'invalid_grant', 'The code is invalid or has expired.');
    if (String(b.client_id || '') !== row.client_id || String(b.redirect_uri || '') !== row.redirect_uri) {
        return tokenError(res, 'invalid_grant', "The code wasn't issued to this app.");
    }
    const challenge = crypto.createHash('sha256').update(String(b.code_verifier || '')).digest('base64url');
    if (challenge !== row.code_challenge) return tokenError(res, 'invalid_grant', 'PKCE verification failed.');
    const client = await knex('oauth_clients').where({ client_id: row.client_id }).first();
    const user = await knex('users').where({ user_id: row.user_id }).first();
    if (!client || !user) return tokenError(res, 'invalid_grant', 'The code is no longer valid.');
    // Reconnecting the same app replaces its old token.
    await knex('api_tokens').where({ user_id: user.user_id, client_id: client.client_id }).del();
    try {
        const t = await createToken(user, { name: client.name, scope: row.scope, clientId: client.client_id });
        res.json({ access_token: t.token, token_type: 'Bearer', scope: row.scope });
    } catch (err) {
        tokenError(res, 'invalid_request', err.message);
    }
});

// Old codes are cleaned up as new ones are made.
setInterval(() => {
    knex('oauth_codes').where('expires_at', '<', new Date()).del().catch(() => {});
}, 60 * 60 * 1000).unref();

export default router;
