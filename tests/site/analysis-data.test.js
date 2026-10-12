import { test } from "node:test";
import assert from "node:assert/strict";
import { loadAnalysisData } from "../../site/src/lib/analysis-data.js";
import { COP_PER_USD, writeSiteFixture } from "../helpers/site-fixture.js";

const load = (overrides) =>
  loadAnalysisData({ dataDir: writeSiteFixture(overrides), copPerUsd: COP_PER_USD });

test("loader passes through checkpoint, counts, holders and contract facts per chain", () => {
  const { chains } = load();
  const p = chains.polygon;
  assert.equal(p.label, "Polygon");
  assert.equal(p.address, "0x12050c705152931cFEe3DD56c52Fb09Dea816C23");
  assert.equal(p.deployDate, "2025-01-01");
  assert.equal(p.transfers, 1000);
  assert.equal(p.approvals, 400);
  assert.equal(p.adminEvents, 11);
  assert.equal(p.events, 1411);
  assert.equal(p.checkpointBlock, 5000);
  assert.equal(p.checkpointDate, "2025-06-15");
  assert.equal(p.supplyWei, 1_000_000n * 10n ** 18n);
  assert.equal(p.holders, 582);
  assert.equal(p.frozen, 0);
  assert.equal(chains.celo.frozen, 1);
  assert.deepEqual([p.firstDay, p.lastDay, p.totalDays], ["2025-01-01", "2025-06-15", 166]);
});

test("loader combines both chains", () => {
  const { combined, chains, copPerUsd } = load();
  assert.equal(copPerUsd, 4000);
  assert.equal(combined.chainCount, 2);
  assert.equal(combined.transfers, 1300);
  assert.equal(combined.approvals, 500);
  assert.equal(combined.adminEvents, 23);
  assert.equal(combined.events, 1823);
  assert.equal(combined.holders, 1580);
  assert.equal(combined.grossUsd, chains.polygon.grossUsd + chains.celo.grossUsd);
  assert.equal(combined.asOf, "2025-06-16");
});

test("loader counts validation rules and reads the exact-supply result", () => {
  const { chains, combined } = load();
  assert.deepEqual(
    [chains.polygon.checksPassed, chains.polygon.checksTotal, chains.polygon.validatedDate],
    [17, 17, "2025-06-16"],
  );
  assert.equal(combined.checksPassed, 34);
  assert.equal(combined.checksTotal, 34);
});

test("loader fails loudly when a data file is missing", () => {
  const dir = writeSiteFixture();
  assert.throws(
    () => loadAnalysisData({ dataDir: `${dir}/nowhere`, copPerUsd: COP_PER_USD }),
    /polygon[\s\S]*summary\.json|ENOENT/,
  );
});

test("loader derives volume in USD from the daily series at the given rate", () => {
  const { chains, combined } = load();
  assert.equal(chains.polygon.grossUsd, 8120);
  assert.equal(chains.celo.grossUsd, 48);
  assert.equal(chains.polygon.avgTicketUsd, 8.12);
  assert.equal(combined.grossUsd, 8168);
  const halved = loadAnalysisData({ dataDir: writeSiteFixture(), copPerUsd: 2 * COP_PER_USD });
  assert.equal(halved.chains.polygon.grossUsd, 4060);
});

test("loader finds the peak month, the record days and the rankings", () => {
  const p = load().chains.polygon;
  assert.deepEqual(p.peakMonth, { key: "2025-03", usd: 3500, transfers: 800 });
  assert.deepEqual(p.peakTxMonth, { key: "2025-03", count: 800 });
  assert.deepEqual(p.recordVolume, { day: "2025-03-15", usd: 500, transfers: 200 });
  assert.deepEqual(p.recordTx, { day: "2025-03-15", count: 200 });
  assert.equal(p.topVolumeDays.length, 10);
  assert.deepEqual(p.topVolumeDays.slice(0, 3).map((d) => [d.day, d.usd]), [
    ["2025-03-15", 500],
    ["2025-05-20", 300],
    ["2025-03-01", 100],
  ]);
  assert.deepEqual(p.topTxDays.slice(0, 3), [
    { day: "2025-03-15", count: 200 },
    { day: "2025-02-10", count: 150 },
    { day: "2025-03-01", count: 20 },
  ]);
});

test("loader counts how many of the ten busiest days fall in the peak window", () => {
  const p = load().chains.polygon;
  assert.deepEqual(p.topTxWindow, { from: "2025-02", to: "2025-03", count: 10 });
});

test("loader measures the takeoff as days from deploy to the first day above 100 transfers", () => {
  const { chains } = load();
  assert.deepEqual(chains.polygon.takeoff, { day: "2025-02-10", daysFromDeploy: 40 });
  assert.deepEqual(chains.celo.takeoff, { day: "2025-02-03", daysFromDeploy: 2 });
});

test("loader measures turnover as last-30-day volume over the average supply of the same days", () => {
  assert.equal(load().chains.polygon.turnoverMonthly, 6.36);
});

test("loader summarizes the months after the peak, leaving out the partial last month", () => {
  const p = load().chains.polygon;
  assert.deepEqual(p.afterPeak, {
    settledFrom: "2025-04",
    settledTo: "2025-04",
    settledMinUsd: 1200,
    settledMaxUsd: 1200,
    reboundMonth: "2025-05",
    reboundUsd: 2100,
    latestMonth: "2025-05",
    latestUsd: 2100,
  });
  assert.equal(p.months.at(-1).key, "2025-06");
  assert.equal(p.months.find((m) => m.key === "2025-04").usd, 1200);
});

test("loader gives the months between deploy and the busiest month", () => {
  const { chains } = load();
  assert.equal(chains.polygon.peakTxMonthsAfterDeploy, 2);
  assert.equal(chains.celo.peakTxMonth.key, "2025-02");
  assert.equal(chains.celo.peakTxMonthsAfterDeploy, 0);
});

test("loader reports whether the supply reconciled to the wei", () => {
  assert.equal(load().chains.polygon.supplyExact, true);
  const broken = load({
    celo: { validation: { validatedAt: "2025-06-16T00:00:00.000Z", passed: 0, failed: 1, checks: [{ id: "supply-exact", ok: false, detail: "diff 1" }] } },
  });
  assert.equal(broken.chains.celo.supplyExact, false);
  assert.equal(broken.chains.celo.checksPassed, 0);
});
