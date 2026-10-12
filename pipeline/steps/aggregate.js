import { dataPath, dataDir, copPerUsd } from "../config/chains.js";
import { createStore, readJson, writeJson, writeText } from "../adapters/store.js";
import { buildDailySeries, dailyCsv, summarize } from "../domain/aggregate.js";

// Pure with respect to the file system layout: everything comes from `store`,
// so tests run it against a temporary directory.
export function buildAggregate({ store, manifest, chainKey, copPerUsd }) {
  if (store.listPartitions().length === 0) {
    throw new Error(
      `no transfer partitions for ${chainKey}: nothing to aggregate. ` +
        `run "scan --chain ${chainKey}" first`
    );
  }

  const transfers = store.readTransfers();
  const { series, totals } = buildDailySeries(transfers, store.readApprovals().daily);
  const summary = summarize({
    manifest,
    chainKey,
    series,
    totals,
    transferEvents: transfers.length,
    copPerUsd,
  });
  return { transfers, series, summary, csv: dailyCsv(series) };
}

export async function run({ chainKey, env = process.env }) {
  console.log(`chain: ${chainKey}`);
  const manifest = readJson(dataPath(chainKey, "manifest.json"));
  const { transfers, summary, csv } = buildAggregate({
    store: createStore(dataDir(chainKey)),
    manifest,
    chainKey,
    copPerUsd: copPerUsd(env),
  });

  console.log(`total transfer events: ${transfers.length}`);
  writeJson(dataPath(chainKey, "summary.json"), summary, 2);
  writeText(dataPath(chainKey, "daily.csv"), csv);

  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nwrote summary.json + daily.csv`);
}
