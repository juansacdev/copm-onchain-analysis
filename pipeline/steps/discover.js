import { getChain, dataPath, dataDir, ERC20_ABI } from "../config/chains.js";
import { createRpcClient, requireRpcUrl, scrubUrl } from "../adapters/rpc.js";
import { ensureDir, writeJson } from "../adapters/store.js";

// Refreshes the static facts about the token in manifest.json. Everything that
// moves with the chain (supply, last block) lives in state.json, written by
// scan; the deploy block is part of the chain configuration.
export async function run({ chainKey, env = process.env }) {
  const { key, label, address, deployBlock } = getChain(chainKey);
  const client = createRpcClient(key, env);
  ensureDir(dataDir(key));

  // viem errors quote the endpoint URL in message, details and metaMessages.
  // Only a scrubbed message leaves this step, with no `cause` to print later.
  const url = requireRpcUrl(key, env);
  let decimals, symbol, name, deployBlockData;
  try {
    [decimals, symbol, name] = await Promise.all([
      client.readContract({ address, abi: ERC20_ABI, functionName: "decimals" }),
      client.readContract({ address, abi: ERC20_ABI, functionName: "symbol" }),
      client.readContract({ address, abi: ERC20_ABI, functionName: "name" }),
    ]);
    deployBlockData = await client.getBlock({ blockNumber: BigInt(deployBlock) });
  } catch (err) {
    throw new Error(scrubUrl(err?.message ?? err, url));
  }

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
