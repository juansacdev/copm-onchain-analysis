# COPM — Unified On-chain Audit & Analysis (Polygon + Celo)

> The consolidated view of COPM, [Minteo](https://minteo.com/)'s Colombian peso stablecoin, across its two EVM deployments: **Polygon** and **Celo**. Every number comes from `Transfer` events read directly from each chain and verified against live on-chain state.
>
> 🇪🇸 [Versión en español](./AUDIT.es.md) · 📖 [Glossary](./GLOSSARY.md) · 🔔 [Contract events](./EVENTS.md)
>
> Want a single chain in depth? Each one has its own independent audit: **[Polygon](./audit/polygon.md)** · **[Celo](./audit/celo.md)**

Data as of Polygon block <!-- copm:polygon.checkpointBlock -->95,370,448<!-- /copm --> and Celo block <!-- copm:celo.checkpointBlock -->79,861,762<!-- /copm --> (<!-- copm:polygon.checkpointDate -->2026-10-11<!-- /copm -->). Every figure in this page is filled from `data/` by `npm run reports`.

## The numbers, side by side

| Metric | Polygon | Celo | **Total** |
| :--- | ---: | ---: | ---: |
| Contract deploy | <!-- copm:polygon.deployDate -->2023-09-19<!-- /copm --> | <!-- copm:celo.deployDate -->2024-09-11<!-- /copm --> | — |
| Audited days | <!-- copm:polygon.totalDays -->1,117<!-- /copm --> | <!-- copm:celo.totalDays -->754<!-- /copm --> | — |
| `Transfer` events | <!-- copm:polygon.transfers -->241,858<!-- /copm --> | <!-- copm:celo.transfers -->132,944<!-- /copm --> | **<!-- copm:combined.transfers -->374,802<!-- /copm -->** |
| Gross volume (USD) | <!-- copm:polygon.grossVolumeUsd -->$2.17B<!-- /copm --> | <!-- copm:celo.grossVolumeUsd -->$13M<!-- /copm --> | **~<!-- copm:combined.grossVolumeUsd -->$2.18B<!-- /copm -->** |
| Net volume (USD) | <!-- copm:polygon.netVolumeUsd -->$1.54B<!-- /copm --> | <!-- copm:celo.netVolumeUsd -->$10.5M<!-- /copm --> | **<!-- copm:combined.netVolumeUsd -->$1.55B<!-- /copm -->** |
| Average ticket | ~<!-- copm:polygon.avgTicketUsd -->$8,952<!-- /copm --> | ~<!-- copm:celo.avgTicketUsd -->$98<!-- /copm --> | — |
| Peak transfers/day | <!-- copm:polygon.peakTxCount -->2,597<!-- /copm --> (<!-- copm:polygon.peakTxDay -->2025-11-24<!-- /copm -->) | <!-- copm:celo.peakTxCount -->1,919<!-- /copm --> (<!-- copm:celo.peakTxDay -->2025-01-19<!-- /copm -->) | — |
| Peak volume/day | <!-- copm:polygon.peakVolumeUsd -->$38.6M<!-- /copm --> (<!-- copm:polygon.peakVolumeDay -->2025-11-24<!-- /copm -->) | <!-- copm:celo.peakVolumeUsd -->$737K<!-- /copm --> (<!-- copm:celo.peakVolumeDay -->2025-07-23<!-- /copm -->) | — |
| Peak month (volume) | <!-- copm:polygon.peakMonthUsd -->$318.4M<!-- /copm --> (<!-- copm:polygon.peakMonthShort -->Nov 2025<!-- /copm -->) | <!-- copm:celo.peakMonthUsd -->$2.2M<!-- /copm --> (<!-- copm:celo.peakMonthShort -->Jul 2025<!-- /copm -->) | — |
| Current on-chain supply | <!-- copm:polygon.supplyCompact -->4.48B<!-- /copm --> COPM | <!-- copm:celo.supplyCompact -->418.6M<!-- /copm --> COPM | **<!-- copm:combined.supply -->4.9B<!-- /copm --> COPM ≈ <!-- copm:combined.supplyUsd -->$1.2M<!-- /copm -->** |
| Holders with a balance | <!-- copm:polygon.holders -->582<!-- /copm --> | <!-- copm:celo.holders -->998<!-- /copm --> | **<!-- copm:combined.holders -->1,580<!-- /copm -->** |
| Strict validation rules | <!-- copm:polygon.checksPassed -->19<!-- /copm -->/<!-- copm:polygon.checksTotal -->19<!-- /copm --> ✅ | <!-- copm:celo.checksPassed -->19<!-- /copm -->/<!-- copm:celo.checksTotal -->19<!-- /copm --> ✅ | **<!-- copm:combined.checksPassed -->38<!-- /copm -->/<!-- copm:combined.checksTotal -->38<!-- /copm --> ✅** |

> FX rate: 1 USD = <!-- copm:fx.copPerUsd -->4,000<!-- /copm --> COP, constant (±5% margin). Same methodology, same scripts, [same validations](#validation) on both chains.

---

## One stablecoin, two roles

Look at the average ticket: **<!-- copm:polygon.avgTicketUsd -->$8,952<!-- /copm --> on Polygon, <!-- copm:celo.avgTicketUsd -->$98<!-- /copm --> on Celo**. That gap of about two orders of magnitude isn't noise — it's architecture.

Polygon is the institutional rail: B2B settlement, large amounts, nearly all of the historical volume. Celo is the small-payments network: remittances, micropayments, end-user wallets — with a daily transfer count of the same order as Polygon's (~<!-- copm:celo.avgDailyTransfers -->176<!-- /copm --> vs ~<!-- copm:polygon.avgDailyTransfers -->217<!-- /copm -->), while moving a small fraction of the value.

![Monthly volume by chain](../charts/combined/01-monthly-volume-by-chain.svg)

## The relay between chains is visible to the naked eye

The monthly transfers chart tells a story no internal dashboard could tell better: **Celo took off first in activity** (its <!-- copm:celo.peakTxMonthCount -->18,491<!-- /copm -->-transfer peak came in <!-- copm:celo.peakTxMonth -->January 2025<!-- /copm -->, barely four months after deploy), and **Polygon took over** with the institutional wave of mid-to-late 2025 that culminated in <!-- copm:polygon.peakMonth -->November 2025<!-- /copm -->, its highest-volume month.

![Monthly transfers by chain](../charts/combined/02-monthly-transfers-by-chain.svg)

It also explains why a second chain takes off faster: COPM took **16.5 months** from deployment to cross 100 daily transfers on Polygon (first day: <!-- copm:polygon.firstDayAbove100 -->2025-02-03<!-- /copm -->), and **7 weeks** from deployment to do it on Celo, about 6 from its first transfer (first day: <!-- copm:celo.firstDayAbove100 -->2024-10-30<!-- /copm -->). A second chain doesn't start from zero — it inherits partners, operations, and proven use cases.

## The running total: ~<!-- copm:combined.grossVolumeUsd -->$2.18B<!-- /copm --> and counting

![Cumulative volume by chain](../charts/combined/03-cumulative-volume-by-chain.svg)

## Each chain's supply, derived event by event

![Supply by chain](../charts/combined/04-supply-by-chain.svg)

On both chains, the supply derived from replaying every `Transfer` event (<!-- copm:polygon.transfers -->241,858<!-- /copm --> on Polygon, <!-- copm:celo.transfers -->132,944<!-- /copm --> on Celo) equals the contract's live `totalSupply()` **to the wei**: <!-- copm:polygon.supply -->4,482,231,674.75<!-- /copm --> COPM on Polygon and <!-- copm:celo.supply -->418,585,134.63<!-- /copm --> COPM on Celo. Polygon's supply peaked at <!-- copm:polygon.peakSupplyCopm -->11.36B<!-- /copm --> COPM on <!-- copm:polygon.peakSupplyDay -->2026-05-07<!-- /copm -->; Celo's at <!-- copm:celo.peakSupplyCopm -->1.14B<!-- /copm --> COPM on <!-- copm:celo.peakSupplyDay -->2026-03-24<!-- /copm -->.

Earlier versions of this dataset were missing part of Polygon's history and showed a gap against `totalSupply()`. The strict validation exists so that cannot pass again: it tolerates no difference at all.

---

## Validation

Each chain passes the same <!-- copm:polygon.checksTotal -->19<!-- /copm --> strict rules, offline and with no tolerance: minted − burned equals `totalSupply()` to the wei, replaying the stored transfers reproduces the checkpoint, no balance is negative, `holders.csv` adds up to `totalSupply()`, partitions are ordered and complete, timestamps are exact, and `daily.csv` is exactly what the transfers produce. Result: **<!-- copm:combined.checksPassed -->38<!-- /copm -->/<!-- copm:combined.checksTotal -->38<!-- /copm --> green**.

The comparison with the live chain happens when the data is written, not in `validate`: `scan` reconciles the ledger against `totalSupply()` at every stage before moving the checkpoint, and `holders` checks every balance against `balanceOf` at the checkpoint block.

| Chain | Rules passed | Detail |
| :--- | :--- | :--- |
| Polygon | <!-- copm:polygon.checksPassed -->19<!-- /copm -->/<!-- copm:polygon.checksTotal -->19<!-- /copm --> ✅ | [`data/polygon/validation.json`](../data/polygon/validation.json) |
| Celo | <!-- copm:celo.checksPassed -->19<!-- /copm -->/<!-- copm:celo.checksTotal -->19<!-- /copm --> ✅ | [`data/celo/validation.json`](../data/celo/validation.json) |

## Why you can trust these numbers

1. **Primary source.** Nothing comes from dashboards, indexers, or third-party APIs: only standard RPC calls against each chain. A paid RPC or a public one both work.
2. **Reproducible.** The whole pipeline lives in this repository. Run `npm run audit:all` and you get the same numbers (plus whatever new events landed since this run).
3. **Verified while it runs.** The scan does not advance until the events it holds add up to the contract, and every number in these pages is filled from the data files, never typed by hand.
4. **Public by definition.** The blockchain is a public ledger: this audit doesn't use — or need — any company's internal information.

## Reproduce everything

```bash
cp .env.example .env   # configure your RPCs
npm install
npm run audit:all      # both chains + combined charts + report figures
```

Methodology details and limitations live in each individual audit: [Polygon](./audit/polygon.md) · [Celo](./audit/celo.md).
