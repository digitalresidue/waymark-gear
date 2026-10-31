<template>
    <div class="wgHome">
        <siteHeader />
        <main id="wgMain" tabindex="-1" class="wgPage wgNotices">
            <div class="wgSectionHead">
                <div>
                    <h1 class="wgH2">
                        Notifications
                    </h1>
                    <p class="wgLede">
                        Comments, replies, shakedown suggestions, new followers, new lists from hikers you follow, and price drops on your wishlist.
                    </p>
                </div>
                <button v-if="unread" type="button" class="wgBtn wgBtnGhost" data-testid="mark-all-read" @click="markRead">
                    Mark all read
                </button>
            </div>

            <p v-if="!signedIn" class="wgCard wgProfileEditNote">
                <router-link to="/signin">
                    Sign in
                </router-link> to see your notifications.
            </p>

            <template v-else>
                <section class="wgCard wgNoticeList">
                    <p v-if="loaded && !items.length" class="wgMuted wgNoticeEmpty">
                        Nothing yet.
                    </p>
                    <ul v-else>
                        <li v-for="n in items" :key="n.id" :class="{ wgNoticeNew: !n.read }" data-testid="notice">
                            <a :href="n.url">
                                <template v-if="n.kind === 'price'"><strong>Price drop:</strong> {{ n.listName }}</template>
                                <template v-else><strong>@{{ n.actor }}</strong> {{ describe(n) }}</template>
                                <span class="wgMuted wgNoticeTime">{{ when(n.createdAt) }}</span>
                            </a>
                        </li>
                    </ul>
                </section>

                <section class="wgCard wgNoticeSettings" data-testid="notice-settings">
                    <h2 class="wgProfileEditH">
                        What to notify me about
                    </h2>
                    <p v-if="settings && !settings.emailAvailable" class="wgMuted wgProfileHint">
                        Email isn't set up on this site yet, so only in-app notifications are sent.
                    </p>
                    <table v-if="settings">
                        <thead>
                            <tr><th><span class="wgVisuallyHidden">Notification</span></th><th>In the app</th><th>Email</th></tr>
                        </thead>
                        <tbody>
                            <tr v-for="k in settings.kinds" :key="k.kind">
                                <th scope="row">
                                    {{ k.label }}
                                </th>
                                <td><input v-model="k.app" type="checkbox" :aria-label="`${k.label} in the app`" :data-testid="`pref-${k.kind}-app`"></td>
                                <td><input v-model="k.email" type="checkbox" :aria-label="`${k.label} by email`" :data-testid="`pref-${k.kind}-email`"></td>
                            </tr>
                        </tbody>
                    </table>
                    <div class="wgProfileActions">
                        <button type="button" class="wgBtn wgBtnPrimary" data-testid="prefs-save" @click="savePrefs">
                            Save settings
                        </button>
                        <span v-if="saved" class="wgMuted" role="status" data-testid="prefs-saved">Saved.</span>
                    </div>
                </section>

                <section class="wgCard wgNoticeSettings">
                    <h2 class="wgProfileEditH">
                        Hikers you follow
                    </h2>
                    <p v-if="!following.length" class="wgMuted wgProfileHint">
                        Follow hikers from their profile or one of their lists. Their new lists show up here and under Explore → Following.
                    </p>
                    <ul v-else class="wgFollowingList" data-testid="following-list">
                        <li v-for="f in following" :key="f.username">
                            <a :href="`/@${f.username}`">{{ f.displayName || `@${f.username}` }}</a>
                            <button type="button" class="wgBtn wgBtnGhost wgBtnSmall" @click="unfollow(f)">
                                Unfollow
                            </button>
                        </li>
                    </ul>
                </section>
            </template>
        </main>
    </div>
</template>

<script>
import siteHeader from '../components/site-header.vue';
import { api } from '../utils/format.js';

const VERBS = {
    comment: (n) => `commented on ${n.listName || 'your list'}`,
    suggestion: (n) => `suggested a change to ${n.listName || 'your list'}`,
    reply: (n) => `replied to you on ${n.listName || 'a list'}`,
    follow: () => 'started following you',
    invite: (n) => `invited you to plan ${n.listName || 'a list'} together`,
    published: (n) => `published ${n.listName || 'a new list'}`,
};

export default {
    name: 'Notifications',
    components: { siteHeader },
    data() {
        return { items: [], unread: 0, loaded: false, settings: null, saved: false, following: [] };
    },
    computed: {
        signedIn() {
            return Boolean(this.$store.state.loggedIn);
        },
    },
    async mounted() {
        document.title = 'Notifications — Waymark Gear';
        if (!this.signedIn) return;
        const [n, s, f] = await Promise.all([
            api('/api/notifications?limit=100').catch(() => ({ items: [], unread: 0 })),
            api('/api/notifications/settings').catch(() => null),
            api('/api/following').catch(() => ({ following: [] })),
        ]);
        this.items = n.items;
        this.unread = n.unread;
        this.settings = s;
        this.following = f.following;
        this.loaded = true;
    },
    methods: {
        describe(n) {
            return (VERBS[n.kind] || VERBS.comment)(n);
        },
        when(t) {
            return new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
        },
        async markRead() {
            await api('/api/notifications/read', { method: 'POST', body: '{}' });
            this.unread = 0;
            this.items = this.items.map((n) => ({ ...n, read: true }));
        },
        async savePrefs() {
            const prefs = Object.fromEntries(this.settings.kinds.map((k) => [k.kind, { app: k.app, email: k.email }]));
            await api('/api/notifications/settings', { method: 'PUT', body: JSON.stringify({ prefs }) });
            this.saved = true;
        },
        async unfollow(f) {
            await api(`/api/users/${encodeURIComponent(f.username)}/follow`, { method: 'DELETE' });
            this.following = this.following.filter((x) => x !== f);
        },
    },
};
</script>

<style lang="scss">
.wgNotices {
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-width: 760px;
    padding: 28px 0 64px;
}

.wgNoticeList ul {
    list-style: none;
    margin: 0;
    padding: 4px 0;

    a {
        color: var(--lp-text);
        display: block;
        padding: 12px 18px;
        text-decoration: none;

        &:hover {
            background: var(--lp-surface-sunken);
        }
    }

    li + li {
        border-top: 1px solid var(--lp-border);
    }

    .wgNoticeNew a {
        box-shadow: inset 3px 0 0 #B04E1B;
    }
}

.wgNoticeEmpty {
    padding: 18px;
}

.wgNoticeTime {
    font-size: 12.5px;
    margin-left: 6px;
}

.wgNoticeSettings {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px 18px;

    table {
        border-collapse: collapse;
        width: 100%;
    }

    th,
    td {
        border-bottom: 1px solid var(--lp-border);
        padding: 8px 6px;
        text-align: center;
    }

    th[scope="row"] {
        font-weight: 500;
        text-align: left;
    }

    thead th {
        color: var(--lp-text-secondary);
        font-size: 12px;
        text-transform: uppercase;
    }

    input[type="checkbox"] {
        accent-color: var(--lp-primary);
        height: 20px;
        width: 20px;
    }
}

.wgFollowingList {
    display: flex;
    flex-direction: column;
    gap: 6px;
    list-style: none;
    margin: 0;
    padding: 0;

    li {
        align-items: center;
        display: flex;
        justify-content: space-between;
    }
}
</style>
