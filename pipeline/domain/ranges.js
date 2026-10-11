// Block interval planning. Block numbers are plain numbers (well below 2^53);
// only token amounts need BigInt.

// Splits [from, to] into inclusive ranges of at most `size` blocks. The last
// range is short when the interval is not a multiple of `size`.
export function planRanges(from, to, size) {
  if (!Number.isInteger(size) || size <= 0) {
    throw new Error("size must be a positive integer");
  }
  const ranges = [];
  for (let start = from; start <= to; start += size) {
    ranges.push({ from: start, to: Math.min(start + size - 1, to) });
  }
  return ranges;
}

// A stage is the unit that is verified and persisted: same arithmetic as
// ranges, bigger step.
export const planStages = planRanges;

// Chunks ranges so that each JSON-RPC batch carries `perBatch` of them.
export function groupBatches(ranges, perBatch) {
  const batches = [];
  for (let i = 0; i < ranges.length; i += perBatch) {
    batches.push(ranges.slice(i, i + perBatch));
  }
  return batches;
}
