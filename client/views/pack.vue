<template>
    <div v-if="isLoaded" class="wgPack">
        <header class="wgPackBar">
            <router-link to="/" class="wgIconBtn wgPackBack" aria-label="Back to editing">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>
            </router-link>
            <label class="wgPackListPick">
                <span class="wgVisuallyHidden">List to pack</span>
                <select :value="library.defaultListId" class="wgSelect" data-testid="pack-list" @change="pickList($event.target.value)">
                    <option v-for="l in library.lists" :key="l.id" :value="l.id">{{ l.name || 'New list' }}</option>
                </select>
            </label>
        </header>
        <offlineBanner />

        <main class="wgPackMain">
            <section class="wgPackProgress" aria-live="polite">
                <p class="wgPackCount" data-testid="pack-progress">
                    <strong>{{ packedCount }}</strong> of {{ totalCount }} packed
                </p>
                <p class="wgMuted wgMono">
                    {{ fmt(packedWeight) }} / {{ fmt(totalWeight) }}
                </p>
                <div class="wgPackMeter" role="progressbar" :aria-valuenow="packedCount" aria-valuemin="0" :aria-valuemax="totalCount" aria-label="Packed">
                    <span :style="{ width: totalCount ? `${(packedCount / totalCount) * 100}%` : '0%' }" />
                </div>
                <div class="wgPackTools">
                    <button type="button" class="wgChip" :aria-pressed="String(hidePacked)" data-testid="pack-hide" @click="hidePacked = !hidePacked">
                        Hide packed
                    </button>
                    <button type="button" class="wgBtn wgBtnGhost wgBtnSmall" :disabled="!packedCount" data-testid="pack-reset" @click="reset">
                        Start over
                    </button>
                </div>
                <p v-if="totalCount && packedCount === totalCount" class="wgPackDone" data-testid="pack-done">
                    Everything's packed. Have a good trip.
                </p>
            </section>

            <section v-for="group in groups" :key="group.category.id" class="wgPackGroup">
                <h2 class="wgPackGroupTitle">
                    <span>{{ group.category.name || 'Untitled category' }}</span>
                    <span class="wgMuted">{{ group.packed }}/{{ group.rows.length }}</span>
                </h2>
                <ul class="wgPackRows">
                    <li v-for="row in group.visible" :key="row.item.id">
                        <!-- A real checkbox inside a big label: tap anywhere on the
                             row, or swipe it right, to check it off. -->
                        <label
                            class="wgPackRow"
                            :class="{ wgPacked: row.packed }"
                            :style="row.item.id === swipeId ? { transform: `translateX(${swipeX}px)` } : null"
                            data-testid="pack-row"
                            @pointerdown="swipeStart($event, row)"
                            @pointermove="swipeMove($event)"
                            @pointerup="swipeEnd($event, group.category, row)"
                            @pointercancel="swipeCancel"
                        >
                            <input
                                type="checkbox"
                                class="wgPackCheck"
                                :checked="row.packed"
                                :aria-label="`Packed: ${row.item.name || 'unnamed item'}`"
                                @change="toggle(group.category, row, $event.target.checked)"
                                @click="onCheckboxClick"
                            >
                            <span class="wgPackName">
                                {{ row.item.name || 'Unnamed item' }}
                                <span v-if="row.categoryItem.worn" class="wgPackTag">Worn</span>
                                <span v-if="row.categoryItem.consumable" class="wgPackTag">Consumable</span>
                            </span>
                            <span v-if="row.categoryItem.qty !== 1" class="wgPackQty wgMono">×{{ row.categoryItem.qty }}</span>
                            <span class="wgPackWeight wgMono">{{ itemWeight(row) }}</span>
                        </label>
                    </li>
                </ul>
            </section>

            <p v-if="!totalCount" class="wgEmpty">
                This list has no gear yet. <router-link to="/">
                    Add some
                </router-link>, then come back to pack.
            </p>
        </main>
        <globalAlerts />
    </div>
</template>

<script>
import globalAlerts from '../components/global-alerts.vue';
import offlineBanner from '../components/offline-banner.vue';
import { formatWeightMg } from '../utils/format.js';
import weightUtils from '../utils/weight.js';
import { isPlaceholder } from '../utils/closet.js';

const SWIPE_DISTANCE = 64;

export default {
    name: 'Pack',
    components: { globalAlerts, offlineBanner },
    data() {
        return {
            isLoaded: false,
            hidePacked: false,
            swipeId: null,
            swipeStartX: 0,
            swipeX: 0,
            swiped: false,
        };
    },
    computed: {
        library() {
            return this.$store.state.library;
        },
        list() {
            return this.library.getListById(this.library.defaultListId);
        },
        unit() {
            return ['g', 'kg'].includes(this.library.totalUnit) ? 'kg' : 'lb';
        },
        groups() {
            return this.list.categoryIds
                .map((id) => this.library.getCategoryById(id))
                .filter(Boolean)
                .map((category) => {
                    const rows = category.categoryItems
                        .map((categoryItem) => ({ categoryItem, item: this.library.getItemById(categoryItem.itemId), packed: Boolean(categoryItem.packed) }))
                        .filter((row) => row.item && !isPlaceholder(row.item));
                    return {
                        category,
                        rows,
                        visible: this.hidePacked ? rows.filter((r) => !r.packed) : rows,
                        packed: rows.filter((r) => r.packed).length,
                    };
                })
                .filter((g) => g.rows.length);
        },
        allRows() {
            return this.groups.flatMap((g) => g.rows);
        },
        totalCount() {
            return this.allRows.length;
        },
        packedCount() {
            return this.allRows.filter((r) => r.packed).length;
        },
        totalWeight() {
            return this.allRows.reduce((sum, r) => sum + r.item.weight * r.categoryItem.qty, 0);
        },
        packedWeight() {
            return this.allRows.filter((r) => r.packed).reduce((sum, r) => sum + r.item.weight * r.categoryItem.qty, 0);
        },
    },
    beforeMount() {
        if (!this.$store.state.library) {
            this.$router.push('/welcome');
        } else {
            this.isLoaded = true;
            document.title = `Pack: ${this.list.name || 'list'} — Waymark Gear`;
        }
    },
    methods: {
        fmt(mg) {
            return formatWeightMg(mg, this.unit);
        },
        itemWeight(row) {
            const unit = row.item.authorUnit;
            return `${weightUtils.MgToDisplayWeight(row.item.weight, unit)} ${unit}`;
        },
        pickList(id) {
            this.$store.commit('setDefaultList', this.library.getListById(Number(id)));
        },
        toggle(category, row, packed) {
            this.$store.commit('setItemPacked', { category, itemId: row.item.id, packed });
        },
        reset() {
            this.$store.commit('resetPacked', this.list);
            this.hidePacked = false;
        },
        // Swipe right on a row to check it off (or swipe a packed row to
        // uncheck). A short tap still works through the label/checkbox.
        swipeStart(evt, row) {
            if (evt.pointerType === 'mouse') return;
            this.swipeId = row.item.id;
            this.swipeStartX = evt.clientX;
            this.swipeX = 0;
            this.swiped = false;
        },
        swipeMove(evt) {
            if (this.swipeId === null) return;
            this.swipeX = Math.max(0, Math.min(evt.clientX - this.swipeStartX, 120));
        },
        swipeEnd(evt, category, row) {
            if (this.swipeId === null) return;
            if (this.swipeX >= SWIPE_DISTANCE) {
                this.swiped = true;
                this.toggle(category, row, !row.packed);
            }
            this.swipeCancel();
        },
        swipeCancel() {
            this.swipeId = null;
            this.swipeX = 0;
        },
        // A completed swipe shouldn't also count as a tap on the checkbox.
        onCheckboxClick(evt) {
            if (this.swiped) {
                evt.preventDefault();
                this.swiped = false;
            }
        },
    },
};
</script>

<style lang="scss">
@import "../css/_globals";

.wgPack {
    background: var(--lp-bg);
    min-height: 100vh;
}

.wgPackBar {
    align-items: center;
    background: var(--lp-surface);
    border-bottom: 1px solid var(--lp-border);
    display: flex;
    gap: 8px;
    padding: 8px 12px;
    position: sticky;
    top: 0;
    z-index: $mobileHeader;
}

.wgPackListPick {
    flex: 1 1 auto;
    min-width: 0;

    .wgSelect {
        font-family: $font-display;
        font-size: 18px;
        font-stretch: 110%;
        font-weight: 750;
    }
}

.wgPackMain {
    margin: 0 auto;
    max-width: 640px;
    padding: 16px 12px 80px;
}

.wgPackProgress {
    background: var(--lp-surface);
    border: 1px solid var(--lp-border);
    border-radius: $radius-lg;
    margin-bottom: 18px;
    padding: 16px;

    p {
        margin: 0;
    }
}

.wgPackCount {
    font-size: 20px;

    strong {
        font-family: $font-display;
        font-size: 28px;
    }
}

.wgPackMeter {
    background: var(--lp-surface-sunken);
    border-radius: 999px;
    height: 10px;
    margin: 12px 0;
    overflow: hidden;

    span {
        background: var(--lp-primary);
        border-radius: 999px;
        display: block;
        height: 100%;
        transition: width 0.2s;
    }
}

.wgPackTools {
    align-items: center;
    display: flex;
    gap: 8px;
    justify-content: space-between;
}

.wgPackDone {
    background: var(--lp-active-bg);
    border-radius: 10px;
    font-weight: 600;
    margin-top: 12px !important;
    padding: 10px 12px;
}

.wgPackGroup {
    margin-bottom: 18px;
}

.lp .wgPackGroupTitle {
    align-items: baseline;
    display: flex;
    font-family: $font-body;
    font-size: 15px;
    font-stretch: 100%;
    font-weight: 700;
    justify-content: space-between;
    letter-spacing: 0.02em;
    margin: 0 4px 8px;
    text-transform: uppercase;

    .wgMuted {
        font-size: 13px;
    }
}

.wgPackRows {
    background: var(--lp-surface);
    border: 1px solid var(--lp-border);
    border-radius: $radius-lg;
    list-style: none;
    margin: 0;
    overflow: hidden;
    padding: 0;

    li + li {
        border-top: 1px solid var(--lp-border);
    }
}

.wgPackRow {
    align-items: center;
    background: var(--lp-surface);
    cursor: pointer;
    display: flex;
    gap: 14px;
    min-height: 60px;
    padding: 10px 16px;
    touch-action: pan-y;
    transition: background-color 0.15s;
    user-select: none;

    &.wgPacked {
        background: var(--lp-surface-sunken);

        .wgPackName {
            color: var(--lp-text-secondary);
            text-decoration: line-through;
        }
    }
}

.wgPackCheck {
    accent-color: var(--lp-primary);
    flex: none;
    height: 26px;
    width: 26px;
}

.wgPackName {
    flex: 1 1 auto;
    font-size: 17px;
    min-width: 0;
}

.wgPackTag {
    background: var(--lp-surface-sunken);
    border-radius: 6px;
    color: var(--lp-text-secondary);
    font-size: 11px;
    font-weight: 700;
    margin-left: 6px;
    padding: 2px 6px;
    text-decoration: none;
    vertical-align: middle;
}

.wgPackQty {
    color: var(--lp-text-secondary);
    flex: none;
    font-size: 15px;
}

.wgPackWeight {
    color: var(--lp-text-secondary);
    flex: none;
    font-size: 14px;
}
</style>
