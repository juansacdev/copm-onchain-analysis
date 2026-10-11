import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import {
  CHAIN_KEYS,
  getChain,
  dataDir,
  dataPath,
  chartsDir,
  copPerUsd,
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

test("copPerUsd reads the override and falls back to 4000", () => {
  assert.equal(copPerUsd({}), 4000);
  assert.equal(copPerUsd({ COP_PER_USD: "3900" }), 3900);
});
