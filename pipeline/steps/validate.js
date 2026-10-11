// Validation pass over every pipeline artifact for the selected chain.
// Internal consistency checks + on-chain spot checks against live RPC:
//
//   1. transfers/*.jsonl  — count vs checkpoint, no duplicates, block range
//   2. state.json         — supply reconciles exactly; row timestamps exact and
//                           inside deploy→checkpoint
//   3. daily.csv          — continuous dates, totals match summary.json
//   4. summary.json       — mints − burns == derived supply
//   5. on-chain           — totalSupply() delta, random receipts re-verified
//
// The pure rules live in domain/validation.js; this step reads the files,
// talks to the chain and writes the report. Resolves with exitCode 1 if any
// check fails. Writes data/<chain>/validation.json.
import { getChain, dataPath, dataDir, ERC20_ABI } from "../config/chains.js";
import { createRpcClient } from "../adapters/rpc.js";
import { createStore, readJson, readText, writeJson } from "../adapters/store.js";
import { checkLiveSupply, offlineChecks } from "../domain/validation.js";

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const SAMPLES = 12;

export async function run({ chainKey, env = process.env }) {
  const { key, address } = getChain(chainKey);
  const client = createRpcClient(key, env);

  const results = [];
  let failed = 0;

  function report(check) {
    results.push(check);
    const icon = check.ok ? "PASS" : "FAIL";
    if (!check.ok) failed++;
    console.log(`[${icon}] ${check.name} — ${check.detail}`);
  }

  console.log(`validating chain: ${key}\n`);

  const manifest = readJson(dataPath(key, "manifest.json"));
  const store = createStore(dataDir(key));
  const state = store.readState();
  if (!state) throw new Error(`no state.json for ${key}: run "scan --chain ${key}" first`);
  const summary = readJson(dataPath(key, "summary.json"));
  const transfers = store.readTransfers();
  const csvRows = readText(dataPath(key, "daily.csv")).trim().split("\n").slice(1);

  /* 1-4 — file-based rules --------------------------------------------------- */

  for (const check of offlineChecks({ transfers, manifest, state, csvRows, summary })) {
    report(check);
  }

  /* 5 — on-chain spot checks ------------------------------------------------- */

  const onChainSupply = Number(
    await client.readContract({ address, abi: ERC20_ABI, functionName: "totalSupply" })
  ) / 10 ** manifest.decimals;
  report(checkLiveSupply(summary, onChainSupply));

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
        l.address.toLowerCase() === address.toLowerCase() &&
        l.topics[0] === TRANSFER_TOPIC
    );
    return log && BigInt(log.data) === BigInt(t.v) && Number(receipt.blockNumber) === t.b;
  }

  async function verifyViaLogs(t) {
    const logs = await client.getLogs({
      address,
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
  report({
    name: "random transfers re-verified against the live chain",
    ok: mismatched === 0 && viaReceipt + viaLogs > 0,
    detail: `viaReceipt=${viaReceipt} viaLogs=${viaLogs} mismatched=${mismatched} (sampled every ${step}th event)`,
  });

  /* ----------------------------------------------------------------------- */

  writeJson(
    dataPath(key, "validation.json"),
    {
      chain: key,
      validatedAt: new Date().toISOString(),
      checks: results,
      passed: results.length - failed,
      failed,
    },
    2
  );

  console.log(
    `\n${failed === 0 ? "ALL CHECKS PASSED" : `${failed} CHECK(S) FAILED`} — data/${key}/validation.json written`
  );
  return { exitCode: failed === 0 ? 0 : 1 };
}
