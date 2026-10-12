import { test } from "node:test";
import assert from "node:assert/strict";
import { ZERO_ADDRESS } from "../pipeline/domain/units.js";
import { CSV_HEADER, buildDailySeries as build, dailyCsv, summarize } from "../pipeline/domain/aggregate.js";
import { flatRates, rateTable } from "./helpers/rates.js";

// Most tests care about volumes and supply, not about the rate: they run on a
// flat 4,000 COP per USD. The tests of the rate itself pass their own table.
const RATES = flatRates(4000);
const buildDailySeries = (transfers, approvals = {}) => build(transfers, approvals, RATES);

const COPM = (n) => BigInt(n) * 10n ** 18n;
const A = "0xaaaa000000000000000000000000000000000001";
const B = "0xbbbb000000000000000000000000000000000002";
const day = (y, m, d, h = 12) => Date.UTC(y, m - 1, d, h) / 1000;

// Attaches the exact block timestamp the scan stores on every row.
const stamp = (transfers, tsByBlock) => transfers.map((t) => ({ ...t, ts: tsByBlock[t.b] }));

// Minimal raw event, as stored in a transfers partition (without ts).
const ev = (b, i, f, r, v, t = `0xtx${b}-${i}`) => ({ b, i, f, r, v: v.toString(), t });

test("a mint is counted as mint volume and raises the supply", () => {
  const transfers = [ev(100, 0, ZERO_ADDRESS, A, COPM(500))];
  const { series, totals } = buildDailySeries(stamp(transfers, { 100: day(2024, 3, 1) }));

  assert.equal(series.length, 1);
  const [d] = series;
  assert.equal(d.day, "2024-03-01");
  assert.equal(d.mintVolume, COPM(500));
  assert.equal(d.mintCount, 1);
  assert.equal(d.burnCount, 0);
  assert.equal(d.supplyEnd, COPM(500));
  assert.equal(totals.mint, COPM(500));
  assert.equal(totals.supply, COPM(500));
});

test("a burn is counted as burn volume and lowers the supply", () => {
  const transfers = [
    ev(100, 0, ZERO_ADDRESS, A, COPM(500)),
    ev(101, 0, A, ZERO_ADDRESS, COPM(200)),
  ];
  const { series, totals } = buildDailySeries(stamp(transfers, {
    100: day(2024, 3, 1),
    101: day(2024, 3, 1, 13),
  }));

  assert.equal(series[0].burnVolume, COPM(200));
  assert.equal(series[0].burnCount, 1);
  assert.equal(series[0].supplyEnd, COPM(300));
  assert.equal(totals.burn, COPM(200));
  assert.equal(totals.supply, COPM(300));
});

test("a plain transfer is net volume and leaves the supply untouched", () => {
  const transfers = [
    ev(100, 0, ZERO_ADDRESS, A, COPM(500)),
    ev(101, 0, A, B, COPM(120)),
  ];
  const { series, totals } = buildDailySeries(stamp(transfers, {
    100: day(2024, 3, 1),
    101: day(2024, 3, 1, 13),
  }));

  assert.equal(series[0].netVolume, COPM(120));
  assert.equal(series[0].grossVolume, COPM(620));
  assert.equal(series[0].transfers, 2);
  assert.equal(series[0].supplyEnd, COPM(500));
  assert.equal(totals.gross, COPM(620));
});

test("events are bucketed by UTC day and the supply accumulates across days", () => {
  const transfers = [
    ev(100, 0, ZERO_ADDRESS, A, COPM(500)),
    ev(200, 0, ZERO_ADDRESS, B, COPM(300)),
    ev(300, 0, A, ZERO_ADDRESS, COPM(100)),
  ];
  const { series } = buildDailySeries(stamp(transfers, {
    100: day(2024, 3, 1, 23),
    200: day(2024, 3, 2, 0),
    300: day(2024, 3, 2, 9),
  }));

  assert.deepEqual(
    series.map((d) => [d.day, d.supplyEnd]),
    [
      ["2024-03-01", COPM(500)],
      ["2024-03-02", COPM(700)],
    ]
  );
});

test("days without events are filled in and carry the previous supply", () => {
  const transfers = [
    ev(100, 0, ZERO_ADDRESS, A, COPM(500)),
    ev(200, 0, A, B, COPM(10)),
  ];
  const { series } = buildDailySeries(stamp(transfers, {
    100: day(2024, 3, 1),
    200: day(2024, 3, 4),
  }));

  assert.deepEqual(series.map((d) => d.day), [
    "2024-03-01",
    "2024-03-02",
    "2024-03-03",
    "2024-03-04",
  ]);
  const quiet = series[1];
  assert.equal(quiet.transfers, 0);
  assert.equal(quiet.activeAddresses, 0);
  assert.equal(quiet.supplyEnd, COPM(500));
  assert.equal(series[3].supplyEnd, COPM(500));
});

test("active addresses counts distinct from/to addresses, zero address included", () => {
  const transfers = [
    ev(100, 0, ZERO_ADDRESS, A, COPM(5)), // mint: zero + A
    ev(100, 1, A, B, COPM(1)), // A -> B: adds B
    ev(100, 2, B, A, COPM(1)), // repeat pair: no new addresses
  ];
  const { series } = buildDailySeries(stamp(transfers, { 100: day(2024, 3, 1) }));

  assert.equal(series[0].activeAddresses, 3);
  assert.equal(series[0].uniqueTxs, 3);
});

test("uniqueTxs collapses events that share a transaction hash", () => {
  const transfers = [
    ev(100, 0, A, B, COPM(1), "0xsame"),
    ev(100, 1, B, A, COPM(1), "0xsame"),
  ];
  const { series } = buildDailySeries(stamp(transfers, { 100: day(2024, 3, 1) }));

  assert.equal(series[0].transfers, 2);
  assert.equal(series[0].uniqueTxs, 1);
});

test("a zero-value transfer counts as an event but adds no volume", () => {
  const transfers = [ev(100, 0, A, B, 0n)];
  const { series, totals } = buildDailySeries(stamp(transfers, { 100: day(2024, 3, 1) }));

  assert.equal(series[0].transfers, 1);
  assert.equal(series[0].grossVolume, 0n);
  assert.equal(totals.gross, 0n);
});

test("events are ordered by timestamp then log index regardless of input order", () => {
  const transfers = [
    ev(300, 0, A, ZERO_ADDRESS, COPM(100)),
    ev(100, 0, ZERO_ADDRESS, A, COPM(500)),
  ];
  const { series } = buildDailySeries(stamp(transfers, {
    100: day(2024, 3, 1),
    300: day(2024, 3, 2),
  }));

  assert.equal(series[0].supplyEnd, COPM(500));
  assert.equal(series[1].supplyEnd, COPM(400));
});

test("approvals are added to their day, and days without any carry zero", () => {
  const transfers = [
    ev(100, 0, ZERO_ADDRESS, A, COPM(5)),
    ev(200, 0, A, B, COPM(1)),
  ];
  const { series } = buildDailySeries(
    stamp(transfers, { 100: day(2024, 3, 1), 200: day(2024, 3, 3) }),
    { "2024-03-01": 4, "2024-03-03": 1, "2024-02-01": 9, "2024-04-01": 9 }
  );

  assert.deepEqual(series.map((d) => [d.day, d.approvals]), [
    ["2024-03-01", 4],
    ["2024-03-02", 0],
    ["2024-03-03", 1],
  ]);
});

test("without an approvals map every day has zero approvals", () => {
  const { series } = buildDailySeries(stamp([ev(100, 0, A, B, COPM(1))], { 100: day(2024, 3, 1) }));
  assert.equal(series[0].approvals, 0);
});

// summarize() and dailyCsv() were extracted alongside buildDailySeries; their
// tests below were written after the code, and the committed data/ files act
// as the byte-for-byte regression oracle (see the aggregate step check).

// Two days with two different rates: 4,000 on March 1st and 3,000 on March 2nd.
const TWO_RATES = rateTable("2024-03-01", [4000, 3000]);
const twoDays = () => {
  const transfers = [
    ev(100, 0, ZERO_ADDRESS, A, COPM(4_000_000)), // day 1: mint 4M
    ev(101, 0, A, B, COPM(1_000_000)), // day 1: wallet 1M
    ev(200, 0, A, ZERO_ADDRESS, COPM(300_000)), // day 2: burn 300k
    ev(201, 0, B, A, COPM(600_000)), // day 2: wallet 600k
  ];
  return stamp(transfers, {
    100: day(2024, 3, 1),
    101: day(2024, 3, 1, 13),
    200: day(2024, 3, 2),
    201: day(2024, 3, 2, 13),
  });
};
const MANIFEST = { chain: "celo", chainLabel: "Celo", address: "0xabc", decimals: 18 };

test("every day carries the rate of its own day and its USD amounts at that rate", () => {
  const { series } = build(twoDays(), {}, TWO_RATES);
  const [d1, d2] = series;

  assert.equal(d1.rate, 4000);
  assert.equal(d1.provisional, false);
  assert.equal(d1.grossUsd, 1250); // 5M COPM / 4000
  assert.equal(d1.mintUsd, 1000);
  assert.equal(d1.netUsd, 250);
  assert.equal(d1.burnUsd, 0);
  assert.equal(d1.supplyEndUsd, 1000);

  assert.equal(d2.rate, 3000);
  assert.equal(d2.grossUsd, 300); // 900k COPM / 3000
  assert.equal(d2.burnUsd, 100);
  assert.equal(d2.supplyEndUsd, 1233.33, "supply is valued at the rate of the day it refers to");
});

test("a day after the last published rate uses the last known rate and is provisional", () => {
  const { series } = build(twoDays(), {}, rateTable("2024-03-01", [4000]));
  assert.deepEqual(series.map((d) => [d.rate, d.provisional]), [[4000, false], [4000, true]]);
});

test("a day before the first rate is an error, not a silent default", () => {
  assert.throws(() => build(twoDays(), {}, rateTable("2024-03-02", [3000, 3000])), /before the first rate/);
});

test("building the series without rates is an error", () => {
  assert.throws(() => build(twoDays(), {}), /rates/);
});

test("USD totals are sums of daily amounts, not the COPM total over a single rate", () => {
  const { series, totals } = build(twoDays(), {}, TWO_RATES);
  const summary = summarize({ manifest: MANIFEST, chainKey: "celo", series, totals, transferEvents: 4 });

  assert.equal(summary.totals.grossVolumeUSD, 1250 + 300);
  assert.equal(summary.totals.netVolumeUSD, 250 + 200);
  assert.equal(summary.totals.totalMintedUSD, 1000);
  assert.equal(summary.totals.totalBurnedUSD, 100);
  assert.equal(summary.totals.currentSupplyUSD, 1233.33);
  const oneRate = 5_900_000 / 4000;
  assert.notEqual(summary.totals.grossVolumeUSD, oneRate);
  assert.notEqual(summary.totals.grossVolumeUSD, 5_900_000 / 3000);
  assert.equal(summary.averages.avgDailyGrossVolumeUSD, (1250 + 300) / 2);
});

test("the summary states the rate it ended on and the range of rates over the series", () => {
  const { series, totals } = build(twoDays(), {}, rateTable("2024-03-01", [4000, 3000, 3500]));
  const summary = summarize({ manifest: MANIFEST, chainKey: "celo", series, totals, transferEvents: 4 });
  assert.deepEqual(summary.fx, {
    latestDay: "2024-03-02",
    latestCopPerUsd: 3000,
    provisionalDays: 0,
    minCopPerUsd: 3000,
    maxCopPerUsd: 4000,
  });
});

test("summarize reports totals, averages and peaks in COPM and USD", () => {
  const transfers = [
    ev(100, 0, ZERO_ADDRESS, A, COPM(4000)),
    ev(101, 0, A, B, COPM(1000)),
    ev(200, 0, A, ZERO_ADDRESS, COPM(400)),
  ];
  const { series, totals } = buildDailySeries(stamp(transfers, {
    100: day(2024, 3, 1),
    101: day(2024, 3, 1, 13),
    200: day(2024, 3, 2),
  }));
  const summary = summarize({ manifest: MANIFEST, chainKey: "celo", series, totals, transferEvents: 3 });

  assert.deepEqual(summary.range, { firstDay: "2024-03-01", lastDay: "2024-03-02", totalDays: 2 });
  assert.equal(summary.totals.grossVolumeCOPM, 5400);
  assert.equal(summary.totals.grossVolumeUSD, 1.35);
  assert.equal(summary.totals.netVolumeCOPM, 1000);
  assert.equal(summary.totals.totalMintedCOPM, 4000);
  assert.equal(summary.totals.totalBurnedCOPM, 400);
  assert.equal(summary.totals.currentSupplyCOPM, 3600);
  assert.equal(summary.averages.avgEndOfDaySupplyCOPM, 3800);
  assert.equal(summary.averages.avgDailyTransfers, 1.5);
  assert.deepEqual(summary.peaks.maxTransfersInOneDay, { day: "2024-03-01", count: 2 });
  assert.equal(summary.peaks.maxSupplyEndOfDay.day, "2024-03-01");
  assert.equal(summary.peaks.maxSupplyEndOfDay.copm, 4000);
  assert.equal(summary.peaks.maxSupplyEndOfDay.usd, 1);
  assert.equal(summary.peaks.maxGrossVolumeInOneDay.usd, 1.25);
});

test("dailyCsv writes a header, one row per day, the original columns first and the rate and USD columns last, with no trailing newline", () => {
  const { series } = buildDailySeries(
    stamp([ev(100, 0, ZERO_ADDRESS, A, COPM(2000)), ev(101, 0, A, B, COPM(1000))], {
      100: day(2024, 3, 1),
      101: day(2024, 3, 1, 13),
    }),
    { "2024-03-01": 7 }
  );
  const csv = dailyCsv(series);

  assert.equal(
    CSV_HEADER,
    "day,supply_end_copm,transfers,unique_txs,active_addresses,gross_volume_copm,net_volume_copm,mint_copm,burn_copm,mint_count,burn_count,approvals," +
      "cop_per_usd,supply_end_usd,gross_volume_usd,net_volume_usd,mint_usd,burn_usd"
  );
  assert.equal(csv, [CSV_HEADER, "2024-03-01,2000,2,2,3,3000,1000,2000,0,1,0,7,4000,0.5,0.75,0.25,0.5,0"].join("\n"));
});
