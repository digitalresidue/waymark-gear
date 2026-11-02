<template>
    <section class="wgOwnerBar" aria-label="Site tools">
        <div class="wgPage wgOwnerBarInner">
            <span class="wgOwnerTag" data-testid="owner-role">{{ roleLabel }}</span>
            <nav aria-label="Site tools" class="wgOwnerNav">
                <template v-if="isAdmin">
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
                </template>
                <router-link v-if="isModerator" to="/moderation" :class="{ wgActive: active === 'users' }" data-testid="owner-nav-users">
                    Moderation
                </router-link>
                <template v-if="isOwner">
                    <span class="wgOwnerNavSep" aria-hidden="true" />
                    <router-link to="/owner/revenue" :class="{ wgActive: active === 'revenue' }" data-testid="owner-nav-revenue">
                        Revenue
                    </router-link>
                    <router-link to="/owner/members" :class="{ wgActive: active === 'members' }" data-testid="owner-nav-members">
                        Members
                    </router-link>
                    <router-link to="/owner/team" :class="{ wgActive: active === 'team' }" data-testid="owner-nav-team">
                        Team
                    </router-link>
                    <router-link to="/owner/activity" :class="{ wgActive: active === 'activity' }" data-testid="owner-nav-activity">
                        Activity<span v-if="pending" class="wgOwnerNavCount" data-testid="owner-nav-pending">{{ pending }}<span class="wgVisuallyHidden"> waiting for you</span></span>
                    </router-link>
                </template>
            </nav>
        </div>
    </section>
</template>

<script>
import { api } from '../utils/format.js';

export default {
    name: 'OwnerNav',
    props: {
        active: { type: String, default: '' },
    },
    data() {
        return { pending: 0 };
    },
    computed: {
        account() {
            return this.$store.state.account || {};
        },
        isOwner() {
            return Boolean(this.account.isOwner);
        },
        isAdmin() {
            return Boolean(this.account.isAdmin);
        },
        isModerator() {
            return Boolean(this.account.isModerator || this.account.isAdmin);
        },
        roleLabel() {
            if (this.isOwner) return 'Owner';
            return this.isAdmin ? 'Admin' : 'Moderator';
        },
    },
    async mounted() {
        // Requests from admins waiting for the owner.
        if (!this.isOwner) return;
        try {
            this.pending = (await api('/api/owner/activity?status=pending&limit=1')).pending;
        } catch {
            this.pending = 0;
        }
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
    color: var(--lp-text-invert);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    padding: 5px 9px;
    text-transform: uppercase;
}

.wgOwnerNavSep {
    align-self: center;
    border-left: 1px solid var(--lp-border-strong);
    height: 22px;
    margin: 0 6px;
}

.wgOwnerNavCount {
    background: var(--lp-accent);
    border-radius: 99px;
    color: var(--lp-text-invert);
    font-size: 11px;
    font-weight: 700;
    margin-left: 6px;
    padding: 1px 7px;
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
