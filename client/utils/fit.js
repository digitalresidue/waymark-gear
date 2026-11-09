// Does a swap still fit? Volume and size, read from specs or from the name,
// so the gear check's lighter options (server/insights.js) stay usable:
//
//   - Volume (packs, stuff sacks, bottles): the option has to be about the
//     same size: within 15% (at least 3 L either way for packs from 10 L).
//     A 40 L pack gets 34-46 L packs, never a 30 L or a 50 L.
//   - Size (clothing, pack torsos, shoes): XS to 3XL, Small/Medium/Large;
//     "S/M" covers both. An XL jacket never gets a Small or a Medium.
//   - Length (sleeping bags, quilts, pads): Short, Regular, Long; Wide too.
//   - Fit: men's for men's and women's for women's (the specs' "Fit for",
//     or the name); unisex goes with either.
//
// Only judged when both say: gear without a size in its name (most catalog
// entries name a model, not a size) is still offered.

const LITERS_PER_CI = 0.016387;

const words = (s) => ` ${String(s || '').toLowerCase()
    .replace(/(\w)['’]s\b/g, '$1') // "Women's" isn't size S
    // Brackets and commas set a size apart: "Kumo 36 (S)" is size S.
    .replace(/[()[\]{},;:]/g, ' | ')
    .replace(/\s+/g, ' ')
    .trim()} `;

/**
 * Volume in liters: the specs' volume, else from the name (not the
 * description): "40L", "40 L",
 * "50+10L" (the main 50), "750 ml", "2400 ci" / "2400 cu in"; for packs
 * also a bare model number ("Murmur 36", "Kakwa 55"). Null when not given.
 */
export function volumeLiters({ name = '', specs = null, kind = '' } = {}) {
    const v = specs && Number(specs.volume);
    if (v > 0) return v;
    // The name only: a description's "fits a 1 L bottle" isn't the size.
    {
        const t = words(name);
        let m = t.match(/(?:^|[^\w.])(\d+(?:\.\d+)?)(?:\s*\+\s*\d+)?\s*(l|liters?|litres?|ml)(?=[^\w]|$)/);
        if (m) return m[2] === 'ml' ? Number(m[1]) / 1000 : Number(m[1]);
        m = t.match(/(?:^|[^\w.])(\d{3,4})\s*(?:ci|cu\.? ?in|cubic inch(?:es)?)(?=[^\w]|$)/);
        if (m) return Math.round(Number(m[1]) * LITERS_PER_CI);
    }
    if (kind === 'pack') {
        // A bare number after the model name: 15 to 110 L.
        const m = words(name).match(/ [a-z][a-z-]* (\d{2,3})(?= )/);
        if (m && Number(m[1]) >= 15 && Number(m[1]) <= 110) return Number(m[1]);
    }
    return null;
}

/** About the same volume: within 15%, or 3 L either way for 10 L and up. */
export function sameVolume(mine, option) {
    if (!(mine > 0) || !(option > 0)) return true;
    const slack = mine >= 10 ? Math.max(mine * 0.15, 3) : mine * 0.2;
    return Math.abs(option - mine) <= slack + 1e-9;
}

// Clothing (and pack torso) sizes, smallest first.
const APPAREL = [
    ['xxs', '2xs'],
    ['xs', 'x-small', 'xsmall', 'extra small', 'extra-small'],
    ['s', 'sm', 'small'],
    ['m', 'md', 'med', 'medium'],
    ['l', 'lg', 'large'],
    ['xl', 'x-large', 'xlarge', 'extra large', 'extra-large'],
    ['xxl', '2xl', 'xx-large', 'xxlarge'],
    ['xxxl', '3xl', 'xxx-large'],
];
const APPAREL_RANK = new Map(APPAREL.flatMap((names, rank) => names.map((n) => [n, rank])));
const APPAREL_WORDS = [...APPAREL_RANK.keys()].sort((a, b) => b.length - a.length);
const esc = (w) => w.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
// A size on its own, or a pair ("S/M", "M-L"). L and M right after a
// number are liters and meters ("40 L", "5 m"), not sizes.
const APPAREL_RE = new RegExp(`(?<!\\d (?=[lm] ))(?<=[ /])(${APPAREL_WORDS.map(esc).join('|')})(?:\\s*[/-]\\s*(${APPAREL_WORDS.map(esc).join('|')}))?(?= )`, 'g');

// Big-three kinds (big-three.js) and gear kinds (insights.js) for sleep gear.
const SLEEP_KINDS = new Set(['top-quilt', 'underquilt', 'sleeping-bag', 'air-pad', 'foam-pad', 'quilt-bag', 'sleep-pad']);
const LENGTHS = { short: 0, small: 0, regular: 1, medium: 1, reg: 1, long: 2, large: 2, xl: 3, 'extra long': 3 };

/**
 * The sizes a name gives, or null: { apparel: [ranks] } for clothing and
 * packs, { length, wide } for bags, quilts and pads (Small/Medium/Large are
 * pad lengths there), { shoe } for "size 10", "US 10", "EU 44".
 */
export function sizeOf(name = '', kind = '') {
    const t = words(name);
    if (SLEEP_KINDS.has(kind)) {
        const s = t.replace(/[/-]/g, ' ');
        const m = s.match(/ (short|small|regular|reg|medium|extra long|long|large|xl)(?= )/);
        if (!m) return null;
        return { length: LENGTHS[m[1]], wide: / wide /.test(s) };
    }
    const shoe = t.match(/ (?:size|us|us m|us w|mens|womens|men|women) (\d{1,2}(?:\.5)?)(?= )/) || t.match(/ eu (\d{2}(?:\.5)?)(?= )/);
    if (shoe) return { shoe: `${/ eu \d/.test(t) ? 'eu' : 'us'}${shoe[1]}` };
    const ranks = new Set();
    for (const m of t.matchAll(APPAREL_RE)) {
        const a = APPAREL_RANK.get(m[1]);
        const b = m[2] ? APPAREL_RANK.get(m[2]) : a;
        for (let r = Math.min(a, b); r <= Math.max(a, b); r++) ranks.add(r);
    }
    return ranks.size ? { apparel: [...ranks] } : null;
}

/** The same size, where both names give one of the same sort. */
export function sameSize(a, b) {
    if (!a || !b) return true;
    if (a.apparel && b.apparel) return a.apparel.some((r) => b.apparel.includes(r));
    if (a.length !== undefined && b.length !== undefined) return a.length === b.length && a.wide === b.wide;
    if (a.shoe && b.shoe) return a.shoe === b.shoe;
    return true;
}

/**
 * Men's, women's or unisex: the specs' "Fit for" (gender), else the name
 * ("Women's Kumo 36"). Null when neither says.
 */
export function fitFor({ name = '', specs = null } = {}) {
    if (specs && ['mens', 'womens', 'unisex'].includes(specs.gender)) return specs.gender;
    const t = ` ${String(name || '').toLowerCase().replace(/['’]/g, '')} `;
    if (/[^a-z](womens|women|ladies|wmns)[^a-z]/.test(t)) return 'womens';
    if (/[^a-z](mens|men)[^a-z]/.test(t)) return 'mens';
    if (/[^a-z]unisex[^a-z]/.test(t)) return 'unisex';
    return null;
}

/** The same fit: men's for men's, women's for women's; unisex goes with either. */
export function sameFitFor(a, b) {
    return !a || !b || a === 'unisex' || b === 'unisex' || a === b;
}

/**
 * Would `option` fit like `mine`? Each is { name, description, specs };
 * kind is the big-three kind or gear kind, when known.
 */
export function fitsLike(mine = {}, option = {}, kind = '') {
    if (!sameVolume(volumeLiters({ ...mine, kind }), volumeLiters({ ...option, kind }))) return false;
    if (!sameFitFor(fitFor(mine), fitFor(option))) return false;
    return sameSize(sizeOf(mine.name, kind), sizeOf(option.name, kind));
}
