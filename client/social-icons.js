// Small line drawings for the footer's "Find us" links, shared by the app
// (site-footer.vue) and server-rendered pages (t_siteFooter.mustache). Plain,
// 24×24, drawn in currentColor so they follow the footer's link colour.

const svg = (body) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

export const SOCIAL_ICONS = {
    // A rounded square with an "f".
    facebook: svg('<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M15.5 8H14a2 2 0 0 0-2 2v11M9.5 13h5"/>'),
    // A rounded screen with a play button.
    youtube: svg('<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="m10.2 9.2 4.6 2.8-4.6 2.8z" fill="currentColor"/>'),
    // A camera: rounded square, lens, flash.
    instagram: svg('<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r="0.6" fill="currentColor"/>'),
};

/** socialLinks (client/brand.js) with their drawings, for either footer. */
export const withIcons = (links) => links.filter((l) => SOCIAL_ICONS[l.icon] && /^https:\/\//.test(l.url))
    .map((l) => ({ ...l, svg: SOCIAL_ICONS[l.icon] }));
