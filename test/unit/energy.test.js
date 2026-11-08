import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { restingBurn, pandolfWatts, dayOnTrail, waterToCarry, resupplyStretches, parseStretches } from '../../client/utils/energy.js';

describe('energy on trail', () => {
    test('resting burn: Mifflin–St Jeor, Katch–McArdle from a build, or both', () => {
        // Mifflin: 10·75 + 6.25·178 − 5·30 + 5 = 1717.5
        assert.equal(Math.round(restingBurn({ kg: 75, heightCm: 178, age: 30, sex: 'male' }).kcal), 1718);
        // Women: −161
        assert.equal(Math.round(restingBurn({ kg: 60, heightCm: 165, age: 40, sex: 'female' }).kcal), 1270);
        // Katch: 370 + 21.6 · 75 · (1 − 0.2) = 1666
        assert.equal(Math.round(restingBurn({ kg: 75, sex: 'male', build: 'average' }).kcal), 1666);
        const both = restingBurn({ kg: 75, heightCm: 178, age: 30, sex: 'male', build: 'average' });
        assert.equal(Math.round(both.kcal), Math.round((1717.5 + 1666) / 2));
        assert.match(both.method, /Mifflin.*Katch/);
        // Weight only.
        assert.equal(restingBurn({ kg: 70 }).kcal, 1680);
        assert.equal(restingBurn({}), null);
        // A lean build burns more at rest than a higher-fat one of the same weight.
        assert.ok(restingBurn({ kg: 80, sex: 'male', build: 'lean' }).kcal > restingBurn({ kg: 80, sex: 'male', build: 'higher' }).kcal);
    });

    test('Pandolf: heavier packs, steeper grades and rougher terrain cost more', () => {
        const base = { bodyKg: 75, packKg: 10, speedMs: 1, gradePct: 0, eta: 1.2 };
        const w = pandolfWatts(base);
        assert.ok(pandolfWatts({ ...base, packKg: 20 }) > w);
        assert.ok(pandolfWatts({ ...base, gradePct: 10 }) > w);
        assert.ok(pandolfWatts({ ...base, eta: 2 }) > w);
        // Standing still: 1.5 W/kg plus the load term.
        assert.equal(Math.round(pandolfWatts({ ...base, speedMs: 0 })), Math.round(1.5 * 75 + 2 * 85 * (10 / 75) ** 2));
    });

    test('a day on trail lands where long-distance hikers do', () => {
        const thru = dayOnTrail({ kg: 75, heightCm: 178, age: 30, sex: 'male', build: 'average' },
            { km: 32, gainM: 1200, terrain: 'trail', paceKmh: 3.5, lowC: 5, highC: 25 }, 11);
        assert.ok(thru.kcal >= 4000 && thru.kcal <= 6000, String(thru.kcal));
        assert.ok(thru.waterLiters >= 4 && thru.waterLiters <= 8, String(thru.waterLiters));
        // More climbing, cold, snow: more; a rest day: much less.
        const harder = dayOnTrail({ kg: 75, sex: 'male' }, { km: 32, gainM: 2500, terrain: 'snow', lowC: -15 }, 15);
        const easier = dayOnTrail({ kg: 75, sex: 'male' }, { km: 32, gainM: 200 }, 11);
        assert.ok(harder.kcal > easier.kcal);
        assert.ok(dayOnTrail({ kg: 75 }, { km: 0 }, 0).kcal < 2600);
        // Heat: more water.
        assert.ok(dayOnTrail({ kg: 70 }, { km: 30, highC: 38 }, 10).waterLiters > dayOnTrail({ kg: 70 }, { km: 30, highC: 15 }, 10).waterLiters);
        assert.equal(dayOnTrail({}, { km: 20 }, 10), null);
    });

    test('water to carry, food per stretch between town stops', () => {
        // 20 km at 4 km/h = 5 h × 0.5 L + 0.5 L reserve.
        assert.equal(waterToCarry(20, 4, 0.5), 3);
        assert.equal(waterToCarry(null, 4, 0.5), null);
        const s = resupplyStretches([4, 5, 3], 4500, 125);
        assert.deepEqual(s.map((x) => x.days), [4, 5, 3]);
        // 4500 kcal ÷ 125 kcal/oz = 36 oz a day; 4 days = 144 oz.
        assert.equal(Math.round(s[0].foodMg / 28349.5), 144);
        assert.equal(s[1].kcal, 22500);
        assert.deepEqual(parseStretches('4, 5 ;3, x, 0, 2.5'), [4, 5, 3, 2.5]);
    });
});
