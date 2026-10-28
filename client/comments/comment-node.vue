<template>
    <li :id="`comment-${comment.id}`" class="wgComment" data-testid="comment">
        <div class="wgCommentCard" :class="{ wgCommentHighlight: highlight === comment.id }">
            <p v-if="comment.removed" class="wgCommentBody wgCommentGone">
                This comment was deleted.
            </p>
            <template v-else>
                <div class="wgCommentHead">
                    <span class="wgCommentAvatar" aria-hidden="true">
                        <img v-if="comment.author.avatarUrl" :src="comment.author.avatarUrl" alt="">
                        <template v-else>{{ initial }}</template>
                    </span>
                    <a :href="`/@${comment.author.username}`">{{ comment.author.displayName || `@${comment.author.username}` }}</a>
                    <span v-if="comment.author.isListOwner" class="wgCommentTag">Author</span>
                    <span v-if="comment.kind === 'suggestion'" class="wgCommentTag wgCommentTagSuggest" data-testid="comment-suggestion">
                        Suggestion{{ comment.itemName ? `: ${comment.itemName}` : '' }}
                    </span>
                    <span v-if="comment.hidden" class="wgCommentTag">Hidden by a moderator</span>
                    <time class="wgThreadMuted" :datetime="comment.createdAt" :title="new Date(comment.createdAt).toLocaleString()">{{ ago }}{{ comment.editedAt ? ' · edited' : '' }}</time>
                </div>
                <form v-if="editing" class="wgCommentReply" @submit.prevent="saveEdit">
                    <textarea v-model="editText" class="wgThreadInput" rows="3" maxlength="2000" aria-label="Edit comment" />
                    <div class="wgComposerActions">
                        <span />
                        <span>
                            <button type="button" class="wgThreadBtn" @click="editing = false">Cancel</button>
                            <button type="submit" class="wgThreadBtn wgThreadBtnPrimary" :disabled="!editText.trim()">Save</button>
                        </span>
                    </div>
                </form>
                <p v-else-if="comment.body" class="wgCommentBody" data-testid="comment-text">
                    {{ comment.body }}
                </p>
                <p v-else class="wgCommentBody wgCommentGone">
                    Hidden by a moderator.
                </p>
                <div class="wgCommentActions">
                    <button v-if="viewer" type="button" class="wgThreadBtn" data-testid="comment-reply" @click="replying = !replying">
                        Reply
                    </button>
                    <button v-if="comment.canEdit" type="button" class="wgThreadBtn" @click="startEdit">
                        Edit
                    </button>
                    <button v-if="comment.canDelete" type="button" class="wgThreadBtn" data-testid="comment-delete" @click="$emit('remove', comment)">
                        Delete
                    </button>
                    <button v-if="comment.canReport && !comment.reported" type="button" class="wgThreadBtn" data-testid="comment-report" @click="reporting = !reporting">
                        Report
                    </button>
                    <span v-if="comment.reported" class="wgThreadMuted" data-testid="comment-reported">Reported. Thanks.</span>
                    <button v-if="comment.canModerate" type="button" class="wgThreadBtn" @click="$emit('moderate', comment, comment.hidden ? 'restore' : 'hide')">
                        {{ comment.hidden ? 'Restore' : 'Hide' }}
                    </button>
                </div>
                <form v-if="reporting" class="wgCommentReply wgCommentReport" data-testid="report-form" @submit.prevent="report">
                    <label class="wgThreadMuted" :for="`wgReport${comment.id}`">What's wrong with it?</label>
                    <select :id="`wgReport${comment.id}`" v-model="reportReason" class="wgThreadSelect" data-testid="report-reason">
                        <option value="Spam">
                            Spam or advertising
                        </option>
                        <option value="Rude or abusive">
                            Rude or abusive
                        </option>
                        <option value="Off topic">
                            Off topic
                        </option>
                        <option value="Other">
                            Something else
                        </option>
                    </select>
                    <button type="submit" class="wgThreadBtn wgThreadBtnPrimary" data-testid="report-submit">
                        Report
                    </button>
                    <button type="button" class="wgThreadBtn" @click="reporting = false">
                        Cancel
                    </button>
                </form>
            </template>
            <form v-if="replying" class="wgCommentReply" data-testid="reply-form" @submit.prevent="sendReply">
                <textarea v-model="replyText" class="wgThreadInput" rows="2" maxlength="2000" :aria-label="`Reply to ${comment.author ? comment.author.username : 'comment'}`" data-testid="reply-body" />
                <div class="wgComposerActions">
                    <span />
                    <span>
                        <button type="button" class="wgThreadBtn" @click="replying = false">Cancel</button>
                        <button type="submit" class="wgThreadBtn wgThreadBtnPrimary" :disabled="!replyText.trim()" data-testid="reply-submit">Reply</button>
                    </span>
                </div>
            </form>
        </div>
        <ol v-if="children.length" class="wgThreadReplies">
            <commentNode
                v-for="c in children"
                :key="c.id"
                :comment="c"
                :children-of="childrenOf"
                :viewer="viewer"
                :highlight="highlight"
                @reply="(...a) => $emit('reply', ...a)"
                @edit="(...a) => $emit('edit', ...a)"
                @remove="(...a) => $emit('remove', ...a)"
                @report="(...a) => $emit('report', ...a)"
                @moderate="(...a) => $emit('moderate', ...a)"
            />
        </ol>
    </li>
</template>

<script>
export default {
    name: 'CommentNode',
    props: {
        comment: { type: Object, required: true },
        childrenOf: { type: Object, required: true },
        viewer: { type: Object, default: null },
        highlight: { type: Number, default: 0 },
    },
    emits: ['reply', 'edit', 'remove', 'report', 'moderate'],
    data() {
        return { replying: false, replyText: '', editing: false, editText: '', reporting: false, reportReason: 'Spam' };
    },
    computed: {
        children() {
            return this.childrenOf[this.comment.id] || [];
        },
        initial() {
            const a = this.comment.author;
            return ((a && (a.displayName || a.username)) || '?').trim().charAt(0).toUpperCase();
        },
        ago() {
            const s = Math.max(0, (Date.now() - new Date(this.comment.createdAt).getTime()) / 1000);
            if (s < 60) return 'just now';
            if (s < 3600) return `${Math.floor(s / 60)}m ago`;
            if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
            if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
            return new Date(this.comment.createdAt).toLocaleDateString();
        },
    },
    methods: {
        async sendReply() {
            const reply = { body: this.replyText };
            // The parent re-emits up to the thread, which posts it.
            this.$emit('reply', this.comment.id, reply);
            this.replyText = '';
            this.replying = false;
        },
        startEdit() {
            this.editText = this.comment.body;
            this.editing = true;
        },
        saveEdit() {
            this.$emit('edit', this.comment, this.editText);
            this.editing = false;
        },
        report() {
            this.$emit('report', this.comment, this.reportReason);
            this.reporting = false;
        },
    },
};
</script>
