import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { bigThreeKind, likeForLike, worthSwapping, isAccessory, sameCategory } from '../../client/utils/big-three.js';

describe('the big three', () => {
    test('gear is told apart finely, so swaps stay in the same system', () => {
        const k = (name, extra = {}) => bigThreeKind({ name, ...extra });
        assert.equal(k('Dutchware Chameleon hammock'), 'hammock');
        assert.equal(k('Warbonnet Superfly hammock tarp'), 'tarp');
        assert.equal(k('Hammock Gear Incubator underquilt'), 'underquilt');
        assert.equal(k('Enlightened Equipment Revelation quilt'), 'top-quilt');
        assert.equal(k('Western Mountaineering sleeping bag'), 'sleeping-bag');
        assert.equal(k('Durston X-Mid 1 tent'), 'tent');
        assert.equal(k('SOL Escape bivy'), 'bivy');
        assert.equal(k('Therm-a-Rest NeoAir XLite sleeping pad'), 'air-pad');
        assert.equal(k('Nemo Switchback foam pad'), 'foam-pad');
        assert.equal(k('Gossamer Gear Mariposa backpack'), 'pack');
        // Model names alone say nothing: the list's category or catalog decides.
        assert.equal(k('Durston X-Mid 1'), null);
        assert.equal(k('Durston X-Mid 1', { category: 'Tent' }), 'tent');
        assert.equal(k('Durston X-Mid 1', { catalogCategory: 'Tent' }), 'tent');
        // The catalog's category is trusted first; pads by their type.
        assert.equal(k('Model 7', { catalogCategory: 'Underquilt' }), 'underquilt');
        assert.equal(k('Model 8', { catalogCategory: 'Sleeping Pad', specs: { pad_type: 'closed_cell' } }), 'foam-pad');
        assert.equal(k('Nemo Switchback', { catalogCategory: 'Sleeping Pad' }), 'air-pad');
        assert.equal(k('Therm-a-Rest Z Lite Sol', { catalogCategory: 'Sleeping Pad' }), 'foam-pad');
        // The list's category name as a last resort.
        assert.equal(k('My old one', { category: 'Tent' }), 'tent');
        // Accessories and look-alikes aren't big-three gear.
        for (const name of ['Hammock suspension straps', 'Tent stakes', 'Pack liner', 'Fanny pack', 'Sit pad', 'Battery pack', 'Bug net', 'Pillow']) {
            assert.equal(k(name), null, name);
        }
        assert.equal(k('Stove'), null);
    });

    test('a brand is not a kind of gear, and accessories are never swaps (reported examples)', () => {
        // Catalog gear offered as a swap: only its catalog category says what it is.
        const offered = (name, category) => bigThreeKind({ name, brand: 'Hammock Gear', catalogCategory: category, strict: true });
        assert.equal(offered('Hammock Gear Dyneema® Hammock Ground Cloth', 'Accessories'), null);
        assert.equal(offered('Hammock Gear Dyneema® Hammock Ground Cloth', 'Hammock'), null);
        assert.equal(offered('Hammock Gear Mesh Tarp Sleeve', 'Tarp'), null);
        assert.equal(offered('Hammock Gear Mesh Tarp Sleeve', 'Hammock Accessories'), null);
        assert.equal(offered('Hammock Gear Underquilt Protector', 'Underquilt'), null);
        assert.equal(offered('Hammock Gear Burrow Econ 20', 'Top Quilt'), 'top-quilt');
        assert.equal(offered('Hammock Gear Incubator 20', 'Underquilt'), 'underquilt');
        // Words in the name don't make catalog gear a kind it isn't filed as.
        assert.equal(offered('Hammock Gear Hammock Tarp', 'Accessories'), null);

        // The hiker's own gear (reported): what each one is.
        const own = (name, extra = {}) => bigThreeKind({ name, ...extra });
        assert.equal(own('11 ft. Netless Hammock (Cloud 71)'), 'hammock');
        assert.equal(own('Bottom Entry Bugnet', { category: 'Hammock' }), null);
        assert.equal(own('Bottom Entry Bugnet', { catalogCategory: 'Hammock' }), null);
        assert.equal(own('Falcon Tarp (DCF .55, White)'), 'tarp');
        assert.equal(own('SELVA 120', { category: 'Underquilt' }), 'underquilt');
        // Gear linked to a catalog category that isn't big-three: not guessed from words.
        assert.equal(own('Hammock Gear hammock straps', { catalogCategory: 'Accessories' }), null);
        // "with" doesn't make a hammock an accessory.
        assert.equal(own('Dutchware Chameleon hammock with bug net'), 'hammock');
        assert.equal(isAccessory('Hammock Gear Underquilt Protector', 'Hammock Gear'), true);
        assert.equal(isAccessory('Durston X-Mid 1'), false);
        assert.equal(isAccessory('Trekking pole tent'), false);
        // Reported: a hoodie named after a pack is never a pack swap; a pack
        // with "(Vest Straps)" is still a pack.
        assert.equal(offered('Town Shirt Desert Mariposa Sun Hoodie (XS)', 'Sun Hoodie'), null);
        assert.equal(bigThreeKind({ name: 'Town Shirt Desert Mariposa Sun Hoodie (XS)', catalogCategory: 'Shirt', strict: true }), null);
        assert.equal(bigThreeKind({ name: 'Gossamer Gear Murmur 36', brand: 'Gossamer Gear', catalogCategory: 'Pack', strict: true }), 'pack');
        assert.equal(own('Nero Classic 50L (Vest Straps)', { category: 'Pack' }), 'pack');
        assert.equal(own('Nero Classic 50L (Vest Straps)', { catalogCategory: 'Backpack' }), 'pack');
        // Same catalog category: spellings and plurals are one.
        assert.equal(sameCategory('Tents', 'tent'), true);
        assert.equal(sameCategory('Hammock', 'Hammock Accessories'), false);
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
        // Packs: carrying about as much (volume is fit.js's).
        assert.equal(likeForLike('pack', { max_carry: 16 }, { max_carry: 9 }), false);
        assert.equal(likeForLike('pack', { max_carry: 16 }, { max_carry: 14 }), true);
        // Without specs on both, any of the same kind.
        assert.equal(likeForLike('tent', { capacity: '2p' }, {}), true);
    });
});
