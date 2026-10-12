import { getChain, dataPath } from "../config/chains.js";
import { createRpcClient } from "../adapters/rpc.js";
import { readJson, readJsonl, writeJson } from "../adapters/store.js";

export async function run({ chainKey, env = process.env }) {
  const { key } = getChain(chainKey);
  const client = createRpcClient(key, env);

  const TS_OUT = dataPath(key, "block-ts.json");
  const SAMPLES_OUT = dataPath(key, "block-samples.json");

  console.log(`chain: ${key}`);
  const manifest = readJson(dataPath(key, "manifest.json"));
  const deployBlock = Number(manifest.deployBlock);
  const latestBlock = Number(manifest.latestBlockAtRun);

  console.log(`extracting unique blocks from transfers.jsonl...`);
  const blockSet = new Set();
  for (const t of readJsonl(dataPath(key, "transfers.jsonl"))) blockSet.add(t.b);
  const blocks = [...blockSet].sort((a, b) => a - b);
  console.log(`unique blocks with transfers: ${blocks.length}`);
  console.log(`block range: ${blocks[0]} -> ${blocks[blocks.length - 1]}`);

  const SAMPLE_COUNT = 400;
  const samplePoints = new Set();
  samplePoints.add(deployBlock);
  samplePoints.add(latestBlock);
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const f = i / (SAMPLE_COUNT - 1);
    const block = Math.floor(deployBlock + f * (latestBlock - deployBlock));
    samplePoints.add(block);
  }
  for (let i = 0; i < blocks.length; i += Math.max(1, Math.floor(blocks.length / 200))) {
    samplePoints.add(blocks[i]);
  }
  samplePoints.add(blocks[blocks.length - 1]);

  const samples = [...samplePoints].sort((a, b) => a - b);
  console.log(`fetching ${samples.length} sample timestamps with concurrency 16...`);

  const sampleTs = {};
  let done = 0;
  const startedAt = Date.now();

  async function worker(queue) {
    while (queue.length) {
      const b = queue.pop();
      try {
        const block = await client.getBlock({ blockNumber: BigInt(b) });
        sampleTs[b] = Number(block.timestamp);
        done++;
        if (done % 25 === 0) {
          const elapsed = (Date.now() - startedAt) / 1000;
          process.stdout.write(`${done}/${samples.length} (${elapsed.toFixed(0)}s)\n`);
        }
      } catch (err) {
        console.warn(`block ${b} failed: ${err.message?.slice(0, 80)}`);
        queue.push(b);
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }

  const queue = [...samples];
  await Promise.all(Array.from({ length: 16 }, () => worker(queue)));
  writeJson(SAMPLES_OUT, sampleTs);
  console.log(`samples saved: ${Object.keys(sampleTs).length}`);

  const sortedSampleBlocks = Object.keys(sampleTs).map(Number).sort((a, b) => a - b);

  function interpolate(block) {
    let lo = 0, hi = sortedSampleBlocks.length - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (sortedSampleBlocks[mid] <= block) lo = mid;
      else hi = mid;
    }
    const a = sortedSampleBlocks[lo];
    const b = sortedSampleBlocks[hi];
    if (block === a) return sampleTs[a];
    if (block === b) return sampleTs[b];
    if (block < a) return sampleTs[a];
    if (block > b) return sampleTs[b];
    const tA = sampleTs[a], tB = sampleTs[b];
    const f = (block - a) / (b - a);
    return Math.round(tA + f * (tB - tA));
  }

  console.log(`interpolating timestamps for ${blocks.length} unique blocks...`);
  const ts = {};
  for (const b of blocks) {
    ts[b] = interpolate(b);
  }
  writeJson(TS_OUT, ts);

  const sample1 = blocks[0];
  const sample2 = blocks[Math.floor(blocks.length / 2)];
  const sample3 = blocks[blocks.length - 1];
  console.log(`\nsample interpolated timestamps:`);
  console.log(`  block ${sample1}: ${new Date(ts[sample1] * 1000).toISOString()}`);
  console.log(`  block ${sample2}: ${new Date(ts[sample2] * 1000).toISOString()}`);
  console.log(`  block ${sample3}: ${new Date(ts[sample3] * 1000).toISOString()}`);
  console.log(`\ndone. block-ts.json written`);
}
