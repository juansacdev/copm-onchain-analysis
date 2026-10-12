import { test } from "node:test";
import assert from "node:assert/strict";
import { buildInsights } from "../../site/src/lib/dashboard-insights.js";

const A = `0x${"a1".repeat(20)}`;
const B = `0x${"b2".repeat(20)}`;
const NAMES = { polygon: "Polygon", celo: "Celo", all: "Polygon + Celo" };

function chainData(overrides = {}) {
  return {
    flows: { minted: 100e6, burned: 90e6, wallet: 500e6, gross: 690e6, turnover: 6.9 },
    supplyPeak: { day: "2025-05-01", copm: 40e6 },
    checkpoint: { block: 1234, time: 1, totalSupply: 10e6 },
    activity: {
      endDay: "2025-06-10",
      days: 30,
      transfers: { current: 120, previous: 100, changePct: 20 },
      volume: { current: 5e6, previous: 4e6, changePct: 25 },
    },
    issuance: {
      mint: { addresses: 1, topSharePct: 100, top: [{ address: A }] },
      burn: { addresses: 4, topSharePct: 80.5, top: [{ address: B }] },
    },
    holders: { count: 50, top1Pct: 65, top10Pct: 95, below1: 12 },
    governance: {
      roles: { DEFAULT_ADMIN_ROLE: [A], MINTER_ROLE: [A], PAUSER_ROLE: [] },
      roleHolders: 1,
      paused: false,
      frozen: [],
      events: [
        { name: "Upgraded", day: "2025-01-01", block: 1 },
        { name: "RoleGranted", day: "2025-01-01", block: 1 },
      ],
    },
    ...overrides,
  };
}
const validation = (failedIds = []) => {
  const checks = Array.from({ length: 18 }, (_, k) => ({ id: k === 0 ? "supply-exact" : `rule-${k}`, ok: true }));
  for (const id of failedIds) {
    const hit = checks.find((c) => c.id === id) ?? checks[checks.length - 1 - failedIds.indexOf(id)];
    hit.id = id;
    hit.ok = false;
  }
  return { passed: 18 - failedIds.length, failed: failedIds.length, checks };
};

function run(chains, validations = { polygon: validation(), celo: validation() }) {
  return buildInsights({
    chains,
    validations,
    copPerUsd: 4000,
    lang: "en",
    names: NAMES,
    render: (key, vars) => `${key} ${JSON.stringify(vars)}`,
  });
}
const keys = (list) => list.map((i) => i.key);
const find = (list, id) => list.find((i) => i.id === id);
const both = () => ({ polygon: chainData(), celo: chainData() });

test("one sentence per fact and chain, tagged with the section and the views it belongs to", () => {
  const list = run(both());
  const turnoverAll = find(list, "turnover-all");
  assert.equal(turnoverAll.section, "supply");
  assert.deepEqual(turnoverAll.show, ["both"]);
  assert.deepEqual(find(list, "turnover-polygon").show, ["polygon"]);
  assert.deepEqual(find(list, "supply-polygon").show, ["both", "polygon"]);
  assert.deepEqual(find(list, "supply-celo").show, ["both", "celo"]);
  assert.equal(new Set(list.map((i) => i.id)).size, list.length, "ids are unique");
});

test("turnover states how many times each minted peso is counted, from the data", () => {
  const list = run(both());
  const vars = find(list, "turnover-all").vars;
  assert.equal(vars.turnover, "6.9");
  assert.match(vars.gross, /^US\$/);
  assert.equal(find(list, "turnover-polygon").key, "turnover");
});

test("turnover disappears when nothing was minted", () => {
  const empty = chainData({ flows: { minted: 0, burned: 0, wallet: 5, gross: 5, turnover: null } });
  const list = run({ polygon: empty, celo: empty });
  assert.equal(find(list, "turnover-all"), undefined);
  assert.equal(find(list, "turnover-polygon"), undefined);
});

test("supply: below the peak it gives the share of the peak, at the peak it says so", () => {
  const below = find(run(both()), "supply-polygon");
  assert.equal(below.key, "supplyBelowPeak");
  assert.equal(below.vars.pct, "25%");
  const atPeak = find(run({ polygon: chainData({ supplyPeak: { day: "2025-05-01", copm: 10e6 } }), celo: chainData() }), "supply-polygon");
  assert.equal(atPeak.key, "supplyAtPeak");
});

test("issuance: a single recipient is named, several are counted; no burners means no burn sentence", () => {
  const list = run(both());
  assert.equal(find(list, "mint-polygon").key, "mintSingle");
  assert.equal(find(list, "mint-polygon").vars.address, `${A.slice(0, 6)}…${A.slice(-4)}`);
  assert.equal(find(list, "burn-polygon").key, "burnSpread");
  assert.equal(find(list, "burn-polygon").vars.share, "80.5%");
  const many = chainData();
  many.issuance = { mint: { addresses: 3, topSharePct: 60, top: [{ address: A }] }, burn: { addresses: 0, topSharePct: null, top: [] } };
  const other = run({ polygon: many, celo: chainData() });
  assert.equal(find(other, "mint-polygon").key, "mintSpread");
  assert.equal(find(other, "burn-polygon"), undefined);
});

test("trend: signed change against the previous window; new activity and no activity are special", () => {
  const list = run(both());
  const trend = find(list, "trend-polygon");
  assert.equal(trend.key, "trend");
  assert.equal(trend.vars.txChange, "+20.0%");
  assert.equal(trend.vars.volChange, "+25.0%");
  assert.equal(trend.vars.date, "June 10, 2025");

  const fresh = chainData();
  fresh.activity = { ...fresh.activity, transfers: { current: 5, previous: 0, changePct: null }, volume: { current: 9, previous: 0, changePct: null } };
  assert.equal(find(run({ polygon: fresh, celo: chainData() }), "trend-polygon").key, "trendNew");

  const quiet = chainData();
  quiet.activity = { ...quiet.activity, transfers: { current: 0, previous: 0, changePct: null }, volume: { current: 0, previous: 0, changePct: null } };
  assert.equal(find(run({ polygon: quiet, celo: chainData() }), "trend-polygon"), undefined);

  const drop = chainData();
  drop.activity = { ...drop.activity, transfers: { current: 14, previous: 100, changePct: -86 } };
  assert.equal(find(run({ polygon: drop, celo: chainData() }), "trend-polygon").vars.txChange, "-86.0%");
});

test("concentration: one address above half is said plainly, otherwise the spread is described", () => {
  assert.equal(find(run(both()), "concentration-polygon").key, "concentrationDominant");
  const spread = chainData({ holders: { count: 50, top1Pct: 20, top10Pct: 60, below1: 12 } });
  const item = find(run({ polygon: spread, celo: chainData() }), "concentration-polygon");
  assert.equal(item.key, "concentrationSpread");
  assert.equal(item.vars.top1, "20%");
  assert.equal(item.vars.holders, "50");
  assert.equal(item.vars.below1, "12");
});

test("roles: one address with every role is named; several addresses are counted", () => {
  const one = find(run(both()), "roles-polygon");
  assert.equal(one.key, "rolesOne");
  assert.equal(one.vars.roles, "2", "only roles that have a member are counted");
  const shared = chainData();
  shared.governance = { ...shared.governance, roleHolders: 3 };
  const many = find(run({ polygon: shared, celo: chainData() }), "roles-polygon");
  assert.equal(many.key, "rolesMany");
  assert.equal(many.vars.holders, "3");
});

test("frozen accounts and pause state follow the data", () => {
  const list = run(both());
  assert.equal(find(list, "frozen-polygon").key, "frozenNone");
  assert.equal(find(list, "pause-polygon").key, "pausedNever");

  const gov = chainData().governance;
  const live = chainData({
    governance: {
      ...gov,
      paused: true,
      frozen: [A, B],
      events: [...gov.events, { name: "Paused", day: "2025-02-02", block: 5 }],
    },
  });
  const other = run({ polygon: live, celo: chainData() });
  assert.equal(find(other, "frozen-polygon").key, "frozenSome");
  assert.equal(find(other, "frozen-polygon").vars.count, "2");
  assert.equal(find(other, "pause-polygon").key, "pausedNow");

  const past = chainData({
    governance: { ...gov, events: [...gov.events, { name: "Paused", day: "2025-02-02", block: 5 }, { name: "Unpaused", day: "2025-02-03", block: 6 }] },
  });
  assert.equal(find(run({ polygon: past, celo: chainData() }), "pause-polygon").key, "pausedBefore");
});

test("upgrades: the first Upgraded event is the deployment, later ones are counted with the last date", () => {
  assert.equal(find(run(both()), "upgrade-polygon").key, "upgradeNone");
  const gov = chainData().governance;
  const upgraded = chainData({
    governance: { ...gov, events: [...gov.events, { name: "Upgraded", day: "2025-03-04", block: 9 }] },
  });
  const item = find(run({ polygon: upgraded, celo: chainData() }), "upgrade-polygon");
  assert.equal(item.key, "upgradeSome");
  assert.equal(item.vars.count, "1");
  assert.equal(item.vars.date, "March 4, 2025");
});

test("trust: all rules passing is stated with the block; a failing rule names itself instead", () => {
  const list = run(both());
  const ok = find(list, "validation-polygon");
  assert.equal(ok.key, "validationPass");
  assert.equal(ok.vars.passed, "18");
  assert.equal(ok.vars.total, "18");
  assert.equal(ok.vars.block, "1,234");

  const failing = run(both(), { polygon: validation(["supply-exact", "event-count"]), celo: validation() });
  const bad = find(failing, "validation-polygon");
  assert.equal(bad.key, "validationFail");
  assert.equal(bad.vars.failed, "2");
  assert.match(bad.vars.ids, /supply-exact/);
  assert.equal(find(failing, "validation-celo").key, "validationPass");
});

test("sentences are rendered through the supplied renderer", () => {
  const item = find(run(both()), "mint-polygon");
  assert.match(item.text, /^mintSingle \{/);
  assert.ok(keys(run(both())).length > 15);
});
