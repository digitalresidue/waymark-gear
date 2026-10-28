// A small lightbox for gear photos and YouTube videos, shared by the Vue app
// and the server-rendered pages (share pages, profiles). Photos and videos
// never sit inline in a list: they open here, at a sensible size, on click.

import { youTubeId } from './gear-meta.js';

let overlay = null;
let lastFocus = null;

function close() {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
    document.removeEventListener('keydown', onKey);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
}

let onArrow = null;
function onKey(e) {
    if (e.key === 'Escape') close();
    else if (onArrow && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) onArrow(e.key === 'ArrowRight' ? 1 : -1);
}

function frame(title) {
    close();
    lastFocus = document.activeElement;
    overlay = document.createElement('div');
    overlay.className = 'wgLightbox';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', title);
    overlay.dataset.testid = 'lightbox';
    overlay.innerHTML = `
        <div class="wgLightboxPanel">
            <div class="wgLightboxHead">
                <p class="wgLightboxTitle"></p>
                <button type="button" class="wgLightboxClose" aria-label="Close" data-testid="lightbox-close">×</button>
            </div>
            <div class="wgLightboxBody"></div>
            <p class="wgLightboxFoot"></p>
        </div>`;
    overlay.querySelector('.wgLightboxTitle').textContent = title;
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.closest('.wgLightboxClose')) close();
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    overlay.querySelector('.wgLightboxClose').focus();
    return overlay;
}

export function openPhotos(photos, title = 'Photos') {
    const list = (photos || []).filter((p) => typeof p === 'string' && p.startsWith('/userimages/'));
    if (!list.length) return;
    const box = frame(title);
    let i = 0;
    const body = box.querySelector('.wgLightboxBody');
    const foot = box.querySelector('.wgLightboxFoot');
    const show = () => {
        body.innerHTML = '';
        const img = document.createElement('img');
        img.src = list[i];
        img.alt = `${title}, photo ${i + 1} of ${list.length}`;
        img.className = 'wgLightboxImg';
        img.dataset.testid = 'lightbox-photo';
        body.appendChild(img);
        if (list.length > 1) {
            for (const [dir, label] of [[-1, '‹'], [1, '›']]) {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = `wgLightboxNav ${dir < 0 ? 'wgLightboxPrev' : 'wgLightboxNext'}`;
                b.textContent = label;
                b.setAttribute('aria-label', dir < 0 ? 'Previous photo' : 'Next photo');
                b.addEventListener('click', () => onArrow(dir));
                body.appendChild(b);
            }
        }
        foot.textContent = list.length > 1 ? `${i + 1} / ${list.length}` : '';
    };
    onArrow = (d) => {
        i = (i + d + list.length) % list.length;
        show();
    };
    show();
}

export function openVideo(link, title = 'Video') {
    const id = youTubeId(link);
    if (!id) return;
    onArrow = null;
    const box = frame(title);
    const body = box.querySelector('.wgLightboxBody');
    const iframe = document.createElement('iframe');
    iframe.className = 'wgLightboxVideo';
    iframe.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
    iframe.title = title;
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.dataset.testid = 'lightbox-video';
    body.appendChild(iframe);
    const foot = box.querySelector('.wgLightboxFoot');
    // Some videos can't be embedded (the creator turned embedding off, or
    // they're age- or region-restricted): YouTube's player then shows only
    // "An error occurred". This link always works, on YouTube itself.
    const watch = document.createElement('a');
    watch.className = 'wgLightboxWatch';
    watch.href = `https://www.youtube.com/watch?v=${id}`;
    watch.target = '_blank';
    watch.rel = 'noopener noreferrer';
    watch.textContent = 'Watch on YouTube';
    watch.dataset.testid = 'lightbox-watch';
    const views = document.createElement('span');
    foot.append(watch, views);
    fetch(`/api/videos/${id}/view`, { method: 'POST', credentials: 'same-origin' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
            if (d && overlay === box) views.textContent = ` · ${d.views} ${d.views === 1 ? 'view' : 'views'} on Waymark Gear`;
        })
        .catch(() => {});
}

// For server-rendered pages: any element with data-photos (JSON array) or
// data-video (a YouTube link) opens the lightbox when clicked.
export function bindLightboxLinks(root = document) {
    root.addEventListener('click', (e) => {
        const el = e.target.closest('[data-photos], [data-video]');
        if (!el) return;
        e.preventDefault();
        const title = el.dataset.title || 'Gear';
        if (el.dataset.video) openVideo(el.dataset.video, `${title}: video`);
        else {
            try {
                openPhotos(JSON.parse(el.dataset.photos), title);
            } catch {
                // Malformed attribute: nothing to show.
            }
        }
    });
}
