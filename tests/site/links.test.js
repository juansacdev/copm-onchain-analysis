import { test } from "node:test";
import assert from "node:assert/strict";
import { auditDocUrl, explorerTokenUrl, shortAddress } from "../../site/src/lib/links.js";

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
