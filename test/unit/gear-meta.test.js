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
