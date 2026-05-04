import { existsSync, readFileSync, writeFileSync, appendFileSync, unlinkSync } from "node:fs";
import { parseAbiItem } from "viem";
import { client, COPM_ADDRESS } from "./config.js";

const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)"
);

const manifest = JSON.parse(
  readFileSync(new URL("./manifest.json", import.meta.url), "utf8")
);

const OUT_PATH = new URL("./transfers.jsonl", import.meta.url);
const PROGRESS_PATH = new URL("./scan-progress.json", import.meta.url);

const FRESH = process.argv.includes("--fresh");
if (FRESH) {
  console.log("FRESH start: clearing previous output");
  if (existsSync(OUT_PATH)) unlinkSync(OUT_PATH);
  if (existsSync(PROGRESS_PATH)) unlinkSync(PROGRESS_PATH);
}
if (!existsSync(OUT_PATH)) writeFileSync(OUT_PATH, "");

const deployBlock = BigInt(manifest.deployBlock);
const latestBlock = BigInt(manifest.latestBlockAtRun);
const totalBlocks = latestBlock - deployBlock + 1n;

const WORKERS = 8;
const INITIAL_CHUNK = 10_000n;
const MIN_CHUNK = 500n;
const MAX_CHUNK = 10_000n;

console.log(`range: ${deployBlock} -> ${latestBlock} (${totalBlocks} blocks)`);
console.log(`workers: ${WORKERS}, chunk start: ${INITIAL_CHUNK}, max: ${MAX_CHUNK}`);

const slices = [];
const sliceSize = totalBlocks / BigInt(WORKERS);
for (let i = 0; i < WORKERS; i++) {
  const start = deployBlock + BigInt(i) * sliceSize;
  const end = i === WORKERS - 1 ? latestBlock : start + sliceSize - 1n;
  slices.push({ id: i, start, end, cursor: start, chunk: INITIAL_CHUNK, events: 0 });
}

const startedAt = Date.now();
let totalEvents = 0;
let lastReport = startedAt;

async function workerLoop(slice) {
  while (slice.cursor <= slice.end) {
    const to = slice.cursor + slice.chunk - 1n > slice.end ? slice.end : slice.cursor + slice.chunk - 1n;
    try {
      const logs = await client.getLogs({
        address: COPM_ADDRESS,
        event: TRANSFER_EVENT,
        fromBlock: slice.cursor,
        toBlock: to,
      });
      if (logs.length > 0) {
        const lines = logs
          .map((log) =>
            JSON.stringify({
              b: Number(log.blockNumber),
              t: log.transactionHash,
              i: log.logIndex,
              f: log.args.from,
              r: log.args.to,
              v: log.args.value.toString(),
            })
          )
          .join("\n") + "\n";
        appendFileSync(OUT_PATH, lines);
        slice.events += logs.length;
        totalEvents += logs.length;
      }
      slice.cursor = to + 1n;
      if (slice.chunk < MAX_CHUNK) {
        const next = slice.chunk + 1_000n;
        slice.chunk = next > MAX_CHUNK ? MAX_CHUNK : next;
      }
    } catch (err) {
      const msg = err.message || String(err);
      const transient =
        msg.includes("range") ||
        msg.includes("limit") ||
        msg.includes("too large") ||
        msg.includes("timeout") ||
        msg.includes("rate") ||
        msg.includes("429") ||
        msg.includes("response size") ||
        msg.includes("requested too many blocks") ||
        msg.includes("more than 10000");
      if (transient) {
        slice.chunk = slice.chunk / 2n < MIN_CHUNK ? MIN_CHUNK : slice.chunk / 2n;
        process.stdout.write(`w${slice.id} shrink->${slice.chunk}\n`);
        await new Promise((r) => setTimeout(r, 500));
      } else {
        throw err;
      }
    }
  }
  process.stdout.write(`w${slice.id} DONE events=${slice.events}\n`);
}

const reporter = setInterval(() => {
  const now = Date.now();
  const elapsed = (now - startedAt) / 1000;
  const blocksDone = slices.reduce(
    (acc, s) => acc + Number(s.cursor - s.start),
    0
  );
  const totalRange = Number(totalBlocks);
  const pct = (blocksDone / totalRange) * 100;
  const rate = blocksDone / elapsed;
  const remaining = totalRange - blocksDone;
  const eta = rate > 0 ? remaining / rate : 0;
  const summaries = slices
    .map((s) => `w${s.id}:${((Number(s.cursor - s.start) / Number(s.end - s.start)) * 100).toFixed(0)}%/c${s.chunk}/e${s.events}`)
    .join(" ");
  process.stdout.write(
    `[${elapsed.toFixed(0)}s] ${pct.toFixed(2)}% events=${totalEvents} eta=${eta.toFixed(0)}s | ${summaries}\n`
  );
  writeFileSync(
    PROGRESS_PATH,
    JSON.stringify({
      slices: slices.map((s) => ({
        id: s.id,
        cursor: s.cursor.toString(),
        end: s.end.toString(),
        events: s.events,
      })),
      totalEvents,
    })
  );
}, 5000);

await Promise.all(slices.map(workerLoop));
clearInterval(reporter);

console.log(`\nALL DONE. total Transfer events: ${totalEvents}`);
writeFileSync(
  PROGRESS_PATH,
  JSON.stringify({
    slices: slices.map((s) => ({
      id: s.id,
      cursor: s.cursor.toString(),
      end: s.end.toString(),
      events: s.events,
    })),
    totalEvents,
    completedAt: new Date().toISOString(),
  })
);
