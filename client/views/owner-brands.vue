<template>
    <div class="wgHome">
        <siteHeader active="owner" />
        <template v-if="isAdmin">
            <ownerNav active="brands" />
            <main class="wgPage wgOwner wgOwnerBrands">
                <div class="wgSectionHead">
                    <div>
                        <h1 class="wgH2">
                            Brands
                        </h1>
                        <p class="wgLede">
                            The <a href="/brands">Brands</a> directory. Add a logo, a line or two about what they make, and their website; add an affiliate link when you have one and "Visit" goes there (Supporters always get the website).
                        </p>
                    </div>
                    <button type="button" class="wgBtn wgBtnPrimary" data-testid="brand-add" @click="edit(null)">
                        + Add brand
                    </button>
                </div>
                <p v-if="notice" class="wgCard wgOwnerNotice" role="status" data-testid="brands-notice">
                    {{ notice }}
                </p>

                <section class="wgCard wgDevCard">
                    <input v-model="filter" class="wgInput wgOwnerTrailFilter" placeholder="Filter by name" data-testid="brand-filter">
                    <div class="wgOwnerTableWrap">
                        <table class="wgDevTable" data-testid="brand-table">
                            <thead>
                                <tr><th>Brand</th><th>Makes</th><th>Links</th><th>Visits, 30 days</th><th>Status</th><th /></tr>
                            </thead>
                            <tbody>
                                <tr v-for="b in shown" :key="b.id" data-testid="brand-row">
                                    <td>
                                        <span class="wgOwnerBrandName">
                                            <img v-if="b.logoUrl" :src="b.logoUrl" alt="" class="wgOwnerBrandLogo">
                                            <b>{{ b.name }}</b>
                                            <span v-if="b.cottage" class="wgBadge">Cottage</span>
                                        </span>
                                    </td>
                                    <td class="wgMuted">
                                        {{ b.gearTypes.map(typeLabel).join(', ') || '—' }}
                                    </td>
                                    <td class="wgMuted">
                                        {{ [b.url && 'Website', b.affiliateUrl && 'Affiliate'].filter(Boolean).join(' · ') || '—' }}
                                    </td>
                                    <td>{{ b.clicks30 }}</td>
                                    <td>
                                        <span class="wgBadge" :class="{ wgBadgeWarn: b.status === 'draft' }">{{ b.status === 'draft' ? 'Draft' : 'Published' }}</span>
                                    </td>
                                    <td>
                                        <button type="button" class="wgBtn wgBtnSmall" :aria-label="`Edit ${b.name}`" data-testid="brand-edit" @click="edit(b)">
                                            Edit
                                        </button>
                                    </td>
                                </tr>
                                <tr v-if="loaded && !brands.length">
                                    <td colspan="6" class="wgTableEmpty">
                                        No brands yet. Add the first one.
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </section>
            </main>

            <modal id="wgBrandEditor" :shown="editorOpen" @hide="editorOpen = false">
                <h2>{{ form.id ? `Edit ${form.name}` : 'Add a brand' }}</h2>
                <form class="wgTrailForm wgBrandForm" data-testid="brand-form" @submit.prevent="save">
                    <label class="wgField">Name<input v-model="form.name" class="wgInput" required maxlength="80" data-testid="brand-form-name"></label>
                    <label class="wgField">Country <span class="wgMuted">(optional)</span><input v-model="form.country" class="wgInput" maxlength="40" placeholder="e.g. USA"></label>

                    <div class="wgField wgSpan2">
                        <span>Logo</span>
                        <div class="wgBrandLogoField">
                            <img v-if="form.logoUrl" :src="form.logoUrl" alt="Logo preview" class="wgOwnerBrandLogo wgOwnerBrandLogoBig" data-testid="brand-form-logo-preview">
                            <label class="wgBtn wgBtnGhost wgBtnSmall">
                                {{ uploading ? 'Uploading…' : 'Upload' }}
                                <input type="file" accept="image/png,image/jpeg,image/webp" class="wgVisuallyHidden" data-testid="brand-form-logo-file" @change="upload">
                            </label>
                            <input v-model.trim="form.logoUrl" class="wgInput" placeholder="or paste an https image link" aria-label="Logo image link" data-testid="brand-form-logo-url">
                        </div>
                        <span class="wgMuted">Square-ish works best; it's shown at 56px on a white tile. PNG with a transparent background is ideal.</span>
                    </div>

                    <label class="wgField wgSpan2">Short description <span class="wgMuted">({{ 300 - form.description.length }} left)</span>
                        <textarea v-model="form.description" class="wgTextarea" rows="3" maxlength="300" placeholder="What they make and who it suits, in a sentence or two." data-testid="brand-form-description" />
                    </label>
                    <label class="wgField">Website<input v-model.trim="form.url" class="wgInput" type="url" placeholder="https://brand.com" data-testid="brand-form-url"></label>
                    <label class="wgField">Affiliate link <span class="wgMuted">(optional)</span><input v-model.trim="form.affiliateUrl" class="wgInput" type="url" placeholder="Impact, AvantLink…" data-testid="brand-form-affiliate"></label>
                    <p class="wgMuted wgSpan2" data-testid="brand-form-route">
                        {{ route }}
                    </p>

                    <label class="wgCheck wgSpan2"><input v-model="form.cottage" type="checkbox" data-testid="brand-form-cottage"> Cottage maker <span class="wgMuted">(a small, independent shop, often making to order)</span></label>
                    <fieldset class="wgSpan2 wgBrandTypePick">
                        <legend>What they make</legend>
                        <label v-for="t in types" :key="t.id" class="wgCheck"><input v-model="form.gearTypes" type="checkbox" :value="t.id" :data-testid="`brand-form-type-${t.id}`"> {{ t.label }}</label>
                    </fieldset>
                    <label class="wgCheck wgSpan2"><input v-model="form.draft" type="checkbox" data-testid="brand-form-draft"> Draft (hidden from the Brands page)</label>

                    <p v-if="error" class="wgImportError wgSpan2" role="alert" data-testid="brand-form-error">
                        {{ error }}
                    </p>
                    <div class="wgImportActions wgSpan2">
                        <button v-if="form.id" type="button" class="wgBtn wgBtnGhost wgTrailDelete" data-testid="brand-form-delete" @click="remove">
                            Delete
                        </button>
                        <button type="submit" class="wgBtn wgBtnPrimary" data-testid="brand-form-save">
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
import { GEAR_TYPES, gearTypeLabel } from '../brand-types.js';

const blank = () => ({ id: null, name: '', country: '', logoUrl: '', description: '', url: '', affiliateUrl: '', cottage: false, gearTypes: [], draft: false });

export default {
    name: 'OwnerBrands',
    components: { siteHeader, siteFooter, ownerNav, modal },
    data() {
        return { brands: [], loaded: false, filter: '', editorOpen: false, form: blank(), error: '', notice: '', uploading: false, types: GEAR_TYPES };
    },
    computed: {
        isAdmin() {
            return Boolean(this.$store.state.account && this.$store.state.account.isAdmin);
        },
        shown() {
            const f = this.filter.trim().toLowerCase();
            return f ? this.brands.filter((b) => b.name.toLowerCase().includes(f)) : this.brands;
        },
        // Who goes where, in words, like the catalog editor.
        route() {
            if (!this.form.url && !this.form.affiliateUrl) return 'No website yet: the card shows without a Visit button.';
            if (!this.form.affiliateUrl) return 'Visit goes to the website.';
            return 'Visit goes to the affiliate link, except Supporters, who get the website.';
        },
    },
    async mounted() {
        document.title = 'Brands — Waymark Gear';
        if (this.isAdmin) await this.load();
    },
    methods: {
        typeLabel: gearTypeLabel,
        async load() {
            this.brands = (await api('/api/admin/brands')).brands;
            this.loaded = true;
        },
        edit(b) {
            this.error = '';
            this.form = b ? { ...blank(), ...b, gearTypes: [...b.gearTypes], draft: b.status === 'draft' } : blank();
            this.editorOpen = true;
        },
        async upload(evt) {
            const file = evt.target.files && evt.target.files[0];
            evt.target.value = '';
            if (!file) return;
            this.error = '';
            this.uploading = true;
            try {
                const body = new FormData();
                body.append('image', file);
                const res = await fetch('/api/profile/image?kind=photo', { method: 'POST', body, credentials: 'same-origin' });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(json.message || 'That logo could not be uploaded.');
                this.form.logoUrl = json.imageUrl;
            } catch (err) {
                this.error = err.message;
            } finally {
                this.uploading = false;
            }
        },
        async save() {
            this.error = '';
            const body = { ...this.form, status: this.form.draft ? 'draft' : 'published' };
            try {
                if (this.form.id) await api(`/api/admin/brands/${this.form.id}`, { method: 'PUT', body: JSON.stringify(body) });
                else await api('/api/admin/brands', { method: 'POST', body: JSON.stringify(body) });
                this.notice = `Saved ${this.form.name}.${body.status === 'draft' ? ' It\'s a draft, so it isn\'t on the Brands page yet.' : ''}`;
                this.editorOpen = false;
                await this.load();
            } catch (err) {
                this.error = err.message;
            }
        },
        async remove() {
            await api(`/api/admin/brands/${this.form.id}`, { method: 'DELETE' });
            this.editorOpen = false;
            this.notice = `Deleted ${this.form.name}.`;
            await this.load();
        },
    },
};
</script>

<style lang="scss">
.wgOwnerBrandName {
    align-items: center;
    display: inline-flex;
    gap: 8px;
}

.wgOwnerBrandLogo {
    background: #fff;
    border: 1px solid var(--lp-border);
    border-radius: 6px;
    height: 28px;
    object-fit: contain;
    width: 28px;
}

.wgOwnerBrandLogoBig {
    border-radius: 10px;
    height: 56px;
    padding: 3px;
    width: 56px;
}

.wgBrandLogoField {
    align-items: center;
    display: flex;
    gap: 10px;
    margin: 4px 0;

    .wgInput {
        flex: 1 1 auto;
        min-width: 0;
    }
}

.wgBrandTypePick {
    border: 1px solid var(--lp-border);
    border-radius: 10px;
    display: grid;
    gap: 6px 14px;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    margin: 0;
    padding: 10px 12px;

    legend {
        font-weight: 700;
        padding: 0 4px;
    }
}
</style>
