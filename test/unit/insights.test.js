import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { checkEssentials, readinessLabel } from '../../client/utils/insights.js';

const row = (name, category = '', description = '') => ({ name, category, description });

describe('checkEssentials', () => {
    test('a complete kit scores 100, an empty one 0', () => {
        const full = [
            row('Zpacks Duplex', 'Shelter'), row('EE Enigma quilt', 'Sleep'), row('NeoAir XLite', 'Sleep'),
            row('Down jacket', 'Clothing'), row('Sawyer Squeeze', 'Water'), row('Phone with Gaia maps', 'Electronics'),
            row('Nitecore NU25 headlamp', 'Electronics'), row('First aid kit', 'Misc'), row('Frogg Toggs rain jacket', 'Clothing'),
            row('Sunscreen', 'Toiletries'), row('Mini Bic lighter', 'Kitchen'), row('Victorinox knife', 'Misc'), row('Garmin inReach Mini', 'Electronics'),
        ];
        const ok = checkEssentials(full);
        assert.equal(ok.score, 100, JSON.stringify(ok.missing));
        assert.equal(checkEssentials([]).score, 0);
    });

    test('words match whole words, not parts of other words', () => {
        // A lighter is a fire starter, not a light; a food bag isn't a sleeping bag; a rain jacket isn't insulation.
        const r = checkEssentials([row('Mini Bic lighter'), row('Food bag'), row('Rain jacket')]);
        const missing = r.missing.map((m) => m.id);
        assert.ok(missing.includes('light'));
        assert.ok(missing.includes('sleep'));
        assert.ok(missing.includes('insulation'));
        assert.ok(!missing.includes('fire'));
        assert.ok(!missing.includes('rain'));
    });

    test('missing critical gear costs more than missing nice-to-haves', () => {
        const noFirstAid = checkEssentials([row('Sunscreen'), row('Lighter'), row('Knife'), row('Whistle'), row('Rain shell')]);
        const noSun = checkEssentials([row('First aid kit'), row('Lighter'), row('Knife'), row('Whistle'), row('Rain shell')]);
        assert.ok(noSun.score > noFirstAid.score);
    });

    test('not needed and day hikes leave essentials out of the score', () => {
        const items = [row('Tent'), row('Quilt')];
        const before = checkEssentials(items).score;
        const after = checkEssentials(items, { dismissed: ['rain', 'sun', 'fire'] }).score;
        assert.ok(after > before);
        const day = checkEssentials([row('First aid kit')], { tripType: 'dayhike' });
        assert.ok(!day.missing.some((m) => m.id === 'shelter' || m.id === 'sleep'));
    });

    test('cold nights flag a missing warm layer', () => {
        const r = checkEssentials([row('Tent')], { tempLowC: -5 });
        assert.equal(r.notes.length, 1);
        assert.ok(r.missing.find((m) => m.id === 'insulation').critical);
    });

    test('labels', () => {
        assert.equal(readinessLabel(95), 'Ready');
        assert.equal(readinessLabel(10), 'Just getting started');
    });
});

describe('gearKind', async () => {
    const { gearKind } = await import('../../client/utils/insights.js');
    test('like for like', () => {
        assert.equal(gearKind('Trekking poles (aluminum)'), 'poles');
        assert.equal(gearKind('Deuce #2 trowel'), 'trowel');
        assert.equal(gearKind('Flash cooking system', 'Integrated stove and 1 L pot'), 'stove');
        assert.equal(gearKind('750 ml titanium pot'), 'pot');
        assert.equal(gearKind('Copper Spur HV UL2', 'Freestanding two-person tent'), 'shelter');
        assert.equal(gearKind('NeoAir XLite NXT', 'Inflatable pad'), 'sleep-pad');
        assert.equal(gearKind('Enigma 20°F quilt'), 'quilt-bag');
        assert.equal(gearKind('Thinlight foam pad'), 'foam-pad');
        assert.equal(gearKind('Camp shoes (Crocs)'), 'footwear');
        assert.equal(gearKind('Fuel canister 230 g'), null);
        assert.equal(gearKind('BV450 bear canister'), 'bear-container');
    });
});
