import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRpcClient, scrubUrl } from "../pipeline/adapters/rpc.js";
import { readJson, writeJson, readJsonl, ensureDir } from "../pipeline/adapters/store.js";

test("createRpcClient fails only when the RPC URL is missing, naming the variable", () => {
  assert.throws(() => createRpcClient("polygon", {}), /missing POLYGON_RPC_URL/);
  assert.throws(() => createRpcClient("celo", {}), /missing CELO_RPC_URL/);
});

test("createRpcClient builds a client when the RPC URL is present", () => {
  const client = createRpcClient("celo", { CELO_RPC_URL: "http://127.0.0.1:1" });
  assert.equal(typeof client.getLogs, "function");
});

test("a failing request on the chain whose URL carries the secret never leaks it once scrubbed", async () => {
  const secret = "https://rpc.example/very-secret-key";
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("connect ECONNREFUSED");
  };
  try {
    // The client for celo reads CELO_RPC_URL, the variable that holds the secret.
    const client = createRpcClient("celo", { CELO_RPC_URL: secret });
    const err = await client.getBlockNumber().then(
      () => assert.fail("the request should have failed"),
      (e) => e
    );
    // viem quotes the endpoint in its errors, so the check is only meaningful
    // if the raw message does carry it; scrubUrl is what removes it.
    assert.ok(`${err.message} ${err.details}`.includes("rpc.example"), "the raw error should quote the endpoint");
    assert.doesNotMatch(scrubUrl(err.message, secret), /rpc\.example|very-secret-key/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a missing variable names itself and never another chain's URL", () => {
  const secret = "https://rpc.example/very-secret-key";
  assert.throws(
    () => createRpcClient("polygon", { CELO_RPC_URL: secret }),
    (err) => /missing POLYGON_RPC_URL/.test(err.message) && !err.message.includes(secret)
  );
});

test("store round-trips JSON and parses JSONL, skipping blank lines", () => {
  const dir = pathToFileURL(join(mkdtempSync(join(tmpdir(), "copm-")), "nested/"));
  ensureDir(dir);

  const jsonUrl = new URL("a.json", dir);
  writeJson(jsonUrl, { a: 1 });
  assert.deepEqual(readJson(jsonUrl), { a: 1 });

  const jsonlUrl = new URL("a.jsonl", dir);
  writeFileSync(jsonlUrl, '{"b":1}\n\n{"b":2}\n');
  assert.deepEqual(readJsonl(jsonlUrl), [{ b: 1 }, { b: 2 }]);
});
