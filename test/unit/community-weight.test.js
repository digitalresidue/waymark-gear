import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { communityWeight, perPerson, weightGap, MIN_PEOPLE } from '../../client/utils/community-weight.js';

const g = (n) => n * 1000; // grams to mg

describe('Community weight: the middle of members\' own weights, once ten agree', () => {
    test('waits for ten people', () => {
        const nine = Array.from({ length: 9 }, () => g(600));
        assert.deepEqual(communityWeight(nine), { weightMg: null, count: 0, total: 9, status: 'waiting' });
        assert.equal(communityWeight([...nine, g(600)]).status, 'ready');
        assert.equal(MIN_PEOPLE, 10);
    });

    test('the middle of ten close weights, to a tenth of a gram', () => {
        const ten = [598, 601, 603, 600, 597, 605, 602, 599, 600, 604].map(g);
        assert.deepEqual(communityWeight(ten), { weightMg: g(600.5), count: 10, total: 10, status: 'ready' });
    });

    test('a unit slip, another size and a stray value are left out', () => {
        const good = [598, 601, 603, 600, 597, 605, 602, 599, 600, 604].map(g);
        // 21 g: ounces typed as grams. 900 g: the Large in the Medium. 640 g: well off the rest.
        const c = communityWeight([...good, g(21.2), g(900), g(640)]);
        assert.equal(c.status, 'ready');
        assert.equal(c.count, 10);
        assert.equal(c.total, 13);
        assert.equal(c.weightMg, g(600.5));
    });

    test('near-identical weights keep a gram\'s difference (3% or 2 g at least)', () => {
        const same = [...Array.from({ length: 9 }, () => g(56)), g(57)];
        assert.deepEqual(communityWeight(same), { weightMg: g(56), count: 10, total: 10, status: 'ready' });
    });

    test('too much disagreement: no weight, so the owner can look (two sizes in one item?)', () => {
        const mixed = [...Array.from({ length: 6 }, () => g(600)), ...Array.from({ length: 6 }, () => g(800))];
        const c = communityWeight(mixed);
        assert.equal(c.weightMg, null);
        assert.equal(c.status, 'disagree');
        assert.equal(c.total, 12);
    });

    test('ten agreeing out of many more is not enough: at least 60% must agree', () => {
        const ten = Array.from({ length: 10 }, () => g(600));
        const far = [300, 400, 450, 750, 800, 900, 1000, 1200].map(g);
        const c = communityWeight([...ten, ...far]);
        assert.equal(c.status, 'disagree');
    });

    test('zero and junk weights don\'t count', () => {
        assert.equal(communityWeight([0, -5, NaN, 'x', g(500)]).total, 1);
    });

    test('one weight per member: the middle of theirs when they have several', () => {
        const rows = [
            { userId: 'a', weightMg: g(600) },
            { userId: 'a', weightMg: g(620) },
            { userId: 'a', weightMg: g(610) },
            { userId: 'b', weightMg: g(590) },
        ];
        assert.deepEqual(perPerson(rows).sort(), [g(590), g(610)].sort());
    });
});

describe('Weight gap: your gear against the catalog, for Gear check', () => {
    test('close enough says nothing: under 15% or under 20 g', () => {
        assert.equal(weightGap(g(640), g(600)), null); // 6.7%
        assert.equal(weightGap(g(60), g(50)), null); // 20% but 10 g
        assert.equal(weightGap(0, g(600)), null);
        assert.equal(weightGap(g(600), 0), null);
    });

    test('far apart: how far, either way', () => {
        assert.deepEqual(weightGap(g(720), g(600)), { diffMg: g(120), share: 0.2, slip: null });
        const lighter = weightGap(g(480), g(600));
        assert.equal(lighter.diffMg, g(-120));
        assert.equal(lighter.slip, null);
    });

    test('a number in the wrong unit says which', () => {
        // 21.2 oz typed as 21.2 g.
        assert.deepEqual(weightGap(g(21.2), g(600)).slip, { typed: 'g', meant: 'oz' });
        // 600 g typed as 600 oz.
        assert.deepEqual(weightGap(g(600) * 28.3495, g(600)).slip, { typed: 'oz', meant: 'g' });
        // 1.2 kg typed as 1.2 g.
        assert.deepEqual(weightGap(g(1.2), g(1200)).slip, { typed: 'g', meant: 'kg' });
        // 2 lb typed as 2 oz.
        assert.deepEqual(weightGap(g(2 * 28.3495), g(2 * 453.592)).slip, { typed: 'oz', meant: 'lb' });
    });
});

describe('Community weight: fast for popular gear', () => {
    test('ten thousand weigh-ins in well under a second', () => {
        const many = Array.from({ length: 10000 }, (_, i) => g(600 + ((i * 7919) % 25) - 12));
        const t = Date.now();
        const c = communityWeight(many);
        assert.ok(Date.now() - t < 500);
        assert.equal(c.status, 'ready');
        assert.ok(Math.abs(c.weightMg - g(600)) <= g(1));
    });
});
