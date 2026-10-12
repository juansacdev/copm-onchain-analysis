import { test } from "node:test";
import assert from "node:assert/strict";
import { mapPool } from "../pipeline/adapters/pool.js";

test("runs every item and never more than `concurrency` at once", async () => {
  let running = 0;
  let peak = 0;
  const seen = [];
  await mapPool([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
    running++;
    peak = Math.max(peak, running);
    await new Promise((resolve) => setImmediate(resolve));
    seen.push(n);
    running--;
  });
  assert.deepEqual(seen.sort(), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(peak, 3);
});

test("an empty list resolves without starting a worker, and a failure rejects", async () => {
  await mapPool([], 4, async () => assert.fail("must not run"));
  await assert.rejects(mapPool([1], 2, async () => { throw new Error("boom"); }), /boom/);
});
