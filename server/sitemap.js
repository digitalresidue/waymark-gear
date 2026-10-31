// The sitemap: every public page, for search engines.
//
// Built from the database (not by crawling: a crawler only finds what's
// linked, the database knows every public page), once a day and at start-up,
// into files on disk:
//
//   /sitemap.xml           a sitemap index, listing the files below
//   /sitemaps/pages.xml    the fixed pages, every trail
//   /sitemaps/gear-N.xml   catalog gear pages (/g/:id)
//   /sitemaps/lists-N.xml  published lists (/r/:id)
//   /sitemaps/people-N.xml public profiles (/@name)
//   /sitemaps/trips-N.xml  public trip journals (/t/:id)
//
// A sitemap file may hold at most 50,000 links, so each kind is split into
// numbered files of up to 40,000, read from the database a page at a time and
// written as it goes: nothing large is held in memory. A new set is written
// beside the old one and swapped in when it's complete, so the sitemap being
// served is never half-written.
//
// `waymark sitemap` (scripts/build-sitemap.js) rebuilds it now.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import config from 'config';

import { exploreIndex } from '../client/utils/explore.js';

// 40,000 links a file (the limit is 50,000); a setting so tests can check the split.
const perFile = () => Number(setting('perFile', 40000)) || 40000;
const BATCH = 5000;
const DAY_MS = 24 * 60 * 60 * 1000;

const setting = (key, fallback) => (config.has(`sitemap.${key}`) ? config.get(`sitemap.${key}`) : fallback);
// Rebuilt at every start, so a temporary folder will do (and the app can
// always write there, in Docker too). Several instances each keep their own.
export const sitemapDir = () => setting('dir', path.join(os.tmpdir(), `waymark-sitemaps-${config.get('port')}`));

// Pages that are always there.
export const FIXED_PAGES = ['/welcome', '/explore', '/kits', '/trails/all', '/brands', '/reviews', '/leaderboard', '/supporter', '/developers', '/privacy', '/terms'];

const xmlEscape = (v) => String(v).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
const urlTag = (loc, lastmod) => `<url><loc>${xmlEscape(loc)}</loc>${lastmod ? `<lastmod>${new Date(lastmod).toISOString()}</lastmod>` : ''}</url>\n`;
const HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
const TAIL = '</urlset>\n';

// Writes one kind of page into kind-1.xml, kind-2.xml... Returns the files.
async function writeKind(dir, kind, fetchBatch, toUrl) {
    const files = [];
    const finished = [];
    let out = null;
    let inFile = 0;
    let newest = null;
    const close = () => {
        if (!out) return;
        const stream = out;
        finished.push(new Promise((resolve, reject) => {
            stream.on('finish', resolve);
            stream.on('error', reject);
        }));
        stream.end(TAIL);
        files[files.length - 1].lastmod = newest;
        out = null;
    };
    let after = null;
    for (;;) {
        const rows = await fetchBatch(after, BATCH);
        if (!rows.length) break;
        for (const row of rows) {
            if (!out || inFile >= perFile()) {
                close();
                const name = `${kind}-${files.length + 1}.xml`;
                files.push({ name, lastmod: null });
                out = fs.createWriteStream(path.join(dir, name));
                out.write(HEAD);
                inFile = 0;
                newest = null;
            }
            const { loc, lastmod } = toUrl(row);
            out.write(urlTag(loc, lastmod));
            inFile++;
            if (lastmod && (!newest || new Date(lastmod) > new Date(newest))) newest = lastmod;
        }
        after = rows[rows.length - 1].cursor;
        if (rows.length < BATCH) break;
    }
    close();
    await Promise.all(finished);
    return files;
}

/**
 * Build the sitemap files and swap them in. Returns { files, urls }.
 */
export async function buildSitemap(knex, { log = () => {} } = {}) {
    const base = config.get('deployUrl').replace(/\/$/, '');
    const root = sitemapDir();
    const fresh = `${root}.new-${process.pid}-${Date.now()}`;
    fs.mkdirSync(fresh, { recursive: true });
    let urls = 0;
    try {
        // Fixed pages and trails: small, one file.
        const trails = await knex('trails').where({ status: 'published' }).select('slug', 'updated_at').orderBy('slug')
            .catch(() => knex('trails').where({ status: 'published' }).select('slug').orderBy('slug'))
            .catch(() => []);
        // Explore gear: each parent and category with published gear.
        const categoryRows = await knex('catalog_items').where({ status: 'published' }).whereNot({ category: '' })
            .groupBy('category').select('category as name').count({ count: '*' }).catch(() => []);
        const sections = exploreIndex(categoryRows.map((r) => ({ name: r.name, count: Number(r.count) }))).filter((x) => x.count > 0);
        const pages = [
            ...FIXED_PAGES.map((p) => urlTag(`${base}${p}`)),
            ...trails.map((t) => urlTag(`${base}/trails/${t.slug}`, t.updated_at)),
            ...sections.map((x) => urlTag(`${base}/explore/${x.slug}`)),
        ];
        fs.writeFileSync(path.join(fresh, 'pages.xml'), HEAD + pages.join('') + TAIL);
        urls += pages.length;
        const files = [{ name: 'pages.xml', lastmod: new Date().toISOString() }];

        const tally = (rows) => {
            urls += rows.length;
            return rows;
        };
        const sources = [
            ['gear', (after, n) => knex('catalog_items').where({ status: 'published' })
                .modify((q) => { if (after) q.where('id', '>', after); })
                .orderBy('id').limit(n).select('id', 'updated_at', 'id as cursor').then(tally),
            (r) => ({ loc: `${base}/g/${r.id}`, lastmod: r.updated_at })],
            ['lists', (after, n) => knex('public_kits')
                .modify((q) => { if (after) q.where('external_id', '>', after); })
                .orderBy('external_id').limit(n).select('external_id', 'updated_at', 'external_id as cursor').then(tally),
            (r) => ({ loc: `${base}/r/${r.external_id}`, lastmod: r.updated_at })],
            ['people', (after, n) => knex('public_kits').join('users', 'users.user_id', 'public_kits.user_id')
                .where('users.profile_hidden', false)
                .modify((q) => { if (after) q.where('users.username', '>', after); })
                .groupBy('users.username').orderBy('users.username').limit(n)
                .select('users.username', 'users.username as cursor').max({ updated_at: 'public_kits.updated_at' }).then(tally),
            (r) => ({ loc: `${base}/@${r.username}`, lastmod: r.updated_at })],
            ['trips', (after, n) => knex('trips').join('users', 'users.user_id', 'trips.user_id')
                .where('trips.visibility', 'public').where('users.profile_hidden', false)
                .modify((q) => { if (after) q.where('trips.id', '>', after); })
                .orderBy('trips.id').limit(n).select('trips.id', 'trips.updated_at', 'trips.id as cursor').then(tally)
                .catch(() => []),
            (r) => ({ loc: `${base}/t/${r.id}`, lastmod: r.updated_at })],
        ];
        for (const [kind, fetchBatch, toUrl] of sources) {
            files.push(...await writeKind(fresh, kind, fetchBatch, toUrl));
        }

        const index = [
            '<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n',
            ...files.map((f) => `<sitemap><loc>${xmlEscape(`${base}/sitemaps/${f.name}`)}</loc>${f.lastmod ? `<lastmod>${new Date(f.lastmod).toISOString()}</lastmod>` : ''}</sitemap>\n`),
            '</sitemapindex>\n',
        ].join('');
        fs.writeFileSync(path.join(fresh, 'sitemap.xml'), index);

        // Swap the new set in.
        const old = `${root}.old-${process.pid}-${Date.now()}`;
        if (fs.existsSync(root)) fs.renameSync(root, old);
        fs.renameSync(fresh, root);
        fs.rmSync(old, { recursive: true, force: true });
        return { files: files.length, urls };
    } catch (err) {
        fs.rmSync(fresh, { recursive: true, force: true });
        log(err);
        throw err;
    }
}

let building = null;
// Built once per process start (and daily); the first request waits for it.
export function ensureSitemap(knex, opts) {
    if (fs.existsSync(path.join(sitemapDir(), 'sitemap.xml'))) return Promise.resolve();
    if (!building) building = buildSitemap(knex, opts).finally(() => { building = null; });
    return building;
}

/** Build a few seconds after start, then once a day. */
export function scheduleSitemap(knex, logger) {
    if (!setting('enabled', true)) return null;
    const run = async () => {
        try {
            if (building) await building;
            building = buildSitemap(knex, { log: (err) => logger.error({ message: 'sitemap build failed', err }) });
            const r = await building;
            logger.info({ message: 'sitemap built', ...r });
        } catch {
            // Logged above; the previous sitemap stays in place.
        } finally {
            building = null;
        }
    };
    const first = setTimeout(run, setting('firstRunSeconds', 30) * 1000);
    const every = setInterval(run, DAY_MS);
    first.unref();
    every.unref();
    return { first, every };
}

/** The file to serve for /sitemap.xml or /sitemaps/<name>, or null. */
export function sitemapFile(name) {
    if (!/^(sitemap|pages|(gear|lists|people|trips)-\d+)\.xml$/.test(name)) return null;
    const file = path.join(sitemapDir(), name);
    return fs.existsSync(file) ? file : null;
}
