<template>
    <div class="wgHome wgStart">
        <siteHeader />
        <main id="wgMain" tabindex="-1" class="wgPage wgStartMain">
            <ol class="wgStartSteps" aria-label="Getting started">
                <li class="wgStartStepDone">
                    1 Account done
                </li>
                <li v-if="hadOffer" :class="step === 'offer' ? 'wgStartStepOn' : 'wgStartStepDone'">
                    2 Welcome offer{{ step === 'offer' ? '' : ' done' }}
                </li>
                <li :class="step === 'choose' ? 'wgStartStepOn' : ''">
                    {{ hadOffer ? 3 : 2 }} Your first pack
                </li>
            </ol>

            <!-- The one-time Supporter offer -->
            <section v-if="step === 'offer'" class="wgStartOffer" aria-labelledby="wgStartOfferTitle" data-testid="signup-offer">
                <p class="wgStartHello">
                    You're in, @{{ username }}. Your account is ready.
                </p>
                <h1 id="wgStartOfferTitle" class="wgStartH1">
                    One time only: Supporter at half price, for life.
                </h1>
                <p class="wgStartLede">
                    Everything on Waymark Gear is already yours, free. Supporters keep it running without ads, and new members get this price once. Skip it and it's gone.
                </p>

                <div v-if="offer.yearly" class="wgStartToggle" role="group" aria-label="Billing period">
                    <button type="button" :aria-pressed="String(interval === 'year')" data-testid="offer-yearly" @click="interval = 'year'">
                        Yearly
                    </button>
                    <button type="button" :aria-pressed="String(interval === 'month')" data-testid="offer-monthly" @click="interval = 'month'">
                        Monthly
                    </button>
                </div>

                <div class="wgStartPriceCard">
                    <div class="wgStartPriceHead">
                        <div>
                            <p class="wgStartPlan">
                                Waymark Gear Supporter
                            </p>
                            <p class="wgMuted">
                                {{ interval === 'year' ? 'Billed yearly.' : 'Billed monthly.' }}
                            </p>
                        </div>
                        <span class="wgStartBadge">50% off for life</span>
                    </div>
                    <p class="wgStartPrice">
                        <span class="wgStartPriceNum" data-testid="offer-price">{{ interval === 'year' ? offer.yearly : offer.monthly }}</span>
                        <span class="wgMuted">{{ interval === 'year' ? 'per year' : 'per month' }}</span>
                        <s class="wgMuted">{{ interval === 'year' ? offer.yearlyFull : offer.monthlyFull }}</s>
                    </p>
                    <ul class="wgStartPerks">
                        <li>Half price on every renewal, for as long as you stay subscribed</li>
                        <li>No affiliate links anywhere on the site</li>
                        <li>A Supporter badge on your profile</li>
                        <li>Keeps a free, open-source hiking app free for everyone</li>
                    </ul>
                    <button type="button" class="wgStartClaim" :disabled="busy" data-testid="offer-claim" @click="claim">
                        Claim {{ interval === 'year' ? `${offer.yearly} a year` : `${offer.monthly} a month` }} for life
                    </button>
                    <p class="wgMuted wgStartFine">
                        Secure checkout with Stripe. Cancel any time from your profile. If you cancel, the half price ends with it.
                    </p>
                    <p v-if="error" class="wgImportError" role="alert">
                        {{ error }}
                    </p>
                </div>

                <button type="button" class="wgStartSkip" :disabled="busy" data-testid="offer-skip" @click="skip">
                    No thanks, take me to my first pack
                </button>
                <p class="wgMuted wgStartFine">
                    You won't see this offer again. Every feature stays free either way.
                </p>
            </section>

            <!-- Their first pack -->
            <section v-else-if="step === 'choose'" aria-labelledby="wgStartChooseTitle" data-testid="first-pack">
                <p v-if="supporterWelcome" class="wgCard wgSupporterThanks" role="status" data-testid="start-supporter-thanks">
                    <strong>Thank you!</strong> You're a Supporter, at half price for as long as you stay subscribed.
                </p>
                <h1 id="wgStartChooseTitle" class="wgStartH1">
                    How do you want to start your pack?
                </h1>
                <p class="wgStartLede">
                    Pick one. You can add more lists any time, and nothing here is permanent.
                </p>
                <div class="wgStartChoices">
                    <router-link to="/?import=1" class="wgStartChoice wgStartChoiceMain" data-testid="start-import" @click="chose('import')">
                        <span class="wgStartChoiceIcon" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M4 21h16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg></span>
                        <span class="wgStartChoiceTitle">Import from LighterPack or PackWizard</span>
                        <span class="wgStartChoiceText">Paste a share link or upload a CSV. Categories, weights, worn and consumables come with it.</span>
                        <span class="wgStartChoiceGo">Import my list →</span>
                    </router-link>
                    <a href="/trails" class="wgStartChoice" data-testid="start-trail" @click="chose('trail')">
                        <span class="wgStartChoiceIcon" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24"><path d="M3 20l6-12 4 7 3-5 5 10z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" /></svg></span>
                        <span class="wgStartChoiceTitle">Start from your trail</span>
                        <span class="wgStartChoiceText">Pick the PCT, AT or another trail, see what hikers there carry, and copy a list to make it yours.</span>
                        <span class="wgStartChoiceGo">Choose a trail →</span>
                    </a>
                    <router-link to="/kits" class="wgStartChoice" data-testid="start-kits" @click="chose('kits')">
                        <span class="wgStartChoiceIcon" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg></span>
                        <span class="wgStartChoiceTitle">Copy a kit from Explore</span>
                        <span class="wgStartChoiceText">Browse ultralight, SUL and traditional kits other hikers published and make one yours.</span>
                        <span class="wgStartChoiceGo">Browse kits →</span>
                    </router-link>
                    <router-link to="/" class="wgStartChoice" data-testid="start-blank" @click="chose('blank')">
                        <span class="wgStartChoiceIcon" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg></span>
                        <span class="wgStartChoiceTitle">Start blank</span>
                        <span class="wgStartChoiceText">An empty list with the usual categories. Add gear from the catalog as you go.</span>
                        <span class="wgStartChoiceGo">Start a list →</span>
                    </router-link>
                </div>
                <div class="wgCard wgStartAfter">
                    <p><strong>Once your list is in, here's what you'll see.</strong> Your weight class, lighter options on each item, how your pack compares on your trail, and a gear check for the essentials.</p>
                </div>
            </section>

            <p v-else class="wgMuted" role="status">
                Loading…
            </p>
        </main>
    </div>
</template>

<script>
import siteHeader from '../components/site-header.vue';
import { api } from '../utils/format.js';
import { trackEvent } from '../utils/analytics.js';

// The welcome steps after signing up: the one-time Supporter offer
// (server/signup-offer.js), when there is one, then how to start their
// first pack. Anyone can come back to /start; the offer only shows while
// it's open.
export default {
    name: 'Start',
    components: { siteHeader },
    data() {
        return { step: '', offer: null, hadOffer: false, interval: 'year', busy: false, error: '' };
    },
    computed: {
        username() {
            return this.$store.state.loggedIn || '';
        },
        supporterWelcome() {
            return this.$route.query.supporter === '1';
        },
    },
    async mounted() {
        document.title = 'Welcome to Waymark Gear';
        if (!this.$store.state.loggedIn) {
            this.$router.replace('/register');
            return;
        }
        if (this.$route.query.welcome === 'google') trackEvent('sign_up', { method: 'google' });
        const offer = this.supporterWelcome ? null : await api('/api/signup-offer').catch(() => null);
        if (offer && offer.open) {
            this.offer = offer;
            if (!offer.yearly) this.interval = 'month';
            this.hadOffer = true;
            this.step = 'offer';
            trackEvent('signup_offer_view');
        } else {
            this.hadOffer = this.supporterWelcome;
            this.step = 'choose';
        }
    },
    methods: {
        async claim() {
            this.busy = true;
            this.error = '';
            trackEvent('signup_offer_claim', { interval: this.interval });
            try {
                const { url } = await api('/api/signup-offer/checkout', { method: 'POST', body: JSON.stringify({ interval: this.interval }) });
                window.location.href = url;
            } catch (err) {
                this.error = err.message;
                this.busy = false;
            }
        },
        async skip() {
            this.busy = true;
            trackEvent('signup_offer_skip');
            await api('/api/signup-offer/skip', { method: 'POST', body: '{}' }).catch(() => null);
            this.busy = false;
            this.step = 'choose';
        },
        chose(how) {
            trackEvent('first_pack', { how });
        },
    },
};
</script>

<style lang="scss">
@import "../css/_globals";

.wgStartMain {
    max-width: 1100px;
    padding-bottom: 56px;
    padding-top: 28px;
}

.wgStartSteps {
    display: flex;
    flex-wrap: wrap;
    font-size: 13px;
    font-weight: 600;
    gap: 8px;
    list-style: none;
    margin: 0 0 32px;
    padding: 0;

    li {
        background: var(--lp-surface-sunken);
        border-radius: 999px;
        color: var(--lp-text-secondary);
        padding: 4px 10px;
    }

    .wgStartStepDone {
        background: var(--lp-active-bg);
        color: var(--lp-bubble-text);
    }

    .wgStartStepOn {
        background: $forest;
        color: #fff;
    }
}

.wgStartOffer {
    align-items: center;
    display: flex;
    flex-direction: column;
    gap: 20px;
    margin: 0 auto;
    max-width: 760px;
    text-align: center;
}

.wgStartHello {
    color: var(--lp-success);
    font-size: 18px;
    font-weight: 600;
    margin: 0;
}

.wgStartH1 {
    font-family: $font-display;
    font-size: clamp(30px, 4.4vw, 48px);
    font-stretch: 118%;
    font-weight: 850;
    line-height: 1.05;
    margin: 0;
}

.wgStartLede {
    color: var(--lp-text-secondary);
    font-size: 18px;
    margin: 12px 0 0;
    max-width: 640px;
}

.wgStartOffer .wgStartLede {
    margin: 0;
}

.wgStartToggle {
    background: var(--lp-surface);
    border: 1px solid var(--lp-border-strong);
    border-radius: 999px;
    display: inline-flex;
    gap: 4px;
    padding: 4px;

    button {
        background: transparent;
        border: 0;
        border-radius: 999px;
        color: var(--lp-text-secondary);
        cursor: pointer;
        font-size: 15px;
        font-weight: 600;
        min-height: 44px;
        padding: 0 22px;

        &[aria-pressed="true"] {
            background: $forest;
            color: #fff;
            font-weight: 700;
        }
    }
}

.wgStartPriceCard {
    background: var(--lp-surface);
    border: 2px solid $ember;
    border-radius: 20px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-width: 560px;
    padding: 28px;
    text-align: left;
    width: 100%;

    p {
        margin: 0;
    }
}

.wgStartPriceHead {
    align-items: flex-start;
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    justify-content: space-between;
}

.wgStartPlan {
    font-size: 18px;
    font-weight: 700;
}

.wgStartBadge {
    background: $ember;
    border-radius: 999px;
    color: #fff;
    font-size: 13px;
    font-weight: 700;
    padding: 5px 10px;
}

.wgStartPrice {
    align-items: baseline;
    display: flex;
    flex-wrap: wrap;
    font-size: 16px;
    gap: 12px;

    s {
        font-family: $font-mono;
        font-size: 18px;
    }
}

.wgStartPriceNum {
    color: var(--lp-text);
    font-family: $font-mono;
    font-size: 52px;
    font-weight: 600;
    line-height: 1;
}

.wgStartPerks {
    font-size: 15px;
    margin: 0;
    padding-left: 20px;

    li + li {
        margin-top: 6px;
    }
}

// .lp button sets a text colour; this one is white on Ember.
.lp .wgStartClaim {
    background: $ember;
    border: 0;
    border-radius: 12px;
    color: #fff;
    cursor: pointer;
    font-size: 17px;
    font-weight: 700;
    min-height: 54px;

    &:hover:not(:disabled) {
        background: #963F14;
    }

    &:disabled {
        opacity: 0.7;
    }
}

.wgStartFine {
    font-size: 13px;
    margin: 0;
}

.wgStartSkip {
    background: none;
    border: 0;
    color: var(--lp-text);
    cursor: pointer;
    font-size: 16px;
    font-weight: 600;
    min-height: 44px;
    padding: 0 12px;
    text-decoration: underline;
}

.wgStartChoices {
    display: grid;
    gap: 16px;
    grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
    margin: 28px 0 20px;
}

.wgStartChoice {
    background: var(--lp-surface);
    border: 1px solid var(--lp-border);
    border-radius: 16px;
    color: var(--lp-text) !important;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 22px;
    text-decoration: none;

    &:hover {
        border-color: var(--lp-border-hover);
        box-shadow: var(--lp-lift-shadow);
    }
}

.wgStartChoiceMain {
    border: 2px solid $forest;

    .wgStartChoiceIcon {
        background: $forest;
        color: #fff;
    }

    .wgStartChoiceGo {
        color: var(--lp-accent);
    }
}

.wgStartChoiceIcon {
    align-items: center;
    background: var(--lp-active-bg);
    border-radius: 12px;
    color: var(--lp-bubble-text);
    display: inline-flex;
    height: 44px;
    justify-content: center;
    width: 44px;
}

.wgStartChoiceTitle {
    font-size: 19px;
    font-weight: 800;
}

.wgStartChoiceText {
    color: var(--lp-text-secondary);
    font-size: 15px;
}

.wgStartChoiceGo {
    font-weight: 700;
    margin-top: auto;
}

.wgStartAfter {
    padding: 18px 22px;

    p {
        margin: 0;
    }
}
</style>
