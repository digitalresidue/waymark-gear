<template>
    <p v-if="offline" class="wgOffline" role="status" data-testid="offline-banner">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M2 2l20 20" /><path d="M8.5 16.5a5 5 0 0 1 7 0" /><path d="M5 12.9a10 10 0 0 1 5.2-2.8" /><path d="M19 12.9a10 10 0 0 0-2.2-1.6" /><path d="M12 20h.01" /></svg>
        Offline. Changes are kept on this device and sync when you're back online.
    </p>
</template>

<script>
export default {
    name: 'OfflineBanner',
    computed: {
        offline() {
            return this.$store.state.offline;
        },
    },
};
</script>

<style lang="scss">
.wgOffline {
    align-items: center;
    background: #FCEFD9;
    border-bottom: 1px solid #E9C98F;
    color: #5A3B06;
    display: flex;
    font-size: 13.5px;
    gap: 8px;
    justify-content: center;
    margin: 0;
    padding: 8px 12px;
    text-align: center;

    svg {
        flex: none;
    }
}
</style>
