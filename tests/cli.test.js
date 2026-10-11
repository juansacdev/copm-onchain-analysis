import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { COMMANDS, UsageError, parseArgs, usage } from "../pipeline/cli.js";

test("parses a command with an explicit chain", () => {
  assert.deepEqual(parseArgs(["aggregate", "--chain", "celo"], {}), {
    command: "aggregate",
    chain: "celo",
    fresh: false,
  });
});

test("--chain defaults to the CHAIN env var, then to polygon", () => {
  assert.equal(parseArgs(["scan"], { CHAIN: "celo" }).chain, "celo");
  assert.equal(parseArgs(["scan"], { CHAIN: "CELO" }).chain, "celo");
  assert.equal(parseArgs(["scan"], {}).chain, "polygon");
});

test("--chain wins over the CHAIN env var", () => {
  assert.equal(parseArgs(["scan", "--chain", "polygon"], { CHAIN: "celo" }).chain, "polygon");
});

test("--fresh is a flag, accepted before or after the command", () => {
  assert.equal(parseArgs(["scan", "--fresh"], {}).fresh, true);
  assert.equal(parseArgs(["--fresh", "scan"], {}).fresh, true);
  assert.equal(parseArgs(["scan"], {}).fresh, false);
});

test("accepts every documented command", () => {
  assert.deepEqual(COMMANDS, [
    "discover",
    "scan",
    "timestamps",
    "aggregate",
    "charts",
    "charts:combined",
    "validate",
  ]);
  for (const command of COMMANDS) assert.equal(parseArgs([command], {}).command, command);
});

test("rejects a missing or unknown command", () => {
  assert.throws(() => parseArgs([], {}), UsageError);
  assert.throws(() => parseArgs(["nope"], {}), /unknown command "nope"/);
});

test("rejects an unknown chain, from the flag or from the env", () => {
  assert.throws(() => parseArgs(["aggregate", "--chain", "nope"], {}), /unknown chain "nope"/);
  assert.throws(() => parseArgs(["aggregate"], { CHAIN: "nope" }), /unknown chain "nope"/);
});

test("rejects --chain without a value and unknown flags", () => {
  assert.throws(() => parseArgs(["scan", "--chain"], {}), /--chain requires a value/);
  assert.throws(() => parseArgs(["scan", "--bogus"], {}), /unknown option "--bogus"/);
});

test("usage lists the commands and chains", () => {
  const text = usage();
  assert.match(text, /node pipeline\/cli\.js <command>/);
  assert.match(text, /charts:combined/);
  assert.match(text, /polygon\|celo/);
});

test("the CLI prints usage and exits 1 on bad input, without needing an RPC URL", () => {
  const cli = fileURLToPath(new URL("../pipeline/cli.js", import.meta.url));
  const env = { PATH: process.env.PATH };

  const unknownCommand = spawnSync(process.execPath, [cli, "nope"], { env, encoding: "utf8" });
  assert.equal(unknownCommand.status, 1);
  assert.match(unknownCommand.stderr, /usage:/);

  const unknownChain = spawnSync(process.execPath, [cli, "aggregate", "--chain", "nope"], {
    env,
    encoding: "utf8",
  });
  assert.equal(unknownChain.status, 1);
  assert.match(unknownChain.stderr, /unknown chain "nope"/);
});
