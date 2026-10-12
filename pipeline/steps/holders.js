// Holders snapshot at the scan's checkpoint block.
//
// The ledger folded from the stored transfers is compared with the chain at
// that same block, never at the live head:
//
//   H1  every address ever seen has ledger balance == balanceOf, to the wei
//   H2  the positive on-chain balances add up to totalSupply(), to the wei
//   H3  no ledger balance is negative
//
// Nothing is written unless all three hold. Pinned eth_calls either error or
// are right, and the items of a batch can be answered by different backends,
// so every item is checked on its own and a failing one is asked again; an
// error is never read as zero.
import { getChain, dataDir, scanSettings } from "../config/chains.js";
import { mapPool } from "../adapters/pool.js";
import { createRpc, requireRpcUrl } from "../adapters/rpc.js";
import { createStore, ensureDir } from "../adapters/store.js";
import {
  IMPLEMENTATION_SLOT,
  ROLE_HASHES,
  addressFromWord,
  callBalanceOf,
  callGetRoleMember,
  callGetRoleMemberCount,
  callIsFrozen,
  parseWord,
  SELECTORS,
} from "../domain/contract.js";
import {
  bucketHolders,
  buildHolderRows,
  concentration,
  formatUnits,
  holdersCsv,
} from "../domain/holders.js";
import { createLedger, foldTransfers, negativeBalances } from "../domain/ledger.js";

const CALLS_PER_BATCH = 100;
const TOP_ROWS = 25;
const FREEZE_EVENTS = new Set(["Frozen", "Thawed", "BurnedFrozen"]);

const hex = (n) => `0x${n.toString(16)}`;
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function chunk(list, size) {
  const chunks = [];
  for (let i = 0; i < list.length; i += size) chunks.push(list.slice(i, i + size));
  return chunks;
}

const parseBool = (raw) => {
  const value = parseWord(raw);
  if (value > 1n) throw new Error("expected a boolean word");
  return value === 1n;
};

const parseCode = (raw) => {
  if (typeof raw !== "string" || !/^0x([0-9a-fA-F]{2})*$/.test(raw)) throw new Error("malformed eth_getCode answer");
  return raw;
};

export async function runHolders({
  chain,
  settings,
  rpc,
  store,
  log = console.log,
  sleep = defaultSleep,
}) {
  const state = store.readState();
  if (!state) {
    throw new Error(`no state.json for ${chain.key}: run "scan --chain ${chain.key}" first`);
  }
  const block = state.lastBlock;
  const tag = hex(block);

  const ledger = foldTransfers(createLedger({ trackActivity: true }), store.readTransfers());
  const negatives = negativeBalances(ledger);
  if (negatives.length > 0) {
    throw new Error(
      `negative balance for ${negatives.length} address(es), first ${negatives[0]}: the stored transfers are incomplete`
    );
  }

  // Asks every item until it answers validly. An item has its own attempt
  // budget; the step only gives up when one of them spends it.
  async function readAll(label, items) {
    const values = new Array(items.length);
    const attempts = new Array(items.length).fill(0);
    const reasons = new Array(items.length).fill("unknown");
    let pending = items.map((_, index) => index);

    for (let round = 1; pending.length > 0; round++) {
      if (round > 1) await sleep(Math.min(100 * round, 2000));
      const failed = [];
      await mapPool(chunk(pending, CALLS_PER_BATCH), settings.workers, async (indexes) => {
        let results;
        try {
          results = await rpc.batch(indexes.map((index) => items[index].call));
        } catch (err) {
          results = indexes.map(() => ({ ok: false, error: err.message }));
        }
        indexes.forEach((index, position) => {
          try {
            const result = results[position];
            if (!result.ok) throw new Error(result.error);
            values[index] = items[index].parse(result.result);
          } catch (err) {
            attempts[index]++;
            reasons[index] = err.message;
            failed.push(index);
          }
        });
      });
      const spent = failed.find((index) => attempts[index] >= settings.maxBatchAttempts);
      if (spent !== undefined) {
        throw new Error(
          `${label}: ${items[spent].what} failed ${attempts[spent]} times; last error: ${reasons[spent]}`
        );
      }
      pending = failed.sort((a, b) => a - b);
    }
    return values;
  }

  const ethCall = (what, data, parse) => ({
    what,
    call: { method: "eth_call", params: [{ to: chain.address, data }, tag] },
    parse,
  });

  /* Contract state ----------------------------------------------------------- */

  const roleNames = Object.keys(ROLE_HASHES);
  const [totalSupply, paused, implementation, ...counts] = await readAll("contract state", [
    ethCall("totalSupply()", SELECTORS.totalSupply, parseWord),
    ethCall("paused()", SELECTORS.paused, parseBool),
    {
      what: "the ERC-1967 implementation slot",
      call: { method: "eth_getStorageAt", params: [chain.address, IMPLEMENTATION_SLOT, tag] },
      parse: (raw) => addressFromWord(`0x${parseWord(raw).toString(16).padStart(64, "0")}`),
    },
    ...roleNames.map((role) =>
      ethCall(`getRoleMemberCount(${role})`, callGetRoleMemberCount(ROLE_HASHES[role]), (raw) =>
        Number(parseWord(raw))
      )
    ),
  ]);

  const memberItems = roleNames.flatMap((role, r) =>
    Array.from({ length: counts[r] }, (_, index) =>
      ethCall(`getRoleMember(${role}, ${index})`, callGetRoleMember(ROLE_HASHES[role], index), (raw) =>
        addressFromWord(`0x${parseWord(raw).toString(16).padStart(64, "0")}`)
      )
    )
  );
  const members = await readAll("role members", memberItems);
  const roles = {};
  let next = 0;
  roleNames.forEach((role, r) => {
    roles[role] = members.slice(next, next + counts[r]);
    next += counts[r];
  });

  /* H1-H3 -------------------------------------------------------------------- */

  const addresses = [...ledger.balances.keys()].sort();
  const onChain = await readAll(
    "balances",
    addresses.map((address) => ethCall(`balanceOf(${address})`, callBalanceOf(address), parseWord))
  );

  const mismatches = addresses.filter((address, i) => ledger.balances.get(address) !== onChain[i]);
  if (mismatches.length > 0) {
    const first = mismatches.slice(0, 5).map((address) => {
      const i = addresses.indexOf(address);
      return `${address} ledger ${ledger.balances.get(address)} chain ${onChain[i]}`;
    });
    throw new Error(
      `balance mismatch for ${mismatches.length} address(es) at block ${block}: ${first.join("; ")}. ` +
        "Events are missing or invented; nothing was written."
    );
  }

  const balances = new Map(addresses.map((address, i) => [address, onChain[i]]));
  const positiveSum = onChain.reduce((sum, balance) => sum + balance, 0n);
  if (positiveSum !== totalSupply) {
    throw new Error(
      `positive balances add up to ${positiveSum} but totalSupply() is ${totalSupply} at block ${block}, ` +
        `diff ${positiveSum - totalSupply}. Nothing was written.`
    );
  }

  /* Labels ------------------------------------------------------------------- */

  const holderAddresses = addresses.filter((address) => balances.get(address) > 0n);
  const codes = await readAll(
    "contract code",
    holderAddresses.map((address) => ({
      what: `eth_getCode(${address})`,
      call: { method: "eth_getCode", params: [address, tag] },
      parse: parseCode,
    }))
  );
  const contracts = new Set(holderAddresses.filter((_, i) => codes[i] !== "0x"));

  // Only accounts that ever appear in a freeze event can be frozen.
  const candidates = [
    ...new Set(
      store
        .readAdminEvents()
        .filter((event) => FREEZE_EVENTS.has(event.name) && event.b <= block)
        .map((event) => event.args.account)
    ),
  ].sort();
  const confirmed = await readAll(
    "frozen accounts",
    candidates.map((address) => ethCall(`isFrozen(${address})`, callIsFrozen(address), parseBool))
  );
  const frozen = new Set(candidates.filter((_, i) => confirmed[i]));

  /* Output ------------------------------------------------------------------- */

  const rows = buildHolderRows({
    balances,
    activity: ledger.activity,
    contracts,
    frozen,
    totalSupply,
  });
  const json = {
    block,
    blockTime: new Date(state.lastBlockTime * 1000).toISOString(),
    totalSupply: formatUnits(totalSupply),
    holders: rows.length,
    addressesEverSeen: addresses.length,
    contracts: contracts.size,
    frozen: [...frozen],
    concentration: concentration(rows, totalSupply),
    buckets: bucketHolders(rows),
    roles,
    paused,
    implementation,
    top: rows.slice(0, TOP_ROWS).map((row) => ({
      rank: row.rank,
      address: row.address,
      balance: formatUnits(row.balance),
      sharePct: row.sharePct,
      kind: row.kind,
      frozen: row.frozen,
    })),
  };
  store.writeHolders({ csv: holdersCsv(rows), json });

  log(
    `${chain.key}: ${rows.length} holders of ${addresses.length} addresses at block ${block}, ` +
      `${formatUnits(totalSupply)} COPM reconciled to the wei`
  );
  return json;
}

export async function run({ chainKey, env = process.env, overrides = {} }) {
  const chain = getChain(chainKey);
  const url = requireRpcUrl(chainKey, env);
  const settings = scanSettings(chainKey, env, overrides);
  const dir = dataDir(chainKey);
  ensureDir(dir);
  await runHolders({ chain, settings, rpc: createRpc({ url }), store: createStore(dir) });
}
