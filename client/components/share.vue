<template>
    <span v-if="isSignedIn" class="headerItem hasPopover">
        <PopoverHover id="share" @shown="focusShare">
            <template #target><span><i class="lpSprite lpLink" /> Share</span></template>
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
                </div>
            </template>
        </PopoverHover>
    </span>
</template>

<script>
import PopoverHover from './popover-hover.vue';
import toggle from './toggle.vue';
import { fetchJson } from '../utils/utils.js';

export default {
    name: 'Share',
    components: {
        PopoverHover,
        toggle,
    },
    computed: {
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
        setPublished(published) {
            this.$store.commit('setListPublished', { list: this.list, published });
        },
        focusShare(_evt) {
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
