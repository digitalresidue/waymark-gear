<template>
    <div class="wgHome">
        <siteHeader active="owner" />
        <template v-if="isAdmin">
            <ownerNav active="kits" />
            <main id="wgMain" tabindex="-1" class="wgPage wgOwner">
                <div class="wgSectionHead">
                    <div>
                        <h1 class="wgH2">
                            Featured kits
                        </h1>
                        <p class="wgLede">
                            Every list its owner published to Explore. Featured kits lead their weight class on the homepage; the rest fill in by most recently updated.
                        </p>
                    </div>
                </div>
                <div class="wgOwnerFilters">
                    <div class="wgSegmented" role="tablist" aria-label="Weight class">
                        <button type="button" role="tab" :aria-selected="String(activeClass === '')" @click="pick('')">
                            All
                        </button>
                        <button v-for="c in weightClasses" :key="c.id" type="button" role="tab" :aria-selected="String(activeClass === c.id)" @click="pick(c.id)">
                            {{ c.label }}
                        </button>
                    </div>
                    <label class="wgSearch wgOwnerSearch">
                        <span class="wgVisuallyHidden">Search published kits</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
                        <input v-model="query" type="search" class="wgInput" placeholder="Search by name or hiker" @input="queue">
                    </label>
                </div>
                <p class="wgMuted wgOwnerCount" aria-live="polite">
                    {{ loaded ? `${total} published ${total === 1 ? 'kit' : 'kits'}` : 'Loading…' }}
                </p>
                <div class="wgCard wgTableWrap">
                    <table class="wgTable" data-testid="kits-table">
                        <thead>
                            <tr>
                                <th scope="col">
                                    Kit
                                </th>
                                <th scope="col">
                                    Class
                                </th>
                                <th scope="col" class="wgNum">
                                    Base weight
                                </th>
                                <th scope="col" class="wgNum">
                                    Items
                                </th>
                                <th scope="col">
                                    Updated
                                </th>
                                <th scope="col">
                                    Featured
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="kit in kits" :key="kit.externalId">
                                <td>
                                    <p class="wgCellTitle">
                                        <a :href="`/r/${kit.externalId}`" target="_blank" rel="noopener">{{ kit.name }}</a>
                                    </p>
                                    <p class="wgMuted wgCellSub">
                                        @{{ kit.username }}
                                    </p>
                                </td>
                                <td>{{ classLabel(kit.weightClass) }}</td>
                                <td class="wgNum wgMono">
                                    {{ weight(kit.baseWeightMg) }}
                                </td>
                                <td class="wgNum wgMono">
                                    {{ kit.itemCount }}
                                </td>
                                <td class="wgMuted">
                                    {{ new Date(kit.updatedAt).toLocaleDateString() }}
                                </td>
                                <td>
                                    <label class="wgCheck">
                                        <input type="checkbox" :checked="kit.featured" :data-testid="`feature-${kit.externalId}`" @change="setFeatured(kit, $event.target.checked)">
                                        <span class="wgVisuallyHidden">Feature {{ kit.name }}</span>
                                    </label>
                                </td>
                            </tr>
                            <tr v-if="loaded && !kits.length">
                                <td colspan="6" class="wgTableEmpty">
                                    Nothing published yet. Kits appear here when their owners turn on “Publish to Explore”.
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div v-if="kits.length < total" class="wgExploreMore">
                    <button type="button" class="wgBtn" @click="load(false)">
                        Show more
                    </button>
                </div>
            </main>
        </template>
        <main v-else id="wgMain" tabindex="-1" class="wgPage wgOwner">
            <div class="wgEmpty">
                <p><strong>Owner access only.</strong></p>
                <p class="wgMuted">
                    <router-link to="/signin">
                        Sign in
                    </router-link> with an owner account.
                </p>
            </div>
        </main>
        <siteFooter site />
    </div>
</template>

<script>
import siteHeader from '../components/site-header.vue';
import siteFooter from '../components/site-footer.vue';
import ownerNav from '../components/owner-nav.vue';
import { api, formatWeightMg, siteConfig } from '../utils/format.js';

export default {
    name: 'OwnerKits',
    components: { siteHeader, siteFooter, ownerNav },
    data() {
        return { kits: [], total: 0, loaded: false, activeClass: '', query: '', weightClasses: [], timer: null };
    },
    computed: {
        isAdmin() {
            return Boolean(this.$store.state.account && this.$store.state.account.isAdmin);
        },
    },
    async mounted() {
        document.title = 'Featured kits — Waymark Gear';
        this.weightClasses = (await siteConfig()).weightClasses || [];
        if (this.isAdmin) this.load(true);
    },
    methods: {
        weight(mg) {
            return formatWeightMg(mg, 'lb');
        },
        classLabel(id) {
            return (this.weightClasses.find((c) => c.id === id) || { label: id }).label;
        },
        pick(id) {
            this.activeClass = id;
            this.load(true);
        },
        queue() {
            clearTimeout(this.timer);
            this.timer = setTimeout(() => this.load(true), 250);
        },
        async load(reset) {
            const params = new URLSearchParams({ limit: '50', offset: String(reset ? 0 : this.kits.length) });
            if (this.activeClass) params.set('class', this.activeClass);
            if (this.query.trim()) params.set('q', this.query.trim());
            try {
                const r = await api(`/api/admin/kits?${params}`);
                this.kits = reset ? r.kits : this.kits.concat(r.kits);
                this.total = r.total;
            } catch {
                if (reset) this.kits = [];
            }
            this.loaded = true;
        },
        async setFeatured(kit, featured) {
            try {
                const r = await api(`/api/admin/kits/${encodeURIComponent(kit.externalId)}`, { method: 'PUT', body: JSON.stringify({ featured }) });
                Object.assign(kit, r.kit);
            } catch {
                kit.featured = !featured;
            }
        },
    },
};
</script>
