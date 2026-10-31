import { test } from 'node:test';
import assert from 'node:assert/strict';

import { socialLinks } from '../../client/brand.js';
import { withIcons, SOCIAL_ICONS } from '../../client/social-icons.js';

test('every footer social link has a drawing and an https address', () => {
    const shown = withIcons(socialLinks);
    assert.equal(shown.length, socialLinks.length);
    for (const l of shown) {
        assert.ok(l.svg.startsWith('<svg') && l.svg.includes('aria-hidden="true"'), l.name);
        assert.ok(l.label.includes(l.name), l.name);
    }
});

test('links without a known drawing or https are left out', () => {
    assert.deepEqual(withIcons([{ icon: 'nope', url: 'https://x.example' }, { icon: 'youtube', url: 'javascript:alert(1)' }]), []);
    assert.ok(Object.keys(SOCIAL_ICONS).includes('instagram'));
});
