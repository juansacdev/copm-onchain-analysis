import { dataPath, copPerUsd } from "../config/chains.js";
import { readJson, readJsonl, writeJson, writeText } from "../adapters/store.js";
import { buildDailySeries, dailyCsv, summarize } from "../domain/aggregate.js";

export async function run({ chainKey, env = process.env }) {
  console.log(`chain: ${chainKey}`);
  const manifest = readJson(dataPath(chainKey, "manifest.json"));
  const tsByBlock = readJson(dataPath(chainKey, "block-ts.json"));
  const transfers = readJsonl(dataPath(chainKey, "transfers.jsonl"));

  console.log(`total transfer events: ${transfers.length}`);

  const { series, totals, timestamped } = buildDailySeries(transfers, tsByBlock);
  console.log(`sorted ${timestamped} transfers (with timestamps)`);

  const summary = summarize({
    manifest,
    chainKey,
    series,
    totals,
    transferEvents: transfers.length,
    copPerUsd: copPerUsd(env),
  });

  writeJson(dataPath(chainKey, "summary.json"), summary, 2);
  writeText(dataPath(chainKey, "daily.csv"), dailyCsv(series));

  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nwrote summary.json + daily.csv`);
}
