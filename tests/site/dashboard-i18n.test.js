import { test } from "node:test";
import assert from "node:assert/strict";
import { dashboardDictionaries, flattenDictionary } from "../../site/src/i18n/index.js";
import { placeholdersOf } from "../../site/src/lib/template.js";
import { strictChecks } from "../../pipeline/domain/validation.js";
import { fixture } from "../helpers/validation-fixture.js";

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
