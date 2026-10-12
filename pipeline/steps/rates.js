// Writes data/rates/cop-usd.csv (one TRM per UTC day, ascending, no gaps) and
// data/rates/source.json. Every USD figure in the project divides COPM by the
// rate of its own day, so this runs before `aggregate`.
//
// The files hold nothing that depends on when the command ran, so a run with
// no new data leaves them byte for byte as they were.
//
// If the portal cannot be reached and the committed file already covers every
// day the series needs, the run warns and continues; otherwise it fails. A gap
// or a conflicting overlap in the source is always an error.
import { existsSync } from "node:fs";
import { CHAIN_KEYS, RATES_FROM_DAY, dataPath, ratesDir } from "../config/chains.js";
import { TRM_BASE_URL, TRM_DATASET, fetchTrmRows, readRatesTable } from "../adapters/rates.js";
import { ensureDir, readText, writeText } from "../adapters/store.js";
import { createRateTable, expandRanges, parseTrmRows, ratesCsv } from "../domain/rates.js";

const lastLineDay = (url) => readText(url).trimEnd().split("\n").at(-1).slice(0, 10);

// The latest day any chain's daily series reaches, or null before the first
// aggregate. Days past the last published rate are provisional, so the file
// must already cover this day for a failed fetch to be harmless.
export function neededThroughDay(chainKeys = CHAIN_KEYS) {
  const days = chainKeys
    .map((key) => dataPath(key, "daily.csv"))
    .filter((url) => existsSync(url))
    .map(lastLineDay);
  return days.length === 0 ? null : days.sort().at(-1);
}

export async function updateRates({
  dirUrl,
  fromDay = RATES_FROM_DAY,
  neededThrough = null,
  fetchRows = () => fetchTrmRows({ fromDay }),
  log = console.log,
  warn = console.warn,
}) {
  let rows;
  let ranges;
  try {
    rows = await fetchRows();
  } catch (err) {
    return fallBack({ dirUrl, fromDay, neededThrough, reason: err.message, log, warn });
  }

  // From here a problem is in the data itself and is never papered over.
  ranges = parseTrmRows(rows).filter((r) => r.to >= fromDay);
  const series = expandRanges(ranges, { fromDay });
  const table = createRateTable(series);

  ensureDir(dirUrl);
  writeText(new URL("cop-usd.csv", dirUrl), ratesCsv(series));
  writeText(
    new URL("source.json", dirUrl),
    `${JSON.stringify({ dataset: TRM_DATASET, url: TRM_BASE_URL, firstDay: table.firstDay, lastDay: table.lastDay, ranges: ranges.length }, null, 2)}\n`,
  );
  log(`rates: ${series.length} days, ${table.firstDay} to ${table.lastDay}, ${ranges.length} ranges`);
  return { used: "fetched", table };
}

function fallBack({ dirUrl, fromDay, neededThrough, reason, log, warn }) {
  const table = readRatesTable(dirUrl);
  if (!table) throw new Error(`cannot fetch the rates (${reason}) and there is no committed data/rates/cop-usd.csv`);
  if (table.firstDay > fromDay) {
    throw new Error(
      `cannot fetch the rates (${reason}) and the committed file starts on ${table.firstDay}, after ${fromDay}`,
    );
  }
  if (neededThrough && table.lastDay < neededThrough) {
    throw new Error(
      `cannot fetch the rates (${reason}) and the committed file ends on ${table.lastDay}, ` +
        `before ${neededThrough}, which the series needs`,
    );
  }
  warn(`warning: cannot fetch the rates (${reason}); using the committed file, which ends on ${table.lastDay}`);
  log(`rates: ${table.rows.length} days, ${table.firstDay} to ${table.lastDay}, from the committed file`);
  return { used: "committed", table };
}

export async function run() {
  await updateRates({ dirUrl: ratesDir(), neededThrough: neededThroughDay() });
}
