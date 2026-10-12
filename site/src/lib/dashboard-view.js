// What the dashboard shows for one filter state, as plain numbers: the window,
// the aggregated buckets, the stat tiles, the largest-transfers list and the
// calendar cells. The server renders the first view with these functions and
// the browser re-renders with the same ones, so both always agree.
//
// `chains` is { polygon, celo }, each a (trimmed) dashboard.json. Plain JS, no
// DOM and no Astro imports.
import { addDays, compareWindows, windowSum } from "../../../pipeline/domain/dashboard.js";

export const PERIOD_DAYS = { "30d": 30, "90d": 90, "1y": 365, all: null };
const CHAIN_ORDER = ["polygon", "celo"];
const DAY_MS = 86_400_000;
const MEASURES = ["transfers", "volume", "mint", "burn", "supply"];

export const granularityFor = (period) => (period === "30d" || period === "90d" ? "week" : "month");

export function selectedChains(chains, state) {
  const keys = state.chain === "both" ? CHAIN_ORDER : [state.chain];
  return keys.filter((key) => chains[key]).map((key) => chains[key]);
}

// The period ends on the latest complete day of the chains in view (the
// checkpoint's own day is partial) and goes back `days`; the whole history
// starts on the earliest first day.
export function viewWindow(chains, state) {
  const selected = selectedChains(chains, state);
  const toDay = selected.map((c) => c.activity.endDay).sort().at(-1);
  const days = PERIOD_DAYS[state.period];
  const fromDay = days === null ? selected.map((c) => c.checkpoint.firstDay).sort()[0] : addDays(toDay, -(days - 1));
  return { fromDay, toDay, days };
}

export function sliceDaily(daily, fromDay, toDay) {
  const keep = daily.day.map((day) => day >= fromDay && day <= toDay);
  const out = {};
  for (const [key, values] of Object.entries(daily)) out[key] = values.filter((_, k) => keep[k]);
  return out;
}

// Last known value on or before `day`; zero before the series starts.
export function valueAt(daily, key, day) {
  for (let k = daily.day.length - 1; k >= 0; k--) if (daily.day[k] <= day) return daily[key][k];
  return 0;
}

const mondayOf = (day) => {
  const date = new Date(Date.parse(`${day}T00:00:00Z`));
  return new Date(date.getTime() - ((date.getUTCDay() + 6) % 7) * DAY_MS).toISOString().slice(0, 10);
};

// Flows add up inside a bucket; supply is the last day's value. Weeks start on
// Monday and are named by that Monday; months by "YYYY-MM".
export function bucketize(slice, granularity) {
  const keyOf = granularity === "week" ? mondayOf : (day) => day.slice(0, 7);
  const out = { bucket: [] };
  for (const m of MEASURES) out[m] = [];
  slice.day.forEach((day, k) => {
    const key = keyOf(day);
    if (out.bucket.at(-1) !== key) {
      out.bucket.push(key);
      for (const m of MEASURES) out[m].push(0);
    }
    const last = out.bucket.length - 1;
    for (const m of MEASURES) {
      if (m === "supply") out.supply[last] = slice.supply[k];
      else out[m][last] += slice[m][k];
    }
  });
  return out;
}

const change = (current, previous) => (previous === null || previous === 0 ? null : ((current - previous) / previous) * 100);

// Stat tiles. Volume and transfers compare the window with the one right
// before it. Nothing precedes the whole history, and a window that starts
// before a chain's data has nothing fair to compare with: both report null.
export function tilesFor(chains, state) {
  const selected = selectedChains(chains, state);
  const { fromDay, toDay, days } = viewWindow(chains, state);

  const sum = (measure) => {
    const current = selected.reduce((t, c) => t + windowSum({ day: c.daily.day, v: c.daily[measure] }, toDay, days ?? 36_500), 0);
    const comparable = days !== null && selected.every((c) => addDays(fromDay, -days) >= c.checkpoint.firstDay);
    if (!comparable) return { current, previous: null, changePct: null };
    const previous = selected.reduce((t, c) => t + compareWindows({ day: c.daily.day, v: c.daily[measure] }, toDay, days).previous, 0);
    return { current, previous, changePct: change(current, previous) };
  };

  const supplyNow = selected.reduce((t, c) => t + c.checkpoint.totalSupply, 0);
  const comparable = days !== null && selected.every((c) => addDays(fromDay, -1) >= c.checkpoint.firstDay);
  const supplyBefore = comparable ? selected.reduce((t, c) => t + valueAt(c.daily, "supply", addDays(fromDay, -1)), 0) : null;

  return {
    window: { fromDay, toDay, days },
    supply: { value: supplyNow, previous: supplyBefore, changePct: change(supplyNow, supplyBefore) },
    volume: sum("volume"),
    transfers: sum("transfers"),
    holders: selected.reduce((t, c) => t + c.holders.count, 0),
    blocks: selected.map((c) => ({ chain: c.key, block: c.checkpoint.block, time: c.checkpoint.time })),
  };
}

const LARGEST_KEY = { "30d": "d30", "90d": "d90", "1y": "d365", all: "all" };

export function largestRows(chains, state, n = 25) {
  return selectedChains(chains, state)
    .flatMap((c) => c.largest[LARGEST_KEY[state.period]].map((row) => ({ ...row, chain: c.key })))
    .sort((a, b) => b.amount - a.amount || CHAIN_ORDER.indexOf(a.chain) - CHAIN_ORDER.indexOf(b.chain) || a.block - b.block)
    .slice(0, n);
}

// One cell per day for the calendar map: columns are weeks counted from the
// Monday of the first day, rows are weekdays (0 = Monday).
export function heatCells(slice) {
  if (slice.day.length === 0) return [];
  const start = Date.parse(`${mondayOf(slice.day[0])}T00:00:00Z`);
  return slice.day.map((day, k) => {
    const offset = Math.round((Date.parse(`${day}T00:00:00Z`) - start) / DAY_MS);
    return { day, week: Math.floor(offset / 7), weekday: offset % 7, transfers: slice.transfers[k] };
  });
}

// Gross volume divided by what the period minted. Over the whole history this
// is the turnover of each minted peso; over a short window it only means that
// when the window minted a material share of what it moved. A period with
// almost no mint (Celo often has none for weeks) would print ratios in the
// hundreds that describe old money moving, not turnover, so those are omitted.
const MAX_PERIOD_TURNOVER = 100;

export function periodTurnover({ gross, minted }) {
  if (!(minted > 0) || !(gross > 0)) return null;
  const ratio = gross / minted;
  return ratio > MAX_PERIOD_TURNOVER ? null : ratio;
}
