<template>
    <li :id="category.id" class="lpCategory" :class="{lpCategoryEmpty: isEmpty, wgCollapsed: category.collapsed}" data-testid="category">
        <ul class="lpItems lpDataTable" :class="{lpHasPrice: optionalFields['price'], lpHasImages: showImages}">
            <li class="lpHeader lpItemsHeader">
                <span class="lpHandleCell">
                    <div class="lpHandle lpCategoryHandle" title="Reorder this category" />
                </span>
                <span class="lpCategoryHead">
                    <button
                        type="button"
                        class="wgDrawerToggle"
                        :aria-expanded="String(!category.collapsed)"
                        :aria-label="`${category.collapsed ? 'Expand' : 'Collapse'} ${category.name || 'category'}`"
                        data-testid="category-toggle"
                        @click="toggleCollapsed"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
                    </button>
                    <span v-if="swatchColor" class="lpCategorySwatch" :style="{background: swatchColor}" />
                    <input v-focus-on-create="!!category._isNew" type="text" :value="category.name" placeholder="Category Name" class="lpCategoryName lpSilent" @input="updateCategoryName">
                    <span v-if="category.collapsed" class="wgItemCount" data-testid="category-count">{{ itemCountLabel }}</span>
                    <categoryGroupMenu :category="category" />
                </span>
                <span v-if="optionalFields['price']" class="lpPriceCell lpNumber lpSubtotal">
                    {{ displayPrice(category.subtotalPrice, library.currencySymbol) }}
                </span>
                <span class="lpWeightCell lpNumber lpSubtotal">
                    <span class="lpDisplaySubtotal" data-testid="category-subtotal-weight">{{ displayWeight(category.subtotalWeight, library.totalUnit) }}</span>
                    <!-- Ghost caret mirrors the item rows' unit-picker metrics so the
                         subtotal number aligns with the item weights below it. -->
                    <span class="lpSubtotalUnit">{{ library.totalUnit }} <i class="lpSprite lpExpand lpGhostCaret" /></span>
                </span>
                <span class="lpQtyCell lpSubtotal">
                    <span class="lpQtySubtotal">{{ displayQty(category.subtotalQty) }}</span>
                </span>
                <span class="lpRemoveCell"><a class="lpRemove lpRemoveCategory" title="Remove this category" @click="removeCategory(category)"><i class="lpSprite lpSpriteRemove" /></a></span>
            </li>
            <template v-if="!category.collapsed">
                <component :is="itemComponent" v-for="itemContainer in itemContainers" :key="itemContainer.item.id" :item-container="itemContainer" :category="category" />
                <li class="lpFooter lpItemsFooter">
                    <span class="lpAddItemCell">
                        <a class="lpAdd lpAddItem" @click="newItem"><i class="lpSprite lpSpriteAdd" />Add new item</a>
                        <button type="button" class="wgAddCatalog" data-testid="add-from-catalog" @click="openCatalogPicker(category)">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
                            Add from catalog
                        </button>
                        <kitMenu v-if="!planMode" :category="category" />
                    </span>
                </li>
            </template>
        </ul>
    </li>
</template>

<script>
import kitMenu from './kit-menu.vue';
import categoryGroupMenu from './category-group-menu.vue';
import item from './item.vue';
import itemMobile from './item-mobile.vue';

import utilsMixin from '../mixins/utils-mixin.js';
import { isMobile } from '../utils/viewport.js';

export default {
    name: 'Category',
    components: {
        kitMenu,
        categoryGroupMenu,
        item,
        itemMobile,
    },
    mixins: [utilsMixin],
    inject: ['initSpeedbump', 'openCatalogPicker'],
    props: ['category'],
    setup() {
        return { isMobile };
    },
    computed: {
        // Kits are personal; not offered while planning someone else's list.
        planMode() {
            return this.$store.state.saveType === 'shared';
        },
        // Display-vs-edit is a mode on a phone and no mode at all on the
        // desktop, so the row swaps components rather than reflowing. Both
        // share item-mixin.js, so only the markup differs.
        itemComponent() {
            return this.isMobile ? 'itemMobile' : 'item';
        },
        library() {
            return this.$store.state.library;
        },
        optionalFields() {
            return this.$store.getters.optionalFields;
        },
        itemContainers() {
            return this.category.categoryItems.map(categoryItem => ({ categoryItem, item: this.library.getItemById(categoryItem.itemId) }));
        },
        swatchColor() {
            return this.category.displayColor || '';
        },
        itemCountLabel() {
            const n = this.category.categoryItems.length;
            return `${n} ${n === 1 ? 'item' : 'items'}`;
        },
        isEmpty() {
            return this.category.categoryItems.length === 0;
        },
        // The photo column is only there when the Images option is on and an
        // item in this category has a photo: no photos, no empty column.
        showImages() {
            return Boolean(this.optionalFields.images) && this.itemContainers.some(({ item }) => item && (item.image || item.imageUrl));
        },
    },
    mounted() {
        // Same as item rows: _isNew only drives the one-time focus on create;
        // clear it so remounts don't refocus the category name.
        if (this.category._isNew) {
            this.$store.commit('clearCategoryIsNew', this.category.id);
        }
    },
    methods: {
        toggleCollapsed() {
            this.$store.commit('toggleCategoryCollapsed', this.category);
        },
        newItem() {
            this.$store.commit('newItem', { category: this.category, _isNew: true });
        },
        updateCategoryName(evt) {
            this.$store.commit('updateCategoryName', { id: this.category.id, name: evt.target.value });
        },
        removeCategory(category) {
            const callback = () => {
                this.$store.commit('removeCategory', category);
            };
            const speedbumpOptions = {
                body: 'Are you sure you want to delete this category? This cannot be undone.',
            };
            this.initSpeedbump(callback, speedbumpOptions);
        },
    },
};
</script>

<style lang="scss">
@import "../css/_globals";

// Drawer toggle: categories fold to their header so a long list stays
// scannable. The state is saved with the library.
.wgDrawerToggle {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 8px;
    color: var(--lp-text-secondary);
    cursor: pointer;
    display: inline-flex;
    flex: 0 0 32px;
    height: 32px;
    justify-content: center;
    margin-left: -6px;
    padding: 0;

    &:hover {
        background: var(--lp-row-hover);
        color: var(--lp-text);
    }

    svg {
        transform: rotate(90deg);
        transition: transform 0.15s;

        .wgCollapsed & {
            transform: rotate(0deg);
        }
    }

    @media (prefers-reduced-motion: reduce) {
        svg {
            transition: none;
        }
    }
}

.lp .lpItemsHeader .lpCategoryName {
    font-size: 16px;
    font-weight: 650;
}

.wgItemCount {
    color: var(--lp-text-secondary);
    flex: none;
    font-size: 13px;
    white-space: nowrap;
}

.lpAddItemCell {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 6px 20px;
}

.wgAddCatalog {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 8px;
    color: var(--lp-accent);
    cursor: pointer;
    display: inline-flex;
    font-family: $font-body;
    font-size: 14px;
    font-weight: 600;
    gap: 6px;
    min-height: 36px;
    padding: 0 8px;

    &:hover {
        background: var(--lp-row-hover);
    }
}

.lpCategory {
    background: var(--lp-surface);
    border: 1px solid var(--lp-border);
    border-radius: 14px;
    list-style: none;
    margin: 0 0 12px;
    // The side padding is the gutter the drag handle (left) and remove ✕
    // (right) sit in, so they stay inside the card.
    padding: 8px 46px 6px 36px;
    transition: border-color 0.15s;

    &:hover {
        border-color: var(--lp-border-strong);
    }

    &.wgCollapsed {
        padding-bottom: 8px;

        .lpItemsHeader {
            border-bottom: 0;
        }
    }

    &.dropAccept {
        background: var(--lp-hover-bg);
    }

    &.dropHover {
        background: var(--lp-accent-green);
    }

    &.gu-mirror {
        background: var(--lp-content-bg);
        border: 1px solid var(--lp-border-strong);
    }
}

// Spreadsheet table: hairline dividers, fixed numeric columns, tabular
// numerals. Every row is a grid over one shared column template so the
// header subtotals, item cells, and footer can never drift out of sync:
// name | description | flags | (price) | weight | qty. The header merges
// the leading tracks; its tail matches the rows' fixed tracks exactly.
.lpItems {
    margin: 0;
    padding: 0;
    width: 100%;

    .lpItem,
    .lpItemsHeader,
    .lpItemsFooter {
        align-items: center;
        column-gap: 12px;
        display: grid;
        position: relative;
    }

    .lpItem {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto 82px 35px;
    }

    .lpItemsHeader {
        grid-template-columns: minmax(0, 1fr) 82px 35px;
    }

    .lpItemsFooter {
        grid-template-columns: 1fr;
    }

    &.lpHasPrice {
        .lpItem {
            grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto 52px 82px 35px;
        }

        .lpItemsHeader {
            grid-template-columns: minmax(0, 1fr) 52px 82px 35px;
        }
    }

    // Images on, but no photos in this category: no column (see showImages).
    &:not(.lpHasImages) .lpItem .lpImageCell {
        display: none;
    }

    &.lpHasImages .lpItem {
        grid-template-columns: 25px minmax(0, 1fr) minmax(0, 1fr) auto 82px 35px;
    }

    &.lpHasImages.lpHasPrice .lpItem {
        grid-template-columns: 25px minmax(0, 1fr) minmax(0, 1fr) auto 52px 82px 35px;
    }

    // Gutter controls live in the side margins so columns never shift.
    .lpHandleCell {
        left: -25px;
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        width: 16px;
    }

    // Sits further out in the gutter to leave clear space between the qty
    // stepper (which bleeds just past the table edge) and the remove ✕.
    .lpRemoveCell {
        position: absolute;
        right: -38px;
        top: 50%;
        transform: translateY(-50%);
    }

    .lpPriceCell {
        color: var(--lp-text-secondary);
        font-size: 13px;
        font-variant-numeric: tabular-nums;
        min-width: 0;
        text-align: right;
    }

    .lpWeightCell {
        font-variant-numeric: tabular-nums;
        min-width: 0;
        text-align: right;
        white-space: nowrap;
    }

    .lpQtyCell {
        font-size: 12px;
        min-width: 0;
        text-align: right;
    }
}

// The header rule is structural — it separates the subtotals from the rows
// below and stays put. The title carries its own rename affordance.
.lpItemsHeader {
    border-bottom: 1px solid var(--lp-border-strong);
    padding: 0 0 2px;

    .lpCategoryHead {
        align-items: center;
        display: flex;
        gap: 8px;
        min-width: 0;
    }

    .lpCategorySwatch {
        flex: 0 0 11px;
        height: 11px;
    }

    // Quiet input base comes from .lpSilent; the rename affordance matches the
    // item rows — outlined on hover, filled on focus. The negative margin
    // cancels the box's padding so the title doesn't drift off the swatch.
    input.lpCategoryName {
        flex: 1 1 auto;
        font-size: 14.5px;
        font-weight: 700;
        margin: 0 -5px;
        min-width: 0;
        padding: 3px 7px;
        transition: border-color $transitionDuration;

        &:hover {
            border-color: var(--lp-border);
        }

        &:focus {
            background: var(--lp-bg);
            border-color: var(--lp-border-strong);
        }
    }

    // padding-right mirrors the rows' unit-picker right padding; the unit's
    // padding-left mirrors their input-to-unit gap, so numbers and unit
    // labels line up column-exact with the item rows.
    .lpWeightCell {
        color: var(--lp-text);
        font-size: 13px;
        font-weight: 700;
        padding-right: 2px;

        .lpSubtotalUnit {
            color: var(--lp-text-secondary);
            font-size: 12px;
            font-weight: 400;
            padding-left: 11px;
        }

        .lpGhostCaret {
            visibility: hidden;
        }
    }

    // Item-row inputs inset their text 2px from the cell edge; match it.
    .lpPriceCell,
    .lpQtyCell {
        font-weight: 400;
    }

    .lpQtyCell {
        padding-right: 8px;
    }
}

.lpItemsFooter {
    padding: 7px 0;

    .lpAddItemCell {
        flex: 1 1 auto;
    }

    .lpAdd {
        font-size: 13px;
        font-weight: 600;
        margin: 0;
    }
}

// Hover-show rules for category drag handle and remove button
.lpCategory .lpHeader:hover .lpRemove,
.lpCategory .lpHeader:hover .lpHandle {
    visibility: visible;
}

// ============================================================
// Phone layout — category header and footer (#11a/#18a)
//
// On the desktop the header is a grid whose trailing columns line up with the
// item rows' price/weight/qty. Mobile item rows are their own component
// (item-mobile.vue) with a two-line layout, so there are no columns left to
// align to: the header stops being a table head and becomes a band —
// swatch · name · subtotal — with the rows' 14px inset.
// ============================================================
@media only screen and (width <= $mobile) {
    // No drag handle or ✕ gutters on a phone.
    .lpCategory {
        margin: 0;
        padding-left: 14px;
        padding-right: 14px;
    }

    .lpItems .lpItemsHeader {
        column-gap: 7px;
        display: flex;
        padding: 11px 14px 5px;
    }

    .lpItemsHeader .lpCategoryHead {
        flex: 1 1 auto;
    }

    .lpItemsHeader input.lpCategoryName {
        // 16px keeps iOS Safari from zooming the page when the field takes
        // focus. The design draws 14px, but a rename that yanks the viewport
        // is the worse trade.
        font-size: 16px;
    }

    .lpItemsHeader .lpPriceCell {
        font-size: 11.5px;
    }

    .lpItemsHeader .lpWeightCell {
        font-size: 12.5px;
        padding-right: 0;

        // The caret is a spacer reserving the item rows' unit-picker width so
        // the subtotal lines up with the weights below. There's no column to
        // line up with here.
        .lpGhostCaret {
            display: none;
        }

        .lpSubtotalUnit {
            padding-left: 4px;
        }
    }

    // Item counts are desktop-only detail; the design's header carries price
    // and weight and stops there.
    .lpItemsHeader .lpQtyCell {
        display: none;
    }

    // Reordering categories is a pointer drag with no touch equivalent yet
    // (#11e is deferred), so the handle would be a dead control.
    .lpItems .lpHandleCell {
        display: none;
    }

    // Out of the gutter — there isn't one at this width — and out of the flow
    // entirely until the category is empty. There's no hover to reveal it, and
    // deleting a category full of items is a big action to leave one stray tap
    // away, so emptying it first makes that deliberate. Removed rather than
    // just hidden: reserving the space nudged every populated header's weight
    // out of line with the item rows below it.
    .lpItems .lpRemoveCell {
        display: none;
    }

    .lpCategoryEmpty .lpItems .lpRemoveCell {
        display: block;
        position: static;
        transform: none;

        .lpRemove {
            visibility: visible;
        }
    }

    // The inset lives on the footer, not the link. As a block the link spanned
    // the row, so the empty space to the right of the words was a tap target
    // too — and tapping it added an item you hadn't aimed for.
    .lpItemsFooter {
        padding: 0 14px;

        .lpAdd {
            align-items: center;
            display: inline-flex;
            font-size: 12.5px;
            padding: 11px 0;
        }
    }
}
</style>
