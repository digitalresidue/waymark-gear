<template>
    <div class="wgHome">
        <siteHeader active="owner" />
        <template v-if="isOwner">
            <ownerNav :key="navKey" active="activity" />
            <main id="wgMain" tabindex="-1" class="wgPage wgOwner wgActivity">
                <div class="wgSectionHead">
                    <div>
                        <h1 class="wgH2">
                            Activity
                        </h1>
                        <p class="wgLede">
                            Every change made with admin or owner powers, newest first. Requests from admins wait at the top for your OK.
                        </p>
                    </div>
                </div>

                <section v-if="pendingRows.length" class="wgCard wgDevCard wgActivityPending" data-testid="activity-pending">
                    <h2 class="wgProfileEditH">
                        Waiting for you ({{ pendingRows.length }})
                    </h2>
                    <ul class="wgActivityList">
                        <li v-for="a in pendingRows" :key="a.id" data-testid="activity-request">
                            <div>
                                <strong>{{ a.summary || a.action }}</strong>
                                <span class="wgMuted"> · asked by @{{ a.username }} ({{ a.role }}), {{ when(a.at) }}</span>
                                <div v-if="a.detail" class="wgMuted">
                                    {{ a.detail }}
                                </div>
                            </div>
                            <div class="wgActivityButtons">
                                <button type="button" class="wgBtn wgBtnPrimary wgBtnSmall" data-testid="activity-approve" :disabled="busy === a.id" @click="decide(a, 'approve')">
                                    Approve
                                </button>
                                <button type="button" class="wgBtn wgBtnGhost wgBtnSmall" data-testid="activity-reject" :disabled="busy === a.id" @click="decide(a, 'reject')">
                                    Turn down
                                </button>
                            </div>
                        </li>
                    </ul>
                    <p v-if="error" class="wgDanger" role="alert">
                        {{ error }}
                    </p>
                </section>

                <section class="wgCard wgDevCard">
                    <h2 class="wgProfileEditH">
                        Log
                    </h2>
                    <label class="wgField wgActivityFilter">Show
                        <select v-model="filter" class="wgSelect" data-testid="activity-filter" @change="load">
                            <option value="">Everything</option>
                            <option value="done">Changes made</option>
                            <option value="approved">Approved requests</option>
                            <option value="rejected">Turned-down requests</option>
                            <option value="failed">Approved but failed</option>
                        </select>
                    </label>
                    <p v-if="!logRows.length" class="wgMuted">
                        Nothing yet.
                    </p>
                    <table v-else class="wgDevTable" data-testid="activity-log">
                        <thead>
                            <tr><th>When</th><th>Who</th><th>What</th><th>Status</th></tr>
                        </thead>
                        <tbody>
                            <tr v-for="a in logRows" :key="a.id" data-testid="activity-row">
                                <td class="wgMuted">
                                    {{ when(a.at) }}
                                </td>
                                <td>@{{ a.username }} <span class="wgMuted">{{ a.role }}</span></td>
                                <td>
                                    {{ a.summary || describe(a.action) }}
                                    <div v-if="a.summary" class="wgMuted wgMono wgActivityPath">
                                        {{ describe(a.action) }}
                                    </div>
                                </td>
                                <td>
                                    <span :class="`wgBadge wgActivity-${a.status}`">{{ statusLabel(a) }}</span>
                                    <div v-if="a.note" class="wgMuted">
                                        {{ a.note }}
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </section>
            </main>
        </template>
        <main v-else id="wgMain" tabindex="-1" class="wgPage wgOwner">
            <div class="wgEmpty">
                <p><strong>Site owner only.</strong></p>
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

const STATUS = { done: 'Done', pending: 'Waiting', approved: 'Approved', rejected: 'Turned down', failed: 'Failed' };

export default {
    name: 'OwnerActivity',
    components: { siteHeader, siteFooter, ownerNav },
    data() {
        return { pendingRows: [], logRows: [], filter: '', busy: 0, error: '', navKey: 0 };
    },
    computed: {
        isOwner() {
            return Boolean(this.$store.state.account && this.$store.state.account.isOwner);
        },
    },
    async mounted() {
        document.title = 'Activity — Waymark Gear';
        if (this.isOwner) await this.load();
    },
    methods: {
        when(at) {
            return new Date(at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
        },
        // "PUT /api/admin/brands/…" -> "Changed a brand".
        describe(action) {
            const m = /^(POST|PUT|PATCH|DELETE) \/api\/(?:admin|owner)\/([a-z-]+)(?:\/([^/]+))?(?:\/(.+))?/.exec(action || '');
            if (!m) return action;
            const verb = { POST: 'Added or ran', PUT: 'Changed', PATCH: 'Changed', DELETE: 'Removed' }[m[1]];
            const what = [m[2], m[3] && !/^[0-9a-f-]{8,}$/.test(m[3]) ? m[3] : '', m[4] || ''].filter(Boolean).join(' ').replace(/[-/]/g, ' ');
            return `${verb}: ${what}`;
        },
        statusLabel(a) {
            const base = STATUS[a.status] || a.status;
            return a.decidedBy && a.status !== 'pending' ? `${base} by @${a.decidedBy}` : base;
        },
        async load() {
            const [pending, log] = await Promise.all([
                api('/api/owner/activity?status=pending&limit=200'),
                api(`/api/owner/activity${this.filter ? `?status=${this.filter}` : ''}`),
            ]);
            this.pendingRows = pending.actions;
            this.logRows = log.actions.filter((a) => a.status !== 'pending');
        },
        async decide(a, decision) {
            this.error = '';
            this.busy = a.id;
            try {
                await api(`/api/owner/activity/${a.id}/${decision}`, { method: 'POST', body: '{}' });
            } catch (err) {
                this.error = err.message;
            }
            this.busy = 0;
            await this.load();
            this.navKey += 1;
        },
    },
};
</script>

<style lang="scss">
.wgActivity {
    max-width: 1000px;

    .wgDevCard {
        margin: 0 0 16px;
        padding: 16px 18px;
    }
}

.wgActivityPending {
    border-color: var(--lp-accent);
}

.wgActivityList {
    list-style: none;
    margin: 0;
    padding: 0;

    li {
        align-items: center;
        border-top: 1px solid var(--lp-border);
        display: flex;
        flex-wrap: wrap;
        gap: 10px 16px;
        justify-content: space-between;
        padding: 10px 0;
    }
}

.wgActivityButtons {
    display: flex;
    gap: 8px;
}

.wgActivityFilter {
    max-width: 260px;
}

.wgActivityPath {
    font-size: 12px;
}
</style>
