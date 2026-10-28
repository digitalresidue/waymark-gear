// Shared by the browser and the server.

// What kind of trip a list is for. Explore filters and leaderboards use it.
export const TRIP_TYPES = ['dayhike', 'backpacking', 'section', 'thru'];
export const TRIP_TYPE_LABELS = {
    dayhike: 'Day hike',
    backpacking: 'Backpacking',
    section: 'Section hike',
    thru: 'Thru-hike',
};

// The 11-character video id from a YouTube link, or '' if it isn't one.
export function youTubeId(link) {
    let url;
    try {
        url = new URL(String(link || '').trim());
    } catch {
        return '';
    }
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    const host = url.hostname.toLowerCase().replace(/^(www\.|m\.)/, '');
    let id = '';
    if (host === 'youtu.be') id = url.pathname.slice(1);
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
        if (url.pathname === '/watch') id = url.searchParams.get('v') || '';
        else {
            const m = url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/);
            id = m ? m[1] : '';
        }
    }
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : '';
}

// Profile tags.
export const SEASONS = ['spring', 'summer', 'fall', 'winter'];
export const ACTIVITIES = ['day hiking', 'backpacking', 'section hiking', 'thru-hiking', 'trail running', 'bikepacking', 'packrafting', 'mountaineering', 'ski touring', 'fastpacking'];

// A shakedown asked for in the last 8 hours gets a "New" banner.
export const NEW_SHAKEDOWN_MS = 8 * 60 * 60 * 1000;
export function isNewShakedown(kit, now = Date.now()) {
    if (!kit || !kit.shakedown || !kit.shakedownAt) return false;
    const at = new Date(kit.shakedownAt).getTime();
    return Number.isFinite(at) && now - at < NEW_SHAKEDOWN_MS && now >= at - 60000;
}

export function hoursAgo(when, now = Date.now()) {
    const h = Math.floor((now - new Date(when).getTime()) / 3600000);
    return h < 1 ? 'just now' : `${h}h ago`;
}

// Gear lifecycle.
export const CONDITIONS = ['new', 'good', 'worn', 'replace'];
export const CONDITION_LABELS = { new: 'Like new', good: 'Good', worn: 'Well used', replace: 'Needs replacing' };

// "Replace soon" when you've said so, or it's past its expected life.
export function replaceSoon(item, now = new Date()) {
    if (!item) return false;
    if (item.condition === 'replace') return true;
    if (!item.purchasedOn || !item.lifeYears) return false;
    const [y, m] = item.purchasedOn.split('-').map(Number);
    const ageYears = (now.getFullYear() - y) + (now.getMonth() + 1 - m) / 12;
    return ageYears >= item.lifeYears;
}

export function gearAge(item, now = new Date()) {
    if (!item || !item.purchasedOn) return '';
    const [y, m] = item.purchasedOn.split('-').map(Number);
    const months = (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);
    if (months < 1) return 'new this month';
    if (months < 12) return `${months} ${months === 1 ? 'month' : 'months'} old`;
    const years = Math.floor(months / 12);
    return `${years} ${years === 1 ? 'year' : 'years'} old`;
}
