<template>
    <div class="lpAccount headerItem">
        <notificationBell v-if="isSignedIn" />
        <PopoverHover v-if="isSignedIn" id="accountPopover" data-testid="account-menu">
            <template #target>
                <span class="lpAvatar" :title="username">{{ initial }}</span>
            </template>
            <template #content="{ hide }">
                <div class="lpAccountMenu">
                    <div class="lpAccountMenuUser">
                        Signed in as <span class="username">{{ username }}</span>
                    </div>
                    <hr>
                    <router-link to="/profile" class="lpHref" data-testid="menu-profile" @click="hide()">
                        Your profile
                    </router-link><br>
                    <router-link to="/trips" class="lpHref" data-testid="menu-trips" @click="hide()">
                        Trip journals
                    </router-link><br>
                    <router-link to="/developers" class="lpHref" data-testid="menu-developers" @click="hide()">
                        AI assistants and API
                    </router-link><br>
                    <router-link to="/supporter" class="lpHref" data-testid="menu-supporter" @click="hide()">
                        {{ $store.state.account && $store.state.account.supporter ? 'Supporter ✓' : 'Become a Supporter' }}
                    </router-link><br>
                    <a class="lpHref accountSettings" @click="hide(); showAccount()">Account Settings</a><br>
                    <a class="lpHref" @click="hide(); showHelp()">Help</a>
                    <hr>
                    <!-- No hide(): the switch is a setting, not an errand, so
                         the menu stays open to show it flip. -->
                    <toggle
                        class="lpAccountMenuTheme"
                        :model-value="isDark"
                        data-testid="dark-mode-toggle"
                        @update:model-value="toggleDarkMode"
                    >
                        Dark mode
                    </toggle>
                    <button v-if="themePref !== 'system'" type="button" class="lpHref wgMatchDevice" data-testid="theme-system" @click="matchDevice">
                        Match my device
                    </button>
                    <hr>
                    <a class="lpHref signout" @click="hide(); signout()">Sign Out</a>
                </div>
            </template>
        </PopoverHover>
        <div v-else class="signInRegisterButtons">
            <router-link to="/signin" class="lpHref">
                Sign In
            </router-link>
            <span class="lpAccountSep">·</span>
            <router-link to="/register" class="lpHref lpButton lpSmall">
                Register
            </router-link>
        </div>
    </div>
</template>

<script>
import PopoverHover from './popover-hover.vue';
import notificationBell from './notification-bell.vue';
import toggle from './toggle.vue';
import { toggleTheme, themePreference, setThemePreference } from '../utils/theme.js';
import { api } from '../utils/format.js';

export default {
    name: 'AccountDropdown',
    components: {
        notificationBell,
        PopoverHover,
        toggle,
    },
    inject: ['openAccount', 'openHelp'],
    data() {
        return {
            isDark: document.documentElement.getAttribute('data-theme') === 'dark',
            themePref: themePreference(),
        };
    },
    computed: {
        library() {
            return this.$store.state.library;
        },
        isSignedIn() {
            return this.$store.state.loggedIn;
        },
        username() {
            return this.$store.state.loggedIn;
        },
        initial() {
            return (this.username || '?').trim().charAt(0);
        },
    },
    methods: {
        showAccount() {
            this.openAccount();
        },
        showHelp() {
            this.openHelp();
        },
        toggleDarkMode() {
            this.isDark = toggleTheme() === 'dark';
            this.saveTheme(this.isDark ? 'dark' : 'light');
        },
        matchDevice() {
            setThemePreference('system');
            this.isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            this.saveTheme('system');
        },
        // Signed in: the choice follows you to every device.
        saveTheme(pref) {
            this.themePref = pref;
            this.$store.commit('setThemePref', pref);
            if (this.isSignedIn && this.$store.state.saveType === 'remote') {
                api('/api/preferences', { method: 'PUT', body: JSON.stringify({ theme: pref }) }).catch(() => {});
            }
        },
        async signout() {
            await this.$store.dispatch('signout');
            this.$router.push('/signin');
        },
    },
};
</script>

<style lang="scss">
@import "../css/_globals";

// Account menu at the far right of the content header. The target is an
// initial-letter avatar; everything account-scoped (settings, help, theme,
// sign out) hangs off its dropdown.
.lpAccount {
    align-items: center;
    display: flex;
    gap: 4px;
}

.lpAvatar {
    align-items: center;
    background: var(--lp-primary);
    border-radius: 50%;
    color: var(--lp-primary-ink);
    cursor: pointer;
    display: flex;
    flex: 0 0 auto;
    font-size: 14px;
    font-weight: 700;
    height: 36px;
    justify-content: center;
    line-height: 1;
    margin-top: -4px;
    text-transform: uppercase;
    user-select: none;
    width: 36px;
}

#accountPopover {
    .lpTarget {
        display: flex;
        padding: 4px 0;
    }

    // Header-anchored menu: hangs from the right edge instead of centering on
    // the target, so it never overhangs the content column. The top-right
    // corner sits under the avatar, so that's the one squared off.
    .lpContent {
        border-top-right-radius: 0;
        left: auto;
        right: 0;
        transform: none;
    }
}

.lpAccountMenu {
    font-size: 13px;
    min-width: 160px;

    a.lpHref {
        display: inline-block;
        line-height: 22px;
    }

    hr {
        border: none;
        border-top: 1px solid var(--lp-border-strong);
        margin: 7px 0;
    }
}

.lpAccountMenuUser {
    color: var(--lp-text-secondary);
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    .username {
        color: var(--lp-text);
        font-weight: 600;
    }
}

.lpAccountMenuTheme {
    justify-content: space-between;
}

// The -7px nudge above aligns the avatar with the light header's baseline on
// the desktop. The phone app bar centres its row instead, so the same nudge
// just lifts the avatar off-centre against the list title.
@media only screen and (width <= $mobile) {
    .lpAvatar {
        height: 26px;
        margin-top: 0;
        width: 26px;
    }

    #accountPopover .lpTarget {
        display: flex;
        padding: 0;
    }
}

.signInRegisterButtons {
    align-items: center;
    display: flex;
    font-size: 13px;
    gap: 6px;

    .lpAccountSep {
        color: var(--lp-text-secondary);
    }
}

.wgMatchDevice {
    background: none;
    border: 0;
    cursor: pointer;
    font: inherit;
    font-size: 12.5px;
    padding: 2px 0 0;
}
</style>
