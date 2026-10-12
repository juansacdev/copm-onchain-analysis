// The COP per USD rate of each day: the TRM (Tasa Representativa del Mercado),
// the official daily rate certified by the Superintendencia Financiera de
// Colombia and published as open data (datos.gov.co, Socrata dataset
// 32sa-8pi3). 1 COPM is treated as 1 COP, so usd = copm / rate(day).
//
// Pure logic only: parsing the source rows, expanding validity ranges into one
// row per day, the CSV form, and the lookup of a day. Fetching lives in
// adapters/rates.js and file handling in steps/rates.js.

const DAY_MS = 86_400_000;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const isDay = (text) => typeof text === "string" && DAY.test(text) && !Number.isNaN(Date.parse(`${text}T00:00:00Z`));
const addDays = (day, delta) => new Date(Date.parse(`${day}T00:00:00Z`) + delta * DAY_MS).toISOString().slice(0, 10);
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

// A rate is a positive finite number. Socrata sends it as a string.
const parseRate = (text) => {
  const value = typeof text === "number" ? text : /^\d+(\.\d+)?$/.test(String(text).trim()) ? Number(text) : NaN;
  return Number.isFinite(value) && value > 0 ? value : null;
};

/* The source ---------------------------------------------------------------- */

// Rows of the dataset -> ranges [{ from, to, value }] of inclusive calendar
// days, ordered by start. A row the code cannot read exactly is an error: a
// rate that is guessed is worse than a run that stops.
export function parseTrmRows(rows) {
  if (!Array.isArray(rows)) throw new Error("TRM source: expected an array of rows");
  const ranges = rows.map((r, k) => {
    const value = parseRate(r?.valor);
    if (value === null) throw new Error(`TRM source row ${k + 1}: valor "${r?.valor}" is not a positive number`);
    const from = String(r?.vigenciadesde ?? "").slice(0, 10);
    const to = String(r?.vigenciahasta ?? "").slice(0, 10);
    if (!isDay(from)) throw new Error(`TRM source row ${k + 1}: vigenciadesde "${r?.vigenciadesde}" is not a date`);
    if (!isDay(to)) throw new Error(`TRM source row ${k + 1}: vigenciahasta "${r?.vigenciahasta}" is not a date`);
    if (to < from) throw new Error(`TRM source row ${k + 1}: vigenciahasta ${to} is before vigenciadesde ${from}`);
    return { from, to, value };
  });
  return ranges.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.to < b.to ? -1 : a.to > b.to ? 1 : 0));
}

// Ranges -> one { day, rate } per day from `fromDay` to the end of the
// last range. Ranges that end before `fromDay` are not needed; the one that
// covers it is clipped. A gap between ranges is an error, and so is an overlap
// that disagrees on the value (an overlap that agrees is harmless).
export function expandRanges(ranges, { fromDay }) {
  if (ranges.length === 0) throw new Error("no rates: the source returned no ranges");
  const rows = [];
  let covered = null; // last day already written
  let rate = null;

  for (const range of ranges) {
    if (range.to < fromDay) continue;
    const start = rows.length === 0 ? fromDay : addDays(covered, 1);
    if (rows.length === 0 && range.from > fromDay) {
      throw new Error(`no rate covers ${fromDay}: the first range available starts on ${range.from}`);
    }
    if (rows.length > 0) {
      if (range.from > start) {
        const last = addDays(range.from, -1);
        throw new Error(`gap in the rates: no range for ${start}${last > start ? ` to ${last}` : ""}`);
      }
      if (range.from <= covered && range.value !== rate) {
        throw new Error(
          `overlap in the rates: ${range.from} to ${(covered < range.to ? covered : range.to)} ` +
            `is covered by ${rate} and by ${range.value}`,
        );
      }
    }
    if (range.to <= (covered ?? "")) continue; // fully inside what is written
    for (let day = start; day <= range.to; day = addDays(day, 1)) rows.push({ day, rate: range.value });
    covered = range.to;
    rate = range.value;
  }

  if (rows.length === 0) throw new Error(`no rate covers ${fromDay}: every range ends before it`);
  return rows;
}

/* The file ------------------------------------------------------------------ */

export const RATES_HEADER = "day,cop_per_usd";

export function ratesCsv(rows) {
  return `${[RATES_HEADER, ...rows.map((r) => `${r.day},${r.rate}`)].join("\n")}\n`;
}

export function parseRatesCsv(text) {
  const [header, ...lines] = text.split("\n").filter((line, k, all) => line !== "" || k < all.length - 1);
  if (header !== RATES_HEADER) throw new Error(`rates file: expected header "${RATES_HEADER}"`);
  return lines.map((line, k) => {
    const [day, text] = line.split(",");
    if (!isDay(day)) throw new Error(`rates file line ${k + 2}: day "${day}" is not a date`);
    const value = parseRate(text);
    if (value === null) throw new Error(`rates file line ${k + 2}: rate "${text}" is not a positive number`);
    return { day, rate: value };
  });
}

/* Lookup -------------------------------------------------------------------- */

// An ordered, gapless series of daily rates. A day after the last published
// one uses the last known rate and is flagged provisional: it is recomputed
// when the range that covers it is published.
export function createRateTable(rows) {
  if (rows.length === 0) throw new Error("rates are empty");
  const byDay = new Map();
  rows.forEach((r, k) => {
    if (k > 0) {
      const gap = daysBetween(rows[k - 1].day, r.day);
      if (gap < 1) throw new Error(`rates out of order at ${r.day}`);
      if (gap > 1) throw new Error(`gap in the rates before ${r.day}`);
    }
    byDay.set(r.day, r.rate);
  });
  const firstDay = rows[0].day;
  const last = rows.at(-1);
  return {
    rows,
    firstDay,
    lastDay: last.day,
    at(day) {
      if (day < firstDay) throw new Error(`no rate for ${day}: it is before the first rate (${firstDay})`);
      if (day > last.day) return { rate: last.rate, provisional: true };
      return { rate: byDay.get(day), provisional: false };
    },
  };
}

/* Money --------------------------------------------------------------------- */

export const cents = (n) => Math.round(n * 100) / 100;

// One day's amount in USD, at that day's rate, in cents. An estimate by
// nature, so a Number; the COPM it comes from stays BigInt until this point.
export const usdAt = (copm, rate) => cents(copm / rate);

// A total in USD is the sum of the daily amounts. Rounding the sum removes the
// floating-point tail without hiding any cent.
export const sumUsd = (values) => cents(values.reduce((total, v) => total + v, 0));
