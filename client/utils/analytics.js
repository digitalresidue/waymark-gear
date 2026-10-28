// Google Analytics, only when the site owner set GA_MEASUREMENT_ID (the
// server puts it in <meta name="wg-analytics">), kept out of the way of the
// page, and only with the consent the visitor's region requires.
//
// - Visitors who ask not to be tracked (Global Privacy Control or Do Not
//   Track) get no Analytics and no banner. This is also what the US state
//   privacy laws (California, Colorado, Connecticut, ...) ask for: they're
//   opt-out, and GPC is the opt-out signal.
// - Opt-in regions (EU/EEA, UK, Switzerland) see a cookie banner. Analytics
//   starts unticked; "Reject all" and "Accept all" are the same size and
//   weight. Nothing from Google loads until the visitor says yes.
// - Everyone else is counted, and can turn it off under "Cookie settings" in
//   the footer.
//
// The region comes from the browser's time zone: no lookup, no IP address,
// nothing sent anywhere. A zone we can't place (UTC, a VPN default) is treated
// as opt-in, so the mistake it can make is asking someone who needn't be asked.
//
// Consent Mode v2: ad storage and ad signals are always denied (Waymark shows
// no ads); analytics_storage follows the visitor's choice.

const GA_ID = /^G-[A-Z0-9]{4,16}$/;
const CHOICE_COOKIE = 'wg_consent';

export function optedOut(nav = navigator, win = window) {
    return Boolean(nav.globalPrivacyControl) || nav.doNotTrack === '1' || win.doNotTrack === '1';
}

// EU/EEA (with its outermost regions), UK, Switzerland and the micro-states
// that follow EU rules in practice. Europe/* is taken whole: the few zones in
// it outside these rules (Moscow, Istanbul, Kyiv, Minsk) only get asked.
const OPT_IN_ZONES = new Set([
    'Atlantic/Azores', 'Atlantic/Madeira', 'Atlantic/Canary', 'Atlantic/Reykjavik', 'Atlantic/Faroe',
    'Arctic/Longyearbyen', 'Asia/Nicosia', 'Asia/Famagusta',
    'America/Guadeloupe', 'America/Martinique', 'America/Cayenne', 'America/St_Barthelemy', 'America/Marigot',
    'Indian/Reunion', 'Indian/Mayotte',
    'GB', 'GB-Eire', 'Eire', 'Iceland', 'Poland', 'Portugal', 'WET', 'CET', 'MET', 'EET',
]);

export function needsConsent(zone) {
    const z = String(zone || '');
    if (!z || /^(UTC|UCT|GMT|Etc\/|Universal|Zulu)/.test(z)) return true;
    return z.startsWith('Europe/') || OPT_IN_ZONES.has(z);
}

function timeZone() {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    } catch {
        return '';
    }
}

// 'granted' | 'denied' | null (not asked yet). A first-party, functional
// cookie, so the choice holds on every page of the site.
export function readChoice(cookie = document.cookie) {
    const m = cookie.match(/(?:^|;\s*)wg_consent=(granted|denied)\b/);
    return m ? m[1] : null;
}

function saveChoice(choice) {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${CHOICE_COOKIE}=${choice}; Max-Age=${60 * 60 * 24 * 365}; Path=/; SameSite=Lax${secure}`;
}

// Google's own cookies, cleared when someone withdraws consent.
function clearGoogleCookies() {
    const host = window.location.hostname;
    const domains = ['', host, `.${host}`, `.${host.split('.').slice(-2).join('.')}`];
    document.cookie.split(';').map((c) => c.split('=')[0].trim()).filter((n) => /^_ga(_|$)|^_gid$/.test(n)).forEach((name) => {
        domains.forEach((d) => {
            document.cookie = `${name}=; Max-Age=0; Path=/${d ? `; Domain=${d}` : ''}`;
        });
    });
}

let measurementId = '';
let started = false;

function gtag() {
    window.dataLayer = window.dataLayer || [];
    // gtag.js reads the arguments object itself, not an array.
    window.dataLayer.push(arguments);
}

function start() {
    if (started) return;
    started = true;
    gtag('consent', 'update', { analytics_storage: 'granted' });
    gtag('js', new Date());
    gtag('config', measurementId, { allow_google_signals: false, allow_ad_personalization_signals: false });
    const load = () => {
        const s = document.createElement('script');
        s.async = true;
        s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
        document.head.appendChild(s);
    };
    const whenIdle = () => {
        if ('requestIdleCallback' in window) window.requestIdleCallback(load, { timeout: 5000 });
        else setTimeout(load, 2000);
    };
    if (document.readyState === 'complete') whenIdle();
    else window.addEventListener('load', whenIdle, { once: true });
}

function stop() {
    gtag('consent', 'update', { analytics_storage: 'denied' });
    // gtag.js honours the update above if it's loaded; this keeps it from
    // sending anything else on this page.
    if (measurementId) window[`ga-disable-${measurementId}`] = true;
    clearGoogleCookies();
}

function choose(choice) {
    saveChoice(choice);
    if (choice === 'granted') {
        if (measurementId) window[`ga-disable-${measurementId}`] = false;
        start();
    } else {
        stop();
    }
    closeBanner();
}

function closeBanner() {
    const el = document.getElementById('wgConsent');
    if (el) el.remove();
}

export function showBanner({ focus = false } = {}) {
    closeBanner();
    const current = readChoice();
    const box = document.createElement('section');
    box.id = 'wgConsent';
    box.className = 'wgConsent';
    box.setAttribute('role', 'region');
    box.setAttribute('aria-label', 'Cookie choices');
    box.dataset.testid = 'consent-banner';
    box.innerHTML = `
        <div class="wgConsentText">
            <p class="wgConsentTitle">Cookies on Waymark Gear</p>
            <p>We use a few cookies to keep you signed in. With your OK, we'd also use Google Analytics to see which pages get used; it sets its own cookies and never sees your lists or account. <a href="/privacy#analytics">How we use it</a></p>
        </div>
        <div class="wgConsentChoices">
            <label><input type="checkbox" checked disabled> Necessary <span>sign-in and settings</span></label>
            <label><input type="checkbox" data-consent-analytics data-testid="consent-analytics"${current === 'granted' ? ' checked' : ''}> Analytics <span>Google Analytics</span></label>
        </div>
        <div class="wgConsentButtons">
            <button type="button" class="wgConsentBtn" data-consent="denied" data-testid="consent-reject">Reject all</button>
            <button type="button" class="wgConsentBtn" data-consent="save" data-testid="consent-save">Save choices</button>
            <button type="button" class="wgConsentBtn" data-consent="granted" data-testid="consent-accept">Accept all</button>
        </div>`;
    box.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-consent]');
        if (!btn) return;
        const value = btn.dataset.consent === 'save'
            ? (box.querySelector('[data-consent-analytics]').checked ? 'granted' : 'denied')
            : btn.dataset.consent;
        choose(value);
    });
    document.body.appendChild(box);
    if (focus) box.querySelector('[data-consent-analytics]').focus();
}

export function initAnalytics() {
    try {
        const meta = document.querySelector('meta[name="wg-analytics"]');
        const id = meta && meta.getAttribute('content');
        if (!id || !GA_ID.test(id) || optedOut() || measurementId) return;
        measurementId = id;

        gtag('consent', 'default', {
            ad_storage: 'denied',
            ad_user_data: 'denied',
            ad_personalization: 'denied',
            analytics_storage: 'denied',
        });

        // "Cookie settings" links in the footers (hidden until now).
        document.documentElement.classList.add('wgHasAnalytics');
        document.addEventListener('click', (e) => {
            if (e.target.closest('[data-cookie-settings]')) showBanner({ focus: true });
        });

        const choice = readChoice();
        if (choice === 'granted') start();
        else if (choice === 'denied') window[`ga-disable-${id}`] = true;
        else if (needsConsent(timeZone())) {
            const ask = () => showBanner();
            if (document.body) ask();
            else document.addEventListener('DOMContentLoaded', ask, { once: true });
        } else start();
    } catch {
        // Analytics must never break the page.
    }
}
