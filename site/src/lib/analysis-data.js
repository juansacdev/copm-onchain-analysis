// Reads the repository data files and returns the figures the analysis page
// needs, as raw values (numbers, BigInt, ISO dates). Formatting is a separate
// concern (format.js). Plain JS, no Astro imports, so node --test can run it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sumUsd } from "../../../pipeline/domain/rates.js";

export const CHAIN_KEYS = ["polygon", "celo"];

const readJson = (dir, chain, name) => {
  const file = join(dir, chain, name);
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    throw new Error(`cannot read ${chain}/${name}: ${err.message}`);
  }
};

const RANKING_SIZE = 10;
export const TAKEOFF_TRANSFERS = 100;
export const TURNOVER_WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;

const isoDay = (seconds) => new Date(seconds * 1000).toISOString().slice(0, 10);

// daily.csv -> [{ day, supply, transfers, grossCopm, grossUsd, rate }].
// The USD column is each day valued at its own TRM by the pipeline; the site
// never converts COPM with a rate of its own.
function readDaily(dir, chain) {
  const file = join(dir, chain, "daily.csv");
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (err) {
    throw new Error(`cannot read ${chain}/daily.csv: ${err.message}`);
  }
  const [header, ...lines] = text.trim().split("\n");
  const columns = header.split(",");
  const at = (name) => {
    const index = columns.indexOf(name);
    if (index < 0) throw new Error(`${chain}/daily.csv has no column "${name}"`);
    return index;
  };
  const [day, supply, transfers, gross, grossUsd, rate] = [
    "day",
    "supply_end_copm",
    "transfers",
    "gross_volume_copm",
    "gross_volume_usd",
    "cop_per_usd",
  ].map(at);
  return lines.map((line) => {
    const cells = line.split(",");
    return {
      day: cells[day],
      supply: Number(cells[supply]),
      transfers: Number(cells[transfers]),
      grossCopm: Number(cells[gross]),
      grossUsd: Number(cells[grossUsd]),
      rate: Number(cells[rate]),
    };
  });
}

const sumOf = (rows, pick) => rows.reduce((total, row) => total + pick(row), 0);
const byDescThenDay = (pick) => (a, b) => pick(b) - pick(a) || (a.day < b.day ? -1 : 1);

// A month in USD is the sum of its days' USD amounts, each at its own rate.
function monthlyTotals(daily) {
  const months = new Map();
  for (const row of daily) {
    const key = row.day.slice(0, 7);
    const acc = months.get(key) ?? { key, usd: 0, transfers: 0 };
    acc.usd = sumUsd([acc.usd, row.grossUsd]);
    acc.transfers += row.transfers;
    months.set(key, acc);
  }
  return [...months.values()];
}

// Calendar month difference: "2025-05" - "2025-02" = 3.
function monthsBetween(fromKey, toKey) {
  const [fromYear, fromMonth] = fromKey.split("-").map(Number);
  const [toYear, toMonth] = toKey.split("-").map(Number);
  return (toYear - fromYear) * 12 + (toMonth - fromMonth);
}

function previousMonth(key) {
  const [year, month] = key.split("-").map(Number);
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
}

// A month is complete when the series reaches its last calendar day.
function isCompleteMonth(key, lastDay) {
  if (key < lastDay.slice(0, 7)) return true;
  if (key > lastDay.slice(0, 7)) return false;
  const next = new Date(Date.parse(`${lastDay}T00:00:00Z`) + DAY_MS);
  return next.getUTCMonth() !== new Date(Date.parse(`${lastDay}T00:00:00Z`)).getUTCMonth();
}

// What happened after the peak month, over complete months only: the range of
// the months in between, the best month after the peak ("rebound") and the
// latest complete month. null when the series has no such months.
function afterPeak(months, peakKey, lastDay) {
  const complete = months.filter((m) => isCompleteMonth(m.key, lastDay));
  const after = complete.filter((m) => m.key > peakKey);
  if (after.length === 0) return null;
  const rebound = after.reduce((a, b) => (b.usd > a.usd ? b : a));
  const between = after.filter((m) => m.key < rebound.key);
  const latest = after.at(-1);
  return {
    settledFrom: between[0]?.key ?? null,
    settledTo: between.at(-1)?.key ?? null,
    settledMinUsd: between.length ? Math.min(...between.map((m) => m.usd)) : null,
    settledMaxUsd: between.length ? Math.max(...between.map((m) => m.usd)) : null,
    reboundMonth: rebound.key,
    reboundUsd: rebound.usd,
    latestMonth: latest.key,
    latestUsd: latest.usd,
  };
}

function seriesFigures(daily, deployDate, lastDay) {
  const months = monthlyTotals(daily);
  const peakMonth = months.reduce((a, b) => (b.usd > a.usd ? b : a));
  const peakTxMonth = months.reduce((a, b) => (b.transfers > a.transfers ? b : a));

  const topVolume = [...daily].sort(byDescThenDay((r) => r.grossUsd)).slice(0, RANKING_SIZE);
  const topTx = [...daily].sort(byDescThenDay((r) => r.transfers)).slice(0, RANKING_SIZE);
  const windowFrom = previousMonth(peakMonth.key);
  const above = daily.find((r) => r.transfers > TAKEOFF_TRANSFERS);

  const lastWindow = daily.slice(-TURNOVER_WINDOW_DAYS);
  const averageSupply = sumOf(lastWindow, (r) => r.supply) / lastWindow.length;

  return {
    grossUsd: sumUsd(daily.map((r) => r.grossUsd)),
    months,
    peakMonth,
    peakTxMonth: { key: peakTxMonth.key, count: peakTxMonth.transfers },
    peakTxMonthsAfterDeploy: monthsBetween(deployDate.slice(0, 7), peakTxMonth.key),
    recordVolume: { day: topVolume[0].day, usd: topVolume[0].grossUsd, transfers: topVolume[0].transfers },
    recordTx: { day: topTx[0].day, count: topTx[0].transfers },
    topVolumeDays: topVolume.map((r) => ({ day: r.day, usd: r.grossUsd, transfers: r.transfers })),
    topTxDays: topTx.map((r) => ({ day: r.day, count: r.transfers })),
    topTxWindow: {
      from: windowFrom,
      to: peakMonth.key,
      count: topTx.filter((r) => r.day.slice(0, 7) >= windowFrom && r.day.slice(0, 7) <= peakMonth.key).length,
    },
    takeoff: above
      ? {
          day: above.day,
          daysFromDeploy: Math.round((Date.parse(`${above.day}T00:00:00Z`) - Date.parse(`${deployDate}T00:00:00Z`)) / DAY_MS),
        }
      : null,
    turnoverMonthly: averageSupply === 0 ? 0 : sumOf(lastWindow, (r) => r.grossCopm) / averageSupply,
    afterPeak: afterPeak(months, peakMonth.key, lastDay),
  };
}

function loadChain(dataDir, key) {
  const summary = readJson(dataDir, key, "summary.json");
  const state = readJson(dataDir, key, "state.json");
  const manifest = readJson(dataDir, key, "manifest.json");
  const holders = readJson(dataDir, key, "holders.json");
  const validation = readJson(dataDir, key, "validation.json");
  const daily = readDaily(dataDir, key);
  const deployDate = manifest.deployTimestamp.slice(0, 10);
  const series = seriesFigures(daily, deployDate, summary.range.lastDay);

  return {
    key,
    label: manifest.chainLabel,
    address: manifest.address,
    deployDate,
    firstDay: summary.range.firstDay,
    lastDay: summary.range.lastDay,
    totalDays: summary.range.totalDays,
    transfers: state.transfers,
    approvals: state.approvals,
    adminEvents: state.adminEvents,
    events: state.transfers + state.approvals + state.adminEvents,
    checkpointBlock: state.lastBlock,
    checkpointDate: isoDay(state.lastBlockTime),
    supplyWei: BigInt(state.totalSupply),
    holders: holders.holders,
    frozen: holders.frozen.length,
    checksPassed: validation.passed,
    supplyExact: validation.checks.some((c) => c.id === "supply-exact" && c.ok === true),
    checksTotal: validation.checks.length,
    validatedDate: validation.validatedAt.slice(0, 10),
    avgDailyTransfers: summary.averages.avgDailyTransfers,
    avgTicketUsd: series.grossUsd / state.transfers,
    // The TRM at the end of this series and its range over it.
    fx: {
      latest: daily.at(-1).rate,
      latestDay: daily.at(-1).day,
      min: Math.min(...daily.map((r) => r.rate)),
      max: Math.max(...daily.map((r) => r.rate)),
    },
    ...series,
  };
}

const sum = (items, pick) => items.reduce((total, item) => total + pick(item), 0);

export function loadAnalysisData({ dataDir }) {
  const chains = {};
  for (const key of CHAIN_KEYS) chains[key] = loadChain(dataDir, key);
  const all = Object.values(chains);
  const latest = all.map((c) => c.fx).reduce((a, b) => (b.latestDay > a.latestDay ? b : a));

  return {
    fx: {
      latest: latest.latest,
      latestDay: latest.latestDay,
      min: Math.min(...all.map((c) => c.fx.min)),
      max: Math.max(...all.map((c) => c.fx.max)),
    },
    chains,
    combined: {
      chainCount: all.length,
      transfers: sum(all, (c) => c.transfers),
      approvals: sum(all, (c) => c.approvals),
      adminEvents: sum(all, (c) => c.adminEvents),
      events: sum(all, (c) => c.events),
      holders: sum(all, (c) => c.holders),
      grossUsd: sumUsd(all.map((c) => c.grossUsd)),
      checksPassed: sum(all, (c) => c.checksPassed),
      checksTotal: sum(all, (c) => c.checksTotal),
      asOf: all.map((c) => c.checkpointDate).sort().at(-1),
    },
  };
}
