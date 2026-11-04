#!/usr/bin/env node
// Translation tools (TRANSLATING.md).
//
//   npm run i18n:check              How complete each language is, and what's wrong.
//   npm run i18n:add -- sv Svenska  Start a new language: locales/sv.json with every
//                                   key empty (English shows until filled in), and
//                                   the language added to the picker.
//
// check fails (exit 1) on mistakes that would show up wrong on the site: a
// {placeholder} the English doesn't have or one it dropped, a missing plural
// form, a key the English file doesn't have, a key the code uses that
// en.json lacks, or a broken file. Untranslated keys are only reported: they
// show in English until someone fills them in.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..');
const LOCALES = path.join(ROOT, 'locales');
const REGISTRY = path.join(ROOT, 'client', 'utils', 'i18n.js');

const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const placeholders = (v) => {
    const texts = typeof v === 'string' ? [v] : Object.values(v || {});
    return new Set(texts.flatMap((t) => [...String(t).matchAll(/\{(\w+)\}/g)].map((m) => m[1])));
};
const same = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

async function registered() {
    const { LANGUAGES } = await import(REGISTRY);
    return LANGUAGES;
}

// Keys the code asks for: $t('x'), t('x'), {{#t}}x{{/t}}.
function usedKeys() {
    const found = new Map();
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (!['node_modules', 'dist', '.git'].includes(entry.name)) walk(p);
            } else if (/\.(vue|js|mustache)$/.test(entry.name)) {
                // Comments (examples in docs) don't count.
                const text = fs.readFileSync(p, 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
                for (const m of text.matchAll(/(?:\$t|\bt)\(\s*'([a-z][\w.-]*\.[\w.-]+)'/g)) found.set(m[1], p);
                for (const m of text.matchAll(/\{\{#t\}\}([\w.-]+)\{\{\/t\}\}/g)) found.set(m[1], p);
            }
        }
    };
    for (const dir of ['client', 'server', 'templates']) walk(path.join(ROOT, dir));
    return found;
}

async function check() {
    const languages = await registered();
    const en = read(path.join(LOCALES, 'en.json'));
    const keys = Object.keys(en).filter((k) => k !== '_meta');
    let errors = 0;
    const fail = (msg) => {
        errors++;
        console.log(`  ✗ ${msg}`);
    };

    console.log(`English: ${keys.length} keys\n`);
    for (const [key, file] of usedKeys()) {
        // Keys built at run time (nav.<id>, spec.<key>...) are checked by their files.
        if (!(key in en)) fail(`${path.relative(ROOT, file)} uses "${key}", which en.json doesn't have`);
    }

    for (const lang of languages.filter((l) => l.code !== 'en')) {
        const file = path.join(LOCALES, `${lang.code}.json`);
        if (!fs.existsSync(file)) {
            fail(`${lang.code}: no locales/${lang.code}.json`);
            continue;
        }
        let messages;
        try {
            messages = read(file);
        } catch (err) {
            fail(`${lang.code}: not valid JSON (${err.message})`);
            continue;
        }
        // The plural forms counts on the site actually use (0–1000): Spanish's
        // "many" is for millions, and falls back to "other".
        const rules = new Intl.PluralRules(lang.code);
        const plural = [...new Set(Array.from({ length: 1001 }, (_, n) => rules.select(n)))];
        const missing = [];
        for (const key of keys) {
            const value = messages[key];
            if (value === undefined || value === '' || (typeof value === 'object' && !Object.values(value).some(Boolean))) {
                missing.push(key);
                continue;
            }
            if (!same(placeholders(value), placeholders(en[key]))) {
                fail(`${lang.code} ${key}: placeholders {${[...placeholders(value)].join('}, {')}} should be {${[...placeholders(en[key])].join('}, {')}}`);
            }
            if (typeof en[key] === 'object') {
                if (typeof value !== 'object') fail(`${lang.code} ${key}: needs plural forms (${plural.join(', ')})`);
                else {
                    const need = plural.filter((c) => !value[c] && !(c === 'other' && value.one));
                    if (need.length) fail(`${lang.code} ${key}: missing plural form(s) ${need.join(', ')}`);
                }
            }
        }
        for (const key of Object.keys(messages)) {
            if (key !== '_meta' && !(key in en)) fail(`${lang.code} ${key}: not in en.json (renamed or removed?)`);
        }
        const done = keys.length - missing.length;
        const status = messages._meta && messages._meta.status ? ` (${messages._meta.status})` : '';
        console.log(`${lang.code.padEnd(6)} ${lang.name.padEnd(20)} ${String(Math.round((done / keys.length) * 100)).padStart(3)}%  ${done}/${keys.length}${status}`);
        if (missing.length && process.argv.includes('--missing')) {
            for (const key of missing) console.log(`         untranslated: ${key}`);
        }
    }
    console.log(errors ? `\n${errors} problem(s).` : '\nNo problems.');
    process.exitCode = errors ? 1 : 0;
}

async function add(code, name) {
    if (!code || !name || !/^[a-z]{2,3}(-[A-Z]{2}|-[A-Za-z]{4})?$/.test(code)) {
        console.log('Usage: npm run i18n:add -- <code> "<name in that language>"\n  e.g. npm run i18n:add -- sv Svenska');
        process.exitCode = 1;
        return;
    }
    const languages = await registered();
    const file = path.join(LOCALES, `${code}.json`);
    if (languages.some((l) => l.code === code) || fs.existsSync(file)) {
        console.log(`${code} is already set up.`);
        process.exitCode = 1;
        return;
    }
    const en = read(path.join(LOCALES, 'en.json'));
    const blank = { _meta: { name, status: 'Not translated yet.' } };
    for (const [key, value] of Object.entries(en)) {
        if (key === '_meta') continue;
        blank[key] = typeof value === 'object'
            ? Object.fromEntries([...new Set(Array.from({ length: 1001 }, (_, n) => new Intl.PluralRules(code).select(n)))].map((c) => [c, '']))
            : '';
    }
    fs.writeFileSync(file, `${JSON.stringify(blank, null, 2)}\n`);

    // Add it to the picker: a line in LANGUAGES, before its closing bracket.
    const source = fs.readFileSync(REGISTRY, 'utf8');
    const lower = code.toLowerCase();
    const match = [...new Set([lower, lower.split('-')[0]])].map((m) => `'${m}'`).join(', ');
    const line = `    { code: '${code}', name: '${name.replace(/'/g, "\\'")}', match: [${match}] },\n`;
    const updated = source.replace(/(export const LANGUAGES = \[\n(?:.*\n)*?)(\];)/, `$1${line}$2`);
    if (updated === source) throw new Error('Could not find LANGUAGES in client/utils/i18n.js');
    fs.writeFileSync(REGISTRY, updated);
    console.log(`Created locales/${code}.json and added ${name} to the language picker.`);
    console.log('Fill in the values (empty ones show in English), then run npm run i18n:check.');
}

const [command, ...args] = process.argv.slice(2);
if (command === 'check') await check();
else if (command === 'add') await add(args[0], args.slice(1).join(' '));
else {
    console.log('npm run i18n:check [-- --missing]\nnpm run i18n:add -- <code> "<name>"');
    process.exitCode = 1;
}
