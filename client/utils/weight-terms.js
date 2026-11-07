// What each total on a gear list means, in a sentence: the ⓘ tips beside
// Total, Consumable, Worn, Base weight and Total pack weight in the editor
// (list-summary.vue, list-summary-mobile.vue) and on shared lists
// (templates/t_totals.mustache, filled in by server/views.js).

export const WEIGHT_TERMS = {
    total: {
        label: 'Total',
        text: 'Everything on the list: what goes in your pack plus what you wear, food and water included.',
    },
    consumable: {
        label: 'Consumable',
        text: 'Food, water and fuel: weight you use up as the trip goes on.',
    },
    worn: {
        label: 'Worn',
        text: 'What you wear or hold rather than pack, like the clothes you hike in and trekking poles.',
    },
    base: {
        label: 'Base weight',
        text: 'Your pack without food, water, fuel or anything worn. The usual number for comparing packs, since it doesn’t change during a trip.',
    },
    pack: {
        label: 'Total pack weight',
        text: 'What’s on your back at the start: base weight plus food, water and fuel. Worn items aren’t included.',
    },
};
