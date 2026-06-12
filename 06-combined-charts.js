// Combined charts: COPM across Polygon + Celo on the same axes.
// Reads data/polygon/ and data/celo/ directly — run after both pipelines.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import {
  CHAIN_PALETTES,
  multiLineChart,
  groupedBarChart,
  parseDailyCsv,
  toMonthly,
  fmtUSD,
  fmtCOPM,
  fmtNum,
} from "./chartlib.js";

const COP_PER_USD = Number(process.env.COP_PER_USD ?? 4000);
const OUT_DIR = new URL("./charts/combined/", import.meta.url);
mkdirSync(OUT_DIR, { recursive: true });

function load(chain) {
  const base = new URL(`./data/${chain}/`, import.meta.url);
  return {
    manifest: JSON.parse(readFileSync(new URL("manifest.json", base), "utf8")),
    rows: parseDailyCsv(readFileSync(new URL("daily.csv", base), "utf8")),
  };
}

const polygon = load("polygon");
const celo = load("celo");

const lastDay = [polygon.rows.at(-1).day, celo.rows.at(-1).day].sort().at(-1);
const footer = `COPM on Polygon + Celo · Transfer events up to ${lastDay} · source: on-chain RPC scan`;
const badge = "Polygon + Celo";
const badgeColor = CHAIN_PALETTES.combined.primary;

const pMonthly = toMonthly(polygon.rows);
const cMonthly = toMonthly(celo.rows);

// Align both chains on the union of months.
const monthSet = [...new Set([...pMonthly, ...cMonthly].map((m) => m.month))].sort();
const pByMonth = new Map(pMonthly.map((m) => [m.month, m]));
const cByMonth = new Map(cMonthly.map((m) => [m.month, m]));
const monthly = monthSet.map((month) => ({
  label: month,
  polygon: (pByMonth.get(month)?.gross ?? 0) / COP_PER_USD,
  celo: (cByMonth.get(month)?.gross ?? 0) / COP_PER_USD,
  polygonTx: pByMonth.get(month)?.transfers ?? 0,
  celoTx: cByMonth.get(month)?.transfers ?? 0,
}));

function save(name, content) {
  writeFileSync(new URL(`${name}.svg`, OUT_DIR), content);
  console.log(`wrote charts/combined/${name}.svg`);
}

const series = [
  { key: "polygon", label: "Polygon", color: CHAIN_PALETTES.polygon.primary },
  { key: "celo", label: "Celo", color: CHAIN_PALETTES.celo.primary },
];

save(
  "01-monthly-volume-by-chain",
  groupedBarChart({
    title: "COPM — Monthly Gross Volume by Chain (USD)",
    subtitle: `1 USD = ${COP_PER_USD} COP · ${monthSet[0]} → ${monthSet.at(-1)}`,
    badge,
    badgeColor,
    footer,
    data: monthly,
    series,
    yFormatter: fmtUSD,
  })
);

save(
  "02-monthly-transfers-by-chain",
  groupedBarChart({
    title: "COPM — Monthly Transfers by Chain",
    subtitle: `Transfer events per calendar month on each chain`,
    badge,
    badgeColor,
    footer,
    data: monthly.map((m) => ({ label: m.label, polygon: m.polygonTx, celo: m.celoTx })),
    series,
    yFormatter: fmtNum,
  })
);

function cumulative(rows) {
  let acc = 0;
  return rows.map((r) => {
    acc += r.grossCOPM / COP_PER_USD;
    return { day: r.day, value: acc };
  });
}

save(
  "03-cumulative-volume-by-chain",
  multiLineChart({
    title: "COPM — Cumulative Gross Volume by Chain (USD)",
    subtitle: `Running total of on-chain volume since each deployment`,
    badge,
    badgeColor,
    footer,
    series: [
      { label: "Polygon", color: CHAIN_PALETTES.polygon.primary, data: cumulative(polygon.rows) },
      { label: "Celo", color: CHAIN_PALETTES.celo.primary, data: cumulative(celo.rows) },
    ],
    yFormatter: fmtUSD,
  })
);

save(
  "04-supply-by-chain",
  multiLineChart({
    title: "COPM — Circulating Supply by Chain",
    subtitle: `End-of-day supply derived from on-chain mints and burns`,
    badge,
    badgeColor,
    footer,
    series: [
      {
        label: "Polygon",
        color: CHAIN_PALETTES.polygon.primary,
        data: polygon.rows.map((r) => ({ day: r.day, value: r.supplyEnd })),
      },
      {
        label: "Celo",
        color: CHAIN_PALETTES.celo.primary,
        data: celo.rows.map((r) => ({ day: r.day, value: r.supplyEnd })),
      },
    ],
    yFormatter: fmtCOPM,
  })
);

console.log("done. 4 charts in charts/combined/");
