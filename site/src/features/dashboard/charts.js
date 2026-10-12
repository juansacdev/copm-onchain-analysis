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
  granularityFor,
  heatCells,
  measureKey,
  selectedChains,
  sliceDaily,
  viewWindow,
} from "../../lib/dashboard-view.js";
import { formatCopmCompact, formatDate, formatDecimal, formatInt, formatMonthShort, formatUsd, rangeLabels } from "../../lib/format.js";
import { middleEllipsis } from "../../lib/links.js";

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

// Windowed totals of one chain: what the period minted, burned, moved between
// wallets, and the gross volume that is all of them together.
export function flowTotals(ctx, chain) {
  const slice = sliceFor(ctx, chain);
  const unit = ctx.state.unit;
  // Sums of the days in the chosen unit; in USD they are sums of daily dollars.
  const sum = (name) => {
    const total = slice[measureKey(name, unit)].reduce((a, b) => a + b, 0);
    return unit === "usd" ? Math.round(total * 100) / 100 : total;
  };
  const minted = sum("mint");
  const burned = sum("burn");
  const gross = sum("volume");
  const wallet = unit === "usd" ? Math.max(0, Math.round((gross - minted - burned) * 100) / 100) : Math.max(0, gross - minted - burned);
  return { minted, burned, gross, wallet, has: hasData(slice) };
}

function flows(ctx, width) {
  const f = makeFormat(ctx);
  const nodes = [];
  const rows = [];
  for (const chain of chainsInView(ctx)) {
    const totals = flowTotals(ctx, chain);
    if (!totals.has) continue;
    const data = [
      { name: ctx.t.columns.minted, v: totals.minted, fill: ctx.tok.mint },
      { name: ctx.t.columns.burned, v: totals.burned, fill: ctx.tok.burn },
      { name: ctx.t.columns.wallet, v: totals.wallet, fill: colorOf(ctx, chain.key) },
      { name: ctx.t.columns.gross, v: totals.gross, fill: ctx.tok.faint },
    ];
    const plot = Plot.plot({
      ...baseOptions(ctx, width, 190),
      marginLeft: 112,
      marginRight: 16,
      // Every bar carries its value, so the axis shows only the grid. The
      // domain leaves room on the right for the label of the longest bar.
      x: { grid: true, label: null, ticks: 3, tickFormat: () => "", tickSize: 0, domain: [0, Math.max(...data.map((r) => r.v)) * 1.6 || 1] },
      y: { label: null, domain: data.map((r) => r.name), padding: 0.45 },
      marks: [
        Plot.barX(data, { y: "name", x: (r) => r.v, fill: "fill", insetLeft: 0 }),
        Plot.text(data, { y: "name", x: (r) => r.v, text: (r) => f.moneyShort(r.v), dx: 6, textAnchor: "start", fill: ctx.tok.text }),
        Plot.ruleX([0], { stroke: ctx.tok.muted }),
        Plot.tip(data, Plot.pointer({ y: "name", x: (r) => r.v, title: (r) => `${r.name}\n${f.money(r.v)}`, ...tipOptions(ctx) })),
      ],
    });
    nodes.push(panel(ctx, chain.key, plot));
    rows.push([chain.label, f.money(totals.minted), f.money(totals.burned), f.money(totals.wallet), f.money(totals.gross)]);
  }
  return {
    nodes,
    legend: [],
    table: { columns: [ctx.t.columns.chain, ctx.t.columns.minted, ctx.t.columns.burned, ctx.t.columns.wallet, ctx.t.columns.gross], rows },
    columnsClass: "cols",
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
    const top = chain.holders.top.slice(0, 10);
    const rest = Math.max(0, 100 - top.reduce((a, h) => a + h.share, 0));
    const data = [
      ...top.map((h) => ({ label: `${h.rank}. ${middleEllipsis(h.address, 6, 4)}`, share: h.share, fill: colorOf(ctx, chain.key), address: h.address })),
      { label: ctx.t.legend.others, share: rest, fill: ctx.tok.faint, address: "" },
    ];
    const pct = (n) => `${formatDecimal(n, 1, ctx.lang)}${ctx.lang === "es" ? " %" : "%"}`;
    const plot = Plot.plot({
      ...baseOptions(ctx, width, data.length * 26 + 40),
      marginLeft: 108,
      marginRight: 56,
      x: { grid: true, label: null, domain: [0, 100], tickFormat: (v) => `${v}%`, ticks: 5 },
      y: { label: null, domain: data.map((r) => r.label), padding: 0.4 },
      marks: [
        Plot.barX(data, { y: "label", x: "share", fill: "fill" }),
        Plot.text(data.filter((_, k) => k === 0 || k === data.length - 1), { y: "label", x: "share", text: (r) => pct(r.share), dx: 6, textAnchor: "start", fill: ctx.tok.text }),
        Plot.ruleX([0], { stroke: ctx.tok.muted }),
        Plot.tip(data, Plot.pointer({ y: "label", x: "share", title: (r) => `${r.address || r.label}\n${pct(r.share)}`, ...tipOptions(ctx) })),
      ],
    });
    nodes.push(panel(ctx, chain.key, plot));
    for (const r of data) rows.push([chain.label, r.address || r.label, pct(r.share)]);
  }
  return { nodes, legend: [], table: { columns: [ctx.t.columns.chain, ctx.t.columns.holder, ctx.t.columns.share], rows }, columnsClass: "cols" };
}

export const RENDERERS = { supply, mintBurn, flows, transfers, volume, calendar, daily, sizes, holders };
