import { ref } from 'vue';

// The phone breakpoint, as a reactive flag.
//
// Most of the mobile design is a media query living in each component's own
// style block. Two surfaces aren't reachable that way — the item row (display
// vs. tap-to-edit is a mode switch, not a reflow) and the list summary (the
// collapsed scoreboard strip has no desktop counterpart) — so they swap
// components instead, keyed off this.
//
// Must match $mobile in client/css/_globals.scss.
export const mobileBreakpoint = 720;

const query = window.matchMedia(`(max-width: ${mobileBreakpoint}px)`);

// Module-level singleton: one listener for the whole app, however many
// components read it.
export const isMobile = ref(query.matches);

query.addEventListener('change', (evt) => {
    isMobile.value = evt.matches;
});

export default isMobile;

// Tablets and small laptop windows: wider than a phone but too narrow for
// the sidebar's panel to sit beside the list (an iPad in portrait leaves the
// list ~420px). Here the panel floats over the list instead, and starts put
// away. Must match $tablet in client/css/_globals.scss.
export const tabletBreakpoint = 1099;

const tabletQuery = window.matchMedia(`(min-width: ${mobileBreakpoint + 1}px) and (max-width: ${tabletBreakpoint}px)`);

export const isTablet = ref(tabletQuery.matches);

tabletQuery.addEventListener('change', (evt) => {
    isTablet.value = evt.matches;
});
