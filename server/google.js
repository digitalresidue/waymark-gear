// Sign in with Google (OpenID Connect, authorization code flow with PKCE).
//
//   GET /auth/google            start signing in or registering
//   GET /auth/google?link=1     connect Google to the signed-in account
//   GET /auth/google/callback   where Google sends the browser back
//
// Accounts are matched on Google's stable subject id. A Google login whose
// email belongs to an existing password account is NOT merged into it:
// emails aren't verified at registration, so anyone could have registered
// someone else's address first. That person signs in with their password
// and connects Google from Account settings instead.

import crypto from 'node:crypto';

import config from 'config';
import express from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';

import knex from './db.js';
import { replaceLibrary } from './library-store.js';
import { logWithRequest } from './log.js';
import { hashSessionToken, startSession } from './auth.js';
import { Library } from '../client/dataTypes.js';

const router = express.Router();

const STATE_COOKIE = 'lp_oauth';
const STATE_TTL_MS = 10 * 60 * 1000;

function settings() {
    const g = config.has('google') ? config.get('google') : {};
    return {
        clientId: g.clientId || '',
        clientSecret: g.clientSecret || '',
        issuer: g.issuer || 'https://accounts.google.com',
        authorizationEndpoint: g.authorizationEndpoint || 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenEndpoint: g.tokenEndpoint || 'https://oauth2.googleapis.com/token',
        jwksUri: g.jwksUri || 'https://www.googleapis.com/oauth2/v3/certs',
    };
}

export function googleEnabled() {
    const s = settings();
    return Boolean(s.clientId && s.clientSecret);
}

const redirectUri = () => `${config.get('deployUrl')}/auth/google/callback`;
const b64url = (buf) => buf.toString('base64url');

let jwks = null;
let jwksFor = '';
function keySet() {
    const { jwksUri } = settings();
    if (!jwks || jwksFor !== jwksUri) {
        jwks = createRemoteJWKSet(new URL(jwksUri));
        jwksFor = jwksUri;
    }
    return jwks;
}

function stateCookieOptions() {
    return {
        path: '/auth/google',
        maxAge: STATE_TTL_MS,
        httpOnly: true,
        secure: config.get('environment') === 'production',
        // Google's redirect back is a top-level GET from another site, which
        // Lax still sends cookies on.
        sameSite: 'lax',
    };
}

function finish(res, path) {
    res.clearCookie(STATE_COOKIE, stateCookieOptions());
    res.set('Cache-Control', 'no-store');
    return res.redirect(303, path);
}

router.get('/auth/google', async (req, res) => {
    if (!googleEnabled()) {
        return res.redirect(303, '/signin?error=google-unavailable');
    }
    const s = settings();
    const state = b64url(crypto.randomBytes(24));
    const nonce = b64url(crypto.randomBytes(24));
    const verifier = b64url(crypto.randomBytes(48));
    const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
    const mode = req.query.link ? 'link' : 'signin';

    res.cookie(STATE_COOKIE, JSON.stringify({ state, nonce, verifier, mode, at: Date.now() }), stateCookieOptions());

    const url = new URL(s.authorizationEndpoint);
    url.search = new URLSearchParams({
        client_id: s.clientId,
        redirect_uri: redirectUri(),
        response_type: 'code',
        scope: 'openid email profile',
        state,
        nonce,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        prompt: 'select_account',
    }).toString();
    res.set('Cache-Control', 'no-store');
    return res.redirect(303, url.toString());
});

async function exchangeCode(code, verifier) {
    const s = settings();
    const response = await fetch(s.tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            code,
            client_id: s.clientId,
            client_secret: s.clientSecret,
            redirect_uri: redirectUri(),
            grant_type: 'authorization_code',
            code_verifier: verifier,
        }),
        signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
        throw new Error(`token endpoint returned ${response.status}`);
    }
    const body = await response.json();
    if (!body.id_token) throw new Error('no id_token in token response');
    return body.id_token;
}

async function verifyIdToken(idToken, nonce) {
    const s = settings();
    const issuers = [s.issuer];
    if (s.issuer === 'https://accounts.google.com') issuers.push('accounts.google.com');
    const { payload } = await jwtVerify(idToken, keySet(), {
        issuer: issuers,
        audience: s.clientId,
        clockTolerance: 60,
    });
    if (payload.nonce !== nonce) throw new Error('nonce mismatch');
    if (!payload.sub) throw new Error('no subject');
    return payload;
}

// lowercase letters and digits, 3-32 chars, unique.
async function pickUsername(email, name) {
    const base = (String(email || '').split('@')[0] || String(name || '') || 'hiker')
        .toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24) || 'hiker';
    const stem = base.length >= 3 ? base : `${base}hiker`.slice(0, 24);
    for (let attempt = 0; attempt < 20; attempt++) {
        const candidate = attempt === 0 ? stem : `${stem}${crypto.randomInt(10, 99999)}`;
        const taken = await knex('users').where({ username: candidate }).first('user_id');
        if (!taken) return candidate;
    }
    return `hiker${crypto.randomInt(100000, 999999999)}`;
}

router.get('/auth/google/callback', async (req, res) => {
    let saved;
    try {
        saved = JSON.parse(req.cookies[STATE_COOKIE] || 'null');
    } catch {
        saved = null;
    }
    const fail = (reason, path = '/signin?error=google-failed') => {
        logWithRequest(req, { message: 'google sign-in failed', reason });
        return finish(res, path);
    };

    if (req.query.error) return fail(`provider error: ${String(req.query.error).slice(0, 100)}`, '/signin?error=google-cancelled');
    if (!saved || !saved.state || Date.now() - saved.at > STATE_TTL_MS) return fail('missing or expired state cookie');
    const state = String(req.query.state || '');
    if (state.length !== saved.state.length
        || !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(saved.state))) {
        return fail('state mismatch');
    }
    if (!req.query.code) return fail('no code');

    let claims;
    try {
        const idToken = await exchangeCode(String(req.query.code), saved.verifier);
        claims = await verifyIdToken(idToken, saved.nonce);
    } catch (err) {
        return fail(err.message);
    }

    const sub = String(claims.sub);
    const email = String(claims.email || '').trim();
    const emailVerified = claims.email_verified === true;

    try {
        if (saved.mode === 'link') {
            const token = req.cookies.lp ? hashSessionToken(String(req.cookies.lp)) : null;
            const current = token ? await knex('users').where({ token }).first() : null;
            if (!current) return fail('link without a session', '/signin');
            const other = await knex('users').where({ google_sub: sub }).whereNot({ user_id: current.user_id }).first('user_id');
            if (other) return fail('google account already linked elsewhere', '/?google=in-use');
            await knex('users').where({ user_id: current.user_id }).update({ google_sub: sub });
            logWithRequest(req, { message: 'google linked', username: current.username });
            return finish(res, '/?google=linked');
        }

        let user = await knex('users').where({ google_sub: sub }).first();
        let isNew = false;
        if (!user) {
            if (!emailVerified || !email) return fail('google email not verified', '/signin?error=google-unverified');
            const clash = await knex('users').whereRaw('lower(email) = ?', [email.toLowerCase()]).first('user_id');
            if (clash) return fail('email belongs to a password account', '/signin?error=google-email-exists');

            const username = await pickUsername(email, claims.name);
            [user] = await knex.transaction(async (trx) => {
                const created = await trx('users').insert({
                    username,
                    email,
                    email_verified: true,
                    google_sub: sub,
                    password: null,
                    token: hashSessionToken(crypto.randomBytes(48).toString('hex')),
                    sync_token: 0,
                    registered: new Date(),
                    last_seen: new Date(),
                }).returning('*');
                await replaceLibrary(created[0].user_id, new Library().save(), trx);
                return created;
            });
            isNew = true;
            logWithRequest(req, { message: 'registered via google', username });
        }

        await startSession(res, user.user_id);
        await knex('users').where({ user_id: user.user_id }).update({ last_seen: new Date() });
        logWithRequest(req, { message: 'signed in via google', username: user.username });
        // A brand-new account picks up a library the visitor built before
        // signing up (the client sees ?welcome=google and moves it over).
        return finish(res, isNew ? '/?welcome=google' : '/');
    } catch (err) {
        if (err.code === '23505') return fail('unique violation race', '/signin?error=google-failed');
        return fail(`database error: ${err.message}`);
    }
});

// Disconnect Google from an account. Only allowed if the account also has a
// password, or the user would lock themselves out.
router.post('/auth/google/unlink', async (req, res) => {
    const token = req.cookies.lp ? hashSessionToken(String(req.cookies.lp)) : null;
    const user = token ? await knex('users').where({ token }).first() : null;
    if (!user) return res.status(401).json({ message: 'Please log in.' });
    if (!user.password) {
        return res.status(400).json({ message: 'Set a password first, or you would have no way to sign in.' });
    }
    await knex('users').where({ user_id: user.user_id }).update({ google_sub: null });
    return res.json({ message: 'success' });
});

export default router;
