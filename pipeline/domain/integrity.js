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
