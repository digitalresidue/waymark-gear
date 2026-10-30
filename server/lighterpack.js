// Import a public LighterPack list from its share link.
//
// Only ever fetches from the configured LighterPack origin (lighterpack.com in
// production), only the two public paths for a list id, never follows a
// redirect, and stops reading after MAX_BYTES, so a pasted link can't be used
// to make this server request anything else.

import config from 'config';
import rateLimit from 'express-rate-limit';

import { parseGearCsv, lighterPackId } from '../client/utils/lighterpack-import.js';
import { logWithRequest } from './log.js';

const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 8000;

export class ImportError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}

export function lighterPackOrigin() {
    return new URL(config.get('lighterpackUrl')).origin;
}

export async function fetchText(url, source = 'LighterPack', { accept } = {}) {
    let res;
    try {
        res = await fetch(url, {
            redirect: 'error',
            signal: AbortSignal.timeout(TIMEOUT_MS),
            headers: { 'User-Agent': 'WaymarkGear-import (+https://waymarkgear.com)', ...(accept ? { Accept: accept } : {}) },
        });
    } catch {
        throw new ImportError(`Couldn't reach ${source}. Try again in a minute, or upload the list's CSV instead.`, 502);
    }
    if (!res.ok) {
        throw new ImportError(`We couldn't find that list. Check the link, and that the list is shared on ${source}.`, 404);
    }
    const reader = res.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_BYTES) {
            await reader.cancel();
            throw new ImportError('That list is too big to import.', 413);
        }
        chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function text(html) {
    return String(html || '')
        .replace(/<br\s*\/?>|<\/p>|<\/li>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
            if (e[0] === '#') {
                const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
                return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
            }
            return ENTITIES[e.toLowerCase()] ?? m;
        })
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s*\n+/g, '\n\n')
        .trim();
}

// The share page has the list's name and description; the CSV doesn't.
export function listDetailsFromHtml(html) {
    const name = (String(html).match(/<h1[^>]*class="[^"]*lpListName[^"]*"[^>]*>([\s\S]*?)<\/h1>/i) || [])[1];
    const description = (String(html).match(/<div[^>]*id="lpListDescription"[^>]*>([\s\S]*?)<\/div>/i) || [])[1];
    return { name: text(name).slice(0, 200), description: text(description).slice(0, 2000) };
}

export async function importFromLighterPack(link) {
    const origin = lighterPackOrigin();
    const id = lighterPackId(link, new URL(origin).host);
    if (!id) {
        throw new ImportError('Paste a LighterPack share link, like lighterpack.com/r/abc123.');
    }
    const [csv, html] = await Promise.all([
        fetchText(`${origin}/csv/${id}`),
        fetchText(`${origin}/r/${id}`).catch(() => ''),
    ]);
    const details = listDetailsFromHtml(html);
    const parsed = parseGearCsv(csv, { name: details.name || 'Imported from LighterPack' });
    if (!parsed.itemCount) {
        throw new ImportError("That list doesn't have any gear we could read.", 422);
    }
    parsed.description = details.description;
    parsed.source = `${origin}/r/${id}`;
    return parsed;
}

// Every import makes two requests to LighterPack; keep it polite.
export function importRateLimit() {
    const opts = config.get('rateLimit');
    if (!opts.enabled) return (_req, _res, next) => next();
    return rateLimit({
        windowMs: Number(opts.importWindowMinutes || 10) * 60 * 1000,
        limit: Number(opts.importMaxPerWindow || 20),
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        handler: (req, res, _next, options) => {
            logWithRequest(req, { message: 'import rate limited' });
            res.status(options.statusCode).json({ message: 'Too many imports. Please wait a few minutes and try again.' });
        },
    });
}
