import { test } from "node:test";
import assert from "node:assert/strict";
import { createRpc, requireRpcUrl, scrubUrl } from "../pipeline/adapters/rpc.js";

const URL_WITH_SECRET = "https://secret.example/key";

// A scripted fetch: each entry is a function (request) => response-ish or a
// thrown error. Requests are recorded for inspection.
function scriptedFetch(script) {
  const requests = [];
  const fetch = async (url, init) => {
    requests.push({ url, body: JSON.parse(init.body) });
    const step = script[Math.min(requests.length - 1, script.length - 1)];
    return step(requests.at(-1).body);
  };
  return { fetch, requests };
}
const ok = (payload) => ({ ok: true, status: 200, json: async () => payload });
const rpc = (fetch, extra = {}) =>
  createRpc({ url: URL_WITH_SECRET, fetch, sleep: async () => {}, retries: 2, ...extra });

test("batch sends one request with ids and returns results aligned with the calls", async () => {
  const { fetch, requests } = scriptedFetch([
    (body) =>
      ok(
        body
          .map((c) => ({ jsonrpc: "2.0", id: c.id, result: `r-${c.method}` }))
          .reverse() // servers may answer out of order
      ),
  ]);
  const out = await rpc(fetch).batch([
    { method: "eth_blockNumber", params: [] },
    { method: "eth_getLogs", params: [{ fromBlock: "0x1" }] },
  ]);

  assert.equal(requests.length, 1);
  assert.deepEqual(out, [
    { ok: true, result: "r-eth_blockNumber" },
    { ok: true, result: "r-eth_getLogs" },
  ]);
});

test("a JSON-RPC error on one item does not fail the others", async () => {
  const { fetch } = scriptedFetch([
    (body) =>
      ok([
        { jsonrpc: "2.0", id: body[0].id, result: "0x1" },
        { jsonrpc: "2.0", id: body[1].id, error: { code: -32005, message: "limit exceeded" } },
      ]),
  ]);
  const out = await rpc(fetch).batch([
    { method: "a", params: [] },
    { method: "b", params: [] },
  ]);
  assert.equal(out[0].ok, true);
  assert.equal(out[1].ok, false);
  assert.match(out[1].error, /-32005 limit exceeded/);
});

test("an item missing from the response is reported as an item error", async () => {
  const { fetch } = scriptedFetch([(body) => ok([{ jsonrpc: "2.0", id: body[0].id, result: 1 }])]);
  const out = await rpc(fetch).batch([
    { method: "a", params: [] },
    { method: "b", params: [] },
  ]);
  assert.equal(out[1].ok, false);
  assert.match(out[1].error, /no response/);
});

test("transport failures are retried with backoff and then succeed", async () => {
  const sleeps = [];
  const { fetch, requests } = scriptedFetch([
    () => {
      throw new Error("socket hang up");
    },
    () => ({ ok: false, status: 503, json: async () => ({}) }),
    (body) => ok([{ jsonrpc: "2.0", id: body[0].id, result: "0x2" }]),
  ]);
  const out = await createRpc({
    url: URL_WITH_SECRET,
    fetch,
    sleep: async (ms) => sleeps.push(ms),
    retries: 3,
  }).batch([{ method: "a", params: [] }]);

  assert.equal(requests.length, 3);
  assert.deepEqual(out, [{ ok: true, result: "0x2" }]);
  assert.equal(sleeps.length, 2);
  assert.ok(sleeps[1] > sleeps[0]);
});

test("a non-array answer to a batch counts as a transport failure", async () => {
  const { fetch, requests } = scriptedFetch([
    () => ok({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "batch not supported" } }),
    (body) => ok([{ jsonrpc: "2.0", id: body[0].id, result: 1 }]),
  ]);
  const out = await rpc(fetch).batch([{ method: "a", params: [] }]);
  assert.equal(requests.length, 2);
  assert.equal(out[0].ok, true);
});

test("call returns the result and throws on a JSON-RPC error", async () => {
  const good = scriptedFetch([(body) => ok({ jsonrpc: "2.0", id: body.id, result: "0xff" })]);
  assert.equal(await rpc(good.fetch).call("eth_blockNumber", []), "0xff");
  assert.equal(good.requests[0].body.method, "eth_blockNumber");

  const bad = scriptedFetch([
    (body) => ok({ jsonrpc: "2.0", id: body.id, error: { code: 3, message: "execution reverted" } }),
  ]);
  await assert.rejects(rpc(bad.fetch).call("eth_call", []), /3 execution reverted/);
});

test("R6: errors never contain the endpoint URL, host or key", async () => {
  const leaky = scriptedFetch([
    () => {
      throw new Error(`connect ECONNREFUSED ${URL_WITH_SECRET} (host secret.example, key)`);
    },
  ]);
  await assert.rejects(rpc(leaky.fetch).batch([{ method: "a", params: [] }]), (err) => {
    assert.doesNotMatch(err.message, /secret\.example/);
    assert.doesNotMatch(err.message, /key/);
    assert.match(err.message, /ECONNREFUSED/);
    return true;
  });

  const itemError = scriptedFetch([
    (body) =>
      ok([{ jsonrpc: "2.0", id: body[0].id, error: { code: 1, message: `bad ${URL_WITH_SECRET}` } }]),
  ]);
  const out = await rpc(itemError.fetch).batch([{ method: "a", params: [] }]);
  assert.doesNotMatch(out[0].error, /secret\.example|key/);
});

test("scrubUrl removes the URL, host, path segments and query values", () => {
  const url = "https://user:pw@node.example:8545/v2/abcd1234?apikey=zzz999";
  const text = `failed ${url} on node.example:8545 with abcd1234 and zzz999`;
  const scrubbed = scrubUrl(text, url);
  for (const secret of ["node.example", "abcd1234", "zzz999", "pw"]) {
    assert.ok(!scrubbed.includes(secret), `${secret} leaked: ${scrubbed}`);
  }
});

test("requireRpcUrl names the missing variable and never echoes another chain's URL", () => {
  assert.throws(() => requireRpcUrl("polygon", {}), /missing POLYGON_RPC_URL/);
  assert.equal(requireRpcUrl("celo", { CELO_RPC_URL: "http://127.0.0.1:1" }), "http://127.0.0.1:1");
});
