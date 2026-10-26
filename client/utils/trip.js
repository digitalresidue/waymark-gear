// Trip planner: how much you carry on each day of a trip.
//
// Base weight is gear only and never changes. On top of it you carry:
//   - consumables listed in the list (fuel, a specific food bag...), counted
//     in full every day, since the list doesn't say how fast they go;
//   - food from the planner: foodPerDay for every day still ahead, so Day 1
//     carries the whole trip's food and the last day carries one day's;
//   - water: liters carried, at 1 kg per liter.
// Worn gear is on your body, not in the pack, so it's reported separately.

export const MG_PER_LITER = 1_000_000;
export const DEFAULT_TRIP = { days: 3, foodPerDayMg: 680389, waterLiters: 2 }; // 1.5 lb of food a day

export function normalizeTrip(trip) {
    const t = { ...DEFAULT_TRIP, ...(trip || {}) };
    return {
        days: Math.min(Math.max(Math.round(Number(t.days)) || 1, 1), 365),
        foodPerDayMg: Math.min(Math.max(Number(t.foodPerDayMg) || 0, 0), 5e6),
        waterLiters: Math.min(Math.max(Number(t.waterLiters) || 0, 0), 30),
    };
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
