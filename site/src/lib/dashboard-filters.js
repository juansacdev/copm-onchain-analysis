// The dashboard's three filters and their URL form. The state travels in the
// URL hash as a bare token ("polygon-90d-usd") so a view can be linked.
// Plain JS, no DOM and no Astro imports: node --test and the browser both use it.

export const CHAIN_CHOICES = ["both", "polygon", "celo"];
export const PERIOD_CHOICES = ["30d", "90d", "1y", "all"];
export const UNIT_CHOICES = ["copm", "usd"];

export const DEFAULT_STATE = Object.freeze({ chain: "both", period: "30d", unit: "copm" });

const check = (name, choices, value) => {
  if (!choices.includes(value)) throw new Error(`invalid ${name} "${String(value)}"`);
};

export function encodeState({ chain, period, unit }) {
  check("chain", CHAIN_CHOICES, chain);
  check("period", PERIOD_CHOICES, period);
  check("unit", UNIT_CHOICES, unit);
  return `${chain}-${period}-${unit}`;
}

// null for anything that is not exactly a token this module could have
// written. The caller falls back to the default view.
export function decodeState(input) {
  if (typeof input !== "string" || input.length > 64) return null;
  const token = input.startsWith("#") ? input.slice(1) : input;
  const parts = token.split("-");
  if (parts.length !== 3) return null;
  const [chain, period, unit] = parts;
  if (!CHAIN_CHOICES.includes(chain) || !PERIOD_CHOICES.includes(period) || !UNIT_CHOICES.includes(unit)) return null;
  return { chain, period, unit };
}
