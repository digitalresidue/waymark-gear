<template>
    <div class="wgHome">
        <siteHeader active="owner" />
        <template v-if="isOwner">
            <ownerNav active="members" />
            <main id="wgMain" tabindex="-1" class="wgPage wgOwner wgMembers">
                <div class="wgSectionHead">
                    <div>
                        <h1 class="wgH2">
                            Members
                        </h1>
                        <p class="wgLede">
                            Everyone who has signed up, newest first. Only owners see this page; it includes email addresses, so treat it as private.
                        </p>
                    </div>
                </div>

                <section class="wgCard wgDevCard">
                    <p v-if="total !== null" class="wgMembersTotals" data-testid="members-totals">
                        <strong>{{ total.toLocaleString() }}</strong> {{ total === 1 ? 'member' : 'members' }}<template v-if="!q && !supporter">
                            ,
                            <strong>{{ supporters.toLocaleString() }}</strong> {{ supporters === 1 ? 'Supporter' : 'Supporters' }}
                        </template>
                    </p>
                    <form class="wgMembersFilters" role="search" @submit.prevent="search">
                        <label class="wgField">Search
                            <input v-model.trim="q" type="search" class="wgInput" placeholder="Username, name or email" data-testid="members-search">
                        </label>
                        <label class="wgField">Supporter
                            <select v-model="supporter" class="wgSelect" data-testid="members-supporter" @change="search">
                                <option value="">Everyone</option>
                                <option value="yes">Supporters</option>
                                <option value="no">Free</option>
                            </select>
                        </label>
                        <button type="submit" class="wgBtn wgBtnGhost">
                            Search
                        </button>
                    </form>

                    <div class="wgMembersScroll">
                        <table class="wgDevTable wgMembersTable" data-testid="members-list">
                            <thead>
                                <tr><th>Member</th><th>Email</th><th>Joined</th><th>Last seen</th><th>Plan</th><th>Lists</th></tr>
                            </thead>
                            <tbody>
                                <tr v-for="u in users" :key="u.username" data-testid="member-row">
                                    <td>
                                        <a :href="`/@${u.username}`">@{{ u.username }}</a>
                                        <span v-if="u.role" class="wgBadge">{{ u.role }}</span>
                                        <div v-if="u.name || u.trailName" class="wgMuted">
                                            {{ [u.name, u.trailName && `"${u.trailName}"`].filter(Boolean).join(' ') }}
                                        </div>
                                    </td>
                                    <td class="wgMembersEmail">
                                        {{ u.email }}
                                    </td>
                                    <td class="wgMuted">
                                        {{ day(u.joined) }}
                                    </td>
                                    <td class="wgMuted">
                                        {{ day(u.lastSeen) }}
                                    </td>
                                    <td data-testid="member-plan">
                                        <template v-if="u.supporter">
                                            <span class="wgBadge wgBadgeSupporter">Supporter</span>
                                            <div class="wgMuted">
                                                {{ planDetail(u) }}
                                            </div>
                                        </template>
                                        <span v-else class="wgMuted">Free</span>
                                    </td>
                                    <td>{{ u.lists }}<span v-if="u.published" class="wgMuted"> ({{ u.published }} public)</span></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <div v-if="total > pageSize" class="wgMembersPager">
                        <button type="button" class="wgBtn wgBtnGhost wgBtnSmall" :disabled="!offset" @click="page(-1)">
                            Newer
                        </button>
                        <span class="wgMuted">{{ offset + 1 }}–{{ Math.min(offset + pageSize, total) }} of {{ total }}</span>
                        <button type="button" class="wgBtn wgBtnGhost wgBtnSmall" :disabled="offset + pageSize >= total" @click="page(1)">
                            Older
                        </button>
                    </div>
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

const SOURCES = { stripe: 'paid', granted: 'gift from you' };

export default {
    name: 'OwnerMembers',
    components: { siteHeader, siteFooter, ownerNav },
    data() {
        return { users: [], total: null, supporters: 0, q: '', supporter: '', offset: 0, pageSize: 50 };
    },
    computed: {
        isOwner() {
            return Boolean(this.$store.state.account && this.$store.state.account.isOwner);
        },
    },
    async mounted() {
        document.title = 'Members — Waymark Gear';
        if (this.isOwner) await this.load();
    },
    methods: {
        day(when) {
            return when ? new Date(when).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
        },
        planDetail(u) {
            const how = SOURCES[u.supporterSource] || u.supporterSource;
            const until = u.supporterUntil ? `until ${this.day(u.supporterUntil)}` : 'no end date';
            return [how, until].filter(Boolean).join(', ');
        },
        async load() {
            const params = new URLSearchParams({ limit: String(this.pageSize), offset: String(this.offset) });
            if (this.q) params.set('q', this.q);
            if (this.supporter) params.set('supporter', this.supporter);
            const r = await api(`/api/owner/users?${params}`);
            this.users = r.users;
            this.total = r.total;
            this.supporters = r.supporters;
        },
        search() {
            this.offset = 0;
            return this.load();
        },
        page(dir) {
            this.offset = Math.max(0, this.offset + dir * this.pageSize);
            return this.load();
        },
    },
};
</script>

<style lang="scss">
.wgMembers {
    max-width: 1100px;

    .wgDevCard {
        padding: 16px 18px;
    }
}

.wgMembersFilters {
    align-items: end;
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 12px;

    .wgField:first-child {
        flex: 1 1 260px;
    }
}

.wgMembersScroll {
    overflow-x: auto;
}

.wgMembersEmail {
    word-break: break-all;
}

.wgBadgeSupporter {
    background: var(--lp-primary);
    color: var(--lp-primary-ink);
}

.wgMembersPager {
    align-items: center;
    display: flex;
    gap: 12px;
    justify-content: center;
    margin-top: 12px;
}
</style>
