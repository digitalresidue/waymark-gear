import { createStore } from 'vuex';
import debounce from 'lodash/debounce.js';

import { Library } from '../dataTypes.js';
import { fetchJson, readCookie, arrayMove } from '../utils/utils.js';
import { themePreference, setThemePreference } from '../utils/theme.js';
import { diffLibrary } from '../utils/library-diff.js';
import { writeOfflineCache, readOfflineCache, clearOfflineCache, isNetworkError } from '../utils/offline-cache.js';
import { isPlaceholder } from '../utils/closet.js';

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
        // True while the server can't be reached; edits stay on this device
        // and are sent when the connection comes back.
        offline: false,
        // Planning someone's list together (/plan/:owner/:listId):
        // { owner, listId, role, members }. The library then holds just that
        // list, and saves go to the plan, not to your own library.
        plan: null,
        // Who's looking at the current list right now (live presence).
        presence: [],
        // People planning the current list with you (owner and members).
        listMembers: [],
        saveRetries: 0,
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
        setPlan(state, plan) {
            state.plan = plan;
        },
        setListMembers(state, members) {
            state.listMembers = members;
        },
        setPresence(state, people) {
            state.presence = people;
        },
        setPlanMembers(state, members) {
            if (state.plan) state.plan = { ...state.plan, members };
        },
        setOffline(state, offline) {
            state.offline = offline;
        },
        // Nudges the save plugin to try again (after coming back online).
        retrySave(state) {
            state.saveRetries++;
        },
        signout(state) {
            clearOfflineCache();
            state.offline = false;
            state.library = false;
            state.loggedIn = false;
            state.account = null;
        },
        setLoggedIn(state, loggedIn) {
            state.loggedIn = loggedIn;
        },
        setAccount(state, account) {
            state.account = account;
            // The account's saved theme wins over this browser's, so a
            // choice made on one device shows up on all of them.
            if (account && account.themePref && account.themePref !== themePreference()) {
                setThemePreference(account.themePref);
            }
        },
        setThemePref(state, pref) {
            if (state.account) state.account = { ...state.account, themePref: pref };
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
            const target = state.library.getListById(list.id);
            target.published = published;
            // A shakedown request only makes sense on a public list.
            if (!published) delete target.shakedown;
        },
        setListTripType(state, { list, tripType }) {
            const target = state.library.getListById(list.id);
            if (tripType) target.tripType = tripType;
            else delete target.tripType;
        },
        setListShakedown(state, { list, shakedown }) {
            const target = state.library.getListById(list.id);
            if (shakedown) target.shakedown = true;
            else delete target.shakedown;
        },
        setListTrip(state, { list, trip }) {
            const target = state.library.getListById(list.id);
            if (trip) target.trip = trip;
            else delete target.trip;
        },
        // Group trips: who carries this gear ('' = unassigned).
        setCarrier(state, { category, itemId, carrier }) {
            const ci = state.library.getCategoryById(category.id).getCategoryItemById(itemId);
            if (!ci) return;
            if (carrier) ci.carrier = carrier;
            else delete ci.carrier;
        },
        // After the trip: this went along but wasn't used.
        setItemUnused(state, { category, itemId, unused }) {
            const ci = state.library.getCategoryById(category.id).getCategoryItemById(itemId);
            if (!ci) return;
            if (unused) ci.unused = true;
            else delete ci.unused;
        },
        // Gear kits: save a category's gear as a kit, add a kit to a category.
        createKit(state, { name, category }) {
            const items = category.categoryItems
                .filter((ci) => {
                    const item = state.library.getItemById(ci.itemId);
                    return item && (item.name || item.weight);
                })
                .map((ci) => ({ itemId: ci.itemId, qty: ci.qty }));
            if (!items.length) return;
            const id = state.library.nextSequence();
            state.library.kits = [...(state.library.kits || []), { id, name: String(name || category.name || 'Kit').slice(0, 80), items }];
        },
        renameKit(state, { kitId, name }) {
            state.library.kits = state.library.kits.map((k) => (k.id === kitId ? { ...k, name: String(name).slice(0, 80) } : k));
        },
        deleteKit(state, kitId) {
            state.library.kits = state.library.kits.filter((k) => k.id !== kitId);
        },
        addKitToCategory(state, { kitId, categoryId }) {
            const kit = (state.library.kits || []).find((k) => k.id === kitId);
            const category = state.library.getCategoryById(categoryId);
            if (!kit || !category) return;
            category.collapsed = false;
            for (const { itemId, qty } of kit.items) {
                if (!state.library.getItemById(itemId)) continue;
                const existing = category.getCategoryItemById(itemId);
                if (existing) existing.qty = Math.max(existing.qty, qty);
                else category.addItem({ itemId, qty });
            }
            state.library.getListById(state.library.defaultListId).calculateTotals();
        },
        setItemPacked(state, { category, itemId, packed }) {
            const ci = state.library.getCategoryById(category.id).getCategoryItemById(itemId);
            if (ci) ci.packed = packed;
        },
        resetPacked(state, list) {
            const target = state.library.getListById(list.id);
            target.categoryIds.forEach((id) => {
                const category = state.library.getCategoryById(id);
                if (category) category.categoryItems.forEach((ci) => { ci.packed = false; });
            });
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
        setListTrail(state, { list, trail }) {
            const target = state.library.getListById(list.id);
            if (trail && trail.name) target.trail = { ...trail };
            else delete target.trail;
        },
        setListNotNeeded(state, { list, notNeeded }) {
            const target = state.library.getListById(list.id);
            if (notNeeded.length) target.notNeeded = [...notNeeded];
            else delete target.notNeeded;
        },
        // Wishlist (Phase 7): gear you want, kept in the closet but out of lists.
        addWishlistItem(state, { entry }) {
            const item = state.library.newItemFromCatalog({ category: null, entry });
            item.wishlist = true;
        },
        setItemWishlist(state, { itemId, wishlist }) {
            const item = state.library.getItemById(itemId);
            if (!item) return;
            if (wishlist) item.wishlist = true;
            else delete item.wishlist;
        },
        addCatalogItem(state, { categoryId, entry }) {
            const category = state.library.getCategoryById(categoryId);
            if (!category) return;
            category.collapsed = false;
            state.library.newItemFromCatalog({ category, entry });
            state.library.getListById(state.library.defaultListId).calculateTotals();
        },
        // Sidebar Catalog panel, "Sort by type": file the gear under the list
        // category named like its catalog category (Shelter, Sleep...). If the
        // list has none, the starter "Untitled" category (nothing in it yet)
        // takes the name; otherwise a new category is made.
        addCatalogItemByType(state, { entry }) {
            const library = state.library;
            const list = library.getListById(library.defaultListId);
            const want = String(entry.category || 'Gear').trim();
            const categories = list.categoryIds.map((id) => library.getCategoryById(id)).filter(Boolean);
            let category = categories.find((c) => (c.name || '').trim().toLowerCase() === want.toLowerCase());
            if (!category) {
                category = categories.find((c) => !(c.name || '').trim()
                    && c.categoryItems.every((ci) => isPlaceholder(library.getItemById(ci.itemId) || {})));
                if (category) category.name = want;
            }
            if (!category) {
                category = library.newCategory({ list });
                category.name = want;
            }
            category.collapsed = false;
            library.newItemFromCatalog({ category, entry });
            // A starter row that was never filled in goes once real gear arrives.
            for (const ci of category.categoryItems.slice()) {
                const item = library.getItemById(ci.itemId);
                if (item && !item.catalogId && isPlaceholder(item) && category.categoryItems.length > 1) library.removeItem(item.id);
            }
            list.calculateTotals();
        },
        // Empty the closet. Without `everything`, only gear that isn't in any
        // list goes (lists are untouched); with it, every piece of gear goes,
        // and every list is left with its categories but no gear.
        emptyCloset(state, { everything = false } = {}) {
            const library = state.library;
            const ids = library.items
                .filter((item) => everything || !library.getListsContainingItem(item.id).length)
                .map((item) => item.id);
            ids.forEach((id) => library.removeItem(id));
            library.lists.forEach((list) => list.calculateTotals());
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
        importGearList(state, parsed) {
            const library = state.library;
            const previous = library.getListById(library.defaultListId);
            // A brand-new library's untouched starter list would just sit
            // under the import; drop it.
            const starter = library.lists.length === 1 && previous && !previous.name
                && previous.categoryIds.every((id) => {
                    const c = library.getCategoryById(id);
                    return c && c.categoryItems.every((ci) => {
                        const item = library.getItemById(ci.itemId);
                        return !item || (!item.name && !item.weight && !item.description);
                    });
                });
            const result = library.importGearList(parsed);
            if (previous) result.list.optionalFields = { ...previous.optionalFields };
            if (starter) library.removeList(previous.id);
            parsed.result = { reused: result.reused };
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
            if (state.saveType === 'shared') return context.dispatch('refreshPlan');
            if (state.saveType !== 'remote' || !state.library || state.isSaving) return;
            if (JSON.stringify(state.library.save()) !== state.lastSaveData) {
                // Unsaved edits from a spell offline: try sending them first.
                if (state.offline) context.commit('retrySave');
                return;
            }
            let response;
            try {
                response = await fetchJson('/signin', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    redirectOnAuthFailure: false,
                });
            } catch (error) {
                if (isNetworkError(error)) context.commit('setOffline', true);
                return;
            }
            if (state.offline) {
                context.commit('setOffline', false);
                if (JSON.stringify(state.library.save()) !== state.lastSaveData) {
                    context.commit('retrySave');
                    return;
                }
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
        // Open someone's shared list (or your own) to plan it together.
        async loadPlan(context, { owner, listId }) {
            const data = await fetchJson(`/api/plan/${encodeURIComponent(owner)}/${encodeURIComponent(listId)}`, {
                method: 'GET', credentials: 'same-origin', redirectOnAuthFailure: false,
            });
            context.commit('setSyncToken', data.syncToken);
            context.commit('loadLibraryData', JSON.stringify(data.library));
            context.commit('setSaveType', 'shared');
            context.commit('setPlan', { owner: data.owner, listId: data.listId, role: data.role, members: data.members });
            return data;
        },
        // A collaborator saved: pick it up unless we have unsaved edits
        // (those go first, and the next change event brings theirs).
        async refreshPlan(context) {
            const { state } = context;
            if (!state.plan || state.isSaving) return;
            if (JSON.stringify(state.library.save()) !== state.lastSaveData) return;
            let data;
            try {
                data = await fetchJson(`/api/plan/${encodeURIComponent(state.plan.owner)}/${state.plan.listId}`, {
                    method: 'GET', credentials: 'same-origin', redirectOnAuthFailure: false,
                });
            } catch {
                return;
            }
            if (data.syncToken === state.syncToken) return;
            if (state.isSaving || JSON.stringify(state.library.save()) !== state.lastSaveData) return;
            context.commit('setSyncToken', data.syncToken);
            context.commit('loadLibraryData', JSON.stringify(data.library));
            context.commit('setPlanMembers', data.members);
        },
        // Back to your own library.
        async leavePlan(context) {
            if (context.state.saveType !== 'shared') return;
            context.commit('setPlan', null);
            await context.dispatch('loadRemote');
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
                    writeOfflineCache(context.state);
                })
                .catch((error) => {
                    // A refused session is the ordinary state for anyone landing
                    // on the sign-in or password-reset pages, so boot signed-out
                    // and let the router show the page that was asked for rather
                    // than redirecting away from it. The server clears the
                    // cookies alongside these, so the next load starts clean.
                    if ([401, 403, 404].includes(error.statusCode)) {
                        clearOfflineCache();
                        context.commit('setLoggedIn', false);
                        context.commit('clearLibraryData');
                        return;
                    }
                    // No connection: open the copy kept on this device. Its
                    // baseline is the last thing the server confirmed, so
                    // edits made offline (then or now) are sent on reconnect.
                    const cache = isNetworkError(error) && readOfflineCache();
                    if (cache) {
                        context.commit('setSyncToken', cache.syncToken);
                        context.commit('loadLibraryData', cache.library);
                        context.commit('setLastSaveData', cache.base || null);
                        context.commit('setSaveType', 'remote');
                        context.commit('setLoggedIn', cache.username);
                        context.commit('setAccount', cache.account || null);
                        context.commit('setOffline', true);
                        return;
                    }
                    return Promise.reject('An error occurred while fetching your data, please try again later.');
                });
        },
    },
    plugins: [
        // Every way into a signed-in session (sign-in, register, password
        // reset, page load) ends with these: refresh the device copy then.
        function offlineCopy(store) {
            store.subscribe((mutation, state) => {
                if (['setLoggedIn', 'setSaveType', 'setAccount'].includes(mutation.type) && !state.offline) {
                    writeOfflineCache(state);
                }
            });
        },
        function save(store) {
            // Mutations that aren't edits to the library. They're filtered out
            // before the debounce: inside it, one arriving just after an edit
            // (a presence update, say) would be "the last call" and the
            // edit would never be saved.
            const ignore = new Set([
                'setIsSaving',
                'setSaveType',
                'setSyncToken',
                'setLastSaveData',
                'signout',
                'setLoggedIn',
                'loadLibraryData',
                'clearLibraryData',
                'setAccount',
                'setThemePref',
                'setPlan',
                'setPresence',
                'setPlanMembers',
                'setListMembers',
                'setOffline',
            ]);
            const saveSoon = debounce((mutation, state) => {
                if (!state.library) {
                    return;
                }
                const saveData = JSON.stringify(state.library.save());

                if (saveData == state.lastSaveData) {
                    return;
                }

                // Planning a shared list: send what changed to the plan.
                const savePlan = function (saveData) {
                    if (state.isSaving) {
                        setTimeout(() => savePlan(null), saveInterval + 1);
                        return;
                    }
                    if (!saveData) saveData = JSON.stringify(state.library.save());
                    if (saveData === state.lastSaveData || !state.plan) return;
                    const changes = diffLibrary(JSON.parse(state.lastSaveData), JSON.parse(saveData));
                    if (!changes) {
                        store.commit('setLastSaveData', saveData);
                        return;
                    }
                    store.commit('setIsSaving', true);
                    fetchJson(`/api/plan/${encodeURIComponent(state.plan.owner)}/${state.plan.listId}/changes`, {
                        method: 'POST',
                        body: JSON.stringify({ changes }),
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'same-origin',
                        redirectOnAuthFailure: false,
                    }).then((response) => {
                        store.commit('setSyncToken', response.syncToken);
                        store.commit('setLastSaveData', saveData);
                        store.commit('setIsSaving', false);
                    }).catch((error) => {
                        store.commit('setIsSaving', false);
                        if (isNetworkError(error)) {
                            store.commit('setOffline', true);
                            return;
                        }
                        state.globalAlerts.push({ message: error.message || 'Your change to the shared list could not be saved.' });
                    });
                };

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
                    writeOfflineCache(state);

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
                            if (state.offline) store.commit('setOffline', false);
                            writeOfflineCache(state);
                        })
                        .catch((error) => {
                            store.commit('setIsSaving', false);
                            // No signal: the edit is already in the device copy
                            // and goes out when the connection returns.
                            if (isNetworkError(error)) {
                                store.commit('setOffline', true);
                                return;
                            }
                            if (error.statusCode === 401) {
                                clearOfflineCache();
                                window.location = '/signin';
                                return;
                            }
                            alert(error.message || 'An error occurred while attempting to save your data.'); // TODO
                        });
                };

                if (state.saveType === 'remote') {
                    saveRemotely(saveData);
                } else if (state.saveType === 'shared') {
                    savePlan(saveData);
                } else if (state.saveType === 'local') {
                    localStorage.library = saveData;
                }
            }, saveInterval, { maxWait: saveInterval * 3 });
            store.subscribe((mutation, state) => {
                if (!ignore.has(mutation.type)) saveSoon(mutation, state);
            });
        },
    ],
});

export default store;
