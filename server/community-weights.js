// Community weights for catalog gear, from members' own weights.
//
// Gear added from the catalog arrives with the catalog's weight. When its
// owner sets a weight of their own (gear_items.weight_own, client/dataTypes.js),
// that's a weigh-in for the catalog item. Once at least ten members agree
// (client/utils/community-weight.js), the catalog item carries their weight:
// the gear page, Explore, Compare and gear just added show it. Nobody's own
// gear ever changes: list items keep whatever weight their owner has.
//
// Recomputed for the gear a save touches, a moment after it (refreshSoon),
// and for everything once a day (scheduleCommunityWeights), which also
// catches gear deleted with an account.

import knex from './db.js';
import { communityWeight, perPerson } from '../client/utils/community-weight.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH = 500;

/** Recompute these catalog items' community weights now. */
export async function recompute(catalogIds, db = knex) {
    const ids = [...new Set((catalogIds || []).filter((id) => typeof id === 'string' && UUID_RE.test(id)))];
    for (let i = 0; i < ids.length; i += BATCH) {
        const slice = ids.slice(i, i + BATCH);
        // Owned gear only: not wishlists.
        const rows = await db('gear_items').whereIn('catalog_id', slice).where({ weight_own: true, wishlist: false }).where('weight_mg', '>', 0)
            .select('catalog_id', 'user_id', 'weight_mg');
        const byItem = new Map(slice.map((id) => [id, []]));
        for (const r of rows) byItem.get(r.catalog_id).push({ userId: r.user_id, weightMg: Number(r.weight_mg) });
        for (const [id, list] of byItem) {
            const c = communityWeight(perPerson(list));
            await db('catalog_items').where({ id }).update({
                community_weight_mg: c.weightMg,
                community_count: c.count,
                community_total: c.total,
                community_updated_at: db.fn.now(),
            });
        }
    }
    return ids.length;
}

/** Every catalog item anyone has weighed, plus any that had a result. */
export async function recomputeAll(db = knex) {
    const weighed = await db('gear_items').where({ weight_own: true }).whereNotNull('catalog_id').distinct('catalog_id').pluck('catalog_id');
    const had = await db('catalog_items').where('community_total', '>', 0).pluck('id');
    return recompute([...weighed, ...had], db);
}

// Saves come in bursts (each field edit saves): gather them for a moment.
const pending = new Set();
let timer = null;
let log = null;
const WAIT_MS = 1500;

/** After a save: recompute these catalog items shortly, once. */
export function refreshSoon(catalogIds) {
    for (const id of catalogIds || []) if (id) pending.add(id);
    if (!pending.size || timer) return;
    timer = setTimeout(async () => {
        timer = null;
        const ids = [...pending];
        pending.clear();
        try {
            await recompute(ids);
        } catch (err) {
            if (log) log.error({ message: 'community weights: recompute failed', err });
        }
    }, WAIT_MS);
    timer.unref?.();
}

/** On start and once a day: everything. */
export function scheduleCommunityWeights(logger) {
    log = logger;
    const run = async () => {
        try {
            const n = await recomputeAll();
            if (n) logger.info({ message: 'community weights recomputed', items: n });
        } catch (err) {
            logger.error({ message: 'community weights: daily recompute failed', err });
        }
    };
    setTimeout(run, 30 * 1000).unref();
    setInterval(run, DAY_MS).unref();
}
