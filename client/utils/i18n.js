// Translations: one JSON file per language in /locales (en.json is the
// source; the others follow its keys). Shared by the server, which renders
// pages in the reader's language, and the app.
//
// Keys are flat and namespaced ("nav.explore", "auth.signIn"). A value is a
// string with {placeholders}, or plural forms keyed by Intl.PluralRules
// category: { "one": "{count} item", "other": "{count} items" }. Anything a
// language hasn't translated yet falls back to English, so a partly done
// file is safe to ship.
//
// Adding a language: npm run i18n:add -- sv "Svenska" (TRANSLATING.md).

// Every language the site offers, in the picker's order. `dir: 'rtl'` for
// right-to-left scripts. `match` lists browser language tags that should land
// on this language ("pt" → Brazilian Portuguese).
export const LANGUAGES = [
    { code: 'en', name: 'English', match: ['en'] },
    { code: 'es', name: 'Español', match: ['es'] },
    { code: 'fr', name: 'Français', match: ['fr'] },
    { code: 'de', name: 'Deutsch', match: ['de'] },
    { code: 'pt-BR', name: 'Português (Brasil)', match: ['pt-br', 'pt'] },
    { code: 'it', name: 'Italiano', match: ['it'] },
    { code: 'ja', name: '日本語', match: ['ja'] },
    { code: 'zh-CN', name: '简体中文', match: ['zh-cn', 'zh-hans', 'zh-sg', 'zh'] },
    { code: 'ko', name: '한국어', match: ['ko'] },
    { code: 'nl', name: 'Nederlands', match: ['nl'] },
    { code: 'pl', name: 'Polski', match: ['pl'] },
];

export const DEFAULT_LANGUAGE = 'en';
export const LANGUAGE_COOKIE = 'wg_lang';
const CODES = new Map(LANGUAGES.map((l) => [l.code.toLowerCase(), l.code]));

/** A language we offer for a tag ("es-MX" → "es", "zh-Hant-TW" → null), or null. */
export function matchLanguage(tag) {
    const t = String(tag || '').trim().toLowerCase().replace(/_/g, '-');
    if (!t) return null;
    if (CODES.has(t)) return CODES.get(t);
    // Most specific first: "zh-hans-cn" tries zh-hans-cn, zh-hans, zh.
    const parts = t.split('-');
    for (let n = parts.length; n > 0; n--) {
        const prefix = parts.slice(0, n).join('-');
        const hit = LANGUAGES.find((l) => l.match.includes(prefix));
        if (hit) {
            // Traditional Chinese isn't Simplified: don't hand it zh-CN.
            if (hit.code === 'zh-CN' && /^zh-(hant|tw|hk|mo)/.test(t)) return null;
            return hit.code;
        }
    }
    return null;
}

/** The best language for an Accept-Language header, or null. */
export function negotiate(header) {
    const wanted = String(header || '').split(',').map((part, i) => {
        const [tag, ...params] = part.trim().split(';');
        const q = params.map((p) => /^\s*q=([0-9.]+)/.exec(p)).find(Boolean);
        return { tag, q: q ? Number(q[1]) : 1, i };
    }).filter((w) => w.tag && w.q > 0).sort((a, b) => b.q - a.q || a.i - b.i);
    for (const w of wanted) {
        const hit = matchLanguage(w.tag);
        if (hit) return hit;
    }
    return null;
}

/** The reader's language: their choice (profile or picker), else their browser's, else English. */
export function pickLanguage({ chosen, acceptLanguage } = {}) {
    return matchLanguage(chosen) || negotiate(acceptLanguage) || DEFAULT_LANGUAGE;
}

export function languageInfo(code) {
    return LANGUAGES.find((l) => l.code === code) || LANGUAGES[0];
}

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

/**
 * A translate function for one language.
 *   t('nav.explore')                      → "Explorar"
 *   t('explore.items', { count: 3 })      → "3 artículos" (plural form by count)
 *   t('missing.key', {}, 'Fallback text') → the fallback when no file has it
 * `messages` is the language's file; `fallback` is English.
 */
export function translator(locale, messages = {}, fallback = {}) {
    const rules = new Intl.PluralRules(locale);
    const fill = (text, vars) => String(text).replace(/\{(\w+)\}/g, (m, name) => (vars && vars[name] !== undefined && vars[name] !== null ? String(vars[name]) : m));
    const pick = (value, vars) => {
        if (value && typeof value === 'object') {
            const count = Number(vars && vars.count);
            return value[rules.select(Number.isFinite(count) ? count : 0)] ?? value.other ?? value.one ?? '';
        }
        return value;
    };
    const has = (v) => v !== undefined && v !== null && v !== '';
    const t = (key, vars = {}, otherwise) => {
        let value = pick(messages[key], vars);
        if (!has(value)) value = pick(fallback[key], vars);
        if (!has(value)) value = otherwise !== undefined ? otherwise : key;
        return fill(value, vars);
    };
    // The untranslated value (with its plural forms), for handing to the browser.
    t.raw = (key) => messages[key] ?? fallback[key];
    t.locale = locale;
    t.dir = languageInfo(locale).dir || 'ltr';
    return t;
}

/**
 * A translation as HTML with some parts already HTML (a link): the
 * translated words are escaped, then `html` values fill their {placeholders}.
 *   tHtml(t, 'footer.basedOn', { project: '<a href="…">LighterPack</a>', author: 'Galen Maly' })
 */
export function tHtml(t, key, html = {}) {
    return escapeHtml(t(key)).replace(/\{(\w+)\}/g, (m, name) => (html[name] !== undefined ? html[name] : m));
}

// Menu entries in the reader's language: label from nav.<id>, note from
// nav.<id>.note, English (client/nav.js) when a language doesn't say.
export function localizeMenu(entries, t) {
    return entries.map((e) => ({
        ...e,
        label: t(`nav.${e.id}`, {}, e.label),
        ...(e.note ? { note: t(`nav.${e.id}.note`, {}, e.note) } : {}),
        ...(e.items ? { items: localizeMenu(e.items, t) } : {}),
    }));
}
