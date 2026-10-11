import { writeJson, writeText } from "../../pipeline/adapters/store.js";
import { buildDailySeries, dailyCsv, summarize } from "../../pipeline/domain/aggregate.js";
import { buildHolderRows, formatUnits, holdersCsv } from "../../pipeline/domain/holders.js";
import { createLedger, foldTransfers } from "../../pipeline/domain/ledger.js";
import { ZERO_ADDRESS } from "../../pipeline/domain/units.js";

// A small, fully consistent set of pipeline artifacts for the validation
// rules. Blocks start at celo's real deploy block so the step can run against
// it with the production chain table.
export const DEPLOY = 27_680_993;
export const CHAIN_KEY = "celo";
export const A = `0x${"a1".repeat(20)}`;
export const B = `0x${"b2".repeat(20)}`;

const COPM = (n) => BigInt(n) * 10n ** 18n;
const ts = (y, m, d, h = 12) => Date.UTC(y, m - 1, d, h) / 1000;
const row = (b, i, at, f, r, v) => ({ b, ts: at, t: `0xtx${b}${i}`, i, f, r, v: v.toString() });

export function fixture() {
  const partitions = [
    {
      key: "2024-01",
      rows: [
        row(DEPLOY + 10, 0, ts(2024, 1, 31), ZERO_ADDRESS, A, COPM(100)),
        row(DEPLOY + 11, 0, ts(2024, 1, 31, 13), A, B, COPM(30)),
      ],
    },
    { key: "2024-02", rows: [row(DEPLOY + 20, 0, ts(2024, 2, 1), B, ZERO_ADDRESS, COPM(5))] },
  ];
  const transfers = partitions.flatMap((p) => p.rows);
  const ledger = foldTransfers(createLedger({ trackActivity: true }), transfers);
  const totalSupply = ledger.minted - ledger.burned;
  const lastBlock = DEPLOY + 25;

  const state = {
    schema: 1,
    chain: CHAIN_KEY,
    lastBlock,
    lastBlockTime: ts(2024, 2, 1, 13),
    minted: ledger.minted.toString(),
    burned: ledger.burned.toString(),
    totalSupply: totalSupply.toString(),
    transfers: transfers.length,
    approvals: 2,
    adminEvents: 1,
  };
  const adminEvents = [{ b: DEPLOY, ts: ts(2024, 1, 31, 11), t: "0xup", i: 0, name: "Upgraded", args: {} }];
  const approvals = { block: lastBlock, daily: { "2024-01-31": 2 }, spenders: {} };
  const manifest = {
    chain: CHAIN_KEY,
    chainLabel: "Celo",
    address: "0xabc",
    decimals: 18,
    deployBlock: String(DEPLOY),
    deployTimestamp: new Date(ts(2024, 1, 31, 11) * 1000).toISOString(),
  };

  const { series, totals } = buildDailySeries(transfers, approvals.daily);
  const summary = summarize({
    manifest,
    chainKey: CHAIN_KEY,
    series,
    totals,
    transferEvents: transfers.length,
    copPerUsd: 4000,
  });
  const csvText = dailyCsv(series);

  const rows = buildHolderRows({ balances: ledger.balances, activity: ledger.activity, totalSupply });
  const holders = {
    csv: holdersCsv(rows),
    json: { block: lastBlock, totalSupply: formatUnits(totalSupply), holders: rows.length },
  };

  return { deployBlock: DEPLOY, manifest, state, partitions, transfers, adminEvents, approvals, csvText, summary, holders };
}

// Writes a fixture the way the pipeline steps do, so the validate step can
// read it back from a directory.
export function writeFixture(store, dirUrl, fx) {
  for (const { key, rows } of fx.partitions) store.writePartition(key, rows);
  store.writeState(fx.state);
  store.writeAdminEvents(fx.adminEvents);
  store.writeApprovals(fx.approvals);
  if (fx.holders.csv) store.writeHolders(fx.holders);
  writeText(new URL("daily.csv", dirUrl), fx.csvText);
  writeJson(new URL("summary.json", dirUrl), fx.summary, 2);
  writeJson(new URL("manifest.json", dirUrl), fx.manifest, 2);
}
