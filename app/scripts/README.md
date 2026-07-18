# `app/scripts/` — what each harness is for

Most of these have **no `package.json` alias** (24 of 49 as of 2026-07-18), which made them
orphaned-by-appearance: real, load-bearing tools that look like dead files until someone greps for them.
`knip` also ignores `scripts/**`, so nothing flags them either way. This index is the fix — the aliased
ones are listed for completeness, the rest are grouped by what they're actually for.

Almost every script that reads card data needs a real data tree:

```bash
MTG_APP_ROOT=C:/Projects/mtg-tool/app node scripts/<script>.mjs
```

A worktree has no synced oracle index of its own — point `MTG_APP_ROOT` at the main tree (or an install's
AppData) or the script will see an empty corpus and report zeros. `check-data-world.mjs` exists precisely
to answer "am I looking at the filesystem I think I am?".

---

## Acceptance gates (run these before pushing engine changes)

| Script | What it proves |
|---|---|
| `program-fingerprint.mjs` | **The seam gate.** Canonical fingerprint of the FULL parser output for every real card. Diff before/after a refactor — an empty diff proves byte-identical behavior across ~34k cards. This is what gated all six parser-decomposition slices. |
| `tier-fingerprint.mjs` | **The flip-diff.** `classifyCard` tier per card — the GAINED/LOST ledger for any coverage slice. |
| `runtime-fingerprint.mjs` | Resolver-output guard. Catches changes the tier and program diffs both miss (same tier, same program, different resolution). |
| `seat-fairness-gate.mjs` | Seat fairness tripwire — a mirrored pod (identical deck in all four seats) must stay fair. |
| `replay-canary.mjs` | Per-epoch determinism tripwire: samples stored games and replays them. The 100GB prune-and-regenerate lifecycle assumes determinism; this is what verifies it. |
| `allowlist-guard.mjs` | Tamper guard on the self-certifying keyword allowlist (adding to `COVERED_KEYWORDS` credits coverage — this stops that being silent). |

## QA / false-positive hunting

| Script | What it does |
|---|---|
| `qa-sweep.mjs` | Adversarial FP hunter — runs the REAL classifier over the whole corpus looking for over-claims. |
| `play-quality-probe.mjs` | Seeded A/B play-quality probe for the opponent AI over real profile decks. |
| `repro-grind-game.mjs` | Re-runs ONE recorded grind game from its header — the stuck-triage workflow. |
| `replay-probe.mjs` | Replays one recorded game to decision N and dumps the fork (missed-lethal / suicide-attack blunder probes). |

## Coverage census + targeting

| Script | What it does |
|---|---|
| `clause-frontier.mjs` | The coverage-frontier census — picks the next wave with data instead of guessing. |
| `build-slice-manifest.mjs` | The slice manifest: per ladder subsystem, the exact card list + most-played weighting + transitive yield. |
| `build-triage-ledgers.mjs` | Per shelf deck, one row per non-native card with everything a disposition needs. |
| `play-ranked-backlog.mjs` | Every card sorted by real Commander play (EDHREC rank) — the play-impact build priority. |
| `build-grind-card-evidence.mjs` | Cast × outcome attribution table; the grind-side feed for blend re-ranking. |

## Self-play / grind

| Script | What it does |
|---|---|
| `self-play.mjs` | Headless self-play stress runner (no UI, no server). |
| `grind-pool.mjs` | The parallel walk-away grind — spawns N worker lanes. **Start here**, not at the worker. |
| `grind-worker.mjs` | ONE lane, spawned by `grind-pool`. Not for direct use. |
| `swap-bench.mjs` | Paired-seed pilot A/B bench (the axis-2 primary instrument). |

## Environment / data

| Script | What it does |
|---|---|
| `check-data-world.mjs` | **Run this first when numbers look wrong.** Confirms you're seeing the same filesystem the running app sees — the MSIX ghost-registry hazard makes this non-obvious. |
| `sync-cardkingdom-prices.cjs` | Fetches Card Kingdom's bulk pricelist → slim scryfallId → price index. |

## Already aliased in `package.json`

The build/sync pipeline (`sync-scryfall-bulk`, `build-oracle-index`, `build-rules-index`,
`sync-spellbook`, `sync-edhrec-salt`, the Tauri packaging scripts, `measure-coverage`, …) is reachable via
`npm run <name>` — see `package.json` for the current list. The `*.test.js` files in this directory are
ordinary vitest tests and run with the suite.
