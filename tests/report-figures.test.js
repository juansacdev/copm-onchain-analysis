import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFigures, formatFigure, getFigure } from "../pipeline/domain/report.js";
import { chain, row } from "./helpers/report-fixture.js";

const built = () => buildFigures({ chains: { polygon: chain(), celo: chain() } });
const en = (figures, key) => formatFigure(getFigure(figures, key), "en");
const es = (figures, key) => formatFigure(getFigure(figures, key), "es");

test("headline counts come from the checkpoint and the snapshot", () => {
  const f = built();
  assert.equal(en(f, "polygon.transfers"), "8");
  assert.equal(en(f, "polygon.approvals"), "20");
  assert.equal(en(f, "polygon.holders"), "7");
  assert.equal(en(f, "polygon.frozenAccounts"), "1");
  assert.equal(en(f, "polygon.checkpointBlock"), "5,000");
  assert.equal(es(f, "polygon.checkpointBlock"), "5.000");
  assert.equal(en(f, "polygon.checkpointDate"), "2024-02-03");
  assert.equal(en(f, "polygon.deployDate"), "2024-01-30");
  assert.equal(en(f, "polygon.deployBlock"), "100");
});

test("the audited span is written in years", () => {
  const summary = { ...chain().summary, range: { firstDay: "2023-09-21", lastDay: "2026-10-11", totalDays: 1117 } };
  const f = buildFigures({ chains: { polygon: chain({ summary }), celo: chain() } });
  assert.equal(en(f, "polygon.years"), "3.1");
  assert.equal(es(f, "polygon.years"), "3,1");
});

test("supply is exact from the raw checkpoint amounts", () => {
  const f = built();
  assert.equal(en(f, "polygon.supply"), "600.00");
  assert.equal(en(f, "polygon.minted"), "1,000");
  assert.equal(en(f, "polygon.burnedPct"), "40%");
});

test("volumes and peaks come from the summary", () => {
  const f = built();
  assert.equal(en(f, "polygon.grossVolumeUsd"), "$2K");
  assert.equal(en(f, "polygon.peakTxCount"), "4");
  assert.equal(en(f, "polygon.peakTxDay"), "2024-02-01");
  assert.equal(en(f, "polygon.peakVolumeUsd"), "$1K");
  assert.equal(en(f, "polygon.peakSupplyDay"), "2024-02-02");
});

test("series figures come from daily.csv", () => {
  const f = built();
  assert.throws(() => getFigure(f, "polygon.firstDayAbove100"), /unknown figure/, "no day exceeds 100 transfers");
  assert.equal(en(f, "polygon.activeDays"), "4");
  assert.equal(en(f, "polygon.activeDaysPct"), "80%");
  assert.equal(en(f, "polygon.peakMonth"), "February 2024");
  assert.equal(en(f, "polygon.peakMonthUsd"), "$1.5K");
  assert.equal(en(f, "polygon.month.2024-01.usd"), "$500");
  assert.equal(en(f, "polygon.month.2024-02.transfers"), "6");
  assert.equal(en(f, "polygon.last30GrossUsd"), "$2K");
});

test("yearly turnover annualizes the 30-day figure by 365 / 30", () => {
  const day = (d, grossCOPM) => ({
    day: d,
    supplyEnd: 1_000_000,
    transfers: 1,
    activeAddresses: 1,
    grossCOPM,
    netCOPM: 0,
    mintCOPM: 0,
    burnCOPM: 0,
  });
  // 30 days of 1M COPM on a 1M supply: monthly turnover 30, yearly 365
  const daily = Array.from({ length: 30 }, (_, i) => day(`2024-01-${String(i + 1).padStart(2, "0")}`, 1_000_000));
  const f = buildFigures({ chains: { polygon: chain({ daily }), celo: chain() } });
  assert.equal(getFigure(f, "polygon.turnoverMonthly").value, 30);
  assert.equal(getFigure(f, "polygon.turnoverYearly").value, 365);
});

test("rankings list the top days by transfers and by volume", () => {
  const f = built();
  assert.equal(en(f, "polygon.topTx.1.day"), "2024-02-01");
  assert.equal(en(f, "polygon.topTx.1.transfers"), "4");
  assert.equal(en(f, "polygon.topTx.2.day"), "2024-02-03");
  assert.equal(en(f, "polygon.topVol.1.usd"), "$1K");
  assert.equal(en(f, "polygon.topVol.2.transfers"), "2");
  assert.throws(() => getFigure(f, "polygon.topTx.6.day"), /unknown figure/);
});

test("events are counted per name, zero when never emitted", () => {
  const f = built();
  assert.equal(en(f, "polygon.events.Transfer"), "8");
  assert.equal(en(f, "polygon.events.Approval"), "20");
  assert.equal(en(f, "polygon.events.RoleGranted"), "2");
  assert.equal(en(f, "polygon.events.Upgraded"), "1");
  assert.equal(en(f, "polygon.events.Paused"), "0");
});

test("validation counts the rules that pass", () => {
  const f = built();
  assert.equal(en(f, "polygon.checksPassed"), "17");
  assert.equal(en(f, "polygon.checksTotal"), "17");
});

test("combined figures add both chains", () => {
  const f = built();
  assert.equal(en(f, "combined.transfers"), "16");
  assert.equal(en(f, "combined.grossVolumeUsd"), "$4K");
  assert.equal(en(f, "combined.checksPassed"), "34");
  assert.equal(en(f, "combined.checksTotal"), "34");
});

test("a failing check shows in the passed count", () => {
  const bad = chain({ validation: { passed: 16, failed: 1, validatedAt: "2024-02-03T13:00:00.000Z", checks: new Array(17).fill({}) } });
  const f = buildFigures({ chains: { polygon: bad, celo: chain() } });
  assert.equal(en(f, "polygon.checksPassed"), "16");
  assert.equal(en(f, "combined.checksPassed"), "33");
});

test("an unknown key is an error", () => {
  assert.throws(() => getFigure(built(), "polygon.nope"), /unknown figure "polygon.nope"/);
});

/* The rate ------------------------------------------------------------------- */

test("the rate figures state the latest TRM, its date and the range over the token's life", () => {
  const f = built();
  assert.equal(en(f, "fx.latestRate"), "3,900.5");
  assert.equal(es(f, "fx.latestRate"), "3.900,5");
  assert.equal(en(f, "fx.latestDate"), "2024-02-03");
  assert.equal(en(f, "fx.minRate"), "3,800");
  assert.equal(es(f, "fx.maxRate"), "4.100");
});

test("the rate figures take the latest rate from the chain that ends last, and the range over both chains", () => {
  const fx = (over) => ({ ...chain().summary.fx, ...over });
  const polygon = chain({ summary: { ...chain().summary, fx: fx({ latestDay: "2024-02-03", latestCopPerUsd: 3900, minCopPerUsd: 3700, maxCopPerUsd: 4000 }) } });
  const celo = chain({ summary: { ...chain().summary, fx: fx({ latestDay: "2024-02-02", latestCopPerUsd: 3950, minCopPerUsd: 3800, maxCopPerUsd: 4300 }) } });
  const f = buildFigures({ chains: { polygon, celo } });
  assert.equal(en(f, "fx.latestRate"), "3,900");
  assert.equal(en(f, "fx.minRate"), "3,700");
  assert.equal(en(f, "fx.maxRate"), "4,300");
});

test("there is no fixed-rate figure any more", () => {
  assert.throws(() => getFigure(built(), ["fx.cop", "PerUsd"].join("")), /unknown figure/);
});

test("USD figures are the sums of daily amounts at each day's rate, from the summary and daily.csv", () => {
  // January at 4,000, February at 2,000: the same COPM is worth twice the USD.
  const daily = [
    row("2024-01-30", 1, 4_000_000, 0, 4000),
    row("2024-01-31", 1, 4_000_000, 0, 4000),
    row("2024-02-01", 4, 4_000_000, 0, 2000),
    row("2024-02-02", 0, 0, 0, 2000),
    row("2024-02-03", 2, 2_000_000, 0, 2000),
  ];
  const f = buildFigures({ chains: { polygon: chain({ daily }), celo: chain() } });
  assert.equal(getFigure(f, "polygon.month.2024-01.usd").value, 2000);
  assert.equal(getFigure(f, "polygon.month.2024-02.usd").value, 3000);
  assert.equal(en(f, "polygon.peakMonthShort"), "Feb 2024");
  assert.equal(getFigure(f, "polygon.last30GrossUsd").value, 5000);
  assert.equal(getFigure(f, "polygon.topVol.1.usd").value, 2000, "ranked by USD, each day at its own rate");
  assert.notEqual(getFigure(f, "polygon.last30GrossUsd").value, 14_000_000 / 4000);
});

test("minted, burned and supply in USD come from the daily totals of the summary", () => {
  const f = built();
  assert.equal(getFigure(f, "polygon.mintedUsd").value, 0.25);
  assert.equal(getFigure(f, "polygon.burnedUsd").value, 0.1);
  assert.equal(getFigure(f, "polygon.supplyUsd").value, 0.15);
  assert.equal(getFigure(f, "combined.supplyUsd").value, 0.3);
});
