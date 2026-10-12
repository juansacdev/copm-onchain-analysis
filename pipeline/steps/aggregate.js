import { dataPath, dataDir, ratesDir } from "../config/chains.js";
import { requireRatesTable } from "../adapters/rates.js";
import { createStore, readJson, writeJson, writeText } from "../adapters/store.js";
import { buildDailySeries, dailyCsv, summarize } from "../domain/aggregate.js";

// Pure with respect to the file system layout: everything comes from `store`,
// so tests run it against a temporary directory.
export function buildAggregate({ store, manifest, chainKey, rates }) {
  if (store.listPartitions().length === 0) {
    throw new Error(
      `no transfer partitions for ${chainKey}: nothing to aggregate. ` +
        `run "scan --chain ${chainKey}" first`
    );
  }

  const transfers = store.readTransfersAtCheckpoint();
  const { series, totals } = buildDailySeries(transfers, store.readApprovals().daily, rates);
  const summary = summarize({
    manifest,
    chainKey,
    series,
    totals,
    transferEvents: transfers.length,
  });
  return { transfers, series, summary, csv: dailyCsv(series) };
}

export async function run({ chainKey }) {
  console.log(`chain: ${chainKey}`);
  const manifest = readJson(dataPath(chainKey, "manifest.json"));
  const { transfers, summary, csv } = buildAggregate({
    store: createStore(dataDir(chainKey)),
    manifest,
    chainKey,
    rates: requireRatesTable(ratesDir()),
  });

  console.log(`total transfer events: ${transfers.length}`);
  writeJson(dataPath(chainKey, "summary.json"), summary, 2);
  writeText(dataPath(chainKey, "daily.csv"), csv);

  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nwrote summary.json + daily.csv`);
}
