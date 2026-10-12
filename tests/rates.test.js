import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createRateTable,
  expandRanges,
  parseRatesCsv,
  parseTrmRows,
  ratesCsv,
  sumUsd,
  usdAt,
} from "../pipeline/domain/rates.js";

const row = (valor, desde, hasta) => ({
  valor: String(valor),
  unidad: "COP",
  vigenciadesde: `${desde}T00:00:00.000`,
  vigenciahasta: `${hasta}T00:00:00.000`,
});

test("parseTrmRows turns Socrata rows into ranges of whole calendar days, ordered by start", () => {
  const ranges = parseTrmRows([row("3194.44", "2026-10-10", "2026-10-13"), row("3200", "2026-10-07", "2026-10-09")]);
  assert.deepEqual(ranges, [
    { from: "2026-10-07", to: "2026-10-09", value: 3200 },
    { from: "2026-10-10", to: "2026-10-13", value: 3194.44 },
  ]);
});

test("parseTrmRows rejects a value that is not a positive number, a bad date or an inverted range", () => {
  assert.throws(() => parseTrmRows([row("abc", "2026-10-07", "2026-10-09")]), /valor/);
  assert.throws(() => parseTrmRows([row("0", "2026-10-07", "2026-10-09")]), /valor/);
  assert.throws(() => parseTrmRows([row("-5", "2026-10-07", "2026-10-09")]), /valor/);
  assert.throws(() => parseTrmRows([{ ...row("3000", "2026-10-07", "2026-10-09"), vigenciadesde: "mañana" }]), /vigenciadesde/);
  assert.throws(() => parseTrmRows([row("3000", "2026-10-09", "2026-10-07")]), /before/);
  assert.throws(() => parseTrmRows("nope"), /array/);
});

test("expandRanges gives one row per day: a range over a weekend and a single-day range", () => {
  const ranges = parseTrmRows([
    row(3000, "2026-10-02", "2026-10-05"), // Friday to Monday
    row(3010, "2026-10-06", "2026-10-06"), // one day
  ]);
  assert.deepEqual(expandRanges(ranges, { fromDay: "2026-10-02" }), [
    { day: "2026-10-02", rate: 3000 },
    { day: "2026-10-03", rate: 3000 },
    { day: "2026-10-04", rate: 3000 },
    { day: "2026-10-05", rate: 3000 },
    { day: "2026-10-06", rate: 3010 },
  ]);
});

test("expandRanges starts at fromDay, clipping the range that covers it and skipping earlier ones", () => {
  const ranges = parseTrmRows([row(2900, "2026-09-25", "2026-09-28"), row(3000, "2026-09-29", "2026-10-03")]);
  const rows = expandRanges(ranges, { fromDay: "2026-10-01" });
  assert.equal(rows[0].day, "2026-10-01");
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r.rate === 3000));
});

test("expandRanges fails when no range covers fromDay", () => {
  const ranges = parseTrmRows([row(3000, "2026-10-05", "2026-10-06")]);
  assert.throws(() => expandRanges(ranges, { fromDay: "2026-10-01" }), /2026-10-01/);
  assert.throws(() => expandRanges([], { fromDay: "2026-10-01" }), /no rates/);
});

test("expandRanges fails on a gap between ranges and names the missing days", () => {
  const ranges = parseTrmRows([row(3000, "2026-10-01", "2026-10-02"), row(3010, "2026-10-05", "2026-10-06")]);
  assert.throws(() => expandRanges(ranges, { fromDay: "2026-10-01" }), /gap.*2026-10-03.*2026-10-04/);
});

test("expandRanges tolerates an overlap with equal values and fails on one with different values", () => {
  const equal = parseTrmRows([row(3000, "2026-10-01", "2026-10-03"), row(3000, "2026-10-03", "2026-10-05")]);
  assert.equal(expandRanges(equal, { fromDay: "2026-10-01" }).length, 5);

  const different = parseTrmRows([row(3000, "2026-10-01", "2026-10-03"), row(3001, "2026-10-03", "2026-10-05")]);
  assert.throws(() => expandRanges(different, { fromDay: "2026-10-01" }), /overlap.*2026-10-03/);
});

test("the CSV round-trips and is ordered, gapless and newline-terminated", () => {
  const rows = [
    { day: "2026-10-01", rate: 3000 },
    { day: "2026-10-02", rate: 3194.44 },
  ];
  const text = ratesCsv(rows);
  assert.equal(text, "day,cop_per_usd\n2026-10-01,3000\n2026-10-02,3194.44\n");
  assert.deepEqual(parseRatesCsv(text), rows);
});

test("parseRatesCsv rejects a wrong header, a bad day and a bad rate", () => {
  assert.throws(() => parseRatesCsv("x,y\n"), /header/);
  assert.throws(() => parseRatesCsv("day,cop_per_usd\nfoo,3000\n"), /day/);
  assert.throws(() => parseRatesCsv("day,cop_per_usd\n2026-10-01,0\n"), /rate/);
});

test("the rate table looks a day up and marks days after the last published one as provisional", () => {
  const table = createRateTable([
    { day: "2026-10-01", rate: 3000 },
    { day: "2026-10-02", rate: 3100 },
  ]);
  assert.equal(table.firstDay, "2026-10-01");
  assert.equal(table.lastDay, "2026-10-02");
  assert.deepEqual(table.at("2026-10-01"), { rate: 3000, provisional: false });
  assert.deepEqual(table.at("2026-10-02"), { rate: 3100, provisional: false });
  assert.deepEqual(table.at("2026-10-04"), { rate: 3100, provisional: true });
  assert.throws(() => table.at("2026-09-30"), /before the first/);
});

test("createRateTable refuses an empty, unordered or gappy series", () => {
  assert.throws(() => createRateTable([]), /empty/);
  assert.throws(
    () => createRateTable([{ day: "2026-10-02", rate: 1 }, { day: "2026-10-01", rate: 1 }]),
    /order/,
  );
  assert.throws(
    () => createRateTable([{ day: "2026-10-01", rate: 1 }, { day: "2026-10-03", rate: 1 }]),
    /gap/,
  );
});

test("USD totals are the sum of the daily amounts, not the COPM total over one rate", () => {
  const days = [
    { copm: 4_000_000, rate: 4000 }, // 1000
    { copm: 3_000_000, rate: 3000 }, // 1000
  ];
  const daily = days.map((d) => usdAt(d.copm, d.rate));
  assert.deepEqual(daily, [1000, 1000]);
  const total = sumUsd(daily);
  assert.equal(total, 2000);
  assert.notEqual(total, 7_000_000 / 3500 + 1, "a single average rate does not reproduce it");
  assert.notEqual(total, 7_000_000 / 4000);
});

test("usdAt rounds to cents and sumUsd leaves no floating-point tail", () => {
  assert.equal(usdAt(1, 3194.44), 0);
  assert.equal(usdAt(1_000_000, 3194.44), 313.04);
  assert.equal(sumUsd([0.1, 0.2]), 0.3);
});
