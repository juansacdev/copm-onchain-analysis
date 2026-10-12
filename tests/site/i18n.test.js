import { test } from "node:test";
import assert from "node:assert/strict";
import { dictionaries, flattenDictionary, renderDictionary } from "../../site/src/i18n/index.js";
import { buildVars } from "../../site/src/features/analysis/vars.js";
import { loadAnalysisData } from "../../site/src/lib/analysis-data.js";
import { placeholdersOf } from "../../site/src/lib/template.js";
import { COP_PER_USD, writeSiteFixture } from "../helpers/site-fixture.js";

const PRESS_MONTH = "2025-03";

function fixtureData(overrides) {
  return loadAnalysisData({ dataDir: writeSiteFixture(overrides), copPerUsd: COP_PER_USD });
}

test("both dictionaries have exactly the same keys", () => {
  const es = Object.keys(flattenDictionary(dictionaries.es)).sort();
  const en = Object.keys(flattenDictionary(dictionaries.en)).sort();
  assert.deepEqual(es, en);
  assert.ok(es.length > 100, "the dictionaries should hold the whole page");
});

test("every key uses the same placeholders in both languages", () => {
  const es = flattenDictionary(dictionaries.es);
  const en = flattenDictionary(dictionaries.en);
  for (const key of Object.keys(es)) {
    assert.deepEqual(placeholdersOf(es[key]).sort(), placeholdersOf(en[key]).sort(), key);
  }
});

test("no dictionary string is empty", () => {
  for (const lang of ["es", "en"]) {
    for (const [key, value] of Object.entries(flattenDictionary(dictionaries[lang]))) {
      assert.ok(value.trim().length > 0, `${lang}:${key}`);
    }
  }
});

// The press quote is a citation of a third party, not a figure of this data.
const CITED = new Set(["chapters.prensa.quote"]);

test("no figure is typed in a dictionary: digit runs only appear in cited text", () => {
  for (const lang of ["es", "en"]) {
    for (const [key, value] of Object.entries(flattenDictionary(dictionaries[lang]))) {
      if (CITED.has(key)) continue;
      assert.doesNotMatch(value, /\d{2,}/, `${lang}:${key} has a typed figure`);
    }
  }
});

test("every string of both dictionaries renders against the data, with no gaps", () => {
  const data = fixtureData();
  for (const lang of ["es", "en"]) {
    const rendered = flattenDictionary(
      renderDictionary(dictionaries[lang], buildVars(data, lang, { pressMonth: PRESS_MONTH })),
    );
    for (const [key, value] of Object.entries(rendered)) {
      assert.doesNotMatch(value, /undefined|NaN|\{[A-Za-z]+\}/, `${lang}:${key}: ${value}`);
    }
  }
});

test("variables are formatted for the language", () => {
  const data = fixtureData();
  const es = buildVars(data, "es", { pressMonth: PRESS_MONTH });
  const en = buildVars(data, "en", { pressMonth: PRESS_MONTH });
  assert.equal(es.allTransfers, "1.300");
  assert.equal(en.allTransfers, "1,300");
  assert.equal(es.polygonSupplyExact, "1.000.000,00");
  assert.equal(en.polygonSupplyExact, "1,000,000.00");
  assert.equal(es.polygonPeakMonth, "marzo de 2025");
  assert.equal(en.polygonPeakMonth, "March 2025");
  assert.equal(es.polygonTakeoffMonths, "1");
  assert.equal(es.polygonTakeoffWeeks, "6");
  assert.equal(es.polygonLatestPct, "60 %");
  assert.equal(en.polygonLatestPct, "60%");
});

test("the page refuses to build a claim the data no longer supports", () => {
  const failing = {
    polygon: {
      validation: {
        validatedAt: "2025-06-16T00:00:00.000Z",
        passed: 16,
        failed: 1,
        checks: [{ id: "supply-exact", ok: false, detail: "diff 1" }],
      },
    },
  };
  assert.throws(
    () => buildVars(fixtureData(failing), "es", { pressMonth: PRESS_MONTH }),
    /supply|validation/i,
  );
});
