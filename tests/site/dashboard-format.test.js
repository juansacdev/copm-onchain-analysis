import { test } from "node:test";
import assert from "node:assert/strict";
import { amountCompact, amountFull, arrowFor, changeText, eventArgText, rateLine, rowAmount, shortDate, tileNotes, utcDateTime } from "../../site/src/lib/dashboard-format.js";

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

/* The rate line ----------------------------------------------------------------- */

import { dashboardDictionaries } from "../../site/src/i18n/index.js";

const FX = { latest: 3194.44, latestDay: "2026-10-13", min: 3000, max: 4500, provisionalDays: 0, provisionalFrom: null };

test("the rate line states the latest rate and its day, and nothing more when no day is provisional", () => {
  for (const lang of ["es", "en"]) {
    const line = rateLine({ fx: FX, t: dashboardDictionaries[lang], lang });
    assert.match(line, /3[.,]194[.,]44/, lang);
    assert.doesNotMatch(line, /provisional/i, lang);
  }
});

test("the rate line says how many days are provisional and from which day", () => {
  const fx = { ...FX, provisionalDays: 3, provisionalFrom: "2026-10-14" };
  const en = rateLine({ fx, t: dashboardDictionaries.en, lang: "en" });
  assert.match(en, /3 days.*provisional.*October 14, 2026|3 days.*last known rate.*October 14, 2026/s);
  const es = rateLine({ fx, t: dashboardDictionaries.es, lang: "es" });
  assert.match(es, /3 días.*(provisional|última tasa conocida).*14 de octubre de 2026/s);
});

test("one provisional day is written in the singular", () => {
  const fx = { ...FX, provisionalDays: 1, provisionalFrom: "2026-10-14" };
  assert.match(rateLine({ fx, t: dashboardDictionaries.en, lang: "en" }), /1 day\b(?!s)/);
  assert.match(rateLine({ fx, t: dashboardDictionaries.es, lang: "es" }), /1 día\b(?!s)/);
});

test("a tile shows its change against the previous period, and nothing at all when there is no previous period", async () => {
  const { tileDelta } = await import("../../site/src/lib/dashboard-format.js");
  const t = { vsPeriod: "{change} vs the previous {n} days", vsStart: "{change} vs the start of the period" };
  assert.equal(tileDelta(5.562, "vsPeriod", { t, lang: "en", days: 30 }), "↑ +5.6% vs the previous 30 days");
  assert.equal(tileDelta(-30.8, "vsStart", { t, lang: "en", days: 30 }), "↓ -30.8% vs the start of the period");
  // "all" has no earlier period to compare with: the line is left out, not filled with a placeholder
  assert.equal(tileDelta(null, "vsPeriod", { t, lang: "en", days: null }), "");
  assert.equal(tileDelta(null, "vsStart", { t, lang: "es", days: null }), "");
});
