// The Brands directory: what the owner can save, and how the page filters.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { cleanBrand, matchesBrand, slugify } from '../../server/brands.js';

describe('Brands', () => {
    test('a brand is cleaned up for saving', () => {
        const { row, error } = cleanBrand({
            name: '  Durston Gear ',
            description: 'Trekking-pole tents\n and packs.',
            url: 'https://durstongear.com',
            affiliateUrl: 'https://durston.sjv.io/c/1/2/3',
            cottage: true,
            gearTypes: ['shelter', 'packs', 'shelter'],
            logoUrl: '/userimages/ab/0123456789abcdef/fedcba9876543210_photo.webp',
            status: 'published',
        });
        assert.equal(error, undefined);
        assert.equal(row.name, 'Durston Gear');
        assert.equal(row.description, 'Trekking-pole tents and packs.');
        assert.deepEqual(row.gear_types, ['shelter', 'packs']);
        assert.equal(row.cottage, true);
        assert.equal(row.status, 'published');
    });

    test('bad input is refused with a reason', () => {
        assert.match(cleanBrand({}).error, /name/);
        assert.match(cleanBrand({ name: 'X', url: 'javascript:alert(1)' }).error, /http/);
        assert.match(cleanBrand({ name: 'X', affiliateUrl: 'https://aff.example/1' }).error, /own website/);
        assert.match(cleanBrand({ name: 'X', logoUrl: 'http://insecure.example/logo.png' }).error, /logo/);
        assert.match(cleanBrand({ name: 'X', gearTypes: ['spaceships'] }).error, /Unknown gear type/);
        assert.equal(cleanBrand({ name: 'X', status: 'whatever' }).row.status, 'draft');
    });

    test('filters: name, cottage, gear type, together', () => {
        const zpacks = { name: 'Zpacks', cottage: true, gear_types: ['shelter', 'packs'] };
        const big = { name: 'Big Agnes', cottage: false, gear_types: ['shelter', 'sleep'] };
        assert.equal(matchesBrand(zpacks, {}), true);
        assert.equal(matchesBrand(zpacks, { q: 'zpa' }), true);
        assert.equal(matchesBrand(big, { q: 'zpa' }), false);
        assert.equal(matchesBrand(big, { cottage: true }), false);
        assert.equal(matchesBrand(big, { type: 'sleep' }), true);
        assert.equal(matchesBrand(zpacks, { type: 'sleep' }), false);
        assert.equal(matchesBrand(zpacks, { cottage: true, type: 'packs', q: 'Z' }), true);
    });

    test('slugs', () => {
        assert.equal(slugify('Six Moon Designs'), 'six-moon-designs');
        assert.equal(slugify('Pa’lante Packs'), 'pa-lante-packs');
        assert.equal(slugify('Café & Co.'), 'cafe-and-co');
    });
});
