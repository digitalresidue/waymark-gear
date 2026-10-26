// What changed between two serialized libraries (Library.save() output),
// as the per-entity changes server/library-store.js applyChanges() takes.
//
//   {
//     settings:   { totalUnit, ... }       only the keys that changed
//     listOrder:  [listId, ...]            when lists were added or reordered
//     items:      { upsert: [...], delete: [id, ...] }
//     categories: { upsert: [...], delete: [id, ...] }
//     lists:      { upsert: [...], delete: [id, ...] }
//   }
//
// Returns null when nothing changed. Entities are compared whole: change one
// field of an item and the whole item is sent, which is small and keeps the
// server's merge simple (last writer wins per entity).

const SETTINGS_KEYS = ['totalUnit', 'itemUnit', 'defaultListId', 'sequence', 'showSidebar', 'preferences', 'currencySymbol'];

function diffGroup(before = [], after = []) {
    const old = new Map(before.map((e) => [e.id, JSON.stringify(e)]));
    const upsert = [];
    const seen = new Set();
    for (const entity of after) {
        seen.add(entity.id);
        if (old.get(entity.id) !== JSON.stringify(entity)) upsert.push(entity);
    }
    const del = before.filter((e) => !seen.has(e.id)).map((e) => e.id);
    return upsert.length || del.length ? { upsert, delete: del } : null;
}

export function diffLibrary(before, after) {
    const changes = {};

    const settings = {};
    for (const key of SETTINGS_KEYS) {
        if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) settings[key] = after[key];
    }
    if (Object.keys(settings).length) changes.settings = settings;

    const beforeOrder = (before.lists || []).map((l) => l.id);
    const afterOrder = (after.lists || []).map((l) => l.id);
    if (JSON.stringify(beforeOrder) !== JSON.stringify(afterOrder)) changes.listOrder = afterOrder;

    for (const group of ['items', 'categories', 'lists']) {
        const d = diffGroup(before[group], after[group]);
        if (d) changes[group] = d;
    }

    return Object.keys(changes).length ? changes : null;
}
