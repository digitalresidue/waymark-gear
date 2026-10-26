<template>
    <modal id="accountSettings" :shown="shown" @hide="$emit('hide')">
        <h2>Account Settings</h2>

        <div class="lpAccountPreferences">
            <toggle
                data-testid="shared-item-bubble-toggle"
                :model-value="sharedItemBubble"
                @update:model-value="toggleSharedItemBubble"
            >
                Warn when editing an item that's in multiple lists
            </toggle>
            <toggle
                data-testid="worn-qty-hint-toggle"
                :model-value="wornQtyHint"
                @update:model-value="toggleWornQtyHint"
            >
                Note when a worn item has quantity over 1
            </toggle>
        </div>
        <hr>

        <div v-if="googleEnabled" class="wgAccountGoogle" data-testid="account-google">
            <p v-if="googleLinked">
                <strong>Google:</strong> connected. You can sign in with Google.
                <button v-if="hasPassword" type="button" class="wgBtn wgBtnSmall wgBtnGhost" data-testid="google-unlink" @click="unlinkGoogle">
                    Disconnect
                </button>
            </p>
            <template v-else>
                <p><strong>Google:</strong> not connected.</p>
                <googleButton link>
                    Connect Google
                </googleButton>
            </template>
            <p v-if="googleMessage" class="wgMuted">
                {{ googleMessage }}
            </p>
        </div>
        <hr v-if="googleEnabled">

        <form id="accountForm" @submit.prevent="updateAccount()">
            <div class="lpFields">
                <input type="text" name="username" class="username" disabled :value="username">
                <input v-if="hasPassword" v-model="currentPassword" type="password" placeholder="Current Password" name="currentPassword" class="currentPassword">
                <p v-else class="wgMuted wgAccountNote">
                    You sign in with Google, so there's no current password to enter.
                </p>
                <hr>
                <input v-model="newEmail" type="email" placeholder="New Email" name="newEmail" class="newEmail">
                <hr>
                <input v-model="newPassword" type="password" :placeholder="hasPassword ? 'New Password' : 'Set a password (optional)'" name="newPassword" class="newPassword">
                <input v-model="confirmNewPassword" type="password" placeholder="Confirm New Password" name="confirmNewPassword" class="confirmNewPassword">
            </div>

            <errors :errors="errors" />

            <div class="lpButtons">
                <button class="lpButton">
                    Submit
                    <spinner v-if="saving" />
                </button>
                <a class="lpHref" @click="$emit('hide')">Cancel</a>
                <a class="lpHref" @click="showDeleteAccount">Delete account</a>
            </div>
        </form>
    </modal>
</template>

<script>
import errors from './errors.vue';
import modal from './modal.vue';
import spinner from './spinner.vue';
import toggle from './toggle.vue';
import googleButton from './google-button.vue';
import { fetchJson } from '../utils/utils.js';
import { api, siteConfig } from '../utils/format.js';

export default {
    name: 'Account',
    components: {
        errors,
        modal,
        spinner,
        toggle,
        googleButton,
    },
    inject: ['openDeleteAccount'],
    props: {
        shown: {
            type: Boolean,
            required: true,
        },
    },
    emits: ['hide'],
    data() {
        return {
            saving: false,
            errors: [],
            currentPassword: '',
            newEmail: '',
            newPassword: '',
            confirmNewPassword: '',
            googleEnabled: false,
            googleMessage: '',
        };
    },
    computed: {
        username() {
            return this.$store.state.loggedIn;
        },
        account() {
            return this.$store.state.account || {};
        },
        // Unknown (an older session) reads as having a password, the safe side.
        hasPassword() {
            return this.account.hasPassword !== false;
        },
        googleLinked() {
            return Boolean(this.account.googleLinked);
        },
        sharedItemBubble() {
            const library = this.$store.state.library;
            return !!(library && library.preferences.sharedItemBubble);
        },
        wornQtyHint() {
            const library = this.$store.state.library;
            return !!(library && library.preferences.wornQtyHint);
        },
    },
    async mounted() {
        this.googleEnabled = Boolean((await siteConfig()).googleEnabled);
    },
    methods: {
        async unlinkGoogle() {
            try {
                await api('/auth/google/unlink', { method: 'POST', body: '{}' });
                this.$store.commit('setAccount', { ...this.account, googleLinked: false });
                this.googleMessage = 'Google disconnected.';
            } catch (err) {
                this.googleMessage = err.message;
            }
        },
        toggleSharedItemBubble() {
            this.$store.commit('togglePreference', 'sharedItemBubble');
        },
        toggleWornQtyHint() {
            this.$store.commit('togglePreference', 'wornQtyHint');
        },
        updateAccount() {
            this.errors = [];

            if (this.hasPassword && !this.currentPassword) {
                this.errors.push({ field: 'currentPassword', message: 'Please enter your current password.' });
            }

            if (this.newPassword && this.newPassword != this.confirmNewPassword) {
                this.errors.push({ field: 'newPassword', message: "Your passwords don't match." });
            }

            if (this.newPassword && (this.newPassword.length < 5 || this.newPassword.length > 60)) {
                this.errors.push({ field: 'newPassword', message: 'Please enter a password between 5 and 60 characters.' });
            }

            if (this.errors.length) return;

            const data = { username: this.username, currentPassword: this.currentPassword };
            let dirty = false;

            if (this.newPassword) { dirty = true; data.newPassword = this.newPassword; }
            if (this.newEmail) { dirty = true; data.newEmail = this.newEmail; }

            if (!dirty) return;

            this.currentPassword = '';
            this.saving = true;

            fetchJson('/account', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify(data),
            })
                .then(() => {
                    this.saving = false;
                    if (data.newPassword) this.$store.commit('setAccount', { ...this.account, hasPassword: true });
                    if (data.newEmail) this.$store.commit('setAccount', { ...this.$store.state.account, email: data.newEmail });
                    this.$emit('hide');
                })
                .catch((err) => {
                    this.errors = err;
                    this.saving = false;
                });
        },
        showDeleteAccount() {
            this.$emit('hide');
            this.openDeleteAccount();
        },
    },
};
</script>

<style lang="scss">

.lpAccountPreferences {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

</style>
