// Profile links: turn "@handle", "handle" or a pasted link into a canonical
// https URL on the right site, or refuse it. Pure, so it's unit tested.

import { isSafeHref } from '../client/utils/markdown.js';
import { SEASONS, ACTIVITIES } from '../client/utils/gear-meta.js';

export const PROFILE_LIMITS = { displayName: 60, trailName: 40, bio: 4000, link: 300, featured: 3 };

// Profile tags: pick from common seasons and activities, plus a few of your own.
export { SEASONS, ACTIVITIES };

export function cleanTags(input = {}) {
    const pick = (list, allowed) => [...new Set((Array.isArray(list) ? list : []).map((t) => String(t).toLowerCase().trim()))]
        .filter((t) => allowed.includes(t));
    const custom = [...new Set((Array.isArray(input.custom) ? input.custom : [])
        .map((t) => String(t).replace(/[^\p{L}\p{N} '&+-]/gu, '').trim().slice(0, 24)).filter(Boolean))].slice(0, 5);
    return { seasons: pick(input.seasons, SEASONS), activities: pick(input.activities, ACTIVITIES), custom };
}

export class ProfileError extends Error {
    constructor(message, field) {
        super(message);
        this.field = field;
    }
}

export const NETWORKS = {
    youtube: { label: 'YouTube', hosts: ['youtube.com', 'm.youtube.com', 'youtu.be'], handle: (h) => `https://www.youtube.com/@${h}` },
    x: { label: 'X', hosts: ['x.com', 'twitter.com', 'mobile.twitter.com'], handle: (h) => `https://x.com/${h}` },
    instagram: { label: 'Instagram', hosts: ['instagram.com'], handle: (h) => `https://www.instagram.com/${h}` },
    website: { label: 'Website', hosts: null },
};

// "@trailname", "trailname", or a full link → a canonical https URL.
export function normalizeLink(network, value) {
    const v = String(value || '').trim().slice(0, PROFILE_LIMITS.link);
    if (!v) return '';
    const spec = NETWORKS[network];
    const handle = v.replace(/^@/, '');
    if (spec.handle && /^[A-Za-z0-9._-]{1,60}$/.test(handle) && !handle.includes('..') && !/\.(com|be)$/i.test(handle)) {
        return spec.handle(handle);
    }
    let url;
    try {
        url = new URL(/^[a-z]+:\/\//i.test(v) ? v : `https://${v}`);
    } catch {
        throw new ProfileError(`That ${spec.label} link doesn't look right.`, network);
    }
    if (!['http:', 'https:'].includes(url.protocol) || !isSafeHref(url.href)) {
        throw new ProfileError(`That ${spec.label} link doesn't look right.`, network);
    }
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (spec.hosts && !spec.hosts.includes(host)) {
        throw new ProfileError(`That link isn't on ${spec.label}.`, network);
    }
    url.protocol = 'https:';
    return url.href;
}

