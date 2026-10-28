// The weight chart, in the style the viewer picked. One entry point for the
// list editor (list-summary*.vue) and shared lists (share-entry.js):
//
//   const chart = makeChart(style, { stage, processedData, hoverCallback, lineColor, hoverColor });
//   chart.update({ processedData }) / chart.update({ lineColor, hoverColor });
//   chart.destroy();
//
// `processedData` is List.renderChart(): categories, each with its items.
// Every style highlights the hovered category in the legend (hoverCallback)
// and opens a category to show its items on click.
//
// The choice is a viewer preference: library.preferences.chartStyle in the
// app (follows the account), mirrored to localStorage so shared lists (on
// the same site, signed in or not) draw the same way.

import pies from './pies.js';
import colorUtils from './utils/color.js';

export const CHART_STYLES = [
    { id: 'donut', label: 'Donut' },
    { id: 'bars', label: 'Bars' },
    { id: 'treemap', label: 'Treemap' },
];

export const STYLE_KEY = 'wgChartStyle';

export function chartStyle(value) {
    return CHART_STYLES.some((s) => s.id === value) ? value : 'donut';
}

export function rememberStyle(style) {
    try {
        localStorage.setItem(STYLE_KEY, chartStyle(style));
    } catch {
        // Storage blocked: it just won't carry over to shared lists.
    }
}

export function rememberedStyle() {
    try {
        const v = localStorage.getItem(STYLE_KEY);
        return v ? chartStyle(v) : null;
    } catch {
        return null;
    }
}

// "Shelter: 1.56 lb" -> "Shelter"
const shortName = (point) => String(point.name || '').replace(/: [^:]*$/, '');
const amount = (point) => (point.points ? point.total : point.value) || 0;
const colorOf = (point, index, parentColor) => {
    if (point.displayColor) return point.displayColor;
    const c = point.color || colorUtils.getColor(index, parentColor);
    return typeof c === 'string' ? c : colorUtils.rgbToString(c);
};

// White or dark ink for text on a tile, whichever reads better on its color.
export function inkFor(color) {
    const m = String(color).match(/(\d+)\D+(\d+)\D+(\d+)/);
    if (!m) return '#fff';
    const [r, g, b] = m.slice(1, 4).map((v) => {
        const c = Number(v) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luminance > 0.4 ? '#15211b' : '#fff';
}

// Squarified treemap (Bruls, Huizing, van Wijk): rows of rectangles kept as
// close to square as the space allows. items: [{ area }], largest first.
export function squarify(items, rect) {
    const out = [];
    let { x, y, w, h } = rect;
    const worst = (row, side) => {
        const s = row.reduce((n, r) => n + r.area, 0);
        const max = Math.max(...row.map((r) => r.area));
        const min = Math.min(...row.map((r) => r.area));
        return Math.max((side * side * max) / (s * s), (s * s) / (side * side * min));
    };
    const place = (row) => {
        const s = row.reduce((n, r) => n + r.area, 0);
        if (w >= h) {
            const width = s / h;
            let cy = y;
            for (const r of row) {
                const height = r.area / width;
                out.push({ ...r, x, y: cy, w: width, h: height });
                cy += height;
            }
            x += width;
            w -= width;
        } else {
            const height = s / w;
            let cx = x;
            for (const r of row) {
                const width = r.area / height;
                out.push({ ...r, x: cx, y, w: width, h: height });
                cx += width;
            }
            y += height;
            h -= height;
        }
    };
    let row = [];
    const rest = items.filter((i) => i.area > 0);
    while (rest.length) {
        const side = Math.min(w, h);
        const next = rest[0];
        if (!row.length || worst([...row, next], side) <= worst(row, side)) {
            row.push(rest.shift());
        } else {
            place(row);
            row = [];
        }
    }
    if (row.length) place(row);
    return out;
}

function donut({ stage, processedData, hoverCallback, lineColor, hoverColor, size }) {
    const canvas = document.createElement('canvas');
    canvas.className = 'lpChart';
    canvas.width = size;
    canvas.height = size;
    stage.appendChild(canvas);
    const pie = pies({ processedData, container: canvas, hoverCallback, lineColor, hoverColor });
    return {
        update: (args) => pie.update(args),
        destroy() {
            document.querySelectorAll('body > .tooltip').forEach((t) => { t.style.display = 'none'; });
        },
    };
}

// Bars and treemap: drawn as elements, so they're keyboard reachable, say
// what they are, and follow the theme through CSS.
function blocks(style, { stage, processedData, hoverCallback, size }) {
    let data = processedData;
    let focusId = null;
    const root = document.createElement('div');
    root.className = `wgChart wgChart_${style}`;
    root.style.setProperty('--wg-chart-size', `${size}px`);
    stage.appendChild(root);

    const level = () => {
        const all = Object.values(data.points || {});
        if (focusId == null) return { parent: null, points: all, parentColor: false };
        const index = all.findIndex((p) => p.id === focusId);
        const focus = all[index];
        if (!focus) {
            focusId = null;
            return { parent: null, points: all, parentColor: false };
        }
        return { parent: focus, points: Object.values(focus.points || {}), parentColor: focus.color || colorUtils.getColor(index) };
    };

    const hover = (point) => {
        root.querySelectorAll('.wgChartPart').forEach((el) => el.classList.toggle('wgChartHover', point != null && el.dataset.key === String(point.id)));
        if (hoverCallback) hoverCallback(point);
    };

    const part = (point, index, parentColor, total) => {
        const el = document.createElement(point.points ? 'button' : 'div');
        if (point.points) el.type = 'button';
        el.className = 'wgChartPart';
        el.dataset.key = String(point.id);
        const pct = total ? Math.round((amount(point) / total) * 100) : 0;
        el.title = `${point.name} (${pct}%)`;
        el.setAttribute('aria-label', `${point.name}, ${pct}%${point.points ? '. Show its items' : ''}`);
        el.style.setProperty('--wg-part', colorOf(point, index, parentColor));
        el.addEventListener('mouseenter', () => hover(point));
        el.addEventListener('mouseleave', () => hover(null));
        el.addEventListener('focus', () => hover(point));
        el.addEventListener('blur', () => hover(null));
        if (point.points) {
            el.addEventListener('click', () => {
                focusId = point.id;
                draw();
                const back = root.querySelector('.wgChartBack');
                if (back) back.focus();
            });
        }
        return { el, pct };
    };

    function draw() {
        root.innerHTML = '';
        const { parent, points, parentColor } = level();
        const total = parent ? amount(parent) : data.total;
        if (parent) {
            const back = document.createElement('button');
            back.type = 'button';
            back.className = 'wgChartBack';
            back.innerHTML = '<span aria-hidden="true">←</span> ';
            back.append(shortName(parent));
            back.title = 'Back to all categories';
            back.addEventListener('click', () => {
                focusId = null;
                draw();
            });
            root.appendChild(back);
        }
        const indexed = points.map((p, i) => ({ p, i })).filter(({ p }) => amount(p) > 0);
        if (style === 'bars') {
            const list = document.createElement('div');
            list.className = 'wgChartBars';
            const max = Math.max(...indexed.map(({ p }) => amount(p)), 1);
            indexed.sort((a, b) => amount(b.p) - amount(a.p)).forEach(({ p, i }) => {
                const { el, pct } = part(p, i, parentColor, total);
                el.classList.add('wgChartBar');
                el.innerHTML = '<span class="wgChartBarName"></span><span class="wgChartBarTrack"><span class="wgChartBarFill"></span></span><span class="wgChartBarPct"></span>';
                el.querySelector('.wgChartBarName').textContent = shortName(p);
                el.querySelector('.wgChartBarFill').style.width = `${Math.max(2, (amount(p) / max) * 100)}%`;
                el.querySelector('.wgChartBarPct').textContent = `${pct}%`;
                list.appendChild(el);
            });
            root.appendChild(list);
        } else {
            const box = document.createElement('div');
            box.className = 'wgChartTreemap';
            root.appendChild(box);
            const width = size;
            const height = size - (parent ? 34 : 0);
            box.style.height = `${height}px`;
            const area = width * height;
            const rects = squarify(
                indexed.sort((a, b) => amount(b.p) - amount(a.p)).map(({ p, i }) => ({ p, i, area: (amount(p) / total) * area })),
                { x: 0, y: 0, w: width, h: height },
            );
            for (const r of rects) {
                const { el, pct } = part(r.p, r.i, parentColor, total);
                el.classList.add('wgChartTile');
                el.style.color = inkFor(el.style.getPropertyValue('--wg-part'));
                Object.assign(el.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
                if (r.w > 54 && r.h > 30) {
                    el.innerHTML = '<span class="wgChartTileName"></span><span class="wgChartTilePct"></span>';
                    el.querySelector('.wgChartTileName').textContent = shortName(r.p);
                    el.querySelector('.wgChartTilePct').textContent = `${pct}%`;
                }
                box.appendChild(el);
            }
        }
    }

    draw();
    return {
        update(args = {}) {
            if (args.processedData) {
                data = args.processedData;
                draw();
            }
        },
        destroy() {
            root.remove();
        },
    };
}

export function makeChart(style, args) {
    // Fills its stage, up to 260px (the stage shrinks in a narrow list).
    const size = args.size || Math.min(260, args.stage.clientWidth || 260);
    args.stage.innerHTML = '';
    const s = chartStyle(style);
    const chart = s === 'donut' ? donut({ ...args, size }) : blocks(s, { ...args, size });
    return { style: s, ...chart };
}
