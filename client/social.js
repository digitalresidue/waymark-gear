// Small interactive bits on the server-rendered pages (shared lists and
// @profiles): voting, following, and the photo/video lightbox.

import { bindLightboxLinks } from './utils/lightbox.js';

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

export function initSocial() {
    initCompare();
    initVotes();
    initFollow();
    initReviews();
    bindLightboxLinks();
}
