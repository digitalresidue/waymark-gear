// The Lightest board slides lists that go untouched or get downvoted
// (client/utils/board-rules.js).
//
// kit_clock remembers, per share id, when the list's gear last changed (a
// fingerprint of its items, weights and quantities, so renaming a list doesn't
// count) and when its owner last said "Still carrying this". It is its own
// table so unpublishing and republishing doesn't restart the clock.
// public_kits gets the board's Gear check result.

export async function up(knex) {
    await knex.raw(`
        create table if not exists kit_clock (
            external_id text primary key,
            gear_hash text,
            gear_changed_at timestamptz not null default now(),
            confirmed_at timestamptz
        );
        insert into kit_clock (external_id, gear_changed_at)
            select external_id, updated_at from public_kits
            on conflict (external_id) do nothing;
        alter table public_kits add column if not exists readiness smallint;
        alter table public_kits add column if not exists board_ok boolean not null default true;
        alter table public_kits add column if not exists board_checked boolean not null default false;
    `);
}

export async function down(knex) {
    await knex.raw(`
        alter table public_kits drop column if exists board_checked;
        alter table public_kits drop column if exists board_ok;
        alter table public_kits drop column if exists readiness;
        drop table if exists kit_clock;
    `);
}
