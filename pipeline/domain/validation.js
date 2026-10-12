// Strict, offline rules over everything `scan`, `holders` and `aggregate`
// wrote for one chain. Each rule returns { id, ok, detail }; ids and details
// are what validation.json records, so keep them stable. There is no
// tolerance anywhere: amounts are compared to the wei.
import { buildDailySeries, dailyCsv } from "./aggregate.js";
import { parseHoldersCsv, formatUnits } from "./holders.js";
import { createLedger, foldTransfers, negativeBalances } from "./ledger.js";
import { monthKey } from "./partition.js";
import { reconcileSupply } from "./reconcile.js";
import { toCOPM } from "./units.js";

const check = (id, ok, detail) => ({ id, ok, detail });

const bySeq = (a, b) => a.b - b.b || a.i - b.i;

// Counts rows that do not come strictly after the previous one.
function sequenceBreaks(rows) {
  let breaks = 0;
  for (let k = 1; k < rows.length; k++) if (bySeq(rows[k - 1], rows[k]) >= 0) breaks++;
  return breaks;
}

export function checkEventCount(transfers, state) {
  return check(
    "event-count",
    transfers.length === state.transfers,
    `partitions=${transfers.length} checkpoint=${state.transfers}`
  );
}

// The scan only advances its checkpoint after this holds; re-checking it here
// catches a hand-edited or truncated state.json.
export function checkSupplyExact(state) {
  const { ok, derived, totalSupply, diff } = reconcileSupply({
    minted: BigInt(state.minted),
    burned: BigInt(state.burned),
    totalSupply: BigInt(state.totalSupply),
  });
  return check("supply-exact", ok, `minted-burned=${derived} totalSupply=${totalSupply} diff ${diff}`);
}

export function checkLedgerMatchesState(ledger, transferCount, state) {
  const same =
    ledger.minted.toString() === state.minted &&
    ledger.burned.toString() === state.burned &&
    transferCount === state.transfers;
  return check(
    "ledger-matches-state",
    same,
    `partitions minted=${ledger.minted} burned=${ledger.burned} transfers=${transferCount}; ` +
      `checkpoint minted=${state.minted} burned=${state.burned} transfers=${state.transfers}`
  );
}

export function checkNoNegativeBalance(ledger) {
  const negative = negativeBalances(ledger);
  return check(
    "no-negative-balance",
    negative.length === 0,
    negative.length === 0 ? "negative=0" : `negative=${negative.length} first=${negative[0]}`
  );
}

// holders.csv must add up to totalSupply and belong to the checkpoint block.
export function checkHoldersSumExact(holders, state) {
  if (!holders?.csv || !holders?.json) {
    return check("holders-sum-exact", false, `holders.csv / holders.json missing: run "holders --chain ${state.chain}"`);
  }
  let sum;
  try {
    sum = parseHoldersCsv(holders.csv).reduce((total, h) => total + h.balance, 0n);
  } catch (err) {
    return check("holders-sum-exact", false, err.message);
  }
  const totalSupply = BigInt(state.totalSupply);
  const ok =
    sum === totalSupply &&
    holders.json.block === state.lastBlock &&
    holders.json.totalSupply === formatUnits(totalSupply);
  return check(
    "holders-sum-exact",
    ok,
    `sum=${sum} totalSupply=${totalSupply} holders.json block=${holders.json.block} checkpoint=${state.lastBlock}`
  );
}

export function checkPartitionsOrderedUnique(partitions) {
  const breaks = sequenceBreaks(partitions.flatMap((p) => p.rows));
  return check("partitions-ordered-unique", breaks === 0, `outOfOrderOrDuplicate=${breaks}`);
}

// A row without a timestamp is timestamps-exact's finding, not this rule's.
export function checkPartitionMonth(partitions) {
  let misplaced = 0;
  let first = "";
  for (const { key, rows } of partitions) {
    for (const row of rows) {
      if (!row.ts || monthKey(row.ts) === key) continue;
      if (++misplaced === 1) first = `; first: block ${row.b} in ${key} belongs to ${monthKey(row.ts)}`;
    }
  }
  return check("partition-month-matches-ts", misplaced === 0, `misplaced=${misplaced}${first}`);
}

export function checkNoRowAboveCheckpoint(transfers, state) {
  const above = transfers.filter((t) => t.b > state.lastBlock).length;
  return check("no-row-above-checkpoint", above === 0, `above=${above} checkpoint=${state.lastBlock}`);
}

export function checkNoRowBeforeDeploy(transfers, deployBlock) {
  const before = transfers.filter((t) => t.b < deployBlock).length;
  return check("no-row-before-deploy", before === 0, `before=${before} deployBlock=${deployBlock}`);
}

// Rows arrive in block order, and block time never goes back.
export function checkTimestampsExact(transfers) {
  let missing = 0;
  let outOfOrder = 0;
  let previous = 0;
  for (const t of transfers) {
    if (!t.ts) {
      missing++;
      continue;
    }
    if (t.ts < previous) outOfOrder++;
    previous = t.ts;
  }
  return check(
    "timestamps-exact",
    missing === 0 && outOfOrder === 0,
    `events=${transfers.length} missing=${missing} outOfOrder=${outOfOrder}`
  );
}

// The slack covers a block's timestamp being a little ahead of the manifest's.
export function checkTimestampWindow(transfers, manifest, state, slackSeconds = 120) {
  const deployTs = Date.parse(manifest.deployTimestamp) / 1000;
  // A comparison against NaN or undefined is always false: with a bound
  // missing, the rule would pass for any data. It fails instead.
  const missingBounds = [
    ["manifest.deployTimestamp", Number.isFinite(deployTs)],
    ["state.lastBlockTime", Number.isFinite(state.lastBlockTime)],
  ]
    .filter(([, present]) => !present)
    .map(([name]) => name);
  if (missingBounds.length > 0) {
    return check("timestamps-in-window", false, `missing or invalid bound: ${missingBounds.join(", ")}`);
  }
  const outside = transfers.filter(
    (t) => t.ts < deployTs - slackSeconds || t.ts > state.lastBlockTime + slackSeconds
  ).length;
  return check("timestamps-in-window", outside === 0, `outside=${outside} of ${transfers.length}`);
}

export function checkAdminEventsOrdered(adminEvents, state) {
  const breaks = sequenceBreaks(adminEvents);
  const above = adminEvents.filter((e) => e.b > state.lastBlock).length;
  return check(
    "admin-events-ordered",
    breaks === 0 && above === 0,
    `outOfOrderOrDuplicate=${breaks} aboveCheckpoint=${above}`
  );
}

export function checkAdminEventsCount(adminEvents, state) {
  return check(
    "admin-events-count",
    adminEvents.length === state.adminEvents,
    `stored=${adminEvents.length} checkpoint=${state.adminEvents}`
  );
}

// daily.csv is a pure function of the transfers and the approval counts, so
// the file must be byte for byte what they produce now. That also pins its
// supply column to the ledger, and the last row to totalSupply.
export function checkDailyMatchesLedger({ transfers, approvals, csvText, state }) {
  if (transfers.some((t) => !t.ts)) {
    return check("daily-matches-ledger", false, "cannot rebuild the daily series: rows without a timestamp");
  }
  const { series } = buildDailySeries(transfers, approvals.daily);
  const expected = dailyCsv(series).split("\n");
  const actual = csvText.trimEnd().split("\n");

  const line = expected.findIndex((text, k) => text !== actual[k]);
  if (line >= 0 || actual.length !== expected.length) {
    const where = line >= 0 ? `line ${line + 1}` : `length (${actual.length} lines, expected ${expected.length})`;
    return check("daily-matches-ledger", false, `daily.csv differs from the transfers at ${where}`);
  }
  const lastSupply = actual.at(-1)?.split(",")[1];
  const wanted = String(toCOPM(BigInt(state.totalSupply)));
  return check(
    "daily-matches-ledger",
    lastSupply === wanted,
    `rows=${actual.length - 1} lastSupply=${lastSupply} totalSupply=${wanted}`
  );
}

// csvRows are the data lines of daily.csv (header removed).
export function checkSeriesLength(csvRows, summary) {
  return check(
    "series-length",
    csvRows.length === summary.range.totalDays,
    `csv=${csvRows.length} summary=${summary.range.totalDays}`
  );
}

export function checkSeriesContinuous(csvRows) {
  let prev = null;
  let gaps = 0;
  for (const row of csvRows) {
    const day = row.slice(0, 10);
    if (prev) {
      const expected = new Date(new Date(`${prev}T00:00:00Z`).getTime() + 864e5)
        .toISOString()
        .slice(0, 10);
      if (day !== expected) gaps++;
    }
    prev = day;
  }
  return check("series-continuous", gaps === 0, `gaps=${gaps}`);
}

export function checkCsvTransferTotal(csvRows, summary) {
  const csvTransfers = csvRows.reduce((acc, r) => acc + Number(r.split(",")[2]), 0);
  return check(
    "csv-transfer-total",
    csvTransfers === summary.totals.transferEvents,
    `csv=${csvTransfers} summary=${summary.totals.transferEvents}`
  );
}

// dashboard.json is a view of the ledger: it must be at the checkpoint block
// and its totals must be the ledger's, so the page can never show numbers
// that the audit did not verify.
export function checkDashboardMatchesLedger({ dashboard, ledger, state }) {
  if (!dashboard) {
    return check("dashboard-matches-ledger", false, `dashboard.json missing: run "dashboard --chain ${state.chain}"`);
  }
  const supply = toCOPM(BigInt(state.totalSupply));
  const days = dashboard.daily ?? { transfers: [], supply: [] };
  const transfers = days.transfers.reduce((total, n) => total + n, 0);
  const figures = {
    block: dashboard.checkpoint?.block === state.lastBlock,
    minted: dashboard.flows?.minted === toCOPM(ledger.minted),
    burned: dashboard.flows?.burned === toCOPM(ledger.burned),
    supply: dashboard.checkpoint?.totalSupply === supply && days.supply.at(-1) === supply,
    transfers: transfers === state.transfers,
  };
  const wrong = Object.entries(figures).filter(([, ok]) => !ok).map(([name]) => name);
  return check(
    "dashboard-matches-ledger",
    wrong.length === 0,
    `block=${dashboard.checkpoint?.block} checkpoint=${state.lastBlock} minted=${dashboard.flows?.minted} ` +
      `burned=${dashboard.flows?.burned} supply=${dashboard.checkpoint?.totalSupply} transfers=${transfers}` +
      (wrong.length ? `; differs: ${wrong.join(", ")}` : ""),
  );
}

// Every rule, in report order. `partitions` is [{ key, rows }] in month order.
export function strictChecks({
  deployBlock,
  manifest,
  state,
  partitions,
  adminEvents,
  approvals,
  csvText,
  summary,
  holders,
  dashboard,
}) {
  const transfers = partitions.flatMap((p) => p.rows);
  const ledger = foldTransfers(createLedger(), transfers);
  const csvRows = csvText.trim().split("\n").slice(1);
  return [
    checkEventCount(transfers, state),
    checkSupplyExact(state),
    checkLedgerMatchesState(ledger, transfers.length, state),
    checkNoNegativeBalance(ledger),
    checkHoldersSumExact(holders, state),
    checkPartitionsOrderedUnique(partitions),
    checkPartitionMonth(partitions),
    checkNoRowAboveCheckpoint(transfers, state),
    checkNoRowBeforeDeploy(transfers, deployBlock),
    checkTimestampsExact(transfers),
    checkTimestampWindow(transfers, manifest, state),
    checkAdminEventsOrdered(adminEvents, state),
    checkAdminEventsCount(adminEvents, state),
    checkDailyMatchesLedger({ transfers, approvals, csvText, state }),
    checkSeriesLength(csvRows, summary),
    checkSeriesContinuous(csvRows),
    checkCsvTransferTotal(csvRows, summary),
    checkDashboardMatchesLedger({ dashboard, ledger, state }),
  ];
}
