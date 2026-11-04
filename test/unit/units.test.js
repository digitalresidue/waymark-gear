import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { matchUnits, pickUnits, unitsForAcceptLanguage, unitFor, unitSystemOf, weightUnitIn, convertLibraryUnits } from '../../client/utils/units.js';
import { formatSpec } from '../../client/utils/gear-specs.js';
import { formatWeightG, rangeLabel } from '../../client/utils/explore.js';

describe('unit systems', () => {
    test('a choice wins, then the browser region, then imperial', () => {
        assert.equal(matchUnits('METRIC'), 'metric');
        assert.equal(matchUnits('furlongs'), null);
        assert.equal(pickUnits({ chosen: 'metric', acceptLanguage: 'en-US' }), 'metric');
        assert.equal(pickUnits({ acceptLanguage: 'en-GB,en;q=0.8' }), 'metric');
        assert.equal(pickUnits({ acceptLanguage: 'de-DE' }), 'metric');
        assert.equal(pickUnits({ acceptLanguage: 'en-US,de;q=0.5' }), 'imperial');
        assert.equal(pickUnits({ acceptLanguage: 'en' }), 'imperial');
        assert.equal(pickUnits({}), 'imperial');
        assert.equal(unitsForAcceptLanguage('zh-Hans-CN'), 'metric');
    });

    test('units for each kind of value', () => {
        assert.equal(unitFor('weight', 'imperial'), 'oz');
        assert.equal(unitFor('weight', 'metric', true), 'kg');
        assert.equal(unitFor('length', 'metric'), 'cm');
        assert.equal(unitFor('temp', 'imperial'), 'F');
        assert.equal(unitSystemOf('lb'), 'imperial');
        assert.equal(unitSystemOf('g'), 'metric');
        assert.equal(unitSystemOf('L'), null);
        assert.equal(weightUnitIn('oz', 'metric'), 'g');
        assert.equal(weightUnitIn('kg', 'imperial'), 'lb');
        assert.equal(weightUnitIn('g', 'metric'), 'g');
    });

    test('switching a library swaps every unit and keeps every weight', () => {
        const library = { items: [{ authorUnit: 'oz', weight: 28350 }, { authorUnit: 'lb', weight: 453592 }, { authorUnit: 'g', weight: 5000 }], totalUnit: 'lb', itemUnit: 'oz' };
        assert.equal(convertLibraryUnits(library, 'metric'), 4);
        assert.deepEqual(library.items.map((i) => i.authorUnit), ['g', 'kg', 'g']);
        assert.deepEqual(library.items.map((i) => i.weight), [28350, 453592, 5000]);
        assert.equal(library.totalUnit, 'kg');
        assert.equal(library.itemUnit, 'g');
        convertLibraryUnits(library, 'imperial');
        assert.deepEqual(library.items.map((i) => i.authorUnit), ['oz', 'lb', 'oz']);
        assert.equal(convertLibraryUnits(library, 'nonsense'), 0);
    });

    test('specs and weights show in one system, or both without one', () => {
        assert.equal(formatSpec('temp_comfort', -7, 'metric'), '−7°C');
        assert.equal(formatSpec('temp_comfort', -7, 'imperial'), '19°F');
        assert.equal(formatSpec('temp_comfort', -7), '19°F (−7°C)');
        assert.equal(formatSpec('packed_size', [200, 60, 30], 'metric'), '200 × 60 × 30 cm');
        assert.equal(formatSpec('max_carry', 9000, 'imperial'), '19.8 lb');
        assert.equal(formatSpec('volume', 40, 'metric'), formatSpec('volume', 40));
        assert.equal(formatWeightG(450, 'metric'), '450 g');
        assert.equal(formatWeightG(1500, 'metric'), '1.5 kg');
        assert.equal(formatWeightG(450, 'imperial'), '15.9 oz');
        assert.equal(formatWeightG(450), '15.9 oz (450 g)');
    });

    test('the Explore weight slider label follows the system', () => {
        const facet = { min: 0, max: 2000, step: 10 };
        assert.match(rangeLabel('weight', 100, 500, facet, undefined, 'metric'), /100 g.*500 g/);
        assert.doesNotMatch(rangeLabel('weight', 100, 500, facet, undefined, 'metric'), /oz/);
        assert.doesNotMatch(rangeLabel('weight', 100, 500, facet, undefined, 'imperial'), /\bg\b/);
    });
});
