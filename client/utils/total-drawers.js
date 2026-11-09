// The weight summary's groups as drawers: a group's row (Clothing 2.77 lb)
// opens to show its categories under it, so a long list's totals stay short.
// Closed by default; the ones you open are remembered in this browser
// (list-summary.vue, list-summary-mobile.vue, the shared page in
// share-entry.js).

const KEY = 'wgTotalsOpen';

/** Open groups' ids (strings). */
export function openTotalGroups() {
    try {
        const ids = JSON.parse(window.localStorage.getItem(KEY) || '[]');
        return new Set(Array.isArray(ids) ? ids.map(String) : []);
    } catch {
        return new Set();
    }
}

/** Open or close a group's drawer; returns the new set. */
export function toggleTotalGroup(open, id) {
    const next = new Set(open);
    const key = String(id);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    try {
        window.localStorage.setItem(KEY, JSON.stringify([...next].slice(-200)));
    } catch {
        // Storage off: the drawer still opens, it just isn't remembered.
    }
    return next;
}
