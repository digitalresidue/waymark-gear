import config from 'config';

import { logger } from './log.js';

// Google Analytics is off unless the site owner sets GA_MEASUREMENT_ID
// (waymark settings). The ID is all the server hands the page; the browser
// loads Google's script itself, late (client/utils/analytics.js).
const GA_ID = /^G-[A-Z0-9]{4,16}$/;

let warned = false;

export function analyticsId() {
    const raw = config.has('googleAnalyticsId') ? String(config.get('googleAnalyticsId') || '').trim().toUpperCase() : '';
    if (!raw) return '';
    if (GA_ID.test(raw)) return raw;
    if (!warned) {
        warned = true;
        logger.warn({ message: `GA_MEASUREMENT_ID "${raw}" doesn't look like a Google Analytics ID (G-XXXXXXXXXX); Analytics stays off.` });
    }
    return '';
}

// Read by client/utils/analytics.js.
export function analyticsMeta() {
    const id = analyticsId();
    return id ? `<meta name="wg-analytics" content="${id}">` : '';
}

// What the Content Security Policy has to allow for gtag.js, only when on.
export function analyticsCsp() {
    if (!analyticsId()) return { scriptSrc: [], connectSrc: [] };
    return {
        scriptSrc: ['https://www.googletagmanager.com'],
        connectSrc: ['https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://*.googletagmanager.com'],
    };
}

// The privacy page says what's true for this site: PRIVACY.md marks the
// passages that differ with
//   <!-- if analytics --> ...on... <!-- else --> ...off... <!-- end if -->
export function applyAnalyticsBlocks(markdown, on = Boolean(analyticsId())) {
    return markdown.replace(/<!-- if analytics -->([\s\S]*?)<!-- else -->([\s\S]*?)<!-- end if -->/g, (_m, yes, no) => (on ? yes : no).trim());
}
