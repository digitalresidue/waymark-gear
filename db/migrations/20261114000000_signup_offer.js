// The one-time Supporter offer a new account sees right after signing up
// (server/signup-offer.js): open until this time, unless they skip it.
// Accounts made before this have none.

export async function up(knex) {
    await knex.raw('alter table users add column if not exists signup_offer_until timestamptz');
}

export async function down(knex) {
    await knex.raw('alter table users drop column if exists signup_offer_until');
}
