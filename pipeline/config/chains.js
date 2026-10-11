import { polygon, celo } from "viem/chains";

// Per-chain deployments of COPM. Importing this module has no side effects:
// no environment is read, no directory is created, no client is built.
const CHAINS = {
  polygon: {
    viemChain: polygon,
    label: "Polygon",
    address: "0x12050c705152931cFEe3DD56c52Fb09Dea816C23",
    rpcEnv: "POLYGON_RPC_URL",
  },
  celo: {
    viemChain: celo,
    label: "Celo",
    address: "0xC92E8Fc2947E32F2B574CCA9F2F12097A71d5606",
    rpcEnv: "CELO_RPC_URL",
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

// config/ lives two levels below the repository root.
const ROOT = new URL("../../", import.meta.url);

// All pipeline artifacts for a chain live under data/<chain>/ and charts/<chain>/.
// Callers create the directories they write to (see adapters/store.js).
export const dataDir = (key) => new URL(`data/${key}/`, ROOT);
export const dataPath = (key, name) => new URL(name, dataDir(key));
export const chartsDir = (key) => new URL(`charts/${key}/`, ROOT);
export const combinedChartsDir = () => new URL("charts/combined/", ROOT);

export const copPerUsd = (env = process.env) => Number(env.COP_PER_USD ?? 4000);

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
