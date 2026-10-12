// Fixed outbound links and the helpers that build the ones that depend on
// data (explorer pages) or language (documents).

export const REPO_URL = "https://github.com/juansacdev/copm-onchain-analysis";
export const AUTHOR_URL = "https://github.com/juansacdev";
export const PRESS_URL =
  "https://www.larepublica.co/finanzas/como-hacer-transacciones-con-stablecoins-4221338";

const EXPLORERS = {
  polygon: "https://polygonscan.com",
  celo: "https://celoscan.io",
};

export function explorerTokenUrl(chain, address) {
  const base = EXPLORERS[chain];
  if (!base) throw new Error(`unknown chain "${chain}"`);
  return `${base}/token/${address}`;
}

export const shortAddress = (address) => `${address.slice(0, 6)}…${address.slice(-4)}`;

export const auditDocUrl = (lang) =>
  `${REPO_URL}/blob/main/docs/${lang === "es" ? "AUDIT.es.md" : "AUDIT.md"}`;
