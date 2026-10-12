// Figures for the Markdown reports.
//
// A report never contains a number typed by hand: it contains a marker,
//   <!-- copm:polygon.transfers -->241,858<!-- /copm -->
// and the text between the tags is rewritten from the data files. This module
// is pure. It turns parsed data into a flat map key -> figure, formats a
// figure for a locale, and rewrites the markers of a text.

import {
  LOCALES,
  formatCopmCompact,
  formatCopmExact,
  formatDecimal,
  formatUsd,
  formatUsdFull,
} from "./format.js";
import { sumUsd } from "./rates.js";

const MONTHS = {
  en: [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ],
  es: [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ],
};

// Figure constructors. A figure is { kind, value, digits? }; the value keeps
// its precision (BigInt for raw 18-decimal amounts) until formatFigure.
export const fig = {
  int: (value) => ({ kind: "int", value }),
  dec: (value, digits) => ({ kind: "dec", value, digits }),
  pct: (value, digits = 1) => ({ kind: "pct", value, digits }),
  usd: (value) => ({ kind: "usd", value }),
  usdFull: (value) => ({ kind: "usdFull", value }),
  // number: whole COPM; bigint: raw amount in wei (18 decimals)
  copm: (value) => ({ kind: "copm", value }),
  copmFull: (value) => ({ kind: "copmFull", value }),
  date: (value) => ({ kind: "date", value }),
  month: (value) => ({ kind: "month", value }),
  monthShort: (value) => ({ kind: "monthShort", value }),
};

// Fixed decimals, no trailing zeros, locale separators.
const number = (n, digits, locale) => formatDecimal(n, digits, locale, { trim: true });

const copmToNumber = (value) =>
  typeof value === "bigint" ? Number(value / 10n ** 12n) / 1e6 : value;

// Reports write dollars with B/M/K in English and words in Spanish, without
// zero decimals.
const usdCompact = (v, locale) => formatUsd(v, locale, locale === "es" ? "long" : "short", { trim: true });

const copmCompact = (raw, locale) => formatCopmCompact(copmToNumber(raw), locale);

const FORMATTERS = {
  int: (v, l) => number(v, 0, l),
  dec: (v, l, f) => number(v, f.digits, l),
  pct: (v, l, f) => `${number(v, f.digits, l)}${l === "es" ? " %" : "%"}`,
  usd: usdCompact,
  usdFull: formatUsdFull,
  copm: copmCompact,
  copmFull: (v, l) => (typeof v === "bigint" ? formatCopmExact(v, l) : formatDecimal(v, 2, l)),
  date: (v) => v,
  month: (v, l) => {
    const [year, month] = v.split("-");
    return `${MONTHS[l][Number(month) - 1]} ${year}`;
  },
  monthShort: (v, l) => {
    const [year, month] = v.split("-");
    const name = MONTHS[l][Number(month) - 1].slice(0, 3);
    return `${l === "en" ? name : name.toLowerCase()} ${year}`;
  },
};

export function formatFigure(figure, locale) {
  if (!LOCALES[locale]) throw new Error(`unknown locale "${locale}"`);
  const format = FORMATTERS[figure.kind];
  if (!format) throw new Error(`unknown figure kind "${figure.kind}"`);
  return format(figure.value, locale, figure);
}

export function getFigure(figures, key) {
  if (!Object.hasOwn(figures, key)) throw new Error(`unknown figure "${key}"`);
  return figures[key];
}

// An opening tag carries the key (group 1); the closing tag has no groups.
const TAG = /<!-- copm:([^\s>]*) -->|<!-- \/copm -->/g;
const lineOf = (text, index) => text.slice(0, index).split("\n").length;

// Any HTML comment that mentions a marker but is not exactly one is a typo
// (no spaces, two spaces, split across lines, never terminated). Left alone it
// would be skipped, its figure would go stale and `reports --check` would stay
// green, so it is an error instead.
const COMMENT = /<!--[\s\S]*?(?:-->|$)/g;
const EXACT_MARKER = /^(?:<!-- copm:[^\s>]* -->|<!-- \/copm -->)$/;

function assertNoMalformedMarkers(text) {
  for (const comment of text.matchAll(COMMENT)) {
    if (!/copm:|\/copm/.test(comment[0]) || EXACT_MARKER.test(comment[0])) continue;
    const shown = comment[0].split("\n")[0].slice(0, 60);
    throw new Error(
      `malformed marker "${shown}" at line ${lineOf(text, comment.index)}: ` +
        'write exactly "<!-- copm:KEY -->" and "<!-- /copm -->"'
    );
  }
}

// Replaces the content of every marker with the figure formatted for the
// locale. Throws on an unknown key, a marker that is never closed (or that
// contains another opening tag), a closing tag that closes nothing and any
// comment that looks like a marker but does not follow the grammar.
// `changes` lists the markers whose content was different.
export function rewriteMarkers(text, figures, locale) {
  assertNoMalformedMarkers(text);
  const changes = [];
  let out = "";
  let cursor = 0;
  let open = null;

  for (const tag of text.matchAll(TAG)) {
    const line = lineOf(text, tag.index);
    if (tag[1] !== undefined) {
      if (open) throw new Error(`unclosed marker "${open.key}" at line ${open.line}`);
      open = { key: tag[1], line, start: tag.index + tag[0].length };
      continue;
    }
    if (!open) throw new Error(`stray closing tag at line ${line}`);

    let after;
    try {
      after = formatFigure(getFigure(figures, open.key), locale);
    } catch (err) {
      throw new Error(`${err.message} at line ${open.line}`);
    }
    const before = text.slice(open.start, tag.index);
    if (before !== after) changes.push({ key: open.key, before, after });
    out += text.slice(cursor, open.start) + after;
    cursor = tag.index;
    open = null;
  }
  if (open) throw new Error(`unclosed marker "${open.key}" at line ${open.line}`);

  return { text: out + text.slice(cursor), changes };
}

const EVENT_NAMES = [
  "Transfer",
  "Approval",
  "Frozen",
  "Thawed",
  "BurnedFrozen",
  "Paused",
  "Unpaused",
  "RoleGranted",
  "RoleRevoked",
  "RoleAdminChanged",
  "Upgraded",
  "Initialized",
  "AdminChanged",
  "BeaconUpgraded",
  "EIP712DomainChanged",
];
const RANKING_SIZE = 10;
// Turnover is measured over a 30-day window; a year is annualized by 365 / 30.
const TURNOVER_WINDOW_DAYS = 30;
const DAYS_PER_YEAR = 365;

const sum = (rows, pick) => rows.reduce((total, r) => total + pick(r), 0);
const weiToCopm = (wei) => Number(wei / 10n ** 12n) / 1e6;

function ranking(rows, by) {
  return [...rows].sort((a, b) => b[by] - a[by] || (a.day < b.day ? -1 : 1)).slice(0, RANKING_SIZE);
}

function monthlyTotals(daily) {
  const months = new Map();
  for (const r of daily) {
    const key = r.day.slice(0, 7);
    const acc = months.get(key) ?? { key, grossCOPM: 0, grossUSD: 0, transfers: 0 };
    acc.grossCOPM += r.grossCOPM;
    acc.grossUSD = sumUsd([acc.grossUSD, r.grossUSD]);
    acc.transfers += r.transfers;
    months.set(key, acc);
  }
  return [...months.values()];
}

function chainFigures(p, d) {
  const { summary, state, holders, manifest, validation } = d;
  const totals = summary.totals;
  const peaks = summary.peaks;
  const f = {};
  const set = (key, figure) => (f[`${p}.${key}`] = figure);

  const minted = BigInt(state.minted);
  const burned = BigInt(state.burned);
  const supply = BigInt(state.totalSupply);

  // checkpoint and contract
  set("transfers", fig.int(state.transfers));
  set("approvals", fig.int(state.approvals));
  set("adminEvents", fig.int(state.adminEvents));
  set("checkpointBlock", fig.int(state.lastBlock));
  set("checkpointDate", fig.date(new Date(state.lastBlockTime * 1000).toISOString().slice(0, 10)));
  set("deployDate", fig.date(manifest.deployTimestamp.slice(0, 10)));
  set("deployBlock", fig.int(Number(manifest.deployBlock)));
  set("firstDay", fig.date(summary.range.firstDay));
  set("lastDay", fig.date(summary.range.lastDay));
  set("totalDays", fig.int(summary.range.totalDays));
  set("years", fig.dec(summary.range.totalDays / 365.25, 1));

  // events by name: Transfer and Approval are counted by the scan, the rest
  // are the stored admin events
  const adminCounts = new Map();
  for (const e of d.adminEvents) adminCounts.set(e.name, (adminCounts.get(e.name) ?? 0) + 1);
  for (const name of EVENT_NAMES) {
    const count =
      name === "Transfer" ? state.transfers : name === "Approval" ? state.approvals : adminCounts.get(name) ?? 0;
    set(`events.${name}`, fig.int(count));
  }

  // holders snapshot
  set("holders", fig.int(holders.holders));
  set("addressesEverSeen", fig.int(holders.addressesEverSeen));
  set("contracts", fig.int(holders.contracts));
  set("frozenAccounts", fig.int(holders.frozen.length));
  set("top1Pct", fig.pct(holders.concentration.top1Pct, 1));
  set("top10Pct", fig.pct(holders.concentration.top10Pct, 1));
  set("roleHolders", fig.int(new Set(Object.values(holders.roles).flat()).size));

  // supply, exact from the checkpoint
  set("supply", fig.copmFull(supply));
  set("supplyCompact", fig.copm(supply));
  // USD figures are sums of daily amounts, each day at its own rate (aggregate).
  set("supplyUsd", fig.usd(totals.currentSupplyUSD));
  set("minted", fig.copm(minted));
  set("mintedUsd", fig.usd(totals.totalMintedUSD));
  set("burned", fig.copm(burned));
  set("burnedUsd", fig.usd(totals.totalBurnedUSD));
  set("burnedPct", fig.pct(minted === 0n ? 0 : Number((burned * 10000n) / minted) / 100, 1));

  // volume, averages, peaks
  set("grossVolumeCopm", fig.copm(totals.grossVolumeCOPM));
  set("grossVolumeUsd", fig.usd(totals.grossVolumeUSD));
  set("netVolumeCopm", fig.copm(totals.netVolumeCOPM));
  set("netVolumeUsd", fig.usd(totals.netVolumeUSD));
  set("avgDailyTransfers", fig.int(Math.round(summary.averages.avgDailyTransfers)));
  set("avgDailyGrossUsd", fig.usd(summary.averages.avgDailyGrossVolumeUSD));
  set("avgTicketUsd", fig.usdFull(totals.grossVolumeUSD / totals.transferEvents));
  set("peakTxDay", fig.date(peaks.maxTransfersInOneDay.day));
  set("peakTxCount", fig.int(peaks.maxTransfersInOneDay.count));
  set("peakVolumeDay", fig.date(peaks.maxGrossVolumeInOneDay.day));
  set("peakVolumeUsd", fig.usd(peaks.maxGrossVolumeInOneDay.usd));
  set("peakSupplyDay", fig.date(peaks.maxSupplyEndOfDay.day));
  set("peakSupplyCopm", fig.copm(peaks.maxSupplyEndOfDay.copm));
  set("peakSupplyUsd", fig.usd(peaks.maxSupplyEndOfDay.usd));

  // the daily series
  const daily = d.daily;
  const months = monthlyTotals(daily);
  const peakVolumeMonth = months.reduce((a, b) => (b.grossUSD > a.grossUSD ? b : a));
  const peakTxMonth = months.reduce((a, b) => (b.transfers > a.transfers ? b : a));
  const active = daily.filter((r) => r.transfers > 0).length;
  const above100 = daily.find((r) => r.transfers > 100);
  if (above100) set("firstDayAbove100", fig.date(above100.day));
  set("activeDays", fig.int(active));
  set("activeDaysPct", fig.pct((active / daily.length) * 100, 0));
  set("peakMonth", fig.month(peakVolumeMonth.key));
  set("peakMonthShort", fig.monthShort(peakVolumeMonth.key));
  set("peakMonthUsd", fig.usd(peakVolumeMonth.grossUSD));
  set("peakMonthTransfers", fig.int(peakVolumeMonth.transfers));
  set("peakTxMonth", fig.month(peakTxMonth.key));
  set("peakTxMonthShort", fig.monthShort(peakTxMonth.key));
  set("peakTxMonthCount", fig.int(peakTxMonth.transfers));
  for (const m of months) {
    set(`month.${m.key}.usd`, fig.usd(m.grossUSD));
    set(`month.${m.key}.transfers`, fig.int(m.transfers));
  }

  const last30 = daily.slice(-TURNOVER_WINDOW_DAYS);
  const last90 = daily.slice(-90);
  const gross30 = sum(last30, (r) => r.grossCOPM);
  const avgSupply30 = sum(last30, (r) => r.supplyEnd) / last30.length;
  const monthlyTurnover = avgSupply30 === 0 ? 0 : gross30 / avgSupply30;
  set("last30GrossUsd", fig.usd(sumUsd(last30.map((r) => r.grossUSD))));
  set("last90GrossUsd", fig.usd(sumUsd(last90.map((r) => r.grossUSD))));
  set("last30GrossCopm", fig.copm(gross30));
  set("last30AvgSupply", fig.copm(avgSupply30));
  set("turnoverMonthly", fig.dec(monthlyTurnover, 1));
  set("turnoverYearly", fig.int(Math.round((monthlyTurnover * DAYS_PER_YEAR) / TURNOVER_WINDOW_DAYS)));

  ranking(daily, "transfers").forEach((r, i) => {
    set(`topTx.${i + 1}.day`, fig.date(r.day));
    set(`topTx.${i + 1}.transfers`, fig.int(r.transfers));
    set(`topTx.${i + 1}.usd`, fig.usd(r.grossUSD));
  });
  ranking(daily, "grossUSD").forEach((r, i) => {
    set(`topVol.${i + 1}.day`, fig.date(r.day));
    set(`topVol.${i + 1}.usd`, fig.usd(r.grossUSD));
    set(`topVol.${i + 1}.transfers`, fig.int(r.transfers));
  });

  // validation
  set("checksPassed", fig.int(validation.passed));
  set("checksTotal", fig.int(validation.checks.length));
  set("validatedDate", fig.date(validation.validatedAt.slice(0, 10)));

  return f;
}

// data: { chains: { polygon: ChainData, celo: ChainData } } where
// ChainData holds the parsed summary, state, holders, manifest, validation,
// adminEvents (array) and daily (rows of chartlib's parseDailyCsv).
// Returns a flat object: key -> figure. Pure.
export function buildFigures({ chains }) {
  const figures = {};
  for (const [name, d] of Object.entries(chains)) Object.assign(figures, chainFigures(name, d));

  // The TRM behind every USD figure: the rate on the latest day any series
  // reaches, and the lowest and highest over the token's life.
  const fxs = Object.values(chains).map((d) => d.summary.fx);
  const latest = fxs.reduce((a, b) => (b.latestDay > a.latestDay ? b : a));
  figures["fx.latestRate"] = fig.dec(latest.latestCopPerUsd, 2);
  figures["fx.latestDate"] = fig.date(latest.latestDay);
  figures["fx.minRate"] = fig.dec(Math.min(...fxs.map((x) => x.minCopPerUsd)), 2);
  figures["fx.maxRate"] = fig.dec(Math.max(...fxs.map((x) => x.maxCopPerUsd)), 2);

  const all = Object.values(chains);
  const total = (pick) => sum(all, pick);
  const supply = all.reduce((acc, d) => acc + BigInt(d.state.totalSupply), 0n);
  const c = (key, figure) => (figures[`combined.${key}`] = figure);
  c("transfers", fig.int(total((d) => d.state.transfers)));
  c("approvals", fig.int(total((d) => d.state.approvals)));
  c("holders", fig.int(total((d) => d.holders.holders)));
  c("grossVolumeUsd", fig.usd(total((d) => d.summary.totals.grossVolumeUSD)));
  c("netVolumeUsd", fig.usd(total((d) => d.summary.totals.netVolumeUSD)));
  c("supply", fig.copm(supply));
  c("supplyUsd", fig.usd(sumUsd(all.map((d) => d.summary.totals.currentSupplyUSD))));
  c("checksPassed", fig.int(total((d) => d.validation.passed)));
  c("checksTotal", fig.int(total((d) => d.validation.checks.length)));
  return figures;
}
