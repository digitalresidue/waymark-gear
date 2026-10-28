<template>
    <section id="listContainer">
        <div class="lpSidebarSectionHeader listContainerHeader">
            <span class="lpSectionLabel">Lists · {{ library.lists.length }}</span>
        </div>
        <div class="wgListsTools">
            <PopoverHover id="addListFlyout" ref="addListFlyout">
                <template #target>
                    <button type="button" class="wgNewList lpSidebarNew" data-testid="new-list" @click="newListFromTarget">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                        New list
                    </button>
                </template>
                <template #content="{ hide }">
                    <div>
                        <a class="lpAdd" data-testid="new-list-blank" @click="hide(); newList()"><i class="lpSprite lpSpriteAdd" />Add new list</a>
                        <a class="lpCopy" @click="hide(); copyList()"><i class="lpSprite lpSpriteCopy" />Copy a list</a>
                        <a class="lpAdd" data-testid="new-list-import" @click="hide(); openImportLighterPack()"><i class="lpSprite lpSpriteUpload" />Import from LighterPack</a>
                        <a class="lpAdd" @click="hide(); importCSV()"><i class="lpSprite lpSpriteUpload" />Import CSV</a>
                    </div>
                </template>
            </PopoverHover>
            <label v-if="showSearch" class="wgSearch wgListSearch">
                <span class="wgVisuallyHidden">Find a list</span>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
                <input v-model="query" type="search" class="wgInput" placeholder="Find a list" data-testid="list-search">
            </label>
        </div>

        <div class="lpSidebarListsRegion">
            <template v-if="pinnedLists.length">
                <p class="wgListGroup">
                    Pinned
                </p>
                <ul id="pinnedLists" ref="pinned" class="lpSidebarScroll wgListGroupList">
                    <li
                        v-for="list in pinnedLists"
                        :key="list.id"
                        :data-list-id="list.id"
                        class="lpLibraryList"
                        :class="{lpActive: (library.defaultListId == list.id)}"
                        @click="setDefaultList(list)"
                    >
                        <div v-if="!filtering" class="lpHandle" title="Reorder this list" />
                        <span class="lpLibraryListSwitch lpListName">{{ listName(list) }}</span>
                        <span class="wgListWeight wgMono">{{ baseWeight(list) }}</span>
                        <button type="button" class="wgListPin wgPinned" :aria-label="`Unpin ${listName(list)}`" title="Unpin" @click.stop="togglePin(list)">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 3l5 5-3 1-4 4 1 5-2 2-4-4-5 5-1-1 5-5-4-4 2-2 5 1 4-4z" /></svg>
                        </button>
                        <a class="lpRemove" title="Remove this list" @click.stop="removeList(list)"><i class="lpSprite lpSpriteRemove" /></a>
                    </li>
                </ul>
                <p v-if="otherLists.length" class="wgListGroup">
                    All lists
                </p>
            </template>
            <ul id="lists" ref="lists" class="lpSidebarScroll">
                <li
                    v-for="list in otherLists"
                    :key="list.id"
                    :data-list-id="list.id"
                    class="lpLibraryList"
                    :class="{lpActive: (library.defaultListId == list.id)}"
                    @click="setDefaultList(list)"
                >
                    <div v-if="!filtering" class="lpHandle" title="Reorder this list" />
                    <span class="lpLibraryListSwitch lpListName">{{ listName(list) }}</span>
                    <span class="wgListWeight wgMono">{{ baseWeight(list) }}</span>
                    <button type="button" class="wgListPin" :aria-label="`Pin ${listName(list)}`" title="Pin to top" @click.stop="togglePin(list)">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M16 3l5 5-3 1-4 4 1 5-2 2-4-4-5 5-1-1 5-5-4-4 2-2 5 1 4-4z" /></svg>
                    </button>
                    <a class="lpRemove" title="Remove this list" @click.stop="removeList(list)"><i class="lpSprite lpSpriteRemove" /></a>
                </li>
            </ul>
            <p v-if="filtering && !pinnedLists.length && !otherLists.length" class="wgListNone">
                No lists match “{{ query }}”.
            </p>
            <template v-if="sharedWithMe.length">
                <p class="wgListGroup">
                    Shared with you
                </p>
                <ul class="wgSharedLists" data-testid="shared-with-me">
                    <li v-for="s in sharedWithMe" :key="`${s.owner}/${s.listId}`">
                        <router-link :to="`/plan/${s.owner}/${s.listId}`" class="lpLibraryList wgSharedList" data-testid="shared-list">
                            <span class="lpListName">{{ s.name }}</span>
                            <span class="wgMuted wgSharedBy">@{{ s.owner }}</span>
                        </router-link>
                    </li>
                </ul>
            </template>
        </div>
    </section>
</template>

<script>
import PopoverHover from './popover-hover.vue';

import dragula from 'dragula';
import { formatWeightMg, api } from '../utils/format.js';

export default {
    name: 'LibraryList',
    components: {
        PopoverHover,
    },
    inject: ['openCopyList', 'openImportCSV', 'openImportLighterPack', 'initSpeedbump'],
    emits: ['chosen'],
    data() {
        return { query: '', sharedWithMe: [] };
    },
    computed: {
        library() {
            return this.$store.state.library;
        },
        // Search earns its space once there are enough lists to hunt through.
        showSearch() {
            return this.library.lists.length >= 5 || this.query;
        },
        filtering() {
            return this.query.trim() !== '';
        },
        visible() {
            const q = this.query.trim().toLowerCase();
            return q ? this.library.lists.filter((l) => this.listName(l).toLowerCase().includes(q)) : this.library.lists;
        },
        pinnedLists() {
            return this.visible.filter((l) => l.pinned);
        },
        otherLists() {
            return this.visible.filter((l) => !l.pinned);
        },
    },
    mounted() {
        if (this.$store.state.saveType === 'remote') {
            api('/api/plans').then((r) => { this.sharedWithMe = r.sharedWithMe; }).catch(() => {});
        }
        this.drake = dragula([], {
            moves(_$el, _$source, $handle) {
                return $handle.classList.contains('lpHandle');
            },
            // Within a section only; pinning is what moves a list between them.
            accepts(_$el, $target, $source) {
                return $target === $source;
            },
        });
        this.drake.on('drop', ($el, $target) => {
            // Read the new order straight from the DOM by list id, so the
            // order is right however the section is filtered or split.
            const ids = Array.from($target.children).map((li) => Number(li.dataset.listId));
            this.drake.cancel(true);
            this.$store.commit('reorderListsById', ids);
        });
        this.syncContainers();
    },
    updated() {
        this.syncContainers();
    },
    beforeUnmount() {
        if (this.drake) this.drake.destroy();
    },
    methods: {
        syncContainers() {
            if (!this.drake) return;
            this.drake.containers = [this.$refs.pinned, this.$refs.lists].filter(Boolean);
        },
        listName(list) {
            return list.name || 'New list';
        },
        baseWeight(list) {
            return formatWeightMg(list.totalBaseWeight || 0, this.library.totalUnit === 'kg' || this.library.totalUnit === 'g' ? 'kg' : 'lb');
        },
        setDefaultList(list) {
            this.$store.commit('setDefaultList', list);
            // The sidebar closes the lists into its rail on a choice.
            this.$emit('chosen', list);
        },
        togglePin(list) {
            this.$store.commit('togglePinList', list);
        },
        // On a pointer device the flyout opens on hover, so clicking the
        // button itself makes a list outright. With no hover, the tap opens
        // the menu instead.
        newListFromTarget() {
            if (window.matchMedia('(hover: hover)').matches) {
                // Act and get out of the way, like the menu's own items.
                this.$refs.addListFlyout?.hide();
                this.newList();
            }
        },
        newList() {
            this.query = '';
            this.$store.commit('newList');
            // A new list wants gear: the sidebar shows the closet.
            this.$emit('chosen', this.library.getListById(this.library.defaultListId));
            // Frictionless naming: drop the cursor straight into the title.
            this.$nextTick(() => {
                const title = document.getElementById('lpListName');
                if (title) title.focus();
            });
        },
        copyList() {
            this.openCopyList();
        },
        importCSV() {
            this.openImportCSV();
        },
        removeList(list) {
            const callback = function () {
                this.$store.commit('removeList', list);
            };
            const speedbumpOptions = {
                body: 'Are you sure you want to delete this list? This cannot be undone.',
            };
            this.initSpeedbump(callback, speedbumpOptions);
        },
    },
};
</script>

<style lang="scss">
@import "../css/_globals";

#listContainer {
    flex: 0 0 auto;
}

.wgListsTools {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 4px 14px 10px;

    #addListFlyout,
    #addListFlyout .lpTarget {
        display: block;
        width: 100%;
    }
}

.wgNewList {
    align-items: center;
    background: var(--lp-active-bg);
    border: 1px dashed var(--lp-sage, #9DB8A0);
    border-radius: 10px;
    color: var(--lp-accent-green-deep);
    cursor: pointer;
    display: flex;
    font-family: $font-body;
    font-size: 14px;
    font-weight: 600;
    gap: 8px;
    justify-content: center;
    min-height: 40px;
    width: 100%;

    &:hover {
        border-style: solid;
    }
}

.wgListSearch .wgInput {
    font-size: 14px;
    min-height: 38px;
    padding-bottom: 6px;
    padding-top: 6px;
}

.wgListGroup {
    color: var(--lp-sidebar-muted);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    margin: 6px 0 2px;
    padding: 0 20px;
    text-transform: uppercase;
}

.wgListNone {
    color: var(--lp-sidebar-muted);
    font-size: 13px;
    padding: 6px 20px;
}

// Capped with its own thin scrollbar so the gear section keeps room.
.lpSidebarListsRegion {
    position: relative;

    #lists,
    #pinnedLists {
        margin: 0;
        max-height: 300px;
        padding: 0;
    }

    #pinnedLists {
        max-height: 180px;
    }
}

// The whole row is the switch target — identical to the hover surface.
.lpLibraryList {
    align-items: center;
    border-radius: 9px;
    cursor: pointer;
    display: flex;
    font-size: 14px;
    gap: 6px;
    list-style: none;
    margin: 1px 8px;
    min-height: 36px;
    padding: 6px 6px 6px 18px;
    position: relative;

    &:hover {
        background: var(--lp-sidebar-inset);
    }

    &.lpActive {
        background: var(--lp-active-bg);
        box-shadow: inset 3px 0 0 var(--lp-primary);
        color: var(--lp-accent-green-deep);
        font-weight: 600;

        .lpRemove {
            display: none;
        }
    }

    &.gu-mirror {
        background: var(--lp-surface);
        border: 1px solid var(--lp-sidebar-border);
        color: var(--lp-sidebar-text);
    }

    .lpHandle {
        left: 4px;
        position: absolute;
        transform: translateY(-2px);
    }

    &:hover .lpHandle {
        visibility: visible;
    }

    .lpListName {
        flex: 1 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .lpRemove {
        flex: 0 0 auto;
        margin-bottom: 0;
    }
}

.wgListWeight {
    color: var(--lp-sidebar-muted);
    flex: none;
    font-size: 12px;
    font-weight: 400;
}

.wgListPin {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 6px;
    color: var(--lp-sidebar-muted);
    cursor: pointer;
    display: inline-flex;
    flex: none;
    height: 24px;
    justify-content: center;
    padding: 0;
    visibility: hidden;
    width: 24px;

    &:hover,
    &:focus-visible {
        background: var(--lp-sidebar-border);
        color: var(--lp-sidebar-text);
    }

    &.wgPinned {
        color: var(--lp-accent);
        visibility: visible;
    }

    .lpLibraryList:hover &,
    &:focus-visible {
        visibility: visible;
    }
}

// The flyout drops beneath the New list button, full width of the rail.
#addListFlyout {
    .lpContent {
        left: 0;
        right: auto;
        transform: none;

        a {
            display: block;
            margin-bottom: 5px;

            &:last-child {
                margin-bottom: 0;
            }
        }
    }
}

.lpLibraryList:hover .lpRemove {
    visibility: visible;
}

// ============================================================
// Phone layout — list rows in the drawer
// ============================================================
@media only screen and (width <= $mobile) {
    .lpSidebarListsRegion #lists {
        max-height: 45vh;
    }

    .lpLibraryList {
        font-size: 15px;
        min-height: 44px;
        padding: 10px 8px 10px 18px;
    }

    // No hover on touch: keep remove and pin reachable.
    .lpLibraryList .lpRemove,
    .wgListPin {
        visibility: visible;
    }
}
.wgSharedLists {
    list-style: none;
    margin: 0;
    padding: 0;
}

.wgSharedList {
    align-items: center;
    color: inherit;
    display: flex;
    gap: 8px;
    justify-content: space-between;
    text-decoration: none;
}

.wgSharedBy {
    font-size: 12px;
}
</style>
