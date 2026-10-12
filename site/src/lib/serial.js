// The banknote serial number of the site header: the verified checkpoint block
// of each chain, grouped in threes like `POL 95 370 448 · CELO 79 861 762`.
// Input is the loader's chain objects (analysis-data.js). Plain JS, no Astro
// imports, so node --test can run it.

const CODES = { polygon: "POL", celo: "CELO" };
const ORDER = ["polygon", "celo"];

export function formatSerialBlock(block) {
  if (!Number.isInteger(block) || block < 0) {
    throw new Error(`serial block must be a non-negative integer, got ${String(block)}`);
  }
  return String(block).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function serialLine(chains) {
  if (!chains || chains.length === 0) throw new Error("serial line needs at least one chain, got no chains");
  for (const chain of chains) {
    if (!CODES[chain.key]) throw new Error(`unknown chain "${chain.key}" in the serial line`);
  }
  return [...chains]
    .sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key))
    .map((chain) => {
      if (!Number.isInteger(chain.checkpointBlock)) {
        throw new Error(`${chain.key} has no verified checkpoint block (state.json)`);
      }
      return `${CODES[chain.key]} ${formatSerialBlock(chain.checkpointBlock)}`;
    })
    .join(" · ");
}
