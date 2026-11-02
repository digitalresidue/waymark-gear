// The team: people the owner adds as admins or moderators from the Team
// page (the owners themselves are the `admins` server setting). Every change
// an admin or owner makes is logged in admin_actions; the risky ones an
// admin asks for (deletes, big imports) wait there for the owner's OK.

export async function up(knex) {
    await knex.raw(`
        create table if not exists team_members (
            user_id uuid primary key references users (user_id) on delete cascade,
            role text not null check (role in ('admin', 'moderator')),
            added_by text not null default '',
            added_at timestamptz not null default now()
        );
        create table if not exists admin_actions (
            id bigserial primary key,
            username text not null,
            action text not null,
            summary text not null default '',
            status text not null default 'done' check (status in ('done', 'pending', 'approved', 'rejected', 'failed')),
            payload jsonb,
            decided_by text,
            decided_at timestamptz,
            note text not null default '',
            created_at timestamptz not null default now()
        );
        create index if not exists admin_actions_recent_idx on admin_actions (created_at desc);
        create index if not exists admin_actions_pending_idx on admin_actions (status) where status = 'pending';
    `);
}

export async function down(knex) {
    await knex.raw(`
        drop table if exists admin_actions;
        drop table if exists team_members;
    `);
}
