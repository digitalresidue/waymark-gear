import '@fontsource-variable/archivo/wdth.css';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './css/lighterpack.scss';
import { initTheme } from './utils/theme.js';
import { createApp } from 'vue';
import { createRouter, createWebHistory, RouterView } from 'vue-router';

import routes from './routes';
import store from './store/store';
import { writeOfflineCache } from './utils/offline-cache.js';
import { selectOnFocus, focusOnCreate, emptyIfZero, clickOutside } from './utils/focus.js';

import './utils/utils.js';

initTheme();

const router = createRouter({
    history: createWebHistory(),
    routes,
});

const app = createApp(RouterView);

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
    if (!store.state.library || store.state.saveType !== 'remote') return;
    store.commit('setOffline', false);
    store.commit('retrySave');
});
window.addEventListener('offline', () => {
    if (store.state.saveType === 'remote') store.commit('setOffline', true);
});

// Installable app + offline shell. Production builds only: in development
// a cached shell would hide every code change behind a stale copy.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
}

store.dispatch('init')
    .then(() => {
        app.mount('#lp');
        window.LighterPack = { $store: store };
    })
    .catch((_error) => {
        if (!store.state.library) {
            router.push('/welcome');
        }
        app.mount('#lp');
        window.LighterPack = { $store: store };
    });
