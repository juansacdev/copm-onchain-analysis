import { ZERO_ADDRESS } from "./units.js";

// Every balance change of the token goes through a mint, a burn or a
// transfer, so folding Transfer events gives the whole ledger. Amounts stay
// BigInt end to end.
export function createLedger({ minted = 0n, burned = 0n } = {}) {
  return { minted, burned, balances: new Map() };
}

const credit = (balances, address, value) =>
  balances.set(address, (balances.get(address) ?? 0n) + value);

// Same classification as the daily series: a mint is a transfer from the zero
// address, a burn is a transfer to it.
export function foldTransfers(ledger, transfers) {
  for (const t of transfers) {
    const value = BigInt(t.v);
    if (t.f === ZERO_ADDRESS) {
      ledger.minted += value;
    } else {
      credit(ledger.balances, t.f, -value);
      if (t.r === ZERO_ADDRESS) ledger.burned += value;
    }
    if (t.r !== ZERO_ADDRESS) credit(ledger.balances, t.r, value);
  }
  return ledger;
}

export const negativeBalances = (ledger) =>
  [...ledger.balances].filter(([, balance]) => balance < 0n).map(([address]) => address);
