<template>
    <header class="wgSiteHeader" :class="{ wgSiteHeaderApp: app }">
        <div class="wgSiteHeaderInner wgPage">
            <router-link to="/welcome" class="wgSiteHeaderLogo" aria-label="Waymark Gear home" data-testid="site-logo">
                <brandLogo />
            </router-link>
            <nav id="wgSiteNav" class="wgSiteNav" :class="{ wgSiteNavOpen: menuOpen }" aria-label="Main" @click="onNavClick">
                <template v-for="entry in menu" :key="entry.id">
                    <div v-if="entry.items" class="wgNavGroup" :class="{ wgNavGroupOpen: dropdown === entry.id }" @mouseleave="dropdown === entry.id && hoverClose()">
                        <button
                            type="button"
                            class="wgSiteNavLink wgNavGroupBtn"
                            :class="{ wgActive: current === entry.id }"
                            :aria-expanded="String(dropdown === entry.id)"
                            :aria-controls="`wgNavDrop-${entry.id}`"
                            :data-testid="`nav-${entry.id}`"
                            @click.stop="toggle(entry.id)"
                        >
                            {{ entry.label }}<svg class="wgNavCaret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
                        </button>
                        <div :id="`wgNavDrop-${entry.id}`" class="wgNavDrop" role="group" :aria-label="entry.label">
                            <span class="wgNavDropLabel">{{ entry.label }}</span>
                            <a
                                v-for="item in entry.items"
                                :key="item.id"
                                :href="item.href"
                                class="wgNavDropItem"
                                :data-testid="`nav-${item.id}`"
                                @click="go($event, item.href)"
                            >
                                <span class="wgNavDropTitle">{{ item.label }}</span>
                                <span v-if="item.note" class="wgNavDropNote">{{ item.note }}</span>
                            </a>
                        </div>
                    </div>
                    <a
                        v-else
                        :href="entry.href"
                        class="wgSiteNavLink"
                        :class="{ wgActive: current === entry.id }"
                        :data-testid="`nav-${entry.id}`"
                        @click="go($event, entry.href)"
                    >{{ entry.label }}</a>
                </template>
                <!-- Phone menu only: what the header's account area carries. -->
                <div class="wgSiteNavPhoneGroup">
                    <a
                        v-for="item in extras"
                        :key="item.id"
                        :href="item.href"
                        class="wgSiteNavLink wgSiteNavPhone"
                        :data-testid="item.testid || `nav-${item.id}`"
                        @click="go($event, item.href)"
                    >{{ item.label }}</a>
                </div>
            </nav>
            <div class="wgSiteHeaderActions">
                <!-- Signed in: notifications and the account menu, on every
                     page (My lists is in the menu). -->
                <accountDropdown v-if="signedIn" class="wgHeaderAccount" />
                <template v-else>
                    <router-link to="/signin" class="wgBtn wgBtnGhost wgHideOnPhone" data-testid="header-signin">
                        Sign in
                    </router-link>
                    <button type="button" class="wgBtn wgBtnPrimary" data-testid="header-start" @click="start">
                        {{ hasLibrary ? 'My lists' : 'Start a list' }}
                    </button>
                </template>
            </div>
            <button
                type="button"
                class="wgSiteMenuBtn"
                :aria-expanded="String(menuOpen)"
                aria-controls="wgSiteNav"
                aria-label="Menu"
                data-testid="site-menu"
                @click.stop="menuOpen = !menuOpen"
            >
                <svg v-if="!menuOpen" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
                <svg v-else width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
            </button>
        </div>
        <!-- The account menu's dialogs, so it works on every page. -->
        <template v-if="!pageOpenAccount">
            <account v-if="signedIn" :shown="showAccount" @hide="showAccount = false" />
            <accountDelete v-if="signedIn" :shown="showDeleteAccount" @hide="showDeleteAccount = false" />
            <help :shown="showHelp" @hide="showHelp = false" />
        </template>
    </header>
</template>

<script>
import brandLogo from './brand-logo.vue';
import accountDropdown from './account-dropdown.vue';
import account from './account.vue';
import accountDelete from './account-delete.vue';
import help from './help.vue';
import { menuFor, activeFor, PHONE_EXTRAS, canSee } from '../nav.js';

// Pages the Vue app draws; anything else (Trails, reviews...) is a full
// page load from the server.
const APP_PATHS = /^\/(welcome|explore|leaderboard|trips|owner|moderation|staff|profile|notifications|supporter|signin|register|gear|developers|report)?(\/|$|[?#])/;

export default {
    name: 'SiteHeader',
    components: { brandLogo, accountDropdown, account, accountDelete, help },
    // The editor already has these dialogs; elsewhere the header brings
    // its own, so the account menu works on every page.
    inject: {
        pageOpenAccount: { from: 'openAccount', default: null },
        pageOpenHelp: { from: 'openHelp', default: null },
    },
    provide() {
        return {
            openAccount: () => (this.pageOpenAccount ? this.pageOpenAccount() : (this.showAccount = true)),
            openHelp: () => (this.pageOpenHelp ? this.pageOpenHelp() : (this.showHelp = true)),
            openDeleteAccount: () => { this.showDeleteAccount = true; },
        };
    },
    props: {
        // Inside the editor: the editor's own header carries the account
        // menu. The header itself lines up with every other page.
        app: { type: Boolean, default: false },
        // Kept for callers; the current section now comes from the route.
        active: { type: String, default: '' },
    },
    data() {
        return { menuOpen: false, dropdown: '', showAccount: false, showHelp: false, showDeleteAccount: false };
    },
    computed: {
        signedIn() {
            return this.$store.state.loggedIn;
        },
        hasLibrary() {
            return Boolean(this.$store.state.library);
        },
        viewer() {
            const a = this.$store.state.account || {};
            return { signedIn: Boolean(this.signedIn), hasLibrary: this.hasLibrary, isAdmin: Boolean(a.isAdmin), isModerator: Boolean(a.isModerator) };
        },
        menu() {
            return menuFor(this.viewer);
        },
        extras() {
            return PHONE_EXTRAS.filter((e) => canSee(e, this.viewer));
        },
        current() {
            return activeFor(this.$route ? this.$route.path : '');
        },
    },
    watch: {
        $route() {
            this.menuOpen = false;
            this.dropdown = '';
        },
    },
    mounted() {
        this.closeOutside = (e) => {
            if (!this.$el.contains(e.target)) {
                this.menuOpen = false;
                this.dropdown = '';
            }
        };
        this.closeOnEscape = (e) => {
            if (e.key === 'Escape') {
                this.menuOpen = false;
                this.dropdown = '';
            }
        };
        document.addEventListener('click', this.closeOutside);
        document.addEventListener('keydown', this.closeOnEscape);
    },
    beforeUnmount() {
        document.removeEventListener('click', this.closeOutside);
        document.removeEventListener('keydown', this.closeOnEscape);
        clearTimeout(this.hoverTimer);
    },
    methods: {
        toggle(id) {
            this.dropdown = this.dropdown === id ? '' : id;
        },
        // A pointer drifting off an open dropdown closes it, after a moment
        // so a slightly wobbly path to an item doesn't.
        hoverClose() {
            if (!window.matchMedia('(hover: hover)').matches) return;
            clearTimeout(this.hoverTimer);
            this.hoverTimer = setTimeout(() => { this.dropdown = ''; }, 250);
        },
        onNavClick(e) {
            if (e.target.closest('a')) {
                this.menuOpen = false;
                this.dropdown = '';
            }
        },
        // In-app pages switch without a reload; server pages load normally.
        go(e, href) {
            if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
            if (!APP_PATHS.test(href) || !this.$router) return;
            e.preventDefault();
            this.$router.push(href);
        },
        start() {
            this.$store.dispatch('startLocalLibrary');
            this.$router.push('/');
        },
    },
};
</script>
