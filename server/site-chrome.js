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
import { localizeMenu, LANGUAGES, escapeHtml, tHtml } from '../client/utils/i18n.js';
import { currentT, currentUnits, localizeHtml, templateHelpers } from './i18n.js';

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
    const t = currentT();
    return {
        menu: localizeMenu(MENU, t).map((e) => entry(e, current)),
        extras: localizeMenu(PHONE_EXTRAS, t).map((e) => entry(e, '')),
        cta: t('header.startList'),
        ctaShort: t('header.startList'),
        // The footer's language picker.
        languages: LANGUAGES.map((l) => ({ code: l.code, name: l.name, on: l.code === t.locale })),
        // ...and its units picker.
        unitSystems: ['imperial', 'metric'].map((id) => ({ id, label: t(`units.${id}`), on: id === currentUnits() })),
        contactEmail,
        sourceUrl,
        upstream,
        // "Based on LighterPack by …", with the project linked.
        basedOn: tHtml(t, 'footer.basedOn', {
            project: `<a href="${escapeHtml(upstream.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(upstream.name)}</a>`,
            author: escapeHtml(upstream.author),
        }),
        social: withIcons(socialLinks),
    };
}

// Render a full server page with the site header and footer. `pagePath`
// is the request path (marks the current section in the menu).
export function renderPage(template, model, partials = {}, pagePath = '') {
    const html = Mustache.render(template, { ...templateHelpers(), ...model, chrome: chromeModel(pagePath || model.path || '') }, { ...PARTIALS, ...partials });
    return localizeHtml(html);
}
