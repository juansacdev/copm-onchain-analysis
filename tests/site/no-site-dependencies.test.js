import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The root test run installs only the root dependencies. A test that imports a
// site module which loads a site dependency (the charting library, Astro) passes
// on a machine with site/node_modules and fails in CI. This walks the static
// imports of every test and fails on the first bare import that the root
// package does not provide.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const rootDeps = new Set(Object.keys(JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).dependencies ?? {}));
const IMPORT = /(?:^|\n)\s*(?:import|export)\s[^"'`;]*?from\s*["']([^"']+)["']|(?:^|\n)\s*import\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

const listTests = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return listTests(path);
    return name.endsWith(".test.js") ? [path] : [];
  });

function bareImportsReachableFrom(entry) {
  const seen = new Set();
  const offenders = [];
  const visit = (file, chain) => {
    if (seen.has(file)) return;
    seen.add(file);
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(IMPORT)) {
      const spec = match[1] ?? match[2] ?? match[3];
      if (spec.startsWith("node:")) continue;
      if (spec.startsWith(".")) {
        const target = resolve(dirname(file), spec.split("?")[0]);
        if (target.endsWith(".js") || target.endsWith(".mjs")) visit(target, [...chain, target]);
        continue;
      }
      const name = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
      if (!rootDeps.has(name)) offenders.push(`${name} (via ${chain.map((f) => f.replace(`${ROOT}/`, "")).join(" -> ")})`);
    }
  };
  visit(entry, [entry]);
  return offenders;
}

test("no test reaches a package that only site/ installs", () => {
  const offenders = listTests(join(ROOT, "tests")).flatMap(bareImportsReachableFrom);
  assert.deepEqual(offenders, []);
});
