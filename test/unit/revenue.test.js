import crypto from 'node:crypto';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

const { applyRules, destination, cleanSettings } = await import('../../server/affiliate.js');
const { verifySignature, isSupporter } = await import('../../server/billing.js');

describe('affiliate links', () => {
    const rules = cleanSettings({ rules: [{ domain: 'https://www.amazon.com/', param: 'tag', value: 'wg-20' }, { domain: 'bad domain', param: 'x', value: 'y' }] }).rules;

    test('rules are cleaned and matched on the shop and its subdomains', () => {
        assert.deepEqual(rules, [{ domain: 'amazon.com', param: 'tag', value: 'wg-20' }]);
        assert.equal(applyRules('https://www.amazon.com/dp/B01?th=1', rules), 'https://www.amazon.com/dp/B01?th=1&tag=wg-20');
        assert.equal(applyRules('https://smile.amazon.com/x', rules), 'https://smile.amazon.com/x?tag=wg-20');
        assert.equal(applyRules('https://notamazon.com/x', rules), null);
        assert.equal(applyRules('javascript:alert(1)', rules), null);
    });

    test('an item link wins over rules; Supporters and "off" get the plain link', () => {
        const settings = { enabled: true, rules };
        const row = { url: 'https://www.amazon.com/dp/B01', affiliate_url: '' };
        assert.deepEqual(destination(row, settings, false), { url: 'https://www.amazon.com/dp/B01?tag=wg-20', affiliate: true });
        assert.deepEqual(destination({ ...row, affiliate_url: 'https://go.example.com/t?u=1' }, settings, false), { url: 'https://go.example.com/t?u=1', affiliate: true });
        assert.deepEqual(destination(row, settings, true), { url: row.url, affiliate: false });
        assert.deepEqual(destination(row, { ...settings, enabled: false }, false), { url: row.url, affiliate: false });
    });
});

describe('Stripe webhooks and the plan', () => {
    const secret = 'whsec_x';
    const body = '{"type":"x"}';
    const sign = (t, payload = body) => `t=${t},v1=${crypto.createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')}`;

    test('only correctly signed, recent events are accepted', () => {
        const now = Date.now();
        const t = Math.floor(now / 1000);
        assert.equal(verifySignature(body, sign(t), secret, now), true);
        assert.equal(verifySignature('{"type":"y"}', sign(t), secret, now), false);
        assert.equal(verifySignature(body, sign(t - 3600), secret, now), false);
        assert.equal(verifySignature(body, sign(t), '', now), false);
    });

    test('Supporter until the paid-up date, or for good', () => {
        assert.equal(isSupporter({ plan: 'supporter', plan_until: null }), true);
        assert.equal(isSupporter({ plan: 'supporter', plan_until: new Date(Date.now() - 1000) }), false);
        assert.equal(isSupporter({ plan: 'free' }), false);
        assert.equal(isSupporter(null), false);
    });
});
