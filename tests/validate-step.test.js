import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildAggregate } from "../pipeline/steps/aggregate.js";
import { runHolders } from "../pipeline/steps/holders.js";
import { validateChain } from "../pipeline/steps/validate.js";
import { writeDashboard } from "../pipeline/steps/dashboard.js";
import { writeJson, writeText } from "../pipeline/adapters/store.js";
import { CHAIN_KEY, DEPLOY, fixture, writeFixture } from "./helpers/validation-fixture.js";
import { flatRates } from "./helpers/rates.js";
import { ratesCsv } from "../pipeline/domain/rates.js";
import { CHAIN, DEPLOY as SCAN_DEPLOY, SETTINGS, scannedDataset, tempStore } from "./helpers/dataset.js";

const validate = (dir, extra = {}) =>
  validateChain({
    chainKey: CHAIN_KEY,
    dir,
    deployBlock: DEPLOY,
    ratesUrl: new URL("cop-usd.csv", dir),
    log: () => {},
    clock: () => new Date("2026-01-01T00:00:00.000Z"),
    ...extra,
  });
const report = (dir) => JSON.parse(readFileSync(new URL("validation.json", dir), "utf8"));

test("a consistent dataset passes: exit code 0 and a validation.json with every rule", () => {
  const { url, store } = tempStore();
  const fx = fixture();
  writeFixture(store, url, fx);

  const { exitCode } = validate(url);
  assert.equal(exitCode, 0);
  const written = report(url);
  assert.equal(written.failed, 0);
  assert.equal(written.passed, written.checks.length);
  assert.equal(written.block, fx.state.lastBlock);
  assert.equal(written.validatedAt, "2026-01-01T00:00:00.000Z");
  assert.ok(written.checks.every((c) => c.id && c.ok === true && typeof c.detail === "string"));
});

test("one wei of supply difference fails: exit code 1 and the failing rule is recorded", () => {
  const { url, store } = tempStore();
  const fx = fixture();
  fx.state.totalSupply = (BigInt(fx.state.totalSupply) + 1n).toString();
  writeFixture(store, url, fx);

  assert.equal(validate(url).exitCode, 1);
  const written = report(url);
  assert.ok(written.failed >= 1);
  assert.equal(written.checks.find((c) => c.id === "supply-exact").ok, false);
});

test("a missing holders snapshot fails validation instead of passing silently", () => {
  const { url, store } = tempStore();
  const fx = fixture();
  fx.holders = { csv: null, json: null };
  writeFixture(store, url, fx);

  assert.equal(validate(url).exitCode, 1);
  assert.equal(report(url).checks.find((c) => c.id === "holders-sum-exact").ok, false);
});

test("a row without a timestamp fails the rules instead of crashing the step", () => {
  const { url, store } = tempStore();
  const fx = fixture();
  delete fx.partitions[0].rows[0].ts;
  writeFixture(store, url, fx);
  assert.equal(validate(url).exitCode, 1);
});

test("validation never touches the network", () => {
  const { url, store } = tempStore();
  writeFixture(store, url, fixture());
  const original = globalThis.fetch;
  globalThis.fetch = () => assert.fail("validate must be offline");
  try {
    assert.equal(validate(url).exitCode, 0);
  } finally {
    globalThis.fetch = original;
  }
});

test("missing inputs say which step to run", () => {
  const { url, store } = tempStore();
  assert.throws(() => validate(url), /no state\.json for celo: run "scan --chain celo" first/);
  store.writeState(fixture().state);
  assert.throws(() => validate(url), /no transfer partitions for celo: run "scan --chain celo" first/);
  const fx = fixture();
  for (const { key, rows } of fx.partitions) store.writePartition(key, rows);
  assert.throws(() => validate(url), /missing manifest\.json: run "discover --chain celo"/);
});

test("scan, holders, aggregate and dashboard output validate end to end", async () => {
  const dataset = await scannedDataset();
  await runHolders({
    chain: CHAIN,
    settings: SETTINGS,
    rpc: dataset.fake.rpc,
    store: dataset.store,
    log: () => {},
    sleep: async () => {},
  });
  const state = dataset.store.readState();
  const manifest = {
    chain: CHAIN.key,
    chainLabel: "Testnet",
    address: CHAIN.address,
    decimals: 18,
    deployBlock: String(SCAN_DEPLOY),
    deployTimestamp: new Date((state.lastBlockTime - 86_400) * 1000).toISOString(),
  };
  const rates = flatRates(4000);
  writeText(new URL("cop-usd.csv", dataset.url), ratesCsv(rates.rows));
  const { summary, csv } = buildAggregate({ store: dataset.store, manifest, chainKey: CHAIN.key, rates });
  writeJson(new URL("summary.json", dataset.url), summary, 2);
  writeText(new URL("daily.csv", dataset.url), csv);
  writeJson(new URL("manifest.json", dataset.url), manifest, 2);
  writeDashboard({ store: dataset.store, dirUrl: dataset.url, chainKey: CHAIN.key, rates, log: () => {} });

  const result = validateChain({
    chainKey: CHAIN.key,
    dir: dataset.url,
    deployBlock: SCAN_DEPLOY,
    ratesUrl: new URL("cop-usd.csv", dataset.url),
    log: () => {},
  });
  const failed = report(dataset.url).checks.filter((c) => !c.ok);
  assert.deepEqual(failed, []);
  assert.equal(result.exitCode, 0);
});

test("re-validating unchanged data keeps validation.json byte-identical, so a second run commits nothing", () => {
  const { url, store } = tempStore();
  writeFixture(store, url, fixture());

  const firstLog = [];
  validate(url, { log: (line) => firstLog.push(line) });
  const first = readFileSync(new URL("validation.json", url), "utf8");
  const secondLog = [];
  validate(url, { clock: () => new Date("2026-02-02T00:00:00.000Z"), log: (line) => secondLog.push(line) });
  assert.equal(readFileSync(new URL("validation.json", url), "utf8"), first);
  assert.match(firstLog.join("\n"), /validation\.json written/);
  assert.match(secondLog.join("\n"), /validation\.json unchanged/);
  assert.doesNotMatch(secondLog.join("\n"), /written/);
});

test("a changed result is written with the time of the new run", () => {
  const { url, store } = tempStore();
  const fx = fixture();
  writeFixture(store, url, fx);
  validate(url);

  writeJson(new URL("state.json", url), { ...fx.state, totalSupply: (BigInt(fx.state.totalSupply) + 1n).toString() }, 2);
  validate(url, { clock: () => new Date("2026-02-02T00:00:00.000Z") });
  assert.equal(report(url).validatedAt, "2026-02-02T00:00:00.000Z");
});

test("a missing rates file fails the rates rule and the two rebuilds instead of crashing the step", () => {
  const { url, store } = tempStore();
  writeFixture(store, url, { ...fixture(), ratesText: null });
  assert.equal(validate(url).exitCode, 1);
  const failed = report(url).checks.filter((c) => !c.ok).map((c) => c.id);
  assert.deepEqual(failed, ["rates-cover-series", "daily-matches-ledger", "dashboard-matches-ledger"]);
});
