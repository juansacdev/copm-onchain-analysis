// Reads the dashboard files the pipeline wrote and returns what the page
// needs. The site never parses transfer partitions: data/<chain>/dashboard.json
// is the contract. Plain JS, no Astro imports, so node --test can run it.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const CHAIN_KEYS = ["polygon", "celo"];

function readJson(dataDir, chain, name, command) {
  const file = join(dataDir, chain, name);
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    const hint = command ? `: run "${command} --chain ${chain}" first` : "";
    throw new Error(`cannot read ${chain}/${name}${hint} (${err.message})`);
  }
}

export function loadDashboardData({ dataDir }) {
  const chains = {};
  for (const key of CHAIN_KEYS) {
    const dashboard = readJson(dataDir, key, "dashboard.json", "dashboard");
    const state = readJson(dataDir, key, "state.json", "scan");
    const manifest = readJson(dataDir, key, "manifest.json", "discover");
    const validation = readJson(dataDir, key, "validation.json", "validate");
    // The page must never show numbers older than the verified checkpoint.
    if (dashboard.checkpoint.block !== state.lastBlock) {
      throw new Error(
        `${key}/dashboard.json is at block ${dashboard.checkpoint.block}, the checkpoint is ${state.lastBlock}: ` +
          `run "dashboard --chain ${key}" first`,
      );
    }
    chains[key] = { key, label: manifest.chainLabel, address: manifest.address, dashboard, validation, state };
  }
  return { fx: rateOf(chains), chains };
}

// The TRM behind the dollar figures, from the two series: the rate on the
// latest day any of them reaches, and the lowest and highest over the token's
// life. Each dashboard.json states its own; the page only reports them.
function rateOf(chains) {
  const fxs = Object.values(chains).map((c) => c.dashboard.fx);
  const latest = fxs.reduce((a, b) => (b.latestDay > a.latestDay ? b : a));
  return {
    latest: latest.latest,
    latestDay: latest.latestDay,
    min: Math.min(...fxs.map((x) => x.min)),
    max: Math.max(...fxs.map((x) => x.max)),
  };
}

// The part of the data the browser needs to draw and filter: the daily
// series (COPM and USD), the lists and the headline figures. Governance, monthly tables and
// the validation rules are rendered on the server and stay out of the page's
// JSON.
export function clientPayload(data) {
  const chains = {};
  for (const [key, c] of Object.entries(data.chains)) {
    const d = c.dashboard;
    const { day, transfers, volume, mint, burn, supply, volumeUsd, mintUsd, burnUsd, supplyUsd } = d.daily;
    chains[key] = {
      key,
      label: c.label,
      address: c.address,
      checkpoint: d.checkpoint,
      flows: d.flows,
      supplyPeak: d.supplyPeak,
      activity: d.activity,
      daily: { day, transfers, volume, mint, burn, supply, volumeUsd, mintUsd, burnUsd, supplyUsd },
      sizes: d.sizes.map(({ min, count }) => ({ min, count })),
      holders: { count: d.holders.count, contracts: d.holders.contracts, top1Pct: d.holders.top1Pct, top10Pct: d.holders.top10Pct, top: d.holders.top },
      largest: d.largest,
    };
  }
  return { fx: data.fx, chains };
}
