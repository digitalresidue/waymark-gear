// A blank row every new list and category starts with: no name, no weight.
// Real gear in a list, but not something you'd call part of your closet.
export function isPlaceholder(item) {
    return !item.name && !item.weight && !item.description;
}

// Shared closet actions for the desktop sidebar (library-items.vue) and the
// phone Gear screen (views/gear.vue).

// Removing gear from the closet. Gear that's in lists is usually still part
// of a trip's history, so the first choice offered is to retire it: hidden
// from the closet, kept in every list that has it. Deleting removes it
// everywhere.
export function confirmClosetRemoval({ store, initSpeedbump }, item) {
    const lists = store.state.library.getListsContainingItem(item.id);
    const name = item.name || 'this gear';
    const retire = {
        label: 'Retire it',
        callback: () => store.commit('setItemRetired', { item, retired: true }),
    };
    const del = () => store.commit('removeItem', item);

    if (lists.length) {
        const where = lists.length === 1 ? `“${lists[0].name || 'New list'}”` : `${lists.length} lists`;
        initSpeedbump(del, {
            title: `Remove ${name}?`,
            body: `It's in ${where}. Retire it to hide it from your closet and keep it in ${lists.length === 1 ? 'that list' : 'those lists'}, or delete it everywhere. Deleting can't be undone.`,
            alternate: retire,
            confirm: 'Delete everywhere',
            cancel: 'Cancel',
        });
    } else {
        initSpeedbump(del, {
            title: `Remove ${name}?`,
            body: 'Retire it to hide it from your closet but keep it, or delete it for good. Deleting can’t be undone.',
            alternate: retire,
            confirm: 'Delete',
            cancel: 'Cancel',
        });
    }
}

// Selected gear, several pieces at once (the closet's Select): one "are you
// sure" for all of it. As with one piece, retiring is offered first when
// any of it is in a list.
export function confirmBulkRemoval({ store, initSpeedbump }, items, done = () => {}) {
    const library = store.state.library;
    const ids = items.map((i) => i.id);
    if (!ids.length) return;
    const n = ids.length;
    const what = `${n} ${n === 1 ? 'piece' : 'pieces'} of gear`;
    const inLists = items.filter((i) => library.getListsContainingItem(i.id).length).length;
    const del = () => {
        store.commit('removeItems', ids);
        done();
    };
    const retire = {
        label: `Retire ${n === 1 ? 'it' : `all ${n}`}`,
        callback: () => {
            store.commit('setItemsRetired', { ids, retired: true });
            done();
        },
    };
    const names = items.slice(0, 5).map((i) => i.name || 'Unnamed gear').join(', ') + (n > 5 ? ` and ${n - 5} more` : '');
    initSpeedbump(del, {
        title: `Delete ${what}?`,
        body: inLists
            ? `${names}. ${inLists === n ? (n === 1 ? 'It is' : 'All of it is') : `${inLists} of them are`} in your lists, and deleting takes ${inLists === 1 ? 'it' : 'them'} out of those lists too. Retire instead to hide ${n === 1 ? 'it' : 'them'} from your closet and keep your lists as they are. Deleting can't be undone.`
            : `${names}. None of it is in a list. Retire instead to hide ${n === 1 ? 'it' : 'them'} from your closet but keep ${n === 1 ? 'it' : 'them'}. Deleting can't be undone.`,
        alternate: retire,
        confirm: `Delete ${n}`,
        cancel: 'Cancel',
    });
}

export function restoreClosetItem(store, item) {
    store.commit('setItemRetired', { item, retired: false });
}

// "Empty closet": everything, or only the gear no list uses. Placeholder rows
// (a new list's blank first line) aren't counted as gear.
export function closetCounts(library) {
    let unused = 0;
    let inLists = 0;
    for (const item of library.items) {
        if (isPlaceholder(item)) continue;
        if (library.getListsContainingItem(item.id).length) inLists++;
        else unused++;
    }
    return { unused, inLists, total: unused + inLists };
}

export function confirmEmptyCloset({ store, initSpeedbump }) {
    const { unused, inLists, total } = closetCounts(store.state.library);
    const n = (k) => `${k} ${k === 1 ? 'piece' : 'pieces'} of gear`;
    const everything = () => store.commit('emptyCloset', { everything: true });
    if (!total) return;
    if (!inLists) {
        initSpeedbump(everything, {
            title: 'Empty your closet?',
            body: `This deletes all ${n(total)} in your closet. None of it is in a list. This can't be undone.`,
            confirm: `Delete ${total}`,
            cancel: 'Cancel',
        });
        return;
    }
    initSpeedbump(everything, {
        title: 'Empty your closet?',
        body: `You have ${n(total)}: ${unused} not in any list, and ${inLists} in your lists. Delete just the ${unused} no list uses, or everything, which also empties your lists (their categories stay). This can't be undone.`,
        alternate: unused ? {
            label: `Only the ${unused} not in a list`,
            callback: () => store.commit('emptyCloset', { everything: false }),
        } : null,
        confirm: `Delete all ${total}`,
        cancel: 'Cancel',
    });
}
