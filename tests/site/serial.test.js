import { test } from "node:test";
import assert from "node:assert/strict";
import { formatSerialBlock, serialLine } from "../../site/src/lib/serial.js";
import { loadAnalysisData } from "../../site/src/lib/analysis-data.js";
import { COP_PER_USD, writeSiteFixture } from "../helpers/site-fixture.js";

test("groups a block number in threes, separated by a space", () => {
  assert.equal(formatSerialBlock(95370448), "95 370 448");
  assert.equal(formatSerialBlock(79861762), "79 861 762");
  assert.equal(formatSerialBlock(1000), "1 000");
  assert.equal(formatSerialBlock(7), "7");
});

test("rejects blocks that are not non-negative integers", () => {
  for (const bad of [-1, 1.5, NaN, "95370448", undefined, null]) {
    assert.throws(() => formatSerialBlock(bad), /block/, String(bad));
  }
});

test("builds the serial line of both chains in a fixed order", () => {
  const line = serialLine([
    { key: "celo", checkpointBlock: 79861762 },
    { key: "polygon", checkpointBlock: 95370448 },
  ]);
  assert.equal(line, "POL 95 370 448 · CELO 79 861 762");
});

test("an unknown chain or a missing checkpoint fails clearly", () => {
  assert.throws(() => serialLine([{ key: "base", checkpointBlock: 1 }]), /unknown chain "base"/);
  assert.throws(() => serialLine([{ key: "celo" }]), /celo.*block/);
  assert.throws(() => serialLine([]), /no chains/);
});

test("reads the checkpoint block of the real loader output", () => {
  const data = loadAnalysisData({ dataDir: writeSiteFixture(), copPerUsd: COP_PER_USD });
  const line = serialLine(Object.values(data.chains));
  assert.match(line, /^POL [\d ]+ · CELO [\d ]+$/);
});
