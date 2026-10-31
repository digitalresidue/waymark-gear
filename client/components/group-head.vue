<template>
    <li class="wgGroupHead" :class="{ wgGroupCollapsed: group.collapsed }" :data-group-id="group.id" data-testid="group-head">
        <button
            type="button"
            class="wgDrawerToggle"
            :aria-expanded="String(!group.collapsed)"
            :aria-label="`${group.collapsed ? 'Expand' : 'Collapse'} ${group.name || 'group'}`"
            data-testid="group-toggle"
            @click="toggle"
        >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
        </button>
        <svg class="wgGroupIcon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
        <input
            type="text"
            class="wgGroupName lpSilent"
            :value="group.name"
            placeholder="Group name"
            aria-label="Group name"
            maxlength="100"
            data-testid="group-name"
            @input="rename"
        >
        <span class="wgGroupMeta" data-testid="group-meta">{{ categories.length }} {{ categories.length === 1 ? 'category' : 'categories' }}</span>
        <span class="wgGroupWeight lpNumber" data-testid="group-weight">{{ displayWeight(weight, library.totalUnit) }} <span class="wgMuted">{{ library.totalUnit }}</span></span>
        <button type="button" class="wgGroupUngroup" :title="`Ungroup: keep the categories, drop the ${group.name || 'group'} heading`" data-testid="group-ungroup" @click="ungroup">
            Ungroup
        </button>
    </li>
</template>

<script>
import utilsMixin from '../mixins/utils-mixin.js';

// The heading of a category group (List.groups): Clothing over Base Layer,
// Mid Layer, Shells. Its weight is its categories' together; folding it
// hides them. The categories themselves are rendered by list.vue.
export default {
    name: 'GroupHead',
    mixins: [utilsMixin],
    props: {
        list: { type: Object, required: true },
        group: { type: Object, required: true },
        categories: { type: Array, required: true },
    },
    computed: {
        library() {
            return this.$store.state.library;
        },
        weight() {
            return this.categories.reduce((sum, c) => sum + (c.subtotalWeight || 0), 0);
        },
    },
    methods: {
        toggle() {
            this.$store.commit('toggleGroupCollapsed', { list: this.list, groupId: this.group.id });
        },
        rename(evt) {
            this.$store.commit('renameGroup', { list: this.list, groupId: this.group.id, name: evt.target.value });
        },
        ungroup() {
            this.$store.commit('ungroup', { list: this.list, groupId: this.group.id });
        },
    },
};
</script>
