# COPM — On-chain Audit & Analysis (Polygon + Celo)

> Reproducible audit of **COPM**, [Minteo](https://minteo.com/)'s Colombian peso stablecoin, across its two EVM deployments. Every `Transfer` event in both contracts' history, scanned straight from each chain, validated against live on-chain state, and analyzed.
>
> 🇪🇸 [Versión en español](./README.es.md)

| | |
| :--- | :--- |
| 📊 **[Unified audit (Polygon + Celo)](./AUDIT.md)** | The consolidated, side-by-side view |
| 🟣 **[Polygon audit](./audit/polygon.md)** | $2.03B moved in 2.7 years |
| 🟢 **[Celo audit](./audit/celo.md)** | 120,900 payments at a $96 average ticket |
| 📖 **[Glossary](./GLOSSARY.md)** | Every term, in plain language |

---

## Why this repository exists

I was part of the founding team that built COPM at Minteo. We designed and built the systems, the workflows, and the architecture that moved that money.

And here comes the classic problem: almost none of it can be shown. The code belongs to the company. The dashboards are internal. NDAs exist and are honored.

But there's one giant exception: **the blockchain is public by definition.** Every mint, every burn, every COPM transfer was recorded on Polygon and Celo, verifiable by anyone, forever. It's not the company's internal information, not its codebase, not its IP — it's the public record of what the system did.

So instead of asking you to take my word for it, I audited it: **317,696 events, ~$2.05 billion dollars in volume, two chains, 24 validation checks in the green.** This repository is the evidence, the scripts to reproduce it, and the analysis of what it tells.

## The headlines

| Metric | Value |
| :--- | :--- |
| Total gross volume (both chains) | **~$2.05B USD** |
| Audited `Transfer` events | **317,696** |
| Peak month (Polygon) | **$318.4M USD** (November 2025) |
| Peak day (Polygon) | **$38.6M USD · 2,597 transactions** (2025-11-24) |
| Supply turnover (Polygon) | **~35x per month** (~25x faster than USDT/USDC) |
| Supply reconciliation (Celo) | **Exact: 0.0% deviation** against `totalSupply()` |
| Validation | **24/24 checks** — including transfer re-verification against the live chain |

→ The detail, the charts, and the full story live in the **[unified audit](./AUDIT.md)**.

## How it works

A Node.js pipeline, deliberately lightweight (a single dependency: [viem](https://viem.sh)), run per chain:

```
01-discover.js    → finds the deploy block (binary search over eth_getCode)
02-scan.js        → downloads every Transfer event (eth_getLogs, parallel workers,
                     adaptive backoff on rate limits)
03-resolve-timestamps.js → timestamps via sampling + interpolation
04-aggregate.js   → daily series: volume, mints, burns, derived supply
05-charts.js      → self-contained SVGs (no canvas, no headless browser)
06-combined-charts.js → Polygon + Celo charts on shared axes
07-validate.js    → 12 checks per chain, including live-chain spot checks
```

**The only source is an RPC endpoint.** No indexers, no third-party APIs, no block explorers. Works with a paid RPC (faster) or a public one (free; the scanner self-throttles).

## Reproduce it

```bash
git clone https://github.com/juansacdev/copm-onchain-analysis.git
cd copm-onchain-analysis
cp .env.example .env   # configure your RPCs (the public Celo one is preset)
npm install

npm run audit:polygon  # Polygon only (~15 min on a paid RPC)
npm run audit:celo     # Celo only (~25 min on the public RPC)
npm run audit:all      # both + combined charts
```

Every run is complete and idempotent: it scans from the deploy block to `latest`, validates, and regenerates everything.

## Repository layout

```
├── AUDIT.md / AUDIT.es.md        # unified audit (start here)
├── audit/
│   ├── polygon.md / polygon.es.md  # per-chain audits
│   └── celo.md / celo.es.md
├── GLOSSARY.md / GLOSSARY.es.md  # glossary
├── data/<chain>/                 # raw + derived data per chain
│   ├── transfers.jsonl           # every Transfer event (raw)
│   ├── daily.csv                 # aggregated daily series
│   ├── summary.json              # totals, averages, peaks
│   ├── manifest.json             # contract + scan metadata
│   └── validation.json           # the 12 checks' results
├── charts/<chain>/               # 6 SVGs per chain
├── charts/combined/              # 4 comparative SVGs
└── 0*.js                         # the pipeline
```

## Audited contracts

| Chain | Contract |
| :--- | :--- |
| Polygon | [`0x12050c705152931cFEe3DD56c52Fb09Dea816C23`](https://polygonscan.com/token/0x12050c705152931cFEe3DD56c52Fb09Dea816C23) |
| Celo | [`0xC92E8Fc2947E32F2B574CCA9F2F12097A71d5606`](https://celoscan.io/token/0xC92E8Fc2947E32F2B574CCA9F2F12097A71d5606) |

## License

[MIT](./LICENSE) — use it, fork it, audit your own token with it.
