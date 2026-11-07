import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { bigThreeKind, likeForLike, worthSwapping } from '../../client/utils/big-three.js';

describe('the big three', () => {
    test('gear is told apart finely, so swaps stay in the same system', () => {
        const k = (name, extra = {}) => bigThreeKind({ name, ...extra });
        assert.equal(k('Dutchware Chameleon hammock'), 'hammock');
        assert.equal(k('Warbonnet Superfly hammock tarp'), 'tarp');
        assert.equal(k('Hammock Gear Incubator underquilt'), 'underquilt');
        assert.equal(k('Enlightened Equipment Revelation quilt'), 'top-quilt');
        assert.equal(k('Western Mountaineering sleeping bag'), 'sleeping-bag');
        assert.equal(k('Durston X-Mid 1'), 'tent');
        assert.equal(k('SOL Escape bivy'), 'bivy');
        assert.equal(k('Therm-a-Rest NeoAir XLite'), 'air-pad');
        assert.equal(k('Nemo Switchback'), 'foam-pad');
        assert.equal(k('Gossamer Gear Mariposa'), 'pack');
        // The catalog's category is trusted first; pads by their type.
        assert.equal(k('Model 7', { catalogCategory: 'Underquilt' }), 'underquilt');
        assert.equal(k('Model 8', { catalogCategory: 'Sleeping Pad', specs: { pad_type: 'closed_cell' } }), 'foam-pad');
        // The list's category name as a last resort.
        assert.equal(k('My old one', { category: 'Tent' }), 'tent');
        // Accessories and look-alikes aren't big-three gear.
        for (const name of ['Hammock suspension straps', 'Tent stakes', 'Pack liner', 'Fanny pack', 'Sit pad', 'Battery pack', 'Bug net', 'Pillow']) {
            assert.equal(k(name), null, name);
        }
        assert.equal(k('Stove'), null);
    });

    test('a swap is at least 20% lighter', () => {
        assert.equal(worthSwapping(1000, 800), true);
        assert.equal(worthSwapping(1000, 801), false);
        assert.equal(worthSwapping(1000, 0), false);
        assert.equal(worthSwapping(0, 10), false);
    });

    test('like for like, where both have the specs', () => {
        // Tents: as many people.
        assert.equal(likeForLike('tent', { capacity: '2p' }, { capacity: '1p' }), false);
        assert.equal(likeForLike('tent', { capacity: '2p' }, { capacity: '2p_plus' }), true);
        // Quilts and bags: as warm (within 1°C).
        assert.equal(likeForLike('top-quilt', { temp_comfort: -6.7 }, { temp_comfort: 10 }), false);
        assert.equal(likeForLike('top-quilt', { temp_comfort: -6.7 }, { temp_comfort: -6 }), true);
        assert.equal(likeForLike('sleeping-bag', { temp_limit: -10 }, { temp_limit: -12 }), true);
        // Pads: as well insulated.
        assert.equal(likeForLike('air-pad', { r_value: 4 }, { r_value: 2 }), false);
        assert.equal(likeForLike('air-pad', { r_value: 4 }, { r_value: 3.9 }), true);
        // Packs: not much smaller.
        assert.equal(likeForLike('pack', { volume: 60 }, { volume: 30 }), false);
        assert.equal(likeForLike('pack', { volume: 60 }, { volume: 50 }), true);
        // Without specs on both, any of the same kind.
        assert.equal(likeForLike('tent', { capacity: '2p' }, {}), true);
    });
});
