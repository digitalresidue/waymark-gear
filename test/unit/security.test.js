import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

// config reads NODE_CONFIG once, on first import, so set a small limit before
// anything pulls it in.
process.env.NODE_CONFIG = JSON.stringify({
    rateLimit: { enabled: true, authWindowMinutes: 15, authMaxPerWindow: 3 },
});

const { default: express } = await import('express');
const { authRateLimit } = await import('../../server/security.js');

// The real middleware, mounted the way app.js mounts it: after the body
// parser, ahead of the routes.
function buildApp() {
    const app = express();
    app.use(express.json());
    app.use(authRateLimit());
    app.post('/signin', (_req, res) => res.json({ ok: true }));
    app.post('/saveLibrary', (_req, res) => res.json({ ok: true }));
    app.get('/r/:id', (_req, res) => res.json({ ok: true }));
    return app;
}

async function listen(app) {
    return new Promise((resolve) => {
        const server = app.listen(0, '127.0.0.1', () => {
            resolve({ server, base: `http://127.0.0.1:${server.address().port}` });
        });
    });
}

const post = (url, body) => fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
});

describe('authRateLimit', () => {
    let server;
    let base;

    before(async () => {
        ({ server, base } = await listen(buildApp()));
    });

    after(() => server.close());

    test('blocks sign-in after the configured number of attempts', async () => {
        for (let i = 0; i < 3; i++) {
            assert.equal((await post(`${base}/signin`, { username: 'a', password: 'b' })).status, 200);
        }
        const blocked = await post(`${base}/signin`, { username: 'a', password: 'b' });
        assert.equal(blocked.status, 429);
        assert.match((await blocked.json()).message, /Too many attempts/);
    });

    test('password guesses through other endpoints share the same budget', async () => {
        // authenticateUser accepts credentials on any authenticated POST, so
        // /saveLibrary with a password must not be a way around the limit.
        const res = await post(`${base}/saveLibrary`, { username: 'a', password: 'b' });
        assert.equal(res.status, 429);
    });

    test('ordinary requests are never counted', async () => {
        assert.equal((await post(`${base}/saveLibrary`, { data: '{}' })).status, 200);
        assert.equal((await fetch(`${base}/r/abc123`)).status, 200);
    });
});
