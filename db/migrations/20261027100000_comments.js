// Comments on published lists, shakedown requests, notifications and
// comment reports (Phase 3.6).
export async function up(knex) {
    await knex.raw(`
        create table if not exists comments (
            id bigserial primary key,
            -- The list's share id; comments show while that list is published.
            external_id text not null,
            list_owner_id uuid not null references users (user_id) on delete cascade,
            author_id uuid not null references users (user_id) on delete cascade,
            parent_id bigint references comments (id) on delete cascade,
            depth smallint not null default 0,
            kind text not null default 'comment' check (kind in ('comment', 'suggestion')),
            -- For a suggestion: the item it's about, as named in the list.
            item_name text not null default '',
            body text not null,
            created_at timestamptz not null default now(),
            edited_at timestamptz,
            deleted_at timestamptz,
            hidden_at timestamptz,
            hidden_by text
        );
        create index if not exists comments_list_idx on comments (external_id, created_at);
        create index if not exists comments_author_idx on comments (author_id, created_at desc);

        create table if not exists comment_reports (
            id bigserial primary key,
            comment_id bigint not null references comments (id) on delete cascade,
            reporter_id uuid not null references users (user_id) on delete cascade,
            reason text not null default '',
            created_at timestamptz not null default now(),
            resolved_at timestamptz,
            unique (comment_id, reporter_id)
        );
        create index if not exists comment_reports_open_idx on comment_reports (created_at) where resolved_at is null;

        create table if not exists notifications (
            id bigserial primary key,
            user_id uuid not null references users (user_id) on delete cascade,
            kind text not null,
            comment_id bigint references comments (id) on delete cascade,
            external_id text not null,
            list_name text not null default '',
            actor_username text not null,
            created_at timestamptz not null default now(),
            read_at timestamptz
        );
        create index if not exists notifications_user_idx on notifications (user_id, created_at desc);

        alter table users add column if not exists notify_email boolean not null default true;
        alter table users add column if not exists last_notify_email_at timestamptz;
        alter table public_kits add column if not exists shakedown boolean not null default false;
    `);
}

export async function down(knex) {
    await knex.raw(`
        alter table public_kits drop column if exists shakedown;
        alter table users drop column if exists last_notify_email_at;
        alter table users drop column if exists notify_email;
        drop table if exists notifications;
        drop table if exists comment_reports;
        drop table if exists comments;
    `);
}
