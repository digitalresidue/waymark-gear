// Translations in the app (Vue): $t('key', vars) in any template, and the
// language switch. The server already picked the language and put it on
// <html lang> (server/i18n.js); only that language's file is loaded.

import { reactive } from 'vue';

import en from '../../locales/en.json';
import { translator, matchLanguage, DEFAULT_LANGUAGE, LANGUAGE_COOKIE, languageInfo } from './i18n.js';
import { matchUnits, DEFAULT_UNITS, UNITS_COOKIE, unitFor } from './units.js';

const files = import.meta.glob('../../locales/*.json', { import: 'default' });

const state = reactive({
    t: translator(DEFAULT_LANGUAGE, en, en),
    // Imperial or metric: the server put it on <html data-units>.
    units: matchUnits(typeof document !== 'undefined' && document.documentElement.dataset.units) || DEFAULT_UNITS,
});

async function messagesFor(code) {
    if (code === DEFAULT_LANGUAGE) return en;
    const load = files[`../../locales/${code}.json`];
    try {
        return load ? await load() : {};
    } catch {
        return {};
    }
}

/** Load a language and use it everywhere, without a reload. */
export async function useLanguage(code) {
    const lang = matchLanguage(code) || DEFAULT_LANGUAGE;
    state.t = translator(lang, await messagesFor(lang), en);
    document.documentElement.lang = lang;
    if (languageInfo(lang).dir === 'rtl') document.documentElement.dir = 'rtl';
    else document.documentElement.removeAttribute('dir');
    return lang;
}

export function currentLanguage() {
    return state.t.locale;
}

export function t(key, vars, otherwise) {
    return state.t(key, vars, otherwise);
}

/** Pick a language: remembered (cookie, and the profile when signed in), then shown. */
export async function chooseLanguage(code) {
    const res = await fetch('/api/language', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ lang: code }),
    });
    if (!res.ok) throw new Error('Could not change the language.');
    return useLanguage(code);
}

/** Before mounting: the language the server chose for this page. */
export async function startLanguage() {
    return useLanguage(document.documentElement.lang || DEFAULT_LANGUAGE);
}

// A member's saved language follows them to a browser that hasn't got the
// cookie yet (it's set at sign-in; this covers a session from before).
export async function followAccountLanguage(account) {
    const saved = account && matchLanguage(account.language);
    if (!saved || saved === currentLanguage()) return;
    document.cookie = `${LANGUAGE_COOKIE}=${encodeURIComponent(saved)}; path=/; max-age=31536000; samesite=lax`;
    await useLanguage(saved);
}

// ---- units ----------------------------------------------------------------------------

export function currentUnits() {
    return state.units;
}

/** lb or kg: the unit for pack and list weights in the reader's system. */
export function bigWeightUnit() {
    return unitFor('weight', state.units, true);
}

function showUnits(system) {
    state.units = system;
    document.documentElement.dataset.units = system;
}

/**
 * Pick imperial or metric: remembered (cookie, and the profile when signed
 * in), then shown. `store`, when given, also switches the member's lists.
 */
export async function chooseUnits(system, store = null) {
    const units = matchUnits(system);
    if (!units) return state.units;
    const res = await fetch('/api/units', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ system: units }),
    });
    if (!res.ok) throw new Error('Could not change the units.');
    showUnits(units);
    if (store && store.state.library) store.commit('setUnitSystem', units);
    return units;
}

// A member's saved units follow them to a browser without the cookie.
export function followAccountUnits(account) {
    const saved = account && matchUnits(account.units);
    if (!saved || saved === state.units) return;
    document.cookie = `${UNITS_COOKIE}=${saved}; path=/; max-age=31536000; samesite=lax`;
    showUnits(saved);
}

export function installI18n(app) {
    // Reading state.t in a template makes the template follow language changes.
    app.config.globalProperties.$t = (key, vars, otherwise) => state.t(key, vars, otherwise);
    // ...and state.units, unit changes.
    app.config.globalProperties.$bigUnit = () => unitFor('weight', state.units, true);
}
