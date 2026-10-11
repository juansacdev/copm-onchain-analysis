import { getChain, dataPath, dataDir, ERC20_ABI } from "../config/chains.js";
import { createRpcClient } from "../adapters/rpc.js";
import { ensureDir, writeJson } from "../adapters/store.js";

// Refreshes the static facts about the token in manifest.json. Everything that
// moves with the chain (supply, last block) lives in state.json, written by
// scan; the deploy block is part of the chain configuration.
export async function run({ chainKey, env = process.env }) {
  const { key, label, address, deployBlock } = getChain(chainKey);
  const client = createRpcClient(key, env);
  ensureDir(dataDir(key));

  const [decimals, symbol, name] = await Promise.all([
    client.readContract({ address, abi: ERC20_ABI, functionName: "decimals" }),
    client.readContract({ address, abi: ERC20_ABI, functionName: "symbol" }),
    client.readContract({ address, abi: ERC20_ABI, functionName: "name" }),
  ]);
  const deployBlockData = await client.getBlock({ blockNumber: BigInt(deployBlock) });

  const manifest = {
    chain: key,
    chainLabel: label,
    address,
    name,
    symbol,
    decimals,
    deployBlock: String(deployBlock),
    deployTimestamp: new Date(Number(deployBlockData.timestamp) * 1000).toISOString(),
  };

  writeJson(dataPath(key, "manifest.json"), manifest, 2);
  console.log(`chain: ${label} (${key})`);
  console.log(`name=${name} symbol=${symbol} decimals=${decimals}`);
  console.log(`deploy block ${manifest.deployBlock} at ${manifest.deployTimestamp}`);
  console.log(`\ndata/${key}/manifest.json written`);
}
