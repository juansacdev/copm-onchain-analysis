// Number, money and date formatting per locale. Deterministic and explicit
// (no Intl) so that a build in any environment writes the same text. Spanish
// uses "." for thousands and "," for decimals, as the repository reports do.

const LOCALES = {
  en: { group: ",", decimal: "." },
  es: { group: ".", decimal: "," },
};

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

function localeOf(locale) {
  const found = LOCALES[locale];
  if (!found) throw new Error(`unknown locale "${locale}"`);
  return found;
}

const groupDigits = (digits, sep) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, sep);

// Fixed decimals with locale separators. The sign is handled apart so a value
// that rounds to zero never prints as "-0".
export function formatDecimal(n, digits, locale) {
  const { group, decimal } = localeOf(locale);
  const fixed = Math.abs(n).toFixed(digits);
  const [whole, frac] = fixed.split(".");
  const sign = n < 0 && Number(fixed) !== 0 ? "-" : "";
  return sign + groupDigits(whole, group) + (frac ? decimal + frac : "");
}

export const formatInt = (n, locale) => formatDecimal(n, 0, locale);

export function formatPercent(n, digits, locale) {
  return `${formatDecimal(n, digits, locale)}${locale === "es" ? " %" : "%"}`;
}

const digitsForThousands = (abs) => (abs < 1e5 ? 1 : 0);

// style "short": $2.18B / $318.4M / $96.4K (en), US$2.178 M / US$737 mil (es).
// style "long": words, for running text.
export function formatUsd(value, locale, style = "short") {
  localeOf(locale);
  const abs = Math.abs(value);
  const f = (n, digits) => formatDecimal(n, digits, locale);

  if (locale === "en") {
    if (style === "long") {
      if (abs >= 1e9) return `US$${f(value / 1e9, 2)} billion`;
      if (abs >= 1e6) return `US$${f(value / 1e6, 1)} million`;
      if (abs >= 1e3) return `US$${f(value / 1e3, digitsForThousands(abs))} thousand`;
      return `US$${f(value, 0)}`;
    }
    if (abs >= 1e9) return `$${f(value / 1e9, 2)}B`;
    if (abs >= 1e6) return `$${f(value / 1e6, 1)}M`;
    if (abs >= 1e3) return `$${f(value / 1e3, digitsForThousands(abs))}K`;
    return `$${f(value, 0)}`;
  }

  const unit = style === "long" ? " millones" : " M";
  if (abs >= 1e6) return `US$${f(value / 1e6, abs < 1e9 ? 1 : 0)}${unit}`;
  if (abs >= 1e3) return `US$${f(value / 1e3, digitsForThousands(abs))} mil`;
  return `US$${f(value, 0)}`;
}

export function formatUsdFull(value, locale) {
  localeOf(locale);
  return `${locale === "es" ? "US$" : "$"}${formatDecimal(value, 0, locale)}`;
}

// Exact, rounded half up to 2 decimals, from a raw 18-decimal amount (BigInt).
export function formatCopmExact(wei, locale) {
  const { group, decimal } = localeOf(locale);
  const negative = wei < 0n;
  const abs = negative ? -wei : wei;
  const hundredths = (abs + 5n * 10n ** 15n) / 10n ** 16n;
  const whole = hundredths / 100n;
  const cents = hundredths % 100n;
  return (
    (negative ? "-" : "") +
    groupDigits(whole.toString(), group) +
    decimal +
    cents.toString().padStart(2, "0")
  );
}

function monthName(month, locale) {
  const index = Number(month) - 1;
  const name = MONTHS[locale]?.[index];
  if (!name) throw new Error(`invalid month "${month}"`);
  return name;
}

// "2025-11" -> "noviembre de 2025" / "November 2025"
export function formatMonth(key, locale) {
  localeOf(locale);
  const [year, month] = key.split("-");
  const name = monthName(month, locale);
  return locale === "es" ? `${name} de ${year}` : `${name} ${year}`;
}

// "2025-11" -> "nov 2025" / "Nov 2025"
export function formatMonthShort(key, locale) {
  localeOf(locale);
  const [year, month] = key.split("-");
  const name = monthName(month, locale).slice(0, 3);
  return `${locale === "es" ? name.toLowerCase() : name} ${year}`;
}

// "2025-11-24" -> "24 de noviembre de 2025" / "November 24, 2025"
export function formatDate(iso, locale) {
  localeOf(locale);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error(`invalid date "${iso}"`);
  const [year, month, day] = iso.split("-");
  const name = monthName(month, locale);
  return locale === "es"
    ? `${Number(day)} de ${name} de ${year}`
    : `${name} ${Number(day)}, ${year}`;
}
