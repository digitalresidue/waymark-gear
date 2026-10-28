<template>
    <div class="wgHome">
        <siteHeader active="trips" />
        <main class="wgPage wgTripsPage">
            <div class="wgSectionHead">
                <div>
                    <h1 class="wgH2">
                        Trip journals
                    </h1>
                    <p class="wgLede">
                        Write up a trip day by day, with photos and the pack list you carried. Keep it to yourself, share it with followers, or publish it.
                    </p>
                </div>
            </div>

            <p v-if="!signedIn" class="wgCard wgProfileEditNote">
                <router-link to="/signin">
                    Sign in
                </router-link> to keep trip journals.
            </p>

            <template v-else>
                <form class="wgCard wgTripNew" data-testid="trip-new" @submit.prevent="create">
                    <label class="wgField wgTripNewTitle">Trip name
                        <input v-model.trim="title" class="wgInput" maxlength="120" placeholder="e.g. Wind River High Route" data-testid="trip-new-title">
                    </label>
                    <label class="wgField">Start
                        <input v-model="startDate" type="date" class="wgInput" data-testid="trip-new-start">
                    </label>
                    <label class="wgField">End
                        <input v-model="endDate" type="date" class="wgInput" data-testid="trip-new-end">
                    </label>
                    <button type="submit" class="wgBtn wgBtnPrimary" :disabled="!title || busy" data-testid="trip-new-create">
                        Start a journal
                    </button>
                    <p v-if="error" class="wgImportError" role="alert">
                        {{ error }}
                    </p>
                </form>

                <p v-if="loaded && !trips.length" class="wgMuted">
                    No trips yet.
                </p>
                <ul class="wgTripCards" data-testid="my-trips">
                    <li v-for="t in trips" :key="t.id" class="wgTripCard">
                        <router-link :to="`/trips/${t.id}`" data-testid="my-trip">
                            <img v-if="t.coverUrl" :src="t.coverUrl" alt="" width="512" height="512">
                            <span class="wgTripCardBody">
                                <strong>{{ t.title }}</strong>
                                <span class="wgMuted">{{ range(t) }}{{ t.entryCount }} {{ t.entryCount === 1 ? 'entry' : 'entries' }} · {{ VIS[t.visibility] }}</span>
                            </span>
                        </router-link>
                    </li>
                </ul>
            </template>
        </main>
    </div>
</template>

<script>
import siteHeader from '../components/site-header.vue';
import { api } from '../utils/format.js';

const VIS = { public: 'Public', followers: 'Followers only', private: 'Only you' };

export default {
    name: 'Trips',
    components: { siteHeader },
    data() {
        return { trips: [], loaded: false, title: '', startDate: '', endDate: '', busy: false, error: '', VIS };
    },
    computed: {
        signedIn() {
            return Boolean(this.$store.state.loggedIn);
        },
    },
    async mounted() {
        document.title = 'Trip journals — Waymark Gear';
        if (!this.signedIn) return;
        const { trips } = await api('/api/trips').catch(() => ({ trips: [] }));
        this.trips = trips;
        this.loaded = true;
    },
    methods: {
        range(t) {
            if (!t.startDate) return '';
            return t.endDate && t.endDate !== t.startDate ? `${t.startDate} – ${t.endDate} · ` : `${t.startDate} · `;
        },
        async create() {
            this.busy = true;
            this.error = '';
            try {
                const trip = await api('/api/trips', {
                    method: 'POST',
                    body: JSON.stringify({ title: this.title, startDate: this.startDate, endDate: this.endDate }),
                });
                this.$router.push(`/trips/${trip.id}`);
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
.wgTripNew {
    align-items: end;
    display: grid;
    gap: 12px;
    grid-template-columns: 2fr 1fr 1fr auto;
    margin: 0 0 20px;
    padding: 16px;

    .wgImportError {
        grid-column: 1 / -1;
    }

    @media (max-width: 720px) {
        grid-template-columns: 1fr 1fr;

        .wgTripNewTitle,
        button {
            grid-column: 1 / -1;
        }
    }
}

.wgTripsPage,
.wgTripEdit {
    padding-bottom: 48px;
    padding-top: 28px;
}

.wgTripsPage .wgTripCards {
    display: grid;
    gap: 14px;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    list-style: none;
    margin: 0;
    padding: 0;
}

.wgTripsPage .wgTripCard a {
    background: var(--lp-surface);
    border: 1px solid var(--lp-border);
    border-radius: 14px;
    color: inherit;
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    text-decoration: none;

    &:hover {
        border-color: var(--lp-primary);
    }

    img {
        aspect-ratio: 2 / 1;
        height: auto;
        object-fit: cover;
        width: 100%;
    }

    .wgTripCardBody {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 12px 14px;
    }
}
</style>
