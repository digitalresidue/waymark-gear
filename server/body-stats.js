// A member's body stats for the calorie estimates (client/utils/energy.js):
// weight, height, birth year, sex and build. Private to them: read and
// written only here, by their owner, and never shown to anyone else.

import knex from './db.js';
import { SEXES, BUILDS } from '../client/utils/energy.js';

const within = (v, min, max) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 10) / 10 : null;
};

/** What's saved, cleaned: { kg, heightCm, birthYear, age, sex, build }. */
export function cleanBodyStats(input = {}) {
    const year = new Date().getFullYear();
    const out = {
        kg: within(input.kg, 25, 300),
        heightCm: within(input.heightCm, 100, 250),
        birthYear: within(input.birthYear, year - 110, year - 10),
        sex: SEXES[input.sex] ? input.sex : null,
        build: BUILDS[input.build] ? input.build : null,
    };
    if (out.birthYear !== null) out.birthYear = Math.round(out.birthYear);
    return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== null));
}

function withAge(stats) {
    return stats.birthYear ? { ...stats, age: new Date().getFullYear() - stats.birthYear } : stats;
}

export async function bodyStats(user) {
    const row = await knex('users').where({ user_id: user.user_id }).first('body_stats');
    return withAge(cleanBodyStats((row && row.body_stats) || {}));
}

export async function saveBodyStats(user, input) {
    const stats = cleanBodyStats(input);
    await knex('users').where({ user_id: user.user_id }).update({ body_stats: JSON.stringify(stats) });
    return withAge(stats);
}
