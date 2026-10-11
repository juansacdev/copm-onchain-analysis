import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkEventCount,
  checkNoDuplicates,
  checkBlockRange,
  checkCheckpointSupply,
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

test("event count must equal the checkpoint's own total", () => {
  assert.equal(checkEventCount([tx(1, 0), tx(1, 1)], { transfers: 2 }).ok, true);

  const bad = checkEventCount([tx(1, 0)], { transfers: 2 });
  assert.equal(bad.ok, false);
  assert.equal(bad.detail, "partitions=1 checkpoint=2");
});

test("duplicate (tx, logIndex) pairs are counted", () => {
  assert.equal(checkNoDuplicates([tx(1, 0, "0xa"), tx(1, 1, "0xa")]).ok, true);

  const bad = checkNoDuplicates([tx(1, 0, "0xa"), tx(2, 0, "0xa")]);
  assert.equal(bad.ok, false);
  assert.equal(bad.detail, "duplicates=1");
});

test("events outside the deploy block to checkpoint range fail", () => {
  const manifest = { deployBlock: "10" };
  const state = { lastBlock: 20 };
  assert.equal(checkBlockRange([tx(10, 0), tx(20, 0)], manifest, state).ok, true);

  const bad = checkBlockRange([tx(9, 0), tx(21, 0), tx(15, 0)], manifest, state);
  assert.equal(bad.ok, false);
  assert.equal(bad.detail, "outOfRange=2 (range 10 → 20)");
});

test("the checkpoint supply must reconcile exactly: minted − burned = totalSupply", () => {
  const ok = checkCheckpointSupply({ minted: "100", burned: "40", totalSupply: "60" });
  assert.equal(ok.ok, true);

  const bad = checkCheckpointSupply({ minted: "100", burned: "40", totalSupply: "61" });
  assert.equal(bad.ok, false);
  assert.equal(bad.detail, "minted−burned=60 totalSupply=61");
});

test("every event needs a timestamp, and timestamps never go back along the block order", () => {
  const withTs = (b, i, ts) => ({ ...tx(b, i), ts });
  assert.equal(checkTimestampCoverage([withTs(1, 0, 100), withTs(2, 0, 100), withTs(3, 0, 200)]).ok, true);

  const missing = checkTimestampCoverage([withTs(1, 0, 100), tx(2, 0)]);
  assert.equal(missing.ok, false);
  assert.equal(missing.detail, "events=2 missing=1 outOfOrder=0");

  const back = checkTimestampCoverage([withTs(1, 0, 200), withTs(2, 0, 100)]);
  assert.equal(back.ok, false);
  assert.equal(back.detail, "events=2 missing=0 outOfOrder=1");
});

test("timestamps must sit inside the deploy to checkpoint window, with slack", () => {
  const manifest = { deployTimestamp: "2024-01-01T00:00:00.000Z" };
  const deploy = Date.parse(manifest.deployTimestamp) / 1000;
  const state = { lastBlockTime: deploy + 86_400 };
  const row = (ts) => ({ ...tx(1, 0), ts });

  assert.equal(
    checkTimestampWindow([row(deploy - 120), row(state.lastBlockTime + 120)], manifest, state).ok,
    true
  );

  const bad = checkTimestampWindow([row(deploy - 121), row(deploy + 5)], manifest, state);
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

test("offlineChecks runs the file-based rules in report order", () => {
  const manifest = { deployBlock: "1", deployTimestamp: "2024-01-01T00:00:00.000Z" };
  const ts = Date.parse(manifest.deployTimestamp) / 1000 + 60;
  const checks = offlineChecks({
    transfers: [{ ...tx(2, 0), ts }],
    manifest,
    state: { transfers: 1, lastBlock: 10, lastBlockTime: ts + 60, minted: "5", burned: "0", totalSupply: "5" },
    csvRows: ["2024-01-01,0,1"],
    summary: {
      range: { totalDays: 1 },
      totals: { transferEvents: 1, totalMintedCOPM: 1, totalBurnedCOPM: 0, currentSupplyCOPM: 1 },
    },
  });

  assert.deepEqual(
    checks.map((c) => c.name),
    [
      "event count matches checkpoint",
      "no duplicate (tx, logIndex) pairs",
      "all events inside scanned block range",
      "checkpoint supply reconciles exactly (minted − burned = totalSupply)",
      "every event has an exact, non-decreasing timestamp",
      "timestamps inside deploy → checkpoint window",
      "daily series length matches summary range",
      "daily series is continuous (no missing days)",
      "csv transfer total equals summary total",
      "mints − burns equals derived supply",
    ]
  );
  assert.ok(checks.every((c) => c.ok));
});
