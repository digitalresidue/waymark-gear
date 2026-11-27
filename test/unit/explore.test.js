import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { parentOf, exploreIndex, resolveSection, filterItem, facetsFor, brandCounts, brandKey, readFilters, filtersToQuery, matchesFilters, sortItems, slugify, inferPackType, subtypesOf, categoriesOfPackType } from '../../client/utils/explore.js';

const CATS = [
    { name: 'Tent', count: 3 }, { name: 'Tarps', count: 2 }, { name: 'Shelter', count: 4 }, { name: 'Top Quilt', count: 5 },
    { name: 'Sleeping Pad', count: 2 }, { name: 'Sleep', count: 1 }, { name: 'Backpack', count: 6 }, { name: 'Mid Layer', count: 2 },
    { name: 'Socks', count: 1 }, { name: 'Cooking', count: 7 }, { name: 'Lights and Electronics', count: 2 }, { name: 'Accessories', count: 3 },
    { name: 'Tents', count: 1 }, { name: 'cooking', count: 1 },
];

describe('the category index', () => {
    test('parents, in order, then everything else A–Z', () => {
        const index = exploreIndex(CATS);
        assert.deepEqual(index.map((s) => s.name), ['Pack', 'Shelter', 'Sleep System', 'Clothing', 'Cook Kit', 'Water', 'Lights & Electronics', 'Accessories']);
        // The catalog's own "Lights and Electronics" category sits under the group.
        assert.deepEqual(index[6].children.map((c) => c.name), ['Lights and Electronics']);
        const shelter = index[1];
        assert.equal(shelter.count, 10);
        // "Tent" and "Tents" are one.
        assert.deepEqual(shelter.children.map((c) => [c.name, c.count]), [['Shelter', 4], ['Tent', 4], ['Tarps', 2]]);
        // A category named like a parent sits under it: "Cooking" (and "cooking") in Cook Kit.
        assert.equal(index.find((x) => x.name === 'Cook Kit').count, 8);
        assert.deepEqual(index[2].children.map((c) => c.name), ['Top Quilt', 'Sleeping Pad', 'Sleep']);
        assert.equal(index[0].children[0].name, 'Backpack');
        // The parents stay even while empty.
        assert.equal(exploreIndex([]).length, 7);
    });

    test('parents and categories resolve from a slug', () => {
        assert.equal(parentOf('Tents'), 'shelter');
        assert.equal(parentOf('Pillow'), 'sleep-system');
        assert.equal(parentOf('Packs'), 'pack');
        assert.equal(parentOf('Cooking'), 'cook-kit');
        assert.equal(parentOf('Accessories'), null);
        // On Explore: pants, shorts, gloves and fanny packs under Clothing;
        // bug nets under Shelter.
        for (const c of ['Pants', 'Shorts', 'Gloves', 'Fanny', 'Dress', 'Dresses', 'Kilt', 'Skirts', 'Skort']) assert.equal(parentOf(c), 'clothing', c);
        assert.equal(parentOf('Bug Net'), 'shelter');
        assert.equal(parentOf('Bugnet'), 'shelter');
        // Lights & Electronics: headlamps, watches, cables, chargers and kin.
        for (const c of ['Lights and Electronics', 'Lights & Electronics', 'Headlamp', 'Headlamps', 'Watch', 'Cables', 'Cable', 'Charger', 'Power Bank', 'Batteries']) {
            assert.equal(parentOf(c), 'lights-electronics', c);
        }
        const shelter = resolveSection('shelter', CATS);
        assert.deepEqual(shelter.categories.sort(), ['Shelter', 'Tarps', 'Tent', 'Tents']);
        assert.deepEqual(resolveSection('cooking', CATS).categories.sort(), ['Cooking', 'cooking']);
        const cooking = resolveSection('cooking', CATS);
        assert.equal(cooking.title, 'Cooking');
        assert.equal(cooking.parent.slug, 'cook-kit');
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
        // The options some gear has, in the field's order; none at 0.
        assert.deepEqual(pitch.options.map((o) => [o.label, o.count]), [['Trekking pole', 2], ['Freestanding', 1]]);
        assert.equal(f.specs.find((s) => s.key === 'trail_weight').kind, 'range');
    });

    test('a section offers only what its gear has: no options at 0, no empty specs', () => {
        const packs = [
            { id: 'p1', name: 'Arc', brand: 'Zpacks', category: 'Packs', weightMg: 600000, price: 300, specs: { volume: 40, strap_type: 'j_curve', roll_top: true } },
            { id: 'p2', name: 'Mariposa', brand: 'Gossamer', category: 'Packs', weightMg: 900000, price: 280, specs: { volume: 60, strap_type: 's_curve' } },
            { id: 'p3', name: 'Vest', brand: 'X', category: 'Hydration Vest', weightMg: 300000, price: 160, specs: {} },
        ].map(filterItem);
        const f = facetsFor(packs, { categories: ['Packs', 'Hydration Vest'] });
        // Pack type comes from the categories; nothing says frame, hip belt...
        assert.deepEqual(f.specs.map((x) => x.key), ['volume', 'pack_type', 'strap_type', 'roll_top']);
        assert.deepEqual(f.specs.find((x) => x.key === 'pack_type').options.map((o) => [o.label, o.count]), [['Pack', 2], ['Hydration vest', 1]]);
        assert.deepEqual(f.specs.find((x) => x.key === 'strap_type').options.map((o) => [o.label, o.count]), [['J-curve', 1], ['S-curve', 1]]);
        // One option, but some packs don't say: still worth a filter.
        assert.deepEqual(f.specs.find((x) => x.key === 'roll_top').options.map((o) => o.label), ['Yes']);
        const volume = f.specs.find((x) => x.key === 'volume');
        assert.equal(volume.kind, 'range');
        assert.ok(volume.min <= 40 && volume.max >= 60);
        // Nothing to go on: nothing offered.
        assert.deepEqual(facetsFor(packs.slice(2), { categories: ['Hydration Vest'] }).specs, []);
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
        for (const c of ['Stove', 'Stoves', 'Fuel', 'Lighter', 'Pot', 'Pots', 'Utensil', 'Utensils']) assert.equal(parentOf(c), 'cook-kit', c);
        for (const c of ['Bottle', 'Water Bottles', 'Bladder', 'Filter', 'Filters', 'Water Filter', 'Water Treatment', 'Water Purifier']) assert.equal(parentOf(c), 'water', c);
        for (const c of ['Suspension', 'Ridgeline', 'Stakes', 'Tent Stakes']) assert.equal(parentOf(c), 'shelter', c);
        assert.equal(parentOf('Fastpack'), 'pack');
        assert.equal(parentOf('Hydration Vests'), 'pack');
        assert.equal(parentOf('Fast Pack'), 'pack');
    });

    test('a link\'s filters, matched and written back', () => {
        const f = readFilters(new URLSearchParams('cat=tent&brand=Zpacks&weight_max=600&pitch=trekking_pole&sort=price'));
        assert.deepEqual(ITEMS.filter((i) => matchesFilters(i, f)).map((i) => i.id), ['a', 'c']);
        assert.equal(filtersToQuery(f), 'cat=tent&brand=zpacks&weight_max=600&pitch=trekking_pole&sort=price');
        // A spec filter leaves out gear of its type that doesn't say (the
        // Solo tent), and doesn't judge gear it isn't about (the tarp).
        const g = readFilters(new URLSearchParams('trail_weight_max=1000'));
        assert.deepEqual(ITEMS.filter((i) => matchesFilters(i, g)).map((i) => i.id), ['a', 'd']);
        // Price filters leave out gear without a price.
        assert.deepEqual(ITEMS.filter((i) => matchesFilters(i, readFilters({ price_max: '1000' }))).map((i) => i.id), ['a', 'b', 'c']);
        assert.deepEqual(sortItems(ITEMS, 'price').map((i) => i.id), ['b', 'c', 'a', 'd']);
        assert.deepEqual(sortItems(ITEMS).map((i) => i.id), ['d', 'c', 'a', 'b']);
    });
});

describe('mixed sections (Sleep System)', () => {
    test('slider ends carry no floating-point noise, and rounding is not a move', async () => {
        const { toStep, movedFrom } = await import('../../client/utils/explore.js');
        assert.equal(toStep(76 * 0.1, 0.02), 7.6);
        assert.equal(toStep(45 * 0.05, 0.05), 2.25);
        assert.equal(toStep(450, 50), 450);
        assert.equal(movedFrom(7.6, 7.6000000000000005, 0.02), false);
        assert.equal(movedFrom(7.58, 7.6, 0.02), true);
        const facets = facetsFor([
            { cat: 'sleepingpad', catName: 'Sleeping Pad', brand: 'A', weight: 340, price: 150, specs: { thickness: 6.35 } },
            { cat: 'sleepingpad', catName: 'Sleeping Pad', brand: 'A', weight: 425, price: 200, specs: { thickness: 7.62 } },
        ], { categories: ['Sleeping Pad'] });
        const thickness = facets.specs.find((f) => f.key === 'thickness');
        for (const n of [thickness.min, thickness.max, thickness.step]) assert.ok(String(n).length < 10, String(n));
    });
    test('a spec filter only judges gear of a type that has the spec', async () => {
        const { specAppliesLabel } = await import('../../client/utils/explore.js');
        const item = (category, specs = {}) => filterItem({ id: category, category, brand: 'X', weightMg: 500000, price: 100, specs, name: category });
        const pad = item('Sleeping Pad', { r_value: 4.5 });
        const thinPad = item('Sleeping Pad', { r_value: 2 });
        const quilt = item('Top Quilt', { temp_limit: -7 });
        const pillow = item('Pillow');
        const f = readFilters(new URLSearchParams('r_value_min=4'));
        assert.deepEqual([pad, thinPad, quilt, pillow].filter((i) => matchesFilters(i, f)).map((i) => i.id), ['Sleeping Pad', 'Top Quilt', 'Pillow']);
        const cold = readFilters(new URLSearchParams('temp_limit_max=-5'));
        assert.deepEqual([pad, quilt, item('Top Quilt', { temp_limit: 0 }), item('Top Quilt')].filter((i) => matchesFilters(i, cold)).length, 2);
        const sleep = ['Sleeping Pad', 'Top Quilt', 'Sleeping Bag', 'Pillow'];
        assert.equal(specAppliesLabel('r_value', sleep), 'sleeping pads');
        assert.equal(specAppliesLabel('temp_limit', sleep), 'quilts and sleeping bags');
        assert.equal(specAppliesLabel('r_value', ['Sleeping Pad']), '');
    });
});

describe('brandCounts', () => {
    const items = [
        { cat: 'sleepingpad', brand: 'Therm-a-Rest' },
        { cat: 'sleepingpad', brand: 'NEMO' },
        { cat: 'topquilt', brand: 'Enlightened Equipment' },
        { cat: 'topquilt', brand: 'nemo' },
        { cat: 'pillow', brand: '' },
    ];
    test('counts every brand in the section with nothing ticked', () => {
        assert.deepEqual(brandCounts(readFilters(new URLSearchParams()), items), { thermarest: 1, nemo: 2, enlightenedequipment: 1 });
    });
    test('counts only the ticked categories, so brands without that gear drop out', () => {
        assert.deepEqual(brandCounts(readFilters(new URLSearchParams('cat=sleepingpad')), items), { thermarest: 1, nemo: 1 });
    });
});

describe('brand spellings', () => {
    test('one key for every spelling of a maker', () => {
        assert.equal(brandKey('Therm-a-Rest'), 'thermarest');
        assert.equal(brandKey('THERMAREST'), 'thermarest');
        assert.equal(brandKey('Six Moon Designs'), brandKey('SixMoon Designs'));
        assert.equal(brandKey('Äpfel Gear'), 'äpfelgear');
        assert.equal(brandKey(''), '');
    });
    test('the brand filter lists a maker once, named the way most items spell it', () => {
        const items = ['Therm-a-Rest', 'Therm-a-Rest', 'Thermarest', 'NEMO'].map((brand, n) => ({ id: n, cat: 'sleepingpad', catName: 'Sleeping Pad', brand, specs: {}, weight: 100, price: null }));
        assert.deepEqual(facetsFor(items).brands.map((b) => [b.value, b.label, b.count]), [['nemo', 'NEMO', 1], ['thermarest', 'Therm-a-Rest', 3]]);
    });
    test('an old link spelled with a dash still picks the brand, and matches every spelling', () => {
        const f = readFilters(new URLSearchParams('brand=therm-a-rest'));
        assert.deepEqual(f.brands, ['thermarest']);
        assert.equal(matchesFilters({ cat: 'sleepingpad', brand: 'Thermarest', specs: {}, weight: 1, price: null }, f), true);
    });
});

describe('Pack sub-items: pack types', () => {
    test('a pack with no type set takes one from its category', () => {
        assert.equal(inferPackType('Fastpack'), 'fastpack');
        assert.equal(inferPackType('Fast Pack'), 'fastpack');
        assert.equal(inferPackType('Hydration Vests'), 'hydration_vest');
        assert.equal(inferPackType('Running Vest'), 'hydration_vest');
        assert.equal(inferPackType('Backpack'), 'pack');
        assert.equal(filterItem({ id: 1, category: 'Fastpack', specs: {} }).specs.pack_type, 'fastpack');
        assert.equal(filterItem({ id: 2, category: 'Pack', specs: { pack_type: 'hydration_vest' } }).specs.pack_type, 'hydration_vest');
        assert.equal(filterItem({ id: 3, category: 'Tent', specs: {} }).specs.pack_type, undefined);
    });
    test('Pack lists its types with counts, Packs first, only those with gear', () => {
        const items = ['Pack', 'Pack', 'Fastpack'].map((category, id) => filterItem({ id, category, specs: {} }));
        assert.deepEqual(subtypesOf('pack', items), { key: 'pack_type', options: [{ value: 'pack', name: 'Packs', count: 2 }, { value: 'fastpack', name: 'Fastpacks', count: 1 }] });
        assert.equal(subtypesOf('shelter', items), null);
    });
});

describe('Explore: every name a water filter goes by sits under Water', () => {
    test('each filter spec type category has Water as its parent', async () => {
        const { SPEC_TYPES } = await import('../../client/utils/gear-specs.js');
        for (const c of SPEC_TYPES.find((t) => t.id === 'filter').categories) assert.equal(parentOf(c), 'water', c);
    });
});

describe('Explore: daypacks are one of Pack\'s sub-items, apart from Packs', () => {
    test('"Daypack" categories are packs, of the Daypack type', () => {
        for (const c of ['Daypack', 'Daypacks', 'Day Pack']) assert.equal(parentOf(c), 'pack', c);
        assert.equal(inferPackType('Day Pack'), 'daypack');
        assert.deepEqual(categoriesOfPackType(['Pack', 'Backpack', 'Fastpack', 'Daypack', 'Day Packs'], 'daypack'), ['Daypack', 'Day Packs']);
        assert.deepEqual(categoriesOfPackType(['Pack', 'Backpack', 'Fastpack', 'Daypack'], 'pack'), ['Pack', 'Backpack']);
    });

    test('Pack\'s sub-items: Packs, Fastpacks, Hydration vests, Daypacks, by pack type or category', () => {
        const items = [
            filterItem({ category: 'Pack', specs: {} }),
            filterItem({ category: 'Daypack', specs: {} }),
            filterItem({ category: 'Fastpack', specs: {} }),
            filterItem({ category: 'Pack', specs: { pack_type: 'daypack' } }),
            filterItem({ category: 'Pack', specs: { pack_type: 'hydration_vest' } }),
        ];
        assert.deepEqual(subtypesOf('pack', items).options.map((o) => [o.name, o.count]), [['Packs', 1], ['Fastpacks', 1], ['Hydration vests', 1], ['Daypacks', 2]]);
    });
});

describe('Explore: clothes by any name the clothing specs know sit under Clothing', () => {
    test('puffies, rain pants, sun hoodies and socks', () => {
        for (const c of ['Puffy', 'Down Jacket', 'Rain Pants', 'Wind Shirt', 'Sun Hoody', 'Socks', 'Leggings', 'Beanie']) assert.equal(parentOf(c), 'clothing', c);
    });
});
