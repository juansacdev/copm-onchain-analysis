import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createStore } from "../../pipeline/adapters/store.js";
import { runScan } from "../../pipeline/steps/scan.js";
import {
  ALICE,
  BOB,
  TOKEN,
  approval,
  burn,
  createFakeChain,
  frozen,
  mint,
  roleGranted,
  thawed,
  transfer,
  tsOf,
  upgraded,
} from "./fake-rpc.js";

// A small scanned chain for the steps that read what `scan` wrote: every
// event kind, three holders (one of them a contract), one address that ends at
// zero, and freeze / thaw history.
export const DEPLOY = 1000;
export const CHAIN = { key: "testnet", address: TOKEN, deployBlock: DEPLOY };
export const SETTINGS = {
  maxLogRange: 100,
  rangesPerBatch: 2,
  emptyConfirmations: 2,
  confirmations: 5,
  workers: 2,
  stageBlocks: 500,
  maxBatchAttempts: 6,
};
export const CAROL = `0x${"c3".repeat(20)}`;
export const DAVE = `0x${"d4".repeat(20)}`;
export const COPM = (n) => BigInt(n) * 10n ** 18n;

// Final balances: ALICE 695, BOB 265, CAROL 60, DAVE 0. Supply 1,020.
export const history = () => [
  upgraded(DEPLOY, 0),
  roleGranted(DEPLOY, 1, "DEFAULT_ADMIN_ROLE", ALICE),
  mint(1010, 0, ALICE, COPM(1000)),
  approval(1011, 0, ALICE, BOB),
  transfer(1260, 0, ALICE, BOB, COPM(250)),
  frozen(1300, 0, BOB),
  frozen(1400, 0, ALICE),
  thawed(1450, 0, ALICE),
  burn(1530, 0, BOB, COPM(50)),
  transfer(1800, 0, ALICE, DAVE, COPM(5)),
  transfer(1810, 0, DAVE, BOB, COPM(5)),
  mint(1990, 3, BOB, COPM(70)),
  roleGranted(2100, 0, "MINTER_ROLE", BOB),
  transfer(2150, 0, BOB, ALICE, COPM(10)),
  transfer(2160, 0, ALICE, CAROL, COPM(60)),
];

export const CONTRACT_STATE = {
  roles: { DEFAULT_ADMIN_ROLE: [ALICE], MINTER_ROLE: [BOB, CAROL] },
  frozen: [BOB],
  codes: { [CAROL]: "0x6080604052" },
};

export function tempStore() {
  const dir = mkdtempSync(join(tmpdir(), "copm-t3-"));
  const url = pathToFileURL(`${dir}/`);
  return { dir, url, store: createStore(url) };
}

// A scanned store and the fake chain it was scanned from.
export async function scannedDataset({ logs = history(), contract = CONTRACT_STATE } = {}) {
  const { dir, url, store } = tempStore();
  const fake = createFakeChain({ logs, head: 2205, contract });
  await runScan({
    chain: CHAIN,
    settings: SETTINGS,
    rpc: fake.rpc,
    store,
    clock: () => new Date("2026-01-01T00:00:00.000Z"),
    log: () => {},
    sleep: async () => {},
  });
  fake.seen.reads.length = 0;
  fake.seen.batches.length = 0;
  fake.seen.singles.length = 0;
  return { dir, url, store, fake };
}

export const blockTime = (block) => new Date(tsOf(block) * 1000).toISOString();
