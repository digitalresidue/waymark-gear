<template>
    <div class="wgThread" data-testid="comments">
        <p v-if="error" class="wgThreadError" role="alert">
            {{ error }}
        </p>
        <template v-if="loaded">
            <p v-if="shakedown" class="wgThreadIntro">
                @{{ owner }} asked for a shakedown. Pick an item and suggest a swap, a cut, or something they've missed.
            </p>

            <form v-if="viewer" class="wgComposer" data-testid="comment-form" @submit.prevent="post(null)">
                <div v-if="shakedown && !viewer.isOwner" class="wgComposerKind">
                    <label><input v-model="draft.kind" type="radio" value="suggestion" data-testid="comment-kind-suggestion"> Suggestion</label>
                    <label><input v-model="draft.kind" type="radio" value="comment"> Comment</label>
                    <select v-if="draft.kind === 'suggestion'" v-model="draft.itemName" class="wgThreadSelect" aria-label="Which item?" data-testid="comment-item">
                        <option value="">
                            The whole list
                        </option>
                        <option v-for="name in itemNames" :key="name" :value="name">
                            {{ name }}
                        </option>
                    </select>
                </div>
                <label class="wgVisuallyHidden" for="wgCommentBody">Your comment</label>
                <textarea
                    id="wgCommentBody"
                    v-model="draft.body"
                    class="wgThreadInput"
                    rows="3"
                    :maxlength="max"
                    :placeholder="draft.kind === 'suggestion' ? 'e.g. Swap the canister stove for a Soto Windmaster and save 3 oz.' : 'Say something helpful…'"
                    data-testid="comment-body"
                />
                <div class="wgComposerActions">
                    <span class="wgThreadMuted">Posting as @{{ viewer.username }}</span>
                    <button type="submit" class="wgThreadBtn wgThreadBtnPrimary" :disabled="busy || !draft.body.trim()" data-testid="comment-submit">
                        {{ draft.kind === 'suggestion' ? 'Suggest' : 'Post' }}
                    </button>
                </div>
            </form>
            <p v-else class="wgThreadSignin" data-testid="comment-signin">
                <a href="/signin">Sign in</a> or <a href="/register">create an account</a> to join the conversation.
            </p>

            <p v-if="!comments.length" class="wgThreadMuted wgThreadEmpty">
                No comments yet.
            </p>
            <ol class="wgThreadList">
                <commentNode
                    v-for="c in roots"
                    :key="c.id"
                    :comment="c"
                    :children-of="childrenOf"
                    :viewer="viewer"
                    :highlight="highlight"
                    @reply="post"
                    @edit="edit"
                    @remove="remove"
                    @report="report"
                    @moderate="moderate"
                />
            </ol>
        </template>
        <p v-else-if="!error" class="wgThreadMuted">
            Loading comments…
        </p>
    </div>
</template>

<script>
import commentNode from './comment-node.vue';

async function request(url, options = {}) {
    const res = await fetch(url, {
        credentials: 'same-origin',
        ...options,
        headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || 'Something went wrong. Try again.');
    return body;
}

export default {
    name: 'CommentThread',
    components: { commentNode },
    props: {
        externalId: { type: String, required: true },
    },
    data() {
        return {
            loaded: false,
            error: '',
            busy: false,
            comments: [],
            viewer: null,
            owner: '',
            shakedown: false,
            highlight: 0,
            max: 2000,
            draft: { body: '', kind: 'comment', itemName: '' },
            itemNames: [],
        };
    },
    computed: {
        roots() {
            return this.comments.filter((c) => c.parentId === null);
        },
        childrenOf() {
            const map = {};
            for (const c of this.comments) {
                if (c.parentId !== null) (map[c.parentId] = map[c.parentId] || []).push(c);
            }
            return map;
        },
    },
    async mounted() {
        // The list on this page, for "which item is this about?".
        this.itemNames = [...new Set([...document.querySelectorAll('.lpItem .lpName')]
            .map((el) => el.textContent.trim()).filter(Boolean))].slice(0, 300);
        try {
            const data = await request(`/api/kits/${encodeURIComponent(this.externalId)}/comments`);
            this.comments = data.comments;
            this.viewer = data.viewer;
            this.owner = data.owner;
            this.shakedown = data.shakedown;
            if (this.shakedown && this.viewer && !this.viewer.isOwner) this.draft.kind = 'suggestion';
            this.loaded = true;
            const m = location.hash.match(/^#comment-(\d+)$/);
            if (m) {
                this.highlight = Number(m[1]);
                this.$nextTick(() => {
                    const el = document.getElementById(`comment-${m[1]}`);
                    if (el) el.scrollIntoView({ block: 'center' });
                });
            }
        } catch (err) {
            this.error = err.message;
        }
    },
    methods: {
        async post(parentId, reply) {
            const payload = reply || this.draft;
            if (!payload.body.trim() || this.busy) return false;
            this.busy = true;
            this.error = '';
            try {
                const comment = await request(`/api/kits/${encodeURIComponent(this.externalId)}/comments`, {
                    method: 'POST',
                    body: JSON.stringify({ body: payload.body, parentId, kind: reply ? 'comment' : payload.kind, itemName: reply ? '' : payload.itemName }),
                });
                this.comments.push(comment);
                this.highlight = comment.id;
                if (!reply) this.draft = { body: '', kind: this.draft.kind, itemName: '' };
                return true;
            } catch (err) {
                this.error = err.message;
                return false;
            } finally {
                this.busy = false;
            }
        },
        async edit(comment, body) {
            try {
                await request(`/api/comments/${comment.id}`, { method: 'PATCH', body: JSON.stringify({ body }) });
                comment.body = body.trim();
                comment.editedAt = new Date().toISOString();
            } catch (err) {
                this.error = err.message;
            }
        },
        async remove(comment) {
            if (!window.confirm('Delete this comment?')) return;
            try {
                await request(`/api/comments/${comment.id}`, { method: 'DELETE' });
                comment.removed = true;
                comment.body = '';
                comment.author = null;
                comment.canDelete = false;
                comment.canEdit = false;
                comment.canReport = false;
            } catch (err) {
                this.error = err.message;
            }
        },
        async report(comment, reason) {
            try {
                await request(`/api/comments/${comment.id}/report`, { method: 'POST', body: JSON.stringify({ reason }) });
                comment.reported = true;
            } catch (err) {
                this.error = err.message;
            }
        },
        async moderate(comment, action) {
            try {
                await request(`/api/moderation/comments/${comment.id}`, { method: 'POST', body: JSON.stringify({ action }) });
                comment.hidden = action === 'hide';
            } catch (err) {
                this.error = err.message;
            }
        },
    },
};
</script>

<style lang="scss">
.wgComments {
    border-top: 1px solid var(--lp-border);
    clear: both;
    margin: 32px 0 0;
    max-width: 760px;
    padding-top: 20px;

    h2 {
        font-size: 20px;
        margin: 0 0 12px;
    }
}

.wgThreadIntro,
.wgThreadSignin {
    margin: 0 0 14px;
}

.wgThreadMuted {
    color: var(--lp-text-secondary);
    font-size: 13px;
}

.wgThreadEmpty {
    margin: 16px 0;
}

.wgThreadError {
    background: #FBE9E4;
    border-radius: 8px;
    color: #8A2A12;
    margin: 0 0 12px;
    padding: 8px 12px;
}

.wgComposer {
    background: var(--lp-surface);
    border: 1px solid var(--lp-border);
    border-radius: 14px;
    margin-bottom: 18px;
    padding: 12px;
}

.wgComposerKind {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    font-size: 14px;
    gap: 6px 14px;
    margin-bottom: 8px;

    label {
        align-items: center;
        display: inline-flex;
        gap: 5px;
    }
}

.wgThreadSelect {
    background: var(--lp-surface);
    border: 1px solid var(--lp-border);
    border-radius: 8px;
    color: var(--lp-text);
    font: inherit;
    max-width: 100%;
    padding: 5px 8px;
}

.wgThreadInput {
    background: var(--lp-surface);
    border: 1px solid var(--lp-border);
    border-radius: 10px;
    box-sizing: border-box;
    color: var(--lp-text);
    font: inherit;
    padding: 10px 12px;
    resize: vertical;
    width: 100%;

    &:focus {
        border-color: var(--lp-primary);
        outline: 2px solid color-mix(in srgb, var(--lp-primary) 30%, transparent);
    }
}

.wgComposerActions {
    align-items: center;
    display: flex;
    gap: 10px;
    justify-content: space-between;
    margin-top: 8px;
}

.wgThreadBtn {
    background: transparent;
    border: 0;
    border-radius: 999px;
    color: var(--lp-link-blue, var(--lp-primary));
    cursor: pointer;
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    min-height: 32px;
    padding: 4px 10px;

    &:disabled {
        cursor: default;
        opacity: 0.5;
    }
}

.wgThreadBtnPrimary {
    background: var(--lp-primary);
    color: #fff;
    font-size: 14px;
    min-height: 38px;
    padding: 6px 18px;
}

.wgThreadList,
.wgThreadReplies {
    list-style: none;
    margin: 0;
    padding: 0;
}

.wgThreadReplies {
    border-left: 2px solid var(--lp-border);
    margin-left: 18px;
    padding-left: 14px;
}

.wgComment {
    margin: 0 0 14px;
}

.wgCommentCard {
    border-radius: 12px;
    padding: 8px 10px;
    transition: background-color 0.6s;

    &.wgCommentHighlight {
        background: var(--lp-active-bg, rgba(29, 59, 48, 0.08));
    }
}

.wgCommentHead {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    font-size: 13px;
    gap: 4px 8px;

    a {
        color: var(--lp-text);
        font-weight: 700;
        text-decoration: none;
    }
}

.wgCommentAvatar {
    align-items: center;
    background: var(--lp-primary);
    border-radius: 50%;
    color: #fff;
    display: inline-flex;
    font-size: 12px;
    font-weight: 800;
    height: 26px;
    justify-content: center;
    overflow: hidden;
    width: 26px;

    img {
        height: 100%;
        object-fit: cover;
        width: 100%;
    }
}

.wgCommentTag {
    background: var(--lp-surface-sunken);
    border-radius: 6px;
    color: var(--lp-text-secondary);
    font-size: 11px;
    font-weight: 700;
    padding: 2px 6px;
}

.wgCommentTagSuggest {
    background: #FCEFD9;
    color: #5A3B06;
}

.wgCommentBody {
    margin: 6px 0 2px 34px;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
}

.wgCommentGone {
    color: var(--lp-text-secondary);
    font-style: italic;
}

.wgCommentActions {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    margin-left: 26px;
}

.wgCommentReply {
    margin: 6px 0 0 34px;
}

.wgCommentReport {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}
</style>
