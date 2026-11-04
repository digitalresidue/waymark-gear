// Translations in the app (Vue): $t('key', vars) in any template, and the
// language switch. The server already picked the language and put it on
// <html lang> (server/i18n.js); only that language's file is loaded.

import { reactive } from 'vue';

import en from '../../locales/en.json';
import { translator, matchLanguage, DEFAULT_LANGUAGE, LANGUAGE_COOKIE, languageInfo } from './i18n.js';

const files = import.meta.glob('../../locales/*.json', { import: 'default' });

const state = reactive({ t: translator(DEFAULT_LANGUAGE, en, en) });

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

export function installI18n(app) {
    // Reading state.t in a template makes the template follow language changes.
    app.config.globalProperties.$t = (key, vars, otherwise) => state.t(key, vars, otherwise);
}
