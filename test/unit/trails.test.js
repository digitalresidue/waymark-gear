import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeTrailTag, packFeatures, trailLabel } from '../../client/utils/trails.js';
import { keyOf } from '../../server/trails-index.js';

describe('trail tags', () => {
    test('cleaned: name required, year and direction checked', () => {
        assert.equal(normalizeTrailTag({ name: '  ' }), null);
        assert.deepEqual(normalizeTrailTag({ name: ' Pacific  Crest Trail ', year: '2026', direction: 'nobo', junk: 1 }), { name: 'Pacific Crest Trail', year: 2026, direction: 'nobo' });
        assert.deepEqual(normalizeTrailTag({ name: 'AT', year: 3000, direction: 'sideways' }), { name: 'AT' });
        assert.equal(trailLabel({ name: 'Pacific Crest Trail', short: 'PCT', year: 2025, direction: 'sobo' }), 'PCT · 2025 · SOBO');
    });

    test('names match however they are written', () => {
        assert.equal(keyOf('A.T.'), keyOf('AT'));
        assert.equal(keyOf('Pacific  Crest-Trail'), 'pacific crest trail');
        assert.equal(keyOf("Walker's Haute Route"), keyOf('Walkers Haute Route'));
    });
});

describe('pack features', () => {
    const rows = (...names) => names.map((name) => ({ name, description: '' }));
    test('found by whole words', () => {
        const f = packFeatures(rows('Enigma 20F quilt', 'Altra Lone Peak 9', 'BV450 bear canister', 'Garmin inReach Mini 2', 'Camp ice axe'));
        for (const id of ['quilt', 'trail-runners', 'bear-canister', 'messenger', 'ice-axe']) assert.ok(f.includes(id), id);
        assert.ok(!f.includes('hammock'));
    });
    test('no false friends', () => {
        const f = packFeatures(rows('Taxes folder', 'Quilted vest'));
        assert.ok(!f.includes('ice-axe'));
        assert.ok(!f.includes('quilt'));
    });
});
