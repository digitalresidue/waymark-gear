// The browser side of live updates (server/live.js). One connection per
// tab while signed in; it says which list we're looking at, so others see
// we're here, and a "changed" event re-fetches what's on screen.

import debounce from 'lodash/debounce.js';

let source = null;
let watching = null;

export function connectLive(store, watch) {
    if (source && watching === watch) return;
    disconnectLive();
    if (typeof EventSource === 'undefined') return;
    watching = watch;
    source = new EventSource(`/api/live${watch ? `?watch=${encodeURIComponent(watch)}` : ''}`);
    const refresh = debounce(() => store.dispatch('refreshRemote'), 400);
    source.addEventListener('changed', () => refresh());
    source.addEventListener('presence', (e) => {
        try {
            const data = JSON.parse(e.data);
            if (data.watch === watching) store.commit('setPresence', data.people);
        } catch {
            // Malformed event: ignore.
        }
    });
    // EventSource reconnects by itself after a drop; nothing to do here.
}

export function disconnectLive() {
    if (source) source.close();
    source = null;
    watching = null;
}

// What this tab is looking at: "owner/listId", lower-case.
export function watchKey(state) {
    if (!state.library || !state.loggedIn) return null;
    if (state.saveType === 'shared' && state.plan) return `${state.plan.owner}/${state.plan.listId}`.toLowerCase();
    if (state.saveType === 'remote') return `${state.loggedIn}/${state.library.defaultListId}`.toLowerCase();
    return null;
}
