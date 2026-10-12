import { test } from "node:test";
import assert from "node:assert/strict";
import { ROUTES, alternatesFor, canonicalUrl, languageSwitch, navigation, routePath } from "../../site/src/lib/routes.js";

test("routePath gives the path of every page in every language", () => {
  assert.equal(routePath("dashboard", "es"), "/");
  assert.equal(routePath("dashboard", "en"), "/en/");
  assert.equal(routePath("analysis", "es"), "/analisis/");
  assert.equal(routePath("analysis", "en"), "/en/analysis/");
});

test("routePath rejects an unknown page or language", () => {
  assert.throws(() => routePath("pricing", "es"), /unknown page "pricing"/);
  assert.throws(() => routePath("analysis", "fr"), /unknown language "fr"/);
});

test("every route ends with a slash, as the built directories are served", () => {
  for (const [page, paths] of Object.entries(ROUTES)) {
    for (const [lang, path] of Object.entries(paths)) {
      assert.ok(path.startsWith("/") && path.endsWith("/"), `${page}/${lang}: ${path}`);
    }
  }
});

const SITE = "https://copm.juansac.dev";
const PAGES = ["dashboard", "analysis"];

test("the language switch points at the counterpart of the current page", () => {
  assert.deepEqual(languageSwitch("analysis", "es"), [
    { lang: "es", href: "/analisis/", current: true },
    { lang: "en", href: "/en/analysis/", current: false },
  ]);
  assert.deepEqual(languageSwitch("analysis", "en"), [
    { lang: "es", href: "/analisis/", current: false },
    { lang: "en", href: "/en/analysis/", current: true },
  ]);
  assert.deepEqual(languageSwitch("dashboard", "es"), [
    { lang: "es", href: "/", current: true },
    { lang: "en", href: "/en/", current: false },
  ]);
  assert.deepEqual(languageSwitch("dashboard", "en"), [
    { lang: "es", href: "/", current: false },
    { lang: "en", href: "/en/", current: true },
  ]);
});

test("canonical is the absolute URL of the current page in the current language", () => {
  assert.equal(canonicalUrl("analysis", "es", SITE), "https://copm.juansac.dev/analisis/");
  assert.equal(canonicalUrl("analysis", "en", SITE), "https://copm.juansac.dev/en/analysis/");
  assert.equal(canonicalUrl("dashboard", "es", SITE), "https://copm.juansac.dev/");
  assert.equal(canonicalUrl("dashboard", "en", SITE), "https://copm.juansac.dev/en/");
});

test("hreflang alternates list both languages and x-default (Spanish) for every page", () => {
  for (const page of PAGES) {
    assert.deepEqual(alternatesFor(page, SITE), [
      { hreflang: "es", href: canonicalUrl(page, "es", SITE) },
      { hreflang: "en", href: canonicalUrl(page, "en", SITE) },
      { hreflang: "x-default", href: canonicalUrl(page, "es", SITE) },
    ], page);
  }
  assert.equal(alternatesFor("analysis", SITE)[1].href, "https://copm.juansac.dev/en/analysis/");
});

test("navigation lists Dashboard and Analysis in the current language and marks the current page", () => {
  assert.deepEqual(navigation("en", "analysis"), [
    { key: "dashboard", href: "/en/", current: false },
    { key: "analysis", href: "/en/analysis/", current: true },
  ]);
  assert.deepEqual(navigation("es", "dashboard"), [
    { key: "dashboard", href: "/", current: true },
    { key: "analysis", href: "/analisis/", current: false },
  ]);
});

test("base URL with a path or trailing slash does not break absolute URLs", () => {
  assert.equal(canonicalUrl("analysis", "es", `${SITE}/`), "https://copm.juansac.dev/analisis/");
});
