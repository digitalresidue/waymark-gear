// Copy an image from someone else's website onto ours, so pages never load
// (hotlink) it from the original site. Used wherever an image link can be
// pasted: list items, catalog gear (editor and CSV import) and brand logos.
// Stored copies fit within 512×512 (plus a 180px thumbnail), as webp.
//
// Fetching URLs people type is a classic way to make a server reach places
// it shouldn't (SSRF), so:
// - http(s) on the standard ports only;
// - the host's addresses are looked up first and private, loopback,
//   link-local and other non-public ranges are refused; the connection then
//   goes to the address we checked, so DNS can't switch it afterwards;
// - at most 3 redirects, each checked the same way;
// - 10 s and 8 MB at most, and the bytes must really be a JPEG, PNG or WebP.
// Tests opt into private addresses with config remoteImages.allowPrivate.

import dns from 'node:dns/promises';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

import config from 'config';

import { sniffImage, storeImageFiles, userImageLocation } from './images.js';

const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 10000;
const MAX_REDIRECTS = 3;
export const REMOTE_MAX = 512;

export class RemoteImageError extends Error {}

const allowPrivate = () => config.has('remoteImages.allowPrivate') && Boolean(config.get('remoteImages.allowPrivate'));

// Is this address on the public internet?
export function isPublicAddress(address) {
    const ip = address.startsWith('::ffff:') && net.isIPv4(address.slice(7)) ? address.slice(7) : address;
    if (net.isIPv4(ip)) {
        const [a, b] = ip.split('.').map(Number);
        if (a === 0 || a === 10 || a === 127 || a >= 224) return false; // this net, private, loopback, multicast/reserved
        if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
        if (a === 169 && b === 254) return false; // link-local (cloud metadata)
        if (a === 172 && b >= 16 && b <= 31) return false;
        if (a === 192 && (b === 168 || (b === 0 && ip.startsWith('192.0.0.')) || (b === 0 && ip.startsWith('192.0.2.')))) return false;
        if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
        return true;
    }
    if (net.isIPv6(ip)) {
        const lower = ip.toLowerCase();
        if (lower === '::' || lower === '::1') return false;
        if (/^f[cd]/.test(lower)) return false; // unique local
        if (/^fe[89ab]/.test(lower)) return false; // link-local
        if (/^ff/.test(lower)) return false; // multicast
        if (lower.startsWith('64:ff9b:') || lower.startsWith('2001:db8')) return false;
        return true;
    }
    return false;
}

function checkUrl(raw) {
    let u;
    try {
        u = new URL(String(raw).trim());
    } catch {
        throw new RemoteImageError('That isn\'t a web address.');
    }
    if (!/^https?:$/.test(u.protocol)) throw new RemoteImageError('Image links must start with http:// or https://.');
    if (u.username || u.password) throw new RemoteImageError('Image links can\'t contain a username or password.');
    const port = u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : 80);
    if (![80, 443].includes(port) && !allowPrivate()) throw new RemoteImageError('Image links must use the standard web ports.');
    return u;
}

async function resolvePublic(hostname) {
    const host = hostname.replace(/^\[|\]$/g, '');
    const addresses = net.isIP(host) ? [{ address: host, family: net.isIP(host) }] : await dns.lookup(host, { all: true }).catch(() => []);
    if (!addresses.length) throw new RemoteImageError('Couldn\'t find that website.');
    if (!allowPrivate() && addresses.some((a) => !isPublicAddress(a.address))) {
        throw new RemoteImageError('That address isn\'t on the public internet.');
    }
    return addresses[0];
}

function get(u, pinned) {
    return new Promise((resolve, reject) => {
        const lib = u.protocol === 'https:' ? https : http;
        const req = lib.get(u, {
            // Connect to the address we checked, whatever DNS says next.
            // (Newer Node asks for a list: { all: true }.)
            lookup: (_host, opts, cb) => (opts && opts.all
                ? cb(null, [{ address: pinned.address, family: pinned.family }])
                : cb(null, pinned.address, pinned.family)),
            headers: { 'User-Agent': 'WaymarkGear-ImageCopy/1.0 (+https://waymarkgear.com)', Accept: 'image/webp,image/png,image/jpeg,image/*;q=0.8' },
            timeout: TIMEOUT_MS,
        }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume();
                return resolve({ redirect: new URL(res.headers.location, u) });
            }
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new RemoteImageError(`The image site answered ${res.statusCode}.`));
            }
            if (Number(res.headers['content-length']) > MAX_BYTES) {
                res.destroy();
                return reject(new RemoteImageError('That image is too large (8 MB max).'));
            }
            const chunks = [];
            let size = 0;
            res.on('data', (c) => {
                size += c.length;
                if (size > MAX_BYTES) {
                    res.destroy();
                    reject(new RemoteImageError('That image is too large (8 MB max).'));
                } else chunks.push(c);
            });
            res.on('end', () => resolve({ body: Buffer.concat(chunks) }));
            res.on('error', reject);
            return undefined;
        });
        req.on('timeout', () => req.destroy(new RemoteImageError('The image site took too long to answer.')));
        req.on('error', (err) => reject(err instanceof RemoteImageError ? err : new RemoteImageError('Couldn\'t download that image.')));
    });
}

export async function downloadImage(raw) {
    let u = checkUrl(raw);
    for (let hops = 0; hops <= MAX_REDIRECTS; hops++) {
        const pinned = await resolvePublic(u.hostname);
        const r = await get(u, pinned);
        if (r.redirect) {
            u = checkUrl(r.redirect.toString());
            continue;
        }
        const sniffed = sniffImage(r.body);
        if (!sniffed) throw new RemoteImageError('That link isn\'t a JPEG, PNG or WebP image.');
        return { buf: r.body, sniffed };
    }
    throw new RemoteImageError('Too many redirects.');
}

// Where copies live: the person who pasted the link owns them (deleted with
// their account), except shared site content (catalog gear, brand logos),
// which lives under "site" so it outlives any one account.
const SITE_OWNER = 'site-content';

/**
 * Download `url` and store it as ours. Returns { imageUrl } (a /userimages/
 * path; its thumbnail is the same name with _t). owner: a user_id, or
 * 'site' for catalog and brand images.
 */
export async function copyRemoteImage(url, owner) {
    const { buf, sniffed } = await downloadImage(url);
    const tmp = path.join(os.tmpdir(), `wg-remote-${process.pid}-${crypto.randomBytes(6).toString('hex')}`);
    fs.writeFileSync(tmp, buf);
    try {
        const { urlPath, dir } = userImageLocation(owner === 'site' ? SITE_OWNER : owner);
        // Fit inside REMOTE_MAX × REMOTE_MAX: convert() sizes by width.
        const scale = Math.min(1, REMOTE_MAX / sniffed.width, REMOTE_MAX / sniffed.height);
        const id = await storeImageFiles(tmp, buf, sniffed.width, dir, Math.max(1, Math.round(sniffed.width * scale)));
        return { imageUrl: `${urlPath}/${id}.webp` };
    } finally {
        fs.rmSync(tmp, { force: true });
    }
}

// Already ours (uploaded or copied): leave it be.
export const isLocalImage = (v) => /^\/userimages\//.test(String(v || ''));

// Our copies as full links, for people and spreadsheets: the owner's editor
// shows "https://waymarkgear.com/userimages/…", exports carry it, and either
// form saves back as the same copy (never fetched again).
const siteBase = () => String(config.get('deployUrl') || '').replace(/\/+$/, '');

/** "/userimages/…" -> "https://<site>/userimages/…"; anything else as given. */
export function absoluteImageUrl(v) {
    const s = String(v || '');
    return isLocalImage(s) ? `${siteBase()}${s}` : s;
}

/**
 * One of our copies, from its path or its full link on this site (http or
 * https, with or without www), as the stored "/userimages/…" path; null for
 * anything else.
 */
export function localImagePath(v) {
    const s = String(v || '').trim();
    if (isLocalImage(s)) return s.split(/[?#]/)[0];
    let url;
    try {
        url = new URL(s);
    } catch {
        return null;
    }
    const site = (() => {
        try {
            return new URL(siteBase()).host.replace(/^www\./, '');
        } catch {
            return '';
        }
    })();
    if (!site || url.host.replace(/^www\./, '') !== site || !/^https?:$/.test(url.protocol)) return null;
    return isLocalImage(url.pathname) ? url.pathname : null;
}

// ---- Catalog gear photos -------------------------------------------------

/**
 * Copy every catalog photo that still points at another website. A few at a
 * time; returns what happened. Lists using catalog gear pick the copy up
 * through the catalog link (client/dataTypes.js syncs imageUrl).
 */
let running = null;

export function localizeCatalogImages(knex, { log = () => {} } = {}) {
    if (running) return running;
    running = (async () => {
        const rows = await knex('catalog_items').whereNot('image_url', '').whereNotNull('image_url')
            .whereRaw("image_url not like '/userimages/%'").select('id', 'name', 'brand', 'image_url');
        const result = { copied: 0, failed: [] };
        const queue = [...rows];
        const worker = async () => {
            while (queue.length) {
                const row = queue.shift();
                try {
                    const { imageUrl } = await copyRemoteImage(row.image_url, 'site');
                    await knex('catalog_items').where({ id: row.id, image_url: row.image_url }).update({ image_url: imageUrl, updated_at: knex.fn.now() });
                    result.copied++;
                } catch (err) {
                    result.failed.push({ id: row.id, name: [row.brand, row.name].filter(Boolean).join(' '), url: row.image_url, error: err instanceof RemoteImageError ? err.message : 'Couldn\'t copy it.' });
                    if (!(err instanceof RemoteImageError)) log(err);
                }
            }
        };
        await Promise.all([worker(), worker(), worker()]);
        return result;
    })().finally(() => { running = null; });
    return running;
}

export async function remoteCatalogImageCount(knex) {
    const [{ n }] = await knex('catalog_items').whereNot('image_url', '').whereNotNull('image_url')
        .whereRaw("image_url not like '/userimages/%'").count({ n: '*' });
    return Number(n);
}
