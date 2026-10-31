import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { readSpec, readSpecs, formatSpec, specInput, specRows, specTypeFor, SPEC_TYPES, SPEC_FIELDS, filterKind } from '../../client/utils/gear-specs.js';

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
