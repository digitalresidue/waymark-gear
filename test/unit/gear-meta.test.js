import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { youTubeId } from '../../client/utils/gear-meta.js';
import { cleanTags } from '../../server/profile-links.js';

describe('youTubeId', () => {
    test('reads the usual YouTube link shapes', () => {
        for (const link of [
            'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            'https://youtu.be/dQw4w9WgXcQ',
            'https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=30s',
            'https://www.youtube.com/shorts/dQw4w9WgXcQ',
            'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
        ]) assert.equal(youTubeId(link), 'dQw4w9WgXcQ', link);
    });

    test('refuses anything else', () => {
        for (const link of ['https://vimeo.com/123', 'javascript:alert(1)', 'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ', 'https://youtu.be/short', '']) {
            assert.equal(youTubeId(link), '', link);
        }
    });
});

describe('cleanTags', () => {
    test('keeps known seasons and activities and up to five custom tags', () => {
        const out = cleanTags({
            seasons: ['Winter', 'monsoon'],
            activities: ['thru-hiking', 'base jumping'],
            custom: ['AT 2024', '<script>', 'a', 'b', 'c', 'd', 'e'],
        });
        assert.deepEqual(out.seasons, ['winter']);
        assert.deepEqual(out.activities, ['thru-hiking']);
        assert.equal(out.custom.length, 5);
        assert.equal(out.custom[0], 'AT 2024');
        assert.equal(out.custom[1], 'script');
    });
});

describe('isNewShakedown', async () => {
    const { isNewShakedown } = await import('../../client/utils/gear-meta.js');
    test('new for 8 hours after the request, and only while it stands', () => {
        const now = Date.parse('2026-10-26T20:00:00Z');
        assert.equal(isNewShakedown({ shakedown: true, shakedownAt: '2026-10-26T13:00:00Z' }, now), true);
        assert.equal(isNewShakedown({ shakedown: true, shakedownAt: '2026-10-26T11:00:00Z' }, now), false);
        assert.equal(isNewShakedown({ shakedown: false, shakedownAt: '2026-10-26T19:00:00Z' }, now), false);
    });
});

describe('categoryKey', async () => {
    const { categoryKey } = await import('../../client/utils/gear-meta.js');
    test('spellings of one category match', () => {
        const one = ['Mid Layer', 'mid-layer', 'Midlayer', 'Mid Layers', ' MID  LAYER '].map(categoryKey);
        assert.equal(new Set(one).size, 1);
        assert.equal(categoryKey('Accessories'), categoryKey('Accessory'));
        assert.equal(categoryKey('Lights & Electronics'), categoryKey('Lights and electronics'));
        assert.equal(categoryKey('Shells'), categoryKey('Shell'));
    });
    test('different categories stay different', () => {
        assert.notEqual(categoryKey('Base Layer'), categoryKey('Mid Layer'));
        assert.notEqual(categoryKey('Sleep'), categoryKey('Shelter'));
        assert.equal(categoryKey('Gas'), 'gas');
        assert.equal(categoryKey(''), '');
    });
});

