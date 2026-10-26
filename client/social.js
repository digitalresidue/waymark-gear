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

export function initSocial() {
    initVotes();
    initFollow();
    bindLightboxLinks();
}
