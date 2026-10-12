import { dayOf } from "./units.js";

// Ranking, shares, concentration and the CSV of the holders snapshot. Amounts
// are BigInt (18 decimals) until the very last formatting step.
const DECIMALS = 18;
const ONE = 10n ** BigInt(DECIMALS);

// Exact decimal string, trailing zeros trimmed: 1.5 COPM -> "1.5".
export function formatUnits(value) {
  const whole = value / ONE;
  const fraction = (value % ONE).toString().padStart(DECIMALS, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : `${whole}`;
}

export function parseUnits(text) {
  if (!/^\d+(\.\d{1,18})?$/.test(text)) throw new Error(`invalid amount "${text}"`);
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole) * ONE + BigInt(fraction.padEnd(DECIMALS, "0"));
}

// part / whole as a percentage with 4 decimals, rounded half up.
export function formatPct(part, whole) {
  if (whole <= 0n) return "0.0000";
  const scaled = (part * 2_000_000n + whole) / (2n * whole);
  return `${scaled / 10_000n}.${(scaled % 10_000n).toString().padStart(4, "0")}`;
}

// Holders only: one row per address with a positive balance, biggest first.
// `activity`, `contracts` and `frozen` are optional enrichments.
export function buildHolderRows({
  balances,
  activity = new Map(),
  contracts = new Set(),
  frozen = new Set(),
  totalSupply,
}) {
  return [...balances]
    .filter(([, balance]) => balance > 0n)
    .sort(([addressA, a], [addressB, b]) => (a === b ? (addressA < addressB ? -1 : 1) : a > b ? -1 : 1))
    .map(([address, balance], index) => {
      const seen = activity.get(address);
      return {
        rank: index + 1,
        address,
        balance,
        sharePct: formatPct(balance, totalSupply),
        kind: contracts.has(address) ? "contract" : "wallet",
        frozen: frozen.has(address),
        received: seen?.received ?? 0n,
        sent: seen?.sent ?? 0n,
        transfersIn: seen?.transfersIn ?? 0,
        transfersOut: seen?.transfersOut ?? 0,
        firstSeen: seen?.firstSeen ?? null,
        lastSeen: seen?.lastSeen ?? null,
      };
    });
}

// Share of the supply held by the top N holders. Percentages are the only
// place a number leaves BigInt; four decimals are exact in a double.
export function concentration(rows, totalSupply) {
  const top = (n) =>
    Number(formatPct(rows.slice(0, n).reduce((sum, row) => sum + row.balance, 0n), totalSupply));
  return { top1Pct: top(1), top5Pct: top(5), top10Pct: top(10), top50Pct: top(50) };
}

const M = 10n ** 6n * ONE;
const k = 10n ** 3n * ONE;
// Lower bound inclusive, upper bound exclusive: exactly 1 COPM is "1 – 1k".
export const BUCKETS = [
  { label: ">= 100M", min: 100n * M },
  { label: "10M – 100M", min: 10n * M },
  { label: "1M – 10M", min: M },
  { label: "100k – 1M", min: 100n * k },
  { label: "10k – 100k", min: 10n * k },
  { label: "1k – 10k", min: k },
  { label: "1 – 1k", min: ONE },
  { label: "< 1", min: 0n },
];

export function bucketHolders(rows) {
  const buckets = BUCKETS.map(({ label, min }) => ({ label, min, holders: 0, total: 0n }));
  for (const row of rows) {
    const bucket = buckets.find((b) => row.balance >= b.min);
    bucket.holders++;
    bucket.total += row.balance;
  }
  return buckets.map(({ label, min, holders, total }) => ({
    label,
    min: formatUnits(min),
    holders,
    copm: formatUnits(total),
  }));
}

export const HOLDERS_CSV_HEADER =
  "rank,address,balance_copm,share_pct,kind,frozen,received_copm,sent_copm,transfers_in,transfers_out,first_seen,last_seen";

export function holdersCsv(rows) {
  const lines = rows.map((r) =>
    [
      r.rank,
      r.address,
      formatUnits(r.balance),
      r.sharePct,
      r.kind,
      r.frozen,
      formatUnits(r.received),
      formatUnits(r.sent),
      r.transfersIn,
      r.transfersOut,
      r.firstSeen === null ? "" : dayOf(r.firstSeen),
      r.lastSeen === null ? "" : dayOf(r.lastSeen),
    ].join(",")
  );
  return [HOLDERS_CSV_HEADER, ...lines].map((line) => `${line}\n`).join("");
}

// What validation needs back from holders.csv.
export function parseHoldersCsv(text) {
  const [header, ...lines] = text.split("\n").filter(Boolean);
  if (header !== HOLDERS_CSV_HEADER) throw new Error("unexpected holders.csv header");
  return lines.map((line) => {
    const [, address, balance] = line.split(",");
    return { address, balance: parseUnits(balance) };
  });
}
