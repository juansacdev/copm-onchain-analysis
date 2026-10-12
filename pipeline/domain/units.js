export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Raw 18-decimal amount to a COPM number with 6 decimals (truncated).
export const toCOPM = (raw) => Number(raw / 10n ** 12n) / 1e6;

// Unix seconds to the UTC calendar day, YYYY-MM-DD.
export const dayOf = (ts) => new Date(ts * 1000).toISOString().slice(0, 10);
