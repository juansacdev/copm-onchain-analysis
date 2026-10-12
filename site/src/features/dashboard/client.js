// Wires the dashboard in the browser: reads the filter state from the URL
// hash, re-renders the headline cards, the tiles, the largest-transfers tables,
// the headline figure of the volume block and the charts whenever a filter
// changes. The first render is already
// in the HTML (server side); this module only keeps it in step with the
// filters, using the same pure functions the server used.
import { RENDERERS, readTokens } from "./charts.js";
import { headlineCards } from "../../lib/dashboard-cards.js";
import { DEFAULT_STATE, decodeState, encodeState } from "../../lib/dashboard-filters.js";
import { amountCompact, amountFull, rowAmount, tileDelta, tileNotes, utcDateTime } from "../../lib/dashboard-format.js";
import { flowStats, granularityFor, largestRows, selectedChains, tilesFor, viewWindow } from "../../lib/dashboard-view.js";
import { formatDate, formatDecimal, formatInt } from "../../lib/format.js";
import { middleEllipsis } from "../../lib/links.js";
import { formatSerialBlock } from "../../lib/serial.js";
import { interpolate } from "../../lib/template.js";

const EXPLORERS = { polygon: "https://polygonscan.com", celo: "https://celoscan.io" };

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

function link(href, text, title) {
  const a = el("a", "addr", text);
  a.href = href;
  a.title = title;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return a;
}

function buildTable(columns, rows) {
  const scroll = el("div", "table-scroll");
  scroll.tabIndex = 0;
  scroll.setAttribute("role", "region");
  const table = el("table", "tbl mixed");
  const head = el("tr");
  for (const c of columns) {
    const th = el("th", "", c);
    th.scope = "col";
    head.append(th);
  }
  const thead = el("thead");
  thead.append(head);
  table.append(thead);
  const body = el("tbody");
  for (const row of rows) {
    const tr = el("tr");
    row.forEach((cell, k) => {
      const td = el(k === 0 ? "th" : "td", k === 0 ? "" : "num", cell);
      if (k === 0) td.scope = "row";
      tr.append(td);
    });
    body.append(tr);
  }
  table.append(body);
  scroll.append(table);
  return scroll;
}

export function mountDashboard(doc) {
  const root = doc.querySelector("[data-dashboard]");
  const payloadNode = doc.getElementById("dashboard-data");
  if (!root || !payloadNode) return;
  const payload = JSON.parse(payloadNode.textContent);
  const { t } = payload;
  const lang = t.lang;
  const tok = readTokens();

  let state = decodeState(location.hash) ?? { ...DEFAULT_STATE };
  const tableOn = new Set();
  let lastWidth = 0;

  /* Filters ---------------------------------------------------------------- */
  const filters = root.querySelector("[data-filters]");
  filters.hidden = false;
  filters.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-value]");
    if (!button) return;
    const name = button.closest("[data-filter]").dataset.filter;
    state = { ...state, [name]: button.dataset.value };
    history.replaceState(null, "", `#${encodeState(state)}`);
    update();
  });
  window.addEventListener("hashchange", () => {
    const next = decodeState(location.hash);
    if (next) {
      state = next;
      update();
    }
  });

  /* Cards and tiles ------------------------------------------------------------ */
  function renderCards() {
    const list = root.querySelector("[data-cards]");
    list.replaceChildren();
    for (const card of headlineCards({ chains: payload.chains, chain: state.chain, t: t.cards, lang })) {
      const item = el("li", "hcard");
      item.dataset.card = card.id;
      item.append(el("p", "v", card.figure), el("p", "k", card.label), el("p", "d", card.support));
      list.append(item);
    }
  }

  function renderTiles() {
    const tiles = tilesFor(payload.chains, state);
    const delta = (change, key) => tileDelta(change, key, { t: t.tiles, lang, days: tiles.window.days });
    const notes = tileNotes({ tiles, t, lang });
    const set = (id, value, delta) => {
      const tile = root.querySelector(`[data-tile="${id}"]`);
      tile.querySelector("[data-v]").textContent = value;
      const line = tile.querySelector("[data-d]");
      line.textContent = delta;
      line.hidden = delta === "";
      const note = tile.querySelector("[data-n]");
      note.textContent = notes[id];
      note.hidden = notes[id] === "";
    };
    set("supply", amountCompact(tiles.supply.value, state.unit, lang), delta(tiles.supply.changePct, "vsStart"));
    set("volume", amountCompact(tiles.volume.current, state.unit, lang), delta(tiles.volume.changePct, "vsPeriod"));
    set("transfers", formatInt(tiles.transfers.current, lang), delta(tiles.transfers.changePct, "vsPeriod"));
    set("holders", formatInt(tiles.holders, lang), "");
    const serial = tiles.blocks.map((b) => `${b.chain === "polygon" ? "POL" : "CELO"} ${formatSerialBlock(b.block)}`).join(" · ");
    set("block", serial, utcDateTime(Math.max(...tiles.blocks.map((b) => b.time))));
    root.querySelector("[data-window]").textContent = interpolate(t.filters.window, {
      from: formatDate(tiles.window.fromDay, lang),
      to: formatDate(tiles.window.toDay, lang),
    });
  }

  function renderVisibility() {
    for (const node of root.querySelectorAll("[data-chains]")) {
      node.hidden = !(state.chain === "both" || node.dataset.chains === state.chain);
    }
  }

  function renderLargest() {
    const VISIBLE = 5;
    const rows = largestRows(payload.chains, state);
    fillLargest(root.querySelector('[data-largest="head"] tbody'), rows.slice(0, VISIBLE), true);
    fillLargest(root.querySelector('[data-largest="rest"] tbody'), rows.slice(VISIBLE), false);
    const more = root.querySelector("[data-largest-more]");
    more.hidden = rows.length <= VISIBLE;
    root.querySelector("[data-largest-summary]").textContent = interpolate(t.who.largestMore, { count: Math.max(0, rows.length - VISIBLE) });
  }

  function fillLargest(table, rows, announceEmpty) {
    table.replaceChildren();
    if (rows.length === 0) {
      if (!announceEmpty) return;
      const tr = el("tr");
      const td = el("td", "", t.who.largestEmpty);
      td.colSpan = 7;
      tr.append(td);
      table.append(tr);
      return;
    }
    for (const r of rows) {
      const tr = el("tr");
      const day = el("th", "", formatDate(r.day, lang));
      day.scope = "row";
      const base = EXPLORERS[r.chain];
      const addr = (value) => {
        const td = el("td");
        td.append(link(`${base}/address/${value}`, middleEllipsis(value, 6, 4), value));
        return td;
      };
      const tx = el("td");
      tx.append(link(`${base}/tx/${r.tx}`, middleEllipsis(r.tx, 8, 6), r.tx));
      tr.append(
        day,
        el("td", "", payload.chains[r.chain].label),
        el("td", "", t.columns.kindValue[r.kind]),
        el("td", "num", amountFull(rowAmount(r, state.unit), state.unit, lang)),
        addr(r.from),
        addr(r.to),
        tx,
      );
      table.append(tr);
    }
  }

  // The headline figure of the volume block: how many times each minted peso
  // is counted in the gross volume of the period, per chain in view. It is a
  // ratio of COPM, so it does not change with the unit.
  function renderFlowStats() {
    const box = root.querySelector('[data-stat="flows"]');
    box.replaceChildren();
    for (const stat of flowStats(payload.chains, state)) {
      if (stat.turnover === null) continue;
      const line = el("p", "flow-stat");
      line.append(el("strong", "", `${formatDecimal(stat.turnover, 1, lang)}×`), document.createTextNode(" "), el("span", "", `${t.charts.flows.turnover} · ${stat.label}`));
      box.append(line);
    }
  }

  /* Charts ------------------------------------------------------------------- */
  function renderCharts() {
    const granularity = granularityFor(state.period);
    const noData = viewWindow(payload.chains, state) === null;
    for (const figure of root.querySelectorAll("[data-chart]")) {
      const id = figure.dataset.chart;
      const heading = figure.querySelector("[data-title]");
      heading.textContent = interpolate(heading.dataset.title, { bucket: t.charts.bucket[granularity] });
      const body = figure.querySelector("[data-plot]");
      const tableBox = figure.querySelector("[data-table]");
      const legend = figure.querySelector("[data-legend]");
      const toggle = figure.querySelector("[data-toggle]");
      const width = Math.max(300, Math.floor(body.clientWidth || figure.clientWidth - 32));
      let out;
      try {
        out = noData ? { nodes: [], legend: [], table: { columns: [], rows: [] } } : RENDERERS[id]({ payload, state, t, lang, tok, width: 0 }, columnsWidth(width, id));
      } catch (error) {
        console.error(`dashboard chart ${id}`, error);
        body.replaceChildren(el("p", "muted dchart-note", t.chartUi.error));
        continue;
      }
      body.replaceChildren();
      body.classList.toggle("cols", out.columnsClass === "cols" && out.nodes.length > 1);
      if (out.nodes.length === 0) body.append(el("p", "muted dchart-note", t.chartUi.empty));
      for (const node of out.nodes) body.append(node);
      // A long calendar opens on its latest weeks.
      if (id === "calendar") for (const scroller of body.querySelectorAll(".plot-scroll")) scroller.scrollLeft = scroller.scrollWidth;

      legend.replaceChildren();
      for (const item of out.legend) legend.append(el("span", `key ${item.cls}`, item.label));

      tableBox.replaceChildren();
      if (out.table.rows.length > 0) tableBox.append(buildTable(out.table.columns, out.table.rows));
      toggle.hidden = out.nodes.length === 0;
      applyTableMode(figure, id, toggle);
      toggle.onclick = () => {
        if (tableOn.has(id)) tableOn.delete(id);
        else tableOn.add(id);
        applyTableMode(figure, id, toggle);
      };
    }
  }

  // Small multiples sit side by side when there is room: each gets half.
  function columnsWidth(width, id) {
    const sideBySide = ["supply", "mintBurn", "volume", "calendar", "daily"].includes(id);
    const count = selectedChains(payload.chains, state).length;
    if (!sideBySide || count < 2 || width < 760) return width;
    return Math.floor((width - 16) / 2);
  }

  function applyTableMode(figure, id, toggle) {
    const showTable = tableOn.has(id);
    figure.querySelector("[data-plot]").hidden = showTable;
    figure.querySelector("[data-legend]").hidden = showTable;
    figure.querySelector("[data-table]").hidden = !showTable;
    toggle.textContent = showTable ? t.chartUi.viewChart : t.chartUi.viewTable;
    toggle.setAttribute("aria-pressed", showTable ? "true" : "false");
  }

  /* Whole page --------------------------------------------------------------- */
  function update() {
    for (const group of filters.querySelectorAll("[data-filter]")) {
      for (const button of group.querySelectorAll("button")) {
        button.setAttribute("aria-pressed", String(button.dataset.value === state[group.dataset.filter]));
      }
    }
    const token = encodeState(state);
    for (const a of doc.querySelectorAll(".langswitch a")) a.hash = token;
    renderCards();
    renderTiles();
    renderVisibility();
    renderLargest();
    renderCharts();
    renderFlowStats();
  }

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const width = root.clientWidth;
      if (Math.abs(width - lastWidth) > 24) {
        lastWidth = width;
        renderCharts();
      }
    }, 150);
  });

  lastWidth = root.clientWidth;
  update();
}
