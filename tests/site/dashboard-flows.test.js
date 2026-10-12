import { test } from "node:test";
import assert from "node:assert/strict";
// Imported from the pure view module, not from charts.js: charts.js loads the
// charting library, which is a dependency of site/ and is not installed where
// the pipeline tests run (the root `npm ci` in CI).
import { flowTotalsOf, viewWindow } from "../../site/src/lib/dashboard-view.js";

const flowTotals = (ctx, chain) => flowTotalsOf(chain, viewWindow(ctx.payload.chains, ctx.state), ctx.state.unit);

// Two days at two rates: the same COPM is worth different dollars.
const chain = {
  key: "polygon",
  checkpoint: { firstDay: "2025-01-01" },
  activity: { endDay: "2025-01-02" },
  daily: {
    day: ["2025-01-01", "2025-01-02"],
    mint: [4000, 0],
    burn: [0, 300],
    volume: [5000, 900],
    mintUsd: [1, 0],
    burnUsd: [0, 0.1],
    volumeUsd: [1.25, 0.3],
  },
};
const ctx = (unit) => ({ payload: { chains: { polygon: chain } }, state: { chain: "polygon", period: "all", unit } });

test("the flow totals in COPM are sums of the COPM of the days", () => {
  assert.deepEqual(flowTotals(ctx("copm"), chain), { minted: 4000, burned: 300, gross: 5900, wallet: 1600, has: true });
});

test("the flow totals in USD are sums of the dollars of the days, not the COPM totals over a rate", () => {
  const usd = flowTotals(ctx("usd"), chain);
  assert.deepEqual(usd, { minted: 1, burned: 0.1, gross: 1.55, wallet: 0.45, has: true });
  assert.notEqual(usd.gross, 5900 / 4000);
});
