<template>
    <span v-if="isSignedIn" id="settings" class="headerItem hasPopover" :class="{ wgRailTool: rail }">
        <PopoverHover>
            <template #target>
                <span v-if="rail" class="wgRailBtn" title="List settings"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg><span class="wgRailLabel">Settings</span></span>
                <span v-else><i class="lpSprite lpSettings" /> Settings</span>
            </template>
            <template #content><div>
                <ul id="lpOptionalFields">
                    <li v-for="optionalField in optionalFieldsLookup" :key="optionalField.name" class="lpOptionalField">
                        <toggle v-model="optionalField.value" @update:model-value="toggleOptionalField(optionalField.name)">
                            {{ optionalField.displayName }}
                        </toggle>
                    </li>
                </ul>
                <div v-if="optionalFields['price']" id="lpPriceSettings">
                    <hr>
                    <label>
                        Currency:
                        <input id="currencySymbol" type="text" maxlength="4" :value="library.currencySymbol" @input="updateCurrencySymbol($event)">
                    </label>
                </div>
                <div id="lpDensitySettings">
                    <hr>
                    <span class="lpDensityLabel">Density</span>
                    <button-group v-model="density" label="Density" :options="densityOptions" />
                </div>
            </div></template>
        </PopoverHover>
    </span>
</template>

<script>
import buttonGroup from './button-group.vue';
import PopoverHover from './popover-hover.vue';
import toggle from './toggle.vue';

export default {
    name: 'ListSettings',
    components: {
        buttonGroup,
        PopoverHover,
        toggle,
    },
    props: {
        // Drawn as a button in the editor's icon rail (desktop).
        rail: { type: Boolean, default: false },
    },
    data() {
        return {
            densityOptions: [
                { value: 'comfortable', label: 'Comfortable', testid: 'density-comfortable' },
                { value: 'compact', label: 'Compact', testid: 'density-compact' },
            ],
            optionalFieldsLookup: [{
                name: 'images',
                displayName: 'Item images',
                cssClass: 'lpShowImages',
                value: false,
            }, {
                name: 'price',
                displayName: 'Item prices',
                cssClass: 'lpShowPrices',
                value: false,
            }, {
                name: 'worn',
                displayName: 'Worn items',
                cssClass: 'lpShowWorn',
                value: false,
            }, {
                name: 'consumable',
                displayName: 'Consumable items',
                cssClass: 'lpShowConsumable',
                value: false,
            }, {
                name: 'packWeight',
                displayName: 'Total pack weight',
                cssClass: 'lpShowPackWeight',
                value: false,
            }, {
                name: 'listDescription',
                displayName: 'List descriptions',
                cssClass: 'lpShowListDescription',
                value: false,
            }],
        };
    },
    computed: {
        library() {
            return this.$store.state.library;
        },
        optionalFields() {
            return this.$store.getters.optionalFields;
        },
        isSignedIn() {
            return this.$store.state.loggedIn;
        },
        // Density is a display preference rather than a property of the list,
        // so it lives on the library and follows you between lists.
        density: {
            get() {
                return this.library.preferences.density;
            },
            set(value) {
                this.$store.commit('setPreference', { preference: 'density', value });
            },
        },
    },
    watch: {
        // Deep-watching the getter tracks both toggles on the active list
        // and switches to a different list (whose settings may differ).
        optionalFields: {
            handler() { this.updateOptionalFieldValues(); },
            deep: true,
        },
    },
    beforeMount() {
        this.updateOptionalFieldValues();
    },
    methods: {
        toggleOptionalField(optionalField) {
            this.$store.commit('toggleOptionalField', optionalField);
        },
        updateCurrencySymbol(evt) {
            this.$store.commit('updateCurrencySymbol', evt.target.value);
        },
        updateOptionalFieldValues() {
            let i;
            let fieldLookup;

            for (i = 0; i < this.optionalFieldsLookup.length; i++) {
                fieldLookup = this.optionalFieldsLookup[i];
                fieldLookup.value = this.optionalFields[fieldLookup.name];
            }
        },
    },
};
</script>

<style lang="scss">

#csvUrl {
    display: block;
    margin-top: 15px;
}

#lpOptionalFields {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
    padding: 0;
}

.lpOptionalField {
    list-style-type: none;
    margin: 0;
    padding: 0;
}

#lpPriceSettings {
    input {
        display: inline-block;
        margin-left: 10px;
        width: 50px;
    }
}

#lpDensitySettings {
    .lpDensityLabel {
        display: block;
        margin-bottom: 6px;
    }
}

// Share and Settings hang from the right edge of their header target rather
// than centering under it, so the top-right corner — the one nearest the
// target — is squared off while the other three stay rounded.
#share .lpContent,
#settings .lpContent {
    border-top-right-radius: 0;
    left: auto;
    right: 0;
    transform: none;
}

#share .lpContent {
    width: 330px;
}

#settings .lpContent {
    width: 200px;
}
</style>
