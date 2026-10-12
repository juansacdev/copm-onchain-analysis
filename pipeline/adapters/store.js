import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
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
// Temp file, flush, rename: a crash leaves the old file or the new one whole.
export const writeTextAtomic = (url, text) => writeAtomic(url, text);

export const readJson = (url) => JSON.parse(readText(url));
export const writeJson = (url, value, space) =>
  writeText(url, JSON.stringify(value, null, space));

export const readJsonl = (url) =>
  readText(url)
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

// Temp file plus rename: a crash leaves either the old file or the new one,
// never half of each. The temp file is flushed before the rename, because a
// rename that reaches the disk ahead of the data would, after a power loss,
// leave an empty or truncated file under the final name. The directory is
// flushed after it so the rename itself survives too.
function writeAtomic(url, text) {
  const tmp = new URL(`${url.href}.tmp`);
  const fd = openSync(tmp, "w");
  try {
    writeFileSync(fd, text);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, url);
  syncDirectory(new URL("./", url));
}

// Best effort: Windows cannot open a directory for reading, and some
// filesystems refuse fsync on one. There the rename stays as durable as the
// platform makes it, which is no worse than before.
function syncDirectory(dirUrl) {
  let fd;
  try {
    fd = openSync(dirUrl, "r");
    fsyncSync(fd);
  } catch {
    // not supported here; see above
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
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

  const readState = () => readJsonIfExists(stateUrl, null);

  return {
    readState,
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
    // Raw partitions, leftovers included: only validate's no-row-above-checkpoint
    // rule reads them this way, so it can report them.
    readTransfers: () => listPartitions().flatMap(readPartition),
    // What every other reader works from. A scan that crashed between the
    // partition write and the state write leaves rows above the checkpoint;
    // they belong to a stage that was never verified against totalSupply.
    readTransfersAtCheckpoint() {
      const state = readState();
      if (!state) throw new Error("no state.json: run scan first");
      return listPartitions()
        .flatMap(readPartition)
        .filter((row) => row.b <= state.lastBlock);
    },

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
