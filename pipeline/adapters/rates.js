// Fetches the TRM from the open data portal (Socrata dataset 32sa-8pi3, no API
// key) and reads the committed rates file. The network call is injected
// (`fetchFn`) so tests never touch the network.
import { existsSync } from "node:fs";
import { createRateTable, parseRatesCsv } from "../domain/rates.js";
import { readText } from "./store.js";

export const TRM_DATASET = "32sa-8pi3";
export const TRM_BASE_URL = `https://www.datos.gov.co/resource/${TRM_DATASET}.json`;
export const TRM_LIMIT = 5000;

// Ranges that end on or after `fromDay`, oldest first.
export function trmUrl(fromDay, limit = TRM_LIMIT) {
  const where = encodeURIComponent(`vigenciahasta >= '${fromDay}T00:00:00'`);
  return `${TRM_BASE_URL}?$where=${where}&$order=vigenciadesde&$limit=${limit}`;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A 4xx answer will not change by asking again; 429 and 5xx might.
const retryable = (status) => status === 429 || status >= 500;

export async function fetchTrmRows({
  fromDay,
  fetchFn = fetch,
  retries = 3,
  timeoutMs = 20_000,
  limit = TRM_LIMIT,
  sleep = wait,
}) {
  const url = trmUrl(fromDay, limit);
  let reason = "no attempt was made";
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: "application/json" } });
      if (!res.ok) {
        reason = `HTTP ${res.status}`;
        if (!retryable(res.status)) throw new Error(`TRM source answered ${reason}`);
      } else {
        const rows = await res.json();
        if (!Array.isArray(rows)) throw new Error("TRM source did not answer an array of rows");
        if (rows.length >= limit) throw new Error(`TRM source returned ${rows.length} rows, the limit: the answer may be cut`);
        return rows;
      }
    } catch (err) {
      if (err?.message?.startsWith("TRM source")) throw err;
      reason = err?.message ?? String(err);
    }
    if (attempt < retries) await sleep(500 * 2 ** (attempt - 1));
  }
  throw new Error(`TRM source unreachable after ${retries} attempts: ${reason}`);
}

// The committed series as a rate table, or null when there is no file.
export function readRatesTable(dirUrl) {
  const url = new URL("cop-usd.csv", dirUrl);
  if (!existsSync(url)) return null;
  return createRateTable(parseRatesCsv(readText(url)));
}

// The rate table every USD figure needs; the message names the command that
// writes it.
export function requireRatesTable(dirUrl) {
  const table = readRatesTable(dirUrl);
  if (!table) throw new Error('missing data/rates/cop-usd.csv: run "rates" first');
  return table;
}
