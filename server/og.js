// Link-preview images (Open Graph / X cards), drawn on our own server: no
// third-party image service and nothing tied to a hosting platform.
//
// satori lays out a small element tree and turns text into vector paths
// (fonts are read from the @fontsource packages); resvg rasterizes the SVG
// to a 1200×630 PNG. Rendered images are kept in a small in-memory cache
// keyed by everything they show, so a popular link is drawn once.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

import { formatWeightMg } from '../client/utils/format.js';

const require = createRequire(import.meta.url);
const W = 1200;
const H = 630;
const CACHE_MAX = 300;

const fontFile = (pkg, file) => fs.readFileSync(path.join(path.dirname(require.resolve(`${pkg}/package.json`)), 'files', file));
const fonts = [
    { name: 'Archivo', data: fontFile('@fontsource/archivo', 'archivo-latin-800-normal.woff'), weight: 800, style: 'normal' },
    { name: 'Geist', data: fontFile('@fontsource/geist', 'geist-latin-500-normal.woff'), weight: 500, style: 'normal' },
    { name: 'Geist', data: fontFile('@fontsource/geist', 'geist-latin-700-normal.woff'), weight: 700, style: 'normal' },
];

const publicDir = path.join(import.meta.dirname, '..', 'public');
const logo = `data:image/png;base64,${fs.readFileSync(path.join(publicDir, 'images', 'waymark-logo-light.png')).toString('base64')}`;

const FOREST = '#1D3B30';
const CREAM = '#F5F2E8';
const MUTED = '#B9C7BD';
const ORANGE = '#B04E1B';
const BAR_COLORS = ['#7FB08F', '#E39B5C', '#8CB3D1', '#D9C26B', '#B58BC4', '#6FA8A0', '#D98080', '#A7A7A7'];

// A tiny hyperscript for satori's element objects. Every box with more than
// one child must be display:flex for satori to lay it out.
function h(type, style, ...children) {
    const kids = children.flat().filter((c) => c !== null && c !== undefined && c !== false);
    return { type, props: { style: { display: 'flex', ...style }, children: kids.length === 1 ? kids[0] : kids } };
}

function clip(text, max) {
    const t = String(text || '').trim();
    return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

// Satori adds padding outside a box's size, so the content sits in an
// explicitly sized inner box instead.
const PAD_X = 64;
const PAD_Y = 56;
function frame(...children) {
    return h('div', {
        width: W,
        height: H,
        position: 'relative',
        background: `linear-gradient(160deg, ${FOREST} 0%, #24493B 55%, #2F5A47 100%)`,
        color: CREAM,
        fontFamily: 'Geist',
    },
    h('div', {
        position: 'absolute', left: 0, top: H - 150, width: W, height: 150,
        background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.18) 100%)',
    }),
    h('div', {
        position: 'absolute',
        left: PAD_X,
        top: PAD_Y,
        width: W - PAD_X * 2,
        height: H - PAD_Y * 2,
        flexDirection: 'column',
        justifyContent: 'space-between',
    }, ...children));
}

const chip = (text, background = 'rgba(255,255,255,0.12)', color = CREAM) => h('div', {
    padding: '8px 18px', borderRadius: 999, background, color, fontSize: 24, fontWeight: 700, flexShrink: 0,
}, text);

const logoEl = () => ({ type: 'img', props: { src: logo, width: 330, height: 50, style: { display: 'flex' } } });

function listTree(list) {
    const total = list.categories.reduce((s, c) => s + Math.max(0, c.weightMg), 0) || 1;
    const bars = list.categories.filter((c) => c.weightMg > 0).slice(0, 8);
    return frame(
        h('div', { justifyContent: 'space-between', alignItems: 'center' },
            logoEl(),
            list.shakedown ? chip('Shakedown requested', ORANGE, '#fff') : null),
        h('div', { flexDirection: 'column' },
            h('div', { fontFamily: 'Archivo', fontSize: list.name.length > 30 ? 52 : 64, fontWeight: 800, lineHeight: 1.05, maxWidth: W - PAD_X * 2 }, clip(list.name || 'Gear list', 60)),
            list.description ? h('div', { fontSize: 26, color: MUTED, marginTop: 12, lineHeight: 1.3, maxWidth: W - PAD_X * 2 }, clip(list.description, 120)) : null,
            h('div', { alignItems: 'baseline', marginTop: list.description ? 10 : 18 },
                h('div', { fontSize: list.description ? 88 : 104, fontWeight: 700, letterSpacing: -2 }, list.baseWeight),
                h('div', { fontSize: 30, color: MUTED, marginLeft: 20, fontWeight: 500 }, 'base weight'))),
        h('div', { flexDirection: 'column' },
            bars.length ? h('div', { height: 18, borderRadius: 9, overflow: 'hidden', marginBottom: 24, width: W - PAD_X * 2 },
                bars.map((c, i) => h('div', { width: `${(c.weightMg / total) * 100}%`, height: 18, background: BAR_COLORS[i % BAR_COLORS.length] }))) : null,
            h('div', { alignItems: 'center', justifyContent: 'space-between' },
                h('div', { alignItems: 'center' },
                    list.avatarData
                        ? { type: 'img', props: { src: list.avatarData, width: 48, height: 48, style: { display: 'flex', borderRadius: 999, marginRight: 14, border: `2px solid ${CREAM}` } } }
                        : h('div', { width: 48, height: 48, borderRadius: 999, marginRight: 14, background: ORANGE, alignItems: 'center', justifyContent: 'center', fontFamily: 'Archivo', fontSize: 26, fontWeight: 800 }, list.username.charAt(0).toUpperCase()),
                    h('div', { fontSize: 32, fontWeight: 700 }, `@${clip(list.username, 30)}`)),
                h('div', { alignItems: 'center' },
                    list.weightClass ? chip(list.weightClass) : null,
                    h('div', { fontSize: 26, color: MUTED, marginLeft: 18 }, `${list.itemCount} ${list.itemCount === 1 ? 'item' : 'items'}`)))),
    );
}

function profileTree(p) {
    const avatar = p.avatarData
        ? { type: 'img', props: { src: p.avatarData, width: 220, height: 220, style: { display: 'flex', borderRadius: 999, border: `6px solid ${CREAM}` } } }
        : h('div', { width: 220, height: 220, borderRadius: 999, background: ORANGE, alignItems: 'center', justifyContent: 'center', fontFamily: 'Archivo', fontSize: 110, fontWeight: 800, border: `6px solid ${CREAM}` }, p.initial);
    return frame(
        h('div', {}, logoEl()),
        h('div', { alignItems: 'center' },
            avatar,
            h('div', { flexDirection: 'column', marginLeft: 48, maxWidth: 760 },
                h('div', { fontFamily: 'Archivo', fontSize: 72, fontWeight: 800, lineHeight: 1.05 }, clip(p.name, 28)),
                h('div', { fontSize: 34, color: MUTED, marginTop: 10 }, `@${clip(p.username, 30)}`),
                p.trailName ? h('div', { fontSize: 32, marginTop: 14, fontWeight: 700 }, `Trail name “${clip(p.trailName, 30)}”`) : null)),
        h('div', { alignItems: 'center' },
            chip(`${p.kitCount} published ${p.kitCount === 1 ? 'list' : 'lists'}`),
            p.lightest ? h('div', { fontSize: 28, color: MUTED, marginLeft: 20 }, `Lightest base weight ${p.lightest}`) : null),
    );
}

const cache = new Map();

async function render(kind, data, tree) {
    const key = crypto.createHash('sha256').update(kind).update(JSON.stringify(data)).digest('hex').slice(0, 20);
    if (cache.has(key)) {
        const hit = cache.get(key);
        cache.delete(key);
        cache.set(key, hit);
        return { png: hit, etag: key };
    }
    const svg = await satori(tree(data), { width: W, height: H, fonts });
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
    cache.set(key, png);
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    return { png, etag: key };
}

// `list`: { name, username, baseWeightMg, itemCount, weightClass, shakedown, categories: [{ weightMg }] }
export function listImage(list) {
    return render('list', {
        name: list.name || '',
        username: list.username,
        description: list.description || '',
        avatarData: avatarData(list.avatarUrl),
        baseWeight: formatWeightMg(list.baseWeightMg, 'lb'),
        itemCount: list.itemCount,
        weightClass: list.weightClass || '',
        shakedown: Boolean(list.shakedown),
        categories: (list.categories || []).map((c) => ({ weightMg: Math.round(c.weightMg) })),
    }, listTree);
}

// A short fingerprint of what the list image shows, for ?v= on og:image so
// social sites fetch a fresh one when it changes.
export function listImageVersion(list) {
    return crypto.createHash('sha256')
        .update(JSON.stringify([list.name, list.description, list.avatarUrl, list.baseWeightMg, list.itemCount, Boolean(list.shakedown), (list.categories || []).map((c) => Math.round(c.weightMg))]))
        .digest('hex').slice(0, 10);
}

// Only our own uploaded avatars are embedded (profiles.js enforces that),
// from the PNG twin written at upload (server/images.js).
function avatarData(url) {
    if (!/^\/userimages\/[0-9a-f]{2}\/[0-9a-f]{16}\/[0-9a-f]{16}_avatar\.webp$/.test(url || '')) return '';
    try {
        const png = fs.readFileSync(path.join(publicDir, url.replace(/\.webp$/, '.png')));
        return `data:image/png;base64,${png.toString('base64')}`;
    } catch {
        return '';
    }
}

export function profileImage(p) {
    return render('profile', {
        name: p.name,
        username: p.username,
        trailName: p.trailName || '',
        kitCount: p.kitCount,
        lightest: p.lightest || '',
        initial: p.initial,
        avatarData: avatarData(p.avatarUrl),
    }, profileTree);
}

export function profileImageVersion(p) {
    return crypto.createHash('sha256')
        .update(JSON.stringify([p.name, p.trailName, p.avatarUrl, p.kitCount, p.lightest]))
        .digest('hex').slice(0, 10);
}
