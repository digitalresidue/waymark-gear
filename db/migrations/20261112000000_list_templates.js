// List templates: a member marks one of their own lists (Day hike,
// Overnighter, Trail run, Thru-hike...) as a template, then starts a new list
// from it in one click, from the New list menu or a trip. The copy uses the
// same closet gear (Library.copyList).

export async function up(knex) {
    await knex.raw('alter table pack_lists add column if not exists template boolean not null default false');
}

export async function down(knex) {
    await knex.raw('alter table pack_lists drop column if exists template');
}
