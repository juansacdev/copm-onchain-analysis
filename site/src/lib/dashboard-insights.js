// The sentences of the dashboard. Each one states a fact about the data with
// its figures, and each exists only while the data supports it: a template is
// chosen by the data (one recipient or several, above the peak or below it,
// paused now or never) and a sentence with nothing to say is not produced at
// all. Nothing here is typed text; the wording lives in the dictionaries and
// reaches this module through `render(key, vars)`.
//
// Plain JS, no Astro imports, so node --test can run it.
import { formatDate, formatDecimal, formatInt, formatUsd } from "./format.js";
import { shortAddress } from "./links.js";

const CHAIN_KEYS = ["polygon", "celo"];
const DOMINANT_SHARE = 50;

function makeFormatters(lang) {
  const percent = (n, { digits = 0, trim = true, sign = false } = {}) => {
    const body = formatDecimal(sign ? Math.abs(n) : n, digits, lang, { trim });
    const prefix = sign ? (n > 0 ? "+" : n < 0 ? "-" : "") : "";
    return `${prefix}${body}${lang === "es" ? " %" : "%"}`;
  };
  return {
    // Amounts arrive in USD, valued day by day by the pipeline.
    usd: (amount) => formatUsd(amount, lang, "long", { trim: true }),
    int: (n) => formatInt(n, lang),
    decimal: (n, digits) => formatDecimal(n, digits, lang),
    date: (iso) => formatDate(iso, lang),
    percent,
    signed: (n) => percent(n, { digits: 1, trim: false, sign: true }),
  };
}

const countEvents = (events, name) => events.filter((e) => e.name === name);

// chains: { polygon: dashboard.json, celo: dashboard.json }
// validations: { polygon: validation.json, celo: validation.json }
// names: { polygon, celo, all } display names. render(key, vars) -> text.
export function buildInsights({ chains, validations, lang, names, render, notAvailable = "n/a" }) {
  const f = makeFormatters(lang);
  const out = [];
  const keys = CHAIN_KEYS.filter((key) => chains[key]);
  const add = (id, section, show, key, vars) => out.push({ id, section, show, key, vars, text: render(key, vars) });
  const perChain = (key) => ["both", key];
  const asOfOf = (key) => f.date(new Date(chains[key].checkpoint.time * 1000).toISOString().slice(0, 10));

  // How much is there?
  // The dollar amounts are the pipeline's per-day sums (flows.usd); the
  // turnover is a ratio of COPM and does not depend on the rate.
  const turnoverVars = (name, usd, turnover) => ({
    chain: name,
    gross: f.usd(usd.gross),
    minted: f.usd(usd.minted),
    burned: f.usd(usd.burned),
    wallet: f.usd(usd.wallet),
    turnover: f.decimal(turnover, 1),
  });
  const sum = (pick) => keys.reduce((total, key) => total + pick(chains[key]), 0);
  const allCopm = { minted: sum((c) => c.flows.minted), gross: sum((c) => c.flows.gross) };
  const allUsd = {
    minted: sum((c) => c.flows.usd.minted),
    burned: sum((c) => c.flows.usd.burned),
    wallet: sum((c) => c.flows.usd.wallet),
    gross: sum((c) => c.flows.usd.gross),
  };
  if (keys.length > 1 && allCopm.minted > 0) {
    add("turnover-all", "supply", ["both"], "turnover", turnoverVars(names.all, allUsd, allCopm.gross / allCopm.minted));
  }
  for (const key of keys) {
    const flows = chains[key].flows;
    if (flows.turnover !== null) add(`turnover-${key}`, "supply", [key], "turnover", turnoverVars(names[key], flows.usd, flows.turnover));
  }
  for (const key of keys) {
    const { supplyPeak, checkpoint } = chains[key];
    if (!supplyPeak) continue;
    const current = checkpoint.totalSupply;
    const vars = { chain: names[key], asOf: asOfOf(key), current: f.usd(checkpoint.totalSupplyUsd), peak: f.usd(supplyPeak.usd), date: f.date(supplyPeak.day) };
    if (current >= supplyPeak.copm) add(`supply-${key}`, "supply", perChain(key), "supplyAtPeak", vars);
    else add(`supply-${key}`, "supply", perChain(key), "supplyBelowPeak", { ...vars, pct: f.percent((current / supplyPeak.copm) * 100) });
  }
  for (const key of keys) {
    const { mint, burn } = chains[key].issuance;
    const party = (side, id, single, spread) => {
      if (side.addresses === 0) return;
      const vars = { chain: names[key], share: f.percent(side.topSharePct, { digits: 1 }), count: f.int(side.addresses), address: shortAddress(side.top[0].address) };
      add(id, "supply", perChain(key), side.addresses === 1 ? single : spread, vars);
    };
    party(mint, `mint-${key}`, "mintSingle", "mintSpread");
    party(burn, `burn-${key}`, "burnSingle", "burnSpread");
  }

  // How much moves?
  for (const key of keys) {
    const { activity } = chains[key];
    const { transfers, volume } = activity;
    if (transfers.current === 0 && transfers.previous === 0) continue;
    const vars = {
      chain: names[key],
      date: f.date(activity.endDay),
      days: f.int(activity.days),
      transfers: f.int(transfers.current),
      volume: f.usd(activity.volumeUsd.current),
      previousTransfers: f.int(transfers.previous),
    };
    if (transfers.changePct === null) {
      add(`trend-${key}`, "move", perChain(key), "trendNew", vars);
    } else {
      const volChange = volume.changePct === null ? notAvailable : f.signed(volume.changePct);
      add(`trend-${key}`, "move", perChain(key), "trend", { ...vars, txChange: f.signed(transfers.changePct), volChange });
    }
  }

  // Who moves it?
  for (const key of keys) {
    const h = chains[key].holders;
    const vars = {
      chain: names[key],
      top1: f.percent(h.top1Pct),
      top10: f.percent(h.top10Pct),
      holders: f.int(h.count),
      contracts: f.int(h.contracts),
      below1: f.int(h.below1),
    };
    add(`concentration-${key}`, "who", perChain(key), h.top1Pct > DOMINANT_SHARE ? "concentrationDominant" : "concentrationSpread", vars);
  }

  // Who controls it?
  for (const key of keys) {
    const gov = chains[key].governance;
    const name = names[key];
    const members = Object.values(gov.roles).filter((list) => list.length > 0);
    const holder = members[0]?.[0];
    add(
      `roles-${key}`,
      "control",
      perChain(key),
      gov.roleHolders === 1 ? "rolesOne" : "rolesMany",
      { chain: name, roles: f.int(members.length), holders: f.int(gov.roleHolders), address: holder ? shortAddress(holder) : "" },
    );
    add(
      `frozen-${key}`,
      "control",
      perChain(key),
      gov.frozen.length === 0 ? "frozenNone" : "frozenSome",
      { chain: name, asOf: asOfOf(key), count: f.int(gov.frozen.length) },
    );
    const pauses = countEvents(gov.events, "Paused").length;
    add(
      `pause-${key}`,
      "control",
      perChain(key),
      gov.paused ? "pausedNow" : pauses > 0 ? "pausedBefore" : "pausedNever",
      { chain: name, asOf: asOfOf(key), count: f.int(pauses) },
    );
    // The first Upgraded event is the deployment itself; later ones are changes.
    const upgrades = countEvents(gov.events, "Upgraded").slice(1);
    add(
      `upgrade-${key}`,
      "control",
      perChain(key),
      upgrades.length === 0 ? "upgradeNone" : "upgradeSome",
      { chain: name, count: f.int(upgrades.length), date: upgrades.length ? f.date(upgrades.at(-1).day) : "" },
    );
  }

  // Can it be trusted?
  for (const key of keys) {
    const v = validations[key];
    const supplyOk = v.checks.some((c) => c.id === "supply-exact" && c.ok === true);
    const vars = { chain: names[key], passed: f.int(v.passed), total: f.int(v.checks.length), failed: f.int(v.failed), block: f.int(chains[key].checkpoint.block) };
    if (v.failed === 0 && supplyOk) {
      add(`validation-${key}`, "trust", perChain(key), "validationPass", vars);
    } else {
      const ids = v.checks.filter((c) => !c.ok).map((c) => c.id);
      if (!supplyOk && !ids.includes("supply-exact")) ids.push("supply-exact");
      add(`validation-${key}`, "trust", perChain(key), "validationFail", { ...vars, failed: f.int(ids.length), ids: ids.join(", ") });
    }
  }

  return out;
}
