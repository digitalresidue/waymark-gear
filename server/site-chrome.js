// The site header and footer for pages the server renders (Trails, shared
// lists, profiles, gear pages, trips, compare). Same menu as the app
// (client/nav.js) and the same styles (css/components/_site-chrome.scss).
//
// These pages are cached and shared between everyone, so nothing here
// depends on who's looking: entries only some people see are rendered
// `hidden`, and client/social.js shows them once it knows the viewer
// (GET /api/viewer).

import fs from 'node:fs';
import path from 'node:path';
import Mustache from 'mustache';
import { MENU, PHONE_EXTRAS, activeFor } from '../client/nav.js';
import { contactEmail, sourceUrl, upstream, socialLinks } from '../client/brand.js';
import { withIcons } from '../client/social-icons.js';

const partial = (name) => fs.readFileSync(path.join(import.meta.dirname, `../templates/${name}.mustache`), 'utf8');
const PARTIALS = { siteHeader: partial('t_siteHeader'), siteFooter: partial('t_siteFooter') };

// Shown to everyone until the viewer is known; the rest start hidden.
const UNGATED = new Set(['all', 'guest', undefined]);

function entry(e, current) {
    const show = e.show || 'all';
    const out = { id: e.id, label: e.label, href: e.href, note: e.note || '', show, gated: !UNGATED.has(e.show), testid: e.testid || `nav-${e.id}` };
    if (e.items) {
        out.isGroup = true;
        out.items = e.items.map((i) => entry(i, ''));
    }
    out.active = Boolean(current) && current === e.id;
    return out;
}

// The `chrome` part of a page's model. `path` marks the current section.
export function chromeModel(path) {
    const current = activeFor(path);
    return {
        menu: MENU.map((e) => entry(e, current)),
        extras: PHONE_EXTRAS.map((e) => entry(e, '')),
        cta: 'Start a list',
        ctaShort: 'Start a list',
        contactEmail,
        sourceUrl,
        upstream,
        social: withIcons(socialLinks),
    };
}

// Render a full server page with the site header and footer. `pagePath`
// is the request path (marks the current section in the menu).
export function renderPage(template, model, partials = {}, pagePath = '') {
    return Mustache.render(template, { ...model, chrome: chromeModel(pagePath || model.path || '') }, { ...PARTIALS, ...partials });
}
