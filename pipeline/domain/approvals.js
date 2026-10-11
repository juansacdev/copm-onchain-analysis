import { dayOf } from "./units.js";

// Approvals are only counted, never stored one by one: 120k+ events with no
// bearing on balances. `block` is the highest block already counted; events at
// or below it are skipped, which makes replaying an interrupted stage safe.
export const newApprovals = () => ({ block: 0, daily: {}, spenders: {} });

export function applyApprovals(approvals, logs) {
  for (const log of logs) {
    if (log.b <= approvals.block) continue;
    const day = dayOf(log.ts);
    approvals.daily[day] = (approvals.daily[day] ?? 0) + 1;
    approvals.spenders[log.spender] = (approvals.spenders[log.spender] ?? 0) + 1;
  }
  for (const log of logs) approvals.block = Math.max(approvals.block, log.b);
  return approvals;
}
