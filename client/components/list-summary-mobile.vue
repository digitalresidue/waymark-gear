<template>
    <div class="lpSummaryMobile" :class="{lpSummaryMobileOpen: expanded}">
        <!-- Collapsed scoreboard (#18a). The numbers people actually check
             stay on screen; the chart is one tap away. -->
        <div class="lpSummaryStrip" data-testid="summary-strip" @click="toggle">
            <span v-if="donutStyle" class="lpSummaryDonut" :style="donutStyle" />
            <span class="lpSummaryStat">
                <span class="lpSummaryStatLabel">Total</span>
                <span class="lpSummaryStatValue lpSummaryStatLead">
                    {{ displayWeight(list.totalWeight, library.totalUnit) }}
                    <span class="lpSummaryStatUnit">{{ library.totalUnit }}</span>
                </span>
            </span>
            <span v-if="hasBreakdown" class="lpSummaryStat">
                <span class="lpSummaryStatLabel">Base</span>
                <span class="lpSummaryStatValue">{{ displayWeight(list.totalBaseWeight, library.totalUnit) }}</span>
            </span>
            <span v-if="list.totalWornWeight" class="lpSummaryStat">
                <span class="lpSummaryStatLabel">Worn</span>
                <span class="lpSummaryStatValue">{{ displayWeight(list.totalWornWeight, library.totalUnit) }}</span>
            </span>
            <span class="lpSummarySpacer" />
            <span class="lpSummaryCaret">{{ expanded ? '▴' : '▾' }}</span>
        </div>

        <!-- Expanded (#11b) — dark to dark, so the strip grows into the panel
             rather than cutting to a different surface. v-show, not v-if: the
             canvas has to stay in the DOM for pies.js to keep drawing to it.
             The height is driven from JS because the panel has no fixed size
             and `auto` isn't animatable. -->
        <transition
            name="lpSummaryPanel"
            @enter="onPanelEnter"
            @after-enter="onPanelSettled"
            @leave="onPanelLeave"
            @after-leave="onPanelSettled"
        >
            <div v-show="expanded" class="lpSummaryPanel" data-testid="summary-panel">
                <div class="lpSummaryChartWrap lpChartContainer">
                    <div ref="stage" class="lpChartStage" data-testid="chart" :data-style="chartStyle" />
                    <div class="wgChartStyles" role="group" aria-label="Chart style">
                        <button
                            v-for="option in chartStyles"
                            :key="option.id"
                            type="button"
                            class="wgChartStyle"
                            :aria-pressed="String(chartStyle === option.id)"
                            :data-testid="`chart-style-${option.id}`"
                            @click="setChartStyle(option.id)"
                        >
                            {{ option.label }}
                        </button>
                    </div>
                </div>

                <ul class="lpSummaryLegend">
                    <template v-for="row in totalRows" :key="row.key">
                        <li v-if="row.group" class="lpSummaryLegendRow wgTotalGroup" data-testid="total-group">
                            <span class="lpSummaryLegendSwatch"><span class="wgTotalGroupSwatch" :style="{ background: row.color }" /></span>
                            <span class="lpSummaryLegendName">{{ row.group.name || 'Group' }}</span>
                            <span v-if="list.optionalFields['price']" class="lpSummaryLegendPrice">{{ displayPrice(row.price, library.currencySymbol) }}</span>
                            <span class="lpSummaryLegendWeight">
                                {{ displayWeight(row.weight, library.totalUnit) }}
                                <span class="lpSummaryLegendUnit">{{ library.totalUnit }}</span>
                            </span>
                        </li>
                        <li v-else class="lpSummaryLegendRow" :class="{ wgTotalInGroup: row.inGroup }">
                            <span class="lpSummaryLegendSwatch">
                                <colorPicker v-if="row.category.displayColor" :color="colorToHex(row.category.displayColor)" @color-change="updateColor(row.category, $event)" />
                            </span>
                            <span class="lpSummaryLegendName">{{ row.category.name }}</span>
                            <span v-if="list.optionalFields['price']" class="lpSummaryLegendPrice">{{ displayPrice(row.category.subtotalPrice, library.currencySymbol) }}</span>
                            <span class="lpSummaryLegendWeight">
                                {{ displayWeight(row.category.subtotalWeight, library.totalUnit) }}
                                <span class="lpSummaryLegendUnit">{{ library.totalUnit }}</span>
                            </span>
                        </li>
                    </template>

                    <li class="lpSummaryLegendRow lpSummaryLegendTotal">
                        <span class="lpSummaryLegendSwatch" />
                        <span class="lpSummaryLegendName">Total</span>
                        <span v-if="list.optionalFields['price']" class="lpSummaryLegendPrice">{{ displayPrice(list.totalPrice, library.currencySymbol) }}</span>
                        <span class="lpSummaryLegendWeight">
                            <span data-testid="total-weight">{{ displayWeight(list.totalWeight, library.totalUnit) }}</span>
                            <!-- The one global unit picker, same as the desktop
                                 summary's Total row. -->
                            <unitSelect class="lpSummaryUnitPicker" :unit="library.totalUnit" :on-change="setTotalUnit" />
                        </span>
                    </li>

                    <li v-if="list.totalConsumableWeight" class="lpSummaryLegendRow lpSummaryLegendMuted">
                        <span class="lpSummaryLegendSwatch" />
                        <span class="lpSummaryLegendName">Consumable</span>
                        <span v-if="list.optionalFields['price']" class="lpSummaryLegendPrice" />
                        <span class="lpSummaryLegendWeight">
                            <span data-testid="consumable-weight">{{ displayWeight(list.totalConsumableWeight, library.totalUnit) }}</span>
                            <span class="lpSummaryLegendUnit">{{ library.totalUnit }}</span>
                        </span>
                    </li>
                    <li v-if="list.totalWornWeight" class="lpSummaryLegendRow lpSummaryLegendMuted">
                        <span class="lpSummaryLegendSwatch" />
                        <span class="lpSummaryLegendName">Worn</span>
                        <span v-if="list.optionalFields['price']" class="lpSummaryLegendPrice" />
                        <span class="lpSummaryLegendWeight">
                            <span data-testid="worn-weight">{{ displayWeight(list.totalWornWeight, library.totalUnit) }}</span>
                            <span class="lpSummaryLegendUnit">{{ library.totalUnit }}</span>
                        </span>
                    </li>
                    <li v-if="hasBreakdown" class="lpSummaryLegendRow lpSummaryLegendMuted">
                        <span class="lpSummaryLegendSwatch" />
                        <span class="lpSummaryLegendName">Base weight</span>
                        <span v-if="list.optionalFields['price']" class="lpSummaryLegendPrice" />
                        <span class="lpSummaryLegendWeight">
                            <span data-testid="base-weight">{{ displayWeight(list.totalBaseWeight, library.totalUnit) }}</span>
                            <span class="lpSummaryLegendUnit">{{ library.totalUnit }}</span>
                        </span>
                    </li>
                    <li v-if="list.optionalFields['packWeight']" class="lpSummaryLegendRow lpSummaryLegendMuted lpTotalPackWeight">
                        <span class="lpSummaryLegendSwatch" />
                        <span class="lpSummaryLegendName">Total pack weight</span>
                        <span v-if="list.optionalFields['price']" class="lpSummaryLegendPrice" />
                        <span class="lpSummaryLegendWeight">
                            <span data-testid="pack-weight">{{ displayWeight(list.totalPackWeight, library.totalUnit) }}</span>
                            <span class="lpSummaryLegendUnit">{{ library.totalUnit }}</span>
                        </span>
                    </li>
                </ul>
            </div>
        </transition>
    </div>
</template>

<script>
import { totalRowsFor } from '../utils/category-groups.js';
import colorPicker from './colorpicker.vue';
import unitSelect from './unit-select.vue';

import { makeChart, CHART_STYLES, chartStyle, rememberStyle } from '../charts.js';
import { chartLineColor, chartHoverColor, onThemeChange } from '../utils/theme.js';
import utilsMixin from '../mixins/utils-mixin.js';
import colorUtils from '../utils/color.js';

export default {
    name: 'ListSummaryMobile',
    components: {
        colorPicker,
        unitSelect,
    },
    mixins: [utilsMixin],
    props: ['list'],
    data() {
        return {
            chart: null,
            expanded: false,
        };
    },
    computed: {
        chartStyles() {
            return CHART_STYLES;
        },
        chartStyle() {
            return chartStyle(this.library.preferences.chartStyle);
        },
        library() {
            return this.$store.state.library;
        },
        categories() {
            return this.list.categoryIds.map(id => this.library.getCategoryById(id));
        },
        totalRows() {
            return totalRowsFor(this.list);
        },
        hasBreakdown() {
            return !!(this.list.totalWornWeight || this.list.totalConsumableWeight);
        },
        // The strip's donut is pure CSS rather than a second canvas — it's
        // 34px of brand, not a chart, and it has to render whether or not the
        // real chart has been drawn yet.
        donutStyle() {
            const weighted = this.categories.filter(category => category.subtotalWeight > 0 && category.displayColor);
            const total = weighted.reduce((sum, category) => sum + category.subtotalWeight, 0);
            if (!total) {
                return null;
            }

            let offset = 0;
            const stops = weighted.map((category) => {
                const from = (offset / total) * 100;
                offset += category.subtotalWeight;
                const to = (offset / total) * 100;
                return `${category.displayColor} ${from.toFixed(2)}% ${to.toFixed(2)}%`;
            });

            // pies.js starts its arcs at angle 0, which on a canvas is 3
            // o'clock; conic-gradient starts at 12. Matching them keeps the
            // strip's donut and the chart it expands into in the same
            // orientation.
            return { background: `conic-gradient(from 90deg, ${stops.join(',')})` };
        },
    },
    watch: {
        '$store.state.library.defaultListId': 'updateChart',
        'list.totalWeight': 'updateChart',
        'list.categoryIds': 'updateChart',
        expanded: 'updateChart',
        chartStyle(style) {
            rememberStyle(style);
            if (this.chart) this.chart.destroy();
            this.chart = null;
            this.updateChart();
        },
    },
    mounted() {
        this.updateChart();
        // The canvas can't follow the palette on its own, so re-hand it the
        // colors when the theme flips. Stored off `data` — it's a handle, not
        // state anything renders from.
        this.stopThemeWatch = onThemeChange(() => this.recolorChart());
    },
    beforeUnmount() {
        if (this.stopThemeWatch) this.stopThemeWatch();
    },
    methods: {
        recolorChart() {
            if (!this.chart) return;
            this.chart.update({ lineColor: chartLineColor(), hoverColor: chartHoverColor() });
        },
        toggle() {
            this.expanded = !this.expanded;
        },
        // The panel has no fixed height and `auto` can't be transitioned, so
        // the height is measured and driven here.
        onPanelEnter(el) {
            const target = el.scrollHeight;
            el.style.height = '0px';
            // Reading it back flushes the 0 before the target is set, so the
            // browser has a start value to animate from instead of collapsing
            // both writes into one computed style.
            const _reflow = el.offsetHeight;
            el.style.height = `${target}px`;
        },
        onPanelLeave(el) {
            el.style.height = `${el.scrollHeight}px`;
            const _reflow = el.offsetHeight;
            el.style.height = '0px';
        },
        // Back to auto, so the panel still grows if its contents change while
        // it's open (renaming a category, switching units).
        onPanelSettled(el) {
            el.style.height = '';
        },
        updateChart(type) {
            const chartData = this.library.renderChart(typeof type === 'string' ? type : undefined);

            if (chartData && this.$refs.stage) {
                if (this.chart && this.chart.style === this.chartStyle) {
                    this.chart.update({ processedData: chartData });
                } else {
                    if (this.chart) this.chart.destroy();
                    this.chart = makeChart(this.chartStyle, {
                        processedData: chartData,
                        stage: this.$refs.stage,
                        lineColor: chartLineColor(),
                        hoverColor: chartHoverColor(),
                    });
                }
            }
            return chartData;
        },
        setChartStyle(style) {
            this.$store.commit('setPreference', { preference: 'chartStyle', value: style });
        },
        setTotalUnit(unit) {
            this.$store.commit('setTotalUnit', unit);
        },
        updateColor(category, color) {
            category.color = colorUtils.hexToRgb(color);
            category.displayColor = colorUtils.rgbToString(colorUtils.hexToRgb(color));
            this.$store.commit('updateCategoryColor', category);
            this.updateChart();
        },
        colorToHex(color) {
            return colorUtils.rgbToHex(colorUtils.stringToRgb(color));
        },
    },
};
</script>

<style lang="scss">
@import "../css/_globals";

// ============================================================
// The phone summary (#18a collapsed, #11b expanded)
//
// Rendered instead of list-summary.vue below $mobile — see
// client/utils/viewport.js. The desktop summary is a permanent donut-and-table
// pair; this one is a scoreboard that expands, which is a different component
// rather than a reflow because the collapsed strip has no desktop counterpart.
//
// Both states sit on the sidebar's dark surface so the strip grows into the
// panel instead of cutting between surfaces.
// ============================================================
.lpSummaryMobile {
    background: var(--lp-sidebar-inset);
    color: var(--lp-sidebar-text);
}

.lpSummaryStrip {
    align-items: center;
    cursor: pointer;
    display: flex;
    gap: 14px;
    padding: 9px 14px 11px;
}

.lpSummaryDonut {
    border-radius: 50%;
    flex: 0 0 auto;
    height: 34px;
    // Punches the hole. Two stops rather than one so the inner edge doesn't
    // alias into a grey ring.
    -webkit-mask: radial-gradient(circle, transparent 32%, #000 33%);
    mask: radial-gradient(circle, transparent 32%, #000 33%);
    width: 34px;
}

.lpSummaryStat {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    gap: 1px;
}

.lpSummaryStatLabel {
    color: var(--lp-sidebar-muted);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.09em;
    text-transform: uppercase;
}

.lpSummaryStatValue {
    color: var(--lp-sidebar-text);
    font-size: 13.5px;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
}

.lpSummaryStatLead {
    color: var(--lp-sidebar-text);
    font-size: 15px;
    font-weight: 700;
}

.lpSummaryStatUnit {
    color: var(--lp-sidebar-muted);
    font-size: 10.5px;
    font-weight: 400;
}

.lpSummarySpacer {
    flex: 1 1 auto;
}

.lpSummaryCaret {
    color: var(--lp-sidebar-muted);
    flex: 0 0 auto;
    font-size: 11px;
}

// Height is set inline by the transition hooks; overflow keeps the contents
// clipped while it runs. box-sizing is border-box app-wide, so a height of 0
// collapses the padding with it rather than leaving a 14px stub.
.lpSummaryPanel {
    overflow: hidden;
    padding: 0 16px 14px;
    transition: height $transitionDuration;
}

.lpSummaryChartWrap {
    height: 190px;
    margin: 4px auto 12px;
    position: relative;
    width: 190px;

    // The canvas is drawn at 260px; scaling it down here keeps it crisp and
    // avoids re-plumbing pies.js for a second size.
    .lpChart {
        display: block;
        height: 190px;
        width: 190px;
    }
}

.lpSummaryLegend {
    font-size: 12.5px;
    font-variant-numeric: tabular-nums;
    margin: 0;
    padding: 0;
}

.lpSummaryLegendRow {
    align-items: center;
    display: flex;
    gap: 8px;
    list-style: none;
    padding: 4px 0;
}

.lpSummaryLegendSwatch {
    flex: 0 0 12px;
    line-height: 0;

    .lpLegend {
        height: 12px;
        width: 12px;
    }
}

.lpSummaryLegendName {
    color: var(--lp-sidebar-text);
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.lpSummaryLegendPrice {
    color: var(--lp-sidebar-muted);
    flex: 0 0 auto;
}

.lpSummaryLegendWeight {
    align-items: baseline;
    color: var(--lp-sidebar-text);
    display: flex;
    flex: 0 0 auto;
    gap: 4px;
    justify-content: flex-end;
    min-width: 76px;
}

.lpSummaryLegendUnit {
    color: var(--lp-sidebar-muted);
    font-size: 10px;
}

.lpSummaryLegendTotal {
    border-top: 1px solid var(--lp-sidebar-border);
    font-weight: 700;
    margin-top: 5px;
    padding-top: 6px;

    .lpSummaryLegendName,
    .lpSummaryLegendWeight {
        color: var(--lp-sidebar-text);
    }

    .lpSummaryLegendPrice {
        font-weight: 400;
    }
}

.lpSummaryLegendMuted {
    padding: 2px 0;

    .lpSummaryLegendName {
        color: var(--lp-sidebar-muted);
    }
}

// The picker sits on the dark panel, so it can't inherit the light-surface
// styling the desktop summary gives it.
.lpSummaryUnitPicker.lpUnitSelect {
    background: transparent;
    border: none;
    border-bottom: 1px dotted var(--lp-sidebar-handle);
    border-radius: 0;
    color: var(--lp-sidebar-text);
    font-weight: 400;
    padding: 0 1px;

    .lpDisplay {
        font-size: 10px;
        width: auto;
    }

    &:hover,
    &.lpHover {
        background: transparent;
        border-color: transparent;
        border-bottom: 1px dotted var(--lp-sidebar-muted);
    }
}
</style>
