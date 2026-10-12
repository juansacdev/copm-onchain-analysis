import { keccak256, stringToHex } from "viem";
import { EVENT_TOPICS } from "../../pipeline/domain/events.js";
import { ROLE_HASHES, SELECTORS } from "../../pipeline/domain/contract.js";
import { ZERO_ADDRESS } from "../../pipeline/domain/units.js";

// A scripted JSON-RPC backend for the scan: a list of contract logs, a head,
// and fault hooks that can lie the way public endpoints do. Nothing here
// touches the network.

export const TOKEN = `0x${"c0".repeat(20)}`;
export const ALICE = `0x${"a1".repeat(20)}`;
export const BOB = `0x${"b2".repeat(20)}`;
export const SPENDER = `0x${"5d".repeat(20)}`;

export const hex = (n) => `0x${BigInt(n).toString(16)}`;
const word = (n) => `0x${BigInt(n).toString(16).padStart(64, "0")}`;
const pad = (address) => `0x${address.slice(2).padStart(64, "0")}`;

// Deterministic block time: two seconds per block from a fixed origin.
export const T0 = Date.UTC(2024, 0, 31, 23, 0, 0) / 1000;
export const tsOf = (block) => T0 + block * 2;

export const transfer = (b, i, from, to, value) => ({
  b,
  i,
  topics: [EVENT_TOPICS.Transfer, pad(from), pad(to)],
  data: word(value),
});
export const mint = (b, i, to, value) => transfer(b, i, ZERO_ADDRESS, to, value);
export const burn = (b, i, from, value) => transfer(b, i, from, ZERO_ADDRESS, value);
export const approval = (b, i, owner, spender, value = 1) => ({
  b,
  i,
  topics: [EVENT_TOPICS.Approval, pad(owner), pad(spender)],
  data: word(value),
});
export const upgraded = (b, i, implementation = BOB) => ({
  b,
  i,
  topics: [EVENT_TOPICS.Upgraded, pad(implementation)],
  data: "0x",
});
export const frozen = (b, i, account) => ({ b, i, topics: [EVENT_TOPICS.Frozen, pad(account)], data: "0x" });
export const thawed = (b, i, account) => ({ b, i, topics: [EVENT_TOPICS.Thawed, pad(account)], data: "0x" });
export const roleGranted = (b, i, role, account) => ({
  b,
  i,
  topics: [
    EVENT_TOPICS.RoleGranted,
    role === "DEFAULT_ADMIN_ROLE" ? word(0) : keccak256(stringToHex(role)),
    pad(account),
    pad(ALICE),
  ],
  data: "0x",
});

const SUPPLY_SELECTOR = SELECTORS.totalSupply;
const ROLE_BY_HASH = Object.fromEntries(Object.entries(ROLE_HASHES).map(([name, hash]) => [hash, name]));

// `contract` scripts the state reads of the holders snapshot: pause flag,
// implementation address, role members by role name, frozen accounts and code
// of the addresses that are contracts. Balances and supply come from the logs.
export function createFakeChain({
  logs,
  head,
  address = TOKEN,
  zeroTimestamps = false,
  contract = {},
}) {
  let supplyCalls = 0;
  const chain = {
    head,
    logs: [...logs],
    // hooks: getLogs, head, header, headerNumber, supply, supplyRaw (a string
    // returned as is for the totalSupply() call, `attempt` counting those calls
    // from 1), callError, and `read`, called for
    // every eth_call / eth_getCode / eth_getStorageAt with
    // { method, selector, data, block, attempt } and answering an Error (the
    // item fails), a string (the forced result) or nothing (the real answer).
    faults: {},
    seen: { batches: [], singles: [], getLogsCalls: 0, headerCalls: 0, reads: [] },
    contract: { paused: false, implementation: BOB, roles: {}, frozen: [], codes: {}, ...contract },
  };
  const attempts = new Map();

  const toRaw = (log) => ({
    address,
    blockNumber: hex(log.b),
    logIndex: hex(log.i),
    transactionHash: `0x${log.b.toString(16).padStart(32, "0")}${log.i.toString(16).padStart(32, "0")}`,
    topics: log.topics,
    data: log.data,
    blockTimestamp: zeroTimestamps ? "0x0" : hex(tsOf(log.b)),
  });

  const supplyAt = (block) =>
    chain.logs
      .filter((l) => l.b <= block && l.topics[0] === EVENT_TOPICS.Transfer)
      .reduce((sum, l) => {
        if (l.topics[1] === pad(ZERO_ADDRESS)) return sum + BigInt(l.data);
        if (l.topics[2] === pad(ZERO_ADDRESS)) return sum - BigInt(l.data);
        return sum;
      }, 0n);

  const balanceAt = (account, block) =>
    chain.logs
      .filter((l) => l.b <= block && l.topics[0] === EVENT_TOPICS.Transfer)
      .reduce((sum, l) => {
        const value = BigInt(l.data);
        let next = sum;
        if (l.topics[1] === pad(account)) next -= value;
        if (l.topics[2] === pad(account)) next += value;
        return next;
      }, 0n);

  const lastAddress = (data) => `0x${data.slice(-40)}`;

  function realRead(method, params) {
    if (method === "eth_getCode") return chain.contract.codes[params[0].toLowerCase()] ?? "0x";
    if (method === "eth_getStorageAt") return word(BigInt(chain.contract.implementation));
    const [{ data }, blockTag] = params;
    const block = Number(blockTag);
    switch (data.slice(0, 10)) {
      case SELECTORS.balanceOf:
        return word(balanceAt(lastAddress(data), block));
      case SELECTORS.totalSupply:
        return word(chain.faults.supply?.(block) ?? supplyAt(block));
      case SELECTORS.paused:
        return word(chain.contract.paused ? 1 : 0);
      case SELECTORS.isFrozen:
        return word(chain.contract.frozen.includes(lastAddress(data)) ? 1 : 0);
      case SELECTORS.getRoleMemberCount:
        return word((chain.contract.roles[ROLE_BY_HASH[`0x${data.slice(10, 74)}`]] ?? []).length);
      case SELECTORS.getRoleMember: {
        const members = chain.contract.roles[ROLE_BY_HASH[`0x${data.slice(10, 74)}`]] ?? [];
        return word(BigInt(members[Number(`0x${data.slice(74)}`)]));
      }
      default:
        throw new Error(`unexpected call data ${data.slice(0, 10)}`);
    }
  }

  function answerRead(call) {
    const { method, params } = call;
    const data = method === "eth_call" ? params[0].data : method === "eth_getCode" ? params[0] : params[1];
    const block = Number(method === "eth_call" ? params[1] : params[method === "eth_getCode" ? 1 : 2]);
    const key = `${method}:${data}@${block}`;
    const attempt = (attempts.get(key) ?? 0) + 1;
    attempts.set(key, attempt);
    const selector = method === "eth_call" ? data.slice(0, 10) : method;
    chain.seen.reads.push({ method, selector, data, block, attempt });
    const forced = chain.faults.read?.({ method, selector, data, block, attempt });
    if (forced instanceof Error) return { ok: false, error: forced.message };
    if (typeof forced === "string") return { ok: true, result: forced };
    try {
      return { ok: true, result: realRead(method, params) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  function answer(call, ctx) {
    switch (call.method) {
      case "eth_call":
      case "eth_getCode":
      case "eth_getStorageAt":
        return answerRead(call);
      case "eth_blockNumber":
        return { ok: true, result: hex(chain.faults.head?.(ctx) ?? chain.head) };
      case "eth_getLogs": {
        chain.seen.getLogsCalls++;
        const [{ fromBlock, toBlock }] = call.params;
        const from = Number(fromBlock);
        const to = Number(toBlock);
        const real = chain.logs
          .filter((l) => l.b >= from && l.b <= to)
          .sort((a, b) => a.b - b.b || a.i - b.i)
          .map(toRaw);
        const forced = chain.faults.getLogs?.({ ...ctx, from, to, real });
        if (forced instanceof Error) return { ok: false, error: forced.message };
        return { ok: true, result: forced ?? real };
      }
      case "eth_getBlockByNumber": {
        chain.seen.headerCalls++;
        const block = Number(call.params[0]);
        if (chain.faults.header?.({ block })) return { ok: true, result: null };
        // `headerNumber` answers a header for another block, as a backend that
        // serves the wrong one would (its timestamp belongs to that block).
        const served = chain.faults.headerNumber?.({ block }) ?? block;
        return { ok: true, result: { number: hex(served), timestamp: hex(tsOf(served)) } };
      }
      default:
        return { ok: false, error: `unsupported ${call.method}` };
    }
  }

  chain.rpc = {
    async batch(calls) {
      chain.seen.batches.push(calls);
      const ctx = { batchIndex: chain.seen.batches.length - 1 };
      return calls.map((call, index) => answer(call, { ...ctx, index }));
    },
    async call(method, params) {
      chain.seen.singles.push({ method, params });
      if (method === "eth_blockNumber") return hex(chain.head);
      if (method === "eth_call" && params[0].data !== SUPPLY_SELECTOR) {
        const reply = answerRead({ method, params });
        if (!reply.ok) throw new Error(reply.error);
        return reply.result;
      }
      if (method === "eth_call") {
        const failure = chain.faults.callError?.({ attempt: chain.seen.singles.length });
        if (failure) throw failure;
        const [{ data }, blockTag] = params;
        if (data !== SUPPLY_SELECTOR) throw new Error("unexpected call data");
        const block = Number(blockTag);
        supplyCalls++;
        const raw = chain.faults.supplyRaw?.({ attempt: supplyCalls });
        if (raw !== undefined) return raw;
        const forced = chain.faults.supply?.(block);
        return word(forced ?? supplyAt(block));
      }
      const reply = answer({ method, params }, { batchIndex: -1, index: 0 });
      if (!reply.ok) throw new Error(reply.error);
      return reply.result;
    },
  };

  chain.supplyAt = supplyAt;
  chain.balanceAt = balanceAt;
  return chain;
}
