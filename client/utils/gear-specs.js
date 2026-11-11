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
import { unitSystemOf } from './units.js';

// ---- kinds of value -----------------------------------------------------------

const round = (n) => Math.round(n * 10) / 10;

// "1/8", "1 1/2", "1-1/2", "⅛" → decimals, so a 1/8" pad reads as 0.125 in.
const VULGAR = { '¼': '1/4', '½': '1/2', '¾': '3/4', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8' };
const fractions = (text) => text
    .replace(/(\d)?\s*([¼½¾⅛⅜⅝⅞])/g, (_, whole, v) => `${whole ? `${whole} ` : ''}${VULGAR[v]}`)
    .replace(/(?:(\d+)[\s-]+)?(\d+)\/(\d+)/g, (all, whole, num, den) => (
        Number(den) ? String(Number(whole || 0) + Number(num) / Number(den)) : all
    ));
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
        units: { cm: 'cm', mm: 'mm', m: 'm', in: 'in', inch: 'in', inches: 'in', '"': 'in', ft: 'ft', feet: 'ft', foot: 'ft', "'": 'ft' },
        factor: { cm: 1, mm: 0.1, m: 100, in: 2.54, ft: 30.48 },
        min: 0,
        max: 1000,
    },
    volume: {
        stored: 'L',
        units: { l: 'L', liter: 'L', liters: 'L', litre: 'L', litres: 'L', ml: 'ml', ci: 'ci', 'cu in': 'ci', cuin: 'ci', 'cubic inches': 'ci' },
        factor: { L: 1, ml: 0.001, ci: 0.016387064 },
        min: 0,
        max: 200,
    },
};

/** A field kind's value in stored units, from "20F", "14 oz", "72 in"... */
function measure(kindName, raw, defaultUnit) {
    const kind = KINDS[kindName];
    const text = fractions(String(raw).trim().toLowerCase().replace(/°/g, '').replace(/,/g, '.').replace(/[’′]/g, "'").replace(/[”″]/g, '"'));
    // Feet and inches: "11 ft 6 in", "11' 6\"", "11ft6".
    const ftIn = kindName === 'length' && text.match(/^(\d+(?:\.\d+)?)\s*(?:ft|feet|foot|')\s*(\d+(?:\.\d+)?)\s*(?:in|inch|inches|"|'')?$/);
    if (ftIn) {
        const stored = Number(ftIn[1]) * 30.48 + Number(ftIn[2]) * 2.54;
        return stored > kind.max ? null : round(stored);
    }
    const m = text.match(/^(-?(?:\d+(?:\.\d+)?|\.\d+))\s*([a-z"' ]*)$/);
    if (!m) return null;
    const n = Number(m[1]);
    const unitText = m[2].trim();
    const unit = unitText ? kind.units[unitText] : defaultUnit;
    if (!unit || !Number.isFinite(n)) return null;
    const stored = kind.toStored ? kind.toStored(n, unit) : n * kind.factor[unit];
    if (stored < kind.min || stored > kind.max) return null;
    // A 0.75 L pot and a 1/8" pad (0.32 cm) keep their hundredths.
    return (kindName === 'volume' || kindName === 'length') && Math.abs(stored) < 10 ? Math.round(stored * 100) / 100 : round(stored);
}

// ---- fields --------------------------------------------------------------------

const yesNo = { kind: 'yesno' };
const num = (min, max, extra = {}) => ({ kind: 'number', min, max, ...extra });
const IP_RATINGS = ['IPX4', 'IPX5', 'IPX6', 'IPX7', 'IPX8', 'IP54', 'IP65', 'IP66', 'IP67', 'IP68'];
const choice = (options) => ({ kind: 'choice', options });
const FILL_POWERS = [450, 550, 650, 750, 800, 850, 900, 950, 1000];

/**
 * Every spec field. kind: temp | weight | length | volume | dims | number |
 * choice | yesno | text (free words, up to `max` characters). unit: what a bare number means when typed or imported.
 * placeholder: the editor's hint, when the kind's usual one doesn't fit.
 * A number's `suffix` is its unit, shown after it ("400 lm") and accepted
 * when typed ("400 lumens", "10,000 mAh"); `decimals` how many it keeps (1).
 * better: 'high' or 'low', which way is better, for "best" on /compare.
 * swap: what a lighter swap must keep (likeForLikeSpecs): 'same' (a squeeze
 * filter for a squeeze filter), { atLeast: 0.8 } (a power bank with at
 * least 80% of the capacity), { near: 0.25 } (a pot within 25% of the size).
 * range: a measured field's usual span (stored units), for Explore's slider
 * before the catalog has enough values of its own.
 * options: [value, label] for a choice; `aliases` other ways it's written.
 */
export const SPEC_FIELDS = {
    // Packs
    max_carry: { label: 'Max carry weight', kind: 'weight', unit: 'lb', display: ['lb', 'kg'], range: [4500, 27500], better: 'high' },
    volume: { label: 'Volume', kind: 'volume', unit: 'L', display: ['L'], range: [10, 90] },
    strap_type: { label: 'Shoulder straps', ...choice([['j_curve', 'J-curve'], ['s_curve', 'S-curve'], ['vest', 'Vest'], ['other', 'Other']]) },
    frame: { label: 'Frame', ...choice([['framed', 'Framed'], ['frameless', 'Frameless']]) },
    roll_top: { label: 'Roll top', ...yesNo },
    adjustable_torso: { label: 'Adjustable torso', ...yesNo },
    hip_belt: { label: 'Hip belt', ...choice([['fixed', 'Fixed'], ['removable', 'Removable'], ['none', 'None']]), aliases: { yes: 'fixed', sewn: 'fixed', detachable: 'removable', no: 'none', webbing: 'none' } },
    pack_type: { label: 'Pack type', ...choice([['fastpack', 'Fastpack'], ['pack', 'Pack'], ['hydration_vest', 'Hydration vest']]), aliases: { backpack: 'pack', fast: 'fastpack', vest: 'hydration_vest', runningvest: 'hydration_vest', hydrationpack: 'hydration_vest' } },
    // Free text: fabrics keep changing (Ultra 200, Robic 210D, ECOPAK...).
    fabric: { label: 'Fabric', kind: 'text', max: 60 },

    // Tents
    capacity: { label: 'Size', ...choice([['1p', '1P'], ['1p_plus', '1P+'], ['2p', '2P'], ['2p_plus', '2P+'], ['3p', '3P']]), aliases: { '1': '1p', '2': '2p', '3': '3p', '1person': '1p', '2person': '2p', '3person': '3p' } },
    pitch: { label: 'Pitch', ...choice([['trekking_pole', 'Trekking pole'], ['semi_freestanding', 'Semi-freestanding'], ['freestanding', 'Freestanding']]) },
    min_weight: { label: 'Minimum weight', kind: 'weight', unit: 'oz', display: ['oz', 'g'], range: [200, 3000], better: 'low' },
    trail_weight: { label: 'Trail weight', kind: 'weight', unit: 'oz', display: ['oz', 'g'], range: [200, 3000], better: 'low' },
    vestibules: { label: 'Vestibules', kind: 'number', min: 0, max: 4, integer: true, range: [0, 4] },
    double_wall: { label: 'Double walled', ...yesNo },
    floor_width: { label: 'Floor width', kind: 'length', unit: 'in', display: ['in', 'cm'], range: [50, 150] },
    floor_length: { label: 'Floor length', kind: 'length', unit: 'in', display: ['in', 'cm'], range: [180, 240] },
    peak_height: { label: 'Peak height', kind: 'length', unit: 'in', display: ['in', 'cm'], range: [60, 140] },
    packed_size: { label: 'Packed size', kind: 'dims', unit: 'in', display: ['in', 'cm'] },

    // Quilts, sleeping bags, insulated layers
    temp_comfort: { label: 'Comfort rating', kind: 'temp', unit: 'F', display: ['F', 'C'], range: [-20, 15], better: 'low' },
    temp_limit: { label: 'Limit rating', kind: 'temp', unit: 'F', display: ['F', 'C'], range: [-25, 10], better: 'low' },
    insulation: { label: 'Insulation', ...choice([['down', 'Down'], ['synthetic', 'Synthetic'], ['fleece', 'Fleece']]), aliases: { goose: 'down', duck: 'down', goosedown: 'down', primaloft: 'synthetic', climashield: 'synthetic', apex: 'synthetic', polartec: 'fleece', alpha: 'fleece' } },
    fill_power: { label: 'Fill power', kind: 'choice', options: FILL_POWERS.map((n) => [String(n), `${n} fill`]), numeric: true, onlyWhen: { insulation: 'down' }, better: 'high' },
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
    r_value: { label: 'R-value', kind: 'number', min: 0, max: 15, range: [0, 8], better: 'high', placeholder: 'e.g. 4.5 or 0.5' },
    thickness: { label: 'Thickness', kind: 'length', unit: 'in', display: ['in', 'cm'], range: [0, 12], placeholder: '2.5 in, 1/8" or 6 cm' },
    pad_width: { label: 'Width', kind: 'length', unit: 'in', display: ['in', 'cm'], range: [40, 80] },
    pad_length: { label: 'Length', kind: 'length', unit: 'in', display: ['in', 'cm'], range: [100, 220] },
    pad_type: { label: 'Type', ...choice([['closed_cell', 'Closed-cell foam'], ['inflatable', 'Inflatable'], ['self_inflating', 'Self-inflating']]), aliases: { ccf: 'closed_cell', foam: 'closed_cell', closedcellfoam: 'closed_cell', air: 'inflatable' } },

    // Rain and wind shells
    waterproof_mm: { label: 'Waterproof rating', ...num(0, 60000, { integer: true, suffix: 'mm', range: [5000, 30000], better: 'high' }) },
    breathability: { label: 'Breathability', ...num(0, 100000, { integer: true, suffix: 'g/m²/24h', units: ['g/m2/24h', 'g/m2', 'g', 'mvtr'], range: [5000, 40000], better: 'high' }) },
    membrane: { label: 'Membrane', kind: 'text', max: 40 },
    pit_zips: { label: 'Pit zips', ...yesNo },

    // Headlamps and lights
    lumens: { label: 'Brightness', ...num(0, 10000, { integer: true, suffix: 'lm', units: ['lumen', 'lumens'], range: [50, 1500], better: 'high', swap: { atLeast: 0.6 } }) },
    beam_distance: { label: 'Beam distance', ...num(0, 1000, { integer: true, suffix: 'm', units: ['meters', 'metres'], range: [10, 200], better: 'high' }) },
    runtime: { label: 'Runtime (longest mode)', ...num(0, 2000, { suffix: 'h', units: ['hr', 'hrs', 'hour', 'hours'], range: [1, 300], better: 'high' }) },
    battery: { label: 'Battery', ...choice([['built_in', 'Built-in rechargeable'], ['hybrid', 'Rechargeable or AAA'], ['aaa', 'AAA'], ['aa', 'AA'], ['18650', '18650'], ['21700', '21700'], ['cr123', 'CR123A'], ['other', 'Other']]), aliases: { rechargeable: 'built_in', builtin: 'built_in', internal: 'built_in', liion: 'built_in', lipo: 'built_in', cr123a: 'cr123', '3aaa': 'aaa', '2aa': 'aa' } },
    charge_port: { label: 'Charging', ...choice([['usb_c', 'USB-C'], ['micro_usb', 'Micro-USB'], ['magnetic', 'Magnetic'], ['none', 'None']]), aliases: { usbc: 'usb_c', typec: 'usb_c', microusb: 'micro_usb', micro: 'micro_usb', no: 'none' } },
    red_light: { label: 'Red light', ...yesNo },
    ip_rating: { label: 'Water resistance', ...choice(IP_RATINGS.map((r) => [r.toLowerCase(), r])) },

    // Power banks
    capacity_mah: { label: 'Capacity', ...num(0, 60000, { integer: true, suffix: 'mAh', range: [3000, 27000], better: 'high', swap: { atLeast: 0.8 } }) },
    output_w: { label: 'Max output', ...num(0, 300, { suffix: 'W', units: ['watt', 'watts'], range: [10, 100], better: 'high' }) },
    usb_c_ports: { label: 'USB-C ports', ...num(0, 6, { integer: true, range: [0, 3] }) },
    usb_a_ports: { label: 'USB-A ports', ...num(0, 6, { integer: true, range: [0, 3] }) },
    passthrough: { label: 'Pass-through charging', ...yesNo },

    // Stoves
    fuel: { label: 'Fuel', ...choice([['canister', 'Canister'], ['alcohol', 'Alcohol'], ['solid', 'Solid fuel'], ['wood', 'Wood'], ['liquid', 'Liquid fuel'], ['multi', 'Multi-fuel']]), aliases: { isobutane: 'canister', gas: 'canister', isopro: 'canister', esbit: 'solid', tablets: 'solid', white: 'liquid', whitegas: 'liquid', multifuel: 'multi' }, swap: 'same' },
    boil_time: { label: 'Boil time (1 L)', ...num(0, 30, { suffix: 'min', units: ['mins', 'minute', 'minutes'], range: [2, 10], better: 'low' }) },
    piezo: { label: 'Push-button igniter', ...yesNo },
    integrated_pot: { label: 'Pot included', ...yesNo },

    // Pots and cookware
    pot_volume: { label: 'Capacity', kind: 'volume', unit: 'L', display: ['L'], range: [0.3, 2], swap: { near: 0.25 } },
    material: { label: 'Material', ...choice([['titanium', 'Titanium'], ['aluminum', 'Aluminum'], ['stainless', 'Stainless steel'], ['silicone', 'Silicone'], ['other', 'Other']]), aliases: { ti: 'titanium', aluminium: 'aluminum', anodized: 'aluminum', hardanodized: 'aluminum', steel: 'stainless', stainlesssteel: 'stainless' } },
    lid: { label: 'Lid', ...yesNo },
    measuring_marks: { label: 'Measuring marks', ...yesNo },

    // Water filters
    filter_type: { label: 'Type', ...choice([['squeeze', 'Squeeze'], ['gravity', 'Gravity'], ['pump', 'Pump'], ['straw', 'Straw'], ['bottle', 'Filter bottle'], ['inline', 'Inline'], ['chemical', 'Tablets or drops'], ['uv', 'UV']]), aliases: { tablets: 'chemical', drops: 'chemical', chlorine: 'chemical', chlorinedioxide: 'chemical', uvlight: 'uv' }, swap: 'same' },
    flow_rate: { label: 'Flow rate', ...num(0, 10, { suffix: 'L/min', units: ['l/min', 'lpm'], range: [0.2, 3], better: 'high' }) },
    pore_size: { label: 'Pore size', ...num(0, 5, { decimals: 2, suffix: 'µm', units: ['um', 'micron', 'microns'], range: [0.01, 0.5], better: 'low' }) },
    removes_viruses: { label: 'Removes viruses', ...yesNo },
    lifespan_l: { label: 'Lifespan', ...num(0, 1000000, { integer: true, suffix: 'L', units: ['liters', 'litres', 'gal'], range: [100, 400000], better: 'high' }) },

    // Shoes
    shoe_type: { label: 'Type', ...choice([['trail_runner', 'Trail runner'], ['hiking_shoe', 'Hiking shoe'], ['boot', 'Boot'], ['sandal', 'Sandal'], ['camp', 'Camp shoe']]), aliases: { trailrunner: 'trail_runner', runner: 'trail_runner', hiker: 'hiking_shoe', boots: 'boot', sandals: 'sandal' }, swap: 'same' },
    drop: { label: 'Drop', ...num(0, 20, { suffix: 'mm', range: [0, 12] }) },
    stack_height: { label: 'Stack height', ...num(0, 60, { suffix: 'mm', range: [15, 45] }) },
    waterproof: { label: 'Waterproof', ...yesNo },
    shoe_width: { label: 'Width', ...choice([['narrow', 'Narrow'], ['regular', 'Regular'], ['wide', 'Wide']]), aliases: { standard: 'regular', medium: 'regular', d: 'regular', '2e': 'wide', ee: 'wide' } },

    // Trekking poles
    pole_material: { label: 'Material', ...choice([['carbon', 'Carbon'], ['aluminum', 'Aluminum'], ['mixed', 'Carbon and aluminum']]), aliases: { carbonfiber: 'carbon', aluminium: 'aluminum' } },
    pole_adjust: { label: 'Length', ...choice([['fixed', 'Fixed'], ['adjustable', 'Adjustable'], ['folding', 'Folding'], ['folding_adjustable', 'Folding, adjustable']]), aliases: { telescoping: 'adjustable', zpole: 'folding' } },
    pole_lock: { label: 'Lock', ...choice([['lever', 'Lever'], ['twist', 'Twist'], ['push_button', 'Push-button'], ['none', 'None']]), aliases: { flicklock: 'lever', clamp: 'lever', button: 'push_button' } },
    collapsed_length: { label: 'Collapsed length', kind: 'length', unit: 'in', display: ['in', 'cm'], range: [30, 80], better: 'low' },
    max_length: { label: 'Longest length', kind: 'length', unit: 'in', display: ['in', 'cm'], range: [100, 145] },

    // Tarps
    tarp_size: { label: 'Size', kind: 'dims', unit: 'ft', display: ['ft', 'm'] },
    tarp_length: { label: 'Length', kind: 'length', unit: 'ft', display: ['ftin', 'cm'], range: [240, 400] },
    tarp_shape: {
        label: 'Shape',
        ...choice([['rectangular', 'Flat (rectangular)'], ['hex', 'Hex'], ['asym', 'Asymmetrical'], ['winter', 'Winter'], ['square', 'Square'], ['cat_cut', 'Catenary cut'], ['diamond', 'Diamond'], ['other', 'Other']]),
        aliases: { flat: 'rectangular', rectangle: 'rectangular', catenary: 'cat_cut', catcut: 'cat_cut', hexagonal: 'hex', asymmetrical: 'asym', asymmetric: 'asym', wintertarp: 'winter' },
    },
    tarp_material: {
        label: 'Material',
        ...choice([['dcf', 'Dyneema (DCF)'], ['silnylon', 'Silnylon'], ['silpoly', 'Silpoly'], ['nylon', 'Nylon (PU)'], ['polyester', 'Polyester'], ['other', 'Other']]),
        aliases: { dyneema: 'dcf', cuben: 'dcf', ctf: 'dcf', dyneemacompositefabric: 'dcf', dcfdyneema: 'dcf', silnylon: 'silnylon', silpoly: 'silpoly', silpolyester: 'silpoly', punylon: 'nylon', nylonpu: 'nylon', poly: 'polyester' },
    },
    side_pullouts: { label: 'Side panel pullouts', ...yesNo },
    bonded: { label: 'Bonded seams', ...yesNo },
    seam_sealed: { label: 'Seam sealed', ...yesNo },
    doors: { label: 'Doors', ...yesNo },
    tie_outs: { label: 'Tie-outs', ...num(0, 40, { integer: true, range: [4, 20] }) },

    // Hammocks
    hammock_length: { label: 'Length', kind: 'length', unit: 'ft', display: ['ftin', 'cm'], range: [270, 370] },
    hammock_width: { label: 'Width', kind: 'length', unit: 'in', display: ['in', 'cm'], range: [140, 185] },
    hammock_shape: { label: 'Lay', ...choice([['symmetrical', 'Symmetrical'], ['asymmetrical', 'Asymmetrical']]), aliases: { sym: 'symmetrical', gathered: 'symmetrical', gatheredend: 'symmetrical', asym: 'asymmetrical', asymmetric: 'asymmetrical', symmetric: 'symmetrical' } },
    lay_direction: { label: 'Lay direction', ...choice([['head_left', 'Head left, foot right'], ['head_right', 'Head right, foot left']]), aliases: { left: 'head_left', headleft: 'head_left', headleftfootright: 'head_left', lh: 'head_left', right: 'head_right', headright: 'head_right', headrightfootleft: 'head_right', rh: 'head_right' }, onlyWhen: { hammock_shape: 'asymmetrical' } },
    bug_net: { label: 'Integrated bug net', ...yesNo },
    ridgeline: { label: 'Structural ridgeline', ...yesNo },
    hammock_layers: { label: 'Layers', ...choice([['single', 'Single layer'], ['double', 'Double layer']]), aliases: { '1': 'single', '2': 'double', singlelayer: 'single', doublelayer: 'double' } },
    wide: { label: 'Wide', ...yesNo },
};

/** Gear types with specs: which categories they cover and their fields, in order. */
export const SPEC_TYPES = [
    {
        id: 'pack', label: 'Pack', categories: ['Pack', 'Backpack', 'Rucksack', 'Fastpack', 'Fast Pack', 'Hydration Vest', 'Running Vest'],
        fields: ['volume', 'max_carry', 'gender', 'pack_type', 'frame', 'strap_type', 'hip_belt', 'roll_top', 'adjustable_torso', 'fabric'],
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
        id: 'outer', label: 'Outer layer',
        categories: ['Outer Layer', 'Insulation', 'Insulated Jacket', 'Puffy', 'Puffy Jacket', 'Puffer', 'Down Jacket', 'Down Hoody',
            'Synthetic Jacket', 'Insulated Hoody', 'Insulating Layer', 'Insulated Layer', 'Mid Layer', 'Fleece', 'Vest', 'Down Vest',
            'Insulated Pants', 'Down Pants'],
        fields: ['insulation', 'fill_power', 'fill_weight', 'gender', 'hooded', 'zipper', 'baffles', 'rds', 'fabric'],
    },
    {
        id: 'shell', label: 'Rain or wind shell',
        categories: ['Shell', 'Rain Gear', 'Rainwear', 'Rain Jacket', 'Rain Shell', 'Rain Pants', 'Hardshell', 'Softshell',
            'Wind Shell', 'Wind Layer', 'Wind Jacket', 'Wind Shirt', 'Windbreaker', 'Poncho'],
        fields: ['waterproof_mm', 'breathability', 'membrane', 'gender', 'hooded', 'pit_zips', 'fabric'],
    },
    {
        id: 'light', label: 'Headlamp or light', categories: ['Headlamp', 'Head Lamp', 'Flashlight', 'Torch', 'Lantern', 'Light', 'Lights'],
        fields: ['lumens', 'runtime', 'beam_distance', 'battery', 'charge_port', 'red_light', 'ip_rating'],
    },
    {
        id: 'power', label: 'Power bank', categories: ['Power Bank', 'Battery Bank', 'Battery Pack', 'Portable Charger'],
        fields: ['capacity_mah', 'output_w', 'usb_c_ports', 'usb_a_ports', 'passthrough', 'ip_rating'],
    },
    {
        id: 'stove', label: 'Stove', categories: ['Stove', 'Cook System', 'Cooking System', 'Stove System', 'Canister Stove', 'Alcohol Stove'],
        fields: ['fuel', 'boil_time', 'piezo', 'integrated_pot'],
    },
    {
        id: 'cookware', label: 'Pot', categories: ['Pot', 'Cook Pot', 'Cookware', 'Cookset', 'Cook Set', 'Mug', 'Cup', 'Kettle', 'Pan'],
        fields: ['pot_volume', 'material', 'lid', 'measuring_marks'],
    },
    {
        id: 'filter', label: 'Water filter', categories: ['Water Filter', 'Filter', 'Water Treatment', 'Water Purifier', 'Purifier'],
        fields: ['filter_type', 'flow_rate', 'pore_size', 'removes_viruses', 'lifespan_l'],
    },
    {
        id: 'shoe', label: 'Shoe',
        categories: ['Shoes', 'Shoe', 'Footwear', 'Trail Runners', 'Trail Runner', 'Trail Shoes', 'Hiking Shoes', 'Boots', 'Hiking Boots', 'Sandals', 'Camp Shoes'],
        fields: ['shoe_type', 'gender', 'drop', 'stack_height', 'waterproof', 'shoe_width'],
    },
    {
        id: 'poles', label: 'Trekking poles', categories: ['Trekking Poles', 'Trekking Pole', 'Poles', 'Hiking Poles'],
        fields: ['pole_material', 'pole_adjust', 'pole_lock', 'collapsed_length', 'max_length'],
    },
    {
        id: 'tarp', label: 'Tarp', categories: ['Tarp', 'Hammock Tarp'],
        fields: ['tarp_length', 'tarp_shape', 'wide', 'tarp_material', 'side_pullouts', 'bonded', 'seam_sealed', 'doors', 'tie_outs', 'tarp_size', 'fabric'],
    },
    {
        id: 'hammock', label: 'Hammock', categories: ['Hammock', 'Camping Hammock', 'Backpacking Hammock', 'Bridge Hammock', 'Gathered End Hammock'],
        fields: ['hammock_length', 'hammock_width', 'hammock_shape', 'lay_direction', 'bug_net', 'ridgeline', 'hammock_layers', 'wide', 'fabric'],
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
        // "10,000 mAh", "400 lumens", "0,1": thousands grouped, a decimal
        // comma, and the field's own unit after the number.
        const grouped = /^\d{1,3}([,\s]\d{3})+(?!\d)/.test(text);
        const plain = grouped ? text.replace(/(\d)[,\s](?=\d{3}(?!\d))/g, '$1') : text.replace(',', '.');
        // ".5" is 0.5 (an R-value under one).
        const m = plain.match(/^(-?(?:\d+(?:\.\d+)?|\.\d+))\s*(.*)$/);
        const unit = m ? m[2].trim().toLowerCase() : '';
        const units = [field.suffix, ...(field.units || [])].filter(Boolean).map((u) => u.toLowerCase());
        const n = m ? Number(m[1]) : NaN;
        const range = `${field.label}: a number from ${field.min} to ${field.max}${field.suffix ? ` ${field.suffix}` : ''}`;
        if (!m || (unit && !units.includes(unit))) return { error: range };
        // Gallons of filter lifespan, in liters.
        const value = unit === 'gal' ? n * 3.785411784 : n;
        if (!Number.isFinite(value) || value < field.min || value > field.max) return { error: range };
        if (field.integer && unit !== 'gal' && !Number.isInteger(value)) return { error: `${range}, whole` };
        if (field.integer) return { value: Math.round(value) };
        const places = 10 ** (field.decimals ?? 1);
        return { value: Math.round(value * places) / places };
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

const UNIT_LABEL = { F: '°F', C: '°C', g: 'g', kg: 'kg', oz: 'oz', lb: 'lb', in: 'in', cm: 'cm', ft: 'ft', m: 'm', L: 'L' };

// "10,000 mAh", "400 lm", "2.5 min".
const withSuffix = (field, value) => {
    const n = Number(value) >= 10000 ? Number(value).toLocaleString('en-US') : String(value);
    return field.suffix ? `${n} ${field.suffix}` : n;
};
const minus = (s) => s.replace(/^-/, '−');

// Inches in eighths, as pads and gear are sold: "1/8", "3/8", "2 3/4";
// halves and wholes as decimals ("2.5", "72"); anything else to a tenth.
const inchText = (n) => {
    const eighths = Math.round(n * 8);
    if (Math.abs(n * 8 - eighths) > 0.1 || eighths % 4 === 0 || eighths <= 0) return trim1(n);
    const whole = Math.floor(eighths / 8);
    let num = eighths % 8;
    let den = 8;
    while (num % 2 === 0) {
        num /= 2;
        den /= 2;
    }
    return whole ? `${whole} ${num}/${den}` : `${num}/${den}`;
};

// A length in feet and whole inches: "11 ft 6 in", "10 ft" (display 'ftin').
const feetAndInches = (cm) => {
    const inches = Math.round(cm / 2.54);
    const ft = Math.floor(inches / 12);
    const rest = inches % 12;
    return rest ? `${ft} ft ${rest} in` : `${ft} ft`;
};

const optionLabel = (field, value) => {
    const hit = field.options.find(([v]) => String(v) === String(value));
    return hit ? hit[1] : String(value);
};

/**
 * A stored value as people read it: "20°F (−7°C)", "40 L", "Yes". With a
 * unit system ('imperial' or 'metric'), only that system's unit: "20°F" or
 * "−7°C".
 */
export function formatSpec(key, value, system = null) {
    const field = SPEC_FIELDS[key];
    if (!field || value === undefined || value === null) return '';
    // The field's units in the reader's system, when they have one.
    const pick = (units) => {
        if (!system) return units;
        const mine = units.filter((u) => unitSystemOf(u) === system);
        return mine.length ? mine : units;
    };
    switch (field.kind) {
    case 'text': return String(value);
    case 'yesno': return value ? 'Yes' : 'No';
    case 'choice': return optionLabel(field, value);
    case 'number': return withSuffix(field, value);
    case 'dims': {
        const [a, b] = pick(field.display);
        const show = (unit) => value.map((n) => trim1(n / KINDS.length.factor[unit])).join(' × ');
        return b ? `${show(a)} ${a} (${show(b)} ${b})` : `${show(a)} ${a}`;
    }
    case 'temp': {
        const deg = (u) => `${minus(String(Math.round(inUnit('temp', value, u))))}${UNIT_LABEL[u]}`;
        const [a, b] = pick(field.display);
        return b ? `${deg(a)} (${deg(b)})` : deg(a);
    }
    default: {
        const units = pick(field.display);
        const shown = units.map((u) => {
            if (u === 'ftin') return feetAndInches(value);
            if (u === 'in' && field.kind === 'length') return `${inchText(inUnit('length', value, 'in'))} in`;
            // A thin pad in millimeters: "3.2 mm", not "0.3 cm".
            if (u === 'cm' && field.kind === 'length' && value < 1) return `${trim1(value * 10)} mm`;
            return `${trim1(inUnit(field.kind, value, u))} ${UNIT_LABEL[u]}`;
        });
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
    case 'number': return field.suffix ? `${value} ${field.suffix}` : String(value);
    case 'dims': return `${value.map((n) => trim1(n / KINDS.length.factor[field.unit])).join(' x ')} ${field.unit}`;
    case 'temp': return `${Math.round(inUnit('temp', value, field.unit))}${field.unit}`;
    default: return field.kind === 'length' && field.unit === 'in'
        ? `${inchText(inUnit('length', value, 'in'))} in`
        : `${trim1(inUnit(field.kind, value, field.unit))} ${field.unit}`;
    }
}

/** A catalog item's specs as rows for its gear page: [{ key, label, text }]. */
export function specRows(category, specs, system = null) {
    const type = specTypeFor(category);
    if (!type || !specs) return [];
    return type.fields.filter((k) => specs[k] !== undefined && specs[k] !== null)
        .map((key) => ({ key, label: SPEC_FIELDS[key].label, text: formatSpec(key, specs[key], system) }));
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

// ---- comparing ----------------------------------------------------------------------

/**
 * Does a lighter swap keep what matters (each field's `swap`)? Only judged on
 * specs both have: the same filter type or stove fuel, a power bank with at
 * least 80% of the capacity, a headlamp at least 60% as bright, a pot within
 * 25% of the size.
 */
export function likeForLikeSpecs(mine = {}, option = {}) {
    const a = mine || {};
    const b = option || {};
    for (const [key, field] of Object.entries(SPEC_FIELDS)) {
        const rule = field.swap;
        if (!rule || a[key] === undefined || a[key] === null || b[key] === undefined || b[key] === null) continue;
        if (rule === 'same' && String(a[key]) !== String(b[key])) return false;
        if (rule.atLeast && Number(b[key]) < Number(a[key]) * rule.atLeast) return false;
        if (rule.near && Math.abs(Number(b[key]) - Number(a[key])) > Number(a[key]) * rule.near) return false;
    }
    return true;
}

/**
 * Spec rows for gear side by side (/compare): every field any of them has,
 * in their types' order, with each item's text ('' when it doesn't say) and
 * which are best where a field has a better way and two or more say.
 * items: [{ category, specs }]. Returns [{ key, label, cells: [{ text, best }] }].
 */
export function compareSpecRows(items, system = null) {
    const keys = [];
    for (const i of items) {
        const type = specTypeFor(i.category);
        if (!type) continue;
        for (const k of type.fields) if (!keys.includes(k)) keys.push(k);
    }
    const has = (i, k) => {
        const type = specTypeFor(i.category);
        return Boolean(type && type.fields.includes(k) && i.specs && i.specs[k] !== undefined && i.specs[k] !== null);
    };
    return keys.filter((k) => items.some((i) => has(i, k))).map((key) => {
        const field = SPEC_FIELDS[key];
        const values = items.map((i) => (has(i, key) ? i.specs[key] : null));
        const known = values.filter((v) => v !== null).map(Number);
        let best = null;
        if (field.better && known.length > 1 && known.every(Number.isFinite) && new Set(known).size > 1) {
            best = field.better === 'high' ? Math.max(...known) : Math.min(...known);
        }
        return {
            key,
            label: field.label,
            better: field.better || null,
            cells: values.map((v) => ({ text: v === null ? '' : formatSpec(key, v, system), best: v !== null && best !== null && Number(v) === best })),
        };
    });
}
