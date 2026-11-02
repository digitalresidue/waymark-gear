<template>
    <div class="wgHome">
        <siteHeader active="owner" />
        <template v-if="isOwner">
            <ownerNav active="team" />
            <main id="wgMain" tabindex="-1" class="wgPage wgOwner wgTeam">
                <div class="wgSectionHead">
                    <div>
                        <h1 class="wgH2">
                            Team
                        </h1>
                        <p class="wgLede">
                            People who help run the site. Only owners (you) can add or remove them.
                        </p>
                    </div>
                </div>

                <section class="wgCard wgDevCard">
                    <h2 class="wgProfileEditH">
                        What each role can do
                    </h2>
                    <ul class="wgTeamRoles">
                        <li><strong>Owner:</strong> everything, including revenue and affiliate settings, site-wide scripts, free Supporter time, the members list and this team page.</li>
                        <li><strong>Admin:</strong> the gear catalog and imports, brands, trails, featured kits and moderation. Deleting gear, brands or trails, and imports that change {{ bigImport }} or more catalog rows, wait for your OK on the Activity page. Everything they change is logged there.</li>
                        <li><strong>Moderator:</strong> comments, reports, and helping people with their accounts.</li>
                    </ul>
                </section>

                <section class="wgCard wgDevCard">
                    <h2 class="wgProfileEditH">
                        Add someone
                    </h2>
                    <form class="wgTeamAdd" data-testid="team-add" @submit.prevent="add">
                        <label class="wgField">Username
                            <input v-model.trim="username" class="wgInput" autocomplete="off" data-testid="team-username">
                        </label>
                        <label class="wgField">Role
                            <select v-model="role" class="wgSelect" data-testid="team-role">
                                <option value="admin">Admin</option>
                                <option value="moderator">Moderator</option>
                            </select>
                        </label>
                        <button type="submit" class="wgBtn wgBtnPrimary" :disabled="!username" data-testid="team-save">
                            Add to team
                        </button>
                    </form>
                    <p v-if="error" class="wgDanger" role="alert">
                        {{ error }}
                    </p>
                </section>

                <section class="wgCard wgDevCard">
                    <h2 class="wgProfileEditH">
                        The team
                    </h2>
                    <p v-if="!team.length" class="wgMuted">
                        Just you so far.
                    </p>
                    <table v-else class="wgDevTable" data-testid="team-list">
                        <thead>
                            <tr><th>Member</th><th>Role</th><th>Added</th><th><span class="wgVisuallyHidden">Actions</span></th></tr>
                        </thead>
                        <tbody>
                            <tr v-for="m in team" :key="m.username" data-testid="team-row">
                                <td><a :href="`/@${m.username}`">@{{ m.username }}</a> <span v-if="m.name" class="wgMuted">{{ m.name }}</span></td>
                                <td>
                                    <select :value="m.role" class="wgSelect wgSelectSmall" :aria-label="`Role for ${m.username}`" @change="change(m, $event.target.value)">
                                        <option value="admin">
                                            Admin
                                        </option>
                                        <option value="moderator">
                                            Moderator
                                        </option>
                                    </select>
                                </td>
                                <td class="wgMuted">
                                    {{ day(m.addedAt) }}
                                </td>
                                <td>
                                    <button type="button" class="wgBtn wgBtnGhost wgBtnSmall" :data-testid="`team-remove-${m.username}`" @click="remove(m)">
                                        Remove
                                    </button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </section>
            </main>
        </template>
        <main v-else id="wgMain" tabindex="-1" class="wgPage wgOwner">
            <div class="wgEmpty">
                <p><strong>Site owner only.</strong></p>
            </div>
        </main>
        <siteFooter site />
    </div>
</template>

<script>
import siteHeader from '../components/site-header.vue';
import siteFooter from '../components/site-footer.vue';
import ownerNav from '../components/owner-nav.vue';
import { api } from '../utils/format.js';

export default {
    name: 'OwnerTeam',
    components: { siteHeader, siteFooter, ownerNav },
    data() {
        return { team: [], username: '', role: 'admin', error: '', bigImport: 25 };
    },
    computed: {
        isOwner() {
            return Boolean(this.$store.state.account && this.$store.state.account.isOwner);
        },
    },
    async mounted() {
        document.title = 'Team — Waymark Gear';
        if (this.isOwner) this.team = (await api('/api/owner/team')).team;
    },
    methods: {
        day(when) {
            return new Date(when).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        },
        async save(username, role) {
            this.error = '';
            try {
                this.team = (await api('/api/owner/team', { method: 'POST', body: JSON.stringify({ username, role }) })).team;
                return true;
            } catch (err) {
                this.error = err.message;
                return false;
            }
        },
        async add() {
            if (await this.save(this.username, this.role)) this.username = '';
        },
        change(m, role) {
            return this.save(m.username, role);
        },
        async remove(m) {
            this.team = (await api(`/api/owner/team/${encodeURIComponent(m.username)}`, { method: 'DELETE' })).team;
        },
    },
};
</script>

<style lang="scss">
.wgTeam {
    max-width: 900px;

    .wgDevCard {
        margin: 0 0 16px;
        padding: 16px 18px;
    }
}

.wgTeamRoles {
    margin: 0;
    padding-left: 18px;

    li {
        margin: 6px 0;
    }
}

.wgTeamAdd {
    align-items: end;
    display: flex;
    flex-wrap: wrap;
    gap: 12px;

    .wgField {
        flex: 1 1 200px;
    }
}

.wgSelectSmall {
    min-height: 36px;
    padding: 6px 10px;
}
</style>
