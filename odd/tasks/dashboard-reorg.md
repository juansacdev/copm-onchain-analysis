# dashboard-reorg

Feature document for the COPM on-chain analysis reorganization. Engram mirror: `odd/dashboard-reorg/tasks` (project `copm-onchain-analysis`).

## Objective

Turn the one-shot audit into a verified, self-updating data product: a daily scan of every COPM contract event on Polygon and Celo, a dashboard at `/` fed by that data, and the current long-form landing moved to `/analisis`.

## Problem

- The committed Polygon dataset is wrong. `data/polygon/transfers.jsonl` lacks 873 `Transfer` events in blocks 75,760,096–75,775,976 (53.9B COPM). Derived supply was 20.7 % above `totalSupply`; `07-validate.js` tolerated 25 %, so the hole passed.
- The public Celo endpoint answers `eth_getLogs` with empty arrays and no error on most requests. A plain scan of the full history returned 44,332 transfers where at least 120,900 exist.
- There is no incremental scan. `npm run audit` always rescans from the deploy block.
- Block timestamps are interpolated from ~600 samples, so day buckets are approximate.
- Every figure in 10 Markdown files and 2 site pages is hand-typed.
- Seven numbered scripts at the repository root, no tests, no CI.

## Why

The site is public and claims to be a reproducible audit. A dataset that silently loses events undermines the whole project, and a daily job would only repeat the loss faster. Verification has to be built into the scan, not bolted on afterwards.

## Evidence gathered before implementation (2026-10-11)

- COPM is an ERC-1967 UUPS proxy on both chains. Implementations verified on Sourcify: Polygon `Token` (`0xc7b9e68e…ad1f`) then `TokenV1` (`0x056d93f1…36be`, upgraded at block 48,408,019); Celo `TokenV1` (`0xbb0cf77c…b1c7`).
- `TokenV1` is OpenZeppelin `ERC20Upgradeable` + Burnable + Pausable + AccessControlEnumerable + Permit + UUPS + `Freezable` + Multicall. Every balance change goes through `_mint`, `_burn` or `_transfer`, so `Transfer` is the complete balance ledger.
- Events in the ABI: `Transfer`, `Approval`, `BurnedFrozen`, `Frozen`, `Thawed`, `Paused`, `Unpaused`, `RoleGranted`, `RoleRevoked`, `RoleAdminChanged`, `Upgraded`, `Initialized`, `AdminChanged`, `BeaconUpgraded`, `EIP712DomainChanged`.
- Polygon all-topics scan, deploy block 47,747,145 to 95,366,956: 241,857 `Transfer`, 122,239 `Approval`, 7 `RoleGranted`, 1 `RoleRevoked`, 2 `Upgraded`, 1 `Initialized`. Minted − burned equals `totalSupply` to the wei (4,482,379,062.75 COPM). 2,555 addresses, 582 holders, every balance equal to `balanceOf`.
- A JSON-RPC batch is answered by a single backend. A canary query in the same batch (a block whose log count is already known) plus `eth_blockNumber` identifies backends that lack history or lag behind.
- `eth_getLogs` results carry `blockTimestamp`; old Polygon blocks return `0x0`, so headers must be fetched for those.

## Scope

In: pipeline restructure, verified incremental scan, holders snapshot, strict validation, full data refresh with regenerated charts and report figures, daily GitHub Actions workflow, landing moved to `/analisis` and `/en/analysis`, new visual identity, dashboard at `/`.

Out: changing hosting (Cloudflare stays; only documented), price feeds other than the fixed `COP_PER_USD`, labelling third-party wallets by name, push / pull request / merge (user decisions).

## Constraints

- Never print or commit RPC URLs. Scripts read `POLYGON_RPC_URL` and `CELO_RPC_URL` from the environment.
- Committed data files stay below 50 MB each.
- Technical artifacts in English; Spanish site copy in neutral Spanish.
- Conventional Commits, no AI attribution.
- Site typography and layout follow `.claude/skills/landing-page-design/SKILL.md` Part B.

## Decisions

| Decision | Choice | Source |
|---|---|---|
| Look and feel | A "Casa de moneda" (Manrope, `#131209`, guilloché ornament) | user, 2026-10-11 |
| Dashboard structure | "Por pregunta" | user |
| English route | `/en/analysis` | user |
| Cadence | data, checkpoint and dashboard daily; SVG and report figures at month close | user |
| Code organization | V2 ports and adapters, light | user |
| Dashboard charts | Observable Plot; `chartlib.js` stays for documentation SVG | user |
| TDD | strict; runner `node --test` (`npm test`) | global config + accepted proposal |
| Delivery strategy | `ask-on-risk` → chain strategy `stacked-to-main` | user, 2026-10-11 |
| Log storage | scan all topics; persist transfers (month partitions, exact timestamp per row), admin events (one file), approvals as daily counts only | orchestrator, from evidence above |
| Scan integrity | canary + head check inside every batch; exact reconciliation with `totalSupply` and `balanceOf` before the checkpoint advances | orchestrator, from evidence above |

## Target layout

```
pipeline/
  cli.js                 # copm <command> --chain <polygon|celo>
  config/chains.js       # chain table; no side effects at import
  domain/                # pure: events, ledger, ranges, integrity, aggregate, holders, reconcile, units
  adapters/              # rpc (fetch JSON-RPC batches), store (jsonl partitions, csv, json)
  steps/                 # scan, aggregate, holders, validate, charts, combined-charts, reports
  charts/chartlib.js
tests/                   # node --test, no dependencies
data/<chain>/transfers/YYYY-MM.jsonl   # {b, ts, t, i, f, r, v}
data/<chain>/admin-events.jsonl
data/<chain>/state.json                # checkpoint
data/<chain>/holders.csv  holders.json  daily.csv  summary.json  validation.json
docs/                    # AUDIT, GLOSSARY, audit/
site/src/features/{dashboard,analysis}/  site/src/i18n/{es,en}.js
.github/workflows/daily-scan.yml
```

## Tasks

Route and trigger evidence are recorded per task. Lines are forecast authored additions plus deletions, generated files and pure renames excluded.

- [ ] **T0 — Repository hygiene.** Commit the tooling ignore rules and the installed design skill. Route: inline (one mechanical commit). ~5 lines.
- [ ] **T1 — Pipeline layout and test harness.** Move the root scripts into `pipeline/` per the target layout with no behavior change, extract pure functions to `domain/`, remove import-time side effects from config, add `npm test`, move long-form docs to `docs/`. Route: delegated writer (9 non-trivial files). ~450 lines.
  - Acceptance: `npm test` green; `node pipeline/cli.js aggregate --chain celo` reproduces the committed `data/celo/daily.csv` byte for byte; README commands updated.
- [ ] **T2 — Verified incremental scan.** All-topics scan from the checkpoint to a pinned block, canary and head check per batch, 5,000-block ranges configurable per chain, exact timestamps, month-partitioned transfers, admin events, approval counts, checkpoint written only after reconciliation. Route: delegated writer. ~750 lines.
  - Acceptance: tests cover range planning, batch integrity (empty backend, lagging backend, wrong canary), idempotent re-run, resume after failure, reconciliation failure leaves the checkpoint untouched.
- [ ] **T3 — Holders snapshot and strict validation.** `holders.csv` and `holders.json` at the pinned block, every balance checked with `balanceOf`; validation requires supply difference 0 and no negative balance. Route: delegated writer. ~300 lines.
- [ ] **T4 — Report figures from data.** Markers in the Markdown reports filled from `summary.json`, so no figure is typed by hand. Route: delegated writer (10 Markdown files plus generator). ~350 lines.
- [ ] **T5 — Full rescan and refresh.** Rescan both chains from the deploy block with the new scanner, regenerate daily series, summaries, validation, holders, SVG and report figures. Route: inline run of the CLI plus structural readback (generated output).
  - Acceptance: both chains reconcile to the wei; Polygon contains the 873 previously missing events; Celo contains every event of the old dataset.
- [ ] **T6 — Daily workflow.** `.github/workflows/daily-scan.yml`: cron `17 9 * * *` UTC plus manual dispatch, incremental scan, tests, commit data only when it changed, month-close job for SVG and reports. Route: inline (one file) plus README section. ~150 lines.
- [ ] **T7 — Landing at `/analisis` and `/en/analysis`.** One page component, two dictionaries, figures read from data. `/` keeps rendering the landing until T9 so the slice lands alone. Route: delegated writer. ~550 lines.
- [ ] **T8 — Visual identity "Casa de moneda".** Tokens, typography and base components. Route: delegated writer. ~400 lines.
- [ ] **T9 — Dashboard at `/`.** Structure by question, Observable Plot, data loaders tested with `node --test`. Route: delegated writer. ~900 lines.
- [ ] **T10 — Deployment note.** Document that the daily commit only publishes if the Cloudflare project is connected to the repository; add `_redirects` only if needed. Route: inline. ~30 lines.

## Delivery

Forecast: about 3,900 authored lines, well above the 400-line budget. Chain strategy `stacked-to-main`.

| Slice | Branch | Tasks | Base |
|---|---|---|---|
| 1 | `refactor/pipeline-layout` | T0, T1 | `main` |
| 2 | `feat/verified-scan` | T2, T3 | slice 1 |
| 3 | `feat/data-refresh` | T4, T5 | slice 2 |
| 4 | `ci/daily-scan` | T6 | slice 3 |
| 5 | `feat/analysis-route` | T7 | slice 4 |
| 6 | `feat/mint-identity` | T8 | slice 5 |
| 7 | `feat/dashboard` | T9, T10 | slice 6 |

## Checks

- `npm test` at every task close.
- `cd site && npm run build` for T7–T9.
- Receipt-driven review: after each work-unit commit, `gentle-ai review assess --cwd . --agent claude-code --base-ref <last reviewed boundary> --committed-only --json`. First boundary: `main` at `3e59e8e`.

## Progress

| Task | Status | Commit | Checks | Review |
|---|---|---|---|---|
| T0 | pending | | | |
| T1 | pending | | | |
| T2 | pending | | | |
| T3 | pending | | | |
| T4 | pending | | | |
| T5 | pending | | | |
| T6 | pending | | | |
| T7 | pending | | | |
| T8 | pending | | | |
| T9 | pending | | | |
| T10 | pending | | | |

## Next step

T0, then T1 on `refactor/pipeline-layout`.
