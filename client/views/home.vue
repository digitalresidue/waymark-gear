<template>
    <div class="wgHome">
        <siteHeader />

        <main>
            <!-- Hero -->
            <section class="wgPage wgHero">
                <div class="wgHeroCopy">
                    <p class="wgEyebrow">
                        Build it. Share it. Go.
                    </p>
                    <h1 class="wgDisplay wgHeroTitle">
                        Know every ounce before you go.
                    </h1>
                    <p class="wgLede wgHeroLede">
                        Pick gear from a shared catalog instead of typing it in, see your base weight the moment you add it, and share the kit with one link.
                    </p>
                    <div class="wgHeroActions">
                        <template v-if="hasLibrary">
                            <router-link to="/" class="wgBtn wgBtnPrimary" data-testid="hero-open">
                                Open my lists
                            </router-link>
                        </template>
                        <template v-else>
                            <googleButton @availability="googleOn = $event" />
                            <button type="button" class="wgBtn" :class="googleOn ? '' : 'wgBtnPrimary'" data-testid="hero-start" @click="start">
                                Start a list — no account needed
                            </button>
                        </template>
                        <a href="#kits" class="wgBtn wgBtnGhost">Browse kits →</a>
                    </div>
                    <p v-if="!hasLibrary" class="wgHeroNote wgMuted">
                        <!-- eslint-disable-next-line vue/singleline-html-element-content-newline -->
                        Free. Prefer email? <router-link to="/register">Create an account</router-link> or <router-link to="/signin">sign in</router-link>.
                    </p>
                    <p class="wgHeroNote wgMuted">
                        <!-- eslint-disable-next-line vue/singleline-html-element-content-newline -->
                        Coming from LighterPack? <router-link to="/?import=lighterpack" data-testid="hero-import">Bring your list over</router-link> in one step.
                    </p>
                </div>

                <div class="wgHeroCard wgCard" aria-label="Example kit">
                    <div class="wgHeroCardHead">
                        <div>
                            <p class="wgMuted wgHeroCardBy">
                                {{ heroKit ? `Kit by @${heroKit.username}` : 'Example kit' }}
                            </p>
                            <h2 class="wgHeroCardTitle">
                                {{ heroKit ? heroKit.name : 'Three nights, shoulder season' }}
                            </h2>
                        </div>
                        <span class="wgBadge">{{ heroClassLabel }}</span>
                    </div>
                    <div class="wgHeroStats">
                        <div>
                            <p class="wgStatLabel">
                                Base weight
                            </p>
                            <p class="wgStatBig wgMono">
                                {{ heroStat('baseWeightMg') }}
                            </p>
                        </div>
                        <div>
                            <p class="wgStatLabel">
                                Worn
                            </p>
                            <p class="wgStatSmall wgMono">
                                {{ heroStat('wornWeightMg') }}
                            </p>
                        </div>
                        <div>
                            <p class="wgStatLabel">
                                Consumables
                            </p>
                            <p class="wgStatSmall wgMono">
                                {{ heroStat('consumableWeightMg') }}
                            </p>
                        </div>
                    </div>
                    <div class="wgWeightBar wgHeroBar" aria-hidden="true">
                        <span v-for="(c, i) in heroCategories" :key="c.name" :class="`wgData${i + 1}`" :style="{ width: c.pct + '%' }" />
                    </div>
                    <ul class="wgHeroLegend">
                        <li v-for="(c, i) in heroCategories" :key="c.name">
                            <span :class="`wgSwatch wgData${i + 1}`" />{{ c.name }}<span class="wgMono wgMuted">{{ c.weight }}</span>
                        </li>
                    </ul>
                    <a v-if="heroKit" :href="`/r/${heroKit.externalId}`" class="wgHeroCardLink">See the full list →</a>
                </div>
            </section>

            <!-- Featured kits -->
            <section id="kits" class="wgBand">
                <div class="wgPage">
                    <div class="wgSectionHead">
                        <div>
                            <h2 class="wgH2">
                                Featured kits
                            </h2>
                            <p class="wgLede">
                                Lists people have published, grouped by base weight.
                            </p>
                        </div>
                        <div class="wgSegmented" role="tablist" aria-label="Weight class">
                            <button
                                v-for="c in weightClasses"
                                :key="c.id"
                                type="button"
                                role="tab"
                                :aria-selected="String(activeClass === c.id)"
                                :data-testid="`class-${c.id}`"
                                @click="pickClass(c.id)"
                            >
                                {{ c.label }}<small>{{ c.range }}</small>
                            </button>
                        </div>
                    </div>

                    <div v-if="kits.length" class="wgKitGrid">
                        <kitCard v-for="kit in kits" :key="kit.externalId" :kit="kit" />
                    </div>
                    <div v-else-if="kitsLoaded" class="wgEmpty" data-testid="kits-empty">
                        <p><strong>No {{ activeLabel.toLowerCase() }} kits published yet.</strong></p>
                        <p class="wgMuted">
                            Open a list, choose Share, and turn on “Publish to Explore” to be the first.
                        </p>
                    </div>
                    <p class="wgSectionMore">
                        <router-link :to="`/explore?class=${activeClass}`">
                            See all {{ activeLabel.toLowerCase() }} kits →
                        </router-link>
                    </p>
                </div>
            </section>

            <!-- Most common gear -->
            <section id="common" class="wgPage wgCommon">
                <div class="wgCommonIntro">
                    <h2 class="wgH2">
                        What people actually carry
                    </h2>
                    <p class="wgLede">
                        The catalog gear that shows up most across published kits.
                    </p>
                    <div class="wgChips" role="group" aria-label="Gear category">
                        <button type="button" class="wgChip" :aria-pressed="String(activeCategory === '')" @click="pickCategory('')">
                            All
                        </button>
                        <button v-for="c in categories" :key="c.name" type="button" class="wgChip" :aria-pressed="String(activeCategory === c.name)" @click="pickCategory(c.name)">
                            {{ c.name }}
                        </button>
                    </div>
                </div>
                <ol v-if="common.length" class="wgCommonList wgCard" data-testid="common-gear">
                    <li v-for="(g, i) in common" :key="g.id">
                        <span class="wgMono wgMuted wgRank">{{ String(i + 1).padStart(2, '0') }}</span>
                        <div class="wgCommonName">
                            <p>{{ g.name }}</p>
                            <p class="wgMuted">
                                {{ [g.brand, g.category].filter(Boolean).join(' · ') }}
                            </p>
                        </div>
                        <div class="wgCommonShare">
                            <div class="wgShareTrack" aria-hidden="true">
                                <span :style="{ width: Math.round(g.share * 100) + '%' }" />
                            </div>
                            <p class="wgMuted">
                                in {{ g.kits }} of {{ commonKitCount }} kits
                            </p>
                        </div>
                        <span class="wgMono wgCommonWeight">{{ formatWeight(g.weightMg, g.unit) }}</span>
                    </li>
                </ol>
                <div v-else-if="commonLoaded" class="wgEmpty wgCommonEmpty">
                    <p><strong>Nothing to rank yet.</strong></p>
                    <p class="wgMuted">
                        This fills in as people publish kits built from the gear catalog.
                    </p>
                </div>
            </section>

            <!-- How it works -->
            <section class="wgHow">
                <div class="wgPage">
                    <h2 class="wgH2">
                        From pile on the floor to packed in minutes
                    </h2>
                    <div class="wgHowSteps">
                        <div>
                            <p class="wgHowNum wgMono">
                                01
                            </p>
                            <h3>Pick from the catalog</h3>
                            <p>Search gear with weights, prices and links already filled in. Make a custom item only when it isn't there.</p>
                        </div>
                        <div>
                            <p class="wgHowNum wgMono">
                                02
                            </p>
                            <h3>Try a few versions</h3>
                            <p>Keep a kit per trip, copy one to experiment, and watch base weight change as you swap.</p>
                        </div>
                        <div>
                            <p class="wgHowNum wgMono">
                                03
                            </p>
                            <h3>Share or publish</h3>
                            <p>Send a private link, embed it on your blog, or publish it to Explore so others can learn from it.</p>
                        </div>
                    </div>
                </div>
            </section>
        </main>

        <siteFooter site />
        <globalAlerts />
    </div>
</template>

<script>
import siteHeader from '../components/site-header.vue';
import siteFooter from '../components/site-footer.vue';
import globalAlerts from '../components/global-alerts.vue';
import googleButton from '../components/google-button.vue';
import kitCard from '../components/kit-card.vue';
import { api, formatWeightMg, siteConfig } from '../utils/format.js';

const FALLBACK_CLASSES = [
    { id: 'sul', label: 'Ultra-UL', range: 'under 5 lb' },
    { id: 'ul', label: 'Ultralight', range: '5–10 lb' },
    { id: 'lw', label: 'Lightweight', range: '10–20 lb' },
    { id: 'trad', label: 'Traditional', range: '20 lb +' },
];

// Shown in the hero card until a real published kit exists. Labelled
// "Example kit" on the page.
const EXAMPLE = {
    baseWeightMg: 4082328, wornWeightMg: 952544, consumableWeightMg: 3084427,
    categories: [
        { name: 'Sleep', weightMg: 1134000 }, { name: 'Shelter', weightMg: 907200 },
        { name: 'Pack', weightMg: 771120 }, { name: 'Kitchen', weightMg: 544320 },
        { name: 'Other', weightMg: 725688 },
    ],
};

export default {
    name: 'Home',
    components: { siteHeader, siteFooter, globalAlerts, googleButton, kitCard },
    data() {
        return {
            googleOn: false,
            weightClasses: FALLBACK_CLASSES,
            activeClass: 'ul',
            kits: [],
            kitsLoaded: false,
            heroKit: null,
            categories: [],
            activeCategory: '',
            common: [],
            commonKitCount: 0,
            commonLoaded: false,
        };
    },
    computed: {
        hasLibrary() {
            return Boolean(this.$store.state.library);
        },
        activeLabel() {
            return (this.weightClasses.find((c) => c.id === this.activeClass) || { label: '' }).label;
        },
        heroSource() {
            return this.heroKit || EXAMPLE;
        },
        heroClassLabel() {
            const id = this.heroKit ? this.heroKit.weightClass : 'ul';
            return (this.weightClasses.find((c) => c.id === id) || { label: 'Ultralight' }).label;
        },
        heroCategories() {
            const cats = (this.heroSource.categories || []).filter((c) => c.weightMg > 0)
                .sort((a, b) => b.weightMg - a.weightMg).slice(0, 5);
            const total = cats.reduce((s, c) => s + c.weightMg, 0) || 1;
            return cats.map((c) => ({ name: c.name, pct: (c.weightMg / total) * 100, weight: formatWeightMg(c.weightMg, 'lb') }));
        },
    },
    async mounted() {
        document.title = 'Waymark Gear — Build it. Share it. Go.';
        siteConfig().then((config) => {
            if (config.weightClasses && config.weightClasses.length) this.weightClasses = config.weightClasses;
        });
        this.loadKits();
        this.loadHero();
        this.loadCommon();
        api('/api/catalog/categories').then((r) => { this.categories = r.categories.slice(0, 8); }).catch(() => {});
    },
    methods: {
        formatWeight(mg, unit) {
            return formatWeightMg(mg, unit || 'oz');
        },
        heroStat(key) {
            return formatWeightMg(this.heroSource[key] || 0, 'lb');
        },
        start() {
            this.$store.dispatch('startLocalLibrary');
            this.$router.push('/');
        },
        pickClass(id) {
            this.activeClass = id;
            this.loadKits();
        },
        pickCategory(name) {
            this.activeCategory = name;
            this.loadCommon();
        },
        async loadKits() {
            const asked = this.activeClass;
            try {
                const r = await api(`/api/explore/featured?class=${asked}&limit=6`);
                if (asked === this.activeClass) this.kits = r.kits;
            } catch {
                this.kits = [];
            }
            this.kitsLoaded = true;
        },
        async loadHero() {
            // The first featured kit in any class, lightest class first.
            for (const c of ['ul', 'sul', 'lw', 'trad']) {
                try {
                    const r = await api(`/api/explore/featured?class=${c}&limit=1`);
                    if (r.kits.length) {
                        this.heroKit = r.kits[0];
                        return;
                    }
                } catch {
                    return;
                }
            }
        },
        async loadCommon() {
            const asked = this.activeCategory;
            try {
                const r = await api(`/api/explore/common?limit=8&category=${encodeURIComponent(asked)}`);
                if (asked === this.activeCategory) {
                    this.common = r.items;
                    this.commonKitCount = r.kitCount;
                }
            } catch {
                this.common = [];
            }
            this.commonLoaded = true;
        },
    },
};
</script>

<style lang="scss">
@import "../css/_globals";

.wgHome {
    background: var(--lp-bg);
    min-height: 100vh;
}

.wgHero {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 56px;
    padding-bottom: 64px;
    padding-top: 64px;
}

.wgHeroCopy {
    flex: 1 1 460px;
    min-width: 0;
}

.wgHeroTitle {
    font-size: clamp(40px, 6vw, 62px);
    margin-top: 16px;
}

.wgHeroLede {
    font-size: 19px;
    max-width: 540px;
}

.wgHeroActions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 30px;
}

.wgHeroNote {
    font-size: 14px;
    margin: 16px 0 0;
}

.wgHeroCard {
    box-shadow: var(--lp-lift-shadow);
    flex: 1 1 400px;
    min-width: 0;
    padding: 26px;
}

.wgHeroCardHead {
    align-items: flex-start;
    display: flex;
    gap: 12px;
    justify-content: space-between;
}

.wgHeroCardBy {
    font-size: 13px;
    margin: 0;
}

.wgHeroCardTitle {
    font-size: 23px;
    font-weight: 750;
    margin: 4px 0 0 !important;
}

.wgHeroStats {
    display: flex;
    flex-wrap: wrap;
    gap: 28px;
    margin-top: 22px;

    p {
        margin: 0;
    }
}

.wgStatLabel {
    color: var(--lp-text-secondary);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
}

.wgStatBig {
    font-size: 38px;
    font-weight: 600;
    letter-spacing: -0.02em;
    margin-top: 4px !important;
}

.wgStatSmall {
    font-size: 21px;
    padding-top: 14px;
}

.wgHeroBar {
    height: 12px;
    margin-top: 20px;
}

.wgHeroLegend {
    display: grid;
    font-size: 14px;
    gap: 10px 20px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    list-style: none;
    margin: 18px 0 0;
    padding: 0;

    li {
        align-items: center;
        display: flex;
        gap: 8px;
    }

    .wgMono {
        margin-left: auto;
    }
}

.wgSwatch {
    border-radius: 3px;
    display: inline-block;
    flex: none;
    height: 10px;
    width: 10px;
}

.wgHeroCardLink {
    display: inline-block;
    font-weight: 600;
    margin-top: 18px;
}

.wgBand {
    background: var(--lp-surface);
    border-bottom: 1px solid var(--lp-border);
    border-top: 1px solid var(--lp-border);
    padding: 64px 0;
}

.wgSectionHead {
    align-items: flex-end;
    display: flex;
    flex-wrap: wrap;
    gap: 24px;
    justify-content: space-between;
    margin-bottom: 32px;
}

.wgKitGrid {
    display: grid;
    gap: 18px;
    grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
}

.wgEmpty {
    background: var(--lp-surface-sunken);
    border-radius: $radius-lg;
    padding: 28px;

    p {
        margin: 0 0 6px;
    }
}

.wgSectionMore {
    font-size: 16px;
    font-weight: 600;
    margin: 24px 0 0;
}

.wgCommon {
    display: flex;
    flex-wrap: wrap;
    gap: 48px;
    padding-bottom: 72px;
    padding-top: 72px;
}

.wgCommonIntro {
    flex: 1 1 300px;
    min-width: 0;
}

.wgChips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 22px;
}

.wgCommonList,
.wgCommonEmpty {
    flex: 2 1 540px;
    min-width: 0;
}

.wgCommonList {
    list-style: none;
    margin: 0;
    padding: 0;

    li {
        align-items: center;
        border-bottom: 1px solid var(--lp-border);
        display: grid;
        gap: 16px;
        grid-template-columns: 32px minmax(0, 1fr) 150px 80px;
        padding: 16px 22px;

        &:last-child {
            border-bottom: 0;
        }

        @media (max-width: $mobile) {
            grid-template-columns: 28px minmax(0, 1fr) 72px;
            padding: 14px 16px;

            .wgCommonShare {
                display: none;
            }
        }
    }

    p {
        margin: 0;
    }
}

.wgCommonName p:first-child {
    font-size: 16px;
    font-weight: 600;
}

.wgCommonName .wgMuted,
.wgCommonShare .wgMuted {
    font-size: 13px;
    margin-top: 3px;
}

.wgShareTrack {
    background: var(--lp-surface-sunken);
    border-radius: 999px;
    height: 6px;
    overflow: hidden;

    span {
        background: var(--lp-accent-green);
        border-radius: 999px;
        display: block;
        height: 100%;
    }
}

.wgCommonWeight {
    font-size: 15px;
    text-align: right;
}

.wgHow {
    background: #1D3B30;
    color: #F2F4F0;
    padding: 72px 0;

    .wgH2 {
        color: #fff;
    }

    h3 {
        color: #fff;
        font-family: $font-body;
        font-size: 20px;
        font-stretch: 100%;
        font-weight: 650;
        margin: 10px 0 0;
    }

    p {
        color: #C9D6CD;
        font-size: 16px;
        line-height: 1.6;
        margin: 10px 0 0;
    }
}

.wgHowSteps {
    display: grid;
    gap: 32px;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    margin-top: 40px;
}

.lp .wgHow .wgHowNum {
    color: #F0A27A;
    font-size: 14px;
    margin: 0;
}
</style>
