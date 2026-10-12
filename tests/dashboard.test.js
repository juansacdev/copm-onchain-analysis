import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SIZE_BINS,
  buildDashboard,
  compareWindows,
  flowParties,
  largestTransfers,
  movingAverage,
  sizeBin,
  sizeCounts,
  supplyPeak,
  topN,
  turnover,
  windowEndDay,
  windowSum,
} from "../pipeline/domain/dashboard.js";
import { ZERO_ADDRESS } from "../pipeline/domain/units.js";

const COPM = (n) => BigInt(n) * 10n ** 18n;
const A = `0x${"a1".repeat(20)}`;
const B = `0x${"b2".repeat(20)}`;
const C = `0x${"c3".repeat(20)}`;
const at = (y, m, d, h = 12) => Date.UTC(y, m - 1, d, h) / 1000;
let seq = 0;
const row = (ts, f, r, v) => ({ b: 100 + seq, ts, t: `0xtx${seq}`, i: seq++, f, r, v: BigInt(v).toString() });

/* Size bins ---------------------------------------------------------------- */

test("size bins: every power of ten opens a new bin, exactly at the boundary", () => {
  assert.equal(sizeBin(0n), 0);
  assert.equal(sizeBin(COPM(1)), 0);
  assert.equal(sizeBin(COPM(1000) - 1n), 0);
  assert.equal(sizeBin(COPM(1000)), 1);
  assert.equal(sizeBin(COPM(10_000) - 1n), 1);
  assert.equal(sizeBin(COPM(10_000)), 2);
  assert.equal(sizeBin(COPM(100_000_000_000) - 1n), SIZE_BINS.length - 2);
  assert.equal(sizeBin(COPM(100_000_000_000)), SIZE_BINS.length - 1);
  assert.equal(sizeBin(COPM(10) ** 3n), SIZE_BINS.length - 1);
});

test("size bins: labels run from < 1k to >= 100B, one per order of magnitude", () => {
  assert.equal(SIZE_BINS[0].label, "< 1k");
  assert.equal(SIZE_BINS[1].label, "1k–10k");
  assert.equal(SIZE_BINS.at(-1).label, ">= 100B");
  assert.equal(SIZE_BINS.length, 10);
});

test("size counts: only wallet-to-wallet transfers count; mint and burn are excluded", () => {
  const t = at(2024, 1, 1);
  const counts = sizeCounts([
    row(t, ZERO_ADDRESS, A, COPM(5_000_000)),
    row(t, A, B, COPM(999)),
    row(t, A, B, COPM(1000)),
    row(t, B, ZERO_ADDRESS, COPM(1000)),
  ]);
  assert.equal(counts[0], 1);
  assert.equal(counts[1], 1);
  assert.equal(counts.reduce((a, b) => a + b, 0), 2);
});

/* Windows ------------------------------------------------------------------ */

test("window end: a partial last day is left out", () => {
  assert.equal(windowEndDay(at(2026, 10, 11, 23)), "2026-10-10");
  assert.equal(windowEndDay(at(2026, 10, 11, 0)), "2026-10-10");
});

test("window end: a checkpoint on the last second of a day closes that day", () => {
  assert.equal(windowEndDay(Date.UTC(2026, 9, 11, 23, 59, 59) / 1000), "2026-10-11");
});

const DAYS = Array.from({ length: 70 }, (_, k) => new Date(Date.UTC(2026, 0, 1 + k)).toISOString().slice(0, 10));
const ONES = DAYS.map(() => 1);

test("window sum: a 30-day window ends on the end day and is inclusive on both ends", () => {
  const values = DAYS.map((_, k) => k + 1);
  // End day is DAYS[59] (value 60); window = values 31..60.
  assert.equal(windowSum({ day: DAYS, v: values }, DAYS[59], 30), (31 + 60) * 15);
});

test("window sum: days after the end day (the partial one) never count", () => {
  assert.equal(windowSum({ day: DAYS, v: ONES }, DAYS[59], 30), 30);
  assert.equal(windowSum({ day: DAYS, v: ONES }, DAYS[10], 30), 11);
});

test("compare windows: current against the 30 days before it, with the change in percent", () => {
  const v = DAYS.map((_, k) => (k >= 30 && k < 60 ? 2 : 1));
  const cmp = compareWindows({ day: DAYS, v }, DAYS[59], 30);
  assert.deepEqual(cmp, { current: 60, previous: 30, changePct: 100 });
});

test("compare windows: no change reports 0, no previous activity reports null", () => {
  assert.equal(compareWindows({ day: DAYS, v: ONES }, DAYS[59], 30).changePct, 0);
  const zeros = DAYS.map((_, k) => (k >= 30 ? 1 : 0));
  assert.equal(compareWindows({ day: DAYS, v: zeros }, DAYS[59], 30).changePct, null);
});

/* Moving average ----------------------------------------------------------- */

test("moving average: a trailing window, shorter at the start", () => {
  assert.deepEqual(movingAverage([2, 4, 6, 8], 3), [2, 3, 4, 6]);
});

test("moving average: edges and degenerate inputs", () => {
  assert.deepEqual(movingAverage([], 7), []);
  assert.deepEqual(movingAverage([5], 7), [5]);
  assert.deepEqual(movingAverage([1, 2, 3], 1), [1, 2, 3]);
  assert.throws(() => movingAverage([1], 0), /window/);
});

/* Top N -------------------------------------------------------------------- */

test("top N: biggest first, ties broken by address so the order never depends on input order", () => {
  const entries = [
    { address: C, volume: 5n, count: 1 },
    { address: A, volume: 5n, count: 2 },
    { address: B, volume: 9n, count: 3 },
  ];
  assert.deepEqual(topN(entries, 3).map((e) => e.address), [B, A, C]);
  assert.deepEqual(topN([...entries].reverse(), 3).map((e) => e.address), [B, A, C]);
  assert.equal(topN(entries, 2).length, 2);
  assert.deepEqual(topN([], 5), []);
});

/* Turnover ----------------------------------------------------------------- */

test("turnover: gross volume over minted, null when nothing was minted", () => {
  assert.equal(turnover(COPM(400), COPM(100)), 4);
  assert.equal(turnover(COPM(400), 0n), null);
  assert.equal(turnover(0n, 0n), null);
});

/* Mint recipients and burners ---------------------------------------------- */

test("flow parties: who received mints and who burned, with counts, volume and the top share", () => {
  const t = at(2024, 1, 1);
  const rows = [
    row(t, ZERO_ADDRESS, A, COPM(70)),
    row(t, ZERO_ADDRESS, A, COPM(10)),
    row(t, ZERO_ADDRESS, B, COPM(20)),
    row(t, A, B, COPM(1000)),
    row(t, B, ZERO_ADDRESS, COPM(5)),
    row(t, C, ZERO_ADDRESS, COPM(15)),
  ];
  const mints = flowParties(rows, "mint", 10);
  assert.equal(mints.addresses, 2);
  assert.equal(mints.transfers, 3);
  assert.equal(mints.volume, 100);
  assert.deepEqual(mints.top.map((p) => [p.address, p.count, p.volume]), [
    [A, 2, 80],
    [B, 1, 20],
  ]);
  assert.equal(mints.topSharePct, 80);

  const burns = flowParties(rows, "burn", 1);
  assert.equal(burns.addresses, 2);
  assert.equal(burns.volume, 20);
  assert.equal(burns.top.length, 1);
  assert.equal(burns.top[0].address, C);
  assert.equal(burns.topSharePct, 75);
});

test("flow parties: nothing minted gives an empty, well-formed answer", () => {
  const out = flowParties([row(at(2024, 1, 1), A, B, COPM(1))], "mint", 10);
  assert.deepEqual(out, { addresses: 0, transfers: 0, volume: 0, topSharePct: null, top: [] });
});

/* Supply peak -------------------------------------------------------------- */

test("supply peak: the highest end-of-day supply and the first day it was reached", () => {
  const series = [
    { day: "2024-01-01", supplyEnd: COPM(10) },
    { day: "2024-01-02", supplyEnd: COPM(50) },
    { day: "2024-01-03", supplyEnd: COPM(50) },
    { day: "2024-01-04", supplyEnd: COPM(20) },
  ];
  assert.deepEqual(supplyPeak(series), { day: "2024-01-02", copm: 50 });
  assert.equal(supplyPeak([]), null);
});

/* Largest transfers -------------------------------------------------------- */

test("largest transfers: biggest first, equal amounts ordered by block then log index", () => {
  const t = at(2024, 3, 10);
  const rows = [
    { ...row(t, A, B, COPM(5)), b: 9, i: 1 },
    { ...row(t, A, B, COPM(5)), b: 9, i: 0 },
    { ...row(t, A, B, COPM(50)), b: 12, i: 0 },
    row(t, ZERO_ADDRESS, A, COPM(7)),
    row(t, B, ZERO_ADDRESS, COPM(6)),
  ];
  const out = largestTransfers(rows, { n: 4 });
  assert.deepEqual(out.map((r) => r.amount), [50, 7, 6, 5]);
  assert.deepEqual(out.map((r) => r.kind), ["transfer", "mint", "burn", "transfer"]);
  assert.equal(out[0].day, "2024-03-10");
  assert.equal(out[0].tx, rows[2].t);
  assert.equal(out[3].tx, rows[1].t, "of the two equal amounts the earlier log index comes first");
});

test("largest transfers: the 90-day cut includes day 89 and drops day 90 and the partial day", () => {
  const end = "2026-10-10";
  const dayTs = (iso) => Date.parse(`${iso}T12:00:00Z`) / 1000;
  const rows = [
    row(dayTs("2026-07-13"), A, B, COPM(1)), // end - 89 days: inside
    row(dayTs("2026-07-12"), A, B, COPM(1000)), // end - 90 days: outside
    row(dayTs("2026-10-11"), A, B, COPM(2000)), // partial day: outside
    row(dayTs("2026-10-10"), A, B, COPM(2)), // end day: inside
  ];
  const out = largestTransfers(rows, { n: 10, fromDay: "2026-07-13", toDay: end });
  assert.deepEqual(out.map((r) => r.amount), [2, 1]);
});

/* Whole dashboard ---------------------------------------------------------- */

const state = { chain: "celo", lastBlock: 500, lastBlockTime: at(2024, 1, 5, 10), totalSupply: COPM(90).toString() };
const holders = {
  holders: 2,
  addressesEverSeen: 3,
  contracts: 0,
  frozen: [],
  concentration: { top1Pct: 70, top5Pct: 100, top10Pct: 100, top50Pct: 100 },
  buckets: [
    { label: "1 – 1k", min: "1", holders: 2, copm: "90" },
    { label: "< 1", min: "0", holders: 1, copm: "0.5" },
  ],
  roles: { DEFAULT_ADMIN_ROLE: [A], MINTER_ROLE: [A] },
  paused: false,
  implementation: C,
  top: [{ rank: 1, address: A, balance: "63", sharePct: "70", kind: "wallet", frozen: false }],
};
const adminEvents = [
  { b: 1, ts: at(2024, 1, 1), t: "0xup", i: 0, name: "Upgraded", args: { implementation: C } },
  { b: 1, ts: at(2024, 1, 1), t: "0xup", i: 1, name: "RoleGranted", args: { role: "MINTER_ROLE", account: A }, topics: ["x"], data: "0x" },
];
const approvals = { block: 500, daily: { "2024-01-02": 4 }, spenders: {} };

function input() {
  seq = 0;
  const transfers = [
    row(at(2024, 1, 1), ZERO_ADDRESS, A, COPM(100)),
    row(at(2024, 1, 2), A, B, COPM(30)),
    row(at(2024, 1, 2, 18), B, ZERO_ADDRESS, COPM(10)),
    row(at(2024, 1, 4), A, B, COPM(5)),
  ];
  return { chainKey: "celo", state, transfers, adminEvents, approvals, holders };
}

test("dashboard: checkpoint, flows and aligned daily arrays come from the transfers", () => {
  const d = buildDashboard(input());
  assert.equal(d.chain, "celo");
  assert.deepEqual(d.checkpoint, { block: 500, time: state.lastBlockTime, totalSupply: 90, firstDay: "2024-01-01", lastDay: "2024-01-04" });
  assert.deepEqual(d.flows, { minted: 100, burned: 10, wallet: 35, gross: 145, turnover: 1.45 });
  assert.deepEqual(d.daily.day, ["2024-01-01", "2024-01-02", "2024-01-03", "2024-01-04"]);
  assert.deepEqual(d.daily.transfers, [1, 2, 0, 1]);
  assert.deepEqual(d.daily.mint, [100, 0, 0, 0]);
  assert.deepEqual(d.daily.burn, [0, 10, 0, 0]);
  assert.deepEqual(d.daily.wallet, [0, 30, 0, 5]);
  assert.deepEqual(d.daily.volume, [100, 40, 0, 5]);
  assert.deepEqual(d.daily.supply, [100, 90, 90, 90]);
  assert.deepEqual(d.daily.approvals, [0, 4, 0, 0]);
  for (const values of Object.values(d.daily)) assert.equal(values.length, 4);
});

test("dashboard: monthly arrays add up the days, supply is the end-of-month value", () => {
  const d = buildDashboard(input());
  assert.deepEqual(d.monthly.month, ["2024-01"]);
  assert.deepEqual(d.monthly.transfers, [4]);
  assert.deepEqual(d.monthly.volume, [145]);
  assert.deepEqual(d.monthly.supply, [90]);
  assert.deepEqual(d.monthly.active, [2]);
});

test("dashboard: activity compares the 30 days before the checkpoint day with the 30 before those", () => {
  const d = buildDashboard(input());
  assert.equal(d.activity.endDay, "2024-01-04", "the checkpoint is on 2024-01-05 10:00, so the 4th is the last complete day");
  assert.equal(d.activity.days, 30);
  assert.equal(d.activity.transfers.current, 4);
  assert.equal(d.activity.transfers.previous, 0);
  assert.equal(d.activity.transfers.changePct, null);
});

test("dashboard: governance keeps the roles, the state and the admin events with their day", () => {
  const d = buildDashboard(input());
  assert.deepEqual(d.governance.roles, holders.roles);
  assert.equal(d.governance.paused, false);
  assert.equal(d.governance.implementation, C);
  assert.deepEqual(d.governance.frozen, []);
  assert.equal(d.governance.roleHolders, 1);
  assert.deepEqual(d.governance.events.map((e) => [e.name, e.day, e.tx]), [
    ["Upgraded", "2024-01-01", "0xup"],
    ["RoleGranted", "2024-01-01", "0xup"],
  ]);
  assert.deepEqual(Object.keys(d.governance.events[0]).sort(), ["args", "block", "day", "name", "tx"]);
});

test("dashboard: holders section keeps concentration, buckets and the holders below one COPM", () => {
  const d = buildDashboard(input());
  assert.equal(d.holders.count, 2);
  assert.equal(d.holders.top1Pct, 70);
  assert.equal(d.holders.below1, 1);
  assert.equal(d.holders.top[0].share, 70);
  assert.equal(d.holders.buckets.length, 2);
});

test("dashboard: issuance, peak and counterparties are present and consistent", () => {
  const d = buildDashboard(input());
  assert.equal(d.issuance.mint.addresses, 1);
  assert.equal(d.issuance.burn.addresses, 1);
  assert.deepEqual(d.supplyPeak, { day: "2024-01-01", copm: 100 });
  assert.deepEqual(d.counterparties.senders.map((s) => [s.address, s.volume]), [[A, 35]]);
  assert.deepEqual(d.counterparties.receivers.map((s) => [s.address, s.volume]), [[B, 35]]);
  assert.equal(d.sizes.reduce((s, b) => s + b.count, 0), 2);
  assert.equal(d.largest.all.length, 4);
});

test("dashboard: deterministic. The same inputs give byte-identical output, whatever the input order", () => {
  const one = JSON.stringify(buildDashboard(input()));
  const two = JSON.stringify(buildDashboard(input()));
  assert.equal(one, two);
  const reversed = input();
  reversed.transfers.reverse();
  assert.equal(JSON.stringify(buildDashboard(reversed)), one);
  assert.doesNotMatch(one, /updatedAt|generatedAt/);
});
