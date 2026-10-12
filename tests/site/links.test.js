import { test } from "node:test";
import assert from "node:assert/strict";
import {
  auditDocUrl,
  eventsDocUrl,
  explorerAddressUrl,
  explorerTokenUrl,
  explorerTxUrl,
  holdersCsvUrl,
  middleEllipsis,
  readmeUrl,
  shortAddress,
} from "../../site/src/lib/links.js";

const ADDRESS = "0x12050c705152931cFEe3DD56c52Fb09Dea816C23";

test("token links point at the block explorer of each chain", () => {
  assert.equal(explorerTokenUrl("polygon", ADDRESS), `https://polygonscan.com/token/${ADDRESS}`);
  assert.equal(explorerTokenUrl("celo", ADDRESS), `https://celoscan.io/token/${ADDRESS}`);
  assert.throws(() => explorerTokenUrl("solana", ADDRESS), /unknown chain "solana"/);
});

test("an address is shortened to its first and last characters", () => {
  assert.equal(shortAddress(ADDRESS), "0x1205…6C23");
});

test("the audit document follows the language", () => {
  assert.match(auditDocUrl("es"), /docs\/AUDIT\.es\.md$/);
  assert.match(auditDocUrl("en"), /docs\/AUDIT\.md$/);
});

const TX = `0x${"ab".repeat(32)}`;

test("transaction and address links point at the block explorer of each chain", () => {
  assert.equal(explorerTxUrl("polygon", TX), `https://polygonscan.com/tx/${TX}`);
  assert.equal(explorerTxUrl("celo", TX), `https://celoscan.io/tx/${TX}`);
  assert.equal(explorerAddressUrl("celo", ADDRESS), `https://celoscan.io/address/${ADDRESS}`);
  assert.throws(() => explorerTxUrl("solana", TX), /unknown chain "solana"/);
});

test("a long value is shortened in the middle and never grows", () => {
  assert.equal(middleEllipsis(ADDRESS, 6, 4), "0x1205…6C23");
  assert.equal(middleEllipsis("abc", 6, 4), "abc");
  assert.equal(middleEllipsis(TX, 10, 8), `${TX.slice(0, 10)}…${TX.slice(-8)}`);
});

test("repository links: holders.csv per chain, the events document and the README by language", () => {
  assert.equal(holdersCsvUrl("celo"), "https://github.com/juansacdev/copm-onchain-analysis/blob/main/data/celo/holders.csv");
  assert.match(eventsDocUrl("es"), /docs\/EVENTS\.es\.md$/);
  assert.match(eventsDocUrl("en"), /docs\/EVENTS\.md$/);
  assert.match(readmeUrl("es"), /README\.es\.md$/);
  assert.match(readmeUrl("en"), /README\.md$/);
});
