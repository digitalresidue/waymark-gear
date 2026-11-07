<template>
    <!-- A small ⓘ that explains a term. Shown on hover, on keyboard focus and
         on tap; Escape closes it; the pointer can move onto the text without
         it closing (WCAG 1.4.13). Screen readers hear the button as "About
         base weight" and the explanation as its description, open or not.
         Shared lists use the same markup and styles (_ui.scss, share-entry.js). -->
    <span class="wgInfoTip" :class="{ wgInfoTipOpen: open, wgInfoTipDismissed: dismissed }" @mouseleave="onLeave">
        <button
            type="button"
            class="wgInfoTipBtn"
            :aria-label="`About ${label.toLowerCase()}`"
            :aria-describedby="id"
            :aria-expanded="String(open)"
            :data-testid="`info-tip-${term}`"
            @click.stop="toggle"
            @keydown.esc.stop="dismiss"
            @blur="onLeave"
        >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 11v6M12 7.5v.01" /></svg>
        </button>
        <span :id="id" role="tooltip" class="wgInfoTipText">{{ text }}</span>
    </span>
</template>

<script>
import { WEIGHT_TERMS } from '../utils/weight-terms.js';

let next = 0;

export default {
    name: 'InfoTip',
    props: {
        // A key of WEIGHT_TERMS.
        term: { type: String, required: true },
    },
    data() {
        next += 1;
        return { open: false, dismissed: false, id: `wgInfoTip${next}` };
    },
    computed: {
        label() {
            return (WEIGHT_TERMS[this.term] || {}).label || this.term;
        },
        text() {
            return (WEIGHT_TERMS[this.term] || {}).text || '';
        },
    },
    mounted() {
        this.onDocKey = (e) => {
            if (e.key === 'Escape' && (this.open || this.$el.matches(':hover'))) this.dismiss();
        };
        this.onDocPress = (e) => {
            if (this.open && !this.$el.contains(e.target)) this.open = false;
        };
        document.addEventListener('keydown', this.onDocKey);
        document.addEventListener('pointerdown', this.onDocPress);
    },
    beforeUnmount() {
        document.removeEventListener('keydown', this.onDocKey);
        document.removeEventListener('pointerdown', this.onDocPress);
    },
    methods: {
        toggle() {
            this.dismissed = false;
            this.open = !this.open;
        },
        // Escape: hidden even while hovered or focused, until the pointer
        // or focus moves on.
        dismiss() {
            this.open = false;
            this.dismissed = true;
        },
        onLeave() {
            this.dismissed = false;
        },
    },
};
</script>
