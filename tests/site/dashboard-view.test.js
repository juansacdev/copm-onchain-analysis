import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bucketize,
  granularityFor,
  heatCells,
  largestRows,
  measureKey,
  sliceDaily,
  tilesFor,
  valueAt,
  viewWindow,
} from "../../site/src/lib/dashboard-view.js";

const days = (from, count) =>
  Array.from({ length: count }, (_, k) => new Date(Date.parse(`${from}T00:00:00Z`) + k * 86_400_000).toISOString().slice(0, 10));

// 100 days from 2025-01-01 (a Wednesday): transfers = 1 each day, volume = 10, supply grows by 5.
function chain(key, { from = "2025-01-01", count = 100, endDay = null, holders = 7, largest = {} } = {}) {
  const day = days(from, count);
  return {
    key,
    checkpoint: { block: 1000, time: 1, totalSupply: count * 5, totalSupplyUsd: (count * 5) / 4, firstDay: day[0], lastDay: day.at(-1) },
    activity: { endDay: endDay ?? day.at(-1), days: 30 },
    daily: {
      day,
      transfers: day.map(() => 1),
      volume: day.map(() => 10),
      mint: day.map(() => 5),
      burn: day.map(() => 0),
      supply: day.map((_, k) => (k + 1) * 5),
      // USD at a rate that moves: 2 for the first fifty days, 4 after.
      volumeUsd: day.map((_, k) => (k < 50 ? 5 : 2.5)),
      mintUsd: day.map((_, k) => (k < 50 ? 2.5 : 1.25)),
      burnUsd: day.map(() => 0),
      supplyUsd: day.map((_, k) => ((k + 1) * 5) / (k < 50 ? 2 : 4)),
    },
    holders: { count: holders },
    largest: { d30: [], d90: [], d365: [], all: [], ...largest },
  };
}

test("granularity: short periods are drawn by week, long ones by month", () => {
  assert.equal(granularityFor("30d"), "week");
  assert.equal(granularityFor("90d"), "week");
  assert.equal(granularityFor("1y"), "month");
  assert.equal(granularityFor("all"), "month");
});

test("window: ends on the latest complete day of the chains in view and goes back by the period", () => {
  const chains = { polygon: chain("polygon", { endDay: "2025-04-09" }), celo: chain("celo", { endDay: "2025-04-05" }) };
  assert.deepEqual(viewWindow(chains, { chain: "both", period: "30d" }), { fromDay: "2025-03-11", toDay: "2025-04-09", days: 30 });
  assert.deepEqual(viewWindow(chains, { chain: "celo", period: "90d" }), { fromDay: "2025-01-06", toDay: "2025-04-05", days: 90 });
  const all = viewWindow(chains, { chain: "both", period: "all" });
  assert.deepEqual([all.fromDay, all.toDay, all.days], ["2025-01-01", "2025-04-09", null]);
});

test("slice: keeps the days inside the window, aligned across every array", () => {
  const c = chain("polygon");
  const s = sliceDaily(c.daily, "2025-01-10", "2025-01-12");
  assert.deepEqual(s.day, ["2025-01-10", "2025-01-11", "2025-01-12"]);
  assert.deepEqual(s.supply, [50, 55, 60]);
  assert.deepEqual(sliceDaily(c.daily, "2030-01-01", "2030-02-01").day, []);
});

test("value at a day: the last known value on or before it, zero before the series starts", () => {
  const c = chain("polygon");
  assert.equal(valueAt(c.daily, "supply", "2025-01-10"), 50);
  assert.equal(valueAt(c.daily, "supply", "2099-01-01"), 500);
  assert.equal(valueAt(c.daily, "supply", "2024-12-31"), 0);
});

test("buckets by month sum the flows and keep the last supply of each month", () => {
  const s = sliceDaily(chain("polygon").daily, "2025-01-30", "2025-02-02");
  const b = bucketize(s, "month");
  assert.deepEqual(b.bucket, ["2025-01", "2025-02"]);
  assert.deepEqual(b.transfers, [2, 2]);
  assert.deepEqual(b.volume, [20, 20]);
  assert.deepEqual(b.supply, [155, 165]);
});

test("buckets by week are named by the first day of the window they cover", () => {
  const s = sliceDaily(chain("polygon").daily, "2025-01-01", "2025-01-13"); // Wed .. Mon
  const b = bucketize(s, "week");
  assert.deepEqual(b.bucket, ["2025-01-01", "2025-01-06", "2025-01-13"], "the first bar starts on the window's first day, not on a Monday before it");
  assert.deepEqual(b.transfers, [5, 7, 1]);
});

test("buckets say which bars cover fewer days than a whole week or month", () => {
  const week = bucketize(sliceDaily(chain("polygon").daily, "2025-01-01", "2025-01-13"), "week");
  assert.deepEqual(week.partial, [true, false, true], "Wed..Sun, Mon..Sun, Mon alone");
  const whole = bucketize(sliceDaily(chain("polygon").daily, "2025-01-06", "2025-01-19"), "week");
  assert.deepEqual(whole.partial, [false, false]);
  const month = bucketize(sliceDaily(chain("polygon").daily, "2025-01-15", "2025-03-31"), "month");
  assert.deepEqual(month.bucket, ["2025-01", "2025-02", "2025-03"]);
  assert.deepEqual(month.partial, [true, false, false]);
  const tail = bucketize(sliceDaily(chain("polygon").daily, "2025-01-01", "2025-02-10"), "month");
  assert.deepEqual(tail.partial, [false, true]);
});

test("tiles: volume and transfers compare the window with the one before it, summed over the chains in view", () => {
  const chains = { polygon: chain("polygon"), celo: chain("celo", { holders: 3 }) };
  const t = tilesFor(chains, { chain: "both", period: "30d" });
  assert.equal(t.volume.current, 600);
  assert.equal(t.volume.previous, 600);
  assert.equal(t.volume.changePct, 0);
  assert.equal(t.transfers.current, 60);
  assert.equal(t.supply.value, 1000, "supply is the checkpoint value of each chain");
  assert.equal(t.holders, 10);
  assert.deepEqual(t.blocks.map((b) => b.chain), ["polygon", "celo"]);
  assert.equal(tilesFor(chains, { chain: "celo", period: "30d" }).holders, 3);
});

test("tiles: the whole history has nothing before it, so no change is reported", () => {
  const t = tilesFor({ polygon: chain("polygon") }, { chain: "polygon", period: "all" });
  assert.equal(t.volume.current, 1000);
  assert.equal(t.volume.previous, null);
  assert.equal(t.volume.changePct, null);
  assert.equal(t.supply.changePct, null);
});

test("tiles: a window that started before the data has no previous value to compare", () => {
  const t = tilesFor({ polygon: chain("polygon", { count: 40 }) }, { chain: "polygon", period: "90d" });
  assert.equal(t.volume.current, 400);
  assert.equal(t.volume.changePct, null);
});

test("tiles: supply change compares the checkpoint with the day before the window", () => {
  const t = tilesFor({ polygon: chain("polygon") }, { chain: "polygon", period: "30d" });
  assert.equal(t.supply.value, 500);
  assert.equal(t.supply.previous, 350);
  assert.ok(Math.abs(t.supply.changePct - (150 / 350) * 100) < 1e-9);
});

const big = (chainKey, amount, day = "2025-04-09") => ({ day, amount, kind: "transfer", from: "a", to: "b", tx: `${chainKey}${amount}`, block: amount });

test("largest transfers: the list for the period, both chains merged, biggest first, capped", () => {
  const chains = {
    polygon: chain("polygon", { largest: { d30: [big("p", 9), big("p", 3)], all: [big("p", 100)] } }),
    celo: chain("celo", { largest: { d30: [big("c", 7)], all: [big("c", 50)] } }),
  };
  const rows = largestRows(chains, { chain: "both", period: "30d" }, 2);
  assert.deepEqual(rows.map((r) => [r.chain, r.amount]), [["polygon", 9], ["celo", 7]]);
  assert.deepEqual(largestRows(chains, { chain: "celo", period: "all" }, 25).map((r) => r.amount), [50]);
  assert.deepEqual(largestRows(chains, { chain: "both", period: "all" }, 25).map((r) => r.amount), [100, 50]);
});

test("calendar cells: one per day, weeks counted from the Monday of the first day", () => {
  const s = sliceDaily(chain("polygon").daily, "2025-01-01", "2025-01-13");
  const cells = heatCells(s);
  assert.equal(cells.length, 13);
  assert.deepEqual([cells[0].week, cells[0].weekday], [0, 2], "2025-01-01 is a Wednesday in the week of Mon 2024-12-30");
  assert.deepEqual([cells[5].week, cells[5].weekday], [1, 0], "2025-01-06 is the first Monday");
  assert.deepEqual([cells.at(-1).week, cells.at(-1).weekday], [2, 0]);
  assert.equal(cells[0].transfers, 1);
});

test("period turnover is only reported when the period minted a material share of its gross volume", async () => {
  const { periodTurnover } = await import("../../site/src/lib/dashboard-view.js");
  assert.equal(periodTurnover({ gross: 700, minted: 100 }), 7);
  // exactly 100 times is still reported; above it the ratio says nothing about turnover
  assert.equal(periodTurnover({ gross: 1000, minted: 10 }), 100);
  assert.equal(periodTurnover({ gross: 1214, minted: 2.7 }), null);
  assert.equal(periodTurnover({ gross: 500, minted: 0 }), null);
  assert.equal(periodTurnover({ gross: 0, minted: 0 }), null);
});

/* USD ------------------------------------------------------------------------ */

test("measureKey names the daily array of a measure in the chosen unit", () => {
  assert.equal(measureKey("volume", "copm"), "volume");
  assert.equal(measureKey("volume", "usd"), "volumeUsd");
  assert.equal(measureKey("supply", "usd"), "supplyUsd");
});

test("buckets add the USD of each day, so a bar is not its COPM over one rate", () => {
  const s = sliceDaily(chain("polygon").daily, "2025-02-15", "2025-03-05"); // days 46..64: rate changes on 2025-02-20
  const b = bucketize(s, "month");
  // February 15..28 = 14 days: days 46..50 (index 45..49) at 5 USD, the other nine at 2.5
  assert.equal(b.volumeUsd[0], 5 * 5 + 9 * 2.5);
  assert.equal(b.volume[0], 140);
  assert.notEqual(b.volumeUsd[0], b.volume[0] / 2);
  assert.equal(b.supplyUsd[1], 320 / 4, "the supply of a bucket is its last day's, at that day's rate");
});

test("tiles in USD sum the daily USD amounts and read the supply in USD", () => {
  const chains = { polygon: chain("polygon") };
  const copm = tilesFor(chains, { chain: "polygon", period: "all", unit: "copm" });
  const usd = tilesFor(chains, { chain: "polygon", period: "all", unit: "usd" });
  assert.equal(copm.volume.current, 1000);
  assert.equal(usd.volume.current, 50 * 5 + 50 * 2.5);
  assert.equal(usd.supply.value, 125);
  assert.equal(copm.transfers.current, usd.transfers.current, "counts do not depend on the unit");
});

test("tiles in USD compare windows in USD and the supply with the day before at that day's rate", () => {
  const chains = { polygon: chain("polygon") };
  const t = tilesFor(chains, { chain: "polygon", period: "30d", unit: "usd" });
  assert.equal(t.volume.current, 30 * 2.5);
  assert.equal(t.volume.previous, 20 * 2.5 + 10 * 5 - 0);
  assert.equal(t.supply.previous, 350 / 4);
});

test("the largest transfers keep their COPM order whatever the unit", () => {
  const rows = (unit) => largestRows({ polygon: chain("polygon", { largest: { d30: [{ ...big("p", 9), usd: 1 }, { ...big("p", 3), usd: 5 }] } }) }, { chain: "polygon", period: "30d", unit }, 25);
  assert.deepEqual(rows("usd").map((r) => r.amount), [9, 3]);
});
