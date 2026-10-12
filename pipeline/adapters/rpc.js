import { createPublicClient, http } from "viem";
import { getChain } from "../config/chains.js";

// The endpoint URL usually embeds an API key. It is read here and nowhere
// else, and no message produced by this module may contain it.
export function requireRpcUrl(chainKey, env = process.env) {
  const chain = getChain(chainKey);
  const url = env[chain.rpcEnv];
  if (!url) {
    throw new Error(
      `missing ${chain.rpcEnv}. set it in .env or export it.\n` +
        "  cp .env.example .env  # then edit .env\n" +
        `  node --env-file=.env pipeline/cli.js <command> --chain ${chainKey}`
    );
  }
  return url;
}

// viem client for the steps that read contract metadata (discover).
// Built on demand so that steps that never touch the network (aggregate,
// charts) run without an RPC URL.
export function createRpcClient(chainKey, env = process.env) {
  const chain = getChain(chainKey);
  return createPublicClient({
    chain: chain.viemChain,
    transport: http(requireRpcUrl(chainKey, env), {
      batch: true,
      timeout: 30_000,
      retryCount: 3,
      retryDelay: 500,
    }),
  });
}

/* Raw JSON-RPC for the scan ----------------------------------------------- */

export class RpcError extends Error {}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// R6. Replaces everything that could identify or authenticate against the
// endpoint (URL, host, credentials, path segments, query values) in one pass.
export function scrubUrl(text, url) {
  const secrets = new Set([url]);
  try {
    const u = new URL(url);
    for (const part of [u.href, u.origin, u.host, u.hostname, u.username, u.password]) {
      if (part) secrets.add(part);
    }
    if (u.pathname.length > 1) secrets.add(u.pathname);
    for (const segment of u.pathname.split("/")) if (segment.length >= 3) secrets.add(segment);
    for (const value of u.searchParams.values()) if (value.length >= 3) secrets.add(value);
  } catch {
    // not a parseable URL: the raw string is still removed
  }
  const pattern = [...secrets]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|");
  return String(text).replace(new RegExp(pattern, "g"), "<endpoint>");
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// JSON-RPC over fetch. `batch` answers each call with { ok, result } or
// { ok: false, error } because item-level failures are routine on public
// endpoints and the scan decides what they mean. Transport failures (network,
// HTTP status, malformed body) are retried with exponential backoff and then
// thrown as RpcError.
export function createRpc({
  url,
  fetch = globalThis.fetch,
  sleep = defaultSleep,
  retries = 5,
  backoffMs = 500,
  maxBackoffMs = 15_000,
  timeoutMs = 30_000,
}) {
  async function post(body, validate) {
    let reason = "unknown";
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) await sleep(Math.min(backoffMs * 2 ** (attempt - 1), maxBackoffMs));
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        validate(payload);
        return payload;
      } catch (err) {
        reason = scrubUrl(err?.message ?? err, url);
      }
    }
    throw new RpcError(`rpc request failed after ${retries + 1} attempts: ${reason}`);
  }

  const describe = (error) =>
    scrubUrl(`${error?.code ?? ""} ${error?.message ?? "unknown error"}`.trim(), url);

  return {
    async batch(calls) {
      const body = calls.map((c, id) => ({ jsonrpc: "2.0", id, method: c.method, params: c.params }));
      const payload = await post(body, (p) => {
        if (!Array.isArray(p)) throw new Error("batch answered with a non-array body");
      });
      const byId = new Map(payload.map((item) => [item?.id, item]));
      return calls.map((_, id) => {
        const item = byId.get(id);
        if (!item) return { ok: false, error: "no response for this call" };
        if (item.error) return { ok: false, error: describe(item.error) };
        return { ok: true, result: item.result };
      });
    },

    async call(method, params) {
      const payload = await post({ jsonrpc: "2.0", id: 1, method, params }, (p) => {
        if (!p || typeof p !== "object" || Array.isArray(p)) throw new Error("malformed response");
      });
      if (payload.error) throw new RpcError(describe(payload.error));
      return payload.result;
    },
  };
}
