import { test } from "node:test";
import assert from "node:assert/strict";
import { ZERO_ADDRESS } from "../pipeline/domain/units.js";
import { CSV_HEADER, buildDailySeries, dailyCsv, summarize } from "../pipeline/domain/aggregate.js";

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
  const summary = summarize({
    manifest: { chain: "celo", chainLabel: "Celo", address: "0xabc", decimals: 18 },
    chainKey: "celo",
    series,
    totals,
    transferEvents: 3,
    copPerUsd: 4000,
  });

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
});

test("dailyCsv writes a header, one row per day, approvals last, and no trailing newline", () => {
  const { series } = buildDailySeries(
    stamp([ev(100, 0, ZERO_ADDRESS, A, COPM(2)), ev(101, 0, A, B, COPM(1))], {
      100: day(2024, 3, 1),
      101: day(2024, 3, 1, 13),
    }),
    { "2024-03-01": 7 }
  );
  const csv = dailyCsv(series);

  assert.equal(
    csv,
    [
      CSV_HEADER,
      "2024-03-01,2,2,2,3,3,1,2,0,1,0,7",
    ].join("\n")
  );
});
