<template>
    <modal id="speedbump" :shown="shown" @hide="$emit('hide')">
        <h2 v-if="messages.title">
            {{ messages.title }}
        </h2>

        <p>{{ messages.body }}</p>

        <div class="buttons wgSpeedbumpButtons">
            <!-- Optional gentler choice, offered first (e.g. Retire before Delete). -->
            <button v-if="messages.alternate" v-focus-on-create class="wgBtn wgBtnPrimary" data-testid="speedbump-alternate" @click="chooseAlternate()">
                {{ messages.alternate.label }}
            </button>
            <button v-focus-on-create="!messages.alternate" class="lpButton" :class="{ wgDangerAction: messages.alternate }" data-testid="speedbump-confirm" @click="confirmSpeedbump()">
                {{ messages.confirm }}
            </button>
            <button class="wgBtn" data-testid="speedbump-cancel" @click="$emit('hide')">
                {{ messages.cancel }}
            </button>
        </div>
    </modal>
</template>

<script>
import modal from './modal.vue';

const defaultMessages = {
    title: '',
    body: '',
    confirm: 'Yes',
    cancel: 'No',
};

export default {
    name: 'Speedbump',
    components: {
        modal,
    },
    props: {
        shown: {
            type: Boolean,
            required: true,
        },
        speedbumpCallback: {
            type: Function,
            default: null,
        },
        speedbumpOptions: {
            type: [Object, String],
            default: null,
        },
    },
    emits: ['hide'],
    computed: {
        messages() {
            const msgs = Object.assign({}, defaultMessages);
            if (!this.speedbumpOptions) return msgs;
            if (typeof this.speedbumpOptions === 'string') {
                msgs.body = this.speedbumpOptions;
            } else {
                Object.assign(msgs, this.speedbumpOptions);
            }
            return msgs;
        },
    },
    methods: {
        chooseAlternate() {
            this.messages.alternate.callback();
            this.$emit('hide');
        },
        confirmSpeedbump() {
            if (this.speedbumpCallback && typeof this.speedbumpCallback === 'function') {
                this.speedbumpCallback(true);
            }
            this.$emit('hide');
        },
    },
};
</script>

<style lang="scss">
.wgSpeedbumpButtons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.lp .wgDangerAction {
    background: transparent;
    border: 1px solid var(--lp-danger);
    color: var(--lp-danger);
}


</style>
