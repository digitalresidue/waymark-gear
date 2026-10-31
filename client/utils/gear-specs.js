// Specs for catalog gear, by type: what a pack, tent, quilt, pad, sleeping
// bag or insulated layer is like beyond its name and weight, so gear can be
// compared, searched and filtered.
//
// A catalog item's type comes from its category (specTypeFor): "Backpack"
// and "Packs" are packs, "Top Quilt" and "Underquilt" quilts, and so on.
// Each type has its own fields. Values are stored in one unit per kind, so
// they compare and filter (grams, centimetres, litres, °C), are typed in
// either unit ("20F" or "-7C", "14 oz" or "397 g", "72 in" or "183 cm"), and
// show in both ("20°F (−7°C)").
//
// Used by the owner's catalog editor, the import sheet (one column per field,
// named by its key), the gear page and the catalog API.

import { categoryKey } from './gear-meta.js';

// ---- kinds of value -----------------------------------------------------------

const round = (n) => Math.round(n * 10) / 10;
const trim1 = (n) => String(Math.round(n * 10) / 10);

// Units each kind accepts, as factors (or functions) to its stored unit.
const KINDS = {
    temp: {
        stored: 'C',
        units: { f: 'F', fahrenheit: 'F', c: 'C', celsius: 'C' },
        toStored: (n, u) => (u === 'F' ? (n - 32) * 5 / 9 : n),
        fromStored: (n, u) => (u === 'F' ? n * 9 / 5 + 32 : n),
        min: -60,
        max: 40,
    },
    weight: {
        stored: 'g',
        units: { g: 'g', gram: 'g', grams: 'g', kg: 'kg', oz: 'oz', ounce: 'oz', ounces: 'oz', lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb' },
        factor: { g: 1, kg: 1000, oz: 28.349523125, lb: 453.59237 },
        min: 0,
        max: 200000,
    },
    length: {
        stored: 'cm',
        units: { cm: 'cm', mm: 'mm', m: 'm', in: 'in', inch: 'in', inches: 'in', '"': 'in', ft: 'ft' },
        factor: { cm: 1, mm: 0.1, m: 100, in: 2.54, ft: 30.48 },
        min: 0,
        max: 1000,
    },
    volume: {
        stored: 'L',
        units: { l: 'L', liter: 'L', liters: 'L', litre: 'L', litres: 'L', ci: 'ci', 'cu in': 'ci', cuin: 'ci', 'cubic inches': 'ci' },
        factor: { L: 1, ci: 0.016387064 },
        min: 0,
        max: 200,
    },
};

/** A field kind's value in stored units, from "20F", "14 oz", "72 in"... */
function measure(kindName, raw, defaultUnit) {
    const kind = KINDS[kindName];
    const text = String(raw).trim().toLowerCase().replace(/°/g, '').replace(/,/g, '.');
    const m = text.match(/^(-?\d+(?:\.\d+)?)\s*([a-z" ]*)$/);
    if (!m) return null;
    const n = Number(m[1]);
    const unitText = m[2].trim();
    const unit = unitText ? kind.units[unitText] : defaultUnit;
    if (!unit || !Number.isFinite(n)) return null;
    const stored = kind.toStored ? kind.toStored(n, unit) : n * kind.factor[unit];
    if (stored < kind.min || stored > kind.max) return null;
    return round(stored);
}

// ---- fields --------------------------------------------------------------------

const yesNo = { kind: 'yesno' };
const choice = (options) => ({ kind: 'choice', options });
const FILL_POWERS = [450, 550, 650, 750, 800, 850, 900, 950, 1000];

/**
 * Every spec field. kind: temp | weight | length | volume | dims | number |
 * choice | yesno | text (free words, up to `max` characters). unit: what a bare number means when typed or imported.
 * range: a measured field's usual span (stored units), for Explore's slider
 * before the catalog has enough values of its own.
 * options: [value, label] for a choice; `aliases` other ways it's written.
 */
export const SPEC_FIELDS = {
    // Packs
    max_carry: { label: 'Max carry weight', kind: 'weight', unit: 'lb', display: ['lb', 'kg'], range: [4500, 27500] },
    volume: { label: 'Volume', kind: 'volume', unit: 'L', display: ['L'], range: [10, 90] },
    strap_type: { label: 'Shoulder straps', ...choice([['j_curve', 'J-curve'], ['s_curve', 'S-curve'], ['vest', 'Vest'], ['other', 'Other']]) },
    frame: { label: 'Frame', ...choice([['framed', 'Framed'], ['frameless', 'Frameless']]) },
    roll_top: { label: 'Roll top', ...yesNo },
    adjustable_torso: { label: 'Adjustable torso', ...yesNo },
    pack_type: { label: 'Pack type', ...choice([['fastpack', 'Fastpack'], ['pack', 'Pack'], ['hydration_vest', 'Hydration vest']]), aliases: { backpack: 'pack', fast: 'fastpack', vest: 'hydration_vest', runningvest: 'hydration_vest', hydrationpack: 'hydration_vest' } },
    // Free text: fabrics keep changing (Ultra 200, Robic 210D, ECOPAK...).
    fabric: { label: 'Fabric', kind: 'text', max: 60 },

    // Tents
    capacity: { label: 'Size', ...choice([['1p', '1P'], ['1p_plus', '1P+'], ['2p', '2P'], ['2p_plus', '2P+'], ['3p', '3P']]), aliases: { '1': '1p', '2': '2p', '3': '3p', '1person': '1p', '2person': '2p', '3person': '3p' } },
    pitch: { label: 'Pitch', ...choice([['trekking_pole', 'Trekking pole'], ['semi_freestanding', 'Semi-freestanding'], ['freestanding', 'Freestanding']]) },
    min_weight: { label: 'Minimum weight', kind: 'weight', unit: 'oz', display: ['oz', 'g'], range: [200, 3000] },
    trail_weight: { label: 'Trail weight', kind: 'weight', unit: 'oz', display: ['oz', 'g'], range: [200, 3000] },
    vestibules: { label: 'Vestibules', kind: 'number', min: 0, max: 4, integer: true, range: [0, 4] },
    double_wall: { label: 'Double walled', ...yesNo },
    floor_width: { label: 'Floor width', kind: 'length', unit: 'in', display: ['in', 'cm'], range: [50, 150] },
    floor_length: { label: 'Floor length', kind: 'length', unit: 'in', display: ['in', 'cm'], range: [180, 240] },
    peak_height: { label: 'Peak height', kind: 'length', unit: 'in', display: ['in', 'cm'], range: [60, 140] },
    packed_size: { label: 'Packed size', kind: 'dims', unit: 'in', display: ['in', 'cm'] },

    // Quilts, sleeping bags, insulated layers
    temp_comfort: { label: 'Comfort rating', kind: 'temp', unit: 'F', display: ['F', 'C'], range: [-20, 15] },
    temp_limit: { label: 'Limit rating', kind: 'temp', unit: 'F', display: ['F', 'C'], range: [-25, 10] },
    insulation: { label: 'Insulation', ...choice([['down', 'Down'], ['synthetic', 'Synthetic']]) },
    fill_power: { label: 'Fill power', kind: 'choice', options: FILL_POWERS.map((n) => [String(n), `${n} fill`]), numeric: true, onlyWhen: { insulation: 'down' } },
    fill_weight: { label: 'Fill weight', kind: 'weight', unit: 'oz', display: ['oz', 'g'], range: [20, 600] },
    footbox: { label: 'Footbox', ...choice([['sewn', 'Sewn'], ['zippered', 'Zippered'], ['drawcord', 'Drawcord']]), aliases: { zipper: 'zippered', zip: 'zippered', sewnin: 'sewn', closed: 'sewn', drawstring: 'drawcord' } },
    draft_collar: { label: 'Draft collar', ...yesNo },
    quilt_shape: { label: 'Shape', ...choice([['tapered', 'Tapered'], ['rectangular', 'Rectangular'], ['other', 'Other']]) },
    bag_shape: { label: 'Shape', ...choice([['mummy', 'Mummy'], ['tapered', 'Tapered'], ['rectangular', 'Rectangular'], ['other', 'Other']]) },
    rds: { label: 'RDS certified', ...choice([['yes', 'Yes'], ['no', 'No'], ['unknown', 'Unknown']]), aliases: { y: 'yes', n: 'no', true: 'yes', false: 'no', unkown: 'unknown' }, onlyWhen: { insulation: 'down' } },
    gender: { label: 'Fit for', ...choice([['mens', "Men's"], ['womens', "Women's"], ['unisex', 'Unisex']]), aliases: { men: 'mens', male: 'mens', m: 'mens', women: 'womens', female: 'womens', w: 'womens' } },
    bag_width: { label: 'Width', ...choice([['slim', 'Slim'], ['regular', 'Regular'], ['wide', 'Wide']]) },
    hooded: { label: 'Hooded', ...yesNo },
    zipper: { label: 'Zipper', ...choice([['full', 'Full'], ['quarter', 'Quarter'], ['none', 'None']]), aliases: { half: 'quarter', pullover: 'none' } },
    baffles: { label: 'Baffles', ...choice([['sewn_through', 'Sewn-through'], ['box', 'Box'], ['other', 'Other']]), aliases: { sewn: 'sewn_through', boxbaffle: 'box' } },

    // Sleeping pads
    r_value: { label: 'R-value', kind: 'number', min: 0, max: 15, range: [0, 8] },
    thickness: { label: 'Thickness', kind: 'length', unit: 'in', display: ['in', 'cm'], range: [0, 12] },
    pad_width: { label: 'Width', kind: 'length', unit: 'in', display: ['in', 'cm'], range: [40, 80] },
    pad_length: { label: 'Length', kind: 'length', unit: 'in', display: ['in', 'cm'], range: [100, 220] },
    pad_type: { label: 'Type', ...choice([['closed_cell', 'Closed-cell foam'], ['inflatable', 'Inflatable'], ['self_inflating', 'Self-inflating']]), aliases: { ccf: 'closed_cell', foam: 'closed_cell', closedcellfoam: 'closed_cell', air: 'inflatable' } },
};

/** Gear types with specs: which categories they cover and their fields, in order. */
export const SPEC_TYPES = [
    {
        id: 'pack', label: 'Pack', categories: ['Pack', 'Backpack', 'Rucksack', 'Fastpack', 'Fast Pack', 'Hydration Vest', 'Running Vest'],
        fields: ['max_carry', 'volume', 'pack_type', 'strap_type', 'frame', 'roll_top', 'adjustable_torso', 'fabric'],
    },
    {
        id: 'tent', label: 'Tent', categories: ['Tent'],
        fields: ['capacity', 'pitch', 'trail_weight', 'min_weight', 'double_wall', 'vestibules', 'floor_width', 'floor_length', 'peak_height', 'packed_size'],
    },
    {
        id: 'quilt', label: 'Quilt', categories: ['Quilt', 'Top Quilt', 'Backpacking Quilt', 'Underquilt'],
        fields: ['temp_comfort', 'temp_limit', 'insulation', 'fill_power', 'rds', 'footbox', 'draft_collar', 'quilt_shape'],
    },
    {
        id: 'pad', label: 'Sleeping pad', categories: ['Sleeping Pad', 'Sleep Pad'],
        fields: ['r_value', 'pad_type', 'thickness', 'pad_width', 'pad_length', 'packed_size'],
    },
    {
        id: 'bag', label: 'Sleeping bag', categories: ['Sleeping Bag'],
        fields: ['temp_comfort', 'temp_limit', 'insulation', 'fill_power', 'rds', 'gender', 'bag_width', 'bag_shape'],
    },
    {
        id: 'outer', label: 'Outer layer', categories: ['Outer Layer', 'Insulation', 'Insulated Jacket', 'Puffy'],
        fields: ['insulation', 'fill_power', 'fill_weight', 'rds', 'gender', 'hooded', 'zipper', 'baffles'],
    },
];

const TYPE_BY_CATEGORY = new Map(SPEC_TYPES.flatMap((t) => t.categories.map((c) => [categoryKey(c), t])));

/** The spec type for a catalog category ("Top Quilts" -> quilt), or null. */
export function specTypeFor(category) {
    return TYPE_BY_CATEGORY.get(categoryKey(category)) || null;
}

/** Every field key, for import sheet columns and API filters. */
export const SPEC_KEYS = Object.keys(SPEC_FIELDS);

// ---- reading values ---------------------------------------------------------------

// "2P+" and "2p_plus" are one; "Semi Freestanding" and "semi-freestanding" too.
const optionKey = (v) => String(v ?? '').toLowerCase().replace(/\+/g, 'plus').replace(/[^a-z0-9]+/g, '');

/**
 * One field's value from what someone typed or a sheet cell. Returns
 * { value } (undefined when empty) or { error }.
 */
export function readSpec(key, raw) {
    const field = SPEC_FIELDS[key];
    if (!field) return { error: `${key} isn't a spec` };
    if (raw === undefined || raw === null || String(raw).trim() === '') return { value: undefined };
    const text = String(raw).trim();
    switch (field.kind) {
    case 'text': {
        // Free words, tidied: no control characters, single spaces.
        const clean = [...text].filter((ch) => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) !== 127).join('').replace(/\s+/g, ' ').trim().slice(0, field.max || 60);
        return { value: clean || undefined };
    }
    case 'yesno': {
        const k = optionKey(text);
        if (['yes', 'y', 'true', '1', 'x'].includes(k)) return { value: true };
        if (['no', 'n', 'false', '0'].includes(k)) return { value: false };
        return { error: `${field.label}: yes or no` };
    }
    case 'choice': {
        const k = optionKey(text.replace(/\s*(fp|fill|fillpower)$/i, ''));
        const hit = field.options.find(([value, label]) => optionKey(value) === k || optionKey(label) === k)
            || (field.aliases && field.aliases[k] && field.options.find(([value]) => value === field.aliases[k]));
        if (!hit) return { error: `${field.label}: one of ${field.options.map(([, label]) => label).join(', ')}` };
        return { value: field.numeric ? Number(hit[0]) : hit[0] };
    }
    case 'number': {
        const n = Number(text.replace(',', '.'));
        if (!Number.isFinite(n) || n < field.min || n > field.max || (field.integer && !Number.isInteger(n))) {
            return { error: `${field.label}: a number from ${field.min} to ${field.max}` };
        }
        return { value: field.integer ? n : Math.round(n * 10) / 10 };
    }
    case 'dims': {
        // "18 x 5 x 5 in", "46x13 cm": up to three sizes, one unit.
        const m = text.toLowerCase().replace(/,/g, '.').match(/^([\d.]+(?:\s*[x×*]\s*[\d.]+){0,2})\s*([a-z"]*)$/);
        if (!m) return { error: `${field.label}: like 18 x 5 x 5 in` };
        const unit = m[2] ? KINDS.length.units[m[2]] : field.unit;
        if (!unit) return { error: `${field.label}: in or cm` };
        const sizes = m[1].split(/\s*[x×*]\s*/).map(Number);
        if (sizes.some((n) => !Number.isFinite(n) || n <= 0 || n * KINDS.length.factor[unit] > 1000)) return { error: `${field.label}: like 18 x 5 x 5 in` };
        return { value: sizes.map((n) => round(n * KINDS.length.factor[unit])) };
    }
    default: {
        const value = measure(field.kind, text, field.unit);
        if (value === null) {
            const examples = { temp: '20F or -7C', weight: '14 oz or 397 g', length: '72 in or 183 cm', volume: '40 L' };
            return { error: `${field.label}: like ${examples[field.kind]}` };
        }
        return { value };
    }
    }
}

/**
 * Clean specs for a category from a form or sheet ({ key: raw }): only the
 * type's fields, read and checked. Returns { specs, errors }; specs holds
 * only fields with values.
 */
export function readSpecs(category, input = {}) {
    const type = specTypeFor(category);
    const specs = {};
    const errors = [];
    if (!type || !input || typeof input !== 'object') return { specs, errors };
    for (const key of type.fields) {
        const { value, error } = readSpec(key, input[key]);
        if (error) errors.push(error);
        else if (value !== undefined) specs[key] = value;
    }
    // Fill power and RDS are about down.
    for (const key of type.fields) {
        const when = SPEC_FIELDS[key].onlyWhen;
        if (when && specs[key] !== undefined && Object.entries(when).some(([k, v]) => specs[k] !== undefined && specs[k] !== v)) delete specs[key];
    }
    return { specs, errors };
}

// ---- showing values ---------------------------------------------------------------

function inUnit(kindName, stored, unit) {
    const kind = KINDS[kindName];
    return kind.fromStored ? kind.fromStored(stored, unit) : stored / kind.factor[unit];
}

const UNIT_LABEL = { F: '°F', C: '°C', g: 'g', kg: 'kg', oz: 'oz', lb: 'lb', in: 'in', cm: 'cm', L: 'L' };
const minus = (s) => s.replace(/^-/, '−');

const optionLabel = (field, value) => {
    const hit = field.options.find(([v]) => String(v) === String(value));
    return hit ? hit[1] : String(value);
};

/** A stored value as people read it: "20°F (−7°C)", "40 L", "Yes". */
export function formatSpec(key, value) {
    const field = SPEC_FIELDS[key];
    if (!field || value === undefined || value === null) return '';
    switch (field.kind) {
    case 'text': return String(value);
    case 'yesno': return value ? 'Yes' : 'No';
    case 'choice': return optionLabel(field, value);
    case 'number': return String(value);
    case 'dims': {
        const [a, b] = field.display;
        const show = (unit) => value.map((n) => trim1(n / KINDS.length.factor[unit])).join(' × ');
        return `${show(a)} ${a} (${show(b)} ${b})`;
    }
    case 'temp': {
        const [a, b] = field.display;
        return `${minus(String(Math.round(inUnit('temp', value, a))))}${UNIT_LABEL[a]} (${minus(String(Math.round(inUnit('temp', value, b))))}${UNIT_LABEL[b]})`;
    }
    default: {
        const units = field.display;
        const shown = units.map((u) => `${trim1(inUnit(field.kind, value, u))} ${UNIT_LABEL[u]}`);
        return shown.length > 1 ? `${shown[0]} (${shown.slice(1).join(', ')})` : shown[0];
    }
    }
}

/** The value as it goes in the editor or an export: "20F", "14 oz", "18 x 5 x 5 in". */
export function specInput(key, value) {
    const field = SPEC_FIELDS[key];
    if (!field || value === undefined || value === null) return '';
    switch (field.kind) {
    case 'text': return String(value);
    case 'yesno': return value ? 'yes' : 'no';
    case 'choice': return optionLabel(field, value);
    case 'number': return String(value);
    case 'dims': return `${value.map((n) => trim1(n / KINDS.length.factor[field.unit])).join(' x ')} ${field.unit}`;
    case 'temp': return `${Math.round(inUnit('temp', value, field.unit))}${field.unit}`;
    default: return `${trim1(inUnit(field.kind, value, field.unit))} ${field.unit}`;
    }
}

/** A catalog item's specs as rows for its gear page: [{ key, label, text }]. */
export function specRows(category, specs) {
    const type = specTypeFor(category);
    if (!type || !specs) return [];
    return type.fields.filter((k) => specs[k] !== undefined && specs[k] !== null)
        .map((key) => ({ key, label: SPEC_FIELDS[key].label, text: formatSpec(key, specs[key]) }));
}

/** How a field is filtered in the API: 'range' for measures, 'match' for choices. */
export function filterKind(key) {
    const field = SPEC_FIELDS[key];
    if (!field) return null;
    if (['temp', 'weight', 'length', 'volume', 'number'].includes(field.kind) || (field.kind === 'choice' && field.numeric)) return 'range';
    if (field.kind === 'choice' || field.kind === 'yesno' || field.kind === 'text') return 'match';
    return null;
}

/** How a value compares in a filter: words without regard to case, the rest as written. */
export function matchKey(key, value) {
    const field = SPEC_FIELDS[key];
    return field && field.kind === 'text' ? String(value ?? '').trim().toLowerCase() : String(value);
}
