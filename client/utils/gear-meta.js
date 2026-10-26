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
