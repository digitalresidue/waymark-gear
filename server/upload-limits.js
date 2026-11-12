// How much each member can upload: photo size, how many photos, and total
// storage. The same for everyone today. Supporters have their own tier
// (uploads.supporter) so more room can become a Supporter perk later by
// changing config alone.
//
// Usage is what's in the member's image folder right now. Photos nothing
// uses any more are cleared out daily (server/image-gc.js), so removing a
// photo from your gear frees its room by the next day.

import fs from 'node:fs';
import path from 'node:path';

import config from 'config';
import express from 'express';

import { userImageLocation } from './images.js';
import { isSupporter } from './billing.js';
import { authenticateUser } from './auth.js';

const MB = 1024 * 1024;
const DEFAULTS = { maxFileMb: 5, maxPhotos: 1000, maxStorageMb: 500 };

function tier(cfg) {
    const n = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
    return {
        maxFileMb: n(cfg && cfg.maxFileMb, DEFAULTS.maxFileMb),
        maxPhotos: Math.round(n(cfg && cfg.maxPhotos, DEFAULTS.maxPhotos)),
        maxStorageMb: n(cfg && cfg.maxStorageMb, DEFAULTS.maxStorageMb),
    };
}

/** The limits that apply to this member. */
export function limitsFor(user) {
    const all = config.has('uploads') ? config.get('uploads') : {};
    const base = tier(all);
    if (isSupporter(user) && all.supporter) return { ...base, ...tier({ ...base, ...all.supporter }) };
    return base;
}

/** Largest single upload, in bytes, before it's converted. */
export const maxFileBytes = (user) => Math.round(limitsFor(user).maxFileMb * MB);

// A photo is its display file; thumbnails (_t) ride along with it.
const isPhoto = (name) => name.endsWith('.webp') && !name.endsWith('_t.webp') && !name.includes('.tmp-');

/** What a member has stored: { photos, bytes }. */
export function usageFor(userId) {
    const { dir } = userImageLocation(userId);
    let photos = 0;
    let bytes = 0;
    let names;
    try {
        names = fs.readdirSync(dir);
    } catch {
        return { photos: 0, bytes: 0 };
    }
    for (const name of names) {
        try {
            bytes += fs.statSync(path.join(dir, name)).size;
            if (isPhoto(name)) photos++;
        } catch {
            // Removed while we looked.
        }
    }
    return { photos, bytes };
}

/**
 * Room for one more photo? null when there is, else { status, message } to
 * send back.
 */
export function uploadRefusal(user, usage = usageFor(user.user_id)) {
    const limits = limitsFor(user);
    if (usage.photos >= limits.maxPhotos) {
        return { status: 403, message: `You've reached the limit of ${limits.maxPhotos.toLocaleString('en-US')} photos. Remove photos you no longer use; their room frees up within a day.` };
    }
    if (usage.bytes >= limits.maxStorageMb * MB) {
        return { status: 403, message: `You've used all ${limits.maxStorageMb.toLocaleString('en-US')} MB of photo storage. Remove photos you no longer use; their room frees up within a day.` };
    }
    return null;
}

export function tooLargeMessage(user) {
    return `Image is too large (${limitsFor(user).maxFileMb}MB max).`;
}

const router = express.Router();

// Your photo storage, for the account page.
router.get('/api/uploads/usage', (req, res) => authenticateUser(req, res, (req, res, user) => {
    res.set('Cache-Control', 'no-store');
    const usage = usageFor(user.user_id);
    const limits = limitsFor(user);
    res.json({ photos: usage.photos, storageMb: Math.round((usage.bytes / MB) * 10) / 10, limits });
}));

export default router;
