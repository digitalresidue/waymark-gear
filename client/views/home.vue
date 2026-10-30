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
                        Coming from LighterPack or PackWizard? <router-link to="/?import=1" data-testid="hero-import">Bring your list over</router-link> in one step.
                    </p>
                </div>

                <div class="wgHeroCard wgCard" aria-label="Example kit">
                    <div class="wgHeroCardHead">
                        <div>
                            <p class="wgMuted wgHeroCardBy">
                                <template v-if="heroKit">
                                    Kit by <a :href="`/@${heroKit.username}`" class="wgByLink" data-testid="hero-kit-author">@{{ heroKit.username }}</a>
                                </template>
                                <template v-else>
                                    Example kit
                                </template>
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

            <!-- Trails: what people carry, trail by trail -->
            <section v-if="home.trails.length" id="trails" class="wgPage wgHomeSection" data-testid="home-trails">
                <div class="wgSectionHead">
                    <div>
                        <h2 class="wgH2">
                            Packs by trail
                        </h2>
                        <p class="wgLede">
                            See what hikers carry on the trail you're planning, and how their packs compare.
                        </p>
                    </div>
                </div>
                <ul class="wgHomeTrails">
                    <li v-for="t in home.trails" :key="t.slug">
                        <a :href="`/trails/${t.slug}`" class="wgHomeTrail" data-testid="home-trail">
                            <span class="wgHomeTrailTop">
                                <strong>{{ t.short || t.name }}</strong>
                                <span class="wgHomeTrailPacks" :class="{ wgHomeTrailPacksNone: !t.count }" data-testid="home-trail-packs">{{ t.count ? `${t.count.toLocaleString()} ${t.count === 1 ? 'pack' : 'packs'}` : '0 packs' }}</span>
                            </span>
                            <span class="wgMuted">{{ t.short ? t.name : t.region }}</span>
                            <span v-if="t.lengthMi" class="wgMuted wgHomeTrailLength">{{ t.lengthMi.toLocaleString() }} mi</span>
                            <span class="wgHomeTrailStats">
                                <template v-if="t.count && t.classes">
                                    <span class="wgTierBar" role="img" :aria-label="tierLabel(t)" :title="tierLabel(t)" data-testid="home-trail-tiers">
                                        <span v-for="c in weightClasses" v-show="t.classes[c.id]" :key="c.id" :class="`wgTier-${c.id}`" :style="{ flexGrow: t.classes[c.id] || 0 }" />
                                    </span>
                                    <span v-if="t.avgBaseWeightMg" class="wgHomeTrailAvg" data-testid="home-trail-avg"><span class="wgMono">{{ formatWeight(t.avgBaseWeightMg, 'lb') }}</span> avg base<span class="wgHomeTrailAvgWord"> weight</span></span>
                                </template>
                                <span v-else class="wgMuted wgHomeTrailFirst">Be the first to share a pack</span>
                            </span>
                        </a>
                    </li>
                </ul>
                <ul v-if="home.trails.some((t) => t.count)" class="wgTierLegend" aria-label="Weight classes">
                    <li v-for="c in weightClasses" :key="c.id">
                        <span :class="`wgTierDot wgTier-${c.id}`" aria-hidden="true" />{{ c.label }} <span class="wgMuted">{{ c.range }}</span>
                    </li>
                </ul>
                <p class="wgSectionMore">
                    <a href="/trails/all">All trails →</a>
                </p>
            </section>

            <!-- The newest gear reviews -->
            <section v-if="home.reviews.length" id="reviews" class="wgBand" data-testid="home-reviews">
                <div class="wgPage">
                    <div class="wgSectionHead">
                        <div>
                            <h2 class="wgH2">
                                Latest gear reviews
                            </h2>
                            <p class="wgLede">
                                How gear held up out there, from people who carried it.
                            </p>
                        </div>
                    </div>
                    <div class="wgHomeReviews">
                        <article v-for="r in home.reviews" :key="r.id" class="wgHomeReview" data-testid="home-review">
                            <p class="wgHomeReviewTop">
                                <span class="wgStars" :aria-label="`${r.rating} out of 5`">{{ '★'.repeat(r.rating) }}<span class="wgStarsOff">{{ '★'.repeat(5 - r.rating) }}</span></span>
                                <span v-if="r.staff" class="wgBadge">Waymark staff</span>
                            </p>
                            <a v-if="r.item" :href="`/g/${r.item.id}`" class="wgHomeReviewItem wgStretch">{{ [r.item.brand, r.item.name].filter(Boolean).join(' ') }}</a>
                            <h3 v-if="r.title">
                                {{ r.title }}
                            </h3>
                            <p class="wgHomeReviewBody">
                                {{ r.body }}
                            </p>
                            <p class="wgMuted wgHomeReviewBy">
                                <a :href="`/@${r.author}`" class="wgByLink">{{ r.displayName || `@${r.author}` }}</a> · {{ reviewDate(r.createdAt) }}
                            </p>
                        </article>
                    </div>
                    <p class="wgSectionMore">
                        <a href="/reviews">Read all reviews →</a>
                    </p>
                </div>
            </section>

            <!-- Shakedown board: lists asking the community for suggestions -->
            <section id="shakedowns" class="wgPage wgShakedownBoard" data-testid="shakedown-board">
                <div class="wgSectionHead">
                    <div>
                        <h2 class="wgH2">
                            Shakedown board
                        </h2>
                        <p class="wgLede">
                            Hikers asking what to cut, swap or rethink. The ones with the fewest suggestions come first. Help someone go lighter.
                        </p>
                    </div>
                </div>
                <div v-if="shakedowns.length" class="wgKitGrid">
                    <article v-for="kit in shakedowns" :key="kit.externalId" class="wgShakeCard" data-testid="shakedown-card">
                        <span v-if="isNew(kit)" class="wgNewRibbon" :title="`Asked ${ago(kit.shakedownAt)}`" data-testid="shakedown-new">New</span>
                        <span class="wgShakeTag">{{ kit.commentCount ? `${kit.commentCount} ${kit.commentCount === 1 ? 'suggestion' : 'suggestions'}` : 'No suggestions yet' }}</span>
                        <a :href="`/r/${kit.externalId}#wgComments`" class="wgShakeName wgStretch">{{ kit.name }}</a>
                        <span class="wgMuted">by <a :href="`/@${kit.username}`" class="wgByLink" data-testid="shakedown-card-author">@{{ kit.username }}</a>{{ tripLabel(kit) ? ` · ${tripLabel(kit)}` : '' }}</span>
                        <span class="wgShakeWeight wgMono">{{ formatWeight(kit.baseWeightMg, 'lb') }} <small class="wgMuted">base</small></span>
                        <span class="wgShakeCta">Suggest a change →</span>
                    </article>
                </div>
                <div v-else-if="shakedownsLoaded" class="wgEmpty">
                    <p><strong>No shakedown requests right now.</strong></p>
                    <p class="wgMuted">
                        Want feedback on your own kit? Publish a list and turn on “Request a shakedown” in its Share menu.
                    </p>
                </div>
                <p class="wgSectionMore">
                    <router-link to="/explore?shakedown=1">
                        All shakedown requests →
                    </router-link>
                    <router-link to="/leaderboard">
                        Leaderboards →
                    </router-link>
                </p>
            </section>

            <!-- Brands: who makes it, big and cottage -->
            <section v-if="home.brands.length" id="brands" class="wgPage wgHomeSection" data-testid="home-brands">
                <div class="wgSectionHead">
                    <div>
                        <h2 class="wgH2">
                            Gear makers
                        </h2>
                        <p class="wgLede">
                            From one-person cottage shops to the big names. Find who makes what you need.
                        </p>
                    </div>
                </div>
                <ul class="wgHomeBrands">
                    <li v-for="b in home.brands" :key="b.id">
                        <a :href="`/brands?q=${encodeURIComponent(b.name)}`" class="wgHomeBrand" data-testid="home-brand">
                            <img v-if="b.logoUrl" :src="b.logoUrl" alt="" class="wgHomeBrandLogo" loading="lazy">
                            <span v-else class="wgHomeBrandLogo wgHomeBrandInitial" aria-hidden="true">{{ b.name.charAt(0).toUpperCase() }}</span>
                            <span class="wgHomeBrandName">{{ b.name }}</span>
                            <span v-if="b.cottage" class="wgHomeBrandTag">Cottage</span>
                        </a>
                    </li>
                </ul>
                <p class="wgSectionMore">
                    <a href="/brands">All brands →</a>
                    <a href="/brands?cottage=1">Cottage makers →</a>
                </p>
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
                            <p><a :href="`/g/${g.id}`" class="wgCommonLink" data-testid="common-gear-link">{{ g.name }}</a></p>
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

            <!-- Leaderboards: a taste -->
            <section v-if="home.leaders.top.length || home.leaders.light.length" id="leaders" class="wgPage wgHomeSection" data-testid="home-leaders">
                <div class="wgSectionHead">
                    <div>
                        <h2 class="wgH2">
                            Leaderboards
                        </h2>
                        <p class="wgLede">
                            The kits people voted up most this month, and the lightest out there.
                        </p>
                    </div>
                </div>
                <div class="wgHomeLeaders">
                    <div v-for="col in leaderCols" :key="col.key" class="wgCard wgHomeLeaderCol">
                        <h3>{{ col.title }}</h3>
                        <ol>
                            <li v-for="(k, i) in col.kits" :key="k.externalId" data-testid="home-leader">
                                <span class="wgMono wgMuted">{{ i + 1 }}</span>
                                <a :href="`/r/${k.externalId}`" class="wgHomeLeaderName">{{ k.name }}</a>
                                <a :href="`/@${k.username}`" class="wgByLink wgMuted">@{{ k.username }}</a>
                                <span class="wgMono">{{ col.key === 'top' ? `▲ ${k.score}` : formatWeight(k.baseWeightMg, 'lb') }}</span>
                            </li>
                        </ol>
                        <p v-if="!col.kits.length" class="wgMuted">
                            Nothing here yet.
                        </p>
                    </div>
                </div>
                <p class="wgSectionMore">
                    <router-link to="/leaderboard">
                        Full leaderboards →
                    </router-link>
                </p>
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
import { TRIP_TYPE_LABELS, isNewShakedown, hoursAgo } from '../utils/gear-meta.js';
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
            // Trails, latest reviews, brands, leaderboards (GET /api/home).
            home: { trails: [], reviews: [], brands: [], leaders: { top: [], light: [] } },
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
            shakedowns: [],
            shakedownsLoaded: false,
            commonLoaded: false,
        };
    },
    computed: {
        leaderCols() {
            return [
                { key: 'top', title: 'Top this month', kits: this.home.leaders.top },
                { key: 'light', title: 'Lightest', kits: this.home.leaders.light },
            ];
        },
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
        api('/api/home').then((r) => { this.home = r; }).catch(() => {});
        siteConfig().then((config) => {
            if (config.weightClasses && config.weightClasses.length) this.weightClasses = config.weightClasses;
        });
        this.loadKits();
        this.loadHero();
        api('/api/explore/kits?shakedown=1&sort=needsHelp&limit=6')
            .then((r) => { this.shakedowns = r.kits; })
            .catch(() => {})
            .finally(() => { this.shakedownsLoaded = true; });
        this.loadCommon();
        api('/api/catalog/categories').then((r) => { this.categories = r.categories.slice(0, 8); }).catch(() => {});
    },
    methods: {
        formatWeight(mg, unit) {
            return formatWeightMg(mg, unit || 'oz');
        },
        isNew(kit) {
            return isNewShakedown(kit);
        },
        ago(when) {
            return hoursAgo(when);
        },
        reviewDate(when) {
            return new Date(when).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        },
        tripLabel(kit) {
            return TRIP_TYPE_LABELS[kit.tripType] || '';
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
        // "PCT packs: 3 Ultra-UL, 9 Ultralight, ..." for the class bar.
        tierLabel(t) {
            const parts = this.weightClasses.filter((c) => t.classes[c.id]).map((c) => `${t.classes[c.id]} ${c.label}`);
            return `${t.short || t.name} packs: ${parts.join(', ')}`;
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
    display: flex;
    flex-wrap: wrap;
    font-size: 16px;
    font-weight: 600;
    gap: 8px 24px;
    margin: 24px 0 0;
}

// ---- Discovery sections (trails, reviews, brands, leaderboards) ----

.wgHomeSection {
    padding-bottom: 56px;
    padding-top: 56px;
}

.wgHomeTrails {
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    list-style: none;
    margin: 0;
    padding: 0;
}

.wgHomeTrail {
    background: var(--lp-surface);
    border: 1px solid var(--lp-border);
    border-radius: $radius-lg;
    color: var(--lp-text);
    display: flex;
    flex-direction: column;
    gap: 2px;
    height: 100%;
    padding: 14px 16px;
    text-decoration: none;
    transition: border-color 0.15s, transform 0.15s;

    strong {
        font-family: $font-display;
        font-size: 20px;
    }

    .wgMuted {
        font-size: 13px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    &:hover {
        border-color: var(--lp-primary);
        transform: translateY(-1px);
    }
}

.wgHomeTrailTop {
    // A long name keeps whole words: the pack count drops below it instead.
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 8px;
    justify-content: space-between;

    strong {
        line-height: 1.15;
        min-width: 0;
    }
}

// The pack count: the number the section is ranked by.
.wgHomeTrailPacks {
    background: var(--lp-active-bg);
    border-radius: 999px;
    color: var(--lp-accent-green-deep);
    flex: 0 0 auto;
    font: 600 12.5px $font-mono;
    padding: 3px 9px;
    white-space: nowrap;
}

.wgHomeTrailPacksNone {
    background: var(--lp-surface-sunken);
    color: var(--lp-text-secondary);
    font-family: $font-body;
}

// Stats sit at the bottom, whatever the name's length.
.wgHomeTrailStats {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: auto;
    padding-top: 10px;
}

.wgHomeTrail .wgHomeTrailFirst {
    white-space: normal;
}

.wgHomeTrailAvg {
    color: var(--lp-text-secondary);
    font-size: 13px;

    .wgMono {
        color: var(--lp-text);
        font-weight: 600;
    }
}

// Packs by weight class, lightest on the left.
.wgTierBar {
    background: var(--lp-surface-sunken);
    border-radius: 999px;
    display: flex;
    gap: 2px;
    height: 8px;
    overflow: hidden;

    span {
        flex-basis: 0;
        min-width: 4px;
    }
}

.wgTier-sul { background: var(--wg-tier-sul, #1F6B4F); }
.wgTier-ul { background: #5BAA7E; }
.wgTier-lw { background: #D9A53F; }
.wgTier-trad { background: #9A7358; }

// The darkest green disappears on a dark page.
@media (prefers-color-scheme: dark) {
    .lp:not([data-theme="light"]) {
        --wg-tier-sul: #2E9A70;
    }
}

.lp[data-theme="dark"] {
    --wg-tier-sul: #2E9A70;
}

// Phones: two narrow columns rather than twelve full-width cards.
@media (max-width: $mobile) {
    .wgHomeTrails {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
    }

    .wgHomeTrail {
        padding: 12px;

        strong {
            font-size: 17px;
        }
    }

    .wgHomeTrailTop {
        align-items: flex-start;
        flex-direction: column;
        gap: 4px;
    }

    .wgHomeTrailLength,
    .wgHomeTrailAvgWord {
        display: none;
    }
}

.wgTierLegend {
    display: flex;
    flex-wrap: wrap;
    font-size: 13px;
    gap: 6px 18px;
    list-style: none;
    margin: 14px 0 0;
    padding: 0;

    li {
        align-items: center;
        display: inline-flex;
        gap: 6px;
    }
}

.wgTierDot {
    border-radius: 3px;
    display: inline-block;
    height: 10px;
    width: 10px;
}

.wgHomeReviews {
    display: grid;
    gap: 18px;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
}

.wgHomeReview {
    background: var(--lp-content-bg);
    border: 1px solid var(--lp-border);
    border-radius: $radius-lg;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 18px 20px;
    position: relative;

    h3 {
        font-size: 17px;
        margin: 0;
    }

    &:hover {
        border-color: var(--lp-border-strong);
    }
}

.wgHomeReviewTop {
    align-items: center;
    display: flex;
    gap: 8px;
    margin: 0;
}

.wgStars {
    color: #C48A1F;
    letter-spacing: 1px;
}

.wgStarsOff {
    color: var(--lp-border-strong);
}

.wgHomeReviewItem {
    color: var(--lp-accent-green-deep);
    font-weight: 700;
}

.wgHomeReviewBody {
    -webkit-box-orient: vertical;
    color: var(--lp-text-secondary);
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    margin: 0;
    overflow: hidden;
}

.wgHomeReviewBy {
    font-size: 13px;
    margin: auto 0 0;
}

.wgHomeBrands {
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    list-style: none;
    margin: 0;
    padding: 0;
}

.wgHomeBrand {
    align-items: center;
    background: var(--lp-surface);
    border: 1px solid var(--lp-border);
    border-radius: $radius-lg;
    color: var(--lp-text);
    display: flex;
    flex-direction: column;
    gap: 8px;
    height: 100%;
    padding: 16px 12px;
    text-align: center;
    text-decoration: none;

    &:hover {
        border-color: var(--lp-primary);
    }
}

.wgHomeBrandLogo {
    background: #fff;
    border: 1px solid var(--lp-border);
    border-radius: 12px;
    height: 56px;
    object-fit: contain;
    padding: 4px;
    width: 56px;
}

.wgHomeBrandInitial {
    align-items: center;
    background: var(--lp-active-bg);
    color: var(--lp-accent-green-deep);
    display: inline-flex;
    font: 800 24px/1 $font-display;
    justify-content: center;
}

.wgHomeBrandName {
    font-weight: 700;
}

.wgHomeBrandTag {
    background: var(--lp-active-bg);
    border-radius: 999px;
    color: var(--lp-accent-green-deep);
    font-size: 11.5px;
    font-weight: 700;
    padding: 2px 8px;
}

.wgHomeLeaders {
    display: grid;
    gap: 18px;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
}

.wgHomeLeaderCol {
    padding: 18px 20px;

    h3 {
        font-size: 17px;
        margin: 0 0 10px;
    }

    ol {
        list-style: none;
        margin: 0;
        padding: 0;
    }

    li {
        align-items: baseline;
        border-top: 1px solid var(--lp-border);
        display: grid;
        gap: 10px;
        grid-template-columns: 18px minmax(0, 1fr) auto auto;
        padding: 9px 0;
    }

    .wgByLink {
        font-size: 13px;
        font-weight: 500;
    }
}

.wgHomeLeaderName {
    color: var(--lp-text);
    font-weight: 650;
    overflow: hidden;
    text-decoration: none;
    text-overflow: ellipsis;
    white-space: nowrap;

    &:hover {
        text-decoration: underline;
    }
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
        position: relative;

        &:hover {
            background: var(--lp-row-hover);
        }

        &:has(.wgCommonLink:focus-visible) {
            outline: 2px solid var(--lp-primary);
            outline-offset: -2px;
        }

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

// The name links to the gear page; the whole row is the click target.
.wgCommonLink {
    color: var(--lp-text);
    text-decoration: none;

    &::after {
        content: "";
        inset: 0;
        position: absolute;
    }

    &:focus-visible {
        outline: none;
    }

    li:hover & {
        text-decoration: underline;
    }
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
.wgShakedownBoard {
    padding-top: 56px;

    .wgSectionMore {
        display: flex;
        flex-wrap: wrap;
        gap: 18px;
    }
}

.wgShakeCard {
    background: var(--lp-surface);
    overflow: hidden;
    position: relative;
    border: 1px solid var(--lp-border);
    border-left: 4px solid #C4571F;
    border-radius: 16px;
    color: var(--lp-text);
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 16px 18px;
    text-decoration: none;
    transition: border-color 0.15s, transform 0.15s;

    &:hover {
        border-color: #C4571F;
        transform: translateY(-1px);
    }
}

.wgShakeTag {
    align-self: flex-start;
    background: #FCEFD9;
    border-radius: 999px;
    color: #5A3B06;
    font-size: 12px;
    font-weight: 700;
    padding: 3px 10px;
}

.wgShakeName {
    font-size: 17px;
    font-weight: 700;
}

.wgShakeWeight {
    font-size: 22px;
    font-weight: 600;
}

.wgShakeCta {
    color: #9A4312;
    font-size: 14px;
    font-weight: 700;
    margin-top: 4px;
}

// On a phone, less air between the homepage's sections: the page was
// mostly padding at 390px wide.
@media (max-width: $mobile) {
    .wgHero {
        gap: 28px;
        padding-bottom: 32px;
        padding-top: 24px;
    }

    .wgCommon {
        gap: 24px;
        padding-bottom: 40px;
        padding-top: 40px;
    }

    .wgShakedownBoard {
        padding-top: 32px;
    }

    .wgBand {
        padding-bottom: 36px;
        padding-top: 36px;
    }

    .wgSectionHead {
        margin-bottom: 16px;
    }
}
</style>
