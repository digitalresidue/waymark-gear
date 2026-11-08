// Trip planner: how much you carry on each day of a trip.
//
// Base weight is gear only and never changes. On top of it you carry:
//   - consumables listed in the list (fuel, a specific food bag...), counted
//     in full every day, since the list doesn't say how fast they go;
//   - food from the planner: foodPerDay for every day still ahead, so Day 1
//     carries the whole trip's food and the last day carries one day's;
//   - water: liters carried, at 1 kg per liter.
// Worn gear is on your body, not in the pack, so it's reported separately.

import { dayOnTrail } from './energy.js';

export const MG_PER_LITER = 1_000_000;
export const DEFAULT_TRIP = { days: 3, foodPerDayMg: 680389, waterLiters: 2 }; // 1.5 lb of food a day

export const TERRAINS = { trail: 'On trail', offtrail: 'Off trail', snow: 'Snow', desert: 'Desert' };

// A number within [min, max], or null when not given.
function opt(v, min, max) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : null;
}

// Trip details (Phase 6) are optional; when present they drive the
// calorie and water estimates below. Stored metric: km, m, °C, kg.
export function normalizeTrip(trip) {
    const t = { ...DEFAULT_TRIP, ...(trip || {}) };
    const out = {
        days: Math.min(Math.max(Math.round(Number(t.days)) || 1, 1), 365),
        foodPerDayMg: Math.min(Math.max(Number(t.foodPerDayMg) || 0, 0), 5e6),
        waterLiters: Math.min(Math.max(Number(t.waterLiters) || 0, 0), 30),
    };
    const extra = {
        distanceKm: opt(t.distanceKm, 0, 10000),
        elevationM: opt(t.elevationM, 0, 100000),
        tempLowC: opt(t.tempLowC, -50, 50),
        tempHighC: opt(t.tempHighC, -50, 55),
        bodyKg: opt(t.bodyKg, 25, 250),
        kcalPerOz: opt(t.kcalPerOz, 60, 200),
        terrain: Object.prototype.hasOwnProperty.call(TERRAINS, t.terrain) ? t.terrain : null,
    };
    for (const [k, v] of Object.entries(extra)) if (v !== null) out[k] = k === 'terrain' ? v : Math.round(v * 10) / 10;
    return out;
}

// Rough daily calories and water for a trip, from its details and the pack:
// the same model as trip pages (utils/energy.js: Mifflin–St Jeor or
// Katch–McArdle resting burn, Pandolf for hiking with the pack, cold, a 10%
// margin). `body` is the member's body stats (Your profile); the list's own
// "Your weight" wins over its weight when set.
export function tripEstimates(trip, packMg, body = {}) {
    const t = normalizeTrip(trip);
    const who = { ...(body || {}), ...(t.bodyKg ? { kg: t.bodyKg } : {}) };
    if (!who.kg) return null;
    const days = t.days;
    const kmPerDay = (t.distanceKm || 0) / days;
    const gainPerDay = (t.elevationM || 0) / days;
    const day = dayOnTrail(who, { km: kmPerDay, gainM: gainPerDay, terrain: t.terrain || 'trail', lowC: t.tempLowC, highC: t.tempHighC }, (packMg || 0) / 1e6);
    const kcal = day.kcal;
    const kcalPerOz = t.kcalPerOz || 125;
    const foodPerDayMg = Math.round((kcal / kcalPerOz) * 28349.5);
    const waterLitersPerDay = day.waterLiters;
    return {
        kcalPerDay: kcal,
        foodPerDayMg,
        kcalPerOz,
        waterLitersPerDay,
        kmPerDay,
        gainPerDay,
        restingMethod: day.restingMethod,
        macros: macrosFor(kcal),
        totals: { kcal: kcal * days, foodMg: foodPerDayMg * days, waterLiters: Math.round(waterLitersPerDay * days * 10) / 10 },
    };
}

// A common split for long days on trail: carbs for fuel, fat for density
// (9 kcal/g instead of 4), and enough protein for recovery.
export const MACRO_SPLIT = { carbs: 0.5, fat: 0.35, protein: 0.15 };
const KCAL_PER_G = { carbs: 4, fat: 9, protein: 4 };

export function macrosFor(kcal) {
    return Object.fromEntries(Object.entries(MACRO_SPLIT).map(([k, share]) => [k, Math.round((kcal * share) / KCAL_PER_G[k])]));
}

// One row per day: { day, foodMg, waterMg, packMg, skinOutMg }.
export function tripDays(list, trip) {
    const t = normalizeTrip(trip);
    const waterMg = t.waterLiters * MG_PER_LITER;
    const base = list.totalBaseWeight || 0;
    const listed = list.totalConsumableWeight || 0;
    const worn = list.totalWornWeight || 0;
    const days = [];
    for (let day = 1; day <= t.days; day++) {
        const foodMg = t.foodPerDayMg * (t.days - day + 1);
        const packMg = base + listed + foodMg + waterMg;
        days.push({ day, foodMg, waterMg, packMg, skinOutMg: packMg + worn });
    }
    return days;
}
