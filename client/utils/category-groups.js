// Rows for a list's weight summary with category groups (List.groups): each
// group's own row (its categories' weight and price together) over its
// categories, which are marked as in the group. Used by both summaries
// (list-summary.vue, list-summary-mobile.vue).

export function totalRowsFor(list) {
    const rows = [];
    for (const block of list.groupedCategories()) {
        if (block.group) {
            rows.push({
                key: `g${block.group.id}`,
                group: block.group,
                chartId: `group-${block.group.id}`,
                color: block.categories[0].displayColor || '',
                weight: block.categories.reduce((sum, c) => sum + (c.subtotalWeight || 0), 0),
                price: block.categories.reduce((sum, c) => sum + (c.subtotalPrice || 0), 0),
            });
        }
        for (const category of block.categories) {
            rows.push({
                key: `c${category.id}`,
                category,
                inGroup: Boolean(block.group),
                chartId: block.group ? `group-${block.group.id}` : null,
            });
        }
    }
    return rows;
}
