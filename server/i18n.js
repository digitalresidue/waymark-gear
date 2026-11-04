// The reader's language for each request, and translations for pages the
// server renders. client/utils/i18n.js has the shared parts; /locales has
// the files.
//
// The language comes from the wg_lang cookie (set by the footer picker, the
// profile setting, and at sign-in from the profile), else the browser's
// Accept-Language, else English. It's kept in AsyncLocalStorage for the
// rest of the request, so renderPage, the page cache and anything else can
// ask for it without every route passing it along.

import fs from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';

import express from 'express';

import knex from './db.js';
import { optionalUser } from './auth.js';
import { LANGUAGES, DEFAULT_LANGUAGE, LANGUAGE_COOKIE, pickLanguage, translator, escapeHtml, languageInfo, matchLanguage } from '../client/utils/i18n.js';
import { UNITS_COOKIE, DEFAULT_UNITS, pickUnits, matchUnits } from '../client/utils/units.js';

export const LOCALES_DIR = path.join(import.meta.dirname, '..', 'locales');

function load(code) {
    try {
        const raw = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${code}.json`), 'utf8'));
        delete raw._meta;
        return raw;
    } catch {
        return {};
    }
}

const messages = new Map(LANGUAGES.map((l) => [l.code, load(l.code)]));
const english = messages.get(DEFAULT_LANGUAGE);
const translators = new Map(LANGUAGES.map((l) => [l.code, translator(l.code, messages.get(l.code), english)]));

export function translatorFor(code) {
    return translators.get(code) || translators.get(DEFAULT_LANGUAGE);
}

const store = new AsyncLocalStorage();

/** This request's language code ('en' outside a request). */
export function currentLanguage() {
    const s = store.getStore();
    return s ? s.lang : DEFAULT_LANGUAGE;
}

/** This request's unit system: 'imperial' or 'metric' (client/utils/units.js). */
export function currentUnits() {
    const s = store.getStore();
    return s ? s.units : DEFAULT_UNITS;
}

/** This request's translate function. */
export function currentT() {
    return translatorFor(currentLanguage());
}

export function languageFor(req) {
    return pickLanguage({
        chosen: req.cookies && req.cookies[LANGUAGE_COOKIE],
        acceptLanguage: req.get('accept-language'),
    });
}

export function unitsFor(req) {
    return pickUnits({ chosen: req.cookies && req.cookies[UNITS_COOKIE], acceptLanguage: req.get('accept-language') });
}

export function languageMiddleware(req, res, next) {
    const lang = languageFor(req);
    const units = unitsFor(req);
    res.locals.lang = lang;
    res.locals.units = units;
    // Pages differ by language: caches in between must key on what chose it.
    res.vary('Accept-Language');
    res.vary('Cookie');
    store.run({ lang, units }, next);
}

// Remember a choice for later visits (a year).
export function setLanguageCookie(res, code) {
    res.cookie(LANGUAGE_COOKIE, code, { path: '/', maxAge: 365 * 24 * 60 * 60 * 1000, sameSite: 'lax', httpOnly: false });
}

// Pages' <html> tag carries the language and its direction.
export function localizeHtml(html, lang = currentLanguage(), units = currentUnits()) {
    const { dir } = languageInfo(lang);
    // data-units: the page's scripts and the app show weights the same way.
    return html.replace(/<html class="lp" lang="en">/, `<html class="lp" lang="${lang}"${dir === 'rtl' ? ' dir="rtl"' : ''} data-units="${units}">`);
}

// For Mustache templates: {{#t}}nav.explore{{/t}} prints the translation,
// escaped. Keys with {placeholders} are filled in the model instead.
export function templateHelpers() {
    const t = currentT();
    return {
        t: () => (key) => escapeHtml(t(String(key).trim())),
        lang: t.locale,
        units: currentUnits(),
    };
}

// ---- choosing a language ---------------------------------------------------------

export const languageRouter = express.Router();

// Remember the choice: the cookie for this browser, the profile for every
// device the member signs in on.
async function choose(req, res, code) {
    setLanguageCookie(res, code);
    const user = await optionalUser(req);
    if (user) await knex('users').where({ user_id: user.user_id }).update({ language: code }).catch(() => {});
}

// Only back to a page on this site.
const safeNext = (next) => (typeof next === 'string' && /^\/(?!\/)/.test(next) ? next : null);

// The footer picker without JavaScript: /language?lang=fr&next=/explore
languageRouter.get('/language', async (req, res) => {
    const code = matchLanguage(req.query.lang);
    if (code) await choose(req, res, code);
    let back = safeNext(req.query.next);
    if (!back) {
        try {
            const ref = new URL(req.get('referer') || '');
            if (ref.host === req.get('host')) back = ref.pathname + ref.search;
        } catch {
            back = null;
        }
    }
    res.redirect(303, back || '/welcome');
});

// The picker with JavaScript, and the profile setting: { lang }.
languageRouter.post('/api/language', async (req, res) => {
    const code = matchLanguage(req.body && req.body.lang);
    if (!code) return res.status(400).json({ message: 'Unknown language.' });
    await choose(req, res, code);
    res.json({ lang: code });
});

// ---- choosing units ------------------------------------------------------------------

async function chooseUnits(req, res, system) {
    res.cookie(UNITS_COOKIE, system, { path: '/', maxAge: 365 * 24 * 60 * 60 * 1000, sameSite: 'lax' });
    const user = await optionalUser(req);
    if (user) await knex('users').where({ user_id: user.user_id }).update({ units: system }).catch(() => {});
}

// The footer picker without JavaScript: /units?system=metric
languageRouter.get('/units', async (req, res) => {
    const system = matchUnits(req.query.system);
    if (system) await chooseUnits(req, res, system);
    let back = safeNext(req.query.next);
    if (!back) {
        try {
            const ref = new URL(req.get('referer') || '');
            if (ref.host === req.get('host')) back = ref.pathname + ref.search;
        } catch {
            back = null;
        }
    }
    res.redirect(303, back || '/welcome');
});

languageRouter.post('/api/units', async (req, res) => {
    const system = matchUnits(req.body && req.body.system);
    if (!system) return res.status(400).json({ message: 'Pick imperial or metric.' });
    await chooseUnits(req, res, system);
    res.json({ units: system });
});
