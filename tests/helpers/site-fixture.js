// A tiny data directory for the site loader tests, written to a temp folder.
// The numbers are chosen so that every derived figure can be computed by hand;
// the real data/ directory is never read by these tests.
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const COP_PER_USD = 4000;
const SUPPLY_COPM = 1_000_000;
const WEI = 10n ** 18n;

const HEADER =
  "day,supply_end_copm,transfers,unique_txs,active_addresses,gross_volume_copm,net_volume_copm,mint_copm,burn_copm,mint_count,burn_count,approvals";

function daysBetween(from, to) {
  const out = [];
  for (let t = Date.parse(from); t <= Date.parse(to); t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

// overrides[chain].plan replaces keys of the default plan; overrides[chain].validation
// replaces the validation file.
// plan: { from, to, usdPerDay: {"2025-01": 10}, txPerDay: {"2025-01": 10},
//         overrides: {"2025-03-15": { usd: 500, tx: 200 }} }
function dailyCsv(plan) {
  const rows = daysBetween(plan.from, plan.to).map((day) => {
    const month = day.slice(0, 7);
    const over = plan.overrides?.[day] ?? {};
    const usd = over.usd ?? plan.usdPerDay[month];
    const tx = over.tx ?? plan.txPerDay[month];
    return `${day},${SUPPLY_COPM},${tx},${tx},${tx},${usd * COP_PER_USD},0,0,0,0,0,0`;
  });
  return [HEADER, ...rows].join("\n") + "\n";
}

function validation(passed, failed, extra = {}) {
  const checks = [];
  for (let i = 0; i < passed + failed; i++) {
    checks.push({ id: i === 0 ? "supply-exact" : `rule-${i}`, ok: i < passed, detail: "" });
  }
  return { block: 100, validatedAt: "2025-06-16T01:02:03.000Z", checks, passed, failed, ...extra };
}

const CHAINS = {
  polygon: {
    label: "Polygon",
    address: "0x12050c705152931cFEe3DD56c52Fb09Dea816C23",
    deploy: "2025-01-01T00:00:00.000Z",
    plan: {
      from: "2025-01-01",
      to: "2025-06-15",
      usdPerDay: { "2025-01": 10, "2025-02": 20, "2025-03": 100, "2025-04": 40, "2025-05": 60, "2025-06": 30 },
      txPerDay: { "2025-01": 10, "2025-02": 10, "2025-03": 20, "2025-04": 10, "2025-05": 10, "2025-06": 10 },
      overrides: {
        "2025-02-10": { tx: 150 },
        "2025-03-15": { usd: 500, tx: 200 },
        "2025-05-20": { usd: 300 },
      },
    },
    state: { transfers: 1000, approvals: 400, adminEvents: 11, lastBlock: 5000, lastBlockTime: 1750000000 },
    holders: { holders: 582, addressesEverSeen: 2555, frozen: [], top10Pct: 95.5 },
    validation: validation(17, 0),
  },
  celo: {
    label: "Celo",
    address: "0xC92E8Fc2947E32F2B574CCA9F2F12097A71d5606",
    deploy: "2025-02-01T00:00:00.000Z",
    plan: {
      from: "2025-02-01",
      to: "2025-03-10",
      usdPerDay: { "2025-02": 1, "2025-03": 2 },
      txPerDay: { "2025-02": 50, "2025-03": 60 },
      overrides: { "2025-02-03": { tx: 120 } },
    },
    state: { transfers: 300, approvals: 100, adminEvents: 12, lastBlock: 9000, lastBlockTime: 1750100000 },
    holders: { holders: 998, addressesEverSeen: 3123, frozen: ["0xabc"], top10Pct: 98.8 },
    validation: validation(17, 0),
  },
};

function write(dir, name, value) {
  writeFileSync(join(dir, name), typeof value === "string" ? value : JSON.stringify(value, null, 2));
}

// Returns the path of a fresh data directory with a polygon and a celo folder.
export function writeSiteFixture(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), "copm-site-"));
  for (const [key, spec] of Object.entries(CHAINS)) {
    const dir = join(root, key);
    mkdirSync(dir, { recursive: true });
    const csv = dailyCsv({ ...spec.plan, ...overrides[key]?.plan });
    write(dir, "daily.csv", csv);
    const rows = csv.trim().split("\n").slice(1).map((l) => l.split(","));
    const totalGross = rows.reduce((sum, r) => sum + Number(r[5]), 0);
    write(dir, "summary.json", {
      chain: key,
      chainLabel: spec.label,
      address: spec.address,
      range: { firstDay: rows[0][0], lastDay: rows.at(-1)[0], totalDays: rows.length },
      totals: { transferEvents: spec.state.transfers, grossVolumeCOPM: totalGross },
      averages: { avgDailyTransfers: spec.state.transfers / rows.length },
    });
    write(dir, "state.json", {
      schema: 1,
      chain: key,
      address: spec.address,
      ...spec.state,
      totalSupply: (BigInt(SUPPLY_COPM) * WEI).toString(),
      minted: (BigInt(SUPPLY_COPM) * WEI).toString(),
      burned: "0",
    });
    write(dir, "manifest.json", {
      chain: key,
      chainLabel: spec.label,
      address: spec.address,
      name: "COP Minteo",
      symbol: "COPM",
      decimals: 18,
      deployBlock: "1",
      deployTimestamp: spec.deploy,
    });
    write(dir, "holders.json", {
      block: spec.state.lastBlock,
      totalSupply: String(SUPPLY_COPM),
      holders: spec.holders.holders,
      addressesEverSeen: spec.holders.addressesEverSeen,
      frozen: spec.holders.frozen,
      concentration: { top10Pct: spec.holders.top10Pct },
    });
    write(dir, "validation.json", overrides[key]?.validation ?? { chain: key, ...spec.validation });
  }
  return root;
}
