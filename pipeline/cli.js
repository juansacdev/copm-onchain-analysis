import { pathToFileURL } from "node:url";
import { CHAIN_KEYS } from "./config/chains.js";

// command -> step module. Steps are imported on demand so that a command
// only loads (and only needs the environment of) the step it runs.
const STEPS = {
  discover: "./steps/discover.js",
  scan: "./steps/scan.js",
  timestamps: "./steps/timestamps.js",
  aggregate: "./steps/aggregate.js",
  charts: "./steps/charts.js",
  "charts:combined": "./steps/combined-charts.js",
  validate: "./steps/validate.js",
};

export const COMMANDS = Object.keys(STEPS);

export class UsageError extends Error {}

export function usage() {
  return [
    "usage: node pipeline/cli.js <command> [--chain polygon|celo] [--fresh]",
    "",
    `commands: ${COMMANDS.join(", ")}`,
    `chains:   ${CHAIN_KEYS.join(", ")} (default: $CHAIN, then polygon)`,
    "",
    "  --fresh   scan only: discard previous output and start over",
  ].join("\n");
}

export function parseArgs(argv, env = process.env) {
  let command;
  let chain;
  let fresh = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--chain") {
      chain = argv[++i];
      if (!chain || chain.startsWith("--")) throw new UsageError("--chain requires a value");
    } else if (arg === "--fresh") {
      fresh = true;
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

  return { command, chain, fresh };
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

  const { run } = await import(STEPS[args.command]);
  const result = await run({ chainKey: args.chain, fresh: args.fresh, env });
  return result?.exitCode ?? 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
