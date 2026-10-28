<template>
    <section class="wgTrip wgCard wgGroupGear" :class="{ wgTripOpen: open }" data-testid="group-gear">
        <h2 class="wgTripHeading">
            <button type="button" class="wgTripToggle" :aria-expanded="String(open)" data-testid="group-gear-toggle" @click="open = !open">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
                Who carries what
                <span class="wgTripSummary wgMuted">
                    <template v-for="(p, i) in totals" :key="p.username">{{ i ? ' · ' : '' }}{{ p.short }} <span class="wgMono">{{ fmt(p.mg) }}</span></template>
                </span>
            </button>
        </h2>
        <div v-if="open" class="wgTripBody">
            <ul class="wgCarryTotals" data-testid="carry-totals">
                <li v-for="p in totals" :key="p.username" :class="{ wgCarryNone: !p.username }">
                    <span>{{ p.label }}</span>
                    <span class="wgMono">{{ fmt(p.mg) }}</span>
                    <span class="wgMuted">{{ p.count }} {{ p.count === 1 ? 'item' : 'items' }}</span>
                </li>
            </ul>
            <p class="wgMuted wgTripIntro">
                Shared gear counts toward whoever carries it. Worn items aren't in anyone's pack weight.
            </p>
            <table class="wgCarryTable">
                <tbody v-for="g in groups" :key="g.category.id">
                    <tr class="wgCarryCat">
                        <th colspan="3">
                            {{ g.category.name || 'Untitled category' }}
                        </th>
                    </tr>
                    <tr v-for="row in g.rows" :key="row.item.id" data-testid="carry-row">
                        <td>{{ row.item.name }}<span v-if="row.ci.qty !== 1" class="wgMuted"> ×{{ row.ci.qty }}</span></td>
                        <td class="wgMono wgMuted">
                            {{ fmt(row.item.weight * row.ci.qty) }}
                        </td>
                        <td>
                            <select class="wgSelect" :value="row.ci.carrier || ''" :aria-label="`Who carries ${row.item.name}`" data-testid="carrier-select" @change="assign(g.category, row.item, $event.target.value)">
                                <option value="">
                                    Unassigned
                                </option>
                                <option v-for="m in people" :key="m.username" :value="m.username">
                                    {{ m.displayName || `@${m.username}` }}
                                </option>
                            </select>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </section>
</template>

<script>
import { formatWeightMg } from '../utils/format.js';
import { isPlaceholder } from '../utils/closet.js';

export default {
    name: 'GroupGear',
    props: {
        list: { type: Object, required: true },
        people: { type: Array, required: true },
    },
    data() {
        return { open: false };
    },
    computed: {
        library() {
            return this.$store.state.library;
        },
        unit() {
            return ['g', 'kg'].includes(this.library.totalUnit) ? 'kg' : 'lb';
        },
        groups() {
            return this.list.categoryIds.map((id) => this.library.getCategoryById(id)).filter(Boolean).map((category) => ({
                category,
                rows: category.categoryItems.map((ci) => ({ ci, item: this.library.getItemById(ci.itemId) }))
                    .filter((r) => r.item && !isPlaceholder(r.item)),
            })).filter((g) => g.rows.length);
        },
        totals() {
            const out = new Map([['', { username: '', label: 'Unassigned', short: 'Unassigned', mg: 0, count: 0 }]]);
            for (const m of this.people) {
                const name = m.displayName || `@${m.username}`;
                out.set(m.username, { username: m.username, label: name, short: name.split(' ')[0], mg: 0, count: 0 });
            }
            for (const g of this.groups) {
                for (const { ci, item } of g.rows) {
                    const who = out.has(ci.carrier) ? ci.carrier : '';
                    const p = out.get(who);
                    p.count += 1;
                    // Worn gear is on someone, not in a pack.
                    if (!ci.worn) p.mg += item.weight * ci.qty;
                }
            }
            return [...out.values()].filter((p) => p.username || p.count);
        },
    },
    methods: {
        fmt(mg) {
            return formatWeightMg(mg, this.unit);
        },
        assign(category, item, carrier) {
            this.$store.commit('setCarrier', { category, itemId: item.id, carrier });
        },
    },
};
</script>

<style lang="scss">
.wgCarryTotals {
    display: grid;
    gap: 8px;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    list-style: none;
    margin: 0 0 10px;
    padding: 0;

    li {
        background: var(--lp-surface-sunken);
        border-radius: 10px;
        display: flex;
        flex-direction: column;
        padding: 8px 12px;

        min-width: 0;

        span:first-child {
            font-weight: 650;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .wgMono {
            font-size: 20px;
        }
    }

    .wgCarryNone {
        background: transparent;
        border: 1px dashed var(--lp-border);
    }
}

.wgCarryTable {
    border-collapse: collapse;
    width: 100%;

    td {
        border-top: 1px solid var(--lp-border);
        padding: 6px 4px;
    }

    td:nth-child(2) {
        text-align: right;
        white-space: nowrap;
    }

    td:last-child {
        text-align: right;
        width: 1%;
    }

    .wgSelect {
        min-width: 140px;
        width: auto;
    }
}

.wgCarryCat th {
    color: var(--lp-text-secondary);
    font-size: 12px;
    letter-spacing: 0.06em;
    padding: 12px 4px 4px;
    text-align: left;
    text-transform: uppercase;
}
</style>
