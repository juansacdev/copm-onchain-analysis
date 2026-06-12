import { mkdirSync } from "node:fs";
import { createPublicClient, http } from "viem";
import { polygon, celo } from "viem/chains";

// Per-chain deployments of COPM. Select with CHAIN=polygon|celo (default: polygon).
const CHAINS = {
  polygon: {
    chain: polygon,
    label: "Polygon",
    address: "0x12050c705152931cFEe3DD56c52Fb09Dea816C23",
    rpcEnv: "POLYGON_RPC_URL",
  },
  celo: {
    chain: celo,
    label: "Celo",
    address: "0xC92E8Fc2947E32F2B574CCA9F2F12097A71d5606",
    rpcEnv: "CELO_RPC_URL",
  },
};

export const CHAIN_KEY = (process.env.CHAIN ?? "polygon").toLowerCase();
const selected = CHAINS[CHAIN_KEY];
if (!selected) {
  console.error(
    `unknown CHAIN "${CHAIN_KEY}". valid values: ${Object.keys(CHAINS).join(", ")}`
  );
  process.exit(1);
}

export const CHAIN_LABEL = selected.label;
export const COPM_ADDRESS = selected.address;

export const RPC_URL = process.env[selected.rpcEnv];
if (!RPC_URL) {
  console.error(
    `missing ${selected.rpcEnv}. set it in .env or export it.\n` +
      "  cp .env.example .env  # then edit .env\n" +
      `  CHAIN=${CHAIN_KEY} node --env-file=.env <script>.js`
  );
  process.exit(1);
}

export const COP_PER_USD = Number(process.env.COP_PER_USD ?? 4000);

// All pipeline artifacts for the selected chain live under data/<chain>/.
export const DATA_DIR = new URL(`./data/${CHAIN_KEY}/`, import.meta.url);
mkdirSync(DATA_DIR, { recursive: true });
export const dataPath = (name) => new URL(name, DATA_DIR);

export const CHARTS_DIR = new URL(`./charts/${CHAIN_KEY}/`, import.meta.url);
mkdirSync(CHARTS_DIR, { recursive: true });

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

export const client = createPublicClient({
  chain: selected.chain,
  transport: http(RPC_URL, {
    batch: true,
    timeout: 30_000,
    retryCount: 3,
    retryDelay: 500,
  }),
});
