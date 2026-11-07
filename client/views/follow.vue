<template>
    <div class="wgHome">
        <siteHeader />
        <main id="wgMain" tabindex="-1" class="wgPage wgFollow">
            <header class="wgFollowHero">
                <p class="wgEyebrow">
                    Follow
                </p>
                <h1 class="wgH2">
                    Follow backpackers, track adventures, share your journey—on your terms.
                </h1>
            </header>

            <p v-if="!signedIn" class="wgCard wgFollowNote">
                <router-link to="/signin">
                    Sign in
                </router-link> to follow backpackers and see their adventures.
            </p>

            <p v-else-if="denied" class="wgCard wgFollowNote" data-testid="follow-unavailable">
                Follow isn't open yet. Check back soon.
            </p>

            <template v-else>
                <!-- The owner tries it out first, then opens it to everyone. -->
                <section v-if="feed" class="wgCard wgFollowOwner" data-testid="follow-owner">
                    <div>
                        <strong>{{ feed.open ? 'Open to every member' : 'Owner only while you test it' }}</strong>
                        <p class="wgMuted">
                            {{ feed.open
                                ? 'Follow is in every member\'s menu.'
                                : 'Only you see Follow in the menu. Open it when it\'s ready, and every member gets it.' }}
                        </p>
                    </div>
                    <toggle :model-value="feed.open" data-testid="follow-open" @update:model-value="setOpen">
                        Open to everyone
                    </toggle>
                </section>

                <div class="wgFollowIntro">
                    <button type="button" class="wgCard wgFollowTile" :aria-pressed="String(tab === 'discover')" data-testid="tile-discover" @click="show('discover')">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></svg>
                        <span>
                            <strong>Follow Backpackers</strong>
                            <span>Discover and follow other backpackers. See their public gear, trips, and adventures in your feed.</span>
                        </span>
                    </button>
                    <button type="button" class="wgCard wgFollowTile" :aria-pressed="String(tab === 'timeline')" data-testid="tile-timeline" @click="show('timeline')">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h4l3-8 4 16 3-8h4" /></svg>
                        <span>
                            <strong>Activity Timeline</strong>
                            <span>Stay inspired with a personalized feed of trips, gear additions, and pack updates from people you follow.</span>
                        </span>
                    </button>
                </div>

                <div class="wgFollowTabs" role="tablist" aria-label="Follow">
                    <button v-for="t in tabs" :id="`follow-tab-${t.id}`" :key="t.id" type="button" role="tab" class="wgChip" :aria-selected="String(tab === t.id)" :aria-controls="`follow-panel-${t.id}`" :data-testid="`follow-tab-${t.id}`" @click="show(t.id)">
                        {{ t.label }}
                    </button>
                </div>

                <!-- Timeline: everyone you follow, in one stream, newest first. -->
                <section v-show="tab === 'timeline'" id="follow-panel-timeline" role="tabpanel" aria-labelledby="follow-tab-timeline" class="wgFollowPanel">
                    <p v-if="loaded && !items.length" class="wgCard wgFollowEmpty" data-testid="timeline-empty">
                        <template v-if="!following">
                            You're not following anyone yet.
                            <button type="button" class="wgLinkButton" @click="show('discover')">
                                Find backpackers to follow
                            </button>
                        </template>
                        <template v-else>
                            Nothing from the people you follow yet. New packs, trips, gear changes and reviews show up here.
                        </template>
                    </p>

                    <div v-for="g in days" :key="g.key" class="wgFollowDay">
                        <h2 class="wgFollowDayHead">
                            {{ g.label }}
                        </h2>
                        <ol class="wgFollowItems">
                            <li v-for="(i, n) in g.items" :key="`${i.kind}-${i.at}-${n}`" class="wgCard wgActivity" :data-kind="i.kind" data-testid="activity">
                                <div class="wgActivityWho">
                                    <a :href="`/@${i.by.username}`" class="wgActivityAvatar" :aria-label="`@${i.by.username}`" tabindex="-1">
                                        <img v-if="i.by.avatarUrl" :src="i.by.avatarUrl" alt="" width="40" height="40" loading="lazy">
                                        <span v-else aria-hidden="true">{{ i.by.username.charAt(0).toUpperCase() }}</span>
                                    </a>
                                    <p>
                                        <a :href="`/@${i.by.username}`" class="wgActivityName">{{ i.by.displayName || `@${i.by.username}` }}</a>
                                        {{ verb(i) }}
                                        <time :datetime="i.at" class="wgMuted" :title="fullTime(i.at)">· {{ time(i.at) }}</time>
                                    </p>
                                </div>

                                <!-- A published pack -->
                                <a v-if="i.kind === 'published'" :href="`/r/${i.list.externalId}`" class="wgActivityBody">
                                    <strong class="wgActivityTitle">{{ i.list.name }}</strong>
                                    <span class="wgActivityFacts">
                                        <span>{{ weight(i.list.baseWeightMg) }} base</span>
                                        <span>{{ i.list.itemCount }} items</span>
                                        <span v-if="i.list.tripType">{{ tripType(i.list.tripType) }}</span>
                                        <span v-if="i.list.trail">{{ i.list.trail.name }}</span>
                                    </span>
                                    <span v-if="i.list.categories.length" class="wgActivityBar" aria-hidden="true">
                                        <span v-for="(c, k) in i.list.categories" :key="k" :style="{ flexGrow: Math.max(c.weightMg, 1) }" :class="`wgBarSeg${k % 6}`" />
                                    </span>
                                    <span v-if="i.list.description" class="wgActivityText">{{ i.list.description }}</span>
                                </a>

                                <!-- Gear added to or taken out of a pack -->
                                <a v-else-if="i.kind === 'pack'" :href="`/r/${i.list.externalId}`" class="wgActivityBody">
                                    <strong class="wgActivityTitle">{{ i.list.name }}</strong>
                                    <span v-if="i.added.length" class="wgActivityGear" data-testid="activity-added">
                                        <span class="wgActivityTag wgTagAdd">Added</span>
                                        {{ names(i.added) }}
                                    </span>
                                    <span v-if="i.removed.length" class="wgActivityGear" data-testid="activity-removed">
                                        <span class="wgActivityTag wgTagOut">Took out</span>
                                        {{ names(i.removed) }}
                                    </span>
                                    <span v-if="weightChange(i)" class="wgActivityFacts" data-testid="activity-weight">
                                        <span>Base weight {{ weightChange(i) }}</span>
                                    </span>
                                </a>

                                <!-- A shakedown request -->
                                <a v-else-if="i.kind === 'shakedown'" :href="`/r/${i.list.externalId}#comments`" class="wgActivityBody">
                                    <strong class="wgActivityTitle">{{ i.list.name }}</strong>
                                    <span class="wgActivityFacts">
                                        <span>{{ weight(i.list.baseWeightMg) }} base</span>
                                        <span>{{ i.list.itemCount }} items</span>
                                    </span>
                                    <span class="wgActivityText">Help trim it: suggest swaps and cuts.</span>
                                </a>

                                <!-- A trip journal -->
                                <a v-else-if="i.kind === 'trip'" :href="`/t/${i.trip.id}`" class="wgActivityBody wgActivityTrip">
                                    <img v-if="i.trip.coverUrl" :src="i.trip.coverUrl" alt="" class="wgActivityCover" loading="lazy">
                                    <strong class="wgActivityTitle">{{ i.trip.title }}</strong>
                                    <span class="wgActivityFacts">
                                        <span v-if="i.trip.startDate">{{ dates(i.trip.startDate, i.trip.endDate) }}</span>
                                        <span>{{ i.trip.entryCount === 1 ? '1 day written' : `${i.trip.entryCount} days written` }}</span>
                                        <span v-if="i.trip.followersOnly">Followers only</span>
                                    </span>
                                    <span v-if="i.trip.summary" class="wgActivityText">{{ i.trip.summary }}</span>
                                </a>

                                <!-- A day of a trip -->
                                <a v-else-if="i.kind === 'entry'" :href="`/t/${i.trip.id}#entry-${i.entry.id}`" class="wgActivityBody">
                                    <strong class="wgActivityTitle">
                                        <template v-if="i.entry.day">Day {{ i.entry.day }}<template v-if="i.entry.title">: </template></template>{{ i.entry.title }}
                                    </strong>
                                    <span class="wgActivityFacts">
                                        <span>{{ i.trip.title }}</span>
                                        <span v-if="i.entry.distanceKm">{{ distance(i.entry.distanceKm) }}</span>
                                    </span>
                                    <span v-if="i.entry.photos.length" class="wgActivityPhotos">
                                        <img v-for="p in i.entry.photos" :key="p" :src="p" alt="" loading="lazy">
                                    </span>
                                    <span v-if="i.entry.body" class="wgActivityText">{{ i.entry.body }}</span>
                                </a>

                                <!-- A gear review -->
                                <a v-else-if="i.kind === 'review'" :href="`/g/${i.review.catalogId}#reviews`" class="wgActivityBody wgActivityReview">
                                    <img v-if="i.review.imageUrl" :src="i.review.imageUrl" alt="" class="wgActivityThumb" loading="lazy">
                                    <span>
                                        <strong class="wgActivityTitle">{{ i.review.brand ? `${i.review.brand} ` : '' }}{{ i.review.gear }}</strong>
                                        <span class="wgActivityStars" :aria-label="`${i.review.rating} out of 5 stars`">{{ '★'.repeat(i.review.rating) }}<span aria-hidden="true" class="wgMuted">{{ '★'.repeat(5 - i.review.rating) }}</span></span>
                                        <span v-if="i.review.title" class="wgActivityText"><strong>{{ i.review.title }}</strong></span>
                                        <span v-if="i.review.body" class="wgActivityText">{{ i.review.body }}</span>
                                    </span>
                                </a>
                            </li>
                        </ol>
                    </div>

                    <button v-if="next" type="button" class="wgBtn wgBtnGhost wgFollowMore" :disabled="loading" data-testid="timeline-more" @click="loadMore">
                        {{ loading ? 'Loading…' : 'Show older' }}
                    </button>
                </section>

                <!-- Following: who you follow, and unfollow. -->
                <section v-show="tab === 'following'" id="follow-panel-following" role="tabpanel" aria-labelledby="follow-tab-following" class="wgFollowPanel">
                    <p v-if="!followingList.length" class="wgCard wgFollowEmpty">
                        You're not following anyone yet.
                        <button type="button" class="wgLinkButton" @click="show('discover')">
                            Find backpackers to follow
                        </button>
                    </p>
                    <ul v-else class="wgFollowPeople" data-testid="following-people">
                        <li v-for="p in followingList" :key="p.username" class="wgCard wgPerson">
                            <a :href="`/@${p.username}`" class="wgActivityAvatar" tabindex="-1" aria-hidden="true">
                                <img v-if="p.avatarUrl" :src="p.avatarUrl" alt="" width="40" height="40" loading="lazy">
                                <span v-else>{{ p.username.charAt(0).toUpperCase() }}</span>
                            </a>
                            <span class="wgPersonName">
                                <a :href="`/@${p.username}`">{{ p.displayName || `@${p.username}` }}</a>
                                <span v-if="p.displayName" class="wgMuted">@{{ p.username }}</span>
                            </span>
                            <button type="button" class="wgBtn wgBtnGhost wgBtnSmall" :data-testid="`unfollow-${p.username}`" @click="unfollow(p)">
                                Unfollow
                            </button>
                        </li>
                    </ul>
                </section>

                <!-- Discover: people with something public to follow. -->
                <section v-show="tab === 'discover'" id="follow-panel-discover" role="tabpanel" aria-labelledby="follow-tab-discover" class="wgFollowPanel">
                    <form class="wgFollowSearch" role="search" @submit.prevent="search">
                        <label for="follow-search" class="wgVisuallyHidden">Find a backpacker by name</label>
                        <input id="follow-search" v-model="q" type="search" class="wgInput" placeholder="Find a backpacker by name" data-testid="discover-search">
                        <button type="submit" class="wgBtn wgBtnGhost">
                            Search
                        </button>
                    </form>
                    <p v-if="discoverLoaded && !people.length" class="wgCard wgFollowEmpty">
                        {{ q ? `No backpackers match “${q}”.` : 'Nobody new to follow right now: you follow everyone with public packs or trips.' }}
                    </p>
                    <ul v-else class="wgFollowPeople" data-testid="discover-people">
                        <li v-for="p in people" :key="p.username" class="wgCard wgPerson" data-testid="discover-person">
                            <a :href="`/@${p.username}`" class="wgActivityAvatar" tabindex="-1" aria-hidden="true">
                                <img v-if="p.avatarUrl" :src="p.avatarUrl" alt="" width="40" height="40" loading="lazy">
                                <span v-else>{{ p.username.charAt(0).toUpperCase() }}</span>
                            </a>
                            <span class="wgPersonName">
                                <a :href="`/@${p.username}`">{{ p.displayName || `@${p.username}` }}</a>
                                <span class="wgMuted">
                                    <template v-if="p.trailName">“{{ p.trailName }}” · </template>{{ plural(p.packs, 'pack') }} · {{ plural(p.trips, 'trip') }} · {{ plural(p.followers, 'follower') }}
                                </span>
                            </span>
                            <button v-if="p.followed" type="button" class="wgBtn wgBtnGhost wgBtnSmall" :data-testid="`following-${p.username}`" @click="unfollow(p)">
                                Following
                            </button>
                            <button v-else type="button" class="wgBtn wgBtnPrimary wgBtnSmall" :data-testid="`follow-${p.username}`" @click="follow(p)">
                                Follow
                            </button>
                        </li>
                    </ul>
                </section>

                <!-- On your terms. -->
                <section v-if="mine" class="wgCard wgFollowTerms" data-testid="follow-terms">
                    <toggle :model-value="mine.shareActivity" data-testid="share-activity" @update:model-value="setShare">
                        Share my updates with people who follow me
                    </toggle>
                    <p class="wgMuted">
                        Only what you've already made public shows: published lists, public trips (and trips you share with followers), and your reviews. Private lists and trips never appear. Turn this off to keep your updates out of other people's timelines; your profile stays as it is.
                    </p>
                </section>
            </template>
        </main>
        <siteFooter site />
    </div>
</template>

<script>
import siteHeader from '../components/site-header.vue';
import siteFooter from '../components/site-footer.vue';
import toggle from '../components/toggle.vue';
import { api, formatWeightMg } from '../utils/format.js';
import { bigWeightUnit, currentUnits, currentLanguage } from '../utils/i18n-app.js';
import { TRIP_TYPE_LABELS } from '../utils/gear-meta.js';

const VERBS = {
    published: 'published a pack',
    pack: 'updated a pack',
    shakedown: 'asked for a shakedown',
    trip: 'shared a trip',
    entry: 'added a day to a trip',
    review: 'reviewed gear',
};

export default {
    name: 'Follow',
    components: { siteHeader, siteFooter, toggle },
    data() {
        return {
            tab: 'timeline',
            items: [],
            next: null,
            following: 0,
            loaded: false,
            loading: false,
            denied: false,
            followingList: [],
            people: [],
            q: '',
            discoverLoaded: false,
            mine: null,
            feed: null,
        };
    },
    computed: {
        signedIn() {
            return Boolean(this.$store.state.loggedIn);
        },
        tabs() {
            return [
                { id: 'timeline', label: 'Timeline' },
                { id: 'following', label: `Following (${this.followingList.length})` },
                { id: 'discover', label: 'Discover' },
            ];
        },
        // The timeline in days: Today, Yesterday, then dates.
        days() {
            const out = [];
            for (const i of this.items) {
                const key = this.dayKey(i.at);
                let g = out[out.length - 1];
                if (!g || g.key !== key) {
                    g = { key, label: this.dayLabel(i.at), items: [] };
                    out.push(g);
                }
                g.items.push(i);
            }
            return out;
        },
    },
    async mounted() {
        document.title = 'Follow — Waymark Gear';
        if (!this.signedIn) return;
        const wanted = new URLSearchParams(window.location.search).get('tab');
        if (['timeline', 'following', 'discover'].includes(wanted)) this.tab = wanted;
        try {
            const [t, s, f] = await Promise.all([
                api('/api/activity'),
                api('/api/activity/settings'),
                api('/api/following').catch(() => ({ following: [] })),
            ]);
            this.items = t.items;
            this.next = t.next;
            this.following = t.following;
            this.mine = { shareActivity: s.shareActivity };
            this.feed = s.feed || null;
            this.followingList = f.following;
            this.loaded = true;
            // Following nobody: start where they can find someone.
            if (!wanted && !t.following) this.tab = 'discover';
            if (this.tab === 'discover') this.loadDiscover();
        } catch (err) {
            if (err.status === 404) this.denied = true;
        }
    },
    methods: {
        show(tab) {
            this.tab = tab;
            const url = new URL(window.location.href);
            url.searchParams.set('tab', tab);
            window.history.replaceState(window.history.state, '', url);
            if (tab === 'discover' && !this.discoverLoaded) this.loadDiscover();
        },
        async loadMore() {
            if (!this.next) return;
            this.loading = true;
            try {
                const t = await api(`/api/activity?before=${encodeURIComponent(this.next)}`);
                this.items = this.items.concat(t.items);
                this.next = t.next;
            } finally {
                this.loading = false;
            }
        },
        async refresh() {
            const t = await api('/api/activity');
            this.items = t.items;
            this.next = t.next;
            this.following = t.following;
        },
        async loadDiscover() {
            const r = await api(`/api/activity/discover?q=${encodeURIComponent(this.q)}`);
            this.people = r.people.map((p) => ({ ...p, followed: false }));
            this.discoverLoaded = true;
        },
        search() {
            this.loadDiscover();
        },
        async follow(p) {
            await api(`/api/users/${encodeURIComponent(p.username)}/follow`, { method: 'POST', body: '{}' });
            p.followed = true;
            this.followingList = [{ username: p.username, displayName: p.displayName, avatarUrl: p.avatarUrl }, ...this.followingList];
            this.refresh();
        },
        async unfollow(p) {
            await api(`/api/users/${encodeURIComponent(p.username)}/follow`, { method: 'DELETE' });
            this.followingList = this.followingList.filter((x) => x.username !== p.username);
            const d = this.people.find((x) => x.username === p.username);
            if (d) d.followed = false;
            this.refresh();
        },
        async setShare(value) {
            this.mine = await api('/api/activity/settings', { method: 'PUT', body: JSON.stringify({ shareActivity: value }) });
        },
        async setOpen(value) {
            this.feed = await api('/api/owner/follow-feed', { method: 'PUT', body: JSON.stringify({ open: value }) });
        },
        verb(i) {
            return VERBS[i.kind] || '';
        },
        weight(mg) {
            return formatWeightMg(mg, bigWeightUnit());
        },
        weightChange(i) {
            if (i.baseBeforeMg === null || i.baseAfterMg === null || i.baseBeforeMg === i.baseAfterMg) return '';
            const diff = i.baseAfterMg - i.baseBeforeMg;
            const sign = diff < 0 ? '−' : '+';
            return `${this.weight(i.baseBeforeMg)} → ${this.weight(i.baseAfterMg)} (${sign}${this.weight(Math.abs(diff))})`;
        },
        names(list) {
            const shown = list.slice(0, 6).join(', ');
            return list.length > 6 ? `${shown} and ${list.length - 6} more` : shown;
        },
        tripType(id) {
            return (TRIP_TYPE_LABELS && TRIP_TYPE_LABELS[id]) || id;
        },
        distance(km) {
            return currentUnits() === 'metric' ? `${Math.round(km * 10) / 10} km` : `${Math.round(km * 0.621371 * 10) / 10} mi`;
        },
        plural(n, word) {
            return `${n} ${word}${n === 1 ? '' : 's'}`;
        },
        dates(start, end) {
            const f = (d) => new Date(`${d}T12:00:00`).toLocaleDateString(currentLanguage(), { month: 'short', day: 'numeric', year: 'numeric' });
            return end && end !== start ? `${f(start)} – ${f(end)}` : f(start);
        },
        dayKey(at) {
            const d = new Date(at);
            return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        },
        dayLabel(at) {
            const d = new Date(at);
            const today = new Date();
            const yesterday = new Date(Date.now() - 86400000);
            if (this.dayKey(d) === this.dayKey(today)) return 'Today';
            if (this.dayKey(d) === this.dayKey(yesterday)) return 'Yesterday';
            return d.toLocaleDateString(currentLanguage(), {
                weekday: 'long', month: 'long', day: 'numeric', ...(d.getFullYear() === today.getFullYear() ? {} : { year: 'numeric' }),
            });
        },
        time(at) {
            const mins = Math.round((Date.now() - new Date(at)) / 60000);
            if (mins < 1) return 'just now';
            if (mins < 60) return `${mins} min ago`;
            const hours = Math.round(mins / 60);
            if (hours < 24) return `${hours} h ago`;
            return new Date(at).toLocaleTimeString(currentLanguage(), { hour: 'numeric', minute: '2-digit' });
        },
        fullTime(at) {
            return new Date(at).toLocaleString(currentLanguage());
        },
    },
};
</script>

<style lang="scss">
@import "../css/_globals";

.wgFollow {
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding: 28px 0 64px;

    // One reading column, header to footer: .wgPage alone is 1366px wide.
    .lp &.wgPage {
        max-width: 868px;
    }

    .wgFollowHero .wgH2 {
        margin-top: 6px;
    }

    .wgFollowNote,
    .wgFollowEmpty {
        margin: 0;
        padding: 18px 20px;
    }

    .wgFollowOwner {
        align-items: center;
        border-color: var(--lp-accent);
        display: flex;
        gap: 16px;
        justify-content: space-between;
        padding: 14px 18px;

        p {
            margin: 4px 0 0;
        }
    }

    .wgFollowIntro {
        display: grid;
        gap: 12px;
        grid-template-columns: 1fr 1fr;

        @media (max-width: $mobile) {
            grid-template-columns: 1fr;
        }
    }

    .wgFollowTile {
        align-items: flex-start;
        color: var(--lp-text);
        cursor: pointer;
        display: flex;
        font: inherit;
        gap: 12px;
        padding: 16px 18px;
        text-align: left;

        svg {
            color: var(--lp-accent);
            flex: 0 0 auto;
            margin-top: 2px;
        }

        > span {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        > span > span {
            color: var(--lp-text-secondary);
            font-size: 14px;
            line-height: 1.45;
        }

        &[aria-pressed="true"] {
            border-color: var(--lp-primary);
            box-shadow: inset 0 0 0 1px var(--lp-primary);
        }
    }

    .wgFollowTabs {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
    }

    .wgFollowPanel {
        display: flex;
        flex-direction: column;
        gap: 18px;
    }

    .wgLinkButton {
        background: none;
        border: 0;
        color: var(--lp-link-blue);
        cursor: pointer;
        font: inherit;
        padding: 0;
        text-decoration: underline;
    }

    // ---- timeline ----

    .wgFollowDay {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .wgFollowDayHead {
        color: var(--lp-text-secondary);
        font-family: $font-mono;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.08em;
        margin: 6px 0 0;
        text-transform: uppercase;
    }

    .wgFollowItems {
        display: flex;
        flex-direction: column;
        gap: 10px;
        list-style: none;
        margin: 0;
        padding: 0;
    }

    .wgActivity {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 14px 18px 16px;
    }

    .wgActivityWho {
        align-items: center;
        display: flex;
        gap: 10px;

        p {
            line-height: 1.35;
            margin: 0;
        }
    }

    .wgActivityAvatar {
        align-items: center;
        background: var(--lp-active-bg);
        border-radius: 50%;
        color: var(--lp-accent-green-deep);
        display: inline-flex;
        flex: 0 0 40px;
        font-weight: 700;
        height: 40px;
        justify-content: center;
        overflow: hidden;
        text-decoration: none;
        width: 40px;

        img {
            height: 100%;
            object-fit: cover;
            width: 100%;
        }
    }

    .wgActivityName {
        color: var(--lp-text);
        font-weight: 700;
        text-decoration: none;

        &:hover {
            text-decoration: underline;
        }
    }

    .wgActivityBody {
        border-left: 3px solid var(--lp-border);
        color: var(--lp-text);
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-left: 19px;
        padding: 2px 0 2px 21px;
        text-decoration: none;

        &:hover .wgActivityTitle {
            text-decoration: underline;
        }
    }

    .wgActivityTitle {
        font-size: 17px;
    }

    .wgActivityFacts {
        color: var(--lp-text-secondary);
        display: flex;
        flex-wrap: wrap;
        font-size: 14px;
        gap: 4px 14px;
    }

    .wgActivityText {
        font-size: 15px;
        line-height: 1.5;
    }

    .wgActivityGear {
        font-size: 15px;
        line-height: 1.5;
    }

    .wgActivityTag {
        border-radius: 999px;
        display: inline-block;
        font-size: 12px;
        font-weight: 700;
        margin-right: 6px;
        padding: 1px 8px;
    }

    .wgTagAdd {
        background: var(--lp-active-bg);
        color: var(--lp-accent-green-deep);
    }

    .wgTagOut {
        background: var(--lp-hover-bg);
        color: var(--lp-text-secondary);
    }

    .wgActivityBar {
        border-radius: 4px;
        display: flex;
        height: 8px;
        max-width: 420px;
        overflow: hidden;
    }

    @each $i, $c in (0: #2f5d50, 1: #7a9e7e, 2: #c9a66b, 3: #b8735a, 4: #6b8fa8, 5: #a3a3a3) {
        .wgBarSeg#{$i} {
            background: $c;
        }
    }

    .wgActivityCover {
        aspect-ratio: 16 / 7;
        border-radius: $radius;
        max-width: 100%;
        object-fit: cover;
        width: 560px;
    }

    .wgActivityPhotos {
        display: flex;
        gap: 6px;

        img {
            aspect-ratio: 1;
            border-radius: $radius-sm;
            object-fit: cover;
            width: 96px;
        }
    }

    .wgActivityReview {
        align-items: flex-start;
        flex-direction: row;
        gap: 12px;

        > span {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
    }

    .wgActivityThumb {
        border-radius: $radius-sm;
        flex: 0 0 64px;
        height: 64px;
        object-fit: contain;
        width: 64px;
    }

    .wgActivityStars {
        color: var(--lp-star, #c9a227);
        letter-spacing: 1px;
    }

    .wgFollowMore {
        align-self: center;
    }

    // ---- people ----

    .wgFollowSearch {
        display: flex;
        gap: 8px;

        .wgInput {
            flex: 1;
            min-width: 0;
        }
    }

    .wgFollowPeople {
        display: grid;
        gap: 10px;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        list-style: none;
        margin: 0;
        padding: 0;

        @media (max-width: $mobile) {
            grid-template-columns: 1fr;
        }
    }

    .wgPerson {
        align-items: center;
        display: flex;
        gap: 12px;
        padding: 12px 14px;
    }

    .wgPersonName {
        display: flex;
        flex: 1;
        flex-direction: column;
        min-width: 0;

        a {
            color: var(--lp-text);
            font-weight: 700;
            overflow: hidden;
            text-decoration: none;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .wgMuted {
            font-size: 13px;
        }
    }

    .wgFollowTerms {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 16px 18px;

        p {
            font-size: 14px;
            line-height: 1.5;
            margin: 0;
        }
    }

    @media (max-width: $mobile) {
        padding-top: 18px;

        .wgActivityBody {
            margin-left: 0;
            padding-left: 14px;
        }

        .wgActivityPhotos img {
            width: 72px;
        }
    }
}
</style>
