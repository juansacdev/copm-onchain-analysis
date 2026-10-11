import { getChain, dataPath, dataDir, ERC20_ABI } from "../config/chains.js";
import { createRpcClient } from "../adapters/rpc.js";
import { ensureDir, writeJson } from "../adapters/store.js";

async function findDeployBlock(client, address, latestBlock) {
  let lo = 0n;
  let hi = latestBlock;

  while (lo + 1n < hi) {
    const mid = (lo + hi) / 2n;
    const code = await client.getBytecode({ address, blockNumber: mid });
    if (code && code !== "0x") hi = mid;
    else lo = mid;
  }
  return hi;
}

export async function run({ chainKey, env = process.env }) {
  const { key, label, address } = getChain(chainKey);
  const client = createRpcClient(key, env);
  ensureDir(dataDir(key));

  const [decimals, symbol, name, totalSupply] = await Promise.all([
    client.readContract({ address, abi: ERC20_ABI, functionName: "decimals" }),
    client.readContract({ address, abi: ERC20_ABI, functionName: "symbol" }),
    client.readContract({ address, abi: ERC20_ABI, functionName: "name" }),
    client.readContract({ address, abi: ERC20_ABI, functionName: "totalSupply" }),
  ]);

  const latestBlock = await client.getBlockNumber();
  console.log(`chain: ${label} (${key})`);
  console.log(`latest block: ${latestBlock}`);
  console.log(`name=${name} symbol=${symbol} decimals=${decimals}`);
  console.log(`current totalSupply (${symbol}): ${Number(totalSupply) / 10 ** decimals}`);

  console.log(`\nbinary search for deploy block (lo=0, hi=${latestBlock})...`);
  const deployBlock = await findDeployBlock(client, address, latestBlock);
  console.log(`deploy block: ${deployBlock}`);

  const deployBlockData = await client.getBlock({ blockNumber: deployBlock });
  const deployTs = new Date(Number(deployBlockData.timestamp) * 1000).toISOString();
  console.log(`deploy block timestamp: ${deployTs}`);

  const latestBlockData = await client.getBlock({ blockNumber: latestBlock });

  const manifest = {
    chain: key,
    chainLabel: label,
    address,
    name,
    symbol,
    decimals,
    currentTotalSupplyRaw: totalSupply.toString(),
    currentTotalSupplyTokens: Number(totalSupply) / 10 ** decimals,
    deployBlock: deployBlock.toString(),
    deployTimestamp: deployTs,
    latestBlockAtRun: latestBlock.toString(),
    latestBlockTimestamp: new Date(Number(latestBlockData.timestamp) * 1000).toISOString(),
  };

  writeJson(dataPath(key, "manifest.json"), manifest, 2);
  console.log(`\ndata/${key}/manifest.json written`);
  console.log(manifest);
}
