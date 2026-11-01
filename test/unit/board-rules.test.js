import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { staleSteps, boardStanding, boardGearCheck, updatedAgo, boardExplainer, DAY_MS } from '../../client/utils/board-rules.js';

const NOW = Date.parse('2026-11-01T12:00:00Z');
const ago = (days) => new Date(NOW - days * DAY_MS).toISOString();
const LB = 453592;
const kit = (over = {}) => ({ baseWeightMg: 9 * LB, freshAt: ago(0), votes: { net: 0, count: 0 }, boardOk: true, ...over });

describe('Lightest board: time untouched', () => {
    test('3 months of grace, then +5% for every month started', () => {
        assert.equal(staleSteps(0), 0);
        assert.equal(staleSteps(90), 0);
        assert.equal(staleSteps(91), 1); // month 4
        assert.equal(staleSteps(120), 1);
        assert.equal(staleSteps(121), 2);
        assert.equal(staleSteps(365), 10);
    });
    test('a 9 lb list ranks as 9.45 lb in month 4, the real weight unchanged', () => {
        const s = boardStanding(kit({ freshAt: ago(100) }), NOW);
        assert.equal(s.padPct, 5);
        assert.equal(s.rankWeightMg, Math.round(9 * LB * 1.05));
        assert.equal(s.listed, true);
    });
    test('off the board after a year untouched', () => {
        assert.equal(boardStanding(kit({ freshAt: ago(364) }), NOW).listed, true);
        const s = boardStanding(kit({ freshAt: ago(366) }), NOW);
        assert.deepEqual([s.listed, s.reason], [false, 'stale']);
    });
});

describe('Lightest board: downvotes', () => {
    test('count only once a list has 3 votes', () => {
        assert.equal(boardStanding(kit({ votes: { net: -2, count: 2 } }), NOW).padPct, 0);
        assert.equal(boardStanding(kit({ votes: { net: -1, count: 3 } }), NOW).padPct, 5);
        assert.equal(boardStanding(kit({ votes: { net: 3, count: 3 } }), NOW).padPct, 0);
    });
    test('add to the time padding; net -5 drops the list', () => {
        assert.equal(boardStanding(kit({ freshAt: ago(130), votes: { net: -3, count: 7 } }), NOW).padPct, 10 + 15);
        const s = boardStanding(kit({ votes: { net: -5, count: 5 } }), NOW);
        assert.deepEqual([s.listed, s.reason], [false, 'downvoted']);
    });
});

describe('Lightest board: Gear check', () => {
    const row = (name, category = '') => ({ name, description: '', category });
    const full = [row('Duplex', 'Shelter'), row('Quilt', 'Sleep'), row('Puffy jacket'), row('Sawyer filter'), row('Phone'), row('Headlamp'), row('First aid kit'), row('Rain jacket')];
    test('a full kit passes', () => {
        assert.equal(boardGearCheck(full, { tripType: 'thru' }).ok, true);
    });
    test('overnight lists need a shelter and a sleep system even with a high score', () => {
        const noShelter = full.filter((r) => r.name !== 'Duplex');
        const check = boardGearCheck(noShelter, { tripType: 'backpacking' });
        assert.ok(check.score >= 70);
        assert.equal(check.ok, false);
    });
    test('marking a critical essential "not needed" does not count for the board', () => {
        const noShelter = full.filter((r) => r.name !== 'Duplex');
        assert.equal(boardGearCheck(noShelter, { tripType: 'backpacking', notNeeded: ['shelter'] }).ok, false);
    });
    test('day hikes need no shelter or sleep system', () => {
        const day = full.filter((r) => r.name !== 'Duplex' && r.name !== 'Quilt');
        assert.equal(boardGearCheck(day, { tripType: 'dayhike' }).ok, true);
    });
    test('a near-empty list fails', () => {
        assert.equal(boardGearCheck([row('Pack')], { tripType: 'thru' }).ok, false);
        assert.equal(boardStanding(kit({ boardOk: false }), NOW).reason, 'gear-check');
    });
});

test('updatedAgo and the explainer read plainly', () => {
    assert.equal(updatedAgo(ago(0.2), NOW), 'today');
    assert.equal(updatedAgo(ago(1), NOW), '1 day ago');
    assert.equal(updatedAgo(ago(45), NOW), '1 month ago');
    assert.equal(updatedAgo(ago(130), NOW), '4 months ago');
    const text = boardExplainer().join(' ');
    assert.match(text, /3 months/);
    assert.match(text, /5% heavier per month/);
    assert.match(text, /after a year/);
    assert.match(text, /Gear check score of 70/);
});
