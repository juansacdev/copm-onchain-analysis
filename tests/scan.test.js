import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createStore } from "../pipeline/adapters/store.js";
import { createRpc } from "../pipeline/adapters/rpc.js";
import { runScan } from "../pipeline/steps/scan.js";
import { monthKey } from "../pipeline/domain/partition.js";
import {
  ALICE,
  BOB,
  SPENDER,
  TOKEN,
  approval,
  burn,
  createFakeChain,
  hex,
  mint,
  roleGranted,
  transfer,
  tsOf,
  upgraded,
} from "./helpers/fake-rpc.js";

const DEPLOY = 1000;
const CHAIN = { key: "testnet", address: TOKEN, deployBlock: DEPLOY };
const SETTINGS = {
  maxLogRange: 100,
  rangesPerBatch: 2,
  emptyConfirmations: 2,
  confirmations: 5,
  workers: 2,
  stageBlocks: 500,
  maxBatchAttempts: 20,
};
const CLOCK = () => new Date("2026-01-01T00:00:00.000Z");

const COPM = (n) => BigInt(n) * 10n ** 18n;

// A small history that spans two UTC months (the origin is 23:00 on Jan 31),
// three stages, every event kind, and a deploy block carrying Upgraded.
function history() {
  return [
    upgraded(DEPLOY, 0),
    roleGranted(DEPLOY, 1, "DEFAULT_ADMIN_ROLE", ALICE),
    mint(1010, 0, ALICE, COPM(1000)),
    approval(1011, 0, ALICE, SPENDER),
    transfer(1260, 0, ALICE, BOB, COPM(250)),
    approval(1261, 0, ALICE, SPENDER),
    approval(1261, 1, BOB, SPENDER),
    burn(1530, 0, BOB, COPM(50)),
    mint(1990, 3, BOB, COPM(70)),
    roleGranted(2100, 0, "MINTER_ROLE", BOB),
    transfer(2150, 0, BOB, ALICE, COPM(10)),
  ];
}

function setup(chainOptions = {}, { settings = {}, store } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "copm-scan-"));
  const url = pathToFileURL(`${dir}/`);
  const fake = createFakeChain({ logs: history(), head: 2205, ...chainOptions });
  const theStore = store ?? createStore(url);
  const scan = (extra = {}) =>
    runScan({
      chain: CHAIN,
      settings: { ...SETTINGS, ...settings },
      rpc: fake.rpc,
      store: theStore,
      clock: CLOCK,
      log: () => {},
      sleep: async () => {},
      ...extra,
    });
  return { dir, url, fake, store: theStore, scan };
}

// Every file under a directory, as { relativePath: contents }.
function snapshot(dir, prefix = "") {
  const out = {};
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) Object.assign(out, snapshot(path, `${prefix}${name}/`));
    else out[`${prefix}${name}`] = readFileSync(path, "utf8");
  }
  return out;
}

test("a full scan over several stages writes partitions, admin events, approvals and the checkpoint", async () => {
  const { fake, store, scan } = setup();
  const result = await scan();

  assert.equal(result.status, "scanned");
  assert.equal(result.lastBlock, 2200); // head 2205 minus 5 confirmations

  // Transfers: every one of the five, with exact timestamps, in month files.
  const rows = store.readTransfers();
  assert.deepEqual(rows.map((r) => [r.b, r.i]), [[1010, 0], [1260, 0], [1530, 0], [1990, 3], [2150, 0]]);
  assert.ok(rows.every((r) => r.ts === tsOf(r.b)));
  assert.deepEqual(Object.keys(rows[0]), ["b", "ts", "t", "i", "f", "r", "v"]);
  assert.equal(rows[0].v, COPM(1000).toString());
  assert.equal(rows[0].f, `0x${"0".repeat(40)}`);
  assert.equal(rows[0].r, ALICE);
  assert.deepEqual(store.listPartitions(), [...new Set(rows.map((r) => monthKey(r.ts)))].sort());
  assert.ok(store.listPartitions().length >= 2, "history crosses a month boundary");

  // Admin events: decoded, with raw topics and data kept.
  const admin = store.readAdminEvents();
  assert.deepEqual(admin.map((e) => [e.b, e.name]), [
    [1000, "Upgraded"],
    [1000, "RoleGranted"],
    [2100, "RoleGranted"],
  ]);
  assert.equal(admin[2].args.role, "MINTER_ROLE");
  assert.equal(admin[0].topics.length, 2);
  assert.equal(admin[0].ts, tsOf(1000));

  // Approvals: counts only.
  const approvals = store.readApprovals();
  assert.equal(Object.values(approvals.daily).reduce((a, b) => a + b, 0), 3);
  assert.deepEqual(approvals.spenders, { [SPENDER]: 3 });

  // Checkpoint.
  const state = store.readState();
  assert.equal(state.schema, 1);
  assert.equal(state.chain, "testnet");
  assert.equal(state.address, TOKEN);
  assert.equal(state.lastBlock, 2200);
  assert.equal(state.lastBlockTime, tsOf(2200));
  assert.equal(state.minted, (COPM(1000) + COPM(70)).toString());
  assert.equal(state.burned, COPM(50).toString());
  assert.equal(state.totalSupply, (COPM(1000) + COPM(70) - COPM(50)).toString());
  assert.equal(state.transfers, 5);
  assert.equal(state.approvals, 3);
  assert.equal(state.adminEvents, 3);
  assert.equal(state.updatedAt, "2026-01-01T00:00:00.000Z");
  // The canary moved to the last block holding a stored log, with its log count.
  assert.deepEqual(state.canary, { block: 2150, logs: 1 });

  // The pinned supply read was sent on its own, once per stage, at the stage end.
  const supplyCalls = fake.seen.singles.filter((s) => s.method === "eth_call");
  assert.deepEqual(supplyCalls.map((s) => s.params[1]), [hex(1499), hex(1999), hex(2200)]);
  assert.ok(fake.seen.batches.every((b) => b.every((c) => c.method !== "eth_call")));
});

test("every batch carries the head check and the canary before its ranges", async () => {
  const { fake, scan } = setup();
  await scan();
  for (const batch of fake.seen.batches.filter((b) => b[1]?.method === "eth_getLogs")) {
    assert.equal(batch[0].method, "eth_blockNumber");
    const canary = batch[1].params[0];
    assert.equal(canary.fromBlock, canary.toBlock);
    assert.deepEqual(Object.keys(canary).sort(), ["address", "fromBlock", "toBlock"]);
  }
});

test("a range answered empty once and correctly afterwards loses nothing", async () => {
  const seenRanges = new Map();
  const { fake, store, scan } = setup();
  fake.faults.getLogs = ({ index, from, to, real }) => {
    if (index === 1) return undefined; // the canary is honest
    const key = `${from}-${to}`;
    const n = (seenRanges.get(key) ?? 0) + 1;
    seenRanges.set(key, n);
    return n === 1 ? [] : undefined; // first answer for every range is a lie
  };
  const result = await scan();

  assert.equal(store.readTransfers().length, 5);
  assert.equal(store.readState().transfers, 5);
  assert.ok(result.stats.emptyAnswers > 0);
});

test("an empty range is only recorded after the configured number of empty answers", async () => {
  const { fake, scan } = setup({ logs: [upgraded(DEPLOY, 0), mint(1010, 0, ALICE, COPM(1))], head: 1105 });
  await scan({ settings: { ...SETTINGS, emptyConfirmations: 3, stageBlocks: 1000 } });
  // Range 1100..1100 holds no log; it must have been asked for three times.
  const asked = fake.seen.batches
    .flatMap((b) => b.slice(2))
    .filter((c) => c.params[0].fromBlock === hex(1100)).length;
  assert.equal(asked, 3);
});

test("a backend whose canary is always wrong ends the run and writes nothing", async () => {
  const { fake, store, dir, scan } = setup();
  // Batches carry the canary at index 1; the standalone bootstrap query does not.
  fake.faults.getLogs = ({ batchIndex, index }) => (batchIndex >= 0 && index === 1 ? [] : undefined);

  await assert.rejects(scan(), /rejected 20 times.*canary/s);
  assert.equal(store.readState(), null);
  assert.deepEqual(snapshot(dir), {});
});

test("a lagging head is rejected until it catches up", async () => {
  const { fake, store, scan } = setup();
  fake.faults.head = ({ batchIndex }) => (batchIndex < 6 ? 1100 : undefined);
  const result = await scan();
  assert.ok(result.stats.rejectedHead > 0);
  assert.equal(store.readTransfers().length, 5);
});

test("an item error in a batch rejects it, and the run reports the last reason when it gives up", async () => {
  const { fake, scan } = setup();
  fake.faults.getLogs = ({ index }) => (index > 1 ? new Error("query returned more than 10000 results") : undefined);
  await assert.rejects(scan(), /more than 10000 results/);
});

test("block timestamps come from headers when the log carries 0x0, retrying null headers", async () => {
  const { fake, store, scan } = setup({ zeroTimestamps: true });
  const nulls = new Set();
  fake.faults.header = ({ block }) => {
    if (nulls.has(block)) return false;
    nulls.add(block);
    return true; // every block's header is null the first time it is asked
  };
  await scan();
  const rows = store.readTransfers();
  assert.ok(rows.every((r) => r.ts === tsOf(r.b)));
  assert.equal(store.readState().lastBlockTime, tsOf(2200));
  assert.ok(fake.seen.headerCalls > 0);
  assert.ok(
    fake.seen.batches.every((b) => b.length <= 100 || b[0].method !== "eth_getBlockByNumber")
  );
});

test("a range item answered null or with a non-array rejects the batch and is asked again", async () => {
  for (const bad of [null, "0x", { logs: [] }]) {
    const { fake, store, scan } = setup();
    const realBatch = fake.rpc.batch;
    let spoiled = false;
    fake.rpc.batch = async (calls) => {
      const results = await realBatch(calls);
      if (!spoiled && calls.length > 2) {
        spoiled = true;
        results[2] = { ok: true, result: bad }; // first range of the first batch
      }
      return results;
    };
    const result = await scan();
    assert.ok(result.stats.rejectedError > 0, `${JSON.stringify(bad)} was not rejected`);
    assert.equal(store.readTransfers().length, 5);
    assert.equal(result.stats.emptyAnswers, result.stats.emptyAnswers);
  }
});

test("a block header for another block than the one asked is retried, never used", async () => {
  const { fake, store, scan } = setup({ zeroTimestamps: true });
  const lied = new Set();
  fake.faults.headerNumber = ({ block }) => {
    if (lied.has(block)) return undefined;
    lied.add(block);
    return block + 1; // first answer for every block is the next block's header
  };
  await scan();
  assert.ok(store.readTransfers().every((r) => r.ts === tsOf(r.b)));
  assert.equal(store.readState().lastBlockTime, tsOf(2200));
});

test("admin events above the checkpoint are trimmed even when the new stage has none", async () => {
  // Crash on the third state write: stage 3's admin event (block 2100) is on
  // disk, the checkpoint still points at the end of stage 2.
  const dir = mkdtempSync(join(tmpdir(), "copm-trim-"));
  const real = createStore(pathToFileURL(`${dir}/`));
  let stateWrites = 0;
  const crashing = {
    ...real,
    writeState(state) {
      if (++stateWrites === 3) throw new Error("simulated crash");
      real.writeState(state);
    },
  };
  const fake = createFakeChain({ logs: history(), head: 2205 });
  const run = (store) =>
    runScan({ chain: CHAIN, settings: SETTINGS, rpc: fake.rpc, store, clock: CLOCK, log: () => {}, sleep: async () => {} });

  await assert.rejects(run(crashing), /simulated crash/);
  assert.equal(real.readState().lastBlock, 1999);
  assert.ok(real.readAdminEvents().some((e) => e.b === 2100), "the leftover admin event exists");

  // The chain no longer reports that event (e.g. it was in a replaced block).
  fake.logs = fake.logs.filter((l) => l.b !== 2100);
  await run(real);
  assert.ok(!real.readAdminEvents().some((e) => e.b > 1999), "stale admin events survived");
  assert.equal(real.readState().adminEvents, real.readAdminEvents().length);
});

test("a transient eth_call error on the supply read is retried", async () => {
  const { fake, store, scan } = setup();
  let failures = 0;
  fake.faults.callError = () => (failures++ < 2 ? new Error("execution aborted") : null);
  await scan();
  assert.equal(store.readState().lastBlock, 2200);
});

test("a supply mismatch fails the run and leaves every file byte-identical", async () => {
  const { fake, dir, scan } = setup({ head: 1805 }); // first run: pin 1800
  await scan();
  const before = snapshot(dir);

  fake.head = 2205;
  fake.faults.supply = (block) => (block >= 2000 ? fake.supplyAt(block) + 1n : undefined);
  await assert.rejects(scan(), /does not reconcile.*diff/s);

  assert.deepEqual(snapshot(dir), before);
});

test("a mismatch in the first stage writes nothing at all", async () => {
  const { fake, store, dir, scan } = setup();
  fake.faults.supply = (block) => fake.supplyAt(block) - 1n;
  await assert.rejects(scan(), /does not reconcile/);
  assert.equal(store.readState(), null);
  assert.deepEqual(snapshot(dir), {});
});

test("running twice in a row is a no-op the second time", async () => {
  const { fake, dir, scan } = setup();
  await scan();
  const before = snapshot(dir);
  const logCalls = fake.seen.getLogsCalls;

  const again = await scan();
  assert.equal(again.status, "up-to-date");
  assert.deepEqual(snapshot(dir), before);
  assert.equal(fake.seen.getLogsCalls, logCalls);
});

test("a later run appends only the new blocks and keeps what was stored", async () => {
  const { fake, store, dir, scan } = setup({ head: 1805 });
  await scan();
  assert.equal(store.readState().lastBlock, 1800);
  assert.equal(store.readTransfers().length, 3);

  fake.head = 2205;
  await scan();
  assert.equal(store.readState().lastBlock, 2200);
  assert.equal(store.readTransfers().length, 5);

  // Same files as one uninterrupted scan to the same block.
  const oneShot = setup();
  await oneShot.scan();
  assert.deepEqual(snapshot(dir), snapshot(oneShot.dir));
});

test("a crash between the partition writes and the checkpoint is repaired by re-running", async () => {
  const reference = setup();
  await reference.scan();

  // Crash on the second state write: stage 2's partitions, admin events and
  // approvals are on disk, the checkpoint still points at the end of stage 1.
  const dir = mkdtempSync(join(tmpdir(), "copm-crash-"));
  const url = pathToFileURL(`${dir}/`);
  const real = createStore(url);
  let stateWrites = 0;
  const crashing = {
    ...real,
    writeState(state) {
      if (++stateWrites === 2) throw new Error("simulated crash");
      real.writeState(state);
    },
  };
  const fake = createFakeChain({ logs: history(), head: 2205 });
  const run = (store) =>
    runScan({ chain: CHAIN, settings: SETTINGS, rpc: fake.rpc, store, clock: CLOCK, log: () => {}, sleep: async () => {} });

  await assert.rejects(run(crashing), /simulated crash/);
  assert.equal(real.readState().lastBlock, 1499);
  assert.ok(real.readTransfers().some((r) => r.b > 1499), "leftover rows above the checkpoint exist");

  await run(real);
  assert.deepEqual(snapshot(dir), snapshot(reference.dir));
});

test("--fresh discards earlier output and rebuilds the same files", async () => {
  const { dir, store, scan } = setup();
  await scan();
  const first = snapshot(dir);
  store.writePartition("2023-05", [{ b: 1, ts: 1, t: "0x", i: 0, f: "0x", r: "0x", v: "1" }]);

  await scan({ fresh: true });
  assert.deepEqual(snapshot(dir), first);
});

test("the first canary is found by asking for the deploy block until Upgraded shows up", async () => {
  const { fake, store, scan } = setup();
  let asks = 0;
  fake.faults.getLogs = ({ from, to, real }) => {
    if (from === DEPLOY && to === DEPLOY && asks++ < 3) return real.slice(1, 2); // no Upgraded
    return undefined;
  };
  await scan();
  assert.ok(asks >= 4);
  assert.equal(store.readTransfers().length, 5);
});

test("a log from another address is an error, not data", async () => {
  const { fake, scan } = setup();
  fake.faults.getLogs = ({ index, real }) =>
    index > 1 && real.length ? real.map((l) => ({ ...l, address: BOB })) : undefined;
  await assert.rejects(scan(), /unexpected log address/);
});

test("no error message from a failing endpoint contains its URL", async () => {
  const secret = "https://secret.example/key";
  const dir = mkdtempSync(join(tmpdir(), "copm-r6-"));
  const rpc = createRpc({
    url: secret,
    fetch: async () => {
      throw new Error(`connect ECONNREFUSED ${secret}`);
    },
    sleep: async () => {},
    retries: 1,
  });
  await assert.rejects(
    runScan({
      chain: CHAIN,
      settings: SETTINGS,
      rpc,
      store: createStore(pathToFileURL(`${dir}/`)),
      clock: CLOCK,
      log: () => {},
      sleep: async () => {},
    }),
    (err) => {
      assert.doesNotMatch(err.message, /secret\.example|key/);
      return true;
    }
  );
});

test("stale rows above the checkpoint in a month the stage does not touch are removed", async () => {
  const reference = setup();
  await reference.scan();

  const { dir, store, scan } = setup();
  const march = Date.UTC(2024, 2, 5) / 1000;
  store.writePartition("2024-03", [{ b: 1700, ts: march, t: "0xdead", i: 0, f: "0x", r: "0x", v: "1" }]);
  await scan();

  assert.deepEqual(snapshot(dir), snapshot(reference.dir));
});
