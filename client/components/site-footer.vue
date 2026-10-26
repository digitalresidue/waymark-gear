<template>
    <div class="lpSiteFooter" :class="{ lpSiteFooterFixed: fixed }">
        <div class="lpSiteFooterCredit">
            Based on <a class="lpHref" :href="upstream.url" target="_blank" rel="noopener noreferrer">{{ upstream.name }}</a> by {{ upstream.author }}
        </div>
        <div class="lpSiteFooterLinks">
            <a class="lpHref" :href="sourceUrl" target="_blank" rel="noopener noreferrer">Source</a> {{ siteName }} {{ year }}
            <template v-if="contactEmail">
                -
                <a class="lpHref" :href="`mailto:${contactEmail}`">Contact</a>
            </template>
            -
            <a class="lpHref" href="/privacy">Privacy</a>
            -
            <a class="lpHref" href="/terms">Terms</a>
        </div>
    </div>
</template>

<script>
import { siteName, contactEmail, sourceUrl, upstream } from '../brand.js';

export default {
    name: 'SiteFooter',
    props: {
        // The welcome and auth pages sit on the photo background with nothing
        // below the fold to anchor a footer, so theirs is pinned to the
        // viewport over the blackout instead of ending the page.
        fixed: {
            type: Boolean,
            default: false,
        },
    },
    data() {
        return { siteName, contactEmail, sourceUrl, upstream };
    },
    computed: {
        // Read once at render rather than baked into the markup -- the year
        // spent seven of them reading 2019.
        year() {
            return new Date().getFullYear();
        },
    },
};
</script>

<style lang="scss">
@import "../css/_globals";

.lpSiteFooter {
    color: var(--lp-text-secondary);
    display: flex;
    font-size: 12px;
    justify-content: space-between;
}

// One line each on a phone: side by side, the two halves wrap into a block tall
// enough to cover whatever they are sitting over.
@media only screen and (width <= $mobile) {
    .lpSiteFooter {
        flex-direction: column;
        gap: 4px;
    }
}

.lpSiteFooterFixed {
    background: var(--lp-welcome-footer-bg);
    bottom: 0;
    left: 0;
    padding: $spacingSmall;
    position: fixed;
    right: 0;
    z-index: $blackoutFooter;

    @media only screen and (width <= $mobile) {
        align-items: center;
        gap: 2px;
        padding: 8px 12px;
        text-align: center;
    }
}
</style>
