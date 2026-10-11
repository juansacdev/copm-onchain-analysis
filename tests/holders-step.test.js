import { test } from "node:test";
import assert from "node:assert/strict";
import { runHolders } from "../pipeline/steps/holders.js";
import { SELECTORS } from "../pipeline/domain/contract.js";
import { ALICE, BOB, mint } from "./helpers/fake-rpc.js";
import { CAROL, CHAIN, COPM, DAVE, SETTINGS, blockTime, scannedDataset } from "./helpers/dataset.js";

const run = (dataset, overrides = {}) =>
  runHolders({
    chain: CHAIN,
    settings: SETTINGS,
    rpc: dataset.fake.rpc,
    store: dataset.store,
    log: () => {},
    sleep: async () => {},
    ...overrides,
  });

const isBalanceOf = (who) => (read) => read.selector === SELECTORS.balanceOf && read.data.endsWith(who.slice(2));

test("writes holders.csv and holders.json at the checkpoint block from verified balances", async () => {
  const dataset = await scannedDataset();
  const state = dataset.store.readState();
  await run(dataset);

  const { csv, json } = dataset.store.readHolders();
  const lines = csv.trim().split("\n");
  assert.equal(lines.length, 4);
  assert.deepEqual(lines.slice(1).map((l) => l.split(",").slice(0, 6)), [
    ["1", ALICE, "695", "68.1373", "wallet", "false"],
    ["2", BOB, "265", "25.9804", "wallet", "true"],
    ["3", CAROL, "60", "5.8824", "contract", "false"],
  ]);

  assert.equal(json.block, state.lastBlock);
  assert.equal(json.blockTime, blockTime(state.lastBlock));
  assert.equal(json.totalSupply, "1020");
  assert.equal(json.holders, 3);
  assert.equal(json.addressesEverSeen, 4);
  assert.equal(json.contracts, 1);
  assert.deepEqual(json.frozen, [BOB]);
  assert.equal(json.paused, false);
  assert.equal(json.implementation, BOB);
  assert.deepEqual(json.roles.DEFAULT_ADMIN_ROLE, [ALICE]);
  assert.deepEqual(json.roles.MINTER_ROLE, [BOB, CAROL]);
  assert.deepEqual(json.roles.PAUSER_ROLE, []);
  assert.equal(json.concentration.top1Pct, 68.1373);
  assert.deepEqual(json.top.map((r) => [r.rank, r.address, r.balance]), [
    [1, ALICE, "695"],
    [2, BOB, "265"],
    [3, CAROL, "60"],
  ]);
  assert.equal(json.buckets.find((b) => b.label === "1 – 1k").holders, 3);
});

test("everything is read at the checkpoint block, never at the live head", async () => {
  const dataset = await scannedDataset();
  const { lastBlock } = dataset.store.readState();
  await run(dataset);

  assert.ok(dataset.fake.seen.reads.length > 0);
  assert.ok(dataset.fake.seen.reads.every((r) => r.block === lastBlock));
  const methods = [...dataset.fake.seen.batches.flat().map((c) => c.method), ...dataset.fake.seen.singles.map((s) => s.method)];
  assert.ok(!methods.includes("eth_blockNumber"));
  assert.ok(!methods.includes("eth_getLogs"));
});

test("balanceOf is asked for every address ever seen, isFrozen only for addresses in freeze events", async () => {
  const dataset = await scannedDataset();
  await run(dataset);

  const reads = dataset.fake.seen.reads;
  const asked = (selector) => reads.filter((r) => r.selector === selector).map((r) => `0x${r.data.slice(-40)}`).sort();
  assert.deepEqual(asked(SELECTORS.balanceOf), [ALICE, BOB, CAROL, DAVE].sort());
  assert.deepEqual(asked(SELECTORS.isFrozen), [ALICE, BOB].sort());
  const codeReads = reads.filter((r) => r.method === "eth_getCode").map((r) => r.data).sort();
  assert.deepEqual(codeReads, [ALICE, BOB, CAROL].sort());
});

test("no JSON-RPC batch carries more than 100 calls", async () => {
  const dataset = await scannedDataset();
  // 230 extra holders, to force several batches.
  const extra = Array.from({ length: 230 }, (_, n) => `0x${(n + 1).toString(16).padStart(40, "0")}`);
  extra.forEach((to, n) => dataset.fake.logs.push(mint(1100 + n, 0, to, COPM(1))));
  const rows = extra.map((to, n) => ({ b: 1100 + n, ts: 1_700_000_000 + n, t: `0x${n}`, i: 0, f: `0x${"0".repeat(40)}`, r: to, v: COPM(1).toString() }));
  dataset.store.writePartition("2023-11", rows);
  const state = dataset.store.readState();
  const minted = BigInt(state.minted) + COPM(230);
  dataset.store.writeState({ ...state, minted: minted.toString(), totalSupply: (minted - BigInt(state.burned)).toString() });

  await run(dataset);
  const sizes = dataset.fake.seen.batches.map((b) => b.length);
  assert.ok(Math.max(...sizes) <= 100, `largest batch ${Math.max(...sizes)}`);
  assert.ok(sizes.length > 3);
  assert.equal(dataset.store.readHolders().json.holders, 233);
});

test("a ledger balance that differs from balanceOf fails the step and writes nothing", async () => {
  const dataset = await scannedDataset();
  // Drop one transfer (BOB -> ALICE, block 2150) from the stored history: the
  // ledger now disagrees with the chain for both addresses.
  for (const key of dataset.store.listPartitions()) {
    dataset.store.writePartition(key, dataset.store.readPartition(key).filter((r) => r.b !== 2150));
  }
  await assert.rejects(run(dataset), (err) => {
    assert.match(err.message, /balance mismatch for 2 address\(es\) at block 2200/);
    assert.ok(err.message.includes(ALICE));
    assert.ok(err.message.includes(BOB));
    return true;
  });
  assert.deepEqual(dataset.store.readHolders(), { csv: null, json: null });
});

test("a read that fails twice is retried and is never read as zero", async () => {
  const dataset = await scannedDataset();
  dataset.fake.faults.read = (read) =>
    isBalanceOf(BOB)(read) && read.attempt <= 2 ? new Error("missing trie node") : undefined;

  await run(dataset);

  const bobReads = dataset.fake.seen.reads.filter(isBalanceOf(BOB));
  assert.equal(bobReads.length, 3);
  const bob = dataset.store.readHolders().csv.split("\n").find((l) => l.includes(BOB));
  assert.equal(bob.split(",")[2], "265");
});

test("an answer that is not a full word is retried too, not read as zero", async () => {
  const dataset = await scannedDataset();
  dataset.fake.faults.read = (read) => (isBalanceOf(ALICE)(read) && read.attempt === 1 ? "0x" : undefined);
  await run(dataset);
  assert.equal(dataset.fake.seen.reads.filter(isBalanceOf(ALICE)).length, 2);
  assert.equal(dataset.store.readHolders().json.holders, 3);
});

test("one failing item does not stop the step while the attempt budget lasts", async () => {
  const dataset = await scannedDataset();
  dataset.fake.faults.read = (read) =>
    isBalanceOf(CAROL)(read) && read.attempt < SETTINGS.maxBatchAttempts ? new Error("no state") : undefined;
  await run(dataset);
  assert.equal(dataset.fake.seen.reads.filter(isBalanceOf(CAROL)).length, SETTINGS.maxBatchAttempts);
  assert.equal(dataset.store.readHolders().json.holders, 3);
});

test("an item that keeps failing exhausts the budget, fails the step and writes nothing", async () => {
  const dataset = await scannedDataset();
  dataset.fake.faults.read = (read) => (isBalanceOf(CAROL)(read) ? new Error("no state") : undefined);
  await assert.rejects(run(dataset), /failed 6 times; last error: no state/);
  assert.deepEqual(dataset.store.readHolders(), { csv: null, json: null });
});

test("positive balances that add up to less than totalSupply() fail the step", async () => {
  const dataset = await scannedDataset();
  dataset.fake.faults.supply = (block) => dataset.fake.supplyAt(block) + 1n;
  await assert.rejects(run(dataset), /positive balances add up to 1020\d* but totalSupply\(\) is 1020\d*/);
  assert.deepEqual(dataset.store.readHolders(), { csv: null, json: null });
});

test("a negative ledger balance fails before any network call", async () => {
  const dataset = await scannedDataset();
  const [key] = dataset.store.listPartitions();
  const rows = dataset.store.readPartition(key);
  dataset.store.writePartition(key, rows.filter((r) => r.b !== 1010)); // the mint that funded everything
  await assert.rejects(run(dataset), /negative balance/);
  assert.equal(dataset.fake.seen.batches.length + dataset.fake.seen.singles.length, 0);
});

test("without a checkpoint there is nothing to snapshot", async () => {
  const dataset = await scannedDataset();
  dataset.store.clear();
  await assert.rejects(run(dataset), /no state\.json.*run "scan --chain testnet" first/s);
});

test("the snapshot is deterministic: running it twice writes identical files", async () => {
  const dataset = await scannedDataset();
  await run(dataset);
  const first = dataset.store.readHolders();
  await run(dataset);
  assert.deepEqual(dataset.store.readHolders(), first);
});
