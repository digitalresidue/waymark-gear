// Copying pasted image links: only public internet addresses are fetched.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { isPublicAddress, downloadImage, RemoteImageError } from '../../server/remote-image.js';

describe('Copying image links', () => {
    test('private, loopback and metadata addresses are not public', () => {
        for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1']) {
            assert.equal(isPublicAddress(ip), false, ip);
        }
        for (const ip of ['93.184.216.34', '8.8.8.8', '172.32.0.1', '2606:4700::6810:85e5', '::ffff:8.8.8.8']) {
            assert.equal(isPublicAddress(ip), true, ip);
        }
    });

    test('refused before anything is fetched', async () => {
        for (const [url, why] of [
            ['ftp://example.com/a.png', /http/],
            ['not a link', /web address/],
            ['http://127.0.0.1/a.png', /public internet/],
            ['http://169.254.169.254/latest/meta-data/', /public internet/],
            ['http://[::1]/a.png', /public internet/],
            ['http://user:pass@example.com/a.png', /username/],
            ['http://example.com:8080/a.png', /standard web ports/],
            ['http://localhost/a.png', /public internet/],
        ]) {
            await assert.rejects(downloadImage(url), (err) => err instanceof RemoteImageError && why.test(err.message), url);
        }
    });
});

describe('our own copies as full links and back', async () => {
    const config = (await import('config')).default;
    const { absoluteImageUrl, localImagePath } = await import('../../server/remote-image.js');
    const base = String(config.get('deployUrl')).replace(/\/+$/, '');
    const host = new URL(base).host;

    test('a copy shows as a full link on this site; other links are left alone', () => {
        assert.equal(absoluteImageUrl('/userimages/site/ab/cd.webp'), `${base}/userimages/site/ab/cd.webp`);
        assert.equal(absoluteImageUrl('https://example.com/a.jpg'), 'https://example.com/a.jpg');
        assert.equal(absoluteImageUrl(''), '');
    });

    test('a full link to a copy here, or its path, reads back as the path', () => {
        assert.equal(localImagePath(`${base}/userimages/site/ab/cd.webp`), '/userimages/site/ab/cd.webp');
        assert.equal(localImagePath(`https://www.${host}/userimages/site/ab/cd.webp?v=2`), '/userimages/site/ab/cd.webp');
        assert.equal(localImagePath('/userimages/site/ab/cd.webp'), '/userimages/site/ab/cd.webp');
        assert.equal(localImagePath('https://example.com/userimages/site/ab/cd.webp'), null, 'another site');
        assert.equal(localImagePath(`${base}/images/logo.png`), null, 'not a copy');
        assert.equal(localImagePath('javascript:alert(1)'), null);
    });
});
