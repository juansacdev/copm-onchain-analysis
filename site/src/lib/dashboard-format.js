// How the dashboard writes amounts, changes and times. Built on the shared
// formatter, so the page, the Markdown reports and the browser agree on every
// number. Plain JS, no DOM and no Astro imports.
import { formatCopmCompact, formatCopmExact, formatDate, formatDecimal, formatInt, formatUsd, formatUsdFull } from "./format.js";
import { interpolate } from "./template.js";

// Compact: tiles and axes. COPM keeps its name; USD is at the fixed rate.
export function amountCompact(copm, unit, lang, rate) {
  return unit === "usd" ? formatUsd(copm / rate, lang, "short", { trim: true }) : `${formatCopmCompact(copm, lang)} COPM`;
}

// Whole units in full: tables.
export function amountFull(copm, unit, lang, rate) {
  return unit === "usd"
    ? formatUsdFull(Math.round(copm / rate), lang)
    : `${formatInt(Math.round(copm), lang)} COPM`;
}

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
export const utcDateTime = (seconds) => `${new Date(seconds * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC`;

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
