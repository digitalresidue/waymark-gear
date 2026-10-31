<template>
    <div class="lpModalContainer">
        <transition name="lpModal">
            <div v-if="shown" :id="id" ref="dialog" class="lpModal" role="dialog" aria-modal="true" tabindex="-1" @keydown.tab="trapTab">
                <slot />
            </div>
        </transition>
        <transition name="lpModal">
            <div v-if="shown" :class="{'lpModalOverlay': true, 'lpBlackout': blackout, 'lpTransparent': transparentOverlay}" @click="hide" />
        </transition>
    </div>
</template>

<script>
export default {
    name: 'Modal',
    props: {
        id: {
            type: String,
            required: false,
        },
        shown: {
            type: Boolean,
            required: true,
        },
        blackout: {
            type: Boolean,
            required: false,
            default: false,
        },
        transparentOverlay: {
            type: Boolean,
            required: false,
            default: false,
        },
    },
    emits: ['hide'],
    watch: {
        // Keyboard and screen-reader users land inside the dialog when it
        // opens, stay in it while it's open, and go back where they were.
        shown(open) {
            if (open) {
                this.opener = document.activeElement;
                this.$nextTick(() => this.focusDialog());
            } else if (this.opener && document.contains(this.opener)) {
                this.opener.focus();
                this.opener = null;
            }
        },
    },
    mounted() {
        if (this.shown) this.$nextTick(() => this.focusDialog());
    },
    beforeMount() {
        this.bindEscape();
    },
    beforeUnmount() {
        this.unbindEscape();
    },
    methods: {
        focusables() {
            const el = this.$refs.dialog;
            if (!el) return [];
            return [...el.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
                .filter((n) => n.offsetParent !== null || n === document.activeElement);
        },
        focusDialog() {
            const el = this.$refs.dialog;
            if (!el || el.contains(document.activeElement)) return;
            const heading = el.querySelector('h1, h2, h3');
            if (heading && !el.hasAttribute('aria-label')) {
                if (!heading.id) heading.id = `lpModalTitle${Math.random().toString(36).slice(2, 8)}`;
                el.setAttribute('aria-labelledby', heading.id);
            }
            el.focus();
        },
        trapTab(evt) {
            const items = this.focusables();
            if (!items.length) {
                evt.preventDefault();
                return;
            }
            const first = items[0];
            const last = items[items.length - 1];
            if (evt.shiftKey && (document.activeElement === first || document.activeElement === this.$refs.dialog)) {
                evt.preventDefault();
                last.focus();
            } else if (!evt.shiftKey && document.activeElement === last) {
                evt.preventDefault();
                first.focus();
            }
        },
        hide() {
            this.$emit('hide');
        },
        bindEscape() {
            window.addEventListener('keyup', this.closeOnEscape);
        },
        unbindEscape() {
            window.removeEventListener('keyup', this.closeOnEscape);
        },
        closeOnEscape(evt) {
            if (this.shown && evt.keyCode === 27) {
                this.hide();
            }
        },
    },
};
</script>

<style lang="scss">
@import "../css/_globals";

.lpModal:focus,
.lpModal:focus-visible {
    box-shadow: 0 0 30px rgba(0, 0, 0, 0.25);
    outline: none;
}

.lpModal {
    background: var(--lp-bg);
    box-shadow: 0 0 30px rgba(0, 0, 0, 0.25);
    left: 50%;
    max-height: calc(90% - (#{$spacingLarge} * 2));
    overflow-y: auto;
    padding: $spacingLarge;
    position: fixed;
    text-align: left;
    top: 50%;
    transform: translateX(-50%) translateY(-50%);
    transition: all $transitionDuration;
    width: 420px;
    z-index: $dialog;

    .lpHalf {
        padding: 0 20px;

        &:first-child {
            padding-left: 0;
        }

        &:last-child {
            padding-right: 0;
        }
    }

    p {
        margin: 5px 0 10px;
    }

    ul {
        padding-left: 15px;
    }

    .lpContent {
        max-height: 400px;
        overflow-y: scroll;
    }
}

.lpModalHeader {
    align-items: baseline;
    display: flex;
    justify-content: space-between;
}

.lpModalOverlay {
    background: rgba(0, 0, 0, 0.5);
    height: 100%;
    left: 0;
    position: fixed;
    top: 0;
    transition: all $transitionDuration;
    width: 100%;
    z-index: $belowDialog;

    &.lpBlackout {
        animation: none;
        background: url("/images/lp_bg2.jpg") 50% 50%;
        background-size: cover;
        opacity: 1;
    }

    &.lpTransparent {
        background: rgba(0, 0, 0, 0.01);
    }
}

.lpModal-enter-from,
.lpModal-leave-to {
    opacity: 0;

    &.lpModal {
        transform: translateX(-50%) translateY(-50%) scale(0.95);
    }
}

// The fixed 420px is wider than the viewport it's centred in, so the dialog
// hangs off both edges. Fill the width instead, minus a margin that keeps it
// reading as a dialog.
@media only screen and (width <= $mobile) {
    .lpModal {
        max-height: calc(100% - 32px);
        padding: 20px 18px;
        width: calc(100% - 24px);
    }
}

</style>
