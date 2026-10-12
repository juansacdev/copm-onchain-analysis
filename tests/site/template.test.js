import { test } from "node:test";
import assert from "node:assert/strict";
import { interpolate, placeholdersOf } from "../../site/src/lib/template.js";

test("interpolate replaces every named placeholder, repeated ones included", () => {
  assert.equal(
    interpolate("{events} eventos en {chains} chains ({events})", { events: "579.687", chains: 2 }),
    "579.687 eventos en 2 chains (579.687)",
  );
});

test("interpolate throws on a missing placeholder instead of printing undefined", () => {
  assert.throws(() => interpolate("{events} y {missing}", { events: "1" }), /missing.*"missing"/i);
  assert.throws(() => interpolate("{x}", { x: undefined }), /"x"/);
  assert.throws(() => interpolate("{x}", { x: null }), /"x"/);
});

test("interpolate keeps text without placeholders and ignores unused values", () => {
  assert.equal(interpolate("sin cifras", { extra: 1 }), "sin cifras");
});

test("placeholdersOf lists the distinct placeholder names of a template", () => {
  assert.deepEqual(placeholdersOf("{a} {b} {a} texto"), ["a", "b"]);
  assert.deepEqual(placeholdersOf("nada"), []);
});
