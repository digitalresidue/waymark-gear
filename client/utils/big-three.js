// The big three: shelter, sleep system and pack, where most of a pack's
// weight is and where a swap changes it most. The gear check's "Lighter
// options" leads with them (server/insights.js).
//
// Suggestions stay within the system someone has chosen: each piece is told
// apart finely (a tent, a tarp, a bivy or a hammock; a top quilt, an
// underquilt, a sleeping bag, an inflatable pad or a foam pad), and only the
// same kind is suggested. Someone with a hammock and a top quilt never gets
// a tent or a sleeping bag. A swap has to be at least 20% lighter, and, where
// both have the specs, as roomy, as warm, as well insulated or as big.

import { categoryKey } from './gear-meta.js';

export const MIN_SAVING = 0.2; // a swap must be at least 20% lighter

export const SLOTS = [
    { id: 'shelter', label: 'Shelter' },
    { id: 'sleep', label: 'Sleep system' },
    { id: 'pack', label: 'Pack' },
];

export const KINDS = {
    tent: { slot: 'shelter', label: 'Tent' },
    tarp: { slot: 'shelter', label: 'Tarp' },
    bivy: { slot: 'shelter', label: 'Bivy' },
    hammock: { slot: 'shelter', label: 'Hammock' },
    'top-quilt': { slot: 'sleep', label: 'Top quilt' },
    underquilt: { slot: 'sleep', label: 'Underquilt' },
    'sleeping-bag': { slot: 'sleep', label: 'Sleeping bag' },
    'air-pad': { slot: 'sleep', label: 'Inflatable pad' },
    'foam-pad': { slot: 'sleep', label: 'Foam pad' },
    pack: { slot: 'pack', label: 'Pack' },
};

// Catalog categories that say the kind outright (pads are told apart below).
const BY_CATEGORY = new Map([
    ['tent', 'tent'], ['tarp', 'tarp'], ['bivy', 'bivy'], ['bivvy', 'bivy'], ['bivysack', 'bivy'], ['hammock', 'hammock'],
    ['quilt', 'top-quilt'], ['topquilt', 'top-quilt'], ['backpackingquilt', 'top-quilt'], ['underquilt', 'underquilt'],
    ['sleepingbag', 'sleeping-bag'], ['sleepingpad', 'pad'], ['sleeppad', 'pad'],
    ['pack', 'pack'], ['backpack', 'pack'], ['rucksack', 'pack'], ['fastpack', 'pack'], ['hydrationvest', 'pack'], ['runningvest', 'pack'],
]);

// Not big-three gear, though the words overlap: accessories and other kinds.
const NOT = ['suspension', 'tree strap', 'whoopie', 'ridgeline', 'stake', 'bug net', 'footprint', 'groundsheet', 'ground sheet',
    'pack liner', 'pack cover', 'packing cube', 'pack towel', 'stuff sack', 'fanny pack', 'hip pack', 'waist pack', 'battery pack',
    'power pack', 'packraft', 'ice pack', 'pack rain', 'sit pad', 'seat pad', 'pad repair', 'pillow', 'liner', 'quilt strap',
    'pad strap', 'tent pole', 'repair'];

// Words, most specific first: "hammock tarp" is a tarp, "hammock underquilt"
// an underquilt.
const WORDS = [
    ['underquilt', ['underquilt', 'under quilt']],
    ['tarp', ['tarp']],
    ['bivy', ['bivy', 'bivvy', 'bivi']],
    ['hammock', ['hammock']],
    ['sleeping-bag', ['sleeping bag', 'mummy bag']],
    ['top-quilt', ['top quilt', 'quilt']],
    ['foam-pad', ['foam pad', 'z lite', 'zlite', 'z-lite', 'thinlight', 'ccf', 'closed cell', 'closed-cell', 'switchback']],
    ['air-pad', ['sleeping pad', 'sleep pad', 'neoair', 'xlite', 'xtherm', 'tensor', 'air pad', 'airpad', 'mattress', 'uberlite', 'etherlight', 'pad']],
    ['tent', ['tent', 'x-mid', 'xmid', 'duplex', 'lunar solo', 'copper spur', 'notch', 'the one', 'pyramid', 'trekker', 'shelter', 'dipole']],
    ['pack', ['backpack', 'daypack', 'pack', 'mariposa', 'circuit', 'kakwa', 'exos', 'southwest', 'arc haul']],
];

const text = (...parts) => ` ${parts.filter(Boolean).join(' ').toLowerCase().replace(/[^a-z0-9+-]+/g, ' ')} `;
const has = (t, w) => t.includes(` ${w} `) || t.includes(` ${w}s `);

function padKind(name, specs) {
    if (specs && specs.pad_type) return specs.pad_type === 'closed_cell' ? 'foam-pad' : 'air-pad';
    const t = text(name);
    return WORDS.find(([k]) => k === 'foam-pad')[1].some((w) => has(t, w)) ? 'foam-pad' : 'air-pad';
}

/**
 * Which big-three kind a piece of gear is, or null. `catalogCategory` (from
 * the catalog item it's linked to, or a catalog item itself) is trusted
 * first; then its name and description; then the list's category name.
 */
export function bigThreeKind({ name = '', description = '', category = '', catalogCategory = '', specs = null } = {}) {
    const t = text(name, description);
    if (NOT.some((w) => has(t, w))) return null;
    const fromCatalog = BY_CATEGORY.get(categoryKey(catalogCategory));
    if (fromCatalog) return fromCatalog === 'pad' ? padKind(`${name} ${description}`, specs) : fromCatalog;
    for (const [kind, words] of WORDS) if (words.some((w) => has(t, w))) return kind;
    const fromList = BY_CATEGORY.get(categoryKey(category));
    if (fromList) return fromList === 'pad' ? padKind(name, specs) : fromList;
    return null;
}

const CAPACITY = { '1p': 1, '1p_plus': 1.5, '2p': 2, '2p_plus': 2.5, '3p': 3 };
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Is `option` a like-for-like swap for `mine` (same kind)? Only judged on
 * specs both have: as many people for a tent, as warm for a quilt or bag
 * (within 1°C), as well insulated for a pad, and at least three quarters
 * the volume and carrying weight for a pack.
 */
export function likeForLike(kind, mine = {}, option = {}) {
    const a = mine || {};
    const b = option || {};
    if (kind === 'tent' && CAPACITY[a.capacity] && CAPACITY[b.capacity]) return CAPACITY[b.capacity] >= CAPACITY[a.capacity];
    if (['top-quilt', 'underquilt', 'sleeping-bag'].includes(kind)) {
        for (const key of ['temp_comfort', 'temp_limit']) {
            if (num(a[key]) !== null && num(b[key]) !== null) return b[key] <= a[key] + 1;
        }
        return true;
    }
    if (['air-pad', 'foam-pad'].includes(kind) && num(a.r_value) !== null && num(b.r_value) !== null) return b.r_value >= a.r_value - 0.2;
    if (kind === 'pack') {
        if (num(a.volume) !== null && num(b.volume) !== null && b.volume < a.volume * 0.75) return false;
        if (num(a.max_carry) !== null && num(b.max_carry) !== null && b.max_carry < a.max_carry * 0.75) return false;
    }
    return true;
}

/** Light enough to be worth a swap: at least 20% lighter. */
export function worthSwapping(mineMg, optionMg) {
    return mineMg > 0 && optionMg > 0 && optionMg <= mineMg * (1 - MIN_SAVING);
}
