<template>
    <div class="wgHome">
        <siteHeader active="explore" />
        <main class="wgPage wgBoard">
            <div class="wgSectionHead">
                <div>
                    <h1 class="wgH2">
                        Leaderboards
                    </h1>
                    <p class="wgLede">
                        Top lists by the community's votes in the last 30 days, and the lightest kits, for each kind of trip. Votes expire after 30 days, so the board keeps moving.
                    </p>
                </div>
            </div>

            <div class="wgTripFilter" role="tablist" aria-label="Trip type">
                <button v-for="t in tabs" :key="t.id" type="button" role="tab" class="wgChip" :aria-selected="String(trip === t.id)" :aria-pressed="String(trip === t.id)" :data-testid="`board-${t.id || 'all'}`" @click="pick(t.id)">
                    {{ t.label }}
                </button>
            </div>

            <div class="wgBoardCols">
                <section v-for="col in cols" :key="col.sort" class="wgCard wgBoardCol" :data-testid="`board-${col.sort}`">
                    <h2 class="wgProfileEditH">
                        {{ col.title }}
                    </h2>
                    <ol v-if="results[col.sort] && results[col.sort].length">
                        <li v-for="(k, i) in results[col.sort]" :key="k.externalId">
                            <span class="wgBoardRank">{{ i + 1 }}</span>
                            <a :href="`/r/${k.externalId}`" class="wgBoardName">{{ k.name }}</a>
                            <span class="wgMuted wgBoardBy">@{{ k.username }}</span>
                            <span class="wgMono wgBoardStat">{{ col.sort === 'top' ? `▲ ${k.score}` : weight(k.baseWeightMg) }}</span>
                        </li>
                    </ol>
                    <p v-else-if="results[col.sort]" class="wgMuted">
                        Nothing here yet.
                    </p>
                </section>
            </div>
        </main>
        <siteFooter site />
    </div>
</template>

<script>
import siteHeader from '../components/site-header.vue';
import siteFooter from '../components/site-footer.vue';
import { api, formatWeightMg } from '../utils/format.js';
import { TRIP_TYPES, TRIP_TYPE_LABELS } from '../utils/gear-meta.js';

export default {
    name: 'Leaderboard',
    components: { siteHeader, siteFooter },
    data() {
        return {
            trip: '',
            results: {},
            tabs: [{ id: '', label: 'All trips' }, ...TRIP_TYPES.map((id) => ({ id, label: TRIP_TYPE_LABELS[id] }))],
            cols: [{ sort: 'top', title: 'Top this month' }, { sort: 'light', title: 'Lightest' }],
        };
    },
    mounted() {
        document.title = 'Leaderboards — Waymark Gear';
        this.load();
    },
    methods: {
        weight(mg) {
            return formatWeightMg(mg, 'lb');
        },
        pick(id) {
            this.trip = id;
            this.load();
        },
        async load() {
            const asked = this.trip;
            for (const { sort } of this.cols) {
                const params = new URLSearchParams({ sort, limit: '20' });
                if (asked) params.set('trip', asked);
                api(`/api/explore/kits?${params}`).then((r) => {
                    if (asked !== this.trip) return;
                    // "Top" only ranks lists people have actually voted up.
                    this.results = { ...this.results, [sort]: sort === 'top' ? r.kits.filter((k) => k.score > 0) : r.kits };
                }).catch(() => {});
            }
        },
    },
};
</script>

<style lang="scss">
.wgBoard {
    padding: 28px 0 64px;
}

.wgBoardCols {
    display: grid;
    gap: 16px;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    margin-top: 18px;
}

.wgBoardCol {
    padding: 16px 18px;

    ol {
        list-style: none;
        margin: 10px 0 0;
        padding: 0;
    }

    li {
        align-items: baseline;
        border-top: 1px solid var(--lp-border);
        display: grid;
        gap: 2px 10px;
        grid-template-columns: 28px 1fr auto;
        padding: 9px 0;
    }
}

.wgBoardRank {
    color: var(--lp-text-secondary);
    font-weight: 800;
    grid-row: span 2;
}

.wgBoardName {
    color: var(--lp-text);
    font-weight: 650;
    text-decoration: none;
}

.wgBoardBy {
    font-size: 13px;
    grid-column: 2;
}

.wgBoardStat {
    grid-column: 3;
    grid-row: 1;
}
</style>
