<template>
    <div class="wgHome">
        <siteHeader active="owner" />
        <template v-if="isAdmin">
            <ownerNav active="revenue" />
            <main id="wgMain" tabindex="-1" class="wgPage wgOwner wgRevenue">
                <h1 class="wgH2">
                    Revenue
                </h1>
                <p class="wgLede">
                    Affiliate links on catalog gear and the Supporter plan. Affiliate links only change where Buy buttons go, never which gear is suggested.
                </p>

                <section class="wgCard wgDevCard" data-testid="affiliate-rules">
                    <h2 class="wgProfileEditH">
                        Affiliate rules
                    </h2>
                    <p class="wgMuted wgProfileHint">
                        For product links on these shops, add your tracking parameter. An item's own affiliate link (set in the catalog) wins over these.
                    </p>
                    <label class="wgCheck"><input v-model="settings.enabled" type="checkbox" data-testid="affiliate-enabled"> Use affiliate links</label>
                    <label class="wgCheck"><input v-model="settings.referralTags" type="checkbox" data-testid="referral-tags"> Tag other links as referrals from us</label>
                    <p class="wgMuted wgProfileHint">
                        Buy and brand links that aren't affiliate links get <code>utm_source={{ referralSource }}&amp;utm_medium=referral</code>, so shops see the visits in their analytics. Links that already carry UTM tags are left alone.
                    </p>
                    <table class="wgDevTable">
                        <thead>
                            <tr><th>Shop domain</th><th>Parameter</th><th>Value</th><th><span class="wgVisuallyHidden">Actions</span></th></tr>
                        </thead>
                        <tbody>
                            <tr v-for="(r, i) in settings.rules" :key="i" data-testid="affiliate-rule">
                                <td><input v-model.trim="r.domain" class="wgInput" placeholder="amazon.com" aria-label="Shop domain" data-testid="rule-domain"></td>
                                <td><input v-model.trim="r.param" class="wgInput" placeholder="tag" aria-label="Link parameter" data-testid="rule-param"></td>
                                <td><input v-model.trim="r.value" class="wgInput" placeholder="yourtag-20" aria-label="Parameter value" data-testid="rule-value"></td>
                                <td>
                                    <button type="button" class="wgBtn wgBtnGhost wgBtnSmall" @click="settings.rules.splice(i, 1)">
                                        Remove
                                    </button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                    <div class="wgProfileActions">
                        <button type="button" class="wgBtn wgBtnGhost" data-testid="rule-add" @click="settings.rules.push({ domain: '', param: '', value: '' })">
                            + Add a shop
                        </button>
                        <button type="button" class="wgBtn wgBtnPrimary" data-testid="rules-save" @click="saveRules">
                            Save rules
                        </button>
                        <span v-if="saved" class="wgMuted" role="status" data-testid="rules-saved">Saved.</span>
                    </div>
                </section>

                <section class="wgCard wgDevCard" data-testid="head-tags">
                    <h2 class="wgProfileEditH">
                        Header tags
                    </h2>
                    <p class="wgMuted wgProfileHint">
                        Verification tags from affiliate networks and search engines (Impact, Google Search Console, Pinterest...). Paste each <code>&lt;meta&gt;</code> tag on its own line, up to {{ headTagsMax }}. They're added to the top of every page. Only meta tags are accepted, never scripts.
                    </p>
                    <textarea
                        v-model="headTags"
                        class="wgInput wgHeadTags"
                        rows="6"
                        spellcheck="false"
                        aria-label="Header tags, one meta tag per line"
                        placeholder="<meta name='impact-site-verification' value='your-code-here'>"
                        data-testid="head-tags-input"
                    />
                    <div class="wgProfileActions">
                        <button type="button" class="wgBtn wgBtnPrimary" data-testid="head-tags-save" @click="saveHeadTags">
                            Save tags
                        </button>
                        <span v-if="headTagsSaved" class="wgMuted" role="status" data-testid="head-tags-saved">Saved. {{ headTagsCount }} {{ headTagsCount === 1 ? 'tag is' : 'tags are' }} on every page.</span>
                        <span v-if="headTagsError" class="wgDanger" role="alert" data-testid="head-tags-error">{{ headTagsError }}</span>
                    </div>
                </section>

                <section class="wgCard wgDevCard" data-testid="click-report">
                    <h2 class="wgProfileEditH">
                        Buy clicks, last 30 days
                    </h2>
                    <p v-if="clicks">
                        <strong data-testid="clicks-total">{{ clicks.total }}</strong> clicks,
                        <strong>{{ clicks.affiliate }}</strong> through affiliate links.
                    </p>
                    <table v-if="clicks && clicks.items.length" class="wgDevTable">
                        <tbody>
                            <tr v-for="c in clicks.items" :key="c.id">
                                <td><a :href="`/g/${c.id}`">{{ c.name }}</a></td>
                                <td>{{ c.clicks }}</td>
                                <td class="wgMuted">
                                    {{ c.affiliateClicks }} affiliate
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </section>

                <section class="wgCard wgDevCard" data-testid="brand-report">
                    <h2 class="wgProfileEditH">
                        Visitors sent to brands
                    </h2>
                    <p class="wgMuted wgProfileHint">
                        Clicks to each brand's products and to its own site, by calendar month. Copy a summary to send them: it's the easiest way to start a conversation about working together.
                    </p>
                    <label class="wgField wgReportMonth">Month
                        <select v-model="reportMonth" class="wgSelect" data-testid="brand-report-month" @change="loadBrandReport">
                            <option v-for="m in reportMonths" :key="m.month" :value="m.month">{{ m.label }}</option>
                        </select>
                    </label>
                    <p v-if="report && !report.brands.length" class="wgMuted">
                        No clicks to any brand in {{ report.period.label }}.
                    </p>
                    <table v-if="report && report.brands.length" class="wgDevTable wgBrandReport">
                        <thead>
                            <tr><th>Brand</th><th>Visitors</th><th>Products</th><th>Their site</th><th>Most clicked</th><th><span class="wgVisuallyHidden">Summary</span></th></tr>
                        </thead>
                        <tbody>
                            <tr v-for="b in report.brands" :key="b.name" data-testid="brand-report-row">
                                <td>{{ b.name }}</td>
                                <td><strong>{{ b.total }}</strong></td>
                                <td>{{ b.productVisits }}</td>
                                <td>{{ b.siteVisits }}</td>
                                <td class="wgMuted">
                                    {{ b.items.slice(0, 2).map((i) => i.name).join(', ') }}
                                </td>
                                <td>
                                    <button type="button" class="wgBtn wgBtnGhost wgBtnSmall" data-testid="brand-report-copy" :title="b.summary" @click="copySummary(b)">
                                        {{ copied === b.name ? 'Copied' : 'Copy summary' }}
                                    </button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                    <p v-if="copiedText" class="wgBrandSummary" role="status" data-testid="brand-report-summary">
                        {{ copiedText }}
                    </p>
                </section>

                <section class="wgCard wgDevCard" data-testid="supporters-admin">
                    <h2 class="wgProfileEditH">
                        Supporters
                    </h2>
                    <p class="wgMuted wgProfileHint">
                        {{ planAvailable ? 'Stripe is set up: people can subscribe at /supporter.' : 'Stripe isn\'t set up yet (see DEPLOY.md), so only people you add here are Supporters.' }}
                    </p>
                    <form class="wgDevNew" @submit.prevent="grant">
                        <label class="wgField">Username
                            <input v-model.trim="grantName" class="wgInput" data-testid="grant-username">
                        </label>
                        <label class="wgField">For
                            <select v-model.number="grantMonths" class="wgSelect">
                                <option :value="1">1 month</option>
                                <option :value="12">1 year</option>
                                <option :value="0">Always</option>
                            </select>
                        </label>
                        <button type="submit" class="wgBtn wgBtnPrimary" :disabled="!grantName" data-testid="grant-submit">
                            Make Supporter
                        </button>
                    </form>
                    <p v-if="error" class="wgImportError" role="alert">
                        {{ error }}
                    </p>
                    <ul class="wgDevTokens" data-testid="supporter-list">
                        <li v-for="s in supporters" :key="s.username">
                            <span>
                                <a :href="`/@${s.username}`">@{{ s.username }}</a>
                                <span class="wgMuted"> · {{ s.source === 'stripe' ? 'pays through Stripe' : 'granted' }} · {{ s.until ? `until ${day(s.until)}` : 'no end date' }}{{ s.active ? '' : ' · ended' }}</span>
                            </span>
                            <button v-if="s.source === 'granted'" type="button" class="wgBtn wgBtnGhost wgBtnSmall" @click="ungrant(s)">
                                End
                            </button>
                        </li>
                    </ul>
                </section>
            </main>
        </template>
        <main v-else id="wgMain" tabindex="-1" class="wgPage wgOwner">
            <div class="wgEmpty">
                <p><strong>Owner access only.</strong></p>
            </div>
        </main>
        <siteFooter site />
    </div>
</template>

<script>
import siteHeader from '../components/site-header.vue';
import siteFooter from '../components/site-footer.vue';
import ownerNav from '../components/owner-nav.vue';
import { api } from '../utils/format.js';

export default {
    name: 'OwnerRevenue',
    components: { siteHeader, siteFooter, ownerNav },
    data() {
        return { settings: { enabled: true, rules: [] }, clicks: null, supporters: [], planAvailable: false, saved: false, headTags: '', headTagsMax: 10, headTagsSaved: false, headTagsCount: 0, headTagsError: '', grantName: '', grantMonths: 12, error: '', referralSource: 'waymarkgear.com', report: null, reportMonth: '', reportMonths: [], copied: '', copiedText: '' };
    },
    computed: {
        isAdmin() {
            return Boolean(this.$store.state.account && this.$store.state.account.isAdmin);
        },
    },
    async mounted() {
        document.title = 'Revenue — Waymark Gear';
        if (!this.isAdmin) return;
        await Promise.all([this.loadAffiliate(), this.loadSupporters(), this.loadHeadTags(), this.loadBrandReport()]);
        const plan = await api('/api/plan').catch(() => ({}));
        this.planAvailable = Boolean(plan.available);
    },
    methods: {
        day(when) {
            return new Date(when).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        },
        async loadAffiliate() {
            const r = await api('/api/admin/affiliate');
            this.settings = r.settings;
            this.clicks = r.clicks;
            if (r.referralSource) this.referralSource = r.referralSource;
        },
        async loadBrandReport() {
            const q = this.reportMonth ? `?month=${encodeURIComponent(this.reportMonth)}` : '';
            const r = await api(`/api/admin/brand-report${q}`);
            this.report = r;
            this.reportMonths = r.months;
            this.reportMonth = r.period.month;
            this.copied = '';
            this.copiedText = '';
        },
        async copySummary(b) {
            // Shown on the page as well, in case the clipboard isn't allowed.
            this.copiedText = b.summary;
            try {
                await navigator.clipboard.writeText(b.summary);
                this.copied = b.name;
            } catch {
                this.copied = '';
            }
        },
        async loadHeadTags() {
            const r = await api('/api/admin/head-tags');
            this.headTags = r.text;
            this.headTagsMax = r.max;
        },
        async saveHeadTags() {
            this.headTagsSaved = false;
            this.headTagsError = '';
            try {
                const r = await api('/api/admin/head-tags', { method: 'PUT', body: JSON.stringify({ text: this.headTags }) });
                this.headTags = r.text;
                this.headTagsCount = r.count;
                this.headTagsSaved = true;
            } catch (err) {
                this.headTagsError = err.message;
            }
        },
        async loadSupporters() {
            this.supporters = (await api('/api/admin/supporters')).supporters;
        },
        async saveRules() {
            this.saved = false;
            const r = await api('/api/admin/affiliate', { method: 'PUT', body: JSON.stringify(this.settings) });
            this.settings = r.settings;
            this.saved = true;
        },
        async grant() {
            this.error = '';
            try {
                await api('/api/admin/supporters', { method: 'POST', body: JSON.stringify({ username: this.grantName, months: this.grantMonths }) });
                this.grantName = '';
                await this.loadSupporters();
            } catch (err) {
                this.error = err.message;
            }
        },
        async ungrant(s) {
            await api(`/api/admin/supporters/${encodeURIComponent(s.username)}`, { method: 'DELETE' });
            await this.loadSupporters();
        },
    },
};
</script>

<style lang="scss">
@import "../css/_globals";

.wgReportMonth {
    max-width: 240px;
}

.wgBrandSummary {
    background: var(--lp-surface-sunken);
    border-radius: 10px;
    margin: 12px 0 0;
    padding: 10px 12px;
}

.wgHeadTags {
    font-family: $font-mono;
    font-size: 12.5px;
    margin: 4px 0 10px;
    width: 100%;
}

.wgRevenue {
    max-width: 900px;

    .wgDevCard {
        margin: 0 0 16px;
        padding: 16px 18px;
    }

    .wgDevTable td:first-child {
        width: auto;
    }

    // On a phone each rule stacks: domain, parameter, value, remove.
    @media (max-width: 720px) {
        [data-testid="affiliate-rules"] .wgDevTable {
            thead {
                display: none;
            }

            tr {
                border-top: 1px solid var(--lp-border);
                display: grid;
                gap: 6px;
                grid-template-columns: 1fr 1fr;
                padding: 8px 0;
            }

            td {
                border: 0;
                padding: 0;
            }

            td:first-child {
                grid-column: 1 / -1;
            }
        }
    }

    .wgDevTable th {
        color: var(--lp-text-secondary);
        font-size: 12px;
        text-align: left;
    }
}
</style>
