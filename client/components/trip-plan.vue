<template>
    <!-- Food and water for a trip, from your body stats (Your profile) and
         the trip's plan, with the linked list for the pack's weight
         (utils/energy.js). Saved with the trip. -->
    <section class="wgCard wgTripPlan" aria-labelledby="wgTripPlanTitle" data-testid="trip-plan">
        <h2 id="wgTripPlanTitle" class="wgEditorH">
            Food and water plan
        </h2>
        <p v-if="!body.kg" class="wgMuted wgTripFine" data-testid="trip-plan-no-body">
            Add your body stats in <router-link to="/profile#body-stats">
                Your profile
            </router-link> (weight, and height, age, sex and build if you like) for a calorie estimate.
        </p>
        <p v-else class="wgMuted wgTripFine" data-testid="trip-plan-body">
            Using your body stats: {{ bodySummary }}. <router-link to="/profile#body-stats">
                Edit
            </router-link>
        </p>

        <div class="wgTripInputs">
            <label class="wgField">Distance a day
                <span class="wgTripUnitField">
                    <input :value="shown('kmPerDay', (v) => (imperial ? v / KM_PER_MI : v), 1)" class="wgInput" type="number" min="0" step="0.5" inputmode="decimal" data-testid="plan-distance" @input="set('kmPerDay', $event.target.value, (v) => (imperial ? v * KM_PER_MI : v))">
                    <span class="wgMuted">{{ imperial ? 'mi' : 'km' }}</span>
                </span>
            </label>
            <label class="wgField">Climbing a day
                <span class="wgTripUnitField">
                    <input :value="shown('gainPerDayM', (v) => (imperial ? v / M_PER_FT : v), 0)" class="wgInput" type="number" min="0" step="50" inputmode="numeric" data-testid="plan-gain" @input="set('gainPerDayM', $event.target.value, (v) => (imperial ? v * M_PER_FT : v))">
                    <span class="wgMuted">{{ imperial ? 'ft' : 'm' }}</span>
                </span>
            </label>
            <label class="wgField">Terrain
                <select :value="plan.terrain || ''" class="wgSelect" data-testid="plan-terrain" @change="set('terrain', $event.target.value || null)">
                    <option value="">On trail</option>
                    <option v-for="(t, id) in terrainsShown" :key="id" :value="id">{{ t.label }}</option>
                </select>
            </label>
            <label class="wgField">Moving pace
                <span class="wgTripUnitField">
                    <input :value="shown('paceKmh', (v) => (imperial ? v / KM_PER_MI : v), 1)" class="wgInput" type="number" min="0.5" max="6" step="0.1" inputmode="decimal" :placeholder="imperial ? '2.2' : '3.5'" data-testid="plan-pace" @input="set('paceKmh', $event.target.value, (v) => (imperial ? v * KM_PER_MI : v))">
                    <span class="wgMuted">{{ imperial ? 'mph' : 'km/h' }}</span>
                </span>
            </label>
            <label class="wgField">Low / high
                <span class="wgTripUnitField">
                    <input :value="shown('lowC', c2u, 0)" class="wgInput" type="number" step="1" inputmode="numeric" aria-label="Expected low" data-testid="plan-low" @input="set('lowC', $event.target.value, u2c)">
                    <input :value="shown('highC', c2u, 0)" class="wgInput" type="number" step="1" inputmode="numeric" aria-label="Expected high" data-testid="plan-high" @input="set('highC', $event.target.value, u2c)">
                    <span class="wgMuted">°{{ imperial ? 'F' : 'C' }}</span>
                </span>
            </label>
            <label class="wgField">Food density
                <span class="wgTripUnitField">
                    <input :value="plan.kcalPerOz || ''" class="wgInput" type="number" min="60" max="200" step="5" placeholder="125" inputmode="numeric" data-testid="plan-density" @input="set('kcalPerOz', $event.target.value)">
                    <span class="wgMuted">kcal/oz</span>
                </span>
            </label>
            <label class="wgField wgTripWide">Days between town stops
                <input :value="stretchesText" class="wgInput" type="text" inputmode="decimal" placeholder="e.g. 4, 5, 3" data-testid="plan-stretches" @input="setStretches($event.target.value)">
                <span class="wgMuted wgTripFine">Days of food for each stretch, in order, separated by commas.</span>
            </label>
            <label class="wgField">Water sources every
                <span class="wgTripUnitField">
                    <input :value="shown('waterEveryKm', (v) => (imperial ? v / KM_PER_MI : v), 1)" class="wgInput" type="number" min="0" step="0.5" inputmode="decimal" data-testid="plan-water-every" @input="set('waterEveryKm', $event.target.value, (v) => (imperial ? v * KM_PER_MI : v))">
                    <span class="wgMuted">{{ imperial ? 'mi' : 'km' }}</span>
                </span>
            </label>
        </div>

        <div v-if="day" class="wgTripEstimate" data-testid="plan-estimate" aria-live="polite">
            <p>
                About <strong data-testid="plan-kcal">{{ day.kcal.toLocaleString() }} kcal</strong> a day:
                <strong class="wgMono" data-testid="plan-food-day">{{ small(foodPerDayMg) }}</strong> of food at {{ density }} kcal/oz,
                and about <strong data-testid="plan-water-day">{{ liters(day.waterLiters) }}</strong> of water to drink.
            </p>
            <p class="wgMuted wgTripFine" data-testid="plan-breakdown">
                {{ breakdown }}
            </p>
            <p v-if="carry" data-testid="plan-water-carry">
                Carry about <strong>{{ liters(carry) }}</strong> between water sources.
            </p>

            <table v-if="stretches.length" class="wgTripStretches" data-testid="plan-stretches-table">
                <caption class="wgVisuallyHidden">
                    Food and pack weight for each stretch between town stops
                </caption>
                <thead>
                    <tr>
                        <th scope="col">
                            Stretch
                        </th>
                        <th scope="col">
                            Days
                        </th>
                        <th scope="col">
                            Food
                        </th>
                        <th scope="col">
                            Pack leaving town
                        </th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="s in stretches" :key="s.stretch" :class="{ wgHeaviest: s.stretch === heaviest }" data-testid="plan-stretch">
                        <th scope="row">
                            {{ s.stretch }}<span v-if="s.stretch === heaviest" class="wgHeaviestTag">Heaviest</span>
                        </th>
                        <td>{{ s.days }}</td>
                        <td class="wgMono">
                            {{ big(s.foodMg) }} <span class="wgMuted">· {{ s.kcal.toLocaleString() }} kcal</span>
                        </td>
                        <td class="wgMono" data-testid="plan-stretch-pack">
                            {{ big(s.packMg) }}
                        </td>
                    </tr>
                </tbody>
            </table>
            <p v-if="!list" class="wgMuted wgTripFine">
                Link a pack list above to include its weight.
            </p>
            <p class="wgMuted wgTripFine">
                A planning estimate. Bodies and days differ a lot; adjust from experience.
            </p>
        </div>
    </section>
</template>

<script>
import { api, formatWeightMg } from '../utils/format.js';
import { currentUnits } from '../utils/i18n-app.js';
import { dayOnTrail, waterToCarry, resupplyStretches, parseStretches, TERRAINS, BUILDS, SEXES } from '../utils/energy.js';

const KM_PER_MI = 1.609344;
const M_PER_FT = 0.3048;
const LITERS_PER_GAL = 3.78541;

export default {
    name: 'TripPlan',
    props: {
        modelValue: { type: Object, default: () => ({}) },
        // The linked list: { totalBaseWeight, totalConsumableWeight } in mg.
        list: { type: Object, default: null },
    },
    emits: ['update:modelValue'],
    data() {
        return { body: {}, stretchesText: '', KM_PER_MI, M_PER_FT };
    },
    computed: {
        plan() {
            return this.modelValue || {};
        },
        imperial() {
            return currentUnits() !== 'metric';
        },
        terrainsShown() {
            return Object.fromEntries(Object.entries(TERRAINS).filter(([id]) => id !== 'trail'));
        },
        bodySummary() {
            const b = this.body;
            const parts = [this.imperial ? `${Math.round(b.kg / 0.45359237)} lb` : `${b.kg} kg`];
            if (b.heightCm) parts.push(this.imperial ? `${Math.floor(b.heightCm / 30.48)}′${Math.round((b.heightCm / 2.54) % 12)}″` : `${b.heightCm} cm`);
            if (b.age) parts.push(`${b.age}`);
            if (b.sex && b.sex !== 'unspecified') parts.push(SEXES[b.sex].toLowerCase());
            if (b.build) parts.push(`${BUILDS[b.build].label.toLowerCase()} build`);
            return parts.join(', ');
        },
        density() {
            return this.plan.kcalPerOz || 125;
        },
        listWeights() {
            return this.list ? (this.list.totalBaseWeight || 0) + (this.list.totalConsumableWeight || 0) : 0;
        },
        stretchDays() {
            return parseStretches(this.plan.stretches || []);
        },
        // On your back on an average day: the list, half the longest
        // stretch's food, and the water carried (or 2 L).
        packMg() {
            const longest = Math.max(0, ...this.stretchDays);
            const firstGuess = dayOnTrail(this.body, this.dayInput, this.listWeights / 1e6);
            const foodMg = firstGuess ? ((firstGuess.kcal / this.density) * 28349.5 * longest) / 2 : 0;
            const waterMg = (this.carryFor(firstGuess) || 2) * 1e6;
            return this.listWeights + foodMg + waterMg;
        },
        dayInput() {
            const p = this.plan;
            return { km: p.kmPerDay, gainM: p.gainPerDayM, terrain: p.terrain, paceKmh: p.paceKmh, lowC: p.lowC, highC: p.highC };
        },
        day() {
            return dayOnTrail(this.body, this.dayInput, this.packMg / 1e6);
        },
        foodPerDayMg() {
            return this.day ? Math.round((this.day.kcal / this.density) * 28349.5) : 0;
        },
        carry() {
            return this.carryFor(this.day);
        },
        breakdown() {
            const d = this.day;
            const grade = d.gradePct ? ` at about ${d.gradePct}% uphill grade` : '';
            return `Resting ${d.restingKcal.toLocaleString()} kcal a day (${d.restingMethod}), hiking ${d.hikingKcal.toLocaleString()} kcal over ${d.hikingHours} h${grade}, with ${this.big(this.packMg)} on your back, plus a 10% margin.`;
        },
        stretches() {
            if (!this.day) return [];
            const waterMg = (this.carry || 0) * 1e6;
            return resupplyStretches(this.stretchDays, this.day.kcal, this.density)
                .map((s) => ({ ...s, packMg: this.listWeights + s.foodMg + waterMg }));
        },
        heaviest() {
            if (this.stretches.length < 2) return null;
            return this.stretches.reduce((a, b) => (b.packMg > a.packMg ? b : a)).stretch;
        },
    },
    watch: {
        modelValue: {
            immediate: true,
            handler(p) {
                const text = (p && p.stretches ? p.stretches : []).join(', ');
                if (parseStretches(this.stretchesText).join(', ') !== text) this.stretchesText = text;
            },
        },
    },
    async mounted() {
        try {
            this.body = await api('/api/body-stats');
        } catch {
            this.body = {};
        }
    },
    methods: {
        carryFor(day) {
            return day ? waterToCarry(this.plan.waterEveryKm, this.plan.paceKmh, day.waterPerHourLiters) : null;
        },
        shown(key, toUnit, digits) {
            const v = this.plan[key];
            if (v === null || v === undefined || v === '') return '';
            const n = toUnit(Number(v));
            const f = 10 ** digits;
            return String(Math.round(n * f) / f);
        },
        set(key, raw, fromUnit = (v) => v) {
            const next = { ...this.plan };
            if (raw === '' || raw === null || raw === undefined) delete next[key];
            else if (key === 'terrain') next[key] = raw;
            else {
                const n = Number(raw);
                if (!Number.isFinite(n)) return;
                next[key] = Math.round(fromUnit(n) * 10) / 10;
            }
            this.$emit('update:modelValue', next);
        },
        setStretches(text) {
            this.stretchesText = text;
            const next = { ...this.plan, stretches: parseStretches(text) };
            if (!next.stretches.length) delete next.stretches;
            this.$emit('update:modelValue', next);
        },
        c2u(c) {
            return this.imperial ? (c * 9) / 5 + 32 : c;
        },
        u2c(u) {
            return this.imperial ? ((u - 32) * 5) / 9 : u;
        },
        small(mg) {
            return formatWeightMg(mg, this.imperial ? 'oz' : 'g');
        },
        big(mg) {
            return formatWeightMg(mg, this.imperial ? 'lb' : 'kg');
        },
        liters(l) {
            return this.imperial ? `${l} L (${Math.round((l / LITERS_PER_GAL) * 10) / 10} gal)` : `${l} L`;
        },
    },
};
</script>

<style lang="scss">
@import "../css/_globals";

.wgTripPlan {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 18px 20px;

    .wgTripInputs {
        display: grid;
        gap: 12px 16px;
        grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    }

    .wgTripWide {
        grid-column: 1 / -1;
    }

    .wgTripUnitField {
        align-items: center;
        display: flex;
        gap: 6px;

        .wgInput {
            min-width: 0;
            width: 100%;
        }
    }

    .wgTripEstimate {
        background: var(--lp-active-bg);
        border-radius: $radius;
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 14px 16px;

        p {
            margin: 0;
        }
    }

    .wgTripFine {
        font-size: 13px;
    }
}

.wgTripStretches {
    border-collapse: collapse;
    font-size: 14px;
    width: 100%;

    th,
    td {
        border-bottom: 1px solid var(--lp-border);
        padding: 6px 8px;
        text-align: left;
    }

    thead th {
        color: var(--lp-text-secondary);
        font-size: 12px;
        font-weight: 600;
    }

    .wgHeaviest {
        font-weight: 700;
    }

    .wgHeaviestTag {
        background: var(--lp-surface);
        border-radius: 4px;
        font-size: 11px;
        margin-left: 6px;
        padding: 1px 5px;
    }
}
</style>
