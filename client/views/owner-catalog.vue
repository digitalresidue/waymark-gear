<template>
    <div class="wgHome">
        <siteHeader active="owner" />
        <template v-if="isAdmin">
            <ownerNav active="catalog" />
            <main class="wgPage wgOwner">
                <div class="wgSectionHead">
                    <div>
                        <h1 class="wgH2">
                            Gear catalog
                        </h1>
                        <p class="wgLede">
                            What people pick from when they add gear. Items they add stay linked, so a corrected weight here updates every list using it.
                        </p>
                    </div>
                    <div class="wgOwnerActions">
                        <a class="wgBtn" href="/api/admin/catalog/template.csv" download>Download CSV template</a>
                        <a class="wgBtn" href="/api/admin/catalog/export.csv" download data-testid="catalog-export">Export CSV</a>
                        <label class="wgBtn wgFileBtn">
                            Import CSV
                            <input type="file" accept=".csv,text/csv" class="wgVisuallyHidden" data-testid="catalog-import" @change="pickFile">
                        </label>
                        <button type="button" class="wgBtn wgBtnPrimary" data-testid="catalog-add" @click="openEditor(null)">
                            + Add item
                        </button>
                    </div>
                </div>

                <!-- Import review -->
                <section v-if="importPlan" class="wgCard wgImport" aria-label="Import review" data-testid="import-review">
                    <div class="wgImportHead">
                        <div>
                            <p class="wgImportTitle">
                                Review import: {{ importName }}
                            </p>
                            <p class="wgMuted">
                                Rows match an existing item on SKU, then on brand and name. Nothing changes until you apply. Rows that need fixing are skipped.
                            </p>
                        </div>
                        <div class="wgImportCounts">
                            <span><strong class="wgMono">{{ importPlan.summary.new }}</strong> new</span>
                            <span><strong class="wgMono">{{ importPlan.summary.update }}</strong> updated</span>
                            <span><strong class="wgMono">{{ importPlan.summary.unchanged }}</strong> unchanged</span>
                            <span class="wgDanger"><strong class="wgMono">{{ importPlan.summary.error }}</strong> need fixing</span>
                        </div>
                        <div class="wgOwnerActions">
                            <button type="button" class="wgBtn" @click="discardImport">
                                Discard
                            </button>
                            <button type="button" class="wgBtn wgBtnAccent" :disabled="applying || !(importPlan.summary.new + importPlan.summary.update)" data-testid="import-apply" @click="applyImport">
                                {{ applying ? 'Applying…' : 'Apply import' }}
                            </button>
                        </div>
                    </div>
                    <ul v-if="importErrors.length" class="wgImportErrors">
                        <li v-for="row in importErrors" :key="row.line">
                            <strong>Row {{ row.line }}</strong><span v-if="row.name"> ({{ row.name }})</span>: {{ row.errors.join('; ') }}
                        </li>
                    </ul>
                </section>
                <p v-if="notice" class="wgNotice" role="status" data-testid="catalog-notice">
                    {{ notice }}
                </p>

                <!-- Filters -->
                <div class="wgOwnerFilters">
                    <label class="wgSearch wgOwnerSearch">
                        <span class="wgVisuallyHidden">Search catalog</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
                        <input v-model="query" type="search" class="wgInput" placeholder="Search name, brand, SKU" @input="queueLoad">
                    </label>
                    <label class="wgInlineField">Category
                        <select v-model="category" class="wgSelect" @change="load(true)">
                            <option value="">All</option>
                            <option v-for="c in categories" :key="c.name" :value="c.name">{{ c.name }} ({{ c.count }})</option>
                        </select>
                    </label>
                    <label class="wgInlineField">Status
                        <select v-model="status" class="wgSelect" @change="load(true)">
                            <option value="">All</option>
                            <option value="published">Published</option>
                            <option value="draft">Draft</option>
                        </select>
                    </label>
                </div>

                <p class="wgMuted wgOwnerCount" aria-live="polite">
                    {{ loaded ? `${total} ${total === 1 ? 'item' : 'items'}` : 'Loading…' }}
                </p>

                <div class="wgCard wgTableWrap">
                    <table class="wgTable" data-testid="catalog-table">
                        <thead>
                            <tr>
                                <th scope="col">
                                    Item
                                </th>
                                <th scope="col">
                                    Category
                                </th>
                                <th scope="col" class="wgNum">
                                    Weight
                                </th>
                                <th scope="col" class="wgNum">
                                    Price
                                </th>
                                <th scope="col">
                                    Defaults
                                </th>
                                <th scope="col">
                                    Link · Photo
                                </th>
                                <th scope="col">
                                    Status
                                </th>
                                <th scope="col">
                                    <span class="wgVisuallyHidden">Actions</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="item in items" :key="item.id" data-testid="catalog-row">
                                <td>
                                    <p class="wgCellTitle">
                                        {{ item.name }}
                                    </p>
                                    <p class="wgMuted wgCellSub">
                                        {{ [item.brand, item.sku && `SKU ${item.sku}`].filter(Boolean).join(' · ') }}
                                    </p>
                                </td>
                                <td>{{ item.category }}</td>
                                <td class="wgNum wgMono">
                                    {{ item.weight }} {{ item.unit }}
                                </td>
                                <td class="wgNum wgMono">
                                    {{ item.price === null ? '—' : formatPrice(item) }}
                                </td>
                                <td class="wgMuted">
                                    {{ [item.wornDefault && 'Worn', item.consumableDefault && 'Consumable'].filter(Boolean).join(', ') || '—' }}
                                </td>
                                <td class="wgMuted">
                                    {{ [item.url && 'Link', item.imageUrl && 'Photo'].filter(Boolean).join(' · ') || '—' }}
                                </td>
                                <td>
                                    <span class="wgBadge" :class="{ wgBadgeWarn: item.status === 'draft' }">{{ item.status === 'draft' ? 'Draft' : 'Published' }}</span>
                                </td>
                                <td class="wgNum">
                                    <button type="button" class="wgBtn wgBtnSmall" :aria-label="`Edit ${item.name}`" @click="openEditor(item)">
                                        Edit
                                    </button>
                                </td>
                            </tr>
                            <tr v-if="loaded && !items.length">
                                <td colspan="8" class="wgTableEmpty">
                                    <span v-if="query || category || status">No items match these filters.</span>
                                    <span v-else>The catalog is empty. Add an item, or import a CSV — download the template to see the columns.</span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div v-if="items.length < total" class="wgExploreMore">
                    <button type="button" class="wgBtn" @click="load(false)">
                        Show more
                    </button>
                </div>
            </main>

            <modal id="catalogEditor" :shown="editorOpen" @hide="editorOpen = false">
                <form class="wgEditor" data-testid="catalog-editor" @submit.prevent="save">
                    <h2 class="wgEditorTitle">
                        {{ editing && editing.id ? 'Edit item' : 'Add item' }}
                    </h2>
                    <div class="wgEditorGrid">
                        <label class="wgField wgSpan2">Name
                            <input v-model="form.name" class="wgInput" required maxlength="200" data-testid="field-name">
                        </label>
                        <label class="wgField">Brand
                            <input v-model="form.brand" class="wgInput" maxlength="120">
                        </label>
                        <label class="wgField">SKU
                            <input v-model="form.sku" class="wgInput" maxlength="80">
                        </label>
                        <label class="wgField">Category
                            <input v-model="form.category" class="wgInput" list="wgCatalogCategories" maxlength="80" data-testid="field-category">
                            <datalist id="wgCatalogCategories">
                                <option v-for="c in categories" :key="c.name" :value="c.name" />
                            </datalist>
                        </label>
                        <div class="wgFieldRow">
                            <label class="wgField">Weight
                                <input v-model="form.weight" class="wgInput" inputmode="decimal" required data-testid="field-weight">
                            </label>
                            <label class="wgField">Unit
                                <select v-model="form.unit" class="wgSelect">
                                    <option v-for="u in units" :key="u" :value="u">{{ u }}</option>
                                </select>
                            </label>
                        </div>
                        <div class="wgFieldRow">
                            <label class="wgField">Price
                                <input v-model="form.price" class="wgInput" inputmode="decimal" placeholder="—">
                            </label>
                            <label class="wgField">Currency
                                <input v-model="form.currency" class="wgInput" maxlength="3">
                            </label>
                        </div>
                        <label class="wgField">Status
                            <select v-model="form.status" class="wgSelect">
                                <option value="published">Published</option>
                                <option value="draft">Draft (hidden from users)</option>
                            </select>
                        </label>
                        <label class="wgField wgSpan2">Description
                            <textarea v-model="form.description" class="wgTextarea" rows="2" maxlength="1000" />
                        </label>
                        <label class="wgField wgSpan2">Product link
                            <input v-model="form.url" class="wgInput" type="url" placeholder="https://">
                        </label>
                        <label class="wgField wgSpan2">Affiliate link <span class="wgMuted">(optional; used for Buy buttons, never shown to Supporters)</span>
                            <input v-model="form.affiliateUrl" class="wgInput" type="url" placeholder="https://" data-testid="catalog-affiliate-url">
                        </label>
                        <label class="wgField wgSpan2">Photo URL
                            <input v-model="form.imageUrl" class="wgInput" type="url" placeholder="https://">
                        </label>
                        <label class="wgField wgSpan2">Tags <span class="wgMuted">(separate with ;)</span>
                            <input v-model="form.tags" class="wgInput">
                        </label>
                        <label class="wgCheck"><input v-model="form.wornDefault" type="checkbox"> Worn by default</label>
                        <label class="wgCheck"><input v-model="form.consumableDefault" type="checkbox"> Consumable by default</label>
                    </div>
                    <p v-if="formError" class="wgDanger" role="alert">
                        {{ formError }}
                    </p>
                    <div class="wgEditorActions">
                        <button v-if="editing && editing.id" type="button" class="wgBtn wgBtnGhost wgDangerBtn" @click="remove">
                            Delete
                        </button>
                        <span class="wgGrow" />
                        <button type="button" class="wgBtn" @click="editorOpen = false">
                            Cancel
                        </button>
                        <button type="submit" class="wgBtn wgBtnPrimary" :disabled="saving" data-testid="catalog-save">
                            {{ saving ? 'Saving…' : 'Save' }}
                        </button>
                    </div>
                </form>
            </modal>
        </template>
        <main v-else class="wgPage wgOwner">
            <div class="wgEmpty">
                <p><strong>Owner access only.</strong></p>
                <p class="wgMuted">
                    Sign in with an owner account to manage the gear catalog. <router-link to="/signin">
                        Sign in
                    </router-link>
                </p>
            </div>
        </main>
    </div>
</template>

<script>
import siteHeader from '../components/site-header.vue';
import ownerNav from '../components/owner-nav.vue';
import modal from '../components/modal.vue';
import { api } from '../utils/format.js';

const PAGE = 100;
const emptyForm = () => ({
    name: '', brand: '', sku: '', category: '', weight: '', unit: 'oz', price: '', currency: 'USD',
    status: 'published', description: '', url: '', affiliateUrl: '', imageUrl: '', tags: '', wornDefault: false, consumableDefault: false,
});

export default {
    name: 'OwnerCatalog',
    components: { siteHeader, ownerNav, modal },
    data() {
        return {
            items: [],
            total: 0,
            loaded: false,
            query: '',
            category: '',
            status: '',
            categories: [],
            timer: null,
            units: ['oz', 'lb', 'g', 'kg'],
            editorOpen: false,
            editing: null,
            form: emptyForm(),
            formError: '',
            saving: false,
            importText: '',
            importName: '',
            importPlan: null,
            applying: false,
            notice: '',
        };
    },
    computed: {
        isAdmin() {
            return Boolean(this.$store.state.account && this.$store.state.account.isAdmin);
        },
        importErrors() {
            return this.importPlan ? this.importPlan.rows.filter((r) => r.action === 'error') : [];
        },
    },
    mounted() {
        document.title = 'Gear catalog — Waymark Gear';
        if (this.isAdmin) {
            this.load(true);
            this.loadCategories();
        }
    },
    methods: {
        formatPrice(item) {
            const symbol = item.currency === 'USD' ? '$' : `${item.currency} `;
            return `${symbol}${item.price.toFixed(2)}`;
        },
        queueLoad() {
            clearTimeout(this.timer);
            this.timer = setTimeout(() => this.load(true), 250);
        },
        async loadCategories() {
            try {
                this.categories = (await api('/api/admin/catalog/categories')).categories;
            } catch {
                this.categories = [];
            }
        },
        async load(reset) {
            const params = new URLSearchParams({ limit: String(PAGE), offset: String(reset ? 0 : this.items.length) });
            if (this.query.trim()) params.set('q', this.query.trim());
            if (this.category) params.set('category', this.category);
            if (this.status) params.set('status', this.status);
            try {
                const r = await api(`/api/admin/catalog?${params}`);
                this.items = reset ? r.items : this.items.concat(r.items);
                this.total = r.total;
            } catch (err) {
                this.notice = err.message;
            }
            this.loaded = true;
        },
        openEditor(item) {
            this.editing = item;
            this.formError = '';
            this.form = item ? {
                ...emptyForm(),
                ...item,
                sku: item.sku || '',
                weight: String(item.weight),
                price: item.price === null ? '' : String(item.price),
                tags: (item.tags || []).join('; '),
            } : emptyForm();
            this.editorOpen = true;
        },
        async save() {
            this.saving = true;
            this.formError = '';
            const body = JSON.stringify({ ...this.form, tags: this.form.tags });
            try {
                if (this.editing && this.editing.id) {
                    await api(`/api/admin/catalog/${this.editing.id}`, { method: 'PUT', body });
                    this.notice = `Saved “${this.form.name}”. Lists using it pick up the change the next time they load.`;
                } else {
                    await api('/api/admin/catalog', { method: 'POST', body });
                    this.notice = `Added “${this.form.name}” to the catalog.`;
                }
                this.editorOpen = false;
                this.load(true);
                this.loadCategories();
            } catch (err) {
                this.formError = err.message;
            }
            this.saving = false;
        },
        async remove() {
            if (!window.confirm(`Delete “${this.editing.name}” from the catalog? Lists that already use it keep their copy.`)) return;
            try {
                await api(`/api/admin/catalog/${this.editing.id}`, { method: 'DELETE' });
                this.notice = `Deleted “${this.editing.name}”.`;
                this.editorOpen = false;
                this.load(true);
                this.loadCategories();
            } catch (err) {
                this.formError = err.message;
            }
        },
        async pickFile(evt) {
            const file = evt.target.files && evt.target.files[0];
            evt.target.value = '';
            if (!file) return;
            if (file.size > 5 * 1024 * 1024) {
                this.notice = 'That file is over 5 MB. Split it into smaller imports.';
                return;
            }
            this.importText = await file.text();
            this.importName = file.name;
            this.notice = '';
            try {
                this.importPlan = await api('/api/admin/catalog/import/preview', { method: 'POST', body: JSON.stringify({ csv: this.importText }) });
            } catch (err) {
                this.importPlan = null;
                this.notice = err.message;
            }
        },
        discardImport() {
            this.importPlan = null;
            this.importText = '';
        },
        async applyImport() {
            this.applying = true;
            try {
                const r = await api('/api/admin/catalog/import/apply', { method: 'POST', body: JSON.stringify({ csv: this.importText }) });
                const s = r.summary;
                this.notice = `Imported ${this.importName}: ${s.new} added, ${s.update} updated, ${s.unchanged} unchanged${s.error ? `, ${s.error} skipped` : ''}.`;
                this.importPlan = null;
                this.importText = '';
                this.load(true);
                this.loadCategories();
            } catch (err) {
                this.notice = err.message;
            }
            this.applying = false;
        },
    },
};
</script>

<style lang="scss">
@import "../css/_globals";

.wgOwner {
    padding-bottom: 72px;
    padding-top: 36px;
}

.wgOwnerActions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.wgFileBtn {
    position: relative;
}

.wgImport {
    margin-bottom: 18px;
    padding: 18px 22px;
}

.wgImportHead {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 20px;

    > div:first-child {
        flex: 1 1 320px;
        min-width: 0;
    }

    p {
        margin: 0;
    }
}

.wgImportTitle {
    font-size: 16px;
    font-weight: 650;
    margin-bottom: 4px !important;
}

.wgImportCounts {
    display: flex;
    flex-wrap: wrap;
    font-size: 14px;
    gap: 18px;

    strong {
        font-size: 18px;
    }
}

.wgImportErrors {
    border-top: 1px solid var(--lp-border);
    font-size: 14px;
    margin: 16px 0 0;
    max-height: 220px;
    overflow: auto;
    padding: 12px 0 0 18px;

    li {
        margin: 4px 0;
    }
}

.lp .wgDanger {
    color: var(--lp-danger);
}

.wgNotice {
    background: var(--lp-active-bg);
    border-radius: 10px;
    color: var(--lp-text);
    margin: 0 0 18px;
    padding: 12px 16px;
}

.wgOwnerFilters {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
}

.wgOwnerSearch {
    flex: 1 1 280px;
}

.wgInlineField {
    align-items: center;
    color: var(--lp-text-secondary);
    display: flex;
    font-size: 14px;
    font-weight: 600;
    gap: 8px;

    .wgSelect {
        width: auto;
    }
}

.wgOwnerCount {
    font-size: 14px;
    margin: 16px 0 10px;
}

.wgTableWrap {
    overflow-x: auto;
}

.wgTable {
    border-collapse: collapse;
    font-size: 14px;
    min-width: 960px;
    width: 100%;

    th {
        border-bottom: 1px solid var(--lp-border);
        color: var(--lp-text-secondary);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.06em;
        padding: 13px 14px;
        text-align: left;
        text-transform: uppercase;
    }

    td {
        border-bottom: 1px solid var(--lp-border);
        padding: 11px 14px;
        vertical-align: middle;
    }

    tr:last-child td {
        border-bottom: 0;
    }

    .wgNum {
        text-align: right;
    }

    p {
        margin: 0;
    }
}

.wgCellTitle {
    font-size: 15px;
    font-weight: 600;
}

.wgCellSub {
    font-size: 13px;
    margin-top: 2px !important;
}

.wgTableEmpty {
    color: var(--lp-text-secondary);
    padding: 28px 14px !important;
    text-align: center;
}

#catalogEditor {
    max-width: 640px;
    width: calc(100% - 32px);
}

.wgEditor {
    padding: 24px;
}

.lp .wgEditorTitle {
    font-size: 22px;
    margin: 0 0 18px;
}

.wgEditorGrid {
    display: grid;
    gap: 14px 16px;
    grid-template-columns: repeat(2, minmax(0, 1fr));

    @media (max-width: $mobile) {
        grid-template-columns: minmax(0, 1fr);
    }
}

.wgSpan2 {
    grid-column: 1 / -1;
}

.wgFieldRow {
    display: grid;
    gap: 10px;
    grid-template-columns: minmax(0, 1fr) 96px;
}

.wgCheck {
    align-items: center;
    display: flex;
    font-size: 15px;
    gap: 8px;
    min-height: 44px;

    input {
        height: 18px;
        width: 18px;
    }
}

.wgEditorActions {
    align-items: center;
    display: flex;
    gap: 8px;
    margin-top: 20px;
}

.wgGrow {
    flex: 1 1 auto;
}

.lp .wgDangerBtn {
    color: var(--lp-danger);
}
</style>
