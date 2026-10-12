// Figures for the Markdown reports.
//
// A report never contains a number typed by hand: it contains a marker,
//   <!-- copm:polygon.transfers -->241,858<!-- /copm -->
// and the text between the tags is rewritten from the data files. This module
// is pure. It turns parsed data into a flat map key -> figure, formats a
// figure for a locale, and rewrites the markers of a text.

const LOCALES = {
  en: { group: ",", decimal: "." },
  es: { group: ".", decimal: "," },
};

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

const WEI = 10n ** 18n;

const groupDigits = (digits, sep) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, sep);

// Fixed decimals, no trailing zeros, locale separators. Works on the sign
// separately so that -0.4 never prints as "-0".
function number(n, digits, locale) {
  const { group, decimal } = LOCALES[locale];
  const fixed = Math.abs(n).toFixed(digits);
  const [whole, frac = ""] = fixed.split(".");
  const trimmed = frac.replace(/0+$/, "");
  const sign = n < 0 && Number(fixed) !== 0 ? "-" : "";
  return sign + groupDigits(whole, group) + (trimmed ? decimal + trimmed : "");
}

const copmToNumber = (value) =>
  typeof value === "bigint" ? Number(value / 10n ** 12n) / 1e6 : value;

// Exact, rounded half up to 2 decimals, from a raw 18-decimal amount.
function copmExact(wei, locale) {
  const { group, decimal } = LOCALES[locale];
  const negative = wei < 0n;
  const abs = negative ? -wei : wei;
  const hundredths = (abs + 5n * 10n ** 15n) / 10n ** 16n;
  const whole = hundredths / 100n;
  const cents = hundredths % 100n;
  return (
    (negative ? "-" : "") +
    groupDigits(whole.toString(), group) +
    decimal +
    cents.toString().padStart(2, "0")
  );
}

// Picks the largest unit that fits |v|, then checks the rounded text: a value
// that rounds up to 1,000 of its unit ("1,000K") belongs to the next unit up.
// `units` is ordered from the largest; the last one is the bare number.
// Returns the sign separately so a currency symbol can follow it.
function compact(v, units) {
  const a = Math.abs(v);
  let i = units.findIndex((u) => a >= u.min);
  const rounded = (k) => Number((a / units[k].div).toFixed(units[k].digits(a)));
  while (i > 0 && rounded(i) * units[i].div >= units[i - 1].min) i--;
  const body = number(a / units[i].div, units[i].digits(a), units[i].locale);
  return { sign: v < 0 && body !== "0" ? "-" : "", body: body + units[i].suffix };
}

const unit = (locale, min, digits, suffix, div = min) => ({
  locale,
  min,
  div,
  digits: typeof digits === "function" ? digits : () => digits,
  suffix,
});
const bare = (locale) => unit(locale, 0, 0, "", 1);

const USD_UNITS = {
  en: [
    unit("en", 1e9, 2, "B"),
    unit("en", 1e6, 1, "M"),
    unit("en", 1e3, (a) => (a < 1e5 ? 1 : 0), "K"),
    bare("en"),
  ],
  es: [
    unit("es", 1e6, (a) => (a < 1e9 ? 1 : 0), " millones"),
    unit("es", 1e3, (a) => (a < 1e5 ? 1 : 0), " mil"),
    bare("es"),
  ],
};

function usdCompact(v, locale) {
  const { sign, body } = compact(v, USD_UNITS[locale]);
  return `${sign}${locale === "en" ? "$" : "US$"}${body}`;
}

// Whole-COPM number with exactly 2 decimals.
const fixed2 = (v, locale) => {
  const [whole, frac] = Math.abs(v).toFixed(2).split(".");
  const { group, decimal } = LOCALES[locale];
  return (v < 0 ? "-" : "") + groupDigits(whole, group) + decimal + frac;
};

const COPM_UNITS = {
  en: [
    unit("en", 1e12, 3, "T"),
    unit("en", 1e9, 2, "B"),
    unit("en", 1e6, 1, "M"),
    bare("en"),
  ],
  es: [
    unit("es", 1e12, 3, " billones"),
    unit("es", 1e6, (a) => (a < 1e9 ? 1 : 0), " millones"),
    bare("es"),
  ],
};

function copmCompact(raw, locale) {
  const { sign, body } = compact(copmToNumber(raw), COPM_UNITS[locale]);
  return sign + body;
}

const FORMATTERS = {
  int: (v, l) => number(v, 0, l),
  dec: (v, l, f) => number(v, f.digits, l),
  pct: (v, l, f) => `${number(v, f.digits, l)}${l === "es" ? " %" : "%"}`,
  usd: usdCompact,
  usdFull: (v, l) => `${l === "es" ? "US$" : "$"}${number(v, 0, l)}`,
  copm: copmCompact,
  copmFull: (v, l) =>
    typeof v === "bigint" ? copmExact(v, l) : fixed2(v, l),
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

const sum = (rows, pick) => rows.reduce((total, r) => total + pick(r), 0);
const weiToCopm = (wei) => Number(wei / 10n ** 12n) / 1e6;

function ranking(rows, by) {
  return [...rows].sort((a, b) => b[by] - a[by] || (a.day < b.day ? -1 : 1)).slice(0, RANKING_SIZE);
}

function monthlyTotals(daily) {
  const months = new Map();
  for (const r of daily) {
    const key = r.day.slice(0, 7);
    const acc = months.get(key) ?? { key, grossCOPM: 0, transfers: 0 };
    acc.grossCOPM += r.grossCOPM;
    acc.transfers += r.transfers;
    months.set(key, acc);
  }
  return [...months.values()];
}

function chainFigures(p, d, copPerUsd) {
  const { summary, state, holders, manifest, validation } = d;
  const totals = summary.totals;
  const peaks = summary.peaks;
  const f = {};
  const set = (key, figure) => (f[`${p}.${key}`] = figure);
  const usdOf = (copm) => copm / copPerUsd;

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
  set("supplyUsd", fig.usd(usdOf(weiToCopm(supply))));
  set("minted", fig.copm(minted));
  set("mintedUsd", fig.usd(usdOf(weiToCopm(minted))));
  set("burned", fig.copm(burned));
  set("burnedUsd", fig.usd(usdOf(weiToCopm(burned))));
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
  const peakVolumeMonth = months.reduce((a, b) => (b.grossCOPM > a.grossCOPM ? b : a));
  const peakTxMonth = months.reduce((a, b) => (b.transfers > a.transfers ? b : a));
  const active = daily.filter((r) => r.transfers > 0).length;
  const above100 = daily.find((r) => r.transfers > 100);
  if (above100) set("firstDayAbove100", fig.date(above100.day));
  set("activeDays", fig.int(active));
  set("activeDaysPct", fig.pct((active / daily.length) * 100, 0));
  set("peakMonth", fig.month(peakVolumeMonth.key));
  set("peakMonthShort", fig.monthShort(peakVolumeMonth.key));
  set("peakMonthUsd", fig.usd(usdOf(peakVolumeMonth.grossCOPM)));
  set("peakMonthTransfers", fig.int(peakVolumeMonth.transfers));
  set("peakTxMonth", fig.month(peakTxMonth.key));
  set("peakTxMonthShort", fig.monthShort(peakTxMonth.key));
  set("peakTxMonthCount", fig.int(peakTxMonth.transfers));
  for (const m of months) {
    set(`month.${m.key}.usd`, fig.usd(usdOf(m.grossCOPM)));
    set(`month.${m.key}.transfers`, fig.int(m.transfers));
  }

  const last30 = daily.slice(-30);
  const last90 = daily.slice(-90);
  const gross30 = sum(last30, (r) => r.grossCOPM);
  const avgSupply30 = sum(last30, (r) => r.supplyEnd) / last30.length;
  const monthlyTurnover = avgSupply30 === 0 ? 0 : gross30 / avgSupply30;
  set("last30GrossUsd", fig.usd(usdOf(gross30)));
  set("last90GrossUsd", fig.usd(usdOf(sum(last90, (r) => r.grossCOPM))));
  set("last30GrossCopm", fig.copm(gross30));
  set("last30AvgSupply", fig.copm(avgSupply30));
  set("turnoverMonthly", fig.dec(monthlyTurnover, 1));
  set("turnoverYearly", fig.int(Math.round(monthlyTurnover * 12)));

  ranking(daily, "transfers").forEach((r, i) => {
    set(`topTx.${i + 1}.day`, fig.date(r.day));
    set(`topTx.${i + 1}.transfers`, fig.int(r.transfers));
    set(`topTx.${i + 1}.usd`, fig.usd(usdOf(r.grossCOPM)));
  });
  ranking(daily, "grossCOPM").forEach((r, i) => {
    set(`topVol.${i + 1}.day`, fig.date(r.day));
    set(`topVol.${i + 1}.usd`, fig.usd(usdOf(r.grossCOPM)));
    set(`topVol.${i + 1}.transfers`, fig.int(r.transfers));
  });

  // validation
  set("checksPassed", fig.int(validation.passed));
  set("checksTotal", fig.int(validation.checks.length));
  set("validatedDate", fig.date(validation.validatedAt.slice(0, 10)));

  return f;
}

// data: { copPerUsd, chains: { polygon: ChainData, celo: ChainData } } where
// ChainData holds the parsed summary, state, holders, manifest, validation,
// adminEvents (array) and daily (rows of chartlib's parseDailyCsv).
// Returns a flat object: key -> figure. Pure.
export function buildFigures({ copPerUsd, chains }) {
  const figures = { "fx.copPerUsd": fig.int(copPerUsd) };
  for (const [name, d] of Object.entries(chains)) Object.assign(figures, chainFigures(name, d, copPerUsd));

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
  c("supplyUsd", fig.usd(weiToCopm(supply) / copPerUsd));
  c("checksPassed", fig.int(total((d) => d.validation.passed)));
  c("checksTotal", fig.int(total((d) => d.validation.checks.length)));
  return figures;
}
