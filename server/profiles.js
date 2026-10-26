// Public @profiles: who someone is, what they hike, and the lists they've
// chosen to publish. Only published lists ever appear (public_kits), and a
// profile can be hidden entirely.

import knex from './db.js';
import { kitsForUser } from './kits.js';
import { PROFILE_LIMITS, ProfileError, normalizeLink, NETWORKS } from './profile-links.js';
import { Library } from '../client/dataTypes.js';
import { loadLibrary } from './library-store.js';
import { thumbnailUrl } from './images.js';
import { forgetUserPages } from './page-cache.js';

export { PROFILE_LIMITS, ProfileError };

function text(value, max) {
    // Drop control characters (other than tab/newline) without a regex that
    // spells them out.
    const clean = Array.from(String(value ?? '')).filter((ch) => {
        const c = ch.charCodeAt(0);
        return c >= 0x20 || c === 0x09 || c === 0x0A || c === 0x0D;
    }).join('');
    return clean.trim().slice(0, max);
}

// Only our own uploads may be used as profile pictures: an outside URL would
// let a profile page load (and track viewers through) any third-party host.
function ownImage(value, kind) {
    const v = String(value || '').trim();
    if (!v) return '';
    if (!new RegExp(`^/userimages/[0-9a-f]{2}/[0-9a-f]{16}/[0-9a-f]{16}_${kind}\\.webp$`).test(v)) {
        throw new ProfileError('Upload the picture again.', kind);
    }
    return v;
}

function rowToProfile(user) {
    return {
        username: user.username,
        displayName: user.display_name || '',
        trailName: user.trail_name || '',
        bio: user.bio || '',
        avatarUrl: user.avatar_url || '',
        bannerUrl: user.banner_url || '',
        links: user.social_links || {},
        featured: Array.isArray(user.profile_featured) ? user.profile_featured : [],
        hidden: Boolean(user.profile_hidden),
        notifyEmail: user.notify_email !== false,
    };
}

export async function profileForEditing(user) {
    const fresh = await knex('users').where({ user_id: user.user_id }).first();
    return { ...rowToProfile(fresh), kits: await kitsForUser(user.user_id) };
}

export async function updateProfile(user, input = {}) {
    const links = {};
    for (const network of Object.keys(NETWORKS)) {
        const url = normalizeLink(network, input.links && input.links[network]);
        if (url) links[network] = url;
    }
    const published = new Set((await kitsForUser(user.user_id)).map((k) => k.externalId));
    const featured = [...new Set((Array.isArray(input.featured) ? input.featured : []).map(String))]
        .filter((id) => published.has(id)).slice(0, PROFILE_LIMITS.featured);

    const row = {
        display_name: text(input.displayName, PROFILE_LIMITS.displayName),
        trail_name: text(input.trailName, PROFILE_LIMITS.trailName),
        bio: String(input.bio ?? '').slice(0, PROFILE_LIMITS.bio),
        avatar_url: ownImage(input.avatarUrl, 'avatar'),
        banner_url: ownImage(input.bannerUrl, 'banner'),
        social_links: JSON.stringify(links),
        profile_featured: JSON.stringify(featured),
        profile_hidden: Boolean(input.hidden),
        notify_email: input.notifyEmail !== false,
    };
    await knex('users').where({ user_id: user.user_id }).update(row);
    forgetUserPages(user.user_id);
    return profileForEditing(user);
}

// Everything the public page shows. null when there's no such (visible) user.
export async function publicProfile(username) {
    const user = await knex('users').whereRaw('lower(username) = ?', [String(username).toLowerCase()]).first();
    if (!user || user.profile_hidden) return null;
    const profile = rowToProfile(user);
    const kits = await kitsForUser(user.user_id);
    const rank = new Map(profile.featured.map((id, i) => [id, i]));
    const featured = kits.filter((k) => rank.has(k.externalId)).sort((a, b) => rank.get(a.externalId) - rank.get(b.externalId));
    const others = kits.filter((k) => !rank.has(k.externalId));
    return { userId: user.user_id, profile, featured, others, kits };
}

// Gear grid: every distinct item across someone's published lists.
export async function publicGear(userId, publishedIds, limit = 200) {
    if (!publishedIds.length) return [];
    const serialized = await loadLibrary(userId);
    if (!serialized) return [];
    const library = new Library();
    library.load(serialized);
    const seen = new Map();
    const wanted = new Set(publishedIds);
    for (const list of library.lists) {
        if (!list.published || !wanted.has(list.externalId)) continue;
        for (const categoryId of list.categoryIds) {
            const category = library.getCategoryById(categoryId);
            if (!category) continue;
            for (const ci of category.categoryItems) {
                const item = library.getItemById(ci.itemId);
                if (!item || !item.name || seen.has(item.id)) continue;
                seen.set(item.id, {
                    name: item.name,
                    description: item.description || '',
                    weightMg: item.weight || 0,
                    unit: item.authorUnit,
                    category: category.name || '',
                    thumbUrl: thumbnailUrl(item.imageUrl || ''),
                    url: /^https?:\/\//i.test(item.url || '') ? item.url : '',
                });
                if (seen.size >= limit) return [...seen.values()];
            }
        }
    }
    return [...seen.values()];
}
