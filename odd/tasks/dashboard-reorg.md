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
- On the public Celo endpoint, failures are all-or-nothing per 5,000-block range and non-empty answers always matched the known count. A canary query in the same batch (a block whose log count is already known) lowers the false-empty rate per range from about 55–75 % to about 11 %, but a batch is not answered atomically by one backend, so a canary is a filter, not a proof. A canary-filtered full scan still returned 114,930 of at least 120,900 transfers.
- A backend with full log history can lack recent state; pinned `eth_call` on its own either errors or is right.
- Celo admin history: 1 `Upgraded`, 6 `RoleGranted`, 1 `Initialized`, 2 `Frozen`, 1 `Thawed`, 1 `BurnedFrozen`.
- Celo holders from `balanceOf` over every address seen in any scan, block 79,856,063: 995 holders, 1.64 COPM of 418,585,134.63 not located yet (dust in addresses that only appear in dropped ranges).
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
| Scan integrity | non-empty range answers are accepted at once; an empty range needs `emptyConfirmations` independent empty answers (per chain); canary + head check filter every batch; exact reconciliation of minted − burned with `totalSupply` before the checkpoint advances, and of every balance with `balanceOf` in validation | orchestrator, from evidence above |

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

- [x] **T0 — Repository hygiene.** Commit the tooling ignore rules and the installed design skill. Route: inline (one mechanical commit). ~5 lines.
- [x] **T1 — Pipeline layout and test harness.** Move the root scripts into `pipeline/` per the target layout with no behavior change, extract pure functions to `domain/`, remove import-time side effects from config, add `npm test`, move long-form docs to `docs/`. Route: delegated writer (9 non-trivial files). ~450 lines.
  - Acceptance: `npm test` green; `node pipeline/cli.js aggregate --chain celo` reproduces the committed `data/celo/daily.csv` byte for byte; README commands updated.
- [x] **T2 — Verified incremental scan.** All-topics scan from the checkpoint to a pinned block, canary and head check per batch, confirmation of empty ranges, 5,000-block ranges configurable per chain, exact timestamps, month-partitioned transfers, admin events, approval counts, checkpoint written only after reconciliation. Route: delegated writer. ~750 lines.
  - Acceptance: tests cover range planning, batch integrity (empty backend, lagging backend, wrong canary), an empty answer followed by a non-empty one for the same range, idempotent re-run, resume after failure, reconciliation failure leaves the checkpoint untouched.
- [x] **T3 — Holders snapshot and strict validation.** `holders.csv` and `holders.json` at the pinned block, every balance checked with `balanceOf`; validation requires supply difference 0 and no negative balance. Route: delegated writer. ~300 lines.
- [x] **T4 — Report figures from data.** Markers in the Markdown reports filled from `summary.json`, so no figure is typed by hand. Route: delegated writer (10 Markdown files plus generator). ~350 lines.
- [x] **T5 — Full rescan and refresh.** Rescan both chains from the deploy block with the new scanner, regenerate daily series, summaries, validation, holders, SVG and report figures. Route: inline run of the CLI plus structural readback (generated output).
  - Acceptance: both chains reconcile to the wei; Polygon contains the 873 previously missing events; Celo contains every event of the old dataset.
- [x] **T6 — Daily workflow.** `.github/workflows/daily-scan.yml`: cron `17 9 * * *` UTC plus manual dispatch, incremental scan, tests, commit data only when it changed, month-close job for SVG and reports. Route: inline (one file) plus README section. ~150 lines.
- [x] **T7 — Landing at `/analisis` and `/en/analysis`.** One page component, two dictionaries, figures read from data. `/` keeps rendering the landing until T9 so the slice lands alone. Route: delegated writer. ~550 lines.
- [x] **T8 — Visual identity "Casa de moneda".** Tokens, typography and base components. Route: delegated writer. ~400 lines.
- [x] **T9 — Dashboard at `/`.** Structure by question, Observable Plot, data loaders tested with `node --test`. Route: delegated writer. ~900 lines.
- [x] **T10 — Deployment note.** Document that the daily commit only publishes if the Cloudflare project is connected to the repository; add `_redirects` only if needed. Route: inline. ~30 lines.

## Delivery

Forecast: about 3,900 authored lines, well above the 400-line budget. Chain strategy `stacked-to-main`.

| Slice | Branch | Tasks | Base |
|---|---|---|---|
| 1 | `refactor/pipeline-layout` | T0, T1 | `main` |
| 2 | `feat/verified-scan` | T2, T3, T5 | slice 1 |
| 3 | `docs/report-figures` | T4 | slice 2 |
| 4 | `ci/daily-scan` | T6 | slice 3 |
| 4b | `fix/verifier-findings` | T11 | slice 4 |
| 5 | `feat/analysis-route` | T7 | slice 4b |
| 6 | `feat/mint-identity` | T8 | slice 5 |
| 6b | `fix/site-copy-format` | T12 | slice 6 |
| 7 | `feat/dashboard` | T9, T10, T13, T14, T15 | slice 6b |

T5 lands in slice 2, right after T3, because T2 changes the on-disk format: the code and the data it reads must merge together. T4 follows on fresh data.

## Checks

- `npm test` at every task close.
- `cd site && npm run build` for T7–T9.
- Receipt-driven review: after each work-unit commit, `gentle-ai review assess --cwd . --agent claude-code --base-ref <last reviewed boundary> --committed-only --json`. First boundary: `main` at `3e59e8e`.

## Progress

| Task | Status | Commit | Checks | Review |
|---|---|---|---|---|
| T0 | done | `af6b973` | structural readback | granted → approved and acknowledged (lineage `review-564fae3ee8ac0900`, 1 non-blocking suggestion on the vendored skill); boundary is now `af6b973` |
| T1 | done | `075c7da` | `npm test`: 47 pass, 0 fail. `aggregate`, `charts`, `charts:combined` for both chains: `git status data/ charts/` clean (byte-for-byte). Unknown command and unknown chain exit 1. No stale references to the old script names. `site` build: 2 pages built. Network steps not run. Writer report never arrived; all checks re-run by the parent. | assessed `high` (`process_boundary` in `tests/cli.test.js`); consent declined by the user; the provider refused its own decline invocation (`invalid_request`: untracked files appeared after the envelope was issued), so no review record exists. Tier `high` without review → independent verifier on a detached worktree at `075c7da`: `verified with findings`, no blocker, no warning (report delivered after the session's first close). |
| T2 | done | `8f3b4f4` | `npm test`: 130 pass, 0 fail. `scan` without RPC URL: clear error, exit 1, no network. `timestamps`: unknown command, exit 1. `aggregate` without partitions: clear error, non-zero, `data/` untouched. Raw amounts never pass through `Number` (hits are block numbers, timestamps, a `uint8`, and display conversions after BigInt division). Live smoke run on Polygon: first 12 stages reconciled to the wei against `totalSupply` at each stage end. Writer report never arrived; checks re-run and `scan.js` read in full by the parent. | see T3: reviewed as one slice candidate with it |
| T3 | done | `a956b58` | `npm test`: 173 pass, 0 fail. Live `holders --chain polygon`: 582 holders of 2,555 addresses at block 95,370,448, reconciled to the wei, 41 s. Live `holders --chain celo`: 998 holders of 3,123 addresses at block 79,861,762, reconciled to the wei, 6 s; one frozen account found. Matches the independent scratch oracle (582 / 998). Writer report never arrived; checks run by the parent. | slice candidate `075c7da..a956b58` (T2 + T3 code, 48 files, 4,804 lines) assessed `high` (`process_boundary`); consent declined by the user (`declined_this_candidate`). Tier `high` without review → independent verifier on the detached worktree at `a956b58`. |
| T4 | done | `e5b8bbe` | `npm test`: 213 pass, 0 fail. `reports --check`: 0 figures out of date, exit 0. Marker counts match between each English file and its Spanish counterpart (README 14, AUDIT 23, audit/polygon 78, audit/celo 61, EVENTS 19). No stale figure left (`317,696`, `196,796`, `120,900`, `2.03B`, `12/12`). `validate` passes on both chains (it rewrites `validation.json` with a new `validatedAt`, nothing else under `data/`). New `docs/EVENTS.md` and `docs/EVENTS.es.md`. Writer report never arrived; checks run by the parent, EVENTS.es.md and README headlines read. | see T6: one candidate with it |
| T5 | done, with one deviation | `bb0c2ee` | Polygon: `scan` from the deploy block, 24 stages, each reconciled to the wei; 241,858 transfers; every row of the independent scratch scan present with identical fields; the 873 previously missing events are there; all timestamps exact. Celo: **deviation** — the public endpoint could not serve a full-history scan (0 of 40 batches passed the deployment canary, HTTP 504s), so history up to block 79,856,063 was bootstrapped from the union of seven scans plus the old dataset through the pipeline's own store and domain modules, then certified by `holders` and `validate`; it is a superset of the old dataset. Incremental `scan --chain celo` from that checkpoint: 5,699 blocks, 6 batches, 0 rejected, 2.4 s. `validate`: all 17 rules pass on both chains. `aggregate`, `charts`, `charts:combined` regenerated. Provenance documented in both READMEs. | not sent to native review: about 700k generated lines; see T6 |
| T6 | done | `b9c8677` | Both workflow files parse as YAML and pass `actionlint`. Every command the daily job runs was executed locally against the real chains in T5 (`scan`, `holders`, `aggregate`, `validate`, `charts`, `charts:combined`, `reports`). Found while rehearsing: `validate` rewrote `validation.json` with the wall-clock time on every run; now it only writes when the result changes (RED observed on the new test, then GREEN). `npm test`: 215 pass. **Not verified**: a real run on GitHub (needs the `POLYGON_RPC_URL` secret and a push, both user decisions). Route: inline. | candidate `bb0c2ee..b9c8677` (T4 + T6, 30 files, 2,266 lines) assessed `high` (`process_boundary`, `shell_source`); consent declined by the user (`declined_this_candidate`). Tier `high` without review → independent verifier on a detached worktree at `b9c8677`. The data commit `bb0c2ee` (about 700k generated lines) was not sent to native review: its proportional check is `validate` (17 exact rules per chain) plus the cross-check against the independent scratch scan. |
| T7 | done | `2390210` | Writer report: RED → GREEN per module (routes, template, format, analysis-data, links, i18n). Parent spot check: `npm test` 259 pass; `site` build produces `/`, `/analisis`, `/en/`, `/en/analysis`; canonical, hreflang (`es`, `en`, `x-default`) and language switch point at the counterpart on all four pages (writer evidence). Copy rewritten where the data contradicted it; two unsupported claims dropped ("USDT/USDC rotate 10–20 times a year", "nobody hoards COPM": the top Polygon holder has 65.6 %). The build fails if the data stops supporting a narrative claim. Not checked: layout of the new navigation at 400 px and 1280 px (T8). | candidate `b9c8677..2390210` (T11 + T7, 51 files, 2,752 lines) assessed `high`; consent declined by the user (`declined_this_candidate`). Independent verifier on the detached worktree at `2390210`. |
| T11 | done | `95da475` on `fix/verifier-findings` | Writer report: RED observed for F1, F2, F3 (header number), F4 (missing bounds), F5, F6, F7; guards for null range answers and the upper window bound already held and only gained tests. Parent spot check: `npm test` 230 pass on the worktree; `reports --check` 0 stale; `discover` against a closed port with a key in the URL prints `URL: <endpoint>`. Deviations accepted: compact figures keep the existing no-trailing-zero convention (`$1M`), Celo take-off is stated from deployment (7 weeks). Not run: the workflow on a real runner. | see T7: one candidate with it |
| T8 | done | `ab9ddb5` | Writer report: RED on the three new test files (site chart palette, guilloché generator, serial formatter), GREEN at 292; a real bug caught on the way (`setTheme` merged palettes). Browser check by the writer at 1280 px and 400 px on `/analisis` and `/en/analysis`: no horizontal page scroll, charts and table scroll inside their containers, four layout defects fixed. Parent spot check: `npm test` 292 pass; `site` build 4 pages; existing dark and light SVG unchanged (`git status charts/` shows only the new `site/` variants); screenshot of `/analisis` at 1280 px read (header, guilloché band, serial, hero, stat tiles). Not checked: screen reader, keyboard tab-through, Lighthouse. | candidate `2390210..ab9ddb5` (42 files, 1,640 lines) assessed `medium` (`slice_budget_reached`); consent declined by the user (`declined_this_candidate`). Tier `medium` without review → writer self-verification (done: tests, build, browser at two widths) plus the parent spot check. |
| T12 | done | `6c964eb` | Writer report: RED observed for G1, G2, G3, G4, G5, G6, G7; G8 logic already held and only gained tests. Parent spot check: `npm test` 316 pass; `reports --check` 0 stale (yearly turnover figure moved from 164 to 166 through G5); `site` build 4 pages; canonicals end in `/`. | see T9: one candidate with it |
| T9 | done | `b95cf96` | Writer report: RED → GREEN for the domain, step, validation rule, view, insights, data, format, links and i18n modules; the filter module was written with its tests in one step (no separate RED). `dashboard` is deterministic (same md5 on a second run); `validate` passes 18 of 18 rules per chain including the new `dashboard-matches-ledger`; `reports` moved 44 figures, all rule counts 17 → 18. Browser check by the writer at 1280 px and 400 px on `/` and `/en/`, seven defects fixed. Parent check: `npm test` 397 pass; `validate` unchanged on both chains; `reports --check` 0 stale; `site` build 4 pages; screenshots of `/` at 1280 px and 400 px and of `/en/` read. Three defects found and fixed by the parent: overlapping axis labels and a clipped value label in the flow chart, and a period turnover sentence that printed ratios such as 449.7× when the period had almost no mint (RED on the new `periodTurnover` test, then GREEN). Known limits: Plot tooltips are not keyboard reachable (the table toggle is the keyboard path); the transfer-size chart covers the whole history only; the calendar opens on the latest weeks so its weekday labels scroll out of view; the dashboard loads about 304 KB of JavaScript (103 KB gzipped). Not run: the daily workflow with the new step on a real runner. | candidate `ab9ddb5..ad6b599` (T12 + T9 + T10, 70 files, 5,410 lines) assessed `high`; consent declined by the user (`declined_this_candidate`). Independent verifier on a detached worktree at `ad6b599`: `verified with findings`, every figure recomputed from the raw transfers matches. |
| T13 | done | `791f76b` | Writer report: RED observed for H3, H4, H5 and the H6 helpers; H1 and H2 shown in the built HTML. Parent check: `npm test` 407 pass; `validate` passes 18 rules on both chains with files unchanged on a second run; `reports --check` 0 stale; `site` build clean; the rate note is in `site/dist/index.html` outside the form; screenshot of `/` at 1280 px read (notes, tiles, sentences). Not checked by the parent: the English page after this round, and the page at 400 px after this round (the writer checked the Spanish page at both widths). | covered by the T9 candidate decision; no further assessment requested |
| T14 | done | `4a7ff36`, data `1c0d185` | Writer report: RED observed for K1 and K2; K3 rule and tests written together (no separate RED); K4 mutations each made the new test fail and were restored. Parent check: `npm test` 421 pass; then the whole daily sequence run against the real chains with the final code: `scan` (Polygon 8,020 blocks, 18 transfers; Celo 10,611 blocks, none; 0 rejections; both reconciled to the wei), `holders` (582 and 998, reconciled to the wei), `aggregate`, `dashboard`, `validate` (19 of 19 on both chains), `charts`, `reports` (100 figures moved with the new data), `reports --check` 0 stale, `site` build clean. Not re-verified by a third party. | assessed at close |
| T15 | done | `fix: …` on `feat/dashboard` | Writer report: RED observed for L1 (3 of 6 new tests), L2 and the L3 call-order test; the other L3 tests already held. Parent check: `npm test` 432 pass; `reports --check` 0 stale; `validate` 19 of 19 on both chains (writer evidence), with the ledger supply and `totalSupply` equal to the wei in the rule detail. | assessed at close |
| T10 | done | `ad6b599` | Both READMEs state the build settings and the two conditions for the daily commit to publish. `reports --check` 0 stale after the edit. No `_redirects` file added: whether the host redirects `/analisis` to `/analisis/` could not be checked from here. Route: inline. | passive documentation |

## Independent verification (review declined, tier high)

Four verifiers worked on detached worktrees, offline, and each returned `verified with findings`, no blocker. Their accepted findings became T11, T12 and T13.

**Scanner and holders, `075c7da..a956b58`.** No path found where an event is lost or duplicated silently, or where the checkpoint advances without supply reconciling; work queue, write order, crash recovery, approvals replay and BigInt handling traced and sound; 28 mutations, 21 killed by the tests. Findings: `discover` can print the RPC URL through viem error messages (WARNING, reproduced); `eth_getCode` `"0x"` accepted at once, so a contract can be labelled `wallet` (WARNING, labels only); three scan and validation guards with no test that fails when they are removed (WARNING); header answers not checked against the requested block number, timestamp window rule vacuous when a bound is missing (SUGGESTION); no validation of `approvals.json`, per-address holders not re-checked against the ledger in `validate`, `removed: true` logs not filtered, up-to-date early return does not trim (SUGGESTION, not accepted now: each is caught downstream by reconciliation or `holders`).

**Reports and workflows, `bb0c2ee..b9c8677`.** 40+ figures recomputed from the data files, all matching; English and Spanish marker sets identical; workflow logic read as a runner would run it and found correct (`bash -e` stops on a failing `validate`, no secret echoed, missing `POLYGON_RPC_URL` fails clearly). Findings: `git push` without rebase or retry (WARNING); pushes made with the repository token do not trigger `ci.yml`, so the README claim is inaccurate (WARNING); compact formatting wrong at unit boundaries, `$1,000K` (WARNING, reproduced, no current figure affected); malformed markers skipped silently (WARNING, reproduced); two imprecise durations in prose (WARNING); `validate` logs "written" when it left the file alone (SUGGESTION); month labels such as "(peak)" in the Polygon monthly table are typed prose (SUGGESTION, not accepted now).

**Pipeline layout, `075c7da`.** Report delivered late (named agents only hand back between turns): `verified with findings`, all SUGGESTION. Old scripts and new steps compared by reading: logic, ordering, rounding, defaults, key order, file names and log text match; 15 modules imported with an empty environment without side effects; 100 relative links checked, none broken. Findings: a URL-leak test aimed at the wrong chain (fixed in T14); a missing RPC URL surfaced as a stack trace (already fixed in T2); `--chain` validated for `charts:combined`, which ignores it; npm scripts for offline steps still need a `.env` file (pre-existing).

**Scanner and holders, first verifier (late report, partly truncated).** Beyond the findings of the second one: duplicate or out-of-range logs in a range answer were trusted, leaving supply exact with inflated counters and approvals counted twice (WARNING, reproduced); `holders` folded rows above the checkpoint (WARNING, reproduced); the crash-recovery test passed with the checkpoint filter, the admin trim or the approvals replay guard removed (WARNING, mutation-tested). These became T14.

**Fixes and analysis route, `b9c8677..2390210`.** The fixes close what they claim (URL scrubbing reproduced with a closed port, push loop simulated under `bash -e` with a shallow clone, `"0x"` confirmation bounded). 40+ page figures recomputed, all matching; Spanish and English agree; scale words correct. Findings: the site kept its own money formatter without the boundary fix (WARNING, reproduced); the page calls transfer events "transactions" (WARNING: 2,597 transfers on 24 Nov 2025 are 1,956 transactions); "read every event" overstates the Celo approval counter, which is a lower bound (WARNING); URL scrubbing removes ordinary path words such as `rpc` or `polygon` from messages (WARNING, reproduced); wrong Spanish plural at exactly one unit, no trillion tier (WARNING); canonical URLs without the trailing slash the build produces, and `/` duplicating `/analisis` until T9 (WARNING); yearly turnover annualised with × 12 (SUGGESTION); the push loop wastes its last attempt (SUGGESTION). Not accepted now: causal sentences in the user's own narrative ("inherits the partners", "each new partner is a step") and the press paraphrase, which the data can neither support nor refute; they are reported to the user.

### T11 — Fixes from verification

- [x] **T11.** F1 URL scrubbing at the CLI boundary, F2 `"0x"` code confirmation, F3 scan guards and header block check, F4 timestamp window rule, F5 `validate` log and wording, F6 compact formatting, F7 strict marker grammar, F8 push with rebase and retry, F9 README accuracy about CI, F10 durations. Route: delegated writer on worktree branch `fix/verifier-findings` at `b9c8677` (slice 4b); `feat/analysis-route` is rebased onto it afterwards.

**Dashboard, `ab9ddb5..ad6b599`.** Recomputed from the raw transfers and matching `dashboard.json` and the built pages: minted, burned, wallet-to-wallet and gross volume, turnover (Polygon 6.92, Celo 9.87), mint recipients and burners with the top share, supply peaks and dates, the 30-day windows, every size bin, the 25 largest transfers per window, holders, concentration, frozen accounts, roles and implementation changes. Hash decoding of garbage falls back to defaults, the payload cannot break out of its script block, the client writes with `textContent` only, external links carry `rel="noopener noreferrer"`, all 24 filter combinations render with no console error. Findings: the fixed USD rate was only stated inside a form hidden without JavaScript (WARNING); the no-JavaScript note promised tables that were not rendered (WARNING); partial first and last bars looked like drops (WARNING); `dashboard-matches-ledger` checked five totals only (WARNING); bin labels such as `1B` read as 10^12 in Spanish (WARNING); "circulating supply", "today" and "person" wording, raw wei in the `BurnedFrozen` row, and the "all" tiles differing from all-time totals (SUGGESTION). Not accepted now: `viewWindow` taking the latest end day across chains when two scans straddle UTC midnight (inferred, not reproduced), and the byte count in the step log.

### T12 — Second round of fixes

- [x] **T12.** G1 one shared formatter with correct boundaries, Spanish singular and a trillion tier; G2 "transfers" where the figure is a transfer count; G3 accurate statement about approvals; G4 scrub only credential-like path segments; G5 yearly turnover; G6 trailing slashes on every route; G7 push loop; G8 complete-month tests. Route: delegated writer on `fix/site-copy-format` (slice 6b, stacked on `feat/mint-identity`).

### T13 — Dashboard fixes

- [x] **T13.** H1 rate and last-complete-day notes rendered outside the hidden form; H2 size and top-holder tables server-rendered, no-JavaScript note reworded; H3 partial bars labelled by the first day they cover, drawn lighter and explained; H4 `dashboard-matches-ledger` rebuilds the dashboard and requires the stored file to be identical; H5 range labels per locale; H6 wording (total supply, checkpoint date, addresses with a balance and how many are contracts, what the filters govern, `BurnedFrozen` amount in COPM); H7 tile captions for the "all" period. Route: delegated writer on `feat/dashboard`. This is the single correction round for this candidate; it was not re-verified by a third party.

### T14 — Duplicate and out-of-range logs

- [x] **T14.** K1 a range answer is rejected when a log is outside the asked range, flagged removed, or collides with a different log under the same block and log index; exact repeats dropped; counters, approval tallies and the next canary computed from the de-duplicated set (documented as R7). K2 `holders`, `aggregate` and `dashboard` read transfers through a store helper limited to the checkpoint. K3 new rule `approvals-consistent` (19 rules per chain). K4 a scan-level crash test that fails under each of the three mutations, and the URL test aimed at the right chain. Route: delegated writer on `feat/dashboard`.

### T15 — Hardening from the late report

- [x] **T15.** L1 the scan parses `totalSupply()` with the strict 32-byte parser and retries anything else; L2 `daily-matches-ledger` compares supply as BigInt instead of a 6-decimal float; L3 atomic writes flush the temp file before the rename and the directory after it. Requested by the user on 2026-10-11 ("fixea esto"). Route: delegated writer on `feat/dashboard`.

## Next step

Delivery is the user's decision: push the seven stacked branches and open the pull requests in order. Open point for the user: a Celo archive endpoint, to replace the bootstrap with `scan --fresh --chain celo`.
