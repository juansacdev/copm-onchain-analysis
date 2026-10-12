// Route table: the single source for canonical URLs, hreflang alternates,
// the language switch and the main navigation. Plain JS, no Astro imports.

export const LANGS = ["es", "en"];
export const DEFAULT_LANG = "es";

export const ROUTES = {
  dashboard: { es: "/", en: "/en/" },
  analysis: { es: "/analisis", en: "/en/analysis" },
};

export function routePath(page, lang) {
  const entry = ROUTES[page];
  if (!entry) throw new Error(`unknown page "${page}"`);
  const path = entry[lang];
  if (path === undefined) throw new Error(`unknown language "${lang}"`);
  return path;
}

const NAV_ORDER = ["dashboard", "analysis"];

export function canonicalUrl(page, lang, site) {
  return new URL(routePath(page, lang), site).href;
}

// Both language versions of a page plus x-default, which is the default
// language. The same list is valid on every language version.
export function alternatesFor(page, site) {
  return [
    ...LANGS.map((lang) => ({ hreflang: lang, href: canonicalUrl(page, lang, site) })),
    { hreflang: "x-default", href: canonicalUrl(page, DEFAULT_LANG, site) },
  ];
}

// One entry per language, each pointing at the same page in that language.
export function languageSwitch(page, lang) {
  return LANGS.map((code) => ({
    lang: code,
    href: routePath(page, code),
    current: code === lang,
  }));
}

// Main navigation in the given language. `key` selects the label in the
// dictionary (`nav.<key>`).
export function navigation(lang, currentPage) {
  return NAV_ORDER.map((key) => ({
    key,
    href: routePath(key, lang),
    current: key === currentPage,
  }));
}
