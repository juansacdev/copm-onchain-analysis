import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createStore } from "../pipeline/adapters/store.js";

function tempStore() {
  const dir = mkdtempSync(join(tmpdir(), "copm-store-"));
  const url = pathToFileURL(`${dir}/`);
  return { store: createStore(url), dir, url };
}
const row = (b, i) => ({ b, ts: 1_700_000_000, t: `0x${b}`, i, f: "0xf", r: "0xr", v: "1" });

test("state, admin events and approvals round-trip; missing files read as empty", () => {
  const { store } = tempStore();
  assert.equal(store.readState(), null);
  assert.deepEqual(store.readAdminEvents(), []);
  assert.deepEqual(store.readApprovals(), { block: 0, daily: {}, spenders: {} });

  store.writeState({ schema: 1, lastBlock: 5 });
  store.writeAdminEvents([{ b: 1, i: 0, name: "Upgraded" }]);
  store.writeApprovals({ block: 9, daily: { "2024-01-01": 2 }, spenders: { "0xs": 2 } });

  assert.deepEqual(store.readState(), { schema: 1, lastBlock: 5 });
  assert.deepEqual(store.readAdminEvents(), [{ b: 1, i: 0, name: "Upgraded" }]);
  assert.equal(store.readApprovals().block, 9);
});

test("partitions are listed in month order and read back row by row", () => {
  const { store } = tempStore();
  assert.deepEqual(store.listPartitions(), []);
  store.writePartition("2024-02", [row(3, 0)]);
  store.writePartition("2024-01", [row(1, 0), row(2, 0)]);

  assert.deepEqual(store.listPartitions(), ["2024-01", "2024-02"]);
  assert.deepEqual(store.readPartition("2024-01"), [row(1, 0), row(2, 0)]);
  assert.deepEqual(store.readPartition("2030-01"), []);
  assert.deepEqual(store.readTransfers().map((r) => r.b), [1, 2, 3]);
});

test("writing an empty partition removes its file", () => {
  const { store } = tempStore();
  store.writePartition("2024-01", [row(1, 0)]);
  store.writePartition("2024-01", []);
  assert.deepEqual(store.listPartitions(), []);
});

test("writes are atomic: no temporary file is left behind", () => {
  const { store, dir } = tempStore();
  store.writeState({ schema: 1 });
  store.writePartition("2024-01", [row(1, 0)]);
  const leftovers = [...readdirSync(dir), ...readdirSync(join(dir, "transfers"))].filter((f) =>
    f.endsWith(".tmp")
  );
  assert.deepEqual(leftovers, []);
});

test("clear removes the scan outputs and nothing else", () => {
  const { store, dir } = tempStore();
  store.writeState({ schema: 1 });
  store.writePartition("2024-01", [row(1, 0)]);
  store.writeAdminEvents([{ b: 1 }]);
  store.writeApprovals({ block: 1, daily: {}, spenders: {} });
  writeFileSync(join(dir, "manifest.json"), "{}");
  writeFileSync(join(dir, "transfers.jsonl"), "legacy\n");

  store.clear();

  assert.equal(store.readState(), null);
  assert.deepEqual(store.listPartitions(), []);
  assert.deepEqual(store.readAdminEvents(), []);
  assert.equal(existsSync(join(dir, "manifest.json")), true);
  assert.equal(existsSync(join(dir, "transfers.jsonl")), true);
});

test("a partition file is one JSON object per line", () => {
  const { store, url } = tempStore();
  store.writePartition("2024-01", [row(1, 0), row(2, 0)]);
  const text = readdirSync(fileURLToPath(new URL("transfers/", url)));
  assert.deepEqual(text, ["2024-01.jsonl"]);
});
