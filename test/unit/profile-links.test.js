import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeLink, ProfileError } from '../../server/profile-links.js';

describe('normalizeLink', () => {
    test('turns handles into links on the right site', () => {
        assert.equal(normalizeLink('x', '@trailmix'), 'https://x.com/trailmix');
        assert.equal(normalizeLink('instagram', 'trail.mix_'), 'https://www.instagram.com/trail.mix_');
        assert.equal(normalizeLink('youtube', '@HikeWithMe'), 'https://www.youtube.com/@HikeWithMe');
    });

    test('accepts pasted links and upgrades them to https', () => {
        assert.equal(normalizeLink('x', 'twitter.com/trailmix'), 'https://twitter.com/trailmix');
        assert.equal(normalizeLink('youtube', 'http://youtu.be/abc'), 'https://youtu.be/abc');
        assert.equal(normalizeLink('website', 'example.org/blog'), 'https://example.org/blog');
    });

    test('refuses links to the wrong site or unsafe schemes', () => {
        assert.throws(() => normalizeLink('instagram', 'https://evil.example/trailmix'), ProfileError);
        assert.throws(() => normalizeLink('website', 'javascript:alert(1)'), ProfileError);
        assert.throws(() => normalizeLink('x', 'https://x.com.evil.example/a'), ProfileError);
    });

    test('blank stays blank', () => {
        assert.equal(normalizeLink('website', '   '), '');
    });
});
