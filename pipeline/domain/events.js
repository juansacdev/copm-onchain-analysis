import { decodeAbiParameters, keccak256, stringToHex } from "viem";

// Every event in the COPM ABI (ERC-20, OpenZeppelin access control, pausing,
// freezing, ERC-1967 proxy). Topics are computed from the signatures so the
// table cannot drift from them.
const EVENTS = [
  ["Transfer", [["from", "address"], ["to", "address"], ["value", "uint256"]]],
  ["Approval", [["owner", "address"], ["spender", "address"], ["value", "uint256"]]],
  ["BurnedFrozen", [["account", "address"], ["amount", "uint256"]]],
  ["Frozen", [["account", "address"]]],
  ["Thawed", [["account", "address"]]],
  ["Paused", [["account", "address"]]],
  ["Unpaused", [["account", "address"]]],
  ["RoleGranted", [["role", "bytes32"], ["account", "address"], ["sender", "address"]]],
  ["RoleRevoked", [["role", "bytes32"], ["account", "address"], ["sender", "address"]]],
  ["RoleAdminChanged", [["role", "bytes32"], ["previousAdminRole", "bytes32"], ["newAdminRole", "bytes32"]]],
  ["Upgraded", [["implementation", "address"]]],
  ["Initialized", [["version", "uint8"]]],
  ["AdminChanged", [["previousAdmin", "address"], ["newAdmin", "address"]]],
  ["BeaconUpgraded", [["beacon", "address"]]],
  ["EIP712DomainChanged", []],
];

const topicOf = (signature) => keccak256(stringToHex(signature));

const BY_TOPIC = new Map();
export const EVENT_TOPICS = {};
for (const [name, params] of EVENTS) {
  const topic = topicOf(`${name}(${params.map(([, type]) => type).join(",")})`);
  EVENT_TOPICS[name] = topic;
  BY_TOPIC.set(topic, { name, params });
}

// DEFAULT_ADMIN_ROLE is the zero hash by OpenZeppelin convention; the others
// are keccak256 of their name.
const ZERO_HASH = `0x${"0".repeat(64)}`;
export const ROLE_NAMES = {
  [ZERO_HASH]: "DEFAULT_ADMIN_ROLE",
  ...Object.fromEntries(
    ["PAUSER_ROLE", "MINTER_ROLE", "UPGRADER_ROLE", "FREEZER_ROLE", "RESCUER_ROLE"].map(
      (role) => [topicOf(role), role]
    )
  ),
};

const ROLE_PARAMS = new Set(["role", "previousAdminRole", "newAdminRole"]);

function format(name, type, value) {
  if (type === "address") return value.toLowerCase();
  if (type === "bytes32") return ROLE_PARAMS.has(name) ? (ROLE_NAMES[value] ?? value) : value;
  if (type === "uint8") return Number(value);
  return BigInt(value).toString();
}

function fromTopic(type, topic) {
  if (type === "address") return `0x${topic.slice(-40)}`;
  if (type === "bytes32") return topic;
  return BigInt(topic);
}

// Decodes a raw eth_getLogs entry. For known events the first (topics - 1)
// parameters are the indexed ones, the rest come from `data`; that holds for
// every event above and makes the decoder indifferent to which arguments the
// contract indexes. Raw topics and data are the caller's to keep.
//
// Transfer and Approval must have exactly two indexed arguments: anything else
// is a different event sharing the topic and would corrupt the ledger, so it
// fails loudly instead of being skipped.
export function decodeLog({ topics, data }) {
  const known = BY_TOPIC.get(topics[0]?.toLowerCase());
  if (!known) return { name: "Unknown", args: {} };

  const { name, params } = known;
  if ((name === "Transfer" || name === "Approval") && topics.length !== 3) {
    throw new Error(`${name} log with ${topics.length - 1} indexed arguments, expected 2`);
  }

  const indexed = topics.length - 1;
  try {
    if (indexed > params.length) throw new Error("too many indexed arguments");
    const fromData = decodeAbiParameters(
      params.slice(indexed).map(([, type]) => ({ type })),
      data
    );
    const values = [
      ...params.slice(0, indexed).map(([, type], i) => fromTopic(type, topics[i + 1])),
      ...fromData,
    ];
    const args = {};
    params.forEach(([paramName, type], i) => {
      args[paramName] = format(paramName, type, values[i]);
    });
    return { name, args };
  } catch (err) {
    if (name === "Transfer" || name === "Approval") throw err;
    return { name, args: {} };
  }
}
