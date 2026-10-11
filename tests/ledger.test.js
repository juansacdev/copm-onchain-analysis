import { test } from "node:test";
import assert from "node:assert/strict";
import { ZERO_ADDRESS } from "../pipeline/domain/units.js";
import { createLedger, foldTransfers, negativeBalances } from "../pipeline/domain/ledger.js";
import { reconcileSupply } from "../pipeline/domain/reconcile.js";

const A = "0xaaaa000000000000000000000000000000000001";
const B = "0xbbbb000000000000000000000000000000000002";
const row = (f, r, v) => ({ f, r, v: v.toString() });

test("mints raise minted, burns raise burned, plain transfers only move balances", () => {
  const ledger = createLedger();
  foldTransfers(ledger, [
    row(ZERO_ADDRESS, A, 500n),
    row(A, B, 120n),
    row(B, ZERO_ADDRESS, 20n),
  ]);

  assert.equal(ledger.minted, 500n);
  assert.equal(ledger.burned, 20n);
  assert.equal(ledger.balances.get(A), 380n);
  assert.equal(ledger.balances.get(B), 100n);
  assert.equal(ledger.balances.has(ZERO_ADDRESS), false);
});

test("a zero-value transfer changes nothing", () => {
  const ledger = createLedger();
  foldTransfers(ledger, [row(A, B, 0n)]);
  assert.equal(ledger.minted, 0n);
  assert.equal(ledger.burned, 0n);
});

test("a ledger can resume from previous totals and keeps amounts as BigInt beyond 2^53", () => {
  const big = 10n ** 27n + 1n;
  const ledger = createLedger({ minted: big, burned: 1n });
  foldTransfers(ledger, [row(ZERO_ADDRESS, A, 1n)]);
  assert.equal(ledger.minted, big + 1n);
  assert.equal(ledger.burned, 1n);
});

test("negativeBalances lists addresses that spent more than they received", () => {
  const ledger = createLedger();
  foldTransfers(ledger, [row(A, B, 5n)]);
  assert.deepEqual(negativeBalances(ledger), [A]);
});

test("reconcileSupply is exact: equal passes, one wei off fails with the difference", () => {
  assert.deepEqual(reconcileSupply({ minted: 100n, burned: 40n, totalSupply: 60n }), {
    ok: true,
    derived: 60n,
    totalSupply: 60n,
    diff: 0n,
  });

  const bad = reconcileSupply({ minted: 100n, burned: 40n, totalSupply: 61n });
  assert.equal(bad.ok, false);
  assert.equal(bad.diff, -1n);
});
