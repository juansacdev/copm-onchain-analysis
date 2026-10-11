import { test } from "node:test";
import assert from "node:assert/strict";
import { groupByMonth, mergePartition, monthKey } from "../pipeline/domain/partition.js";
import { applyApprovals, newApprovals } from "../pipeline/domain/approvals.js";

const r = (b, i, ts = 1_700_000_000) => ({ b, ts, t: `0x${b}${i}`, i, f: "0xf", r: "0xr", v: "1" });

test("monthKey uses the UTC month, switching exactly at midnight", () => {
  assert.equal(monthKey(Date.UTC(2024, 0, 31, 23, 59, 59) / 1000), "2024-01");
  assert.equal(monthKey(Date.UTC(2024, 1, 1, 0, 0, 0) / 1000), "2024-02");
});

test("groupByMonth buckets rows by the month of their timestamp", () => {
  const jan = r(1, 0, Date.UTC(2024, 0, 31, 23, 59, 59) / 1000);
  const feb = r(2, 0, Date.UTC(2024, 1, 1) / 1000);
  const groups = groupByMonth([jan, feb]);
  assert.deepEqual([...groups.keys()], ["2024-01", "2024-02"]);
  assert.deepEqual(groups.get("2024-02"), [feb]);
});

test("mergePartition appends new rows ordered by block then log index", () => {
  const merged = mergePartition([r(1, 0)], [r(3, 1), r(2, 5), r(3, 0)], 1);
  assert.deepEqual(merged.map((x) => [x.b, x.i]), [[1, 0], [2, 5], [3, 0], [3, 1]]);
});

test("mergePartition drops stored rows above the previous checkpoint", () => {
  const leftover = [r(1, 0), r(7, 0), r(8, 0)];
  const merged = mergePartition(leftover, [r(7, 0)], 1);
  assert.deepEqual(merged.map((x) => x.b), [1, 7]);
});

test("mergePartition is idempotent: merging the same stage twice gives the same rows", () => {
  const stage = [r(5, 0), r(6, 1)];
  const once = mergePartition([r(1, 0)], stage, 1);
  const twice = mergePartition(once, stage, 1);
  assert.deepEqual(twice, once);
});

test("mergePartition dedupes by block and log index, the new row winning", () => {
  const merged = mergePartition([], [r(4, 0), { ...r(4, 0), v: "9" }], 0);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].v, "9");
});

test("applyApprovals counts per UTC day and per spender", () => {
  const approvals = newApprovals();
  applyApprovals(approvals, [
    { b: 10, ts: Date.UTC(2024, 2, 1, 23) / 1000, spender: "0xs1" },
    { b: 11, ts: Date.UTC(2024, 2, 2, 1) / 1000, spender: "0xs1" },
    { b: 12, ts: Date.UTC(2024, 2, 2, 2) / 1000, spender: "0xs2" },
  ]);
  assert.deepEqual(approvals.daily, { "2024-03-01": 1, "2024-03-02": 2 });
  assert.deepEqual(approvals.spenders, { "0xs1": 2, "0xs2": 1 });
  assert.equal(approvals.block, 12);
});

test("applyApprovals ignores events at or below the recorded block, so a replay adds nothing", () => {
  const approvals = newApprovals();
  const logs = [
    { b: 10, ts: 1_700_000_000, spender: "0xs1" },
    { b: 11, ts: 1_700_000_000, spender: "0xs1" },
  ];
  applyApprovals(approvals, logs);
  applyApprovals(approvals, [...logs, { b: 12, ts: 1_700_000_000, spender: "0xs1" }]);
  assert.equal(approvals.spenders["0xs1"], 3);
  assert.equal(approvals.block, 12);
});
