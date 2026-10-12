import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHAIN_CHOICES,
  DEFAULT_STATE,
  PERIOD_CHOICES,
  UNIT_CHOICES,
  decodeState,
  encodeState,
} from "../../site/src/lib/dashboard-filters.js";

test("the default view is both chains, 30 days, COPM", () => {
  assert.deepEqual(DEFAULT_STATE, { chain: "both", period: "30d", unit: "copm" });
});

test("encoding gives a bare token, one dash between the three choices", () => {
  assert.equal(encodeState({ chain: "polygon", period: "1y", unit: "usd" }), "polygon-1y-usd");
  assert.equal(encodeState(DEFAULT_STATE), "both-30d-copm");
});

test("every combination survives a round trip, with or without the leading #", () => {
  for (const chain of CHAIN_CHOICES) {
    for (const period of PERIOD_CHOICES) {
      for (const unit of UNIT_CHOICES) {
        const state = { chain, period, unit };
        assert.deepEqual(decodeState(encodeState(state)), state);
        assert.deepEqual(decodeState(`#${encodeState(state)}`), state);
      }
    }
  }
});

test("garbage never becomes a state: unknown values, wrong shape, hostile input", () => {
  const garbage = [
    "", "#", "both", "both-30d", "both-30d-copm-extra", "mars-30d-copm", "both-7d-copm", "both-30d-eur",
    "BOTH-30D-COPM", " both-30d-copm", "both-30d-copm ", "both--copm", "__proto__-30d-copm",
    "both-30d-copm\n", "<script>", "a".repeat(10_000), "both-30d-copm#x", "constructor",
  ];
  for (const input of garbage) assert.equal(decodeState(input), null, JSON.stringify(input.slice(0, 40)));
  for (const input of [undefined, null, 5, {}, []]) assert.equal(decodeState(input), null);
});

test("encoding refuses a state the decoder would reject", () => {
  assert.throws(() => encodeState({ chain: "mars", period: "30d", unit: "copm" }), /chain/);
  assert.throws(() => encodeState({ chain: "both", period: "7d", unit: "copm" }), /period/);
  assert.throws(() => encodeState({ chain: "both", period: "30d", unit: "eur" }), /unit/);
});
