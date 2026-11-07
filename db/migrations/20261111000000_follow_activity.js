// Follow: an activity timeline of the hikers you follow (server/activity.js).
//
// Most of the timeline is read straight from what's already kept (published
// lists, shakedown requests, trips, trip entries, gear reviews), so making a
// trip private or deleting an entry takes it off the timeline at once. What
// isn't kept anywhere is how a published pack changed, so:
//
// - pack_updates: one row per stretch of editing on a published list (edits
//   within 12 hours fold into one): gear added and taken out, by name, and
//   the base weight before and after.
// - kit_clock.items: the list's gear as [[itemId, name], ...] at the last
//   save, to tell what was added or taken out.
// - trips.shared_at: when a trip was first shown to anyone (public or
//   followers), so a trip written privately and shared later shows when it
//   was shared, not when it was started.
// - users.share_activity: off keeps a member's updates out of their
//   followers' timelines (their public pages stay as they are).

export async function up(knex) {
    await knex.raw(`
        create table if not exists pack_updates (
            id bigserial primary key,
            user_id uuid not null references users (user_id) on delete cascade,
            external_id text not null references list (external_id) on delete cascade,
            added jsonb not null default '[]',
            removed jsonb not null default '[]',
            base_before_mg bigint,
            base_after_mg bigint,
            created_at timestamptz not null default now(),
            updated_at timestamptz not null default now()
        );
        create index if not exists pack_updates_user_idx on pack_updates (user_id, updated_at desc);
        create index if not exists pack_updates_list_idx on pack_updates (external_id, updated_at desc);

        alter table kit_clock add column if not exists items jsonb;

        alter table trips add column if not exists shared_at timestamptz;
        update trips set shared_at = created_at where visibility <> 'private' and shared_at is null;

        alter table users add column if not exists share_activity boolean not null default true;

        -- The timeline reads each source newest-first for the people someone
        -- follows: an index on (who, when) for each, so a page is an index
        -- walk, however many years of lists and trips the site has.
        create index if not exists trip_entries_trip_recent_idx on trip_entries (trip_id, created_at desc);
        create index if not exists public_kits_user_published_idx on public_kits (user_id, published_at desc);
        create index if not exists public_kits_user_shakedown_idx on public_kits (user_id, shakedown_at desc) where shakedown_at is not null;
        create index if not exists gear_reviews_author_idx on gear_reviews (author_id, created_at desc) where hidden_at is null;
        create index if not exists trips_user_shared_idx on trips (user_id, (coalesce(shared_at, created_at)) desc) where visibility <> 'private';

        -- Discover: the most recently updated lists, and names by prefix.
        create index if not exists public_kits_updated_idx on public_kits (updated_at desc);
        create index if not exists users_username_prefix_idx on users (lower(username) text_pattern_ops);
        create index if not exists users_display_name_prefix_idx on users (lower(display_name) text_pattern_ops);
    `);
}

export async function down(knex) {
    await knex.raw(`
        drop index if exists users_display_name_prefix_idx;
        drop index if exists users_username_prefix_idx;
        drop index if exists public_kits_updated_idx;
        drop index if exists trips_user_shared_idx;
        drop index if exists gear_reviews_author_idx;
        drop index if exists public_kits_user_shakedown_idx;
        drop index if exists public_kits_user_published_idx;
        drop index if exists trip_entries_trip_recent_idx;
        alter table users drop column if exists share_activity;
        alter table trips drop column if exists shared_at;
        alter table kit_clock drop column if exists items;
        drop table if exists pack_updates;
    `);
}
