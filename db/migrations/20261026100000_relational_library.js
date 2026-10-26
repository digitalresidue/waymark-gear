// Move each user's library out of the users.library JSON column into tables
// (see server/library-store.js for the shape and why).
//
// Existing libraries are converted in place; the old column is kept, emptied,
// and made nullable so `down` can put everything back.
//
// This migration calls server/library-store.js to do the conversion. Later
// changes to that module must keep working against the schema created here,
// or add their columns in a migration that runs before the conversion would
// need them.

import { loadLibrary, replaceLibrary } from '../../server/library-store.js';

export async function up(knex) {
    await knex.raw(`
        create table library_settings (
            user_id uuid primary key references users (user_id) on delete cascade,
            total_unit text not null default 'oz',
            item_unit text not null default 'oz',
            default_list_id bigint,
            sequence bigint not null default 0,
            show_sidebar boolean not null default true,
            preferences jsonb not null default '{}',
            currency_symbol text not null default '$',
            updated_at timestamptz not null default now()
        );

        -- The closet: every piece of gear a user owns. retired = no longer in
        -- use; hidden from the closet but still shown in lists that have it.
        create table gear_items (
            user_id uuid not null references users (user_id) on delete cascade,
            id bigint not null,
            seq bigserial,
            name text not null default '',
            description text not null default '',
            weight_mg double precision not null default 0,
            author_unit text not null default 'oz',
            price double precision not null default 0,
            image text not null default '',
            image_url text not null default '',
            url text not null default '',
            catalog_id uuid references catalog_items (id) on delete set null,
            catalog_sync boolean not null default false,
            retired boolean not null default false,
            -- Phase 4 (also added by 20261028000000 for databases that ran
            -- this migration before these columns existed).
            closet_category text not null default '',
            photos jsonb not null default '[]',
            video_url text not null default '',
            updated_at timestamptz not null default now(),
            primary key (user_id, id)
        );
        create index gear_items_catalog_idx on gear_items (catalog_id) where catalog_id is not null;

        create table pack_lists (
            user_id uuid not null references users (user_id) on delete cascade,
            id bigint not null,
            position integer not null default 0,
            name text not null default '',
            description text not null default '',
            external_id text,
            optional_fields jsonb not null default '{}',
            pinned boolean not null default false,
            published boolean not null default false,
            -- Asking for a shakedown (suggestions in the comments).
            shakedown boolean not null default false,
            trip_type text not null default '',
            -- Trip planner: { days, foodPerDayMg, waterLiters }, or null.
            trip jsonb,
            updated_at timestamptz not null default now(),
            primary key (user_id, id)
        );
        create unique index pack_lists_external_id_idx on pack_lists (external_id) where external_id is not null;

        create table pack_list_categories (
            user_id uuid not null,
            id bigint not null,
            list_id bigint not null,
            position integer not null default 0,
            name text not null default '',
            color jsonb,
            collapsed boolean not null default false,
            primary key (user_id, id),
            foreign key (user_id, list_id) references pack_lists (user_id, id) on delete cascade
        );
        create index pack_list_categories_list_idx on pack_list_categories (user_id, list_id);

        create table pack_list_items (
            user_id uuid not null,
            category_id bigint not null,
            item_id bigint not null,
            position integer not null default 0,
            qty double precision not null default 1,
            worn integer not null default 0,
            consumable boolean not null default false,
            star integer not null default 0,
            -- Checked off in Pack mode.
            packed boolean not null default false,
            primary key (user_id, category_id, item_id),
            foreign key (user_id, category_id) references pack_list_categories (user_id, id) on delete cascade,
            foreign key (user_id, item_id) references gear_items (user_id, id) on delete cascade
        );
        create index pack_list_items_item_idx on pack_list_items (user_id, item_id);

        alter table users alter column library drop not null;
    `);

    const users = await knex('users').whereNotNull('library').select('user_id', 'username', 'library');
    for (const user of users) {
        try {
            await replaceLibrary(user.user_id, user.library, knex);
        } catch (err) {
            // Leave this one in the old column rather than failing everyone;
            // it is logged so an operator can look at it.
            console.error(`library migration: kept ${user.username} in users.library: ${err.message}`);
            continue;
        }
        await knex('users').where({ user_id: user.user_id }).update({ library: null });
    }
}

export async function down(knex) {
    const users = await knex('library_settings').select('user_id');
    for (const { user_id: userId } of users) {
        const library = await loadLibrary(userId, knex);
        await knex('users').where({ user_id: userId }).update({ library: JSON.stringify(library) });
    }
    await knex.raw(`
        drop table pack_list_items;
        drop table pack_list_categories;
        drop table pack_lists;
        drop table gear_items;
        drop table library_settings;
    `);
}
