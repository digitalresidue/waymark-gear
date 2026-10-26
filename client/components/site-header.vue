<template>
    <header class="wgSiteHeader" :class="{ wgSiteHeaderApp: app }">
        <div class="wgSiteHeaderInner" :class="{ wgPage: !app }">
            <router-link :to="homeLink" class="wgSiteHeaderLogo" aria-label="Waymark Gear home">
                <brandLogo />
            </router-link>
            <nav class="wgSiteNav" aria-label="Main">
                <router-link v-if="hasLibrary" to="/" class="wgSiteNavLink" :class="{ wgActive: active === 'lists' }" data-testid="nav-lists">
                    My lists
                </router-link>
                <router-link to="/explore" class="wgSiteNavLink" :class="{ wgActive: active === 'explore' }" data-testid="nav-explore">
                    Explore kits
                </router-link>
                <router-link v-if="!hasLibrary" to="/welcome#common" class="wgSiteNavLink">
                    Popular gear
                </router-link>
                <router-link v-if="isAdmin" to="/owner/catalog" class="wgSiteNavLink" :class="{ wgActive: active === 'owner' }" data-testid="nav-owner">
                    Owner
                </router-link>
            </nav>
            <div v-if="!app" class="wgSiteHeaderActions">
                <template v-if="signedIn">
                    <span class="wgMuted wgSiteHeaderUser">{{ signedIn }}</span>
                    <router-link to="/" class="wgBtn wgBtnPrimary">
                        Open my lists
                    </router-link>
                </template>
                <template v-else>
                    <router-link to="/signin" class="wgBtn wgBtnGhost" data-testid="header-signin">
                        Sign in
                    </router-link>
                    <button type="button" class="wgBtn wgBtnPrimary" data-testid="header-start" @click="start">
                        {{ hasLibrary ? 'Open my lists' : 'Start a list' }}
                    </button>
                </template>
            </div>
        </div>
    </header>
</template>

<script>
import brandLogo from './brand-logo.vue';

export default {
    name: 'SiteHeader',
    components: { brandLogo },
    props: {
        // Inside the editor: full width, and the editor's own header
        // carries the account menu.
        app: { type: Boolean, default: false },
        active: { type: String, default: '' },
    },
    computed: {
        signedIn() {
            return this.$store.state.loggedIn;
        },
        hasLibrary() {
            return Boolean(this.$store.state.library);
        },
        isAdmin() {
            return Boolean(this.$store.state.account && this.$store.state.account.isAdmin);
        },
        homeLink() {
            return this.hasLibrary ? '/' : '/welcome';
        },
    },
    methods: {
        start() {
            this.$store.dispatch('startLocalLibrary');
            this.$router.push('/');
        },
    },
};
</script>

<style lang="scss">
@import "../css/_globals";

.wgSiteHeader {
    background: var(--lp-surface);
    border-bottom: 1px solid var(--lp-border);
    position: relative;
    z-index: $aboveSidebar;
}

.wgSiteHeaderInner {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 8px 28px;
    min-height: 64px;
    padding-bottom: 10px;
    padding-top: 10px;

    .wgSiteHeaderApp & {
        padding-left: 20px;
        padding-right: 20px;
    }
}

.wgSiteHeaderLogo {
    display: flex;
}

.wgSiteNav {
    display: flex;
    flex: 1 1 auto;
    flex-wrap: wrap;
    gap: 4px;
}

.wgSiteNavLink {
    border-radius: 9px;
    color: var(--lp-text);
    font-size: 15px;
    font-weight: 500;
    padding: 9px 14px;
    text-decoration: none;

    &:hover {
        background: var(--lp-row-hover);
    }

    &.wgActive {
        background: var(--lp-active-bg);
        color: var(--lp-accent-green-deep);
        font-weight: 600;
    }
}

.wgSiteHeaderActions {
    align-items: center;
    display: flex;
    gap: 8px;
}

.wgSiteHeaderUser {
    font-size: 14px;
    margin-right: 4px;
}

@media (max-width: $mobile) {
    // On a phone the editor has its own app bar and drawer.
    .wgSiteHeaderApp {
        display: none;
    }

    .wgSiteNav {
        order: 3;
        width: 100%;
    }

    .wgSiteHeaderUser {
        display: none;
    }
}
</style>
