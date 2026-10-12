import { createRateTable } from "../../pipeline/domain/rates.js";

const DAY_MS = 86_400_000;

// A rate table of consecutive days: `rates` are the values from `from` on
// (one per day). Days past the end are provisional, as in production.
export function rateTable(from, rates) {
  const start = Date.parse(`${from}T00:00:00Z`);
  return createRateTable(
    rates.map((rate, k) => ({ day: new Date(start + k * DAY_MS).toISOString().slice(0, 10), rate })),
  );
}

// The same rate on every day from `from` for `days` days.
export const flatRates = (rate, { from = "2023-01-01", days = 2600 } = {}) =>
  rateTable(from, Array.from({ length: days }, () => rate));
