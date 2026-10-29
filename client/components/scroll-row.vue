<template>
    <!-- A row that scrolls sideways (chips, filters), with a visible hint:
         the edge fades and a ‹ / › button appears on whichever side has
         more. The buttons scroll most of a row's width. Server-rendered pages
         get the same from client/utils/scroll-row.js. -->
    <div class="wgScrollRow" :data-more-left="left || null" :data-more-right="right || null">
        <button v-show="left" type="button" class="wgScrollBtn wgScrollBtnLeft" aria-label="Scroll left" tabindex="-1" @click="by(-1)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
        </button>
        <div ref="track" class="wgScrollTrack" :class="trackClass" v-bind="$attrs" @scroll.passive="update">
            <slot />
        </div>
        <button v-show="right" type="button" class="wgScrollBtn wgScrollBtnRight" aria-label="Scroll right" tabindex="-1" data-testid="scroll-more" @click="by(1)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
        </button>
    </div>
</template>

<script>
export default {
    name: 'ScrollRow',
    inheritAttrs: false,
    props: {
        trackClass: { type: [String, Array, Object], default: '' },
    },
    data() {
        return { left: false, right: false };
    },
    mounted() {
        this.observer = new ResizeObserver(() => this.update());
        this.observer.observe(this.$refs.track);
        this.mutations = new MutationObserver(() => this.update());
        this.mutations.observe(this.$refs.track, { childList: true, subtree: true });
        this.update();
    },
    beforeUnmount() {
        if (this.observer) this.observer.disconnect();
        if (this.mutations) this.mutations.disconnect();
    },
    methods: {
        update() {
            const t = this.$refs.track;
            if (!t) return;
            this.left = t.scrollLeft > 2;
            this.right = t.scrollLeft + t.clientWidth < t.scrollWidth - 2;
        },
        by(direction) {
            const t = this.$refs.track;
            t.scrollBy({ left: direction * Math.max(120, t.clientWidth * 0.7), behavior: 'smooth' });
        },
    },
};
</script>
