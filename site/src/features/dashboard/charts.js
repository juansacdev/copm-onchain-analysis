// The dashboard's charts, drawn with Observable Plot from the page's JSON
// payload. Each renderer receives the same context (payload, filter state,
// dictionary, design tokens) and returns what the frame needs: the plot nodes,
// the legend and the rows of its table twin, so the table always holds the
// numbers the chart draws.
//
// Colors come from the CSS custom properties of tokens.css at run time; this
// file writes no color. Chain color identifies the chain, mint and burn
// identify direction, everything else is ink.
import * as Plot from "@observablehq/plot";
import { movingAverage } from "../../../../pipeline/domain/dashboard.js";
import { amountCompact, amountFull } from "../../lib/dashboard-format.js";
import {
  bucketize,
  flowStats,
  flowTotalsOf,
  granularityFor,
  heatCells,
  holderComposition,
  measureKey,
  rateSeries,
  selectedChains,
  sliceDaily,
  viewWindow,
} from "../../lib/dashboard-view.js";
import { formatCopmCompact, formatDate, formatDecimal, formatInt, formatMonthShort, formatUsd, rangeLabels } from "../../lib/format.js";

const BAR_MAX = 24;
const PLOT_HEIGHT = 220;
// Room for the longest money tick, "10.000 millones".
const MONEY_MARGIN = 120;

export function readTokens(root = document.documentElement) {
  const style = getComputedStyle(root);
  const read = (name) => style.getPropertyValue(`--${name}`).trim();
  return {
    polygon: read("polygon"),
    celo: read("celo"),
    mint: read("mint"),
    burn: read("burn"),
    text: read("text"),
    muted: read("muted"),
    faint: read("faint"),
    panel: read("panel"),
    panel2: read("panel-2"),
    line: read("line"),
    sans: read("font-sans"),
    mono: read("font-mono"),
  };
}

/* Formatting ---------------------------------------------------------------- */

function makeFormat(ctx) {
  const { lang, state } = ctx;
  const usd = state.unit === "usd";
  const monthName = (key) => formatMonthShort(key, lang);
  return {
    // Axis ticks, in the chosen unit.
    axisMoney: (v) => (usd ? formatUsd(v, lang, "short", { trim: true }) : formatCopmCompact(v, lang)),
    axisCount: (v) => formatInt(v, lang),
    // Amounts are already in the chosen unit: each day was valued at its own
    // rate by the pipeline, and nothing here converts.
    money: (value) => amountFull(value, state.unit, lang),
    moneyShort: (value) => amountCompact(value, state.unit, lang),
    // The daily array of a measure in the chosen unit.
    key: (name) => measureKey(name, state.unit),
    count: (n) => formatInt(n, lang),
    month: monthName,
    day: (iso) => {
      const [, month, day] = iso.split("-");
      const name = monthName(`${iso.slice(0, 4)}-${month}`).split(" ")[0];
      return lang === "es" ? `${Number(day)} ${name}` : `${name} ${Number(day)}`;
    },
    date: (iso) => formatDate(iso, lang),
    bucket: (key, granularity) => (granularity === "month" ? monthName(key) : makeFormat(ctx).day(key)),
  };
}

// Every n-th label of a band axis, so labels never collide.
function thin(labels, width, minStep = 88) {
  const fit = Math.max(1, Math.floor(width / minStep));
  const every = Math.max(1, Math.ceil(labels.length / fit));
  return (label) => (labels.indexOf(label) % every === 0 ? label : "");
}

/* Plot defaults ------------------------------------------------------------- */

function baseOptions(ctx, width, height) {
  const { tok } = ctx;
  return {
    width,
    height,
    marginLeft: 64,
    marginRight: 16,
    marginTop: 12,
    marginBottom: 32,
    style: {
      background: "transparent",
      color: tok.muted,
      fontFamily: tok.sans,
      fontSize: "12px",
      overflow: "visible",
      "--plot-background": tok.panel2,
    },
  };
}

const tipOptions = (ctx) => ({ fill: ctx.tok.panel2, stroke: ctx.tok.line, fontSize: 12 });
const colorOf = (ctx, chain) => ctx.tok[chain];

function panel(ctx, chainKey, node) {
  const wrap = document.createElement("div");
  wrap.className = "sm";
  const title = document.createElement("p");
  title.className = "sm-title";
  const dot = document.createElement("span");
  dot.className = `dot ${chainKey}`;
  dot.setAttribute("aria-hidden", "true");
  title.append(dot, ctx.payload.chains[chainKey].label);
  const scroll = document.createElement("div");
  scroll.className = "plot-scroll";
  scroll.append(node);
  wrap.append(title, scroll);
  return wrap;
}

function chainsInView(ctx) {
  return selectedChains(ctx.payload.chains, ctx.state);
}

function sliceFor(ctx, chain) {
  const { fromDay, toDay } = viewWindow(ctx.payload.chains, ctx.state);
  return sliceDaily(chain.daily, fromDay, toDay);
}

const asDate = (iso) => new Date(`${iso}T00:00:00Z`);
const hasData = (slice) => slice.day.length > 0;

// Time axis: month names for long windows, day and month for short ones.
function timeAxis(ctx, f, slice, width) {
  const short = slice.day.length <= 120;
  return {
    type: "utc",
    label: null,
    ticks: Math.max(2, Math.floor(width / 96)),
    tickFormat: (d) => {
      const iso = d.toISOString().slice(0, 10);
      return short ? f.day(iso) : f.month(iso.slice(0, 7));
    },
  };
}

/* Renderers ----------------------------------------------------------------- */

function supply(ctx, width) {
  const f = makeFormat(ctx);
  const nodes = [];
  const rows = [];
  for (const chain of chainsInView(ctx)) {
    const slice = sliceFor(ctx, chain);
    if (!hasData(slice)) continue;
    const data = slice.day.map((day, k) => ({ day, d: asDate(day), v: slice[f.key("supply")][k] }));
    const last = data.at(-1);
    const color = colorOf(ctx, chain.key);
    // The peak of the supply, when it falls inside the window and is not
    // today's value: a dot with its label. It is the peak of the unit drawn:
    // the rate moves, so the USD peak is usually another day than the COPM one.
    const peakDay = chain.supplyPeak?.[ctx.state.unit === "usd" ? "usd" : "copm"].day;
    const peakRow = peakDay && peakDay !== last.day ? data.find((r) => r.day === peakDay) : undefined;
    const plot = Plot.plot({
      ...baseOptions(ctx, width, PLOT_HEIGHT),
      marginLeft: MONEY_MARGIN,
      x: timeAxis(ctx, f, slice, width),
      y: { grid: true, label: null, tickFormat: f.axisMoney, domain: [0, Math.max(...data.map((r) => r.v)) * 1.08] },
      marks: [
        Plot.ruleY([0], { stroke: ctx.tok.line }),
        Plot.areaY(data, { x: "d", y: (r) => r.v, fill: color, fillOpacity: 0.1 }),
        Plot.lineY(data, { x: "d", y: (r) => r.v, stroke: color, strokeWidth: 2 }),
        Plot.dot([last], { x: "d", y: (r) => r.v, r: 4, fill: color, stroke: ctx.tok.panel, strokeWidth: 2 }),
        Plot.text([last], { x: "d", y: (r) => r.v, text: (r) => f.moneyShort(r.v), dy: -12, textAnchor: "end", fill: ctx.tok.text, fontWeight: 600 }),
        ...(peakRow
          ? [
              Plot.dot([peakRow], { x: "d", y: (r) => r.v, r: 4, fill: ctx.tok.panel, stroke: ctx.tok.text, strokeWidth: 2 }),
              Plot.text([peakRow], { x: "d", y: (r) => r.v, text: (r) => `${ctx.t.charts.supply.peak} ${f.moneyShort(r.v)}`, dy: -12, textAnchor: "middle", fill: ctx.tok.text, fontWeight: 600 }),
            ]
          : []),
        Plot.tip(data, Plot.pointerX({ x: "d", y: (r) => r.v, title: (r) => `${f.date(r.day)}\n${f.money(r.v)}`, ...tipOptions(ctx) })),
      ],
    });
    nodes.push(panel(ctx, chain.key, plot));
    for (const r of data) rows.push([chain.label, r.day, f.money(r.v)]);
  }
  return { nodes, legend: [], table: { columns: [ctx.t.columns.chain, ctx.t.columns.day, ctx.t.columns.supply], rows: sampleRows(rows) }, columnsClass: "cols" };
}

// Daily tables can have a thousand rows; the table twin keeps the last year of
// each chain at day level, which is what any filter shows at most besides "all".
function sampleRows(rows) {
  return rows.length > 800 ? rows.filter((_, k) => k % Math.ceil(rows.length / 800) === 0) : rows;
}

function bucketsOf(ctx, chain) {
  const granularity = granularityFor(ctx.state.period);
  const slice = sliceFor(ctx, chain);
  return { granularity, slice, b: bucketize(slice, granularity) };
}

// A bar that covers fewer days than a whole week or month is drawn lighter and
// named as such in its tooltip and its table row.
const PARTIAL_OPACITY = 0.4;
const barOpacity = (r) => (r.partial ? PARTIAL_OPACITY : 1);
const labelOf = (ctx, r) => (r.partial ? `${r.label} (${ctx.t.chartUi.partial})` : r.label);

function bandBars(width, count) {
  const plotWidth = Math.max(40, width - 80);
  const band = plotWidth / Math.max(1, count);
  return { padding: Math.min(0.6, Math.max(0.12, 1 - Math.min(BAR_MAX, band * 0.75) / band)) };
}

function mintBurn(ctx, width) {
  const f = makeFormat(ctx);
  const nodes = [];
  const rows = [];
  for (const chain of chainsInView(ctx)) {
    const { granularity, slice, b } = bucketsOf(ctx, chain);
    if (!hasData(slice)) continue;
    const labels = b.bucket.map((key) => f.bucket(key, granularity));
    const data = b.bucket.map((key, k) => ({ label: labels[k], key, partial: b.partial[k], mint: b[f.key("mint")][k], burn: b[f.key("burn")][k] }));
    const plot = Plot.plot({
      ...baseOptions(ctx, width, PLOT_HEIGHT),
      marginLeft: MONEY_MARGIN,
      x: { type: "band", label: null, domain: labels, tickFormat: thin(labels, width), ...bandBars(width, labels.length) },
      y: { grid: true, label: null, tickFormat: (v) => f.axisMoney(Math.abs(v)) },
      marks: [
        Plot.barY(data, { x: "label", y: (r) => r.mint, fill: ctx.tok.mint, fillOpacity: barOpacity, insetBottom: 1 }),
        Plot.barY(data, { x: "label", y: (r) => -r.burn, fill: ctx.tok.burn, fillOpacity: barOpacity, insetTop: 1 }),
        Plot.ruleY([0], { stroke: ctx.tok.muted }),
        Plot.tip(data, Plot.pointerX({ x: "label", y: (r) => r.mint, title: (r) => `${labelOf(ctx, r)}\n${ctx.t.legend.mint}: ${f.money(r.mint)}\n${ctx.t.legend.burn}: ${f.money(r.burn)}`, ...tipOptions(ctx) })),
      ],
    });
    nodes.push(panel(ctx, chain.key, plot));
    for (const r of data) rows.push([chain.label, labelOf(ctx, r), f.money(r.mint), f.money(r.burn)]);
  }
  return {
    nodes,
    legend: [{ cls: "mint", label: ctx.t.legend.mint }, { cls: "burn", label: ctx.t.legend.burn }],
    table: { columns: [ctx.t.columns.chain, ctx.t.columns.period, ctx.t.columns.minted, ctx.t.columns.burned], rows },
    columnsClass: "cols",
  };
}

// Windowed totals of one chain in the chosen unit (see dashboard-view.js).
export function flowTotals(ctx, chain) {
  return flowTotalsOf(chain, viewWindow(ctx.payload.chains, ctx.state), ctx.state.unit);
}

// A bar split into parts that add up to the whole, labelled directly: the
// first and the last label sit above the bar at its ends and the ones between
// below it, so neighbouring labels never meet.
function compositionBar(ctx, width, segments) {
  const pct = (n) => `${formatDecimal(n, n < 10 ? 1 : 0, ctx.lang)}${ctx.lang === "es" ? " %" : "%"}`;
  let start = 0;
  const rows = segments.map((segment, k) => {
    const row = { ...segment, x1: start, x2: start + segment.share, k };
    start = row.x2;
    return row;
  });
  const label = (r) => `${r.name} ${pct(r.share)}`;
  const shown = rows.filter((r) => r.share > 0);
  const first = shown.filter((r) => r.k === 0);
  const last = shown.filter((r) => r.k === rows.length - 1 && r.k !== 0);
  // A middle label is centred on its part, or pulled to an end of the bar
  // when it would run past it.
  const middle = shown.filter((r) => r.k !== 0 && r.k !== rows.length - 1).map((r) => {
    const centre = (r.x1 + r.x2) / 2;
    return centre > 75 ? { ...r, at: r.x2, anchor: "end" } : centre < 25 ? { ...r, at: r.x1, anchor: "start" } : { ...r, at: centre, anchor: "middle" };
  });
  return Plot.plot({
    ...baseOptions(ctx, width, 104),
    marginLeft: 8,
    marginRight: 8,
    marginTop: 30,
    marginBottom: 30,
    x: { axis: null, domain: [0, 100] },
    y: { axis: null },
    marks: [
      Plot.rectX(rows, { x1: "x1", x2: "x2", fill: "fill", fillOpacity: (r) => r.opacity ?? 1, insetLeft: 0.5, insetRight: 0.5, rx: 2 }),
      Plot.text(first, { x: "x1", text: label, textAnchor: "start", frameAnchor: "top", lineAnchor: "bottom", dy: -6, fill: ctx.tok.text }),
      Plot.text(last, { x: "x2", text: label, textAnchor: "end", frameAnchor: "top", lineAnchor: "bottom", dy: -6, fill: ctx.tok.text }),
      Plot.text(middle.filter((r) => r.anchor === "start"), { x: "at", text: label, textAnchor: "start", frameAnchor: "bottom", lineAnchor: "top", dy: 6, fill: ctx.tok.text }),
      Plot.text(middle.filter((r) => r.anchor === "middle"), { x: "at", text: label, textAnchor: "middle", frameAnchor: "bottom", lineAnchor: "top", dy: 6, fill: ctx.tok.text }),
      Plot.text(middle.filter((r) => r.anchor === "end"), { x: "at", text: label, textAnchor: "end", frameAnchor: "bottom", lineAnchor: "top", dy: 6, fill: ctx.tok.text }),
      Plot.tip(rows, Plot.pointer({ x: (r) => (r.x1 + r.x2) / 2, title: (r) => `${r.name}\n${pct(r.share)}${r.amount ? `\n${r.amount}` : ""}`, ...tipOptions(ctx) })),
    ],
  });
}

function flows(ctx, width) {
  const f = makeFormat(ctx);
  const nodes = [];
  const rows = [];
  for (const stat of flowStats(ctx.payload.chains, ctx.state)) {
    const { totals, shares } = stat;
    if (!shares) continue;
    const segments = [
      { name: ctx.t.columns.minted, share: shares.minted, fill: ctx.tok.mint, amount: f.moneyShort(totals.minted) },
      { name: ctx.t.legend.wallet, share: shares.wallet, fill: colorOf(ctx, stat.key), amount: f.moneyShort(totals.wallet) },
      { name: ctx.t.columns.burned, share: shares.burned, fill: ctx.tok.burn, amount: f.moneyShort(totals.burned) },
    ];
    nodes.push(panel(ctx, stat.key, compositionBar(ctx, width, segments)));
    rows.push([stat.label, f.money(totals.minted), f.money(totals.wallet), f.money(totals.burned), f.money(totals.gross)]);
  }
  return {
    nodes,
    legend: [],
    table: { columns: [ctx.t.columns.chain, ctx.t.columns.minted, ctx.t.columns.wallet, ctx.t.columns.burned, ctx.t.columns.gross], rows },
  };
}

// The exchange rate behind every dollar figure: one line, the latest value
// labelled. The rate does not depend on the chain, so there is one panel.
function rate(ctx, width) {
  const f = makeFormat(ctx);
  const series = rateSeries(ctx.payload.chains, ctx.state);
  if (!series) return { nodes: [], legend: [], table: { columns: [], rows: [] } };
  const data = series.days.map((day, k) => ({ day, d: asDate(day), v: series.values[k] }));
  const last = data.at(-1);
  const low = Math.min(...data.map((r) => r.v));
  const high = Math.max(...data.map((r) => r.v));
  const pad = (high - low || high * 0.02) * 0.15;
  const value = (n) => formatDecimal(n, 2, ctx.lang, { trim: true });
  const plot = Plot.plot({
    ...baseOptions(ctx, width, PLOT_HEIGHT),
    marginLeft: 56,
    marginRight: 64,
    x: timeAxis(ctx, f, { day: series.days }, width),
    y: { grid: true, label: null, tickFormat: (v) => formatInt(v, ctx.lang), domain: [low - pad, high + pad], nice: true },
    marks: [
      Plot.lineY(data, { x: "d", y: "v", stroke: ctx.tok.text, strokeWidth: 2 }),
      Plot.dot([last], { x: "d", y: "v", r: 4, fill: ctx.tok.text, stroke: ctx.tok.panel, strokeWidth: 2 }),
      Plot.text([last], { x: "d", y: "v", text: (r) => value(r.v), dx: 8, textAnchor: "start", fill: ctx.tok.text, fontWeight: 600 }),
      Plot.tip(data, Plot.pointerX({ x: "d", y: "v", title: (r) => `${f.date(r.day)}\n${value(r.v)}`, ...tipOptions(ctx) })),
    ],
  });
  const wrap = document.createElement("div");
  wrap.className = "plot-scroll";
  wrap.append(plot);
  return {
    nodes: [wrap],
    legend: [],
    table: { columns: [ctx.t.columns.day, ctx.t.columns.rate], rows: sampleRows(data.map((r) => [r.day, value(r.v)])) },
  };
}

function transfers(ctx, width) {
  const f = makeFormat(ctx);
  const granularity = granularityFor(ctx.state.period);
  const chains = chainsInView(ctx);
  const per = chains.map((c) => ({ chain: c, ...bucketsOf(ctx, c) })).filter((c) => hasData(c.slice));
  if (per.length === 0) return { nodes: [], legend: [], table: { columns: [], rows: [] } };
  const keys = [...new Set(per.flatMap((c) => c.b.bucket))].sort();
  const labels = keys.map((key) => f.bucket(key, granularity));
  const data = per.flatMap((c) =>
    c.b.bucket.map((key, k) => ({ chain: c.chain.key, label: f.bucket(key, granularity), key, partial: c.b.partial[k], v: c.b.transfers[k] })),
  );
  const plot = Plot.plot({
    ...baseOptions(ctx, width, PLOT_HEIGHT + 20),
    x: { type: "band", label: null, domain: labels, tickFormat: thin(labels, width), ...bandBars(width, labels.length) },
    y: { grid: true, label: null, tickFormat: f.axisCount },
    color: { domain: per.map((c) => c.chain.key), range: per.map((c) => colorOf(ctx, c.chain.key)) },
    marks: [
      Plot.barY(data, { x: "label", y: "v", fill: "chain", fillOpacity: barOpacity, insetTop: 1, insetBottom: 1 }),
      Plot.ruleY([0], { stroke: ctx.tok.muted }),
      Plot.tip(data, Plot.pointerX(Plot.stackY({ x: "label", y: "v", fill: "chain", title: (r) => `${labelOf(ctx, r)}\n${ctx.payload.chains[r.chain].label}: ${f.count(r.v)}`, ...tipOptions(ctx) }))),
    ],
  });
  const wrap = document.createElement("div");
  wrap.className = "plot-scroll";
  wrap.append(plot);
  return {
    nodes: [wrap],
    legend: per.length > 1 ? per.map((c) => ({ cls: c.chain.key, label: c.chain.label })) : [],
    table: {
      columns: [ctx.t.columns.chain, ctx.t.columns.period, ctx.t.columns.transfers],
      rows: data.map((r) => [ctx.payload.chains[r.chain].label, labelOf(ctx, r), f.count(r.v)]),
    },
  };
}

function volume(ctx, width) {
  const f = makeFormat(ctx);
  const nodes = [];
  const rows = [];
  for (const chain of chainsInView(ctx)) {
    const { granularity, slice, b } = bucketsOf(ctx, chain);
    if (!hasData(slice)) continue;
    const labels = b.bucket.map((key) => f.bucket(key, granularity));
    const data = b.bucket.map((key, k) => ({ label: labels[k], partial: b.partial[k], v: b[f.key("volume")][k] }));
    const plot = Plot.plot({
      ...baseOptions(ctx, width, PLOT_HEIGHT),
      marginLeft: MONEY_MARGIN,
      x: { type: "band", label: null, domain: labels, tickFormat: thin(labels, width), ...bandBars(width, labels.length) },
      y: { grid: true, label: null, tickFormat: f.axisMoney },
      marks: [
        Plot.barY(data, { x: "label", y: (r) => r.v, fill: colorOf(ctx, chain.key), fillOpacity: barOpacity }),
        Plot.ruleY([0], { stroke: ctx.tok.muted }),
        Plot.tip(data, Plot.pointerX({ x: "label", y: (r) => r.v, title: (r) => `${labelOf(ctx, r)}\n${f.money(r.v)}`, ...tipOptions(ctx) })),
      ],
    });
    nodes.push(panel(ctx, chain.key, plot));
    for (const r of data) rows.push([chain.label, labelOf(ctx, r), f.money(r.v)]);
  }
  return { nodes, legend: [], table: { columns: [ctx.t.columns.chain, ctx.t.columns.period, ctx.t.columns.gross], rows }, columnsClass: "cols" };
}

function calendar(ctx, width) {
  const f = makeFormat(ctx);
  const weekdays = ctx.t.charts.calendar.weekdays;
  const nodes = [];
  const rows = [];
  for (const chain of chainsInView(ctx)) {
    const slice = sliceFor(ctx, chain);
    if (!hasData(slice)) continue;
    const cells = heatCells(slice);
    const weeks = Math.max(...cells.map((c) => c.week)) + 1;
    const cell = 13;
    const plotWidth = Math.max(width, weeks * cell + 72);
    // One tick at the week of the first day of each month.
    const monthStarts = cells.filter((c) => c.day.endsWith("-01"));
    if (monthStarts.length === 0) monthStarts.push(cells[0]);
    const every = Math.max(1, Math.ceil(monthStarts.length / Math.floor(plotWidth / 70)));
    const labelByWeek = new Map(monthStarts.filter((_, k) => k % every === 0).map((c) => [c.week, f.month(c.day.slice(0, 7))]));
    const plot = Plot.plot({
      ...baseOptions(ctx, plotWidth, 7 * 16 + 48),
      marginLeft: 28,
      x: { label: null, domain: Array.from({ length: weeks }, (_, w) => w), tickFormat: (w) => labelByWeek.get(w) ?? "", tickSize: 0 },
      y: { label: null, domain: [0, 1, 2, 3, 4, 5, 6], tickFormat: (d) => weekdays[d], tickSize: 0, reverse: false },
      opacity: { type: "sqrt", range: [0.1, 1] },
      marks: [
        Plot.cell(cells, { x: "week", y: "weekday", fill: colorOf(ctx, chain.key), fillOpacity: "transfers", inset: 1, rx: 2 }),
        Plot.tip(cells, Plot.pointer({ x: "week", y: "weekday", title: (c) => `${f.date(c.day)}\n${f.count(c.transfers)}`, ...tipOptions(ctx) })),
      ],
    });
    nodes.push(panel(ctx, chain.key, plot));
    for (const c of cells) rows.push([chain.label, c.day, f.count(c.transfers)]);
  }
  return { nodes, legend: [], table: { columns: [ctx.t.columns.chain, ctx.t.columns.day, ctx.t.columns.transfers], rows: sampleRows(rows) }, columnsClass: "cols" };
}

function daily(ctx, width) {
  const f = makeFormat(ctx);
  const nodes = [];
  const rows = [];
  for (const chain of chainsInView(ctx)) {
    const slice = sliceFor(ctx, chain);
    if (!hasData(slice)) continue;
    const average = movingAverage(slice.transfers, 7);
    const data = slice.day.map((day, k) => ({ day, d: asDate(day), v: slice.transfers[k], ma: average[k] }));
    const plot = Plot.plot({
      ...baseOptions(ctx, width, PLOT_HEIGHT),
      x: timeAxis(ctx, f, slice, width),
      y: { grid: true, label: null, tickFormat: f.axisCount, domain: [0, Math.max(...data.map((r) => r.v)) * 1.08] },
      marks: [
        Plot.ruleY([0], { stroke: ctx.tok.line }),
        Plot.lineY(data, { x: "d", y: "v", stroke: ctx.tok.faint, strokeWidth: 1 }),
        Plot.lineY(data, { x: "d", y: "ma", stroke: colorOf(ctx, chain.key), strokeWidth: 2 }),
        Plot.tip(data, Plot.pointerX({ x: "d", y: "ma", title: (r) => `${f.date(r.day)}\n${ctx.t.legend.daily}: ${f.count(r.v)}\n${ctx.t.legend.average}: ${formatDecimal(r.ma, 1, ctx.lang)}`, ...tipOptions(ctx) })),
      ],
    });
    nodes.push(panel(ctx, chain.key, plot));
    for (const r of data) rows.push([chain.label, r.day, f.count(r.v), formatDecimal(r.ma, 1, ctx.lang)]);
  }
  return {
    nodes,
    legend: [{ cls: "daily", label: ctx.t.legend.daily }, { cls: "average", label: ctx.t.legend.average }],
    table: { columns: [ctx.t.columns.chain, ctx.t.columns.day, ctx.t.legend.daily, ctx.t.legend.average], rows: sampleRows(rows) },
    columnsClass: "cols",
  };
}

function sizes(ctx, width) {
  const f = makeFormat(ctx);
  const chains = chainsInView(ctx);
  const count = (c, k) => c.sizes[k].count;
  const labels = rangeLabels(chains[0].sizes.map((s) => s.min), ctx.lang);
  const all = chains[0].sizes.map((s, k) => ({ label: labels[k], k }));
  const used = all.filter(({ k }) => chains.some((c) => count(c, k) > 0));
  if (used.length === 0) return { nodes: [], legend: [], table: { columns: [], rows: [] } };
  const first = used[0].k;
  const last = used.at(-1).k;
  const shown = all.filter(({ k }) => k >= first && k <= last);
  const data = shown.flatMap(({ label, k }) => chains.map((c) => ({ bin: label, chain: c.key, v: count(c, k) })));
  const peak = new Map(chains.map((c) => [c.key, Math.max(...data.filter((r) => r.chain === c.key).map((r) => r.v))]));
  const height = shown.length * (chains.length * 14 + 14) + 36;
  const longestLine = Math.max(...shown.flatMap((s) => s.label.replace(" – ", " –\n").split("\n").map((line) => line.length)));
  const plot = Plot.plot({
    ...baseOptions(ctx, width, height),
    marginLeft: Math.min(Math.floor(width * 0.4), Math.ceil(longestLine * 6.6) + 12),
    marginRight: 64,
    marginBottom: 28,
    // A range reads on two lines ("100 millones –" / "mil millones") so the
    // longest Spanish labels fit beside the bars.
    fy: { label: null, domain: shown.map((s) => s.label), padding: 0.2, tickFormat: (label) => label.replace(" – ", " –\n") },
    y: { axis: null, domain: chains.map((c) => c.key), padding: 0.15 },
    x: { grid: true, label: null, tickFormat: f.axisCount },
    color: { domain: chains.map((c) => c.key), range: chains.map((c) => colorOf(ctx, c.key)) },
    marks: [
      Plot.barX(data, { fy: "bin", y: "chain", x: "v", fill: "chain" }),
      Plot.text(data.filter((r) => r.v === peak.get(r.chain) && r.v > 0), { fy: "bin", y: "chain", x: "v", text: (r) => f.count(r.v), dx: 6, textAnchor: "start", fill: ctx.tok.text }),
      Plot.tip(data, Plot.pointer({ fy: "bin", y: "chain", x: "v", title: (r) => `${r.bin}\n${ctx.payload.chains[r.chain].label}: ${f.count(r.v)}`, ...tipOptions(ctx) })),
    ],
  });
  const wrap = document.createElement("div");
  wrap.className = "plot-scroll";
  wrap.append(plot);
  return {
    nodes: [wrap],
    legend: chains.length > 1 ? chains.map((c) => ({ cls: c.key, label: c.label })) : [],
    table: {
      columns: [ctx.t.columns.bucket, ctx.t.columns.chain, ctx.t.columns.transfers],
      rows: data.map((r) => [r.bin, ctx.payload.chains[r.chain].label, f.count(r.v)]),
    },
  };
}

function holders(ctx, width) {
  const f = makeFormat(ctx);
  const nodes = [];
  const rows = [];
  for (const chain of chainsInView(ctx)) {
    const c = holderComposition(chain);
    const color = colorOf(ctx, chain.key);
    const segments = [
      { name: ctx.t.legend.largest, share: c.largest, fill: color },
      { name: ctx.t.legend.next, share: c.next, fill: color, opacity: 0.5 },
      { name: ctx.t.legend.others, share: c.rest, fill: ctx.tok.faint },
    ];
    nodes.push(panel(ctx, chain.key, compositionBar(ctx, width, segments)));
    const pct = (n) => `${formatDecimal(n, 1, ctx.lang)}${ctx.lang === "es" ? " %" : "%"}`;
    for (const s of segments) rows.push([chain.label, s.name, pct(s.share)]);
  }
  return { nodes, legend: [], table: { columns: [ctx.t.columns.chain, ctx.t.columns.holder, ctx.t.columns.share], rows } };
}

export const RENDERERS = { supply, mintBurn, flows, rate, transfers, volume, calendar, daily, sizes, holders };
