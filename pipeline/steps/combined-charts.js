// Combined charts: COPM across Polygon + Celo on the same axes.
// Reads data/polygon/ and data/celo/ directly — run after both pipelines.
import { writeFileSync } from "node:fs";
import { combinedChartsDir, copPerUsd, dataPath } from "../config/chains.js";
import { ensureDir, readJson, readText } from "../adapters/store.js";
import {
  CHAIN_PALETTES,
  setTheme,
  multiLineChart,
  groupedBarChart,
  parseDailyCsv,
  toMonthly,
  fmtUSD,
  fmtCOPM,
  fmtNum,
} from "../charts/chartlib.js";

function load(chain) {
  return {
    manifest: readJson(dataPath(chain, "manifest.json")),
    rows: parseDailyCsv(readText(dataPath(chain, "daily.csv"))),
  };
}

export async function run({ env = process.env } = {}) {
  const COP_PER_USD = copPerUsd(env);
  const OUT_DIR = combinedChartsDir();
  const polygon = load("polygon");
  const celo = load("celo");

  const lastDay = [polygon.rows.at(-1).day, celo.rows.at(-1).day].sort().at(-1);
  const footer = `COPM on Polygon + Celo · Transfer events up to ${lastDay} · source: on-chain RPC scan`;
  const badge = "Polygon + Celo";

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

  // Each chart is rendered three times: dark → charts/combined/ (GitHub docs),
  // light → charts/combined/light/ (alternative variant), site →
  // charts/combined/site/ (embedded in the site).
  for (const theme of [
    { name: "dark", dir: OUT_DIR, label: "charts/combined" },
    { name: "light", dir: new URL("light/", OUT_DIR), label: "charts/combined/light" },
    { name: "site", dir: new URL("site/", OUT_DIR), label: "charts/combined/site" },
  ]) {
    setTheme(theme.name);
    ensureDir(theme.dir);
    renderAll((name, content) => {
      writeFileSync(new URL(`${name}.svg`, theme.dir), content);
      console.log(`wrote ${theme.label}/${name}.svg`);
    });
  }

  console.log("done. 4 charts (dark + light + site) in charts/combined/");

  function renderAll(save) {
    // Palette colors are read here, after setTheme(), so each pass picks up
    // the active theme.
    const badgeColor = CHAIN_PALETTES.combined.primary;
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

    save(
      "03-cumulative-volume-by-chain",
      multiLineChart({
        title: "COPM — Cumulative Gross Volume by Chain (USD)",
        subtitle: `Running total of on-chain volume since each deployment`,
        badge,
        badgeColor,
        footer,
        series: [
          { label: "Polygon", color: CHAIN_PALETTES.polygon.primary, data: cumulative(polygon.rows, COP_PER_USD) },
          { label: "Celo", color: CHAIN_PALETTES.celo.primary, data: cumulative(celo.rows, COP_PER_USD) },
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
  }
}

function cumulative(rows, copPerUsdRate) {
  let acc = 0;
  return rows.map((r) => {
    acc += r.grossCOPM / copPerUsdRate;
    return { day: r.day, value: acc };
  });
}
