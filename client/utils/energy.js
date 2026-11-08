// How much a hiker burns, eats and drinks on trail: the calorie, food and
// water estimates on trip pages (trip-edit.vue) and in the list editor's
// trip planner (trip-planner.vue, utils/trip.js).
//
// A day on trail = resting burn for the hours in camp + the cost of hiking.
//
// Resting burn (BMR)
//   - Mifflin–St Jeor, from weight, height, age and sex:
//       10·kg + 6.25·cm − 5·age + 5 (men) / − 161 (women)
//   - Katch–McArdle, from lean mass, when a build is set: the build gives a
//     typical body-fat share (BUILDS), so lean mass = kg × (1 − fat):
//       370 + 21.6·lean kg
//   - both known: their average; weight only: about 24 kcal per kg a day.
//   In camp (the hours not hiking) that's ×1.3 for chores, eating, packing.
//
// Hiking: the Pandolf load-carriage equation (US Army, 1977), in watts:
//     1.5·W + 2·(W + L)·(L/W)² + η·(W + L)·(1.5·V² + 0.35·V·G)
//   W body kg, L pack kg, V speed m/s (from pace), G grade % (from the
//   climbing: half the day is spent going up at gain ÷ half the distance),
//   η terrain (TERRAINS). Downhill is counted as level walking.
//
// Cold: +5% for every 10 °C the low drops below 10 °C (keeping warm).
// Margin: +10% over everything, rounded to 50 kcal.
//
// Water to drink: about 1 L in camp, plus per hour of hiking 0.4 L and
// 0.03 L for every °C the high is over 20 °C (more in desert), plus 0.25 L
// per 500 m climbed. To carry between sources: the hours to the next source
// at that hourly rate, plus 0.5 L in reserve.
//
// Estimates to plan with. Bodies and days differ a lot; adjust from
// experience.

export const SEXES = { male: 'Male', female: 'Female', unspecified: 'Prefer not to say' };

// A typical body-fat share for each build, men / women.
export const BUILDS = {
    lean: { label: 'Lean', fat: { male: 0.12, female: 0.2 } },
    average: { label: 'Average', fat: { male: 0.2, female: 0.28 } },
    muscular: { label: 'Muscular', fat: { male: 0.14, female: 0.22 } },
    higher: { label: 'Higher body fat', fat: { male: 0.3, female: 0.38 } },
};

// Pandolf's terrain factor (η).
export const TERRAINS = {
    road: { label: 'Road or paved', eta: 1.0 },
    trail: { label: 'On trail', eta: 1.2 },
    offtrail: { label: 'Off trail', eta: 1.5 },
    desert: { label: 'Desert or sand', eta: 1.4 },
    snow: { label: 'Snow', eta: 2.0 },
};

export const DEFAULT_PACE_KMH = 3.5; // moving pace, without breaks
const MAX_HIKING_HOURS = 14;

const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** Resting burn a day (kcal), and how it was worked out. */
export function restingBurn({ kg, heightCm, age, sex, build } = {}) {
    const w = num(kg);
    if (!w) return null;
    const s = SEXES[sex] ? sex : 'unspecified';
    const h = num(heightCm);
    const a = num(age);
    const mifflin = h && a ? 10 * w + 6.25 * h - 5 * a + (s === 'male' ? 5 : s === 'female' ? -161 : -78) : null;
    const b = BUILDS[build];
    const fat = b ? (s === 'unspecified' ? (b.fat.male + b.fat.female) / 2 : b.fat[s]) : null;
    const katch = fat !== null ? 370 + 21.6 * w * (1 - fat) : null;
    if (mifflin && katch) return { kcal: (mifflin + katch) / 2, method: 'Mifflin–St Jeor and Katch–McArdle' };
    if (mifflin) return { kcal: mifflin, method: 'Mifflin–St Jeor' };
    if (katch) return { kcal: katch, method: 'Katch–McArdle' };
    return { kcal: 24 * w, method: 'body weight' };
}

/** Pandolf's metabolic rate, watts. */
export function pandolfWatts({ bodyKg, packKg, speedMs, gradePct, eta }) {
    const W = bodyKg;
    const L = Math.max(packKg, 0);
    return 1.5 * W + 2 * (W + L) * (L / W) ** 2 + eta * (W + L) * (1.5 * speedMs ** 2 + 0.35 * speedMs * gradePct);
}

/**
 * A day on trail. body: { kg, heightCm, age, sex, build }; day: { km, gainM,
 * terrain, paceKmh, lowC, highC }; packKg: what's on your back (average over
 * the day is fine). Returns null without a body weight.
 */
export function dayOnTrail(body, day, packKg) {
    const rest = restingBurn(body);
    if (!rest) return null;
    const bodyKg = num(body.kg);
    const km = Math.max(num(day.km) || 0, 0);
    const gain = Math.max(num(day.gainM) || 0, 0);
    const pace = Math.min(Math.max(num(day.paceKmh) || DEFAULT_PACE_KMH, 1), 8);
    const terrain = TERRAINS[day.terrain] || TERRAINS.trail;
    const hours = Math.min(km / pace, MAX_HIKING_HOURS);
    const speedMs = pace / 3.6;
    // Half the hiking climbs the day's gain; the other half is level or down.
    const grade = km > 0 ? Math.min((gain / ((km * 1000) / 2)) * 100, 40) : 0;
    const up = pandolfWatts({ bodyKg, packKg, speedMs, gradePct: grade, eta: terrain.eta });
    const level = pandolfWatts({ bodyKg, packKg, speedMs, gradePct: 0, eta: terrain.eta });
    const hikingKcal = (((up + level) / 2) * hours * 3600) / 4184;
    const campKcal = rest.kcal * ((24 - hours) / 24) * 1.3;
    const low = num(day.lowC);
    const cold = low !== null && low < 10 ? 1 + 0.05 * ((10 - low) / 10) : 1;
    const kcal = Math.round(((hikingKcal + campKcal) * cold * 1.1) / 50) * 50;

    const high = num(day.highC);
    const heat = high !== null && high > 20 ? 0.03 * (high - 20) : 0;
    const perHour = 0.4 + heat + (day.terrain === 'desert' ? 0.15 : 0);
    const drink = Math.min(1 + hours * perHour + 0.25 * (gain / 500), 12);
    return {
        kcal,
        restingKcal: Math.round(rest.kcal),
        restingMethod: rest.method,
        hikingKcal: Math.round(hikingKcal),
        hikingHours: Math.round(hours * 10) / 10,
        gradePct: Math.round(grade * 10) / 10,
        waterLiters: Math.round(drink * 10) / 10,
        waterPerHourLiters: Math.round(perHour * 100) / 100,
        paceKmh: pace,
    };
}

/** Water to carry from one source to the next, liters. */
export function waterToCarry(betweenKm, paceKmh, perHourLiters) {
    const km = num(betweenKm);
    if (!km) return null;
    const hours = km / Math.min(Math.max(num(paceKmh) || DEFAULT_PACE_KMH, 1), 8);
    return Math.round((hours * perHourLiters + 0.5) * 10) / 10;
}

/**
 * Food for each stretch between town stops: stretches are days ([4, 5, 3]).
 * Returns [{ stretch, days, kcal, foodMg }] at kcalPerOz (default 125).
 */
export function resupplyStretches(stretches, kcalPerDay, kcalPerOz = 125) {
    const density = Math.min(Math.max(num(kcalPerOz) || 125, 60), 200);
    const perDayMg = (kcalPerDay / density) * 28349.5;
    return (stretches || []).map((d, i) => {
        const days = Math.max(num(d) || 0, 0);
        return { stretch: i + 1, days, kcal: Math.round(kcalPerDay * days), foodMg: Math.round(perDayMg * days) };
    }).filter((s) => s.days > 0);
}

/** "4, 5, 3" or "4 5 3" → [4, 5, 3] (half days allowed; at most 60 stretches). */
export function parseStretches(textOrList) {
    const parts = Array.isArray(textOrList) ? textOrList : String(textOrList || '').split(/[\s,;]+/);
    return parts.map((p) => Math.round(Number(p) * 2) / 2).filter((n) => Number.isFinite(n) && n > 0 && n <= 60).slice(0, 60);
}
