<template>
    <footer v-if="site" class="wgSiteFooter">
        <div class="wgPage wgSiteFooterInner">
            <div>
                <p class="wgSiteFooterMark">
                    WAYMARK <span>GEAR</span>
                </p>
                <!-- eslint-disable-next-line vue/no-v-html -- tHtml escapes the translation; only the link is HTML -->
                <p v-html="`waymarkgear.com · ${basedOn}`" />
                <div v-if="social.length" class="wgSiteFooterSocial" data-testid="footer-social">
                    <span>{{ $t('footer.findUs') }}</span>
                    <ul>
                        <li v-for="s in social" :key="s.url">
                            <!-- eslint-disable-next-line vue/no-v-html -- fixed drawings from client/social-icons.js -->
                            <a :href="s.url" target="_blank" rel="noopener noreferrer me" :aria-label="s.label" :title="s.name" data-testid="footer-social-link" v-html="s.svg" />
                        </li>
                    </ul>
                </div>
            </div>
            <nav class="wgSiteFooterLinks" :aria-label="$t('footer.label')">
                <a href="/explore">{{ $t('footer.exploreGear') }}</a>
                <router-link to="/kits">
                    {{ $t('footer.kits') }}
                </router-link>
                <router-link to="/supporter" data-testid="footer-supporter">
                    {{ $t('footer.support') }}
                </router-link>
                <router-link to="/developers">
                    {{ $t('footer.api') }}
                </router-link>
                <a href="/report" data-testid="footer-report">{{ $t('footer.report') }}</a>
                <a href="/privacy">{{ $t('footer.privacy') }}</a>
                <a href="/terms">{{ $t('footer.terms') }}</a>
                <a href="/accessibility">{{ $t('footer.accessibility') }}</a>
                <button type="button" class="wgCookieSettings" data-cookie-settings>
                    {{ $t('footer.cookies') }}
                </button>
                <a :href="sourceUrl" target="_blank" rel="noopener noreferrer">{{ $t('footer.source') }}</a>
                <a v-if="contactEmail" :href="`mailto:${contactEmail}`">{{ $t('footer.contact') }}</a>
            </nav>
            <label class="wgLangPicker">
                <span>{{ $t('footer.language') }}</span>
                <select class="wgSelect" :value="language" data-testid="language-picker" @change="pickLanguage($event.target.value)">
                    <option v-for="l in languages" :key="l.code" :value="l.code" :lang="l.code">{{ l.name }}</option>
                </select>
            </label>
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
            -
            <a class="lpHref" href="/accessibility">Accessibility</a>
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
import { LANGUAGES, escapeHtml, tHtml } from '../utils/i18n.js';
import { chooseLanguage, currentLanguage } from '../utils/i18n-app.js';

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
        return { siteName, contactEmail, sourceUrl, upstream, social: withIcons(socialLinks), languages: LANGUAGES };
    },
    computed: {
        year() {
            return new Date().getFullYear();
        },
        language() {
            return currentLanguage();
        },
        basedOn() {
            return tHtml(this.$t, 'footer.basedOn', {
                project: `<a href="${escapeHtml(upstream.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(upstream.name)}</a>`,
                author: escapeHtml(upstream.author),
            });
        },
    },
    methods: {
        async pickLanguage(code) {
            await chooseLanguage(code);
        },
    },
};
</script>

<style lang="scss">
@import "../css/_globals";

// Links sitting in a line of text are underlined, not told apart by colour alone.
.lpSiteFooterCredit .lpHref,
.lpSiteFooterLinks .lpHref {
    text-decoration: underline;
    text-underline-offset: 2px;
}

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
