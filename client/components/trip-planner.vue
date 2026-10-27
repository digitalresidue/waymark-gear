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

            <details class="wgTripDetails" :open="hasDetails" data-testid="trip-details">
                <summary>Trip details and calorie estimate</summary>
                <div class="wgTripInputs">
                    <label class="wgField">Distance
                        <span class="wgTripUnitField">
                            <input :value="show('distanceKm', km2u)" class="wgInput" type="number" min="0" step="0.1" inputmode="decimal" data-testid="trip-distance" @input="setDetail('distanceKm', $event.target.value, u2km)">
                            <span class="wgMuted">{{ imperial ? 'mi' : 'km' }}</span>
                        </span>
                    </label>
                    <label class="wgField">Elevation gain
                        <span class="wgTripUnitField">
                            <input :value="show('elevationM', m2u, 0)" class="wgInput" type="number" min="0" step="10" inputmode="numeric" data-testid="trip-elevation" @input="setDetail('elevationM', $event.target.value, u2m)">
                            <span class="wgMuted">{{ imperial ? 'ft' : 'm' }}</span>
                        </span>
                    </label>
                    <label class="wgField">Terrain
                        <select :value="trip.terrain || ''" class="wgSelect" data-testid="trip-terrain" @change="setDetail('terrain', $event.target.value)">
                            <option value="">—</option>
                            <option v-for="(label, id) in terrains" :key="id" :value="id">{{ label }}</option>
                        </select>
                    </label>
                    <label class="wgField">Low / high
                        <span class="wgTripUnitField">
                            <input :value="show('tempLowC', c2u, 0)" class="wgInput" type="number" step="1" inputmode="numeric" aria-label="Expected low" data-testid="trip-low" @input="setDetail('tempLowC', $event.target.value, u2c)">
                            <input :value="show('tempHighC', c2u, 0)" class="wgInput" type="number" step="1" inputmode="numeric" aria-label="Expected high" data-testid="trip-high" @input="setDetail('tempHighC', $event.target.value, u2c)">
                            <span class="wgMuted">°{{ imperial ? 'F' : 'C' }}</span>
                        </span>
                    </label>
                    <label class="wgField">Your weight
                        <span class="wgTripUnitField">
                            <input :value="show('bodyKg', kg2u, 0)" class="wgInput" type="number" min="0" step="1" inputmode="numeric" data-testid="trip-body" @input="setDetail('bodyKg', $event.target.value, u2kg)">
                            <span class="wgMuted">{{ imperial ? 'lb' : 'kg' }}</span>
                        </span>
                    </label>
                    <label class="wgField">Food density
                        <span class="wgTripUnitField">
                            <input :value="trip.kcalPerOz || ''" class="wgInput" type="number" min="60" max="200" step="5" placeholder="125" inputmode="numeric" data-testid="trip-density" @input="setDetail('kcalPerOz', $event.target.value)">
                            <span class="wgMuted">kcal/oz</span>
                        </span>
                    </label>
                </div>
                <div v-if="estimate" class="wgTripEstimate" data-testid="trip-estimate">
                    <p>
                        About <strong data-testid="trip-kcal">{{ estimate.kcalPerDay.toLocaleString() }} kcal</strong> a day:
                        <strong class="wgMono">{{ fmt(estimate.foodPerDayMg) }}</strong> of food at {{ estimate.kcalPerOz }} kcal/oz,
                        and roughly <strong>{{ estimate.waterLitersPerDay }} L</strong> of water to drink.
                    </p>
                    <p class="wgTripMacros" data-testid="trip-macros">
                        A day: <strong>{{ estimate.macros.carbs }} g</strong> carbs · <strong>{{ estimate.macros.fat }} g</strong> fat · <strong>{{ estimate.macros.protein }} g</strong> protein
                    </p>
                    <p class="wgTripMacros" data-testid="trip-totals">
                        Whole trip ({{ trip.days }} {{ trip.days === 1 ? 'day' : 'days' }}): <strong>{{ estimate.totals.kcal.toLocaleString() }} kcal</strong>,
                        <strong class="wgMono">{{ fmt(estimate.totals.foodMg) }}</strong> of food, about <strong>{{ estimate.totals.waterLiters }} L</strong> to drink
                    </p>
                    <button type="button" class="wgBtn wgBtnSmall wgBtnPrimary" :disabled="Math.abs(estimate.foodPerDayMg - trip.foodPerDayMg) < 1000" data-testid="trip-use-estimate" @click="set('foodPerDayMg', estimate.foodPerDayMg)">
                        Use this for food per day
                    </button>
                    <p class="wgMuted wgTripFine">
                        A planning estimate with a 10% margin: resting burn, walking with your pack, climbing and cold. Bodies differ; adjust from experience.
                    </p>
                </div>
                <p v-else class="wgMuted wgTripFine">
                    Add your weight (and the distance and climbing, if you know them) for a calorie and water estimate.
                </p>
            </details>

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
import { tripDays, normalizeTrip, tripEstimates, TERRAINS } from '../utils/trip.js';
import { formatWeightMg } from '../utils/format.js';
import weightUtils from '../utils/weight.js';

const MAX_ROWS = 14;

export default {
    name: 'TripPlanner',
    props: {
        list: { type: Object, required: true },
    },
    data() {
        return { open: false, terrains: TERRAINS };
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
        imperial() {
            return this.unit === 'lb';
        },
        hasDetails() {
            return ['distanceKm', 'elevationM', 'bodyKg', 'tempLowC', 'tempHighC'].some((k) => this.trip[k] !== undefined);
        },
        estimate() {
            return tripEstimates(this.trip, (this.list.totalBaseWeight || 0) + (this.list.totalConsumableWeight || 0));
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
        // Unit conversions for the details (stored metric).
        km2u(v) { return this.imperial ? v / 1.609344 : v; },
        u2km(v) { return this.imperial ? v * 1.609344 : v; },
        m2u(v) { return this.imperial ? v * 3.28084 : v; },
        u2m(v) { return this.imperial ? v / 3.28084 : v; },
        c2u(v) { return this.imperial ? v * 9 / 5 + 32 : v; },
        u2c(v) { return this.imperial ? (v - 32) * 5 / 9 : v; },
        kg2u(v) { return this.imperial ? v * 2.20462 : v; },
        u2kg(v) { return this.imperial ? v / 2.20462 : v; },
        // Whole numbers for fields entered as whole numbers, so a value
        // converted to metric and back reads the same as what was typed.
        show(key, toUnit, digits = 1) {
            const v = this.trip[key];
            const f = 10 ** digits;
            return v === undefined ? '' : Math.round(toUnit(v) * f) / f;
        },
        setDetail(key, raw, toMetric) {
            const next = { ...this.trip };
            if (raw === '' || raw === null) delete next[key];
            else if (key === 'terrain') next[key] = raw;
            else {
                const n = Number(raw);
                if (!Number.isFinite(n)) return;
                next[key] = toMetric ? toMetric(n) : n;
            }
            this.$store.commit('setListTrip', { list: this.list, trip: normalizeTrip(next) });
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

.wgTripMacros {
    font-size: 14px;
    margin: 0 0 6px;
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
.wgTripDetails {
    border: 1px solid var(--lp-border);
    border-radius: 12px;
    margin: 14px 0 0;
    padding: 10px 12px;

    summary {
        cursor: pointer;
        font-weight: 650;
    }

    .wgTripInputs {
        margin-top: 12px;
    }

    .wgTripUnitField .wgInput {
        min-width: 0;
    }
}

.wgTripEstimate {
    background: var(--lp-surface-sunken);
    border-radius: 10px;
    margin-top: 12px;
    padding: 10px 12px;

    p {
        margin: 0 0 8px;
    }
}

.wgTripFine {
    font-size: 12.5px;
    margin: 8px 0 0 !important;
}
</style>
