import { readFileSync, writeFileSync } from "node:fs";
import { COP_PER_USD } from "./config.js";

const manifest = JSON.parse(
  readFileSync(new URL("./manifest.json", import.meta.url), "utf8")
);
const ZERO = "0x0000000000000000000000000000000000000000";
const DEC = 10n ** BigInt(manifest.decimals);
const toCOPM = (raw) => Number(raw / 10n ** 12n) / 1e6;

const tsCache = JSON.parse(
  readFileSync(new URL("./block-ts.json", import.meta.url), "utf8")
);

const transfers = readFileSync(
  new URL("./transfers.jsonl", import.meta.url),
  "utf8"
)
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l));

console.log(`total transfer events: ${transfers.length}`);

const daily = new Map();

const ensureDay = (day) => {
  if (!daily.has(day)) {
    daily.set(day, {
      day,
      transfers: 0,
      uniqueTxs: new Set(),
      grossVolume: 0n,
      mintVolume: 0n,
      burnVolume: 0n,
      netVolume: 0n,
      mintCount: 0,
      burnCount: 0,
      addresses: new Set(),
    });
  }
  return daily.get(day);
};

let totalGross = 0n;
let totalMint = 0n;
let totalBurn = 0n;
let cumulativeSupply = 0n;
const supplyByDay = new Map();

const sorted = transfers
  .map((t) => {
    const ts = tsCache[t.b];
    if (!ts) return null;
    return { ...t, ts, day: new Date(ts * 1000).toISOString().slice(0, 10) };
  })
  .filter(Boolean)
  .sort((a, b) => a.ts - b.ts || a.i - b.i);

console.log(`sorted ${sorted.length} transfers (with timestamps)`);

for (const t of sorted) {
  const d = ensureDay(t.day);
  const v = BigInt(t.v);
  d.transfers++;
  d.uniqueTxs.add(t.t);
  d.grossVolume += v;
  d.addresses.add(t.f);
  d.addresses.add(t.r);
  totalGross += v;

  if (t.f === ZERO) {
    d.mintVolume += v;
    d.mintCount++;
    totalMint += v;
    cumulativeSupply += v;
  } else if (t.r === ZERO) {
    d.burnVolume += v;
    d.burnCount++;
    totalBurn += v;
    cumulativeSupply -= v;
  } else {
    d.netVolume += v;
  }
  supplyByDay.set(t.day, cumulativeSupply);
}

const days = [...daily.keys()].sort();
const firstDay = days[0];
const lastDay = days[days.length - 1];

let lastSupply = 0n;
const fullSeries = [];
const start = new Date(firstDay + "T00:00:00Z");
const end = new Date(lastDay + "T00:00:00Z");
for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
  const day = d.toISOString().slice(0, 10);
  if (supplyByDay.has(day)) lastSupply = supplyByDay.get(day);
  const row = daily.get(day) || {
    day,
    transfers: 0,
    uniqueTxs: new Set(),
    grossVolume: 0n,
    mintVolume: 0n,
    burnVolume: 0n,
    netVolume: 0n,
    mintCount: 0,
    burnCount: 0,
    addresses: new Set(),
  };
  fullSeries.push({
    day,
    supplyEnd: lastSupply,
    transfers: row.transfers,
    uniqueTxs: row.uniqueTxs.size,
    activeAddresses: row.addresses.size,
    grossVolume: row.grossVolume,
    netVolume: row.netVolume,
    mintVolume: row.mintVolume,
    burnVolume: row.burnVolume,
    mintCount: row.mintCount,
    burnCount: row.burnCount,
  });
}

const avgSupply = fullSeries.reduce((acc, r) => acc + Number(r.supplyEnd), 0) / fullSeries.length / Number(DEC);

const peakTxDay = fullSeries.reduce((a, b) => (b.transfers > a.transfers ? b : a));
const peakVolDay = fullSeries.reduce((a, b) => (b.grossVolume > a.grossVolume ? b : a));
const peakSupplyDay = fullSeries.reduce((a, b) => (b.supplyEnd > a.supplyEnd ? b : a));

const totalGrossCOPM = toCOPM(totalGross);
const totalNetCOPM = toCOPM(totalGross - totalMint - totalBurn);
const totalMintCOPM = toCOPM(totalMint);
const totalBurnCOPM = toCOPM(totalBurn);
const currentSupplyCOPM = Number(cumulativeSupply / 10n ** 12n) / 1e6;

const summary = {
  range: {
    firstDay,
    lastDay,
    totalDays: fullSeries.length,
  },
  totals: {
    transferEvents: transfers.length,
    grossVolumeCOPM: totalGrossCOPM,
    grossVolumeUSD: totalGrossCOPM / COP_PER_USD,
    netVolumeCOPM: totalNetCOPM,
    netVolumeUSD: totalNetCOPM / COP_PER_USD,
    totalMintedCOPM: totalMintCOPM,
    totalBurnedCOPM: totalBurnCOPM,
    currentSupplyCOPM,
    currentSupplyUSD: currentSupplyCOPM / COP_PER_USD,
  },
  averages: {
    avgEndOfDaySupplyCOPM: avgSupply,
    avgEndOfDaySupplyUSD: avgSupply / COP_PER_USD,
    avgDailyTransfers: transfers.length / fullSeries.length,
    avgDailyGrossVolumeCOPM: totalGrossCOPM / fullSeries.length,
    avgDailyGrossVolumeUSD: totalGrossCOPM / COP_PER_USD / fullSeries.length,
  },
  peaks: {
    maxTransfersInOneDay: { day: peakTxDay.day, count: peakTxDay.transfers },
    maxGrossVolumeInOneDay: {
      day: peakVolDay.day,
      copm: toCOPM(peakVolDay.grossVolume),
      usd: toCOPM(peakVolDay.grossVolume) / COP_PER_USD,
    },
    maxSupplyEndOfDay: {
      day: peakSupplyDay.day,
      copm: Number(peakSupplyDay.supplyEnd / 10n ** 12n) / 1e6,
      usd: (Number(peakSupplyDay.supplyEnd / 10n ** 12n) / 1e6) / COP_PER_USD,
    },
  },
};

writeFileSync(
  new URL("./summary.json", import.meta.url),
  JSON.stringify(summary, null, 2)
);

const csvHeader = "day,supply_end_copm,transfers,unique_txs,active_addresses,gross_volume_copm,net_volume_copm,mint_copm,burn_copm,mint_count,burn_count";
const csvRows = fullSeries.map((r) => [
  r.day,
  toCOPM(r.supplyEnd),
  r.transfers,
  r.uniqueTxs,
  r.activeAddresses,
  toCOPM(r.grossVolume),
  toCOPM(r.netVolume),
  toCOPM(r.mintVolume),
  toCOPM(r.burnVolume),
  r.mintCount,
  r.burnCount,
].join(","));
writeFileSync(
  new URL("./daily.csv", import.meta.url),
  [csvHeader, ...csvRows].join("\n")
);

console.log(JSON.stringify(summary, null, 2));
console.log(`\nwrote summary.json + daily.csv`);
