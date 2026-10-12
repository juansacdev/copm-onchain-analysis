import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatCopmExact,
  formatDate,
  formatDecimal,
  formatInt,
  formatMonth,
  formatMonthShort,
  formatPercent,
  formatUsd,
  formatUsdFull,
} from "../../site/src/lib/format.js";

test("integers use the thousands separator of the locale", () => {
  assert.equal(formatInt(374802, "en"), "374,802");
  assert.equal(formatInt(374802, "es"), "374.802");
  assert.equal(formatInt(999, "es"), "999");
  assert.equal(formatInt(0, "en"), "0");
});

test("decimals have a fixed number of digits and the decimal mark of the locale", () => {
  assert.equal(formatDecimal(13.7, 1, "en"), "13.7");
  assert.equal(formatDecimal(13.7, 1, "es"), "13,7");
  assert.equal(formatDecimal(1234.5, 2, "es"), "1.234,50");
});

test("a small negative that rounds to zero never prints as -0", () => {
  assert.equal(formatDecimal(-0.4, 0, "en"), "0");
  assert.equal(formatDecimal(-1.5, 1, "en"), "-1.5");
});

test("percentages put the sign where each language writes it", () => {
  assert.equal(formatPercent(65.6404, 1, "en"), "65.6%");
  assert.equal(formatPercent(65.6404, 1, "es"), "65,6 %");
});

test("money, short style: B/M/K in English, M and mil in Spanish", () => {
  assert.equal(formatUsd(2178194000, "en", "short"), "$2.18B");
  assert.equal(formatUsd(318400000, "en", "short"), "$318.4M");
  assert.equal(formatUsd(96400, "en", "short"), "$96.4K");
  assert.equal(formatUsd(980, "en", "short"), "$980");
  assert.equal(formatUsd(2178194000, "es", "short"), "US$2.178 M");
  assert.equal(formatUsd(318400000, "es", "short"), "US$318,4 M");
  assert.equal(formatUsd(736629, "es", "short"), "US$737 mil");
});

test("money, long style: words in both languages", () => {
  assert.equal(formatUsd(2178194000, "en", "long"), "US$2.18 billion");
  assert.equal(formatUsd(318400000, "en", "long"), "US$318.4 million");
  assert.equal(formatUsd(736629, "en", "long"), "US$737 thousand");
  assert.equal(formatUsd(2178194000, "es", "long"), "US$2.178 millones");
  assert.equal(formatUsd(318400000, "es", "long"), "US$318,4 millones");
  assert.equal(formatUsd(736629, "es", "long"), "US$737 mil");
});

test("a whole-dollar amount is written in full", () => {
  assert.equal(formatUsdFull(8952.4, "en"), "$8,952");
  assert.equal(formatUsdFull(8952.4, "es"), "US$8.952");
});

test("a raw 18-decimal amount is written exactly, rounded half up to 2 decimals", () => {
  const wei = 4482231674754852048213337676n;
  assert.equal(formatCopmExact(wei, "en"), "4,482,231,674.75");
  assert.equal(formatCopmExact(wei, "es"), "4.482.231.674,75");
  assert.equal(formatCopmExact(5n * 10n ** 15n, "en"), "0.01");
  assert.equal(formatCopmExact(4n * 10n ** 15n, "en"), "0.00");
});

test("dates are written in full for each language", () => {
  assert.equal(formatDate("2025-11-24", "es"), "24 de noviembre de 2025");
  assert.equal(formatDate("2025-11-24", "en"), "November 24, 2025");
  assert.equal(formatDate("2026-05-05", "es"), "5 de mayo de 2026");
});

test("months are written in full and short", () => {
  assert.equal(formatMonth("2025-11", "es"), "noviembre de 2025");
  assert.equal(formatMonth("2025-11", "en"), "November 2025");
  assert.equal(formatMonthShort("2025-11", "es"), "nov 2025");
  assert.equal(formatMonthShort("2025-11", "en"), "Nov 2025");
});

test("an unknown locale or a malformed date throws", () => {
  assert.throws(() => formatInt(1, "fr"), /unknown locale "fr"/);
  assert.throws(() => formatDate("24/11/2025", "es"), /date/);
  assert.throws(() => formatMonth("2025-13", "es"), /month/);
});
