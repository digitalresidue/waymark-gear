// Site identity in one place. Values that differ per deployment come from
// Vite build-time variables (set them in .env or the build environment):
//
//   VITE_CONTACT_EMAIL  shown in the footer, help modal and email notices;
//                       contact links are hidden while it's empty
//   VITE_SOURCE_URL     where the source for this deployment lives. The GPL
//                       requires offering it, so point this at your fork.

export const siteName = 'Waymark Gear';

export const contactEmail = import.meta.env?.VITE_CONTACT_EMAIL || '';

export const sourceUrl = import.meta.env?.VITE_SOURCE_URL || 'https://github.com/galenmaly/lighterpack';

// Waymark Gear began as a fork of LighterPack (GPL-2.0). Keep this credit.
export const upstream = {
    name: 'LighterPack',
    author: 'Galen Maly',
    url: 'https://github.com/galenmaly/lighterpack',
};
