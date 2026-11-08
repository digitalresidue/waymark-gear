<template>
    <!-- Body stats for the calorie, food and water estimates on trips
         (utils/energy.js). Private: only you see them (server/body-stats.js). -->
    <section id="body-stats" class="wgCard wgProfileFields wgBodyStats" aria-labelledby="wgBodyStatsTitle" data-testid="body-stats">
        <h2 id="wgBodyStatsTitle" class="wgProfileEditH">
            Body stats <span class="wgMuted wgBodyPrivate">Private</span>
        </h2>
        <p class="wgProfileHint">
            For the calorie, food and water estimates on your trips. Only you see these; they're never on your profile or shared lists. Leave any blank.
        </p>
        <div class="wgBodyGrid">
            <label class="wgField">Weight
                <span class="wgTripUnitField">
                    <input v-model="weight" class="wgInput" type="number" min="0" step="1" inputmode="decimal" data-testid="body-weight">
                    <span class="wgMuted">{{ imperial ? 'lb' : 'kg' }}</span>
                </span>
            </label>
            <label v-if="!imperial" class="wgField">Height
                <span class="wgTripUnitField">
                    <input v-model="heightCm" class="wgInput" type="number" min="0" step="1" inputmode="numeric" data-testid="body-height">
                    <span class="wgMuted">cm</span>
                </span>
            </label>
            <fieldset v-else class="wgField wgBodyHeight">
                <legend>Height</legend>
                <span class="wgTripUnitField">
                    <input v-model="feet" class="wgInput" type="number" min="0" max="8" step="1" inputmode="numeric" aria-label="Height, feet" data-testid="body-feet">
                    <span class="wgMuted">ft</span>
                    <input v-model="inches" class="wgInput" type="number" min="0" max="11" step="1" inputmode="numeric" aria-label="Height, inches" data-testid="body-inches">
                    <span class="wgMuted">in</span>
                </span>
            </fieldset>
            <label class="wgField">Year born
                <input v-model="birthYear" class="wgInput" type="number" :min="year - 110" :max="year - 10" step="1" inputmode="numeric" :placeholder="String(year - 35)" data-testid="body-born">
            </label>
            <label class="wgField">Sex
                <select v-model="sex" class="wgSelect" data-testid="body-sex">
                    <option value="">—</option>
                    <option v-for="(label, id) in sexes" :key="id" :value="id">{{ label }}</option>
                </select>
            </label>
            <label class="wgField">Build
                <select v-model="build" class="wgSelect" data-testid="body-build">
                    <option value="">—</option>
                    <option v-for="(b, id) in builds" :key="id" :value="id">{{ b.label }}</option>
                </select>
            </label>
        </div>
        <p class="wgProfileHint">
            Sex and build tune your resting burn (Mifflin–St Jeor and Katch–McArdle); your weight and pack drive the hiking burn.
        </p>
        <div class="wgProfileActions">
            <button type="button" class="wgBtn wgBtnPrimary" data-testid="body-save" @click="save">
                Save body stats
            </button>
            <button v-if="hasAny" type="button" class="wgBtn wgBtnGhost" data-testid="body-clear" @click="clear">
                Clear
            </button>
            <span v-if="status" class="wgMuted" role="status" data-testid="body-status">{{ status }}</span>
        </div>
    </section>
</template>

<script>
import { api } from '../utils/format.js';
import { currentUnits } from '../utils/i18n-app.js';
import { SEXES, BUILDS } from '../utils/energy.js';

const LB = 0.45359237;

export default {
    name: 'BodyStats',
    data() {
        return { weight: '', heightCm: '', feet: '', inches: '', birthYear: '', sex: '', build: '', status: '', year: new Date().getFullYear(), sexes: SEXES, builds: BUILDS };
    },
    computed: {
        imperial() {
            return currentUnits() !== 'metric';
        },
        hasAny() {
            return [this.weight, this.heightCm, this.feet, this.birthYear, this.sex, this.build].some((v) => v !== '' && v !== null);
        },
    },
    async mounted() {
        try {
            this.fill(await api('/api/body-stats'));
        } catch {
            // Signed out or offline: the form stays empty.
        }
    },
    methods: {
        fill(b) {
            this.weight = b.kg ? String(this.imperial ? Math.round(b.kg / LB) : b.kg) : '';
            this.heightCm = b.heightCm ? String(Math.round(b.heightCm)) : '';
            const totalIn = b.heightCm ? Math.round(b.heightCm / 2.54) : null;
            this.feet = totalIn ? String(Math.floor(totalIn / 12)) : '';
            this.inches = totalIn ? String(totalIn % 12) : '';
            this.birthYear = b.birthYear ? String(b.birthYear) : '';
            this.sex = b.sex || '';
            this.build = b.build || '';
        },
        body() {
            const n = (v) => (v === '' || v === null ? null : Number(v));
            const kg = n(this.weight) === null ? null : Math.round((this.imperial ? n(this.weight) * LB : n(this.weight)) * 10) / 10;
            let heightCm = n(this.heightCm);
            if (this.imperial) heightCm = n(this.feet) === null ? null : Math.round(((n(this.feet) * 12) + (n(this.inches) || 0)) * 2.54);
            return { kg, heightCm, birthYear: n(this.birthYear), sex: this.sex || null, build: this.build || null };
        },
        async save() {
            this.status = '';
            try {
                this.fill(await api('/api/body-stats', { method: 'PUT', body: JSON.stringify(this.body()) }));
                this.status = 'Saved.';
            } catch (err) {
                this.status = err.message;
            }
        },
        async clear() {
            this.fill(await api('/api/body-stats', { method: 'PUT', body: '{}' }));
            this.status = 'Cleared.';
        },
    },
};
</script>

<style lang="scss">
.wgBodyStats {
    .wgBodyGrid {
        display: grid;
        gap: 12px 16px;
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    }

    .wgBodyHeight {
        border: 0;
        margin: 0;
        padding: 0;

        .wgInput {
            min-width: 3.5em;
        }

        legend {
            padding: 0;
        }
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

    .wgBodyPrivate {
        font-size: 12px;
        font-weight: 600;
        margin-left: 6px;
    }
}
</style>
