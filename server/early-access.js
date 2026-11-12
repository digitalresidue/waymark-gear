// How a new feature reaches people: the owner tries it first, then
// Supporters get it early, then every member. A feature's stage is one of
// STAGES; the code that owns the feature keeps its stage (Follow keeps its
// in site_settings, server/activity.js) and asks canUseStage who's in.
//
// Early access is about when, not whether: everything that reaches
// Supporters early reaches every member after.

import { isOwner } from './auth.js';
import { isSupporter } from './billing.js';

export const STAGES = ['owner', 'supporters', 'everyone'];

export const isStage = (s) => STAGES.includes(s);

/** Can this member use a feature at this stage? */
export function canUseStage(stage, user) {
    if (!user) return false;
    if (isOwner(user.username)) return true;
    if (stage === 'everyone') return true;
    if (stage === 'supporters') return isSupporter(user);
    return false;
}

/** Is this member seeing it early (as a Supporter, before everyone)? */
export function seesEarly(stage, user) {
    return stage === 'supporters' && Boolean(user) && !isOwner(user.username) && isSupporter(user);
}
