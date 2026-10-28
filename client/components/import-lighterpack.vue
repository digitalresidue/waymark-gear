<template>
    <modal id="wgImportDialog" :shown="shown" @hide="close">
        <h2>Import from LighterPack</h2>
        <p class="wgMuted wgImportIntro">
            Paste a LighterPack share link, or upload a CSV exported from LighterPack or a spreadsheet. It becomes a new list, and gear that's already in your closet is reused instead of duplicated.
        </p>

        <form class="wgImportLink" @submit.prevent="fetchLink">
            <label class="wgField">LighterPack link
                <input
                    v-model.trim="link"
                    class="wgInput"
                    type="text"
                    inputmode="url"
                    autocomplete="off"
                    placeholder="lighterpack.com/r/abc123"
                    data-testid="import-link"
                >
            </label>
            <button type="submit" class="wgBtn wgBtnPrimary" :disabled="busy || !link" data-testid="import-fetch">
                {{ busy ? 'Reading…' : 'Get list' }}
            </button>
        </form>
        <p class="wgImportOr wgMuted">
            or
            <button type="button" class="wgBtn wgBtnGhost wgBtnSmall" data-testid="import-file-button" @click="$refs.file.click()">
                upload a CSV file
            </button>
        </p>
        <input ref="file" type="file" accept=".csv,text/csv" class="wgVisuallyHidden" tabindex="-1" data-testid="import-file" @change="readFile">

        <p v-if="error" class="wgImportError" role="alert" data-testid="import-error">
            {{ error }}
        </p>

        <section v-if="preview" class="wgImportPreview" data-testid="import-preview">
            <label class="wgField">List name
                <input v-model="preview.name" class="wgInput" type="text" maxlength="200" data-testid="import-name">
            </label>
            <p class="wgImportSummary" data-testid="import-summary">
                {{ preview.itemCount }} {{ preview.itemCount === 1 ? 'item' : 'items' }} in {{ preview.categories.length }} {{ preview.categories.length === 1 ? 'category' : 'categories' }} · <span class="wgMono">{{ totalWeight }}</span>
            </p>
            <p v-if="preview.skipped" class="wgMuted wgImportSkipped">
                {{ preview.skipped }} {{ preview.skipped === 1 ? "row couldn't" : "rows couldn't" }} be read and will be left out.
            </p>
            <ul class="wgImportCats">
                <li v-for="c in preview.categories" :key="c.name">
                    <span>{{ c.name }}</span>
                    <span class="wgMuted">{{ c.items.length }}</span>
                </li>
            </ul>
        </section>

        <div class="wgImportActions">
            <button v-if="preview" type="button" class="wgBtn wgBtnPrimary" data-testid="import-confirm" @click="confirm">
                Add list
            </button>
            <button type="button" class="wgBtn wgBtnGhost" @click="close">
                Cancel
            </button>
        </div>
    </modal>
</template>

<script>
import modal from './modal.vue';
import { api, formatWeightMg } from '../utils/format.js';
import { parseGearCsv } from '../utils/lighterpack-import.js';

const MAX_FILE_BYTES = 2_000_000;

export default {
    name: 'ImportLighterpack',
    components: { modal },
    props: {
        shown: { type: Boolean, required: true },
    },
    emits: ['hide'],
    data() {
        return { link: '', busy: false, error: '', preview: null };
    },
    computed: {
        totalWeight() {
            const mg = this.preview.categories.reduce((sum, c) => sum + c.items.reduce((s, i) => s + i.weightMg * i.qty, 0), 0);
            const unit = ['g', 'kg'].includes(this.$store.state.library && this.$store.state.library.totalUnit) ? 'kg' : 'lb';
            return formatWeightMg(mg, unit);
        },
    },
    methods: {
        reset() {
            this.link = '';
            this.busy = false;
            this.error = '';
            this.preview = null;
            if (this.$refs.file) this.$refs.file.value = '';
        },
        close() {
            this.reset();
            this.$emit('hide');
        },
        async fetchLink() {
            if (!this.link || this.busy) return;
            this.busy = true;
            this.error = '';
            this.preview = null;
            try {
                this.preview = await api('/api/import/lighterpack', {
                    method: 'POST',
                    body: JSON.stringify({ url: this.link }),
                });
            } catch (err) {
                this.error = err.message || 'That list could not be imported.';
            } finally {
                this.busy = false;
            }
        },
        readFile(evt) {
            const file = evt.target.files && evt.target.files[0];
            this.error = '';
            this.preview = null;
            if (!file) return;
            if (!/\.csv$/i.test(file.name)) {
                this.error = 'Choose a .csv file.';
                return;
            }
            if (file.size > MAX_FILE_BYTES) {
                this.error = 'That file is too big to import.';
                return;
            }
            const reader = new FileReader();
            reader.onload = () => {
                const parsed = parseGearCsv(reader.result, { name: file.name.replace(/\.csv$/i, '').replace(/_/g, ' ') });
                if (!parsed.itemCount) {
                    this.error = "We couldn't read any gear from that file. It needs columns for item name, category, quantity, weight and unit.";
                    return;
                }
                this.preview = parsed;
            };
            reader.onerror = () => {
                this.error = "That file couldn't be read.";
            };
            reader.readAsText(file);
        },
        confirm() {
            const parsed = this.preview;
            this.$store.commit('importGearList', parsed);
            const reused = parsed.result ? parsed.result.reused : 0;
            const alert = {
                message: `Imported “${parsed.name || 'list'}”: ${parsed.itemCount} items${reused ? `, ${reused} already in your closet` : ''}.`,
            };
            const alerts = this.$store.state.globalAlerts;
            alerts.push(alert);
            setTimeout(() => {
                const i = alerts.indexOf(alert);
                if (i > -1) alerts.splice(i, 1);
            }, 6000);
            this.close();
        },
    },
};
</script>

<style lang="scss">
@import "../css/_globals";

#wgImportDialog {
    max-width: calc(100vw - 32px);
    width: 520px;

    h2 {
        margin-top: 0;
    }
}

.wgImportIntro {
    font-size: 14px;
    margin: 0 0 16px;
}

.wgImportLink {
    align-items: flex-end;
    display: flex;
    gap: 10px;

    .wgField {
        flex: 1 1 auto;
        min-width: 0;
    }

    .wgBtn {
        flex: none;
    }
}

.wgImportOr {
    align-items: center;
    display: flex;
    font-size: 14px;
    gap: 6px;
    margin: 10px 0 0;
}

.wgImportError {
    background: #FBE9E4;
    border-radius: 8px;
    color: #8A2A12;
    font-size: 14px;
    margin: 14px 0 0;
    padding: 10px 12px;
}

.wgImportPreview {
    border-top: 1px solid var(--lp-border);
    margin-top: 16px;
    padding-top: 16px;
}

.wgImportSummary {
    font-weight: 600;
    margin: 12px 0 4px;
}

.wgImportSkipped {
    font-size: 13px;
    margin: 0 0 4px;
}

#wgImportDialog .wgImportCats {
    display: grid;
    gap: 4px 16px;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    list-style: none;
    margin: 10px 0 0;
    max-height: 180px;
    overflow-y: auto;
    padding: 0;

    li {
        margin: 0;
        padding: 0;
    }

    li {
        display: flex;
        font-size: 14px;
        justify-content: space-between;
    }
}

.wgImportActions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    margin-top: 20px;
}
</style>
