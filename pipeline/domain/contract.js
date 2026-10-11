import { ROLE_NAMES } from "./events.js";

// The read-only calls the holders snapshot makes. Selectors are hardcoded so a
// reader can check them by eye; tests/contract.test.js recomputes each one from
// its signature.
export const SELECTORS = {
  balanceOf: "0x70a08231",
  totalSupply: "0x18160ddd",
  paused: "0x5c975abb",
  isFrozen: "0xe5839836",
  getRoleMemberCount: "0xca15c873",
  getRoleMember: "0x9010d07c",
};

// keccak256("eip1967.proxy.implementation") - 1, read with eth_getStorageAt.
export const IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

// Role name -> bytes32, in the order the report lists them.
export const ROLE_HASHES = Object.fromEntries(
  Object.entries(ROLE_NAMES).map(([hash, name]) => [name, hash])
);

const word = (value) => value.toString(16).padStart(64, "0");
const addressWord = (address) => address.slice(2).toLowerCase().padStart(64, "0");

export const callBalanceOf = (address) => `${SELECTORS.balanceOf}${addressWord(address)}`;
export const callIsFrozen = (address) => `${SELECTORS.isFrozen}${addressWord(address)}`;
export const callGetRoleMemberCount = (role) => `${SELECTORS.getRoleMemberCount}${role.slice(2)}`;
export const callGetRoleMember = (role, index) =>
  `${SELECTORS.getRoleMember}${role.slice(2)}${word(BigInt(index))}`;

// An answer that is not exactly one 32-byte word is a failed read, never a
// zero: public endpoints sometimes answer "0x" for state they do not have.
export function parseWord(raw) {
  if (typeof raw !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error(`expected a 32-byte word, got ${typeof raw === "string" ? `"${raw.slice(0, 20)}"` : typeof raw}`);
  }
  return BigInt(raw);
}

export const addressFromWord = (raw) => `0x${raw.slice(-40).toLowerCase()}`;
