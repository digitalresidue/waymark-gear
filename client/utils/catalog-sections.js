// The catalog's categories as chips, grouped like Explore: the six parent
// groups first (Pack, Shelter, Sleep System, Clothing, Cook Kit, Water), each
// opening a row of its own categories, then every other category A–Z.
// Shared by the "Add from catalog" picker and the editor's Catalog panel.
//
// Pack opens its pack types instead (Packs, Fastpacks, Hydration vests,
// Daypacks), as on Explore: picks like "pack_type:fastpack".
//
// A component using this sets `catalogCategories` and `catalogSubtypes`
// (categories and subtypes from /api/catalog/categories) and `section` (the
// pick: a parent slug, one of its categories or sub-items, or another
// category; '' for all), and adds `sectionQuery()` to its /api/catalog query.

import { exploreIndex, resolveSection, parentOf, PARENTS } from './explore.js';
import { categoryKey } from './gear-meta.js';

const PARENT_SLUGS = new Set(PARENTS.map((p) => p.slug));

export default {
    data() {
        return { catalogCategories: [], catalogSubtypes: {}, section: '' };
    },
    computed: {
        // Parents that have gear (in Explore's order), then the other categories.
        sectionIndex() {
            return exploreIndex(this.catalogCategories).filter((x) => x.count > 0);
        },
        sections() {
            return this.sectionIndex.map((x) => ({
                slug: x.slug,
                parent: PARENT_SLUGS.has(x.slug),
                name: PARENT_SLUGS.has(x.slug) ? this.$t(`explore.parent.${x.slug}`, {}, x.name) : x.name,
            }));
        },
        // The parent a pick belongs to: itself, or the parent of its category.
        parentOfSection() {
            if (!this.section) return '';
            if (PARENT_SLUGS.has(this.section)) return this.section;
            const sub = this.subtypePick;
            if (sub) return sub.parent;
            const raw = this.catalogCategories.find((c) => categoryKey(c.name) === this.section);
            return raw ? parentOf(raw.name) || '' : '';
        },
        openParent() {
            const slug = this.parentOfSection;
            const p = slug && this.sectionIndex.find((x) => x.slug === slug);
            if (!p) return null;
            const parent = { ...p, name: this.$t(`explore.parent.${p.slug}`, {}, p.name) };
            const sub = PARENTS.find((x) => x.slug === slug).subtypes && this.catalogSubtypes[slug];
            if (!sub) return parent;
            return {
                ...parent,
                children: sub.options.map((o) => ({ slug: `${sub.key}:${o.value}`, name: this.$t(`explore.subtype.${sub.key}.${o.value}`, {}, o.name), count: o.count })),
            };
        },
        // A sub-item pick ("pack_type:fastpack"): { parent, key, value }.
        subtypePick() {
            const m = /^([a-z_]+):([a-z_]+)$/.exec(this.section || '');
            if (!m) return null;
            const parent = PARENTS.find((p) => p.subtypes === m[1]);
            return parent ? { parent: parent.slug, key: m[1], value: m[2] } : null;
        },
        sectionName() {
            const hit = this.sections.find((x) => x.slug === this.section)
                || (this.openParent && this.openParent.children.find((c) => c.slug === this.section));
            return hit ? hit.name : this.section;
        },
    },
    methods: {
        // The /api/catalog query for the pick: every catalog name it covers
        // ("Tent" and "Tents") as ?categories=, and a sub-item as its spec
        // (?pack_type=fastpack).
        sectionQuery() {
            if (!this.section) return {};
            const sub = this.subtypePick;
            const slug = sub ? sub.parent : this.section;
            const categories = ((resolveSection(slug, this.catalogCategories) || { categories: [] }).categories).join(',');
            return sub ? { categories, [sub.key]: sub.value } : (categories ? { categories } : {});
        },
        // The categories response: its categories and sub-items.
        takeCategories(r) {
            this.catalogCategories = r.categories;
            this.catalogSubtypes = r.subtypes || {};
        },
    },
};
