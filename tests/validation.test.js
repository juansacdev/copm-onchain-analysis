import { test } from "node:test";
import assert from "node:assert/strict";
import { strictChecks } from "../pipeline/domain/validation.js";
import { A, fixture } from "./helpers/validation-fixture.js";

const results = (fx) => Object.fromEntries(strictChecks(fx).map((c) => [c.id, c]));
const failing = (fx) => strictChecks(fx).filter((c) => !c.ok).map((c) => c.id);

test("a consistent dataset passes every rule, in report order", () => {
  const checks = strictChecks(fixture());
  assert.deepEqual(checks.map((c) => c.id), [
    "event-count",
    "supply-exact",
    "ledger-matches-state",
    "no-negative-balance",
    "holders-sum-exact",
    "partitions-ordered-unique",
    "partition-month-matches-ts",
    "no-row-above-checkpoint",
    "no-row-before-deploy",
    "timestamps-exact",
    "timestamps-in-window",
    "admin-events-ordered",
    "admin-events-count",
    "approvals-consistent",
    "daily-matches-ledger",
    "series-length",
    "series-continuous",
    "csv-transfer-total",
    "dashboard-matches-ledger",
  ]);
  assert.deepEqual(failing(fixture()), []);
});

test("event-count: the partitions must hold exactly the checkpoint's transfers", () => {
  const fx = fixture();
  fx.state.transfers += 1;
  assert.deepEqual(failing(fx).includes("event-count"), true);
  assert.equal(results(fx)["event-count"].detail, "partitions=3 checkpoint=4");
});

test("supply-exact: minted - burned must equal totalSupply to the wei, with no tolerance", () => {
  const fx = fixture();
  fx.state.totalSupply = (BigInt(fx.state.totalSupply) + 1n).toString();
  assert.ok(failing(fx).includes("supply-exact"));
  assert.match(results(fx)["supply-exact"].detail, /diff -1/);
});

test("ledger-matches-state: folding the partitions must reproduce minted, burned and the count", () => {
  const fx = fixture();
  fx.state.burned = (BigInt(fx.state.burned) + 1n).toString();
  fx.state.totalSupply = (BigInt(fx.state.minted) - BigInt(fx.state.burned)).toString(); // keep supply-exact green
  const r = results(fx);
  assert.equal(r["supply-exact"].ok, true);
  assert.equal(r["ledger-matches-state"].ok, false);
});

test("no-negative-balance: an address that spent more than it received fails", () => {
  const fx = fixture();
  fx.partitions[0].rows.shift(); // drop the mint that funded A
  fx.transfers = fx.partitions.flatMap((p) => p.rows);
  const bad = results(fx)["no-negative-balance"];
  assert.equal(bad.ok, false);
  assert.ok(bad.detail.includes(A));
});

test("holders-sum-exact: holders.csv must add up to totalSupply and be taken at the checkpoint", () => {
  const ok = results(fixture())["holders-sum-exact"];
  assert.equal(ok.ok, true);

  const off = fixture();
  off.holders.csv = off.holders.csv.replace(/,70,/, ",69.999999999999999999,");
  assert.equal(results(off)["holders-sum-exact"].ok, false);

  const stale = fixture();
  stale.holders.json.block -= 1;
  assert.equal(results(stale)["holders-sum-exact"].ok, false);
  assert.match(results(stale)["holders-sum-exact"].detail, /block/);

  const missing = fixture();
  missing.holders = { csv: null, json: null };
  assert.equal(results(missing)["holders-sum-exact"].ok, false);
  assert.match(results(missing)["holders-sum-exact"].detail, /run "holders/);
});

test("partitions-ordered-unique: rows must strictly increase by (block, log index) across partitions", () => {
  const dup = fixture();
  dup.partitions[1].rows.push({ ...dup.partitions[1].rows[0] });
  dup.transfers = dup.partitions.flatMap((p) => p.rows);
  assert.ok(failing(dup).includes("partitions-ordered-unique"));

  const swapped = fixture();
  swapped.partitions[0].rows.reverse();
  swapped.transfers = swapped.partitions.flatMap((p) => p.rows);
  assert.ok(failing(swapped).includes("partitions-ordered-unique"));

  const acrossMonths = fixture();
  acrossMonths.partitions.reverse();
  acrossMonths.transfers = acrossMonths.partitions.flatMap((p) => p.rows);
  assert.ok(failing(acrossMonths).includes("partitions-ordered-unique"));
});

test("partition-month-matches-ts: a row must sit in the partition of its UTC month", () => {
  const fx = fixture();
  fx.partitions[0].rows[1].ts = Date.UTC(2024, 1, 1, 0, 0, 1) / 1000; // February, in the January file
  fx.transfers = fx.partitions.flatMap((p) => p.rows);
  const bad = results(fx)["partition-month-matches-ts"];
  assert.equal(bad.ok, false);
  assert.match(bad.detail, /2024-01/);

  const edge = fixture(); // 23:59:59 on Jan 31 is still January
  edge.partitions[0].rows[1].ts = Date.UTC(2024, 0, 31, 23, 59, 59) / 1000;
  assert.equal(results(edge)["partition-month-matches-ts"].ok, true);
});

test("no-row-above-checkpoint and no-row-before-deploy bound the block range exactly", () => {
  const above = fixture();
  above.state.lastBlock = above.partitions[1].rows[0].b - 1;
  assert.ok(failing(above).includes("no-row-above-checkpoint"));

  const edge = fixture();
  edge.state.lastBlock = edge.partitions[1].rows[0].b;
  assert.equal(results(edge)["no-row-above-checkpoint"].ok, true);

  const below = fixture();
  below.deployBlock = below.partitions[0].rows[0].b + 1;
  assert.ok(failing(below).includes("no-row-before-deploy"));
});

test("timestamps-exact: every row needs a timestamp and time never goes back along the block order", () => {
  const missing = fixture();
  delete missing.partitions[0].rows[0].ts;
  missing.transfers = missing.partitions.flatMap((p) => p.rows);
  assert.equal(results(missing)["timestamps-exact"].detail, "events=3 missing=1 outOfOrder=0");

  const back = fixture();
  back.partitions[1].rows[0].ts = back.partitions[0].rows[0].ts - 1;
  back.transfers = back.partitions.flatMap((p) => p.rows);
  assert.equal(results(back)["timestamps-exact"].ok, false);
});

test("timestamps-in-window: rows must sit between the deployment and the checkpoint, with two minutes of slack", () => {
  const fx = fixture();
  const deploy = Date.parse(fx.manifest.deployTimestamp) / 1000;
  fx.partitions[0].rows[0].ts = deploy - 120;
  fx.transfers = fx.partitions.flatMap((p) => p.rows);
  assert.equal(results(fx)["timestamps-in-window"].ok, true);

  fx.partitions[0].rows[0].ts = deploy - 121;
  fx.transfers = fx.partitions.flatMap((p) => p.rows);
  assert.equal(results(fx)["timestamps-in-window"].ok, false);
});

test("timestamps-in-window: a row later than the checkpoint time plus slack fails", () => {
  const fx = fixture();
  const last = fx.partitions[1].rows[0];
  last.ts = fx.state.lastBlockTime + 120;
  fx.transfers = fx.partitions.flatMap((p) => p.rows);
  assert.equal(results(fx)["timestamps-in-window"].ok, true);

  last.ts = fx.state.lastBlockTime + 121;
  fx.transfers = fx.partitions.flatMap((p) => p.rows);
  assert.equal(results(fx)["timestamps-in-window"].ok, false);
});

test("timestamps-in-window: a missing bound fails the rule instead of passing vacuously", () => {
  const noDeploy = fixture();
  delete noDeploy.manifest.deployTimestamp;
  const deployCheck = results(noDeploy)["timestamps-in-window"];
  assert.equal(deployCheck.ok, false);
  assert.match(deployCheck.detail, /deployTimestamp/);

  const noCheckpointTime = fixture();
  delete noCheckpointTime.state.lastBlockTime;
  const timeCheck = results(noCheckpointTime)["timestamps-in-window"];
  assert.equal(timeCheck.ok, false);
  assert.match(timeCheck.detail, /lastBlockTime/);
});

test("admin events must be strictly ordered, inside the checkpoint, and as many as the checkpoint says", () => {
  const unordered = fixture();
  unordered.adminEvents = [
    { b: 9, i: 1, name: "Frozen" },
    { b: 9, i: 0, name: "Upgraded" },
  ];
  unordered.state.adminEvents = 2;
  assert.ok(failing(unordered).includes("admin-events-ordered"));

  const above = fixture();
  above.adminEvents[0].b = above.state.lastBlock + 1;
  assert.ok(failing(above).includes("admin-events-ordered"));

  const lost = fixture();
  lost.state.adminEvents = 2;
  assert.deepEqual(failing(lost), ["admin-events-count"]);
});

test("daily-matches-ledger: daily.csv must be exactly what the transfers and approvals produce", () => {
  const stale = fixture();
  stale.csvText = stale.csvText.split("\n").map((l, i) => (i === 1 ? l.replace(/,\d+$/, ",9") : l)).join("\n");
  assert.ok(failing(stale).includes("daily-matches-ledger"));
  assert.match(results(stale)["daily-matches-ledger"].detail, /line 2/);

  const short = fixture();
  short.csvText = short.csvText.split("\n").slice(0, -1).join("\n");
  assert.ok(failing(short).includes("daily-matches-ledger"));
});

test("series rules compare daily.csv with summary.json: length, continuity and the transfer total", () => {
  const length = fixture();
  length.summary.range.totalDays += 1;
  assert.deepEqual(failing(length), ["series-length"]);

  const gap = fixture();
  const lines = gap.csvText.split("\n");
  lines.splice(2, 0, "2024-02-03,0");
  gap.csvText = lines.join("\n");
  assert.ok(failing(gap).includes("series-continuous"));

  const total = fixture();
  total.summary.totals.transferEvents += 1;
  assert.ok(failing(total).includes("csv-transfer-total"));
});

test("no rule has a tolerance: one wei of supply difference fails even when the rest is consistent", () => {
  const fx = fixture();
  fx.state.minted = (BigInt(fx.state.minted) + 1n).toString();
  const bad = failing(fx);
  assert.ok(bad.includes("supply-exact"));
  assert.ok(bad.includes("ledger-matches-state"));
});

test("dashboard-matches-ledger: dashboard.json at the checkpoint with the ledger's totals passes", () => {
  const r = results(fixture())["dashboard-matches-ledger"];
  assert.equal(r.ok, true);
  assert.match(r.detail, /block=\d+/);
});

test("dashboard-matches-ledger: a dashboard from another block fails", () => {
  const fx = fixture();
  fx.dashboard.checkpoint.block -= 1;
  assert.ok(failing(fx).includes("dashboard-matches-ledger"));
});

test("dashboard-matches-ledger: minted, burned and supply must equal the ledger's", () => {
  for (const edit of [
    (d) => (d.flows.minted += 1),
    (d) => (d.flows.burned += 1),
    (d) => (d.checkpoint.totalSupply += 1),
    (d) => (d.daily.supply[d.daily.supply.length - 1] += 1),
    (d) => (d.daily.transfers[0] += 1),
  ]) {
    const fx = fixture();
    edit(fx.dashboard);
    assert.deepEqual(failing(fx), ["dashboard-matches-ledger"]);
  }
});

test("dashboard-matches-ledger: a missing dashboard.json fails and says how to make it", () => {
  const fx = fixture();
  fx.dashboard = null;
  const r = results(fx)["dashboard-matches-ledger"];
  assert.equal(r.ok, false);
  assert.match(r.detail, /dashboard --chain celo/);
});

test("dashboard-matches-ledger: every other field of dashboard.json is checked too", () => {
  for (const [name, edit] of Object.entries({
    gross: (d) => (d.flows.gross += 1),
    turnover: (d) => (d.flows.turnover += 1),
    supplyPeak: (d) => (d.supplyPeak.copm += 1),
    activityTransfers: (d) => (d.activity.transfers.current += 1),
    activityVolume: (d) => (d.activity.volume.previous += 1),
    sizes: (d) => (d.sizes[0].count += 1),
    largest: (d) => (d.largest.all[0].amount += 1),
    issuance: (d) => (d.issuance.mint.topSharePct = 1),
    holders: (d) => (d.holders.count += 1),
    monthly: (d) => (d.monthly.volume[0] += 1),
    governance: (d) => (d.governance.paused = !d.governance.paused),
    extraField: (d) => (d.invented = true),
  })) {
    const fx = fixture();
    edit(fx.dashboard);
    const r = results(fx)["dashboard-matches-ledger"];
    assert.equal(r.ok, false, name);
    assert.deepEqual(failing(fx), ["dashboard-matches-ledger"], name);
  }
});

test("dashboard-matches-ledger: the detail names the sections that differ", () => {
  const fx = fixture();
  fx.dashboard.sizes[0].count += 1;
  assert.match(results(fx)["dashboard-matches-ledger"].detail, /differs: sizes/);
});

test("dashboard-matches-ledger: without the holders snapshot it cannot rebuild and fails", () => {
  const fx = fixture();
  fx.holders = { csv: null, json: null };
  assert.equal(results(fx)["dashboard-matches-ledger"].ok, false);
});

test("approvals-consistent: the checkpoint's count, the daily counts and the spender counts must agree", () => {
  const fx = fixture();
  assert.equal(results(fx)["approvals-consistent"].ok, true);
  assert.equal(
    results(fx)["approvals-consistent"].detail,
    `block=${fx.approvals.block} checkpoint=${fx.state.lastBlock} state=2 daily=2 spenders=2`
  );
});

test("approvals-consistent: fails when state.approvals differs from the daily counts", () => {
  const fx = fixture();
  fx.state.approvals += 1;
  assert.ok(failing(fx).includes("approvals-consistent"));
});

test("approvals-consistent: fails when the spender counts differ from the daily counts", () => {
  const fx = fixture();
  fx.approvals.spenders[A] += 1;
  assert.ok(failing(fx).includes("approvals-consistent"));
  assert.match(results(fx)["approvals-consistent"].detail, /daily=2 spenders=3/);
});

test("approvals-consistent: fails when approvals.json is ahead of the checkpoint", () => {
  const fx = fixture();
  fx.approvals.block = fx.state.lastBlock + 1;
  assert.ok(failing(fx).includes("approvals-consistent"));
});
