<template>
    <div id="sidebar" class="wgPlanSidebar" data-testid="plan-sidebar">
        <div class="lpSidebarSticky">
            <router-link to="/" class="wgBtn wgBtnGhost wgBtnSmall wgPlanBack" data-testid="plan-back">
                ‹ My lists
            </router-link>
            <p class="lpSectionLabel">
                Planning together
            </p>
            <p class="wgPlanOwner">
                <b>@{{ plan.owner }}</b>'s list. Changes save for everyone, live.
            </p>
            <ul class="wgTeamList">
                <li v-for="m in plan.members" :key="m.username">
                    <span class="wgTeamAvatar" aria-hidden="true">
                        <img v-if="m.avatarUrl" :src="m.avatarUrl" alt="">
                        <template v-else>{{ (m.displayName || m.username).charAt(0).toUpperCase() }}</template>
                    </span>
                    <span class="wgTeamName">
                        {{ m.displayName || `@${m.username}` }}
                        <small class="wgMuted">{{ m.role === 'owner' ? 'Owner' : 'Can edit' }}<template v-if="here(m)"> · <span class="wgHereDot">here now</span></template></small>
                    </span>
                </li>
            </ul>
            <p class="wgMuted wgPlanHint">
                Gear you add here belongs to this list. “Add from catalog” fills in weights for you. Set who carries what under “Who carries what”.
            </p>
        </div>
    </div>
</template>

<script>
export default {
    name: 'PlanSidebar',
    computed: {
        plan() {
            return this.$store.state.plan;
        },
    },
    methods: {
        here(m) {
            return this.$store.state.presence.some((p) => p.username.toLowerCase() === m.username.toLowerCase());
        },
    },
};
</script>

<style lang="scss">
// The sidebar's own layout stretches its last region to fill the height;
// this panel is just a short column from the top.
.wgPlanSidebar .lpSidebarSticky {
    display: flex;
    flex-direction: column;
    gap: 12px;
    justify-content: flex-start;
    padding: 16px;

    > * {
        flex: none;
        margin-bottom: 0;
        margin-top: 0;
    }
}

.wgPlanSidebar .wgTeamName {
    min-width: 0;
    overflow-wrap: anywhere;
}

.wgPlanBack {
    align-self: flex-start;
}

.wgPlanOwner,
.wgPlanHint {
    font-size: 13.5px;
    margin: 0;
}

.wgHereDot {
    color: #2E7D4F;
    font-weight: 700;
}
</style>
