import { createPublicClient, http } from "viem";
import { polygon } from "viem/chains";

export const COPM_ADDRESS = "0x12050c705152931cFEe3DD56c52Fb09Dea816C23";

export const RPC_URL = process.env.POLYGON_RPC_URL;
if (!RPC_URL) {
  console.error(
    "missing POLYGON_RPC_URL. set it in .env or export it.\n" +
      "  cp .env.example .env  # then edit .env\n" +
      "  node --env-file=.env <script>.js"
  );
  process.exit(1);
}

export const COP_PER_USD = Number(process.env.COP_PER_USD ?? 4000);

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
  chain: polygon,
  transport: http(RPC_URL, {
    batch: true,
    timeout: 30_000,
    retryCount: 3,
    retryDelay: 500,
  }),
});
