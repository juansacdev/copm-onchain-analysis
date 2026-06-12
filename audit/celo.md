# COPM on Celo — On-chain Audit & Analysis

> First-ever on-chain audit of COPM on Celo: contract [`0xC92E8Fc2947E32F2B574CCA9F2F12097A71d5606`](https://celoscan.io/token/0xC92E8Fc2947E32F2B574CCA9F2F12097A71d5606) on Celo mainnet, every `Transfer` event from deploy to the latest block, validated against the live chain.
>
> 🇪🇸 [Versión en español](./celo.es.md) · 📖 [Glossary](../GLOSSARY.md) · 🔗 [Unified Polygon + Celo audit](../AUDIT.md)

If COPM's story on [Polygon](./polygon.md) is that of an institutional rail, the Celo story is a completely different one — and seeing them side by side is where it gets interesting. Same stablecoin, two roles.

## Executive summary

| Metric | Value |
| :--- | :--- |
| **Audited period** | 2024-09-17 → 2026-06-12 (634 days, ~1.7 years) |
| **`Transfer` events** | **120,900** |
| **Gross volume moved** | 46.7B COPM ≈ **$11.7M USD** |
| **Net volume** (excl. mints/burns) | 37.3B COPM ≈ **$9.3M USD** |
| **Total issued (mints)** | 5.20B COPM ≈ $1.30M USD |
| **Total redeemed (burns)** | 4.17B COPM ≈ $1.04M USD |
| **Average ticket per transfer** | **~$96 USD** |
| **Daily average** | 191 transfers · $18.4K USD |
| **Peak transactions in one day** | **1,919** (2025-01-19) |
| **Peak volume in one day** | **$737K USD** (2025-07-23) |
| **Peak month (volume)** | July 2025: $2.15M USD |
| **Peak month (transactions)** | January 2025: 18,491 |
| **Current supply** | 1.028B COPM ≈ $257K USD |

> **FX rate:** 1 USD = 4,000 COP, constant. ±5% margin depending on the day. Configurable when reproducing.

Unfamiliar with a term? It's in the [glossary](../GLOSSARY.md).

---

## The story the chain tells

### Same token, different movie: the average ticket here is $96.

On Polygon, the average COPM transfer moves **~$10,300**. On Celo it moves **~$96**. Two orders of magnitude apart.

The reading: Polygon carries the institutional settlement — large amounts, B2B partners. Celo carries small, frequent payments — the profile of remittances, micropayments, and end-user wallets. Both living under the same token is precisely the multi-chain design doing its job: each network serves the use case where it's strongest.

![Daily transfers](../charts/celo/01-daily-transfers.svg)

### On Polygon, takeoff took 17 months. On Celo, 6 weeks.

Deploy on Celo: 2024-09-17. First day above 100 transfers: **2024-10-30**.

The explanation is textbook: by the time COPM reached Celo, the operation, the partners, and the use case had already been proven on Polygon. A second chain doesn't start from zero — it inherits the first one's traction. And January 2025 became its most active month ever: **18,491 transactions**.

### The volume is small; the activity is not.

$11.7M gross over 1.7 years sounds tiny next to Polygon's $2B — and it is. But the surprising number is a different one: **the average daily transaction count is nearly identical across the two chains** (~191/day on Celo vs ~198/day on Polygon). Celo processes a steady flow of small operations: there was activity on 571 of the 634 audited days (90%).

![Monthly volume USD](../charts/celo/04-monthly-volume-usd.svg)

### July 2025: the volume peak.

**$2.15M in one month**, with 2025-07-23 moving **$737K in a single day** — the chain's all-time record. Unlike Polygon (where the volume peak and the transaction peak coincide), on Celo the peaks are decoupled: transactions peaked in January, volume in July. Another sign that the flows here respond to different dynamics.

### The supply reconciles exactly. To the peso.

Replaying the 120,900 events yields a derived supply of **1,028,163,109.63 COPM**. The contract's live `totalSupply()` reports **1,028,163,109.63 COPM**.

**Difference: zero.** Every mint and every burn in the contract's history on Celo is classified and reconciles against the current on-chain state. It's the perfect reconciliation an accountant would call "balanced books" — derived exclusively from public events.

![Circulating supply](../charts/celo/03-supply-over-time.svg)

### Mints and burns: the peg operated bidirectionally here too.

- Total issued: **5.20B COPM**
- Total redeemed: **4.17B COPM** (80% of issuance)
- Difference: 1.03B = exactly the current supply ✓

![Monthly mints vs burns](../charts/celo/06-monthly-mints-burns.svg)

---

## Top 10 days

### By transactions

| Day | Transfers | Gross volume |
| :--- | ---: | ---: |
| **2025-01-19** | **1,919** | $20K |
| 2025-02-03 | 1,461 | $18K |
| 2025-01-20 | 1,408 | $14K |
| 2025-01-27 | 1,301 | $32K |
| 2025-02-02 | 1,249 | $12K |
| 2024-11-26 | 1,221 | $35K |
| 2025-02-04 | 1,218 | $39K |
| 2025-01-23 | 1,106 | $8K |
| 2025-01-29 | 1,065 | $56K |
| 2026-01-07 | 1,044 | $13K |

### By volume

| Day | Gross volume | Transfers |
| :--- | ---: | ---: |
| **2025-07-23** | **$737K** | 192 |
| 2025-07-17 | $258K | 20 |
| 2025-07-24 | $235K | 90 |
| 2024-10-03 | $203K | 8 |
| 2025-07-25 | $194K | 786 |
| 2025-12-19 | $176K | 174 |
| 2024-12-04 | $156K | 229 |
| 2025-07-03 | $152K | 37 |
| 2025-11-13 | $149K | 26 |
| 2025-02-05 | $128K | 279 |

![Top 10 days by gross volume](../charts/celo/05-top10-volume-days.svg)

---

## Validation

The same 12 checks as Polygon, all green:

| # | Check | Result |
| :--- | :--- | :--- |
| 1 | Event count vs scan progress | ✅ 120,900 = 120,900 |
| 2 | Zero duplicates (tx hash + log index) | ✅ 0 duplicates |
| 3 | All events inside the scanned block range | ✅ 0 out of range |
| 4 | Scan completed | ✅ |
| 5 | Every event block has a timestamp | ✅ 77,103 blocks, 0 missing |
| 6 | Timestamps inside the deploy → latest window | ✅ |
| 7 | Daily series has the right length | ✅ 634 days |
| 8 | Daily series is continuous | ✅ 0 gaps |
| 9 | CSV total equals summary total | ✅ |
| 10 | mints − burns equals derived supply | ✅ exact |
| 11 | **Derived supply vs live `totalSupply()`** | ✅ **0.0% deviation — exact reconciliation** |
| 12 | Spot check: 12 transfers re-verified against the chain | ✅ 12/12 (6 via receipt, 6 via fresh logs) |

A note on check 12: Celo migrated from L1 to L2 in March 2025, and current endpoints don't serve individual receipts from the pre-migration era. For those samples, re-verification used a fresh `eth_getLogs` query at the exact block — a second, independent read confirming block, log index, and amount. Full results in [`data/celo/validation.json`](../data/celo/validation.json).

---

## Methodology

Identical to [Polygon's](./polygon.md#methodology) — same pipeline, same scripts, only `CHAIN=celo` changes. One chain-specific detail: the scan covered ~41.6M blocks (Celo produces blocks much faster than Polygon, especially after its L2 migration), using a public RPC with adaptive backoff.

## Limitations

1. **Celo only.** Polygon is audited in [its own audit](./polygon.md); the consolidated view lives in the [unified audit](../AUDIT.md).
2. **Fixed rate of 4,000 COP/USD.** ±5% margin.
3. **Internal addresses not filtered.** Same as Polygon.
4. **L1-era receipts.** Not available on the endpoint used; validation of those samples used fresh `eth_getLogs` (see above). The events themselves are complete — the scan doesn't depend on receipts.
5. **Interpolated timestamps.** Max error on the order of seconds.

## Reproduce this audit

```bash
cp .env.example .env   # the public Celo RPC comes preconfigured
npm install
npm run audit:celo     # discover → scan → timestamps → aggregate → charts → validate
```

With the public RPC: ~25 minutes (the scanner slows itself down whenever the endpoint asks). With a paid RPC: considerably less.
