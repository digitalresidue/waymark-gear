/* Waymark Gear service worker: makes the app open without a signal.
 *
 * - App pages (the editor, Pack, Closet...): network first, so a deploy shows
 *   up on the next load; the last copy is used when offline.
 * - Built assets under /dist/ are content-hashed, so a cached copy is always
 *   right: cache first. Icons and fonts the same.
 * - Everything else (API calls, sign-in, saves, share pages, uploads) goes
 *   straight to the network and is never stored here. Your gear list itself
 *   is kept by the app (see client/utils/offline-cache.js), not by this file.
 */

const VERSION = 'v1';
const SHELL = `wg-shell-${VERSION}`;
const ASSETS = `wg-assets-${VERSION}`;
const MAX_ASSETS = 150;

// Client-side routes that render the app shell (keep in step with
// client/routes.js; server/views.js serves the same HTML for them).
const APP_PATHS = new Set(['/', '/pack', '/gear', '/welcome', '/explore', '/signin', '/register']);

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(SHELL);
        const response = await fetch('/', { credentials: 'same-origin' });
        if (!response.ok) return;
        await cache.put('/', response.clone());
        // Fetch the scripts and styles the shell points at, so the first
        // offline open works even if those were never requested via the SW.
        const html = await response.text();
        const urls = [...html.matchAll(/(?:src|href)=["'](\/dist\/[^"']+)["']/g)].map((m) => m[1]);
        const assets = await caches.open(ASSETS);
        await Promise.all(urls.map((u) => assets.add(u).catch(() => {})));
    })().catch(() => {}));
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keep = new Set([SHELL, ASSETS]);
        for (const key of await caches.keys()) {
            if (key.startsWith('wg-') && !keep.has(key)) await caches.delete(key);
        }
        await self.clients.claim();
    })());
});

async function trimAssets() {
    const cache = await caches.open(ASSETS);
    const keys = await cache.keys();
    for (const req of keys.slice(0, Math.max(0, keys.length - MAX_ASSETS))) {
        await cache.delete(req);
    }
}

async function appPage(request, path) {
    const cache = await caches.open(SHELL);
    try {
        const response = await fetch(request);
        if (response.ok && (response.headers.get('content-type') || '').includes('text/html')) {
            await cache.put(path, response.clone());
        }
        return response;
    } catch (err) {
        const cached = (await cache.match(path)) || (await cache.match('/'));
        if (cached) return cached;
        throw err;
    }
}

async function asset(request) {
    const cache = await caches.open(ASSETS);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) {
        await cache.put(request, response.clone());
        trimAssets();
    }
    return response;
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    if (request.mode === 'navigate' && APP_PATHS.has(url.pathname)) {
        event.respondWith(appPage(request, url.pathname));
        return;
    }
    if (url.pathname.startsWith('/dist/') || url.pathname.startsWith('/fonts/')
        || /^\/images\/(icon|apple-touch|waymark-logo)/.test(url.pathname) || url.pathname === '/favicon.png') {
        event.respondWith(asset(request));
    }
});
