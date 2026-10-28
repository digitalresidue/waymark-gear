// Trip journals: a trip (dates, summary, linked pack list) with day-by-day
// entries (markdown notes and photos). Each trip is public, for followers,
// or private.

import knex from './db.js';
import { loadLibrary } from './library-store.js';
import { Library } from '../client/dataTypes.js';
import { userImageLocation } from './images.js';

export class TripError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}

const VISIBILITY = ['public', 'followers', 'private'];
const PHOTO_RE = /^\/userimages\/[0-9a-f]{2}\/[0-9a-f]{16}\/[0-9a-f]{16}_photo\.webp$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const text = (v, max) => String(v ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max);
const date = (v) => (DATE_RE.test(String(v || '')) && !Number.isNaN(Date.parse(v)) ? String(v) : null);
const dateOut = (d) => (d ? (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10)) : null);

function tripApi(t, extra = {}) {
    return {
        id: Number(t.id),
        title: t.title,
        summary: t.summary,
        startDate: dateOut(t.start_date),
        endDate: dateOut(t.end_date),
        listId: t.list_id === null ? null : Number(t.list_id),
        visibility: t.visibility,
        coverUrl: t.cover_url,
        updatedAt: t.updated_at,
        ...extra,
    };
}

function entryApi(e, startDate) {
    const d = dateOut(e.entry_date);
    let day = null;
    if (d && startDate) day = Math.round((Date.parse(d) - Date.parse(startDate)) / 86400000) + 1;
    return {
        id: Number(e.id),
        date: d,
        day,
        title: e.title,
        body: e.body,
        photos: Array.isArray(e.photos) ? e.photos : [],
        distanceKm: e.distance_km === null ? null : Number(e.distance_km),
    };
}

function cleanTrip(input = {}, userId) {
    const title = text(input.title, 120);
    if (!title) throw new TripError('Give the trip a name.');
    const start = date(input.startDate);
    const end = date(input.endDate);
    if (start && end && end < start) throw new TripError('The trip ends before it starts.');
    return {
        title,
        summary: text(input.summary, 4000),
        start_date: start,
        end_date: end,
        list_id: Number.isSafeInteger(input.listId) && input.listId > 0 ? input.listId : null,
        visibility: VISIBILITY.includes(input.visibility) ? input.visibility : 'private',
        cover_url: ownPhoto(userId)(input.coverUrl) ? input.coverUrl : '',
    };
}

function cleanEntry(input = {}, userId) {
    const photos = (Array.isArray(input.photos) ? input.photos : []).filter(ownPhoto(userId)).slice(0, 8);
    const km = Number(input.distanceKm);
    return {
        entry_date: date(input.date),
        title: text(input.title, 160),
        body: text(input.body, 20000),
        photos: JSON.stringify(photos),
        distance_km: input.distanceKm !== null && input.distanceKm !== '' && Number.isFinite(km) && km >= 0 && km <= 500 ? km : null,
    };
}

// Your own uploads only: someone else's photo can't be pulled into your journal.
const ownPhoto = (userId) => {
    const prefix = `${userImageLocation(userId).urlPath}/`;
    return (p) => typeof p === 'string' && PHOTO_RE.test(p) && p.startsWith(prefix);
};

async function ownTrip(user, id) {
    const trip = await knex('trips').where({ id: Number(id) || 0, user_id: user.user_id }).first();
    if (!trip) throw new TripError('No such trip.', 404);
    return trip;
}

export async function myTrips(user) {
    const rows = await knex('trips').where({ user_id: user.user_id })
        .select('trips.*', knex.raw('(select count(*) from trip_entries e where e.trip_id = trips.id) as entry_count'))
        .orderByRaw('start_date desc nulls last, id desc');
    return rows.map((t) => tripApi(t, { entryCount: Number(t.entry_count) }));
}

export async function createTrip(user, input) {
    const [row] = await knex('trips').insert({ ...cleanTrip(input, user.user_id), user_id: user.user_id }).returning('*');
    return tripApi(row, { entries: [] });
}

export async function updateTrip(user, id, input) {
    await ownTrip(user, id);
    const [row] = await knex('trips').where({ id: Number(id) }).update({ ...cleanTrip(input, user.user_id), updated_at: knex.fn.now() }).returning('*');
    return getOwnTrip(user, row.id);
}

export async function deleteTrip(user, id) {
    await ownTrip(user, id);
    await knex('trips').where({ id: Number(id) }).del();
    return { ok: true };
}

async function entriesFor(trip) {
    const rows = await knex('trip_entries').where({ trip_id: trip.id }).orderByRaw('entry_date asc nulls last, id asc');
    return rows.map((e) => entryApi(e, dateOut(trip.start_date)));
}

export async function getOwnTrip(user, id) {
    const trip = await ownTrip(user, id);
    return tripApi(trip, { entries: await entriesFor(trip) });
}

export async function addEntry(user, tripId, input) {
    const trip = await ownTrip(user, tripId);
    const count = await knex('trip_entries').where({ trip_id: trip.id }).count({ n: '*' });
    if (Number(count[0].n) >= 400) throw new TripError('That trip has as many entries as it can hold.');
    const row = cleanEntry(input, user.user_id);
    if (!row.entry_date) {
        // No date given: the day after the last entry, or the trip's start.
        const last = await knex('trip_entries').where({ trip_id: trip.id }).max({ d: 'entry_date' }).first();
        const base = last && last.d ? new Date(last.d) : null;
        if (base) row.entry_date = new Date(base.getTime() + 86400000).toISOString().slice(0, 10);
        else row.entry_date = dateOut(trip.start_date) || new Date().toISOString().slice(0, 10);
    }
    await knex('trip_entries').insert({ ...row, trip_id: trip.id });
    await knex('trips').where({ id: trip.id }).update({ updated_at: knex.fn.now() });
    return getOwnTrip(user, trip.id);
}

export async function updateEntry(user, tripId, entryId, input) {
    const trip = await ownTrip(user, tripId);
    const n = await knex('trip_entries').where({ id: Number(entryId) || 0, trip_id: trip.id }).update({ ...cleanEntry(input, user.user_id), updated_at: knex.fn.now() });
    if (!n) throw new TripError('No such entry.', 404);
    await knex('trips').where({ id: trip.id }).update({ updated_at: knex.fn.now() });
    return getOwnTrip(user, trip.id);
}

export async function deleteEntry(user, tripId, entryId) {
    const trip = await ownTrip(user, tripId);
    await knex('trip_entries').where({ id: Number(entryId) || 0, trip_id: trip.id }).del();
    return getOwnTrip(user, trip.id);
}

// ---- reading someone's trip ---------------------------------------------------

async function canSee(trip, viewer) {
    if (trip.visibility === 'public') return true;
    if (!viewer) return false;
    if (viewer.user_id === trip.user_id) return true;
    if (trip.visibility === 'followers') {
        return Boolean(await knex('follows').where({ follower_id: viewer.user_id, followee_id: trip.user_id }).first());
    }
    return false;
}

// The trip's pack list, summarized: name, base weight, its share page if any.
async function listSummary(userId, listId) {
    if (!listId) return null;
    const serialized = await loadLibrary(userId);
    if (!serialized) return null;
    const library = new Library();
    library.load(serialized);
    const list = library.lists.find((l) => l.id === Number(listId));
    if (!list) return null;
    list.calculateTotals();
    return { unit: library.totalUnit, name: list.name || 'Pack list', baseWeightMg: list.totalBaseWeight, externalId: list.externalId || '', published: Boolean(list.published) };
}

export async function viewTrip(id, viewer) {
    const trip = await knex('trips').join('users', 'users.user_id', 'trips.user_id')
        .where('trips.id', Number(id) || 0)
        .select('trips.*', 'users.username', 'users.display_name', 'users.avatar_url', 'users.profile_hidden')
        .first();
    if (!trip || !(await canSee(trip, viewer))) return null;
    return {
        trip: tripApi(trip, { entries: await entriesFor(trip) }),
        author: { username: trip.username, displayName: trip.display_name || '', avatarUrl: trip.avatar_url || '' },
        list: await listSummary(trip.user_id, trip.list_id),
        ownerId: trip.user_id,
    };
}

// Trips shown on someone's profile, for this viewer.
export async function tripsOnProfile(userId, viewer) {
    const isFollower = viewer && viewer.user_id !== userId
        && Boolean(await knex('follows').where({ follower_id: viewer.user_id, followee_id: userId }).first());
    const own = viewer && viewer.user_id === userId;
    const q = knex('trips').where({ user_id: userId });
    if (!own) q.whereIn('visibility', isFollower ? ['public', 'followers'] : ['public']);
    const rows = await q.select('trips.*', knex.raw('(select count(*) from trip_entries e where e.trip_id = trips.id) as entry_count'))
        .orderByRaw('start_date desc nulls last, id desc').limit(100);
    return rows.map((t) => tripApi(t, { entryCount: Number(t.entry_count) }));
}

