// Google Analytics is opt-in (GA_MEASUREMENT_ID) and the privacy page has to
// say the right thing either way.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { applyAnalyticsBlocks, analyticsId, analyticsMeta, analyticsCsp } from '../../server/analytics.js';
import { optedOut } from '../../client/utils/analytics.js';

const privacy = fs.readFileSync(new URL('../../PRIVACY.md', import.meta.url), 'utf8');

describe('Google Analytics', () => {
    test('off by default: no meta tag, nothing added to the security policy', () => {
        assert.equal(analyticsId(), '');
        assert.equal(analyticsMeta(), '');
        assert.deepEqual(analyticsCsp(), { scriptSrc: [], connectSrc: [] });
    });

    test('the privacy page tells the truth, on or off', () => {
        const blocks = privacy.match(/<!-- if analytics -->/g) || [];
        assert.ok(blocks.length >= 3);
        assert.equal((privacy.match(/<!-- end if -->/g) || []).length, blocks.length);
        const off = applyAnalyticsBlocks(privacy, false);
        const on = applyAnalyticsBlocks(privacy, true);
        for (const text of [off, on]) assert.doesNotMatch(text, /<!-- (if analytics|else|end if) -->/);
        assert.match(off, /We don't use Google Analytics/);
        assert.doesNotMatch(off, /_ga/);
        assert.doesNotMatch(on, /don't use Google Analytics/);
        assert.doesNotMatch(on, /no advertising, analytics, or tracking cookies/);
        assert.match(on, /<h3 id="analytics">Analytics<\/h3>/);
        assert.match(on, /Global Privacy Control/);
    });

    test('visitors who ask not to be tracked are skipped', () => {
        assert.equal(optedOut({ globalPrivacyControl: true }, {}), true);
        assert.equal(optedOut({ doNotTrack: '1' }, {}), true);
        assert.equal(optedOut({}, { doNotTrack: '1' }), true);
        assert.equal(optedOut({ doNotTrack: '0' }, {}), false);
        assert.equal(optedOut({}, {}), false);
    });
});
