<template>
    <div class="wgTrailTag" data-testid="trail-tag">
        <span class="wgTripTypeLabel">Trail</span>
        <template v-if="trail">
            <a v-if="trail.slug" :href="`/trails/${trail.slug}`" class="wgTrailTagName" data-testid="trail-tag-link">{{ trail.name }}</a>
            <span v-else class="wgTrailTagName" title="Not in our trail list yet; we'll add it once a few hikers use it" data-testid="trail-tag-name">{{ trail.name }}</span>
            <select :value="trail.year || ''" class="wgSelect wgTrailTagSelect" aria-label="Year" data-testid="trail-tag-year" @change="set({ year: Number($event.target.value) || undefined })">
                <option value="">
                    Year
                </option>
                <option v-for="y in years" :key="y" :value="y">
                    {{ y }}
                </option>
            </select>
            <select :value="trail.direction || ''" class="wgSelect wgTrailTagSelect" aria-label="Direction" data-testid="trail-tag-direction" @change="set({ direction: $event.target.value || undefined })">
                <option value="">
                    Direction
                </option>
                <option v-for="(label, id) in directions" :key="id" :value="id">
                    {{ label }}
                </option>
            </select>
            <button type="button" class="wgLinkBtn" data-testid="trail-tag-clear" @click="clear">
                Remove
            </button>
        </template>
        <template v-else>
            <div class="wgTrailTagSearch">
                <input
                    v-model="query"
                    class="wgInput"
                    placeholder="Which trail? e.g. PCT"
                    aria-label="Trail"
                    autocomplete="off"
                    role="combobox"
                    :aria-expanded="String(open)"
                    aria-controls="wgTrailTagResults"
                    data-testid="trail-tag-input"
                    @input="search"
                    @keydown.down.prevent="move(1)"
                    @keydown.up.prevent="move(-1)"
                    @keydown.enter.prevent="choose(results[active] || null)"
                    @keydown.esc="open = false"
                    @blur="later"
                >
                <ul v-if="open" id="wgTrailTagResults" class="wgTrailTagResults" role="listbox">
                    <li
                        v-for="(t, i) in results"
                        :key="t.id"
                        role="option"
                        :aria-selected="String(i === active)"
                        data-testid="trail-tag-option"
                        @mousedown.prevent="choose(t)"
                    >
                        <b>{{ t.name }}</b> <span class="wgMuted">{{ t.region }}</span>
                    </li>
                    <li v-if="query.trim()" class="wgTrailTagOwn" role="option" :aria-selected="String(active === results.length)" data-testid="trail-tag-own" @mousedown.prevent="choose(null)">
                        Use “{{ query.trim() }}”
                    </li>
                </ul>
            </div>
            <button v-if="suggested" type="button" class="wgChip" data-testid="trail-tag-suggest" @click="choose(suggested)">
                Tag as {{ suggested.short || suggested.name }}?
            </button>
        </template>
    </div>
</template>

<script>
import { DIRECTIONS } from '../utils/trails.js';

export default {
    name: 'TrailTag',
    props: {
        list: { type: Object, required: true },
    },
    data() {
        return { query: '', results: [], open: false, active: -1, suggested: null, timer: null };
    },
    computed: {
        trail() {
            return this.list.trail && this.list.trail.name ? this.list.trail : null;
        },
        directions() {
            return DIRECTIONS;
        },
        years() {
            const now = new Date().getFullYear();
            return Array.from({ length: 12 }, (_, i) => now + 1 - i);
        },
    },
    watch: {
        'list.name': {
            immediate: true,
            handler() {
                this.suggest();
            },
        },
    },
    beforeUnmount() {
        clearTimeout(this.timer);
    },
    methods: {
        // "PCT 2025" -> suggest the PCT (and the year).
        async suggest() {
            this.suggested = null;
            if (this.trail || !this.list.name) return;
            try {
                const r = await fetch(`/api/trails/match?name=${encodeURIComponent(this.list.name)}`);
                const { trail } = await r.json();
                if (trail && !this.trail) this.suggested = trail;
            } catch {
                // Offline: no suggestion.
            }
        },
        search() {
            clearTimeout(this.timer);
            this.timer = setTimeout(async () => {
                try {
                    const r = await fetch(`/api/trails/search?limit=8&q=${encodeURIComponent(this.query)}`);
                    this.results = (await r.json()).trails || [];
                } catch {
                    this.results = [];
                }
                this.active = this.results.length ? 0 : -1;
                this.open = Boolean(this.query.trim());
            }, 150);
        },
        move(d) {
            if (!this.open) return;
            this.active = Math.max(0, Math.min(this.results.length, this.active + d));
        },
        later() {
            setTimeout(() => { this.open = false; }, 150);
        },
        choose(t) {
            const name = t ? t.name : this.query.trim();
            if (!name) return;
            const year = Number((this.list.name.match(/\b(19|20)\d{2}\b/) || [])[0]) || undefined;
            const trail = { name, year };
            if (t) Object.assign(trail, { id: t.id, slug: t.slug, short: t.short });
            this.$store.commit('setListTrail', { list: this.list, trail });
            this.query = '';
            this.open = false;
            this.suggested = null;
        },
        set(patch) {
            const next = { ...this.trail, ...patch };
            for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
            this.$store.commit('setListTrail', { list: this.list, trail: next });
        },
        clear() {
            this.$store.commit('setListTrail', { list: this.list, trail: null });
            this.suggest();
        },
    },
};
</script>

<style lang="scss">
.wgTrailTag {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 6px 8px;
    margin: -6px 0 14px;
}

.wgTrailTagName {
    font-weight: 650;
}

.wgTrailTag .wgSelect.wgTrailTagSelect {
    flex: none;
    min-height: 34px;
    padding: 4px 8px;
    width: auto;
}

.wgTrailTagSearch {
    flex: 0 1 280px;
    position: relative;

    .wgInput {
        min-height: 36px;
        padding: 6px 10px;
    }
}

.wgTrailTagResults {
    background: var(--lp-surface);
    border: 1px solid var(--lp-border);
    border-radius: 10px;
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.14);
    left: 0;
    list-style: none;
    margin: 4px 0 0;
    max-height: 300px;
    min-width: 280px;
    overflow-y: auto;
    padding: 4px;
    position: absolute;
    top: 100%;
    z-index: 40;

    li {
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        padding: 7px 9px;

        &[aria-selected="true"],
        &:hover {
            background: var(--lp-row-hover);
        }
    }
}

.wgTrailTagOwn {
    border-top: 1px solid var(--lp-border);
    color: var(--lp-text-secondary);
}
</style>
