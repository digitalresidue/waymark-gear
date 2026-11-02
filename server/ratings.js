// Star ratings for catalog gear (client/utils/ratings.js has the rules).

import knex from './db.js';
import { isUuid } from './catalog.js';
import { PRIOR } from '../client/utils/ratings.js';

export class RatingError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}

// Bring an item's average, count and ranking score up to date.
export async function recompute(catalogId, db = knex) {
    const [s] = await db('gear_ratings').where({ catalog_id: catalogId })
        .select(db.raw('avg(stars)::real as avg'), db.raw('count(*)::int as n'));
    const n = Number(s.n) || 0;
    const avg = n ? Number(s.avg) : null;
    await db('catalog_items').where({ id: catalogId }).update({
        rating_avg: avg,
        rating_count: n,
        rating_score: n ? (PRIOR.mean * PRIOR.weight + avg * n) / (PRIOR.weight + n) : PRIOR.mean,
    });
    return summaryOf({ rating_avg: avg, rating_count: n });
}

export function summaryOf(row) {
    const count = Number(row.rating_count) || 0;
    return { average: count ? Math.round(Number(row.rating_avg) * 10) / 10 : null, count };
}

// Set (1-5) or clear (0) this person's rating. Rating again replaces it.
export async function rate(user, catalogId, value, db = knex) {
    if (!isUuid(catalogId)) throw new RatingError('No such gear.', 404);
    const item = await db('catalog_items').where({ id: catalogId, status: 'published' }).first('id');
    if (!item) throw new RatingError('No such gear.', 404);
    const stars = Number(value);
    if (stars === 0) {
        await db('gear_ratings').where({ catalog_id: catalogId, user_id: user.user_id }).del();
    } else if (Number.isInteger(stars) && stars >= 1 && stars <= 5) {
        await db('gear_ratings').insert({ catalog_id: catalogId, user_id: user.user_id, stars })
            .onConflict(['catalog_id', 'user_id']).merge({ stars, updated_at: db.fn.now() });
    } else {
        throw new RatingError('Pick 1 to 5 stars.');
    }
    const summary = await recompute(catalogId, db);
    return { ...summary, mine: stars || null };
}

// An item's rating and, for a signed-in reader, theirs.
export async function ratingFor(catalogId, user = null) {
    if (!isUuid(catalogId)) throw new RatingError('No such gear.', 404);
    const row = await knex('catalog_items').where({ id: catalogId }).first('rating_avg', 'rating_count');
    if (!row) throw new RatingError('No such gear.', 404);
    const mine = user ? await knex('gear_ratings').where({ catalog_id: catalogId, user_id: user.user_id }).first('stars') : null;
    return { ...summaryOf(row), mine: mine ? mine.stars : null };
}
