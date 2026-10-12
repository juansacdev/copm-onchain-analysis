// The headline cards of the dashboard: one finding each, as a big figure, a
// label and one supporting figure. Every card is computed from the data of the
// chains in view and exists only while the data supports it: a card whose
// condition fails changes its wording or is not produced at all. The wording
// lives in the dictionaries (`t` is the `cards` branch of one of them).
//
// Plain JS, no DOM and no Astro imports: the server renders the first set and
// the browser re-renders with the same function when the chain filter changes.
import { shortDate } from "./dashboard-format.js";
import { selectedChains } from "./dashboard-view.js";
import { formatDecimal, formatInt, formatUsd } from "./format.js";
import { interpolate } from "./template.js";

const sum = (list, pick) => list.reduce((total, item) => total + pick(item), 0);

// chains: { polygon, celo } in the browser payload's shape. chain: the chain
// filter ("both", "polygon" or "celo").
export function headlineCards({ chains, chain, t, lang }) {
  const selected = selectedChains(chains, { chain });
  if (selected.length === 0) return [];

  const usd = (amount) => formatUsd(amount, lang, "short", { trim: true });
  const percent = (n, digits = 1) => `${formatDecimal(n, digits, lang, { trim: true })}${lang === "es" ? " %" : "%"}`;
  const out = [];

  // What was minted, against everything that moved, both in dollars valued
  // day by day.
  const mintedUsd = sum(selected, (c) => c.flows.usd.minted);
  if (mintedUsd > 0) {
    out.push({
      id: "minted",
      figure: usd(mintedUsd),
      label: t.minted.label,
      support: interpolate(t.minted.support, { gross: usd(sum(selected, (c) => c.flows.usd.gross)) }),
    });
  }

  // How many times each minted peso is counted in the gross volume.
  const turnoverOf = (list) => {
    const minted = sum(list, (c) => c.flows.minted);
    return minted > 0 ? sum(list, (c) => c.flows.gross) / minted : null;
  };
  const turnover = turnoverOf(selected);
  if (turnover !== null) {
    const times = (n) => `${formatDecimal(n, 1, lang)}×`;
    const each = selected.map((c) => ({ c, value: turnoverOf([c]) })).filter((x) => x.value !== null);
    out.push({
      id: "turnover",
      figure: times(turnover),
      label: t.turnover.label,
      support: selected.length > 1 ? each.map(({ c, value }) => `${c.label} ${times(value)}`).join(" · ") : t.turnover.support,
    });
  }

  // The supply today as a share of its peak, in COPM: the card has no unit
  // switch, so the supply, its peak and the day of that peak are all COPM (the
  // USD peak is another day, see supplyPeak.usd) and the label says so.
  const peaked = selected.filter((c) => c.supplyPeak);
  const peak = sum(peaked, (c) => c.supplyPeak.copm.amount);
  if (peaked.length > 0 && peak > 0) {
    const current = sum(peaked, (c) => c.checkpoint.totalSupply);
    const atPeak = current >= peak;
    const support =
      peaked.length === 1
        ? interpolate(t.supply.support, { date: shortDate(peaked[0].supplyPeak.copm.day, lang) })
        : interpolate(t.supply.supportMany, { peaks: peaked.map((c) => `${c.label} ${shortDate(c.supplyPeak.copm.day, lang)}`).join(", ") });
    out.push({
      id: "supply",
      figure: percent(atPeak ? 100 : (current / peak) * 100, 0),
      label: atPeak ? t.supply.labelAtPeak : t.supply.label,
      support,
    });
  }

  // How much of the supply sits in the largest address of each chain, and how
  // many addresses hold a balance at all.
  const supply = sum(selected, (c) => c.checkpoint.totalSupply);
  if (supply > 0) {
    const largest = sum(selected, (c) => c.holders.top[0]?.balance ?? 0);
    out.push({
      id: "concentration",
      figure: percent((largest / supply) * 100),
      label: t.concentration.label,
      support: interpolate(t.concentration.support, { count: formatInt(sum(selected, (c) => c.holders.count), lang) }),
    });
  }

  // How much of the burns one address made; with no burns, how much of the
  // mints one address received.
  const side = ["burn", "mint"].find((name) => sum(selected, (c) => c.issuance[name].addresses) > 0);
  if (side) {
    const parties = selected.filter((c) => c.issuance[side].addresses > 0);
    const volume = sum(parties, (c) => c.issuance[side].volume);
    const top = sum(parties, (c) => c.issuance[side].top[0]?.volume ?? 0);
    const count = sum(parties, (c) => c.issuance[side].addresses);
    const words = side === "burn" ? t.redemption : t.issuance;
    if (volume > 0) {
      out.push({
        id: "redemption",
        figure: percent((top / volume) * 100),
        label: words.label,
        support: count === 1 ? words.supportOne : interpolate(words.support, { count: formatInt(count, lang) }),
      });
    }
  }

  // Control: the addresses that hold the contract's roles, and the frozen
  // accounts when there are some.
  const holders = sum(selected, (c) => c.governance.roleHolders);
  const frozen = sum(selected, (c) => c.governance.frozen.length);
  const everyone = selected.every((c) => c.governance.roleHolders === 1);
  const label = holders === 1 && selected.length === 1 ? t.control.labelOne : everyone && selected.length > 1 ? t.control.labelAll : t.control.labelMany;
  out.push({
    id: "control",
    figure: formatInt(holders, lang),
    label,
    support:
      frozen === 0
        ? t.control.frozenNone
        : interpolate(frozen === 1 ? t.control.frozenOne : t.control.frozenMany, { count: formatInt(frozen, lang) }),
  });

  return out;
}
