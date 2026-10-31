// Explore gear: the catalog by category (/explore) and one category with
// filters (/explore/shelter). Shared by the server, which renders the page
// and applies a link's filters on first load, and the browser
// (client/explore-gear.js), which filters in place as you go.
//
// Categories sit under four parents, always first and in this order: Pack,
// Shelter, Sleep System, Clothing (the list groups from gear-meta.js, plus
// packs). Everything else follows A–Z.

import { categoryKey, defaultGroupFor } from './gear-meta.js';
import { specTypeFor, SPEC_FIELDS, SPEC_TYPES, filterKind, formatSpec } from './gear-specs.js';

export const PARENTS = [
    { slug: 'pack', name: 'Pack', note: 'Backpacks, frameless to framed' },
    { slug: 'shelter', name: 'Shelter', note: 'Tents, tarps, bivies and hammocks' },
    { slug: 'sleep-system', name: 'Sleep System', note: 'Quilts, bags, pads and pillows' },
    { slug: 'clothing', name: 'Clothing', note: 'Layers, shells, socks and shoes' },
];
const PARENT_BY_GROUP = { Shelter: 'shelter', 'Sleep System': 'sleep-system', Clothing: 'clothing' };

export const slugify = (name) => String(name || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** The parent a catalog category sits under ('shelter'...), or null. */
export function parentOf(category) {
    const k = categoryKey(category);
    if (!k) return null;
    const type = specTypeFor(category);
    if ((type && type.id === 'pack') || k === 'pack') return 'pack';
    const group = defaultGroupFor(category);
    if (PARENT_BY_GROUP[group]) return PARENT_BY_GROUP[group];
    // A category named like the parent itself ("Shelter", "Sleep").
    if (k === 'shelter') return 'shelter';
    if (k === 'sleep' || k === 'sleepsystem') return 'sleep-system';
    if (k === 'clothing' || k === 'clothe') return 'clothing';
    return null;
}

/**
 * The /explore page: [{ slug, name, note, count, children: [{ slug, name, count }] }],
 * the four parents first (always, even while empty), then other categories A–Z.
 * categories: [{ name, count }] (catalog.categories()).
 */
export function exploreIndex(categories) {
    const parents = PARENTS.map((p) => ({ ...p, count: 0, children: [] }));
    const others = new Map();
    for (const c of categories) {
        if (!c.name || !c.count) continue;
        const parentSlug = parentOf(c.name);
        // "Tent" and "Tents" are one category (categoryKey, as in lists).
        const key = categoryKey(c.name);
        const slug = parentSlug ? key : slugify(c.name);
        if (parentSlug) {
            const parent = parents.find((p) => p.slug === parentSlug);
            parent.count += c.count;
            const child = parent.children.find((x) => x.slug === slug);
            if (child) child.count += c.count;
            else parent.children.push({ slug, name: c.name, count: c.count });
        } else if (others.has(key)) {
            others.get(key).count += c.count;
        } else {
            others.set(key, { slug, name: c.name, count: c.count, children: [] });
        }
    }
    for (const p of parents) p.children.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    return [...parents, ...[...others.values()].sort((a, b) => a.name.localeCompare(b.name))];
}

/**
 * What /explore/:slug shows: a parent (all its categories) or one category.
 * Returns { slug, title, note, parent, categories: [names] } or null.
 */
export function resolveSection(slug, categories) {
    const parent = PARENTS.find((p) => p.slug === slug);
    if (parent) {
        return { slug, title: parent.name, note: parent.note, parent: null, categories: categories.filter((c) => parentOf(c.name) === slug).map((c) => c.name) };
    }
    const first = categories.find((c) => slugify(c.name) === slug || categoryKey(c.name) === slug);
    if (!first) return null;
    const names = categories.filter((c) => categoryKey(c.name) === categoryKey(first.name)).map((c) => c.name);
    const parentSlug = parentOf(names[0]);
    return { slug, title: names[0], note: '', parent: parentSlug ? PARENTS.find((p) => p.slug === parentSlug) : null, categories: names };
}

// ---- items and filters ---------------------------------------------------------

/** A catalog entry as the filters see it. */
export function filterItem(entry) {
    return {
        id: entry.id,
        cat: categoryKey(entry.category),
        catName: entry.category,
        brand: entry.brand || '',
        weight: Math.round((Number(entry.weightMg) || 0) / 1000 * 10) / 10, // grams
        price: entry.price === null || entry.price === undefined ? null : Number(entry.price),
        specs: entry.specs || {},
        name: entry.name,
    };
}

const optionLabel = (field, v) => {
    const hit = field.options.find(([o]) => String(o) === String(v));
    return hit ? hit[1] : String(v);
};

const niceStep = (span, steps = 60) => {
    if (!(span > 0)) return 1;
    const raw = span / steps;
    const p = 10 ** Math.floor(Math.log10(raw));
    return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw) || raw;
};

/**
 * The filters a section offers, with counts: categories, brands, weight and
 * price ranges, and its gear types' specs. `categories` are the section's
 * category names: their types' spec filters are always offered (every option
 * of a choice, a slider over the field's usual span), so a section's filters
 * don't wait for the catalog to fill in. Without them, only specs some items
 * have are offered.
 */
export function facetsFor(items, { categories = [] } = {}) {
    const count = (list) => {
        const m = new Map();
        for (const [value, label] of list) {
            const e = m.get(value) || { value, label, count: 0 };
            e.count++;
            m.set(value, e);
        }
        return [...m.values()];
    };
    const span = (min, max) => {
        const step = niceStep(max - min);
        return { min: Math.floor(min / step) * step, max: Math.ceil(max / step) * step, step };
    };
    const range = (values) => {
        const v = values.filter((n) => Number.isFinite(n));
        if (v.length < 2) return null;
        const min = Math.min(...v);
        const max = Math.max(...v);
        if (min === max) return null;
        return span(min, max);
    };

    const cats = count(items.map((i) => [i.cat, i.catName])).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    const brands = count(items.filter((i) => i.brand).map((i) => [i.brand.toLowerCase(), i.brand])).sort((a, b) => a.label.localeCompare(b.label));

    // Spec fields, in the order their types list them: the section's own
    // types (always offered), then any other types its items have.
    const sectionTypes = new Set(categories.map((c) => specTypeFor(c)).filter(Boolean));
    const keys = [];
    const always = new Set();
    for (const type of SPEC_TYPES) {
        const own = sectionTypes.has(type);
        if (!own && !items.some((i) => specTypeFor(i.catName) === type)) continue;
        for (const k of type.fields) {
            if (!keys.includes(k)) keys.push(k);
            if (own) always.add(k);
        }
    }
    const specs = [];
    for (const key of keys) {
        const field = SPEC_FIELDS[key];
        const values = items.map((i) => i.specs[key]).filter((v) => v !== undefined && v !== null);
        if (!values.length && !always.has(key)) continue;
        const kind = filterKind(key);
        if (kind === 'match') {
            const seen = new Map(
                (field.kind === 'yesno' ? count(values.map((v) => [String(v), v ? 'Yes' : 'No'])) : count(values.map((v) => [String(v), optionLabel(field, v)])))
                    .map((o) => [o.value, o]),
            );
            // Every option, in the field's own order; ones nothing has yet count 0.
            const all = field.kind === 'yesno' ? [['true', 'Yes'], ['false', 'No']] : field.options.map(([o, label]) => [String(o), label]);
            const opts = all.map(([value, label]) => seen.get(value) || { value, label, count: 0 });
            if (always.has(key) || opts.filter((o) => o.count).length > 1 || values.length < items.length) {
                specs.push({ key, label: field.label, kind: 'match', options: opts });
            }
        } else if (kind === 'range') {
            if (field.numeric) {
                // A choice in numbers (fill power): its options are the stops.
                const stops = always.has(key) ? field.options.map(([o]) => Number(o)) : [...new Set(values)].sort((a, b) => a - b);
                if (stops.length > 1) specs.push({ key, label: field.label, kind: 'range', min: stops[0], max: stops[stops.length - 1], step: 1, stops });
            } else {
                const r = range(values) || (always.has(key) && field.range ? span(field.range[0], field.range[1]) : null);
                if (r) specs.push({ key, label: field.label, kind: 'range', ...r });
            }
        }
    }
    return {
        cats,
        brands,
        weight: range(items.map((i) => i.weight)),
        price: range(items.map((i) => i.price).filter((p) => p !== null)),
        specs,
    };
}

/**
 * Filters from a query string (a link or the form):
 *   cat=tent,tarp  brand=zpacks  weight_min / weight_max (grams)
 *   price_min / price_max  <spec>=a,b  <spec>_min / <spec>_max (stored units)
 *   sort=weight|price|name
 */
export function readFilters(params) {
    const get = (k) => (typeof params.get === 'function' ? params.get(k) : params[k]);
    const list = (k) => String(get(k) || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 50);
    const num = (k) => {
        const v = get(k);
        return v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? undefined : Number(v);
    };
    const specs = {};
    for (const key of Object.keys(SPEC_FIELDS)) {
        const kind = filterKind(key);
        if (kind === 'match' && list(key).length) specs[key] = { any: list(key) };
        if (kind === 'range' && (num(`${key}_min`) !== undefined || num(`${key}_max`) !== undefined)) specs[key] = { min: num(`${key}_min`), max: num(`${key}_max`) };
    }
    return {
        cats: list('cat'),
        brands: list('brand').map((b) => b.toLowerCase()),
        weight: { min: num('weight_min'), max: num('weight_max') },
        price: { min: num('price_min'), max: num('price_max') },
        specs,
        sort: ['weight', 'price', 'name'].includes(get('sort')) ? get('sort') : 'weight',
    };
}

/** The same filters as a query string (only what's set), for links and the URL bar. */
export function filtersToQuery(f) {
    const p = new URLSearchParams();
    if (f.cats.length) p.set('cat', f.cats.join(','));
    if (f.brands.length) p.set('brand', f.brands.join(','));
    for (const [name, r] of [['weight', f.weight], ['price', f.price]]) {
        if (r.min !== undefined) p.set(`${name}_min`, String(r.min));
        if (r.max !== undefined) p.set(`${name}_max`, String(r.max));
    }
    for (const [key, s] of Object.entries(f.specs)) {
        if (s.any) p.set(key, s.any.join(','));
        if (s.min !== undefined) p.set(`${key}_min`, String(s.min));
        if (s.max !== undefined) p.set(`${key}_max`, String(s.max));
    }
    if (f.sort && f.sort !== 'weight') p.set('sort', f.sort);
    return p.toString();
}

const inRange = (v, r) => (r.min === undefined || (v !== null && v !== undefined && v >= r.min)) && (r.max === undefined || (v !== null && v !== undefined && v <= r.max));

/** Does an item pass the filters? Items without a filtered spec don't. */
export function matchesFilters(item, f) {
    if (f.cats.length && !f.cats.includes(item.cat)) return false;
    if (f.brands.length && !f.brands.includes(item.brand.toLowerCase())) return false;
    if ((f.weight.min !== undefined || f.weight.max !== undefined) && !inRange(item.weight, f.weight)) return false;
    if ((f.price.min !== undefined || f.price.max !== undefined) && !inRange(item.price, f.price)) return false;
    for (const [key, s] of Object.entries(f.specs)) {
        const v = item.specs[key];
        if (s.any && !s.any.includes(String(v))) return false;
        if ((s.min !== undefined || s.max !== undefined) && !inRange(typeof v === 'number' ? v : null, s)) return false;
    }
    return true;
}

/** Sort for the results: lightest first, cheapest first, or by name. */
export function sortItems(items, sort = 'weight') {
    const by = {
        weight: (a, b) => a.weight - b.weight || a.name.localeCompare(b.name),
        price: (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity) || a.weight - b.weight,
        name: (a, b) => `${a.brand} ${a.name}`.localeCompare(`${b.brand} ${b.name}`),
    };
    return [...items].sort(by[sort] || by.weight);
}

/** How many filters are on (for "Clear 3 filters"). */
export function activeFilterCount(f) {
    return f.cats.length + f.brands.length
        + (f.weight.min !== undefined || f.weight.max !== undefined ? 1 : 0)
        + (f.price.min !== undefined || f.price.max !== undefined ? 1 : 0)
        + Object.keys(f.specs).length;
}

// ---- showing values -------------------------------------------------------------

/** A weight in grams as people read it: "21.6 oz (612 g)", "3.1 lb (1.4 kg)". */
export function formatWeightG(g) {
    const oz = g / 28.349523125;
    if (oz < 32) return `${Math.round(oz * 10) / 10} oz (${Math.round(g)} g)`;
    return `${Math.round(oz / 16 * 10) / 10} lb (${Math.round(g / 100) / 10} kg)`;
}

/** One end of a filter range, by what it filters: weight, price or a spec. */
export function formatFilterValue(key, v) {
    if (key === 'weight') return formatWeightG(v);
    if (key === 'price') return `$${Math.round(v)}`;
    return formatSpec(key, v);
}

/** "Any", "Up to 3.1 lb (1.4 kg)", "At least 850 fill", "$200 – $400". */
export function rangeLabel(key, lo, hi, facet) {
    const atMin = lo === undefined || lo <= facet.min;
    const atMax = hi === undefined || hi >= facet.max;
    if (atMin && atMax) return 'Any';
    if (atMin) return `Up to ${formatFilterValue(key, hi)}`;
    if (atMax) return `At least ${formatFilterValue(key, lo)}`;
    return `${formatFilterValue(key, lo)} – ${formatFilterValue(key, hi)}`;
}

