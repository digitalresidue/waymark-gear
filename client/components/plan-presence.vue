<template>
    <span class="headerItem wgPresence">
        <span v-if="others.length" class="wgPresenceFaces" :title="`Here now: ${others.map((p) => p.displayName || '@' + p.username).join(', ')}`" data-testid="presence">
            <span v-for="p in others.slice(0, 4)" :key="p.username" class="wgPresenceFace" :aria-label="`${p.displayName || p.username} is here`">
                {{ (p.displayName || p.username).charAt(0).toUpperCase() }}
            </span>
            <span v-if="others.length > 4" class="wgPresenceMore">+{{ others.length - 4 }}</span>
        </span>
        <button v-if="team" type="button" class="wgPackLink wgTeamButton" data-testid="open-team" title="Plan this list with others" @click="$emit('team')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17" cy="9" r="2.6" /><path d="M16 14.2c2.8.3 5 2.7 5 5.8" /></svg>
            Team
        </button>
    </span>
</template>

<script>
export default {
    name: 'PlanPresence',
    props: {
        // On the desktop the Team button lives in the sidebar's rail; the
        // faces of who's here stay by the title.
        team: { type: Boolean, default: true },
    },
    emits: ['team'],
    computed: {
        others() {
            const me = (this.$store.state.loggedIn || '').toLowerCase();
            return this.$store.state.presence.filter((p) => p.username.toLowerCase() !== me);
        },
    },
};
</script>

<style lang="scss">
.wgPresence {
    align-items: center;
    display: inline-flex;
    gap: 8px;
}

.wgPresenceFaces {
    display: inline-flex;
}

.wgPresenceFace,
.wgPresenceMore {
    align-items: center;
    background: #C4571F;
    border: 2px solid var(--lp-bg, #fff);
    border-radius: 50%;
    color: #fff;
    display: inline-flex;
    font-size: 11px;
    font-weight: 800;
    height: 26px;
    justify-content: center;
    margin-left: -6px;
    width: 26px;

    &:first-child {
        margin-left: 0;
    }
}

.wgPresenceMore {
    background: var(--lp-text-secondary);
}

.wgTeamButton {
    background: none;
    border: 0;
    cursor: pointer;
    font: inherit;
}
</style>
