// A member's units: 'imperial' or 'metric' (client/utils/units.js), '' until
// they pick. Follows them to every device they sign in on.

export async function up(knex) {
    await knex.raw("alter table users add column if not exists units text not null default ''");
}

export async function down(knex) {
    await knex.raw('alter table users drop column if exists units');
}
