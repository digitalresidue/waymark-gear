import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { withReferral, outboundUrl } from '../../server/affiliate.js';
import { monthRange, recentMonths, summaryText } from '../../server/brand-report.js';

describe('referral tags on outbound links', () => {
    test('adds utm_source and utm_medium, keeping the link\'s own query', () => {
        assert.equal(withReferral('https://shop.example/tent?color=green', 'waymarkgear.com'),
            'https://shop.example/tent?color=green&utm_source=waymarkgear.com&utm_medium=referral');
        assert.equal(withReferral('https://shop.example/', 'waymarkgear.com'), 'https://shop.example/?utm_source=waymarkgear.com&utm_medium=referral');
    });
    test('never replaces tags the link already has', () => {
        const own = 'https://shop.example/tent?utm_source=newsletter&utm_campaign=fall';
        assert.equal(withReferral(own, 'waymarkgear.com'), own);
        assert.equal(withReferral('https://shop.example/?UTM_MEDIUM=x', 'w'), 'https://shop.example/?UTM_MEDIUM=x');
    });
    test('leaves affiliate links, non-web links and junk alone', () => {
        assert.equal(outboundUrl({ url: 'https://aff.example/c/1', affiliate: true }, { referralTags: true }), 'https://aff.example/c/1');
        assert.equal(withReferral('mailto:hi@example.com', 'w'), 'mailto:hi@example.com');
        assert.equal(withReferral('not a url', 'w'), 'not a url');
    });
    test('the owner can switch tagging off', () => {
        assert.equal(outboundUrl({ url: 'https://shop.example/', affiliate: false }, { referralTags: false }), 'https://shop.example/');
        assert.match(outboundUrl({ url: 'https://shop.example/', affiliate: false }, { referralTags: true }), /utm_medium=referral/);
    });
});

describe('brand report', () => {
    test('calendar months, defaulting to last month', () => {
        assert.deepEqual(monthRange('2026-10'), { month: '2026-10', from: '2026-10-01', to: '2026-11-01', label: 'October 2026' });
        assert.equal(monthRange('2026-12').to, '2027-01-01');
        assert.equal(monthRange('', new Date('2026-01-15T00:00:00Z')).month, '2025-12');
        assert.equal(monthRange('2026-13', new Date('2026-11-02T00:00:00Z')).month, '2026-10');
        assert.equal(recentMonths(3, new Date('2026-11-02T00:00:00Z')).map((m) => m.month).join(), '2026-11,2026-10,2026-09');
    });
    test('a summary a brand can read', () => {
        const period = monthRange('2026-10');
        const brand = {
            name: 'Ridgeline', total: 312, productVisits: 290, siteVisits: 22,
            items: [{ name: 'Ridge 40', clicks: 180 }, { name: 'Ridge 30', clicks: 90 }, { name: 'Hip belt', clicks: 20 }],
            sources: [{ label: 'shared gear lists', clicks: 200 }, { label: 'gear pages', clicks: 90 }, { label: 'other pages', clicks: 22 }],
        };
        assert.equal(summaryText(brand, period),
            "Waymark Gear sent Ridgeline 312 visitors in October 2026: 290 visits to product pages and 22 visits to Ridgeline's own site."
            + ' Most clicked: Ridge 40 (180), Ridge 30 (90) and Hip belt (20). Most came from shared gear lists and gear pages.');
        assert.equal(summaryText({ name: 'Quiet', total: 0 }, period), "Waymark Gear didn't send Quiet any visitors in October 2026.");
    });
});
