// A member's language (client/utils/i18n.js LANGUAGES): '' until they pick
// one, then the site's menus and pages follow it on every device they sign
// in on.

export async function up(knex) {
    await knex.raw("alter table users add column if not exists language text not null default ''");
}

export async function down(knex) {
    await knex.raw('alter table users drop column if exists language');
}
