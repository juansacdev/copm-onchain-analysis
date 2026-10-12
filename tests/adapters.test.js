import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRpcClient } from "../pipeline/adapters/rpc.js";
import { readJson, writeJson, readJsonl, ensureDir } from "../pipeline/adapters/store.js";

test("createRpcClient fails only when the RPC URL is missing, naming the variable", () => {
  assert.throws(() => createRpcClient("polygon", {}), /missing POLYGON_RPC_URL/);
  assert.throws(() => createRpcClient("celo", {}), /missing CELO_RPC_URL/);
});

test("createRpcClient builds a client when the RPC URL is present", () => {
  const client = createRpcClient("celo", { CELO_RPC_URL: "http://127.0.0.1:1" });
  assert.equal(typeof client.getLogs, "function");
});

test("the error message never echoes an RPC URL", () => {
  const secret = "https://rpc.example/very-secret-key";
  assert.throws(
    () => createRpcClient("polygon", { CELO_RPC_URL: secret }),
    (err) => !err.message.includes(secret)
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
