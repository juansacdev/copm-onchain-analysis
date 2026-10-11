import { test } from "node:test";
import assert from "node:assert/strict";
import { groupBatches, planRanges, planStages } from "../pipeline/domain/ranges.js";

test("planRanges covers the interval with inclusive ranges and a short last one", () => {
  assert.deepEqual(planRanges(1, 25, 10), [
    { from: 1, to: 10 },
    { from: 11, to: 20 },
    { from: 21, to: 25 },
  ]);
});

test("planRanges returns one range when the interval fits, and none when it is empty", () => {
  assert.deepEqual(planRanges(5, 5, 10), [{ from: 5, to: 5 }]);
  assert.deepEqual(planRanges(6, 5, 10), []);
});

test("planRanges rejects a non-positive size", () => {
  assert.throws(() => planRanges(1, 10, 0), /size must be a positive integer/);
});

test("planStages splits the pinned interval into stages of stageBlocks", () => {
  assert.deepEqual(planStages(100, 350, 100), [
    { from: 100, to: 199 },
    { from: 200, to: 299 },
    { from: 300, to: 350 },
  ]);
});

test("groupBatches chunks ranges by rangesPerBatch, keeping order", () => {
  const ranges = planRanges(1, 50, 10);
  const batches = groupBatches(ranges, 2);
  assert.equal(batches.length, 3);
  assert.deepEqual(batches[0], [ranges[0], ranges[1]]);
  assert.deepEqual(batches[2], [ranges[4]]);
});
