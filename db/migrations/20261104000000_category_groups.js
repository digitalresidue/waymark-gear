// Category groups: a list can gather categories under a heading, one level
// deep (Clothing > Base Layer, Mid Layer, Shells). The list keeps its groups
// ([{ id, name, collapsed }]); a category says which one it's in.

export async function up(knex) {
    await knex.raw(`
        alter table pack_lists add column if not exists category_groups jsonb not null default '[]';
        alter table pack_list_categories add column if not exists group_id bigint;
    `);
}

export async function down(knex) {
    await knex.raw(`
        alter table pack_list_categories drop column if exists group_id;
        alter table pack_lists drop column if exists category_groups;
    `);
}
