<template>
    <div v-click-outside="close" class="wgBell">
        <button
            type="button"
            class="wgBellButton"
            :aria-label="unread ? `Notifications, ${unread} new` : 'Notifications'"
            :aria-expanded="String(open)"
            data-testid="notifications"
            @click="toggle"
        >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
            <span v-if="unread" class="wgBellCount" data-testid="notifications-count">{{ unread > 9 ? '9+' : unread }}</span>
        </button>
        <div v-if="open" class="wgBellMenu" role="dialog" aria-label="Notifications">
            <p class="wgBellTitle">
                Notifications
            </p>
            <p v-if="!items.length" class="wgBellEmpty">
                Nothing yet. Comments and replies on your published lists show up here.
            </p>
            <ul v-else class="wgBellList">
                <li v-for="n in items" :key="n.id" :class="{ wgBellNew: !n.read }">
                    <a :href="n.url" data-testid="notification">
                        <strong>@{{ n.actor }}</strong> {{ verb(n.kind) }} <em v-if="n.kind !== 'follow'">{{ n.listName || 'your list' }}</em>
                        <span class="wgBellTime">{{ ago(n.createdAt) }}</span>
                    </a>
                </li>
            </ul>
            <a href="/notifications" class="wgBellAll" data-testid="notifications-all">All notifications and settings</a>
        </div>
    </div>
</template>

<script>
import { api } from '../utils/format.js';

const VERBS = { comment: 'commented on', suggestion: 'suggested a change to', reply: 'replied to you on', published: 'published', follow: 'started following you' };

export default {
    name: 'NotificationBell',
    data() {
        return { open: false, unread: 0, items: [] };
    },
    mounted() {
        this.refresh();
        this.onVisible = () => {
            if (document.visibilityState === 'visible') this.refresh();
        };
        document.addEventListener('visibilitychange', this.onVisible);
    },
    beforeUnmount() {
        document.removeEventListener('visibilitychange', this.onVisible);
    },
    methods: {
        verb(kind) {
            return VERBS[kind] || 'commented on';
        },
        ago(when) {
            const s = Math.max(0, (Date.now() - new Date(when).getTime()) / 1000);
            if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m`;
            if (s < 86400) return `${Math.floor(s / 3600)}h`;
            return `${Math.floor(s / 86400)}d`;
        },
        async refresh() {
            try {
                const data = await api('/api/notifications');
                this.unread = data.unread;
                this.items = data.items;
            } catch {
                // Offline or signed out: the bell just stays quiet.
            }
        },
        async toggle() {
            this.open = !this.open;
            if (this.open) {
                await this.refresh();
                if (this.unread) {
                    this.unread = 0;
                    api('/api/notifications/read', { method: 'POST', body: '{}' }).catch(() => {});
                }
            }
        },
        close() {
            if (this.open) {
                this.open = false;
                this.items = this.items.map((n) => ({ ...n, read: true }));
            }
        },
    },
};
</script>

<style lang="scss">
.wgBell {
    display: inline-flex;
    position: relative;
}

.wgBellButton {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 999px;
    color: inherit;
    cursor: pointer;
    display: inline-flex;
    height: 40px;
    justify-content: center;
    position: relative;
    width: 40px;

    &:hover {
        background: var(--lp-surface-sunken);
    }
}

.wgBellCount {
    background: #C4571F;
    border: 2px solid var(--lp-surface);
    border-radius: 999px;
    color: #fff;
    font-size: 10px;
    font-weight: 800;
    line-height: 14px;
    min-width: 14px;
    padding: 0 3px;
    position: absolute;
    right: 3px;
    text-align: center;
    top: 3px;
}

.wgBellMenu {
    background: var(--lp-surface);
    border: 1px solid var(--lp-border);
    border-radius: 14px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.16);
    color: var(--lp-text);
    max-height: 420px;
    overflow-y: auto;
    position: absolute;
    right: 0;
    text-align: left;
    top: calc(100% + 6px);
    width: min(340px, calc(100vw - 24px));
    z-index: 1000;
}

.wgBellTitle {
    border-bottom: 1px solid var(--lp-border);
    font-size: 13px;
    font-weight: 700;
    margin: 0;
    padding: 12px 14px;
}

.wgBellEmpty {
    color: var(--lp-text-secondary);
    font-size: 14px;
    margin: 0;
    padding: 14px;
}

.wgBellList {
    list-style: none;
    margin: 0;
    padding: 4px 0;

    a {
        color: var(--lp-text);
        display: block;
        font-size: 14px;
        line-height: 1.4;
        padding: 9px 14px;
        text-decoration: none;

        &:hover {
            background: var(--lp-surface-sunken);
        }
    }

    .wgBellNew a {
        box-shadow: inset 3px 0 0 #C4571F;
    }
}

.wgBellAll {
    border-top: 1px solid var(--lp-border);
    color: var(--lp-link-blue, var(--lp-primary));
    display: block;
    font-size: 13px;
    font-weight: 600;
    padding: 10px 14px;
    text-decoration: none;
}

.wgBellTime {
    color: var(--lp-text-secondary);
    font-size: 12px;
    margin-left: 4px;
}
</style>
