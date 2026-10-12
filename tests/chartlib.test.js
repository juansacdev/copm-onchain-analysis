import { test } from "node:test";
import assert from "node:assert/strict";
import { BASE, CHAIN_PALETTES, PALETTES, lineChart, parseDailyCsv, setTheme, toMonthly } from "../pipeline/charts/chartlib.js";
import { CSV_HEADER } from "../pipeline/domain/aggregate.js";

// Snapshot of the two palettes used by the GitHub docs. Changing a value here
// changes every committed SVG under charts/, so it must be a deliberate act.
const DARK_BG = "#0b0e14";
const LIGHT_BG = "#eeefe9";

test("the site palette matches the site surface and chain colors", () => {
  const site = PALETTES.site;
  assert.ok(site, "PALETTES.site exists");
  assert.equal(site.base.bg, "#131209");
  assert.equal(site.base.panel, "#181818");
  assert.equal(site.base.mint, "#3987e5");
  assert.equal(site.base.burn, "#e66767");
  assert.equal(site.chains.polygon.primary, "#9085e9");
  assert.equal(site.chains.celo.primary, "#199e70");
});

test("setTheme applies the site palette in place", () => {
  setTheme("site");
  assert.equal(BASE.bg, "#131209");
  assert.equal(CHAIN_PALETTES.celo.primary, "#199e70");
  setTheme("dark");
});

test("setTheme rejects an unknown palette and names the valid ones", () => {
  assert.throws(() => setTheme("sepia"), /unknown theme "sepia".*dark.*light.*site/);
});

test("dark and light palettes are unchanged", () => {
  assert.equal(PALETTES.dark.base.bg, DARK_BG);
  assert.equal(PALETTES.dark.chains.polygon.primary, "#9a6bff");
  assert.equal(PALETTES.light.base.bg, LIGHT_BG);
  assert.equal(PALETTES.light.chains.polygon.primary, "#6549c4");
  assert.equal("badgeText" in PALETTES.dark.base, false);
  assert.equal("badgeText" in PALETTES.light.base, false);
});

test("switching back from site leaves no site-only key behind", () => {
  setTheme("site");
  setTheme("dark");
  assert.equal(BASE.bg, DARK_BG);
  assert.equal("badgeText" in BASE, false);
  setTheme("light");
  assert.equal("badgeText" in BASE, false);
  setTheme("dark");
});

const sample = () =>
  lineChart({
    title: "T",
    subtitle: "S",
    badge: "Polygon",
    badgeColor: CHAIN_PALETTES.polygon.primary,
    footer: "F",
    data: [
      { day: "2025-01-01", v: 1 },
      { day: "2025-01-02", v: 3 },
    ],
    yKey: "v",
    color: CHAIN_PALETTES.polygon.primary,
  });

test("the site palette draws on the site surface and keeps badge text neutral", () => {
  setTheme("site");
  const svg = sample();
  setTheme("dark");
  assert.match(svg, /fill="#131209"/);
  assert.match(svg, /class="badge" fill="#[0-9a-f]{6}"/);
  assert.doesNotMatch(svg, /class="badge" fill="#9085e9"/);
});

test("dark rendering still colors the badge text with the chain color", () => {
  setTheme("dark");
  assert.match(sample(), /class="badge" fill="#9a6bff"/);
});

/* daily.csv with the rate and the USD columns -------------------------------- */

const DAILY = [
  CSV_HEADER,
  "2024-03-01,100,2,2,3,1000,200,800,0,1,0,0,4000,0.03,0.25,0.05,0.2,0",
  "2024-03-02,100,1,1,2,600,600,0,0,0,0,0,3000,0.03,0.2,0.2,0,0",
  "2024-04-01,100,1,1,2,600,600,0,0,0,0,0,3000,0.03,0.2,0.2,0,0",
].join("\n");

test("parseDailyCsv reads the rate and the USD columns next to the COPM ones", () => {
  const [first] = parseDailyCsv(DAILY);
  assert.equal(first.rate, 4000);
  assert.equal(first.grossUSD, 0.25);
  assert.equal(first.netUSD, 0.05);
  assert.equal(first.mintUSD, 0.2);
  assert.equal(first.burnUSD, 0);
  assert.equal(first.supplyUSD, 0.03);
  assert.equal(first.grossCOPM, 1000);
});

test("parseDailyCsv fails clearly on a daily.csv from before the daily rate", () => {
  const old = DAILY.split("\n").map((line) => line.split(",").slice(0, 12).join(",")).join("\n");
  assert.throws(() => parseDailyCsv(old), /cop_per_usd.*"rates".*"aggregate"/);
});

test("toMonthly adds the USD of each day: a month is not its COPM total over one rate", () => {
  const months = toMonthly(parseDailyCsv(DAILY));
  assert.deepEqual(months.map((m) => [m.month, m.gross, m.grossUSD]), [
    ["2024-03", 1600, 0.45],
    ["2024-04", 600, 0.2],
  ]);
});
