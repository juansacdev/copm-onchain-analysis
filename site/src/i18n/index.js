import { es } from "./es.js";
import { en } from "./en.js";
import { dashboardEs } from "./dashboard-es.js";
import { dashboardEn } from "./dashboard-en.js";
import { interpolate } from "../lib/template.js";

export const dictionaries = { es, en };

// The dashboard keeps its own pair: the analysis page renders its whole
// dictionary against its own variables, so the two must not share a file.
export const dashboardDictionaries = { es: dashboardEs, en: dashboardEn };

// { a: { b: "x" }, list: ["y"] } -> { "a.b": "x", "list.0": "y" }
export function flattenDictionary(node, prefix = "") {
  if (typeof node === "string") return { [prefix]: node };
  const out = {};
  for (const [key, child] of Object.entries(node)) {
    Object.assign(out, flattenDictionary(child, prefix ? `${prefix}.${key}` : key));
  }
  return out;
}

// Same shape, every string interpolated with the page variables. A missing
// variable throws, so a dictionary can never print an empty placeholder.
export function renderDictionary(node, vars) {
  if (typeof node === "string") return interpolate(node, vars);
  if (Array.isArray(node)) return node.map((child) => renderDictionary(child, vars));
  return Object.fromEntries(
    Object.entries(node).map(([key, child]) => [key, renderDictionary(child, vars)]),
  );
}
