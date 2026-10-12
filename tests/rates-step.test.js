import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { fetchTrmRows, trmUrl } from "../pipeline/adapters/rates.js";
import { updateRates } from "../pipeline/steps/rates.js";

const row = (valor, desde, hasta) => ({
  valor: String(valor),
  unidad: "COP",
  vigenciadesde: `${desde}T00:00:00.000`,
  vigenciahasta: `${hasta}T00:00:00.000`,
});

const SOURCE = [
  row(3000, "2026-10-01", "2026-10-03"),
  row(3010, "2026-10-04", "2026-10-04"),
  row(3020, "2026-10-05", "2026-10-07"),
];

const temp = () => mkdtempSync(join(tmpdir(), "copm-rates-"));
const dirOf = (path) => pathToFileURL(`${path}/`);
const silent = { log: () => {}, warn: () => {} };
const ok = (rows) => async () => rows;
const down = async () => {
  throw new Error("network down");
};

/* Adapter ------------------------------------------------------------------- */

const response = (status, body) => ({ ok: status < 400, status, json: async () => body });

test("trmUrl asks for the ranges that end on or after the first needed day, ordered, up to the limit", () => {
  const url = decodeURIComponent(trmUrl("2023-09-19"));
  assert.match(url, /^https:\/\/www\.datos\.gov\.co\/resource\/32sa-8pi3\.json\?/);
  assert.match(url, /\$where=vigenciahasta >= '2023-09-19T00:00:00'/);
  assert.match(url, /\$order=vigenciadesde/);
  assert.match(url, /\$limit=5000/);
});

test("fetchTrmRows returns the rows of a good answer and sends the request with a timeout signal", async () => {
  const seen = [];
  const fetchFn = async (url, options) => {
    seen.push({ url, signal: options?.signal });
    return response(200, SOURCE);
  };
  const rows = await fetchTrmRows({ fromDay: "2026-10-01", fetchFn, sleep: async () => {} });
  assert.deepEqual(rows, SOURCE);
  assert.equal(seen.length, 1);
  assert.ok(seen[0].signal instanceof AbortSignal);
});

test("fetchTrmRows retries a network error and a server error, then succeeds", async () => {
  const answers = [() => { throw new Error("socket hang up"); }, () => response(503, null), () => response(200, SOURCE)];
  let calls = 0;
  const waits = [];
  const rows = await fetchTrmRows({
    fromDay: "2026-10-01",
    fetchFn: async () => answers[calls++](),
    sleep: async (ms) => waits.push(ms),
  });
  assert.equal(calls, 3);
  assert.deepEqual(rows, SOURCE);
  assert.equal(waits.length, 2);
  assert.ok(waits[1] > waits[0], "the wait grows between attempts");
});

test("fetchTrmRows gives up after its attempts and says why", async () => {
  let calls = 0;
  await assert.rejects(
    fetchTrmRows({ fromDay: "2026-10-01", retries: 3, fetchFn: async () => { calls++; return response(500, null); }, sleep: async () => {} }),
    /after 3 attempts.*500/,
  );
  assert.equal(calls, 3);
});

test("fetchTrmRows does not retry a client error", async () => {
  let calls = 0;
  await assert.rejects(
    fetchTrmRows({ fromDay: "2026-10-01", fetchFn: async () => { calls++; return response(404, null); }, sleep: async () => {} }),
    /404/,
  );
  assert.equal(calls, 1);
});

test("fetchTrmRows refuses an answer that is not an array or that hit the row limit", async () => {
  await assert.rejects(fetchTrmRows({ fromDay: "2026-10-01", fetchFn: async () => response(200, { error: "x" }), sleep: async () => {} }), /array/);
  const full = Array.from({ length: 3 }, () => SOURCE[0]);
  await assert.rejects(
    fetchTrmRows({ fromDay: "2026-10-01", limit: 3, fetchFn: async () => response(200, full), sleep: async () => {} }),
    /limit/,
  );
});

/* Step ---------------------------------------------------------------------- */

test("writes the daily series and a source file with no wall-clock time", async () => {
  const dir = dirOf(temp());
  const result = await updateRates({ dirUrl: dir, fromDay: "2026-10-01", fetchRows: ok(SOURCE), ...silent });
  assert.equal(result.used, "fetched");

  const csv = readFileSync(new URL("cop-usd.csv", dir), "utf8").trim().split("\n");
  assert.equal(csv[0], "day,cop_per_usd");
  assert.equal(csv.length, 1 + 7);
  assert.equal(csv[1], "2026-10-01,3000");
  assert.equal(csv.at(-1), "2026-10-07,3020");

  const source = JSON.parse(readFileSync(new URL("source.json", dir), "utf8"));
  assert.deepEqual(source, {
    dataset: "32sa-8pi3",
    url: "https://www.datos.gov.co/resource/32sa-8pi3.json",
    firstDay: "2026-10-01",
    lastDay: "2026-10-07",
    ranges: 3,
  });
});

test("a second run with the same data leaves both files byte for byte identical", async () => {
  const dir = dirOf(temp());
  await updateRates({ dirUrl: dir, fromDay: "2026-10-01", fetchRows: ok(SOURCE), ...silent });
  const read = () => ["cop-usd.csv", "source.json"].map((name) => readFileSync(new URL(name, dir), "utf8"));
  const first = read();
  await updateRates({ dirUrl: dir, fromDay: "2026-10-01", fetchRows: ok([...SOURCE].reverse()), ...silent });
  assert.deepEqual(read(), first);
});

test("a newly published range extends the series", async () => {
  const dir = dirOf(temp());
  await updateRates({ dirUrl: dir, fromDay: "2026-10-01", fetchRows: ok(SOURCE), ...silent });
  await updateRates({ dirUrl: dir, fromDay: "2026-10-01", fetchRows: ok([...SOURCE, row(3030, "2026-10-08", "2026-10-09")]), ...silent });
  const lines = readFileSync(new URL("cop-usd.csv", dir), "utf8").trim().split("\n");
  assert.equal(lines.at(-1), "2026-10-09,3030");
});

test("when the fetch fails and the committed file covers what the series needs, it warns and continues", async () => {
  const dir = dirOf(temp());
  await updateRates({ dirUrl: dir, fromDay: "2026-10-01", fetchRows: ok(SOURCE), ...silent });
  const before = readFileSync(new URL("cop-usd.csv", dir), "utf8");

  const warnings = [];
  const result = await updateRates({
    dirUrl: dir,
    fromDay: "2026-10-01",
    neededThrough: "2026-10-07",
    fetchRows: down,
    log: () => {},
    warn: (text) => warnings.push(text),
  });
  assert.equal(result.used, "committed");
  assert.match(warnings.join("\n"), /network down/);
  assert.equal(readFileSync(new URL("cop-usd.csv", dir), "utf8"), before);
});

test("when the fetch fails and the committed file stops short of a day the series needs, it fails", async () => {
  const dir = dirOf(temp());
  await updateRates({ dirUrl: dir, fromDay: "2026-10-01", fetchRows: ok(SOURCE), ...silent });
  await assert.rejects(
    updateRates({ dirUrl: dir, fromDay: "2026-10-01", neededThrough: "2026-10-08", fetchRows: down, ...silent }),
    /network down.*2026-10-07.*2026-10-08/s,
  );
});

test("when the fetch fails and there is no committed file, it fails", async () => {
  const dir = dirOf(temp());
  await assert.rejects(updateRates({ dirUrl: dir, fromDay: "2026-10-01", fetchRows: down, ...silent }), /network down/);
  assert.equal(existsSync(new URL("cop-usd.csv", dir)), false);
});

test("a committed file that starts after the first needed day is not enough", async () => {
  const path = temp();
  writeFileSync(join(path, "cop-usd.csv"), "day,cop_per_usd\n2026-10-03,3000\n2026-10-04,3000\n");
  await assert.rejects(
    updateRates({ dirUrl: dirOf(path), fromDay: "2026-10-01", fetchRows: down, ...silent }),
    /2026-10-03.*2026-10-01/s,
  );
});

test("a gap or a conflicting overlap in the source is an error, even with a good committed file", async () => {
  const dir = dirOf(temp());
  await updateRates({ dirUrl: dir, fromDay: "2026-10-01", fetchRows: ok(SOURCE), ...silent });
  const before = readFileSync(new URL("cop-usd.csv", dir), "utf8");

  const gap = [row(3000, "2026-10-01", "2026-10-03"), row(3020, "2026-10-06", "2026-10-07")];
  await assert.rejects(updateRates({ dirUrl: dir, fromDay: "2026-10-01", fetchRows: ok(gap), ...silent }), /gap/);

  const overlap = [row(3000, "2026-10-01", "2026-10-04"), row(3010, "2026-10-04", "2026-10-07")];
  await assert.rejects(updateRates({ dirUrl: dir, fromDay: "2026-10-01", fetchRows: ok(overlap), ...silent }), /overlap/);

  assert.equal(readFileSync(new URL("cop-usd.csv", dir), "utf8"), before, "nothing was overwritten");
});

test("creates the output directory when it does not exist", async () => {
  const base = temp();
  const dir = dirOf(join(base, "nested", "rates"));
  await updateRates({ dirUrl: dir, fromDay: "2026-10-01", fetchRows: ok(SOURCE), ...silent });
  assert.ok(existsSync(new URL("cop-usd.csv", dir)));
  mkdirSync(join(base, "keep"), { recursive: true });
});
