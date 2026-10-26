// Public @profiles (Phase 3.5). Everything here is shown on /@username, so
// it's all optional and the profile can be hidden outright.
export async function up(knex) {
    await knex.raw(`
        alter table users add column if not exists display_name text not null default '';
        alter table users add column if not exists trail_name text not null default '';
        alter table users add column if not exists bio text not null default '';
        alter table users add column if not exists avatar_url text not null default '';
        alter table users add column if not exists banner_url text not null default '';
        alter table users add column if not exists social_links jsonb not null default '{}';
        alter table users add column if not exists profile_featured jsonb not null default '[]';
        alter table users add column if not exists profile_hidden boolean not null default false;
    `);
}

export async function down(knex) {
    await knex.raw(`
        alter table users drop column if exists display_name;
        alter table users drop column if exists trail_name;
        alter table users drop column if exists bio;
        alter table users drop column if exists avatar_url;
        alter table users drop column if exists banner_url;
        alter table users drop column if exists social_links;
        alter table users drop column if exists profile_featured;
        alter table users drop column if exists profile_hidden;
    `);
}
