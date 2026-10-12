import {
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  existsSync,
  writeFileSync,
} from "node:fs";
import { newApprovals } from "../domain/approvals.js";

// Thin file helpers shared by the steps. All locations are file URLs built by
// config/chains.js.
export const ensureDir = (dirUrl) => mkdirSync(dirUrl, { recursive: true });

export const readText = (url) => readFileSync(url, "utf8");
export const writeText = (url, text) => writeFileSync(url, text);

export const readJson = (url) => JSON.parse(readText(url));
export const writeJson = (url, value, space) =>
  writeText(url, JSON.stringify(value, null, space));

export const readJsonl = (url) =>
  readText(url)
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

// Temp file plus rename: a crash leaves either the old file or the new one,
// never half of each.
function writeAtomic(url, text) {
  const tmp = new URL(`${url.href}.tmp`);
  writeFileSync(tmp, text);
  renameSync(tmp, url);
}

const toJsonl = (rows) => rows.map((row) => `${JSON.stringify(row)}\n`).join("");
const readJsonIfExists = (url, fallback) => (existsSync(url) ? readJson(url) : fallback);

// Everything a scan persists for one chain, under data/<chain>/:
//   transfers/YYYY-MM.jsonl, admin-events.jsonl, approvals.json, state.json
// plus the holders snapshot (holders.csv, holders.json) taken at its checkpoint.
// state.json is written last, so its presence at a given lastBlock is the
// proof that everything before it is complete.
export function createStore(dirUrl) {
  const transfersDir = new URL("transfers/", dirUrl);
  const partitionUrl = (key) => new URL(`${key}.jsonl`, transfersDir);
  const stateUrl = new URL("state.json", dirUrl);
  const adminUrl = new URL("admin-events.jsonl", dirUrl);
  const approvalsUrl = new URL("approvals.json", dirUrl);
  const holdersCsvUrl = new URL("holders.csv", dirUrl);
  const holdersJsonUrl = new URL("holders.json", dirUrl);

  const listPartitions = () =>
    existsSync(transfersDir)
      ? readdirSync(transfersDir)
          .filter((name) => /^\d{4}-\d{2}\.jsonl$/.test(name))
          .map((name) => name.slice(0, 7))
          .sort()
      : [];

  const readPartition = (key) =>
    existsSync(partitionUrl(key)) ? readJsonl(partitionUrl(key)) : [];

  return {
    readState: () => readJsonIfExists(stateUrl, null),
    writeState(state) {
      ensureDir(dirUrl);
      writeAtomic(stateUrl, `${JSON.stringify(state, null, 2)}\n`);
    },

    listPartitions,
    readPartition,
    writePartition(key, rows) {
      if (rows.length === 0) {
        rmSync(partitionUrl(key), { force: true });
        return;
      }
      ensureDir(transfersDir);
      writeAtomic(partitionUrl(key), toJsonl(rows));
    },
    readTransfers: () => listPartitions().flatMap(readPartition),

    readAdminEvents: () => (existsSync(adminUrl) ? readJsonl(adminUrl) : []),
    writeAdminEvents(rows) {
      ensureDir(dirUrl);
      writeAtomic(adminUrl, toJsonl(rows));
    },

    readApprovals: () => readJsonIfExists(approvalsUrl, newApprovals()),
    writeApprovals(approvals) {
      ensureDir(dirUrl);
      writeAtomic(approvalsUrl, `${JSON.stringify(approvals, null, 2)}\n`);
    },

    readHolders: () => ({
      csv: existsSync(holdersCsvUrl) ? readText(holdersCsvUrl) : null,
      json: readJsonIfExists(holdersJsonUrl, null),
    }),
    // The json goes last: a reader that finds it at the checkpoint block also
    // finds the csv of the same snapshot.
    writeHolders({ csv, json }) {
      ensureDir(dirUrl);
      writeAtomic(holdersCsvUrl, csv);
      writeAtomic(holdersJsonUrl, `${JSON.stringify(json, null, 2)}\n`);
    },

    // --fresh: only the scan outputs go; manifest and legacy files stay.
    clear() {
      rmSync(transfersDir, { recursive: true, force: true });
      for (const url of [adminUrl, approvalsUrl, stateUrl, holdersCsvUrl, holdersJsonUrl]) rmSync(url, { force: true });
    },
  };
}
