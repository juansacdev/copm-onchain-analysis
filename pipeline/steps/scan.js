// Verified incremental scan of every event the COPM contract emits.
//
// Public RPC endpoints can answer eth_getLogs with an empty array and no error
// when the backend that takes the request lacks that part of the log index, so
// a plain scan silently stores holes. This scan only believes an answer under
// the rules below, and only moves its checkpoint once the events it holds add
// up, to the wei, to the contract's totalSupply:
//
//   R1  a non-empty range answer from a verified batch is final
//   R2  an empty one needs `emptyConfirmations` independent empty answers
//   R3  every batch is [eth_blockNumber, canary block, ...ranges] and is thrown
//       away unless the canary count matches and the head covers the ranges
//   R4  a stage is persisted only if minted - burned == totalSupply at its end
//   R5  writes are atomic and drop rows above the previous checkpoint, so a
//       re-run after a crash never duplicates anything
//   R6  no message ever contains the endpoint URL (see adapters/rpc.js)
import { getChain, scanSettings, dataDir } from "../config/chains.js";
import { createRpc, requireRpcUrl } from "../adapters/rpc.js";
import { createStore, ensureDir } from "../adapters/store.js";
import { applyApprovals } from "../domain/approvals.js";
import { EVENT_TOPICS, decodeLog } from "../domain/events.js";
import { checkBatch, newRangeState, observeRange } from "../domain/integrity.js";
import { createLedger, foldTransfers } from "../domain/ledger.js";
import { groupByMonth, mergePartition, monthKey } from "../domain/partition.js";
import { groupBatches, planRanges, planStages } from "../domain/ranges.js";
import { reconcileSupply } from "../domain/reconcile.js";

const SCHEMA = 1;
const TOTAL_SUPPLY_SELECTOR = "0x18160ddd";
const HEADERS_PER_BATCH = 100;

const hex = (n) => `0x${n.toString(16)}`;
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const byLogOrder = (a, b) => a.b - b.b || a.i - b.i;

// Runs `fn` over `items` with at most `concurrency` in flight.
async function mapPool(items, concurrency, fn) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}

// Work queue where a worker may wait for items that another worker's result
// will put back (ranges that still need an empty confirmation).
function createWorkQueue(items) {
  const queue = [...items];
  const waiting = [];
  let inFlight = 0;
  let aborted = false;
  const wake = () => waiting.splice(0).forEach((resolve) => resolve());
  return {
    async take() {
      for (;;) {
        if (aborted) return null;
        if (queue.length > 0) {
          inFlight++;
          return queue.shift();
        }
        if (inFlight === 0) return null;
        await new Promise((resolve) => waiting.push(resolve));
      }
    },
    push(item) {
      if (aborted) return;
      queue.push(item);
      wake();
    },
    done() {
      inFlight--;
      wake();
    },
    abort() {
      aborted = true;
      queue.length = 0;
      wake();
    },
  };
}

const newStats = () => ({
  stages: 0,
  blocks: 0,
  logs: { transfer: 0, approval: 0, admin: 0 },
  batches: 0,
  rejectedCanary: 0,
  rejectedHead: 0,
  rejectedError: 0,
  emptyAnswers: 0,
  headerBatches: 0,
});

const initialState = (chain) => ({
  schema: SCHEMA,
  chain: chain.key,
  address: chain.address,
  lastBlock: chain.deployBlock - 1,
  lastBlockTime: null,
  minted: "0",
  burned: "0",
  totalSupply: "0",
  transfers: 0,
  approvals: 0,
  adminEvents: 0,
  canary: null,
  updatedAt: null,
});

export async function runScan({
  chain,
  settings,
  rpc,
  store,
  clock = () => new Date(),
  log = console.log,
  sleep = defaultSleep,
  fresh = false,
}) {
  const stats = newStats();
  const address = chain.address.toLowerCase();
  const backoff = (attempt) => sleep(Math.min(100 * attempt, 2000));

  async function withAttempts(label, fn) {
    let reason = "unknown";
    for (let attempt = 1; attempt <= settings.maxBatchAttempts; attempt++) {
      try {
        return await fn();
      } catch (err) {
        reason = err.message;
        await backoff(attempt);
      }
    }
    throw new Error(`${label} failed ${settings.maxBatchAttempts} times; last error: ${reason}`);
  }

  const assertOwnLogs = (logs) => {
    for (const entry of logs) {
      if (entry.address?.toLowerCase() !== address) {
        throw new Error(`unexpected log address in an eth_getLogs answer for ${chain.key}`);
      }
    }
  };

  const logsFilter = (from, to) => ({ address: chain.address, fromBlock: hex(from), toBlock: hex(to) });

  // The deployment block is the first canary: the proxy constructor emits
  // Upgraded there. A false-empty or partial answer lacks it, so keep asking
  // until it shows up.
  async function bootstrapCanary() {
    return withAttempts(`reading the deployment block ${chain.deployBlock}`, async () => {
      const logs = await rpc.call("eth_getLogs", [logsFilter(chain.deployBlock, chain.deployBlock)]);
      assertOwnLogs(logs);
      if (!logs.some((l) => l.topics?.[0]?.toLowerCase() === EVENT_TOPICS.Upgraded)) {
        throw new Error("answer lacks the Upgraded event of the deployment");
      }
      return { block: chain.deployBlock, logs: logs.length };
    });
  }

  // R1-R3 over one stage. Returns the raw logs of every range.
  async function fetchStageLogs(stage, canary) {
    const ranges = planRanges(stage.from, stage.to, settings.maxLogRange);
    const rangeState = ranges.map(newRangeState);
    const rangeLogs = ranges.map(() => []);
    const queue = createWorkQueue(
      groupBatches(
        ranges.map((_, index) => index),
        settings.rangesPerBatch
      ).map((indexes) => ({ indexes, rejections: 0 }))
    );

    async function processBatch(item) {
      const members = item.indexes.map((index) => ranges[index]);
      const lastRangeEnd = Math.max(...members.map((r) => r.to));
      const calls = [
        { method: "eth_blockNumber", params: [] },
        { method: "eth_getLogs", params: [logsFilter(canary.block, canary.block)] },
        ...members.map((r) => ({ method: "eth_getLogs", params: [logsFilter(r.from, r.to)] })),
      ];
      stats.batches++;
      const results = await rpc.batch(calls);

      let rejection = null;
      // Item 0 is the head; every other item must be a log array.
      const failed = results.findIndex((r, i) => !r.ok || (i > 0 && !Array.isArray(r.result)));
      if (failed >= 0) {
        stats.rejectedError++;
        rejection = `error: ${results[failed].error ?? "malformed eth_getLogs answer"}`;
      } else {
        const verdict = checkBatch({
          blockNumber: Number(results[0].result),
          canaryLogs: results[1].result,
          expectedCanary: canary.logs,
          lastRangeEnd,
        });
        if (!verdict.ok) {
          if (verdict.reason === "canary") stats.rejectedCanary++;
          else stats.rejectedHead++;
          rejection = verdict.reason;
        }
      }

      if (rejection) {
        item.rejections++;
        if (item.rejections >= settings.maxBatchAttempts) {
          throw new Error(
            `batch for blocks ${members[0].from}-${members.at(-1).to} rejected ${item.rejections} times; last reason: ${rejection}`
          );
        }
        await backoff(item.rejections);
        queue.push(item);
        return;
      }

      const pending = [];
      item.indexes.forEach((rangeIndex, position) => {
        const logs = results[2 + position].result;
        assertOwnLogs(logs);
        if (logs.length === 0) stats.emptyAnswers++;
        else rangeLogs[rangeIndex] = logs;
        rangeState[rangeIndex] = observeRange(rangeState[rangeIndex], logs.length, settings.emptyConfirmations);
        if (!rangeState[rangeIndex].done) pending.push(rangeIndex);
      });
      // Independent confirmation: the range goes back through a fresh batch,
      // with its own canary and head check.
      if (pending.length > 0) queue.push({ indexes: pending, rejections: 0 });
    }

    async function worker() {
      for (;;) {
        const item = await queue.take();
        if (!item) return;
        try {
          await processBatch(item);
        } catch (err) {
          queue.abort();
          throw err;
        } finally {
          queue.done();
        }
      }
    }

    await Promise.all(Array.from({ length: settings.workers }, worker));
    return rangeLogs.flat();
  }

  // Exact timestamp per block: the log's own blockTimestamp when the node
  // provides one, the block header otherwise (old Polygon blocks answer 0x0).
  async function resolveTimestamps(logs, stageEnd) {
    const known = new Map();
    for (const entry of logs) {
      const ts = Number(entry.blockTimestamp ?? 0);
      if (ts > 0) known.set(Number(entry.blockNumber), ts);
    }
    const missing = new Set(logs.map((entry) => Number(entry.blockNumber)));
    missing.add(stageEnd);
    for (const block of known.keys()) missing.delete(block);

    const chunks = [];
    const list = [...missing].sort((a, b) => a - b);
    for (let i = 0; i < list.length; i += HEADERS_PER_BATCH) chunks.push(list.slice(i, i + HEADERS_PER_BATCH));

    await mapPool(chunks, settings.workers, async (chunk) => {
      let outstanding = chunk;
      for (let attempt = 1; outstanding.length > 0; attempt++) {
        if (attempt > settings.maxBatchAttempts) {
          throw new Error(`block headers for ${outstanding.length} blocks (first ${outstanding[0]}) unavailable after ${settings.maxBatchAttempts} attempts`);
        }
        if (attempt > 1) await backoff(attempt);
        stats.headerBatches++;
        const results = await rpc.batch(
          outstanding.map((block) => ({ method: "eth_getBlockByNumber", params: [hex(block), false] }))
        );
        const retry = [];
        results.forEach((result, position) => {
          const ts = Number(result.ok ? result.result?.timestamp : 0);
          if (ts > 0) known.set(outstanding[position], ts);
          else retry.push(outstanding[position]);
        });
        outstanding = retry;
      }
    });
    return known;
  }

  // R4. The pinned eth_call goes alone, never inside a batch whose items may be
  // served by different backends: a backend with full log history can lack
  // recent state, and then it errors instead of lying.
  const readTotalSupply = (block) =>
    withAttempts(`totalSupply() at block ${block}`, async () => {
      const raw = await rpc.call("eth_call", [{ to: chain.address, data: TOTAL_SUPPLY_SELECTOR }, hex(block)]);
      return BigInt(raw);
    });

  function persistStage(state, stage, { transferRows, adminRows, approvalRows, ledger, supply, canary, lastBlockTime }) {
    const previous = state.lastBlock;

    // Leftovers of an interrupted stage can sit in months this stage does not
    // touch; trim every partition that could hold rows above the checkpoint.
    const groups = groupByMonth(transferRows);
    const fromKey = state.lastBlockTime ? monthKey(state.lastBlockTime) : "";
    for (const key of store.listPartitions()) {
      if (groups.has(key) || key < fromKey) continue;
      const rows = store.readPartition(key);
      const kept = rows.filter((row) => row.b <= previous);
      if (kept.length !== rows.length) store.writePartition(key, kept);
    }
    for (const [key, rows] of groups) {
      store.writePartition(key, mergePartition(store.readPartition(key), rows, previous));
    }

    const storedAdmin = store.readAdminEvents();
    const keptAdmin = storedAdmin.filter((event) => event.b <= previous);
    if (adminRows.length > 0 || keptAdmin.length !== storedAdmin.length) {
      store.writeAdminEvents(mergePartition(keptAdmin, adminRows, previous));
    }

    const approvals = store.readApprovals();
    applyApprovals(approvals, approvalRows);
    if (approvalRows.length > 0) store.writeApprovals(approvals);

    // Last: its presence at this lastBlock proves everything above is complete.
    store.writeState({
      ...state,
      lastBlock: stage.to,
      lastBlockTime,
      minted: ledger.minted.toString(),
      burned: ledger.burned.toString(),
      totalSupply: supply.toString(),
      transfers: state.transfers + transferRows.length,
      approvals: Object.values(approvals.daily).reduce((sum, n) => sum + n, 0),
      adminEvents: state.adminEvents + adminRows.length,
      canary,
      updatedAt: clock().toISOString(),
    });
  }

  async function scanStage(state, stage, canary) {
    const rawLogs = await fetchStageLogs(stage, canary);
    const timestamps = await resolveTimestamps(rawLogs, stage.to);

    const transferRows = [];
    const adminRows = [];
    const approvalRows = [];
    const decoded = rawLogs
      .map((entry) => ({ entry, b: Number(entry.blockNumber), i: Number(entry.logIndex) }))
      .sort(byLogOrder);
    for (const { entry, b, i } of decoded) {
      const ts = timestamps.get(b);
      const { name, args } = decodeLog(entry);
      if (name === "Transfer") {
        transferRows.push({ b, ts, t: entry.transactionHash, i, f: args.from, r: args.to, v: args.value });
      } else if (name === "Approval") {
        approvalRows.push({ b, ts, spender: args.spender });
      } else {
        adminRows.push({ b, ts, t: entry.transactionHash, i, name, args, topics: entry.topics, data: entry.data });
      }
    }

    const ledger = foldTransfers(
      createLedger({ minted: BigInt(state.minted), burned: BigInt(state.burned) }),
      transferRows
    );
    const supply = await readTotalSupply(stage.to);
    const check = reconcileSupply({ minted: ledger.minted, burned: ledger.burned, totalSupply: supply });
    if (!check.ok) {
      throw new Error(
        `supply does not reconcile at block ${stage.to}: events give ${check.derived}, ` +
          `totalSupply() is ${check.totalSupply}, diff ${check.diff}. Nothing was written for this stage.`
      );
    }

    // After this stage the canary is the last block that holds a stored log,
    // so a daily run is checked against recent history.
    const last = decoded.at(-1);
    const nextCanary = last
      ? { block: last.b, logs: decoded.filter((d) => d.b === last.b).length }
      : canary;

    persistStage(state, stage, {
      transferRows,
      adminRows,
      approvalRows,
      ledger,
      supply,
      canary: nextCanary,
      lastBlockTime: timestamps.get(stage.to),
    });

    stats.stages++;
    stats.blocks += stage.to - stage.from + 1;
    stats.logs.transfer += transferRows.length;
    stats.logs.approval += approvalRows.length;
    stats.logs.admin += adminRows.length;
    return store.readState();
  }

  if (fresh) {
    log("fresh start: clearing previous scan output");
    store.clear();
  }

  let state = store.readState() ?? initialState(chain);
  if (state.schema !== SCHEMA) {
    throw new Error(`state.json has schema ${state.schema}, expected ${SCHEMA}. run scan --fresh`);
  }
  if (state.address.toLowerCase() !== address) {
    throw new Error(`state.json belongs to ${state.address}, not ${chain.address}. run scan --fresh`);
  }

  const head = Number(await rpc.call("eth_blockNumber", []));
  const pin = head - settings.confirmations;
  if (pin <= state.lastBlock) {
    log(`up to date at block ${state.lastBlock} (head ${head}, ${settings.confirmations} confirmations)`);
    return { status: "up-to-date", lastBlock: state.lastBlock, stats };
  }

  const stages = planStages(state.lastBlock + 1, pin, settings.stageBlocks);
  log(`chain: ${chain.key}, blocks ${state.lastBlock + 1} -> ${pin} in ${stages.length} stage(s)`);

  let canary = state.canary ?? (await bootstrapCanary());
  for (const [n, stage] of stages.entries()) {
    log(`stage ${n + 1}/${stages.length}: blocks ${stage.from}-${stage.to}`);
    state = await scanStage(state, stage, canary);
    canary = state.canary;
    log(`  checkpoint ${state.lastBlock}: supply ${state.totalSupply} reconciled`);
  }

  log(
    `scan complete: ${stats.blocks} blocks, ${stats.logs.transfer} transfers, ${stats.logs.approval} approvals, ` +
      `${stats.logs.admin} admin events; ${stats.batches} batches ` +
      `(${stats.rejectedCanary} rejected by canary, ${stats.rejectedHead} by head, ${stats.rejectedError} by error), ` +
      `${stats.emptyAnswers} empty answers, ${stats.headerBatches} header batches`
  );
  return { status: "scanned", lastBlock: state.lastBlock, stats };
}

export async function run({ chainKey, fresh = false, env = process.env, overrides = {} }) {
  const chain = getChain(chainKey);
  const url = requireRpcUrl(chainKey, env);
  const settings = scanSettings(chainKey, env, overrides);
  const dir = dataDir(chainKey);
  ensureDir(dir);
  await runScan({
    chain,
    settings,
    rpc: createRpc({ url }),
    store: createStore(dir),
    fresh,
  });
}
