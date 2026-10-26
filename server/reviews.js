// Gear reviews on catalog items.
//
// Staff write them: site owners, moderators and anyone on the `reviewers`
// list. Setting `openReviews` lets every signed-in member review too; their
// reviews are marked as member reviews, and staff reviews are listed first.
// One review per person per item: writing again updates it. Moderators can
// hide a review.

import config from 'config';

import knex from './db.js';
import { isModerator } from './auth.js';
import { isUuid } from './catalog.js';

export class ReviewError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}

const reviewers = () => (config.has('reviewers') ? config.get('reviewers') : []);
const openReviews = () => (config.has('openReviews') ? Boolean(config.get('openReviews')) : false);

export function isStaffReviewer(username) {
    return Boolean(username) && (isModerator(username) || reviewers().includes(username));
}

export function canReview(user) {
    if (!user) return false;
    return isStaffReviewer(user.username) || openReviews();
}

const text = (v, max) => Array.from(String(v ?? '')).filter((ch) => {
    const c = ch.charCodeAt(0);
    return c >= 0x20 || c === 0x0A || c === 0x09;
}).join('').replace(/\r\n?/g, '\n').trim().slice(0, max);

export function cleanReview(input = {}) {
    const rating = Number(input.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new ReviewError('Pick a rating from 1 to 5.');
    const body = text(input.body, 8000);
    if (body.length < 20) throw new ReviewError('Write at least a couple of sentences.');
    return {
        rating,
        title: text(input.title, 140),
        body,
        pros: text(input.pros, 1000),
        cons: text(input.cons, 1000),
        used_for: text(input.usedFor, 200),
    };
}

function present(r, viewer) {
    const moderator = viewer && isModerator(viewer.username);
    return {
        id: Number(r.id),
        catalogId: r.catalog_id,
        author: r.author_username,
        displayName: r.display_name || '',
        rating: r.rating,
        title: r.title,
        body: r.body,
        pros: r.pros,
        cons: r.cons,
        usedFor: r.used_for,
        staff: r.staff,
        hidden: Boolean(r.hidden_at),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        mine: Boolean(viewer && r.author_id === viewer.user_id),
        canModerate: Boolean(moderator),
        ...(r.item_name !== undefined ? { item: { id: r.catalog_id, name: r.item_name, brand: r.item_brand } } : {}),
    };
}

const base = () => knex('gear_reviews').leftJoin('users', 'users.user_id', 'gear_reviews.author_id')
    .select('gear_reviews.*', 'users.display_name');

// Reviews for one catalog item, staff first. Hidden reviews show only to
// moderators and their author.
export async function reviewsFor(catalogId, viewer) {
    if (!isUuid(catalogId)) return { reviews: [], summary: { count: 0, average: null } };
    const rows = await base().where('gear_reviews.catalog_id', catalogId)
        .orderBy([{ column: 'gear_reviews.staff', order: 'desc' }, { column: 'gear_reviews.created_at', order: 'desc' }]);
    const moderator = viewer && isModerator(viewer.username);
    const visible = rows.filter((r) => !r.hidden_at || moderator || (viewer && r.author_id === viewer.user_id));
    const counted = rows.filter((r) => !r.hidden_at);
    const average = counted.length ? Math.round((counted.reduce((n, r) => n + r.rating, 0) / counted.length) * 10) / 10 : null;
    return {
        reviews: visible.map((r) => present(r, viewer)),
        summary: { count: counted.length, average },
        canReview: canReview(viewer),
    };
}

export async function saveReview(user, catalogId, input) {
    if (!canReview(user)) throw new ReviewError('Reviews are written by Waymark staff for now.', 403);
    if (!isUuid(catalogId)) throw new ReviewError('No such gear.', 404);
    const item = await knex('catalog_items').where({ id: catalogId, status: 'published' }).first();
    if (!item) throw new ReviewError('No such gear.', 404);
    const value = cleanReview(input);
    const row = {
        ...value,
        catalog_id: catalogId,
        author_id: user.user_id,
        author_username: user.username,
        staff: isStaffReviewer(user.username),
        updated_at: knex.fn.now(),
    };
    await knex('gear_reviews').insert(row).onConflict(['catalog_id', 'author_id']).merge();
    return reviewsFor(catalogId, user);
}

export async function deleteReview(user, id) {
    const row = await knex('gear_reviews').where({ id: Number(id) || 0 }).first();
    if (!row) throw new ReviewError('No such review.', 404);
    if (row.author_id !== user.user_id && !isModerator(user.username)) throw new ReviewError('Denied.', 403);
    await knex('gear_reviews').where({ id: row.id }).del();
    return { ok: true };
}

export async function moderateReview(user, id, action) {
    if (!isModerator(user.username)) throw new ReviewError('Denied.', 403);
    const n = await knex('gear_reviews').where({ id: Number(id) || 0 })
        .update({ hidden_at: action === 'hide' ? knex.fn.now() : null });
    if (!n) throw new ReviewError('No such review.', 404);
    return { ok: true };
}

// The newest reviews across the catalog, for the reviews page and homepage.
export async function latestReviews({ limit = 12 } = {}) {
    const rows = await base().join('catalog_items', 'catalog_items.id', 'gear_reviews.catalog_id')
        .whereNull('gear_reviews.hidden_at').where('catalog_items.status', 'published')
        .select('catalog_items.name as item_name', 'catalog_items.brand as item_brand')
        .orderBy('gear_reviews.created_at', 'desc').limit(Math.min(Number(limit) || 12, 50));
    return rows.map((r) => present(r, null));
}

// Average rating and count for a set of catalog items (for the picker and kits).
export async function ratingsFor(ids) {
    const list = (ids || []).filter(isUuid);
    if (!list.length) return {};
    const rows = await knex('gear_reviews').whereIn('catalog_id', list).whereNull('hidden_at')
        .groupBy('catalog_id').select('catalog_id', knex.raw('avg(rating)::float as avg'), knex.raw('count(*)::int as n'));
    return Object.fromEntries(rows.map((r) => [r.catalog_id, { average: Math.round(r.avg * 10) / 10, count: r.n }]));
}
