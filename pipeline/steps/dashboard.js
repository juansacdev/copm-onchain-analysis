// Writes data/<chain>/dashboard.json: the one compact file the site reads to
// draw the dashboard. It is a pure function of what `scan`, `holders` and
// `aggregate` already wrote, with no clock and no network, so running it twice
// produces the same bytes. The logic lives in domain/dashboard.js.
import { dataDir, ratesDir } from "../config/chains.js";
import { requireRatesTable } from "../adapters/rates.js";
import { createStore, writeText } from "../adapters/store.js";
import { buildDashboard } from "../domain/dashboard.js";

// Everything comes from `store`, so tests run it against a temporary directory.
export function buildDashboardFor({ store, chainKey, rates }) {
  const state = store.readState();
  if (!state) throw new Error(`no state.json for ${chainKey}: run "scan --chain ${chainKey}" first`);
  if (store.listPartitions().length === 0) {
    throw new Error(`no transfer partitions for ${chainKey}: run "scan --chain ${chainKey}" first`);
  }
  const { json: holders } = store.readHolders();
  if (!holders) throw new Error(`no holders snapshot for ${chainKey}: run "holders --chain ${chainKey}" first`);
  if (holders.block !== state.lastBlock) {
    throw new Error(
      `holders.json is at block ${holders.block}, the checkpoint is ${state.lastBlock}: ` +
        `run "holders --chain ${chainKey}" first`,
    );
  }

  return buildDashboard({
    chainKey,
    state,
    transfers: store.readTransfersAtCheckpoint(),
    adminEvents: store.readAdminEvents(),
    approvals: store.readApprovals(),
    holders,
    rates,
  });
}

export function writeDashboard({ store, dirUrl, chainKey, rates, log = console.log }) {
  const dashboard = buildDashboardFor({ store, chainKey, rates });
  const text = `${JSON.stringify(dashboard)}\n`;
  writeText(new URL("dashboard.json", dirUrl), text);
  log(`wrote dashboard.json (${text.length} bytes) at block ${dashboard.checkpoint.block}`);
  return dashboard;
}

export async function run({ chainKey }) {
  console.log(`chain: ${chainKey}`);
  writeDashboard({
    store: createStore(dataDir(chainKey)),
    dirUrl: dataDir(chainKey),
    chainKey,
    rates: requireRatesTable(ratesDir()),
  });
}
