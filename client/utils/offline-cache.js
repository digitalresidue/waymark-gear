// A copy of the signed-in library kept on this device, so the app still opens
// (and keeps your edits) at a trailhead with no signal.
//
//   library  what's on screen, including edits not yet saved to the server
//   base     what the server last confirmed; the difference between the two is
//            exactly what gets sent once the connection is back
//
// Cleared on sign-out and whenever the server says the session is gone, so a
// shared computer doesn't keep someone else's gear around.

const KEY = 'wgOfflineLibrary';

function storage() {
    try {
        return window.localStorage;
    } catch {
        return null;
    }
}

export function writeOfflineCache(state) {
    const store = storage();
    if (!store || state.saveType !== 'remote' || !state.library || !state.loggedIn) return;
    try {
        store.setItem(KEY, JSON.stringify({
            username: state.loggedIn,
            account: state.account,
            syncToken: state.syncToken,
            library: JSON.stringify(state.library.save()),
            base: state.lastSaveData,
        }));
    } catch {
        // Quota or privacy mode: offline copy is a convenience, never required.
    }
}

export function readOfflineCache() {
    const store = storage();
    if (!store) return null;
    try {
        const cache = JSON.parse(store.getItem(KEY));
        return cache && cache.library && cache.username ? cache : null;
    } catch {
        return null;
    }
}

export function clearOfflineCache() {
    const store = storage();
    try {
        if (store) store.removeItem(KEY);
    } catch {
        // Nothing to clear.
    }
}

// fetch() rejects with a TypeError when the request never reached the server;
// fetchJson rejects with a status when it did.
export function isNetworkError(error) {
    return Boolean(error) && !error.status && !error.statusCode;
}
