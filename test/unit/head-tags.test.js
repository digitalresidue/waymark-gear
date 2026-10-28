// Owner header tags: <meta> verification tags only, rebuilt and escaped.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { parseHeadTags, renderHeadTags, MAX_TAGS } from '../../server/head-tags.js';

describe('Header tags', () => {
    test('takes meta tags as networks hand them out, one per line', () => {
        const { tags, errors } = parseHeadTags(`<meta name='impact-site-verification' value='c4eca0bc-65f6-43e0-941f-c660435ef990'>

<meta name="google-site-verification" content="abc_123-XYZ" />
<META property=fb:app_id content=12345>`);
        assert.deepEqual(errors, []);
        assert.equal(renderHeadTags(tags), [
            '<meta name="impact-site-verification" value="c4eca0bc-65f6-43e0-941f-c660435ef990">',
            '<meta name="google-site-verification" content="abc_123-XYZ">',
            '<meta property="fb:app_id" content="12345">',
        ].join('\n'));
    });

    test('refuses anything that could run, redirect or break the page', () => {
        for (const bad of [
            '<script src="https://evil.example/x.js"></script>',
            '<meta http-equiv="refresh" content="0;url=https://evil.example">',
            '<meta name="x" content="y" onload="alert(1)">',
            '<meta name="x" content="y"><script>alert(1)</script>',
            '<link rel="stylesheet" href="x.css">',
            '<meta content="no name">',
            'just some text',
        ]) {
            assert.ok(parseHeadTags(bad).errors.length, bad);
        }
    });

    test('values are escaped when written back out', () => {
        const { tags } = parseHeadTags('<meta name="a" content=\'x"><script>\'>');
        assert.equal(renderHeadTags(tags), '<meta name="a" content="x&quot;&gt;&lt;script&gt;">');
    });

    test(`up to ${MAX_TAGS}`, () => {
        const many = Array.from({ length: MAX_TAGS + 1 }, (_, i) => `<meta name="v${i}" content="${i}">`).join('\n');
        assert.match(parseHeadTags(many).errors.join(' '), /Up to 10/);
        assert.deepEqual(parseHeadTags(many.split('\n').slice(0, MAX_TAGS).join('\n')).errors, []);
    });
});
