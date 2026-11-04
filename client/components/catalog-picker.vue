<template>
    <transition name="wgSlide">
        <aside v-if="shown" class="wgPicker" role="dialog" aria-modal="false" aria-labelledby="wgPickerTitle" data-testid="catalog-picker" @keydown.esc="close">
            <div class="wgPickerHead">
                <h2 id="wgPickerTitle">
                    Add gear
                </h2>
                <button type="button" class="wgIconBtn" aria-label="Close" data-testid="catalog-picker-close" @click="close">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
                </button>
            </div>

            <div class="wgSegmented wgPickerSource" role="tablist" aria-label="Add from">
                <button type="button" role="tab" :aria-selected="String(source === 'catalog')" data-testid="picker-source-catalog" @click="setSource('catalog')">
                    Catalog
                </button>
                <button type="button" role="tab" :aria-selected="String(source === 'closet')" data-testid="picker-source-closet" @click="setSource('closet')">
                    My closet
                </button>
            </div>

            <label class="wgField">Adding to
                <select v-model="targetId" class="wgSelect" data-testid="catalog-picker-target">
                    <option v-for="c in listCategories" :key="c.id" :value="c.id">{{ c.name || 'Untitled category' }}</option>
                </select>
            </label>

            <label class="wgSearch">
                <span class="wgVisuallyHidden">{{ source === 'closet' ? 'Search your closet' : 'Search the gear catalog' }}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
                <input ref="search" v-model="query" type="search" class="wgInput" :placeholder="source === 'closet' ? 'Search your closet' : 'Search tents, quilts, stoves…'" data-testid="catalog-picker-search" @input="queue">
            </label>

            <!-- Every catalog category, reachable: the six parent groups first
                 (as on Explore), each opening a row of its own categories,
                 then everything else A–Z. -->
            <scrollRow v-if="source === 'catalog' && sections.length" track-class="wgChips wgPickerChips" role="group" aria-label="Catalog category" data-testid="picker-sections">
                <button type="button" class="wgChip" :aria-pressed="String(!section)" @click="pickSection('')">
                    All
                </button>
                <button
                    v-for="s in sections"
                    :key="s.slug"
                    type="button"
                    class="wgChip"
                    :class="{ wgPickerParent: s.parent }"
                    :aria-pressed="String(section === s.slug || (s.parent && parentOfSection === s.slug))"
                    :data-testid="`picker-section-${s.slug}`"
                    @click="pickSection(s.slug)"
                >
                    {{ s.name }}
                </button>
            </scrollRow>
            <scrollRow v-if="source === 'catalog' && openParent && openParent.children.length > 1" track-class="wgChips wgPickerChips wgPickerChildren" role="group" :aria-label="openParent.name" data-testid="picker-children">
                <button type="button" class="wgChip" :aria-pressed="String(section === openParent.slug)" @click="pickSection(openParent.slug)">
                    All {{ openParent.name }}
                </button>
                <button
                    v-for="c in openParent.children"
                    :key="c.slug"
                    type="button"
                    class="wgChip"
                    :aria-pressed="String(section === c.slug)"
                    :data-testid="`picker-child-${c.slug}`"
                    @click="pickSection(c.slug)"
                >
                    {{ c.name }}
                </button>
            </scrollRow>

            <!-- My closet: check off gear you already own, add it in one go.
                 The list gets the same item (linked), not a copy. -->
            <div v-if="source === 'closet'" class="wgPickerResults" aria-live="polite">
                <ul v-if="closetResults.length" class="wgPickerList">
                    <li v-for="item in closetResults" :key="item.id" data-testid="closet-result">
                        <label class="wgPickerCheck">
                            <input v-model="checked" type="checkbox" :value="item.id" :aria-label="`Select ${item.name || 'unnamed gear'}`">
                            <span class="wgPickerItem">
                                <span class="wgPickerName">{{ item.name || 'Unnamed gear' }}</span>
                                <span class="wgMuted wgPickerSpec">{{ item.description }}</span>
                            </span>
                            <span class="wgMono wgPickerWeight">{{ closetWeight(item) }}</span>
                        </label>
                    </li>
                </ul>
                <p v-else class="wgMuted wgPickerEmpty">
                    {{ query ? `Nothing in your closet matches “${query}”.` : 'Everything in your closet is already in this list.' }}
                </p>
            </div>

            <div v-else class="wgPickerResults" aria-live="polite">
                <ul v-if="results.length" class="wgPickerList">
                    <li v-for="entry in results" :key="entry.id" data-testid="catalog-result">
                        <div class="wgPickerItem">
                            <p class="wgPickerName">
                                {{ entry.name }}
                            </p>
                            <p class="wgMuted wgPickerSpec">
                                {{ [entry.brand, entry.category].filter(Boolean).join(' · ') }}
                                <span v-if="entry.rating && entry.rating.count" class="wgPickerRating" data-testid="catalog-rating">
                                    · <span class="wgStars" aria-hidden="true">★</span> {{ entry.rating.average }}
                                    <span class="wgVisuallyHidden"> out of 5 from </span><span aria-hidden="true">(</span>{{ entry.rating.count }}<span class="wgVisuallyHidden"> ratings</span><span aria-hidden="true">)</span>
                                </span>
                            </p>
                        </div>
                        <span class="wgMono wgPickerWeight">{{ entry.weight }} {{ entry.unit }}</span>
                        <button
                            type="button"
                            class="wgIconBtn wgPickerAdd"
                            :class="{ wgAdded: added[entry.id] }"
                            :aria-label="added[entry.id] ? `Added ${entry.name}` : `Add ${entry.name}`"
                            data-testid="catalog-add-item"
                            @click="add(entry)"
                        >
                            <svg v-if="added[entry.id]" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>
                            <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                        </button>
                    </li>
                </ul>
                <p v-else-if="loaded && (query || section)" class="wgMuted wgPickerEmpty">
                    Nothing in the catalog matches “{{ query || sectionName }}”.
                </p>
                <p v-else-if="loaded" class="wgMuted wgPickerEmpty">
                    The gear catalog is empty for now. Create a custom item below.
                </p>
                <button v-if="results.length < total" type="button" class="wgBtn wgBtnSmall wgPickerMore" @click="load(false)">
                    Show more
                </button>
            </div>

            <div v-if="source === 'closet'" class="wgPickerFoot">
                <button type="button" class="wgBtn wgBtnPrimary wgPickerCustom" :disabled="!checked.length" data-testid="closet-add-selected" @click="addChecked">
                    {{ checked.length ? `Add ${checked.length} to ${targetName}` : 'Select gear to add' }}
                </button>
            </div>

            <div v-else class="wgPickerFoot">
                <p class="wgMuted">
                    Can't find it?
                </p>
                <button type="button" class="wgBtn wgPickerCustom" data-testid="catalog-custom" @click="custom">
                    Create a custom item
                </button>
            </div>
        </aside>
    </transition>
</template>

<script>
import { api } from '../utils/format.js';
import scrollRow from './scroll-row.vue';
import { exploreIndex, resolveSection, parentOf, PARENTS } from '../utils/explore.js';
import { categoryKey } from '../utils/gear-meta.js';
import weightUtils from '../utils/weight.js';
import { isPlaceholder } from '../utils/closet.js';

const PAGE = 30;

export default {
    name: 'CatalogPicker',
    components: { scrollRow },
    props: {
        shown: { type: Boolean, required: true },
        // The category the picker was opened from; the target can be changed.
        initialCategoryId: { type: [Number, String], default: null },
    },
    emits: ['hide'],
    data() {
        return {
            targetId: null,
            query: '',
            // The catalog's categories as they're named ([{ name, count }]),
            // and the one picked: a parent ('sleep-system'), one of its
            // categories ('topquilt') or another category ('accessories').
            catalogCategories: [],
            section: '',
            results: [],
            total: 0,
            loaded: false,
            added: {},
            timer: null,
            source: 'catalog',
            checked: [],
        };
    },
    computed: {
        // Parents that have gear (in Explore's order), then the other categories.
        index() {
            return exploreIndex(this.catalogCategories).filter((x) => x.count > 0);
        },
        sections() {
            const parentSlugs = new Set(PARENTS.map((p) => p.slug));
            return this.index.map((x) => ({
                slug: x.slug,
                parent: parentSlugs.has(x.slug),
                name: parentSlugs.has(x.slug) ? this.$t(`explore.parent.${x.slug}`, {}, x.name) : x.name,
            }));
        },
        // The parent a pick belongs to: itself, or the parent of its category.
        parentOfSection() {
            if (!this.section) return '';
            if (PARENTS.some((p) => p.slug === this.section)) return this.section;
            const raw = this.catalogCategories.find((c) => categoryKey(c.name) === this.section);
            return raw ? parentOf(raw.name) || '' : '';
        },
        sectionName() {
            const hit = this.sections.find((x) => x.slug === this.section)
                || (this.openParent && this.openParent.children.find((c) => c.slug === this.section));
            return hit ? hit.name : this.section;
        },
        openParent() {
            const slug = this.parentOfSection;
            const p = slug && this.index.find((x) => x.slug === slug);
            return p ? { ...p, name: this.$t(`explore.parent.${p.slug}`, {}, p.name) } : null;
        },
        library() {
            return this.$store.state.library;
        },
        list() {
            return this.library.getListById(this.library.defaultListId);
        },
        targetName() {
            const category = this.targetId && this.library.getCategoryById(this.targetId);
            return category ? (category.name || 'this category') : 'a new category';
        },
        // Closet gear not already in this list, newest first, retired hidden.
        closetResults() {
            const inList = new Set(this.library.getItemsInCurrentList());
            const q = this.query.trim().toLowerCase();
            return this.library.items.slice().reverse()
                .filter((item) => !item.retired && !inList.has(item.id) && !isPlaceholder(item))
                .filter((item) => !q || `${item.name} ${item.description}`.toLowerCase().includes(q));
        },
        listCategories() {
            return this.list.categoryIds.map((id) => this.library.getCategoryById(id)).filter(Boolean);
        },
    },
    watch: {
        shown(open) {
            if (open) this.open();
        },
        initialCategoryId(id) {
            if (id) this.targetId = id;
        },
    },
    methods: {
        open() {
            this.targetId = this.initialCategoryId || (this.listCategories[0] && this.listCategories[0].id) || null;
            this.added = {};
            this.checked = [];
            this.$nextTick(() => this.$refs.search && this.$refs.search.focus());
            if (!this.loaded) this.load(true);
            if (!this.catalogCategories.length) {
                api('/api/catalog/categories').then((r) => { this.catalogCategories = r.categories; }).catch(() => {});
            }
        },
        close() {
            this.$emit('hide');
        },
        setSource(source) {
            this.source = source;
            this.checked = [];
            this.$nextTick(() => this.$refs.search && this.$refs.search.focus());
        },
        closetWeight(item) {
            return `${weightUtils.MgToWeight(item.weight, item.authorUnit)} ${item.authorUnit}`;
        },
        addChecked() {
            const categoryId = this.ensureTarget();
            this.$store.commit('addClosetItems', { categoryId, itemIds: this.checked.slice() });
            this.checked = [];
        },
        queue() {
            if (this.source === 'closet') return;
            clearTimeout(this.timer);
            this.timer = setTimeout(() => this.load(true), 200);
        },
        pickSection(slug) {
            this.section = slug;
            this.load(true);
        },
        async load(reset) {
            // Gear members rate best first, browsing or searching.
            const params = new URLSearchParams({ limit: String(PAGE), offset: String(reset ? 0 : this.results.length), sort: 'rating' });
            if (this.query.trim()) params.set('q', this.query.trim());
            // A parent or a category: every catalog name it covers ("Tent" and "Tents").
            const names = this.section ? (resolveSection(this.section, this.catalogCategories) || { categories: [] }).categories : [];
            if (names.length) params.set('categories', names.join(','));
            try {
                const r = await api(`/api/catalog?${params}`);
                this.results = reset ? r.items : this.results.concat(r.items);
                this.total = r.total;
            } catch {
                if (reset) this.results = [];
            }
            this.loaded = true;
        },
        ensureTarget() {
            if (this.targetId && this.library.getCategoryById(this.targetId)) return this.targetId;
            // A list with no categories yet: make one to put the gear in.
            this.$store.commit('newCategory', this.list);
            const last = this.list.categoryIds[this.list.categoryIds.length - 1];
            this.targetId = last;
            return last;
        },
        add(entry) {
            const categoryId = this.ensureTarget();
            this.$store.commit('addCatalogItem', { categoryId, entry });
            this.added = { ...this.added, [entry.id]: true };
            setTimeout(() => {
                const { [entry.id]: _done, ...rest } = this.added;
                this.added = rest;
            }, 1600);
        },
        custom() {
            const categoryId = this.ensureTarget();
            const category = this.library.getCategoryById(categoryId);
            category.collapsed = false;
            this.$store.commit('newItem', { category, _isNew: true });
            this.close();
        },
    },
};
</script>

<style lang="scss">
@import "../css/_globals";

.wgPickerRating .wgStars {
    color: var(--lp-accent-orange);
}

.wgPicker {
    background: var(--lp-surface);
    border-left: 1px solid var(--lp-border);
    bottom: 0;
    box-shadow: -12px 0 32px rgba(20, 33, 27, 0.12);
    display: flex;
    flex-direction: column;
    gap: 14px;
    max-width: 100%;
    padding: 20px;
    position: fixed;
    right: 0;
    top: 0;
    width: 420px;
    z-index: $belowDialog;
}

.wgPickerHead {
    align-items: center;
    display: flex;
    justify-content: space-between;

    h2 {
        font-size: 21px;
        font-weight: 750;
        margin: 0 !important;
    }
}

.wgIconBtn {
    align-items: center;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 10px;
    color: var(--lp-text);
    cursor: pointer;
    display: inline-flex;
    flex: none;
    height: 44px;
    justify-content: center;
    width: 44px;

    &:hover {
        background: var(--lp-row-hover);
    }
}

.wgPickerSource {
    align-self: flex-start;
}

.wgPickerCheck {
    align-items: center;
    cursor: pointer;
    display: flex;
    gap: 12px;
    min-height: 44px;
    width: 100%;

    input {
        flex: none;
        height: 20px;
        width: 20px;
    }

    .wgPickerItem {
        display: flex;
        flex-direction: column;
    }
}

.wgPickerChips {
    flex-wrap: nowrap !important;
    padding: 0 0 4px;

    .wgChip {
        flex: none;
    }
}

.wgPickerResults {
    flex: 1 1 auto;
    margin: 0 -20px;
    overflow-y: auto;
    padding: 0 20px;
}

.wgPickerList {
    list-style: none;
    margin: 0;
    padding: 0;

    li {
        align-items: center;
        border-bottom: 1px solid var(--lp-border);
        display: flex;
        gap: 12px;
        padding: 10px 0;
    }

    p {
        margin: 0;
    }
}

.wgPickerItem {
    flex: 1 1 auto;
    min-width: 0;
}

.wgPickerName {
    font-size: 15px;
    font-weight: 600;
}

.wgPickerSpec {
    font-size: 13px;
    margin-top: 2px !important;
}

.wgPickerWeight {
    font-size: 14px;
    white-space: nowrap;
}

.wgPickerAdd {
    border-color: var(--lp-border-strong);
    color: var(--lp-accent-green-deep);
    height: 40px;
    width: 40px;

    &.wgAdded {
        background: var(--lp-active-bg);
        border-color: var(--lp-accent-green);
    }
}

.wgPickerEmpty {
    font-size: 14px;
    padding: 12px 0;
}

.wgPickerMore {
    margin: 12px 0;
}

.wgPickerFoot {
    background: var(--lp-surface-sunken);
    border-radius: 12px;
    padding: 14px 16px;

    p {
        font-size: 14px;
        margin: 0 0 8px;
    }
}

.wgPickerCustom {
    width: 100%;
}

.wgSlide-enter-active,
.wgSlide-leave-active {
    transition: transform 0.2s ease;
}

.wgSlide-enter-from,
.wgSlide-leave-to {
    transform: translateX(100%);
}

@media (prefers-reduced-motion: reduce) {
    .wgSlide-enter-active,
    .wgSlide-leave-active {
        transition: none;
    }
}
</style>
