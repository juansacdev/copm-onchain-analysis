# COPM — On-chain Audit & Analysis (Polygon + Celo)

> Reproducible audit of **COPM**, [Minteo](https://minteo.com/)'s Colombian peso stablecoin, across its two EVM deployments. Every `Transfer` event in both contracts' history, scanned straight from each chain, validated against live on-chain state, and analyzed.
>
> 🇪🇸 [Versión en español](./README.es.md)

| | |
| :--- | :--- |
| 📖 **[The story as a website](https://copm.juansac.dev/en/)** | The storytelling version for every audience — bilingual (ES/EN) Astro site, source in [`site/`](./site) |
| 📊 **[Unified audit (Polygon + Celo)](./docs/AUDIT.md)** | The consolidated, side-by-side view |
| 🟣 **[Polygon audit](./docs/audit/polygon.md)** | <!-- copm:polygon.grossVolumeUsd -->$2.17B<!-- /copm --> moved in <!-- copm:polygon.years -->3.1<!-- /copm --> years |
| 🟢 **[Celo audit](./docs/audit/celo.md)** | <!-- copm:celo.transfers -->132,944<!-- /copm --> transfers at a <!-- copm:celo.avgTicketUsd -->$98<!-- /copm --> average ticket |
| 🔔 **[Contract events](./docs/EVENTS.md)** | Which events matter and what each one tells you |
| 📚 **[Glossary](./docs/GLOSSARY.md)** | Every term, in plain language |

---

## Why this repository exists

I was part of the founding team that built COPM at Minteo. We designed and built the systems, the workflows, and the architecture that moved that money.

And here comes the classic problem: almost none of it can be shown. The code belongs to the company. The dashboards are internal. NDAs exist and are honored.

But there's one giant exception: **the blockchain is public by definition.** Every mint, every burn, every COPM transfer was recorded on Polygon and Celo, verifiable by anyone, forever. It's not the company's internal information, not its codebase, not its IP — it's the public record of what the system did.

So instead of asking you to take my word for it, I audited it: **<!-- copm:combined.transfers -->374,802<!-- /copm --> `Transfer` events, ~<!-- copm:combined.grossVolumeUsd -->$2.18B<!-- /copm --> in volume, two chains, <!-- copm:combined.checksPassed -->34<!-- /copm --> validation checks in the green.** This repository is the evidence, the scripts to reproduce it, and the analysis of what it tells.

## The headlines

| Metric | Value |
| :--- | :--- |
| Total gross volume (both chains) | **~<!-- copm:combined.grossVolumeUsd -->$2.18B<!-- /copm --> USD** |
| Audited `Transfer` events | **<!-- copm:combined.transfers -->374,802<!-- /copm -->** |
| Peak month (Polygon) | **<!-- copm:polygon.peakMonthUsd -->$318.4M<!-- /copm --> USD** (<!-- copm:polygon.peakMonth -->November 2025<!-- /copm -->) |
| Peak volume day (Polygon) | **<!-- copm:polygon.peakVolumeUsd -->$38.6M<!-- /copm --> USD** (<!-- copm:polygon.peakVolumeDay -->2025-11-24<!-- /copm -->) |
| Busiest day (Polygon) | **<!-- copm:polygon.peakTxCount -->2,597<!-- /copm --> transfers** (<!-- copm:polygon.peakTxDay -->2025-11-24<!-- /copm -->) |
| Supply turnover (Polygon, last 30 days) | **~<!-- copm:polygon.turnoverMonthly -->13.7<!-- /copm -->x per month** |
| Supply reconciliation | **Exact on both chains**: minted − burned equals `totalSupply()` to the wei |
| Validation | **<!-- copm:combined.checksPassed -->34<!-- /copm -->/<!-- copm:combined.checksTotal -->34<!-- /copm --> strict checks** — offline, no tolerance, every balance checked against `balanceOf` |

→ The detail, the charts, and the full story live in the **[unified audit](./docs/AUDIT.md)**.

## In the press

In September 2025, **La República** (Colombia's financial newspaper) covered Minteo's milestone of crossing **US$200 million monthly** in COPM transactions on Polygon: [*"Cómo hacer transacciones con stablecoins"*](https://www.larepublica.co/finanzas/como-hacer-transacciones-con-stablecoins-4221338) (in Spanish). This audit confirms that milestone with public data — and shows that two months later the system reached **<!-- copm:polygon.month.2025-11.usd -->$318.4M<!-- /copm -->** in a single month.

## How it works

A Node.js pipeline, deliberately lightweight (a single dependency: [viem](https://viem.sh)), run per chain:

```
discover          → refreshes the token's static metadata (manifest.json)
scan              → verified incremental scan of every contract event (eth_getLogs,
                     parallel workers); resumes from the last checkpoint
holders           → holders snapshot at the checkpoint block, every balance checked
                     against balanceOf (holders.csv, holders.json)
aggregate         → daily series: volume, mints, burns, derived supply, approvals
charts            → self-contained SVGs (no canvas, no headless browser)
charts:combined   → Polygon + Celo charts on shared axes
validate          → strict rules per chain, offline, no tolerance; exit 1 on any failure
reports           → fills every figure of the Markdown reports from the data files
```

Each step is a command of one CLI: `node pipeline/cli.js <command> [--chain polygon|celo] [--fresh]`. `--chain` defaults to the `CHAIN` environment variable, then to `polygon`. The `npm run` scripts below wrap it.

**The only source is an RPC endpoint.** No indexers, no third-party APIs, no block explorers. Works with a paid RPC (faster) or a public one (free; the scanner retries and cross-checks its answers).

### Why the scan can be trusted

Public endpoints sit behind load balancers, and a backend that lacks part of the log index answers `eth_getLogs` with an empty array and no error. A plain scan stores those holes. This one does not advance until the events it holds add up to the contract:

- **Canary and head check in every batch.** A batch is `[eth_blockNumber, one block whose log count is known, ...ranges]`; it is discarded unless the canary returns exactly that count and the head covers the ranges.
- **Empty ranges are confirmed.** A non-empty answer is final; an empty one must be repeated `emptyConfirmations` times (2 on Polygon, 6 on Celo) in independent batches.
- **Exact reconciliation before the checkpoint moves.** Minted − burned must equal `totalSupply()` at the stage's last block, to the wei (a pinned `eth_call` sent on its own). On a mismatch the run fails and writes nothing for that stage.
- **Exact timestamps.** Every transfer carries the timestamp of its block (from the log, or from the block header when the node returns `0x0`), so day buckets are not interpolated.
- **Idempotent and resumable.** Writes are atomic; `data/<chain>/state.json` is written last, and a re-run after a crash drops anything above the checkpoint.

**What these checks do not prove.** The canary is a filter, not a proof: the items of one batch can be answered by different backends. Reconciliation proves the balance ledger, but a dropped range whose mint, payment and burn cancel out would leave supply and balances intact; only the repeated confirmation of empty ranges guards against that. On an endpoint that fails often, raise `emptyConfirmations`.

**Provenance of the Celo history.** On 2026-10-11 the public Celo endpoint (`forno.celo.org`) returned empty answers for 11 % to 75 % of non-empty ranges and almost never passed the deployment-block canary, so a full-history scan could not finish there. The history up to block 79,856,063 was assembled from the union of seven scans plus the earlier dataset, loaded into this format, and then certified by the same checks: supply equal to `totalSupply()` to the wei and every one of <!-- copm:celo.addressesEverSeen -->3,123<!-- /copm --> balances equal to `balanceOf`. Transfers are covered by that proof; the Celo approval counters are a lower bound. Daily runs continue from that checkpoint, where the canary is recent and the endpoint answers well. `scan --fresh --chain celo` against an archive endpoint rebuilds it from the deploy block.

### The holders snapshot

`holders` reads the transfers `scan` stored and the chain at the same block, `state.lastBlock`, never at the live head. It writes nothing unless three things hold, to the wei:

- every address that ever appears in a transfer has a ledger balance equal to `balanceOf` at that block;
- the positive on-chain balances add up to `totalSupply()`;
- no ledger balance is negative.

Pinned `eth_call`s either error or are right, and the items of a batch can be served by different backends, so each item is checked on its own and retried (batches of at most 100 calls, `--max-batch-attempts` per item). An error is never read as zero. The step also reads `paused()`, the ERC-1967 implementation slot, the members of each role, `eth_getCode` of every holder (`contract` or `wallet`) and `isFrozen` for the accounts that appear in `Frozen`, `Thawed` or `BurnedFrozen` events.

It writes `data/<chain>/holders.csv` (one row per address with a positive balance: `rank,address,balance_copm,share_pct,kind,frozen,received_copm,sent_copm,transfers_in,transfers_out,first_seen,last_seen`) and `data/<chain>/holders.json` (block, supply, holder count, concentration of the top 1/5/10/50, balance buckets, role members, pause state, implementation, top 25).

### The figures in these documents

No number in the reports is typed by hand. A figure is written as `<!-- copm:polygon.transfers -->241,858<!-- /copm -->`, invisible when rendered, and `npm run reports` rewrites its content from `data/<chain>/*` (English or Spanish formatting by file name: `*.es.md` is Spanish). `npm run reports:check` writes nothing and exits 1 if any figure is out of date; `audit:all` ends with `reports`. Keys are built in [`pipeline/domain/report.js`](./pipeline/domain/report.js). Numbers that are not derived from the data (years, addresses, block-explorer links) stay plain text.

### Validation

`validate` is strict and offline: it reads only the files written by `scan`, `holders` and `aggregate`, so CI can run it on every push. Among its <!-- copm:polygon.checksTotal -->17<!-- /copm --> rules: minted − burned equals `totalSupply` to the wei, folding the stored transfers reproduces the checkpoint, no negative balance, `holders.csv` adds up to `totalSupply` at the checkpoint block, partitions are strictly ordered and each row sits in its UTC month, nothing lies above the checkpoint, and `daily.csv` is exactly what the transfers produce. Results go to `data/<chain>/validation.json`.

Tuning, all optional: `--workers`, `--max-log-range`, `--ranges-per-batch`, `--empty-confirmations`, `--confirmations`, `--stage-blocks`, `--max-batch-attempts` (or the matching `SCAN_*` variables). Defaults are per chain in `pipeline/config/chains.js`. `scan --fresh` discards the chain's scan output and starts over.

## Reproduce it

```bash
git clone https://github.com/juansacdev/copm-onchain-analysis.git
cd copm-onchain-analysis
cp .env.example .env   # configure your RPCs (the public Celo one is preset)
npm install

npm run audit:polygon  # Polygon only (~10 min from the deploy block on a paid RPC)
npm run audit:celo     # Celo only (seconds from the committed checkpoint)
npm run audit:all      # both + combined charts + report figures
```

The first `scan` walks the whole history from the deploy block; later runs only scan the blocks added since the checkpoint. Requires Node.js 22+; `npm test` runs the unit tests (no network needed).

## Daily automation

Two GitHub Actions workflows keep the data current and checked:

- **`.github/workflows/daily-scan.yml`** runs every day at 09:17 UTC (04:17 in Colombia) and on demand. For each chain it runs `scan`, `holders`, `aggregate` and `validate`, then commits `data/`. The scan only covers the blocks added since the committed checkpoint, so a run takes a couple of minutes. If supply does not reconcile, a balance differs from `balanceOf`, or any validation rule fails, the job fails and commits nothing.
- **`.github/workflows/ci.yml`** runs on every pull request and on pushes to `main` made by people: unit tests, the strict validation of the committed data, and the site build. It needs no RPC endpoint. Pushes made with the repository token do not trigger other workflows, so the daily data commits are not checked by `ci.yml`; the daily job checks them itself before committing, with the unit tests and the strict validation.

Charts and the figures in these documents are regenerated on the first day of each month (or when the workflow is started by hand with `month_close`), so the reports are a coherent monthly cut while the data and the dashboard move daily.

Setup, once:

```bash
gh secret set POLYGON_RPC_URL   # required: the public Polygon endpoints do not serve log history reliably
gh secret set CELO_RPC_URL      # optional: without it the public endpoint is used
```

The workflow pushes to the default branch with the repository token, so that branch must accept pushes from GitHub Actions. On a public repository standard runners are free. GitHub disables scheduled workflows after 60 days without repository activity; the daily commit counts as activity.

## Repository layout

```
├── docs/
│   ├── AUDIT.md / AUDIT.es.md    # unified audit (start here)
│   ├── audit/
│   │   ├── polygon.md / polygon.es.md  # per-chain audits
│   │   └── celo.md / celo.es.md
│   ├── EVENTS.md / EVENTS.es.md        # which contract events matter
│   └── GLOSSARY.md / GLOSSARY.es.md    # glossary
├── pipeline/
│   ├── cli.js                    # entry point: node pipeline/cli.js <command>
│   ├── config/                   # chain table and path helpers (no side effects)
│   ├── domain/                   # pure logic: events, ledger, ranges, integrity, aggregation, validation rules
│   ├── adapters/                 # JSON-RPC client, scan store (atomic file writes)
│   ├── steps/                    # one module per command
│   └── charts/                   # SVG chart library
├── tests/                        # node --test, no extra dependencies
├── data/<chain>/                 # raw + derived data per chain
│   ├── transfers/YYYY-MM.jsonl   # every Transfer event, one file per UTC month
│   ├── admin-events.jsonl        # upgrades, roles, pauses, freezes
│   ├── approvals.json            # Approval counts per day and per spender
│   ├── state.json                # scan checkpoint (written only after reconciliation)
│   ├── holders.csv / holders.json # holders snapshot at the checkpoint block
│   ├── daily.csv                 # aggregated daily series
│   ├── summary.json              # totals, averages, peaks
│   ├── manifest.json             # static contract metadata
│   └── validation.json           # the strict rules' results
├── charts/<chain>/               # 6 SVGs per chain
├── charts/combined/              # 4 comparative SVGs
├── site/                         # storytelling website (Astro, ES + EN)
└── package.json                  # npm scripts wrapping the CLI
```

## Audited contracts

| Chain | Contract |
| :--- | :--- |
| Polygon | [`0x12050c705152931cFEe3DD56c52Fb09Dea816C23`](https://polygonscan.com/token/0x12050c705152931cFEe3DD56c52Fb09Dea816C23) |
| Celo | [`0xC92E8Fc2947E32F2B574CCA9F2F12097A71d5606`](https://celoscan.io/token/0xC92E8Fc2947E32F2B574CCA9F2F12097A71d5606) |

## License

[MIT](./LICENSE) — use it, fork it, audit your own token with it.
