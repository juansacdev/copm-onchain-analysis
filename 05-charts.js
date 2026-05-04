import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const COP_PER_USD = Number(process.env.COP_PER_USD ?? 4000);
const CHARTS_DIR = new URL("./charts/", import.meta.url);
if (!existsSync(CHARTS_DIR)) mkdirSync(CHARTS_DIR);

const csv = readFileSync(new URL("./daily.csv", import.meta.url), "utf8");
const lines = csv.trim().split("\n");
const header = lines[0].split(",");
const rows = lines.slice(1).map((l) => {
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

const monthly = new Map();
for (const r of rows) {
  const m = r.day.slice(0, 7);
  if (!monthly.has(m))
    monthly.set(m, { month: m, gross: 0, net: 0, transfers: 0 });
  const acc = monthly.get(m);
  acc.gross += r.grossCOPM;
  acc.net += r.netCOPM;
  acc.transfers += r.transfers;
}
const monthlyRows = [...monthly.values()].sort((a, b) =>
  a.month < b.month ? -1 : 1
);

const top10Volume = [...rows]
  .sort((a, b) => b.grossCOPM - a.grossCOPM)
  .slice(0, 10);

const PALETTE = {
  bg: "#0d1117",
  panel: "#161b22",
  grid: "#30363d",
  axis: "#8b949e",
  text: "#e6edf3",
  primary: "#58a6ff",
  accent: "#3fb950",
  warn: "#f0883e",
  danger: "#f85149",
  muted: "#7d8590",
};

function svgWrap(width, height, title, subtitle, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <style>
    .title { font: 600 18px -apple-system, system-ui, sans-serif; fill: ${PALETTE.text}; }
    .subtitle { font: 400 12px -apple-system, system-ui, sans-serif; fill: ${PALETTE.muted}; }
    .axis { font: 400 11px -apple-system, system-ui, sans-serif; fill: ${PALETTE.axis}; }
    .label { font: 500 12px -apple-system, system-ui, sans-serif; fill: ${PALETTE.text}; }
    .annot { font: 600 11px -apple-system, system-ui, sans-serif; fill: ${PALETTE.warn}; }
  </style>
  <rect width="${width}" height="${height}" fill="${PALETTE.bg}"/>
  <text x="24" y="32" class="title">${title}</text>
  <text x="24" y="50" class="subtitle">${subtitle}</text>
  ${body}
</svg>`;
}

function fmtUSD(n) {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}
function fmtCOPM(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return `${n.toFixed(0)}`;
}
function fmtNum(n) {
  return n.toLocaleString("en-US");
}

function dateMonthLabel(d) {
  const date = new Date(d + "T00:00:00Z");
  return date.toLocaleString("en-US", { month: "short", year: "2-digit" });
}

function lineChart({
  width = 1000,
  height = 480,
  title,
  subtitle,
  data,
  xKey = "day",
  yKey,
  yFormatter = fmtNum,
  fillBelow = false,
  highlightTop = 0,
  color = PALETTE.primary,
}) {
  const padL = 70,
    padR = 30,
    padT = 70,
    padB = 60;
  const W = width - padL - padR;
  const H = height - padT - padB;

  const xs = data.map((d) => +new Date(d[xKey] + "T00:00:00Z"));
  const ys = data.map((d) => d[yKey]);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMax = Math.max(...ys, 1);

  const xScale = (x) => padL + ((x - xMin) / (xMax - xMin)) * W;
  const yScale = (y) => padT + H - (y / yMax) * H;

  const points = data.map((d) => [xScale(+new Date(d[xKey] + "T00:00:00Z")), yScale(d[yKey])]);

  let body = "";
  for (let i = 0; i <= 5; i++) {
    const v = (yMax * i) / 5;
    const y = padT + H - (v / yMax) * H;
    body += `<line x1="${padL}" y1="${y}" x2="${padL + W}" y2="${y}" stroke="${PALETTE.grid}" stroke-width="1"/>`;
    body += `<text x="${padL - 8}" y="${y + 4}" class="axis" text-anchor="end">${yFormatter(v)}</text>`;
  }

  const startDate = new Date(xMin);
  const endDate = new Date(xMax);
  const months = [];
  let cursor = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1));
  while (cursor <= endDate) {
    months.push(new Date(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 3);
  }
  for (const m of months) {
    const x = xScale(+m);
    body += `<line x1="${x}" y1="${padT}" x2="${x}" y2="${padT + H}" stroke="${PALETTE.grid}" stroke-width="1" stroke-dasharray="2,4"/>`;
    body += `<text x="${x}" y="${padT + H + 18}" class="axis" text-anchor="middle">${dateMonthLabel(m.toISOString().slice(0, 10))}</text>`;
  }

  if (fillBelow) {
    const areaPath =
      `M ${points[0][0]} ${padT + H} ` +
      points.map((p) => `L ${p[0]} ${p[1]}`).join(" ") +
      ` L ${points[points.length - 1][0]} ${padT + H} Z`;
    body += `<path d="${areaPath}" fill="${color}" fill-opacity="0.18"/>`;
  }

  const linePath =
    `M ${points[0][0]} ${points[0][1]} ` +
    points.slice(1).map((p) => `L ${p[0]} ${p[1]}`).join(" ");
  body += `<path d="${linePath}" stroke="${color}" stroke-width="1.5" fill="none"/>`;

  if (highlightTop > 0) {
    const topIdx = data
      .map((d, i) => [d[yKey], i])
      .sort((a, b) => b[0] - a[0])
      .slice(0, highlightTop)
      .map(([, i]) => i);
    for (const i of topIdx) {
      const [x, y] = points[i];
      body += `<circle cx="${x}" cy="${y}" r="4" fill="${PALETTE.warn}" stroke="${PALETTE.bg}" stroke-width="2"/>`;
    }
    if (topIdx.length) {
      const i = topIdx[0];
      const [x, y] = points[i];
      const label = `${data[i][xKey]}: ${yFormatter(data[i][yKey])}`;
      const lx = Math.min(x + 10, padL + W - 180);
      const ly = Math.max(y - 10, padT + 20);
      body += `<text x="${lx}" y="${ly}" class="annot">${label}</text>`;
    }
  }

  body += `<line x1="${padL}" y1="${padT + H}" x2="${padL + W}" y2="${padT + H}" stroke="${PALETTE.axis}" stroke-width="1.5"/>`;

  return svgWrap(width, height, title, subtitle, body);
}

function barChart({
  width = 1000,
  height = 480,
  title,
  subtitle,
  data,
  xKey,
  yKey,
  yFormatter = fmtNum,
  color = PALETTE.primary,
  highlightMax = false,
}) {
  const padL = 70,
    padR = 30,
    padT = 70,
    padB = 90;
  const W = width - padL - padR;
  const H = height - padT - padB;
  const yMax = Math.max(...data.map((d) => d[yKey]), 1);
  const barW = (W / data.length) * 0.75;
  const gap = (W / data.length) * 0.25;

  let body = "";
  for (let i = 0; i <= 5; i++) {
    const v = (yMax * i) / 5;
    const y = padT + H - (v / yMax) * H;
    body += `<line x1="${padL}" y1="${y}" x2="${padL + W}" y2="${y}" stroke="${PALETTE.grid}" stroke-width="1"/>`;
    body += `<text x="${padL - 8}" y="${y + 4}" class="axis" text-anchor="end">${yFormatter(v)}</text>`;
  }

  let maxIdx = 0;
  if (highlightMax) {
    data.forEach((d, i) => {
      if (d[yKey] > data[maxIdx][yKey]) maxIdx = i;
    });
  }

  data.forEach((d, i) => {
    const x = padL + i * (W / data.length) + gap / 2;
    const h = (d[yKey] / yMax) * H;
    const y = padT + H - h;
    const fill = highlightMax && i === maxIdx ? PALETTE.warn : color;
    body += `<rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="${fill}" fill-opacity="0.85" rx="2"/>`;
    if (data.length <= 24 || i % Math.ceil(data.length / 24) === 0) {
      const tx = x + barW / 2;
      body += `<text x="${tx}" y="${padT + H + 18}" class="axis" text-anchor="middle" transform="rotate(-45 ${tx} ${padT + H + 18})">${d[xKey]}</text>`;
    }
  });

  body += `<line x1="${padL}" y1="${padT + H}" x2="${padL + W}" y2="${padT + H}" stroke="${PALETTE.axis}" stroke-width="1.5"/>`;
  return svgWrap(width, height, title, subtitle, body);
}

function horizontalBarChart({
  width = 1000,
  height = 480,
  title,
  subtitle,
  data,
  xKey,
  yKey,
  yFormatter = fmtNum,
  color = PALETTE.primary,
}) {
  const padL = 130,
    padR = 100,
    padT = 70,
    padB = 30;
  const W = width - padL - padR;
  const H = height - padT - padB;
  const xMax = Math.max(...data.map((d) => d[yKey]), 1);
  const barH = (H / data.length) * 0.7;
  const gap = (H / data.length) * 0.3;

  let body = "";
  data.forEach((d, i) => {
    const y = padT + i * (H / data.length) + gap / 2;
    const w = (d[yKey] / xMax) * W;
    const fill = i === 0 ? PALETTE.warn : color;
    body += `<text x="${padL - 8}" y="${y + barH / 2 + 4}" class="label" text-anchor="end">${d[xKey]}</text>`;
    body += `<rect x="${padL}" y="${y}" width="${w}" height="${barH}" fill="${fill}" fill-opacity="0.85" rx="2"/>`;
    body += `<text x="${padL + w + 6}" y="${y + barH / 2 + 4}" class="label">${yFormatter(d[yKey])}</text>`;
  });

  return svgWrap(width, height, title, subtitle, body);
}

function stackedBarChart({
  width = 1000,
  height = 480,
  title,
  subtitle,
  data,
  xKey,
  series,
  yFormatter = fmtNum,
}) {
  const padL = 70,
    padR = 30,
    padT = 90,
    padB = 90;
  const W = width - padL - padR;
  const H = height - padT - padB;
  const yMax = Math.max(...data.map((d) => series.reduce((s, k) => s + d[k.key], 0)), 1);
  const barW = (W / data.length) * 0.75;
  const gap = (W / data.length) * 0.25;

  let body = "";

  let lx = 24;
  series.forEach((s) => {
    body += `<rect x="${lx}" y="58" width="12" height="12" fill="${s.color}" rx="2"/>`;
    body += `<text x="${lx + 18}" y="68" class="label">${s.label}</text>`;
    lx += 18 + 12 + s.label.length * 7 + 16;
  });

  for (let i = 0; i <= 5; i++) {
    const v = (yMax * i) / 5;
    const y = padT + H - (v / yMax) * H;
    body += `<line x1="${padL}" y1="${y}" x2="${padL + W}" y2="${y}" stroke="${PALETTE.grid}" stroke-width="1"/>`;
    body += `<text x="${padL - 8}" y="${y + 4}" class="axis" text-anchor="end">${yFormatter(v)}</text>`;
  }

  data.forEach((d, i) => {
    const x = padL + i * (W / data.length) + gap / 2;
    let yCursor = padT + H;
    for (const s of series) {
      const v = d[s.key];
      const h = (v / yMax) * H;
      yCursor -= h;
      body += `<rect x="${x}" y="${yCursor}" width="${barW}" height="${h}" fill="${s.color}" fill-opacity="0.9" rx="1"/>`;
    }
    if (data.length <= 24 || i % Math.ceil(data.length / 24) === 0) {
      const tx = x + barW / 2;
      body += `<text x="${tx}" y="${padT + H + 18}" class="axis" text-anchor="middle" transform="rotate(-45 ${tx} ${padT + H + 18})">${d[xKey]}</text>`;
    }
  });

  body += `<line x1="${padL}" y1="${padT + H}" x2="${padL + W}" y2="${padT + H}" stroke="${PALETTE.axis}" stroke-width="1.5"/>`;
  return svgWrap(width, height, title, subtitle, body);
}

function save(name, content) {
  writeFileSync(new URL(`./charts/${name}.svg`, import.meta.url), content);
  console.log(`wrote charts/${name}.svg`);
}

console.log(`generating ${rows.length} days, ${monthlyRows.length} months...`);

save(
  "01-daily-transfers",
  lineChart({
    title: "COPM — Daily Transfers (Polygon)",
    subtitle: `${rows[0].day} → ${rows[rows.length - 1].day} · peak: ${fmtNum(Math.max(...rows.map((r) => r.transfers)))} txns`,
    data: rows,
    yKey: "transfers",
    yFormatter: fmtNum,
    color: PALETTE.primary,
    fillBelow: true,
    highlightTop: 1,
  })
);

save(
  "02-daily-volume-usd",
  lineChart({
    title: "COPM — Daily Gross Volume (USD)",
    subtitle: `Conversion: 1 USD = ${COP_PER_USD} COP · peak day: ${fmtUSD(Math.max(...rows.map((r) => r.grossCOPM / COP_PER_USD)))}`,
    data: rows.map((r) => ({ ...r, volumeUSD: r.grossCOPM / COP_PER_USD })),
    yKey: "volumeUSD",
    yFormatter: fmtUSD,
    color: PALETTE.accent,
    fillBelow: true,
    highlightTop: 1,
  })
);

save(
  "03-supply-over-time",
  lineChart({
    title: "COPM — Circulating Supply Over Time",
    subtitle: `End-of-day supply on Polygon · peak: ${fmtCOPM(Math.max(...rows.map((r) => r.supplyEnd)))} COPM`,
    data: rows,
    yKey: "supplyEnd",
    yFormatter: fmtCOPM,
    color: PALETTE.warn,
    fillBelow: true,
    highlightTop: 1,
  })
);

save(
  "04-monthly-volume-usd",
  barChart({
    title: "COPM — Monthly Gross Volume (USD)",
    subtitle: `${monthlyRows.length} months · peak month: ${fmtUSD(Math.max(...monthlyRows.map((m) => m.gross / COP_PER_USD)))}`,
    data: monthlyRows.map((m) => ({
      month: m.month,
      grossUSD: m.gross / COP_PER_USD,
    })),
    xKey: "month",
    yKey: "grossUSD",
    yFormatter: fmtUSD,
    color: PALETTE.accent,
    highlightMax: true,
  })
);

save(
  "05-top10-volume-days",
  horizontalBarChart({
    title: "COPM — Top 10 Days by Gross Volume",
    subtitle: `9 of 10 are in Aug-Nov 2025`,
    data: top10Volume.map((r) => ({
      day: r.day,
      grossUSD: r.grossCOPM / COP_PER_USD,
    })),
    xKey: "day",
    yKey: "grossUSD",
    yFormatter: fmtUSD,
    color: PALETTE.primary,
  })
);

save(
  "06-monthly-mints-burns",
  stackedBarChart({
    title: "COPM — Monthly Mints vs Burns (COPM)",
    subtitle: `Almost 1:1 over 2.6 years → healthy bidirectional peg`,
    data: (() => {
      const mb = new Map();
      for (const r of rows) {
        const m = r.day.slice(0, 7);
        if (!mb.has(m)) mb.set(m, { month: m, mint: 0, burn: 0 });
        mb.get(m).mint += r.mintCOPM;
        mb.get(m).burn += r.burnCOPM;
      }
      return [...mb.values()].sort((a, b) => (a.month < b.month ? -1 : 1));
    })(),
    xKey: "month",
    series: [
      { key: "mint", label: "Mints", color: PALETTE.accent },
      { key: "burn", label: "Burns", color: PALETTE.danger },
    ],
    yFormatter: fmtCOPM,
  })
);

console.log(`\ndone. ${6} charts in ./charts/`);
