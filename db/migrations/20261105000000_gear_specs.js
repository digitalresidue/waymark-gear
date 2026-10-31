// Specs for catalog gear (client/utils/gear-specs.js): a pack's volume and
// frame, a tent's pitch and size, a quilt's ratings and fill... stored in one
// unit per kind so they can be searched and filtered.

export async function up(knex) {
    await knex.raw(`
        alter table catalog_items add column if not exists specs jsonb not null default '{}';
        create index if not exists catalog_items_specs_idx on catalog_items using gin (specs jsonb_path_ops);
    `);
}

export async function down(knex) {
    await knex.raw(`
        drop index if exists catalog_items_specs_idx;
        alter table catalog_items drop column if exists specs;
    `);
}
