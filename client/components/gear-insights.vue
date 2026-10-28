<template>
    <section class="wgTrip wgCard wgInsights" :class="{ wgTripOpen: open }" data-testid="gear-insights">
        <h2 class="wgTripHeading">
            <button type="button" class="wgTripToggle" :aria-expanded="String(open)" data-testid="insights-toggle" @click="toggle">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
                Gear check
                <span class="wgTripSummary wgMuted">
                    <span class="wgInsightBadge" :class="scoreClass" data-testid="insights-score-badge">{{ check.score }}</span>
                    {{ label }}<template v-if="check.missing.length"> · {{ check.missing.length }} missing</template>
                </span>
            </button>
        </h2>

        <div v-if="open" class="wgTripBody">
            <div class="wgInsightScore">
                <div class="wgInsightMeter" role="meter" :aria-valuenow="check.score" aria-valuemin="0" aria-valuemax="100" aria-label="Trip readiness">
                    <span :style="{ width: `${check.score}%` }" :class="scoreClass" />
                </div>
                <p>
                    <strong data-testid="insights-score">{{ check.score }}</strong>/100 · {{ label }}
                    <span class="wgMuted">for {{ tripLabel }}</span>
                </p>
            </div>
            <p v-for="n in check.notes" :key="n" class="wgInsightWarn" role="alert">
                {{ n }}
            </p>

            <h3 class="wgInsightH">
                Essentials
            </h3>
            <ul class="wgInsightChips" data-testid="insights-missing">
                <li v-for="m in check.missing" :key="m.id" class="wgInsightMissing" :class="{ wgInsightCritical: m.critical }" :data-testid="`missing-${m.id}`">
                    <span>{{ m.label }}</span>
                    <button type="button" class="wgLinkBtn" :aria-label="`${m.label} isn't needed on this trip`" :data-testid="`not-needed-${m.id}`" @click="dismiss(m.id)">
                        Not needed
                    </button>
                </li>
                <li v-for="c in check.covered" :key="c.id" class="wgInsightCovered" :title="`Found: ${c.by}`" :data-testid="`covered-${c.id}`">
                    ✓ {{ c.label }}
                </li>
                <li v-for="d in check.dismissed" :key="d.id" class="wgInsightSkipped" :data-testid="`skipped-${d.id}`">
                    <s>{{ d.label }}</s>
                    <button type="button" class="wgLinkBtn" @click="undismiss(d.id)">
                        Undo
                    </button>
                </li>
            </ul>
            <p class="wgMuted wgTripFine wgInsightNote">
                Found by the names of your gear and categories. Hover a ✓ to see what counted.
            </p>

            <template v-if="alternatives.length">
                <h3 class="wgInsightH">
                    Lighter options
                </h3>
                <ul class="wgInsightRows" data-testid="insights-alternatives">
                    <li v-for="a in alternatives" :key="a.item.itemId || a.item.name" data-testid="alternative">
                        <span class="wgInsightFrom">{{ a.item.name }} <span class="wgMono wgMuted">{{ fmt(a.item.weightMg) }}</span></span>
                        <span v-for="o in a.options" :key="o.id" class="wgInsightOption">
                            <a :href="`/g/${o.id}`" target="_blank" rel="noopener">{{ o.brand }} {{ o.name }}</a>
                            <span class="wgMono">{{ fmt(o.weightMg) }}</span>
                            <span class="wgInsightSave">saves {{ fmt(o.savesMg) }}</span>
                            <span v-if="o.share" class="wgMuted">in {{ o.share }}% of public lists</span>
                            <a :href="compareUrl(a, o)" class="wgLinkBtn" data-testid="alternative-compare">Compare</a>
                            <button type="button" class="wgLinkBtn" :disabled="wished(o.id)" data-testid="alternative-wish" @click="wish(o)">
                                {{ wished(o.id) ? 'On wishlist' : 'Add to wishlist' }}
                            </button>
                        </span>
                    </li>
                </ul>
            </template>

            <template v-if="favorites.length">
                <h3 class="wgInsightH">
                    What other hikers carry
                </h3>
                <ul class="wgInsightRows" data-testid="insights-favorites">
                    <li v-for="f in favorites" :key="f.id">
                        <span class="wgInsightOption">
                            <span class="wgMuted">{{ f.category }}:</span>
                            <a :href="`/g/${f.id}`" target="_blank" rel="noopener">{{ f.brand }} {{ f.name }}</a>
                            <span class="wgMono">{{ fmt(f.weightMg) }}</span>
                            <span class="wgMuted">in {{ f.share }}% of public lists</span>
                            <button type="button" class="wgLinkBtn" :disabled="wished(f.id)" @click="wish(f)">
                                {{ wished(f.id) ? 'On wishlist' : 'Add to wishlist' }}
                            </button>
                        </span>
                    </li>
                </ul>
            </template>
            <p v-if="loaded && !alternatives.length && !favorites.length" class="wgMuted wgTripFine">
                No lighter options in the catalog for this list yet. Gear picked from the catalog gets the best matches.
            </p>
        </div>
    </section>
</template>

<script>
import { checkEssentials, listRows, readinessLabel } from '../utils/insights.js';
import { TRIP_TYPE_LABELS } from '../utils/gear-meta.js';
import { formatWeightMg, api } from '../utils/format.js';

export default {
    name: 'GearInsights',
    props: {
        list: { type: Object, required: true },
    },
    data() {
        return { open: false, loaded: false, alternatives: [], favorites: [], timer: null };
    },
    computed: {
        library() {
            return this.$store.state.library;
        },
        unit() {
            return ['g', 'kg'].includes(this.library.totalUnit) ? 'kg' : 'lb';
        },
        rows() {
            return listRows(this.library, this.list);
        },
        check() {
            const trip = this.list.trip || {};
            return checkEssentials(this.rows, {
                tripType: this.list.tripType,
                tempLowC: trip.tempLowC,
                tempHighC: trip.tempHighC,
                dismissed: this.list.notNeeded,
            });
        },
        label() {
            return readinessLabel(this.check.score);
        },
        scoreClass() {
            const s = this.check.score;
            return s >= 90 ? 'wgScoreGood' : s >= 70 ? 'wgScoreOk' : 'wgScoreLow';
        },
        tripLabel() {
            return (TRIP_TYPE_LABELS[this.list.tripType] || 'this trip').toLowerCase();
        },
        // What the server needs: names, categories, weights and catalog links.
        signature() {
            return JSON.stringify(this.rows.map((r) => [r.itemId, r.name, r.category, r.weightMg, r.catalogId]));
        },
    },
    watch: {
        signature() {
            if (!this.open) return;
            clearTimeout(this.timer);
            this.timer = setTimeout(() => this.fetch(), 800);
        },
    },
    beforeUnmount() {
        clearTimeout(this.timer);
    },
    methods: {
        fmt(mg) {
            return formatWeightMg(mg, this.unit);
        },
        toggle() {
            this.open = !this.open;
            if (this.open) this.fetch();
        },
        async fetch() {
            try {
                const body = { items: this.rows.map(({ itemId, name, description, category, weightMg, catalogId }) => ({ itemId, name, description, category, weightMg, catalogId })) };
                const res = await api('/api/insights', { method: 'POST', body: JSON.stringify(body) });
                this.alternatives = res.alternatives;
                this.favorites = res.favorites;
            } catch {
                // Offline or catalog unavailable: the essentials check still works.
            } finally {
                this.loaded = true;
            }
        },
        dismiss(id) {
            this.$store.commit('setListNotNeeded', { list: this.list, notNeeded: [...(this.list.notNeeded || []), id] });
        },
        undismiss(id) {
            this.$store.commit('setListNotNeeded', { list: this.list, notNeeded: (this.list.notNeeded || []).filter((x) => x !== id) });
        },
        compareUrl(a, o) {
            const mine = this.rows.find((r) => r.itemId === a.item.itemId);
            const ids = [mine && mine.catalogId, ...a.options.map((x) => x.id)].filter(Boolean);
            return `/compare?ids=${[...new Set([...ids, o.id])].join(',')}`;
        },
        wished(catalogId) {
            return this.library.items.some((i) => i.catalogId === catalogId && i.wishlist);
        },
        async wish(option) {
            const { items } = await api(`/api/catalog?ids=${encodeURIComponent(option.id)}`);
            if (items && items[0]) this.$store.commit('addWishlistItem', { entry: items[0] });
        },
    },
};
</script>

<style lang="scss">
.wgInsightBadge {
    border-radius: 999px;
    color: #fff;
    display: inline-block;
    font-size: 12px;
    font-weight: 700;
    margin-right: 4px;
    min-width: 28px;
    padding: 1px 7px;
    text-align: center;
}

.wgScoreGood {
    background: #2F7D4F;
}

.wgScoreOk {
    background: #B7791F;
}

.wgScoreLow {
    background: #B3261E;
}

.wgInsightScore {
    margin-bottom: 8px;

    p {
        margin: 6px 0 0;
    }
}

.wgInsightMeter {
    background: var(--lp-surface-sunken);
    border-radius: 999px;
    height: 10px;
    overflow: hidden;

    span {
        display: block;
        height: 100%;
    }
}

.wgInsightWarn {
    background: #FCE8E6;
    border-radius: 8px;
    color: #8A1C14;
    font-size: 14px;
    padding: 6px 10px;
}

.wgInsights .wgInsightNote {
    margin: 6px 0 0;
}

.wgInsights .wgInsightH {
    margin-top: 22px;
}

.wgInsightH {
    font-size: 14px;
    letter-spacing: 0.04em;
    margin: 18px 0 6px;
    text-transform: uppercase;
}

.wgInsightChips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    list-style: none;
    margin: 0;
    padding: 0;

    li {
        align-items: center;
        border-radius: 999px;
        display: inline-flex;
        font-size: 13px;
        gap: 6px;
        padding: 3px 10px;
    }
}

.wgInsightMissing {
    background: #FCEFD9;
    color: #5A3B06;
}

.wgInsightCritical {
    background: #FCE8E6;
    color: #8A1C14;
    font-weight: 650;
}

.wgInsightCovered {
    background: var(--lp-surface-sunken);
    color: var(--lp-text-secondary);
}

.wgInsightSkipped {
    border: 1px dashed var(--lp-border);
    color: var(--lp-text-secondary);
}

.wgLinkBtn {
    background: none;
    border: 0;
    color: var(--lp-link-blue);
    cursor: pointer;
    font: inherit;
    font-size: 12px;
    padding: 0;
    text-decoration: underline;

    &:disabled {
        color: var(--lp-text-secondary);
        cursor: default;
        text-decoration: none;
    }
}

.wgInsightRows {
    list-style: none;
    margin: 0;
    padding: 0;

    li {
        border-top: 1px solid var(--lp-border);
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 8px 0;
    }
}

.wgInsightFrom {
    font-weight: 650;
}

.wgInsightOption {
    align-items: baseline;
    display: flex;
    flex-wrap: wrap;
    font-size: 14px;
    gap: 4px 10px;
}

.wgInsightSave {
    color: #2F7D4F;
    font-weight: 650;
}
</style>
