// Header tags: up to 10 <meta> tags the site owner pastes in under Owner →
// Revenue, for affiliate networks and search engines that verify a site by a
// tag in its pages, e.g.
//   <meta name='impact-site-verification' value='c4eca0bc-...'>
//
// Only <meta> tags, and only plain attributes: no scripts, no http-equiv
// (which can redirect or refresh the page), nothing that runs. Each tag is
// rebuilt from its attributes, escaped, rather than stored and echoed as
// pasted. They go into the <head> of every HTML page the server sends.

import express from 'express';

import knex from './db.js';
import { authenticateAdmin } from './auth.js';
import { logger, logWithRequest } from './log.js';

const router = express.Router();

export const MAX_TAGS = 10;
const ALLOWED = new Set(['name', 'property', 'itemprop', 'content', 'value']);
const ATTR = /([a-zA-Z][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;

const escapeAttr = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Text with one <meta> tag per line (blank lines ignored) -> tags, or errors
// saying which line is wrong and why.
export function parseHeadTags(text) {
    const tags = [];
    const errors = [];
    const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    lines.forEach((line, i) => {
        const n = i + 1;
        const m = line.match(/^<meta\s+([\s\S]*?)\s*\/?>$/i);
        if (!m) {
            errors.push(`Line ${n}: only <meta ...> tags can go here, one per line.`);
            return;
        }
        const attrs = [];
        const rest = m[1].replace(ATTR, (_all, key, dq, sq, bare) => {
            attrs.push([key.toLowerCase(), dq ?? sq ?? bare ?? '']);
            return '';
        }).trim();
        if (rest) {
            errors.push(`Line ${n}: couldn't read "${rest.slice(0, 40)}".`);
            return;
        }
        const bad = attrs.find(([k]) => !ALLOWED.has(k));
        if (bad) {
            errors.push(`Line ${n}: "${bad[0]}" isn't allowed; use name or property, with content or value.`);
            return;
        }
        if (!attrs.some(([k]) => k === 'name' || k === 'property' || k === 'itemprop')) {
            errors.push(`Line ${n}: needs a name (or property).`);
            return;
        }
        if (attrs.some(([, v]) => v.length > 500)) {
            errors.push(`Line ${n}: a value is too long.`);
            return;
        }
        tags.push(attrs);
    });
    if (tags.length > MAX_TAGS) errors.push(`Up to ${MAX_TAGS} tags; there are ${tags.length}.`);
    return { tags, errors };
}

export function renderHeadTags(tags) {
    return tags.map((attrs) => `<meta ${attrs.map(([k, v]) => `${k}="${escapeAttr(v)}"`).join(' ')}>`).join('\n');
}

// What every page gets; kept in memory, refreshed when saved.
let current = { text: '', html: '' };

export async function loadHeadTags() {
    try {
        const row = await knex('site_settings').where({ key: 'headTags' }).first();
        const text = row && row.value && typeof row.value.text === 'string' ? row.value.text : '';
        const { tags } = parseHeadTags(text);
        current = { text, html: renderHeadTags(tags.slice(0, MAX_TAGS)) };
    } catch (err) {
        logger.error({ message: 'Could not load header tags', err });
    }
    return current;
}

export const headTagsHtml = () => current.html;

// Adds the tags to every HTML page sent with res.send(), just before </head>.
export function injectHeadTags(req, res, next) {
    const send = res.send.bind(res);
    res.send = (body) => {
        if (current.html && typeof body === 'string' && body.includes('</head>') && !req.path.startsWith('/e/')
            && /html/.test(String(res.get('Content-Type') || 'text/html'))) {
            return send(body.replace('</head>', `${current.html}\n</head>`));
        }
        return send(body);
    };
    next();
}

const admin = (handler) => (req, res) => authenticateAdmin(req, res, async (req, res, user) => {
    try {
        await handler(req, res, user);
    } catch (err) {
        logWithRequest(req, { message: 'header tags error', err });
        if (!res.headersSent) res.status(500).json({ message: 'An error occurred.' });
    }
});

router.get('/api/admin/head-tags', admin(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ text: current.text, max: MAX_TAGS });
}));

router.put('/api/admin/head-tags', admin(async (req, res) => {
    if (!req.is('application/json')) return res.status(415).json({ message: 'Send JSON.' });
    const text = String((req.body && req.body.text) || '').slice(0, 10000);
    const { tags, errors } = parseHeadTags(text);
    if (errors.length) return res.status(400).json({ message: errors[0], errors });
    // Store it tidied: one rebuilt tag per line.
    const html = renderHeadTags(tags);
    await knex('site_settings').insert({ key: 'headTags', value: JSON.stringify({ text: html }), updated_at: knex.fn.now() })
        .onConflict('key').merge();
    current = { text: html, html };
    res.json({ text: html, count: tags.length });
}));

export default router;
