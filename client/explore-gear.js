// Explore gear, one category (/explore/shelter): filter the cards in place
// as checkboxes are ticked and sliders moved, re-sort them, and keep the URL
// in step so the view can be shared. The server applies the same rules
// (client/utils/explore.js) for the first load and for links.

import {
    readFilters, filtersToQuery, matchesFilters, sortItems, rangeLabel, activeFilterCount, movedFrom, RANGE_WORDS, chosenTypes, withoutHiddenSpecs, brandCounts,
} from './utils/explore.js';
import { translator } from './utils/i18n.js';

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
    // The page's own words in the reader's language (server/views.js).
    const words = (() => {
        try {
            return JSON.parse((count && count.dataset.words) || '{}');
        } catch {
            return {};
        }
    })();
    const t = translator(document.documentElement.lang || 'en', words, {
        'explore.items': { one: '{count} item', other: '{count} items' },
        'explore.itemsOf': '{shown} of {total} items',
    });
    const rangeWords = { any: t('explore.any', {}, RANGE_WORDS.any), upTo: t('explore.upTo', {}, RANGE_WORDS.upTo), atLeast: t('explore.atLeast', {}, RANGE_WORDS.atLeast) };
    if (box) fitFilterColumn(box);

    const items = [...list.children].map((el) => ({
        el,
        id: el.dataset.id,
        cat: el.dataset.cat,
        type: el.dataset.type || '',
        brand: el.dataset.brand || '',
        weight: Number(el.dataset.weight) || 0,
        price: el.dataset.price === '' ? null : Number(el.dataset.price),
        name: el.dataset.name || '',
        score: Number(el.dataset.score) || 0,
        ratings: Number(el.dataset.ratings) || 0,
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
        step: Number(el.dataset.step) || 0,
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
            if (lo > r.facet.min && movedFrom(lo, r.facet.min, r.step)) params.set(`${r.key}_min`, String(lo));
            if (hi < r.facet.max && movedFrom(hi, r.facet.max, r.step)) params.set(`${r.key}_max`, String(hi));
        }
        if (sortSelect) params.set('sort', sortSelect.value);
        const f = readFilters(params);
        return withoutHiddenSpecs(f, chosenTypes(f, items));
    }

    // Spec filters follow the ticked categories: tick Shell in Clothing and
    // only a shell's are left; untick them all and every one is back.
    const specBlocks = [...form.querySelectorAll('[data-spec-types]')];
    const brandOptions = [...form.querySelectorAll('[data-brand-option]')];
    function showSpecFilters() {
        const params = new URLSearchParams();
        const cats = [...form.querySelectorAll('input[name="cat"]:checked')].map((c) => c.value);
        if (cats.length) params.set('cat', cats.join(','));
        const f = readFilters(params);
        const types = chosenTypes(f, items);
        for (const el of specBlocks) {
            el.hidden = types !== null && !el.dataset.specTypes.split(' ').some((t) => types.has(t));
        }
        // Brands follow them too: Pad ticked lists only the brands with pads.
        const byBrand = brandCounts(f, items);
        for (const el of brandOptions) {
            const n = byBrand[el.dataset.brandOption] || 0;
            el.hidden = !n && !el.querySelector('input').checked;
            el.querySelector('[data-brand-count]').textContent = String(n);
        }
    }

    function apply() {
        showSpecFilters();
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
            r.out.textContent = rangeLabel(r.key, chosen.min, chosen.max, r.facet, rangeWords, document.documentElement.dataset.units || null);
        }
        count.textContent = shown === items.length ? t('explore.items', { count: items.length }) : t('explore.itemsOf', { shown, total: items.length });
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
