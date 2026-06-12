import { writeFileSync } from "node:fs";
import {
  client,
  COPM_ADDRESS,
  ERC20_ABI,
  CHAIN_KEY,
  CHAIN_LABEL,
  dataPath,
} from "./config.js";

async function findDeployBlock(latestBlock) {
  let lo = 0n;
  let hi = latestBlock;

  while (lo + 1n < hi) {
    const mid = (lo + hi) / 2n;
    const code = await client.getBytecode({
      address: COPM_ADDRESS,
      blockNumber: mid,
    });
    if (code && code !== "0x") hi = mid;
    else lo = mid;
  }
  return hi;
}

const [decimals, symbol, name, totalSupply] = await Promise.all([
  client.readContract({ address: COPM_ADDRESS, abi: ERC20_ABI, functionName: "decimals" }),
  client.readContract({ address: COPM_ADDRESS, abi: ERC20_ABI, functionName: "symbol" }),
  client.readContract({ address: COPM_ADDRESS, abi: ERC20_ABI, functionName: "name" }),
  client.readContract({ address: COPM_ADDRESS, abi: ERC20_ABI, functionName: "totalSupply" }),
]);

const latestBlock = await client.getBlockNumber();
console.log(`chain: ${CHAIN_LABEL} (${CHAIN_KEY})`);
console.log(`latest block: ${latestBlock}`);
console.log(`name=${name} symbol=${symbol} decimals=${decimals}`);
console.log(`current totalSupply (${symbol}): ${Number(totalSupply) / 10 ** decimals}`);

console.log(`\nbinary search for deploy block (lo=0, hi=${latestBlock})...`);
const deployBlock = await findDeployBlock(latestBlock);
console.log(`deploy block: ${deployBlock}`);

const deployBlockData = await client.getBlock({ blockNumber: deployBlock });
const deployTs = new Date(Number(deployBlockData.timestamp) * 1000).toISOString();
console.log(`deploy block timestamp: ${deployTs}`);

const latestBlockData = await client.getBlock({ blockNumber: latestBlock });

const manifest = {
  chain: CHAIN_KEY,
  chainLabel: CHAIN_LABEL,
  address: COPM_ADDRESS,
  name,
  symbol,
  decimals,
  currentTotalSupplyRaw: totalSupply.toString(),
  currentTotalSupplyTokens: Number(totalSupply) / 10 ** decimals,
  deployBlock: deployBlock.toString(),
  deployTimestamp: deployTs,
  latestBlockAtRun: latestBlock.toString(),
  latestBlockTimestamp: new Date(
    Number(latestBlockData.timestamp) * 1000
  ).toISOString(),
};

writeFileSync(dataPath("manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`\ndata/${CHAIN_KEY}/manifest.json written`);
console.log(manifest);
