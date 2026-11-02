import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ratingScore, stars, ratingLabel, PRIOR } from '../../client/utils/ratings.js';
import { sortItems, filterItem, readFilters } from '../../client/utils/explore.js';

test('one 5-star rating does not beat many high ones; unrated sits at the average', () => {
    assert.equal(ratingScore(null, 0), PRIOR.mean);
    const one5 = ratingScore(5, 1);
    const forty46 = ratingScore(4.6, 40);
    assert.ok(forty46 > one5, `${forty46} > ${one5}`);
    assert.ok(one5 > PRIOR.mean);
    assert.ok(ratingScore(1, 1) < PRIOR.mean);
    assert.equal(Math.round(ratingScore(5, 5) * 100) / 100, 4.25);
});

test('stars and labels', () => {
    assert.equal(stars(4.4), '★★★★☆');
    assert.equal(stars(0), '☆☆☆☆☆');
    assert.equal(ratingLabel(4.25, 12), '4.3 from 12 ratings');
    assert.equal(ratingLabel(null, 0), 'No ratings yet');
});

test('Explore: top rated first by default, then unrated, then poorly rated', () => {
    const item = (id, average, count, grams) => filterItem({ id, name: id, category: 'Tent', weightMg: grams * 1000, rating: { average, count } });
    const items = [item('meh', 1, 3, 500), item('none', null, 0, 400), item('loved', 4.8, 20, 900), item('one5', 5, 1, 300)];
    assert.deepEqual(sortItems(items).map((i) => i.id), ['loved', 'one5', 'none', 'meh']);
    assert.deepEqual(sortItems(items, 'weight').map((i) => i.id), ['one5', 'none', 'meh', 'loved']);
    assert.equal(readFilters(new URLSearchParams('')).sort, 'rating');
});
