import { sumUsd, usdAt } from "./rates.js";
import { ZERO_ADDRESS, dayOf, toCOPM } from "./units.js";

const emptyDay = (day) => ({
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

// Replays Transfer events into one row per UTC day, filling quiet days so the
// series is continuous. Every row carries its exact block timestamp `ts` (unix
// seconds), as written by the scan. `approvalsByDay` maps YYYY-MM-DD -> count
// of Approval events; days outside the transfer range are ignored.
//
// Supply is derived, not read from the chain: a mint (from the zero address)
// adds, a burn (to the zero address) subtracts, anything else only moves
// balances between holders.
//
// `rates` is the rate table (domain/rates.js). Every row is valued at the rate
// of its own day: `rate`, `provisional` (the day is later than the last
// published rate) and the USD amounts `supplyEndUsd`, `grossUsd`, `netUsd`,
// `mintUsd` and `burnUsd`. A USD total is the sum of these, never a COPM total
// over one rate.
export function buildDailySeries(transfers, approvalsByDay = {}, rates) {
  if (!rates?.at) throw new Error("buildDailySeries needs the rates (data/rates/cop-usd.csv): run the rates step first");
  const daily = new Map();
  const supplyByDay = new Map();
  const totals = { gross: 0n, mint: 0n, burn: 0n, supply: 0n };

  const sorted = transfers
    .map((t) => ({ ...t, day: dayOf(t.ts) }))
    .sort((a, b) => a.ts - b.ts || a.b - b.b || a.i - b.i);

  for (const t of sorted) {
    if (!daily.has(t.day)) daily.set(t.day, emptyDay(t.day));
    const d = daily.get(t.day);
    const v = BigInt(t.v);
    d.transfers++;
    d.uniqueTxs.add(t.t);
    d.grossVolume += v;
    d.addresses.add(t.f);
    d.addresses.add(t.r);
    totals.gross += v;

    if (t.f === ZERO_ADDRESS) {
      d.mintVolume += v;
      d.mintCount++;
      totals.mint += v;
      totals.supply += v;
    } else if (t.r === ZERO_ADDRESS) {
      d.burnVolume += v;
      d.burnCount++;
      totals.burn += v;
      totals.supply -= v;
    } else {
      d.netVolume += v;
    }
    supplyByDay.set(t.day, totals.supply);
  }

  const days = [...daily.keys()].sort();
  const series = [];
  if (days.length > 0) {
    let lastSupply = 0n;
    const end = new Date(days.at(-1) + "T00:00:00Z");
    for (let d = new Date(days[0] + "T00:00:00Z"); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const day = d.toISOString().slice(0, 10);
      if (supplyByDay.has(day)) lastSupply = supplyByDay.get(day);
      const row = daily.get(day) || emptyDay(day);
      const { rate, provisional } = rates.at(day);
      const usd = (raw) => usdAt(toCOPM(raw), rate);
      series.push({
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
        approvals: approvalsByDay[day] ?? 0,
        rate,
        provisional,
        supplyEndUsd: usd(lastSupply),
        grossUsd: usd(row.grossVolume),
        netUsd: usd(row.netVolume),
        mintUsd: usd(row.mintVolume),
        burnUsd: usd(row.burnVolume),
      });
    }
  }

  return { series, totals };
}

const maxBy = (rows, key) => rows.reduce((a, b) => (b[key] > a[key] ? b : a));

// Totals, averages and peaks for summary.json.
export function summarize({ manifest, chainKey, series, totals, transferEvents }) {
  const dec = 10n ** BigInt(manifest.decimals);
  const avgSupply =
    series.reduce((acc, r) => acc + Number(r.supplyEnd), 0) / series.length / Number(dec);

  const peakTxDay = maxBy(series, "transfers");
  const peakVolDay = maxBy(series, "grossVolume");
  const peakSupplyDay = maxBy(series, "supplyEnd");
  const peakSupplyUsdDay = maxBy(series, "supplyEndUsd");

  const grossCOPM = toCOPM(totals.gross);
  const netCOPM = toCOPM(totals.gross - totals.mint - totals.burn);
  const mintCOPM = toCOPM(totals.mint);
  const burnCOPM = toCOPM(totals.burn);
  const supplyCOPM = Number(totals.supply / 10n ** 12n) / 1e6;
  const peakSupplyCOPM = Number(peakSupplyDay.supplyEnd / 10n ** 12n) / 1e6;

  // USD is summed day by day at each day's rate. A peak is chosen in the unit
  // it is shown in: the supply has one in COPM and, on its own day, one in USD.
  const usdTotal = (key) => sumUsd(series.map((r) => r[key]));
  const grossUSD = usdTotal("grossUsd");
  const rates = series.map((r) => r.rate);

  return {
    chain: manifest.chain ?? chainKey,
    chainLabel: manifest.chainLabel,
    address: manifest.address,
    range: {
      firstDay: series[0].day,
      lastDay: series.at(-1).day,
      totalDays: series.length,
    },
    totals: {
      transferEvents,
      grossVolumeCOPM: grossCOPM,
      grossVolumeUSD: grossUSD,
      netVolumeCOPM: netCOPM,
      netVolumeUSD: usdTotal("netUsd"),
      totalMintedCOPM: mintCOPM,
      totalMintedUSD: usdTotal("mintUsd"),
      totalBurnedCOPM: burnCOPM,
      totalBurnedUSD: usdTotal("burnUsd"),
      currentSupplyCOPM: supplyCOPM,
      currentSupplyUSD: series.at(-1).supplyEndUsd,
    },
    averages: {
      avgEndOfDaySupplyCOPM: avgSupply,
      avgEndOfDaySupplyUSD: Math.round((usdTotal("supplyEndUsd") / series.length) * 100) / 100,
      avgDailyTransfers: transferEvents / series.length,
      avgDailyGrossVolumeCOPM: grossCOPM / series.length,
      avgDailyGrossVolumeUSD: grossUSD / series.length,
    },
    peaks: {
      maxTransfersInOneDay: { day: peakTxDay.day, count: peakTxDay.transfers },
      maxGrossVolumeInOneDay: {
        day: peakVolDay.day,
        copm: toCOPM(peakVolDay.grossVolume),
        usd: peakVolDay.grossUsd,
      },
      maxSupplyEndOfDay: { day: peakSupplyDay.day, copm: peakSupplyCOPM },
      maxSupplyEndOfDayUsd: { day: peakSupplyUsdDay.day, usd: peakSupplyUsdDay.supplyEndUsd },
    },
    // The TRM behind the USD figures: where the series ends and its range.
    fx: {
      latestDay: series.at(-1).day,
      latestCopPerUsd: series.at(-1).rate,
      provisionalDays: series.filter((r) => r.provisional).length,
      provisionalFrom: series.find((r) => r.provisional)?.day ?? null,
      minCopPerUsd: Math.min(...rates),
      maxCopPerUsd: Math.max(...rates),
    },
  };
}

export const CSV_HEADER =
  "day,supply_end_copm,transfers,unique_txs,active_addresses,gross_volume_copm,net_volume_copm,mint_copm,burn_copm,mint_count,burn_count,approvals," +
  "cop_per_usd,supply_end_usd,gross_volume_usd,net_volume_usd,mint_usd,burn_usd";

// daily.csv, no trailing newline (matches the committed files byte for byte).
export function dailyCsv(series) {
  const rows = series.map((r) =>
    [
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
      r.approvals,
      r.rate,
      r.supplyEndUsd,
      r.grossUsd,
      r.netUsd,
      r.mintUsd,
      r.burnUsd,
    ].join(",")
  );
  return [CSV_HEADER, ...rows].join("\n");
}
