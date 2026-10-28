<template>
    <div class="wgHome">
        <siteHeader />
        <main class="wgPage wgDevPage">
            <h1 class="wgH2">
                API and AI assistants
            </h1>
            <p class="wgLede">
                Let Claude, ChatGPT or another AI assistant read your closet and lists, run a shakedown with the gear check, and (if you allow it) add and change gear. Or build on the REST API.
            </p>

            <section class="wgCard wgDevCard">
                <h2 class="wgProfileEditH">
                    Connect an AI assistant
                </h2>
                <p>Add Waymark Gear as a custom connector (MCP server) with this address. Your assistant will ask you to sign in here and choose read-only or read-and-write.</p>
                <div class="wgDevCopy">
                    <input class="wgInput wgMono" :value="mcpUrl" readonly data-testid="mcp-url" @focus="$event.target.select()">
                    <button type="button" class="wgBtn wgBtnGhost" @click="copy(mcpUrl)">
                        {{ copied === mcpUrl ? 'Copied' : 'Copy' }}
                    </button>
                </div>
                <ul class="wgDevHow">
                    <li><strong>Claude</strong>: Settings → Connectors → Add custom connector, paste the address.</li>
                    <li><strong>ChatGPT</strong>: Settings → Connectors → Create (developer mode), paste the address.</li>
                    <li><strong>Claude Code</strong>: <code>claude mcp add --transport http waymark {{ mcpUrl }}</code></li>
                    <li><strong>Other tools</strong>: use the address with a personal token below as <code>Authorization: Bearer …</code>.</li>
                </ul>
                <p class="wgMuted wgProfileHint">
                    Try: "Do a shakedown of my Wind River list", "What could I swap to get under 10 lb base weight?", "Add the Zpacks Duplex to my wishlist".
                </p>
            </section>

            <p v-if="!signedIn" class="wgCard wgProfileEditNote">
                <router-link to="/signin">
                    Sign in
                </router-link> to make tokens and see connected assistants.
            </p>

            <section v-else class="wgCard wgDevCard">
                <h2 class="wgProfileEditH">
                    Personal tokens and connected apps
                </h2>
                <form class="wgDevNew" data-testid="token-form" @submit.prevent="create">
                    <label class="wgField">Name
                        <input v-model.trim="name" class="wgInput" maxlength="80" placeholder="e.g. My scripts" data-testid="token-name">
                    </label>
                    <label class="wgField">Access
                        <select v-model="scope" class="wgSelect" data-testid="token-scope">
                            <option value="read">Read only</option>
                            <option value="write">Read and write</option>
                        </select>
                    </label>
                    <button type="submit" class="wgBtn wgBtnPrimary" :disabled="!name" data-testid="token-create">
                        Make token
                    </button>
                </form>
                <p v-if="error" class="wgImportError" role="alert">
                    {{ error }}
                </p>
                <div v-if="fresh" class="wgDevFresh" role="status">
                    <p><strong>Copy your token now.</strong> It won't be shown again.</p>
                    <div class="wgDevCopy">
                        <input class="wgInput wgMono" :value="fresh" readonly data-testid="token-value" @focus="$event.target.select()">
                        <button type="button" class="wgBtn wgBtnGhost" @click="copy(fresh)">
                            {{ copied === fresh ? 'Copied' : 'Copy' }}
                        </button>
                    </div>
                </div>
                <p v-if="loaded && !tokens.length" class="wgMuted">
                    No tokens or connected apps yet.
                </p>
                <ul class="wgDevTokens" data-testid="token-list">
                    <li v-for="t in tokens" :key="t.id" data-testid="token-row">
                        <span>
                            <strong>{{ t.name }}</strong>
                            <span class="wgMuted"> · {{ t.viaApp ? 'connected app' : 'token' }} · {{ t.scope === 'write' ? 'read and write' : 'read only' }} · <span class="wgMono">{{ t.prefix }}…</span></span>
                            <br><span class="wgMuted wgDevWhen">Made {{ day(t.createdAt) }}{{ t.lastUsedAt ? ` · last used ${day(t.lastUsedAt)}` : ' · never used' }}</span>
                        </span>
                        <button type="button" class="wgBtn wgBtnGhost wgBtnSmall" data-testid="token-revoke" @click="revoke(t)">
                            {{ t.viaApp ? 'Disconnect' : 'Revoke' }}
                        </button>
                    </li>
                </ul>
            </section>

            <section class="wgCard wgDevCard">
                <h2 class="wgProfileEditH">
                    REST API
                </h2>
                <p>Send a token as <code>Authorization: Bearer wg_…</code>. JSON in, JSON out, 120 requests a minute.</p>
                <table class="wgDevTable">
                    <tbody>
                        <tr v-for="e in endpoints" :key="e[0] + e[1]">
                            <td><code>{{ e[0] }}</code></td><td><code>{{ e[1] }}</code></td><td>{{ e[2] }}</td>
                        </tr>
                    </tbody>
                </table>
                <pre class="wgDevExample">curl -H "Authorization: Bearer $WAYMARK_TOKEN" {{ origin }}/api/v1/lists</pre>
            </section>
        </main>
    </div>
</template>

<script>
import siteHeader from '../components/site-header.vue';
import { api } from '../utils/format.js';

export default {
    name: 'Developers',
    components: { siteHeader },
    data() {
        return {
            tokens: [], loaded: false, name: '', scope: 'read', fresh: '', error: '', copied: '',
            endpoints: [
                ['GET', '/api/v1/me', 'Who you are, counts'],
                ['GET', '/api/v1/gear?include=owned|wishlist|retired|all&q=', 'Your closet'],
                ['POST', '/api/v1/gear', 'Add gear: { catalogId } or { name, weight, unit }, wishlist'],
                ['PATCH', '/api/v1/gear/:id', 'Change gear'],
                ['GET', '/api/v1/lists', 'Your lists with weights'],
                ['POST', '/api/v1/lists', 'Make a list: { name, categories }'],
                ['GET', '/api/v1/lists/:id', 'One list in full'],
                ['GET', '/api/v1/lists/:id/check', 'Gear check: essentials, lighter options, calories'],
                ['POST', '/api/v1/lists/:id/items', 'Add gear to a list: { category, gearId | catalogId | name }'],
                ['DELETE', '/api/v1/lists/:id/items/:gearId', 'Take gear out of a list'],
                ['GET', '/api/v1/catalog?q=', 'Search the gear catalog'],
            ],
        };
    },
    computed: {
        signedIn() {
            return Boolean(this.$store.state.loggedIn);
        },
        origin() {
            return window.location.origin;
        },
        mcpUrl() {
            return `${window.location.origin}/mcp`;
        },
    },
    async mounted() {
        document.title = 'API and AI assistants — Waymark Gear';
        if (this.signedIn) await this.load();
    },
    methods: {
        async load() {
            const { tokens } = await api('/api/tokens').catch(() => ({ tokens: [] }));
            this.tokens = tokens;
            this.loaded = true;
        },
        day(when) {
            return new Date(when).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        },
        async create() {
            this.error = '';
            try {
                const t = await api('/api/tokens', { method: 'POST', body: JSON.stringify({ name: this.name, scope: this.scope }) });
                this.fresh = t.token;
                this.name = '';
                await this.load();
            } catch (err) {
                this.error = err.message;
            }
        },
        async revoke(t) {
            await api(`/api/tokens/${t.id}`, { method: 'DELETE' });
            if (this.fresh && this.fresh.startsWith(t.prefix)) this.fresh = '';
            await this.load();
        },
        async copy(text) {
            try {
                await navigator.clipboard.writeText(text);
                this.copied = text;
            } catch {
                // No clipboard access: the field is selectable.
            }
        },
    },
};
</script>

<style lang="scss">
.wgDevPage {
    padding-bottom: 48px;
    padding-top: 28px;
    max-width: 860px;
}

.wgDevCard {
    margin: 0 0 16px;
    padding: 16px 18px;

    code {
        font-size: 13px;
        overflow-wrap: anywhere;
    }
}

.wgDevCopy {
    display: flex;
    gap: 8px;
}

.wgDevHow {
    margin: 12px 0;
    padding-left: 18px;

    li {
        margin: 4px 0;
    }
}

.wgDevNew {
    align-items: end;
    display: grid;
    gap: 12px;
    grid-template-columns: 2fr 1fr auto;
    margin-bottom: 12px;

    @media (max-width: 600px) {
        grid-template-columns: 1fr;
    }
}

.wgDevFresh {
    background: #FCEFD9;
    border-radius: 10px;
    color: #5A3B06;
    margin: 0 0 12px;
    padding: 10px 12px;

    p {
        margin: 0 0 6px;
    }
}

.wgDevTokens {
    list-style: none;
    margin: 0;
    padding: 0;

    li {
        align-items: center;
        border-top: 1px solid var(--lp-border);
        display: flex;
        gap: 12px;
        justify-content: space-between;
        padding: 10px 0;
    }
}

.wgDevWhen {
    font-size: 12px;
}

.wgDevTable {
    border-collapse: collapse;
    font-size: 14px;
    width: 100%;

    td {
        border-top: 1px solid var(--lp-border);
        padding: 6px 6px 6px 0;
        vertical-align: top;
    }

    td:first-child {
        width: 60px;
    }
}

.wgDevExample {
    background: var(--lp-surface-sunken);
    border-radius: 8px;
    font-size: 13px;
    overflow-x: auto;
    padding: 10px 12px;
}
</style>
