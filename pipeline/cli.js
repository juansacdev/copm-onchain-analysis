import { pathToFileURL } from "node:url";
import { CHAIN_KEYS, SCAN_SETTING_KEYS, getChain } from "./config/chains.js";
import { scrubUrl } from "./adapters/rpc.js";

// command -> step module. Steps are imported on demand so that a command
// only loads (and only needs the environment of) the step it runs.
const STEPS = {
  discover: "./steps/discover.js",
  scan: "./steps/scan.js",
  holders: "./steps/holders.js",
  rates: "./steps/rates.js",
  aggregate: "./steps/aggregate.js",
  dashboard: "./steps/dashboard.js",
  charts: "./steps/charts.js",
  "charts:combined": "./steps/combined-charts.js",
  validate: "./steps/validate.js",
  reports: "./steps/reports.js",
};

export const COMMANDS = Object.keys(STEPS);

export class UsageError extends Error {}

// --max-log-range -> maxLogRange. Values are validated by scanSettings().
const kebab = (name) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const TUNING_FLAGS = new Map(SCAN_SETTING_KEYS.map((name) => [`--${kebab(name)}`, name]));

export function usage() {
  return [
    "usage: node pipeline/cli.js <command> [--chain polygon|celo] [--fresh] [--check]",
    "",
    `commands: ${COMMANDS.join(", ")}`,
    `chains:   ${CHAIN_KEYS.join(", ")} (default: $CHAIN, then polygon)`,
    "",
    "  --fresh   scan only: discard previous output and start over",
    "  --check   reports only: write nothing, exit 1 if a figure is out of date",
    "",
    "scan tuning (defaults are per chain; env SCAN_* also works, flags win):",
    `  ${[...TUNING_FLAGS.keys()].join(" <n>  ")} <n>`,
  ].join("\n");
}

export function parseArgs(argv, env = process.env) {
  let command;
  let chain;
  let fresh = false;
  let check = false;
  const overrides = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--chain") {
      chain = argv[++i];
      if (!chain || chain.startsWith("--")) throw new UsageError("--chain requires a value");
    } else if (arg === "--fresh") {
      fresh = true;
    } else if (arg === "--check") {
      check = true;
    } else if (TUNING_FLAGS.has(arg)) {
      const value = argv[++i];
      if (value === undefined || value.startsWith("--")) {
        throw new UsageError(`${arg} requires a value`);
      }
      overrides[TUNING_FLAGS.get(arg)] = value;
    } else if (arg.startsWith("--")) {
      throw new UsageError(`unknown option "${arg}"`);
    } else if (command === undefined) {
      command = arg;
    } else {
      throw new UsageError(`unexpected argument "${arg}"`);
    }
  }

  if (command === undefined) throw new UsageError("missing command");
  if (!COMMANDS.includes(command)) throw new UsageError(`unknown command "${command}"`);

  chain = (chain ?? env.CHAIN ?? "polygon").toLowerCase();
  if (!CHAIN_KEYS.includes(chain)) {
    throw new UsageError(`unknown chain "${chain}". valid values: ${CHAIN_KEYS.join(", ")}`);
  }

  return { command, chain, fresh, check, overrides };
}

// R6 at the boundary. Whatever a step throws (viem puts the full endpoint URL
// in its messages), no configured RPC URL of any chain may reach the terminal.
export function scrubConfiguredUrls(text, env = process.env) {
  let out = String(text);
  for (const key of CHAIN_KEYS) {
    const url = env[getChain(key).rpcEnv];
    if (url) out = scrubUrl(out, url);
  }
  return out;
}

export async function main(argv, env = process.env) {
  let args;
  try {
    args = parseArgs(argv, env);
  } catch (err) {
    if (!(err instanceof UsageError)) throw err;
    console.error(`${err.message}\n\n${usage()}`);
    return 1;
  }

  // Steps report failures by throwing. Only the message is printed: a stack
  // trace adds nothing for the operator and must never be the place an
  // endpoint URL shows up.
  try {
    const { run } = await import(STEPS[args.command]);
    const result = await run({
      chainKey: args.chain,
      fresh: args.fresh,
      check: args.check,
      overrides: args.overrides,
      env,
    });
    return result?.exitCode ?? 0;
  } catch (err) {
    console.error(`error: ${scrubConfiguredUrls(err?.message ?? err, env)}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
