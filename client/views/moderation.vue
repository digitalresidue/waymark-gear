<template>
    <div class="wgHome">
        <siteHeader active="owner" />
        <template v-if="isModerator">
            <ownerNav active="users" />
            <main id="wgMain" tabindex="-1" class="wgPage wgOwner wgModeration">
                <h1 class="wgH2">
                    Users
                </h1>
                <p class="wgLede">
                    Look someone up to help with their account, and review comments people have reported.
                </p>

                <section class="wgCard wgDevCard">
                    <h2 class="wgProfileEditH">
                        Find a user
                    </h2>
                    <form class="wgModSearch" @submit.prevent="searchUsers">
                        <input v-model="searchQuery" type="search" class="wgInput" placeholder="Search for a user..." aria-label="Username or email" data-testid="moderation-search">
                        <button type="submit" class="wgBtn wgBtnPrimary">
                            Search
                        </button>
                    </form>
                    <p v-if="resultsLoaded && !searchResults.length" class="wgMuted">
                        Nobody matches “{{ matchedQuery }}”.
                    </p>
                    <div class="wgModGrid">
                        <ul v-if="resultsLoaded && searchResults.length" class="lp-moderation-search-results">
                            <li
                                v-for="result in searchResults"
                                :key="result.username"
                                :class="{ wgActive: userToInspect && userToInspect.username === result.username }"
                                tabindex="0"
                                @click="setUser(result)"
                                @keydown.enter="setUser(result)"
                            >
                                <lp-user-identity :user="result" :query="matchedQuery" />
                            </li>
                        </ul>

                        <div v-if="userToInspect" class="lp-moderation-user-to-inspect">
                            <h3 class="wgModUserName">
                                <a :href="`/@${userToInspect.username}`" target="_blank" rel="noopener">@{{ userToInspect.username }}</a>
                            </h3>
                            <dl class="lp-moderation-facts">
                                <div>
                                    <dt>Last seen</dt>
                                    <dd :title="absolute(userToInspect.lastSeen)">
                                        {{ relative(userToInspect.lastSeen) }}
                                    </dd>
                                </div>
                                <div>
                                    <dt>Registered</dt>
                                    <dd :title="absolute(userToInspect.registered)">
                                        {{ relative(userToInspect.registered) }}
                                    </dd>
                                </div>
                                <div>
                                    <dt>Lists</dt>
                                    <dd>{{ userToInspect.lists }}</dd>
                                </div>
                                <div>
                                    <dt>Saves</dt>
                                    <dd title="sync_token — increments on every save">
                                        {{ userToInspect.syncToken }}
                                    </dd>
                                </div>
                            </dl>
                            <div class="wgModActions">
                                <button type="button" class="wgBtn wgBtnGhost" @click="clearSession(userToInspect)">
                                    Clear session
                                </button>
                                <button type="button" class="wgBtn wgBtnGhost" @click="resetPassword(userToInspect)">
                                    Create password reset link
                                </button>
                            </div>
                            <p v-if="sessionCleared" class="wgMuted" role="status">
                                Signed out everywhere.
                            </p>
                            <p v-if="resetUrl" class="lp-moderation-reset-url">
                                <strong>Reset link:</strong> <code>{{ resetUrl }}</code>
                                <br>
                                Send this to the user. It expires in one hour, works once, and
                                leaves their current password working until they use it.
                            </p>
                            <details class="wgModLibrary">
                                <summary>
                                    Their library (JSON, read-only)
                                </summary>
                                <p class="lp-moderation-editing">
                                    Library of
                                    <lp-user-identity :user="userToInspect" :query="matchedQuery" />
                                </p>
                                <textarea id="lp-moderation-user-library-json" v-model="editableLibrary" class="wgTextarea" aria-label="Library JSON" readonly />
                            </details>
                        </div>
                    </div>
                </section>

                <reportedComments />
            </main>
        </template>
        <main v-else id="wgMain" tabindex="-1" class="wgPage wgOwner">
            <div class="wgEmpty">
                <p><strong>Moderators only.</strong></p>
            </div>
        </main>
        <siteFooter site />
    </div>
</template>

<script>
import reportedComments from '../components/reported-comments.vue';
import siteHeader from '../components/site-header.vue';
import siteFooter from '../components/site-footer.vue';
import ownerNav from '../components/owner-nav.vue';
import { h } from 'vue';
import { fetchJson } from '../utils/utils.js';

// Split a value around the search text so the matching run can be marked.
// Segments rather than v-html: usernames and emails are user-supplied.
function markMatches(value, query) {
    const text = String(value ?? '');
    const needle = String(query ?? '').toLowerCase();
    if (!needle) return [text];

    const haystack = text.toLowerCase();
    const parts = [];
    let cursor = 0;
    let index = haystack.indexOf(needle);
    while (index !== -1) {
        if (index > cursor) parts.push(text.slice(cursor, index));
        parts.push(h('mark', text.slice(index, index + needle.length)));
        cursor = index + needle.length;
        index = haystack.indexOf(needle, cursor);
    }
    parts.push(text.slice(cursor));
    return parts;
}

// Which of the two a search hit isn't obvious from the username alone, so both
// fields show, both marked.
const LpUserIdentity = {
    props: {
        user: { type: Object, required: true },
        query: { type: String, default: "" },
    },
    render() {
        return h('span', { class: 'lp-moderation-identity' }, [
            h('span', { class: 'lp-moderation-username' }, markMatches(this.user.username, this.query)),
            h('span', { class: 'lp-moderation-email' }, markMatches(this.user.email, this.query)),
        ]);
    },
};

export default {
    name: 'Admin',
    components: {
        reportedComments,
        LpUserIdentity,
        siteHeader,
        siteFooter,
        ownerNav,
    },
    data() {
        return {
            searchQuery: "",
            matchedQuery: "",
            searchResults: null,
            userToInspect: null,
            editableLibrary: null,
            resetUrl: null,
            sessionCleared: false,
        };
    },
    computed: {
        resultsLoaded() {
            return !!this.searchResults;
        },
        isModerator() {
            const a = this.$store.state.account;
            return Boolean(a && (a.isModerator || a.isAdmin));
        },
    },
    mounted() {
        document.title = 'Users — Waymark Gear';
    },
    methods: {
        // Intl rather than a date library — this is the only place that needs it.
        relative(value) {
            const date = value ? new Date(value) : null;
            if (!date || Number.isNaN(date.getTime())) return 'never';

            const seconds = (date.getTime() - Date.now()) / 1000;
            const format = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
            const units = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60]];
            for (const [unit, size] of units) {
                if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
            }
            return format.format(Math.round(seconds), 'second');
        },
        absolute(value) {
            const date = value ? new Date(value) : null;
            return !date || Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
        },
        searchUsers() {
            // The term the results were fetched with, not the live input, so
            // typing a new search doesn't re-mark the results on screen.
            const query = this.searchQuery.trim();
            fetchJson(`/moderation/search?q=${encodeURIComponent(query)}`, {
                method: 'GET',
                credentials: 'same-origin',
            })
                .then((response) => {
                    this.searchResults = response.results;
                    this.matchedQuery = query;
                })
                .catch((err) => {
                    console.log(err);
                });
        },
        setUser(user) {
            this.userToInspect = user;
            this.editableLibrary = JSON.stringify(this.userToInspect.library, null, 2);
            this.resetUrl = null;
            this.sessionCleared = false;
        },
        clearSession(user) {
            fetchJson(`/moderation/clear-session`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({username: user.username}),
            })
                .then((_response) => {
                    this.sessionCleared = true;
                })
                .catch((err) => {
                    console.log(err);
                });
        },
        resetPassword(user) {
            fetchJson(`/moderation/reset-password`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({username: user.username}),
            })
                .then((response) => {
                    this.resetUrl = response.resetUrl;
                })
                .catch((err) => {
                    console.log(err);
                });
        }
    },
};
</script>

<style lang="scss">
@import "../css/_globals";


.wgModeration {
    max-width: 1000px;

    .wgDevCard {
        margin: 0 0 16px;
        padding: 16px 18px;
    }

    .wgModSearch {
        display: flex;
        gap: 8px;
        margin: 4px 0 12px;
        max-width: 480px;

        .wgInput {
            flex: 1 1 auto;
            min-width: 0;
        }
    }

    .wgModGrid {
        display: grid;
        gap: 16px 24px;
        grid-template-columns: minmax(200px, 280px) 1fr;

        @media (max-width: $mobile) {
            grid-template-columns: 1fr;
        }
    }

    .lp-moderation-search-results {
        border: 1px solid var(--lp-border);
        border-radius: 10px;
        list-style: none;
        margin: 0;
        max-height: 420px;
        overflow-y: auto;
        padding: 4px;

        li {
            border-radius: 6px;
            cursor: pointer;
            padding: 7px 9px;

            &:hover,
            &.wgActive {
                background: var(--lp-row-hover);
            }
        }
    }

    .wgModUserName {
        font-size: 18px;
        margin: 0 0 8px;
    }

    .wgModActions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin: 0 0 10px;
    }

    .lp-moderation-reset-url code {
        overflow-wrap: anywhere;
    }

    .wgModLibrary summary {
        color: var(--lp-text-secondary);
        cursor: pointer;
        margin: 10px 0 6px;
    }

    .lp-moderation-username,
    .lp-moderation-email {
        display: block;
        overflow-wrap: anywhere;
    }

    .lp-moderation-email {
        color: var(--lp-text-secondary);
        font-size: 0.85em;
    }

    // One line here, where the identity trails a label rather than heading a row.
    .lp-moderation-editing {
        .lp-moderation-username,
        .lp-moderation-email {
            display: inline;
        }

        .lp-moderation-email::before {
            content: " · ";
        }
    }

    .lp-moderation-facts {
        display: flex;
        flex-wrap: wrap;
        gap: 0 2em;
        margin: 0 0 1em;

        dt {
            color: var(--lp-text-secondary);
            font-size: 0.8em;
            text-transform: uppercase;
            letter-spacing: 0.04em;
        }

        dd {
            margin: 0;
        }
    }

    mark {
        background: var(--lp-hover-bg);
        color: inherit;
    }
}

#lp-moderation-user-library-json {
    font: 12px/1.45 $font-mono;
    height: 20em;
    width: 100%;
}
</style>
