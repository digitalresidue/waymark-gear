// A stand-in for Google's OpenID Connect endpoints, for tests only.
//
// Behaves like Google where it matters to server/google.js: an authorize page
// that sends the browser back with ?code&state, a token endpoint that checks
// the client secret and the PKCE verifier and returns a signed id_token, and
// a JWKS endpoint with the signing key. The authorize page is a small form so
// a test can choose which identity "Google" returns.
//
//   node test/support/fake-oidc.mjs        (FAKE_OIDC_PORT, default 3999)

import crypto from 'node:crypto';
import http from 'node:http';

import { exportJWK, generateKeyPair, SignJWT } from 'jose';

const port = Number(process.env.FAKE_OIDC_PORT || 3999);
const issuer = `http://127.0.0.1:${port}`;
const clientSecret = process.env.FAKE_OIDC_SECRET || 'test-secret';

const { publicKey, privateKey } = await generateKeyPair('RS256');
const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' };
const codes = new Map();

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function readBody(req) {
    return new Promise((resolve) => {
        let data = '';
        req.on('data', (c) => { data += c; });
        req.on('end', () => resolve(new URLSearchParams(data)));
    });
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, issuer);

    if (req.method === 'GET' && url.pathname === '/authorize') {
        const p = url.searchParams;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(`<!doctype html><title>Fake Google</title>
<h1>Fake Google sign-in</h1>
<form method="post" action="/authorize">
${['client_id', 'redirect_uri', 'state', 'nonce', 'code_challenge'].map((k) => `<input type="hidden" name="${k}" value="${esc(p.get(k))}">`).join('')}
<label>Subject <input name="sub" value="fake-${crypto.randomUUID()}"></label>
<label>Email <input name="email" value="hiker@example.com"></label>
<label>Name <input name="name" value="Test Hiker"></label>
<label><input type="checkbox" name="email_verified" value="1" checked> Email verified</label>
<button type="submit">Continue</button>
<button type="submit" name="deny" value="1">Cancel</button>
</form>`);
    }

    if (req.method === 'POST' && url.pathname === '/authorize') {
        const f = await readBody(req);
        const back = new URL(f.get('redirect_uri'));
        if (f.get('deny')) {
            back.search = new URLSearchParams({ error: 'access_denied', state: f.get('state') }).toString();
        } else {
            const code = crypto.randomBytes(16).toString('hex');
            codes.set(code, {
                clientId: f.get('client_id'),
                redirectUri: f.get('redirect_uri'),
                nonce: f.get('nonce'),
                challenge: f.get('code_challenge'),
                claims: { sub: f.get('sub'), email: f.get('email'), name: f.get('name'), email_verified: f.get('email_verified') === '1' },
            });
            back.search = new URLSearchParams({ code, state: f.get('state') }).toString();
        }
        res.writeHead(303, { Location: back.toString() });
        return res.end();
    }

    if (req.method === 'POST' && url.pathname === '/token') {
        const f = await readBody(req);
        const grant = codes.get(f.get('code'));
        codes.delete(f.get('code'));
        const challenge = crypto.createHash('sha256').update(f.get('code_verifier') || '').digest('base64url');
        const fail = (error) => { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error })); };
        if (!grant) return fail('invalid_grant');
        if (f.get('client_secret') !== clientSecret || f.get('client_id') !== grant.clientId) return fail('invalid_client');
        if (f.get('redirect_uri') !== grant.redirectUri) return fail('invalid_grant');
        if (challenge !== grant.challenge) return fail('invalid_grant');
        const idToken = await new SignJWT({ ...grant.claims, nonce: grant.nonce })
            .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
            .setIssuer(issuer).setAudience(grant.clientId).setIssuedAt().setExpirationTime('5m')
            .sign(privateKey);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ id_token: idToken, token_type: 'Bearer', expires_in: 300 }));
    }

    if (url.pathname === '/jwks') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ keys: [jwk] }));
    }

    if (url.pathname === '/') {
        res.writeHead(200);
        return res.end('ok');
    }
    res.writeHead(404);
    res.end();
});

server.listen(port, '127.0.0.1', () => console.log(`fake OIDC provider on ${issuer}`));
