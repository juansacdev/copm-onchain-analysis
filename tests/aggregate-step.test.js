import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createStore } from "../pipeline/adapters/store.js";
import { buildAggregate } from "../pipeline/steps/aggregate.js";
import { ZERO_ADDRESS } from "../pipeline/domain/units.js";
import { flatRates, rateTable } from "./helpers/rates.js";

const COPM = (n) => BigInt(n) * 10n ** 18n;
const A = "0xaaaa000000000000000000000000000000000001";
const manifest = { chain: "celo", chainLabel: "Celo", address: "0xabc", decimals: 18 };
const emptyStore = () => createStore(pathToFileURL(`${mkdtempSync(join(tmpdir(), "copm-agg-"))}/`));
const row = (b, i, ts, f, r, v) => ({ b, ts, t: `0xtx${b}`, i, f, r, v: v.toString() });
const at = (day, hour = 12) => Date.UTC(2024, 2, day, hour) / 1000;

test("builds the daily series from every partition, with approvals from approvals.json", () => {
  const store = emptyStore();
  store.writePartition("2024-02", [row(1, 0, Date.UTC(2024, 1, 29, 12) / 1000, ZERO_ADDRESS, A, COPM(10))]);
  store.writePartition("2024-03", [
    row(2, 0, at(1), A, ZERO_ADDRESS, COPM(4)),
    row(3, 0, at(2), ZERO_ADDRESS, A, COPM(1)),
  ]);
  store.writeState({ lastBlock: 3 });
  store.writeApprovals({ block: 3, daily: { "2024-03-01": 5 }, spenders: {} });

  const { series, summary, csv } = buildAggregate({
    store,
    manifest,
    chainKey: "celo",
    rates: flatRates(4000),
  });

  assert.deepEqual(series.map((d) => [d.day, d.approvals]), [
    ["2024-02-29", 0],
    ["2024-03-01", 5],
    ["2024-03-02", 0],
  ]);
  assert.equal(summary.totals.transferEvents, 3);
  assert.equal(summary.totals.currentSupplyCOPM, 7);
  assert.match(csv.split("\n")[0], /,approvals,cop_per_usd,/);
  assert.match(csv.split("\n")[2], /,5,4000,/);
});

test("fails with a clear message when the chain has no partitions yet", () => {
  assert.throws(
    () => buildAggregate({ store: emptyStore(), manifest, chainKey: "celo", rates: flatRates(4000) }),
    /no transfer partitions for celo.*run "scan --chain celo" first/s
  );
});

test("a chain without approvals.json still aggregates, with zero approvals", () => {
  const store = emptyStore();
  store.writePartition("2024-03", [row(2, 0, at(1), ZERO_ADDRESS, A, COPM(1))]);
  store.writeState({ lastBlock: 2 });
  const { series } = buildAggregate({ store, manifest, chainKey: "celo", rates: flatRates(4000) });
  assert.equal(series[0].approvals, 0);
});

test("rows above the checkpoint are not aggregated", () => {
  const store = emptyStore();
  store.writePartition("2024-03", [
    row(2, 0, at(1), ZERO_ADDRESS, A, COPM(1)),
    row(9, 0, at(2), ZERO_ADDRESS, A, COPM(100)),
  ]);
  store.writeState({ lastBlock: 5 });
  const { summary, series } = buildAggregate({ store, manifest, chainKey: "celo", rates: flatRates(4000) });
  assert.equal(summary.totals.transferEvents, 1);
  assert.equal(summary.totals.currentSupplyCOPM, 1);
  assert.equal(series.length, 1);
});

test("each day of the series and of daily.csv is valued at the rate of its own day", () => {
  const store = emptyStore();
  store.writePartition("2024-03", [
    row(2, 0, at(1), ZERO_ADDRESS, A, COPM(8000)),
    row(3, 0, at(2), ZERO_ADDRESS, A, COPM(6000)),
  ]);
  store.writeState({ lastBlock: 3 });
  const { summary, csv } = buildAggregate({
    store,
    manifest,
    chainKey: "celo",
    rates: rateTable("2024-03-01", [4000, 3000]),
  });

  const lines = csv.split("\n");
  assert.match(lines[0], /,cop_per_usd,supply_end_usd,gross_volume_usd,net_volume_usd,mint_usd,burn_usd$/);
  assert.match(lines[1], /,4000,2,2,0,2,0$/);
  assert.match(lines[2], /,3000,4.67,2,0,2,0$/);
  assert.equal(summary.totals.totalMintedUSD, 4);
  assert.equal(summary.totals.currentSupplyUSD, 4.67);
});

test("aggregating without rates fails instead of using a default", () => {
  const store = emptyStore();
  store.writePartition("2024-03", [row(2, 0, at(1), ZERO_ADDRESS, A, COPM(1))]);
  store.writeState({ lastBlock: 2 });
  assert.throws(() => buildAggregate({ store, manifest, chainKey: "celo" }), /rates/);
});
