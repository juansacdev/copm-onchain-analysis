// Turns the loaded data into the named variables the dictionaries use:
// every figure the page prints, already formatted for the language. Plain JS
// so that node --test can render the real dictionaries against a fixture.
import {
  formatCopmExact,
  formatDate,
  formatDecimal,
  formatInt,
  formatMonth,
  formatMonthShort,
  formatPercent,
  formatUsd,
  formatUsdFull,
} from "../../lib/format.js";
import { TAKEOFF_TRANSFERS, TURNOVER_WINDOW_DAYS } from "../../lib/analysis-data.js";
import { shortAddress } from "../../lib/links.js";

// The press article cited in the "In the press" chapter was published this
// month; the page shows what the data says for that month.
export const PRESS_MONTH = "2025-09";

const DAYS_PER_MONTH = 30.4375;
const MONTHS_PER_YEAR = 12;

function claim(condition, message) {
  if (!condition) throw new Error(`the analysis page can no longer say this: ${message}`);
}

function chainVars(prefix, c, locale) {
  const int = (n) => formatInt(n, locale);
  const usdShort = (n) => formatUsd(n, locale, "short");
  const usdLong = (n) => formatUsd(n, locale, "long");
  const month = (key) => formatMonth(key, locale);
  const date = (iso) => formatDate(iso, locale);

  const vars = {
    Label: c.label,
    AddressShort: shortAddress(c.address),
    DeployMonth: month(c.deployDate.slice(0, 7)),
    Days: int(c.totalDays),
    Transfers: int(c.transfers),
    Approvals: int(c.approvals),
    Events: int(c.events),
    Block: int(c.checkpointBlock),
    GrossUsdShort: usdShort(c.grossUsd),
    GrossUsdLong: usdLong(c.grossUsd),
    Ticket: formatUsdFull(c.avgTicketUsd, locale),
    AvgDailyTransfers: int(Math.round(c.avgDailyTransfers)),
    Holders: int(c.holders),
    Frozen: int(c.frozen),
    SupplyExact: formatCopmExact(c.supplyWei, locale),
    ChecksPassed: int(c.checksPassed),
    ChecksTotal: int(c.checksTotal),
    PeakMonth: month(c.peakMonth.key),
    PeakMonthShort: formatMonthShort(c.peakMonth.key, locale),
    PeakMonthUsdShort: usdShort(c.peakMonth.usd),
    PeakMonthUsdLong: usdLong(c.peakMonth.usd),
    PeakTxMonth: month(c.peakTxMonth.key),
    PeakTxCount: int(c.peakTxMonth.count),
    PeakTxMonthsAfterDeploy: int(c.peakTxMonthsAfterDeploy),
    RecordDay: date(c.recordVolume.day),
    RecordUsd: usdShort(c.recordVolume.usd),
    RecordTx: int(c.recordVolume.transfers),
    SecondDay: date(c.topVolumeDays[1].day),
    SecondUsd: usdShort(c.topVolumeDays[1].usd),
    TopTxInWindow: int(c.topTxWindow.count),
    WindowFrom: month(c.topTxWindow.from),
    WindowTo: month(c.topTxWindow.to),
    TurnoverMonthly: formatDecimal(c.turnoverMonthly, 1, locale),
    TurnoverYearly: int(Math.round(c.turnoverMonthly * MONTHS_PER_YEAR)),
  };

  if (c.takeoff) {
    vars.TakeoffDay = date(c.takeoff.day);
    vars.TakeoffMonths = int(Math.round(c.takeoff.daysFromDeploy / DAYS_PER_MONTH));
    vars.TakeoffWeeks = int(Math.round(c.takeoff.daysFromDeploy / 7));
  }

  const after = c.afterPeak;
  if (after) {
    vars.ReboundMonth = month(after.reboundMonth);
    vars.ReboundUsd = usdShort(after.reboundUsd);
    vars.LatestMonth = month(after.latestMonth);
    vars.LatestUsd = usdShort(after.latestUsd);
    vars.LatestPct = formatPercent((after.latestUsd / c.peakMonth.usd) * 100, 0, locale);
    if (after.settledFrom) {
      vars.SettledFrom = month(after.settledFrom);
      vars.SettledTo = month(after.settledTo);
      vars.SettledMin = usdShort(after.settledMinUsd);
      vars.SettledMax = usdShort(after.settledMaxUsd);
    }
  }

  return Object.fromEntries(Object.entries(vars).map(([key, value]) => [`${prefix}${key}`, value]));
}

export function buildVars(data, locale, { pressMonth = PRESS_MONTH } = {}) {
  const { polygon, celo } = data.chains;
  const all = data.combined;

  // The copy states these things as true; a data change that breaks one must
  // fail the build, not publish a wrong sentence.
  for (const c of [polygon, celo]) {
    claim(c.supplyExact, `${c.label} supply reconciles to the wei (supply-exact validation rule)`);
    claim(c.checksPassed === c.checksTotal, `every validation rule passes on ${c.label}`);
  }
  claim(polygon.checksTotal === celo.checksTotal, "both chains run the same number of validation rules");
  claim(celo.takeoff && polygon.takeoff, "both chains crossed the takeoff threshold");
  claim(celo.takeoff.daysFromDeploy < polygon.takeoff.daysFromDeploy, "Celo took off sooner than Polygon");
  claim(celo.peakTxMonth.key < polygon.peakMonth.key, "Celo's busiest month came before Polygon's peak month");
  claim(polygon.afterPeak?.settledFrom, "Polygon has complete months between its peak and its rebound");

  const press = polygon.months.find((m) => m.key === pressMonth);
  claim(press, `the series covers the press month ${pressMonth}`);

  return {
    ...chainVars("polygon", polygon, locale),
    ...chainVars("celo", celo, locale),
    copPerUsd: formatInt(data.copPerUsd, locale),
    asOf: formatDate(all.asOf, locale),
    chainCount: formatInt(all.chainCount, locale),
    allEvents: formatInt(all.events, locale),
    allTransfers: formatInt(all.transfers, locale),
    allApprovals: formatInt(all.approvals, locale),
    allAdminEvents: formatInt(all.adminEvents, locale),
    allHolders: formatInt(all.holders, locale),
    allGrossUsdShort: formatUsd(all.grossUsd, locale, "short"),
    allGrossUsdLong: formatUsd(all.grossUsd, locale, "long"),
    allChecksPassed: formatInt(all.checksPassed, locale),
    allChecksTotal: formatInt(all.checksTotal, locale),
    checksPerChain: formatInt(polygon.checksTotal, locale),
    ticketRatio: formatInt(Math.round(polygon.avgTicketUsd / celo.avgTicketUsd), locale),
    takeoffThreshold: formatInt(TAKEOFF_TRANSFERS, locale),
    turnoverWindowDays: formatInt(TURNOVER_WINDOW_DAYS, locale),
    pressMonthName: formatMonth(pressMonth, locale),
    pressMonthUsd: formatUsd(press.usd, locale, "short"),
  };
}
