import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { readSpec, readSpecs, formatSpec, specInput, specRows, specTypeFor, SPEC_TYPES, SPEC_FIELDS, filterKind, likeForLikeSpecs, compareSpecRows } from '../../client/utils/gear-specs.js';

describe('gear spec types', () => {
    test('categories map to types, however they are spelled', () => {
        const t = (c) => (specTypeFor(c) || {}).id || null;
        assert.equal(t('Backpack'), 'pack');
        assert.equal(t('Packs'), 'pack');
        assert.equal(t('Tents'), 'tent');
        assert.equal(t('Top Quilt'), 'quilt');
        assert.equal(t('Under Quilt'), 'quilt');
        assert.equal(t('Sleeping Pads'), 'pad');
        assert.equal(t('Sleeping Bag'), 'bag');
        assert.equal(t('Outer Layer'), 'outer');
        assert.equal(t('Shelter'), null);
        assert.equal(t('Cooking'), null);
    });

    test('every type field exists', () => {
        for (const type of SPEC_TYPES) for (const key of type.fields) assert.ok(SPEC_FIELDS[key], `${type.id}.${key}`);
    });
});

describe('reading values', () => {
    test('temperatures in F or C, stored in C', () => {
        assert.deepEqual(readSpec('temp_comfort', '20F'), { value: -6.7 });
        assert.deepEqual(readSpec('temp_comfort', '20'), { value: -6.7 }, 'a bare number is °F');
        assert.deepEqual(readSpec('temp_comfort', '-7 C'), { value: -7 });
        assert.deepEqual(readSpec('temp_comfort', '20°F'), { value: -6.7 });
        assert.ok(readSpec('temp_comfort', 'warm').error);
        assert.ok(readSpec('temp_comfort', '500F').error);
    });

    test('weights, lengths, volumes, sizes', () => {
        assert.deepEqual(readSpec('trail_weight', '14 oz'), { value: 396.9 });
        assert.deepEqual(readSpec('trail_weight', '397g'), { value: 397 });
        assert.deepEqual(readSpec('max_carry', '30'), { value: 13607.8 }, 'bare max carry is lb');
        assert.deepEqual(readSpec('floor_length', '84 in'), { value: 213.4 });
        assert.deepEqual(readSpec('pad_width', '51 cm'), { value: 51 });
        assert.deepEqual(readSpec('volume', '40'), { value: 40 });
        assert.deepEqual(readSpec('volume', '2440 cu in'), { value: 40 });
        assert.deepEqual(readSpec('packed_size', '18 x 5 x 5 in'), { value: [45.7, 12.7, 12.7] });
        assert.deepEqual(readSpec('packed_size', '46×13 cm'), { value: [46, 13] });
        assert.ok(readSpec('packed_size', 'big').error);
    });

    test('choices by value, label or a common alias; yes/no; numbers', () => {
        assert.deepEqual(readSpec('pitch', 'Semi Freestanding'), { value: 'semi_freestanding' });
        assert.deepEqual(readSpec('capacity', '2P+'), { value: '2p_plus' });
        assert.deepEqual(readSpec('capacity', '2'), { value: '2p' });
        assert.deepEqual(readSpec('footbox', 'Zipper'), { value: 'zippered' });
        assert.deepEqual(readSpec('footbox', 'draw cord'), { value: 'drawcord' });
        assert.deepEqual(readSpec('fill_power', '850 fp'), { value: 850 });
        assert.deepEqual(readSpec('rds', 'unkown'), { value: 'unknown' });
        assert.deepEqual(readSpec('pad_type', 'CCF'), { value: 'closed_cell' });
        assert.deepEqual(readSpec('roll_top', 'Yes'), { value: true });
        assert.deepEqual(readSpec('double_wall', 'no'), { value: false });
        assert.deepEqual(readSpec('r_value', '4.5'), { value: 4.5 });
        assert.deepEqual(readSpec('vestibules', '2'), { value: 2 });
        assert.ok(readSpec('vestibules', '1.5').error);
        assert.ok(readSpec('fill_power', '700').error);
        assert.ok(readSpec('pitch', 'floaty').error);
    });

    test('pack type and fabric', () => {
        assert.deepEqual(readSpec('pack_type', 'Fast pack'), { value: 'fastpack' });
        assert.deepEqual(readSpec('pack_type', 'running vest'), { value: 'hydration_vest' });
        assert.deepEqual(readSpec('fabric', '  Ultra   200 '), { value: 'Ultra 200' });
        assert.equal(readSpec('fabric', 'x'.repeat(100)).value.length, 60);
        assert.deepEqual(readSpec('fabric', ''), { value: undefined });
        assert.equal(formatSpec('fabric', 'Robic 210D'), 'Robic 210D');
        assert.equal(formatSpec('pack_type', 'hydration_vest'), 'Hydration vest');
        assert.equal(specTypeFor('Hydration Vest').id, 'pack');
        assert.equal(specTypeFor('Fastpacks').id, 'pack');
        assert.deepEqual(readSpecs('Fastpack', { pack_type: 'Fastpack', fabric: 'ECOPAK', volume: '25 L' }).specs, { volume: 25, pack_type: 'fastpack', fabric: 'ECOPAK' });
    });

    test('readSpecs keeps only the type\'s fields, and down-only fields only for down', () => {
        const quilt = readSpecs('Top Quilt', { temp_comfort: '30F', temp_limit: '20F', insulation: 'Down', fill_power: '850', rds: 'yes', volume: '40 L' });
        assert.deepEqual(quilt.errors, []);
        assert.deepEqual(Object.keys(quilt.specs).sort(), ['fill_power', 'insulation', 'rds', 'temp_comfort', 'temp_limit']);
        const synth = readSpecs('Outer Layer', { insulation: 'Synthetic', fill_power: '850', hooded: 'yes' });
        assert.deepEqual(synth.specs, { insulation: 'synthetic', hooded: true });
        assert.deepEqual(readSpecs('Cooking', { volume: '1 L' }).specs, {});
        assert.equal(readSpecs('Tent', { capacity: 'huge' }).errors.length, 1);
    });
});

describe('showing values', () => {
    test('both units, and back to editable text', () => {
        assert.equal(formatSpec('temp_comfort', -6.7), '20°F (−7°C)');
        assert.equal(formatSpec('trail_weight', 396.9), '14 oz (396.9 g)');
        assert.equal(formatSpec('volume', 40), '40 L');
        assert.equal(formatSpec('packed_size', [45.7, 12.7, 12.7]), '18 × 5 × 5 in (45.7 × 12.7 × 12.7 cm)');
        assert.equal(formatSpec('pitch', 'semi_freestanding'), 'Semi-freestanding');
        assert.equal(formatSpec('fill_power', 850), '850 fill');
        assert.equal(formatSpec('roll_top', true), 'Yes');
        for (const [key, raw] of [['temp_limit', '20F'], ['trail_weight', '14 oz'], ['packed_size', '18 x 5 x 5 in'], ['pitch', 'Freestanding'], ['fill_power', '850'], ['roll_top', 'yes']]) {
            const { value } = readSpec(key, raw);
            assert.deepEqual(readSpec(key, specInput(key, value)).value, value, key);
        }
    });

    test('rows for a gear page, in the type\'s order', () => {
        const rows = specRows('Tent', { pitch: 'freestanding', capacity: '2p', double_wall: true });
        assert.deepEqual(rows.map((r) => r.label), ['Size', 'Pitch', 'Double walled']);
        assert.deepEqual(specRows('Cooking', { volume: 1 }), []);
        assert.equal(filterKind('trail_weight'), 'range');
        assert.equal(filterKind('pitch'), 'match');
        assert.equal(filterKind('packed_size'), null);
    });
});

describe('more gear types: lights, power banks, shells, stoves, pots, filters, shoes, poles, tarps', () => {
    test('categories find their types; packs have a fit', () => {
        for (const [category, id] of [['Headlamp', 'light'], ['Power Banks', 'power'], ['Rain Jacket', 'shell'], ['Wind Shirt', 'shell'],
            ['Stove', 'stove'], ['Cook Pot', 'cookware'], ['Water Filter', 'filter'], ['Trail Runners', 'shoe'], ['Trekking Poles', 'poles'],
            ['Tarp', 'tarp'], ['Down Jacket', 'outer'], ['Mid Layer', 'outer']]) {
            assert.equal((specTypeFor(category) || {}).id, id, category);
        }
        assert.ok(specTypeFor('Backpack').fields.includes('gender'));
        assert.deepEqual(readSpecs('Pack', { gender: 'Female', hip_belt: 'detachable' }).specs, { gender: 'womens', hip_belt: 'removable' });
    });

    test('numbers with their unit, grouped thousands, decimals', () => {
        assert.deepEqual(readSpec('lumens', '400 lumens'), { value: 400 });
        assert.deepEqual(readSpec('lumens', '400lm'), { value: 400 });
        assert.deepEqual(readSpec('capacity_mah', '10,000 mAh'), { value: 10000 });
        assert.deepEqual(readSpec('capacity_mah', '20000'), { value: 20000 });
        assert.deepEqual(readSpec('waterproof_mm', '20,000mm'), { value: 20000 });
        assert.deepEqual(readSpec('pore_size', '0.1 microns'), { value: 0.1 });
        assert.deepEqual(readSpec('pore_size', '0,02'), { value: 0.02 });
        assert.deepEqual(readSpec('boil_time', '3.5 min'), { value: 3.5 });
        assert.deepEqual(readSpec('lifespan_l', '100000 gal'), { value: 378541 });
        assert.ok(readSpec('lumens', '400 watts').error, 'another unit');
        assert.ok(readSpec('capacity_mah', '1.5').error, 'whole numbers');
        assert.equal(formatSpec('capacity_mah', 10000), '10,000 mAh');
        assert.equal(formatSpec('lumens', 400), '400 lm');
        assert.equal(specInput('capacity_mah', 10000), '10000 mAh');
    });

    test('choices, pot sizes in L or ml, tarp sizes in feet', () => {
        assert.deepEqual(readSpecs('Headlamp', { battery: 'Rechargeable', charge_port: 'Type-C', ip_rating: 'ipx4', red_light: 'yes' }).specs,
            { battery: 'built_in', charge_port: 'usb_c', red_light: true, ip_rating: 'ipx4' });
        assert.deepEqual(readSpecs('Stove', { fuel: 'Isobutane', piezo: 'no' }).specs, { fuel: 'canister', piezo: false });
        assert.deepEqual(readSpec('pot_volume', '750 ml'), { value: 0.75 });
        assert.deepEqual(readSpec('pot_volume', '0.9'), { value: 0.9 });
        assert.equal(formatSpec('pot_volume', 0.75), '0.8 L');
        assert.deepEqual(readSpec('tarp_size', '8.5 x 10 ft'), { value: [259.1, 304.8] });
        assert.equal(formatSpec('tarp_size', [259.1, 304.8], 'imperial'), '8.5 × 10 ft');
        assert.equal(formatSpec('tarp_size', [259.1, 304.8], 'metric'), '2.6 × 3 m');
        assert.deepEqual(readSpecs('Water Filter', { filter_type: 'Squeeze', flow_rate: '1.7 L/min', removes_viruses: 'no' }).specs,
            { filter_type: 'squeeze', flow_rate: 1.7, removes_viruses: false });
    });

    test('a lighter swap keeps what matters', () => {
        assert.equal(likeForLikeSpecs({ capacity_mah: 10000 }, { capacity_mah: 5000 }), false);
        assert.equal(likeForLikeSpecs({ capacity_mah: 10000 }, { capacity_mah: 9000 }), true);
        assert.equal(likeForLikeSpecs({ lumens: 400 }, { lumens: 100 }), false);
        assert.equal(likeForLikeSpecs({ filter_type: 'squeeze' }, { filter_type: 'gravity' }), false);
        assert.equal(likeForLikeSpecs({ fuel: 'canister' }, { fuel: 'alcohol' }), false);
        assert.equal(likeForLikeSpecs({ pot_volume: 0.75 }, { pot_volume: 0.45 }), false);
        assert.equal(likeForLikeSpecs({ pot_volume: 0.75 }, { pot_volume: 0.9 }), true);
        assert.equal(likeForLikeSpecs({ capacity_mah: 10000 }, {}), true, 'not judged without both');
    });

    test('side by side: every spec either has, the best marked', () => {
        const rows = compareSpecRows([
            { category: 'Headlamp', specs: { lumens: 400, battery: 'built_in' } },
            { category: 'Headlamp', specs: { lumens: 250, battery: 'aaa', runtime: 120 } },
            { category: 'Spork', specs: {} },
        ], 'imperial');
        assert.deepEqual(rows.map((r) => r.key), ['lumens', 'runtime', 'battery']);
        assert.deepEqual(rows[0].cells.map((c) => [c.text, c.best]), [['400 lm', true], ['250 lm', false], ['', false]]);
        // One value isn't a contest; choices have no best.
        assert.deepEqual(rows[1].cells.map((c) => c.best), [false, false, false]);
        assert.deepEqual(rows[2].cells.map((c) => c.text), ['Built-in rechargeable', 'AAA', '']);
        // Lower is better for a rating.
        const quilts = compareSpecRows([{ category: 'Quilt', specs: { temp_comfort: -6.7 } }, { category: 'Quilt', specs: { temp_comfort: 1.7 } }]);
        assert.deepEqual(quilts[0].cells.map((c) => c.best), [true, false]);
    });
});
