// Phase 4: follows, votes, trip types, profile tags, notification settings,
// per-account theme, closet categories, gear photos and video links,
// video view counts, and problem-report tickets.
export async function up(knex) {
    await knex.raw(`
        alter table gear_items add column if not exists closet_category text not null default '';
        alter table gear_items add column if not exists photos jsonb not null default '[]';
        alter table gear_items add column if not exists video_url text not null default '';
        alter table pack_lists add column if not exists trip_type text not null default '';

        alter table public_kits add column if not exists trip_type text not null default '';
        create index if not exists public_kits_trip_idx on public_kits (trip_type);
        -- When the current shakedown request was made ("New" on the board).
        alter table public_kits add column if not exists shakedown_at timestamptz;

        alter table users add column if not exists profile_tags jsonb not null default '{}';
        alter table users add column if not exists notify_prefs jsonb not null default '{}';
        alter table users add column if not exists theme_pref text not null default 'system';

        create table if not exists follows (
            follower_id uuid not null references users (user_id) on delete cascade,
            followee_id uuid not null references users (user_id) on delete cascade,
            created_at timestamptz not null default now(),
            primary key (follower_id, followee_id),
            check (follower_id <> followee_id)
        );
        create index if not exists follows_followee_idx on follows (followee_id);

        -- One vote per person per list; only votes from the last 30 days count.
        create table if not exists list_votes (
            external_id text not null,
            user_id uuid not null references users (user_id) on delete cascade,
            value smallint not null check (value in (-1, 1)),
            created_at timestamptz not null default now(),
            primary key (external_id, user_id)
        );
        create index if not exists list_votes_recent_idx on list_votes (external_id, created_at);

        create table if not exists video_views (
            video_id text primary key,
            views bigint not null default 0
        );

        create table if not exists tickets (
            id bigserial primary key,
            kind text not null default 'other',
            target_url text not null default '',
            target_label text not null default '',
            body text not null,
            reporter_id uuid references users (user_id) on delete set null,
            reporter_username text not null default '',
            status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'wont_fix')),
            priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
            assignee text not null default '',
            staff_notes text not null default '',
            created_at timestamptz not null default now(),
            updated_at timestamptz not null default now()
        );
        create index if not exists tickets_status_idx on tickets (status, priority, created_at);
    `);
}

export async function down(knex) {
    await knex.raw(`
        drop table if exists tickets;
        drop table if exists video_views;
        drop table if exists list_votes;
        drop table if exists follows;
        alter table users drop column if exists theme_pref;
        alter table users drop column if exists notify_prefs;
        alter table users drop column if exists profile_tags;
        alter table public_kits drop column if exists shakedown_at;
        alter table public_kits drop column if exists trip_type;
        alter table pack_lists drop column if exists trip_type;
        alter table gear_items drop column if exists video_url;
        alter table gear_items drop column if exists photos;
        alter table gear_items drop column if exists closet_category;
    `);
}
