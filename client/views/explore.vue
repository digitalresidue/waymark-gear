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
                <label class="wgSearch wgExploreSearch">
                    <span class="wgVisuallyHidden">Search kits</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
                    <input v-model="query" type="search" class="wgInput" placeholder="Search by name or hiker" data-testid="explore-search" @input="queueSearch">
                </label>
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
            kits: [],
            total: 0,
            loaded: false,
            loading: false,
            timer: null,
        };
    },
    async mounted() {
        document.title = 'Explore kits — Waymark Gear';
        const fromUrl = String(this.$route.query.class || '');
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
        async load(reset) {
            this.loading = true;
            const params = new URLSearchParams({ limit: String(PAGE), offset: String(reset ? 0 : this.kits.length) });
            if (this.activeClass) params.set('class', this.activeClass);
            if (this.query.trim()) params.set('q', this.query.trim());
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
</style>
