import { test } from "node:test";
import assert from "node:assert/strict";
import { fig, rewriteMarkers } from "../pipeline/domain/report.js";

const figures = {
  "polygon.transfers": fig.int(241858),
  "celo.transfers": fig.int(132944),
  "polygon.grossVolumeUsd": fig.usd(2_165_160_786.5),
};
const mark = (key, content) => `<!-- copm:${key} -->${content}<!-- /copm -->`;

test("rewrites a marker inline and keeps the surrounding text", () => {
  const { text, changes } = rewriteMarkers(`so ${mark("polygon.transfers", "1")} events.`, figures, "en");
  assert.equal(text, `so ${mark("polygon.transfers", "241,858")} events.`);
  assert.deepEqual(changes, [{ key: "polygon.transfers", before: "1", after: "241,858" }]);
});

test("works inside a table cell and inside bold", () => {
  const input = `| Events | **${mark("polygon.transfers", "x")}** | ${mark("celo.transfers", "y")} |`;
  const { text } = rewriteMarkers(input, figures, "en");
  assert.equal(
    text,
    `| Events | **${mark("polygon.transfers", "241,858")}** | ${mark("celo.transfers", "132,944")} |`
  );
});

test("handles a repeated key and adjacent markers", () => {
  const input = `${mark("polygon.transfers", "")}${mark("celo.transfers", "")} ${mark("polygon.transfers", "")}`;
  const { text } = rewriteMarkers(input, figures, "en");
  assert.equal(
    text,
    `${mark("polygon.transfers", "241,858")}${mark("celo.transfers", "132,944")} ${mark("polygon.transfers", "241,858")}`
  );
});

test("formats for the locale it is given", () => {
  const input = `${mark("polygon.transfers", "x")} ${mark("polygon.grossVolumeUsd", "x")}`;
  assert.equal(
    rewriteMarkers(input, figures, "es").text,
    `${mark("polygon.transfers", "241.858")} ${mark("polygon.grossVolumeUsd", "US$2.165 millones")}`
  );
});

test("is idempotent: a second pass reports no change", () => {
  const first = rewriteMarkers(`a ${mark("polygon.transfers", "")} b`, figures, "en");
  const second = rewriteMarkers(first.text, figures, "en");
  assert.equal(second.text, first.text);
  assert.deepEqual(second.changes, []);
});

test("text without markers is returned untouched", () => {
  const input = "Plain text, 317,696 typed by hand, `code`, <!-- a comment -->.\n";
  assert.deepEqual(rewriteMarkers(input, figures, "en"), { text: input, changes: [] });
});

test("an unknown key is an error that names the key and the line", () => {
  assert.throws(
    () => rewriteMarkers(`ok\n${mark("polygon.nope", "1")}`, figures, "en"),
    /unknown figure "polygon\.nope".*line 2/
  );
});

test("an unclosed marker is an error that names the line", () => {
  assert.throws(
    () => rewriteMarkers("a\nb <!-- copm:polygon.transfers -->12", figures, "en"),
    /unclosed marker.*line 2/
  );
});

test("a marker opened inside another one is an unclosed marker", () => {
  assert.throws(
    () =>
      rewriteMarkers(
        "<!-- copm:polygon.transfers -->1 <!-- copm:celo.transfers -->2<!-- /copm -->",
        figures,
        "en"
      ),
    /unclosed marker.*line 1/
  );
});

test("a closing tag with no opening tag is an error", () => {
  assert.throws(() => rewriteMarkers("1<!-- /copm -->", figures, "en"), /stray closing.*line 1/);
});

test("a well-formed marker is accepted, with other HTML comments around it", () => {
  const input = `<!-- note --> ${mark("polygon.transfers", "")} <!-- another one -->`;
  assert.doesNotThrow(() => rewriteMarkers(input, figures, "en"));
});

test("a malformed marker is an error that names the line, never skipped", () => {
  const cases = {
    "no spaces": "ok\n<!--copm:polygon.transfers-->x<!--/copm-->",
    "double space": "ok\n<!--  copm:polygon.transfers -->x<!-- /copm -->",
    "closing tag without spaces": `ok\n${mark("polygon.transfers", "x").replace("<!-- /copm -->", "<!--/copm-->")}`,
    "split across lines": "ok\n<!-- copm:polygon.transfers\n-->x<!-- /copm -->",
    "never terminated": "ok\n<!-- copm:polygon.transfers",
  };
  for (const [name, input] of Object.entries(cases)) {
    assert.throws(() => rewriteMarkers(input, figures, "en"), /malformed marker.*line 2/s, name);
  }
});
