// Keyboard access for controls written as <a> without an href (the editor
// has many, from its LighterPack roots) and anything marked role="button"
// that isn't a real <button>: they get into the tab order and answer Enter
// and Space the way a button does.

const LINKLIKE = 'a:not([href]):not([role]):not([tabindex])';

function upgrade(root) {
    for (const el of root.querySelectorAll(LINKLIKE)) {
        el.setAttribute('role', 'button');
        el.setAttribute('tabindex', '0');
    }
}

function onKey(evt) {
    if (evt.key !== 'Enter' && evt.key !== ' ') return;
    const el = evt.target;
    if (!(el instanceof HTMLElement) || el.getAttribute('role') !== 'button') return;
    if (['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY'].includes(el.tagName)) return;
    // A real link would already have its own Enter; these have none.
    if (el.tagName === 'A' && el.hasAttribute('href')) return;
    evt.preventDefault();
    el.click();
}

export function initKeyboardClicks(root = document.body) {
    upgrade(root);
    let queued = false;
    new MutationObserver(() => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
            queued = false;
            upgrade(root);
        });
    }).observe(root, { childList: true, subtree: true });
    document.addEventListener('keydown', onKey);
}

export const _test = { upgrade, onKey };
