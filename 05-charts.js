import { readFileSync, writeFileSync } from "node:fs";
import { CHAIN_KEY, CHARTS_DIR, COP_PER_USD, dataPath } from "./config.js";
import {
  CHAIN_PALETTES,
  lineChart,
  barChart,
  horizontalBarChart,
  stackedBarChart,
  parseDailyCsv,
  toMonthly,
  provenanceFooter,
  fmtUSD,
  fmtCOPM,
  fmtNum,
} from "./chartlib.js";

const palette = CHAIN_PALETTES[CHAIN_KEY];
const manifest = JSON.parse(readFileSync(dataPath("manifest.json"), "utf8"));
const rows = parseDailyCsv(readFileSync(dataPath("daily.csv"), "utf8"));
const monthlyRows = toMonthly(rows);
const lastDay = rows.at(-1).day;
const footer = provenanceFooter(manifest, lastDay);
const badge = palette.label;
const badgeColor = palette.primary;

const top10Volume = [...rows]
  .sort((a, b) => b.grossCOPM - a.grossCOPM)
  .slice(0, 10);

function save(name, content) {
  writeFileSync(new URL(`${name}.svg`, CHARTS_DIR), content);
  console.log(`wrote charts/${CHAIN_KEY}/${name}.svg`);
}

console.log(`chain: ${CHAIN_KEY} — ${rows.length} days, ${monthlyRows.length} months`);

save(
  "01-daily-transfers",
  lineChart({
    title: `COPM — Daily Transfers`,
    subtitle: `${rows[0].day} → ${lastDay} · peak: ${fmtNum(Math.max(...rows.map((r) => r.transfers)))} transfers in one day`,
    badge,
    badgeColor,
    footer,
    data: rows,
    yKey: "transfers",
    yFormatter: fmtNum,
    color: palette.primary,
  })
);

save(
  "02-daily-volume-usd",
  lineChart({
    title: `COPM — Daily Gross Volume (USD)`,
    subtitle: `Conversion: 1 USD = ${COP_PER_USD} COP · peak day: ${fmtUSD(Math.max(...rows.map((r) => r.grossCOPM / COP_PER_USD)))}`,
    badge,
    badgeColor,
    footer,
    data: rows.map((r) => ({ ...r, volumeUSD: r.grossCOPM / COP_PER_USD })),
    yKey: "volumeUSD",
    yFormatter: fmtUSD,
    color: palette.primary,
  })
);

save(
  "03-supply-over-time",
  lineChart({
    title: `COPM — Circulating Supply Over Time`,
    subtitle: `End-of-day supply · peak: ${fmtCOPM(Math.max(...rows.map((r) => r.supplyEnd)))} COPM`,
    badge,
    badgeColor,
    footer,
    data: rows,
    yKey: "supplyEnd",
    yFormatter: fmtCOPM,
    color: palette.secondary,
  })
);

save(
  "04-monthly-volume-usd",
  barChart({
    title: `COPM — Monthly Gross Volume (USD)`,
    subtitle: `${monthlyRows.length} months · peak month: ${fmtUSD(Math.max(...monthlyRows.map((m) => m.gross / COP_PER_USD)))}`,
    badge,
    badgeColor,
    footer,
    data: monthlyRows.map((m) => ({
      month: m.month,
      grossUSD: m.gross / COP_PER_USD,
    })),
    xKey: "month",
    yKey: "grossUSD",
    yFormatter: fmtUSD,
    color: palette.primary,
  })
);

save(
  "05-top10-volume-days",
  horizontalBarChart({
    title: `COPM — Top 10 Days by Gross Volume`,
    subtitle: `Highest single-day volumes on ${palette.label}`,
    badge,
    badgeColor,
    footer,
    data: top10Volume.map((r) => ({
      day: r.day,
      grossUSD: r.grossCOPM / COP_PER_USD,
    })),
    xKey: "day",
    yKey: "grossUSD",
    yFormatter: fmtUSD,
    color: palette.primary,
  })
);

save(
  "06-monthly-mints-burns",
  stackedBarChart({
    title: `COPM — Monthly Mints vs Burns (COPM)`,
    subtitle: `Issuance vs redemption month by month — balance indicates bidirectional peg operation`,
    badge,
    badgeColor,
    footer,
    data: monthlyRows.map((m) => ({ month: m.month, mint: m.mint, burn: m.burn })),
    xKey: "month",
    series: [
      { key: "mint", label: "Mints", color: "#3fb950" },
      { key: "burn", label: "Burns", color: "#f85149" },
    ],
    yFormatter: fmtCOPM,
  })
);

console.log(`done. 6 charts in charts/${CHAIN_KEY}/`);
