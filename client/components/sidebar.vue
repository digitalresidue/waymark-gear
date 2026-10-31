<template>
    <aside id="sidebar" aria-label="Your lists and gear" :class="{ wgSidebarDesk: !isMobile }">
        <div class="lpSidebarSticky">
            <!-- Phone: one drawer with the site links and the lists; the
                 closet has its own page. -->
            <template v-if="isMobile">
                <router-link to="/welcome" class="wgDrawerBrand" aria-label="Waymark Gear home" data-testid="drawer-home">
                    <brandLogo />
                </router-link>
                <nav class="wgDrawerNav" aria-label="Site">
                    <a href="/explore">Explore gear</a>
                    <router-link to="/kits">
                        Explore kits
                    </router-link>
                    <router-link v-if="$store.state.loggedIn" to="/profile" data-testid="drawer-profile">
                        Your profile
                    </router-link>
                    <router-link v-if="$store.state.loggedIn" to="/trips" data-testid="drawer-trips">
                        Trip journals
                    </router-link>
                    <router-link v-if="isAdmin" to="/owner/catalog">
                        Owner
                    </router-link>
                </nav>

                <libraryLists />
                <div class="lpSidebarDivider" />
                <router-link to="/pack" class="lpSidebarNav" data-testid="drawer-pack">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11l3 3 8-8" /><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9" /></svg>
                    Pack this list
                </router-link>
                <router-link to="/gear" class="lpSidebarNav" data-testid="drawer-gear">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
                    Closet
                    <span class="lpSidebarNavCount">{{ closetCount }}</span>
                </router-link>
            </template>

            <!-- Desktop: an icon rail, and one panel beside it, either your
                 lists or your closet. Choosing a list puts the lists away and
                 gives the closet the whole column. -->
            <template v-else>
                <nav class="wgRail" aria-label="Sidebar">
                    <button
                        type="button"
                        class="wgRailBtn wgRailCollapse"
                        :title="open ? 'Hide the panel' : 'Show the panel'"
                        :aria-label="open ? 'Hide the panel' : 'Show the panel'"
                        :aria-expanded="String(open)"
                        aria-controls="wgSidebarPanel"
                        data-testid="toggle-sidebar"
                        @click="$store.commit('toggleSidebar')"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path v-if="open" d="m15 6-6 6 6 6" /><path v-else d="m9 6 6 6-6 6" /></svg>
                    </button>
                    <button
                        type="button"
                        class="wgRailBtn"
                        :class="{ wgOn: open && panel === 'lists' }"
                        :aria-pressed="String(open && panel === 'lists')"
                        aria-controls="wgSidebarPanel"
                        title="Your lists"
                        data-testid="rail-lists"
                        @click="show('lists')"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" /></svg>
                        <span class="wgRailLabel">Lists</span>
                        <span class="wgRailCount">{{ library.lists.length }}</span>
                    </button>
                    <button
                        type="button"
                        class="wgRailBtn"
                        :class="{ wgOn: open && panel === 'closet' }"
                        :aria-pressed="String(open && panel === 'closet')"
                        aria-controls="wgSidebarPanel"
                        title="Your gear closet"
                        data-testid="rail-closet"
                        @click="show('closet')"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4a2 2 0 0 1 2 2c0 .9-.6 1.4-1.2 1.9-.4.3-.8.6-.8 1.1v.6" /><path d="M12 9.6 3.5 15.4A1.6 1.6 0 0 0 4.4 18h15.2a1.6 1.6 0 0 0 .9-2.6L12 9.6z" /></svg>
                        <span class="wgRailLabel">Closet</span>
                        <span class="wgRailCount">{{ closetCount }}</span>
                    </button>
                    <button
                        type="button"
                        class="wgRailBtn"
                        :class="{ wgOn: open && panel === 'catalog' }"
                        :aria-pressed="String(open && panel === 'catalog')"
                        aria-controls="wgSidebarPanel"
                        title="The gear catalog"
                        data-testid="rail-catalog"
                        @click="show('catalog')"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10v16H5.5A1.5 1.5 0 0 1 4 18.5z" /><path d="M10 4h8.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H10" /><path d="M13.5 9h3M13.5 13h3" /></svg>
                        <span class="wgRailLabel">Catalog</span>
                    </button>
                    <span class="wgRailSep" aria-hidden="true" />
                    <router-link to="/pack" class="wgRailBtn" title="Pack this list" data-testid="open-pack">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11l3 3 8-8" /><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9" /></svg>
                        <span class="wgRailLabel">Pack</span>
                    </router-link>
                    <router-link to="/print" class="wgRailBtn" title="Print a paper checklist" data-testid="open-print">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V3h12v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M7 14h10v7H7z" /></svg>
                        <span class="wgRailLabel">Print</span>
                    </router-link>
                    <button v-if="canPlan" type="button" class="wgRailBtn wgTeamButton" title="Plan this list with others" data-testid="open-team" @click="openTeam()">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17" cy="9" r="2.6" /><path d="M16 14.2c2.8.3 5 2.7 5 5.8" /></svg>
                        <span class="wgRailLabel">Team</span>
                    </button>
                    <share rail />
                    <listSettings rail />
                </nav>
                <div id="wgSidebarPanel" class="wgSidebarPanel" :inert="!open">
                    <div v-show="panel === 'lists'" class="wgPanel wgPanelLists" data-testid="panel-lists">
                        <!-- Same spot as "Switch" on the closet: the two toggle
                             back and forth without the pointer landing on
                             anything else. -->
                        <button type="button" class="wgCurrentList" data-testid="back-to-closet" title="Back to your closet" @click="setPanel('closet')">
                            <span class="wgCurrentListText">
                                <span class="wgCurrentListLabel">Choose a list</span>
                                <span class="wgCurrentListName">{{ library.lists.length }} {{ library.lists.length === 1 ? 'list' : 'lists' }}</span>
                            </span>
                            <span class="wgCurrentListSwitch">Closet</span>
                        </button>
                        <libraryLists @chosen="chosen" />
                    </div>
                    <div v-show="panel === 'closet'" class="wgPanel wgPanelCloset" data-testid="panel-closet">
                        <button type="button" class="wgCurrentList" data-testid="current-list" title="Choose another list" @click="show('lists')">
                            <span class="wgCurrentListText">
                                <span class="wgCurrentListLabel">Adding to</span>
                                <span class="wgCurrentListName">{{ currentListName }}</span>
                            </span>
                            <span class="wgCurrentListSwitch">Switch</span>
                        </button>
                        <libraryItems />
                    </div>
                    <div v-show="panel === 'catalog'" class="wgPanel wgPanelCatalog" data-testid="panel-catalog">
                        <button type="button" class="wgCurrentList" title="Choose another list" @click="show('lists')">
                            <span class="wgCurrentListText">
                                <span class="wgCurrentListLabel">Adding to</span>
                                <span class="wgCurrentListName">{{ currentListName }}</span>
                            </span>
                            <span class="wgCurrentListSwitch">Switch</span>
                        </button>
                        <catalogPanel :active="open && panel === 'catalog'" />
                    </div>
                </div>
            </template>
        </div>
    </aside>
</template>

<script>
import libraryItems from './library-items.vue';
import catalogPanel from './catalog-panel.vue';
import libraryLists from './library-lists.vue';
import brandLogo from './brand-logo.vue';
import share from './share.vue';
import listSettings from './list-settings.vue';

import { isMobile } from '../utils/viewport.js';

// Which panel the desktop sidebar shows. A per-browser convenience, so
// localStorage (whether it's open at all is library.showSidebar, which
// follows the account).
const PANEL_KEY = 'wgSidebarPanel';
const readPanel = () => {
    try {
        const v = localStorage.getItem(PANEL_KEY);
        return ['lists', 'catalog'].includes(v) ? v : 'closet';
    } catch {
        return 'closet';
    }
};

export default {
    name: 'Sidebar',
    components: {
        libraryItems,
        catalogPanel,
        libraryLists,
        brandLogo,
        share,
        listSettings,
    },
    inject: { openTeam: { default: () => () => {} } },
    setup() {
        return { isMobile };
    },
    data() {
        const panel = readPanel();
        return { panel, returnTo: panel === 'catalog' ? 'catalog' : 'closet' };
    },
    computed: {
        library() {
            return this.$store.state.library;
        },
        open() {
            return Boolean(this.library.showSidebar);
        },
        // Planning together needs a signed-in, saved list (as in dashboard.vue).
        canPlan() {
            return this.$store.state.saveType === 'remote' && Boolean(this.$store.state.loggedIn);
        },
        isAdmin() {
            return Boolean(this.$store.state.account && this.$store.state.account.isAdmin);
        },
        closetCount() {
            return this.library.items.filter((i) => !i.retired && (i.name || i.weight || i.description)).length;
        },
        currentListName() {
            const list = this.library.getListById(this.library.defaultListId);
            return (list && list.name) || 'Untitled list';
        },
    },
    methods: {
        setPanel(panel) {
            this.panel = panel;
            if (panel !== 'lists') this.returnTo = panel;
            try {
                localStorage.setItem(PANEL_KEY, panel);
            } catch {
                // Storage blocked: it just won't be remembered.
            }
        },
        // A rail button: show that panel, or put the sidebar away if it's
        // the one already showing.
        show(panel) {
            if (this.open && this.panel === panel) {
                this.$store.commit('toggleSidebar');
                return;
            }
            this.setPanel(panel);
            if (!this.open) this.$store.commit('toggleSidebar');
        },
        // A list was chosen: the lists go back into the rail and the closet
        // (or the catalog, if that's where you came from) takes the column,
        // ready to add gear to it.
        chosen() {
            this.setPanel(this.returnTo || 'closet');
        },
    },
};
</script>

<style lang="scss">
@import "../css/_globals";

#sidebar {
    background: var(--lp-sidebar-bg);
    border-right: 1px solid var(--lp-sidebar-border);
    clip-path: inset(-100vh -100vw);
    color: var(--lp-sidebar-text);
    flex: 0 0 280px;
    min-width: 0;
    transition: flex-basis $transitionDurationSlow, clip-path 0s $transitionDurationSlow, background $transitionDurationSlow;
    z-index: $sidebar;

    #main:not(.lpHasSidebar) & {
        background: var(--lp-bg);
        clip-path: inset(0);
        flex-basis: 0;
        transition: flex-basis $transitionDurationSlow, clip-path 0s, background $transitionDurationSlow;
    }
}

.lpSidebarSticky {
    display: flex;
    flex-direction: column;
    height: 100vh;
    opacity: 1;
    padding-right: 1px;
    position: sticky;
    top: 0;
    transition: opacity $transitionDurationSlow;
    width: 280px;

    #main:not(.lpHasSidebar) & {
        opacity: 0;
    }
}

// The logo only shows in the phone drawer; on the desktop the site header
// has it.
.wgDrawerBrand {
    display: none;
    padding: 18px 18px 10px;

    .wgLogo {
        height: 28px;
    }
}

.wgDrawerNav {
    display: flex;
    flex-direction: column;
    padding: 0 10px 8px;

    a {
        align-items: center;
        border-radius: 9px;
        color: var(--lp-sidebar-text);
        display: flex;
        font-size: 15px;
        font-weight: 600;
        min-height: 44px;
        padding: 0 8px;
        text-decoration: none;
    }
}

#sidebar .lpSidebarSticky {
    padding-top: 12px;
}

.lpSidebarDivider {
    border-top: 1px solid var(--lp-sidebar-border);
    flex: 0 0 auto;
    margin: 6px 18px 0;
}

.lpSidebarSectionHeader {
    align-items: center;
    display: flex;
    flex: 0 0 auto;
    justify-content: space-between;
    padding: 2px 18px 4px;
}

.lpSectionLabel {
    color: var(--lp-sidebar-muted);
    flex: 1 1 auto;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
}

.lpSidebarNew {
    color: var(--lp-accent-green-deep);
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;

    &:hover {
        text-decoration: underline;
    }
}

// Thin overlay scrollbars for the two independently scrolling regions.
.lpSidebarScroll {
    overflow-y: auto;
    scrollbar-color: rgba(255, 255, 255, 0.45) transparent;
    scrollbar-width: thin;

    &::-webkit-scrollbar {
        width: 6px;
    }

    &::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.45);
        border-radius: 3px;
    }
}

// ============================================================
// Desktop: icon rail + one panel (lists or closet)
//
// The rail always shows. library.showSidebar opens or closes the panel
// beside it; the panel's content (lists or closet) is a per-browser choice.
// ============================================================
$railWidth: 60px;
// Wide enough to read gear names in the closet and catalog.
$panelWidth: 380px;

#sidebar.wgSidebarDesk {
    flex-basis: $railWidth + $panelWidth;

    .lpSidebarSticky {
        flex-direction: row;
        padding-top: 0;
        width: $railWidth + $panelWidth;
    }
}

// Collapsed: the rail stays, the panel is clipped away with the column.
#main:not(.lpHasSidebar) #sidebar.wgSidebarDesk {
    background: var(--lp-sidebar-bg);
    flex-basis: $railWidth;

    .lpSidebarSticky {
        opacity: 1;
    }

    .wgSidebarPanel {
        opacity: 0;
    }
}

.wgRail {
    align-items: center;
    border-right: 1px solid var(--lp-sidebar-border);
    display: flex;
    flex: 0 0 $railWidth;
    flex-direction: column;
    gap: 4px;
    height: 100%;
    padding: 12px 0;
}

.wgRailBtn {
    align-items: center;
    background: none;
    border: 0;
    border-radius: 11px;
    color: var(--lp-sidebar-muted);
    cursor: pointer;
    display: flex;
    flex-direction: column;
    font: inherit;
    gap: 3px;
    padding: 8px 0 6px;
    position: relative;
    text-decoration: none;
    width: 50px;

    &:hover {
        background: var(--lp-sidebar-inset);
        color: var(--lp-sidebar-text);
    }

    &:focus-visible {
        outline: 2px solid var(--lp-accent-green-deep);
        outline-offset: 1px;
    }

    &.wgOn {
        background: var(--lp-active-bg);
        color: var(--lp-accent-green-deep);
    }
}

.wgRailLabel {
    font-size: 11px;
    font-weight: 650;
    line-height: 1;
}

.wgRailCount {
    background: var(--lp-sidebar-border);
    border-radius: 99px;
    color: var(--lp-sidebar-text);
    font-size: 10px;
    font-weight: 700;
    line-height: 16px;
    min-width: 16px;
    padding: 0 4px;
    position: absolute;
    right: 1px;
    text-align: center;
    top: 2px;
}

.wgRailBtn.wgOn .wgRailCount {
    background: var(--lp-accent-green-deep);
    color: var(--lp-primary-ink);
}

.wgRailSep {
    border-top: 1px solid var(--lp-sidebar-border);
    margin: 6px 0;
    width: 32px;
}

// Share and Settings bring their own menus: open them beside the rail,
// not under it.
.wgRailTool {
    display: flex;
    justify-content: center;
    width: 100%;

    // Outranks the header placement in list-settings.vue (#share/#settings
    // hang from their target's right edge there).
    #share .lpContent,
    &#settings .lpContent {
        border-radius: 0 14px 14px;
        left: calc(100% + 10px);
        margin-top: 0;
        right: auto;
        top: -6px;
        transform: none;
    }

    .lpPopover .lpContent {
        left: calc(100% + 10px);
        margin-top: 0;
        top: -6px;
        transform: none;
    }

    .lpPopover.lpPopoverShown .lpContent {
        margin-top: 0;
    }

    .lpPopover .lpContent::before {
        bottom: 0;
        height: auto;
        left: -14px;
        right: auto;
        top: 0;
        width: 14px;
    }
}

.wgRailCollapse {
    border-bottom: 1px solid var(--lp-sidebar-border);
    border-radius: 11px 11px 0 0;
    margin-bottom: 4px;
    padding: 8px 0 10px;
}

.wgSidebarPanel {
    display: flex;
    flex: 0 0 $panelWidth;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    min-width: 0;
    padding-top: 12px;
    transition: opacity $transitionDurationSlow;
}

.wgPanel {
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    min-height: 0;
}

.wgPanelCatalog .wgCatalogPanel {
    flex: 1 1 0;
    overflow-x: hidden;
    overflow-y: auto;
    // Lines up with the "Adding to" card above.
    padding: 10px 14px 12px;
}

// On its own, the lists panel uses the whole height rather than the
// shared-column caps.
.wgPanelLists {
    // The card above says it; no second "Lists · n" heading.
    .listContainerHeader {
        display: none;
    }

    #listContainer {
        display: flex;
        flex: 1 1 0;
        flex-direction: column;
        min-height: 0;
        padding-top: 10px;
    }

    .lpSidebarListsRegion {
        flex: 1 1 0;
        min-height: 0;
        overflow-y: auto;

        #lists,
        #pinnedLists {
            max-height: none;
            overflow: visible;
        }
    }
}

// Top of the closet: which list you're adding to, and the way back to
// the others.
.wgCurrentList {
    align-items: center;
    background: var(--lp-sidebar-inset);
    border: 1px solid var(--lp-sidebar-border);
    border-radius: 11px;
    color: var(--lp-sidebar-text);
    cursor: pointer;
    display: flex;
    flex: 0 0 auto;
    font: inherit;
    gap: 10px;
    margin: 0 14px 2px;
    padding: 8px 12px;
    text-align: left;

    &:hover {
        border-color: var(--lp-accent-green-deep);
    }
}

.wgCurrentListText {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-width: 0;
}

.wgCurrentListLabel {
    color: var(--lp-sidebar-muted);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
}

.wgCurrentListName {
    font-size: 14px;
    font-weight: 650;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.wgCurrentListSwitch {
    color: var(--lp-accent-green-deep);
    flex: none;
    font-size: 13px;
    font-weight: 650;
}

// Smaller laptops and tablets: a narrower panel, so the list keeps room.
@media only screen and (width > $mobile) and (width <= 1365px) {
    #sidebar.wgSidebarDesk {
        flex-basis: $railWidth + 320px;

        .lpSidebarSticky {
            width: $railWidth + 320px;
        }
    }

    .wgSidebarPanel {
        flex-basis: 320px;
    }
}

@media only screen and (width > $mobile) and (width <= 1180px) {
    #sidebar.wgSidebarDesk {
        flex-basis: $railWidth + 270px;

        .lpSidebarSticky {
            width: $railWidth + 270px;
        }
    }

    .wgSidebarPanel {
        flex-basis: 270px;
    }
}

// ============================================================
// Phone layout — the rail becomes an overlay drawer (#11f)
//
// The rail leaves the flow entirely and becomes a fixed panel sliding in over
// the list, with dashboard.vue's scrim behind it. The saved rail state stops
// driving anything here (the local drawerOpen flag does), so both branches of
// the desktop lpHasSidebar rules have to be neutralised — hence the doubled
// selectors, which match the desktop rules' specificity and win on order.
// ============================================================
@media only screen and (width <= $mobile) {
    #sidebar,
    #main:not(.lpHasSidebar) #sidebar {
        background: var(--lp-sidebar-bg);
        bottom: 0;
        // The desktop clip stops the fixed-width inner column painting outside
        // a collapsing rail. The drawer slides as one piece, so the clip has
        // nothing to do but interfere with the shadow.
        clip-path: none;
        flex: none;
        left: 0;
        // Leave a strip of the list visible so the drawer reads as an overlay
        // and there's somewhere obvious to tap to dismiss it.
        max-width: 85vw;
        position: fixed;
        top: 0;
        transform: translateX(-100%);
        transition: transform $transitionDurationSlow;
        width: 296px;
        z-index: $sidebar;
    }

    #main.lpDrawerOpen #sidebar {
        box-shadow: 6px 0 24px rgba(0, 0, 0, 0.35);
        transform: none;
    }

    // The sticky inner column is a desktop device for pinning the rail while
    // the content scrolls; the drawer is already fixed, so it just fills it.
    #sidebar .lpSidebarSticky,
    #main:not(.lpHasSidebar) .lpSidebarSticky {
        height: 100%;
        opacity: 1;
        position: static;
        width: 100%;
    }

    .wgDrawerBrand {
        display: block;
    }

    // Touch targets: the section headers' "+ New" and the rows below it are
    // 11–13px text on the desktop, which is under the 44px floor by a mile.
    .lpSidebarSectionHeader {
        padding: 8px 18px 6px;
    }

    .lpSectionLabel {
        font-size: 11px;
    }

    .lpSidebarNew {
        font-size: 13px;
        padding: 6px 0 6px 12px;
    }

    // With the gear list gone the lists region is the drawer's main content,
    // so let it use the height rather than capping at the rail's ~7 rows.
    .lpSidebarListsRegion #lists {
        max-height: 60vh;
    }
}

// Drawer nav row (phone only — rendered behind v-if, so no media query).
.lpSidebarNav {
    align-items: center;
    color: var(--lp-sidebar-text);
    display: flex;
    flex: 0 0 auto;
    font-size: 14px;
    gap: 10px;
    padding: 14px 18px;
    text-decoration: none;

    svg {
        color: var(--lp-sidebar-muted);
        flex: 0 0 auto;
    }
}

.lpSidebarNavCount {
    color: var(--lp-sidebar-muted);
    font-size: 11.5px;
    margin-left: auto;
}
</style>
