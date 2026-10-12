import { test } from "node:test";
import assert from "node:assert/strict";
import { fig, formatFigure } from "../pipeline/domain/report.js";

const en = (figure) => formatFigure(figure, "en");
const es = (figure) => formatFigure(figure, "es");

test("integers are grouped with the separator of the locale", () => {
  assert.equal(en(fig.int(241858)), "241,858");
  assert.equal(es(fig.int(241858)), "241.858");
  assert.equal(en(fig.int(998)), "998");
  assert.equal(es(fig.int(3123)), "3.123");
  assert.equal(en(fig.int(0)), "0");
});

test("decimals and percentages use the decimal mark of the locale", () => {
  assert.equal(en(fig.dec(13.74, 1)), "13.7");
  assert.equal(es(fig.dec(13.74, 1)), "13,7");
  assert.equal(en(fig.pct(99.64, 1)), "99.6%");
  assert.equal(es(fig.pct(99.64, 1)), "99,6 %");
});

test("compact dollars pick the unit by magnitude and drop a trailing .0", () => {
  assert.equal(en(fig.usd(2_165_160_786.5)), "$2.17B");
  assert.equal(en(fig.usd(38_618_313.68)), "$38.6M");
  assert.equal(en(fig.usd(30_000_000)), "$30M");
  assert.equal(en(fig.usd(736_629.3)), "$737K");
  assert.equal(en(fig.usd(19_895)), "$19.9K");
  assert.equal(en(fig.usd(96.4)), "$96");
});

test("compact dollars in Spanish use words and US$", () => {
  assert.equal(es(fig.usd(2_165_160_786.5)), "US$2.165 millones");
  assert.equal(es(fig.usd(38_618_313.68)), "US$38,6 millones");
  assert.equal(es(fig.usd(736_629.3)), "US$737 mil");
  assert.equal(es(fig.usd(19_895)), "US$19,9 mil");
  assert.equal(es(fig.usd(96.4)), "US$96");
});

test("compact amounts that round up to 1,000 of a unit move to the next unit", () => {
  assert.equal(en(fig.usd(999_999)), "$1M");
  assert.equal(en(fig.usd(999_999_999)), "$1B");
  assert.equal(en(fig.usd(999.6)), "$1K");
  assert.equal(en(fig.usd(99_999)), "$100K");
  assert.equal(es(fig.usd(999_999)), "US$1 millón");
  assert.equal(es(fig.usd(999.6)), "US$1 mil");
  assert.equal(es(fig.usd(999_999_999)), "US$1.000 millones");

  assert.equal(en(fig.copm(999_999_999.6)), "1B");
  assert.equal(en(fig.copm(999_999.6)), "1M");
  assert.equal(en(fig.copm(999_999_999_999.6)), "1T");
  assert.equal(es(fig.copm(999_999.6)), "1 millón");
  assert.equal(es(fig.copm(999_999_999_999.6)), "1 billón");
  assert.equal(es(fig.copm(999_999_999.6)), "1.000 millones");
  assert.equal(en(fig.copm(999.6)), "1,000");
});

test("a negative compact amount keeps its sign before the currency symbol", () => {
  assert.equal(en(fig.usd(-1500)), "-$1.5K");
  assert.equal(es(fig.usd(-1500)), "-US$1,5 mil");
  assert.equal(en(fig.usd(-999_999)), "-$1M");
  assert.equal(en(fig.usd(-0.4)), "$0");
  assert.equal(en(fig.copm(-2_500_000)), "-2.5M");
});

test("full dollars are grouped integers", () => {
  assert.equal(en(fig.usdFull(10336.4)), "$10,336");
  assert.equal(es(fig.usdFull(10336.4)), "US$10.336");
});

test("compact COPM amounts use T, B and M in English and words in Spanish", () => {
  assert.equal(en(fig.copm(8_660_643_146_005.575)), "8.661T");
  assert.equal(es(fig.copm(8_660_643_146_005.575)), "8,661 billones");
  assert.equal(en(fig.copm(4_482_231_674.75)), "4.48B");
  assert.equal(es(fig.copm(4_482_231_674.75)), "4.482 millones");
  assert.equal(en(fig.copm(418_585_134.6)), "418.6M");
  assert.equal(es(fig.copm(418_585_134.6)), "418,6 millones");
});

test("raw 18-decimal amounts stay BigInt and are never rounded through Number", () => {
  const wei = 4482231674754852048213337676n;
  assert.equal(en(fig.copmFull(wei)), "4,482,231,674.75");
  assert.equal(es(fig.copmFull(wei)), "4.482.231.674,75");
  assert.equal(en(fig.copm(wei)), "4.48B");
  // 2^53 + 1 whole COPM: a Number round trip would lose the last digit
  assert.equal(en(fig.copmFull(9007199254740993123456789012345678n)), "9,007,199,254,740,993.12");
  assert.equal(en(fig.copmFull(5n)), "0.00");
});

test("exact amounts round half up to 2 decimals", () => {
  assert.equal(en(fig.copmFull(418585134628110192879069442n)), "418,585,134.63");
  assert.equal(en(fig.copmFull(1005000000000000000n)), "1.01");
  assert.equal(en(fig.copmFull(1004999999999999999n)), "1.00");
});

test("dates are written as in the data files; months are spelled out", () => {
  assert.equal(en(fig.date("2025-11-24")), "2025-11-24");
  assert.equal(es(fig.date("2025-11-24")), "2025-11-24");
  assert.equal(en(fig.month("2025-11")), "November 2025");
  assert.equal(es(fig.month("2025-11")), "noviembre 2025");
  assert.equal(en(fig.monthShort("2025-07")), "Jul 2025");
  assert.equal(es(fig.monthShort("2025-07")), "jul 2025");
});

test("an unknown locale or figure kind is an error", () => {
  assert.throws(() => formatFigure(fig.int(1), "fr"), /locale/);
  assert.throws(() => formatFigure({ kind: "nope", value: 1 }, "en"), /kind/);
});
