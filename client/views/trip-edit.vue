<template>
    <div class="wgHome">
        <siteHeader active="trips" />
        <main id="wgMain" tabindex="-1" class="wgPage wgTripEdit">
            <p class="wgTripBack">
                <router-link to="/trips">
                    ‹ All trips
                </router-link>
            </p>
            <p v-if="!signedIn" class="wgCard wgProfileEditNote">
                <router-link to="/signin">
                    Sign in
                </router-link> to edit your trips.
            </p>
            <p v-else-if="missing" class="wgCard wgProfileEditNote">
                That trip could not be found.
            </p>

            <template v-else-if="trip">
                <form class="wgCard wgTripForm" data-testid="trip-form" @submit.prevent="saveTrip">
                    <label class="wgField wgTripWide">Trip name
                        <input v-model.trim="form.title" class="wgInput" maxlength="120" data-testid="trip-title">
                    </label>
                    <label class="wgField">Start
                        <input v-model="form.startDate" type="date" class="wgInput" data-testid="trip-start">
                    </label>
                    <label class="wgField">End
                        <input v-model="form.endDate" type="date" class="wgInput" data-testid="trip-end">
                    </label>
                    <label class="wgField">Who can see it
                        <select v-model="form.visibility" class="wgSelect" data-testid="trip-visibility">
                            <option value="private">Only you</option>
                            <option value="followers">Your followers</option>
                            <option value="public">Everyone</option>
                        </select>
                    </label>
                    <label class="wgField">Pack list
                        <select v-model="form.listId" class="wgSelect" data-testid="trip-list">
                            <option :value="null">None</option>
                            <option v-for="l in lists" :key="l.id" :value="l.id">{{ l.name || 'New list' }}</option>
                        </select>
                    </label>
                    <label class="wgField wgTripWide">Summary <span class="wgMuted">(markdown)</span>
                        <textarea v-model="form.summary" class="wgInput" rows="4" maxlength="4000" data-testid="trip-summary" />
                    </label>
                    <div v-if="allPhotos.length" class="wgField wgTripWide">
                        Cover photo
                        <div class="wgTripCovers">
                            <button type="button" class="wgTripCoverNone" :aria-pressed="!form.coverUrl" @click="form.coverUrl = ''">
                                None
                            </button>
                            <button v-for="p in allPhotos" :key="p" type="button" :aria-pressed="form.coverUrl === p" data-testid="trip-cover-pick" @click="form.coverUrl = p">
                                <img :src="p" alt="Use as cover">
                            </button>
                        </div>
                    </div>
                    <p v-if="error" class="wgImportError wgTripWide" role="alert">
                        {{ error }}
                    </p>
                    <div class="wgProfileActions wgTripWide">
                        <button type="submit" class="wgBtn wgBtnPrimary" :disabled="!form.title" data-testid="trip-save">
                            Save trip
                        </button>
                        <a :href="`/t/${trip.id}`" class="wgBtn wgBtnGhost" data-testid="trip-view">View page</a>
                        <span v-if="saved" class="wgMuted" role="status" data-testid="trip-saved">Saved.</span>
                        <button type="button" class="wgBtn wgBtnGhost wgTripDelete" data-testid="trip-delete" @click="removeTrip">
                            Delete trip
                        </button>
                    </div>
                </form>

                <h2 class="wgProfileEditH wgTripEntriesH">
                    Days
                </h2>
                <ol class="wgTripEntryList">
                    <li v-for="e in drafts" :key="e.id" class="wgCard wgTripEntryCard" data-testid="entry">
                        <div class="wgTripEntryTop">
                            <strong v-if="e.day">Day {{ e.day }}</strong>
                            <label class="wgField">Date
                                <input v-model="e.date" type="date" class="wgInput" data-testid="entry-date">
                            </label>
                            <label class="wgField">Distance ({{ distUnit }})
                                <input v-model="e.distance" type="number" min="0" step="0.1" inputmode="decimal" class="wgInput" data-testid="entry-distance">
                            </label>
                        </div>
                        <label class="wgField">Title
                            <input v-model="e.title" class="wgInput" maxlength="160" placeholder="e.g. Over Texas Pass" data-testid="entry-title">
                        </label>
                        <label class="wgField">Notes <span class="wgMuted">(markdown)</span>
                            <textarea v-model="e.body" class="wgInput" rows="5" maxlength="20000" data-testid="entry-body" />
                        </label>
                        <div class="wgTripPhotos">
                            <span v-for="(p, i) in e.photos" :key="p" class="wgTripPhoto">
                                <img :src="p" alt="" data-testid="entry-photo">
                                <button type="button" :aria-label="`Remove photo ${i + 1}`" @click="e.photos.splice(i, 1)">×</button>
                            </span>
                            <label v-if="e.photos.length < 8" class="wgGearPhotoAdd" :class="{ wgBusy: uploading === e.id }">
                                {{ uploading === e.id ? '…' : '+' }}
                                <span class="wgVisuallyHidden">Add a photo</span>
                                <input type="file" accept="image/jpeg,image/png,image/webp" class="wgVisuallyHidden" data-testid="entry-photo-file" :disabled="Boolean(uploading)" @change="upload(e, $event)">
                            </label>
                        </div>
                        <div class="wgProfileActions">
                            <button type="button" class="wgBtn wgBtnPrimary wgBtnSmall" data-testid="entry-save" @click="saveEntry(e)">
                                Save day
                            </button>
                            <button type="button" class="wgBtn wgBtnGhost wgBtnSmall" data-testid="entry-delete" @click="removeEntry(e)">
                                Delete
                            </button>
                        </div>
                    </li>
                </ol>
                <button type="button" class="wgBtn wgBtnGhost" data-testid="entry-add" @click="addEntry">
                    + Add a day
                </button>
            </template>
        </main>
    </div>
</template>

<script>
import siteHeader from '../components/site-header.vue';
import { api } from '../utils/format.js';

const KM_PER_MI = 1.609344;

export default {
    name: 'TripEdit',
    components: { siteHeader },
    data() {
        return { trip: null, form: {}, drafts: [], missing: false, error: '', saved: false, uploading: null };
    },
    computed: {
        signedIn() {
            return Boolean(this.$store.state.loggedIn);
        },
        lists() {
            const lib = this.$store.state.library;
            return lib && this.$store.state.saveType !== 'shared' ? lib.lists : [];
        },
        imperial() {
            const lib = this.$store.state.library;
            return !lib || !['g', 'kg'].includes(lib.totalUnit);
        },
        distUnit() {
            return this.imperial ? 'mi' : 'km';
        },
        allPhotos() {
            return this.drafts.flatMap((e) => e.photos);
        },
    },
    async mounted() {
        document.title = 'Trip journal — Waymark Gear';
        if (!this.signedIn) return;
        try {
            const view = await api(`/api/trips/${encodeURIComponent(this.$route.params.id)}`);
            if (!view.mine) throw new Error('not mine');
            this.load(view.trip);
        } catch {
            this.missing = true;
        }
    },
    methods: {
        load(trip) {
            this.trip = trip;
            document.title = `${trip.title} — Waymark Gear`;
            this.form = {
                title: trip.title,
                startDate: trip.startDate || '',
                endDate: trip.endDate || '',
                visibility: trip.visibility,
                listId: trip.listId,
                summary: trip.summary,
                coverUrl: trip.coverUrl,
            };
            this.drafts = trip.entries.map((e) => ({
                ...e,
                date: e.date || '',
                distance: e.distanceKm === null ? '' : String(Math.round((this.imperial ? e.distanceKm / KM_PER_MI : e.distanceKm) * 10) / 10),
                photos: [...e.photos],
            }));
        },
        entryBody(e) {
            const d = e.distance === '' || e.distance === null ? null : Number(e.distance) * (this.imperial ? KM_PER_MI : 1);
            return JSON.stringify({ date: e.date, title: e.title, body: e.body, photos: e.photos, distanceKm: d });
        },
        async saveTrip() {
            this.error = '';
            this.saved = false;
            try {
                const trip = await api(`/api/trips/${this.trip.id}`, { method: 'PUT', body: JSON.stringify(this.form) });
                this.trip = { ...this.trip, ...trip };
                this.form.coverUrl = trip.coverUrl;
                this.saved = true;
            } catch (err) {
                this.error = err.message;
            }
        },
        async addEntry() {
            this.error = '';
            try {
                this.load(await api(`/api/trips/${this.trip.id}/entries`, { method: 'POST', body: JSON.stringify({}) }));
            } catch (err) {
                this.error = err.message;
            }
        },
        async saveEntry(e) {
            this.error = '';
            try {
                const trip = await api(`/api/trips/${this.trip.id}/entries/${e.id}`, { method: 'PUT', body: this.entryBody(e) });
                this.trip = trip;
                const fresh = trip.entries.find((x) => x.id === e.id);
                if (fresh) e.day = fresh.day;
                this.drafts.sort((a, b) => (a.date || '9').localeCompare(b.date || '9') || a.id - b.id);
                this.saved = true;
            } catch (err) {
                this.error = err.message;
            }
        },
        async removeEntry(e) {
            if (!window.confirm('Delete this day?')) return;
            await api(`/api/trips/${this.trip.id}/entries/${e.id}`, { method: 'DELETE' });
            this.drafts = this.drafts.filter((x) => x.id !== e.id);
        },
        async removeTrip() {
            if (!window.confirm(`Delete “${this.trip.title}” and all its days?`)) return;
            await api(`/api/trips/${this.trip.id}`, { method: 'DELETE' });
            this.$router.push('/trips');
        },
        async upload(e, evt) {
            const file = evt.target.files && evt.target.files[0];
            evt.target.value = '';
            if (!file) return;
            this.uploading = e.id;
            this.error = '';
            try {
                const body = new FormData();
                body.append('image', file);
                const res = await fetch('/api/profile/image?kind=photo', { method: 'POST', body, credentials: 'same-origin' });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(json.message || 'That photo could not be uploaded.');
                if (!e.photos.includes(json.imageUrl)) e.photos.push(json.imageUrl);
            } catch (err) {
                this.error = err.message;
            } finally {
                this.uploading = null;
            }
        },
    },
};
</script>

<style lang="scss">
.wgTripEdit {
    max-width: 860px;
}

.wgTripBack {
    margin: 0 0 12px;
}

.wgTripForm {
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(2, 1fr);
    padding: 16px;

    .wgTripWide {
        grid-column: 1 / -1;
    }

    .wgTripDelete {
        margin-left: auto;
    }

    @media (max-width: 560px) {
        grid-template-columns: 1fr;
    }
}

.wgTripCovers {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;

    button {
        background: var(--lp-surface-sunken);
        border: 2px solid transparent;
        border-radius: 8px;
        cursor: pointer;
        height: 64px;
        overflow: hidden;
        padding: 0;
        width: 64px;

        &[aria-pressed="true"] {
            border-color: var(--lp-primary);
        }
    }

    img {
        height: 100%;
        object-fit: cover;
        width: 100%;
    }
}

.wgTripEntriesH {
    margin: 24px 0 8px;
}

.wgTripEntryList {
    list-style: none;
    margin: 0 0 12px;
    padding: 0;
}

.wgTripEntryCard {
    display: grid;
    gap: 10px;
    margin: 0 0 12px;
    padding: 14px 16px;
}

.wgTripEntryTop {
    align-items: end;
    display: grid;
    gap: 12px;
    grid-template-columns: auto 1fr 1fr;

    strong {
        font-size: 18px;
        padding-bottom: 10px;
    }
}

.wgTripPhotos {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.wgTripPhoto {
    height: 72px;
    position: relative;
    width: 72px;

    img {
        border-radius: 8px;
        height: 100%;
        object-fit: cover;
        width: 100%;
    }

    button {
        background: rgba(0, 0, 0, 0.6);
        border: 0;
        border-radius: 50%;
        color: #fff;
        cursor: pointer;
        height: 22px;
        position: absolute;
        right: 3px;
        top: 3px;
        width: 22px;
    }
}
</style>
