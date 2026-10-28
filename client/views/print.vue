<template>
    <div v-if="isLoaded" class="wgPrint" :class="[`wgPrintSize-${size}`]">
        <div class="wgPrintTools" data-testid="print-tools">
            <router-link :to="backTo" class="wgBtn wgBtnGhost wgBtnSmall">
                ‹ Back
            </router-link>
            <label>
                List
                <select :value="library.defaultListId" class="wgSelect" data-testid="print-list" @change="pickList($event.target.value)">
                    <option v-for="l in library.lists" :key="l.id" :value="l.id">{{ l.name || 'New list' }}</option>
                </select>
            </label>
            <label>
                Columns
                <select v-model.number="columns" class="wgSelect" data-testid="print-columns">
                    <option :value="1">1</option>
                    <option :value="2">2</option>
                    <option :value="3">3</option>
                </select>
            </label>
            <label>
                Text
                <select v-model="size" class="wgSelect" data-testid="print-size">
                    <option value="s">Small</option>
                    <option value="m">Medium</option>
                    <option value="l">Large</option>
                </select>
            </label>
            <label class="wgPrintCheck"><input v-model="showDescriptions" type="checkbox" data-testid="print-descriptions"> Descriptions</label>
            <label class="wgPrintCheck"><input v-model="showQty" type="checkbox"> Quantities</label>
            <label class="wgPrintCheck"><input v-model="showMarks" type="checkbox"> Worn / consumable</label>
            <button type="button" class="wgBtn wgBtnPrimary" data-testid="print-now" @click="print">
                Print
            </button>
        </div>

        <article class="wgPrintSheet" data-testid="print-sheet">
            <header class="wgPrintHead">
                <h1>{{ list.name || 'Pack list' }}</h1>
                <p>{{ count }} items · Waymark Gear</p>
            </header>
            <div class="wgPrintCols" :style="{ columnCount: columns }">
                <section v-for="group in groups" :key="group.id" class="wgPrintGroup">
                    <h2>{{ group.name }}</h2>
                    <ul>
                        <li v-for="row in group.rows" :key="row.id" data-testid="print-row">
                            <span class="wgPrintBox" aria-hidden="true" />
                            <span class="wgPrintName">
                                {{ row.name }}<template v-if="showQty && row.qty !== 1"> ×{{ row.qty }}</template>
                                <template v-if="showMarks && row.worn"> (worn)</template>
                                <template v-if="showMarks && row.consumable"> (consumable)</template>
                                <small v-if="showDescriptions && row.description">{{ row.description }}</small>
                            </span>
                        </li>
                    </ul>
                </section>
            </div>
        </article>
    </div>
</template>

<script>
import { isPlaceholder } from '../utils/closet.js';

const PREFS_KEY = 'wgPrintPrefs';

export default {
    name: 'PrintList',
    data() {
        let saved;
        try {
            saved = JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
        } catch {
            saved = {};
        }
        return {
            isLoaded: false,
            columns: saved.columns || 2,
            size: saved.size || 'm',
            showDescriptions: saved.showDescriptions !== undefined ? saved.showDescriptions : false,
            showQty: saved.showQty !== undefined ? saved.showQty : true,
            showMarks: saved.showMarks !== undefined ? saved.showMarks : true,
        };
    },
    computed: {
        // Back to the list being edited: the shared plan, if that's where we came from.
        backTo() {
            const plan = this.$store.state.saveType === 'shared' && this.$store.state.plan;
            return plan ? `/plan/${plan.owner}/${plan.listId}` : '/';
        },
        library() {
            return this.$store.state.library;
        },
        list() {
            return this.library.getListById(this.library.defaultListId);
        },
        groups() {
            return this.list.categoryIds.map((id) => this.library.getCategoryById(id)).filter(Boolean).map((category) => ({
                id: category.id,
                name: category.name || 'Untitled category',
                rows: category.categoryItems.map((ci) => ({ ci, item: this.library.getItemById(ci.itemId) }))
                    .filter(({ item }) => item && !isPlaceholder(item))
                    .map(({ ci, item }) => ({
                        id: item.id,
                        name: item.name || 'Unnamed item',
                        description: item.description,
                        qty: ci.qty,
                        worn: Boolean(ci.worn),
                        consumable: Boolean(ci.consumable),
                    })),
            })).filter((g) => g.rows.length);
        },
        count() {
            return this.groups.reduce((n, g) => n + g.rows.length, 0);
        },
    },
    watch: {
        $data: {
            deep: true,
            handler() {
                try {
                    const { columns, size, showDescriptions, showQty, showMarks } = this;
                    localStorage.setItem(PREFS_KEY, JSON.stringify({ columns, size, showDescriptions, showQty, showMarks }));
                } catch {
                    // Not saved; fine.
                }
            },
        },
    },
    beforeMount() {
        if (!this.$store.state.library) {
            this.$router.push('/welcome');
        } else {
            this.isLoaded = true;
            document.title = `Print: ${this.list.name || 'pack list'}`;
        }
    },
    methods: {
        pickList(id) {
            this.$store.commit('setDefaultList', this.library.getListById(Number(id)));
            document.title = `Print: ${this.list.name || 'pack list'}`;
        },
        print() {
            window.print();
        },
    },
};
</script>

<style lang="scss">
.wgPrint {
    background: var(--lp-bg);
    min-height: 100vh;
    padding: 16px;
}

.wgPrintTools {
    align-items: center;
    background: var(--lp-surface);
    border: 1px solid var(--lp-border);
    border-radius: 14px;
    display: flex;
    flex-wrap: wrap;
    gap: 10px 16px;
    margin: 0 auto 16px;
    max-width: 820px;
    padding: 10px 14px;

    label {
        align-items: center;
        display: inline-flex;
        font-size: 14px;
        gap: 6px;
    }

    .wgSelect {
        width: auto;
    }
}

.wgPrintCheck input {
    accent-color: var(--lp-primary);
}

// The sheet looks like paper on screen and is the only thing printed.
.wgPrintSheet {
    background: #fff;
    border-radius: 6px;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
    color: #111;
    margin: 0 auto;
    max-width: 820px;
    padding: 36px 40px;
}

.wgPrintHead {
    align-items: baseline;
    border-bottom: 2px solid #111;
    display: flex;
    justify-content: space-between;
    margin-bottom: 14px;
    padding-bottom: 6px;

    h1 {
        font-size: 1.5em;
        margin: 0;
    }

    p {
        color: #555;
        font-size: 0.85em;
        margin: 0;
    }
}

.wgPrintCols {
    column-gap: 28px;
}

.wgPrintGroup {
    break-inside: avoid-column;
    margin-bottom: 12px;

    h2 {
        border-bottom: 1px solid #bbb;
        font-size: 0.8em;
        letter-spacing: 0.08em;
        margin: 0 0 4px;
        padding-bottom: 2px;
        text-transform: uppercase;
    }

    ul {
        list-style: none;
        margin: 0;
        padding: 0;
    }

    li {
        align-items: flex-start;
        break-inside: avoid;
        display: flex;
        gap: 8px;
        padding: 3px 0;
    }
}

.wgPrintBox {
    border: 1.5px solid #111;
    border-radius: 2px;
    flex: none;
    height: 0.95em;
    margin-top: 0.12em;
    width: 0.95em;
}

.wgPrintName small {
    color: #555;
    display: block;
    font-size: 0.85em;
}

.wgPrintSize-s .wgPrintSheet {
    font-size: 11px;
}

.wgPrintSize-m .wgPrintSheet {
    font-size: 13px;
}

.wgPrintSize-l .wgPrintSheet {
    font-size: 16px;
}

@media print {
    @page {
        margin: 12mm;
    }

    html,
    body,
    .wgPrint {
        background: #fff !important;
        min-height: 0;
        padding: 0;
    }

    .wgPrintTools {
        display: none;
    }

    .wgPrintSheet {
        border-radius: 0;
        box-shadow: none;
        max-width: none;
        padding: 0;
    }
}
</style>
