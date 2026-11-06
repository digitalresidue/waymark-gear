const clickOutsideHandlers = new WeakMap();

export const selectOnFocus = {
    mounted(el) {
        el.addEventListener('focus', () => {
            el.select();
        });
    },
};

export const focusOnCreate = {
    mounted(el, binding) {
        if (binding.value !== undefined ? binding.value : true) {
            el.focus();
        }
    },
};

export const emptyIfZero = {
    mounted(el) {
        el.addEventListener('focus', () => {
            if (el.value === '0' || el.value === '0.00') {
                el.dataset.originalValue = el.value;
                el.value = '';
                el._emptyIfZero = true;
            }
        });

        // Once the user types, stop forcing the field empty so their input
        // survives the re-render savePrice/saveWeight triggers.
        el.addEventListener('input', () => {
            el._emptyIfZero = false;
        });

        el.addEventListener('blur', () => {
            el._emptyIfZero = false;
            if (el.value === '') {
                el.value = el.dataset.originalValue || '0';
            }
        });
    },

    // A re-render while the field is focused — e.g. the row's focus state
    // toggling its hint bubbles — makes v-model rewrite el.value back to the
    // bound zero, undoing the empty above. Re-clear it so a freshly-focused
    // zero field stays empty until the user actually types.
    updated(el) {
        if (el._emptyIfZero && document.activeElement === el) {
            el.value = '';
        }
    },
};

// Close something (a menu) when you click or tap elsewhere.
//
// Clicks alone miss taps on an iPad or iPhone: Safari only sends a click for
// a tap on something it thinks is clickable (a link, a button, an element
// with its own click handler), so tapping the page's background never got
// here and menus stayed open. A touch or pen press is caught as it starts
// instead; mouse clicks still close on the click, as before.
export const clickOutside = {
    mounted(el, binding) {
        const close = (evt) => {
            if (el.contains(evt.target)) return;
            if (typeof binding.value === 'function') binding.value();
        };
        const press = (evt) => {
            if (evt.pointerType === 'mouse') return;
            close(evt);
        };
        clickOutsideHandlers.set(el, { close, press });
        window.addEventListener('click', close);
        window.addEventListener('pointerdown', press);
    },
    unmounted(el) {
        const handlers = clickOutsideHandlers.get(el);
        if (handlers) {
            window.removeEventListener('click', handlers.close);
            window.removeEventListener('pointerdown', handlers.press);
            clickOutsideHandlers.delete(el);
        }
    },
};
