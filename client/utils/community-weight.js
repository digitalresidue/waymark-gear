// Community weights: what a catalog item weighs, from what members' own
// gear of it weighs. Each catalog item is one size of one product (brand,
// name, size, fit), so everyone linked to it has the same thing.
//
// A weight counts once a member sets it themselves (gear_items.weight_own),
// one per member. With at least MIN_PEOPLE of them:
//   1. Find where most of them agree: the most weights within ±5% of one
//      another (the same thing weighed on different scales, units varying
//      a little from the factory). Its middle is the centre.
//   2. Keep the weights within 5% (or 2 g, for small gear) of the centre:
//      that leaves out unit slips, another size, gear that's been cut down.
//   3. The weight is the middle of what's kept, to a tenth of a gram, once
//      at least MIN_PEOPLE are kept and they're at least AGREE of everyone.
// Fewer, or too many disagreeing (often two sizes mixed in one catalog
// item: half at 600 g, half at 800 g), and there's no community weight:
// the brand's stands, and the owner sees why.

export const MIN_PEOPLE = 10;
export const AGREE = 0.6;
const NEAR = 0.05;
const MIN_GAP_MG = 2000;

const median = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * weights: one per member, in mg. Returns { weightMg, count, total, status }:
 * weightMg null unless status is 'ready'; count how many agree; total how
 * many weighed in. status: 'waiting' (too few yet), 'ready', 'disagree'.
 */
export function communityWeight(weights) {
    const all = (weights || []).map(Number).filter((w) => Number.isFinite(w) && w > 0);
    const total = all.length;
    if (total < MIN_PEOPLE) return { weightMg: null, count: 0, total, status: 'waiting' };

    // Where most agree: for each weight, how many are within 5% of it. The
    // window's ends only move up as the weight does, so one pass finds it.
    const sorted = [...all].sort((x, y) => x - y);
    const reach = (w) => Math.max(w * NEAR, MIN_GAP_MG);
    let lo = 0;
    let hi = 0;
    let best = [0, 0];
    for (const w of sorted) {
        while (sorted[lo] < w - reach(w)) lo++;
        while (hi < sorted.length && sorted[hi] <= w + reach(w)) hi++;
        if (hi - lo > best[1] - best[0]) best = [lo, hi];
    }
    const centre = median(sorted.slice(best[0], best[1]));
    const kept = all.filter((w) => Math.abs(w - centre) <= reach(centre));

    if (kept.length < MIN_PEOPLE || kept.length / total < AGREE) {
        return { weightMg: null, count: kept.length, total, status: 'disagree' };
    }
    return { weightMg: Math.round(median(kept) / 100) * 100, count: kept.length, total, status: 'ready' };
}

/** Each member's weight: the middle of theirs when they have several. */
export function perPerson(rows) {
    const byUser = new Map();
    for (const r of rows) {
        if (!byUser.has(r.userId)) byUser.set(r.userId, []);
        byUser.get(r.userId).push(Number(r.weightMg));
    }
    return [...byUser.values()].map(median);
}

// ---- a list's gear against the catalog ----------------------------------------

// How far apart before Gear check says so: 15% and at least 20 g.
export const GAP_SHARE = 0.15;
export const GAP_MIN_MG = 20000;

// Common slips: a number typed in the wrong unit is off by these.
// from is the bigger unit, to the smaller.
const SLIPS = [
    { factor: 28.3495, from: 'oz', to: 'g' },
    { factor: 1000, from: 'kg', to: 'g' },
    { factor: 16, from: 'lb', to: 'oz' },
    { factor: 453.592, from: 'lb', to: 'g' },
    { factor: 35.274, from: 'kg', to: 'oz' },
    { factor: 2.20462, from: 'kg', to: 'lb' },
];

/**
 * Your gear's weight against the catalog's: null when close enough, else
 * { diffMg, share, slip }. slip ({ typed, meant }) when the gap looks like
 * a number typed in the wrong unit: 15 typed as grams, meant as ounces.
 */
export function weightGap(yoursMg, catalogMg) {
    const y = Number(yoursMg);
    const c = Number(catalogMg);
    if (!(y > 0) || !(c > 0)) return null;
    const diffMg = y - c;
    if (Math.abs(diffMg) < GAP_MIN_MG || Math.abs(diffMg) / c < GAP_SHARE) return null;
    const ratio = y > c ? y / c : c / y;
    const hit = SLIPS.find((s) => Math.abs(ratio / s.factor - 1) < 0.06);
    // Yours lighter by the factor: typed in the smaller unit, meant the bigger.
    const slip = hit ? (y < c ? { typed: hit.to, meant: hit.from } : { typed: hit.from, meant: hit.to }) : null;
    return { diffMg, share: diffMg / c, slip };
}
