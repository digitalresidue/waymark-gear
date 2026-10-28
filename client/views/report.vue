<template>
    <div class="wgHome">
        <siteHeader />
        <main class="wgPage wgReportPage">
            <h1 class="wgH2">
                Report a problem
            </h1>
            <p class="wgLede">
                Wrong weight or specs in the gear catalog, something off with a list, or a bug? Tell us here. Every report becomes a ticket our team works through.
            </p>
            <div v-if="sent" class="wgCard wgReportDone" role="status" data-testid="report-sent">
                <strong>Thanks, we've got it.</strong> Ticket #{{ sent }} is in the queue.
                <p>
                    <a :href="backTo">Go back</a>
                </p>
            </div>
            <form v-else class="wgCard wgReportForm" data-testid="report-form" @submit.prevent="send">
                <label class="wgField">What's it about?
                    <select v-model="kind" class="wgSelect" data-testid="report-kind">
                        <option value="catalog">Gear catalog error (weight, specs, link)</option>
                        <option value="list">Problem with a list</option>
                        <option value="bug">Site bug</option>
                        <option value="other">Something else</option>
                    </select>
                </label>
                <label class="wgField">Which item or page? <span class="wgMuted">(optional)</span>
                    <input v-model.trim="label" class="wgInput" maxlength="200" placeholder="e.g. Zpacks Duplex" data-testid="report-label">
                </label>
                <label class="wgField">What's wrong?
                    <textarea v-model="body" class="wgInput" rows="6" maxlength="4000" placeholder="e.g. Listed at 19 oz, but the maker says 18.5 oz (link)." data-testid="report-body" />
                </label>
                <p v-if="url" class="wgMuted wgProfileHint">
                    About: <code>{{ url }}</code>
                </p>
                <p v-if="error" class="wgImportError" role="alert">
                    {{ error }}
                </p>
                <div class="wgProfileActions">
                    <button type="submit" class="wgBtn wgBtnPrimary" :disabled="busy || body.trim().length < 5" data-testid="report-send">
                        Send report
                    </button>
                </div>
            </form>
        </main>
    </div>
</template>

<script>
import siteHeader from '../components/site-header.vue';
import { api } from '../utils/format.js';

export default {
    name: 'ReportProblem',
    components: { siteHeader },
    data() {
        const q = this.$route.query;
        return {
            kind: ['catalog', 'list', 'bug', 'other'].includes(q.kind) ? q.kind : 'other',
            label: String(q.label || '').slice(0, 200),
            url: /^\/[^/]/.test(String(q.url || '')) ? String(q.url) : '',
            body: '',
            busy: false,
            error: '',
            sent: 0,
        };
    },
    computed: {
        backTo() {
            return this.url || '/';
        },
    },
    mounted() {
        document.title = 'Report a problem — Waymark Gear';
    },
    methods: {
        async send() {
            this.busy = true;
            this.error = '';
            try {
                const r = await api('/api/tickets', {
                    method: 'POST',
                    body: JSON.stringify({ kind: this.kind, targetLabel: this.label, targetUrl: this.url, body: this.body }),
                });
                this.sent = r.id;
            } catch (err) {
                this.error = err.message;
            } finally {
                this.busy = false;
            }
        },
    },
};
</script>

<style lang="scss">
.wgReportPage {
    max-width: 680px;
    padding: 28px 0 64px;
}

.wgReportForm,
.wgReportDone {
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin-top: 16px;
    padding: 18px;
}
</style>
