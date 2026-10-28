// The Brands directory: gear makers with a logo, a short description, their
// site and (optionally) an affiliate link, whether they're a cottage maker,
// and what kinds of gear they make. Owner-managed at Owner → Brands; shown at
// /brands. Clicks through /go/brand/:id are counted per day, like catalog
// Buy clicks.

export async function up(knex) {
    await knex.raw(`
        create table if not exists brands (
            id uuid primary key default gen_random_uuid(),
            slug text not null unique,
            name text not null,
            description text not null default '',
            logo_url text not null default '',
            url text not null default '',
            affiliate_url text not null default '',
            cottage boolean not null default false,
            gear_types text[] not null default '{}',
            country text not null default '',
            status text not null default 'draft' check (status in ('draft', 'published')),
            created_at timestamptz not null default now(),
            updated_at timestamptz not null default now()
        );
        create index if not exists brands_name_idx on brands (lower(name));

        create table if not exists brand_clicks (
            brand_id uuid not null references brands (id) on delete cascade,
            day date not null default current_date,
            affiliate boolean not null,
            clicks integer not null default 0,
            primary key (brand_id, day, affiliate)
        );
    `);
}

export async function down(knex) {
    await knex.raw(`
        drop table if exists brand_clicks;
        drop table if exists brands;
    `);
}
