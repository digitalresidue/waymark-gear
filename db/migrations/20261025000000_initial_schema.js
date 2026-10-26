// Baseline schema, carried over from the old hand-run db/01_users.sql.
//
// Written with IF NOT EXISTS throughout so a database that was created from
// that SQL file can adopt migrations without being rebuilt: the first
// `migrate latest` against it records this migration and changes nothing.
//
// gen_random_uuid() is built into Postgres 13+, so unlike uuid-ossp it needs
// no extension (and no superuser to create one).

export async function up(knex) {
    // A database set up from the old SQL file already has all of this. Its
    // tables were usually created by the postgres superuser (that's what the
    // old README did), and Postgres refuses even `create index if not exists`
    // to a role that doesn't own the table - so don't touch it at all.
    if (await knex.schema.hasTable('users')) {
        return;
    }

    await knex.raw(`
        create table if not exists users (
            user_id UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
            username text UNIQUE NOT NULL,
            -- Not unique: uniqueness is enforced in code at registration and
            -- change-of-email. See server/endpoints.js.
            email text NOT NULL,
            token text NOT NULL,
            password text NOT NULL,
            library JSON NOT NULL,
            sync_token integer NOT NULL DEFAULT 0,
            registered timestamp NOT NULL,
            last_seen timestamp NOT NULL,
            reset_token_hash text,
            reset_token_expires timestamp
        );

        create table if not exists list (
            list_id UUID NOT NULL DEFAULT gen_random_uuid(),
            external_id text UNIQUE NOT NULL,
            user_id UUID NOT NULL references users(user_id)
        );

        -- Session lookups hit this on every authenticated request.
        create index if not exists users_token_idx on users(token);
        create index if not exists users_email_idx on users(email);
        -- Forgot-username matches lower(email).
        create index if not exists users_email_lower_idx on users(lower(email));
        -- Postgres does not index the referencing side of a foreign key.
        create index if not exists list_user_id_idx on list(user_id);
    `);
}

export async function down(knex) {
    await knex.raw('drop table if exists list; drop table if exists users;');
}
