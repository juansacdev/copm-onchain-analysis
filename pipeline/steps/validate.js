// Strict, offline validation of every artifact the pipeline wrote for a chain.
//
// It reads only local files (the scan's partitions and checkpoint, the holders
// snapshot, daily.csv, summary.json, manifest.json, and the shared
// data/rates/cop-usd.csv) and needs no network, so
// CI can run it on every push. There is no tolerance: any single failing rule
// makes the exit code 1. The rules live in domain/validation.js; this step
// loads the files, prints the verdicts and writes validation.json.
import { existsSync } from "node:fs";
import { getChain, dataDir, ratesPath } from "../config/chains.js";
import { createStore, readJson, readText, writeJson } from "../adapters/store.js";
import { strictChecks } from "../domain/validation.js";

function readRequired(dir, name, command, chainKey, read) {
  const url = new URL(name, dir);
  if (!existsSync(url)) throw new Error(`missing ${name}: run "${command} --chain ${chainKey}" first`);
  return read(url);
}

export function validateChain({
  chainKey,
  dir,
  deployBlock,
  ratesUrl,
  log = console.log,
  clock = () => new Date(),
}) {
  const store = createStore(dir);
  const state = store.readState();
  if (!state) throw new Error(`no state.json for ${chainKey}: run "scan --chain ${chainKey}" first`);
  const keys = store.listPartitions();
  if (keys.length === 0) {
    throw new Error(`no transfer partitions for ${chainKey}: run "scan --chain ${chainKey}" first`);
  }

  const checks = strictChecks({
    deployBlock,
    manifest: readRequired(dir, "manifest.json", "discover", chainKey, readJson),
    state,
    partitions: keys.map((key) => ({ key, rows: store.readPartition(key) })),
    adminEvents: store.readAdminEvents(),
    approvals: store.readApprovals(),
    csvText: readRequired(dir, "daily.csv", "aggregate", chainKey, readText),
    // A missing file is a failing rule (rates-cover-series), not a crash.
    ratesText: ratesUrl && existsSync(ratesUrl) ? readText(ratesUrl) : null,
    summary: readRequired(dir, "summary.json", "aggregate", chainKey, readJson),
    holders: store.readHolders(),
    // A missing file is a failing rule, not a crash: validate still reports.
    dashboard: existsSync(new URL("dashboard.json", dir)) ? readJson(new URL("dashboard.json", dir)) : null,
  });

  log(`validating chain: ${chainKey} at block ${state.lastBlock}\n`);
  for (const c of checks) log(`[${c.ok ? "PASS" : "FAIL"}] ${c.id} — ${c.detail}`);

  const failed = checks.filter((c) => !c.ok).length;
  const result = { chain: chainKey, block: state.lastBlock, checks, passed: checks.length - failed, failed };

  // validatedAt is the first time this exact result was obtained. Re-running
  // on unchanged data leaves the file as it is, so CI and the daily job do not
  // produce a diff (or a stale report figure) just because time passed.
  const url = new URL("validation.json", dir);
  const { validatedAt: _previousTime, ...previous } = existsSync(url) ? readJson(url) : {};
  const changed = JSON.stringify(previous) !== JSON.stringify(result);
  if (changed) {
    const { chain, block, ...rest } = result;
    writeJson(url, { chain, block, validatedAt: clock().toISOString(), ...rest }, 2);
  }
  log(
    `\n${failed === 0 ? "ALL CHECKS PASSED" : `${failed} CHECK(S) FAILED`} — ` +
      `data/${chainKey}/validation.json ${changed ? "written" : "unchanged"}`
  );
  return { exitCode: failed === 0 ? 0 : 1 };
}

export async function run({ chainKey }) {
  return validateChain({
    chainKey,
    dir: dataDir(chainKey),
    deployBlock: getChain(chainKey).deployBlock,
    ratesUrl: ratesPath("cop-usd.csv"),
  });
}
