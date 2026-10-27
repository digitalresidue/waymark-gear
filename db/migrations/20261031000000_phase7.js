// Phase 7: smarter gear. Wishlist items, essentials a list doesn't need,
// catalog price history, and personal API tokens (REST API and MCP).
export async function up(knex) {
    await knex.raw(`
        alter table gear_items add column if not exists wishlist boolean not null default false;
        -- Essentials (client/utils/insights.js) the owner marked "not needed".
        alter table pack_lists add column if not exists not_needed jsonb not null default '[]';

        create table if not exists catalog_price_history (
            id bigserial primary key,
            catalog_id uuid not null references catalog_items (id) on delete cascade,
            price numeric(10, 2) not null,
            currency text not null default 'USD',
            recorded_at timestamptz not null default now()
        );
        create index if not exists catalog_price_history_idx on catalog_price_history (catalog_id, recorded_at desc);

        -- Today's prices are where each item's history starts.
        insert into catalog_price_history (catalog_id, price, currency)
        select c.id, c.price, coalesce(nullif(c.currency, ''), 'USD') from catalog_items c
        where c.price is not null
          and not exists (select 1 from catalog_price_history h where h.catalog_id = c.id);

        -- Affiliate links (Phase 7): an item's own link, site-wide rules, and
        -- daily click counts for the owner.
        alter table catalog_items add column if not exists affiliate_url text not null default '';
        create table if not exists site_settings (
            key text primary key,
            value jsonb not null,
            updated_at timestamptz not null default now()
        );
        create table if not exists outbound_clicks (
            catalog_id uuid not null references catalog_items (id) on delete cascade,
            day date not null default current_date,
            source text not null default '',
            affiliate boolean not null,
            clicks integer not null default 0,
            primary key (catalog_id, day, source, affiliate)
        );

        -- The Supporter plan: no affiliate links, a badge, paid through Stripe
        -- or granted by the site owner.
        alter table users add column if not exists plan text not null default 'free';
        alter table users add column if not exists plan_until timestamptz;
        alter table users add column if not exists plan_source text not null default '';
        alter table users add column if not exists stripe_customer_id text;
        create unique index if not exists users_stripe_customer_idx on users (stripe_customer_id) where stripe_customer_id is not null;

        create table if not exists api_tokens (
            id bigserial primary key,
            user_id uuid not null references users (user_id) on delete cascade,
            name text not null,
            -- sha256 of the token; the token itself is shown once.
            token_hash text not null unique,
            -- First characters, so people can tell their tokens apart.
            prefix text not null,
            scope text not null default 'read' check (scope in ('read', 'write')),
            -- Set when an AI assistant connected through sign-in (OAuth).
            client_id text,
            expires_at timestamptz,
            created_at timestamptz not null default now(),
            last_used_at timestamptz
        );
        create index if not exists api_tokens_user_idx on api_tokens (user_id);

        -- AI assistants that registered themselves (OAuth dynamic client
        -- registration), and the one-time codes of their sign-ins.
        create table if not exists oauth_clients (
            client_id text primary key,
            name text not null,
            redirect_uris jsonb not null,
            created_at timestamptz not null default now()
        );
        create table if not exists oauth_codes (
            code_hash text primary key,
            client_id text not null references oauth_clients (client_id) on delete cascade,
            user_id uuid not null references users (user_id) on delete cascade,
            redirect_uri text not null,
            code_challenge text not null,
            scope text not null,
            expires_at timestamptz not null
        );
    `);
}

export async function down(knex) {
    await knex.raw(`
        drop table if exists oauth_codes;
        drop table if exists oauth_clients;
        drop table if exists api_tokens;
        drop table if exists outbound_clicks;
        drop table if exists site_settings;
        alter table catalog_items drop column if exists affiliate_url;
        drop index if exists users_stripe_customer_idx;
        alter table users drop column if exists stripe_customer_id;
        alter table users drop column if exists plan_source;
        alter table users drop column if exists plan_until;
        alter table users drop column if exists plan;
        drop table if exists catalog_price_history;
        alter table pack_lists drop column if exists not_needed;
        alter table gear_items drop column if exists wishlist;
    `);
}
