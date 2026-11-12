<template>
    <form class="lpRegister lpFields" data-testid="register-form" @submit.prevent="submit">
        <div class="lpFields">
            <input v-model="email" v-focus-on-create="autofocus" type="email" :placeholder="$t('auth.email')" :aria-label="$t('auth.email')" autocomplete="email" name="email">
            <input v-model="password" type="password" :placeholder="$t('auth.password')" :aria-label="$t('auth.password')" autocomplete="new-password" name="password">
            <template v-if="pickName">
                <input v-model="username" type="text" :placeholder="$t('auth.username')" :aria-label="$t('auth.username')" autocomplete="username" name="username">
                <p class="wgMuted wgRegisterHint">
                    {{ $t('auth.usernameHint') }}
                </p>
            </template>
            <button v-else type="button" class="lpHref wgRegisterPickName" data-testid="register-pick-username" @click="pickName = true">
                {{ $t('auth.pickUsername') }}
            </button>
        </div>
        <errors :errors="errors" />
        <div class="lpButtons">
            <button class="lpButton" data-testid="register-submit">
                {{ $t('auth.createFreeAccount') }}
                <spinner v-if="saving" />
            </button>
            <a class="lpHref lpGetStarted" @click="loadLocal">{{ $t('auth.tryWithout') }}</a>
        </div>
    </form>
</template>

<script>
import errors from './errors.vue';
import spinner from './spinner.vue';

import { fetchJson } from '../utils/utils.js';
import { trackEvent } from '../utils/analytics.js';

export default {
    name: 'RegisterForm',
    components: {
        errors,
        spinner,
    },
    props: {
        // Off on the mobile landing card: both tabs are mounted at once, and
        // focusing a field there would raise the keyboard over the hero.
        autofocus: { type: Boolean, default: true },
    },
    data() {
        // The homepage's email box sends it here as ?email=.
        const fromLink = this.$route && typeof this.$route.query.email === 'string' ? this.$route.query.email.slice(0, 200) : '';
        return {
            username: '',
            email: fromLink,
            password: '',
            // The username is optional: left out, one is made from the email.
            pickName: false,
            saving: false,
            errors: [],
        };
    },
    methods: {
        loadLocal() {
            this.$store.dispatch('startLocalLibrary');
            this.$router.push('/');
        },
        submit() {
            this.errors = [];

            if (this.username && (this.username.length < 3 || this.username.length > 32)) {
                this.errors.push({ field: 'username', message: 'Please enter a username between 3 and 32 characters.' });
            }

            if (!this.email) {
                this.errors.push({ field: 'email', message: 'Please enter an email.' });
            }

            if (!this.password) {
                this.errors.push({ field: 'password', message: 'Please enter a password.' });
            }

            if (this.password && (this.password.length < 5 || this.password.length > 60)) {
                this.errors.push({ field: 'password', message: 'Please enter a password between 5 and 60 characters.' });
            }

            if (this.errors.length) {
                return;
            }

            const registerData = { username: this.username.trim(), email: this.email, password: this.password };

            if (localStorage.library) {
                registerData.library = localStorage.library;
            }

            this.saving = true;
            return fetchJson('/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'same-origin',
                body: JSON.stringify(registerData),
            })
                .then((response) => {
                    this.$store.commit('setSyncToken', response.sync_token);
                    this.$store.commit('loadLibraryData', response.library);
                    this.$store.commit('setSaveType', 'remote');
                    this.$store.commit('setLoggedIn', response.username);
                    this.$store.commit('setAccount', response.account || null);

                    if (registerData.library) {
                        localStorage.registeredLibrary = localStorage.library;
                        delete localStorage.library;
                    }
                    this.saving = false;
                    trackEvent('sign_up', { method: 'email' });
                    // The welcome steps: the one-time offer (if there is one),
                    // then their first pack.
                    this.$router.push('/start');
                })
                .catch((err) => {
                    this.saving = false;
                    this.errors = err;
                });
        },
    },
};
</script>

<style lang="scss">
.wgRegisterPickName {
    align-self: flex-start;
    background: none;
    border: 0;
    cursor: pointer;
    font-size: 14px;
    padding: 4px 0;
}

.wgRegisterHint {
    font-size: 13px;
    margin: -4px 0 0;
}
</style>
