<template>
    <span v-click-outside="close" class="wgKitMenu">
        <button type="button" class="wgAddCatalog" :aria-expanded="String(open)" data-testid="kit-menu" @click="open = !open">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" aria-hidden="true"><path d="M3 7l9-4 9 4-9 4z" /><path d="M3 12l9 4 9-4" /><path d="M3 17l9 4 9-4" /></svg>
            Kits
        </button>
        <div v-if="open" class="wgKitPop" role="dialog" aria-label="Gear kits">
            <p class="wgKitPopTitle">Add a kit</p>
            <p v-if="!kits.length" class="wgMuted wgKitPopEmpty">
                No kits yet. A kit is gear you always carry together, like your cook kit or first aid, added in one click.
            </p>
            <ul v-else class="wgKitPopList">
                <li v-for="k in kits" :key="k.id">
                    <button type="button" class="wgKitAdd" :data-testid="`kit-add-${k.name}`" @click="add(k)">
                        {{ k.name }} <span class="wgMuted">{{ k.items.length }} {{ k.items.length === 1 ? 'item' : 'items' }}</span>
                    </button>
                    <button type="button" class="wgKitDelete" :aria-label="`Delete kit ${k.name}`" :title="`Delete kit ${k.name}`" @click="remove(k)">
                        ×
                    </button>
                </li>
            </ul>
            <form class="wgKitSave" @submit.prevent="save">
                <label class="wgField">Save this category as a kit
                    <input v-model.trim="name" class="wgInput" maxlength="80" :placeholder="category.name || 'Kit name'" data-testid="kit-name">
                </label>
                <button type="submit" class="wgBtn wgBtnSmall wgBtnPrimary" :disabled="!hasGear" data-testid="kit-save">
                    Save kit
                </button>
            </form>
        </div>
    </span>
</template>

<script>
export default {
    name: 'KitMenu',
    props: {
        category: { type: Object, required: true },
    },
    data() {
        return { open: false, name: '' };
    },
    computed: {
        kits() {
            return this.$store.state.library.kits || [];
        },
        hasGear() {
            return this.category.categoryItems.some((ci) => {
                const item = this.$store.state.library.getItemById(ci.itemId);
                return item && (item.name || item.weight);
            });
        },
    },
    methods: {
        close() {
            this.open = false;
        },
        add(kit) {
            this.$store.commit('addKitToCategory', { kitId: kit.id, categoryId: this.category.id });
            this.open = false;
        },
        remove(kit) {
            this.$store.commit('deleteKit', kit.id);
        },
        save() {
            this.$store.commit('createKit', { name: this.name || this.category.name || 'Kit', category: this.category });
            this.name = '';
        },
    },
};
</script>

<style lang="scss">
.wgKitMenu {
    display: inline-flex;
    position: relative;
}

.wgKitPop {
    background: var(--lp-surface);
    border: 1px solid var(--lp-border);
    border-radius: 14px;
    bottom: calc(100% + 6px);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.16);
    left: 0;
    padding: 12px;
    position: absolute;
    width: min(320px, calc(100vw - 32px));
    z-index: 50;
}

.wgKitPopTitle {
    font-size: 13px;
    font-weight: 700;
    margin: 0 0 6px;
}

.wgKitPopEmpty {
    font-size: 13px;
    margin: 0 0 10px;
}

.wgKitPopList {
    list-style: none;
    margin: 0 0 10px;
    padding: 0;

    li {
        align-items: center;
        display: flex;
    }
}

.wgKitAdd {
    background: none;
    border: 0;
    border-radius: 8px;
    color: var(--lp-text);
    cursor: pointer;
    flex: 1 1 auto;
    font: inherit;
    padding: 6px 8px;
    text-align: left;

    &:hover {
        background: var(--lp-surface-sunken);
    }
}

.wgKitDelete {
    background: none;
    border: 0;
    color: var(--lp-text-secondary);
    cursor: pointer;
    font-size: 18px;
    padding: 0 8px;
}

.wgKitSave {
    align-items: flex-end;
    border-top: 1px solid var(--lp-border);
    display: flex;
    gap: 8px;
    padding-top: 10px;

    .wgField {
        flex: 1 1 auto;
        font-size: 13px;
    }
}
</style>
