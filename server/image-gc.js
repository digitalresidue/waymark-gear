// Image clean-up: delete stored images nothing refers to any more.
//
// Images live under public/userimages/<shard>/<owner token>/<id>[_kind].webp
// (server/images.js). One image can be used in many places — a catalog photo
// by every list that has that gear, a copied list by its copier — so they
// aren't deleted the moment something is removed. Instead, once a day:
//
// 1. Every text and JSON column in the database is searched for
//    /userimages/... paths (in SQL, a table at a time). That covers list
//    gear, gear photos, the catalog, brand logos, avatars and banners, trip
//    photos, and any column added later, without a list to keep up to date.
// 2. Each stored file is checked against what was found; files nothing
//    refers to, older than a day (so an upload not saved yet is safe), are
//    deleted, with their thumbnail and other sizes.
//
// Safety: one run at a time (a Postgres advisory lock, so several app
// instances can't race), and it refuses to delete more than half of all
// images in one go unless forced — a sign something was misread, not a
// real clean-up. `waymark clean-images` runs it by hand (with a dry run).

import fs from 'node:fs';
import path from 'node:path';

import config from 'config';

const IMAGES_DIR = path.join(import.meta.dirname, '..', 'public', 'userimages');
const LOCK_ID = 7713420601; // any fixed number; names this job's advisory lock
const FILE = /^([0-9a-f]{16})(?:_(?:t|avatar|banner|photo|avatar_t|photo_t))?\.(?:webp|png)$/;
const TMP = /\.tmp-/;
const DAY_MS = 24 * 60 * 60 * 1000;

const setting = (key, fallback) => (config.has(`imageCleanup.${key}`) ? config.get(`imageCleanup.${key}`) : fallback);

// Postgres identifier quoting for table/column names read from the catalog.
const ident = (name) => `"${String(name).replace(/"/g, '""')}"`;

async function collectReferences(trx) {
    await trx.raw('create temporary table wg_image_refs (key text primary key) on commit drop');
    const { rows: columns } = await trx.raw(`
        select table_name, column_name
        from information_schema.columns
        where table_schema = 'public'
          and data_type in ('text', 'character varying', 'json', 'jsonb', 'ARRAY')
          and table_name not like 'knex_%'
        order by table_name, column_name`);
    for (const { table_name: table, column_name: column } of columns) {
        const col = `${ident(table)}.${ident(column)}`;
        await trx.raw(`
            insert into wg_image_refs (key)
            select distinct m[1] || '/' || m[2]
            from (
                select regexp_matches(${col}::text, '/userimages/[0-9a-f]{2}/([0-9a-f]{16})/([0-9a-f]{16})', 'g') as m
                from ${ident(table)}
                where ${col}::text like '%/userimages/%'
            ) found
            on conflict do nothing`);
    }
    const { rows: [{ n }] } = await trx.raw('select count(*)::int as n from wg_image_refs');
    return n;
}

function* storedFiles() {
    if (!fs.existsSync(IMAGES_DIR)) return;
    for (const shard of fs.readdirSync(IMAGES_DIR)) {
        if (!/^[0-9a-f]{2}$/.test(shard)) continue;
        const shardDir = path.join(IMAGES_DIR, shard);
        for (const owner of fs.readdirSync(shardDir)) {
            if (!/^[0-9a-f]{16}$/.test(owner)) continue;
            const dir = path.join(shardDir, owner);
            let names;
            try {
                names = fs.readdirSync(dir);
            } catch {
                continue;
            }
            yield { dir, owner, names };
        }
    }
}

/**
 * Find (and, unless dryRun, delete) stored images nothing refers to.
 * Returns { referenced, files, unused, deleted, bytes, skippedYoung, aborted }.
 */
export async function cleanUpImages(knex, { dryRun = false, force = false, minAgeMs = setting('minAgeHours', 24) * 60 * 60 * 1000, log = () => {} } = {}) {
    return knex.transaction(async (trx) => {
        const { rows: [{ locked }] } = await trx.raw('select pg_try_advisory_xact_lock(?) as locked', [LOCK_ID]);
        if (!locked) return { aborted: 'Another clean-up is already running.' };

        const referenced = await collectReferences(trx);
        const now = Date.now();
        const result = { referenced, files: 0, unused: 0, deleted: 0, bytes: 0, skippedYoung: 0, aborted: null };
        const doomed = [];

        for (const { dir, owner, names } of storedFiles()) {
            const ids = new Map();
            for (const name of names) {
                const full = path.join(dir, name);
                if (TMP.test(name)) {
                    // A conversion that died part-way.
                    try {
                        if (now - fs.statSync(full).mtimeMs > DAY_MS) doomed.push(full);
                    } catch { /* gone already */ }
                    continue;
                }
                const m = name.match(FILE);
                if (!m) continue;
                result.files++;
                if (!ids.has(m[1])) ids.set(m[1], []);
                ids.get(m[1]).push(full);
            }
            if (!ids.size) continue;
            const keys = [...ids.keys()].map((id) => `${owner}/${id}`);
            const { rows } = await trx.raw('select key from wg_image_refs where key = any(?)', [keys]);
            const used = new Set(rows.map((r) => r.key));
            for (const [id, files] of ids) {
                if (used.has(`${owner}/${id}`)) continue;
                for (const full of files) {
                    let stat;
                    try {
                        stat = fs.statSync(full);
                    } catch {
                        continue;
                    }
                    if (now - stat.mtimeMs < minAgeMs) {
                        result.skippedYoung++;
                        continue;
                    }
                    result.unused++;
                    result.bytes += stat.size;
                    doomed.push(full);
                }
            }
        }

        // Nothing referenced at all while images exist, or most of them about
        // to go: almost certainly a misread database, not real garbage.
        if (result.files && (referenced === 0 || result.unused > result.files / 2) && !force) {
            result.aborted = `Refusing to delete ${result.unused} of ${result.files} images in one go; run with --force if that's really right.`;
            log(result.aborted);
            return result;
        }
        if (!dryRun) {
            for (const full of doomed) {
                try {
                    fs.rmSync(full, { force: true });
                    result.deleted++;
                } catch (err) {
                    log(`Couldn't delete ${full}: ${err.message}`);
                }
            }
            // Tidy directories left empty.
            for (const { dir } of storedFiles()) {
                try {
                    if (!fs.readdirSync(dir).length) fs.rmdirSync(dir);
                } catch { /* in use again, or gone */ }
            }
        }
        return result;
    });
}

/**
 * Run once a day, a few minutes after start and then every 24 hours, unless
 * config imageCleanup.enabled is false. Each instance schedules it; the
 * advisory lock means only one does the work at a time.
 */
export function scheduleImageCleanup(knex, logger) {
    if (!setting('enabled', true)) return null;
    const run = async () => {
        try {
            const r = await cleanUpImages(knex, { log: (message) => logger.warn({ message: `image clean-up: ${message}` }) });
            if (r.aborted) logger.warn({ message: `image clean-up skipped: ${r.aborted}` });
            else logger.info({ message: 'image clean-up', ...r });
        } catch (err) {
            logger.error({ message: 'image clean-up failed', err });
        }
    };
    const first = setTimeout(run, setting('firstRunMinutes', 10) * 60 * 1000);
    const every = setInterval(run, DAY_MS);
    first.unref();
    every.unref();
    return { first, every };
}

export const imagesDir = IMAGES_DIR;
