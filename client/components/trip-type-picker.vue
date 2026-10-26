<template>
    <div class="wgTripType" role="radiogroup" aria-label="What kind of trip is this list for?" data-testid="trip-type">
        <span class="wgTripTypeLabel">Trip type</span>
        <button
            v-for="t in types"
            :key="t.id"
            type="button"
            role="radio"
            class="wgChip"
            :aria-checked="String(list.tripType === t.id)"
            :aria-pressed="String(list.tripType === t.id)"
            :data-testid="`trip-type-${t.id}`"
            @click="pick(t.id)"
        >
            {{ t.label }}
        </button>
    </div>
</template>

<script>
import { TRIP_TYPES, TRIP_TYPE_LABELS } from '../utils/gear-meta.js';

export default {
    name: 'TripTypePicker',
    props: {
        list: { type: Object, required: true },
    },
    computed: {
        types() {
            return TRIP_TYPES.map((id) => ({ id, label: TRIP_TYPE_LABELS[id] }));
        },
    },
    methods: {
        // Picking the current type again clears it.
        pick(id) {
            this.$store.commit('setListTripType', { list: this.list, tripType: this.list.tripType === id ? '' : id });
        },
    },
};
</script>

<style lang="scss">
.wgTripType {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 6px 8px;
    margin: 0 0 14px;
}

.wgTripTypeLabel {
    color: var(--lp-text-secondary);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.06em;
    margin-right: 4px;
    text-transform: uppercase;
}
</style>
