<template>
    <header class="wgSiteHeader" :class="{ wgSiteHeaderApp: app }">
        <div class="wgSiteHeaderInner" :class="{ wgPage: !app }">
            <router-link :to="homeLink" class="wgSiteHeaderLogo" aria-label="Waymark Gear home">
                <brandLogo />
            </router-link>
            <nav id="wgSiteNav" class="wgSiteNav" :class="{ wgSiteNavOpen: menuOpen }" aria-label="Main" @click="onNavClick">
                <router-link v-if="hasLibrary" to="/" class="wgSiteNavLink" :class="{ wgActive: active === 'lists' }" data-testid="nav-lists">
                    My lists
                </router-link>
                <router-link to="/explore" class="wgSiteNavLink" :class="{ wgActive: active === 'explore' }" data-testid="nav-explore">
                    Explore kits
                </router-link>
                <a href="/trails" class="wgSiteNavLink" data-testid="nav-trails">Trails</a>
                <router-link to="/leaderboard" class="wgSiteNavLink" :class="{ wgActive: active === 'leaderboard' }" data-testid="nav-leaderboard">
                    Leaderboards
                </router-link>
                <router-link v-if="signedIn" to="/trips" class="wgSiteNavLink" :class="{ wgActive: active === 'trips' }" data-testid="nav-trips">
                    Trips
                </router-link>
                <a href="/reviews" class="wgSiteNavLink" data-testid="nav-reviews">Reviews</a>
                <router-link v-if="!hasLibrary" to="/welcome#common" class="wgSiteNavLink">
                    Popular gear
                </router-link>
                <router-link v-if="isAdmin" to="/owner/catalog" class="wgSiteNavLink" :class="{ wgActive: active === 'owner' }" data-testid="nav-owner">
                    Owner
                </router-link>
                <router-link v-if="isStaff" to="/staff/tickets" class="wgSiteNavLink" data-testid="nav-tickets">
                    Tickets
                </router-link>
                <!-- Phone menu only: the rest of what the header carries. -->
                <template v-if="signedIn">
                    <router-link to="/profile" class="wgSiteNavLink wgSiteNavPhone">
                        Your profile
                    </router-link>
                    <router-link to="/notifications" class="wgSiteNavLink wgSiteNavPhone">
                        Notifications
                    </router-link>
                    <router-link to="/supporter" class="wgSiteNavLink wgSiteNavPhone">
                        Support Waymark
                    </router-link>
                </template>
                <router-link v-else to="/signin" class="wgSiteNavLink wgSiteNavPhone" data-testid="menu-signin">
                    Sign in
                </router-link>
            </nav>
            <div v-if="!app" class="wgSiteHeaderActions">
                <template v-if="signedIn">
                    <notificationBell />
                    <span class="wgMuted wgSiteHeaderUser">{{ signedIn }}</span>
                    <router-link to="/" class="wgBtn wgBtnPrimary">
                        <span class="wgLong">Open my lists</span><span class="wgShort">My lists</span>
                    </router-link>
                </template>
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
    </header>
</template>

<script>
import brandLogo from './brand-logo.vue';
import notificationBell from './notification-bell.vue';

export default {
    name: 'SiteHeader',
    components: { brandLogo, notificationBell },
    props: {
        // Inside the editor: full width, and the editor's own header
        // carries the account menu.
        app: { type: Boolean, default: false },
        active: { type: String, default: '' },
    },
    data() {
        return { menuOpen: false };
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
        isStaff() {
            const a = this.$store.state.account;
            return Boolean(a && (a.isAdmin || a.isModerator));
        },
        homeLink() {
            return this.hasLibrary ? '/' : '/welcome';
        },
    },
    watch: {
        $route() {
            this.menuOpen = false;
        },
    },
    mounted() {
        this.closeOutside = (e) => {
            if (this.menuOpen && !this.$el.contains(e.target)) this.menuOpen = false;
        };
        this.closeOnEscape = (e) => {
            if (e.key === 'Escape') this.menuOpen = false;
        };
        document.addEventListener('click', this.closeOutside);
        document.addEventListener('keydown', this.closeOnEscape);
    },
    beforeUnmount() {
        document.removeEventListener('click', this.closeOutside);
        document.removeEventListener('keydown', this.closeOnEscape);
    },
    methods: {
        onNavClick(e) {
            if (e.target.closest('a')) this.menuOpen = false;
        },
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
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

// Owners and staff carry two more links; tighten up before anything wraps.
@media (max-width: 1400px) {
    .wgSiteNavLink {
        padding: 9px 10px;
    }

    .wgSiteHeaderUser {
        display: none;
    }
}

.wgSiteMenuBtn,
.wgSiteNavPhone,
.wgShort {
    display: none;
}

// On a phone: logo, bell, one button and a menu. The links open as a sheet
// under the header instead of wrapping into rows above the page.
@media (max-width: $mobile) {
    // The editor has its own app bar and drawer.
    .wgSiteHeaderApp {
        display: none;
    }

    .wgSiteHeader {
        position: sticky;
        top: 0;
    }

    .wgSiteHeaderInner {
        flex-wrap: nowrap;
        gap: 8px;
        min-height: 56px;
        padding-bottom: 6px;
        padding-top: 6px;
    }

    .wgSiteHeaderLogo {
        flex: 0 1 auto;
        margin-right: auto;
        min-width: 0;
    }

    // Shrink by width only; the height follows the 843:127 ratio so the
    // logo never squashes. Needs to outrank `.lp .wgLogo`.
    .lp .wgSiteHeaderLogo .wgLogo {
        aspect-ratio: 843 / 127;
        height: auto;
        max-width: 100%;
        object-fit: contain;
        width: 150px;
    }

    .wgSiteHeaderActions {
        flex: none;
        gap: 6px;

        .wgBtn {
            min-height: 40px;
            padding: 8px 14px;
        }
    }

    // Specific enough to beat the shared .wgBtn display rule.
    .wgSiteHeader .wgSiteHeaderActions .wgHideOnPhone,
    .wgSiteHeader .wgLong,
    .wgSiteHeader .wgSiteHeaderUser {
        display: none;
    }

    .wgSiteHeader .wgShort {
        display: inline;
    }

    .wgSiteMenuBtn {
        align-items: center;
        background: none;
        border: 0;
        border-radius: 10px;
        color: var(--lp-text);
        cursor: pointer;
        display: inline-flex;
        flex: none;
        height: 44px;
        justify-content: center;
        width: 44px;

        &:hover,
        &[aria-expanded="true"] {
            background: var(--lp-row-hover);
        }
    }

    .wgSiteNav {
        background: var(--lp-surface);
        border-bottom: 1px solid var(--lp-border);
        box-shadow: 0 12px 24px rgba(0, 0, 0, 0.12);
        display: none;
        flex-direction: column;
        gap: 0;
        left: 0;
        max-height: calc(100vh - 56px);
        overflow-y: auto;
        padding: 6px 12px 12px;
        position: absolute;
        right: 0;
        top: 100%;
    }

    .wgSiteNavOpen {
        display: flex;
    }

    .wgSiteNavLink {
        border-radius: 10px;
        font-size: 17px;
        padding: 13px 12px;
    }

    .wgSiteNavPhone {
        border-top: 1px solid var(--lp-border);
        border-radius: 0;
        display: block;

        & + & {
            border-top: 0;
        }
    }
}
</style>
