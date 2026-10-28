<template>
    <div v-if="isLoaded" id="lpGear">
        <div class="lpGearHeader">
            <!-- An SVG rather than a ‹ glyph: the character's baseline sits
                 well off centre against the title, and where it lands varies
                 with the font. -->
            <a class="lpGearBack" data-testid="gear-back" title="Back to your list" @click="goBack">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>
            </a>
            <h1 class="lpGearTitle">
                Closet
            </h1>
            <span class="lpGearCount">{{ activeCount }}</span>
        </div>

        <div class="lpGearSearchRow">
            <label class="lpGearSearch">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
                <input v-model="searchText" type="text" placeholder="Search your closet" data-testid="gear-search">
            </label>
        </div>

        <div class="lpGearFilters">
            <a
                v-for="option in filterOptions"
                :key="option.key"
                class="lpGearChip"
                :class="{lpGearChipActive: filter === option.key}"
                :data-testid="'gear-filter-' + option.key"
                @click="filter = option.key"
            >{{ option.label }}</a>
        </div>

        <ul class="lpGearList">
            <li v-for="entry in filteredItems" :key="entry.item.id" class="lpGearRow" data-testid="gear-row">
                <div class="lpGearRowMain">
                    <div class="lpGearRowBody">
                        <div class="lpGearName">
                            {{ entry.item.name || 'Unnamed gear' }}
                        </div>
                        <div class="lpGearMeta">
                            {{ metaLine(entry.item) }}<template v-if="entry.item.closetCategory">
                                · {{ entry.item.closetCategory }}
                            </template>
                            <span v-if="needsReplacing(entry.item)" class="wgReplaceTag">Replace soon</span>
                        </div>
                        <button type="button" class="wgClosetDetails lpGearDetails" data-testid="closet-details" @click="detailsItem = entry.item">
                            Details{{ (entry.item.photos && entry.item.photos.length) || entry.item.videoUrl ? ' · media' : '' }}
                        </button>
                    </div>

                    <button v-if="entry.item.retired" type="button" class="lpGearRestore" data-testid="closet-restore" @click="restore(entry.item)">
                        Restore
                    </button>
                    <button v-else-if="entry.item.wishlist" type="button" class="lpGearRestore" data-testid="closet-got-it" title="Bought it: move it into your closet" @click="gotIt(entry.item)">
                        Got it
                    </button>
                    <span v-else-if="entry.inList" class="lpGearInList" data-testid="gear-in-list">✓ In list</span>
                    <a
                        v-else
                        class="lpGearAdd"
                        :class="{lpGearAddOpen: pickerItemId === entry.item.id}"
                        data-testid="gear-add"
                        :title="'Add ' + (entry.item.name || 'this gear') + ' to your list'"
                        @click="togglePicker(entry.item.id)"
                    >+</a>

                    <a v-if="!entry.item.retired" class="lpGearRemove" data-testid="gear-remove" title="Remove from your closet" @click="removeItem(entry.item)">
                        <i class="lpSprite lpSpriteRemove" />
                    </a>
                </div>

                <!-- The picker opens under the row it belongs to (#8c), rather
                     than as a sheet: the gear you tapped stays on screen, so
                     there's no doubt what's being filed. -->
                <div v-if="pickerItemId === entry.item.id" class="lpGearPicker" data-testid="gear-picker">
                    <div class="lpGearPickerLabel">
                        Add <b>{{ entry.item.name || 'this gear' }}</b> to…
                    </div>
                    <div class="lpGearPickerChips">
                        <a
                            v-for="category in categories"
                            :key="category.id"
                            class="lpGearPickerChip"
                            data-testid="gear-picker-category"
                            @click="addTo(entry.item, category)"
                        >
                            <span class="lpGearPickerSwatch" :style="{background: category.displayColor}" />
                            {{ category.name || 'Untitled category' }}
                        </a>
                    </div>
                </div>
            </li>

            <li v-if="!filteredItems.length" class="lpGearEmpty">
                {{ emptyMessage }}
            </li>
        </ul>

        <speedbump
            :shown="showSpeedbump"
            :speedbump-callback="speedbumpCallback"
            :speedbump-options="speedbumpOptions"
            @hide="showSpeedbump = false"
        />
        <gearDetails :shown="Boolean(detailsItem)" :item="detailsItem" @hide="detailsItem = null" />
        <globalAlerts />
    </div>
</template>

<script>
import globalAlerts from '../components/global-alerts.vue';
import speedbump from '../components/speedbump.vue';
import gearDetails from '../components/gear-details.vue';
import { replaceSoon } from '../utils/gear-meta.js';
import { api } from '../utils/format.js';

import utilsMixin from '../mixins/utils-mixin.js';
import { confirmClosetRemoval, isPlaceholder, restoreClosetItem } from '../utils/closet.js';

export default {
    name: 'Gear',
    components: {
        globalAlerts,
        speedbump,
        gearDetails,
    },
    mixins: [utilsMixin],
    data() {
        return {
            isLoaded: false,
            searchText: '',
            filter: 'all',
            pickerItemId: null,
            showSpeedbump: false,
            speedbumpCallback: null,
            detailsItem: null,
            speedbumpOptions: null,
        };
    },
    computed: {
        library() {
            return this.$store.state.library;
        },
        list() {
            return this.library.getListById(this.library.defaultListId);
        },
        categories() {
            return this.list.categoryIds.map(id => this.library.getCategoryById(id));
        },
        filterOptions() {
            const options = [
                { key: 'all', label: `All · ${this.activeCount}` },
                { key: 'notInList', label: `Not in ${this.list.name || 'this list'}` },
                // The closet keeps gear in the order it was added, so newest
                // first is that order reversed.
                { key: 'newest', label: 'Newest' },
            ];
            if (this.wishlistCount) options.push({ key: 'wishlist', label: `Wishlist · ${this.wishlistCount}` });
            if (this.retiredCount) options.push({ key: 'retired', label: `Retired · ${this.retiredCount}` });
            // The closet categories you've made (Insulation, Shelter...).
            const cats = [...new Set(this.closetGear.map((i) => i.closetCategory).filter(Boolean))].sort((a, b) => a.localeCompare(b));
            for (const c of cats) options.push({ key: `cat:${c}`, label: c });
            return options;
        },
        closetGear() {
            return this.library.items.filter((item) => !isPlaceholder(item));
        },
        activeCount() {
            return this.closetGear.filter((item) => !item.retired && !item.wishlist).length;
        },
        retiredCount() {
            return this.closetGear.filter((item) => item.retired).length;
        },
        wishlistCount() {
            return this.closetGear.filter((item) => item.wishlist && !item.retired).length;
        },
        itemsInList() {
            return this.library.getItemsInCurrentList();
        },
        filteredItems() {
            const search = this.searchText.trim().toLowerCase();

            let entries = this.closetGear
                .filter((item) => {
                    if (this.filter === 'retired') return item.retired;
                    if (this.filter === 'wishlist') return item.wishlist && !item.retired;
                    return !item.retired && !item.wishlist;
                })
                .map(item => ({
                    item,
                    inList: this.itemsInList.indexOf(item.id) > -1,
                }));

            if (search) {
                entries = entries.filter(({ item }) => item.name.toLowerCase().indexOf(search) > -1
                    || item.description.toLowerCase().indexOf(search) > -1);
            }

            if (this.filter.startsWith('cat:')) {
                const cat = this.filter.slice(4);
                entries = entries.filter(({ item }) => item.closetCategory === cat);
            } else if (this.filter === 'notInList') {
                entries = entries.filter(entry => !entry.inList);
            } else if (this.filter === 'newest') {
                entries = entries.slice().reverse();
            }

            return entries;
        },
        emptyMessage() {
            if (this.searchText.trim()) {
                return `No gear matches “${this.searchText.trim()}”.`;
            }
            if (this.filter === 'notInList') {
                return 'Every piece of gear you own is already in this list.';
            }
            if (this.filter === 'wishlist') {
                return 'Nothing on your wishlist.';
            }
            if (this.filter === 'retired') {
                return 'No retired gear.';
            }
            return 'Your closet is empty. Gear you add to a list shows up here.';
        },
    },
    beforeMount() {
        if (!this.$store.state.library) {
            this.$router.push('/welcome');
        } else {
            this.isLoaded = true;
            this.takeWish();
        }
    },
    methods: {
        // /gear?wish=<catalog id>, from a gear page or a comparison: add it
        // to the wishlist (once) and show the wishlist.
        async takeWish() {
            const id = String(this.$route.query.wish || '');
            if (!/^[0-9a-f-]{36}$/i.test(id)) return;
            this.$router.replace('/gear');
            if (!this.library.items.some((i) => i.catalogId === id && i.wishlist)) {
                try {
                    const { items } = await api(`/api/catalog?ids=${encodeURIComponent(id)}`);
                    if (items && items[0]) this.$store.commit('addWishlistItem', { entry: items[0] });
                } catch {
                    return;
                }
            }
            this.filter = 'wishlist';
        },
        gotIt(item) {
            this.$store.commit('setItemWishlist', { itemId: item.id, wishlist: false });
        },
        needsReplacing(item) {
            return replaceSoon(item);
        },
        goBack() {
            this.$router.push('/');
        },
        metaLine(item) {
            const parts = [];
            if (item.description) {
                parts.push(item.description);
            }
            parts.push(`${this.displayWeight(item.weight, item.authorUnit)} ${item.authorUnit}`);
            if (this.list.optionalFields.price && item.price) {
                parts.push(this.displayPrice(item.price, this.library.currencySymbol));
            }
            return parts.join(' · ');
        },
        togglePicker(itemId) {
            this.pickerItemId = this.pickerItemId === itemId ? null : itemId;
        },
        addTo(item, category) {
            this.$store.commit('addItemToCategory', {
                itemId: item.id,
                categoryId: category.id,
                // Append: the picker says which category, not which position.
                dropIndex: category.categoryItems.length,
            });
            this.pickerItemId = null;
        },
        removeItem(item) {
            confirmClosetRemoval({
                store: this.$store,
                initSpeedbump: (callback, options) => {
                    this.speedbumpCallback = callback;
                    this.speedbumpOptions = options;
                    this.showSpeedbump = true;
                },
            }, item);
        },
        restore(item) {
            restoreClosetItem(this.$store, item);
        },
    },
};
</script>

<style lang="scss">
@import "../css/_globals";

.lpGearRestore {
    background: var(--lp-surface);
    border: 1px solid var(--lp-border-strong);
    border-radius: 10px;
    color: var(--lp-text);
    cursor: pointer;
    flex: none;
    font-family: $font-body;
    font-size: 14px;
    font-weight: 600;
    min-height: 40px;
    padding: 0 14px;
}

// ============================================================
// The gear library screen (#11g)
//
// Its own route rather than a panel inside the dashboard, so it can be
// backported to the desktop later. Built phone-first; on wider viewports it
// centres in a readable column rather than pretending to be a desktop design
// that hasn't been drawn yet.
// ============================================================
#lpGear {
    background: var(--lp-content-bg);
    color: var(--lp-text);
    margin: 0 auto;
    max-width: 640px;
    min-height: 100vh;
}

.lpGearHeader {
    align-items: center;
    background: var(--lp-sidebar-bg);
    color: var(--lp-sidebar-text);
    display: flex;
    gap: 12px;
    padding: 11px 14px;
    position: sticky;
    top: 0;
    z-index: $mobileHeader;
}

.lpGearBack {
    align-items: center;
    color: var(--lp-sidebar-text);
    cursor: pointer;
    display: flex;
    justify-content: center;
    // Pulls the icon back to the edge while keeping a thumb-sized target.
    margin: -10px 0 -10px -9px;
    padding: 10px 9px;
    text-decoration: none;
}

.lpGearTitle {
    flex: 1 1 auto;
    font-size: 17px;
    font-weight: 700;
    margin: 0;
}

.lpGearCount {
    color: var(--lp-sidebar-muted);
    font-size: 12.5px;
}

.lpGearSearchRow {
    padding: 10px 14px 0;
}

.lpGearSearch {
    align-items: center;
    background: var(--lp-row-hover);
    border-radius: 7px;
    color: var(--lp-text-secondary);
    display: flex;
    gap: 8px;
    padding: 9px 12px;

    svg {
        flex: 0 0 auto;
    }

    input {
        background: transparent;
        border: none;
        color: var(--lp-text);
        flex: 1 1 auto;
        // 16px keeps iOS Safari from zooming the page on focus.
        font-size: 16px;
        min-width: 0;
        outline: none;
        padding: 0;

        &::placeholder {
            color: var(--lp-text-secondary);
        }
    }
}

.lpGearFilters {
    border-bottom: 1px solid var(--lp-border);
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding: 10px 14px;
    scrollbar-width: none;

    &::-webkit-scrollbar {
        display: none;
    }
}

.lpGearChip {
    background: var(--lp-row-hover);
    border-radius: 13px;
    color: var(--lp-text-secondary);
    cursor: pointer;
    flex: 0 0 auto;
    font-size: 12px;
    font-weight: 600;
    padding: 6px 12px;
    white-space: nowrap;
}

.lpGearChipActive {
    // The sidebar is white since the redesign, which left white text on white.
    background: var(--lp-primary);
    color: #fff;
}

.lpGearList {
    margin: 0;
    padding: 0;
}

.lpGearRow {
    border-bottom: 1px solid var(--lp-border);
    list-style: none;
}

.lpGearRowMain {
    align-items: center;
    display: flex;
    gap: 10px;
    padding: 9px 14px;
}

.lpGearRowBody {
    flex: 1 1 auto;
    line-height: 1.3;
    min-width: 0;
}

.lpGearName {
    font-size: 13.5px;
}

.lpGearMeta {
    color: var(--lp-text-secondary);
    font-size: 11.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

// Outlined rather than filled: adding is the common action, but it shouldn't
// out-shout the gear names, which are what you're scanning.
.lpGearAdd {
    align-items: center;
    border: 1.5px solid var(--lp-accent-green-deep);
    border-radius: 50%;
    color: var(--lp-accent-green-deep);
    cursor: pointer;
    display: flex;
    flex: 0 0 auto;
    font-size: 19px;
    height: 30px;
    justify-content: center;
    line-height: 1;
    transition: background $transitionDuration, color $transitionDuration, transform $transitionDuration;
    width: 30px;
}

// While its picker is open the + becomes the dismiss control, so it reads as
// pressed and turns into an ✕.
.lpGearAddOpen {
    background: var(--lp-accent-green-deep);
    color: $grey-0;
    transform: rotate(45deg);
}

.lpGearInList {
    color: var(--lp-accent-green-deep);
    flex: 0 0 auto;
    font-size: 12px;
    font-weight: 700;
}

.lpGearRemove {
    color: var(--lp-icon-rest);
    cursor: pointer;
    flex: 0 0 auto;
    // The design has no delete here — on a phone it belongs in the swipe
    // gesture (#11e), which isn't built. Until it is, this is the only way to
    // delete gear without a desktop. Quiet, and speedbumped.
    padding: 6px 2px 6px 6px;

    &:hover {
        color: var(--lp-danger);
    }

    .lpSprite {
        height: 10px;
        width: 10px;
    }
}

.lpGearPicker {
    background: var(--lp-sidebar-bg);
    border-radius: 6px;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
    margin: 0 12px 12px;
    padding: 10px 12px;
}

.lpGearPickerLabel {
    color: var(--lp-sidebar-text);
    font-size: 12px;
    margin-bottom: 8px;

    b {
        color: $grey-0;
    }
}

.lpGearPickerChips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.lpGearPickerChip {
    align-items: center;
    background: var(--lp-sidebar-border);
    border-radius: 4px;
    color: $grey-0;
    cursor: pointer;
    display: inline-flex;
    font-size: 12.5px;
    gap: 6px;
    padding: 9px 12px;
}

.lpGearPickerSwatch {
    flex: 0 0 9px;
    height: 9px;
}

.lpGearEmpty {
    color: var(--lp-text-secondary);
    font-size: 13px;
    list-style: none;
    padding: 28px 18px;
    text-align: center;
}
.lpGearDetails {
    margin-top: 4px;
    min-height: 32px;
    padding: 0;
}
</style>
