// Server-rendered pages: give every [data-scroll-row] element the same
// sideways-scroll hint as the app's components/scroll-row.vue (faded edges,
// ‹ › buttons on the side with more). The element itself is the track; it's
// wrapped, and the buttons are added beside it.

const ARROW = (d) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}" /></svg>`;

export function initScrollRows(root = document) {
    root.querySelectorAll('[data-scroll-row]:not([data-scroll-ready])').forEach((track) => {
        track.dataset.scrollReady = '1';
        track.classList.add('wgScrollTrack');
        const row = document.createElement('div');
        row.className = 'wgScrollRow';
        track.replaceWith(row);
        const button = (side, label, d) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = `wgScrollBtn wgScrollBtn${side}`;
            b.tabIndex = -1;
            b.setAttribute('aria-label', label);
            b.innerHTML = ARROW(d);
            b.hidden = true;
            b.addEventListener('click', () => track.scrollBy({ left: (side === 'Left' ? -1 : 1) * Math.max(120, track.clientWidth * 0.7), behavior: 'smooth' }));
            return b;
        };
        const left = button('Left', 'Scroll left', 'm15 6-6 6 6 6');
        const right = button('Right', 'Scroll right', 'm9 6 6 6-6 6');
        row.append(left, track, right);
        const update = () => {
            const moreLeft = track.scrollLeft > 2;
            const moreRight = track.scrollLeft + track.clientWidth < track.scrollWidth - 2;
            left.hidden = !moreLeft;
            right.hidden = !moreRight;
            row.toggleAttribute('data-more-left', moreLeft);
            row.toggleAttribute('data-more-right', moreRight);
        };
        track.addEventListener('scroll', update, { passive: true });
        new ResizeObserver(update).observe(track);
        new MutationObserver(update).observe(track, { childList: true, subtree: true });
        update();
    });
}
