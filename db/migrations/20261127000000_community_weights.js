// Community weights (server/community-weights.js): what members' own gear
// weighs, gathered per catalog item.
//
// gear_items.weight_own marks catalog gear whose weight its owner set
// themselves, as opposed to the catalog's weight it arrived with. Gear
// already edited away from the catalog (sync off, a different weight) is
// the best guess for what members set before this column.
//
// catalog_items.community_* hold the result: the weight once at least ten
// members agree (null until then), how many agree, and how many weighed in.

export async function up(knex) {
    await knex.raw(`
        alter table gear_items add column if not exists weight_own boolean not null default false;

        update gear_items g set weight_own = true
            from catalog_items c
            where g.catalog_id = c.id and not g.catalog_sync and g.weight_mg > 0 and g.weight_mg <> c.weight_mg;

        create index if not exists gear_items_weight_own_idx on gear_items (catalog_id) where weight_own;

        alter table catalog_items
            add column if not exists community_weight_mg integer check (community_weight_mg > 0),
            add column if not exists community_count integer not null default 0,
            add column if not exists community_total integer not null default 0,
            add column if not exists community_updated_at timestamptz;
    `);
}

export async function down(knex) {
    await knex.raw(`
        alter table catalog_items
            drop column if exists community_weight_mg,
            drop column if exists community_count,
            drop column if exists community_total,
            drop column if exists community_updated_at;
        drop index if exists gear_items_weight_own_idx;
        alter table gear_items drop column if exists weight_own;
    `);
}
