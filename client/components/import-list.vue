<template>
    <modal id="wgImportDialog" :shown="shown" @hide="close">
        <h2>Import a list</h2>
        <p class="wgMuted wgImportIntro">
            Bring a list over from LighterPack, PackWizard, another app or a spreadsheet. It becomes a new list, and gear that's already in your closet is reused instead of duplicated.
        </p>

        <form class="wgImportLink" @submit.prevent="fetchLink">
            <label class="wgField">Share link
                <input
                    v-model.trim="link"
                    class="wgInput"
                    type="text"
                    inputmode="url"
                    autocomplete="off"
                    placeholder="lighterpack.com/r/… or packwizard.com/s/…"
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
            or
            <button type="button" class="wgBtn wgBtnGhost wgBtnSmall" :aria-expanded="String(pasting)" data-testid="import-paste-toggle" @click="pasting = !pasting">
                paste rows
            </button>
        </p>
        <input ref="file" type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" class="wgVisuallyHidden" tabindex="-1" aria-label="File to import" data-testid="import-file" @change="readFile">

        <div v-if="pasting" class="wgImportPaste">
            <label class="wgField">Rows copied from a spreadsheet, with the header row
                <textarea v-model="pasted" class="wgInput" rows="5" spellcheck="false" placeholder="Name&#9;Category&#9;Weight (g)&#9;Qty" data-testid="import-paste" />
            </label>
            <button type="button" class="wgBtn wgBtnSmall" :disabled="!pasted.trim()" data-testid="import-paste-read" @click="readPasted">
                Read rows
            </button>
        </div>

        <details class="wgImportHelp" data-testid="import-help">
            <summary>Where do I find my list in other apps?</summary>
            <dl>
                <dt>LighterPack</dt>
                <dd>Paste the list's share link, or upload the CSV from its Export menu.</dd>
                <dt>PackWizard</dt>
                <dd>Open the pack, choose Share and paste its link (packwizard.com/s/…). Photos, brands, prices and links come too.</dd>
                <dt>Packstack and other apps</dt>
                <dd>Export your gear as a CSV and upload it. We read the columns by name: item, brand, category, weight, unit, quantity, price, link, notes, worn and consumable.</dd>
                <dt>Google Sheets or Excel</dt>
                <dd>Download or save as CSV and upload it, or copy the cells (with the header row) and paste them.</dd>
            </dl>
        </details>

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
            <p v-if="preview.photos" class="wgMuted wgImportNote" data-testid="import-photos">
                {{ preview.photos }} {{ preview.photos === 1 ? 'photo' : 'photos' }} copied with the gear.
            </p>
            <label v-if="preview.unitAssumed" class="wgImportUnit" data-testid="import-unit">
                The file doesn't say which unit its weights are in. They're in
                <select v-model="unit" class="wgSelect" data-testid="import-unit-select" @change="reparse">
                    <option value="oz">ounces</option>
                    <option value="lb">pounds</option>
                    <option value="g">grams</option>
                    <option value="kg">kilograms</option>
                </select>
            </label>
            <p v-if="preview.columns && preview.columns.length" class="wgMuted wgImportNote" data-testid="import-columns">
                Read from your columns:
                <span v-for="(c, i) in preview.columns" :key="c.field">{{ i ? ', ' : '' }}{{ c.label }}<template v-if="c.from.toLowerCase() !== c.label.toLowerCase()"> ← “{{ c.from }}”</template></span>
            </p>
            <p v-if="preview.skipped" class="wgMuted wgImportNote">
                {{ preview.skipped }} {{ preview.skipped === 1 ? "row couldn't" : "rows couldn't" }} be read (no name or weight) and will be left out.
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

// Import a list from another app: a share link (LighterPack, PackWizard; the
// server reads it), a CSV file, or rows pasted from a spreadsheet (read here).
export default {
    name: 'ImportList',
    components: { modal },
    props: {
        shown: { type: Boolean, required: true },
    },
    emits: ['hide'],
    data() {
        return { link: '', busy: false, error: '', preview: null, pasting: false, pasted: '', unit: 'oz', source: null };
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
            Object.assign(this, { link: '', busy: false, error: '', preview: null, pasting: false, pasted: '', unit: 'oz', source: null });
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
            this.source = null;
            try {
                this.preview = await api('/api/import/link', {
                    method: 'POST',
                    body: JSON.stringify({ url: this.link }),
                });
            } catch (err) {
                this.error = err.message || 'That list could not be imported.';
            } finally {
                this.busy = false;
            }
        },
        // Text from a file or a paste: read it, and keep it to read again
        // if the weights' unit is changed.
        readText(text, name) {
            this.error = '';
            this.preview = null;
            this.source = { text, name };
            const parsed = parseGearCsv(text, { name, unit: this.unit });
            if (!parsed.itemCount) {
                this.error = "We couldn't read any gear from that. It needs a header row with at least a name and a weight column (like Item, Weight, Unit).";
                this.source = null;
                return;
            }
            this.preview = parsed;
            this.pasting = false;
        },
        reparse() {
            if (!this.source) return;
            const name = this.preview ? this.preview.name : this.source.name;
            this.readText(this.source.text, this.source.name);
            if (this.preview) this.preview.name = name;
        },
        readFile(evt) {
            const file = evt.target.files && evt.target.files[0];
            this.error = '';
            this.preview = null;
            if (!file) return;
            if (!/\.(csv|tsv|txt)$/i.test(file.name)) {
                this.error = 'Choose a .csv file. In a spreadsheet app, use Save as or Download as CSV.';
                return;
            }
            if (file.size > MAX_FILE_BYTES) {
                this.error = 'That file is too big to import.';
                return;
            }
            const reader = new FileReader();
            reader.onload = () => this.readText(reader.result, file.name.replace(/\.(csv|tsv|txt)$/i, '').replace(/_/g, ' '));
            reader.onerror = () => {
                this.error = "That file couldn't be read.";
            };
            reader.readAsText(file);
        },
        readPasted() {
            if (this.pasted.length > MAX_FILE_BYTES) {
                this.error = 'That is too much to import at once.';
                return;
            }
            this.readText(this.pasted, 'Imported list');
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
    flex-wrap: wrap;
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

.wgImportNote {
    font-size: 13px;
    margin: 0 0 4px;
}

.wgImportPaste {
    align-items: flex-end;
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 12px;

    .wgField {
        width: 100%;
    }

    textarea {
        font: 13px/1.4 $font-mono;
        resize: vertical;
        width: 100%;
    }
}

.wgImportHelp {
    font-size: 14px;
    margin-top: 14px;

    summary {
        color: var(--lp-accent-green-deep);
        cursor: pointer;
        font-weight: 600;
    }

    dl {
        margin: 8px 0 0;
    }

    dt {
        font-weight: 600;
        margin-top: 8px;
    }

    dd {
        color: var(--lp-text-secondary);
        margin: 2px 0 0;
    }
}

.wgImportUnit {
    align-items: center;
    background: var(--lp-surface-sunken);
    border-radius: 8px;
    display: flex;
    flex-wrap: wrap;
    font-size: 14px;
    gap: 6px;
    margin: 8px 0;
    padding: 8px 10px;
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
