<template>
    <section class="wgTrip wgCard" :class="{ wgTripOpen: open }" aria-labelledby="wgTripTitle" data-testid="trip-planner">
        <h2 id="wgTripTitle" class="wgTripHeading">
            <button type="button" class="wgTripToggle" :aria-expanded="String(open)" data-testid="trip-toggle" @click="open = !open">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
                Trip planner
                <span v-if="!open && hasTrip" class="wgTripSummary wgMuted">
                    {{ trip.days }} {{ trip.days === 1 ? 'day' : 'days' }} · Day 1 <span class="wgMono">{{ fmt(days[0].packMg) }}</span>
                </span>
                <span v-else-if="!open" class="wgTripSummary wgMuted">Food and water by day</span>
            </button>
        </h2>

        <div v-if="open" class="wgTripBody">
            <p class="wgMuted wgTripIntro">
                Add food and water for the trip to see what your pack weighs each day. Your base weight doesn't change.
            </p>
            <div class="wgTripInputs">
                <label class="wgField">Days
                    <input :value="trip.days" class="wgInput" type="number" min="1" max="365" step="1" inputmode="numeric" data-testid="trip-days" @input="set('days', Number($event.target.value))">
                </label>
                <label class="wgField">Food per day
                    <span class="wgTripUnitField">
                        <input :value="foodPerDayDisplay" class="wgInput" type="number" min="0" step="0.1" inputmode="decimal" data-testid="trip-food" @input="setFood($event.target.value)">
                        <span class="wgMuted">{{ unit }}</span>
                    </span>
                </label>
                <label class="wgField">Water carried
                    <span class="wgTripUnitField">
                        <input :value="trip.waterLiters" class="wgInput" type="number" min="0" max="30" step="0.25" inputmode="decimal" data-testid="trip-water" @input="set('waterLiters', Number($event.target.value))">
                        <span class="wgMuted">L</span>
                    </span>
                </label>
            </div>

            <div class="wgTripStats">
                <div>
                    <p class="wgTripLabel">
                        Base weight
                    </p>
                    <p class="wgMono wgTripValue">
                        {{ fmt(list.totalBaseWeight) }}
                    </p>
                </div>
                <div>
                    <p class="wgTripLabel">
                        Day 1 pack
                    </p>
                    <p class="wgMono wgTripValue wgTripStrong" data-testid="trip-day1">
                        {{ fmt(days[0].packMg) }}
                    </p>
                </div>
                <div v-if="days.length > 1">
                    <p class="wgTripLabel">
                        Day {{ days.length }} pack
                    </p>
                    <p class="wgMono wgTripValue" data-testid="trip-last">
                        {{ fmt(days[days.length - 1].packMg) }}
                    </p>
                </div>
                <div>
                    <p class="wgTripLabel">
                        Day 1 skin-out
                    </p>
                    <p class="wgMono wgTripValue">
                        {{ fmt(days[0].skinOutMg) }}
                    </p>
                </div>
            </div>

            <ol class="wgTripDays" aria-label="Pack weight by day">
                <li v-for="d in shownDays" :key="d.day">
                    <span class="wgTripDay">Day {{ d.day }}</span>
                    <span class="wgTripBar" aria-hidden="true">
                        <span class="wgTripBase" :style="{ width: pct(baseAndListed) }" />
                        <span class="wgTripFood" :style="{ width: pct(d.foodMg) }" />
                        <span class="wgTripWater" :style="{ width: pct(d.waterMg) }" />
                    </span>
                    <span class="wgMono wgTripDayValue">{{ fmt(d.packMg) }}</span>
                </li>
            </ol>
            <p v-if="days.length > shownDays.length" class="wgMuted wgTripMore">
                …through Day {{ days.length }}.
            </p>
            <p class="wgTripLegend wgMuted">
                <span><i class="wgTripBase" />Gear + listed consumables</span>
                <span><i class="wgTripFood" />Food</span>
                <span><i class="wgTripWater" />Water</span>
            </p>
            <button v-if="hasTrip" type="button" class="wgBtn wgBtnGhost wgBtnSmall" data-testid="trip-clear" @click="clear">
                Clear trip
            </button>
        </div>
    </section>
</template>

<script>
import { tripDays, normalizeTrip } from '../utils/trip.js';
import { formatWeightMg } from '../utils/format.js';
import weightUtils from '../utils/weight.js';

const MAX_ROWS = 14;

export default {
    name: 'TripPlanner',
    props: {
        list: { type: Object, required: true },
    },
    data() {
        return { open: false };
    },
    computed: {
        library() {
            return this.$store.state.library;
        },
        hasTrip() {
            return Boolean(this.list.trip);
        },
        trip() {
            return normalizeTrip(this.list.trip);
        },
        // Pounds for oz/lb people, kilograms for g/kg people.
        unit() {
            return ['g', 'kg'].includes(this.library.totalUnit) ? 'kg' : 'lb';
        },
        foodPerDayDisplay() {
            return Math.round(weightUtils.MgToWeight(this.trip.foodPerDayMg, this.unit) * 100) / 100;
        },
        days() {
            // Recomputed whenever the list's totals change.
            return tripDays({
                totalBaseWeight: this.list.totalBaseWeight,
                totalConsumableWeight: this.list.totalConsumableWeight,
                totalWornWeight: this.list.totalWornWeight,
            }, this.trip);
        },
        shownDays() {
            return this.days.slice(0, MAX_ROWS);
        },
        baseAndListed() {
            return (this.list.totalBaseWeight || 0) + (this.list.totalConsumableWeight || 0);
        },
        scale() {
            return this.days.length ? this.days[0].packMg || 1 : 1;
        },
    },
    methods: {
        fmt(mg) {
            return formatWeightMg(mg, this.unit);
        },
        pct(mg) {
            return `${Math.max(0, (mg / this.scale) * 100)}%`;
        },
        set(key, value) {
            if (!Number.isFinite(value)) return;
            this.$store.commit('setListTrip', { list: this.list, trip: normalizeTrip({ ...this.trip, [key]: value }) });
        },
        setFood(value) {
            const n = Number(value);
            if (!Number.isFinite(n)) return;
            this.set('foodPerDayMg', weightUtils.WeightToMg(n, this.unit));
        },
        clear() {
            this.$store.commit('setListTrip', { list: this.list, trip: null });
        },
    },
};
</script>

<style lang="scss">
@import "../css/_globals";

.wgTrip {
    margin: 0 0 16px;
}

.lp .wgTripHeading {
    font-family: $font-body;
    font-size: 16px;
    font-stretch: 100%;
    margin: 0;
}

.wgTripToggle {
    align-items: center;
    background: transparent;
    border: 0;
    color: var(--lp-text);
    cursor: pointer;
    display: flex;
    flex-wrap: wrap;
    font-family: $font-body;
    font-size: 16px;
    font-weight: 650;
    gap: 10px;
    min-height: 52px;
    padding: 10px 16px;
    text-align: left;
    width: 100%;

    svg {
        flex: none;
        transition: transform 0.15s;

        .wgTripOpen & {
            transform: rotate(90deg);
        }
    }
}

.wgTripSummary {
    font-size: 14px;
    font-weight: 400;
    margin-left: auto;
}

.wgTripBody {
    border-top: 1px solid var(--lp-border);
    padding: 14px 16px 16px;
}

.wgTripIntro {
    font-size: 14px;
    margin: 0 0 12px;
}

.wgTripInputs {
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
}

.wgTripUnitField {
    align-items: center;
    display: flex;
    gap: 8px;

    .wgMuted {
        font-size: 14px;
        min-width: 18px;
    }
}

.wgTripStats {
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    margin: 18px 0 10px;

    p {
        margin: 0;
    }
}

.wgTripLabel {
    color: var(--lp-text-secondary);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
}

.wgTripValue {
    font-size: 20px;
    margin-top: 2px !important;
}

.wgTripStrong {
    font-weight: 700;
}

.wgTripDays {
    display: flex;
    flex-direction: column;
    gap: 6px;
    list-style: none;
    margin: 8px 0 0;
    padding: 0;

    li {
        align-items: center;
        display: grid;
        gap: 10px;
        grid-template-columns: 52px minmax(0, 1fr) 76px;
    }
}

.wgTripDay {
    color: var(--lp-text-secondary);
    font-size: 13px;
}

.wgTripBar {
    background: var(--lp-surface-sunken);
    border-radius: 999px;
    display: flex;
    height: 10px;
    overflow: hidden;
}

.wgTripBase {
    background: #1D3B30;
}

.wgTripFood {
    background: #C4571F;
}

.wgTripWater {
    background: #3E6A8A;
}

.wgTripDayValue {
    font-size: 13px;
    text-align: right;
}

.wgTripMore {
    font-size: 13px;
    margin: 6px 0 0;
}

.wgTripLegend {
    display: flex;
    flex-wrap: wrap;
    font-size: 13px;
    gap: 14px;
    margin: 12px 0 6px;

    i {
        border-radius: 3px;
        display: inline-block;
        height: 10px;
        margin-right: 6px;
        width: 10px;
    }
}
</style>
