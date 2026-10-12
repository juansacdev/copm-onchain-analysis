import { test } from "node:test";
import assert from "node:assert/strict";
import { checkBatch, newRangeState, observeRange } from "../pipeline/domain/integrity.js";

const base = { blockNumber: 1000, canaryLogs: [{}, {}], expectedCanary: 2, lastRangeEnd: 990 };

test("a batch passes when the canary count matches and the head covers the last range", () => {
  assert.deepEqual(checkBatch(base), { ok: true });
  assert.deepEqual(checkBatch({ ...base, blockNumber: 990 }), { ok: true });
});

test("a wrong canary rejects the batch, whether it is empty or short", () => {
  assert.deepEqual(checkBatch({ ...base, canaryLogs: [] }), { ok: false, reason: "canary" });
  assert.deepEqual(checkBatch({ ...base, canaryLogs: [{}] }), { ok: false, reason: "canary" });
});

test("a head behind the last range rejects the batch", () => {
  assert.deepEqual(checkBatch({ ...base, blockNumber: 989 }), { ok: false, reason: "head" });
});

test("a missing head number is a head failure, not a pass", () => {
  assert.deepEqual(checkBatch({ ...base, blockNumber: null }), { ok: false, reason: "head" });
});

test("a non-empty answer finishes the range at once (R1)", () => {
  const state = observeRange(newRangeState(), 3, 6);
  assert.deepEqual(state, { empties: 0, done: true });
});

test("an empty answer needs the configured confirmations before it is final (R2)", () => {
  let state = newRangeState();
  state = observeRange(state, 0, 3);
  assert.deepEqual(state, { empties: 1, done: false });
  state = observeRange(state, 0, 3);
  assert.deepEqual(state, { empties: 2, done: false });
  state = observeRange(state, 0, 3);
  assert.deepEqual(state, { empties: 3, done: true });
});

test("an empty answer followed by a non-empty one for the same range is final and non-empty", () => {
  const afterEmpty = observeRange(newRangeState(), 0, 3);
  assert.equal(afterEmpty.done, false);
  assert.equal(observeRange(afterEmpty, 5, 3).done, true);
});

test("one confirmation means a single empty answer is enough", () => {
  assert.equal(observeRange(newRangeState(), 0, 1).done, true);
});
