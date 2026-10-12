import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { runReports, localeOf } from "../pipeline/steps/reports.js";
import { chain } from "./helpers/report-fixture.js";
import { CSV_HEADER } from "../pipeline/domain/aggregate.js";

const mark = (key, content = "") => `<!-- copm:${key} -->${content}<!-- /copm -->`;

// A repository root with the data files of two small chains and the given
// Markdown files.
function repo(files) {
  const dir = mkdtempSync(join(tmpdir(), "copm-reports-"));
  const put = (rel, text) => {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  };
  for (const name of ["polygon", "celo"]) {
    const c = chain();
    const base = `data/${name}/`;
    put(`${base}summary.json`, JSON.stringify(c.summary));
    put(`${base}state.json`, JSON.stringify(c.state));
    put(`${base}holders.json`, JSON.stringify(c.holders));
    put(`${base}manifest.json`, JSON.stringify(c.manifest));
    put(`${base}validation.json`, JSON.stringify(c.validation));
    put(`${base}admin-events.jsonl`, c.adminEvents.map((e) => JSON.stringify(e)).join("\n") + "\n");
    put(
      `${base}daily.csv`,
      [
        CSV_HEADER,
        ...c.daily.map((r) =>
          [r.day, r.supplyEnd, r.transfers, 1, 1, r.grossCOPM, r.netCOPM, 0, 0, 0, 0, 0, r.rate, r.supplyUSD, r.grossUSD, r.netUSD, r.mintUSD, r.burnUSD].join(","),
        ),
      ].join("\n")
    );
  }
  for (const [rel, text] of Object.entries(files)) put(rel, text);
  return { root: pathToFileURL(`${dir}/`), read: (rel) => readFileSync(join(dir, rel), "utf8") };
}

const run = (r, files, options = {}) =>
  runReports({ root: r.root, files, log: () => {}, ...options });

test("the locale comes from the file name", () => {
  assert.equal(localeOf("README.es.md"), "es");
  assert.equal(localeOf("docs/audit/celo.es.md"), "es");
  assert.equal(localeOf("README.md"), "en");
  assert.equal(localeOf("docs/EVENTS.md"), "en");
});

test("rewrites every file with the figures of its own locale", () => {
  const r = repo({
    "a.md": `Events: ${mark("combined.checksPassed", "0")} and ${mark("polygon.checkpointBlock", "0")}`,
    "a.es.md": `Eventos: ${mark("polygon.checkpointBlock", "0")}`,
  });
  const result = run(r, ["a.md", "a.es.md"]);
  assert.equal(r.read("a.md"), `Events: ${mark("combined.checksPassed", "34")} and ${mark("polygon.checkpointBlock", "5,000")}`);
  assert.equal(r.read("a.es.md"), `Eventos: ${mark("polygon.checkpointBlock", "5.000")}`);
  assert.equal(result.changes.length, 3);
  assert.deepEqual(result.changes.map((c) => c.file), ["a.md", "a.md", "a.es.md"]);
});

test("a second run changes nothing and reports nothing", () => {
  const r = repo({ "a.md": mark("polygon.transfers", "stale") });
  run(r, ["a.md"]);
  const once = r.read("a.md");
  const second = run(r, ["a.md"]);
  assert.equal(r.read("a.md"), once);
  assert.deepEqual(second.changes, []);
});

test("--check writes nothing and lists the file and key that would change", () => {
  const original = `x ${mark("polygon.transfers", "stale")} ${mark("celo.transfers", "8")}`;
  const r = repo({ "a.md": original });
  const result = run(r, ["a.md"], { check: true });
  assert.equal(r.read("a.md"), original);
  assert.deepEqual(result.changes, [{ file: "a.md", key: "polygon.transfers", before: "stale", after: "8" }]);
});

test("--check on up-to-date files reports no change", () => {
  const r = repo({ "a.md": mark("polygon.transfers", "stale") });
  run(r, ["a.md"]);
  assert.deepEqual(run(r, ["a.md"], { check: true }).changes, []);
});

test("an unknown key fails and names the file; nothing is written", () => {
  const good = mark("polygon.transfers", "stale");
  const r = repo({ "a.md": good, "b.md": mark("polygon.nope", "1") });
  assert.throws(() => run(r, ["a.md", "b.md"]), /b\.md.*unknown figure "polygon\.nope"/);
  assert.equal(r.read("a.md"), good);
});

test("an unclosed marker fails and names the file", () => {
  const r = repo({ "a.md": "<!-- copm:polygon.transfers -->8" });
  assert.throws(() => run(r, ["a.md"]), /a\.md.*unclosed marker/);
});

test("a missing data file is a clear error that points at the command to run", () => {
  const r = repo({ "a.md": mark("polygon.transfers") });
  writeFileSync(new URL("data/celo/summary.json", r.root), "");
  assert.throws(() => run(r, ["a.md"]), /celo/);
});

test("a malformed marker fails reports and reports --check, naming the file and line", () => {
  const r = repo({ "a.md": "intro\n<!--copm:polygon.transfers-->x<!--/copm-->\n" });
  for (const check of [false, true]) {
    assert.throws(() => run(r, ["a.md"], { check }), /a\.md: malformed marker.*line 2/s, `check=${check}`);
  }
  assert.equal(r.read("a.md"), "intro\n<!--copm:polygon.transfers-->x<!--/copm-->\n");
});

test("the rate markers are filled from the summaries: latest rate, its date and the range", () => {
  const r = repo({
    "a.md": `${mark("fx.latestRate")} on ${mark("fx.latestDate")}, between ${mark("fx.minRate")} and ${mark("fx.maxRate")}`,
    "a.es.md": `${mark("fx.latestRate")} el ${mark("fx.latestDate")}`,
  });
  run(r, ["a.md", "a.es.md"]);
  assert.equal(r.read("a.md"), `${mark("fx.latestRate", "3,900.5")} on ${mark("fx.latestDate", "2024-02-03")}, between ${mark("fx.minRate", "3,800")} and ${mark("fx.maxRate", "4,100")}`);
  assert.equal(r.read("a.es.md"), `${mark("fx.latestRate", "3.900,5")} el ${mark("fx.latestDate", "2024-02-03")}`);
});

test("the old fixed-rate marker is an unknown figure", () => {
  const old = ["fx.cop", "PerUsd"].join("");
  const r = repo({ "a.md": mark(old, "4,000") });
  assert.throws(() => run(r, ["a.md"]), new RegExp(`unknown figure "${old}"`));
});
