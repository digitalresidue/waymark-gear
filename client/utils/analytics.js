// Google Analytics, only when the site owner set GA_MEASUREMENT_ID (the
// server puts it in <meta name="wg-analytics">), and kept out of the way of
// the page: Google's script is fetched after the page has finished loading,
// when the browser is idle, never before anything the visitor sees.
//
// Visitors who ask not to be tracked (Global Privacy Control or Do Not
// Track) get no Analytics at all. Page changes inside the app are counted by
// GA4's own history tracking ("enhanced measurement"), so there is nothing to
// call on navigation.

const GA_ID = /^G-[A-Z0-9]{4,16}$/;

export function optedOut(nav = navigator, win = window) {
    return Boolean(nav.globalPrivacyControl) || nav.doNotTrack === '1' || win.doNotTrack === '1';
}

export function initAnalytics() {
    try {
        const meta = document.querySelector('meta[name="wg-analytics"]');
        const id = meta && meta.getAttribute('content');
        if (!id || !GA_ID.test(id) || optedOut() || window.gtag) return;

        window.dataLayer = window.dataLayer || [];
        // gtag.js reads the arguments object itself, not an array.
        window.gtag = function gtag() {
            window.dataLayer.push(arguments);
        };
        window.gtag('js', new Date());
        window.gtag('config', id);

        const load = () => {
            const s = document.createElement('script');
            s.async = true;
            s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
            document.head.appendChild(s);
        };
        const whenIdle = () => {
            if ('requestIdleCallback' in window) window.requestIdleCallback(load, { timeout: 5000 });
            else setTimeout(load, 2000);
        };
        if (document.readyState === 'complete') whenIdle();
        else window.addEventListener('load', whenIdle, { once: true });
    } catch {
        // Analytics must never break the page.
    }
}
