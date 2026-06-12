# COPM — Unified On-chain Audit & Analysis (Polygon + Celo)

> The consolidated view of COPM, [Minteo](https://minteo.com/)'s Colombian peso stablecoin, across its two EVM deployments: **Polygon** and **Celo**. Every number comes from `Transfer` events read directly from each chain and validated against live on-chain state.
>
> 🇪🇸 [Versión en español](./AUDIT.es.md) · 📖 [Glossary](./GLOSSARY.md)
>
> Want a single chain in depth? Each one has its own independent audit: **[Polygon](./audit/polygon.md)** · **[Celo](./audit/celo.md)**

## The numbers, side by side

| Metric | Polygon | Celo | **Total** |
| :--- | ---: | ---: | ---: |
| Contract deploy | 2023-09-19 | 2024-09-11 | — |
| Audited days | 996 | 634 | — |
| `Transfer` events | 196,796 | 120,900 | **317,696** |
| Gross volume (USD) | $2,034M | $11.7M | **~$2,046M (~$2.05B)** |
| Net volume (USD) | $1,447M | $9.3M | **$1,456M** |
| Average ticket | ~$10,300 | ~$96 | — |
| Peak transactions/day | 2,597 (2025-11-24) | 1,919 (2025-01-19) | — |
| Peak volume/day | $38.6M (2025-11-24) | $737K (2025-07-23) | — |
| Peak month (volume) | $318.4M (Nov 2025) | $2.15M (Jul 2025) | — |
| Current on-chain supply | 6.32B COPM | 1.03B COPM | **7.35B COPM ≈ $1.84M** |
| Validation checks | 12/12 ✅ | 12/12 ✅ | **24/24 ✅** |

> FX rate: 1 USD = 4,000 COP, constant (±5% margin). Same methodology, same scripts, [same validations](#validation) on both chains.

---

## One stablecoin, two roles

Look at the average ticket: **$10,300 on Polygon, $96 on Celo**. That two-orders-of-magnitude gap isn't noise — it's architecture.

Polygon is the institutional rail: B2B settlement, large amounts, the $2B of historical volume. Celo is the small-payments network: remittances, micropayments, end-user wallets — with a daily transaction count nearly identical to Polygon's (~191 vs ~198), while moving a thousandth of the value.

![Monthly volume by chain](./charts/combined/01-monthly-volume-by-chain.svg)

## The relay between chains is visible to the naked eye

The monthly transactions chart tells a story no internal dashboard could tell better: **Celo took off first in activity** (its 18,491-transaction peak came in January 2025, barely 4 months after deploy), and **Polygon took over** with the institutional wave of mid-to-late 2025 that culminated in November's record.

![Monthly transfers by chain](./charts/combined/02-monthly-transfers-by-chain.svg)

It also explains why a second chain takes off faster: COPM took **17 months** to cross 100 daily transactions on Polygon, and **6 weeks** to do it on Celo. A second chain doesn't start from zero — it inherits partners, operations, and proven use cases.

## The running total: ~$2.05B and counting

![Cumulative volume by chain](./charts/combined/03-cumulative-volume-by-chain.svg)

## Each chain's supply, derived event by event

![Supply by chain](./charts/combined/04-supply-by-chain.svg)

On Celo, the supply derived from replaying the 120,900 events reconciles **exactly** (0.0% deviation) against the contract's live `totalSupply()`. On Polygon there's a known ~1.3B COPM difference attributable to proxy operations (documented in [its audit](./audit/polygon.md#limitations)); it doesn't affect volumes or peaks.

---

## Validation

Both audits run the same battery of 12 checks — dataset integrity, series continuity, accounting invariants (mints − burns = supply), and **spot checks against the live chain** (random transfers re-verified against their receipts or against a fresh logs query). Result: **24/24 green**.

| Chain | Checks | Detail |
| :--- | :--- | :--- |
| Polygon | 12/12 ✅ | [`data/polygon/validation.json`](./data/polygon/validation.json) |
| Celo | 12/12 ✅ | [`data/celo/validation.json`](./data/celo/validation.json) |

## Why you can trust these numbers

1. **Primary source.** Nothing comes from dashboards, indexers, or third-party APIs: only standard RPC calls against each chain. A paid RPC or a public one both work.
2. **Reproducible.** The whole pipeline lives in this repository. Run `npm run audit:all` and you get the same numbers (plus whatever new events landed since this run).
3. **Validated.** Every pipeline artifact passes internal-consistency checks and live-chain checks before being reported.
4. **Public by definition.** The blockchain is a public ledger: this audit doesn't use — or need — any company's internal information.

## Reproduce everything

```bash
cp .env.example .env   # configure your RPCs
npm install
npm run audit:all      # both chains + combined charts
```

Methodology details and limitations live in each individual audit: [Polygon](./audit/polygon.md) · [Celo](./audit/celo.md).
