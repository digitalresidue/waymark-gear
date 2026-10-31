<template>
    <section id="libraryContainer">
        <div class="lpSidebarSectionHeader">
            <span class="lpSectionLabel">Closet · {{ activeCount }}</span>
            <button v-if="retiredCount" type="button" class="wgClosetToggle" :aria-pressed="String(showRetired)" data-testid="closet-show-retired" @click="showRetired = !showRetired">
                {{ showRetired ? 'Hide retired' : `Retired (${retiredCount})` }}
            </button>
            <button v-if="hasGear" type="button" class="wgClosetToggle wgClosetEmpty" title="Delete all the gear in your closet" data-testid="closet-empty" @click="emptyCloset">
                Empty
            </button>
        </div>
        <div class="lpSidebarSearch">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
            <input id="librarySearch" v-model="searchText" type="text" placeholder="Search your closet" aria-label="Search your closet">
        </div>
        <div v-if="closetCategories.length" class="wgClosetFilter" role="group" aria-label="Closet category" data-testid="closet-filter">
            <button type="button" class="wgClosetChip" :aria-pressed="String(closetFilter === null)" @click="closetFilter = null">
                All
            </button>
            <button v-for="c in closetCategories" :key="c" type="button" class="wgClosetChip" :aria-pressed="String(closetFilter === c)" :data-testid="`closet-filter-${c}`" @click="closetFilter = c">
                {{ c }}
            </button>
            <button type="button" class="wgClosetChip" :aria-pressed="String(closetFilter === '')" @click="closetFilter = ''">
                Uncategorized
            </button>
        </div>
        <ul id="library" class="lpSidebarScroll">
            <li v-for="item in filteredItems" :key="item.id" class="lpLibraryItem" :class="{ wgRetired: item.retired }" :data-item-id="item.id" data-testid="closet-item">
                <div v-if="!item.inCurrentList && !item.retired" class="lpHandle lpLibraryItemHandle" title="Drag this item into your list" />
                <span class="lpLibraryItemBody">
                    <span class="lpLibraryItemTopline">
                        <span class="lpName">{{ item.name }}<span v-if="item.closetCategory && closetFilter === null" class="wgClosetTag">{{ item.closetCategory }}</span><span v-if="needsReplacing(item)" class="wgReplaceTag" data-testid="replace-soon">Replace soon</span></span>
                        <span class="lpWeight">
                            {{ displayWeight(item.weight, item.authorUnit) }}
                            {{ item.authorUnit }}
                        </span>
                    </span>
                    <span class="lpLibraryItemBottomline">
                        <span class="lpDescription"><span v-if="item.retired" class="wgRetiredTag">Retired</span><span v-else-if="item.wishlist" class="wgRetiredTag wgWishTag" data-testid="closet-wishlist-tag">Wishlist</span>{{ item.description }}</span>
                        <button type="button" class="wgClosetDetails" :aria-label="`Details for ${item.name}`" data-testid="closet-details" @click="openGearDetails(library.getItemById(item.id))">Details</button>
                        <button v-if="item.retired" type="button" class="wgClosetRestore" data-testid="closet-restore" @click="restore(item)">Restore</button>
                        <a v-else class="lpRemove lpRemoveLibraryItem speedbump" title="Remove from your closet" @click="removeItem(item)"><i class="lpSprite lpSpriteRemove" /></a>
                    </span>
                </span>
            </li>
        </ul>
    </section>
</template>

<script>
import utilsMixin from '../mixins/utils-mixin.js';
import dragula from 'dragula';
import { getElementIndex } from '../utils/utils.js';
import { confirmClosetRemoval, confirmEmptyCloset, isPlaceholder, restoreClosetItem } from '../utils/closet.js';
import { replaceSoon } from '../utils/gear-meta.js';

export default {
    name: 'LibraryItem',
    mixins: [utilsMixin],
    inject: ['initSpeedbump', 'openGearDetails'],
    props: ['item'],
    data() {
        return {
            searchText: '',
            showRetired: false,
            // null: everything; '': gear with no closet category; else that category.
            closetFilter: null,
            itemDragId: false,
            drake: null,
        };
    },
    computed: {
        library() {
            return this.$store.state.library;
        },
        closetGear() {
            return this.library.items.filter((item) => !isPlaceholder(item));
        },
        activeCount() {
            return this.closetGear.filter((item) => !item.retired).length;
        },
        hasGear() {
            return this.activeCount > 0 || this.retiredCount > 0;
        },
        retiredCount() {
            return this.closetGear.length - this.activeCount;
        },
        closetCategories() {
            return [...new Set(this.closetGear.map((i) => i.closetCategory).filter(Boolean))].sort((a, b) => a.localeCompare(b));
        },
        // Retired gear stays out of the way unless asked for.
        closetItems() {
            const visible = this.showRetired ? this.closetGear : this.closetGear.filter((item) => !item.retired);
            if (this.closetFilter === null) return visible;
            return visible.filter((item) => (item.closetCategory || '') === this.closetFilter);
        },
        filteredItems() {
            let i;
            let item;
            let filteredItems = [];
            if (!this.searchText) {
                filteredItems = this.closetItems.map(item => Object.assign({}, item));
            } else {
                const lowerCaseSearchText = this.searchText.toLowerCase();

                for (i = 0; i < this.closetItems.length; i++) {
                    item = this.closetItems[i];
                    if (item.name.toLowerCase().indexOf(lowerCaseSearchText) > -1 || item.description.toLowerCase().indexOf(lowerCaseSearchText) > -1) {
                        filteredItems.push(Object.assign({}, item));
                    }
                }
            }

            const currentListItems = this.library.getItemsInCurrentList();

            for (i = 0; i < filteredItems.length; i++) {
                item = filteredItems[i];
                if (currentListItems.indexOf(item.id) > -1) {
                    item.inCurrentList = true;
                }
            }

            return filteredItems;
        },
        list() {
            return this.library.getListById(this.library.defaultListId);
        },
        categories() {
            return this.list.categoryIds.map(id => this.library.getCategoryById(id));
        },
    },
    watch: {
        categories() {
            this.$nextTick(() => {
                this.handleItemDrag();
            });
        },
    },
    mounted() {
        this.handleItemDrag();
    },
    methods: {
        needsReplacing(item) {
            return replaceSoon(item);
        },
        handleItemDrag() {
            if (this.drake) {
                this.drake.destroy();
            }

            const self = this;
            const $library = document.getElementById('library');
            const $categoryItems = Array.prototype.slice.call(document.getElementsByClassName('lpItems')); // list.vue
            const drake = dragula([$library].concat($categoryItems), {
                copy: true,
                moves($el, _$source, $handle, _$sibling) {
                    const items = self.library.getItemsInCurrentList();
                    if (items.indexOf(parseInt($el.dataset.itemId)) > -1) {
                        return false;
                    }
                    return $handle.classList.contains('lpLibraryItemHandle');
                },
                accepts($el, $target, _$source, $sibling) {
                    if ($target.id === 'library' || !$sibling || $sibling.classList.contains('lpItemsHeader')) {
                        return false; // header and footer are technically part of this list - exclude them both.
                    }
                    return true;
                },
            });
            drake.on('drag', ($el, _$target, _$source, _$sibling) => {
                this.itemDragId = parseInt($el.dataset.itemId); // fragile
            });
            drake.on('drop', ($el, $target, _$source, _$sibling) => {
                if (!$target || $target.id === 'library') {
                    return;
                }
                const categoryId = parseInt($target.parentElement.id); // fragile
                this.$store.commit('addItemToCategory', { itemId: this.itemDragId, categoryId, dropIndex: getElementIndex($el) - 1 });
                drake.cancel(true);
            });
            this.drake = drake;
        },
        removeItem(item) {
            confirmClosetRemoval({ store: this.$store, initSpeedbump: this.initSpeedbump }, this.library.getItemById(item.id));
        },
        emptyCloset() {
            confirmEmptyCloset({ store: this.$store, initSpeedbump: this.initSpeedbump });
        },
        restore(item) {
            restoreClosetItem(this.$store, this.library.getItemById(item.id));
        },
    },
};
</script>

<style lang="scss">
@import "../css/_globals";

.lpSidebarSectionHeader .lpSectionLabel {
    margin-right: auto;
}

.wgClosetEmpty.wgClosetToggle {
    color: var(--lp-sidebar-muted, var(--lp-text-secondary));
    font-size: 12px;
    font-weight: 600;

    &:hover {
        color: var(--lp-danger);
    }
}

.wgClosetToggle {
    background: transparent;
    border: 0;
    border-radius: 6px;
    color: var(--lp-sidebar-link);
    cursor: pointer;
    font-family: $font-body;
    font-size: 12px;
    font-weight: 600;
    padding: 4px 6px;

    &:hover {
        background: var(--lp-sidebar-inset);
    }
}

.lpLibraryItem.wgRetired .lpName,
.lpLibraryItem.wgRetired .lpWeight {
    color: var(--lp-sidebar-muted);
}

.wgWishTag {
    background: #FCEFD9 !important;
    color: #5A3B06 !important;
}

.wgRetiredTag {
    background: var(--lp-surface-sunken);
    border-radius: 4px;
    color: var(--lp-sidebar-muted);
    font-size: 11px;
    font-weight: 700;
    margin-right: 6px;
    padding: 1px 5px;
}

.wgClosetRestore {
    background: transparent;
    border: 1px solid var(--lp-border-strong);
    border-radius: 6px;
    color: var(--lp-text);
    cursor: pointer;
    flex: none;
    font-family: $font-body;
    font-size: 12px;
    font-weight: 600;
    padding: 2px 8px;
}

#libraryContainer {
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    min-height: 0;
    padding-top: 12px;
}

#library {
    flex: 1 1 0;
    margin: 0;
    min-height: 0;
    padding: 0;
}

.lpSidebarSearch {
    align-items: center;
    background: var(--lp-surface);
    border: 1px solid var(--lp-border-strong);
    border-radius: 10px;
    color: var(--lp-sidebar-muted);
    display: flex;
    flex: 0 0 auto;
    gap: 8px;
    margin: 8px 14px;
    min-height: 38px;
    padding: 6px 12px;

    &:focus-within {
        border-color: var(--lp-link-blue);
        box-shadow: var(--lp-focus-ring);
    }

    svg {
        flex: 0 0 auto;
    }

    #librarySearch {
        background: transparent;
        border: none;
        color: var(--lp-sidebar-text);
        flex: 1 1 auto;
        font-size: 13px;
        min-width: 0;
        outline: none;
        padding: 0;

        &::placeholder {
            color: var(--lp-sidebar-muted);
        }
    }
}

.lpLibraryItem {
    display: flex;
    font-size: 13px;
    gap: 8px;
    list-style: none;
    margin: 0;
    padding: 6px 6px 6px 18px;
    position: relative;

    &.gu-mirror {
        background: var(--lp-sidebar-inset);
        border: 1px solid var(--lp-sidebar-border);
        color: var(--lp-sidebar-text);
    }

    .lpHandle {
        left: 2px;
        margin: 0;
        padding: 3px 9px 20px 1px;
        position: absolute;
        top: 0;
    }

    .lpLibraryItemBody {
        display: block;
        flex: 1 1 auto;
        min-width: 0;
    }

    .lpLibraryItemTopline {
        align-items: baseline;
        display: flex;
        gap: 8px;
    }

    .lpLibraryItemBottomline {
        align-items: center;
        display: flex;
        justify-content: space-between;
        gap: 8px;
    }

    .lpName {
        color: var(--lp-sidebar-text);
        flex: 1 1 auto;
        float: none;
        margin: 0;
        max-width: none;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .lpWeight {
        color: var(--lp-sidebar-muted);
        flex: 0 0 auto;
        float: none;
        font-size: 12px;
        width: auto;
    }

    .lpDescription {
        color: var(--lp-sidebar-muted);
        display: block;
        font-size: 12px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        width: auto;
    }

    // In flow rather than absolute, so the row's gap reserves a real gutter
    // between the name and the ✕ instead of letting them overlap.
    .lpRemove {
        align-self: flex-start;
        flex: 0 0 auto;
        margin-bottom: 0;
        margin-top: 1px;
    }

    #main > & {
        background: var(--lp-sidebar-inset);
        color: var(--lp-sidebar-text);
        padding: 10px 10px 10px 22px;
        width: 220px;
    }
}

.lpLibraryItem:hover .lpRemove,
.lpLibraryItem:hover .lpHandle {
    visibility: visible;
}

// No phone rules here: below $mobile the drawer links out to the gear screen
// (see sidebar.vue) and this component isn't rendered at all.
.wgClosetFilter {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 0 0 8px;
}

.wgClosetChip {
    background: transparent;
    border: 1px solid var(--lp-border);
    border-radius: 999px;
    color: var(--lp-sidebar-text);
    cursor: pointer;
    font: inherit;
    font-size: 11.5px;
    padding: 2px 9px;

    &[aria-pressed="true"] {
        background: var(--lp-primary);
        border-color: var(--lp-primary);
        color: var(--lp-primary-ink);
    }
}

.wgClosetTag {
    background: var(--lp-surface-sunken);
    border-radius: 5px;
    color: var(--lp-text-secondary);
    font-size: 10.5px;
    font-weight: 600;
    margin-left: 6px;
    padding: 1px 5px;
}

#libraryContainer .wgClosetDetails,
.wgClosetDetails {
    background: none;
    border: 0;
    border-radius: 0;
    flex: none;
    line-height: 1.2;
    margin-left: auto;
    min-height: 0;
    color: var(--lp-link-blue, var(--lp-primary));
    cursor: pointer;
    font: inherit;
    font-size: 11.5px;
    font-weight: 600;
    padding: 0 4px;
}
</style>
