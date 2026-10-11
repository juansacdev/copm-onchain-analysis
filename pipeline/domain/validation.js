// Pure rule checks over the pipeline artifacts. Each returns
// { name, ok, detail }; the names and details are what validation.json
// records, so keep them stable.
const check = (name, ok, detail) => ({ name, ok, detail });

export function checkEventCount(transfers, progress) {
  return check(
    "event count matches scan progress",
    transfers.length === progress.totalEvents,
    `jsonl=${transfers.length} scan=${progress.totalEvents}`
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

export function checkBlockRange(transfers, manifest) {
  const deployBlock = Number(manifest.deployBlock);
  const latestBlock = Number(manifest.latestBlockAtRun);
  const outOfRange = transfers.filter((t) => t.b < deployBlock || t.b > latestBlock).length;
  return check(
    "all events inside scanned block range",
    outOfRange === 0,
    `outOfRange=${outOfRange} (range ${deployBlock} → ${latestBlock})`
  );
}

export function checkScanCompleted(progress) {
  return check(
    "scan completed (all slices reached their end)",
    progress.slices.every((s) => BigInt(s.cursor) > BigInt(s.end)),
    progress.completedAt ? `completedAt=${progress.completedAt}` : "no completedAt marker"
  );
}

export function checkTimestampCoverage(transfers, tsCache) {
  const uniqueBlocks = new Set(transfers.map((t) => t.b));
  const missingTs = [...uniqueBlocks].filter((b) => !(b in tsCache)).length;
  return check(
    "every event block has a timestamp",
    missingTs === 0,
    `uniqueBlocks=${uniqueBlocks.size} missing=${missingTs}`
  );
}

export function checkTimestampWindow(tsCache, manifest, toleranceSeconds = 120) {
  const deployTs = Date.parse(manifest.deployTimestamp) / 1000;
  const latestTs = Date.parse(manifest.latestBlockTimestamp) / 1000;
  const badTs = Object.values(tsCache).filter(
    (ts) => ts < deployTs - toleranceSeconds || ts > latestTs + toleranceSeconds
  ).length;
  return check(
    "timestamps inside deploy → latest window",
    badTs === 0,
    `outside=${badTs} of ${Object.keys(tsCache).length}`
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
export function offlineChecks({ transfers, manifest, progress, tsCache, csvRows, summary }) {
  return [
    checkEventCount(transfers, progress),
    checkNoDuplicates(transfers),
    checkBlockRange(transfers, manifest),
    checkScanCompleted(progress),
    checkTimestampCoverage(transfers, tsCache),
    checkTimestampWindow(tsCache, manifest),
    checkSeriesLength(csvRows, summary),
    checkSeriesContinuity(csvRows),
    checkCsvTransferTotal(csvRows, summary),
    checkSupplyInvariant(summary),
  ];
}
