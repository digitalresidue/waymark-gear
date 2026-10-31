import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { parentOf, exploreIndex, resolveSection, filterItem, facetsFor, readFilters, filtersToQuery, matchesFilters, sortItems, slugify } from '../../client/utils/explore.js';

const CATS = [
    { name: 'Tent', count: 3 }, { name: 'Tarps', count: 2 }, { name: 'Shelter', count: 4 }, { name: 'Top Quilt', count: 5 },
    { name: 'Sleeping Pad', count: 2 }, { name: 'Sleep', count: 1 }, { name: 'Backpack', count: 6 }, { name: 'Mid Layer', count: 2 },
    { name: 'Socks', count: 1 }, { name: 'Cooking', count: 7 }, { name: 'Lights and Electronics', count: 2 }, { name: 'Accessories', count: 3 },
    { name: 'Tents', count: 1 }, { name: 'cooking', count: 1 },
];

describe('the category index', () => {
    test('parents, in order, then everything else A–Z', () => {
        const index = exploreIndex(CATS);
        assert.deepEqual(index.map((s) => s.name), ['Pack', 'Shelter', 'Sleep System', 'Clothing', 'Accessories', 'Cooking', 'Lights and Electronics']);
        const shelter = index[1];
        assert.equal(shelter.count, 10);
        // "Tent" and "Tents" are one.
        assert.deepEqual(shelter.children.map((c) => [c.name, c.count]), [['Shelter', 4], ['Tent', 4], ['Tarps', 2]]);
        assert.equal(index.find((x) => x.name === 'Cooking').count, 8);
        assert.deepEqual(index[2].children.map((c) => c.name), ['Top Quilt', 'Sleeping Pad', 'Sleep']);
        assert.equal(index[0].children[0].name, 'Backpack');
        // The parents stay even while empty.
        assert.equal(exploreIndex([]).length, 4);
    });

    test('parents and categories resolve from a slug', () => {
        assert.equal(parentOf('Tents'), 'shelter');
        assert.equal(parentOf('Pillow'), 'sleep-system');
        assert.equal(parentOf('Packs'), 'pack');
        assert.equal(parentOf('Cooking'), null);
        const shelter = resolveSection('shelter', CATS);
        assert.deepEqual(shelter.categories.sort(), ['Shelter', 'Tarps', 'Tent', 'Tents']);
        assert.deepEqual(resolveSection('cooking', CATS).categories.sort(), ['Cooking', 'cooking']);
        const cooking = resolveSection('cooking', CATS);
        assert.equal(cooking.title, 'Cooking');
        assert.equal(cooking.parent, null);
        assert.equal(resolveSection('tent', CATS).parent.slug, 'shelter');
        assert.equal(resolveSection('nothing-here', CATS), null);
        assert.equal(slugify('Lights & Electronics'), 'lights-and-electronics');
    });
});

const ITEMS = [
    { id: 'a', name: 'Duplex', brand: 'Zpacks', category: 'Tent', weightMg: 538000, price: 699, specs: { capacity: '2p', pitch: 'trekking_pole', trail_weight: 538 } },
    { id: 'b', name: 'Free 2', brand: 'BigCo', category: 'Tent', weightMg: 1400000, price: 449, specs: { capacity: '2p', pitch: 'freestanding', trail_weight: 1400 } },
    { id: 'c', name: 'Solo', brand: 'Zpacks', category: 'Tent', weightMg: 400000, price: 599, specs: { capacity: '1p', pitch: 'trekking_pole' } },
    { id: 'd', name: 'Flat tarp', brand: 'Tarpco', category: 'Tarps', weightMg: 250000, price: null, specs: {} },
].map(filterItem);

describe('filters', () => {
    test('facets: categories, brands, weight and price ranges, specs with counts', () => {
        const f = facetsFor(ITEMS);
        assert.deepEqual(f.cats.map((c) => [c.label, c.count]), [['Tent', 3], ['Tarps', 1]]);
        assert.deepEqual(f.brands.map((b) => b.label), ['BigCo', 'Tarpco', 'Zpacks']);
        assert.ok(f.weight.min <= 250 && f.weight.max >= 1400);
        assert.ok(f.price.min <= 449 && f.price.max >= 699);
        const pitch = f.specs.find((s) => s.key === 'pitch');
        assert.deepEqual(pitch.options.map((o) => [o.label, o.count]), [['Trekking pole', 2], ['Freestanding', 1]]);
        assert.equal(f.specs.find((s) => s.key === 'trail_weight').kind, 'range');
    });

    test('a link\'s filters, matched and written back', () => {
        const f = readFilters(new URLSearchParams('cat=tent&brand=Zpacks&weight_max=600&pitch=trekking_pole&sort=price'));
        assert.deepEqual(ITEMS.filter((i) => matchesFilters(i, f)).map((i) => i.id), ['a', 'c']);
        assert.equal(filtersToQuery(f), 'cat=tent&brand=zpacks&weight_max=600&pitch=trekking_pole&sort=price');
        // A spec filter leaves out gear that doesn't say.
        const g = readFilters(new URLSearchParams('trail_weight_max=1000'));
        assert.deepEqual(ITEMS.filter((i) => matchesFilters(i, g)).map((i) => i.id), ['a']);
        // Price filters leave out gear without a price.
        assert.deepEqual(ITEMS.filter((i) => matchesFilters(i, readFilters({ price_max: '1000' }))).map((i) => i.id), ['a', 'b', 'c']);
        assert.deepEqual(sortItems(ITEMS, 'price').map((i) => i.id), ['b', 'c', 'a', 'd']);
        assert.deepEqual(sortItems(ITEMS).map((i) => i.id), ['d', 'c', 'a', 'b']);
    });
});
