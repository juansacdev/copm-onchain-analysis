import { test } from "node:test";
import assert from "node:assert/strict";
import { ZERO_ADDRESS, toCOPM, dayOf } from "../pipeline/domain/units.js";

test("toCOPM converts 18-decimal raw units to a number with 6 decimals", () => {
  assert.equal(toCOPM(0n), 0);
  assert.equal(toCOPM(10n ** 18n), 1);
  assert.equal(toCOPM(1_500_000n * 10n ** 12n), 1.5);
});

test("toCOPM truncates below the 6th decimal", () => {
  assert.equal(toCOPM(10n ** 12n - 1n), 0);
  assert.equal(toCOPM(10n ** 12n), 0.000001);
});

test("dayOf buckets a unix timestamp into its UTC day", () => {
  assert.equal(dayOf(Date.UTC(2024, 0, 31, 23, 59, 59) / 1000), "2024-01-31");
  assert.equal(dayOf(Date.UTC(2024, 1, 1, 0, 0, 0) / 1000), "2024-02-01");
});

test("the zero address is the mint source and burn sink", () => {
  assert.equal(ZERO_ADDRESS, "0x0000000000000000000000000000000000000000");
});
