import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { volumeLiters, sameVolume, sizeOf, sameSize, fitsLike } from '../../client/utils/fit.js';

describe('fit: volume', () => {
    it('reads liters from specs, then the name', () => {
        assert.equal(volumeLiters({ name: 'Anything', specs: { volume: 38 } }), 38);
        assert.equal(volumeLiters({ name: 'Nero Classic 50L (Vest Straps)' }), 50);
        assert.equal(volumeLiters({ name: 'Arc Haul Ultra 40 L' }), 40);
        assert.equal(volumeLiters({ name: 'Mariposa 60+10L' }), 60);
        assert.equal(volumeLiters({ name: 'Toaks Pot 750ml' }), 0.75);
        assert.equal(volumeLiters({ name: 'Southwest 2400 ci' }), 39);
        // A bare number names a pack's volume, not other gear's.
        assert.equal(volumeLiters({ name: 'Murmur 36', kind: 'pack' }), 36);
        assert.equal(volumeLiters({ name: 'Murmur 36' }), null);
        assert.equal(volumeLiters({ name: 'Lightning 2.0', kind: 'pack' }), null);
        assert.equal(volumeLiters({ name: 'Durston X-Mid 1' }), null);
    });

    it('keeps packs near the same size: a 40 L pack gets 34-46 L', () => {
        assert.equal(sameVolume(40, 30), false);
        assert.equal(sameVolume(40, 50), false);
        assert.equal(sameVolume(40, 36), true);
        assert.equal(sameVolume(40, 45), true);
        assert.equal(sameVolume(20, 23), true);
        assert.equal(sameVolume(20, 25), false);
        // Not judged without both.
        assert.equal(sameVolume(40, null), true);
    });
});

describe('fit: size', () => {
    it('reads clothing sizes, pairs, and not liters or possessives', () => {
        assert.deepEqual(sizeOf('Rain jacket XL'), { apparel: [5] });
        assert.deepEqual(sizeOf('Ghost Whisperer Hoody (Medium)'), { apparel: [3] });
        assert.deepEqual(sizeOf('Torso S/M'), { apparel: [2, 3] });
        assert.deepEqual(sizeOf('Wind shirt, size: x-large'), { apparel: [5] });
        assert.equal(sizeOf("Women's Rain Jacket"), null);
        assert.equal(sizeOf('Arc Haul 40 L'), null);
        assert.equal(sizeOf('Durston X-Mid 1'), null);
        assert.equal(sizeOf('NeoAir XLite'), null);
    });

    it('reads lengths for sleep gear and shoe sizes', () => {
        assert.deepEqual(sizeOf('NeoAir XLite NXT Regular Wide', 'air-pad'), { length: 1, wide: true });
        assert.deepEqual(sizeOf('Revelation 20 Long/Wide', 'top-quilt'), { length: 2, wide: true });
        assert.deepEqual(sizeOf('XTherm Large', 'air-pad'), { length: 2, wide: false });
        assert.deepEqual(sizeOf("Lone Peak 8 Men's 10.5"), { shoe: 'us10.5' });
        assert.equal(sizeOf('Lone Peak 8'), null);
    });

    it('an XL never gets a Small or Medium; S/M covers both', () => {
        assert.equal(sameSize(sizeOf('Shell XL'), sizeOf('Shell Small')), false);
        assert.equal(sameSize(sizeOf('Shell XL'), sizeOf('Shell M')), false);
        assert.equal(sameSize(sizeOf('Shell XL'), sizeOf('Shell X-Large')), true);
        assert.equal(sameSize(sizeOf('Pack M'), sizeOf('Pack S/M')), true);
        assert.equal(sameSize(sizeOf('Pad Regular', 'air-pad'), sizeOf('Pad Regular Wide', 'air-pad')), false);
        // A model name with no size is still offered.
        assert.equal(sameSize(sizeOf('Shell XL'), sizeOf('Versalite Jacket')), true);
    });
});

describe('fit: fitsLike', () => {
    it('combines volume and size', () => {
        assert.equal(fitsLike({ name: 'Old pack 40L (M)' }, { name: 'Kumo 36', specs: {} }, 'pack'), true);
        assert.equal(fitsLike({ name: 'Old pack 40L (M)' }, { name: 'Kumo 36 (S)', specs: {} }, 'pack'), false);
        assert.equal(fitsLike({ name: 'Old pack 40L' }, { name: 'Mariposa 60', specs: {} }, 'pack'), false);
        assert.equal(fitsLike({ name: 'Old pack 40L' }, { name: 'Pack', specs: { volume: 30 } }, 'pack'), false);
        assert.equal(fitsLike({ name: 'Puffy XL' }, { name: 'Puffy Small' }, 'insulation'), false);
    });
});
