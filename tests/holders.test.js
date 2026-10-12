import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BUCKETS,
  HOLDERS_CSV_HEADER,
  buildHolderRows,
  bucketHolders,
  concentration,
  formatPct,
  formatUnits,
  holdersCsv,
  parseHoldersCsv,
  parseUnits,
} from "../pipeline/domain/holders.js";

const COPM = (n) => BigInt(n) * 10n ** 18n;
const addr = (n) => `0x${n.toString(16).padStart(40, "0")}`;

test("amounts format as exact 18-decimal strings with trailing zeros trimmed, and parse back", () => {
  assert.equal(formatUnits(0n), "0");
  assert.equal(formatUnits(COPM(5)), "5");
  assert.equal(formatUnits(1n), "0.000000000000000001");
  assert.equal(formatUnits(10n ** 27n + 1n), "1000000000.000000000000000001");
  assert.equal(formatUnits(1_500_000_000_000_000_000n), "1.5");
  for (const v of [0n, 1n, COPM(5), 10n ** 27n + 1n, 123_456_789_012_345_678_901n]) {
    assert.equal(parseUnits(formatUnits(v)), v);
  }
  assert.throws(() => parseUnits("1.2.3"), /invalid amount/);
  assert.throws(() => parseUnits("0.0000000000000000001"), /invalid amount/);
});

test("percentages use integer math, four decimals, rounded half up, beyond double precision", () => {
  assert.equal(formatPct(1n, 3n), "33.3333");
  assert.equal(formatPct(2n, 3n), "66.6667");
  assert.equal(formatPct(5n, 100000n * 2n), "0.0025");
  assert.equal(formatPct(0n, 7n), "0.0000");
  const huge = 10n ** 30n;
  assert.equal(formatPct(huge - 1n, huge), "100.0000");
  assert.equal(formatPct(huge / 2n + 1n, huge), "50.0000");
  assert.equal(formatPct(1n, 0n), "0.0000");
});

test("holders rank by balance descending, ties broken by address ascending, zero balances dropped", () => {
  const balances = new Map([
    [addr(3), COPM(10)],
    [addr(1), COPM(10)],
    [addr(2), COPM(30)],
    [addr(4), 0n],
  ]);
  const rows = buildHolderRows({ balances, totalSupply: COPM(50) });
  assert.deepEqual(rows.map((r) => [r.rank, r.address]), [[1, addr(2)], [2, addr(1)], [3, addr(3)]]);
  assert.deepEqual(rows.map((r) => r.sharePct), ["60.0000", "20.0000", "20.0000"]);
});

test("each row carries kind, frozen flag and activity, with safe defaults", () => {
  const balances = new Map([[addr(1), COPM(1)], [addr(2), COPM(2)]]);
  const activity = new Map([
    [addr(1), { received: COPM(1), sent: 0n, transfersIn: 1, transfersOut: 0, firstSeen: 1_700_000_000, lastSeen: 1_700_086_400 }],
  ]);
  const rows = buildHolderRows({
    balances,
    activity,
    contracts: new Set([addr(2)]),
    frozen: new Set([addr(1)]),
    totalSupply: COPM(3),
  });
  const byAddress = Object.fromEntries(rows.map((r) => [r.address, r]));
  assert.equal(byAddress[addr(1)].kind, "wallet");
  assert.equal(byAddress[addr(1)].frozen, true);
  assert.equal(byAddress[addr(1)].firstSeen, 1_700_000_000);
  assert.equal(byAddress[addr(2)].kind, "contract");
  assert.equal(byAddress[addr(2)].frozen, false);
  assert.equal(byAddress[addr(2)].transfersIn, 0);
  assert.equal(byAddress[addr(2)].received, 0n);
});

test("concentration sums the top N balances against the supply without floating point", () => {
  const supply = 10n ** 30n + 3n; // not representable as a double
  const balances = new Map([
    [addr(1), 10n ** 30n],
    [addr(2), 1n],
    [addr(3), 1n],
    [addr(4), 1n],
  ]);
  const rows = buildHolderRows({ balances, totalSupply: supply });
  assert.deepEqual(concentration(rows, supply), { top1Pct: 100, top5Pct: 100, top10Pct: 100, top50Pct: 100 });

  const even = buildHolderRows({
    balances: new Map(Array.from({ length: 20 }, (_, i) => [addr(i + 1), COPM(5)])),
    totalSupply: COPM(100),
  });
  assert.deepEqual(concentration(even, COPM(100)), { top1Pct: 5, top5Pct: 25, top10Pct: 50, top50Pct: 100 });
});

test("bucket edges: exactly 1 and exactly 1,000 COPM belong to the higher bucket", () => {
  assert.deepEqual(BUCKETS.map((b) => b.label), [
    ">= 100M", "10M – 100M", "1M – 10M", "100k – 1M", "10k – 100k", "1k – 10k", "1 – 1k", "< 1",
  ]);
  const balances = new Map([
    [addr(1), 1n],                       // < 1
    [addr(2), COPM(1) - 1n],             // < 1
    [addr(3), COPM(1)],                  // 1 – 1k
    [addr(4), COPM(1000) - 1n],          // 1 – 1k
    [addr(5), COPM(1000)],               // 1k – 10k
    [addr(6), COPM(100_000_000)],        // >= 100M
    [addr(7), COPM(100_000_000) - 1n],   // 10M – 100M
  ]);
  const rows = buildHolderRows({ balances, totalSupply: 0n });
  const counts = Object.fromEntries(bucketHolders(rows).map((b) => [b.label, b.holders]));
  assert.deepEqual(counts, {
    ">= 100M": 1,
    "10M – 100M": 1,
    "1M – 10M": 0,
    "100k – 1M": 0,
    "10k – 100k": 0,
    "1k – 10k": 1,
    "1 – 1k": 2,
    "< 1": 2,
  });
  const top = bucketHolders(rows)[0];
  assert.deepEqual(top, { label: ">= 100M", min: "100000000", holders: 1, copm: "100000000" });
});

test("the CSV has the documented header, exact amounts and UTC dates", () => {
  assert.equal(
    HOLDERS_CSV_HEADER,
    "rank,address,balance_copm,share_pct,kind,frozen,received_copm,sent_copm,transfers_in,transfers_out,first_seen,last_seen"
  );
  const balances = new Map([[addr(1), 10n ** 27n + 1n]]);
  const activity = new Map([
    [addr(1), { received: 10n ** 27n + 1n, sent: 0n, transfersIn: 2, transfersOut: 0, firstSeen: Date.UTC(2024, 0, 31, 23, 59) / 1000, lastSeen: Date.UTC(2024, 1, 1) / 1000 }],
  ]);
  const rows = buildHolderRows({ balances, activity, totalSupply: 10n ** 27n + 1n });
  assert.equal(
    holdersCsv(rows),
    `${HOLDERS_CSV_HEADER}\n1,${addr(1)},1000000000.000000000000000001,100.0000,wallet,false,1000000000.000000000000000001,0,2,0,2024-01-31,2024-02-01\n`
  );
});

test("the CSV reads back into the same addresses and balances", () => {
  const balances = new Map([[addr(1), 10n ** 27n + 1n], [addr(2), 7n]]);
  const rows = buildHolderRows({ balances, totalSupply: 10n ** 27n + 8n });
  assert.deepEqual(parseHoldersCsv(holdersCsv(rows)), [
    { address: addr(1), balance: 10n ** 27n + 1n },
    { address: addr(2), balance: 7n },
  ]);
  assert.throws(() => parseHoldersCsv("wrong,header\n"), /holders\.csv header/);
});
