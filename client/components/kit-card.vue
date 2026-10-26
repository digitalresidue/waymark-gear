<template>
    <a :href="`/r/${kit.externalId}`" class="wgKitCard" data-testid="kit-card">
        <div class="wgKitCardTop">
            <div class="wgKitCardTitle">
                <h3>{{ kit.name }}</h3>
                <p class="wgMuted">
                    by @{{ kit.username }}<span v-if="kit.featured"> · <span class="wgKitFeatured">Featured</span></span><span v-if="kit.shakedown"> · <span class="wgKitShakedown" data-testid="kit-shakedown">Shakedown requested</span></span><span v-if="tripLabel"> · {{ tripLabel }}</span>
                </p>
            </div>
            <span class="wgKitCardWeight wgMono">{{ baseWeight }}</span>
        </div>
        <div class="wgWeightBar" aria-hidden="true">
            <span v-for="(seg, i) in segments" :key="i" :class="`wgData${i + 1}`" :style="{ width: seg.pct + '%' }" />
        </div>
        <p class="wgKitCardMeta">
            <span>{{ kit.itemCount }} {{ kit.itemCount === 1 ? 'item' : 'items' }}<template v-if="kit.score"> · <span data-testid="kit-score">{{ kit.score > 0 ? '▲' : '▼' }} {{ Math.abs(kit.score) }}</span></template><template v-if="kit.shakedown && kit.commentCount !== undefined"> · {{ kit.commentCount }} {{ kit.commentCount === 1 ? 'suggestion' : 'suggestions' }}</template></span>
            <span>{{ topCategories }}</span>
        </p>
    </a>
</template>

<script>
import { formatWeightMg } from '../utils/format.js';
import { TRIP_TYPE_LABELS } from '../utils/gear-meta.js';

export default {
    name: 'KitCard',
    props: {
        kit: { type: Object, required: true },
    },
    computed: {
        tripLabel() {
            return TRIP_TYPE_LABELS[this.kit.tripType] || '';
        },
        baseWeight() {
            return formatWeightMg(this.kit.baseWeightMg, 'lb');
        },
        sorted() {
            return (this.kit.categories || []).filter((c) => c.weightMg > 0).sort((a, b) => b.weightMg - a.weightMg);
        },
        segments() {
            const total = this.sorted.reduce((sum, c) => sum + c.weightMg, 0) || 1;
            const top = this.sorted.slice(0, 5);
            const rest = this.sorted.slice(5).reduce((sum, c) => sum + c.weightMg, 0);
            const segs = top.map((c) => ({ pct: (c.weightMg / total) * 100 }));
            if (rest) segs.push({ pct: (rest / total) * 100 });
            return segs;
        },
        topCategories() {
            return this.sorted.slice(0, 3).map((c) => c.name).join(' · ');
        },
    },
};
</script>

<style lang="scss">
@import "../css/_globals";

.wgKitCard {
    background: var(--lp-surface);
    border: 1px solid var(--lp-border);
    border-radius: $radius-lg;
    color: var(--lp-text);
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 20px;
    text-decoration: none;
    transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;

    &:hover {
        border-color: var(--lp-border-strong);
        box-shadow: var(--lp-lift-shadow);
        transform: translateY(-1px);
    }

    h3 {
        font-size: 18px;
        font-weight: 700;
        line-height: 1.25;
        margin: 0;
        overflow-wrap: anywhere;
    }

    p {
        margin: 4px 0 0;
    }
}

.wgKitCardTop {
    align-items: flex-start;
    display: flex;
    gap: 12px;
    justify-content: space-between;
}

.wgKitCardTitle {
    min-width: 0;

    .wgMuted {
        font-size: 14px;
    }
}

.wgKitShakedown {
    color: #9A4312;
    font-weight: 600;
}

.wgKitFeatured {
    color: var(--lp-accent);
    font-weight: 600;
}

.wgKitCardWeight {
    font-size: 21px;
    font-weight: 600;
    white-space: nowrap;
}

.wgKitCardMeta {
    color: var(--lp-text-secondary);
    display: flex;
    font-size: 14px;
    gap: 12px;
    justify-content: space-between;
    margin: 0 !important;

    span:last-child {
        overflow: hidden;
        text-align: right;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
}
</style>
