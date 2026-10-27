<template>
    <div class="wgHome">
        <siteHeader active="explore" />
        <main class="wgPage wgExplore">
            <div class="wgSectionHead">
                <div>
                    <h1 class="wgH2">
                        Explore kits
                    </h1>
                    <p class="wgLede">
                        Gear lists people chose to publish. Open one to see every item, or copy ideas into your own.
                    </p>
                </div>
            </div>

            <div class="wgExploreTools">
                <div class="wgSegmented" role="tablist" aria-label="Weight class">
                    <button type="button" role="tab" :aria-selected="String(activeClass === '')" data-testid="class-all" @click="pickClass('')">
                        All<small>any weight</small>
                    </button>
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
                <button type="button" class="wgChip" :aria-pressed="String(shakedownOnly)" data-testid="explore-shakedown" @click="toggleShakedown">
                    Shakedown requests
                </button>
                <button v-if="signedIn" type="button" class="wgChip" :aria-pressed="String(followingOnly)" data-testid="explore-following" @click="toggleFollowing">
                    Following
                </button>
                <label class="wgExploreSort">
                    <span class="wgMuted">Sort</span>
                    <select v-model="sort" class="wgSelect" data-testid="explore-sort" @change="load(true)">
                        <option value="featured">Featured</option>
                        <option value="new">Newest</option>
                        <option value="top">Top this month</option>
                        <option value="light">Lightest</option>
                    </select>
                </label>
                <label class="wgSearch wgExploreSearch">
                    <span class="wgVisuallyHidden">Search kits</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
                    <input v-model="query" type="search" class="wgInput" placeholder="Search by name or hiker" data-testid="explore-search" @input="queueSearch">
                </label>
            </div>

            <div class="wgTripFilter" role="group" aria-label="Trip type">
                <button type="button" class="wgChip" :aria-pressed="String(tripType === '')" data-testid="trip-all" @click="pickTrip('')">
                    Any trip
                </button>
                <button v-for="t in tripTypes" :key="t.id" type="button" class="wgChip" :aria-pressed="String(tripType === t.id)" :data-testid="`trip-filter-${t.id}`" @click="pickTrip(t.id)">
                    {{ t.label }}
                </button>
            </div>

            <p class="wgMuted wgExploreCount" aria-live="polite">
                {{ loaded ? `${total} ${total === 1 ? 'kit' : 'kits'}` : 'Loading…' }}
            </p>

            <div v-if="kits.length" class="wgKitGrid">
                <kitCard v-for="kit in kits" :key="kit.externalId" :kit="kit" />
            </div>
            <div v-else-if="loaded" class="wgEmpty">
                <p><strong>No kits match.</strong></p>
                <p class="wgMuted">
                    Try another weight class, or publish one of your own from a list's Share menu.
                </p>
            </div>

            <div v-if="kits.length < total" class="wgExploreMore">
                <button type="button" class="wgBtn" :disabled="loading" @click="loadMore">
                    {{ loading ? 'Loading…' : 'Show more' }}
                </button>
            </div>
        </main>
        <siteFooter site />
    </div>
</template>

<script>
import { TRIP_TYPES, TRIP_TYPE_LABELS } from '../utils/gear-meta.js';
import siteHeader from '../components/site-header.vue';
import siteFooter from '../components/site-footer.vue';
import kitCard from '../components/kit-card.vue';
import { api, siteConfig } from '../utils/format.js';

const PAGE = 24;

export default {
    name: 'Explore',
    components: { siteHeader, siteFooter, kitCard },
    data() {
        return {
            weightClasses: [],
            activeClass: '',
            query: '',
            shakedownOnly: false,
            followingOnly: false,
            tripType: '',
            sort: 'featured',
            tripTypes: TRIP_TYPES.map((id) => ({ id, label: TRIP_TYPE_LABELS[id] })),
            kits: [],
            total: 0,
            loaded: false,
            loading: false,
            timer: null,
        };
    },
    computed: {
        signedIn() {
            return Boolean(this.$store.state.loggedIn);
        },
    },
    async mounted() {
        document.title = 'Explore kits — Waymark Gear';
        const fromUrl = String(this.$route.query.class || '');
        if (this.$route.query.shakedown === '1') this.shakedownOnly = true;
        const config = await siteConfig();
        this.weightClasses = config.weightClasses || [];
        if (this.weightClasses.some((c) => c.id === fromUrl)) this.activeClass = fromUrl;
        this.load(true);
    },
    methods: {
        pickClass(id) {
            this.activeClass = id;
            this.$router.replace({ query: id ? { class: id } : {} });
            this.load(true);
        },
        queueSearch() {
            clearTimeout(this.timer);
            this.timer = setTimeout(() => this.load(true), 250);
        },
        loadMore() {
            this.load(false);
        },
        toggleFollowing() {
            this.followingOnly = !this.followingOnly;
            this.load(true);
        },
        pickTrip(id) {
            this.tripType = id;
            this.load(true);
        },
        toggleShakedown() {
            this.shakedownOnly = !this.shakedownOnly;
            this.load(true);
        },
        async load(reset) {
            this.loading = true;
            const params = new URLSearchParams({ limit: String(PAGE), offset: String(reset ? 0 : this.kits.length) });
            if (this.activeClass) params.set('class', this.activeClass);
            if (this.query.trim()) params.set('q', this.query.trim());
            if (this.shakedownOnly) params.set('shakedown', '1');
            if (this.followingOnly) params.set('following', '1');
            if (this.tripType) params.set('trip', this.tripType);
            if (this.sort !== 'featured') params.set('sort', this.sort);
            try {
                const r = await api(`/api/explore/kits?${params}`);
                this.kits = reset ? r.kits : this.kits.concat(r.kits);
                this.total = r.total;
            } catch {
                if (reset) this.kits = [];
            }
            this.loaded = true;
            this.loading = false;
        },
    },
};
</script>

<style lang="scss">
.wgExplore {
    padding-bottom: 72px;
    padding-top: 48px;

    @media (max-width: 720px) {
        padding-bottom: 40px;
        padding-top: 20px;
    }
}

.wgExploreTools {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    justify-content: space-between;
}

.wgExploreSearch {
    flex: 0 1 320px;
    min-width: 220px;
}

.wgExploreCount {
    font-size: 14px;
    margin: 20px 0 14px;
}

.wgExploreMore {
    display: flex;
    justify-content: center;
    margin-top: 28px;
}
.wgExploreSort {
    align-items: center;
    display: inline-flex;
    gap: 8px;

    .wgSelect {
        width: auto;
    }
}

.wgTripFilter {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 12px 0 0;
}
</style>
