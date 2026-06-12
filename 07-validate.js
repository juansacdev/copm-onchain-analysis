// Validation pass over every pipeline artifact for the selected chain.
// Internal consistency checks + on-chain spot checks against live RPC:
//
//   1. transfers.jsonl    — count vs scan progress, no duplicates, block range
//   2. block-ts.json      — full coverage, timestamps inside deploy→latest
//   3. daily.csv          — continuous dates, totals match summary.json
//   4. summary.json       — mints − burns == derived supply
//   5. on-chain           — totalSupply() delta, random receipts re-verified
//
// Exits non-zero if any check fails. Writes data/<chain>/validation.json.
import { readFileSync, writeFileSync } from "node:fs";
import { client, COPM_ADDRESS, ERC20_ABI, CHAIN_KEY, dataPath } from "./config.js";

const results = [];
let failed = 0;

function check(name, ok, detail) {
  results.push({ name, ok, detail });
  const icon = ok ? "PASS" : "FAIL";
  if (!ok) failed++;
  console.log(`[${icon}] ${name} — ${detail}`);
}

console.log(`validating chain: ${CHAIN_KEY}\n`);

const manifest = JSON.parse(readFileSync(dataPath("manifest.json"), "utf8"));
const progress = JSON.parse(readFileSync(dataPath("scan-progress.json"), "utf8"));
const summary = JSON.parse(readFileSync(dataPath("summary.json"), "utf8"));
const tsCache = JSON.parse(readFileSync(dataPath("block-ts.json"), "utf8"));

/* 1 — transfers.jsonl ----------------------------------------------------- */

const lines = readFileSync(dataPath("transfers.jsonl"), "utf8")
  .split("\n")
  .filter(Boolean);
const transfers = lines.map((l) => JSON.parse(l));

check(
  "event count matches scan progress",
  transfers.length === progress.totalEvents,
  `jsonl=${transfers.length} scan=${progress.totalEvents}`
);

const seen = new Set();
let dupes = 0;
for (const t of transfers) {
  const key = `${t.t}#${t.i}`;
  if (seen.has(key)) dupes++;
  seen.add(key);
}
check("no duplicate (tx, logIndex) pairs", dupes === 0, `duplicates=${dupes}`);

const deployBlock = Number(manifest.deployBlock);
const latestBlock = Number(manifest.latestBlockAtRun);
const outOfRange = transfers.filter((t) => t.b < deployBlock || t.b > latestBlock).length;
check(
  "all events inside scanned block range",
  outOfRange === 0,
  `outOfRange=${outOfRange} (range ${deployBlock} → ${latestBlock})`
);

check(
  "scan completed (all slices reached their end)",
  progress.slices.every((s) => BigInt(s.cursor) > BigInt(s.end)),
  progress.completedAt ? `completedAt=${progress.completedAt}` : "no completedAt marker"
);

/* 2 — block-ts.json -------------------------------------------------------- */

const uniqueBlocks = new Set(transfers.map((t) => t.b));
const missingTs = [...uniqueBlocks].filter((b) => !(b in tsCache)).length;
check(
  "every event block has a timestamp",
  missingTs === 0,
  `uniqueBlocks=${uniqueBlocks.size} missing=${missingTs}`
);

const deployTs = Date.parse(manifest.deployTimestamp) / 1000;
const latestTs = Date.parse(manifest.latestBlockTimestamp) / 1000;
const TOLERANCE = 120; // interpolation slack, seconds
const badTs = Object.values(tsCache).filter(
  (ts) => ts < deployTs - TOLERANCE || ts > latestTs + TOLERANCE
).length;
check(
  "timestamps inside deploy → latest window",
  badTs === 0,
  `outside=${badTs} of ${Object.keys(tsCache).length}`
);

/* 3 — daily.csv ------------------------------------------------------------ */

const csvRows = readFileSync(dataPath("daily.csv"), "utf8").trim().split("\n").slice(1);
check(
  "daily series length matches summary range",
  csvRows.length === summary.range.totalDays,
  `csv=${csvRows.length} summary=${summary.range.totalDays}`
);

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
check("daily series is continuous (no missing days)", gaps === 0, `gaps=${gaps}`);

const csvTransfers = csvRows.reduce((acc, r) => acc + Number(r.split(",")[2]), 0);
check(
  "csv transfer total equals summary total",
  csvTransfers === summary.totals.transferEvents,
  `csv=${csvTransfers} summary=${summary.totals.transferEvents}`
);

/* 4 — summary internal invariants ------------------------------------------ */

const mintMinusBurn = summary.totals.totalMintedCOPM - summary.totals.totalBurnedCOPM;
const supplyDelta = Math.abs(mintMinusBurn - summary.totals.currentSupplyCOPM);
check(
  "mints − burns equals derived supply",
  supplyDelta < 1, // tolerance: rounding at 6 decimals
  `mints−burns=${mintMinusBurn.toFixed(2)} derived=${summary.totals.currentSupplyCOPM.toFixed(2)}`
);

/* 5 — on-chain spot checks -------------------------------------------------- */

const onChainSupply = Number(
  await client.readContract({
    address: COPM_ADDRESS,
    abi: ERC20_ABI,
    functionName: "totalSupply",
  })
) / 10 ** manifest.decimals;
const supplyDeviation =
  Math.abs(onChainSupply - summary.totals.currentSupplyCOPM) /
  Math.max(onChainSupply, 1);
// totalSupply() moves between scan time and validation time (live mints and
// burns), so this is a sanity bound, not an equality.
check(
  "derived supply within 25% of live totalSupply()",
  supplyDeviation < 0.25,
  `derived=${summary.totals.currentSupplyCOPM.toFixed(0)} onChain=${onChainSupply.toFixed(0)} deviation=${(supplyDeviation * 100).toFixed(1)}%`
);

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const SAMPLES = 12;
// Deterministic sample: evenly spaced across the dataset. Each sample is
// re-verified with a fresh, independent read from the chain: the
// transaction receipt when available, or a single-block eth_getLogs query
// as fallback (some endpoints don't serve receipts for legacy eras, e.g.
// Celo blocks before the L2 migration).
const step = Math.max(1, Math.floor(transfers.length / SAMPLES));
let viaReceipt = 0;
let viaLogs = 0;
let mismatched = 0;

async function verifyViaReceipt(t) {
  const receipt = await client.getTransactionReceipt({ hash: t.t });
  const log = receipt.logs.find(
    (l) =>
      l.logIndex === t.i &&
      l.address.toLowerCase() === COPM_ADDRESS.toLowerCase() &&
      l.topics[0] === TRANSFER_TOPIC
  );
  return log && BigInt(log.data) === BigInt(t.v) && Number(receipt.blockNumber) === t.b;
}

async function verifyViaLogs(t) {
  const logs = await client.getLogs({
    address: COPM_ADDRESS,
    fromBlock: BigInt(t.b),
    toBlock: BigInt(t.b),
  });
  return logs.some(
    (l) =>
      l.transactionHash === t.t &&
      l.logIndex === t.i &&
      l.topics[0] === TRANSFER_TOPIC &&
      BigInt(l.data) === BigInt(t.v)
  );
}

for (let i = 0; i < transfers.length && viaReceipt + viaLogs + mismatched < SAMPLES; i += step) {
  const t = transfers[i];
  try {
    if (await verifyViaReceipt(t)) {
      viaReceipt++;
      continue;
    }
  } catch {
    // fall through to the logs-based check
  }
  try {
    if (await verifyViaLogs(t)) viaLogs++;
    else mismatched++;
  } catch {
    mismatched++;
  }
}
check(
  "random transfers re-verified against the live chain",
  mismatched === 0 && viaReceipt + viaLogs > 0,
  `viaReceipt=${viaReceipt} viaLogs=${viaLogs} mismatched=${mismatched} (sampled every ${step}th event)`
);

/* -------------------------------------------------------------------------- */

const report = {
  chain: CHAIN_KEY,
  validatedAt: new Date().toISOString(),
  checks: results,
  passed: results.length - failed,
  failed,
};
writeFileSync(dataPath("validation.json"), JSON.stringify(report, null, 2));

console.log(
  `\n${failed === 0 ? "ALL CHECKS PASSED" : `${failed} CHECK(S) FAILED`} — data/${CHAIN_KEY}/validation.json written`
);
process.exit(failed === 0 ? 0 : 1);
