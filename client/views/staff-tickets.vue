<template>
    <div class="wgHome">
        <siteHeader />
        <main class="wgPage wgTickets">
            <div class="wgSectionHead">
                <div>
                    <h1 class="wgH2">
                        Tickets
                    </h1>
                    <p class="wgLede">
                        Problems people reported. Most urgent first, then oldest.
                    </p>
                </div>
                <label class="wgExploreSort">
                    <span class="wgMuted">Show</span>
                    <select v-model="status" class="wgSelect" data-testid="tickets-status" @change="load">
                        <option value="active">Open and in progress</option>
                        <option value="open">Open</option>
                        <option value="in_progress">In progress</option>
                        <option value="resolved">Resolved</option>
                        <option value="wont_fix">Won't fix</option>
                        <option value="all">All</option>
                    </select>
                </label>
            </div>
            <p v-if="error" class="wgImportError" role="alert">
                {{ error }}
            </p>
            <p v-else-if="loaded && !tickets.length" class="wgCard wgProfileEditNote">
                Nothing here.
            </p>
            <ul class="wgTicketList">
                <li v-for="t in tickets" :key="t.id" class="wgCard wgTicket" :class="`wgPri-${t.priority}`" data-testid="ticket">
                    <div class="wgTicketHead">
                        <strong>#{{ t.id }} · {{ t.kindLabel }}</strong>
                        <span class="wgMuted">{{ t.reporter ? `@${t.reporter}` : 'anonymous' }} · {{ when(t.createdAt) }}</span>
                    </div>
                    <p v-if="t.targetLabel || t.targetUrl" class="wgTicketTarget">
                        {{ t.targetLabel }} <a v-if="t.targetUrl" :href="t.targetUrl" target="_blank" rel="noopener">{{ t.targetUrl }}</a>
                    </p>
                    <p class="wgTicketBody">
                        {{ t.body }}
                    </p>
                    <div class="wgTicketFields">
                        <label>Status
                            <select :value="t.status" class="wgSelect" data-testid="ticket-status" @change="update(t, { status: $event.target.value })">
                                <option value="open">Open</option>
                                <option value="in_progress">In progress</option>
                                <option value="resolved">Resolved</option>
                                <option value="wont_fix">Won't fix</option>
                            </select>
                        </label>
                        <label>Priority
                            <select :value="t.priority" class="wgSelect" data-testid="ticket-priority" @change="update(t, { priority: $event.target.value })">
                                <option value="urgent">Urgent</option>
                                <option value="high">High</option>
                                <option value="normal">Normal</option>
                                <option value="low">Low</option>
                            </select>
                        </label>
                        <label>Assignee
                            <input :value="t.assignee" class="wgInput" placeholder="username" data-testid="ticket-assignee" @change="update(t, { assignee: $event.target.value })">
                        </label>
                    </div>
                    <label class="wgField">Staff notes
                        <textarea :value="t.staffNotes" class="wgInput" rows="2" @change="update(t, { staffNotes: $event.target.value })" />
                    </label>
                </li>
            </ul>
        </main>
    </div>
</template>

<script>
import siteHeader from '../components/site-header.vue';
import { api } from '../utils/format.js';

export default {
    name: 'StaffTickets',
    components: { siteHeader },
    data() {
        return { status: 'active', tickets: [], loaded: false, error: '' };
    },
    mounted() {
        document.title = 'Tickets — Waymark Gear';
        this.load();
    },
    methods: {
        when(t) {
            return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        },
        async load() {
            try {
                this.tickets = (await api(`/api/staff/tickets?status=${this.status}`)).tickets;
                this.loaded = true;
                this.error = '';
            } catch (err) {
                this.error = err.status === 403 || err.status === 401 ? 'Tickets are for site staff.' : err.message;
            }
        },
        async update(ticket, patch) {
            try {
                Object.assign(ticket, await api(`/api/staff/tickets/${ticket.id}`, { method: 'PATCH', body: JSON.stringify(patch) }));
            } catch (err) {
                this.error = err.message;
            }
        },
    },
};
</script>

<style lang="scss">
.wgTickets {
    padding: 28px 0 64px;
}

.wgTicketList {
    display: flex;
    flex-direction: column;
    gap: 12px;
    list-style: none;
    margin: 16px 0 0;
    padding: 0;
}

.wgTicket {
    border-left: 4px solid var(--lp-border);
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px 16px;

    p {
        margin: 0;
    }
}

.wgPri-urgent {
    border-left-color: #B3261E;
}

.wgPri-high {
    border-left-color: #C4571F;
}

.wgTicketHead {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    justify-content: space-between;
}

.wgTicketBody {
    white-space: pre-wrap;
}

.wgTicketTarget {
    font-size: 13px;
}

.wgTicketFields {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 16px;

    label {
        align-items: center;
        display: inline-flex;
        font-size: 13px;
        gap: 6px;
    }

    .wgSelect,
    .wgInput {
        width: auto;
    }
}
</style>
