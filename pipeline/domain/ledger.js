import { ZERO_ADDRESS } from "./units.js";

// Every balance change of the token goes through a mint, a burn or a
// transfer, so folding Transfer events gives the whole ledger. Amounts stay
// BigInt end to end.
//
// `trackActivity` also keeps per-address history for the holders snapshot. It
// is opt-in because the scan folds every stage and has no use for it.
export function createLedger({ minted = 0n, burned = 0n, trackActivity = false } = {}) {
  const ledger = { minted, burned, balances: new Map() };
  if (trackActivity) ledger.activity = new Map();
  return ledger;
}

const credit = (balances, address, value) =>
  balances.set(address, (balances.get(address) ?? 0n) + value);

function track(activity, address, side, value, ts) {
  const entry = activity.get(address) ?? {
    received: 0n,
    sent: 0n,
    transfersIn: 0,
    transfersOut: 0,
    firstSeen: ts,
    lastSeen: ts,
  };
  if (side === "in") {
    entry.received += value;
    entry.transfersIn++;
  } else {
    entry.sent += value;
    entry.transfersOut++;
  }
  entry.firstSeen = Math.min(entry.firstSeen, ts);
  entry.lastSeen = Math.max(entry.lastSeen, ts);
  activity.set(address, entry);
}

// Same classification as the daily series: a mint is a transfer from the zero
// address, a burn is a transfer to it.
export function foldTransfers(ledger, transfers) {
  for (const t of transfers) {
    const value = BigInt(t.v);
    if (t.f === ZERO_ADDRESS) {
      ledger.minted += value;
    } else {
      credit(ledger.balances, t.f, -value);
      if (ledger.activity) track(ledger.activity, t.f, "out", value, t.ts);
      if (t.r === ZERO_ADDRESS) ledger.burned += value;
    }
    if (t.r !== ZERO_ADDRESS) {
      credit(ledger.balances, t.r, value);
      if (ledger.activity) track(ledger.activity, t.r, "in", value, t.ts);
    }
  }
  return ledger;
}

export const negativeBalances = (ledger) =>
  [...ledger.balances].filter(([, balance]) => balance < 0n).map(([address]) => address);
