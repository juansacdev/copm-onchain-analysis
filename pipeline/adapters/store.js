import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

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
