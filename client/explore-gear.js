// Explore gear, one category (/explore/shelter): filter the cards in place
// as checkboxes are ticked and sliders moved, re-sort them, and keep the URL
// in step so the view can be shared. The server applies the same rules
// (client/utils/explore.js) for the first load and for links.

import { readFilters, filtersToQuery, matchesFilters, sortItems, rangeLabel, activeFilterCount } from './utils/explore.js';

export function initExploreGear() {
    const form = document.getElementById('wgGearFilters');
    const list = document.getElementById('wgGearResults');
    if (!form || !list) return;
    const slug = form.dataset.slug;
    const box = form.closest('details');
    const count = document.querySelector('[data-testid="explore-count"]');
    const empty = document.querySelector('[data-testid="explore-empty"]');
    const sortSelect = document.querySelector('[data-sort]');
    const filterCount = document.querySelector('[data-filter-count]');
    if (box) fitFilterColumn(box);

    const items = [...list.children].map((el) => ({
        el,
        id: el.dataset.id,
        cat: el.dataset.cat,
        brand: el.dataset.brand || '',
        weight: Number(el.dataset.weight) || 0,
        price: el.dataset.price === '' ? null : Number(el.dataset.price),
        name: el.dataset.name || '',
        specs: (() => {
            try {
                return JSON.parse(el.dataset.specs || '{}');
            } catch {
                return {};
            }
        })(),
    }));

    const ranges = [...form.querySelectorAll('[data-range]')].map((el) => ({
        el,
        key: el.dataset.range,
        lo: el.querySelector('.wgRangeLo'),
        hi: el.querySelector('.wgRangeHi'),
        out: el.querySelector('[data-out]'),
        facet: { min: Number(el.dataset.min), max: Number(el.dataset.max) },
        stops: el.dataset.stops ? el.dataset.stops.split(',').map(Number) : null,
    }));

    // A slider over fixed stops (fill power) lands on the nearest one.
    const snap = (r, v) => (r.stops ? r.stops.reduce((best, s) => (Math.abs(s - v) < Math.abs(best - v) ? s : best), r.stops[0]) : v);

    function current() {
        const params = new URLSearchParams();
        const lists = new Map();
        form.querySelectorAll('input[type="checkbox"]:checked').forEach((c) => {
            if (!lists.has(c.name)) lists.set(c.name, []);
            lists.get(c.name).push(c.value);
        });
        for (const [name, values] of lists) params.set(name, values.join(','));
        for (const r of ranges) {
            const lo = snap(r, Number(r.lo.value));
            const hi = snap(r, Number(r.hi.value));
            if (lo > r.facet.min) params.set(`${r.key}_min`, String(lo));
            if (hi < r.facet.max) params.set(`${r.key}_max`, String(hi));
        }
        if (sortSelect) params.set('sort', sortSelect.value);
        return readFilters(params);
    }

    function apply() {
        const f = current();
        let shown = 0;
        for (const item of items) {
            const ok = matchesFilters(item, f);
            item.el.hidden = !ok;
            if (ok) shown++;
        }
        for (const item of sortItems(items, f.sort)) list.appendChild(item.el);
        for (const r of ranges) {
            const chosen = r.key === 'weight' ? f.weight : r.key === 'price' ? f.price : f.specs[r.key] || {};
            r.out.textContent = rangeLabel(r.key, chosen.min, chosen.max, r.facet);
        }
        count.textContent = shown === items.length ? `${items.length} ${items.length === 1 ? 'item' : 'items'}` : `${shown} of ${items.length} items`;
        if (empty) empty.hidden = shown > 0;
        const active = activeFilterCount(f);
        if (filterCount) filterCount.textContent = active ? `(${active})` : '';
        const qs = filtersToQuery(f);
        history.replaceState(null, '', `/explore/${slug}${qs ? `?${qs}` : ''}`);
    }

    // The two thumbs of a range can't cross.
    for (const r of ranges) {
        r.lo.addEventListener('input', () => {
            if (Number(r.lo.value) > Number(r.hi.value)) r.hi.value = r.lo.value;
        });
        r.hi.addEventListener('input', () => {
            if (Number(r.hi.value) < Number(r.lo.value)) r.lo.value = r.hi.value;
        });
    }
    form.addEventListener('input', apply);
    form.addEventListener('change', apply);
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        apply();
    });
    if (sortSelect) sortSelect.addEventListener('change', apply);
    const clear = form.querySelector('[data-clear-filters]');
    if (clear) {
        clear.addEventListener('click', (e) => {
            e.preventDefault();
            form.querySelectorAll('input[type="checkbox"]').forEach((c) => { c.checked = false; });
            for (const r of ranges) {
                r.lo.value = String(r.facet.min);
                r.hi.value = String(r.facet.max);
            }
            apply();
        });
    }
    // Phones: the filters start folded (unless a link set some), the results first.
    if (box && window.matchMedia('(max-width: 720px)').matches && !activeFilterCount(current())) box.open = false;
}

// The filter column scrolls on its own; keep its bottom on screen whether or
// not the page has scrolled it up to its sticky spot.
function fitFilterColumn(box) {
    let queued = false;
    const fit = () => {
        queued = false;
        const top = Math.max(box.getBoundingClientRect().top, 0);
        box.style.setProperty('--wg-filters-max', `${Math.max(window.innerHeight - top - 16, 240)}px`);
    };
    const queue = () => {
        if (!queued) {
            queued = true;
            requestAnimationFrame(fit);
        }
    };
    fit();
    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue);
}
