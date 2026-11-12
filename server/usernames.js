// A username made up for someone who didn't pick one (Google sign-up, or the
// email form with the username left empty): their email's name, lowercase
// letters and digits, 3 to 24 characters, with a number added when it's taken.

import crypto from 'node:crypto';

import knex from './db.js';

export function usernameStem(email, name) {
    const base = (String(email || '').split('@')[0] || String(name || '') || 'hiker')
        .toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24) || 'hiker';
    return base.length >= 3 ? base : `${base}hiker`.slice(0, 24);
}

export async function pickUsername(email, name, db = knex) {
    const stem = usernameStem(email, name);
    for (let attempt = 0; attempt < 20; attempt++) {
        const candidate = attempt === 0 ? stem : `${stem}${crypto.randomInt(10, 99999)}`;
        const taken = await db('users').where({ username: candidate }).first('user_id');
        if (!taken) return candidate;
    }
    return `hiker${crypto.randomInt(100000, 999999999)}`;
}
