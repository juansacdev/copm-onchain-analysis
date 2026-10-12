import { test } from "node:test";
import assert from "node:assert/strict";
import { amountCompact, amountFull, arrowFor, changeText, eventArgText, rowAmount, shortDate, tileNotes, utcDateTime } from "../../site/src/lib/dashboard-format.js";

test("compact amounts follow the unit: COPM through the shared formatter, USD as the value already in dollars", () => {
  assert.equal(amountCompact(2_000_000, "usd", "en"), "$2M");
  assert.equal(amountCompact(2_000_000_000_000, "copm", "en"), "2T COPM");
  assert.equal(amountCompact(2_000_000, "usd", "es"), "US$2 M");
  assert.equal(amountCompact(2_500_000_000_000, "copm", "es"), "2,5 billones COPM");
  assert.equal(amountCompact(0, "copm", "en"), "0 COPM");
});

test("full amounts are whole numbers with the language's separators", () => {
  assert.equal(amountFull(154_473_254_726.26, "copm", "es"), "154.473.254.726 COPM");
  assert.equal(amountFull(154_473_254_726.26, "copm", "en"), "154,473,254,726 COPM");
  assert.equal(amountFull(2000.4, "usd", "en"), "$2,000");
  assert.equal(amountFull(2000.4, "usd", "es"), "US$2.000");
});

test("the amount of a row follows the unit: its own COPM, or its USD at its own day's rate", () => {
  const row = { amount: 8_000_000, usd: 2500 };
  assert.equal(rowAmount(row, "copm"), 8_000_000);
  assert.equal(rowAmount(row, "usd"), 2500);
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

test("BurnedFrozen shows its amount in COPM, not in raw wei; other arguments stay as they are", () => {
  const wei = "30672824591542995207235322";
  assert.equal(eventArgText("BurnedFrozen", "amount", wei, "en"), "30,672,824.59 COPM");
  assert.equal(eventArgText("BurnedFrozen", "amount", wei, "es"), "30.672.824,59 COPM");
  assert.equal(eventArgText("BurnedFrozen", "account", "0xabc", "en"), "0xabc");
  assert.equal(eventArgText("RoleGranted", "amount", wei, "en"), wei);
});

test("tile notes carry the checkpoint date, the contract count and the last-complete-day wording", () => {
  const t = {
    tiles: {
      supply: { note: "as of {date}" },
      volume: { note: "volume" },
      transfers: { note: "transfers" },
      holders: { note: "{contracts} contracts" },
      block: {},
    },
  };
  const tiles = { blocks: [{ time: 1791760950 }, { time: 1791700000 }], contracts: 244 };
  const notes = tileNotes({ tiles, t, lang: "en" });
  assert.equal(notes.supply, "as of October 11, 2026");
  assert.equal(notes.holders, "244 contracts");
  assert.equal(notes.volume, "volume");
  assert.equal(notes.block, "");
});

test("a short date keeps the day, the month name and the year in few characters", () => {
  assert.equal(shortDate("2026-05-07", "es"), "7 may 2026");
  assert.equal(shortDate("2026-05-07", "en"), "May 7, 2026");
  assert.equal(shortDate("2025-12-31", "es"), "31 dic 2025");
});
