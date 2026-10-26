<template>
    <modal id="wgPlanTeam" :shown="shown" @hide="$emit('hide')">
        <h2>Plan this list together</h2>
        <p class="wgMuted wgImportIntro">
            Invite hiking partners or your group. They can edit this list with you, live: add gear, change quantities, and say who carries what. Your other lists and closet stay private.
        </p>
        <ul class="wgTeamList" data-testid="team-members">
            <li v-for="m in members" :key="m.username">
                <span class="wgTeamAvatar" aria-hidden="true">
                    <img v-if="m.avatarUrl" :src="m.avatarUrl" alt="">
                    <template v-else>{{ (m.displayName || m.username).charAt(0).toUpperCase() }}</template>
                </span>
                <span class="wgTeamName">
                    {{ m.displayName || `@${m.username}` }}
                    <small class="wgMuted">{{ m.role === 'owner' ? 'Owner' : 'Can edit' }}{{ here(m) ? ' · here now' : '' }}</small>
                </span>
                <button v-if="canRemove(m)" type="button" class="wgBtn wgBtnGhost wgBtnSmall" :data-testid="`team-remove-${m.username}`" @click="remove(m)">
                    {{ m.username === me ? 'Leave' : 'Remove' }}
                </button>
            </li>
        </ul>
        <form v-if="isOwner" class="wgImportLink" data-testid="team-invite" @submit.prevent="invite">
            <label class="wgField">Invite by username
                <input v-model.trim="username" class="wgInput" placeholder="@trailbuddy" autocomplete="off" data-testid="team-invite-name">
            </label>
            <button type="submit" class="wgBtn wgBtnPrimary" :disabled="!username || busy" data-testid="team-invite-send">
                Invite
            </button>
        </form>
        <p v-if="error" class="wgImportError" role="alert" data-testid="team-error">
            {{ error }}
        </p>
        <p v-if="link" class="wgTeamLink">
            <span class="wgMuted">Link for the people you invite:</span>
            <input :value="link" class="wgInput" readonly data-testid="team-link" @focus="$event.target.select()">
        </p>
        <div class="wgImportActions">
            <button type="button" class="wgBtn wgBtnGhost" @click="$emit('hide')">
                Done
            </button>
        </div>
    </modal>
</template>

<script>
import modal from './modal.vue';
import { api } from '../utils/format.js';

export default {
    name: 'PlanTeam',
    components: { modal },
    props: {
        shown: { type: Boolean, required: true },
        owner: { type: String, required: true },
        listId: { type: Number, required: true },
    },
    emits: ['hide', 'members'],
    data() {
        return { members: [], username: '', busy: false, error: '' };
    },
    computed: {
        me() {
            return this.$store.state.loggedIn;
        },
        isOwner() {
            return this.me && this.me.toLowerCase() === this.owner.toLowerCase();
        },
        link() {
            return `${window.location.origin}/plan/${this.owner}/${this.listId}`;
        },
    },
    watch: {
        shown(open) {
            if (open) this.load();
        },
    },
    methods: {
        base() {
            return `/api/plan/${encodeURIComponent(this.owner)}/${this.listId}/members`;
        },
        here(m) {
            return this.$store.state.presence.some((p) => p.username === m.username);
        },
        canRemove(m) {
            if (m.role === 'owner') return false;
            return this.isOwner || m.username === this.me;
        },
        setMembers(members) {
            this.members = members;
            this.$emit('members', members);
        },
        async load() {
            this.error = '';
            try {
                this.setMembers((await api(this.base())).members);
            } catch (err) {
                this.error = err.message;
            }
        },
        async invite() {
            this.busy = true;
            this.error = '';
            try {
                this.setMembers((await api(this.base(), { method: 'POST', body: JSON.stringify({ username: this.username.replace(/^@/, '') }) })).members);
                this.username = '';
            } catch (err) {
                this.error = err.message;
            } finally {
                this.busy = false;
            }
        },
        async remove(m) {
            try {
                const leaving = m.username === this.me;
                this.setMembers((await api(`${this.base()}/${encodeURIComponent(m.username)}`, { method: 'DELETE' })).members);
                if (leaving) {
                    this.$emit('hide');
                    this.$router.push('/');
                }
            } catch (err) {
                this.error = err.message;
            }
        },
    },
};
</script>

<style lang="scss">
#wgPlanTeam {
    max-width: calc(100vw - 32px);
    width: 480px;

    h2 {
        margin-top: 0;
    }
}

.wgTeamList {
    display: flex;
    flex-direction: column;
    gap: 8px;
    list-style: none;
    margin: 0 0 16px;
    padding: 0;

    li {
        align-items: center;
        display: flex;
        gap: 10px;
    }
}

.wgTeamAvatar {
    align-items: center;
    background: var(--lp-primary);
    border-radius: 50%;
    color: #fff;
    display: inline-flex;
    flex: none;
    font-size: 13px;
    font-weight: 800;
    height: 32px;
    justify-content: center;
    overflow: hidden;
    width: 32px;

    img {
        height: 100%;
        object-fit: cover;
        width: 100%;
    }
}

.wgTeamName {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    font-weight: 600;

    small {
        font-weight: 400;
    }
}

.wgTeamLink {
    display: flex;
    flex-direction: column;
    font-size: 13px;
    gap: 4px;
    margin: 14px 0 0;
}
</style>
