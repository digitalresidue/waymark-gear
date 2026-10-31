import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Behind Cloudflare the app must see visitors' own addresses (per-IP limits)
// and nobody else may supply one: Caddy trusts exactly Cloudflare's ranges,
// and the app counts two proxies (Cloudflare, Caddy). See deploy/Caddyfile.
const CLOUDFLARE = [
    '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18',
    '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17',
    '162.158.0.0/15', '104.16.0.0/13', '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
    '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32',
    '2a06:98c0::/29', '2c0f:f248::/32',
];

test('Caddy trusts Cloudflare, and only Cloudflare, for forwarded addresses', () => {
    const caddy = fs.readFileSync(new URL('../../deploy/Caddyfile', import.meta.url), 'utf8');
    const line = caddy.split('\n').find((l) => l.trim().startsWith('trusted_proxies'));
    assert.ok(line, 'a trusted_proxies line');
    const ranges = line.trim().split(/\s+/).slice(2);
    assert.equal(line.trim().split(/\s+/)[1], 'static');
    assert.deepEqual([...ranges].sort(), [...CLOUDFLARE].sort());
    assert.ok(!/private_ranges|0\.0\.0\.0\/0/.test(line), 'never everyone');
});

test('the production app counts Cloudflare and Caddy', () => {
    const compose = fs.readFileSync(new URL('../../deploy/docker-compose.prod.yml', import.meta.url), 'utf8');
    assert.match(compose, /TRUST_PROXY: 2\b/);
});
