<template>
    <div v-if="isLoaded" class="wgApp">
        <siteHeader app active="lists" />
        <offlineBanner />
        <div id="main" :class="{lpHasSidebar: library.showSidebar, lpDrawerOpen: drawerOpen}">
            <div class="lpFrameFill lpFrameFillLeft" />
            <planSidebar v-if="planMode" />
            <sidebar v-else />
            <div class="lpDrawerScrim" data-testid="drawer-scrim" @click="closeDrawer" />
            <main id="wgMain" class="lpContentCol" tabindex="-1">
                <h1 class="wgVisuallyHidden">
                    {{ list.name || 'Your list' }}
                </h1>
                <div id="header">
                    <!-- On the desktop the tools live in the sidebar's rail and the
                         account menu in the site header, so the title has the
                         row. Phones (and shared plans, which have their own
                         sidebar) keep them here. -->
                    <span v-if="!railTools" class="headerItem">
                        <a id="hamburger" class="lpTransition" aria-label="Lists and gear" data-testid="toggle-sidebar" @click="toggleSidebar"><i class="lpSprite lpHamburger" /></a>
                    </span>
                    <input id="lpListName" :value="list.name" type="text" class="lpListName lpSilent headerItem" placeholder="Name your list" aria-label="List name" autocomplete="off" name="lastpass-disable-search" @input="updateListName">
                    <router-link v-if="!railTools" to="/pack" class="headerItem wgPackLink" data-testid="open-pack">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11l3 3 8-8" /><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9" /></svg>
                        Pack
                    </router-link>
                    <router-link v-if="!railTools" to="/print" class="headerItem wgPackLink wgPrintLink" data-testid="open-print" title="Print a paper checklist">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V3h12v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M7 14h10v7H7z" /></svg>
                        Print
                    </router-link>
                    <planPresence v-if="canPlan" :team="!railTools" @team="showTeam = true" />
                    <share v-if="!planMode && !railTools" />
                    <listSettings v-if="!planMode && !railTools" />
                    <accountDropdown v-if="isMobile" />
                </div>

                <list />

                <siteFooter id="lpFooter" />
            </main>
            <div class="lpFrameFill lpFrameFillRight" />

            <globalAlerts />
            <speedbump
                :shown="showSpeedbump"
                :speedbump-callback="speedbumpCallback"
                :speedbump-options="speedbumpOptions"
                @hide="showSpeedbump = false"
            />
            <copyList :shown="showCopyList" @hide="showCopyList = false" />
            <importList :shown="showImport" @hide="showImport = false" />
            <gearDetails :shown="showGearDetails" :item="gearDetailsItem" @hide="showGearDetails = false" />
            <planTeam v-if="canPlan" :shown="showTeam" :owner="teamOwner" :list-id="teamListId" @hide="showTeam = false" @members="onMembers" />
            <importCSV ref="importCSVRef" />
            <itemImage :shown="showItemImage" :item="itemImageItem" @hide="showItemImage = false" />
            <itemViewImage :shown="showItemViewImage" :image-url="itemViewImageUrl" @hide="showItemViewImage = false" />
            <itemLink :shown="showItemLink" :item="itemLinkItem" @hide="showItemLink = false" />
            <help :shown="showHelp" @hide="showHelp = false" />
            <account :shown="showAccount" @hide="showAccount = false" />
            <accountDelete :shown="showDeleteAccount" @hide="showDeleteAccount = false" />
            <catalogPicker :shown="showCatalogPicker" :initial-category-id="catalogPickerCategoryId" @hide="showCatalogPicker = false" />
        </div>
    </div>
</template>

<script>
import globalAlerts from '../components/global-alerts.vue';
import sidebar from '../components/sidebar.vue';
import share from '../components/share.vue';
import listSettings from '../components/list-settings.vue';
import account from '../components/account.vue';
import accountDelete from '../components/account-delete.vue';
import help from '../components/help.vue';
import list from '../components/list.vue';

import itemImage from '../components/item-image.vue';
import itemViewImage from '../components/item-view-image.vue';
import itemLink from '../components/item-link.vue';
import importCSV from '../components/import-csv.vue';
import copyList from '../components/copy-list.vue';
import importList from '../components/import-list.vue';
import gearDetails from '../components/gear-details.vue';
import planTeam from '../components/plan-team.vue';
import planPresence from '../components/plan-presence.vue';
import planSidebar from '../components/plan-sidebar.vue';
import speedbump from '../components/speedbump.vue';
import accountDropdown from '../components/account-dropdown.vue';
import siteFooter from '../components/site-footer.vue';
import siteHeader from '../components/site-header.vue';
import catalogPicker from '../components/catalog-picker.vue';

import { isMobile } from '../utils/viewport.js';
import { api } from '../utils/format.js';
import offlineBanner from '../components/offline-banner.vue';

export default {
    name: 'Dashboard',
    components: {
        planTeam,
        planPresence,
        planSidebar,
        gearDetails,
        importList,
        offlineBanner,
        sidebar,
        share,
        listSettings,
        account,
        accountDelete,
        help,
        list,
        itemLink,
        copyList,
        importCSV,
        itemImage,
        itemViewImage,
        speedbump,
        globalAlerts,
        accountDropdown,
        siteFooter,
        siteHeader,
        catalogPicker,
    },
    provide() {
        return {
            openAccount: () => { this.showAccount = true; },
            openHelp: () => { this.showHelp = true; },
            openTeam: () => { this.showTeam = true; },
            openDeleteAccount: () => { this.showDeleteAccount = true; },
            openCopyList: () => { this.showCopyList = true; },
            openImportCSV: () => { this.$refs.importCSVRef.triggerUpload(); },
            openImportLighterPack: () => { this.showImport = true; },
            openGearDetails: (item) => { this.gearDetailsItem = item; this.showGearDetails = true; },
            openItemImage: (item) => { this.itemImageItem = item; this.showItemImage = true; },
            openItemViewImage: (imageUrl) => { this.itemViewImageUrl = imageUrl; this.showItemViewImage = true; },
            openItemLink: (item) => { this.itemLinkItem = item; this.showItemLink = true; },
            openCatalogPicker: (category) => {
                this.catalogPickerCategoryId = category ? category.id : null;
                this.showCatalogPicker = true;
            },
            initSpeedbump: (callback, options) => {
                this.speedbumpCallback = callback;
                this.speedbumpOptions = options;
                this.showSpeedbump = true;
            },
        };
    },
    setup() {
        return { isMobile };
    },
    data() {
        return {
            isLoaded: false,
            drawerOpen: false,
            showAccount: false,
            showHelp: false,
            showDeleteAccount: false,
            showCopyList: false,
            showImport: false,
            showGearDetails: false,
            showTeam: false,
            gearDetailsItem: null,
            showItemImage: false,
            itemImageItem: null,
            showItemViewImage: false,
            itemViewImageUrl: '',
            showItemLink: false,
            itemLinkItem: null,
            showSpeedbump: false,
            speedbumpCallback: null,
            speedbumpOptions: null,
            showCatalogPicker: false,
            catalogPickerCategoryId: null,
        };
    },
    computed: {
        library() {
            return this.$store.state.library;
        },
        list() {
            return this.library.getListById(this.library.defaultListId);
        },
        isSignedIn() {
            return this.$store.state.loggedIn;
        },
        planMode() {
            return this.$store.state.saveType === 'shared' && Boolean(this.$store.state.plan);
        },
        // Planning together needs an account (saved on the server).
        // Desktop, own lists: the tools are in the sidebar's rail.
        railTools() {
            return !this.isMobile && !this.planMode;
        },
        canPlan() {
            return this.planMode || (this.$store.state.saveType === 'remote' && Boolean(this.isSignedIn));
        },
        teamOwner() {
            return this.planMode ? this.$store.state.plan.owner : String(this.isSignedIn || '');
        },
        teamListId() {
            return this.planMode ? this.$store.state.plan.listId : Number(this.library.defaultListId);
        },
    },
    watch: {
        // Picking a list is the drawer's whole job, so it gets out of the way
        // once you have. Watching the id rather than wiring a callback through
        // library-lists keeps the drawer's business in the drawer's owner.
        'library.defaultListId': function closeOnListChange() {
            this.drawerOpen = false;
            this.loadListMembers();
        },
    },
    beforeMount() {
        const copyId = this.$route.query.copy;
        // "Bring your list over" on the homepage: same, an account-less
        // library to import into if there isn't one yet.
        const importing = ['lighterpack', 'packwizard', '1'].includes(String(this.$route.query.import || ''));
        // "Start a list" in the header of a server-rendered page.
        const starting = this.$route.query.start === '1';
        // "Copy to my lists" from a shared page works without an account:
        // a visitor with no library gets an account-less one to copy into.
        // Only ever when there's no library, so nothing is replaced.
        if (!this.$store.state.library && (copyId || importing || starting)) {
            this.$store.dispatch('startLocalLibrary');
        }
        if (starting) this.$router.replace({ query: {} });
        if (!this.$store.state.library) {
            this.$router.push('/welcome');
        } else {
            this.isLoaded = true;
            if (copyId) this.copySharedList(String(copyId));
            if (importing) {
                this.$router.replace({ query: {} });
                this.showImport = true;
            }
        }
    },
    mounted() {
        this.loadListMembers();
    },
    methods: {
        // Who plans the current (own) list with you, for "Who carries what".
        async loadListMembers() {
            if (this.planMode || this.$store.state.saveType !== 'remote' || !this.isSignedIn) {
                this.$store.commit('setListMembers', []);
                return;
            }
            const listId = this.library.defaultListId;
            try {
                const r = await api(`/api/plan/${encodeURIComponent(this.isSignedIn)}/${listId}/members`);
                if (listId === this.library.defaultListId) this.$store.commit('setListMembers', r.members);
            } catch {
                this.$store.commit('setListMembers', []);
            }
        },
        onMembers(members) {
            if (this.planMode) this.$store.commit('setPlanMembers', members);
            else this.$store.commit('setListMembers', members);
        },
        async copySharedList(externalId) {
            this.$router.replace({ query: {} });
            try {
                const shared = await api(`/api/kits/${encodeURIComponent(externalId)}`);
                this.$store.commit('importSharedList', shared);
                const alert = { message: `Copied “${shared.name}” to your lists. Edit it freely; the original won't change.` };
                const alerts = this.$store.state.globalAlerts;
                alerts.push(alert);
                setTimeout(() => {
                    const i = alerts.indexOf(alert);
                    if (i > -1) alerts.splice(i, 1);
                }, 6000);
            } catch (err) {
                this.$store.state.globalAlerts.push({ message: err.message || 'That list could not be copied.' });
            }
        },
        // The rail's collapsed state is a saved account preference
        // (library.showSidebar, serialized with the library); the phone drawer
        // is throwaway view state. Keeping them separate means opening the
        // drawer on a phone doesn't collapse the rail on the desktop.
        toggleSidebar() {
            if (this.isMobile) {
                this.drawerOpen = !this.drawerOpen;
            } else {
                this.$store.commit('toggleSidebar');
            }
        },
        closeDrawer() {
            this.drawerOpen = false;
        },
        updateListName(evt) {
            this.$store.commit('updateListName', { id: this.list.id, name: evt.target.value });
        },
    },
};
</script>

<style lang="scss">
@import "../css/_globals";

// App frame: dark filler | 220px sidebar | 1060px content | light filler.
// The sidebar + content cluster centers as a unit; the fillers bleed the two
// surfaces to the viewport edges so nothing looks boxed. Overrides the base
// #main rules in _base.scss (shared with the share bundle, so not edited there).
#main {
    display: flex;
    margin: 0;
    max-width: none;
    min-height: 100vh;

    &.lpHasSidebar {
        max-width: none;
    }
}

.lpFrameFill {
    flex: 1 1 0;
    min-width: 0;
}

// The left filler carries the rail's surface out to the viewport edge, so it
// has to change surface on the same beat the rail collapses — swapping it
// outright reads as a flash next to the sliding rail.
.lpFrameFillLeft {
    background: var(--lp-content-bg);
    transition: background-color $transitionDurationSlow;

    .lpHasSidebar & {
        background: var(--lp-sidebar-bg);
    }

    // On the desktop the icon rail stays when the panel is put away, so the
    // filler keeps the sidebar's surface either way.
    @media only screen and (width > $mobile) {
        background: var(--lp-sidebar-bg);
    }
}

.lpFrameFillRight {
    background: var(--lp-content-bg);
}

.lpContentCol {
    background: var(--lp-content-bg);
    color: var(--lp-text);
    display: flex;
    flex-direction: column;
    min-width: 0;
}

// The editor sits in the same column as the site header and every other
// page (.wgPage: 1366px wide, 24px in from each side), so the rail starts
// under the logo and the list ends where the header does. The rail and
// panel take what they need; the list gets the rest of the 1318px.
@media only screen and (width > $mobile) {
    // Row controls (remove ✕, drag handle) appear in the margins beside the
    // list on hover; the margins are always at least the 24px they need.
    // Their invisible hover band reaches a little further: clip it rather
    // than let it scroll the page sideways.
    #main {
        overflow-x: clip;
    }

    .lpFrameFill {
        min-width: 24px;
    }

    .lpContentCol {
        flex: 0 1 calc(1318px - 440px);
    }

    #main:not(.lpHasSidebar) .lpContentCol {
        flex-basis: calc(1318px - 60px);
    }

    // Shared plans have their own, fixed-width sidebar.
    #main .wgPlanSidebar ~ .lpContentCol {
        flex-basis: calc(1318px - 280px);
    }
}

// Below the site header, the editor fills the rest of the window.
.wgApp #main {
    min-height: calc(100vh - 65px);
}

#header {
    align-items: center;
    display: flex;
    flex: 0 0 auto;
    gap: 18px;
    padding: 22px 32px 14px;

    // Desktop: the gutter beside the sidebar, and none on the right, so the
    // header ends where the site header does.
    @media only screen and (width > $mobile) {
        padding-right: 0;
    }

    .lpTarget  .lpSprite {
        height: 14px;
    }
}

.wgPackLink {
    align-items: center;
    color: var(--lp-text);
    display: inline-flex;
    font-size: 13px;
    font-weight: 600;
    gap: 6px;
    padding: 4px 0;
    text-decoration: none;

    &:hover {
        color: var(--lp-link-blue);
    }
}

#hamburger {
    cursor: pointer;
    display: inline-block;
    opacity: 0.5;
    transition: transform $transitionDurationSlow;

    &:hover {
        opacity: 1;
    }

    .lpHasSidebar & {
        transform: rotate(90deg);
    }
}

// Rename affordance matches the item rows: a quiet box that outlines on
// hover and fills on focus, never an underline. The negative margin cancels
// the box's own padding so the title text keeps its place in the header.
#lpListName {
    flex: 1 1 auto;
    font-family: $font-display;
    font-size: 28px;
    font-stretch: 112%;
    font-weight: 800;
    letter-spacing: -0.01em;
    margin-left: -3px;
    min-width: 0;
    padding: 3px 7px;
    transition: border-color $transitionDuration;

    &:hover {
        border-color: var(--lp-border);
    }

    &:focus {
        background: var(--lp-bg);
        border-color: var(--lp-border-strong);
    }
}

.headerItem {
    flex: 0 0 auto;
    position: relative;

    .lpTarget {
        color: var(--lp-text);
        font-size: 13px;
        font-weight: 600;
        padding: 4px 0;

        &:hover {
            color: var(--lp-link-blue);
        }
    }

    &.lpAccount {
        padding-left: 20px;

        &:before {
            content: "";
            display: block;
            position: absolute;
            top: 2px;
            bottom: 0px;
            width: 1px;
            background: var(--lp-border-strong);
            left: 0;
        }
    }
}

// Layout and type come from the shared footer; the app only places it -- last
// in the content column, held to the same gutters as the list above it.
#lpFooter {
    margin-top: auto;
    padding: 80px 56px 20px;
}

// Dims the list behind the open drawer and catches the tap that closes it.
// Inert until the drawer opens, so it never eats a click on the desktop.
.lpDrawerScrim {
    display: none;
}

// ============================================================
// Phone layout — app bar (#18a) and drawer (#11f)
//
// The three-region desktop frame (dark filler | rail | content | light
// filler) collapses to one column: the fillers have nothing to bleed to at
// this width, and the rail lifts out of the flow into an overlay drawer.
// ============================================================
@media only screen and (width <= $mobile) {
    #main {
        display: block;
    }

    .lpFrameFill {
        display: none;
    }

    .lpContentCol {
        display: block;
        width: auto;
    }

    // The header stops being page chrome and becomes the app bar: dark, full
    // bleed, and stuck to the top so the list title and the drawer stay
    // reachable well down a long list.
    #header {
        background: var(--lp-sidebar-bg);
        color: var(--lp-sidebar-text);
        gap: 12px;
        padding: 11px 14px;
        position: sticky;
        top: 0;
        z-index: $mobileHeader;
    }

    #hamburger {
        color: var(--lp-sidebar-text);
        opacity: 1;
    }

    // On the desktop the hamburger rotates with the rail; here it tracks the
    // drawer instead, so the saved rail state must stop driving it.
    #main.lpHasSidebar #hamburger {
        transform: none;
    }

    #main.lpDrawerOpen #hamburger {
        transform: rotate(90deg);
    }

    #lpListName {
        color: var(--lp-sidebar-text);
        font-size: 17px;
        margin-left: -5px;
        padding: 3px 5px;

        // The desktop rename affordance outlines on hover, which a phone can't
        // do; the field is still tappable, it just stays quiet until focused.
        &:hover {
            border-color: transparent;
        }

        &:focus {
            background: var(--lp-sidebar-inset);
            border-color: var(--lp-sidebar-border);
        }
    }

    // Share / Settings / account collapse to their icons — the labels don't fit
    // beside a list title at 390px. font-size: 0 drops the label text node
    // without touching the sprite, which carries its own px dimensions.
    // Centred with flex rather than left to inline layout: font-size: 0
    // collapses the line box these icons would otherwise sit on the baseline
    // of, which hung them 2px above the app bar's centre.
    .headerItem .lpTarget,
    .headerItem .lpTarget > span {
        align-items: center;
        display: flex;
    }

    .headerItem .lpTarget {
        color: var(--lp-sidebar-text);
        font-size: 0;
        padding: 0;

        .lpSprite {
            height: 17px;
            top: 0;
            width: 17px;
        }

        &:hover {
            color: var(--lp-sidebar-text);
        }
    }

    // Pack keeps its icon and drops its label like the others, but stays a
    // full 44px tap target.
    .wgPackLink {
        color: var(--lp-sidebar-text);
        font-size: 0;
        justify-content: center;
        min-height: 44px;
        min-width: 36px;

        svg {
            height: 19px;
            width: 19px;
        }
    }

    // The rule dividing the avatar from the other actions is desktop chrome;
    // at this width the gap reads on its own.
    .headerItem.lpAccount {
        padding-left: 0;

        &:before {
            display: none;
        }
    }

    // Header menus hang off the viewport: they're anchored to a control a few
    // pixels from the right edge, and the desktop flyout centres itself on
    // that control — which put the Share menu 19px past the left edge.
    //
    // Dropping the popover's own positioning context lets the content resolve
    // against the sticky header instead. That's full-bleed, so the menu can
    // span the screen with a margin either side and sit directly under the app
    // bar, which is where a phone expects it.
    // Both of these are positioned on the desktop, and either one would
    // capture the menu as its containing block.
    .headerItem,
    .headerItem .lpPopover {
        position: static;
    }

    // Full bleed, flush to the app bar, rounded only where it ends: the menu
    // reads as a panel pulled down out of the header rather than a card
    // floating under it. #main raises specificity over popover.vue's own
    // .lpPopoverShown rules, whose injection order isn't guaranteed.
    #main .headerItem .lpPopover .lpContent {
        border-radius: 0 0 12px 12px;
        left: 0;
        margin-top: 0;
        // Settings can outgrow a short screen once every optional field and
        // the currency box are in it.
        max-height: calc(100vh - 80px);
        overflow-y: auto;
        right: 0;
        // Slides the last few pixels into place as it fades in.
        transform: translateY(-8px);
        white-space: normal;
    }

    #main .headerItem .lpPopover.lpPopoverShown .lpContent {
        margin-top: 0;
        transform: none;
    }

    // The bridge that lets a mouse travel from target to menu across the gap.
    // There's no travelling on a touch screen, and the padding it adds pushes
    // the avatar off the app bar's centre.
    .headerItem .lpPopover .lpTarget {
        margin-bottom: 0;
        padding-bottom: 0;
    }

    .lpDrawerScrim {
        background: rgba(0, 0, 0, 0.35);
        display: block;
        inset: 0;
        opacity: 0;
        pointer-events: none;
        position: fixed;
        transition: opacity $transitionDurationSlow;
        z-index: $mobileScrim;

        .lpDrawerOpen & {
            opacity: 1;
            pointer-events: all;
        }
    }

    #lpFooter {
        padding: 40px 14px 20px;
    }
}
</style>
