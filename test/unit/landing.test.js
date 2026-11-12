import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { wantsApp, LANDING_FAQ, LANDING_CLASSES } from '../../server/landing.js';
import { usernameStem } from '../../server/usernames.js';
import { offerOpen, offerInfo } from '../../server/signup-offer.js';

describe('the homepage or the app at /', () => {
    const req = (cookies = {}, query = {}) => ({ cookies, query });
    test('a visitor gets the homepage, tracking parameters and all', () => {
        assert.equal(wantsApp(req()), false);
        assert.equal(wantsApp(req({}, { utm_source: 'reddit', gclid: 'x' })), false);
    });
    test('signed in, or lists kept in this browser: the app', () => {
        assert.equal(wantsApp(req({ lp: 'token' })), true);
        assert.equal(wantsApp(req({ lp_loggedin: '1' })), true);
        assert.equal(wantsApp(req({ wg_local: '1' })), true);
    });
    test('links that ask the app to do something open it', () => {
        for (const k of ['import', 'copy', 'start', 'welcome']) assert.equal(wantsApp(req({}, { [k]: '1' })), true, k);
    });
    test('every weight class and FAQ answer is there for search engines', () => {
        assert.deepEqual(LANDING_CLASSES.map((c) => c.id), ['sul', 'ul', 'lw', 'trad']);
        assert.ok(LANDING_FAQ.length >= 5);
        for (const f of LANDING_FAQ) assert.ok(f.q.endsWith('?') && f.a.length > 40, f.q);
    });
});

describe('usernames made from an email', () => {
    test('letters and digits from the part before the @', () => {
        assert.equal(usernameStem('Trail.Name+pct@example.com'), 'trailnamepct');
        assert.equal(usernameStem('a@example.com'), 'ahiker');
        assert.equal(usernameStem('@example.com', 'Sam'), 'sam');
        assert.equal(usernameStem('averyveryverylongemailaddressname@example.com').length, 24);
    });
});

describe('the one-time Supporter offer', () => {
    const soon = new Date(Date.now() + 60 * 60 * 1000);
    test('closed without Stripe and a coupon set up', () => {
        assert.equal(offerOpen({ signup_offer_until: soon }), false);
        assert.deepEqual(offerInfo({ signup_offer_until: soon }), { open: false });
    });
    test('closed for nobody, and for accounts made before it existed', () => {
        assert.equal(offerOpen(null), false);
        assert.equal(offerOpen({ signup_offer_until: null }), false);
    });
});
