import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const workflow = readFileSync(new URL("../.github/workflows/daily-scan.yml", import.meta.url), "utf8");

// The push loop of the "Commit the data" step, de-indented as a script.
function pushLoop() {
  const start = workflow.indexOf("          for attempt in");
  assert.ok(start > 0, "the push loop is in the workflow");
  return workflow
    .slice(start)
    .split("\n")
    .map((line) => line.replace(/^ {10}/, ""))
    .join("\n");
}

// Runs the loop under bash -e with a fake git (push succeeds from the
// `succeedOn`-th call, or never) and a no-op sleep. Returns the exit status
// and the log of git calls.
function run(succeedOn) {
  const dir = mkdtempSync(join(tmpdir(), "copm-push-"));
  const log = join(dir, "calls.log");
  const bin = (name, body) => {
    writeFileSync(join(dir, name), `#!/bin/bash\n${body}\n`);
    chmodSync(join(dir, name), 0o755);
  };
  bin("sleep", "exit 0");
  bin(
    "git",
    `echo "$1" >> "${log}"
if [ "$1" = push ]; then
  n=$(grep -c '^push$' "${log}")
  [ ${succeedOn ?? 0} -gt 0 ] && [ "$n" -ge ${succeedOn ?? 0} ] && exit 0
  exit 1
fi
exit 0`,
  );
  const result = spawnSync("bash", ["-e", "-c", pushLoop()], {
    env: { PATH: `${dir}:${process.env.PATH}`, GITHUB_REF_NAME: "main" },
    encoding: "utf8",
  });
  const calls = readFileSync(log, "utf8").trim().split("\n");
  return { status: result.status, calls, stdout: result.stdout };
}

test("a push that fails five times is attempted five times, rebasing between them", () => {
  const { status, calls } = run(null);
  assert.equal(status, 1);
  assert.equal(calls.filter((c) => c === "push").length, 5);
  assert.equal(calls.filter((c) => c === "pull").length, 4);
  assert.equal(calls.at(-1), "push", "the last git call is a push, never a wasted rebase");
});

test("every rebase is followed by a push attempt, and success stops the loop", () => {
  const { status, calls } = run(5);
  assert.equal(status, 0);
  assert.deepEqual(calls, ["push", "pull", "push", "pull", "push", "pull", "push", "pull", "push"]);
  assert.equal(run(1).calls.length, 1);
});

/* The exchange rate is fetched once, before anything is valued ---------------- */

test("the daily job fetches the rates once, before the per-chain loop that aggregates", () => {
  const rates = workflow.indexOf("node pipeline/cli.js rates");
  const loop = workflow.indexOf("for chain in polygon celo; do");
  const aggregate = workflow.indexOf("node pipeline/cli.js aggregate");
  assert.ok(rates > 0, "the workflow runs the rates command");
  assert.equal(workflow.split("node pipeline/cli.js rates").length - 1, 1, "once, not per chain");
  assert.ok(rates < loop && loop < aggregate, "rates run before the loop, which runs aggregate");
});

test("the workflow commits the rates with the rest of the data", () => {
  assert.match(workflow, /git add data /);
});

test("package.json has a rates script and the audit flow runs it before aggregate", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.scripts.rates, "node pipeline/cli.js rates");
  const audit = pkg.scripts.audit;
  assert.ok(audit.indexOf("npm run rates") >= 0);
  assert.ok(audit.indexOf("npm run rates") < audit.indexOf("npm run aggregate"));
  assert.doesNotMatch(JSON.stringify(pkg.scripts), new RegExp(["COP", "PER", "USD"].join("_")));
});

test(".env.example no longer offers a constant rate", () => {
  const env = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  assert.doesNotMatch(env, new RegExp(["COP", "PER", "USD"].join("_")));
});
