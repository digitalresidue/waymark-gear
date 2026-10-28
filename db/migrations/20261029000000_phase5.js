// Phase 5: planning together. Shared lists (members who can edit),
// who carries what, gear kits, quantity owned, packed-vs-used.
export async function up(knex) {
    await knex.raw(`
        alter table library_settings add column if not exists kits jsonb not null default '[]';
        alter table gear_items add column if not exists qty_owned integer;
        alter table pack_list_items add column if not exists carrier text not null default '';
        alter table pack_list_items add column if not exists unused boolean not null default false;
        -- Where a notification leads, when it isn't a list's page.
        alter table notifications add column if not exists url text not null default '';

        create table if not exists list_members (
            owner_id uuid not null,
            list_id bigint not null,
            member_id uuid not null references users (user_id) on delete cascade,
            role text not null default 'editor' check (role in ('editor')),
            created_at timestamptz not null default now(),
            primary key (owner_id, list_id, member_id),
            foreign key (owner_id, list_id) references pack_lists (user_id, id) on delete cascade
        );
        create index if not exists list_members_member_idx on list_members (member_id);
    `);
}

export async function down(knex) {
    await knex.raw(`
        drop table if exists list_members;
        alter table notifications drop column if exists url;
        alter table pack_list_items drop column if exists unused;
        alter table pack_list_items drop column if exists carrier;
        alter table gear_items drop column if exists qty_owned;
        alter table library_settings drop column if exists kits;
    `);
}
