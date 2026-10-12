// How the dashboard writes amounts, changes and times. Built on the shared
// formatter, so the page, the Markdown reports and the browser agree on every
// number. Plain JS, no DOM and no Astro imports.
import { formatCopmCompact, formatCopmExact, formatDate, formatDecimal, formatInt, formatMonthShort, formatUsd, formatUsdFull } from "./format.js";
import { interpolate } from "./template.js";

// Amounts arrive already in the chosen unit: the pipeline values every day at
// that day's rate, and the page never converts. Compact: tiles and axes. COPM
// keeps its name.
export function amountCompact(value, unit, lang) {
  return unit === "usd" ? formatUsd(value, lang, "short", { trim: true }) : `${formatCopmCompact(value, lang)} COPM`;
}

// Whole units in full: tables.
export function amountFull(value, unit, lang) {
  return unit === "usd" ? formatUsdFull(Math.round(value), lang) : `${formatInt(Math.round(value), lang)} COPM`;
}

// A row of the largest-transfers list in the chosen unit: its own COPM amount,
// or its USD at the rate of the day it happened.
export const rowAmount = (row, unit) => (unit === "usd" ? row.usd : row.amount);

const PRECISION = 0.05;

// "+5.6%" / "-85,6 %"; null when there is nothing to compare with.
export function changeText(pct, lang) {
  if (pct === null || pct === undefined) return null;
  const body = formatDecimal(Math.abs(pct), 1, lang);
  const sign = pct >= PRECISION ? "+" : pct <= -PRECISION ? "-" : "";
  return `${sign}${body}${lang === "es" ? " %" : "%"}`;
}

// Neutral ink: the arrow states direction, never good or bad.
export function arrowFor(pct) {
  if (pct === null || pct === undefined) return "";
  return pct >= PRECISION ? "↑" : pct <= -PRECISION ? "↓" : "→";
}

// Unix seconds to "2026-10-11 23:22 UTC", from the number alone.
// The change line of a stat tile. Without an earlier period to compare with
// (the "all" view) there is nothing to say, so the line is empty and the page
// hides it instead of printing a placeholder.
export function tileDelta(change, key, { t, lang, days }) {
  const text = changeText(change, lang);
  if (text === null) return "";
  return `${arrowFor(change)} ${interpolate(t[key], { change: text, n: days ?? "" })}`;
}

export const utcDateTime = (seconds) => `${new Date(seconds * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC`;

// A day in few characters: "7 may 2026" / "May 7, 2026".
export function shortDate(iso, lang) {
  const [year, month, day] = iso.split("-");
  const named = formatMonthShort(`${year}-${month}`, lang);
  return lang === "es" ? `${Number(day)} ${named}` : `${named.split(" ")[0]} ${Number(day)}, ${year}`;
}

// An argument of an admin event as text. BurnedFrozen reports its amount in
// raw wei; the page shows COPM, like every other amount.
export function eventArgText(eventName, argName, value, lang) {
  if (eventName === "BurnedFrozen" && argName === "amount") return `${formatCopmExact(BigInt(value), lang)} COPM`;
  return String(value);
}

// The small caption under each tile. The server and the browser both write
// them from here, so a filter change keeps the date and the contract count in
// step with the chains in view. `tiles` is the result of tilesFor().
export function tileNotes({ tiles, t, lang }) {
  const latest = Math.max(...tiles.blocks.map((b) => b.time));
  const day = new Date(latest * 1000).toISOString().slice(0, 10);
  return {
    supply: interpolate(t.tiles.supply.note, { date: formatDate(day, lang) }),
    volume: t.tiles.volume.note,
    transfers: t.tiles.transfers.note,
    holders: interpolate(t.tiles.holders.note, { contracts: formatInt(tiles.contracts, lang) }),
    block: "",
  };
}

// The line under the headline cards: where the dollar rate comes from and the
// latest rate. When trailing days still use the last known rate (their own is
// not published yet), it also says how many and from which day; with none,
// nothing extra is written. `t` is the dashboard dictionary, `fx` data.fx.
export function rateLine({ fx, t, lang }) {
  const base = interpolate(t.basis.rate, { rate: formatDecimal(fx.latest, 2, lang, { trim: true }), date: formatDate(fx.latestDay, lang) });
  if (!(fx.provisionalDays > 0)) return base;
  const words = fx.provisionalDays === 1 ? t.basis.provisionalOne : t.basis.provisional;
  return `${base} ${interpolate(words, { count: formatInt(fx.provisionalDays, lang), date: formatDate(fx.provisionalFrom, lang) })}`;
}
