<template>
    <section class="wgReports" data-testid="reported-comments">
        <h2>Reported comments <span v-if="loaded" class="wgReportsCount">{{ reports.length }}</span></h2>
        <p v-if="error" role="alert">
            {{ error }}
        </p>
        <p v-else-if="loaded && !reports.length" class="wgReportsEmpty">
            Nothing to review.
        </p>
        <ul v-else class="wgReportsList">
            <li v-for="r in reports" :key="r.id" data-testid="reported-comment">
                <p class="wgReportsBody">
                    {{ r.removed ? '(deleted by its author or the list owner)' : r.body }}
                </p>
                <p class="wgReportsMeta">
                    by <a :href="`/@${r.author}`" target="_blank" rel="noopener">@{{ r.author }}</a>
                    · <a :href="r.url" target="_blank" rel="noopener">see in context</a>
                    <span v-if="r.hidden"> · hidden</span>
                </p>
                <ul class="wgReportsWhy">
                    <li v-for="(rep, i) in r.reports" :key="i">
                        @{{ rep.reporter }}: {{ rep.reason || 'no reason given' }}
                    </li>
                </ul>
                <div class="wgReportsActions">
                    <button v-if="!r.hidden" type="button" data-testid="report-hide" @click="act(r, 'hide')">
                        Hide comment
                    </button>
                    <button v-else type="button" @click="act(r, 'restore')">
                        Restore
                    </button>
                    <button type="button" data-testid="report-dismiss" @click="act(r, 'dismiss')">
                        Dismiss reports
                    </button>
                </div>
            </li>
        </ul>
    </section>
</template>

<script>
import { api } from '../utils/format.js';

export default {
    name: 'ReportedComments',
    data() {
        return { reports: [], loaded: false, error: '' };
    },
    async mounted() {
        await this.load();
    },
    methods: {
        async load() {
            try {
                this.reports = (await api('/api/moderation/comments')).reports;
                this.loaded = true;
            } catch (err) {
                this.error = err.message;
            }
        },
        async act(report, action) {
            try {
                await api(`/api/moderation/comments/${report.id}`, { method: 'POST', body: JSON.stringify({ action }) });
                this.reports = this.reports.filter((r) => r.id !== report.id);
            } catch (err) {
                this.error = err.message;
            }
        },
    },
};
</script>

<style lang="scss">
.wgReports {
    border: 1px solid var(--lp-border);
    border-radius: 12px;
    margin: 16px 0 24px;
    padding: 12px 16px;

    h2 {
        font-size: 18px;
        margin: 0 0 8px;
    }
}

.wgReportsCount {
    background: #C4571F;
    border-radius: 999px;
    color: #fff;
    font-size: 12px;
    padding: 1px 8px;
    vertical-align: middle;
}

.wgReportsList {
    list-style: none;
    margin: 0;
    padding: 0;

    > li {
        border-top: 1px solid var(--lp-border);
        padding: 12px 0;
    }
}

.wgReportsBody {
    margin: 0 0 4px;
    white-space: pre-wrap;
}

.wgReportsMeta,
.wgReportsWhy {
    color: var(--lp-text-secondary);
    font-size: 13px;
    margin: 0;
}

.wgReportsActions {
    display: flex;
    gap: 8px;
    margin-top: 8px;
}
</style>
