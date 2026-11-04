import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { matchLanguage, negotiate, pickLanguage, translator, tHtml, localizeMenu, LANGUAGES } from '../../client/utils/i18n.js';

const file = (code) => JSON.parse(fs.readFileSync(new URL(`../../locales/${code}.json`, import.meta.url), 'utf8'));

describe('choosing a language', () => {
    test('browser tags land on the languages we have', () => {
        assert.equal(matchLanguage('es-MX'), 'es');
        assert.equal(matchLanguage('pt'), 'pt-BR');
        assert.equal(matchLanguage('pt-PT'), 'pt-BR');
        assert.equal(matchLanguage('zh-Hans-CN'), 'zh-CN');
        assert.equal(matchLanguage('zh_cn'), 'zh-CN');
        assert.equal(matchLanguage('zh-TW'), null, 'Traditional Chinese is not Simplified');
        assert.equal(matchLanguage('zh-Hant'), null);
        assert.equal(matchLanguage('sv'), null);
        assert.equal(matchLanguage(''), null);
    });
    test('Accept-Language: highest weight we have wins', () => {
        assert.equal(negotiate('sv-SE,sv;q=0.9,de;q=0.8,en;q=0.5'), 'de');
        assert.equal(negotiate('en;q=0.4, ja;q=0.9'), 'ja');
        assert.equal(negotiate('fr-CA'), 'fr');
        assert.equal(negotiate('xx, yy;q=0.5'), null);
        assert.equal(negotiate(''), null);
    });
    test('a choice beats the browser; English when nothing matches', () => {
        assert.equal(pickLanguage({ chosen: 'ko', acceptLanguage: 'de' }), 'ko');
        assert.equal(pickLanguage({ chosen: 'nonsense', acceptLanguage: 'de' }), 'de');
        assert.equal(pickLanguage({ acceptLanguage: 'sv' }), 'en');
    });
});

describe('translating', () => {
    const en = file('en');
    test('placeholders, plurals by language, English fallback', () => {
        const es = translator('es', file('es'), en);
        assert.equal(es('nav.explore'), 'Explorar');
        assert.equal(es('explore.items', { count: 1 }), '1 artículo');
        assert.equal(es('explore.items', { count: 3 }), '3 artículos');
        assert.equal(es('explore.itemsOf', { shown: 2, total: 9 }), '2 de 9 artículos');
        const pl = translator('pl', file('pl'), en);
        assert.equal(pl('explore.items', { count: 1 }), '1 artykuł');
        assert.equal(pl('explore.items', { count: 3 }), '3 artykuły');
        assert.equal(pl('explore.items', { count: 5 }), '5 artykułów');
        assert.equal(pl('explore.items', { count: 22 }), '22 artykuły');
        const ja = translator('ja', file('ja'), en);
        assert.equal(ja('explore.items', { count: 1 }), '1件');
        // Missing from a language: English; missing everywhere: the fallback, then the key.
        const partial = translator('fr', { 'nav.explore': 'Explorer' }, en);
        assert.equal(partial('nav.kits'), 'Kits');
        assert.equal(partial('nope.key', {}, 'Fallback'), 'Fallback');
        assert.equal(partial('nope.key'), 'nope.key');
        // An empty value counts as untranslated.
        assert.equal(translator('fr', { 'nav.explore': '' }, en)('nav.explore'), 'Explore');
    });
    test('tHtml escapes the words and keeps the given HTML', () => {
        const t = translator('en', { 'x.y': 'Based on {project} & <friends>' }, {});
        assert.equal(tHtml(t, 'x.y', { project: '<a href="/x">X</a>' }), 'Based on <a href="/x">X</a> &amp; &lt;friends&gt;');
    });
    test('menus in the reader\'s language, English where a language has nothing', () => {
        const t = translator('de', { 'nav.explore': 'Entdecken', 'nav.gear.note': 'Katalog' }, {});
        const menu = localizeMenu([{ id: 'explore', label: 'Explore', items: [{ id: 'gear', label: 'Gear', note: 'Browse' }] }], t);
        assert.equal(menu[0].label, 'Entdecken');
        assert.equal(menu[0].items[0].label, 'Gear');
        assert.equal(menu[0].items[0].note, 'Katalog');
    });
    test('every language file is complete and keeps the English placeholders', () => {
        const keys = Object.keys(en).filter((k) => k !== '_meta');
        const vars = (v) => [...new Set((typeof v === 'string' ? [v] : Object.values(v)).flatMap((s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1])))].sort().join();
        for (const { code } of LANGUAGES.filter((l) => l.code !== 'en')) {
            const messages = file(code);
            for (const key of keys) {
                assert.ok(messages[key], `${code} ${key}`);
                assert.equal(vars(messages[key]), vars(en[key]), `${code} ${key}`);
            }
        }
    });
});
