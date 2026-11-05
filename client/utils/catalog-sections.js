// The catalog's categories as chips, grouped like Explore: the six parent
// groups first (Pack, Shelter, Sleep System, Clothing, Cook Kit, Water), each
// opening a row of its own categories, then every other category A–Z.
// Shared by the "Add from catalog" picker and the editor's Catalog panel.
//
// A component using this sets `catalogCategories` ([{ name, count }] from
// /api/catalog/categories, all of them) and `section` (the pick: a parent
// slug, one of its categories, or another category; '' for all), and adds
// `sectionParam()` to its /api/catalog query.

import { exploreIndex, resolveSection, parentOf, PARENTS } from './explore.js';
import { categoryKey } from './gear-meta.js';

const PARENT_SLUGS = new Set(PARENTS.map((p) => p.slug));

export default {
    data() {
        return { catalogCategories: [], section: '' };
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
            const raw = this.catalogCategories.find((c) => categoryKey(c.name) === this.section);
            return raw ? parentOf(raw.name) || '' : '';
        },
        openParent() {
            const slug = this.parentOfSection;
            const p = slug && this.sectionIndex.find((x) => x.slug === slug);
            return p ? { ...p, name: this.$t(`explore.parent.${p.slug}`, {}, p.name) } : null;
        },
        sectionName() {
            const hit = this.sections.find((x) => x.slug === this.section)
                || (this.openParent && this.openParent.children.find((c) => c.slug === this.section));
            return hit ? hit.name : this.section;
        },
    },
    methods: {
        // Every catalog name the pick covers ("Tent" and "Tents"), for ?categories=.
        sectionParam() {
            if (!this.section) return '';
            return ((resolveSection(this.section, this.catalogCategories) || { categories: [] }).categories).join(',');
        },
    },
};
