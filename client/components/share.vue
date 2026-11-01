<template>
    <span v-if="isSignedIn" class="headerItem hasPopover" :class="{ wgRailTool: rail }">
        <PopoverHover id="share" @shown="focusShare">
            <template #target>
                <span v-if="rail" class="wgRailBtn" title="Share this list"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></svg><span class="wgRailLabel">Share</span></span>
                <span v-else><i class="lpSprite lpLink" /> Share</span>
            </template>
            <template #content>
                <div class="lpFields">
                    <div class="lpField">
                        <label for="lpListUrl">Share your list</label>
                        <input id="lpListUrl" ref="shareInput" v-select-on-focus type="text" :value="shareUrl">
                    </div>
                    <div class="lpField">
                        <label for="embedUrl">Embed your list</label>
                        <textarea id="embedUrl" v-select-on-focus :value="embedCode" readonly />
                    </div>
                    <a id="csvUrl" :href="csvUrl" target="_blank" class="lpHref"><i class="lpSprite lpSpriteDownload" />Export to CSV</a>
                    <div class="wgPublish">
                        <toggle
                            :model-value="!!list.published"
                            :disabled="!externalId"
                            data-testid="publish-toggle"
                            @update:model-value="setPublished"
                        >
                            Publish to Explore
                        </toggle>
                        <p class="wgPublishNote">
                            {{ list.published
                                ? 'Listed on Explore and eligible for the homepage. Anyone can find it.'
                                : 'Only people with the link can see it. Publish to show it on Explore.' }}
                        </p>
                    </div>
                    <div v-if="list.published" class="wgPublish">
                        <toggle
                            :model-value="!!list.shakedown"
                            data-testid="shakedown-toggle"
                            @update:model-value="setShakedown"
                        >
                            Request a shakedown
                        </toggle>
                        <p class="wgPublishNote">
                            {{ list.shakedown
                                ? 'Asking for suggestions: your list is flagged on Explore and readers are invited to suggest swaps and cuts.'
                                : 'Ask other hikers what to cut, swap or rethink. Suggestions arrive as comments.' }}
                        </p>
                    </div>
                    <div v-if="list.published && board" class="wgPublish wgBoardStatus" data-testid="board-status">
                        <p class="wgPublishNote">
                            <strong>Lightest board:</strong> {{ boardLine }}
                        </p>
                        <button
                            v-if="board.reason !== 'gear-check'"
                            type="button"
                            class="wgBtn wgBtnGhost wgBtnSmall"
                            data-testid="still-carrying"
                            :disabled="confirming"
                            @click="stillCarrying"
                        >
                            Still carrying this
                        </button>
                    </div>
                </div>
            </template>
        </PopoverHover>
    </span>
</template>

<script>
import PopoverHover from './popover-hover.vue';
import toggle from './toggle.vue';
import { fetchJson } from '../utils/utils.js';
import { updatedAgo } from '../utils/board-rules.js';

export default {
    name: 'Share',
    components: {
        PopoverHover,
        toggle,
    },
    props: {
        // Drawn as a button in the editor's icon rail (desktop).
        rail: { type: Boolean, default: false },
    },
    data() {
        return { board: null, confirming: false };
    },
    computed: {
        // Where this list stands on the Lightest board, in a sentence.
        boardLine() {
            const b = this.board;
            if (!b) return '';
            if (b.reason === 'gear-check') return `not listed yet. Lists need a Gear check of ${b.rules.minReadiness} or more, and overnight lists need a shelter and a sleep system.`;
            if (b.reason === 'stale') return 'off the board after a year without gear changes. Tap below if you still carry it.';
            if (b.reason === 'downvoted') return 'off the board for now after too many downvotes.';
            const when = `Updated ${updatedAgo(b.freshAt)}`;
            return b.padPct > 0
                ? `listed, sliding: ranks as ${b.padPct}% heavier. ${when}.`
                : `listed. ${when}; it starts to slide after ${b.rules.graceDays / 30} months without changes.`;
        },
        library() {
            return this.$store.state.library;
        },
        list() {
            return this.library.getListById(this.library.defaultListId);
        },
        isSignedIn() {
            return this.$store.state.loggedIn;
        },
        externalId() {
            return this.list.externalId || '';
        },
        baseUrl() {
            const location = window.location;
            return location.origin ? location.origin : `${location.protocol}//${location.hostname}`;
        },
        shareUrl() {
            if (this.externalId) {
                return `${this.baseUrl}/r/${this.externalId}`;
            }
            return '';
        },
        csvUrl() {
            if (this.externalId) {
                return `${this.baseUrl}/csv/${this.externalId}`;
            }
            return '';
        },
        embedCode() {
            return `<script src="${this.baseUrl}/e/${this.externalId}"></` + `script><div id="${this.externalId}"></div>`;
            // Note: split to avoid prematurely closing the script tag
        },
    },
    methods: {
        setShakedown(shakedown) {
            this.$store.commit('setListShakedown', { list: this.list, shakedown });
        },
        loadBoard() {
            this.board = null;
            if (!this.list.published || !this.externalId) return;
            fetchJson(`/api/kits/${encodeURIComponent(this.externalId)}/board`, { credentials: 'same-origin' })
                .then((b) => { this.board = b; })
                .catch(() => {});
        },
        stillCarrying() {
            this.confirming = true;
            fetchJson(`/api/kits/${encodeURIComponent(this.externalId)}/still-carrying`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: '{}',
            })
                .then((b) => { this.board = b; })
                .catch(() => {})
                .finally(() => { this.confirming = false; });
        },
        setPublished(published) {
            this.$store.commit('setListPublished', { list: this.list, published });
        },
        focusShare(_evt) {
            this.loadBoard();
            const selectShareInput = () => {
                this.$nextTick(() => {
                    if (this.$refs.shareInput) this.$refs.shareInput.select();
                });
            };
            if (!this.list.externalId) {
                return fetchJson('/externalId', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    credentials: 'same-origin',
                })
                    .then((response) => {
                        this.$store.commit('setExternalId', { externalId: response.externalId, list: this.list });
                        selectShareInput();
                    })
                    .catch((_response) => {
                        alert('An error occurred while attempting to get an ID for your list. Please try again later.'); // TODO
                    });
            }
            selectShareInput();
        },
    },
};
</script>

<style lang="scss">
.wgPublish {
    border-top: 1px solid var(--lp-border);
    margin-top: 12px;
    padding-top: 12px;
}

.wgPublishNote {
    color: var(--lp-text-secondary);
    font-size: 12.5px;
    line-height: 1.45;
    margin: 6px 0 0;
    max-width: 280px;
    // The popover itself is nowrap (one-line menus); these notes are prose.
    white-space: normal;
}

#share label {
    font-weight: bold;
}
</style>
