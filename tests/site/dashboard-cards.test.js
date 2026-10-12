import { test } from "node:test";
import assert from "node:assert/strict";
import { headlineCards } from "../../site/src/lib/dashboard-cards.js";
import { dashboardDictionaries } from "../../site/src/i18n/index.js";
import { formatUsd } from "../../site/src/lib/format.js";
import { interpolate } from "../../site/src/lib/template.js";

const A = `0x${"a1".repeat(20)}`;
const B = `0x${"b2".repeat(20)}`;

// A chain as the browser payload carries it: only what the cards read.
function chainData(key, overrides = {}) {
  return {
    key,
    label: key === "polygon" ? "Polygon" : "Celo",
    flows: {
      minted: 100e6,
      burned: 90e6,
      wallet: 500e6,
      gross: 690e6,
      turnover: 6.9,
      usd: { minted: 30e6, burned: 27e6, wallet: 150e6, gross: 207e6 },
    },
    supplyPeak: { copm: { day: "2025-05-01", amount: 40e6 }, usd: { day: "2025-08-09", amount: 15e6 } },
    checkpoint: { block: 1234, time: 1791760950, totalSupply: 10e6, totalSupplyUsd: 3e6 },
    issuance: {
      mint: { addresses: 1, volume: 100e6, topSharePct: 100, top: [{ address: A, volume: 100e6 }] },
      burn: { addresses: 4, volume: 90e6, topSharePct: 80, top: [{ address: B, volume: 72e6 }] },
    },
    holders: { count: 50, contracts: 7, top1Pct: 65, top10Pct: 95, top: [{ rank: 1, address: A, balance: 6.5e6, share: 65 }] },
    governance: { roleHolders: 1, roleCount: 6, frozen: [] },
    ...overrides,
  };
}
const both = () => ({ polygon: chainData("polygon"), celo: chainData("celo") });
const cards = (chains, chain = "both", lang = "es") => headlineCards({ chains, chain, t: dashboardDictionaries[lang].cards, lang });
const byId = (list, id) => list.find((c) => c.id === id);
const words = (text) => text.split(/\s+/).filter(Boolean).length;

test("six cards, each a figure, a label and one supporting line", () => {
  const list = cards(both());
  assert.deepEqual(list.map((c) => c.id), ["minted", "turnover", "supply", "concentration", "redemption", "control"]);
  for (const card of list) {
    assert.ok(card.figure.length > 0 && card.label.length > 0 && card.support.length > 0, card.id);
  }
});

test("labels hold at most five words and supporting lines at most ten, in both languages and every view", () => {
  for (const lang of ["es", "en"]) {
    for (const chain of ["both", "polygon", "celo"]) {
      for (const card of cards(both(), chain, lang)) {
        assert.ok(words(card.label) <= 5, `${lang}/${chain}/${card.id} label: ${card.label}`);
        assert.ok(words(card.support) <= 10, `${lang}/${chain}/${card.id} support: ${card.support}`);
      }
    }
  }
});

test("minted against gross volume, both in dollars valued day by day", () => {
  const list = cards(both());
  const minted = byId(list, "minted");
  assert.equal(minted.figure, formatUsd(60e6, "es", "short", { trim: true }));
  assert.ok(minted.support.includes(formatUsd(414e6, "es", "short", { trim: true })));
  assert.equal(byId(cards(both(), "polygon"), "minted").figure, formatUsd(30e6, "es", "short", { trim: true }));
});

test("minted disappears when nothing was minted", () => {
  const none = chainData("polygon", { flows: { minted: 0, burned: 0, wallet: 5, gross: 5, turnover: null, usd: { minted: 0, burned: 0, wallet: 1, gross: 1 } } });
  const list = cards({ polygon: none }, "polygon");
  assert.equal(byId(list, "minted"), undefined);
  assert.equal(byId(list, "turnover"), undefined);
});

test("turnover is gross volume over what was minted, per chain in the support line when both are in view", () => {
  const list = cards(both());
  assert.equal(byId(list, "turnover").figure, "6,9×");
  assert.match(byId(list, "turnover").support, /Polygon 6,9×.*Celo 6,9×/);
  const single = byId(cards(both(), "celo", "en"), "turnover");
  assert.equal(single.figure, "6.9×");
});

test("supply today as a share of its peak, with the peak date; at the peak the card says so", () => {
  const below = byId(cards(both(), "polygon"), "supply");
  assert.equal(below.figure, "25 %");
  assert.match(below.support, /1 may 2025/);
  const atPeak = byId(cards({ polygon: chainData("polygon", { supplyPeak: { copm: { day: "2025-05-01", amount: 10e6 }, usd: { day: "2025-05-01", amount: 3e6 } } }) }, "polygon"), "supply");
  assert.equal(atPeak.figure, "100 %");
  assert.notEqual(atPeak.label, below.label);
  assert.equal(byId(cards({ polygon: chainData("polygon", { supplyPeak: null }) }, "polygon"), "supply"), undefined);
});

test("the supply card is in COPM terms and says so, and never uses the day of the USD peak", () => {
  for (const lang of ["es", "en"]) {
    const card = byId(cards(both(), "polygon", lang), "supply");
    assert.match(`${card.label} ${byId(cards({ polygon: chainData("polygon", { supplyPeak: { copm: { day: "2025-05-01", amount: 10e6 }, usd: { day: "2025-05-01", amount: 3e6 } } }) }, "polygon", lang), "supply").label}`, /COPM.*COPM/);
    assert.doesNotMatch(card.support, /aug|ago|9/i, "the USD peak of 9 Aug is not shown");
    assert.match(card.support, /1 may|May 1/);
  }
});

test("supply with both chains compares the sum with the sum of each chain's own peak and names both dates", () => {
  const celo = chainData("celo", { supplyPeak: { copm: { day: "2025-03-02", amount: 20e6 }, usd: { day: "2025-03-02", amount: 6e6 } } });
  const card = byId(cards({ polygon: chainData("polygon"), celo }), "supply");
  assert.equal(card.figure, "33 %");
  assert.match(card.support, /1 may 2025/);
  assert.match(card.support, /2 mar 2025/);
});

test("concentration: share of the supply in the largest address and how many addresses hold a balance", () => {
  const one = byId(cards(both(), "polygon"), "concentration");
  assert.equal(one.figure, "65 %");
  assert.match(one.support, /^50 /);
  const all = byId(cards(both()), "concentration");
  assert.equal(all.figure, "65 %", "(6.5M + 6.5M) / (10M + 10M)");
  assert.match(all.support, /^100 /);
});

test("redemption: one address's share of the burns; with no burns it falls back to mints; with neither it disappears", () => {
  const burn = byId(cards(both(), "polygon"), "redemption");
  assert.equal(burn.figure, "80 %");
  assert.equal(burn.label, dashboardDictionaries.es.cards.redemption.label);
  const mintOnly = chainData("polygon");
  mintOnly.issuance = { mint: mintOnly.issuance.mint, burn: { addresses: 0, volume: 0, topSharePct: null, top: [] } };
  const mint = byId(cards({ polygon: mintOnly }, "polygon"), "redemption");
  assert.equal(mint.figure, "100 %");
  assert.equal(mint.label, dashboardDictionaries.es.cards.issuance.label);
  const neither = chainData("polygon");
  neither.issuance = { mint: { addresses: 0, volume: 0, topSharePct: null, top: [] }, burn: { addresses: 0, volume: 0, topSharePct: null, top: [] } };
  assert.equal(byId(cards({ polygon: neither }, "polygon"), "redemption"), undefined);
});

test("redemption with a single address uses the singular wording", () => {
  const one = chainData("polygon");
  one.issuance.burn = { addresses: 1, volume: 90e6, topSharePct: 100, top: [{ address: B, volume: 90e6 }] };
  const card = byId(cards({ polygon: one }, "polygon"), "redemption");
  assert.equal(card.support, dashboardDictionaries.es.cards.redemption.supportOne);
});

test("control: addresses holding all roles, and the frozen accounts only when there are some", () => {
  const none = byId(cards(both(), "polygon"), "control");
  assert.equal(none.figure, "1");
  assert.equal(none.label, dashboardDictionaries.es.cards.control.labelOne);
  assert.equal(none.support, dashboardDictionaries.es.cards.control.frozenNone);

  const frozen = chainData("celo", { governance: { roleHolders: 1, roleCount: 6, frozen: [A] } });
  const some = byId(cards({ polygon: chainData("polygon"), celo: frozen }, "celo"), "control");
  assert.equal(some.support, interpolate(dashboardDictionaries.es.cards.control.frozenOne, { count: "1" }));

  const all = byId(cards({ polygon: chainData("polygon"), celo: frozen }), "control");
  assert.equal(all.figure, "2");
  assert.equal(all.label, dashboardDictionaries.es.cards.control.labelAll);
  assert.match(all.support, /^1 /);

  const spread = chainData("polygon", { governance: { roleHolders: 3, roleCount: 6, frozen: [] } });
  const many = byId(cards({ polygon: spread }, "polygon"), "control");
  assert.equal(many.figure, "3");
  assert.equal(many.label, dashboardDictionaries.es.cards.control.labelMany);
});

test("a chain filter with no data for that chain yields no cards", () => {
  assert.deepEqual(cards({ polygon: chainData("polygon") }, "celo"), []);
});
