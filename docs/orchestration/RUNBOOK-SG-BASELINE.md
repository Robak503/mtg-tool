# RUNBOOK — Squirrel Girl baseline + A/B (operator steps)

Companion to [SQUIRREL-GIRL-BASELINE-PROGRAM.md](SQUIRREL-GIRL-BASELINE-PROGRAM.md) (the WHY and the gates). This file
is the HOW: exact commands, what each step writes, what to check before moving on. Everything runs from
`C:\Projects\omnath-vault\omnath-tools\pilots\` with the engine resolved from the main checkout (`_env.mjs`) and the shelf
read from the installed AppData root. Nothing here touches master.

## 0. Preconditions (every session)

```bash
cd /c/Projects/omnath-vault/omnath-tools/pilots
node test-all.mjs                      # the pilots gate — must print "ALL PILOT TESTS GREEN"
node selftest.mjs >/dev/null && node anchor-pod-selftest.mjs | tail -1
```

- Engine tree = `C:\Projects\mtg-tool` (main checkout). A worktree without the oracle snapshot will NOT do — the census
  and the runner need `app/data/scryfall.oracle.local.json`. Override with `MTG_PILOT_APP_ROOT` only on purpose.
- Shelf = `C:\Users\colto\AppData\Roaming\com.colton.mtg-tool` (the REAL profiles; `MTG_APP_ROOT` overrides). Read
  `data\profiles.json` first if a deck fails to resolve — ids are per machine.
- **Do not run a gate suite concurrently with a run** (one gate at a time; TaskStop orphans node on Windows).
- Runs land in `pilots/runs/<tag>/` — git-ignored (multi-MB trajectories). Copy REPORT/FORENSICS/LEARNING into the
  program doc or a review folder when they matter.

## 1. P0 → P1: is the pool ready?

```bash
node deck-hollow-census.mjs "Killer Turts" "Kinnan Mana Overload" "Believe it!"
```
Gate: all three ≥ 85. Then the full table:
```bash
node deck-hollow-census.mjs "The Unbeatable Squirrel Girl" "Killer Turts" "Kinnan Mana Overload" "Believe it!" \
  "Omnath, Locus of Mana" "Vihaan, Goldwaker" "Veyran Cantrips" "cdh" "Did you say Dragons?" "Kellan of the west" \
  "Wolverine, claws out!" --out runs/census-$(date +%F)
```
Check `orders/arbiter-nuance-queue.md` carries the "Pod-sim three" batch. Read each of the three decks' non-native list
and write it into the program doc §9 as EXPECTED hollow cards.

Dry run (resolves names, prints the schedule head + census, runs zero games):
```bash
node anchor-pod.mjs --anchor "The Unbeatable Squirrel Girl" \
  --pool "Killer Turts,Kinnan Mana Overload,Believe it!,Omnath, Locus of Mana,Vihaan, Goldwaker,Veyran Cantrips,cdh,Did you say Dragons?,Kellan of the west,Wolverine, claws out!" \
  --games 400 --seed 1 --tag sg-baseline-v0 --dry
```
A name with a comma works (the parser retries joins); an ambiguous or missing name errors with the shelf listed.

## 2. P2: the baseline

```bash
node anchor-pod.mjs --anchor "The Unbeatable Squirrel Girl" \
  --pool "<the ten>" --games 400 --seed 1 --tag sg-baseline-v0 --hints on --arbiter off
```
- ~10–20 min. Progress prints one line per game with the running win rate. Interrupted? `--resume` (same args).
- Overnight cap: `--max-elapsed-min 90` stops cleanly; resume later.
- Outputs in `runs/sg-baseline-v0/`: `manifest.json` · `games.jsonl` · `trajectories.all.jsonl` · `trajectories.golden.jsonl`
  · `census.json` · `summary.json` · `REPORT.md`.

Then forensics:
```bash
node anchor-forensics.mjs runs/sg-baseline-v0      # → FORENSICS.md + forensics.json
```

**Read before anything else:** REPORT §5 (golden share, rejection reasons, the hollow list) and §4 (engine halts). A halt
= a seed for Cindy; a golden share under ~85% = the pool is not ready, stop and say so. Only then the headline.

## 3. P3: the learning pass (writes `runs/<tag>/LEARNING.md` by hand — over-capture)

```bash
node lab.mjs ingest runs/sg-baseline-v0/trajectories.golden.jsonl      # GOLDEN only → the ONE case store
node lab.mjs distill                                                    # invariants vs mode-conditional
node export-training.mjs --store runs/sg-baseline-v0 --out training-sg-v0   # (grind-store shape; see note)
node train-eval-net.mjs --data training-sg-v0 --out eval-net-v1.json
```
Note: `export-training.mjs` reads the exe grind-store shard shape. If it does not accept a run directory, the run's
`trajectories.golden.jsonl` rows carry the same `features` vector + finish-rank labels via `games.jsonl`
(`anchorRank`, `seats`) — a small adapter is the next tool to write, not a reason to skip the step. Record in LEARNING.md:
ingest counts · invariants verbatim · mode-conditional count · net holdout MSE / Pearson r / calibration table ·
the recall snapshot size.

Persona pack v5: rebuild the recall snapshot from the store, drop `eval-net-v1.json` into the pack as the eval-net
weights, bump `pilotPackV` in `exe-persona.mjs`, run `node test-all.mjs` again.

## 4. P4: persona A/B (same schedule, pack v5 with recall + eval-net ON)

```bash
node anchor-pod.mjs --anchor "The Unbeatable Squirrel Girl" --pool "<the ten>" --games 400 --seed 1 \
  --tag sg-persona-v5 --hints on --recall on --eval-net on
node ab-compare.mjs runs/sg-baseline-v0 runs/sg-persona-v5 --label-a "pack v4" --label-b "pack v5"
```
The AB report states the delta, the minimal detectable delta, the paired disagreement table and the exact sign test.
One line of verdict goes into the program doc §0. If the engine version changed between runs, the report says so — rerun
v0 on the new engine before believing anything.

## 5. P5: deck A/B

1. In the app, duplicate the baseline deck and make ONE change (real disk: through the app, never a session-side edit of
   `decks.local.json`). Name it clearly (e.g. `SG v1 — cut X for Y`).
2. Run the variant on the same schedule with the WINNING persona pack frozen:
   ```bash
   node anchor-pod.mjs --anchor "SG v1 — cut X for Y" --pool "<the ten>" --games 400 --seed 1 --tag sg-v1-cut-x [same flags as the reference]
   node ab-compare.mjs runs/<reference> runs/sg-v1-cut-x --label-a baseline --label-b "cut X for Y"
   ```
3. Read: MDD → sign test → per-opponent deltas → `anchor-forensics` on both and diff the tempo table.
4. Present the options to Colton with the numbers; he decides the list.

## 6. The review packet (P6)

`runs/<tag>/` → copy `REPORT.md`, `FORENSICS.md`, `LEARNING.md`, `CENSUS.md`, every `AB-vs-*.md` into
`docs/orchestration/sg-baseline/<date>/` (or wherever Colton wants to read), plus one page of Omnath's reading: what the
numbers say, what they cannot say (the three axes), the next cut.

## 7. Reading the numbers honestly

- A rate without its interval is not a number. At N=400 decisive the interval is about ±4 points around 25%.
- Rejected games are in the REPORT but NOT in the learning feed. Never "top up" golden with rejected games.
- Per-opponent rows with `faced < 60` are indicative only.
- Seat skew: if her win rate by seat spreads more than the intervals allow, that is an engine positional property
  (the grind's own summary tracks the same thing), not a deck property.
- The commander tempo table has two different failures: never offered (engine legality — Cindy) vs offered-not-cast
  (persona priority — Omnath). Do not fix the wrong one.

## 8. Known gaps in the machine (as of 2026-09-05)

- Arbiter verdict cache empty → `--arbiter on` silently runs off (it says so). Parked cards no-op; the trust gate catches it.
- Mulligan counts come from the `mulligan-keep` row; a game without one reports null (never zero).
- Commander-online turn is the engine's own-turn index; the row-derived global turn is a cross-check only.
- `export-training.mjs` speaks grind-store shape (adapter pending — §3).
- The exe grind cannot see the hints ledger or personas yet (program §9.5, §9.7).
