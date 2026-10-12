import { writeFileSync } from "node:fs";
import { chartsDir, dataPath } from "../config/chains.js";
import { ensureDir, readJson, readText } from "../adapters/store.js";
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
} from "../charts/chartlib.js";

export async function run({ chainKey }) {
  const CHARTS_DIR = chartsDir(chainKey);
  const palette = CHAIN_PALETTES[chainKey];
  const manifest = readJson(dataPath(chainKey, "manifest.json"));
  const rows = parseDailyCsv(readText(dataPath(chainKey, "daily.csv")));
  const monthlyRows = toMonthly(rows);
  const lastDay = rows.at(-1).day;
  const footer = provenanceFooter(manifest, lastDay);

  // The chart is in USD, so the ranking is too: each day at its own rate.
  const top10Volume = [...rows]
    .sort((a, b) => b.grossUSD - a.grossUSD)
    .slice(0, 10);
  const latest = rows.at(-1);

  console.log(`chain: ${chainKey} — ${rows.length} days, ${monthlyRows.length} months`);

  // Each chart is rendered three times: dark → charts/<chain>/ (GitHub docs),
  // light → charts/<chain>/light/ (alternative variant), site →
  // charts/<chain>/site/ (embedded in the site).
  for (const theme of [
    { name: "dark", dir: CHARTS_DIR, label: `charts/${chainKey}` },
    { name: "light", dir: new URL("light/", CHARTS_DIR), label: `charts/${chainKey}/light` },
    { name: "site", dir: new URL("site/", CHARTS_DIR), label: `charts/${chainKey}/site` },
  ]) {
    setTheme(theme.name);
    ensureDir(theme.dir);
    renderAll((name, content) => {
      writeFileSync(new URL(`${name}.svg`, theme.dir), content);
      console.log(`wrote ${theme.label}/${name}.svg`);
    });
  }

  console.log(`done. 6 charts (dark + light + site) in charts/${chainKey}/`);

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
        subtitle: `Each day at its own TRM (latest ${latest.rate} COP per USD, ${latest.day}) · peak day: ${fmtUSD(Math.max(...rows.map((r) => r.grossUSD)))}`,
        badge,
        badgeColor,
        footer,
        data: rows.map((r) => ({ ...r, volumeUSD: r.grossUSD })),
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
        subtitle: `${monthlyRows.length} months · each day at its own TRM · peak month: ${fmtUSD(Math.max(...monthlyRows.map((m) => m.grossUSD)))}`,
        badge,
        badgeColor,
        footer,
        data: monthlyRows.map((m) => ({
          month: m.month,
          grossUSD: m.grossUSD,
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
          grossUSD: r.grossUSD,
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
}
