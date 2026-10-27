// Trails (Phase 8): the trail tag on a list, and the gear features the
// Trails page counts across every pack published for a trail.
//
// A list's trail is { name, year, direction }. `name` is what the hiker
// picked or typed; the server matches it to a trail in the curated list by
// name, short name or alias (server/trails.js), and keeps it as typed when
// there's no match yet, so new trails can be suggested to the site owner.

export const DIRECTIONS = { nobo: 'NOBO', sobo: 'SOBO', flip: 'Flip-flop', section: 'Section' };

export function normalizeTrailTag(input) {
    if (!input || typeof input !== 'object') return null;
    const name = String(input.name || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!name) return null;
    const out = { name };
    const year = Number(input.year);
    if (Number.isInteger(year) && year >= 1950 && year <= 2100) out.year = year;
    if (Object.prototype.hasOwnProperty.call(DIRECTIONS, input.direction)) out.direction = input.direction;
    if (Number.isSafeInteger(input.id) && input.id > 0) out.id = input.id;
    return out;
}

export function trailLabel(trail) {
    if (!trail) return '';
    return [trail.short || trail.name, trail.year, trail.direction && DIRECTIONS[trail.direction]].filter(Boolean).join(' · ');
}

// Features worth counting on a trail page. Each is found by words in an
// item's name and description (whole words; a trailing * matches a prefix).
export const PACK_FEATURES = {
    quilt: { label: 'Quilt instead of a bag', words: ['quilt'] },
    'trail-runners': { label: 'Trail runners', words: ['trail runner', 'trail runners', 'lone peak', 'speedgoat', 'topo', 'cascadia', 'peregrine', 'olympus'] },
    'bear-canister': { label: 'Bear canister', words: ['bear canister', 'bear can', 'bearvault', 'bear vault', 'bv450', 'bv500', 'garcia'] },
    ursack: { label: 'Ursack', words: ['ursack'] },
    'ice-axe': { label: 'Ice axe', words: ['ice axe', 'axe'] },
    traction: { label: 'Microspikes', words: ['microspikes', 'spikes', 'crampon*'] },
    messenger: { label: 'Satellite messenger', words: ['inreach', 'zoleo', 'plb', 'satellite', 'spot gen*'] },
    umbrella: { label: 'Umbrella', words: ['umbrella'] },
    hammock: { label: 'Hammock', words: ['hammock'] },
    'cold-soak': { label: 'Cold soaking (no stove)', words: ['cold soak', 'talenti'] },
    stove: { label: 'Stove', words: ['stove', 'jetboil', 'pocketrocket'] },
    'water-filter': { label: 'Water filter', words: ['filter', 'squeeze', 'befree'] },
};

const esc = (w) => w.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
function matches(text, word) {
    if (word.endsWith('*')) return new RegExp(`[^a-z]${esc(word.slice(0, -1))}`).test(text);
    return new RegExp(`[^a-z]${esc(word)}s?[^a-z]`).test(text);
}

// rows: [{ name, description }] -> ['quilt', 'trail-runners', ...]
export function packFeatures(rows) {
    const found = [];
    for (const [id, f] of Object.entries(PACK_FEATURES)) {
        const hit = rows.some((r) => {
            const text = ` ${`${r.name || ''} ${r.description || ''}`.toLowerCase()} `;
            return f.words.some((w) => matches(text, w));
        });
        if (hit) found.push(id);
    }
    return found;
}
