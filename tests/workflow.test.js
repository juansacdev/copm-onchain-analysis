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
