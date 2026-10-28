<template>
    <div class="wgOwnerBar">
        <div class="wgPage wgOwnerBarInner">
            <span class="wgOwnerTag">Owner</span>
            <nav aria-label="Owner" class="wgOwnerNav">
                <router-link to="/owner/catalog" :class="{ wgActive: active === 'catalog' }">
                    Gear catalog
                </router-link>
                <router-link to="/owner/kits" :class="{ wgActive: active === 'kits' }">
                    Featured kits
                </router-link>
                <router-link to="/owner/trails" :class="{ wgActive: active === 'trails' }" data-testid="owner-nav-trails">
                    Trails
                </router-link>
                <router-link to="/owner/brands" :class="{ wgActive: active === 'brands' }" data-testid="owner-nav-brands">
                    Brands
                </router-link>
                <router-link to="/owner/revenue" :class="{ wgActive: active === 'revenue' }" data-testid="owner-nav-revenue">
                    Revenue
                </router-link>
                <router-link v-if="isModerator" to="/moderation" :class="{ wgActive: active === 'users' }" data-testid="owner-nav-users">
                    Users
                </router-link>
            </nav>
        </div>
    </div>
</template>

<script>
export default {
    name: 'OwnerNav',
    props: {
        active: { type: String, default: '' },
    },
    computed: {
        isModerator() {
            const a = this.$store.state.account;
            return Boolean(a && (a.isModerator || a.isAdmin));
        },
    },
};
</script>

<style lang="scss">
.wgOwnerBar {
    background: var(--lp-surface);
    border-bottom: 1px solid var(--lp-border);
}

.wgOwnerBarInner {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    padding-bottom: 8px;
    padding-top: 8px;
}

.wgOwnerTag {
    background: var(--lp-accent);
    border-radius: 6px;
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    padding: 5px 9px;
    text-transform: uppercase;
}

.wgOwnerNav {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;

    a {
        border-radius: 9px;
        color: var(--lp-text);
        font-size: 14px;
        font-weight: 500;
        padding: 9px 14px;
        text-decoration: none;

        &:hover {
            background: var(--lp-row-hover);
        }

        &.wgActive {
            background: var(--lp-active-bg);
            color: var(--lp-accent-green-deep);
            font-weight: 600;
        }
    }
}
</style>
