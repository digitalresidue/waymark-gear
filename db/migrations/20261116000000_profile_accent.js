// A Supporter's profile accent colour (client/utils/profile-accents.js);
// '' is the site's own colours.

export async function up(knex) {
    await knex.raw("alter table users add column if not exists profile_accent text not null default ''");
}

export async function down(knex) {
    await knex.raw('alter table users drop column if exists profile_accent');
}
