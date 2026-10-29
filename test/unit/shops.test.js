// Where to buy: shops besides an item's product link (server/shops.js).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { parseShops, buyOptions, publicShops, MAX_SHOPS, SHOP_CSV_COLUMNS } from '../../server/shops.js';
import { validateEntry, CSV_COLUMNS } from '../../server/catalog.js';

describe('Where to buy', () => {
    test('the sheet has name, badge, link, affiliate link for each shop, in that order', () => {
        assert.equal(MAX_SHOPS, 4);
        assert.deepEqual(SHOP_CSV_COLUMNS.slice(0, 4), ['shop1_name', 'shop1_badge', 'shop1_url', 'shop1_affiliate_url']);
        assert.ok(CSV_COLUMNS.includes('shop4_affiliate_url'));
    });

    test('shops from a sheet row; blank ones skipped; badges kept apart', () => {
        const { shops, badges, errors } = parseShops({
            shop1_name: 'Backcountry', shop1_badge: 'https://bc.example/logo.png', shop1_url: 'https://www.backcountry.com/p/1', shop1_affiliate_url: 'https://bc.sjv.io/c/1',
            shop2_name: '', shop2_badge: '', shop2_url: '', shop2_affiliate_url: '',
            shop3_url: 'https://garagegrowngear.com/p/2',
        }, 'https://brand.example/tent');
        assert.deepEqual(errors, []);
        assert.deepEqual(shops, [
            { name: 'Backcountry', domain: 'backcountry.com', url: 'https://www.backcountry.com/p/1', affiliate_url: 'https://bc.sjv.io/c/1' },
            { name: '', domain: 'garagegrowngear.com', url: 'https://garagegrowngear.com/p/2', affiliate_url: '' },
        ]);
        assert.deepEqual(badges, [{ domain: 'backcountry.com', name: 'Backcountry', badge: 'https://bc.example/logo.png' }]);
    });

    test('a sheet without shop columns leaves an item\'s shops alone', () => {
        assert.equal(parseShops({ name: 'X' }).shops, undefined);
        assert.equal(validateEntry({ name: 'X', weight: '1' }).value.shops, undefined);
    });

    test('mistakes are reported', () => {
        assert.match(parseShops({ shops: [{ affiliateUrl: 'https://aff.example/1' }] }).errors.join(), /normal link/);
        assert.match(parseShops({ shops: [{ url: 'ftp://x' }] }).errors.join(), /http/);
        assert.match(parseShops({ shops: [{ url: 'https://brand.example/other' }] }, 'https://brand.example/tent').errors.join(), /already listed/);
        assert.match(parseShops({ shops: [{ url: 'https://a.example/1', badge: 'javascript:x' }] }).errors.join(), /badge/);
    });

    test('the menu: product link first, then shops, with badges or initials; no affiliate links in public', () => {
        const badges = new Map([['backcountry.com', { name: 'Backcountry', badgeUrl: '/userimages/aa/0123456789abcdef/0123456789abcdef.webp' }]]);
        const options = buyOptions({ url: 'https://brand.example/tent', brand: 'Trailco', shops: [{ name: '', domain: 'backcountry.com', url: 'u' }, { name: 'GGG', domain: 'garagegrowngear.com', url: 'v' }] }, badges);
        assert.deepEqual(options.map((o) => [o.index, o.name, o.badgeUrl ? 'badge' : o.initial]), [[0, 'Trailco', 'T'], [1, 'Backcountry', 'badge'], [2, 'GGG', 'G']]);
        assert.deepEqual(publicShops([{ name: 'A', domain: 'a', url: 'u', affiliateUrl: 'secret' }]), [{ name: 'A', domain: 'a', url: 'u' }]);
    });
});
