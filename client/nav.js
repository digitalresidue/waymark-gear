// The site menu, in one place. The app header (components/site-header.vue)
// and the server-rendered pages (server/site-chrome.js ->
// templates/t_siteHeader.mustache) both draw it from here, so they can't
// drift apart.
//
// Top level stays short: related pages sit together in a dropdown.
//
// `show` says who sees an entry:
//   all (default) · library (has lists, signed in or not) · signedIn · guest
//   admin (site owner) · staff (owner or moderator)
// `id` doubles as the test id: data-testid="nav-<id>".

export const MENU = [
    { id: 'lists', label: 'My lists', href: '/', show: 'library' },
    {
        id: 'explore',
        label: 'Explore',
        items: [
            { id: 'kits', label: 'Kits', href: '/explore', note: 'Packs people have published' },
            { id: 'trails', label: 'Trails', href: '/trails', note: 'What people carry, trail by trail' },
            { id: 'leaderboard', label: 'Leaderboards', href: '/leaderboard', note: 'Top-voted and lightest kits' },
            { id: 'reviews', label: 'Gear reviews', href: '/reviews', note: 'How gear held up out there' },
            { id: 'brands', label: 'Brands', href: '/brands', note: 'Gear makers, big and cottage' },
            { id: 'popular', label: 'Popular gear', href: '/welcome#common', note: 'What most kits carry', show: 'guest' },
        ],
    },
    { id: 'trips', label: 'Trips', href: '/trips', show: 'signedIn' },
    {
        id: 'owner',
        label: 'Owner',
        show: 'staff',
        items: [
            { id: 'owner-catalog', label: 'Gear catalog', href: '/owner/catalog', show: 'admin' },
            { id: 'owner-kits', label: 'Featured kits', href: '/owner/kits', show: 'admin' },
            { id: 'owner-trails', label: 'Trails', href: '/owner/trails', show: 'admin' },
            { id: 'owner-brands', label: 'Brands', href: '/owner/brands', show: 'admin' },
            { id: 'owner-revenue', label: 'Revenue', href: '/owner/revenue', show: 'admin' },
            { id: 'owner-review', label: 'Write a review', href: '/reviews#write', show: 'staff' },
            { id: 'owner-users', label: 'Users', href: '/moderation', show: 'staff' },
            { id: 'tickets', label: 'Tickets', href: '/staff/tickets', show: 'staff' },
        ],
    },
];

// Phone menu only: what the desktop header keeps in its account area.
export const PHONE_EXTRAS = [
    { id: 'profile', label: 'Your profile', href: '/profile', show: 'signedIn' },
    { id: 'notifications', label: 'Notifications', href: '/notifications', show: 'signedIn' },
    { id: 'supporter', label: 'Support Waymark', href: '/supporter' },
    { id: 'signin', label: 'Sign in', href: '/signin', show: 'guest', testid: 'menu-signin' },
];

// viewer: { signedIn, hasLibrary, isAdmin, isModerator }
export function canSee(entry, viewer) {
    switch (entry.show || 'all') {
    case 'library': return Boolean(viewer.hasLibrary || viewer.signedIn);
    case 'signedIn': return Boolean(viewer.signedIn);
    case 'guest': return !viewer.signedIn;
    case 'admin': return Boolean(viewer.isAdmin);
    case 'staff': return Boolean(viewer.isAdmin || viewer.isModerator);
    default: return true;
    }
}

// The menu as this viewer sees it: hidden entries dropped, and a dropdown
// left with nothing in it dropped too.
export function menuFor(viewer) {
    return MENU.filter((e) => canSee(e, viewer))
        .map((e) => (e.items ? { ...e, items: e.items.filter((i) => canSee(i, viewer)) } : e))
        .filter((e) => !e.items || e.items.length);
}

// Which top-level entry a path belongs to, to mark it as the current one.
export function activeFor(path) {
    const p = String(path || '/').split(/[?#]/)[0];
    for (const e of MENU) {
        // Links to a spot on another page (/welcome#common) don't make that
        // page part of the section.
        const hrefs = (e.items ? e.items.map((i) => i.href) : [e.href]).filter((h) => !h.includes('#'));
        if (hrefs.some((h) => {
            const base = h.split('#')[0];
            return base === '/' ? p === '/' : (p === base || p.startsWith(`${base}/`));
        })) return e.id;
    }
    if (p.startsWith('/owner') || p === '/moderation' || p.startsWith('/staff')) return 'owner';
    return '';
}
