// Phase 6: the trip hub. Trip journals (trips with day-by-day entries) and
// gear reviews on catalog items. Gear lifecycle and trip details live in the
// library (gear_items columns and the list's trip settings).
export async function up(knex) {
    await knex.raw(`
        alter table gear_items add column if not exists purchased_on text not null default '';
        alter table gear_items add column if not exists condition text not null default '';
        alter table gear_items add column if not exists life_years real;

        create table if not exists trips (
            id bigserial primary key,
            user_id uuid not null references users (user_id) on delete cascade,
            title text not null,
            summary text not null default '',
            start_date date,
            end_date date,
            -- One of the owner's pack lists (pack_lists.id), if they linked one.
            list_id bigint,
            visibility text not null default 'private' check (visibility in ('public', 'followers', 'private')),
            cover_url text not null default '',
            created_at timestamptz not null default now(),
            updated_at timestamptz not null default now()
        );
        create index if not exists trips_user_idx on trips (user_id, start_date desc nulls last);
        create index if not exists trips_public_idx on trips (visibility, updated_at desc);

        create table if not exists trip_entries (
            id bigserial primary key,
            trip_id bigint not null references trips (id) on delete cascade,
            entry_date date,
            title text not null default '',
            body text not null default '',
            photos jsonb not null default '[]',
            distance_km real,
            created_at timestamptz not null default now(),
            updated_at timestamptz not null default now()
        );
        create index if not exists trip_entries_trip_idx on trip_entries (trip_id, entry_date, id);

        create table if not exists gear_reviews (
            id bigserial primary key,
            catalog_id uuid not null references catalog_items (id) on delete cascade,
            author_id uuid not null references users (user_id) on delete cascade,
            author_username text not null,
            rating smallint not null check (rating between 1 and 5),
            title text not null default '',
            body text not null default '',
            pros text not null default '',
            cons text not null default '',
            used_for text not null default '',
            -- Written by site staff (owners, moderators, named reviewers).
            staff boolean not null default false,
            hidden_at timestamptz,
            created_at timestamptz not null default now(),
            updated_at timestamptz not null default now(),
            unique (catalog_id, author_id)
        );
        create index if not exists gear_reviews_catalog_idx on gear_reviews (catalog_id, created_at desc);
        create index if not exists gear_reviews_recent_idx on gear_reviews (created_at desc);
    `);
}

export async function down(knex) {
    await knex.raw(`
        drop table if exists gear_reviews;
        drop table if exists trip_entries;
        drop table if exists trips;
        alter table gear_items drop column if exists life_years;
        alter table gear_items drop column if exists condition;
        alter table gear_items drop column if exists purchased_on;
    `);
}
