// Trust rules for eth_getLogs answers. Public endpoints sit behind load
// balancers and may answer a range with an empty array and no error when the
// backend that took the request lacks that part of the log index, so an
// answer is only believed under these rules.

// R3. A batch is [eth_blockNumber, eth_getLogs(canary block), ...ranges]. It is
// discarded unless the canary block returned exactly the log count recorded
// for it and the head is at or beyond the last range end.
export function checkBatch({ blockNumber, canaryLogs, expectedCanary, lastRangeEnd }) {
  if (canaryLogs.length !== expectedCanary) return { ok: false, reason: "canary" };
  if (!Number.isInteger(blockNumber) || blockNumber < lastRangeEnd) {
    return { ok: false, reason: "head" };
  }
  return { ok: true };
}

export const newRangeState = () => ({ empties: 0, done: false });

// R1 and R2. Answers come from batches that already passed checkBatch. A
// non-empty answer is final; an empty one is final only after
// `emptyConfirmations` independent empty answers.
export function observeRange(state, logCount, emptyConfirmations) {
  if (logCount > 0) return { empties: state.empties, done: true };
  const empties = state.empties + 1;
  return { empties, done: empties >= emptyConfirmations };
}

// R7. The logs a range answer holds must be what was asked for: inside
// [from, to], not flagged `removed` (a reorged log), and unique by
// (blockNumber, logIndex). Checks R1-R3 only look at how many logs came back,
// so without this a node that repeats a log, or returns one from another block,
// would be counted and stored as if it were data. An exact repeat is dropped; two
// different logs under the same key mean the answer cannot be trusted, and so
// does anything outside the range.
const sameLog = (a, b) => JSON.stringify(a, Object.keys(a).sort()) === JSON.stringify(b, Object.keys(b).sort());

export function checkRangeLogs(logs, { from, to }) {
  const unique = new Map();
  for (const entry of logs) {
    const block = Number(entry.blockNumber);
    const index = Number(entry.logIndex);
    if (!Number.isInteger(block) || !Number.isInteger(index)) return { ok: false, reason: "log without a block number or index" };
    if (block < from || block > to) return { ok: false, reason: `log of block ${block} outside ${from}-${to}` };
    if (entry.removed === true) return { ok: false, reason: `log ${block}:${index} flagged removed` };
    const key = `${block}:${index}`;
    const seen = unique.get(key);
    if (seen && !sameLog(seen, entry)) return { ok: false, reason: `two different logs at ${key}` };
    if (!seen) unique.set(key, entry);
  }
  return { ok: true, logs: [...unique.values()] };
}
