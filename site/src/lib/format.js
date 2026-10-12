// Number, money and date formatting per locale. Deterministic and explicit
// (no Intl) so that a build in any environment writes the same text. Spanish
// uses "." for thousands and "," for decimals, as the repository reports do.
// Dates and months live here; numbers and money are shared with the reports.

import {
  assertLocale,
  formatCopmExact,
  formatDecimal,
  formatInt,
  formatUsd,
  formatUsdFull,
} from "../../../pipeline/domain/format.js";

// Numbers and money come from the module shared with the Markdown reports.
export { formatCopmExact, formatDecimal, formatInt, formatUsd, formatUsdFull };

const MONTHS = {
  en: [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ],
  es: [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ],
};

export function formatPercent(n, digits, locale) {
  return `${formatDecimal(n, digits, locale)}${locale === "es" ? " %" : "%"}`;
}

function monthName(month, locale) {
  const index = Number(month) - 1;
  const name = MONTHS[locale]?.[index];
  if (!name) throw new Error(`invalid month "${month}"`);
  return name;
}

// "2025-11" -> "noviembre de 2025" / "November 2025"
export function formatMonth(key, locale) {
  assertLocale(locale);
  const [year, month] = key.split("-");
  const name = monthName(month, locale);
  return locale === "es" ? `${name} de ${year}` : `${name} ${year}`;
}

// "2025-11" -> "nov 2025" / "Nov 2025"
export function formatMonthShort(key, locale) {
  assertLocale(locale);
  const [year, month] = key.split("-");
  const name = monthName(month, locale).slice(0, 3);
  return `${locale === "es" ? name.toLowerCase() : name} ${year}`;
}

// "2025-11-24" -> "24 de noviembre de 2025" / "November 24, 2025"
export function formatDate(iso, locale) {
  assertLocale(locale);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error(`invalid date "${iso}"`);
  const [year, month, day] = iso.split("-");
  const name = monthName(month, locale);
  return locale === "es"
    ? `${Number(day)} de ${name} de ${year}`
    : `${name} ${Number(day)}, ${year}`;
}
