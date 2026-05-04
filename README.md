# COPM On-chain Analysis

> Reproducible on-chain audit of [Minteo](https://minteo.com/)'s **COPM** stablecoin (the Colombian peso-backed stablecoin) on Polygon. Scans every `Transfer` event from the contract's deploy block to `latest`, computes daily/monthly aggregates, and generates SVG charts.

🇪🇸 [Versión en español](./README.es.md) · 📊 [Full Report](./REPORT.md) · 📊 [Reporte completo (ES)](./REPORT.es.md)

---

## What this is

A small, dependency-light Node.js pipeline that:

1. Discovers a token contract's deployment block via binary search on `eth_getCode`.
2. Scans all `Transfer` events in parallel (8 workers) directly from a Polygon RPC.
3. Resolves block timestamps with sample-and-interpolate (no need to query every block).
4. Aggregates the data into a daily time series (CSV) and a structured summary (JSON).
5. Generates 6 SVG charts (no canvas / no headless browser).

Headline output for COPM (2023-09-21 → 2026-05-03, 956 days):

| Metric | Value |
|--------|-------|
| Transfer events | **173,901** |
| Gross volume moved | **$1.83 billion USD** |
| Peak day | **2,597 txns / $38.6M USD** (2025-11-24) |
| Peak month | **November 2025: $296M USD** |
| Implied turnover | **~444x per year** (vs ~10-20x for USDT/USDC) |

→ Read the full analysis in **[REPORT.md](./REPORT.md)**.

---

## Where the data comes from

- **Primary source:** Polygon mainnet, contract `0x12050c705152931cFEe3DD56c52Fb09Dea816C23` (COPM, ERC-20 proxy).
- **Method:** `eth_getLogs` calls filtered by the `Transfer(address,address,uint256)` event signature, in 10,000-block chunks (Chainstack's hard limit) parallelized across 8 workers.
- **No third-party APIs** are used for the on-chain data — only an RPC endpoint. This means the analysis can be reproduced by anyone with an RPC URL, and is independent of indexers like The Graph, Dune, or Etherscan.
- **FX rate:** 1 USD = 4,000 COP (constant, configurable via env). The real rate fluctuated between ~3,900 and ~4,400 in the period.

The COPM contract is also deployed on Celo (`0xC92E8Fc2947E32F2B574CCA9F2F12097A71d5606`) and Solana (`Copm5KwCLXDTWYgXJYmo6ixmMZrxd1wabkujkcuaK47C`). This audit covers Polygon only.

---

## How it works

```
01-discover.js   → finds deploy block, fetches decimals/name/symbol
       │
       ▼
02-scan.js       → 8 parallel workers, eth_getLogs in 10k-block chunks,
       │            adaptive backoff on rate-limit errors,
       │            appends events to transfers.jsonl
       ▼
03-resolve-timestamps.js → fetches ~600 sample block timestamps,
       │                    interpolates timestamps for ~118k unique blocks
       ▼
04-aggregate.js  → groups by day, computes mints/burns/net/gross,
       │            writes daily.csv + summary.json
       ▼
05-charts.js     → renders 6 SVG charts in ./charts/
```

### Key technical decisions

- **No external indexer dependency.** Every number is derived from raw RPC calls. If you don't trust someone else's API, you can verify each transfer by reading the chain yourself.
- **Sample-and-interpolate timestamps.** Resolving 118k unique block timestamps via direct RPC calls would take ~30 minutes. Sampling 600 evenly-distributed blocks and linearly interpolating gives <1 minute and <60 seconds of error per block — irrelevant for daily aggregation.
- **Hand-rolled SVG charts.** No `chartjs-node-canvas`, no headless Chrome, no `puppeteer`. The chart generator is ~300 lines and produces small, embeddable SVGs.
- **Adaptive chunk sizing.** Starts with 10k-block chunks (Chainstack's hard limit), halves on transient errors, ramps back up on success.

---

## How to run a new audit

### Prerequisites

- **Node.js 20.6+** (required for the built-in `--env-file` flag).
- A **Polygon RPC URL** (Alchemy, Chainstack, QuickNode, Infura, or any provider). Public RPCs work but are slow and rate-limited.

### Setup

```bash
git clone https://github.com/juansacdev/copm-onchain-analysis.git
cd copm-onchain-analysis
npm install
cp .env.example .env
# edit .env and set POLYGON_RPC_URL to your provider URL
```

### Run the pipeline

```bash
node --env-file=.env 01-discover.js          # ~30 seconds
node --env-file=.env 02-scan.js --fresh      # ~9 minutes for COPM range
node --env-file=.env 03-resolve-timestamps.js  # ~30 seconds
node --env-file=.env 04-aggregate.js         # ~5 seconds
node --env-file=.env 05-charts.js            # ~1 second
```

Outputs:

| File | Description |
|------|-------------|
| `manifest.json` | Token metadata + deploy block |
| `transfers.jsonl` | One JSON line per Transfer event |
| `block-ts.json` | Interpolated timestamp for each unique block |
| `daily.csv` | Daily time series (one row per day) |
| `summary.json` | Aggregated totals, averages, and peaks |
| `charts/*.svg` | 6 charts |

### Auditing a different token

To analyze a different ERC-20 token on Polygon (or any EVM chain), edit `config.js`:

```js
export const COPM_ADDRESS = "0xYourTokenAddress";
```

For non-Polygon chains, also change the imported chain from `viem/chains`. Everything else generalizes — the pipeline is not COPM-specific.

---

## Repo layout

```
copm-onchain-analysis/
├── config.js                  # RPC client + ABI + env vars
├── 01-discover.js             # find deploy block + metadata
├── 02-scan.js                 # parallel Transfer event scanner
├── 03-resolve-timestamps.js   # sample-and-interpolate timestamps
├── 04-aggregate.js            # daily/monthly aggregation
├── 05-charts.js               # SVG chart generator
├── charts/                    # generated SVGs
├── manifest.json              # output: metadata
├── daily.csv                  # output: daily time series
├── summary.json               # output: aggregates
├── transfers.jsonl            # output: raw events
├── REPORT.md                  # full analysis (English)
├── REPORT.es.md               # análisis completo (Spanish)
└── README.md / README.es.md   # this file
```

---

## License & attribution

All on-chain data is public by definition. Code is released under MIT.

If you use this template for another token, attribution is appreciated but not required. If you find issues or improvements, PRs welcome.

---

## Author

**Juan Sebastián Agudelo** — [GitHub](https://github.com/juansacdev) · [LinkedIn](https://www.linkedin.com/in/juansacdev/)

Built as a personal study of Minteo's COPM stablecoin to verify public claims (e.g. "$200M/month") against raw Polygon data. The headline finding: the public claim was **conservative** — the November 2025 peak was $296M USD/month — but activity has dropped 68% since then.
