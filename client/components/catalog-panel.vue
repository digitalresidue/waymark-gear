<template>
    <div class="wgCatalogPanel">
        <label class="wgSearch wgCatalogSearch">
            <span class="wgVisuallyHidden">Search the gear catalog</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
            <input ref="search" v-model="query" type="search" class="wgInput" placeholder="Search tents, quilts, stoves…" data-testid="catalog-panel-search" @input="queue">
        </label>

        <label class="wgCatalogTarget">
            <span>Add to</span>
            <select v-model="target" class="wgSelect" data-testid="catalog-panel-target">
                <option value="type">Its type (Shelter, Sleep…)</option>
                <option v-for="c in listCategories" :key="c.id" :value="String(c.id)">{{ c.name || 'Untitled category' }}</option>
            </select>
        </label>

        <div v-if="catalogCategories.length" class="wgCatalogChips" role="group" aria-label="Catalog category">
            <button type="button" class="wgChip" :aria-pressed="String(category === '')" @click="pickCategory('')">
                All
            </button>
            <button v-for="c in catalogCategories" :key="c.name" type="button" class="wgChip" :aria-pressed="String(category === c.name)" @click="pickCategory(c.name)">
                {{ c.name }}
            </button>
        </div>

        <ul v-if="results.length" class="wgCatalogResults" aria-live="polite">
            <li v-for="entry in results" :key="entry.id" class="wgCatalogRow" data-testid="catalog-panel-result">
                <img v-if="entry.imageUrl" :src="thumb(entry.imageUrl)" alt="" class="wgCatalogThumb" loading="lazy">
                <span v-else class="wgCatalogThumb wgCatalogThumbEmpty" aria-hidden="true" />
                <a :href="`/g/${entry.id}`" target="_blank" rel="noopener" class="wgCatalogName" :title="`${entry.name} (opens its gear page)`">
                    <span>{{ entry.name }}</span>
                    <span class="wgMuted">{{ [entry.brand, entry.category].filter(Boolean).join(' · ') }}</span>
                </a>
                <span class="wgMono wgCatalogWeight">{{ entry.weight }} {{ entry.unit }}</span>
                <button
                    type="button"
                    class="wgCatalogAdd"
                    :class="{ wgAdded: added[entry.id] }"
                    :aria-label="added[entry.id] ? `Added ${entry.name}` : `Add ${entry.name} to this list`"
                    :title="added[entry.id] ? 'Added' : 'Add to this list'"
                    data-testid="catalog-panel-add"
                    @click="add(entry)"
                >
                    <svg v-if="added[entry.id]" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>
                    <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                </button>
            </li>
        </ul>
        <p v-else-if="loaded" class="wgMuted wgCatalogEmpty">
            {{ query ? `Nothing in the catalog matches “${query}”.` : 'The catalog is empty.' }}
        </p>
        <button v-if="results.length < total" type="button" class="wgBtn wgBtnSmall wgCatalogMore" @click="load(false)">
            Show more
        </button>
        <p v-if="notice" class="wgCatalogNotice" role="status" data-testid="catalog-panel-notice">
            {{ notice }}
        </p>
    </div>
</template>

<script>
import { api } from '../utils/format.js';

const PAGE = 30;
const TARGET_KEY = 'wgCatalogTarget';

// The sidebar's Catalog panel: search the shared gear catalog and add gear
// to the list being edited. Gear added from the catalog stays linked to it,
// like the "Add from catalog" picker (catalog-picker.vue).
export default {
    name: 'CatalogPanel',
    props: {
        // Load on first show, not with the page.
        active: { type: Boolean, default: false },
    },
    data() {
        let target = 'type';
        try {
            target = localStorage.getItem(TARGET_KEY) || 'type';
        } catch {
            // Storage blocked: sort by type.
        }
        return { query: '', category: '', catalogCategories: [], results: [], total: 0, loaded: false, added: {}, timer: null, target, notice: '' };
    },
    computed: {
        library() {
            return this.$store.state.library;
        },
        list() {
            return this.library.getListById(this.library.defaultListId);
        },
        listCategories() {
            return this.list ? this.list.categoryIds.map((id) => this.library.getCategoryById(id)).filter(Boolean) : [];
        },
    },
    watch: {
        active: {
            immediate: true,
            handler(on) {
                if (!on) return;
                if (!this.loaded) this.load(true);
                if (!this.catalogCategories.length) {
                    api('/api/catalog/categories').then((r) => { this.catalogCategories = r.categories.slice(0, 14); }).catch(() => {});
                }
            },
        },
        target(v) {
            try {
                localStorage.setItem(TARGET_KEY, v);
            } catch {
                // Not remembered; that's fine.
            }
        },
        // A list without the category picked (or one that was deleted).
        listCategories(cats) {
            if (this.target !== 'type' && !cats.some((c) => String(c.id) === this.target)) this.target = 'type';
        },
    },
    methods: {
        thumb(url) {
            return /^\/userimages\//.test(url) ? url.replace(/\.webp$/, '_t.webp') : url;
        },
        queue() {
            clearTimeout(this.timer);
            this.timer = setTimeout(() => this.load(true), 200);
        },
        pickCategory(name) {
            this.category = name;
            this.load(true);
        },
        async load(reset) {
            const params = new URLSearchParams({ limit: String(PAGE), offset: String(reset ? 0 : this.results.length) });
            if (this.query.trim()) params.set('q', this.query.trim());
            if (this.category) params.set('category', this.category);
            try {
                const r = await api(`/api/catalog?${params}`);
                this.results = reset ? r.items : this.results.concat(r.items);
                this.total = r.total;
            } catch {
                if (reset) this.results = [];
            }
            this.loaded = true;
        },
        add(entry) {
            const category = this.target !== 'type' && this.library.getCategoryById(Number(this.target));
            if (category) {
                this.$store.commit('addCatalogItem', { categoryId: category.id, entry });
                this.notice = `Added ${entry.name} to ${category.name || 'the category'}.`;
            } else {
                this.$store.commit('addCatalogItemByType', { entry });
                this.notice = `Added ${entry.name} to ${entry.category || 'Gear'}.`;
            }
            this.added = { ...this.added, [entry.id]: true };
            setTimeout(() => {
                const { [entry.id]: _done, ...rest } = this.added;
                this.added = rest;
            }, 1600);
        },
    },
};
</script>

<style lang="scss">
@import "../css/_globals";

.wgCatalogPanel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
}

.wgCatalogSearch .wgInput {
    width: 100%;
}

.wgCatalogTarget {
    align-items: center;
    display: flex;
    font-size: 13px;
    gap: 8px;

    > span {
        color: var(--lp-text-secondary);
        white-space: nowrap;
    }

    .wgSelect {
        flex: 1 1 auto;
        min-width: 0;
    }
}

.wgCatalogChips {
    display: flex;
    flex: 0 0 auto;
    gap: 4px;
    // One row that scrolls sideways: a long category list mustn't push the
    // results out of sight.
    margin: 0 -14px;
    overflow-x: auto;
    padding: 0 14px 4px;
    scrollbar-width: thin;

    .wgChip {
        flex: 0 0 auto;
        font-size: 12px;
        padding: 3px 9px;
        white-space: nowrap;
    }
}

.wgCatalogResults {
    list-style: none;
    margin: 0;
    padding: 0;
}

.wgCatalogRow {
    align-items: center;
    border-bottom: 1px solid var(--lp-border);
    display: grid;
    gap: 8px;
    grid-template-columns: 28px minmax(0, 1fr) auto 28px;
    padding: 6px 0;
}

.wgCatalogThumb {
    background: #fff;
    border: 1px solid var(--lp-border);
    border-radius: 6px;
    height: 28px;
    object-fit: cover;
    width: 28px;
}

.wgCatalogThumbEmpty {
    background: var(--lp-surface-sunken);
    display: block;
}

.wgCatalogName {
    color: var(--lp-text);
    display: flex;
    flex-direction: column;
    font-size: 13px;
    line-height: 1.25;
    min-width: 0;
    text-decoration: none;

    span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .wgMuted {
        font-size: 11.5px;
    }

    &:hover span:first-child {
        text-decoration: underline;
    }
}

.wgCatalogWeight {
    color: var(--lp-text-secondary);
    font-size: 12px;
    white-space: nowrap;
}

.wgCatalogAdd {
    align-items: center;
    background: transparent;
    border: 1px solid var(--lp-border);
    border-radius: 8px;
    color: var(--lp-text);
    cursor: pointer;
    display: inline-flex;
    height: 28px;
    justify-content: center;
    padding: 0;
    width: 28px;

    &:hover {
        background: var(--lp-row-hover);
    }

    &.wgAdded {
        background: var(--lp-primary);
        border-color: var(--lp-primary);
        color: var(--lp-primary-ink);
    }
}

.wgCatalogMore {
    align-self: center;
}

.wgCatalogEmpty,
.wgCatalogNotice {
    font-size: 13px;
    margin: 4px 0;
}

.wgCatalogNotice {
    color: var(--lp-accent-green-deep);
}
</style>
