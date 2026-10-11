import { keccak256, stringToHex } from "viem";
import { EVENT_TOPICS } from "../../pipeline/domain/events.js";
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

const SUPPLY_SELECTOR = "0x18160ddd";

export function createFakeChain({ logs, head, address = TOKEN, zeroTimestamps = false }) {
  const chain = {
    head,
    logs: [...logs],
    faults: {}, // hooks: getLogs, head, header, supply, callError
    seen: { batches: [], singles: [], getLogsCalls: 0, headerCalls: 0 },
  };

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

  function answer(call, ctx) {
    switch (call.method) {
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
        return { ok: true, result: { number: hex(block), timestamp: hex(tsOf(block)) } };
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
      if (method === "eth_call") {
        const failure = chain.faults.callError?.({ attempt: chain.seen.singles.length });
        if (failure) throw failure;
        const [{ data }, blockTag] = params;
        if (data !== SUPPLY_SELECTOR) throw new Error("unexpected call data");
        const block = Number(blockTag);
        const forced = chain.faults.supply?.(block);
        return word(forced ?? supplyAt(block));
      }
      const reply = answer({ method, params }, { batchIndex: -1, index: 0 });
      if (!reply.ok) throw new Error(reply.error);
      return reply.result;
    },
  };

  chain.supplyAt = supplyAt;
  return chain;
}
