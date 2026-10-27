// Gear insights for a pack list: which essentials it seems to be missing,
// and a readiness score. Pure functions over plain data, so the same code
// runs in the editor, the API and the MCP server.
//
// Matching is by words in item names, descriptions and category names. It's
// a checklist prompt, not a verdict: anything can be marked "not needed".

// Critical essentials count three times as much toward readiness.
export const ESSENTIALS = [
    { id: 'shelter', label: 'Shelter', critical: true, words: ['tent', 'tarp', 'bivy', 'hammock', 'shelter', 'duplex', 'trekker', 'pyramid'] },
    { id: 'sleep', label: 'Sleep system', critical: true, words: ['quilt', 'sleeping bag', 'sleep*', 'pad', 'neoair', 'xlite', 'xtherm', 'mattress'] },
    { id: 'insulation', label: 'Warm layer', critical: true, words: ['puffy', 'down jacket', 'down hoody', 'down vest', 'synthetic jacket', 'fleece', 'insulat*', 'parka', 'primaloft', 'alpha', 'nano puff', 'ghost whisperer'] },
    { id: 'water', label: 'Water treatment', critical: true, words: ['filter', 'purif*', 'sawyer', 'befree', 'katadyn', 'aquamira', 'chlorine', 'steripen', 'water treatment', 'micropur'] },
    { id: 'navigation', label: 'Navigation', critical: true, words: ['map', 'compass', 'gps', 'phone', 'inreach', 'navigation', 'gaia', 'farout', 'guthook'] },
    { id: 'light', label: 'Headlamp or light', critical: true, words: ['headlamp', 'head lamp', 'torch', 'flashlight', 'nitecore', 'petzl', 'lantern'] },
    { id: 'firstaid', label: 'First aid', critical: true, words: ['first aid', 'firstaid', 'first-aid', 'med kit', 'medkit', 'bandage', 'blister*', 'leukotape', 'ibuprofen'] },
    { id: 'rain', label: 'Rain gear', critical: false, words: ['rain*', 'shell', 'poncho', 'waterproof', 'hardshell', 'frogg*', 'versalite'] },
    { id: 'sun', label: 'Sun protection', critical: false, words: ['sunscreen', 'sun screen', 'sunglasses', 'sun hat', 'sun hoody', 'spf', 'lip balm', 'brim'] },
    { id: 'fire', label: 'Fire starter', critical: false, words: ['lighter', 'matches', 'firestarter', 'fire starter', 'ferro*', 'bic'] },
    { id: 'repair', label: 'Knife and repair', critical: false, words: ['knife', 'repair', 'tape', 'tenacious', 'needle', 'multitool', 'multi-tool', 'scissors', 'razor'] },
    { id: 'emergency', label: 'Emergency signal', critical: false, words: ['whistle', 'inreach', 'plb', 'satellite', 'zoleo', 'beacon', 'messenger'] },
];

// Trips in the cold add warm-layer weight to the score; trips in the heat,
// sun protection. Day hikes don't need shelter or a sleep system.
const NOT_FOR_DAYHIKES = new Set(['shelter', 'sleep']);

const haystack = (...parts) => ` ${parts.filter(Boolean).join(' ').toLowerCase()} `;

// A word or phrase matches whole words (a plural "s" is fine); a trailing *
// matches any word starting with it ("insulat*" finds "insulated").
const esc = (w) => w.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
function matches(text, word) {
    if (word.endsWith('*')) return new RegExp(`[^a-z]${esc(word.slice(0, -1))}`).test(text);
    return new RegExp(`[^a-z]${esc(word)}s?[^a-z]`).test(text);
}

/**
 * items: [{ name, description, category, qty }] for one list.
 * opts: { tripType, tempLowC, tempHighC, dismissed: [essential ids] }
 * Returns { score, covered: [{id,label,by}], missing: [{id,label,critical}], dismissed: [...], notes: [] }
 */
export function checkEssentials(items, opts = {}) {
    const dismissed = new Set(opts.dismissed || []);
    const covered = [];
    const missing = [];
    const skipped = [];
    let have = 0;
    let need = 0;
    for (const e of ESSENTIALS) {
        if (opts.tripType === 'dayhike' && NOT_FOR_DAYHIKES.has(e.id)) continue;
        let weight = e.critical ? 3 : 1;
        if (e.id === 'insulation' && opts.tempLowC !== undefined && opts.tempLowC !== null && opts.tempLowC < 5) weight = 4;
        if (e.id === 'sun' && opts.tempHighC !== undefined && opts.tempHighC !== null && opts.tempHighC > 27) weight = 2;
        if (dismissed.has(e.id)) {
            skipped.push({ id: e.id, label: e.label });
            continue;
        }
        need += weight;
        const by = items.find((i) => {
            const text = haystack(i.name, i.description, i.category);
            return e.words.some((w) => matches(text, w));
        });
        if (by) {
            have += weight;
            covered.push({ id: e.id, label: e.label, by: by.name });
        } else {
            missing.push({ id: e.id, label: e.label, critical: e.critical || weight > 1 });
        }
    }
    const notes = [];
    if (opts.tempLowC !== undefined && opts.tempLowC !== null && opts.tempLowC < 0 && missing.some((m) => m.id === 'insulation' || m.id === 'sleep')) {
        notes.push('Below-freezing nights with no warm layer or sleep system found.');
    }
    return {
        score: need ? Math.round((have / need) * 100) : 100,
        covered,
        missing,
        dismissed: skipped,
        notes,
    };
}

// Items in a list as plain rows for checkEssentials and the API.
export function listRows(library, list) {
    const rows = [];
    for (const id of list.categoryIds) {
        const category = library.getCategoryById(id);
        if (!category) continue;
        for (const ci of category.categoryItems) {
            const item = library.getItemById(ci.itemId);
            if (!item || !(item.name || item.weight)) continue;
            rows.push({
                itemId: item.id,
                name: item.name || '',
                description: item.description || '',
                category: category.name || '',
                weightMg: item.weight || 0,
                qty: ci.qty,
                worn: Boolean(ci.worn),
                consumable: Boolean(ci.consumable),
                catalogId: item.catalogId || null,
            });
        }
    }
    return rows;
}

// What a piece of gear is, so lighter options are like for like: a lighter
// tent for a tent, never a trowel for trekking poles. First match wins, so
// specific kinds come before general ones. Null when we can't tell.
export const GEAR_KINDS = [
    ['bear-container', ['bear canister', 'bearvault', 'bear vault', 'ursack', 'bv450', 'bv500']],
    ['hammock', ['hammock']],
    ['shelter', ['tent', 'tarp', 'bivy', 'shelter', 'duplex', 'x-mid', 'the one', 'notch', 'copper spur', 'lunar solo', 'pyramid']],
    ['foam-pad', ['thinlight', 'z lite', 'foam pad', 'sit pad']],
    ['sleep-pad', ['sleeping pad', 'neoair', 'xlite', 'xtherm', 'tensor', 'mattress', 'pad']],
    ['quilt-bag', ['quilt', 'sleeping bag', 'ultralite', 'sleep*']],
    ['pack', ['backpack', 'southwest', 'mariposa', 'circuit', 'kakwa', 'exos', 'simple pack', 'pack']],
    ['stove', ['stove', 'jetboil', 'cooking system', 'pocketrocket']],
    ['pot', ['pot', 'mug', 'cookset']],
    ['filter', ['filter', 'befree', 'squeeze', 'purif*', 'steripen']],
    ['rain-jacket', ['rain jacket', 'rain shell', 'helium', 'frogg', 'ultra-lite 2', 'poncho', 'hardshell']],
    ['insulation', ['puffy', 'down jacket', 'nano puff', 'ghost whisperer', 'fleece', 'alpha', 'insulat*']],
    ['sun-shirt', ['sun hoody', 'sun shirt', 'echo']],
    ['footwear', ['shoe', 'shoes', 'boot', 'boots', 'lone peak', 'speedgoat', 'x ultra', 'trail runner']],
    ['poles', ['trekking pole', 'trekking poles', 'poles']],
    ['headlamp', ['headlamp', 'head lamp', 'nu25', 'flashlight']],
    ['messenger', ['inreach', 'zoleo', 'plb', 'satellite']],
    ['battery', ['power bank', 'battery', 'nb10000']],
    ['knife', ['knife', 'classic sd', 'multitool', 'skeletool']],
    ['trowel', ['trowel', 'deuce']],
    ['traction', ['microspikes', 'spikes', 'crampon*']],
    ['ice-axe', ['ice axe', 'axe']],
    ['umbrella', ['umbrella']],
    ['socks', ['socks', 'sock']],
    ['spoon', ['spoon', 'spork']],
];

export function gearKind(name, description = '') {
    const text = haystack(name, description);
    for (const [kind, words] of GEAR_KINDS) if (words.some((w) => matches(text, w))) return kind;
    return null;
}

export function readinessLabel(score) {
    if (score >= 90) return 'Ready';
    if (score >= 70) return 'Nearly there';
    if (score >= 40) return 'Gaps to fill';
    return 'Just getting started';
}
