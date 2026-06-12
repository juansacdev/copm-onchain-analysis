import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { CHAIN_KEY, CHARTS_DIR, COP_PER_USD, dataPath } from "./config.js";
import {
  BASE,
  CHAIN_PALETTES,
  setTheme,
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

const top10Volume = [...rows]
  .sort((a, b) => b.grossCOPM - a.grossCOPM)
  .slice(0, 10);

console.log(`chain: ${CHAIN_KEY} — ${rows.length} days, ${monthlyRows.length} months`);

// Each chart is rendered twice: dark → charts/<chain>/ (GitHub docs),
// light → charts/<chain>/light/ (embedded in the site).
for (const theme of [
  { name: "dark", dir: CHARTS_DIR, label: `charts/${CHAIN_KEY}` },
  { name: "light", dir: new URL("light/", CHARTS_DIR), label: `charts/${CHAIN_KEY}/light` },
]) {
  setTheme(theme.name);
  mkdirSync(theme.dir, { recursive: true });
  renderAll((name, content) => {
    writeFileSync(new URL(`${name}.svg`, theme.dir), content);
    console.log(`wrote ${theme.label}/${name}.svg`);
  });
}

console.log(`done. 6 charts (dark + light) in charts/${CHAIN_KEY}/`);

function renderAll(save) {
  // Palette colors are read here, after setTheme(), so each pass picks up
  // the active theme.
  const badge = palette.label;
  const badgeColor = palette.primary;

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
        { key: "mint", label: "Mints", color: BASE.mint },
        { key: "burn", label: "Burns", color: BASE.burn },
      ],
      yFormatter: fmtCOPM,
    })
  );
}
