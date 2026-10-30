import { test } from 'node:test';
import assert from 'node:assert/strict';

import { spotlightWindow } from '../../server/kits.js';

test('the spotlight window: one pick per 12 hours, the same for everyone in it', () => {
    const h = 60 * 60 * 1000;
    const start = Date.UTC(2026, 9, 30, 12, 0, 0);
    const a = spotlightWindow(start);
    assert.equal(spotlightWindow(start + 11.9 * h).index, a.index);
    assert.equal(spotlightWindow(start + 12 * h).index, a.index + 1);
    assert.equal(a.endsAt.toISOString(), '2026-10-31T00:00:00.000Z');
    assert.equal(spotlightWindow(start, 24).endsAt.toISOString(), '2026-10-31T00:00:00.000Z');
});
