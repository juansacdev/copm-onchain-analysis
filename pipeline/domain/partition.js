// Transfers are stored in one file per UTC month so that a daily run
// rewrites one small file instead of the whole history.

export const monthKey = (ts) => new Date(ts * 1000).toISOString().slice(0, 7);

export function groupByMonth(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = monthKey(row.ts);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

// R5. Rows above the previous checkpoint can only be leftovers of a stage that
// crashed before the checkpoint moved, so they are dropped before the new
// stage goes in. A log is identified by (block, log index); the new row wins.
export function mergePartition(existing, incoming, previousCheckpoint) {
  const byKey = new Map();
  for (const row of existing) {
    if (row.b <= previousCheckpoint) byKey.set(`${row.b}:${row.i}`, row);
  }
  for (const row of incoming) byKey.set(`${row.b}:${row.i}`, row);
  return [...byKey.values()].sort((a, b) => a.b - b.b || a.i - b.i);
}
