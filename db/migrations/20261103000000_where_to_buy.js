// Where to buy: besides its own product link, a catalog item can list up to
// four more shops (Backcountry, Garage Grown Gear...), each with a normal
// link and an optional affiliate link. Shop badges are kept once per shop
// website (shop_badges), so a badge is shared by every item a shop sells.
// Buy clicks also record which shop was chosen.

export async function up(knex) {
    await knex.raw(`
        alter table catalog_items add column if not exists shops jsonb not null default '[]';

        create table if not exists shop_badges (
            domain text primary key,
            name text not null default '',
            badge_url text not null default '',
            updated_at timestamptz not null default now()
        );

        alter table outbound_clicks add column if not exists shop text not null default '';
        alter table outbound_clicks drop constraint if exists outbound_clicks_pkey;
        alter table outbound_clicks add primary key (catalog_id, day, source, affiliate, shop);
    `);
}

export async function down(knex) {
    await knex.raw(`
        delete from outbound_clicks where shop <> '';
        alter table outbound_clicks drop constraint if exists outbound_clicks_pkey;
        alter table outbound_clicks drop column if exists shop;
        alter table outbound_clicks add primary key (catalog_id, day, source, affiliate);
        drop table if exists shop_badges;
        alter table catalog_items drop column if exists shops;
    `);
}
