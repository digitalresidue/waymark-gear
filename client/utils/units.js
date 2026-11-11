// Imperial or metric: which units the site shows a reader. Shared by the
// server (server/i18n.js keeps it for each request) and the app.
//
// The choice: Your profile → Units (saved on the account and in the wg_units
// cookie) or the footer picker. Without one, the browser's region decides:
// the US (and Liberia and Myanmar) get imperial, everyone else metric, and a
// browser that names no region gets imperial, as the site always has.
//
// Values are stored in one unit each (weights in mg or g, lengths in cm,
// temperatures in °C), so showing them either way loses nothing.

export const UNIT_SYSTEMS = ['imperial', 'metric'];
export const UNITS_COOKIE = 'wg_units';
export const DEFAULT_UNITS = 'imperial';

const IMPERIAL_REGIONS = new Set(['US', 'LR', 'MM']);

/** 'imperial' | 'metric' for a value someone chose, or null. */
export function matchUnits(value) {
    const v = String(value || '').toLowerCase();
    return UNIT_SYSTEMS.includes(v) ? v : null;
}

/** A guess from Accept-Language: the first tag with a region decides. */
export function unitsForAcceptLanguage(header) {
    for (const part of String(header || '').split(',')) {
        const tag = part.trim().split(';')[0];
        const region = tag.split(/[-_]/).slice(1).find((p) => /^[A-Za-z]{2}$/.test(p));
        if (region) return IMPERIAL_REGIONS.has(region.toUpperCase()) ? 'imperial' : 'metric';
    }
    return null;
}

export function pickUnits({ chosen, acceptLanguage } = {}) {
    return matchUnits(chosen) || unitsForAcceptLanguage(acceptLanguage) || DEFAULT_UNITS;
}

// The unit for a kind of value in a system. `big` weights are totals and
// pack weights (lb/kg); others are items (oz/g).
const UNITS = {
    imperial: { weight: 'oz', bigWeight: 'lb', length: 'in', temp: 'F', volume: 'L' },
    metric: { weight: 'g', bigWeight: 'kg', length: 'cm', temp: 'C', volume: 'L' },
};

export function unitFor(kind, system = DEFAULT_UNITS, big = false) {
    const table = UNITS[matchUnits(system) || DEFAULT_UNITS];
    return kind === 'weight' && big ? table.bigWeight : table[kind];
}

/** Does a unit belong to a system? 'oz' → imperial, 'kg' → metric, 'L' → both. */
export function unitSystemOf(unit) {
    if (['oz', 'lb', 'in', 'ft', 'ftin', 'F'].includes(unit)) return 'imperial';
    if (['g', 'kg', 'cm', 'm', 'C'].includes(unit)) return 'metric';
    return null;
}

/** The same weight unit in the other system: oz ↔ g, lb ↔ kg. */
export function weightUnitIn(unit, system) {
    const map = { imperial: { g: 'oz', kg: 'lb' }, metric: { oz: 'g', lb: 'kg' } };
    return (map[system] && map[system][unit]) || unit;
}

/**
 * Switch a library's weight units to a system: every item's entry unit and
 * the list totals (oz ↔ g, lb ↔ kg). Weights are stored in mg, so only the
 * display changes. Returns how many units changed.
 */
export function convertLibraryUnits(library, system) {
    if (!library || !matchUnits(system)) return 0;
    let changed = 0;
    const swap = (unit) => {
        const next = weightUnitIn(unit, system);
        if (next !== unit) changed++;
        return next;
    };
    for (const item of library.items || []) item.authorUnit = swap(item.authorUnit || 'oz');
    library.totalUnit = swap(library.totalUnit || 'oz');
    library.itemUnit = swap(library.itemUnit || 'oz');
    return changed;
}
