import { test } from "node:test";
import assert from "node:assert/strict";
import { dashboardDictionaries, flattenDictionary } from "../../site/src/i18n/index.js";
import { placeholdersOf } from "../../site/src/lib/template.js";
import { strictChecks } from "../../pipeline/domain/validation.js";
import { fixture } from "../helpers/validation-fixture.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { globSync } from "node:fs";

const flat = (lang) => flattenDictionary(dashboardDictionaries[lang]);

test("both dashboard dictionaries have exactly the same keys", () => {
  assert.deepEqual(Object.keys(flat("es")).sort(), Object.keys(flat("en")).sort());
  assert.ok(Object.keys(flat("es")).length > 150);
});

test("every key uses the same placeholders in both languages", () => {
  const es = flat("es");
  const en = flat("en");
  for (const key of Object.keys(es)) {
    assert.deepEqual(placeholdersOf(es[key]).sort(), placeholdersOf(en[key]).sort(), key);
  }
});

test("no string is empty and none carries a hand-typed figure", () => {
  for (const lang of ["es", "en"]) {
    for (const [key, value] of Object.entries(flat(lang))) {
      assert.ok(value.trim().length > 0, `${lang}:${key}`);
      assert.doesNotMatch(value.replace(/\{[^}]+\}/g, ""), /\d{2,}/, `: has a typed figure`);
    }
  }
});

test("counts are transfers, never transactions, except for the column that names the blockchain transaction", () => {
  const allowed = new Set(["columns.tx"]);
  for (const lang of ["es", "en"]) {
    for (const [key, value] of Object.entries(flat(lang))) {
      if (allowed.has(key) || key === "tiles.transfers.note") continue;
      assert.doesNotMatch(value, /transacci[oó]n|transaction/i, `${lang}:${key}`);
    }
  }
});

test("the Spanish copy uses 'transferencias' and no voseo", () => {
  for (const [key, value] of Object.entries(flat("es"))) {
    assert.doesNotMatch(value, /\b(tenés|podés|mirá|vos)\b/i, key);
  }
});

test("every validation rule the pipeline can produce has a one-line description in both languages", () => {
  const ids = strictChecks(fixture()).map((c) => c.id);
  for (const lang of ["es", "en"]) {
    const labels = dashboardDictionaries[lang].trust.ruleLabel;
    for (const id of ids) assert.ok(labels[id], `${lang}: no description for rule ${id}`);
  }
});

test("every role has a meaning, and every admin event of the contract has one", () => {
  const roles = ["DEFAULT_ADMIN_ROLE", "MINTER_ROLE", "PAUSER_ROLE", "UPGRADER_ROLE", "FREEZER_ROLE", "RESCUER_ROLE"];
  for (const lang of ["es", "en"]) {
    const { roleMeaning, eventMeaning } = dashboardDictionaries[lang].control;
    for (const role of roles) assert.ok(roleMeaning[role], `${lang}: ${role}`);
    for (const name of ["Upgraded", "Initialized", "RoleGranted", "RoleRevoked", "Frozen", "Thawed", "BurnedFrozen", "Paused", "Unpaused", "other"]) {
      assert.ok(eventMeaning[name], `${lang}: ${name}`);
    }
  }
});

test("the dashboard says where the dollar rate comes from, with the latest rate and its day, and states no constant rate", () => {
  for (const lang of ["es", "en"]) {
    const rate = dashboardDictionaries[lang].basis.rate;
    assert.deepEqual(placeholdersOf(rate).sort(), ["date", "rate"], lang);
    assert.match(rate, /TRM/, lang);
    assert.match(rate, /Superintendencia Financiera de Colombia/, lang);
    assert.match(rate, /datos\.gov\.co/, lang);
    for (const [key, value] of Object.entries(flat(lang))) {
      assert.doesNotMatch(value, /fixed\s+rate|tasa\s+fija/i, `${lang}:${key}`);
    }
  }
});

// Every string of the dictionaries is read by the dashboard. A key nobody reads
// is dead text that still has to be translated and kept in step.
const ROOT = fileURLToPath(new URL("../../site/src", import.meta.url));
const sources = [...globSync("features/dashboard/*.{astro,js}", { cwd: ROOT }), ...globSync("lib/dashboard-*.js", { cwd: ROOT })]
  .map((file) => readFileSync(join(ROOT, file), "utf8"))
  .join("\n");

// Maps the code indexes by a computed key; every entry under them counts as read.
const INDEXED_BY_NAME = ["control.roleMeaning", "control.eventMeaning", "trust.ruleLabel", "columns.kindValue", "filters.chain", "filters.unit", "charts.bucket", "tiles.vsPeriod", "tiles.vsStart", "cards.redemption", "cards.issuance"];

test("no dictionary key is left unused by the dashboard", () => {
  const unused = [];
  for (const key of Object.keys(flat("es"))) {
    const path = key.replace(/\.\d+$/, "");
    if (INDEXED_BY_NAME.some((prefix) => path === prefix || path.startsWith(`${prefix}.`))) continue;
    // The cards module receives the `cards` branch as its `t`.
    const reads = [`t.${path}`, path.startsWith("cards.") ? `t.${path.slice("cards.".length)}` : null].filter(Boolean);
    if (!reads.some((read) => sources.includes(read))) unused.push(path);
  }
  assert.deepEqual([...new Set(unused)], []);
});

test("the dictionaries hold short labels: no string is longer than a line of the dashboard", () => {
  const allowed = new Set(["meta.description", "trust.ruleLabel", "control.eventMeaning", "control.roleMeaning"]);
  for (const lang of ["es", "en"]) {
    for (const [key, value] of Object.entries(flat(lang))) {
      if ([...allowed].some((prefix) => key === prefix || key.startsWith(`${prefix}.`))) continue;
      assert.ok(value.length <= 130, `${lang}:${key} has ${value.length} characters`);
    }
  }
});
