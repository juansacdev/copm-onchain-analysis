// Writes data/rates/cop-usd.csv (one TRM per UTC day, ascending, no gaps) and
// data/rates/source.json. Every USD figure in the project divides COPM by the
// rate of its own day, so this runs before `aggregate`.
//
// The files hold nothing that depends on when the command ran, so a run with
// no new data leaves them byte for byte as they were.
//
// Official rates are immutable once published, so the committed file only ever
// grows. If the portal cannot be reached, answers nothing, or answers fewer
// days than the committed file holds, the run is treated as a failed fetch:
// when the committed file already covers every day the series needs, it warns
// and continues; otherwise it fails. A gap or a conflicting overlap in the
// source is always an error, and so is a published day whose rate differs from
// the committed one. Both files are written atomically, the CSV first and
// source.json last, so a reader that finds the new source.json finds its CSV.
import { existsSync } from "node:fs";
import { CHAIN_KEYS, RATES_FROM_DAY, dataPath, ratesDir } from "../config/chains.js";
import { TRM_BASE_URL, TRM_DATASET, fetchTrmRows, readRatesTable } from "../adapters/rates.js";
import { ensureDir, readText, writeTextAtomic } from "../adapters/store.js";
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
  try {
    rows = await fetchRows();
  } catch (err) {
    return fallBack({ dirUrl, fromDay, neededThrough, reason: err.message, log, warn });
  }
  if (Array.isArray(rows) && rows.length === 0) {
    return fallBack({ dirUrl, fromDay, neededThrough, reason: "the source returned no rows", log, warn });
  }

  // From here a problem is in the data itself and is never papered over.
  const ranges = parseTrmRows(rows).filter((r) => r.to >= fromDay);
  const series = expandRanges(ranges, { fromDay });
  const table = createRateTable(series);

  const committed = readRatesTable(dirUrl);
  if (committed) {
    assertSamePublishedRates(committed, table);
    // An answer that covers less than the file already holds is not a newer
    // truth, it is a partial one: keep the file.
    if (table.firstDay > committed.firstDay || table.lastDay < committed.lastDay) {
      const reason =
        `the source covers ${table.firstDay} to ${table.lastDay}, less than the committed file ` +
        `(${committed.firstDay} to ${committed.lastDay})`;
      return fallBack({ dirUrl, fromDay, neededThrough, reason, log, warn });
    }
  }

  ensureDir(dirUrl);
  writeTextAtomic(new URL("cop-usd.csv", dirUrl), ratesCsv(series));
  writeTextAtomic(
    new URL("source.json", dirUrl),
    `${JSON.stringify({ dataset: TRM_DATASET, url: TRM_BASE_URL, firstDay: table.firstDay, lastDay: table.lastDay, ranges: ranges.length }, null, 2)}\n`,
  );
  log(`rates: ${series.length} days, ${table.firstDay} to ${table.lastDay}, ${ranges.length} ranges`);
  return { used: "fetched", table };
}

// A day both files cover must carry the same rate: a published TRM does not change.
function assertSamePublishedRates(committed, fetched) {
  for (const { day, rate } of committed.rows) {
    if (day < fetched.firstDay || day > fetched.lastDay) continue;
    const now = fetched.at(day).rate;
    if (now !== rate) {
      throw new Error(`the rate of ${day} changed: the committed file has ${rate}, the source says ${now}`);
    }
  }
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
