<template>
    <div class="wgHome">
        <siteHeader />
        <main id="wgMain" tabindex="-1" class="wgPage wgSupporterPage">
            <h1 class="wgH2">
                Support Waymark Gear
            </h1>
            <p class="wgLede">
                Waymark is free and open source. It's paid for by affiliate links on catalog gear (a small commission when you buy through a Buy button) and by Supporters.
            </p>

            <div v-if="welcome && plan && plan.supporter" class="wgCard wgSupporterThanks" role="status" data-testid="supporter-welcome">
                <strong>Thank you!</strong> You're a Supporter. Buy links now go straight to the shop.
            </div>

            <section class="wgCard wgSupporterCard">
                <h2 class="wgProfileEditH">
                    Supporter
                </h2>
                <ul class="wgSupporterPerks">
                    <li>Plain shop links everywhere: no affiliate tracking on anything you click.</li>
                    <li>A Supporter badge on your profile.</li>
                    <li>You keep the site running and pay for what's built next.</li>
                </ul>

                <p v-if="!signedIn">
                    <router-link to="/signin">
                        Sign in
                    </router-link> or <router-link to="/register">
                        make an account
                    </router-link> to become a Supporter.
                </p>
                <template v-else-if="plan">
                    <p v-if="plan.supporter" data-testid="supporter-status">
                        <span class="wgSupporterBadge">Supporter</span>
                        {{ plan.until ? `through ${day(plan.until)}` : 'for good' }}{{ plan.source === 'granted' ? ' (a gift from the Waymark team)' : '' }}.
                    </p>
                    <div v-if="plan.available && !(plan.supporter && plan.source === 'stripe')" class="wgSupporterBuy">
                        <button type="button" class="wgBtn wgBtnPrimary" :disabled="busy" data-testid="supporter-monthly" @click="checkout('month')">
                            {{ plan.monthly }} a month
                        </button>
                        <button v-if="plan.yearly" type="button" class="wgBtn wgBtnGhost" :disabled="busy" data-testid="supporter-yearly" @click="checkout('year')">
                            {{ plan.yearly }} a year
                        </button>
                    </div>
                    <p v-if="plan.canManage">
                        <button type="button" class="wgBtn wgBtnGhost" :disabled="busy" data-testid="supporter-manage" @click="portal">
                            Manage or cancel
                        </button>
                    </p>
                    <p v-if="!plan.available && !plan.supporter" class="wgMuted" data-testid="supporter-soon">
                        Subscriptions open soon.
                    </p>
                    <p class="wgMuted wgProfileHint">
                        Payments are handled by Stripe; Waymark never sees your card.
                    </p>
                </template>
                <p v-if="error" class="wgImportError" role="alert">
                    {{ error }}
                </p>
            </section>

            <section class="wgCard wgSupporterCard">
                <h2 class="wgProfileEditH">
                    How affiliate links work here
                </h2>
                <p>Buy buttons on gear pages, comparisons and shared lists go through Waymark first. If you're not a Supporter, we add the shop's affiliate code. The price you pay is the same.</p>
                <p>Commissions never decide what we suggest: lighter options and popular gear are ranked by weight and by how many hikers use them, and gear without an affiliate deal is listed the same way.</p>
            </section>
        </main>
    </div>
</template>

<script>
import siteHeader from '../components/site-header.vue';
import { api } from '../utils/format.js';

export default {
    name: 'Supporter',
    components: { siteHeader },
    data() {
        return { plan: null, busy: false, error: '' };
    },
    computed: {
        signedIn() {
            return Boolean(this.$store.state.loggedIn);
        },
        welcome() {
            return this.$route.query.welcome === '1';
        },
    },
    async mounted() {
        document.title = 'Support Waymark Gear';
        if (!this.signedIn) return;
        this.plan = await api('/api/plan').catch(() => null);
        // Back from Stripe: its confirmation can land a moment after we do.
        for (let i = 0; this.welcome && this.plan && !this.plan.supporter && i < 10; i++) {
            await new Promise((r) => { setTimeout(r, 1500); });
            this.plan = await api('/api/plan').catch(() => this.plan);
        }
    },
    methods: {
        day(when) {
            return new Date(when).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        },
        async go(path, body) {
            this.busy = true;
            this.error = '';
            try {
                const { url } = await api(path, { method: 'POST', body: JSON.stringify(body || {}) });
                window.location.href = url;
            } catch (err) {
                this.error = err.message;
                this.busy = false;
            }
        },
        checkout(interval) {
            return this.go('/api/plan/checkout', { interval });
        },
        portal() {
            return this.go('/api/plan/portal');
        },
    },
};
</script>

<style lang="scss">
.wgSupporterPage {
    padding-bottom: 48px;
    padding-top: 28px;
    max-width: 760px;
}

.wgSupporterCard {
    margin: 0 0 16px;
    padding: 16px 18px;
}

.wgSupporterPerks {
    margin: 0 0 12px;
    padding-left: 18px;
}

.wgSupporterBuy {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin: 8px 0;
}

.wgSupporterThanks {
    background: #E6F2EA;
    margin: 0 0 16px;
    padding: 12px 16px;
}

.wgSupporterBadge {
    background: linear-gradient(135deg, #B04E1B, #E39B3B);
    border-radius: 999px;
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    padding: 2px 9px;
}
</style>
