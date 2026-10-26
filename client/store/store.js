import { createStore } from 'vuex';
import debounce from 'lodash/debounce.js';

import weightUtils from '../utils/weight.js';
import { Library } from '../dataTypes.js';
import { fetchJson, readCookie, arrayMove } from '../utils/utils.js';
import { diffLibrary } from '../utils/library-diff.js';

const saveInterval = 5000;

const store = createStore({
    state: {
        library: false,
        isSaving: false,
        syncToken: false,
        saveType: null,
        lastSaveData: null,
        loggedIn: false,
        // From /signin: email, hasPassword, googleLinked, isAdmin, isModerator.
        account: null,
        globalAlerts: [],
    },
    getters: {
        activeList(state) {
            return state.library.getListById(state.library.defaultListId);
        },
        optionalFields(state) {
            return state.library.getListById(state.library.defaultListId).optionalFields;
        },
    },
    mutations: {
        setSaveType(state, saveType) {
            state.saveType = saveType;
        },
        setSyncToken(state, syncToken) {
            state.syncToken = syncToken;
        },
        setLastSaveData(state, lastSaveData) {
            state.lastSaveData = lastSaveData;
        },
        setIsSaving(state, isSaving) {
            state.isSaving = isSaving;
        },
        signout(state) {
            state.library = false;
            state.loggedIn = false;
            state.account = null;
        },
        setLoggedIn(state, loggedIn) {
            state.loggedIn = loggedIn;
        },
        setAccount(state, account) {
            state.account = account;
        },
        togglePinList(state, list) {
            const target = state.library.getListById(list.id);
            target.pinned = !target.pinned;
        },
        // Reorder a subset of lists (one section of the switcher) without
        // disturbing the others: the given ids take over the slots those
        // lists already occupy, in the new order.
        reorderListsById(state, ids) {
            const lists = state.library.lists;
            const moving = ids.map((id) => lists.find((l) => l.id === id)).filter(Boolean);
            const slots = lists.map((l, i) => (ids.includes(l.id) ? i : -1)).filter((i) => i >= 0);
            const next = lists.slice();
            slots.forEach((slot, n) => { next[slot] = moving[n]; });
            state.library.lists = next;
        },
        toggleCategoryCollapsed(state, category) {
            const target = state.library.getCategoryById(category.id);
            target.collapsed = !target.collapsed;
        },
        setCategoriesCollapsed(state, { list, collapsed }) {
            const target = state.library.getListById(list.id);
            target.categoryIds.forEach((id) => {
                const category = state.library.getCategoryById(id);
                if (category) category.collapsed = collapsed;
            });
        },
        setListPublished(state, { list, published }) {
            state.library.getListById(list.id).published = published;
        },
        setItemRetired(state, { item, retired }) {
            state.library.getItemById(item.id).retired = retired;
        },
        // Put existing closet gear into a category (linked, not copied).
        addClosetItems(state, { categoryId, itemIds }) {
            const category = state.library.getCategoryById(categoryId);
            if (!category) return;
            category.collapsed = false;
            for (const itemId of itemIds) {
                if (!category.getCategoryItemById(itemId) && state.library.getItemById(itemId)) {
                    category.addItem({ itemId });
                }
            }
            state.library.getListById(state.library.defaultListId).calculateTotals();
        },
        importSharedList(state, shared) {
            state.library.importSharedList(shared);
        },
        addCatalogItem(state, { categoryId, entry }) {
            const category = state.library.getCategoryById(categoryId);
            if (!category) return;
            category.collapsed = false;
            state.library.newItemFromCatalog({ category, entry });
            state.library.getListById(state.library.defaultListId).calculateTotals();
        },
        loadLibraryData(state, libraryData) {
            const library = new Library();
            try {
                libraryData = JSON.parse(libraryData);
                library.load(libraryData);
                state.library = library;
            } catch (err) {
                const message = (err && err.code === 'VERSION_TOO_NEW')
                    ? err.message
                    : 'An error occurred while loading your data.';
                state.globalAlerts.push({ message });
            }
            state.lastSaveData = JSON.stringify(library.save());
        },
        clearLibraryData(state) {
            state.library = false;
        },
        toggleSidebar(state) {
            state.library.showSidebar = !state.library.showSidebar;
        },
        setDefaultList(state, list) {
            state.library.defaultListId = list.id;
            state.library.getListById(state.library.defaultListId).calculateTotals();
        },
        setTotalUnit(state, unit) {
            state.library.totalUnit = unit;
        },
        toggleOptionalField(state, optionalField) {
            const list = state.library.getListById(state.library.defaultListId);
            list.optionalFields[optionalField] = !list.optionalFields[optionalField];
            list.calculateTotals();
        },
        togglePreference(state, preference) {
            state.library.preferences[preference] = !state.library.preferences[preference];
        },
        // For preferences that pick one of several values rather than flip.
        setPreference(state, { preference, value }) {
            state.library.preferences[preference] = value;
        },
        updateCurrencySymbol(state, currencySymbol) {
            state.library.currencySymbol = currencySymbol;
        },
        newItem(state, { category, _isNew }) {
            state.library.newItem({ category, _isNew });
            state.library.getListById(state.library.defaultListId).calculateTotals();
        },
        newCategory(state, list) {
            const category = state.library.newCategory({ list, _isNew: true });
            state.library.newItem({ category });
            state.library.getListById(state.library.defaultListId).calculateTotals();
        },
        newList(state) {
            const previousList = state.library.getListById(state.library.defaultListId);
            const list = state.library.newList();
            if (previousList) {
                list.optionalFields = Object.assign({}, previousList.optionalFields);
            }
            const category = state.library.newCategory({ list });
            state.library.newItem({ category });
            list.calculateTotals();
            state.library.defaultListId = list.id;
        },
        removeItem(state, item) {
            state.library.removeItem(item.id);
            state.library.getListById(state.library.defaultListId).calculateTotals();
        },
        removeCategory(state, category) {
            state.library.removeCategory(category.id);
            state.library.getListById(state.library.defaultListId).calculateTotals();
        },
        removeList(state, list) {
            state.library.removeList(list.id);
        },
        reorderList(state, args) {
            state.library.lists = arrayMove(state.library.lists, args.before, args.after);
        },
        reorderCategory(state, args) {
            const list = state.library.getListById(args.list.id);
            list.categoryIds = arrayMove(list.categoryIds, args.before, args.after);
            state.library.getListById(state.library.defaultListId).calculateTotals();
        },
        reorderItem(state, args) {
            const item = state.library.getItemById(args.itemId);
            const dropCategory = state.library.getCategoryById(args.categoryId);
            const list = state.library.getListById(args.list.id);
            const originalCategory = state.library.findCategoryWithItemById(item.id, list.id);
            const oldCategoryItem = originalCategory.getCategoryItemById(item.id);
            const oldIndex = originalCategory.categoryItems.indexOf(oldCategoryItem);

            if (originalCategory === dropCategory) {
                dropCategory.categoryItems = arrayMove(dropCategory.categoryItems, oldIndex, args.dropIndex);
            } else {
                originalCategory.categoryItems.splice(oldIndex, 1);
                dropCategory.categoryItems.splice(args.dropIndex, 0, oldCategoryItem);
            }
            state.library.getListById(state.library.defaultListId).calculateTotals();
        },
        addItemToCategory(state, args) {
            const item = state.library.getItemById(args.itemId);
            const dropCategory = state.library.getCategoryById(args.categoryId);

            if (item && dropCategory) {
                dropCategory.addItem({ itemId: item.id });
                const categoryItem = dropCategory.getCategoryItemById(item.id);
                const categoryItemIndex = dropCategory.categoryItems.indexOf(categoryItem);
                if (categoryItem && categoryItemIndex !== -1) {
                    dropCategory.categoryItems = arrayMove(dropCategory.categoryItems, categoryItemIndex, args.dropIndex);
                }
                state.library.getListById(state.library.defaultListId).calculateTotals();
            }
        },
        updateListName(state, updatedList) {
            const list = state.library.getListById(updatedList.id);
            list.name = updatedList.name;
        },
        updateListDescription(state, updatedList) {
            const list = state.library.getListById(updatedList.id);
            list.description = updatedList.description;
        },
        setExternalId(state, args) {
            const list = state.library.getListById(args.list.id);
            list.externalId = args.externalId;
        },
        updateCategoryName(state, updatedCategory) {
            const category = state.library.getCategoryById(updatedCategory.id);
            category.name = updatedCategory.name;
            state.library.getListById(state.library.defaultListId).calculateTotals();
        },
        updateCategoryColor(state, updatedCategory) {
            const category = state.library.getCategoryById(updatedCategory.id);
            category.color = updatedCategory.color;
        },
        clearCategoryIsNew(state, categoryId) {
            const category = state.library.getCategoryById(categoryId);
            if (category) {
                category._isNew = false;
            }
        },
        updateItem(state, item) {
            state.library.updateItem(item);
            state.library.getListById(state.library.defaultListId).calculateTotals();
        },
        updateItemLink(state, args) {
            const item = state.library.getItemById(args.item.id);
            item.url = args.url;
        },
        updateItemImageUrl(state, args) {
            const item = state.library.getItemById(args.item.id);
            item.imageUrl = args.imageUrl;
            state.library.getListById(state.library.defaultListId).optionalFields.images = true;
        },
        updateItemImage(state, args) {
            const item = state.library.getItemById(args.item.id);
            item.image = args.image;
            state.library.getListById(state.library.defaultListId).optionalFields.images = true;
        },
        updateItemUnit(state, unit) {
            state.library.itemUnit = unit;
        },
        removeItemImage(state, updateItem) {
            const item = state.library.getItemById(updateItem.id);
            item.image = '';
            item.imageUrl = '';
        },
        updateCategoryItem(state, args) {
            args.category.updateCategoryItem(args.categoryItem);
            state.library.getListById(state.library.defaultListId).calculateTotals();
        },
        removeItemFromCategory(state, args) {
            args.category.removeItem(args.itemId);
            state.library.getListById(state.library.defaultListId).calculateTotals();
        },
        forkItem(state, args) {
            state.library.forkItem(args.itemId, args.listId);
            state.library.getListById(state.library.defaultListId).calculateTotals();
        },
        copyList(state, listId) {
            const copiedList = state.library.copyList(listId);
            state.library.defaultListId = copiedList.id;
        },
        importCSV(state, importData) {
            const previousList = state.library.getListById(state.library.defaultListId);
            const list = state.library.newList({});
            if (previousList) {
                list.optionalFields = Object.assign({}, previousList.optionalFields);
            }
            let category;
            const newCategories = {};
            let item;
            let categoryItem;
            let row;
            let i;

            list.name = importData.name;

            for (i in importData.data) {
                row = importData.data[i];
                if (newCategories[row.category]) {
                    category = newCategories[row.category];
                } else {
                    category = state.library.newCategory({ list });
                    newCategories[row.category] = category;
                }

                item = state.library.newItem({ category, _isNew: false });
                categoryItem = category.getCategoryItemById(item.id);

                item.name = row.name;
                item.description = row.description;
                categoryItem.qty = parseFloat(row.qty);
                item.weight = weightUtils.WeightToMg(parseFloat(row.weight), row.unit);
                item.authorUnit = row.unit;
                category.name = row.category;
            }
            list.calculateTotals();
            state.library.defaultListId = list.id;
        },
        save() {
            // no-op
        },
    },
    actions: {
        // Pick up changes saved from another tab or device. Only when this
        // tab has nothing unsaved, so local work is never thrown away; the
        // list being viewed stays put if it still exists.
        async refreshRemote(context) {
            const { state } = context;
            if (state.saveType !== 'remote' || !state.library || state.isSaving) return;
            if (JSON.stringify(state.library.save()) !== state.lastSaveData) return;
            let response;
            try {
                response = await fetchJson('/signin', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    redirectOnAuthFailure: false,
                });
            } catch {
                return;
            }
            if (response.sync_token === state.syncToken) return;
            if (state.isSaving || JSON.stringify(state.library.save()) !== state.lastSaveData) return;
            const viewing = state.library.defaultListId;
            context.commit('setSyncToken', response.sync_token);
            context.commit('loadLibraryData', response.library);
            if (state.library && state.library.getListById(viewing)) {
                state.library.defaultListId = viewing;
                state.library.getListById(viewing).calculateTotals();
                context.commit('setLastSaveData', JSON.stringify(state.library.save()));
            }
            context.commit('setAccount', response.account || state.account);
        },
        async signout(context) {
            await fetch('/signout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
            context.commit('signout');
        },
        init(context) {
            if (readCookie('lp_loggedin')) {
                return context.dispatch('loadRemote');
            }
            if (localStorage.library) {
                return context.dispatch('loadLocal');
            }
            return new Promise((resolve) => {
                context.commit('setLoggedIn', false);
                context.commit('clearLibraryData');
                resolve();
            });
        },
        loadLocal(context) {
            const libraryData = localStorage.library;
            context.commit('loadLibraryData', libraryData);
            context.commit('setSaveType', 'local');
            context.commit('setLoggedIn', false);
        },
        // Start an account-less library. Both ways into "skip registration" --
        // the desktop register form's link and the mobile landing card's footer
        // strip -- land here so the two cannot drift apart. A library already
        // saving locally is left alone; only a first-timer gets a blank one.
        startLocalLibrary(context) {
            if (context.state.saveType === 'local') {
                return;
            }
            const library = new Library();
            context.commit('loadLibraryData', JSON.stringify(library.save()));
            context.commit('setSaveType', 'local');
            context.commit('setLoggedIn', false);
        },
        loadRemote(context) {
            return fetchJson('/signin', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'same-origin',
                redirectOnAuthFailure: false,
            })
                .then(async (response) => {
                    let library = response.library;
                    let syncToken = response.sync_token;
                    // First sign-in with Google from a browser that already has
                    // an account-less library: move that library into the new
                    // account, the way the register form does.
                    const params = new URLSearchParams(window.location.search);
                    if (params.get('welcome') === 'google' && localStorage.library) {
                        try {
                            const saved = await fetchJson('/saveLibrary/', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                credentials: 'same-origin',
                                body: JSON.stringify({ sync_token: syncToken, username: response.username, data: localStorage.library }),
                            });
                            library = localStorage.library;
                            syncToken = saved.sync_token;
                            localStorage.removeItem('library');
                        } catch {
                            // Keep the local copy; the new account starts empty.
                        }
                    }
                    context.commit('setSyncToken', syncToken);
                    context.commit('loadLibraryData', library);
                    context.commit('setSaveType', 'remote');
                    context.commit('setLoggedIn', response.username);
                    context.commit('setAccount', response.account || null);
                })
                .catch((error) => {
                    // A refused session is the ordinary state for anyone landing
                    // on the sign-in or password-reset pages, so boot signed-out
                    // and let the router show the page that was asked for rather
                    // than redirecting away from it. The server clears the
                    // cookies alongside these, so the next load starts clean.
                    if ([401, 403, 404].includes(error.statusCode)) {
                        context.commit('setLoggedIn', false);
                        context.commit('clearLibraryData');
                        return;
                    }
                    return Promise.reject('An error occurred while fetching your data, please try again later.');
                });
        },
    },
    plugins: [
        function save(store) {
            store.subscribe(debounce((mutation, state) => {
                const ignore = [
                    'setIsSaving',
                    'setSaveType',
                    'setSyncToken',
                    'setLastSaveData',
                    'signout',
                    'setLoggedIn',
                    'loadLibraryData',
                    'clearLibraryData',
                    'setAccount',
                ];
                if (!state.library || ignore.indexOf(mutation.type) > -1) {
                    return;
                }
                const saveData = JSON.stringify(state.library.save());

                if (saveData == state.lastSaveData) {
                    return;
                }

                const saveRemotely = function (saveData) {
                    if (state.isSaving) {
                        setTimeout(() => saveRemotely(null), saveInterval + 1);
                        return;
                    }

                    if (!saveData) {
                        saveData = JSON.stringify(state.library.save());
                    }
                    if (saveData === state.lastSaveData) {
                        return;
                    }

                    // Send only what changed since the last save, so another
                    // tab's or device's edits to other things aren't overwritten.
                    // Without a baseline, fall back to the whole library.
                    let payload;
                    if (state.lastSaveData) {
                        const changes = diffLibrary(JSON.parse(state.lastSaveData), JSON.parse(saveData));
                        if (!changes) {
                            store.commit('setLastSaveData', saveData);
                            return;
                        }
                        payload = { sync_token: state.syncToken, username: state.loggedIn, changes };
                    } else {
                        payload = { sync_token: state.syncToken, username: state.loggedIn, data: saveData };
                    }

                    store.commit('setIsSaving', true);

                    return fetchJson('/saveLibrary/', {
                        method: 'POST',
                        body: JSON.stringify(payload),
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        credentials: 'same-origin',
                    })
                        .then((response) => {
                            store.commit('setSyncToken', response.sync_token);
                            store.commit('setLastSaveData', saveData);
                            store.commit('setIsSaving', false);
                        })
                        .catch((response) => {
                            store.commit('setIsSaving', false);
                            let error = 'An error occurred while attempting to save your data.';
                            if (response.json && response.json.status) {
                                error = response.json.status;
                            }
                            if (response.status == 401) {
                                window.location = '/signin';
                            } else {
                                alert(error); // TODO
                            }
                        });
                };

                if (state.saveType === 'remote') {
                    saveRemotely(saveData);
                } else if (state.saveType === 'local') {
                    localStorage.library = saveData;
                }
            }, saveInterval, { maxWait: saveInterval * 3 }));
        },
    ],
});

export default store;
