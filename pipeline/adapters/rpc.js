import { createPublicClient, http } from "viem";
import { getChain } from "../config/chains.js";

// Built on demand so that steps that never touch the network (aggregate,
// charts) run without an RPC URL.
export function createRpcClient(chainKey, env = process.env) {
  const chain = getChain(chainKey);
  const url = env[chain.rpcEnv];
  if (!url) {
    throw new Error(
      `missing ${chain.rpcEnv}. set it in .env or export it.\n` +
        "  cp .env.example .env  # then edit .env\n" +
        `  node --env-file=.env pipeline/cli.js <command> --chain ${chainKey}`
    );
  }

  return createPublicClient({
    chain: chain.viemChain,
    transport: http(url, {
      batch: true,
      timeout: 30_000,
      retryCount: 3,
      retryDelay: 500,
    }),
  });
}
