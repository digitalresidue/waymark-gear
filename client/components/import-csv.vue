<template>
    <div id="importCSV">
        <modal id="importValidate" :shown="shown" @hide="shown = false">
            <h2>Confirm your import</h2>
            <div id="importData">
                <ul class="lpTable lpDataTable">
                    <li class="lpRow lpHeader">
                        <span class="lpCell">Item Name</span>
                        <span class="lpCell">Category</span>
                        <span class="lpCell">Description</span>
                        <span class="lpCell">Qty</span>
                        <span class="lpCell">Weight</span>
                        <span class="lpCell">Unit</span>
                    </li>
                    <li v-for="(row, i) in importData.data" :key="i" class="lpRow">
                        <span class="lpCell">{{ row.name }}</span>
                        <span class="lpCell">{{ row.category }}</span>
                        <span class="lpCell">{{ row.description }}</span>
                        <span class="lpCell">{{ row.qty }}</span>
                        <span class="lpCell">{{ row.weight }}</span>
                        <span class="lpCell">{{ row.unit }}</span>
                    </li>
                </ul>
            </div>
            <a id="importConfirm" class="lpButton" @click="importList">Import List</a>
            <a class="lpButton close" @click="shown = false">Cancel Import</a>
        </modal>
        <form id="csvUpload">
            <input id="csv" type="file" name="csv">
        </form>
    </div>
</template>

<script>
import modal from './modal.vue';
import weightUtils from '../utils/weight.js';
import { parseGearCsv } from '../utils/lighterpack-import.js';

export default {
    name: 'ImportCsv',
    components: {
        modal,
    },
    data() {
        return {
            csvInput: false,
            listId: false,
            importData: {},
            shown: false,
        };
    },
    computed: {
        library() {
            return this.$store.state.library;
        },
    },
    mounted() {
        this.csvInput = document.getElementById('csv');
        this.csvInput.onchange = this.importCSV;
    },
    methods: {
        triggerUpload() {
            this.csvInput.click();
        },
        importCSV(evt) {
            const file = evt.target.files[0];
            const name = file.name;

            if (file.name.length < 1) {
                return;
            }
            if (file.size > 1000000) {
                alert('File is too big');
                return;
            }
            if (name.substring(name.length - 4).toLowerCase() != '.csv') {
                alert('Please select a CSV.');
                return;
            }
            const reader = new FileReader();

            reader.onload = ((theFile) => {
                this.validateImport(theFile.target.result, file.name.substring(0, file.name.length - 4).replace(/_/g, ' '));
            });

            reader.readAsText(file);
        },
        validateImport(input, name) {
            const parsed = parseGearCsv(input, { name });
            if (!parsed.itemCount) {
                alert('Unable to load spreadsheet - please verify the format.');
                return;
            }
            this.importData = {
                parsed,
                data: parsed.categories.flatMap((c) => c.items.map((item) => ({
                    ...item,
                    category: c.name,
                    weight: weightUtils.MgToWeight(item.weightMg, item.unit),
                }))),
            };
            this.shown = true;
        },
        importList() {
            this.$store.commit('importGearList', this.importData.parsed);
            this.shown = false;
        },

    },
};
</script>

<style lang="scss">

#importValidate {
    height: 500px;
    overflow-y: scroll;
    width: 650px;

    .lpButton {
        margin-bottom: 30px;
    }
}

</style>
