// What being a Supporter gets you, in one place: the Supporter page, the
// sign-up offer and the homepage all list these. Every feature for planning
// a hike stays free; these are extras.
//
// `givesBack` is the owner's own words for what Supporter money gives to
// trails (config supporter.givesBack); it's left out until they set it.

export const SUPPORTER_PERKS = [
    { id: 'links', text: 'Plain shop links everywhere: no affiliate tracking on anything you click.' },
    { id: 'badge', text: 'A Supporter badge on your profile, your published lists and your shakedown comments.' },
    { id: 'wall', text: 'Your name on the Supporters wall, if you want it there.' },
    { id: 'early', text: 'Early access: try new features before everyone else.' },
];

export function supporterPerks({ givesBack = '' } = {}) {
    const perks = [...SUPPORTER_PERKS];
    if (givesBack) perks.push({ id: 'trails', text: givesBack });
    perks.push({ id: 'free', text: 'You keep a free, open-source hiking app free for everyone.' });
    return perks;
}
