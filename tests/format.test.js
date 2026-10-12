import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatCopmCompact,
  formatCopmExact,
  formatDecimal,
  rangeLabels,
  formatInt,
  formatUsd,
  formatUsdFull,
} from "../pipeline/domain/format.js";

// A "report" caller trims zero decimals; a "site" caller keeps them.
const trimmed = { trim: true };

test("english unit boundaries: just below, at and just above each unit", () => {
  assert.equal(formatUsd(999, "en"), "$999");
  assert.equal(formatUsd(1000, "en"), "$1.0K");
  assert.equal(formatUsd(1001, "en"), "$1.0K");
  assert.equal(formatUsd(999_999, "en"), "$1.0M");
  assert.equal(formatUsd(1_000_000, "en"), "$1.0M");
  assert.equal(formatUsd(1_000_001, "en"), "$1.0M");
  assert.equal(formatUsd(999.96e6, "en"), "$1.00B");
  assert.equal(formatUsd(1e9, "en"), "$1.00B");
  assert.equal(formatUsd(1e9 + 1, "en"), "$1.00B");
  assert.equal(formatUsd(999.996e9, "en"), "$1.0T");
  assert.equal(formatUsd(1e12, "en"), "$1.0T");
  assert.equal(formatUsd(1.2e12, "en"), "$1.2T");
  assert.equal(formatUsd(1e12 + 1, "en"), "$1.0T");
});

test("spanish unit boundaries: just below, at and just above each unit", () => {
  assert.equal(formatUsd(999, "es", "short"), "US$999");
  assert.equal(formatUsd(1000, "es", "short"), "US$1,0 mil");
  assert.equal(formatUsd(999_999, "es", "short"), "US$1,0 M");
  assert.equal(formatUsd(1_000_001, "es", "short"), "US$1,0 M");
  assert.equal(formatUsd(999_999, "es", "long"), "US$1 millón");
  assert.equal(formatUsd(1_000_000, "es", "long"), "US$1 millón");
  assert.equal(formatUsd(1_000_001, "es", "long"), "US$1 millón");
  assert.equal(formatUsd(1_500_000, "es", "long"), "US$1,5 millones");
  assert.equal(formatUsd(2_000_000, "es", "long"), "US$2,0 millones");
  assert.equal(formatUsd(999_999_999, "es", "long"), "US$1.000,0 millones");
  assert.equal(formatUsd(1e9, "es", "long"), "US$1.000 millones");
  assert.equal(formatUsd(999_999_999_999, "es", "long"), "US$1 billón");
  assert.equal(formatUsd(1e12, "es", "long"), "US$1 billón");
  assert.equal(formatUsd(1e12 + 1, "es", "long"), "US$1 billón");
  assert.equal(formatUsd(2.5e12, "es", "long"), "US$2,5 billones");
});

test("english long style uses words", () => {
  assert.equal(formatUsd(999_999, "en", "long"), "US$1.0 million");
  assert.equal(formatUsd(1.2e12, "en", "long"), "US$1.2 trillion");
  assert.equal(formatUsd(2_178_194_000, "en", "long"), "US$2.18 billion");
});

test("the sign goes before the currency symbol in both languages", () => {
  assert.equal(formatUsd(-5, "en"), "-$5");
  assert.equal(formatUsd(-5, "es"), "-US$5");
  assert.equal(formatUsd(-1500, "en"), "-$1.5K");
  assert.equal(formatUsd(-1500, "es", "long"), "-US$1,5 mil");
  assert.equal(formatUsd(-0.4, "en"), "$0");
  assert.equal(formatUsdFull(-5, "en"), "-$5");
  assert.equal(formatUsdFull(-5, "es"), "-US$5");
});

test("zero is written plainly", () => {
  assert.equal(formatUsd(0, "en"), "$0");
  assert.equal(formatUsd(0, "es"), "US$0");
  assert.equal(formatInt(0, "es"), "0");
  assert.equal(formatCopmCompact(0, "es"), "0");
});

test("trimmed output drops zero decimals", () => {
  assert.equal(formatUsd(1_000_000, "en", "short", trimmed), "$1M");
  assert.equal(formatUsd(30_000_000, "en", "short", trimmed), "$30M");
  assert.equal(formatUsd(999_999, "es", "long", trimmed), "US$1 millón");
  assert.equal(formatDecimal(13.0, 2, "en", trimmed), "13");
});

test("COPM compact amounts use a singular at exactly one unit in Spanish", () => {
  assert.equal(formatCopmCompact(1_000_000, "es"), "1 millón");
  assert.equal(formatCopmCompact(999_999.6, "es"), "1 millón");
  assert.equal(formatCopmCompact(1e12, "es"), "1 billón");
  assert.equal(formatCopmCompact(999_999_999_999.6, "es"), "1 billón");
  assert.equal(formatCopmCompact(2_000_000, "es"), "2 millones");
  assert.equal(formatCopmCompact(8_660_643_146_005.575, "es"), "8,661 billones");
  assert.equal(formatCopmCompact(1e12, "en"), "1T");
});

test("a value beyond 2^53 given as BigInt keeps every digit", () => {
  const big = 2n ** 60n;
  assert.equal(formatInt(big, "en"), "1,152,921,504,606,846,976");
  assert.equal(formatInt(-big, "es"), "-1.152.921.504.606.846.976");
  assert.equal(formatDecimal(big, 2, "en"), "1,152,921,504,606,846,976.00");
  assert.equal(formatUsd(big, "en"), "$1,152,921.5T");
  assert.equal(formatUsdFull(big, "en"), "$1,152,921,504,606,846,976");
});

test("raw 18-decimal amounts stay exact", () => {
  assert.equal(formatCopmExact(4482231674754852048213337676n, "es"), "4.482.231.674,75");
  assert.equal(formatCopmExact(5n * 10n ** 15n, "en"), "0.01");
});

test("NaN, Infinity and non-numeric input throw a clear error", () => {
  assert.throws(() => formatUsd(NaN, "en"), /formatUsd: expected a finite number.*NaN/);
  assert.throws(() => formatUsd(Infinity, "en"), /formatUsd.*Infinity/);
  assert.throws(() => formatUsd(-Infinity, "es"), /formatUsd.*-Infinity/);
  assert.throws(() => formatUsd("12", "en"), /formatUsd.*"12"/);
  assert.throws(() => formatUsd(undefined, "en"), /formatUsd.*undefined/);
  assert.throws(() => formatInt(NaN, "en"), /formatInt.*NaN/);
  assert.throws(() => formatDecimal("x", 1, "en"), /formatDecimal.*"x"/);
  assert.throws(() => formatUsdFull(NaN, "en"), /formatUsdFull.*NaN/);
  assert.throws(() => formatCopmCompact(NaN, "en"), /formatCopmCompact.*NaN/);
});

test("an unknown locale throws", () => {
  assert.throws(() => formatUsd(1, "fr"), /unknown locale "fr"/);
});

test("range labels: Spanish writes 10^9 as 'mil millones', never as 'B'", () => {
  const mins = [0, 1e3, 1e6, 1e8, 1e9, 1e10, 1e11];
  assert.deepEqual(rangeLabels(mins, "es"), [
    "< 1 mil",
    "1 mil – 1 millón",
    "1 millón – 100 millones",
    "100 millones – mil millones",
    "mil millones – 10 mil millones",
    "10 mil millones – 100 mil millones",
    "≥ 100 mil millones",
  ]);
});

test("range labels: English keeps k, M and B for thousands, millions and billions", () => {
  assert.deepEqual(rangeLabels([0, 1e3, 1e8, 1e9], "en"), ["< 1k", "1k – 100M", "100M – 1B", "≥ 1B"]);
});

test("range labels: the order of the minimums does not matter and a minimum of 1 closes '< 1'", () => {
  assert.deepEqual(rangeLabels([1e6, 0, 1], "en"), ["≥ 1M", "< 1", "1 – 1M"]);
});
