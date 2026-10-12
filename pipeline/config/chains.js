import { polygon, celo } from "viem/chains";

// Per-chain deployments of COPM. Importing this module has no side effects:
// no environment is read, no directory is created, no client is built.
const CHAINS = {
  polygon: {
    viemChain: polygon,
    label: "Polygon",
    address: "0x12050c705152931cFEe3DD56c52Fb09Dea816C23",
    rpcEnv: "POLYGON_RPC_URL",
    deployBlock: 47747145,
    scan: {
      maxLogRange: 10000,
      rangesPerBatch: 10,
      emptyConfirmations: 2,
      confirmations: 128,
      workers: 6,
      stageBlocks: 2_000_000,
      maxBatchAttempts: 400,
    },
  },
  celo: {
    viemChain: celo,
    label: "Celo",
    address: "0xC92E8Fc2947E32F2B574CCA9F2F12097A71d5606",
    rpcEnv: "CELO_RPC_URL",
    deployBlock: 27680993,
    // The public Celo endpoint caps eth_getLogs at 5,000 blocks and answers
    // many ranges falsely empty, hence the higher confirmation count.
    scan: {
      maxLogRange: 5000,
      rangesPerBatch: 10,
      emptyConfirmations: 6,
      confirmations: 30,
      workers: 12,
      stageBlocks: 2_000_000,
      maxBatchAttempts: 400,
    },
  },
};

export const CHAIN_KEYS = Object.keys(CHAINS);

export function getChain(key) {
  const chain = CHAINS[key];
  if (!chain) {
    throw new Error(`unknown chain "${key}". valid values: ${CHAIN_KEYS.join(", ")}`);
  }
  return { key, ...chain };
}

// Scan tuning. Precedence: CLI flag, then SCAN_* environment variable, then
// the per-chain default. `confirmations` may be 0; the rest must be positive.
const SETTING_ENV = {
  maxLogRange: "SCAN_MAX_LOG_RANGE",
  rangesPerBatch: "SCAN_RANGES_PER_BATCH",
  emptyConfirmations: "SCAN_EMPTY_CONFIRMATIONS",
  confirmations: "SCAN_CONFIRMATIONS",
  workers: "SCAN_WORKERS",
  stageBlocks: "SCAN_STAGE_BLOCKS",
  maxBatchAttempts: "SCAN_MAX_BATCH_ATTEMPTS",
};
export const SCAN_SETTING_KEYS = Object.keys(SETTING_ENV);

export function scanSettings(key, env = process.env, overrides = {}) {
  const defaults = getChain(key).scan;
  const settings = {};
  for (const name of SCAN_SETTING_KEYS) {
    const raw = overrides[name] ?? env[SETTING_ENV[name]] ?? defaults[name];
    const value = Number(raw);
    const min = name === "confirmations" ? 0 : 1;
    if (!Number.isInteger(value) || value < min) {
      throw new Error(`invalid ${name} "${raw}": expected an integer >= ${min}`);
    }
    settings[name] = value;
  }
  return settings;
}

// config/ lives two levels below the repository root.
const ROOT = new URL("../../", import.meta.url);

// All pipeline artifacts for a chain live under data/<chain>/ and charts/<chain>/.
// Callers create the directories they write to (see adapters/store.js).
export const repoRoot = () => ROOT;
export const dataDir = (key) => new URL(`data/${key}/`, ROOT);
export const dataPath = (key, name) => new URL(name, dataDir(key));
export const chartsDir = (key) => new URL(`charts/${key}/`, ROOT);
export const combinedChartsDir = () => new URL("charts/combined/", ROOT);

// The daily COP per USD rates are shared by every chain: data/rates/.
export const ratesDir = () => new URL("data/rates/", ROOT);
export const ratesPath = (name) => new URL(name, ratesDir());

// The first day any chain needs a rate: the day COPM was first deployed
// (Polygon, 2023-09-19). Celo came a year later.
export const RATES_FROM_DAY = "2023-09-19";

export const ERC20_ABI = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
];
