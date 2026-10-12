// A tiny chain for the report tests: 5 days over two months, 4,000 COP per USD
// on every day unless a test says otherwise.
export const COPM = (n) => BigInt(n) * 10n ** 18n;
export const row = (day, transfers, grossCOPM, supplyEnd = 0, rate = 4000) => ({
  day,
  supplyEnd,
  transfers,
  activeAddresses: 1,
  grossCOPM,
  netCOPM: grossCOPM / 2,
  mintCOPM: 0,
  burnCOPM: 0,
  rate,
  supplyUSD: supplyEnd / rate,
  grossUSD: grossCOPM / rate,
  netUSD: grossCOPM / 2 / rate,
  mintUSD: 0,
  burnUSD: 0,
});

export function chain(overrides = {}) {
  return {
    manifest: { address: "0xabc", decimals: 18, deployBlock: "100", deployTimestamp: "2024-01-30T10:00:00.000Z" },
    state: {
      lastBlock: 5000,
      lastBlockTime: Date.UTC(2024, 1, 3, 12) / 1000,
      minted: COPM(1000).toString(),
      burned: COPM(400).toString(),
      totalSupply: COPM(600).toString(),
      transfers: 8,
      approvals: 20,
      adminEvents: 3,
    },
    summary: {
      range: { firstDay: "2024-01-30", lastDay: "2024-02-03", totalDays: 5 },
      totals: {
        transferEvents: 8,
        grossVolumeCOPM: 8_000_000,
        grossVolumeUSD: 2000,
        netVolumeCOPM: 4_000_000,
        netVolumeUSD: 1000,
        totalMintedCOPM: 1000,
        totalMintedUSD: 0.25,
        totalBurnedCOPM: 400,
        totalBurnedUSD: 0.1,
        currentSupplyCOPM: 600,
        currentSupplyUSD: 0.15,
      },
      averages: { avgDailyTransfers: 1.6, avgDailyGrossVolumeUSD: 400 },
      peaks: {
        maxTransfersInOneDay: { day: "2024-02-01", count: 4 },
        maxGrossVolumeInOneDay: { day: "2024-02-01", copm: 4_000_000, usd: 1000 },
        maxSupplyEndOfDay: { day: "2024-02-02", copm: 900 },
        maxSupplyEndOfDayUsd: { day: "2024-02-01", usd: 300 },
      },
      fx: { latestDay: "2024-02-03", latestCopPerUsd: 3900.5, provisionalDays: 0, minCopPerUsd: 3800, maxCopPerUsd: 4100 },
    },
    holders: { holders: 7, addressesEverSeen: 12, contracts: 2, frozen: ["0x1"], concentration: { top1Pct: 60.12, top10Pct: 99.5 }, roles: { MINTER_ROLE: ["0xa"] } },
    validation: { passed: 17, failed: 0, validatedAt: "2024-02-03T13:00:00.000Z", checks: new Array(17).fill({ ok: true }) },
    adminEvents: [{ name: "Upgraded" }, { name: "RoleGranted" }, { name: "RoleGranted" }],
    daily: [
      row("2024-01-30", 1, 1_000_000),
      row("2024-01-31", 1, 1_000_000),
      row("2024-02-01", 4, 4_000_000),
      row("2024-02-02", 0, 0),
      row("2024-02-03", 2, 2_000_000),
    ],
    ...overrides,
  };
}

