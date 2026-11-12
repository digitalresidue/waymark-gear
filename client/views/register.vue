<template>
    <authLayout card-id="register" :title="$t('auth.registerTitle')" :subtitle="$t('auth.registerSubtitle')">
        <p v-if="isLocalSaving" class="lpWarning">
            <strong>Note:</strong> Your existing data on your computer <strong>will</strong> be saved to your new account.
        </p>

        <registerForm />
        <p v-if="offerTeaser" class="wgRegisterOffer">
            Next you'll see a welcome offer you won't get again: Supporter at half price, for life.
        </p>
        <template #aside>
            <div class="wgRegisterWhy" data-testid="register-why">
                <h2>Things your old gear list never did for you</h2>
                <ul>
                    <li><strong>Compares your pack to your trail.</strong> Tag your list PCT, AT or 40+ others and see where you sit against real hikers' packs.</li>
                    <li><strong>Finds lighter options for you.</strong> Every item shows like-for-like swaps from the catalog, with the grams you'd save.</li>
                    <li><strong>Gets a second opinion from real hikers.</strong> Ask for a shakedown and the community suggests swaps, cuts and missing essentials.</li>
                    <li><strong>Plans your food and water.</strong> Calories, water and pack weight by day, from the first day to the last.</li>
                    <li><strong>Goes with you on the trail.</strong> Pack mode on your phone, offline, and a trip journal for the story after.</li>
                </ul>
                <p class="wgRegisterImport">
                    <strong>Have lists on LighterPack or PackWizard?</strong> Import them right after you sign up. Nothing to re-type.
                </p>
            </div>
        </template>
        <template #after>
            <span class="wgMuted">{{ $t('auth.haveAccount') }}</span> <router-link to="/signin">
                {{ $t('auth.signInTitle') }}
            </router-link>
        </template>
    </authLayout>
</template>

<script>
import authLayout from '../components/auth-layout.vue';
import registerForm from '../components/register-form.vue';

export default {
    name: 'Register',
    components: {
        authLayout,
        registerForm,
    },

    data() {
        return { offerTeaser: false };
    },
    computed: {
        isLocalSaving() {
            return this.$store.state.saveType === 'local';
        },
    },
    async mounted() {
        // Only promise the offer when there is one to show.
        try {
            const res = await fetch('/api/signup-offer/available', { credentials: 'same-origin' });
            this.offerTeaser = res.ok && (await res.json()).available === true;
        } catch {
            this.offerTeaser = false;
        }
    },
};
</script>

<style lang="scss">
@import "../css/_globals";

.wgRegisterOffer {
    background: var(--lp-warning-bg);
    border-radius: 10px;
    font-size: 14px;
    margin: 16px 0 0;
    padding: 12px 14px;
}

.wgRegisterWhy {
    h2 {
        font-family: $font-display;
        font-size: 26px;
        font-stretch: 115%;
        font-weight: 800;
        line-height: 1.15;
        margin: 4px 0 18px;
    }

    ul {
        display: flex;
        flex-direction: column;
        font-size: 15px;
        gap: 14px;
        list-style: none;
        margin: 0;
        padding: 0;
    }

    li {
        color: var(--lp-text-secondary);
        padding-left: 28px;
        position: relative;

        &::before {
            color: var(--lp-success);
            content: "✓";
            font-weight: 800;
            left: 0;
            position: absolute;
        }

        strong {
            color: var(--lp-text);
            display: block;
        }
    }
}

.wgRegisterImport {
    background: var(--lp-surface);
    border: 1px solid var(--lp-border);
    border-radius: 14px;
    font-size: 15px;
    margin: 22px 0 0;
    padding: 16px 18px;
}
</style>
