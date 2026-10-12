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
    check: false,
    overrides: {},
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
    "holders",
    "aggregate",
    "charts",
    "charts:combined",
    "validate",
    "reports",
  ]);
  for (const command of COMMANDS) assert.equal(parseArgs([command], {}).command, command);
});

test("--check is a flag that only the reports command acts on", () => {
  assert.equal(parseArgs(["reports", "--check"], {}).check, true);
  assert.equal(parseArgs(["--check", "reports"], {}).check, true);
  assert.equal(parseArgs(["reports"], {}).check, false);
});

test("rejects a missing or unknown command, including the removed timestamps step", () => {
  assert.throws(() => parseArgs([], {}), UsageError);
  assert.throws(() => parseArgs(["nope"], {}), /unknown command "nope"/);
  assert.throws(() => parseArgs(["timestamps"], {}), /unknown command "timestamps"/);
});

test("scan tuning flags become numeric-string overrides under their setting names", () => {
  const { overrides } = parseArgs(
    ["scan", "--workers", "3", "--max-log-range", "2000", "--empty-confirmations", "4"],
    {}
  );
  assert.deepEqual(overrides, { workers: "3", maxLogRange: "2000", emptyConfirmations: "4" });
});

test("a tuning flag without a value is a usage error", () => {
  assert.throws(() => parseArgs(["scan", "--workers"], {}), /--workers requires a value/);
  assert.throws(() => parseArgs(["scan", "--workers", "--fresh"], {}), /--workers requires a value/);
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
  assert.match(text, /--workers/);
  assert.match(text, /reports/);
  assert.match(text, /--check/);
  assert.doesNotMatch(text, /timestamps/);
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

test("a step failure prints its message without a stack trace and exits 1", () => {
  const cli = fileURLToPath(new URL("../pipeline/cli.js", import.meta.url));
  const env = { PATH: process.env.PATH };

  const result = spawnSync(process.execPath, [cli, "scan", "--chain", "polygon"], {
    env,
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing POLYGON_RPC_URL/);
  assert.doesNotMatch(result.stderr, /\n\s+at /);
});

test("holders without an RPC URL fails with the same message as scan, before touching any file", () => {
  const cli = fileURLToPath(new URL("../pipeline/cli.js", import.meta.url));
  const result = spawnSync(process.execPath, [cli, "holders", "--chain", "celo"], {
    env: { PATH: process.env.PATH },
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing CELO_RPC_URL/);
});

/* R6 at the boundary ------------------------------------------------------- */

const SECRET_URL = "http://127.0.0.1:1/v2/SECRETKEY123";

// Everything an error could print: message, the viem fields and the stack.
const printable = (err) =>
  [err.message, err.shortMessage, err.details, ...(err.metaMessages ?? []), err.stack, String(err.cause?.message)]
    .filter(Boolean)
    .join("\n");

test("R6: discover against a refused connection never lets the endpoint URL out", async () => {
  const { run } = await import("../pipeline/steps/discover.js");
  await assert.rejects(run({ chainKey: "polygon", env: { POLYGON_RPC_URL: SECRET_URL } }), (err) => {
    const text = printable(err);
    assert.doesNotMatch(text, /SECRETKEY123/);
    assert.doesNotMatch(text, /127\.0\.0\.1/);
    return true;
  });
});

test("R6: the CLI scrubs every configured RPC URL from any step's error before printing", async () => {
  const { main } = await import("../pipeline/cli.js");
  const printed = [];
  const original = console.error;
  console.error = (...args) => printed.push(args.join(" "));
  try {
    // holders fails on the missing state or on the network depending on the
    // data; what matters is that nothing printed carries either URL.
    const env = {
      POLYGON_RPC_URL: SECRET_URL,
      CELO_RPC_URL: "http://127.0.0.1:2/other/CELOKEY456",
    };
    const code = await main(["discover", "--chain", "polygon"], env);
    assert.equal(code, 1);
  } finally {
    console.error = original;
  }
  const text = printed.join("\n");
  assert.match(text, /^error: /);
  assert.doesNotMatch(text, /SECRETKEY123|CELOKEY456|127\.0\.0\.1/);
});

test("R6: scrubbing covers the other chain's URL when a step's message quotes it", async () => {
  const { scrubConfiguredUrls } = await import("../pipeline/cli.js");
  const env = { POLYGON_RPC_URL: SECRET_URL, CELO_RPC_URL: "https://celo.example/CELOKEY456" };
  const out = scrubConfiguredUrls("a https://celo.example/CELOKEY456 b http://127.0.0.1:1/v2/SECRETKEY123", env);
  assert.doesNotMatch(out, /CELOKEY456|SECRETKEY123|celo\.example/);
  assert.equal(scrubConfiguredUrls("nothing to hide", {}), "nothing to hide");
});
