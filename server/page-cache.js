// A short-lived cache for server-rendered public pages (shared lists and
// @profiles), so a list that gets posted to a busy forum is rendered about
// once a minute instead of once per visitor.
//
// - Pages are stored with a placeholder where the per-request CSP nonce
//   goes; every response still gets a fresh nonce.
// - Each page is tagged with its owner's user id. Saving, editing a profile
//   or deleting an account drops that user's pages at once, so owners see
//   their own changes immediately on this server.
// - In-memory and per process. With several app instances, another
//   instance may serve a page up to TTL old; keep TTL short.
//
// Responses also carry a stable ETag (a hash of the cached page) and
// s-maxage, so a CDN in front (DEPLOY.md, "Traffic spikes") can serve them
// too, and browsers revalidate cheaply.

import crypto from 'node:crypto';

export const NONCE_PLACEHOLDER = '__WG_CSP_NONCE__';
const TTL_MS = 60 * 1000;
const MAX_ENTRIES = 2000;

const pages = new Map();

export function cachedPage(key) {
    const hit = pages.get(key);
    if (!hit) return null;
    if (hit.expires < Date.now()) {
        pages.delete(key);
        return null;
    }
    return hit;
}

export function storePage(key, html, ownerId, status = 200) {
    const page = {
        html,
        status,
        ownerId: String(ownerId || ''),
        etag: `"p-${crypto.createHash('sha256').update(html).digest('hex').slice(0, 24)}"`,
        expires: Date.now() + TTL_MS,
    };
    pages.set(key, page);
    if (pages.size > MAX_ENTRIES) pages.delete(pages.keys().next().value);
    return page;
}

export function forgetUserPages(ownerId) {
    const id = String(ownerId || '');
    if (!id) return;
    for (const [key, page] of pages) {
        if (page.ownerId === id) pages.delete(key);
    }
}

export function sendCachedPage(req, res, page) {
    res.set('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=60');
    res.set('ETag', page.etag);
    if (req.get('If-None-Match') === page.etag) return res.status(304).end();
    return res.status(page.status).type('html').send(page.html.split(NONCE_PLACEHOLDER).join(res.locals.cspNonce));
}

export function clearPageCache() {
    pages.clear();
}
