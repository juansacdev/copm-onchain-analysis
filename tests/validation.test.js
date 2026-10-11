import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkEventCount,
  checkNoDuplicates,
  checkBlockRange,
  checkScanCompleted,
  checkTimestampCoverage,
  checkTimestampWindow,
  checkSeriesLength,
  checkSeriesContinuity,
  checkCsvTransferTotal,
  checkSupplyInvariant,
  checkLiveSupply,
  offlineChecks,
} from "../pipeline/domain/validation.js";

const tx = (b, i, t = `0x${b}-${i}`) => ({ b, i, t });

test("event count must equal the scan's own total", () => {
  assert.equal(checkEventCount([tx(1, 0), tx(1, 1)], { totalEvents: 2 }).ok, true);

  const bad = checkEventCount([tx(1, 0)], { totalEvents: 2 });
  assert.equal(bad.ok, false);
  assert.equal(bad.detail, "jsonl=1 scan=2");
});

test("duplicate (tx, logIndex) pairs are counted", () => {
  assert.equal(checkNoDuplicates([tx(1, 0, "0xa"), tx(1, 1, "0xa")]).ok, true);

  const bad = checkNoDuplicates([tx(1, 0, "0xa"), tx(2, 0, "0xa")]);
  assert.equal(bad.ok, false);
  assert.equal(bad.detail, "duplicates=1");
});

test("events outside the scanned block range fail", () => {
  const manifest = { deployBlock: "10", latestBlockAtRun: "20" };
  assert.equal(checkBlockRange([tx(10, 0), tx(20, 0)], manifest).ok, true);

  const bad = checkBlockRange([tx(9, 0), tx(21, 0), tx(15, 0)], manifest);
  assert.equal(bad.ok, false);
  assert.equal(bad.detail, "outOfRange=2 (range 10 → 20)");
});

test("scan is complete only when every slice cursor passed its end", () => {
  const done = { slices: [{ cursor: "11", end: "10" }], completedAt: "2024-01-01T00:00:00.000Z" };
  const result = checkScanCompleted(done);
  assert.equal(result.ok, true);
  assert.equal(result.detail, "completedAt=2024-01-01T00:00:00.000Z");

  const partial = checkScanCompleted({ slices: [{ cursor: "10", end: "10" }] });
  assert.equal(partial.ok, false);
  assert.equal(partial.detail, "no completedAt marker");
});

test("every event block needs a timestamp", () => {
  assert.equal(checkTimestampCoverage([tx(1, 0), tx(2, 0)], { 1: 100, 2: 200 }).ok, true);

  const bad = checkTimestampCoverage([tx(1, 0), tx(2, 0), tx(2, 1)], { 1: 100 });
  assert.equal(bad.ok, false);
  assert.equal(bad.detail, "uniqueBlocks=2 missing=1");
});

test("timestamps must sit inside the deploy to latest window, with slack", () => {
  const manifest = {
    deployTimestamp: "2024-01-01T00:00:00.000Z",
    latestBlockTimestamp: "2024-01-02T00:00:00.000Z",
  };
  const deploy = Date.parse(manifest.deployTimestamp) / 1000;
  const latest = Date.parse(manifest.latestBlockTimestamp) / 1000;

  assert.equal(
    checkTimestampWindow({ 1: deploy - 120, 2: latest + 120 }, manifest).ok,
    true
  );

  const bad = checkTimestampWindow({ 1: deploy - 121, 2: deploy + 5 }, manifest);
  assert.equal(bad.ok, false);
  assert.equal(bad.detail, "outside=1 of 2");
});

test("daily series length must match the summary range", () => {
  const rows = ["2024-01-01,a", "2024-01-02,b"];
  assert.equal(checkSeriesLength(rows, { range: { totalDays: 2 } }).ok, true);
  assert.equal(checkSeriesLength(rows, { range: { totalDays: 3 } }).ok, false);
});

test("a missing day breaks continuity", () => {
  assert.equal(checkSeriesContinuity(["2024-02-28,x", "2024-02-29,x", "2024-03-01,x"]).ok, true);

  const bad = checkSeriesContinuity(["2024-01-01,x", "2024-01-03,x"]);
  assert.equal(bad.ok, false);
  assert.equal(bad.detail, "gaps=1");
});

test("csv transfer column must add up to the summary total", () => {
  const rows = ["2024-01-01,0,5", "2024-01-02,0,7"];
  assert.equal(checkCsvTransferTotal(rows, { totals: { transferEvents: 12 } }).ok, true);

  const bad = checkCsvTransferTotal(rows, { totals: { transferEvents: 13 } });
  assert.equal(bad.ok, false);
  assert.equal(bad.detail, "csv=12 summary=13");
});

test("mints minus burns must equal the derived supply within rounding", () => {
  const ok = { totals: { totalMintedCOPM: 100, totalBurnedCOPM: 40, currentSupplyCOPM: 60.5 } };
  assert.equal(checkSupplyInvariant(ok).ok, true);

  const bad = { totals: { totalMintedCOPM: 100, totalBurnedCOPM: 40, currentSupplyCOPM: 70 } };
  assert.equal(checkSupplyInvariant(bad).ok, false);
});

test("derived supply may deviate from live totalSupply by less than 25%", () => {
  const summary = { totals: { currentSupplyCOPM: 100 } };
  const near = checkLiveSupply(summary, 110);
  assert.equal(near.ok, true);
  assert.equal(near.detail, "derived=100 onChain=110 deviation=9.1%");

  assert.equal(checkLiveSupply(summary, 140).ok, false);
});

test("offlineChecks runs the file-based rules in the original report order", () => {
  const manifest = {
    deployBlock: "1",
    latestBlockAtRun: "10",
    deployTimestamp: "2024-01-01T00:00:00.000Z",
    latestBlockTimestamp: "2024-01-02T00:00:00.000Z",
  };
  const ts = Date.parse(manifest.deployTimestamp) / 1000 + 60;
  const checks = offlineChecks({
    transfers: [tx(2, 0)],
    manifest,
    progress: { totalEvents: 1, slices: [{ cursor: "11", end: "10" }] },
    tsCache: { 2: ts },
    csvRows: ["2024-01-01,0,1"],
    summary: {
      range: { totalDays: 1 },
      totals: { transferEvents: 1, totalMintedCOPM: 1, totalBurnedCOPM: 0, currentSupplyCOPM: 1 },
    },
  });

  assert.deepEqual(
    checks.map((c) => c.name),
    [
      "event count matches scan progress",
      "no duplicate (tx, logIndex) pairs",
      "all events inside scanned block range",
      "scan completed (all slices reached their end)",
      "every event block has a timestamp",
      "timestamps inside deploy → latest window",
      "daily series length matches summary range",
      "daily series is continuous (no missing days)",
      "csv transfer total equals summary total",
      "mints − burns equals derived supply",
    ]
  );
  assert.ok(checks.every((c) => c.ok));
});
