import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { tripDays, normalizeTrip, MG_PER_LITER } from '../../client/utils/trip.js';

const LB = 453592;
const list = { totalBaseWeight: 8 * LB, totalConsumableWeight: 0.5 * LB, totalWornWeight: 2 * LB };

describe('tripDays', () => {
    test('Day 1 carries all the food; the last day carries one day of it', () => {
        const days = tripDays(list, { days: 5, foodPerDayMg: 1.5 * LB, waterLiters: 2 });
        assert.equal(days.length, 5);
        const water = 2 * MG_PER_LITER;
        assert.equal(days[0].packMg, 8 * LB + 0.5 * LB + 7.5 * LB + water);
        assert.equal(days[4].packMg, 8 * LB + 0.5 * LB + 1.5 * LB + water);
        assert.equal(days[0].skinOutMg - days[0].packMg, 2 * LB);
    });

    test('base weight is never changed by the planner', () => {
        const before = list.totalBaseWeight;
        tripDays(list, { days: 10, foodPerDayMg: 2 * LB, waterLiters: 4 });
        assert.equal(list.totalBaseWeight, before);
    });

    test('settings are kept within sensible bounds', () => {
        assert.deepEqual(normalizeTrip({ days: 0, foodPerDayMg: -5, waterLiters: 999 }), { days: 1, foodPerDayMg: 0, waterLiters: 30 });
        assert.equal(normalizeTrip({ days: 2.6 }).days, 3);
    });
});

describe('tripEstimates', async () => {
    const { tripEstimates } = await import('../../client/utils/trip.js');
    test('needs body weight; more distance, climbing and cold mean more food', () => {
        assert.equal(tripEstimates({ days: 3 }, 0), null);
        const base = tripEstimates({ days: 3, bodyKg: 75, distanceKm: 60, elevationM: 1500 }, 8 * LB);
        const harder = tripEstimates({ days: 3, bodyKg: 75, distanceKm: 90, elevationM: 4500, tempLowC: -10 }, 8 * LB);
        assert.ok(base.kcalPerDay > 2500 && base.kcalPerDay < 4500, String(base.kcalPerDay));
        assert.ok(harder.kcalPerDay > base.kcalPerDay);
        assert.ok(harder.waterLitersPerDay >= base.waterLitersPerDay);
        assert.equal(base.foodPerDayMg, Math.round((base.kcalPerDay / 125) * 28349.5));
    });

    test('trip details are optional and bounded', () => {
        const t = normalizeTrip({ days: 2, distanceKm: -5, terrain: 'lava', bodyKg: 500 });
        assert.equal(t.distanceKm, 0);
        assert.equal(t.terrain, undefined);
        assert.equal(t.bodyKg, 250);
        assert.equal(normalizeTrip({ days: 2 }).distanceKm, undefined);
    });
});
