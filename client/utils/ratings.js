// Star ratings for catalog gear: one per person per item (a written review's
// rating is that person's rating), changeable any time.
//
// Ranking uses a weighted score so a single 5-star vote can't outrank gear
// that dozens of people rate highly: every item starts as if it had a few
// average ratings (PRIOR), and real ratings pull it away from there. Gear
// nobody has rated sits at the average, so well-rated gear comes first,
// then unrated gear, then gear people rate poorly.

export const PRIOR = { mean: 3.5, weight: 5 };

export function ratingScore(average, count, prior = PRIOR) {
    const n = Number(count) || 0;
    if (!n) return prior.mean;
    return (prior.mean * prior.weight + Number(average) * n) / (prior.weight + n);
}

// "★★★★☆" for a rounded rating.
export function stars(n) {
    const k = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
    return '★'.repeat(k) + '☆'.repeat(5 - k);
}

export function ratingLabel(average, count) {
    if (!count) return 'No ratings yet';
    return `${Number(average).toFixed(1)} from ${count} ${count === 1 ? 'rating' : 'ratings'}`;
}

export const RATING_WORDS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

export function ratingExplainer(prior = PRIOR) {
    return `One rating per person, which you can change any time. Gear with only a few ratings is weighed as if it also had ${prior.weight} average (${prior.mean}★) ratings, so it takes real agreement to reach the top.`;
}
