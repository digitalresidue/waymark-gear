// The Lightest board's rules, in one place for the server's ranking, the
// board's "How this works" note and the tests.
//
// A list ranks by its base weight, padded while it goes untouched or gets
// downvoted ("ranking weight"). The weight people see is always the real one.
//
// - Grace: no padding for 3 months after the last gear change (or "Still
//   carrying this").
// - Then +5% for every month (30 days) after that, counted whole months.
// - Off the board after 12 months untouched.
// - Each net downvote in the last 90 days adds +5%, once the list has at
//   least 3 votes in that time. Net -5 or worse: off the board.
// - To be on the board at all: a Gear check score of 70+, and for overnight
//   trips a shelter and a sleep system.

import { checkEssentials, ESSENTIALS } from './insights.js';

export const DAY_MS = 24 * 60 * 60 * 1000;

export const BOARD_RULES = {
    graceDays: 90,
    stepDays: 30,
    stepPct: 5,
    maxAgeDays: 365,
    voteWindowDays: 90,
    minVotes: 3,
    downvotePct: 5,
    dropAtNet: -5,
    minReadiness: 70,
};

// Whole months past the grace period ("month 4" is the first padded one).
export function staleSteps(ageDays, rules = BOARD_RULES) {
    if (ageDays <= rules.graceDays) return 0;
    return Math.ceil((ageDays - rules.graceDays) / rules.stepDays);
}

/**
 * Where a published list stands on the Lightest board.
 * kit: { baseWeightMg, freshAt (Date|string), votes: { net, count }, boardOk }
 * Returns { listed, reason, rankWeightMg, padPct, ageDays }
 */
export function boardStanding(kit, now = Date.now(), rules = BOARD_RULES) {
    const ageDays = Math.max(0, (now - new Date(kit.freshAt).getTime()) / DAY_MS);
    const net = (kit.votes && kit.votes.net) || 0;
    const count = (kit.votes && kit.votes.count) || 0;
    const counted = count >= rules.minVotes;
    const downs = counted && net < 0 ? -net : 0;
    const padPct = staleSteps(ageDays, rules) * rules.stepPct + downs * rules.downvotePct;
    let reason = '';
    if (!kit.boardOk) reason = 'gear-check';
    else if (ageDays > rules.maxAgeDays) reason = 'stale';
    else if (counted && net <= rules.dropAtNet) reason = 'downvoted';
    return {
        listed: !reason,
        reason,
        padPct,
        ageDays: Math.floor(ageDays),
        rankWeightMg: Math.round(kit.baseWeightMg * (1 + padPct / 100)),
    };
}

// The words visitors see under the board. Kept beside the numbers so they
// can't drift apart.
export function boardExplainer(rules = BOARD_RULES) {
    return [
        `The Lightest board favors lists people are actually carrying. A list keeps its full spot for ${rules.graceDays / 30} months after its last gear change, then slides a little each month (it counts ${rules.stepPct}% heavier per month for ranking), and leaves the board after a year without changes.`,
        `Downvotes slide it faster: ${rules.downvotePct}% per net downvote over the last ${rules.voteWindowDays} days, once it has ${rules.minVotes} or more votes. Net ${rules.dropAtNet} or worse takes it off the board.`,
        `To be listed, a list needs a Gear check score of ${rules.minReadiness} or more, and overnight lists need a shelter and a sleep system. The weights shown are always the real ones.`,
        'Owners can update their gear or tap "Still carrying this" to get their spot back.',
    ];
}

// Gear check for the board. Owners can mark minor essentials "not needed",
// but not the critical ones: dismissing a shelter shouldn't make a list
// lighter than everyone carrying one.
const CRITICAL = new Set(ESSENTIALS.filter((e) => e.critical).map((e) => e.id));

export function boardGearCheck(rows, list, rules = BOARD_RULES) {
    const trip = list.trip || {};
    const dismissed = (list.notNeeded || []).filter((id) => !CRITICAL.has(id));
    const check = checkEssentials(rows, { tripType: list.tripType, tempLowC: trip.tempLowC, tempHighC: trip.tempHighC, dismissed });
    const overnight = list.tripType !== 'dayhike';
    const has = (id) => check.covered.some((c) => c.id === id);
    const ok = check.score >= rules.minReadiness && (!overnight || (has('shelter') && has('sleep')));
    return { ok, score: check.score };
}

// "today", "3 days ago", "4 months ago": how long since a list was last
// changed or vouched for.
export function updatedAgo(when, now = Date.now()) {
    const days = Math.floor((now - new Date(when).getTime()) / DAY_MS);
    if (!Number.isFinite(days) || days < 1) return 'today';
    if (days < 30) return days === 1 ? '1 day ago' : `${days} days ago`;
    const months = Math.floor(days / 30);
    return months === 1 ? '1 month ago' : `${months} months ago`;
}
