// Following hikers: their newly published lists show in your Following
// feed and (if you want) your notifications.

import knex from './db.js';
import { notify, sendNotificationEmails } from './notify.js';

export class FollowError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}

async function userByName(username) {
    const u = await knex('users').whereRaw('lower(username) = ?', [String(username || '').toLowerCase()]).first();
    if (!u || u.profile_hidden) throw new FollowError('No such hiker.', 404);
    return u;
}

export async function followCounts(userId) {
    const [[{ followers }], [{ following }]] = await Promise.all([
        knex('follows').where({ followee_id: userId }).count({ followers: '*' }),
        knex('follows').where({ follower_id: userId }).count({ following: '*' }),
    ]);
    return { followers: Number(followers), following: Number(following) };
}

export async function followState(viewer, username) {
    const target = await userByName(username);
    const counts = await followCounts(target.user_id);
    const following = viewer
        ? Boolean(await knex('follows').where({ follower_id: viewer.user_id, followee_id: target.user_id }).first())
        : false;
    return { ...counts, following, self: Boolean(viewer && viewer.user_id === target.user_id) };
}

export async function follow(user, username) {
    const target = await userByName(username);
    if (target.user_id === user.user_id) throw new FollowError("You can't follow yourself.");
    const emails = await knex.transaction(async (trx) => {
        const inserted = await trx('follows').insert({ follower_id: user.user_id, followee_id: target.user_id })
            .onConflict(['follower_id', 'followee_id']).ignore().returning('follower_id');
        if (!inserted.length) return [];
        return notify(trx, [{ recipientId: target.user_id, kind: 'follow', actor: user.username, url: `/@${user.username}` }]);
    });
    sendNotificationEmails(emails);
    return followState(user, username);
}

export async function unfollow(user, username) {
    const target = await userByName(username);
    await knex('follows').where({ follower_id: user.user_id, followee_id: target.user_id }).del();
    return followState(user, username);
}

export async function followingList(user) {
    return knex('follows').join('users', 'users.user_id', 'follows.followee_id')
        .where({ follower_id: user.user_id })
        .select('users.username', 'users.display_name', 'users.avatar_url')
        .orderBy('follows.created_at', 'desc').limit(500)
        .then((rows) => rows.map((r) => ({ username: r.username, displayName: r.display_name || '', avatarUrl: r.avatar_url || '' })));
}

// Called after a save publishes lists that weren't public before.
export async function notifyFollowersOfNewKits(user, kits) {
    if (!kits.length) return;
    const followers = await knex('follows').where({ followee_id: user.user_id }).pluck('follower_id');
    if (!followers.length) return;
    const emails = await knex.transaction((trx) => notify(trx, followers.flatMap((id) => kits.map((k) => ({
        recipientId: id, kind: 'published', actor: user.username, listName: k.name, externalId: k.externalId,
    })))));
    sendNotificationEmails(emails);
}
