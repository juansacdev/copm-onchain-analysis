import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clientPayload, loadDashboardData } from "../../site/src/lib/dashboard-data.js";
import { fixture } from "../helpers/validation-fixture.js";

function writeData(skip = null) {
  const dir = mkdtempSync(join(tmpdir(), "copm-dash-"));
  const fx = fixture();
  for (const chain of ["polygon", "celo"]) {
    mkdirSync(join(dir, chain));
    const files = {
      "dashboard.json": { ...fx.dashboard, chain },
      "manifest.json": { ...fx.manifest, chain, chainLabel: chain === "polygon" ? "Polygon" : "Celo" },
      "validation.json": { chain, block: fx.state.lastBlock, validatedAt: "2026-01-01T00:00:00.000Z", checks: [{ id: "supply-exact", ok: true, detail: "" }], passed: 1, failed: 0 },
      "state.json": fx.state,
    };
    for (const [name, value] of Object.entries(files)) {
      if (skip === `${chain}/${name}`) continue;
      writeFileSync(join(dir, chain, name), JSON.stringify(value));
    }
  }
  return dir;
}

test("loads both chains: dashboard, validation, label and address", () => {
  const data = loadDashboardData({ dataDir: writeData(), copPerUsd: 4000 });
  assert.equal(data.copPerUsd, 4000);
  assert.deepEqual(Object.keys(data.chains), ["polygon", "celo"]);
  assert.equal(data.chains.polygon.label, "Polygon");
  assert.equal(data.chains.celo.dashboard.checkpoint.block, fixture().state.lastBlock);
  assert.equal(data.chains.celo.validation.passed, 1);
});

test("a missing file names the chain, the file and the command that makes it", () => {
  assert.throws(
    () => loadDashboardData({ dataDir: writeData("celo/dashboard.json"), copPerUsd: 4000 }),
    /celo\/dashboard\.json.*dashboard --chain celo/s,
  );
});

test("a dashboard from another block than the verified checkpoint is refused", () => {
  const dir = writeData();
  const file = join(dir, "polygon", "dashboard.json");
  const wrong = { ...fixture().dashboard, checkpoint: { ...fixture().dashboard.checkpoint, block: 1 } };
  writeFileSync(file, JSON.stringify(wrong));
  assert.throws(() => loadDashboardData({ dataDir: dir, copPerUsd: 4000 }), /polygon.*block/i);
});

test("the client payload keeps what the charts and tables need and leaves the rest out", () => {
  const data = loadDashboardData({ dataDir: writeData(), copPerUsd: 4000 });
  const payload = clientPayload(data);
  const chain = payload.chains.polygon;
  assert.deepEqual(Object.keys(chain.daily).sort(), ["burn", "day", "mint", "supply", "transfers", "volume"]);
  assert.ok(chain.largest.d30 && chain.largest.all);
  assert.ok(chain.sizes && chain.holders.top && chain.activity.endDay);
  assert.equal(chain.governance, undefined, "governance is rendered on the server");
  assert.equal(chain.monthly, undefined);
  assert.equal(chain.label, "Polygon");
  assert.equal(chain.key, "polygon");
  assert.equal(payload.copPerUsd, 4000);
});
