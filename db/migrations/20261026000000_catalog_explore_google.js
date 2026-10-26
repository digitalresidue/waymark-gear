// Gear catalog, published kits and Google sign-in.

export async function up(knex) {
    await knex.raw(`
        -- Google sign-in. Google-only accounts have no password.
        alter table users add column if not exists google_sub text unique;
        alter table users add column if not exists email_verified boolean not null default false;
        alter table users alter column password drop not null;

        -- The site owner's gear catalog: what people pick from instead of
        -- typing gear in. Weights are stored in milligrams like the library.
        create table if not exists catalog_items (
            id uuid primary key default gen_random_uuid(),
            sku text unique,
            name text not null,
            brand text not null default '',
            category text not null default '',
            description text not null default '',
            weight_mg integer not null default 0 check (weight_mg >= 0),
            unit text not null default 'oz' check (unit in ('g', 'kg', 'oz', 'lb')),
            price numeric(10, 2),
            currency text not null default 'USD',
            url text not null default '',
            image_url text not null default '',
            worn_default boolean not null default false,
            consumable_default boolean not null default false,
            tags text[] not null default '{}',
            status text not null default 'published' check (status in ('published', 'draft')),
            created_at timestamptz not null default now(),
            updated_at timestamptz not null default now()
        );
        create index if not exists catalog_items_name_idx on catalog_items (lower(name));
        create index if not exists catalog_items_brand_name_idx on catalog_items (lower(brand), lower(name));
        create index if not exists catalog_items_category_idx on catalog_items (category);
        create index if not exists catalog_items_status_idx on catalog_items (status);

        -- Lists their owners chose to publish, denormalized on every save so
        -- the homepage and Explore never parse anyone's library.
        create table if not exists public_kits (
            external_id text primary key references list (external_id) on delete cascade,
            user_id uuid not null references users (user_id) on delete cascade,
            username text not null,
            name text not null default '',
            description text not null default '',
            base_weight_mg bigint not null default 0,
            worn_weight_mg bigint not null default 0,
            consumable_weight_mg bigint not null default 0,
            total_weight_mg bigint not null default 0,
            item_count integer not null default 0,
            weight_class text not null,
            categories jsonb not null default '[]',
            catalog_ids uuid[] not null default '{}',
            featured boolean not null default false,
            featured_rank integer not null default 0,
            published_at timestamptz not null default now(),
            updated_at timestamptz not null default now()
        );
        create index if not exists public_kits_class_idx on public_kits (weight_class, featured desc, featured_rank, updated_at desc);
        create index if not exists public_kits_user_idx on public_kits (user_id);
        create index if not exists public_kits_catalog_idx on public_kits using gin (catalog_ids);
    `);
}

export async function down(knex) {
    await knex.raw(`
        drop table if exists public_kits;
        drop table if exists catalog_items;
        alter table users drop column if exists email_verified;
        alter table users drop column if exists google_sub;
    `);
}
