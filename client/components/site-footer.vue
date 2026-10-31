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
                <div v-if="social.length" class="wgSiteFooterSocial" data-testid="footer-social">
                    <span>Find us</span>
                    <ul>
                        <li v-for="s in social" :key="s.url">
                            <!-- eslint-disable-next-line vue/no-v-html -- fixed drawings from client/social-icons.js -->
                            <a :href="s.url" target="_blank" rel="noopener noreferrer me" :aria-label="s.label" :title="s.name" data-testid="footer-social-link" v-html="s.svg" />
                        </li>
                    </ul>
                </div>
            </div>
            <nav class="wgSiteFooterLinks" aria-label="Footer">
                <a href="/explore">Explore gear</a>
                <router-link to="/kits">
                    Kits
                </router-link>
                <router-link to="/supporter" data-testid="footer-supporter">
                    Support Waymark
                </router-link>
                <router-link to="/developers">
                    API and AI
                </router-link>
                <a href="/report" data-testid="footer-report">Report a problem</a>
                <a href="/privacy">Privacy</a>
                <a href="/terms">Terms</a>
                <button type="button" class="wgCookieSettings" data-cookie-settings>
                    Cookie settings
                </button>
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
            <span class="wgCookieSettings">
                -
                <button type="button" class="lpHref" data-cookie-settings>Cookie settings</button>
            </span>
        </div>
    </div>
</template>

<script>
import { siteName, contactEmail, sourceUrl, upstream, socialLinks } from '../brand.js';
import { withIcons } from '../social-icons.js';

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
        return { siteName, contactEmail, sourceUrl, upstream, social: withIcons(socialLinks) };
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

// .wgSiteFooter (the full site footer) lives in css/components/_site-chrome.scss,
// shared with the server-rendered pages.
</style>
