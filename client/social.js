// Small interactive bits on the server-rendered pages (shared lists and
// @profiles): voting, following, and the photo/video lightbox.

import { initScrollRows } from './utils/scroll-row.js';
import { bindLightboxLinks } from './utils/lightbox.js';
import { canSee } from './nav.js';

async function call(url, options = {}) {
    const res = await fetch(url, {
        credentials: 'same-origin',
        ...options,
        headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) {
        window.location.href = '/signin';
        throw new Error('signin');
    }
    if (!res.ok) throw new Error(body.message || 'Something went wrong.');
    return body;
}

function initVotes() {
    const box = document.getElementById('wgVotes');
    if (!box) return;
    const id = box.dataset.externalId;
    let state = { score: 0, mine: 0 };
    const render = () => {
        box.innerHTML = `
            <button type="button" class="wgVoteBtn" data-v="1" aria-label="Upvote" aria-pressed="${state.mine === 1}" data-testid="vote-up">▲</button>
            <span class="wgVoteScore" data-testid="vote-score" title="Votes in the last 30 days">${state.score}</span>
            <button type="button" class="wgVoteBtn" data-v="-1" aria-label="Downvote" aria-pressed="${state.mine === -1}" data-testid="vote-down">▼</button>`;
    };
    box.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-v]');
        if (!btn) return;
        const v = Number(btn.dataset.v);
        try {
            state = await call(`/api/kits/${encodeURIComponent(id)}/vote`, { method: 'POST', body: JSON.stringify({ value: state.mine === v ? 0 : v }) });
            render();
        } catch (err) {
            if (err.message !== 'signin') box.title = err.message;
        }
    });
    call(`/api/kits/${encodeURIComponent(id)}/votes`).then((s) => {
        state = s;
        render();
    }).catch(() => {});
}

function initFollow() {
    document.querySelectorAll('[data-follow-user]').forEach((box) => {
        const user = box.dataset.followUser;
        let state = null;
        const render = () => {
            const count = `<span class="wgFollowCount" data-testid="follower-count">${state.followers} ${state.followers === 1 ? 'follower' : 'followers'}</span>`;
            box.innerHTML = state.self ? count : `
                <button type="button" class="wgBtn wgBtnSmall ${state.following ? 'wgBtnGhost' : 'wgBtnPrimary'}" aria-pressed="${state.following}" data-testid="follow-button">
                    ${state.following ? 'Following' : 'Follow'}
                </button>${count}`;
        };
        box.addEventListener('click', async (e) => {
            if (!e.target.closest('[data-testid="follow-button"]')) return;
            try {
                state = await call(`/api/users/${encodeURIComponent(user)}/follow`, { method: state.following ? 'DELETE' : 'POST', body: state.following ? undefined : '{}' });
                render();
            } catch {
                // Signed out: call() already went to the sign-in page.
            }
        });
        call(`/api/users/${encodeURIComponent(user)}/follow`).then((s) => {
            state = s;
            render();
        }).catch(() => {});
    });
}

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// The review form on /g/:id pages, for people allowed to write reviews, and
// hide/restore buttons for moderators.
// Gear reviews page: a way in for reviewers. Find any catalog item (or pick
// from the most-carried gear they haven't reviewed) and go write it up on
// its page, with the form open.
function initReviewWriter(viewer) {
    const box = document.getElementById('wgReviewWriter');
    if (!box || !viewer || !viewer.canReview) return;
    box.hidden = false;
    const input = box.querySelector('[data-testid="review-find"]');
    if (window.location.hash === '#write') {
        box.scrollIntoView({ block: 'start' });
        input.focus({ preventScroll: true });
    }
    const results = box.querySelector('.wgReviewFindResults');
    const write = (id) => `/g/${encodeURIComponent(id)}#write-review`;
    const row = (item, extra) => `<li><a href="${write(item.id)}" data-testid="review-pick"><strong>${esc(item.name)}</strong> <span class="wgMuted">${esc(item.category || '')}${extra ? ` · ${esc(extra)}` : ''}</span></a></li>`;
    let timer = null;
    input.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(async () => {
            const q = input.value.trim();
            if (!q) {
                results.hidden = true;
                input.setAttribute('aria-expanded', 'false');
                return;
            }
            try {
                const data = await call(`/api/catalog?limit=8&q=${encodeURIComponent(q)}`);
                const items = (data.items || []).map((i) => ({ id: i.id, name: [i.brand, i.name].filter(Boolean).join(' '), category: i.category }));
                results.innerHTML = items.length ? items.map((i) => row(i)).join('') : `<li class="wgMuted">Nothing in the catalog matches “${esc(q)}”.</li>`;
            } catch {
                results.innerHTML = '<li class="wgMuted">Search isn\'t working right now.</li>';
            }
            results.hidden = false;
            input.setAttribute('aria-expanded', 'true');
        }, 150);
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const first = results.querySelector('a');
            if (first) window.location.href = first.href;
        }
    });
    call('/api/reviews/suggestions?limit=6').then((data) => {
        if (!data.items || !data.items.length) return;
        const wrap = box.querySelector('.wgReviewSuggest');
        wrap.querySelector('ul').innerHTML = data.items.map((i) => row(i, [
            i.uses && `in ${i.uses} ${i.uses === 1 ? 'kit' : 'kits'}`,
            i.reviews ? `${i.reviews} ${i.reviews === 1 ? 'review' : 'reviews'}` : 'no reviews yet',
        ].filter(Boolean).join(', '))).join('');
        wrap.hidden = false;
    }).catch(() => {});
}

function initReviews() {
    const box = document.getElementById('wgReviewForm');
    if (!box) return;
    const id = box.dataset.catalogId;
    call(`/api/catalog/${encodeURIComponent(id)}/reviews`).then((data) => {
        if (data.reviews.some((r) => r.canModerate)) addModeration(data.reviews);
        if (!data.canReview) return;
        const mine = data.reviews.find((r) => r.mine) || {};
        box.innerHTML = `
            <details class="wgCard wgReviewFormCard" ${mine.id ? '' : 'open'}>
                <summary data-testid="review-toggle">${mine.id ? 'Edit your review' : 'Write a review'}</summary>
                <form data-testid="review-form">
                    <fieldset class="wgReviewStars">
                        <legend>Rating</legend>
                        ${[1, 2, 3, 4, 5].map((n) => `<label><input type="radio" name="rating" value="${n}" ${mine.rating === n ? 'checked' : ''} data-testid="review-rating-${n}" required> ${n}★</label>`).join('')}
                    </fieldset>
                    <label class="wgField"><span>Headline</span><input class="wgInput" name="title" maxlength="140" value="${esc(mine.title)}" data-testid="review-title"></label>
                    <label class="wgField"><span>Used for</span><input class="wgInput" name="usedFor" maxlength="200" placeholder="e.g. 900 miles on the CDT" value="${esc(mine.usedFor)}" data-testid="review-used-for"></label>
                    <label class="wgField"><span>Review</span><textarea class="wgInput" name="body" rows="6" maxlength="8000" required data-testid="review-body">${esc(mine.body)}</textarea></label>
                    <label class="wgField"><span>Liked</span><input class="wgInput" name="pros" maxlength="1000" value="${esc(mine.pros)}" data-testid="review-pros"></label>
                    <label class="wgField"><span>Didn't like</span><input class="wgInput" name="cons" maxlength="1000" value="${esc(mine.cons)}" data-testid="review-cons"></label>
                    <p class="wgReviewError" role="alert"></p>
                    <button type="submit" class="wgBtn wgBtnPrimary" data-testid="review-submit">${mine.id ? 'Update review' : 'Post review'}</button>
                </form>
            </details>`;
        const form = box.querySelector('form');
        // Arriving from "Write a review": open the form and put the cursor in it.
        if (window.location.hash === '#write-review') {
            box.querySelector('details').open = true;
            box.scrollIntoView({ block: 'start' });
            const first = form.querySelector('input[name="rating"]');
            if (first) first.focus({ preventScroll: true });
        }
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const f = new FormData(form);
            const body = Object.fromEntries(['title', 'usedFor', 'body', 'pros', 'cons'].map((k) => [k, f.get(k) || '']));
            body.rating = Number(f.get('rating'));
            try {
                await call(`/api/catalog/${encodeURIComponent(id)}/reviews`, { method: 'POST', body: JSON.stringify(body) });
                window.location.reload();
            } catch (err) {
                form.querySelector('.wgReviewError').textContent = err.message;
            }
        });
    }).catch(() => {});
}

function addModeration(reviews) {
    for (const r of reviews) {
        const li = document.querySelector(`[data-review-id="${r.id}"]`);
        if (!li) continue;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'wgBtn wgBtnGhost wgBtnSmall';
        btn.dataset.testid = 'review-moderate';
        btn.textContent = r.hidden ? 'Restore' : 'Hide';
        btn.addEventListener('click', async () => {
            await call(`/api/reviews/${r.id}/moderate`, { method: 'POST', body: JSON.stringify({ action: r.hidden ? 'restore' : 'hide' }) }).catch(() => {});
            window.location.reload();
        });
        li.querySelector('header').appendChild(btn);
    }
}

// The search box on /compare: pick catalog gear to add as a column.
function initCompare() {
    const form = document.getElementById('wgCompareAdd');
    if (!form) return;
    const ids = form.dataset.ids ? form.dataset.ids.split(',') : [];
    const input = form.querySelector('input');
    const out = form.querySelector('ul');
    let timer = null;
    const go = (id) => {
        window.location.href = `/compare?ids=${[...ids.filter((x) => x !== id), id].slice(-4).join(',')}`;
    };
    input.addEventListener('input', () => {
        clearTimeout(timer);
        const q = input.value.trim();
        if (q.length < 2) {
            out.innerHTML = '';
            return;
        }
        timer = setTimeout(async () => {
            const { items } = await call(`/api/catalog?limit=8&q=${encodeURIComponent(q)}`).catch(() => ({ items: [] }));
            out.innerHTML = items.filter((i) => !ids.includes(i.id)).map((i) => `<li><button type="button" class="wgLinkBtn" data-id="${esc(i.id)}" data-testid="compare-result">${esc(i.brand)} ${esc(i.name)}</button></li>`).join('');
        }, 250);
    });
    out.addEventListener('click', (e) => {
        const b = e.target.closest('[data-id]');
        if (b) go(b.dataset.id);
    });
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const first = out.querySelector('[data-id]');
        if (first) go(first.dataset.id);
    });
}

// The phone menu is a <details>; close it on an outside tap or Escape.
// The site header on server pages (templates/t_siteHeader.mustache): the
// phone menu, the dropdowns, and the parts that depend on who's looking.
// The page is cached and shared, so it arrives with signed-in-only entries
// hidden; /api/viewer says which to show.
function initSiteHeader() {
    const header = document.querySelector('[data-site-header]');
    if (!header) return;
    const nav = header.querySelector('.wgSiteNav');
    const menuBtn = header.querySelector('.wgSiteMenuBtn');
    const groups = [...header.querySelectorAll('.wgNavGroup')];

    const closeGroups = (except) => groups.forEach((g) => {
        if (g === except) return;
        g.classList.remove('wgNavGroupOpen');
        g.querySelector('.wgNavGroupBtn').setAttribute('aria-expanded', 'false');
    });
    const setMenu = (open) => {
        nav.classList.toggle('wgSiteNavOpen', open);
        menuBtn.setAttribute('aria-expanded', String(open));
    };
    menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        setMenu(!nav.classList.contains('wgSiteNavOpen'));
    });
    groups.forEach((g) => {
        const btn = g.querySelector('.wgNavGroupBtn');
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const open = !g.classList.contains('wgNavGroupOpen');
            closeGroups(g);
            g.classList.toggle('wgNavGroupOpen', open);
            btn.setAttribute('aria-expanded', String(open));
        });
    });
    document.addEventListener('click', (e) => {
        if (!header.contains(e.target)) {
            closeGroups();
            setMenu(false);
        }
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeGroups();
            setMenu(false);
        }
    });
    nav.addEventListener('click', (e) => {
        if (e.target.closest('a')) setMenu(false);
    });

    // The account menu (signed in).
    const avatar = header.querySelector('.wgAvatarMenu');
    if (avatar) {
        const btn = avatar.querySelector('.lpAvatar');
        const list = avatar.querySelector('.wgAvatarMenuList');
        const setAvatar = (open) => {
            list.hidden = !open;
            btn.setAttribute('aria-expanded', String(open));
        };
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            setAvatar(list.hidden);
        });
        document.addEventListener('click', (e) => { if (!avatar.contains(e.target)) setAvatar(false); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setAvatar(false); });
        avatar.querySelector('[data-signout]').addEventListener('click', async () => {
            await fetch('/signout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
            window.location.href = '/welcome';
        });
    }

    let hasLibrary = false;
    try {
        hasLibrary = Boolean(localStorage.getItem('library'));
    } catch {
        // Storage blocked: treat as no local lists.
    }
    const apply = (viewer) => {
        header.querySelectorAll('[data-show]').forEach((el) => {
            el.hidden = !canSee({ show: el.dataset.show }, viewer);
        });
        groups.forEach((g) => {
            if (!g.hidden && !g.querySelector('.wgNavDropItem:not([hidden])')) g.hidden = true;
        });
        const cta = header.querySelector('[data-lists-button]');
        if (!viewer.signedIn && viewer.hasLibrary) {
            cta.href = '/';
            cta.querySelector('.wgLong').textContent = 'My lists';
            cta.querySelector('.wgShort').textContent = 'My lists';
        }
        if (viewer.signedIn) {
            header.querySelectorAll('[data-viewer-name]').forEach((el) => { el.textContent = viewer.username; });
            const initial = header.querySelector('[data-viewer-initial]');
            initial.title = viewer.username;
            if (viewer.avatarUrl && /^\/userimages\//.test(viewer.avatarUrl)) {
                const img = document.createElement('img');
                img.src = viewer.avatarUrl;
                img.alt = '';
                img.dataset.testid = 'header-avatar-img';
                initial.replaceChildren(img);
                initial.classList.add('lpAvatarPhoto');
            } else {
                initial.textContent = viewer.username.charAt(0).toUpperCase();
            }
            fetch('/api/notifications?limit=1', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
                .then((r) => (r.ok ? r.json() : null))
                .then((n) => {
                    const count = header.querySelector('[data-bell-count]');
                    if (n && n.unread) {
                        count.textContent = n.unread > 9 ? '9+' : String(n.unread);
                        count.hidden = false;
                    }
                })
                .catch(() => {});
        }
        header.dataset.viewer = viewer.signedIn ? 'signed-in' : 'guest';
    };
    apply({ signedIn: false, hasLibrary });
    fetch('/api/viewer', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
        .then((r) => (r.ok ? r.json() : null))
        .then((v) => {
            if (!v) return;
            apply({ signedIn: Boolean(v.username), username: v.username, avatarUrl: v.avatarUrl, hasLibrary: hasLibrary || Boolean(v.username), isAdmin: v.isAdmin, isModerator: v.isModerator });
            initReviewWriter(v);
        })
        .catch(() => {});
}

// The Brands page: filter the cards in place as you type, tick or pick a
// gear type, keeping the URL in step so the view can be shared. The server
// applies the same rules (server/brands.js, matchesBrand) for the first load.
function initBrands() {
    const form = document.getElementById('wgBrandFilters');
    if (!form) return;
    const input = form.querySelector('[name="q"]');
    const cottage = form.querySelector('[name="cottage"]');
    const typeButtons = [...form.querySelectorAll('[data-type]')];
    const cards = [...document.querySelectorAll('[data-testid="brand-card"]')];
    const count = document.querySelector('[data-testid="brand-count"]');
    const empty = document.querySelector('[data-testid="brand-empty"]');
    let type = (typeButtons.find((b) => b.getAttribute('aria-pressed') === 'true') || { dataset: { type: '' } }).dataset.type;

    const apply = () => {
        const q = input.value.trim().toLowerCase();
        let shown = 0;
        cards.forEach((card) => {
            const ok = (!cottage.checked || card.dataset.cottage === '1')
                && (!type || card.dataset.types.split(' ').includes(type))
                && (!q || card.dataset.name.toLowerCase().includes(q));
            card.hidden = !ok;
            if (ok) shown++;
        });
        typeButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.type === type)));
        count.textContent = shown === cards.length ? `${cards.length} ${cards.length === 1 ? 'brand' : 'brands'}` : `${shown} of ${cards.length} brands`;
        empty.hidden = shown > 0;
        const params = new URLSearchParams();
        if (input.value.trim()) params.set('q', input.value.trim());
        if (cottage.checked) params.set('cottage', '1');
        if (type) params.set('type', type);
        const qs = params.toString();
        history.replaceState(null, '', `/brands${qs ? `?${qs}` : ''}`);
    };

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (e.submitter && e.submitter.dataset.type !== undefined) type = e.submitter.dataset.type;
        apply();
    });
    input.addEventListener('input', apply);
    cottage.addEventListener('change', apply);
}

// The Trails page: switch trails (and sorts) in place, search every trail,
// and put the trails you've tagged your own lists with first.
function initTrails() {
    const picker = document.getElementById('wgTrailPicker');
    if (!picker) return;
    const chips = picker.querySelector('.wgTrailChips');
    const input = document.getElementById('wgTrailQ');
    const results = document.getElementById('wgTrailResults');
    let loading = null;

    const mark = (slug) => {
        chips.querySelectorAll('[data-trail]').forEach((a) => {
            if (a.dataset.trail === slug) a.setAttribute('aria-current', 'true');
            else a.removeAttribute('aria-current');
        });
    };

    async function load(slug, sort, { push = true, label } = {}) {
        const url = `/trails/${encodeURIComponent(slug)}${sort && sort !== 'top' ? `?sort=${encodeURIComponent(sort)}` : ''}`;
        const body = document.getElementById('wgTrailBody');
        if (loading) loading.abort();
        loading = new AbortController();
        body.setAttribute('aria-busy', 'true');
        try {
            const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}partial=1`, { signal: loading.signal, credentials: 'same-origin' });
            if (!res.ok) throw new Error(String(res.status));
            const html = await res.text();
            const holder = document.createElement('div');
            holder.innerHTML = html;
            const fresh = holder.firstElementChild;
            body.replaceWith(fresh);
            if (!chips.querySelector(`[data-trail="${CSS.escape(slug)}"]`)) {
                const a = document.createElement('a');
                a.href = `/trails/${slug}`;
                a.dataset.trail = slug;
                a.className = 'wgTrailChip';
                a.dataset.testid = `trail-chip-${slug}`;
                a.innerHTML = `<b>${esc(label || slug)}</b>`;
                chips.prepend(a);
            }
            mark(slug);
            const name = fresh.querySelector('[data-testid="trail-name"]');
            const title = document.getElementById('wgTrailTitleName');
            const short = chips.querySelector(`[data-trail="${CSS.escape(slug)}"] b`);
            if (title) title.textContent = short ? short.textContent : (name ? name.textContent : slug);
            document.title = `${fresh.dataset.title} — Waymark Gear`;
            if (push) history.pushState({ slug, sort }, '', url);
        } catch (err) {
            // Fall back to a full page load, unless the visitor is already
            // going somewhere else: leaving cancels this fetch (Firefox
            // reports that as a network error, not an abort), and sending
            // them back to the trail would override where they were going.
            if (err.name !== 'AbortError' && !leaving) window.location.href = url;
        }
    }

    let leaving = false;
    window.addEventListener('beforeunload', () => { leaving = true; });
    window.addEventListener('pageshow', () => { leaving = false; });

    document.addEventListener('click', (e) => {
        const a = e.target.closest('a[data-trail]');
        if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        load(a.dataset.trail, a.dataset.sort, { label: a.textContent.trim() });
    });
    window.addEventListener('popstate', (e) => {
        const slug = (e.state && e.state.slug) || window.location.pathname.split('/').pop();
        const sort = (e.state && e.state.sort) || new URLSearchParams(window.location.search).get('sort');
        load(slug, sort, { push: false });
    });
    history.replaceState({ slug: window.location.pathname.split('/').pop(), sort: new URLSearchParams(window.location.search).get('sort') }, '');

    // Search: every trail, most-packed first.
    let timer = null;
    let items = [];
    let active = -1;
    const close = () => { results.hidden = true; active = -1; };
    const render = () => {
        results.innerHTML = items.map((t, i) => `<li role="option" id="wgTrailOpt${i}" aria-selected="${i === active}" data-i="${i}" data-testid="trail-result">
            <span><b>${esc(t.name)}</b>${t.short ? ` <span class="wgMuted">${esc(t.short)}</span>` : ''}</span>
            <span class="wgTrailResultMeta">${esc(t.region)}${t.lengthMi ? ` · ${t.lengthMi.toLocaleString()} mi` : ''}</span>
            <span class="wgTrailCount">${t.count}</span></li>`).join('') || '<li class="wgMuted">No trails match. Try another name or a place.</li>';
        results.hidden = false;
        input.setAttribute('aria-activedescendant', active >= 0 ? `wgTrailOpt${active}` : '');
    };
    const pick = (t) => {
        close();
        input.value = '';
        input.blur();
        load(t.slug, null, { label: t.short || t.name });
    };
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-controls', 'wgTrailResults');
    input.setAttribute('aria-expanded', 'false');
    input.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(async () => {
            const q = input.value.trim();
            const res = await fetch(`/api/trails/search?limit=10&q=${encodeURIComponent(q)}`).then((r) => r.json()).catch(() => ({ trails: [] }));
            items = res.trails || [];
            active = items.length ? 0 : -1;
            render();
            input.setAttribute('aria-expanded', 'true');
        }, 150);
    });
    input.addEventListener('focus', () => { if (!input.value) input.dispatchEvent(new Event('input')); });
    input.addEventListener('keydown', (e) => {
        if (results.hidden) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, items.length - 1); render(); }
        if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); render(); }
        if (e.key === 'Enter' && items[active]) { e.preventDefault(); pick(items[active]); }
        if (e.key === 'Escape') close();
    });
    results.addEventListener('mousedown', (e) => {
        const li = e.target.closest('[data-i]');
        if (li) { e.preventDefault(); pick(items[Number(li.dataset.i)]); }
    });
    input.addEventListener('blur', () => setTimeout(close, 150));

    // Your trails first.
    fetch('/api/trails/mine', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
        .then((r) => (r.ok ? r.json() : { trails: [] }))
        .then(({ trails }) => {
            for (const t of [...trails].reverse()) {
                let a = chips.querySelector(`[data-trail="${CSS.escape(t.slug)}"]`);
                if (!a) {
                    a = document.createElement('a');
                    a.href = `/trails/${t.slug}`;
                    a.dataset.trail = t.slug;
                    a.className = 'wgTrailChip';
                    a.innerHTML = `<b>${esc(t.short || t.name)}</b>`;
                }
                a.classList.add('wgTrailChipMine');
                a.title = 'One of your trails';
                a.dataset.testid = `trail-chip-${t.slug}`;
                chips.prepend(a);
            }
        })
        .catch(() => {});
}

export function initSocial() {
    initTrails();
    initSiteHeader();
    initCompare();
    initVotes();
    initFollow();
    initReviews();
    initBrands();
    initScrollRows();
    bindLightboxLinks();
}
