// Fills the figure markers of the Markdown reports from the data files.
//
//   node pipeline/cli.js reports           rewrites the files
//   node pipeline/cli.js reports --check   writes nothing; exit 1 if any
//                                          figure is out of date
//
// Every figure in the reports is a marker (see domain/report.js), so a report
// can only say what the data says. The locale of a file comes from its name:
// *.es.md is Spanish, anything else English.
import { existsSync } from "node:fs";
import { CHAIN_KEYS, copPerUsd as configuredCopPerUsd, repoRoot } from "../config/chains.js";
import { readJson, readJsonl, readText, writeText } from "../adapters/store.js";
import { parseDailyCsv } from "../charts/chartlib.js";
import { buildFigures, rewriteMarkers } from "../domain/report.js";

export const REPORT_FILES = [
  "README.md",
  "README.es.md",
  "docs/AUDIT.md",
  "docs/AUDIT.es.md",
  "docs/EVENTS.md",
  "docs/EVENTS.es.md",
  "docs/GLOSSARY.md",
  "docs/GLOSSARY.es.md",
  "docs/audit/polygon.md",
  "docs/audit/polygon.es.md",
  "docs/audit/celo.md",
  "docs/audit/celo.es.md",
];

export const localeOf = (file) => (file.endsWith(".es.md") ? "es" : "en");

function readData(root, chainKey, name, read) {
  const rel = `data/${chainKey}/${name}`;
  const url = new URL(rel, root);
  if (!existsSync(url)) throw new Error(`missing ${rel}: run the pipeline for ${chainKey} first`);
  try {
    return read(url);
  } catch (err) {
    throw new Error(`cannot read ${rel}: ${err.message}`);
  }
}

export function loadChainData(root, chainKey) {
  const data = (name, read) => readData(root, chainKey, name, read);
  return {
    summary: data("summary.json", readJson),
    state: data("state.json", readJson),
    holders: data("holders.json", readJson),
    manifest: data("manifest.json", readJson),
    validation: data("validation.json", readJson),
    adminEvents: data("admin-events.jsonl", readJsonl),
    daily: data("daily.csv", (url) => parseDailyCsv(readText(url))),
  };
}

// Returns { changes: [{ file, key, before, after }] }. With `check` nothing is
// written. Nothing is written either when any file fails, so a bad marker in
// one file never leaves the set half updated.
export function runReports({
  root = repoRoot(),
  files = REPORT_FILES,
  copPerUsd = configuredCopPerUsd(),
  check = false,
  log = console.log,
} = {}) {
  const chains = Object.fromEntries(CHAIN_KEYS.map((key) => [key, loadChainData(root, key)]));
  const figures = buildFigures({ copPerUsd, chains });

  const updates = [];
  for (const file of files) {
    const url = new URL(file, root);
    if (!existsSync(url)) throw new Error(`${file}: file not found`);
    try {
      const result = rewriteMarkers(readText(url), figures, localeOf(file));
      updates.push({ file, url, ...result });
    } catch (err) {
      throw new Error(`${file}: ${err.message}`);
    }
  }

  const changes = updates.flatMap((u) => u.changes.map((c) => ({ file: u.file, ...c })));
  if (!check) {
    for (const u of updates) if (u.changes.length > 0) writeText(u.url, u.text);
  }

  for (const c of changes) log(`${check ? "stale" : "updated"} ${c.file} ${c.key}: ${c.before} -> ${c.after}`);
  log(
    check
      ? `${changes.length} figure(s) out of date in ${new Set(changes.map((c) => c.file)).size} file(s)`
      : `${changes.length} figure(s) updated in ${new Set(changes.map((c) => c.file)).size} file(s)`
  );
  return { changes };
}

export async function run({ check = false, env = process.env }) {
  const { changes } = runReports({ check, copPerUsd: configuredCopPerUsd(env) });
  return { exitCode: check && changes.length > 0 ? 1 : 0 };
}
