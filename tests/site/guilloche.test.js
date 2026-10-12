import { test } from "node:test";
import assert from "node:assert/strict";
import { guillochePaths } from "../../site/src/lib/guilloche.js";

const OPTIONS = { width: 1200, height: 64, curves: 7, samples: 120 };

const numbersOf = (d) => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

test("draws one path per curve", () => {
  const paths = guillochePaths(OPTIONS);
  assert.equal(paths.length, 7);
  for (const d of paths) assert.match(d, /^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
});

test("is deterministic: the same options give the same bytes", () => {
  assert.deepEqual(guillochePaths(OPTIONS), guillochePaths({ ...OPTIONS }));
});

test("every coordinate stays inside the viewBox", () => {
  for (const d of guillochePaths(OPTIONS)) {
    const values = numbersOf(d);
    values.forEach((value, index) => {
      const limit = index % 2 === 0 ? OPTIONS.width : OPTIONS.height;
      assert.ok(value >= 0 && value <= limit, `${value} outside 0..${limit}`);
    });
  }
});

test("curves span the full width and use samples + 1 points", () => {
  const [first] = guillochePaths(OPTIONS);
  const values = numbersOf(first);
  assert.equal(values.length, (OPTIONS.samples + 1) * 2);
  assert.equal(values[0], 0);
  assert.equal(values.at(-2), OPTIONS.width);
});

test("curves differ from each other (they interlace, not overlap)", () => {
  const paths = guillochePaths(OPTIONS);
  assert.equal(new Set(paths).size, paths.length);
});

test("rejects options that cannot draw a band", () => {
  assert.throws(() => guillochePaths({ ...OPTIONS, curves: 0 }), /curves/);
  assert.throws(() => guillochePaths({ ...OPTIONS, samples: 1 }), /samples/);
  assert.throws(() => guillochePaths({ ...OPTIONS, width: 0 }), /width/);
  assert.throws(() => guillochePaths({ ...OPTIONS, height: -4 }), /height/);
});
