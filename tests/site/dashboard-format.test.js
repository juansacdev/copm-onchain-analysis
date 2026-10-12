import { test } from "node:test";
import assert from "node:assert/strict";
import { amountCompact, amountFull, arrowFor, changeText, utcDateTime } from "../../site/src/lib/dashboard-format.js";

const RATE = 4000;

test("compact amounts follow the unit: COPM through the shared formatter, USD at the fixed rate", () => {
  assert.equal(amountCompact(8_000_000_000, "usd", "en", RATE), "$2M");
  assert.equal(amountCompact(2_000_000_000_000, "copm", "en", RATE), "2T COPM");
  assert.equal(amountCompact(8_000_000_000, "usd", "es", RATE), "US$2 M");
  assert.equal(amountCompact(2_500_000_000_000, "copm", "es", RATE), "2,5 billones COPM");
  assert.equal(amountCompact(0, "copm", "en", RATE), "0 COPM");
});

test("full amounts are whole numbers with the language's separators", () => {
  assert.equal(amountFull(154_473_254_726.26, "copm", "es", RATE), "154.473.254.726 COPM");
  assert.equal(amountFull(154_473_254_726.26, "copm", "en", RATE), "154,473,254,726 COPM");
  assert.equal(amountFull(8_000_000, "usd", "en", RATE), "$2,000");
  assert.equal(amountFull(8_000_000, "usd", "es", RATE), "US$2.000");
});

test("a change is a signed percentage with one decimal; no base gives nothing to print", () => {
  assert.equal(changeText(5.562, "en"), "+5.6%");
  assert.equal(changeText(-85.6, "es"), "-85,6 %");
  assert.equal(changeText(0, "en"), "0.0%");
  assert.equal(changeText(null, "en"), null);
});

test("the arrow is neutral text: up, down or level", () => {
  assert.equal(arrowFor(5), "↑");
  assert.equal(arrowFor(-5), "↓");
  assert.equal(arrowFor(0), "→");
  assert.equal(arrowFor(0.01), "→", "below the one-decimal precision it reads as level");
  assert.equal(arrowFor(null), "");
});

test("block time is printed in UTC from the unix seconds, with no clock involved", () => {
  assert.equal(utcDateTime(1791760950), "2026-10-11 23:22 UTC");
});
