import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeAbiParameters, keccak256, stringToHex } from "viem";
import { EVENT_TOPICS, ROLE_NAMES, decodeLog } from "../pipeline/domain/events.js";

const topicOf = (signature) => keccak256(stringToHex(signature));
const pad = (address) => `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
const A = "0xaaaa000000000000000000000000000000000001";
const B = "0xbbbb000000000000000000000000000000000002";
const word = (n) => `0x${BigInt(n).toString(16).padStart(64, "0")}`;
const log = (signature, extraTopics, data = "0x") => ({
  topics: [topicOf(signature), ...extraTopics],
  data,
});

test("topics are computed from the event signatures", () => {
  assert.equal(
    EVENT_TOPICS.Transfer,
    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
  );
  assert.equal(
    EVENT_TOPICS.Approval,
    "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925"
  );
  assert.equal(EVENT_TOPICS.EIP712DomainChanged, topicOf("EIP712DomainChanged()"));
  assert.equal(Object.keys(EVENT_TOPICS).length, 15);
});

test("decodes Transfer with lowercase addresses and the amount as a decimal string", () => {
  const decoded = decodeLog(log("Transfer(address,address,uint256)", [pad(A), pad(B)], word(10n ** 27n)));
  assert.equal(decoded.name, "Transfer");
  assert.deepEqual(decoded.args, { from: A, to: B, value: (10n ** 27n).toString() });
});

test("decodes Approval", () => {
  const decoded = decodeLog(log("Approval(address,address,uint256)", [pad(A), pad(B)], word(7)));
  assert.deepEqual(decoded.args, { owner: A, spender: B, value: "7" });
});

test("a Transfer with the wrong number of topics is an error, never silently skipped", () => {
  assert.throws(
    () => decodeLog(log("Transfer(address,address,uint256)", [pad(A), pad(B), word(1)])),
    /Transfer/
  );
});

test("decodes role events and names the well-known role hashes", () => {
  const minter = keccak256(stringToHex("MINTER_ROLE"));
  assert.equal(ROLE_NAMES[minter], "MINTER_ROLE");
  const zero = word(0);
  assert.equal(ROLE_NAMES[zero], "DEFAULT_ADMIN_ROLE");

  const granted = decodeLog(
    log("RoleGranted(bytes32,address,address)", [minter, pad(A), pad(B)])
  );
  assert.equal(granted.name, "RoleGranted");
  assert.deepEqual(granted.args, { role: "MINTER_ROLE", account: A, sender: B });

  const revoked = decodeLog(log("RoleRevoked(bytes32,address,address)", [zero, pad(A), pad(B)]));
  assert.equal(revoked.args.role, "DEFAULT_ADMIN_ROLE");
});

test("an unknown role hash is kept as hex", () => {
  const other = keccak256(stringToHex("SOMETHING_ELSE"));
  const decoded = decodeLog(log("RoleGranted(bytes32,address,address)", [other, pad(A), pad(B)]));
  assert.equal(decoded.args.role, other);
});

test("decodes RoleAdminChanged with named roles", () => {
  const pauser = keccak256(stringToHex("PAUSER_ROLE"));
  const decoded = decodeLog(
    log("RoleAdminChanged(bytes32,bytes32,bytes32)", [pauser, word(0), pauser])
  );
  assert.deepEqual(decoded.args, {
    role: "PAUSER_ROLE",
    previousAdminRole: "DEFAULT_ADMIN_ROLE",
    newAdminRole: "PAUSER_ROLE",
  });
});

test("decodes proxy events: Upgraded, AdminChanged, BeaconUpgraded", () => {
  assert.deepEqual(decodeLog(log("Upgraded(address)", [pad(A)])).args, {
    implementation: A,
  });
  assert.deepEqual(decodeLog(log("BeaconUpgraded(address)", [pad(B)])).args, { beacon: B });

  const data = encodeAbiParameters(
    [{ type: "address" }, { type: "address" }],
    [A, B]
  );
  assert.deepEqual(decodeLog(log("AdminChanged(address,address)", [], data)).args, {
    previousAdmin: A,
    newAdmin: B,
  });
});

test("decodes Initialized and EIP712DomainChanged", () => {
  assert.deepEqual(decodeLog(log("Initialized(uint8)", [], word(1))).args, { version: 1 });
  const domain = decodeLog(log("EIP712DomainChanged()", []));
  assert.equal(domain.name, "EIP712DomainChanged");
  assert.deepEqual(domain.args, {});
});

test("decodes the freezing and pausing events whichever of their arguments is indexed", () => {
  assert.deepEqual(decodeLog(log("Frozen(address)", [pad(A)])).args, { account: A });
  assert.deepEqual(decodeLog(log("Thawed(address)", [], encodeAbiParameters([{ type: "address" }], [B]))).args, {
    account: B,
  });
  assert.deepEqual(decodeLog(log("Paused(address)", [], encodeAbiParameters([{ type: "address" }], [A]))).args, {
    account: A,
  });
  assert.equal(decodeLog(log("Unpaused(address)", [pad(A)])).name, "Unpaused");

  const burned = decodeLog(log("BurnedFrozen(address,uint256)", [pad(A)], word(5)));
  assert.deepEqual(burned.args, { account: A, amount: "5" });
});

test("an unknown topic decodes to name Unknown with no arguments", () => {
  const decoded = decodeLog({ topics: [topicOf("Mystery(uint256)")], data: word(1) });
  assert.deepEqual(decoded, { name: "Unknown", args: {} });
  assert.deepEqual(decodeLog({ topics: [], data: "0x" }), { name: "Unknown", args: {} });
});

test("an argument layout that does not fit a known event falls back to no arguments", () => {
  const decoded = decodeLog(log("Frozen(address)", [], "0x"));
  assert.deepEqual(decoded, { name: "Frozen", args: {} });
});
