// Pure rule checks over the pipeline artifacts. Each returns
// { name, ok, detail }; the names and details are what validation.json
// records, so keep them stable.
const check = (name, ok, detail) => ({ name, ok, detail });

export function checkEventCount(transfers, state) {
  return check(
    "event count matches checkpoint",
    transfers.length === state.transfers,
    `partitions=${transfers.length} checkpoint=${state.transfers}`
  );
}

export function checkNoDuplicates(transfers) {
  const seen = new Set();
  let dupes = 0;
  for (const t of transfers) {
    const key = `${t.t}#${t.i}`;
    if (seen.has(key)) dupes++;
    seen.add(key);
  }
  return check("no duplicate (tx, logIndex) pairs", dupes === 0, `duplicates=${dupes}`);
}

export function checkBlockRange(transfers, manifest, state) {
  const deployBlock = Number(manifest.deployBlock);
  const outOfRange = transfers.filter((t) => t.b < deployBlock || t.b > state.lastBlock).length;
  return check(
    "all events inside scanned block range",
    outOfRange === 0,
    `outOfRange=${outOfRange} (range ${deployBlock} → ${state.lastBlock})`
  );
}

// The scan only advances its checkpoint after this holds; re-checking it here
// catches a hand-edited or truncated state.json.
export function checkCheckpointSupply(state) {
  const derived = BigInt(state.minted) - BigInt(state.burned);
  return check(
    "checkpoint supply reconciles exactly (minted − burned = totalSupply)",
    derived === BigInt(state.totalSupply),
    `minted−burned=${derived} totalSupply=${state.totalSupply}`
  );
}

// Rows arrive in block order, and block time never goes back.
export function checkTimestampCoverage(transfers) {
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
    "every event has an exact, non-decreasing timestamp",
    missing === 0 && outOfOrder === 0,
    `events=${transfers.length} missing=${missing} outOfOrder=${outOfOrder}`
  );
}

export function checkTimestampWindow(transfers, manifest, state, toleranceSeconds = 120) {
  const deployTs = Date.parse(manifest.deployTimestamp) / 1000;
  const outside = transfers.filter(
    (t) => t.ts < deployTs - toleranceSeconds || t.ts > state.lastBlockTime + toleranceSeconds
  ).length;
  return check(
    "timestamps inside deploy → checkpoint window",
    outside === 0,
    `outside=${outside} of ${transfers.length}`
  );
}

// csvRows are the data lines of daily.csv (header already removed).
export function checkSeriesLength(csvRows, summary) {
  return check(
    "daily series length matches summary range",
    csvRows.length === summary.range.totalDays,
    `csv=${csvRows.length} summary=${summary.range.totalDays}`
  );
}

export function checkSeriesContinuity(csvRows) {
  let prev = null;
  let gaps = 0;
  for (const row of csvRows) {
    const day = row.slice(0, 10);
    if (prev) {
      const expected = new Date(new Date(prev + "T00:00:00Z").getTime() + 864e5)
        .toISOString()
        .slice(0, 10);
      if (day !== expected) gaps++;
    }
    prev = day;
  }
  return check("daily series is continuous (no missing days)", gaps === 0, `gaps=${gaps}`);
}

export function checkCsvTransferTotal(csvRows, summary) {
  const csvTransfers = csvRows.reduce((acc, r) => acc + Number(r.split(",")[2]), 0);
  return check(
    "csv transfer total equals summary total",
    csvTransfers === summary.totals.transferEvents,
    `csv=${csvTransfers} summary=${summary.totals.transferEvents}`
  );
}

export function checkSupplyInvariant(summary) {
  const mintMinusBurn = summary.totals.totalMintedCOPM - summary.totals.totalBurnedCOPM;
  const supplyDelta = Math.abs(mintMinusBurn - summary.totals.currentSupplyCOPM);
  return check(
    "mints − burns equals derived supply",
    supplyDelta < 1, // tolerance: rounding at 6 decimals
    `mints−burns=${mintMinusBurn.toFixed(2)} derived=${summary.totals.currentSupplyCOPM.toFixed(2)}`
  );
}

// totalSupply() moves between scan time and validation time (live mints and
// burns), so this is a sanity bound, not an equality.
export function checkLiveSupply(summary, onChainSupply) {
  const deviation =
    Math.abs(onChainSupply - summary.totals.currentSupplyCOPM) / Math.max(onChainSupply, 1);
  return check(
    "derived supply within 25% of live totalSupply()",
    deviation < 0.25,
    `derived=${summary.totals.currentSupplyCOPM.toFixed(0)} onChain=${onChainSupply.toFixed(0)} deviation=${(deviation * 100).toFixed(1)}%`
  );
}

// The checks that only need files on disk, in report order.
export function offlineChecks({ transfers, manifest, state, csvRows, summary }) {
  return [
    checkEventCount(transfers, state),
    checkNoDuplicates(transfers),
    checkBlockRange(transfers, manifest, state),
    checkCheckpointSupply(state),
    checkTimestampCoverage(transfers),
    checkTimestampWindow(transfers, manifest, state),
    checkSeriesLength(csvRows, summary),
    checkSeriesContinuity(csvRows),
    checkCsvTransferTotal(csvRows, summary),
    checkSupplyInvariant(summary),
  ];
}
