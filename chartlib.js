// Shared SVG chart library — no canvas, no headless browser, no deps.
// Every chart is a self-contained SVG with its own dark background, so it
// renders identically on GitHub (light or dark theme), in editors, and in
// any browser.

export const BASE = {
  bg: "#0b0e14",
  panel: "#11151d",
  grid: "#222938",
  axis: "#8b949e",
  text: "#e6edf3",
  muted: "#7d8590",
  warn: "#f0883e",
  danger: "#f85149",
};

// Chain visual identity. Polygon's purple and Celo's green/yellow are the
// brands' own palettes, so combined charts read instantly.
export const CHAIN_PALETTES = {
  polygon: { primary: "#9a6bff", secondary: "#58a6ff", label: "Polygon" },
  celo: { primary: "#35d07f", secondary: "#fcff52", label: "Celo" },
  combined: { primary: "#58a6ff", secondary: "#f0883e", label: "Polygon + Celo" },
};

/* ==========================================================================
   Formatters
   ========================================================================== */

export function fmtUSD(n) {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export function fmtCOPM(n) {
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return `${n.toFixed(0)}`;
}

export function fmtNum(n) {
  return n.toLocaleString("en-US");
}

function monthLabel(isoDay) {
  return new Date(isoDay + "T00:00:00Z").toLocaleString("en-US", {
    month: "short",
    year: "2-digit",
  });
}

/* ==========================================================================
   Scales
   ========================================================================== */

// "Nice" axis ticks: step is 1/2/2.5/5 × 10^k, covering [0, max].
function niceTicks(max, count = 5) {
  if (max <= 0) return [0, 1];
  const rough = max / count;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const candidates = [1, 2, 2.5, 5, 10].map((m) => m * pow);
  const step = candidates.find((c) => c >= rough) ?? candidates.at(-1);
  const ticks = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(v);
  if (ticks.at(-1) < max) ticks.push(ticks.at(-1) + step);
  return ticks;
}

/* ==========================================================================
   Document scaffold
   ========================================================================== */

let uid = 0;

function svgDoc({ width, height, title, subtitle, badge, badgeColor, footer, body, defs = "" }) {
  const badgeW = badge ? badge.length * 7.5 + 22 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}">
  <style>
    .title { font: 600 19px -apple-system, 'Segoe UI', system-ui, sans-serif; fill: ${BASE.text}; }
    .subtitle { font: 400 12.5px -apple-system, 'Segoe UI', system-ui, sans-serif; fill: ${BASE.muted}; }
    .axis { font: 400 11px -apple-system, 'Segoe UI', system-ui, sans-serif; fill: ${BASE.axis}; }
    .label { font: 500 12px -apple-system, 'Segoe UI', system-ui, sans-serif; fill: ${BASE.text}; }
    .annot { font: 600 11.5px -apple-system, 'Segoe UI', system-ui, sans-serif; }
    .badge { font: 600 11.5px -apple-system, 'Segoe UI', system-ui, sans-serif; }
    .footer { font: 400 10.5px ui-monospace, 'SF Mono', Menlo, monospace; fill: ${BASE.muted}; }
  </style>
  <defs>${defs}</defs>
  <rect width="${width}" height="${height}" fill="${BASE.bg}"/>
  <rect x="8" y="8" width="${width - 16}" height="${height - 16}" rx="10" fill="${BASE.panel}" stroke="${BASE.grid}" stroke-width="1"/>
  <text x="28" y="40" class="title">${title}</text>
  ${
    badge
      ? `<rect x="${width - 28 - badgeW}" y="24" width="${badgeW}" height="22" rx="11" fill="${badgeColor}22" stroke="${badgeColor}" stroke-width="1"/>
  <text x="${width - 28 - badgeW / 2}" y="39" class="badge" fill="${badgeColor}" text-anchor="middle">${badge}</text>`
      : ""
  }
  <text x="28" y="59" class="subtitle">${subtitle}</text>
  ${body}
  ${footer ? `<text x="28" y="${height - 16}" class="footer">${footer}</text>` : ""}
</svg>`;
}

function gridAndAxis({ padL, padT, W, H, yMax, yFormatter }) {
  const ticks = niceTicks(yMax);
  const top = ticks.at(-1);
  let out = "";
  for (const v of ticks) {
    const y = padT + H - (v / top) * H;
    out += `<line x1="${padL}" y1="${y}" x2="${padL + W}" y2="${y}" stroke="${BASE.grid}" stroke-width="1"/>`;
    out += `<text x="${padL - 10}" y="${y + 4}" class="axis" text-anchor="end">${yFormatter(v)}</text>`;
  }
  return { out, top };
}

function monthGridX({ xMin, xMax, xScale, padT, H, everyMonths = 3 }) {
  let out = "";
  const start = new Date(xMin);
  let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  while (+cursor <= xMax) {
    const x = xScale(+cursor);
    out += `<line x1="${x}" y1="${padT}" x2="${x}" y2="${padT + H}" stroke="${BASE.grid}" stroke-width="1" stroke-dasharray="2,5"/>`;
    out += `<text x="${x}" y="${padT + H + 20}" class="axis" text-anchor="middle">${monthLabel(cursor.toISOString().slice(0, 10))}</text>`;
    cursor.setUTCMonth(cursor.getUTCMonth() + everyMonths);
  }
  return out;
}

/* ==========================================================================
   Charts
   ========================================================================== */

export function lineChart({
  width = 1080,
  height = 500,
  title,
  subtitle,
  badge,
  badgeColor,
  footer,
  data,
  xKey = "day",
  yKey,
  yFormatter = fmtNum,
  color,
  fillBelow = true,
  highlightTop = 1,
}) {
  const padL = 78, padR = 36, padT = 86, padB = 76;
  const W = width - padL - padR;
  const H = height - padT - padB;

  const xs = data.map((d) => +new Date(d[xKey] + "T00:00:00Z"));
  const ys = data.map((d) => d[yKey]);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMaxRaw = Math.max(...ys, 1);

  const { out: gridOut, top: yTop } = gridAndAxis({
    padL, padT, W, H, yMax: yMaxRaw, yFormatter,
  });
  const xScale = (x) => padL + ((x - xMin) / (xMax - xMin)) * W;
  const yScale = (y) => padT + H - (y / yTop) * H;
  const points = data.map((d, i) => [xScale(xs[i]), yScale(d[yKey])]);

  const months = Math.round((xMax - xMin) / (30.4 * 864e5));
  let body = gridOut + monthGridX({ xMin, xMax, xScale, padT, H, everyMonths: months > 18 ? 3 : months > 8 ? 2 : 1 });

  const gid = `g${uid++}`;
  let defs = "";
  if (fillBelow) {
    defs = `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0.02"/>
    </linearGradient>`;
    const areaPath =
      `M ${points[0][0]} ${padT + H} ` +
      points.map((p) => `L ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ") +
      ` L ${points.at(-1)[0]} ${padT + H} Z`;
    body += `<path d="${areaPath}" fill="url(#${gid})"/>`;
  }

  const linePath =
    `M ${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)} ` +
    points.slice(1).map((p) => `L ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  body += `<path d="${linePath}" stroke="${color}" stroke-width="1.6" fill="none" stroke-linejoin="round"/>`;

  if (highlightTop > 0) {
    const topIdx = data
      .map((d, i) => [d[yKey], i])
      .sort((a, b) => b[0] - a[0])
      .slice(0, highlightTop)
      .map(([, i]) => i);
    for (const i of topIdx) {
      const [x, y] = points[i];
      body += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" fill="${BASE.warn}" stroke="${BASE.panel}" stroke-width="2"/>`;
    }
    if (topIdx.length) {
      const i = topIdx[0];
      const [x, y] = points[i];
      const label = `${data[i][xKey]} · ${yFormatter(data[i][yKey])}`;
      const boxW = label.length * 6.8 + 16;
      const lx = Math.min(Math.max(x - boxW / 2, padL), padL + W - boxW);
      const ly = Math.max(y - 38, padT + 4);
      body += `<rect x="${lx}" y="${ly}" width="${boxW}" height="22" rx="6" fill="${BASE.bg}" stroke="${BASE.warn}" stroke-width="1"/>`;
      body += `<text x="${lx + boxW / 2}" y="${ly + 15}" class="annot" fill="${BASE.warn}" text-anchor="middle">${label}</text>`;
    }
  }

  body += `<line x1="${padL}" y1="${padT + H}" x2="${padL + W}" y2="${padT + H}" stroke="${BASE.axis}" stroke-width="1.4"/>`;
  return svgDoc({ width, height, title, subtitle, badge, badgeColor, footer, body, defs });
}

export function multiLineChart({
  width = 1080,
  height = 500,
  title,
  subtitle,
  badge,
  badgeColor,
  footer,
  series, // [{ label, color, data: [{day, value}] }]
  yFormatter = fmtNum,
}) {
  const padL = 78, padR = 36, padT = 100, padB = 76;
  const W = width - padL - padR;
  const H = height - padT - padB;

  const allX = series.flatMap((s) => s.data.map((d) => +new Date(d.day + "T00:00:00Z")));
  const allY = series.flatMap((s) => s.data.map((d) => d.value));
  const xMin = Math.min(...allX);
  const xMax = Math.max(...allX);
  const yMaxRaw = Math.max(...allY, 1);

  const { out: gridOut, top: yTop } = gridAndAxis({
    padL, padT, W, H, yMax: yMaxRaw, yFormatter,
  });
  const xScale = (x) => padL + ((x - xMin) / (xMax - xMin)) * W;
  const yScale = (y) => padT + H - (y / yTop) * H;

  const months = Math.round((xMax - xMin) / (30.4 * 864e5));
  let body = gridOut + monthGridX({ xMin, xMax, xScale, padT, H, everyMonths: months > 18 ? 3 : months > 8 ? 2 : 1 });

  // legend
  let lx = 28;
  for (const s of series) {
    body += `<rect x="${lx}" y="70" width="14" height="4" rx="2" fill="${s.color}"/>`;
    body += `<text x="${lx + 20}" y="76" class="label">${s.label}</text>`;
    lx += 20 + s.label.length * 7 + 24;
  }

  for (const s of series) {
    const pts = s.data.map((d) => [
      xScale(+new Date(d.day + "T00:00:00Z")),
      yScale(d.value),
    ]);
    if (!pts.length) continue;
    const path =
      `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)} ` +
      pts.slice(1).map((p) => `L ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
    body += `<path d="${path}" stroke="${s.color}" stroke-width="1.8" fill="none" stroke-linejoin="round"/>`;
  }

  body += `<line x1="${padL}" y1="${padT + H}" x2="${padL + W}" y2="${padT + H}" stroke="${BASE.axis}" stroke-width="1.4"/>`;
  return svgDoc({ width, height, title, subtitle, badge, badgeColor, footer, body });
}

export function barChart({
  width = 1080,
  height = 500,
  title,
  subtitle,
  badge,
  badgeColor,
  footer,
  data,
  xKey,
  yKey,
  yFormatter = fmtNum,
  color,
  highlightMax = true,
}) {
  const padL = 78, padR = 36, padT = 86, padB = 96;
  const W = width - padL - padR;
  const H = height - padT - padB;
  const yMaxRaw = Math.max(...data.map((d) => d[yKey]), 1);
  const { out: gridOut, top: yTop } = gridAndAxis({
    padL, padT, W, H, yMax: yMaxRaw, yFormatter,
  });
  const slot = W / data.length;
  const barW = slot * 0.72;

  let maxIdx = 0;
  data.forEach((d, i) => {
    if (d[yKey] > data[maxIdx][yKey]) maxIdx = i;
  });

  let body = gridOut;
  data.forEach((d, i) => {
    const x = padL + i * slot + (slot - barW) / 2;
    const h = (d[yKey] / yTop) * H;
    const y = padT + H - h;
    const isMax = highlightMax && i === maxIdx;
    const fill = isMax ? BASE.warn : color;
    body += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${fill}" fill-opacity="0.9" rx="2.5"/>`;
    if (isMax) {
      body += `<text x="${(x + barW / 2).toFixed(1)}" y="${(y - 8).toFixed(1)}" class="annot" fill="${BASE.warn}" text-anchor="middle">${yFormatter(d[yKey])}</text>`;
    }
    if (data.length <= 26 || i % Math.ceil(data.length / 26) === 0) {
      const tx = x + barW / 2;
      body += `<text x="${tx}" y="${padT + H + 20}" class="axis" text-anchor="middle" transform="rotate(-45 ${tx} ${padT + H + 20})">${d[xKey]}</text>`;
    }
  });

  body += `<line x1="${padL}" y1="${padT + H}" x2="${padL + W}" y2="${padT + H}" stroke="${BASE.axis}" stroke-width="1.4"/>`;
  return svgDoc({ width, height, title, subtitle, badge, badgeColor, footer, body });
}

export function groupedBarChart({
  width = 1080,
  height = 500,
  title,
  subtitle,
  badge,
  badgeColor,
  footer,
  data, // [{ label, a, b }]
  series, // [{ key, label, color }] — exactly 2
  yFormatter = fmtNum,
}) {
  const padL = 78, padR = 36, padT = 104, padB = 96;
  const W = width - padL - padR;
  const H = height - padT - padB;
  const yMaxRaw = Math.max(
    ...data.flatMap((d) => series.map((s) => d[s.key] ?? 0)),
    1
  );
  const { out: gridOut, top: yTop } = gridAndAxis({
    padL, padT, W, H, yMax: yMaxRaw, yFormatter,
  });
  const slot = W / data.length;
  const barW = (slot * 0.72) / series.length;

  let body = gridOut;

  let lx = 28;
  for (const s of series) {
    body += `<rect x="${lx}" y="72" width="12" height="12" rx="3" fill="${s.color}"/>`;
    body += `<text x="${lx + 18}" y="82" class="label">${s.label}</text>`;
    lx += 18 + s.label.length * 7 + 26;
  }

  data.forEach((d, i) => {
    series.forEach((s, j) => {
      const v = d[s.key] ?? 0;
      const x = padL + i * slot + (slot - barW * series.length) / 2 + j * barW;
      const h = (v / yTop) * H;
      const y = padT + H - h;
      body += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(barW - 1).toFixed(1)}" height="${h.toFixed(1)}" fill="${s.color}" fill-opacity="0.9" rx="2"/>`;
    });
    if (data.length <= 26 || i % Math.ceil(data.length / 26) === 0) {
      const tx = padL + i * slot + slot / 2;
      body += `<text x="${tx}" y="${padT + H + 20}" class="axis" text-anchor="middle" transform="rotate(-45 ${tx} ${padT + H + 20})">${d.label}</text>`;
    }
  });

  body += `<line x1="${padL}" y1="${padT + H}" x2="${padL + W}" y2="${padT + H}" stroke="${BASE.axis}" stroke-width="1.4"/>`;
  return svgDoc({ width, height, title, subtitle, badge, badgeColor, footer, body });
}

export function horizontalBarChart({
  width = 1080,
  height = 500,
  title,
  subtitle,
  badge,
  badgeColor,
  footer,
  data,
  xKey,
  yKey,
  yFormatter = fmtNum,
  color,
}) {
  const padL = 140, padR = 110, padT = 86, padB = 40;
  const W = width - padL - padR;
  const H = height - padT - padB;
  const xMax = Math.max(...data.map((d) => d[yKey]), 1);
  const slot = H / data.length;
  const barH = slot * 0.68;

  let body = "";
  data.forEach((d, i) => {
    const y = padT + i * slot + (slot - barH) / 2;
    const w = (d[yKey] / xMax) * W;
    const fill = i === 0 ? BASE.warn : color;
    body += `<text x="${padL - 10}" y="${y + barH / 2 + 4}" class="label" text-anchor="end">${d[xKey]}</text>`;
    body += `<rect x="${padL}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${barH.toFixed(1)}" fill="${fill}" fill-opacity="0.9" rx="3"/>`;
    body += `<text x="${padL + w + 8}" y="${y + barH / 2 + 4}" class="label">${yFormatter(d[yKey])}</text>`;
  });

  return svgDoc({ width, height, title, subtitle, badge, badgeColor, footer, body });
}

export function stackedBarChart({
  width = 1080,
  height = 500,
  title,
  subtitle,
  badge,
  badgeColor,
  footer,
  data,
  xKey,
  series,
  yFormatter = fmtNum,
}) {
  const padL = 78, padR = 36, padT = 104, padB = 96;
  const W = width - padL - padR;
  const H = height - padT - padB;
  const yMaxRaw = Math.max(
    ...data.map((d) => series.reduce((s, k) => s + d[k.key], 0)),
    1
  );
  const { out: gridOut, top: yTop } = gridAndAxis({
    padL, padT, W, H, yMax: yMaxRaw, yFormatter,
  });
  const slot = W / data.length;
  const barW = slot * 0.72;

  let body = gridOut;

  let lx = 28;
  for (const s of series) {
    body += `<rect x="${lx}" y="72" width="12" height="12" rx="3" fill="${s.color}"/>`;
    body += `<text x="${lx + 18}" y="82" class="label">${s.label}</text>`;
    lx += 18 + s.label.length * 7 + 26;
  }

  data.forEach((d, i) => {
    const x = padL + i * slot + (slot - barW) / 2;
    let yCursor = padT + H;
    for (const s of series) {
      const h = (d[s.key] / yTop) * H;
      yCursor -= h;
      body += `<rect x="${x.toFixed(1)}" y="${yCursor.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${s.color}" fill-opacity="0.9" rx="1.5"/>`;
    }
    if (data.length <= 26 || i % Math.ceil(data.length / 26) === 0) {
      const tx = x + barW / 2;
      body += `<text x="${tx}" y="${padT + H + 20}" class="axis" text-anchor="middle" transform="rotate(-45 ${tx} ${padT + H + 20})">${d[xKey]}</text>`;
    }
  });

  body += `<line x1="${padL}" y1="${padT + H}" x2="${padL + W}" y2="${padT + H}" stroke="${BASE.axis}" stroke-width="1.4"/>`;
  return svgDoc({ width, height, title, subtitle, badge, badgeColor, footer, body });
}

/* ==========================================================================
   Data loading helpers (shared by 05 and 06)
   ========================================================================== */

export function parseDailyCsv(csvText) {
  const lines = csvText.trim().split("\n");
  const header = lines[0].split(",");
  return lines.slice(1).map((l) => {
    const c = l.split(",");
    const o = {};
    header.forEach((h, i) => (o[h] = c[i]));
    return {
      day: o.day,
      supplyEnd: Number(o.supply_end_copm),
      transfers: Number(o.transfers),
      activeAddresses: Number(o.active_addresses),
      grossCOPM: Number(o.gross_volume_copm),
      netCOPM: Number(o.net_volume_copm),
      mintCOPM: Number(o.mint_copm),
      burnCOPM: Number(o.burn_copm),
    };
  });
}

export function toMonthly(rows) {
  const monthly = new Map();
  for (const r of rows) {
    const m = r.day.slice(0, 7);
    if (!monthly.has(m))
      monthly.set(m, { month: m, gross: 0, net: 0, transfers: 0, mint: 0, burn: 0 });
    const acc = monthly.get(m);
    acc.gross += r.grossCOPM;
    acc.net += r.netCOPM;
    acc.transfers += r.transfers;
    acc.mint += r.mintCOPM;
    acc.burn += r.burnCOPM;
  }
  return [...monthly.values()].sort((a, b) => (a.month < b.month ? -1 : 1));
}

export function provenanceFooter(manifest, lastDay) {
  const addr = `${manifest.address.slice(0, 6)}…${manifest.address.slice(-4)}`;
  return `COPM ${addr} · ${manifest.chainLabel ?? manifest.chain} · Transfer events up to ${lastDay} · source: on-chain RPC scan`;
}
