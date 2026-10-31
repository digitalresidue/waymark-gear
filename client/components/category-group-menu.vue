<template>
    <span class="wgGroupMenu">
        <button
            ref="button"
            type="button"
            class="wgGroupMenuButton"
            :class="{ wgActive: open }"
            :aria-expanded="String(open)"
            :aria-label="`Group ${category.name || 'this category'}`"
            :title="current ? `In ${current.name || 'a group'}` : 'Put in a group'"
            data-testid="category-group-button"
            @click="toggle"
        >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
        </button>
        <div v-if="open" class="wgGroupMenuPop" role="dialog" :aria-label="`Group for ${category.name || 'this category'}`" data-testid="category-group-menu" @keydown.esc="close">
            <p class="wgGroupMenuTitle">Put {{ category.name || 'this category' }} in</p>
            <button
                v-for="g in groups"
                :key="g.id"
                type="button"
                class="wgGroupMenuOption"
                :aria-pressed="String(category.groupId === g.id)"
                data-testid="category-group-option"
                @click="choose(g.id)"
            >
                {{ g.name || 'Untitled group' }}
            </button>
            <form class="wgGroupMenuNew" @submit.prevent="create">
                <input
                    ref="newName"
                    v-model.trim="newName"
                    class="wgInput"
                    type="text"
                    maxlength="100"
                    :placeholder="groups.length ? 'New group…' : 'Group name, like Clothing'"
                    aria-label="New group name"
                    data-testid="category-group-new"
                >
                <button type="submit" class="wgBtn wgBtnSmall" :disabled="!newName" data-testid="category-group-create">
                    Add
                </button>
            </form>
            <button v-if="current" type="button" class="wgGroupMenuOption wgGroupMenuNone" data-testid="category-group-none" @click="choose(null)">
                Take out of {{ current.name || 'the group' }}
            </button>
        </div>
    </span>
</template>

<script>
// Put a category in one of its list's groups, start a new group with it, or
// take it out (List.groups; store: setCategoryGroup).
export default {
    name: 'CategoryGroupMenu',
    props: {
        category: { type: Object, required: true },
    },
    data() {
        return { open: false, newName: '' };
    },
    computed: {
        list() {
            return this.$store.getters.activeList;
        },
        groups() {
            return (this.list && this.list.groups) || [];
        },
        current() {
            return this.category.groupId ? this.groups.find((g) => g.id === this.category.groupId) : null;
        },
    },
    beforeUnmount() {
        document.removeEventListener('pointerdown', this.outside, true);
    },
    methods: {
        toggle() {
            if (this.open) this.close();
            else {
                this.open = true;
                this.newName = '';
                document.addEventListener('pointerdown', this.outside, true);
                this.$nextTick(() => {
                    if (!this.groups.length && this.$refs.newName) this.$refs.newName.focus();
                });
            }
        },
        close() {
            this.open = false;
            document.removeEventListener('pointerdown', this.outside, true);
        },
        outside(evt) {
            if (!this.$el.contains(evt.target)) this.close();
        },
        choose(groupId) {
            this.$store.commit('setCategoryGroup', { category: this.category, groupId });
            this.close();
        },
        create() {
            if (!this.newName) return;
            this.$store.commit('setCategoryGroup', { category: this.category, newGroupName: this.newName });
            this.close();
        },
    },
};
</script>

<style lang="scss">
@import "../css/_globals";

.wgGroupMenu {
    flex: none;
    position: relative;
}

.wgGroupMenuButton {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 8px;
    color: var(--lp-text-secondary);
    cursor: pointer;
    display: inline-flex;
    height: 30px;
    justify-content: center;
    opacity: 0;
    padding: 0;
    width: 30px;

    .lpItemsHeader:hover &,
    &:focus-visible,
    &.wgActive {
        opacity: 1;
    }

    &:hover,
    &.wgActive {
        background: var(--lp-row-hover);
        color: var(--lp-text);
    }

    @media (hover: none) {
        opacity: 1;
    }
}

.wgGroupMenuPop {
    background: var(--lp-surface);
    border: 1px solid var(--lp-border);
    border-radius: 12px;
    box-shadow: var(--lp-lift-shadow);
    display: flex;
    flex-direction: column;
    gap: 4px;
    // Opens leftwards: the button sits at the right of the category header.
    max-width: calc(100vw - 32px);
    min-width: 240px;
    right: 0;
    padding: 10px;
    position: absolute;
    top: calc(100% + 4px);
    z-index: 20;
}

.lp .wgGroupMenuTitle {
    color: var(--lp-text-secondary);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.04em;
    margin: 0 0 4px;
    text-transform: uppercase;
}

.wgGroupMenuOption {
    background: transparent;
    border: 0;
    border-radius: 8px;
    color: var(--lp-text);
    cursor: pointer;
    font: inherit;
    font-size: 14px;
    padding: 7px 10px;
    text-align: left;

    &:hover {
        background: var(--lp-row-hover);
    }

    &[aria-pressed="true"] {
        background: var(--lp-active-bg);
        font-weight: 650;
    }
}

.wgGroupMenuNone {
    border-top: 1px solid var(--lp-border);
    border-radius: 0 0 8px 8px;
    color: var(--lp-text-secondary);
    margin-top: 4px;
}

.wgGroupMenuNew {
    display: flex;
    gap: 6px;
    margin-top: 4px;

    .wgInput {
        flex: 1 1 auto;
        font-size: 14px;
        min-width: 0;
    }
}
</style>
