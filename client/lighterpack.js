import '@fontsource-variable/archivo/wdth.css';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './css/lighterpack.scss';
import { initTheme } from './utils/theme.js';
import { initAnalytics } from './utils/analytics.js';
import { createApp } from 'vue';
import { createRouter, createWebHistory, RouterView } from 'vue-router';

import routes from './routes';
import store from './store/store';
import { writeOfflineCache } from './utils/offline-cache.js';
import { connectLive, disconnectLive, watchKey } from './utils/live.js';
import { selectOnFocus, focusOnCreate, emptyIfZero, clickOutside } from './utils/focus.js';

import './utils/utils.js';

initTheme();
initAnalytics();

const router = createRouter({
    history: createWebHistory(),
    routes,
});

const app = createApp(RouterView);

// Planning a shared list (/plan/:owner/:listId) swaps in a one-list library;
// leaving it for anything but Pack or Print brings your own back. The guard
// waits for the first load, which decides whether you're signed in.
let resolveReady;
const ready = new Promise((resolve) => { resolveReady = resolve; });
const isPlanPath = (path) => path.startsWith('/plan/');
const keepsPlan = (path) => isPlanPath(path) || path === '/pack' || path === '/print';
router.beforeEach(async (to, from) => {
    if (!isPlanPath(to.path) && !(store.state.saveType === 'shared' && !keepsPlan(to.path))) return true;
    await ready;
    if (isPlanPath(to.path)) {
        if (!store.state.loggedIn) return '/signin';
        const { owner, listId } = to.params;
        const plan = store.state.plan;
        if (plan && plan.owner.toLowerCase() === String(owner).toLowerCase() && String(plan.listId) === String(listId)) return true;
        try {
            await store.dispatch('loadPlan', { owner, listId });
        } catch (err) {
            store.state.globalAlerts.push({ message: (err && err.message) || "That list couldn't be opened." });
            if (store.state.saveType === 'shared') await store.dispatch('leavePlan');
            return from.matched.length ? false : '/';
        }
        return true;
    }
    await store.dispatch('leavePlan');
    return true;
});

app.use(router);
app.use(store);

app.directive('select-on-focus', selectOnFocus);
app.directive('focus-on-create', focusOnCreate);
app.directive('empty-if-zero', emptyIfZero);
app.directive('click-outside', clickOutside);

// The serialized library as it was last persisted. Remote mode tracks every
// successful save; local mode writes to localStorage lazily, on the first
// edit, so until that happens the load-time snapshot is the only baseline
// there is — without it an untouched library reads as unsaved.
function lastPersistedData({ saveType, lastSaveData }) {
    if (saveType === 'remote') return lastSaveData;
    return localStorage.library || lastSaveData;
}

function hasUnsavedChanges(state) {
    return JSON.stringify(state.library.save()) !== lastPersistedData(state);
}

window.addEventListener('beforeunload', (e) => {
    const { library, saveType, isSaving, offline } = store.state;
    if (!library || !saveType) return;
    // Offline edits live in the device copy and survive closing the tab.
    if (offline) {
        writeOfflineCache(store.state);
        return;
    }
    if (isSaving || hasUnsavedChanges(store.state)) {
        e.preventDefault();
    }
});

// Coming back to this tab: fetch anything saved meanwhile from another tab
// or device. Cheap when nothing changed (one small request).
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') store.dispatch('refreshRemote');
});

// Back in signal: send whatever was edited offline, then catch up.
window.addEventListener('online', () => {
    if (!store.state.library || !['remote', 'shared'].includes(store.state.saveType)) return;
    store.commit('setOffline', false);
    store.commit('retrySave');
});
window.addEventListener('offline', () => {
    if (store.state.saveType === 'remote') store.commit('setOffline', true);
});

// Live updates: connect while signed in, watching the list on screen.
store.watch((state) => watchKey(state), (key) => {
    store.commit('setPresence', []);
    if (key) connectLive(store, key);
    else disconnectLive();
}, { immediate: true });

// Installable app + offline shell. Production builds only: in development
// a cached shell would hide every code change behind a stale copy.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
}

store.dispatch('init')
    .then(() => {
        resolveReady();
        app.mount('#lp');
        window.LighterPack = { $store: store };
    })
    .catch((_error) => {
        resolveReady();
        if (!store.state.library) {
            router.push('/welcome');
        }
        app.mount('#lp');
        window.LighterPack = { $store: store };
    });
