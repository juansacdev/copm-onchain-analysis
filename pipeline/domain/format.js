// Number and money formatting shared by the Markdown reports and the site.
// Pure: no fs, no framework imports, no Intl, so any environment writes the
// same text. Spanish uses "." for thousands and "," for decimals.
//
// Spanish scale words: "millón" is 10^6, "mil millones" is 10^9 (written here
// as thousands of "millones") and "billón" is 10^12. English "billion" is 10^9.

export const LOCALES = {
  en: { group: ",", decimal: "." },
  es: { group: ".", decimal: "," },
};

export function assertLocale(locale) {
  const found = LOCALES[locale];
  if (!found) throw new Error(`unknown locale "${locale}"`);
  return found;
}

const show = (value) => (typeof value === "string" ? JSON.stringify(value) : String(value));

// Accepts a finite number or a BigInt; anything else is a caller bug.
function assertNumeric(fn, value) {
  const ok = typeof value === "bigint" || (typeof value === "number" && Number.isFinite(value));
  if (!ok) throw new Error(`${fn}: expected a finite number or bigint, got ${show(value)}`);
}

export const groupDigits = (digits, sep) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, sep);

// Fixed decimals with locale separators. The sign is handled apart so a value
// that rounds to zero never prints as "-0". `trim` drops trailing zeros. A
// BigInt is written exactly.
export function formatDecimal(value, digits, locale, { trim = false } = {}) {
  return formatFixed("formatDecimal", value, digits, locale, trim);
}

function formatFixed(fn, value, digits, locale, trim) {
  const { group, decimal } = assertLocale(locale);
  assertNumeric(fn, value);

  let whole;
  let frac;
  let negative;
  if (typeof value === "bigint") {
    negative = value < 0n;
    whole = (negative ? -value : value).toString();
    frac = "0".repeat(digits);
  } else {
    const fixed = Math.abs(value).toFixed(digits);
    [whole, frac = ""] = fixed.split(".");
    negative = value < 0 && Number(fixed) !== 0;
  }
  if (trim) frac = frac.replace(/0+$/, "");
  return (negative ? "-" : "") + groupDigits(whole, group) + (frac ? decimal + frac : "");
}

export const formatInt = (value, locale) => formatFixed("formatInt", value, 0, locale, false);

// Exact, rounded half up to 2 decimals, from a raw 18-decimal amount (BigInt).
export function formatCopmExact(wei, locale) {
  const { group, decimal } = assertLocale(locale);
  if (typeof wei !== "bigint") throw new Error(`formatCopmExact: expected a bigint, got ${show(wei)}`);
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

/* Compact amounts ---------------------------------------------------------- */

// A unit: the smallest magnitude it covers, how many decimals it shows (a
// number, or a function of the magnitude), its suffix and, in Spanish, the
// singular suffix used when the shown amount is exactly one.
const unit = (min, digits, suffix, one = null, div = min) => ({
  min,
  div,
  digits: typeof digits === "function" ? digits : () => digits,
  suffix,
  one,
});
const bare = () => unit(0, 0, "", null, 1);
const thousandsDigits = (a) => (a < 1e5 ? 1 : 0);
const millionsDigits = (a) => (a < 1e9 ? 1 : 0);

// Picks the largest unit that fits |v|, then checks the rounded text: a value
// that rounds up to 1,000 of its unit ("1,000K") belongs to the next unit up.
// `units` is ordered from the largest; the last one is the bare number. The
// sign is returned apart so a currency symbol can follow it.
function compact(v, units, locale, trim) {
  const a = Math.abs(v);
  let i = units.findIndex((u) => a >= u.min);
  const rounded = (k) => Number((a / units[k].div).toFixed(units[k].digits(a)));
  while (i > 0 && rounded(i) * units[i].div >= units[i - 1].min) i--;

  const u = units[i];
  const scaled = a / u.div;
  const body =
    u.one && rounded(i) === 1
      ? `1${u.one}`
      : formatFixed("compact", scaled, u.digits(a), locale, trim) + u.suffix;
  const negative = v < 0 && rounded(i) !== 0;
  return { sign: negative ? "-" : "", body };
}

const USD_UNITS = {
  en: {
    short: {
      prefix: "$",
      units: [
        unit(1e12, 1, "T"),
        unit(1e9, 2, "B"),
        unit(1e6, 1, "M"),
        unit(1e3, thousandsDigits, "K"),
        bare(),
      ],
    },
    long: {
      prefix: "US$",
      units: [
        unit(1e12, 1, " trillion"),
        unit(1e9, 2, " billion"),
        unit(1e6, 1, " million"),
        unit(1e3, thousandsDigits, " thousand"),
        bare(),
      ],
    },
  },
  es: {
    short: {
      prefix: "US$",
      units: [
        unit(1e12, 1, " billones", " billón"),
        unit(1e6, millionsDigits, " M"),
        unit(1e3, thousandsDigits, " mil"),
        bare(),
      ],
    },
    long: {
      prefix: "US$",
      units: [
        unit(1e12, 1, " billones", " billón"),
        unit(1e6, millionsDigits, " millones", " millón"),
        unit(1e3, thousandsDigits, " mil"),
        bare(),
      ],
    },
  },
};

// style "short": $2.18B / $318.4M / $96.4K (en), US$2.178 M / US$737 mil (es).
// style "long": words, for running text. `trim` drops zero decimals ("$30M").
export function formatUsd(value, locale, style = "short", { trim = false } = {}) {
  assertLocale(locale);
  assertNumeric("formatUsd", value);
  const table = USD_UNITS[locale][style];
  if (!table) throw new Error(`formatUsd: unknown style "${style}"`);
  const { sign, body } = compact(Number(value), table.units, locale, trim);
  return `${sign}${table.prefix}${body}`;
}

// A whole-dollar amount written in full.
export function formatUsdFull(value, locale) {
  assertLocale(locale);
  assertNumeric("formatUsdFull", value);
  const body = formatFixed("formatUsdFull", value, 0, locale, false);
  const prefix = locale === "es" ? "US$" : "$";
  return body.startsWith("-") ? `-${prefix}${body.slice(1)}` : `${prefix}${body}`;
}

const COPM_UNITS = {
  en: [unit(1e12, 3, "T"), unit(1e9, 2, "B"), unit(1e6, 1, "M"), bare()],
  es: [
    unit(1e12, 3, " billones", " billón"),
    unit(1e6, millionsDigits, " millones", " millón"),
    bare(),
  ],
};

// Whole-COPM amount (Number or BigInt) in T/B/M (en) or words (es), zero
// decimals trimmed.
export function formatCopmCompact(value, locale) {
  assertLocale(locale);
  assertNumeric("formatCopmCompact", value);
  const { sign, body } = compact(Number(value), COPM_UNITS[locale], locale, true);
  return sign + body;
}
