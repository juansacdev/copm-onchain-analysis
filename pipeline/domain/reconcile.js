// Exact comparison of the supply derived from events with the supply the
// contract reports. No tolerance: a single wei of difference means events are
// missing or invented.
export function reconcileSupply({ minted, burned, totalSupply }) {
  const derived = minted - burned;
  const diff = derived - totalSupply;
  return { ok: diff === 0n, derived, totalSupply, diff };
}
