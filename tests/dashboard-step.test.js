import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runHolders } from "../pipeline/steps/holders.js";
import { buildDashboardFor, writeDashboard } from "../pipeline/steps/dashboard.js";
import { CHAIN, SETTINGS, scannedDataset, tempStore } from "./helpers/dataset.js";
import { ALICE, BOB } from "./helpers/fake-rpc.js";
import { flatRates } from "./helpers/rates.js";

const rates = flatRates(4000);

async function datasetWithHolders() {
  const dataset = await scannedDataset();
  await runHolders({
    chain: CHAIN,
    settings: SETTINGS,
    rpc: dataset.fake.rpc,
    store: dataset.store,
    log: () => {},
    sleep: async () => {},
  });
  return dataset;
}

test("builds the dashboard from what scan and holders wrote, at the checkpoint", async () => {
  const { store } = await datasetWithHolders();
  const state = store.readState();
  const d = buildDashboardFor({ store, chainKey: "testnet", rates });
  assert.equal(d.chain, "testnet");
  assert.equal(d.checkpoint.block, state.lastBlock);
  assert.equal(d.checkpoint.totalSupply, 1020);
  assert.equal(d.flows.minted, 1070);
  assert.equal(d.flows.burned, 50);
  // 1,000 COPM and 70 COPM on two days at 4,000 COP per USD: 0.25 + 0.02.
  assert.equal(d.flows.usd.minted, 0.27);
  assert.equal(d.checkpoint.totalSupplyUsd, 0.26);
  assert.equal(d.holders.count, 3);
  assert.deepEqual(d.governance.frozen, [BOB]);
  assert.deepEqual(d.governance.roles.DEFAULT_ADMIN_ROLE, [ALICE]);
  assert.equal(d.governance.events.length, state.adminEvents);
  assert.equal(d.daily.transfers.reduce((a, b) => a + b, 0), state.transfers);
});

test("writes dashboard.json, the same bytes on a second run", async () => {
  const { store, url } = await datasetWithHolders();
  const logs = [];
  writeDashboard({ store, dirUrl: url, chainKey: "testnet", rates, log: (m) => logs.push(m) });
  const first = readFileSync(new URL("dashboard.json", url), "utf8");
  writeDashboard({ store, dirUrl: url, chainKey: "testnet", rates, log: () => {} });
  assert.equal(readFileSync(new URL("dashboard.json", url), "utf8"), first);
  assert.ok(first.endsWith("\n"));
  assert.ok(logs.some((m) => /dashboard\.json/.test(m)));
});

test("fails with a clear message when there are no partitions or no holders snapshot", async () => {
  const empty = tempStore();
  assert.throws(
    () => buildDashboardFor({ store: empty.store, chainKey: "celo", rates }),
    /no state.json for celo.*run "scan --chain celo" first/s,
  );
  const scanned = await scannedDataset();
  assert.throws(
    () => buildDashboardFor({ store: scanned.store, chainKey: "testnet", rates }),
    /holders.*run "holders --chain testnet" first/s,
  );
});

test("rows above the checkpoint do not reach the dashboard", async () => {
  const { store } = await datasetWithHolders();
  const { lastBlock } = store.readState();
  const before = buildDashboardFor({ store, chainKey: "testnet", rates });
  const key = store.listPartitions().at(-1);
  const rows = store.readPartition(key);
  store.writePartition(key, [...rows, { ...rows.at(-1), b: lastBlock + 1, i: 0, v: "1000000000000000000" }]);

  assert.deepEqual(buildDashboardFor({ store, chainKey: "testnet", rates }), before);
});
