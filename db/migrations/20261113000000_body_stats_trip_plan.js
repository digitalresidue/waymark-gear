// Calorie, food and water estimates (client/utils/energy.js):
//
// - users.body_stats: a member's own weight, height, birth year, sex and
//   build. Private: only ever read by its owner (GET /api/body-stats), never
//   on a profile, a shared list, the API for others or a timeline.
// - trips.plan: the trip's expected distance, climbing, terrain, pace,
//   temperatures, days between town stops and distance between water
//   sources.

export async function up(knex) {
    await knex.raw(`
        alter table users add column if not exists body_stats jsonb not null default '{}';
        alter table trips add column if not exists plan jsonb not null default '{}';
    `);
}

export async function down(knex) {
    await knex.raw(`
        alter table trips drop column if exists plan;
        alter table users drop column if exists body_stats;
    `);
}
