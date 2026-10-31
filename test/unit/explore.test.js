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
        // Every option, in order; ones nothing has yet count 0.
        assert.deepEqual(pitch.options.map((o) => [o.label, o.count]), [['Trekking pole', 2], ['Semi-freestanding', 0], ['Freestanding', 1]]);
        assert.equal(f.specs.find((s) => s.key === 'trail_weight').kind, 'range');
    });

    test('a section offers its gear type\'s filters before any gear has those specs', () => {
        const packs = [
            { id: 'p1', name: 'Arc', brand: 'Zpacks', category: 'Packs', weightMg: 600000, price: 300, specs: {} },
            { id: 'p2', name: 'Mariposa', brand: 'Gossamer', category: 'Packs', weightMg: 900000, price: 280, specs: {} },
        ].map(filterItem);
        assert.deepEqual(facetsFor(packs).specs, [], 'without the section, nothing to offer');
        const f = facetsFor(packs, { categories: ['Packs'] });
        // Fabric is free words: offered once some pack says one.
        assert.deepEqual(f.specs.map((x) => x.key), ['max_carry', 'volume', 'pack_type', 'strap_type', 'frame', 'roll_top', 'adjustable_torso']);
        assert.deepEqual(f.specs.find((x) => x.key === 'pack_type').options.map((o) => o.label), ['Fastpack', 'Pack', 'Hydration vest']);
        const volume = f.specs.find((x) => x.key === 'volume');
        assert.equal(volume.kind, 'range');
        assert.ok(volume.min <= 10 && volume.max >= 90);
        assert.deepEqual(f.specs.find((x) => x.key === 'strap_type').options.map((o) => [o.label, o.count]), [['J-curve', 0], ['S-curve', 0], ['Vest', 0], ['Other', 0]]);
        assert.deepEqual(f.specs.find((x) => x.key === 'roll_top').options.map((o) => o.label), ['Yes', 'No']);
    });

    test('fabric: the fabrics the catalog has, matched without regard to case', () => {
        const packs = [
            { id: 'f1', name: 'A', brand: 'X', category: 'Packs', weightMg: 600000, price: 1, specs: { fabric: 'Ultra 200' } },
            { id: 'f2', name: 'B', brand: 'X', category: 'Fastpack', weightMg: 500000, price: 1, specs: { fabric: 'ultra 200' } },
            { id: 'f3', name: 'C', brand: 'X', category: 'Hydration Vest', weightMg: 300000, price: 1, specs: { fabric: 'Robic 210D' } },
        ].map(filterItem);
        const fabric = facetsFor(packs, { categories: ['Packs', 'Fastpack', 'Hydration Vest'] }).specs.find((x) => x.key === 'fabric');
        assert.deepEqual(fabric.options.map((o) => [o.value, o.count]), [['ultra 200', 2], ['robic 210d', 1]]);
        const f = readFilters(new URLSearchParams('fabric=ULTRA 200'));
        assert.deepEqual(packs.filter((i) => matchesFilters(i, f)).map((i) => i.id), ['f1', 'f2']);
        // Fastpacks and hydration vests sit under Pack.
        assert.equal(parentOf('Fastpack'), 'pack');
        assert.equal(parentOf('Hydration Vests'), 'pack');
        assert.equal(parentOf('Fast Pack'), 'pack');
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
