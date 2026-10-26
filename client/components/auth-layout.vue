<template>
    <div class="wgAuth">
        <siteHeader />
        <main class="wgAuthMain">
            <div :id="cardId" class="wgAuthCard wgCard" :class="{ wgAuthWide: wide }">
                <h1 class="wgAuthTitle">
                    {{ title }}
                </h1>
                <p v-if="subtitle" class="wgMuted wgAuthSubtitle">
                    {{ subtitle }}
                </p>
                <p v-if="googleError" class="wgAuthError" role="alert" data-testid="google-error">
                    {{ googleError }}
                </p>
                <template v-if="google">
                    <googleButton class="wgAuthGoogle" @availability="googleOn = $event" />
                    <div v-if="googleOn" class="wgAuthDivider">
                        <span>or with email</span>
                    </div>
                </template>
                <slot />
            </div>
            <p v-if="$slots.after" class="wgAuthAfter">
                <slot name="after" />
            </p>
        </main>
        <siteFooter site />
        <globalAlerts />
    </div>
</template>

<script>
import siteHeader from './site-header.vue';
import siteFooter from './site-footer.vue';
import globalAlerts from './global-alerts.vue';
import googleButton from './google-button.vue';

const GOOGLE_ERRORS = {
    'google-email-exists': 'An account with that email already exists. Sign in with your username and password, then connect Google from Account settings.',
    'google-unverified': 'Google hasn’t verified that email address, so we can’t use it to create an account.',
    'google-cancelled': 'Google sign-in was cancelled.',
    'google-unavailable': 'Google sign-in isn’t set up on this site yet.',
    'google-failed': 'Google sign-in didn’t work. Please try again.',
};

export default {
    name: 'AuthLayout',
    components: { siteHeader, siteFooter, globalAlerts, googleButton },
    props: {
        title: { type: String, required: true },
        subtitle: { type: String, default: '' },
        cardId: { type: String, default: undefined },
        google: { type: Boolean, default: true },
        wide: { type: Boolean, default: false },
    },
    data() {
        return { googleOn: false };
    },
    computed: {
        googleError() {
            return GOOGLE_ERRORS[this.$route.query.error] || '';
        },
    },
    mounted() {
        document.title = `${this.title} — Waymark Gear`;
    },
};
</script>

<style lang="scss">
@import "../css/_globals";

.wgAuth {
    background: var(--lp-bg);
    display: flex;
    flex-direction: column;
    min-height: 100vh;
}

.wgAuthMain {
    align-items: center;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    padding: 48px 16px 64px;
}

.wgAuthCard {
    box-shadow: var(--lp-lift-shadow);
    max-width: 440px;
    padding: 32px;
    width: 100%;

    &.wgAuthWide {
        max-width: 720px;
    }

    @media (max-width: $mobile) {
        padding: 24px 20px;
    }
}

.lp .wgAuthTitle {
    font-size: 28px;
    font-weight: 800;
    margin: 0;
}

.wgAuthSubtitle {
    font-size: 15px;
    margin: 6px 0 0;
}

.wgAuthError {
    background: var(--lp-warning-bg);
    border-radius: 10px;
    color: var(--lp-text);
    font-size: 14px;
    margin: 18px 0 0;
    padding: 12px 14px;
}

.wgAuthGoogle {
    margin-top: 22px;
    width: 100%;
}

.wgAuthDivider {
    align-items: center;
    color: var(--lp-text-secondary);
    display: flex;
    font-size: 13px;
    gap: 12px;
    margin: 20px 0 4px;

    &::before,
    &::after {
        border-top: 1px solid var(--lp-border);
        content: "";
        flex: 1 1 auto;
    }
}

.wgAuthAfter {
    font-size: 15px;
    margin: 20px 0 0;
}

// The inherited sign-in and register forms, restyled for the card.
.wgAuthCard {
    .lpFields {
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin-top: 18px;

        input[type="text"],
        input[type="email"],
        input[type="password"] {
            background: var(--lp-surface);
            border: 1px solid var(--lp-border-strong);
            border-radius: 10px;
            font-size: 16px;
            height: 48px;
            margin: 0;
            padding: 0 13px;
            width: 100%;

            &:focus {
                border-color: var(--lp-link-blue);
                box-shadow: var(--lp-focus-ring);
                outline: none;
            }
        }

        .lpButton,
        input[type="submit"],
        button[type="submit"] {
            background: var(--lp-primary);
            border: 0;
            border-radius: 10px;
            color: var(--lp-primary-ink);
            cursor: pointer;
            font-family: $font-body;
            font-size: 16px;
            font-weight: 600;
            height: 48px;
            margin-top: 6px;
            width: 100%;
        }
    }

    a {
        color: var(--lp-link-blue);
    }

    h3 {
        font-size: 18px;
        margin: 22px 0 6px;
    }

    .columns {
        display: grid;
        gap: 28px;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    }
}
</style>
