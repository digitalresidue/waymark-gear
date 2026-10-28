<template>
    <div class="wgHome">
        <siteHeader active="owner" />
        <template v-if="isAdmin">
            <ownerNav active="trails" />
            <main class="wgPage wgOwner wgOwnerTrails">
                <div class="wgSectionHead">
                    <div>
                        <h1 class="wgH2">
                            Trails
                        </h1>
                        <p class="wgLede">
                            The trails hikers tag their lists with. Names they type that match nothing yet wait below; approve them as new trails, merge them into one you have, or ignore them.
                        </p>
                    </div>
                    <button type="button" class="wgBtn wgBtnPrimary" data-testid="trail-add" @click="edit(null)">
                        + Add trail
                    </button>
                </div>
                <p v-if="notice" class="wgCard wgOwnerNotice" role="status" data-testid="trails-notice">
                    {{ notice }}
                </p>

                <section class="wgCard wgDevCard" data-testid="trail-suggestions">
                    <h2 class="wgProfileEditH">
                        Suggested by hikers <span class="wgMuted">({{ suggestions.length }})</span>
                    </h2>
                    <p v-if="!suggestions.length" class="wgMuted">
                        Nothing waiting. Every trail people typed matches one you have.
                    </p>
                    <ul class="wgTrailQueue">
                        <li v-for="s in suggestions" :key="s.key" data-testid="trail-suggestion">
                            <span class="wgTrailQueueName"><b>{{ s.name }}</b><span class="wgMuted"> · {{ s.hikers }} {{ s.hikers === 1 ? 'hiker' : 'hikers' }}, {{ s.lists }} {{ s.lists === 1 ? 'list' : 'lists' }}{{ s.published ? `, ${s.published} published` : '' }}</span></span>
                            <span class="wgTrailQueueActions">
                                <button type="button" class="wgBtn wgBtnSmall wgBtnPrimary" data-testid="suggestion-approve" @click="edit(null, s.name)">Add as trail</button>
                                <select class="wgSelect" :aria-label="`Merge ${s.name} into`" data-testid="suggestion-merge" @change="merge(s, $event.target.value); $event.target.value = ''">
                                    <option value="">Merge into…</option>
                                    <option v-for="t in trails" :key="t.id" :value="t.id">{{ t.name }}</option>
                                </select>
                                <button type="button" class="wgBtn wgBtnSmall wgBtnGhost" data-testid="suggestion-ignore" @click="ignore(s)">Ignore</button>
                            </span>
                        </li>
                    </ul>
                </section>

                <section class="wgCard wgDevCard">
                    <h2 class="wgProfileEditH">
                        All trails <span class="wgMuted">({{ trails.length }})</span>
                    </h2>
                    <input v-model="filter" class="wgInput wgOwnerTrailFilter" placeholder="Filter by name or region" data-testid="trail-filter">
                    <div class="wgOwnerTableWrap">
                        <table class="wgDevTable" data-testid="trail-table">
                            <thead>
                                <tr><th>Trail</th><th>Region</th><th>Length</th><th>Packs</th><th>Lists</th><th /></tr>
                            </thead>
                            <tbody>
                                <tr v-for="t in shown" :key="t.id" data-testid="trail-row">
                                    <td><a :href="`/trails/${t.slug}`">{{ t.name }}</a><span v-if="t.short" class="wgMuted"> {{ t.short }}</span><span v-if="t.status === 'draft'" class="wgMuted"> · draft</span></td>
                                    <td class="wgMuted">
                                        {{ t.region }}
                                    </td>
                                    <td class="wgMono">
                                        {{ t.lengthMi ? `${t.lengthMi.toLocaleString()} mi` : '' }}
                                    </td>
                                    <td>{{ t.count }}</td>
                                    <td>{{ t.lists }}</td>
                                    <td>
                                        <button type="button" class="wgLinkBtn" data-testid="trail-edit" @click="edit(t)">
                                            Edit
                                        </button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </section>
            </main>

            <modal id="wgTrailEditor" :shown="editorOpen" @hide="editorOpen = false">
                <h2>{{ form.id ? 'Edit trail' : 'Add a trail' }}</h2>
                <form class="wgTrailForm" data-testid="trail-form" @submit.prevent="save">
                    <label class="wgField">Name<input v-model="form.name" class="wgInput" required data-testid="trail-form-name"></label>
                    <label class="wgField">Short name<input v-model="form.short" class="wgInput" placeholder="e.g. PCT" data-testid="trail-form-short"></label>
                    <label class="wgField">Web address<input v-model="form.slug" class="wgInput" placeholder="made from the name"></label>
                    <label class="wgField">Other names <span class="wgMuted">(separate with ;)</span><input v-model="form.aliases" class="wgInput" placeholder="A.T.; Appalachian" data-testid="trail-form-aliases"></label>
                    <label class="wgField">Region<input v-model="form.region" class="wgInput" placeholder="Georgia to Maine"></label>
                    <label class="wgField">Country code<input v-model="form.country" class="wgInput" maxlength="2" placeholder="US"></label>
                    <label class="wgField">Length (km)<input v-model="form.lengthKm" class="wgInput" type="number" min="0" step="1"></label>
                    <label class="wgField">Section of
                        <select v-model="form.parentId" class="wgSelect">
                            <option :value="null">Not a section</option>
                            <option v-for="t in trails.filter((x) => x.id !== form.id)" :key="t.id" :value="t.id">{{ t.name }}</option>
                        </select>
                    </label>
                    <label class="wgField wgSpan2">What this trail asks of your pack <span class="wgMuted">(one per line)</span><textarea v-model="form.notes" class="wgTextarea" rows="4" /></label>
                    <label class="wgCheck"><input v-model="form.draft" type="checkbox"> Draft (hidden from the Trails page)</label>
                    <p v-if="error" class="wgImportError wgSpan2" role="alert">
                        {{ error }}
                    </p>
                    <div class="wgImportActions wgSpan2">
                        <button v-if="form.id" type="button" class="wgBtn wgBtnGhost wgTrailDelete" @click="remove">
                            Delete
                        </button>
                        <button type="submit" class="wgBtn wgBtnPrimary" data-testid="trail-form-save">
                            Save
                        </button>
                    </div>
                </form>
            </modal>
        </template>
        <main v-else class="wgPage wgOwner">
            <div class="wgEmpty">
                <p><strong>Owner access only.</strong></p>
            </div>
        </main>
        <siteFooter site />
    </div>
</template>

<script>
import siteHeader from '../components/site-header.vue';
import siteFooter from '../components/site-footer.vue';
import ownerNav from '../components/owner-nav.vue';
import modal from '../components/modal.vue';
import { api } from '../utils/format.js';

const blank = () => ({ id: null, name: '', short: '', slug: '', aliases: '', region: '', country: '', lengthKm: '', parentId: null, notes: '', draft: false, fromSuggestion: '' });

export default {
    name: 'OwnerTrails',
    components: { siteHeader, siteFooter, ownerNav, modal },
    data() {
        return { trails: [], suggestions: [], filter: '', editorOpen: false, form: blank(), error: '', notice: '' };
    },
    computed: {
        isAdmin() {
            return Boolean(this.$store.state.account && this.$store.state.account.isAdmin);
        },
        shown() {
            const f = this.filter.trim().toLowerCase();
            return f ? this.trails.filter((t) => `${t.name} ${t.short} ${t.region}`.toLowerCase().includes(f)) : this.trails;
        },
    },
    async mounted() {
        document.title = 'Trails — Waymark Gear';
        if (this.isAdmin) await this.load();
    },
    methods: {
        async load() {
            const r = await api('/api/admin/trails');
            this.trails = r.trails;
            this.suggestions = r.suggestions;
        },
        edit(t, suggestion = '') {
            this.error = '';
            this.form = t ? {
                ...blank(),
                id: t.id,
                name: t.name,
                short: t.short,
                slug: t.slug,
                aliases: (t.aliases || []).join('; '),
                region: t.region,
                country: t.country,
                lengthKm: t.lengthKm || '',
                parentId: t.parentId || null,
                notes: (t.notes || []).join('\n'),
                draft: t.status === 'draft',
            } : { ...blank(), name: suggestion, fromSuggestion: suggestion };
            this.editorOpen = true;
        },
        async save() {
            this.error = '';
            const body = {
                ...this.form,
                notes: this.form.notes.split('\n'),
                status: this.form.draft ? 'draft' : 'published',
            };
            try {
                if (this.form.id) await api(`/api/admin/trails/${this.form.id}`, { method: 'PUT', body: JSON.stringify(body) });
                else if (this.form.fromSuggestion) await api('/api/admin/trails/suggestions/approve', { method: 'POST', body: JSON.stringify({ ...body, name: this.form.name, aliases: body.aliases, suggestion: this.form.fromSuggestion }) });
                else await api('/api/admin/trails', { method: 'POST', body: JSON.stringify(body) });
                this.notice = `Saved ${this.form.name}. Lists tagged with any of its names now count toward it.`;
                this.editorOpen = false;
                await this.load();
            } catch (err) {
                this.error = err.message;
            }
        },
        async remove() {
            await api(`/api/admin/trails/${this.form.id}`, { method: 'DELETE' });
            this.editorOpen = false;
            this.notice = `Deleted ${this.form.name}. Lists tagged with it keep the name as typed.`;
            await this.load();
        },
        async merge(s, trailId) {
            if (!trailId) return;
            await api('/api/admin/trails/suggestions/merge', { method: 'POST', body: JSON.stringify({ name: s.name, trailId: Number(trailId) }) });
            const t = this.trails.find((x) => x.id === Number(trailId));
            this.notice = `“${s.name}” is now another name for ${t ? t.name : 'that trail'}.`;
            await this.load();
        },
        async ignore(s) {
            await api('/api/admin/trails/suggestions/ignore', { method: 'POST', body: JSON.stringify({ name: s.name }) });
            await this.load();
        },
    },
};
</script>

<style lang="scss">
.wgOwnerTrails {
    max-width: 1000px;

    .wgDevCard {
        margin: 0 0 16px;
        padding: 16px 18px;
    }
}

.wgOwnerNotice {
    background: #E6F2EA;
    margin: 0 0 16px;
    padding: 10px 14px;
}

.wgTrailQueue {
    list-style: none;
    margin: 0;
    padding: 0;

    li {
        align-items: center;
        border-top: 1px solid var(--lp-border);
        display: flex;
        flex-wrap: wrap;
        gap: 8px 14px;
        justify-content: space-between;
        padding: 10px 0;
    }
}

.wgTrailQueueActions {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;

    .wgSelect {
        min-height: 34px;
        padding: 4px 8px;
        width: auto;
    }
}

.wgOwnerTrailFilter {
    margin: 4px 0 10px;
    max-width: 320px;
}

.wgOwnerTableWrap {
    overflow-x: auto;
}

.wgTrailForm {
    display: grid;
    gap: 12px;
    grid-template-columns: 1fr 1fr;

    .wgSpan2 {
        grid-column: 1 / -1;
    }

    @media (max-width: 560px) {
        grid-template-columns: 1fr;
    }
}

.wgTrailDelete {
    margin-right: auto;
}
</style>
