import weightUtils from './weight.js';

// "8.4 lb", "21 oz", "540 g" — for public pages and cards where one unit is
// shown for a whole kit.
export function formatWeightMg(mg, unit = 'lb') {
    const value = weightUtils.MgToWeight(Number(mg) || 0, unit);
    let text;
    if (unit === 'g') text = String(Math.round(value));
    else if (unit === 'oz') text = value.toFixed(1).replace(/\.0$/, '');
    else text = value.toFixed(value < 10 ? 2 : 1);
    return `${text} ${unit}`;
}

// Fetch JSON from our own API. Throws with the server's message on failure.
export async function api(url, options = {}) {
    const response = await fetch(url, {
        credentials: 'same-origin',
        ...options,
        headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
    });
    let body;
    try {
        body = await response.json();
    } catch {
        body = null;
    }
    if (!response.ok) {
        const message = (body && (body.message || (body.errors && body.errors.join(' ')))) || `Request failed (${response.status})`;
        const err = new Error(message);
        err.status = response.status;
        err.body = body;
        throw err;
    }
    return body;
}

let configPromise = null;
// Site configuration from /api/config (is Google sign-in on, weight classes).
export function siteConfig() {
    if (!configPromise) {
        configPromise = api('/api/config').catch(() => ({ googleEnabled: false, weightClasses: [] }));
    }
    return configPromise;
}
