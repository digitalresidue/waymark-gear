<template>
    <footer v-if="site" class="wgSiteFooter">
        <div class="wgPage wgSiteFooterInner">
            <div>
                <p class="wgSiteFooterMark">
                    WAYMARK <span>GEAR</span>
                </p>
                <p>
                    waymarkgear.com · Based on <a :href="upstream.url" target="_blank" rel="noopener noreferrer">{{ upstream.name }}</a> by {{ upstream.author }}
                </p>
            </div>
            <nav class="wgSiteFooterLinks" aria-label="Footer">
                <router-link to="/explore">
                    Explore
                </router-link>
                <a href="/report" data-testid="footer-report">Report a problem</a>
                <a href="/privacy">Privacy</a>
                <a href="/terms">Terms</a>
                <a :href="sourceUrl" target="_blank" rel="noopener noreferrer">Source</a>
                <a v-if="contactEmail" :href="`mailto:${contactEmail}`">Contact</a>
            </nav>
        </div>
    </footer>
    <div v-else class="lpSiteFooter" :class="{ lpSiteFooterFixed: fixed }">
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
            <a class="lpHref" href="/report">Report a problem</a>
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
        // Pinned to the bottom of the viewport (sign-in and register pages).
        fixed: {
            type: Boolean,
            default: false,
        },
        // The full footer band for public pages; the compact line otherwise.
        site: {
            type: Boolean,
            default: false,
        },
    },
    data() {
        return { siteName, contactEmail, sourceUrl, upstream };
    },
    computed: {
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

.wgSiteFooter {
    background: #14211B;
    color: #C9D6CD;
    font-size: 14px;

    a {
        color: #C9D6CD;

        &:hover {
            color: #fff;
        }
    }

    p {
        margin: 6px 0 0;
    }
}

.wgSiteFooterInner {
    display: flex;
    flex-wrap: wrap;
    gap: 24px;
    justify-content: space-between;
    padding-bottom: 40px;
    padding-top: 40px;
}

.lp .wgSiteFooter .wgSiteFooterMark {
    color: #fff;
    font-family: $font-display;
    font-size: 18px;
    font-stretch: 125%;
    font-weight: 850;
    letter-spacing: 0.02em;
    margin: 0;

    span {
        font-weight: 400;
    }
}

.wgSiteFooterLinks {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 20px;
}
</style>
