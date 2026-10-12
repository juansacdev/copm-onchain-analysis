// Pure logic behind data/<chain>/dashboard.json: everything the dashboard page
// shows, computed from the transfers, the admin events, the approval counts and
// the holders snapshot. No clock, no file system, no randomness: the same
// inputs give the same bytes, which is what lets the daily job commit the file
// only when something really changed.
//
// Amounts that leave this module are whole-COPM numbers (6 decimals, truncated
// like the rest of the pipeline): they are for drawing and for sentences.
// Exactness lives in the ledger, and validation.js checks the totals here
// against it. Sums are done in BigInt first and converted once.
import { buildDailySeries } from "./aggregate.js";
import { monthKey } from "./partition.js";
import { cents, sumUsd, usdAt } from "./rates.js";
import { ZERO_ADDRESS, dayOf, toCOPM } from "./units.js";

const DAY_SECONDS = 86_400;
const DAY_MS = 86_400_000;

/* Calendar helpers ---------------------------------------------------------- */

export function addDays(iso, delta) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + delta * DAY_MS).toISOString().slice(0, 10);
}

// The last UTC day that is complete at the checkpoint. The scan stops at an
// arbitrary block, so the checkpoint's own day is partial (unless the block
// sits on the last second of its day) and would make the latest window look
// like a drop. Every window in the dashboard ends on this day.
export function windowEndDay(checkpointTs) {
  const day = dayOf(checkpointTs);
  return checkpointTs % DAY_SECONDS === DAY_SECONDS - 1 ? day : addDays(day, -1);
}

// Sum of `series.v` over the `days` days that end on `endDay`, both inclusive.
// `series` is { day: [...ISO days], v: [...numbers] }, aligned by index. Days
// after `endDay` (the partial one) never count; missing days count as zero.
export function windowSum(series, endDay, days) {
  const from = addDays(endDay, -(days - 1));
  let total = 0;
  for (let k = 0; k < series.day.length; k++) {
    const day = series.day[k];
    if (day >= from && day <= endDay) total += series.v[k];
  }
  return total;
}

// The window against the one right before it. `changePct` is null when the
// earlier window is empty: a percentage of zero has no meaning.
export function compareWindows(series, endDay, days) {
  const current = windowSum(series, endDay, days);
  const previous = windowSum(series, addDays(endDay, -days), days);
  return { current, previous, changePct: previous === 0 ? null : ((current - previous) / previous) * 100 };
}

// Trailing average. The first values use the points available so far, so the
// output always has the input's length and never invents a leading gap.
export function movingAverage(values, size) {
  if (!Number.isInteger(size) || size < 1) throw new Error(`movingAverage: window must be a positive integer, got ${size}`);
  const out = [];
  let sum = 0;
  for (let k = 0; k < values.length; k++) {
    sum += values[k];
    if (k >= size) sum -= values[k - size];
    out.push(sum / Math.min(k + 1, size));
  }
  return out;
}

/* Transfer sizes ------------------------------------------------------------ */

const E18 = 10n ** 18n;
const bin = (label, copm) => ({ label, min: copm, minWei: BigInt(copm) * E18 });

// One bin per order of magnitude of COPM. A boundary belongs to the bin it
// opens: exactly 1,000 COPM is "1k–10k".
export const SIZE_BINS = [
  bin("< 1k", 0),
  bin("1k–10k", 1e3),
  bin("10k–100k", 1e4),
  bin("100k–1M", 1e5),
  bin("1M–10M", 1e6),
  bin("10M–100M", 1e7),
  bin("100M–1B", 1e8),
  bin("1B–10B", 1e9),
  bin("10B–100B", 1e10),
  bin(">= 100B", 1e11),
];

export function sizeBin(wei) {
  const value = BigInt(wei);
  let found = 0;
  for (let k = 1; k < SIZE_BINS.length; k++) if (value >= SIZE_BINS[k].minWei) found = k;
  return found;
}

const isMint = (t) => t.f === ZERO_ADDRESS;
const isBurn = (t) => t.r === ZERO_ADDRESS;
const kindOf = (t) => (isMint(t) ? "mint" : isBurn(t) ? "burn" : "transfer");

// Wallet-to-wallet transfers per bin. Issuance and redemption are not
// "payments" and have their own section.
export function sizeCounts(transfers) {
  const counts = SIZE_BINS.map(() => 0);
  for (const t of transfers) if (kindOf(t) === "transfer") counts[sizeBin(t.v)]++;
  return counts;
}

/* Rankings ------------------------------------------------------------------ */

// Biggest volume first. Equal volumes are ordered by address so that the
// result never depends on the order the entries arrived in.
export function topN(entries, n) {
  return [...entries]
    .sort((a, b) => (b.volume > a.volume ? 1 : a.volume > b.volume ? -1 : a.address < b.address ? -1 : a.address > b.address ? 1 : 0))
    .slice(0, n);
}

// Gross volume over what was minted: how many times each issued peso is
// counted. Scaled by 10^6 in BigInt so 145 / 100 is exactly 1.45. Null when
// nothing was minted.
export function turnover(gross, minted) {
  if (minted === 0n) return null;
  return Number((gross * 1_000_000n) / minted) / 1e6;
}

const percent = (part, whole) => Number((part * 10_000n) / whole) / 100;

const group = (rows, addressOf) => {
  const parties = new Map();
  for (const t of rows) {
    const address = addressOf(t);
    const entry = parties.get(address) ?? { address, count: 0, volume: 0n };
    entry.count++;
    entry.volume += BigInt(t.v);
    parties.set(address, entry);
  }
  return parties;
};

const asNumbers = (entries) => entries.map((e) => ({ address: e.address, count: e.count, volume: toCOPM(e.volume) }));

// Who received mints (kind "mint") or who burned (kind "burn"): how many
// distinct addresses, how much, and the share of the biggest one.
export function flowParties(transfers, kind, n) {
  const rows = transfers.filter((t) => kindOf(t) === kind);
  const parties = group(rows, kind === "mint" ? (t) => t.r : (t) => t.f);
  const total = rows.reduce((sum, t) => sum + BigInt(t.v), 0n);
  const top = topN([...parties.values()], n);
  return {
    addresses: parties.size,
    transfers: rows.length,
    volume: toCOPM(total),
    topSharePct: top.length === 0 || total === 0n ? null : percent(top[0].volume, total),
    top: asNumbers(top),
  };
}

// Highest end-of-day supply and the first day it was reached, found in each
// unit on its own. The rate moves, so the day of the COPM peak is not the day
// of the USD peak; an amount, the peak it is compared with and the percentage
// between them must all come from the same unit.
export function supplyPeak(series) {
  if (series.length === 0) return null;
  const inCopm = series.reduce((a, b) => (b.supplyEnd > a.supplyEnd ? b : a));
  const inUsd = series.reduce((a, b) => (b.supplyEndUsd > a.supplyEndUsd ? b : a));
  return {
    copm: { day: inCopm.day, amount: toCOPM(inCopm.supplyEnd) },
    usd: { day: inUsd.day, amount: inUsd.supplyEndUsd },
  };
}

// The n biggest transfers, optionally limited to days fromDay..toDay (both
// inclusive). Equal amounts: earlier block first, then earlier log index.
// Each row also carries its amount in USD at the rate of its own day.
// `rankBy` is the unit the list is ordered and cut by: "copm" (default) or
// "usd". The two lists are not the same set, because the rate differs by day.
export function largestTransfers(transfers, { n = 25, fromDay = null, toDay = null, rates, rankBy = "copm" } = {}) {
  if (!rates?.at) throw new Error("largestTransfers needs the rates (data/rates/cop-usd.csv)");
  if (rankBy !== "copm" && rankBy !== "usd") throw new Error(`largestTransfers: unknown ranking "${rankBy}"`);
  const rows = transfers
    .filter((t) => {
      const day = dayOf(t.ts);
      return (fromDay === null || day >= fromDay) && (toDay === null || day <= toDay);
    })
    .map((t) => ({
      day: dayOf(t.ts),
      ts: t.ts,
      block: t.b,
      index: t.i,
      wei: BigInt(t.v),
      amount: toCOPM(BigInt(t.v)),
      usd: usdAt(toCOPM(BigInt(t.v)), rates.at(dayOf(t.ts)).rate),
      kind: kindOf(t),
      from: t.f,
      to: t.r,
      tx: t.t,
    }));
  const byValue =
    rankBy === "usd"
      ? (a, b) => b.usd - a.usd || (b.wei > a.wei ? 1 : a.wei > b.wei ? -1 : 0)
      : (a, b) => (b.wei > a.wei ? 1 : a.wei > b.wei ? -1 : 0);
  return rows
    .sort((a, b) => byValue(a, b) || a.block - b.block || a.index - b.index)
    .slice(0, n)
    .map(({ wei: _wei, index: _index, ...row }) => row);
}

/* Daily and monthly arrays -------------------------------------------------- */

// Active addresses are counted here, without the zero address, because it is
// the counterparty of every mint and burn, not a participant. (daily.csv keeps
// its own column, which does count it.)
function activeAddresses(transfers, keyOf) {
  const sets = new Map();
  for (const t of transfers) {
    const key = keyOf(t.ts);
    const set = sets.get(key) ?? new Set();
    if (t.f !== ZERO_ADDRESS) set.add(t.f);
    if (t.r !== ZERO_ADDRESS) set.add(t.r);
    sets.set(key, set);
  }
  return sets;
}

function dailyArrays(series, transfers) {
  const active = activeAddresses(transfers, dayOf);
  return {
    day: series.map((r) => r.day),
    transfers: series.map((r) => r.transfers),
    volume: series.map((r) => toCOPM(r.grossVolume)),
    wallet: series.map((r) => toCOPM(r.netVolume)),
    mint: series.map((r) => toCOPM(r.mintVolume)),
    burn: series.map((r) => toCOPM(r.burnVolume)),
    supply: series.map((r) => toCOPM(r.supplyEnd)),
    active: series.map((r) => active.get(r.day)?.size ?? 0),
    approvals: series.map((r) => r.approvals),
    // The same measures in USD, each day at its own rate.
    rate: series.map((r) => r.rate),
    volumeUsd: series.map((r) => r.grossUsd),
    walletUsd: series.map((r) => r.netUsd),
    mintUsd: series.map((r) => r.mintUsd),
    burnUsd: series.map((r) => r.burnUsd),
    supplyUsd: series.map((r) => r.supplyEndUsd),
  };
}

// Same measures by UTC month. Volumes are summed in BigInt from the days, the
// supply is the last day's value, and active addresses are the distinct
// addresses of the whole month (not the sum of the days).
function monthlyArrays(series, transfers) {
  const active = activeAddresses(transfers, monthKey);
  const months = new Map();
  for (const r of series) {
    const key = r.day.slice(0, 7);
    const m = months.get(key) ?? {
      transfers: 0, volume: 0n, wallet: 0n, mint: 0n, burn: 0n, supply: 0n, approvals: 0,
      volumeUsd: [], walletUsd: [], mintUsd: [], burnUsd: [], supplyUsd: 0,
    };
    m.transfers += r.transfers;
    m.volume += r.grossVolume;
    m.wallet += r.netVolume;
    m.mint += r.mintVolume;
    m.burn += r.burnVolume;
    m.supply = r.supplyEnd;
    m.approvals += r.approvals;
    m.volumeUsd.push(r.grossUsd);
    m.walletUsd.push(r.netUsd);
    m.mintUsd.push(r.mintUsd);
    m.burnUsd.push(r.burnUsd);
    m.supplyUsd = r.supplyEndUsd;
    months.set(key, m);
  }
  const keys = [...months.keys()];
  const pick = (name, convert = (x) => x) => keys.map((k) => convert(months.get(k)[name]));
  return {
    month: keys,
    transfers: pick("transfers"),
    volume: pick("volume", toCOPM),
    wallet: pick("wallet", toCOPM),
    mint: pick("mint", toCOPM),
    burn: pick("burn", toCOPM),
    supply: pick("supply", toCOPM),
    active: keys.map((k) => active.get(k)?.size ?? 0),
    approvals: pick("approvals"),
    // USD: a month is the sum of its days' amounts; the supply is the last day's.
    volumeUsd: pick("volumeUsd", sumUsd),
    walletUsd: pick("walletUsd", sumUsd),
    mintUsd: pick("mintUsd", sumUsd),
    burnUsd: pick("burnUsd", sumUsd),
    supplyUsd: pick("supplyUsd"),
  };
}

/* Sections from the holders snapshot and the admin events ------------------- */

const ACTIVITY_DAYS = 30;
const RANKING_SIZE = 10;
const LARGEST_SIZE = 25;

function holdersSection(snapshot) {
  if (!snapshot) throw new Error("holders snapshot missing: run the holders command first");
  const below = snapshot.buckets.find((b) => b.min === "0");
  return {
    count: snapshot.holders,
    addressesEverSeen: snapshot.addressesEverSeen,
    contracts: snapshot.contracts ?? 0,
    top1Pct: snapshot.concentration.top1Pct,
    top5Pct: snapshot.concentration.top5Pct,
    top10Pct: snapshot.concentration.top10Pct,
    below1: below ? below.holders : 0,
    top: snapshot.top.map((h) => ({
      rank: h.rank,
      address: h.address,
      balance: Number(h.balance),
      share: Number(h.sharePct),
      kind: h.kind,
      frozen: h.frozen,
    })),
    // `min` (whole COPM) is the stable key; the page writes the tramo's label
    // itself, per language.
    buckets: snapshot.buckets.map((b) => ({ label: b.label, min: Number(b.min), holders: b.holders, copm: Number(b.copm) })),
  };
}

function governanceSection(snapshot, adminEvents) {
  const members = new Set(Object.values(snapshot.roles).flat());
  return {
    roles: snapshot.roles,
    roleHolders: members.size,
    paused: snapshot.paused,
    implementation: snapshot.implementation,
    frozen: snapshot.frozen,
    events: adminEvents.map((e) => ({ name: e.name, day: dayOf(e.ts), block: e.b, tx: e.t, args: e.args })),
  };
}

function counterparties(transfers) {
  const wallet = transfers.filter((t) => kindOf(t) === "transfer");
  return {
    senders: asNumbers(topN([...group(wallet, (t) => t.f).values()], RANKING_SIZE)),
    receivers: asNumbers(topN([...group(wallet, (t) => t.r).values()], RANKING_SIZE)),
  };
}

/* The file ------------------------------------------------------------------ */

// `state` is state.json, `holders` is holders.json, `transfers` are all rows
// with their exact timestamp.
export function buildDashboard({ chainKey, state, transfers, adminEvents, approvals, holders, rates }) {
  const { series, totals } = buildDailySeries(transfers, approvals.daily, rates);
  if (series.length === 0) throw new Error(`no transfers for ${chainKey}: nothing to show`);

  const daily = dailyArrays(series, transfers);
  const endDay = windowEndDay(state.lastBlockTime);
  const windows = (measure) => {
    const w = compareWindows({ day: daily.day, v: daily[measure] }, endDay, ACTIVITY_DAYS);
    // Sums of cents carry a floating-point tail; the figures are cents.
    return measure.endsWith("Usd") ? { ...w, current: cents(w.current), previous: cents(w.previous) } : w;
  };

  // One list per unit and window: the true top 25 by COPM and the true top 25
  // by USD are different sets, and the page shows the one of the unit chosen.
  const largest = (rankBy, days) =>
    largestTransfers(transfers, {
      n: LARGEST_SIZE,
      fromDay: days === null ? null : addDays(endDay, -(days - 1)),
      toDay: days === null ? null : endDay,
      rates,
      rankBy,
    });
  const largestBy = (rankBy) => ({
    d30: largest(rankBy, 30),
    d90: largest(rankBy, 90),
    d365: largest(rankBy, 365),
    all: largest(rankBy, null),
  });

  const walletWei = totals.gross - totals.mint - totals.burn;
  return {
    schema: 1,
    chain: chainKey,
    checkpoint: {
      block: state.lastBlock,
      time: state.lastBlockTime,
      totalSupply: toCOPM(BigInt(state.totalSupply)),
      // Valued at the rate of the last day of the series, where that supply stands.
      totalSupplyUsd: series.at(-1).supplyEndUsd,
      firstDay: series[0].day,
      lastDay: series.at(-1).day,
    },
    flows: {
      minted: toCOPM(totals.mint),
      burned: toCOPM(totals.burn),
      wallet: toCOPM(walletWei),
      gross: toCOPM(totals.gross),
      turnover: turnover(totals.gross, totals.mint),
      usd: {
        minted: sumUsd(daily.mintUsd),
        burned: sumUsd(daily.burnUsd),
        wallet: sumUsd(daily.walletUsd),
        gross: sumUsd(daily.volumeUsd),
      },
    },
    // The TRM behind every USD figure; `provisionalFrom` is the first day that
    // uses the last known rate because its own is not published yet, and
    // `provisionalDays` how many days do.
    fx: {
      latestDay: series.at(-1).day,
      latest: series.at(-1).rate,
      min: Math.min(...daily.rate),
      max: Math.max(...daily.rate),
      provisionalFrom: series.find((r) => r.provisional)?.day ?? null,
      provisionalDays: series.filter((r) => r.provisional).length,
    },
    supplyPeak: supplyPeak(series),
    activity: {
      endDay,
      days: ACTIVITY_DAYS,
      transfers: windows("transfers"),
      volume: windows("volume"),
      volumeUsd: windows("volumeUsd"),
    },
    daily,
    monthly: monthlyArrays(series, transfers),
    sizes: sizeCounts(transfers).map((count, k) => ({ label: SIZE_BINS[k].label, min: SIZE_BINS[k].min, count })),
    issuance: {
      mint: flowParties(transfers, "mint", RANKING_SIZE),
      burn: flowParties(transfers, "burn", RANKING_SIZE),
    },
    counterparties: counterparties(transfers),
    largest: { copm: largestBy("copm"), usd: largestBy("usd") },
    holders: holdersSection(holders),
    governance: governanceSection(holders, adminEvents),
  };
}
