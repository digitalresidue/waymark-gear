// Supporters who choose to be thanked by name on /supporters. Off until
// they turn it on: being a paying Supporter isn't shown without asking.

export async function up(knex) {
    await knex.raw('alter table users add column if not exists supporter_public boolean not null default false');
}

export async function down(knex) {
    await knex.raw('alter table users drop column if exists supporter_public');
}
