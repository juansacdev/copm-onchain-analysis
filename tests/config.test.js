import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import {
  CHAIN_KEYS,
  getChain,
  dataDir,
  dataPath,
  chartsDir,
  RATES_FROM_DAY,
  ratesDir,
  ratesPath,
  scanSettings,
} from "../pipeline/config/chains.js";

test("lists the supported chains", () => {
  assert.deepEqual(CHAIN_KEYS, ["polygon", "celo"]);
});

test("getChain returns the deployment for a known chain", () => {
  const polygon = getChain("polygon");
  assert.equal(polygon.key, "polygon");
  assert.equal(polygon.label, "Polygon");
  assert.equal(polygon.address, "0x12050c705152931cFEe3DD56c52Fb09Dea816C23");
  assert.equal(polygon.rpcEnv, "POLYGON_RPC_URL");

  const celo = getChain("celo");
  assert.equal(celo.address, "0xC92E8Fc2947E32F2B574CCA9F2F12097A71d5606");
  assert.equal(celo.rpcEnv, "CELO_RPC_URL");
});

test("getChain throws on an unknown chain, listing the valid ones", () => {
  assert.throws(() => getChain("nope"), /unknown chain "nope".*polygon, celo/);
});

test("data and charts paths are scoped per chain under the repository root", () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  assert.equal(fileURLToPath(dataDir("celo")), `${root}data/celo/`);
  assert.equal(fileURLToPath(dataPath("celo", "daily.csv")), `${root}data/celo/daily.csv`);
  assert.equal(fileURLToPath(chartsDir("polygon")), `${root}charts/polygon/`);
});

test("the daily rates are shared by every chain, under data/rates/, from the first deploy day", () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  assert.equal(fileURLToPath(ratesDir()), `${root}data/rates/`);
  assert.equal(fileURLToPath(ratesPath("cop-usd.csv")), `${root}data/rates/cop-usd.csv`);
  assert.equal(RATES_FROM_DAY, "2023-09-19", "the day Polygon's COPM was deployed");
});

test("each chain carries its deploy block", () => {
  assert.equal(getChain("polygon").deployBlock, 47747145);
  assert.equal(getChain("celo").deployBlock, 27680993);
});

test("scanSettings returns the per-chain defaults", () => {
  assert.deepEqual(scanSettings("polygon", {}), {
    maxLogRange: 10000,
    rangesPerBatch: 10,
    emptyConfirmations: 2,
    confirmations: 128,
    workers: 6,
    stageBlocks: 2_000_000,
    maxBatchAttempts: 400,
  });
  const celo = scanSettings("celo", {});
  assert.equal(celo.maxLogRange, 5000);
  assert.equal(celo.emptyConfirmations, 6);
  assert.equal(celo.confirmations, 30);
  assert.equal(celo.workers, 12);
});

test("scanSettings lets the environment override a default, and the CLI override the environment", () => {
  const env = { SCAN_WORKERS: "3", SCAN_MAX_LOG_RANGE: "2000" };
  assert.equal(scanSettings("celo", env).workers, 3);
  assert.equal(scanSettings("celo", env).maxLogRange, 2000);
  assert.equal(scanSettings("celo", env, { workers: 5 }).workers, 5);
});

test("scanSettings rejects values that are not integers in range, naming the setting", () => {
  assert.throws(() => scanSettings("celo", { SCAN_WORKERS: "abc" }), /workers/);
  assert.throws(() => scanSettings("celo", {}, { maxLogRange: 0 }), /maxLogRange/);
  assert.throws(() => scanSettings("celo", {}, { emptyConfirmations: -1 }), /emptyConfirmations/);
  assert.equal(scanSettings("celo", {}, { confirmations: 0 }).confirmations, 0);
});
