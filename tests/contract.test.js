import { test } from "node:test";
import assert from "node:assert/strict";
import { keccak256, stringToHex } from "viem";
import {
  IMPLEMENTATION_SLOT,
  ROLE_HASHES,
  SELECTORS,
  addressFromWord,
  callBalanceOf,
  callGetRoleMember,
  callGetRoleMemberCount,
  callIsFrozen,
  parseWord,
} from "../pipeline/domain/contract.js";

const A = "0xaaaa000000000000000000000000000000000001";
const SIGNATURES = {
  balanceOf: "balanceOf(address)",
  totalSupply: "totalSupply()",
  paused: "paused()",
  isFrozen: "isFrozen(address)",
  getRoleMemberCount: "getRoleMemberCount(bytes32)",
  getRoleMember: "getRoleMember(bytes32,uint256)",
};

test("every selector is the first four bytes of keccak256 of its signature", () => {
  for (const [name, signature] of Object.entries(SIGNATURES)) {
    assert.equal(SELECTORS[name], keccak256(stringToHex(signature)).slice(0, 10), name);
  }
});

test("the ERC-1967 implementation slot is keccak256('eip1967.proxy.implementation') - 1", () => {
  const slot = BigInt(keccak256(stringToHex("eip1967.proxy.implementation"))) - 1n;
  assert.equal(IMPLEMENTATION_SLOT, `0x${slot.toString(16).padStart(64, "0")}`);
});

test("role hashes are the zero hash for the admin role and keccak256 of the name for the rest", () => {
  assert.equal(ROLE_HASHES.DEFAULT_ADMIN_ROLE, `0x${"0".repeat(64)}`);
  assert.equal(ROLE_HASHES.MINTER_ROLE, keccak256(stringToHex("MINTER_ROLE")));
  assert.deepEqual(Object.keys(ROLE_HASHES), [
    "DEFAULT_ADMIN_ROLE",
    "PAUSER_ROLE",
    "MINTER_ROLE",
    "UPGRADER_ROLE",
    "FREEZER_ROLE",
    "RESCUER_ROLE",
  ]);
});

test("call data is the selector followed by 32-byte left-padded arguments", () => {
  assert.equal(callBalanceOf(A), `0x70a08231${"0".repeat(24)}${A.slice(2)}`);
  assert.equal(callIsFrozen(A), `${SELECTORS.isFrozen}${"0".repeat(24)}${A.slice(2)}`);
  assert.equal(
    callGetRoleMemberCount(ROLE_HASHES.MINTER_ROLE),
    `0xca15c873${ROLE_HASHES.MINTER_ROLE.slice(2)}`
  );
  assert.equal(
    callGetRoleMember(ROLE_HASHES.MINTER_ROLE, 3),
    `0x9010d07c${ROLE_HASHES.MINTER_ROLE.slice(2)}${"0".repeat(63)}3`
  );
});

test("parseWord accepts only a full 32-byte word and keeps values beyond 2^53 exact", () => {
  assert.equal(parseWord(`0x${"0".repeat(63)}1`), 1n);
  assert.equal(parseWord(`0x${(10n ** 27n + 1n).toString(16).padStart(64, "0")}`), 10n ** 27n + 1n);
  for (const bad of ["0x", "0x1", null, undefined, 5, `0x${"0".repeat(65)}`, `0x${"z".repeat(64)}`]) {
    assert.throws(() => parseWord(bad), /32-byte word/, String(bad));
  }
});

test("addressFromWord takes the low 20 bytes, lowercase", () => {
  assert.equal(addressFromWord(`0x${"0".repeat(24)}${A.slice(2).toUpperCase()}`), A);
});
