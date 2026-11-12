import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { limitsFor, usageFor, uploadRefusal, maxFileBytes } from '../../server/upload-limits.js';
import { userImageLocation } from '../../server/images.js';

const member = { user_id: `limits-test-${process.pid}`, plan: 'free' };
const supporter = { user_id: 'limits-test-s', plan: 'supporter', plan_until: null };

describe('upload limits', () => {
    test('the same for everyone today, Supporters included', () => {
        assert.deepEqual(limitsFor(member), { maxFileMb: 5, maxPhotos: 1000, maxStorageMb: 500 });
        assert.deepEqual(limitsFor(supporter), limitsFor(member));
        assert.equal(maxFileBytes(member), 5 * 1024 * 1024);
    });

    test('room until the photo count or the storage runs out', () => {
        assert.equal(uploadRefusal(member, { photos: 999, bytes: 0 }), null);
        assert.match(uploadRefusal(member, { photos: 1000, bytes: 0 }).message, /limit of 1,000 photos/);
        assert.equal(uploadRefusal(member, { photos: 1000, bytes: 0 }).status, 403);
        assert.match(uploadRefusal(member, { photos: 1, bytes: 500 * 1024 * 1024 }).message, /all 500 MB/);
    });

    const { dir } = userImageLocation(member.user_id);
    after(() => fs.rmSync(dir, { recursive: true, force: true }));
    test('usage counts photos (not their thumbnails) and every byte', () => {
        assert.deepEqual(usageFor(member.user_id), { photos: 0, bytes: 0 });
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'a.webp'), Buffer.alloc(100));
        fs.writeFileSync(path.join(dir, 'a_t.webp'), Buffer.alloc(10));
        fs.writeFileSync(path.join(dir, 'b_photo.webp'), Buffer.alloc(50));
        assert.deepEqual(usageFor(member.user_id), { photos: 2, bytes: 160 });
    });
});
