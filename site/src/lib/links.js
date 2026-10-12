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

export function explorerTxUrl(chain, hash) {
  const base = EXPLORERS[chain];
  if (!base) throw new Error(`unknown chain "${chain}"`);
  return `${base}/tx/${hash}`;
}

export function explorerAddressUrl(chain, address) {
  const base = EXPLORERS[chain];
  if (!base) throw new Error(`unknown chain "${chain}"`);
  return `${base}/address/${address}`;
}

// "0x1205…6C23": the first `head` and last `tail` characters. A value that is
// already that short stays as it is. The full value belongs in a title.
export function middleEllipsis(value, head, tail) {
  return value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export const shortAddress = (address) => `${address.slice(0, 6)}…${address.slice(-4)}`;

export const auditDocUrl = (lang) =>
  `${REPO_URL}/blob/main/docs/${lang === "es" ? "AUDIT.es.md" : "AUDIT.md"}`;

export const holdersCsvUrl = (chain) => `${REPO_URL}/blob/main/data/${chain}/holders.csv`;

export const eventsDocUrl = (lang) =>
  `${REPO_URL}/blob/main/docs/${lang === "es" ? "EVENTS.es.md" : "EVENTS.md"}`;

export const readmeUrl = (lang) => `${REPO_URL}/blob/main/${lang === "es" ? "README.es.md" : "README.md"}`;
