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
  "Wolverine, claws out!" "Slivers" "Mothman Cometh" "Earth Bent" --out runs/census-$(date +%F)
```
Check `orders/arbiter-nuance-queue.md` carries the "Pod-sim three" batch. Read each of the three decks' non-native list
and write it into the program doc §9 as EXPECTED hollow cards.

Dry run (resolves names, prints the schedule head + census, runs zero games):
```bash
node anchor-pod.mjs --anchor "The Unbeatable Squirrel Girl" \
  --pool "Killer Turts,Kinnan Mana Overload,Believe it!,Omnath, Locus of Mana,Vihaan, Goldwaker,Veyran Cantrips,cdh,Did you say Dragons?,Kellan of the west,Wolverine, claws out!,Slivers,Mothman Cometh,Earth Bent" \
  --games 10000 --seed 1 --tag sg-baseline-v0 --dry
```
A name with a comma works (the parser retries joins); an ambiguous or missing name errors with the shelf listed.

## 2. P2: the baseline (N = 10,000, four lanes)

The pool (thirteen): `Killer Turts,Kinnan Mana Overload,Believe it!,Omnath, Locus of Mana,Vihaan, Goldwaker,Veyran Cantrips,cdh,Did you say Dragons?,Kellan of the west,Wolverine, claws out!,Slivers,Mothman Cometh,Earth Bent`

Four terminals (or four background processes), identical args except the lane:
```bash
node anchor-pod.mjs --anchor "The Unbeatable Squirrel Girl" --pool "<the thirteen>" --games 10000 --seed 1 --tag sg-baseline-v0 --hints on --arbiter off --rows golden --rows-sample 200 --lane 0/4
node anchor-pod.mjs ... --lane 1/4
node anchor-pod.mjs ... --lane 2/4
node anchor-pod.mjs ... --lane 3/4
node anchor-merge.mjs runs/sg-baseline-v0          # after all four finish → root games.jsonl, trajectories, summary, REPORT
```
- ~2.5 s per game per lane → ~2 h on four lanes (7 h single-lane). A lane prints one line per game with its running win rate.
  Interrupted? re-run the same lane with `--resume`. Overnight cap: `--max-elapsed-min`.
- Rows: `--rows golden` writes decision rows only for trust-gate-clean games (the learning feed) plus the first 200 games
  of every lane regardless (forensics on rejected games). Gzip, multi-member: ≈ 2–3 GB at 10k. `--rows all` for a small
  run you want fully explainable.
- Outputs in `runs/sg-baseline-v0/`: `manifest.json` (shared, full schedule) · `lane-k/` (games.jsonl · trajectories.*.jsonl.gz ·
  summary · REPORT) · after merge: root `games.jsonl` · `trajectories.all.jsonl.gz` · `trajectories.golden.jsonl.gz` · `census.json`
  · `summary.json` · `REPORT.md`.

Then forensics:
```bash
node anchor-forensics.mjs runs/sg-baseline-v0      # → FORENSICS.md + forensics.json
```

**Read before anything else:** REPORT §5 (golden share, rejection reasons, the hollow list) and §4 (engine halts). A halt
= a seed for Cindy; a golden share under ~85% = the pool is not ready, stop and say so. Only then the headline.

## 3. P3: the learning pass (writes `runs/<tag>/LEARNING.md` by hand — over-capture)

```bash
node lab.mjs ingest runs/sg-baseline-v0/trajectories.golden.jsonl.gz   # GOLDEN only → the ONE case store
node lab.mjs distill                                                    # invariants vs mode-conditional
node anchor-to-store.mjs runs/sg-baseline-v0                            # golden games → a grind-store-shaped dir (runs/<tag>/store)
node export-training.mjs --store=runs/sg-baseline-v0/store --out=training-sg-v0 --max-games=100000   # NOTE: key=value flags
node train-eval-net.mjs --data=training-sg-v0 --out=eval-net-v1.json
OMNATH_PILOT_STORE=memory-store node ingest-grind-store.mjs --store=runs/sg-baseline-v0/store --out-store=memory-store --max-games=100000 --holdout=500
```
`anchor-to-store.mjs` writes the golden games in the exe grind's shard shape (header + rows) so BOTH existing consumers
(`export-training`, `ingest-grind-store`) read a run unchanged. Record in LEARNING.md:
ingest counts · invariants verbatim · mode-conditional count · net holdout MSE / Pearson r / calibration table ·
the recall snapshot size.

Persona pack v6: rebuild the recall snapshot from the store, drop `eval-net-v1.json` into the pack as the eval-net
weights, bump `pilotPackV` in `exe-persona.mjs`, run `node test-all.mjs` again. (v5 = v4 + deck plans, the baseline pack.)

## 4. P4: persona A/B (same schedule, pack v6 with recall + eval-net ON)

```bash
node anchor-pod.mjs --anchor "The Unbeatable Squirrel Girl" --pool "<the thirteen>" --games 10000 --seed 1 \
  --tag sg-persona-v6 --hints on --recall on --eval-net on --rows golden --lane k/4     # x4 lanes, then anchor-merge
node ab-compare.mjs runs/sg-baseline-v0 runs/sg-persona-v6 --label-a "pack v5" --label-b "pack v6"
```
The AB report states the delta, the minimal detectable delta, the paired disagreement table and the exact sign test.
One line of verdict goes into the program doc §0. If the engine version changed between runs, the report says so — rerun
v0 on the new engine before believing anything.

## 5. P5: deck A/B

1. In the app, duplicate the baseline deck and make ONE change (real disk: through the app, never a session-side edit of
   `decks.local.json`). Name it clearly (e.g. `SG v1 — cut X for Y`).
2. Run the variant on the same schedule with the WINNING persona pack frozen:
   ```bash
   node anchor-pod.mjs --anchor "SG v1 — cut X for Y" --pool "<the thirteen>" --games 10000 --seed 1 --tag sg-v1-cut-x [same flags + lanes as the reference]
   node ab-compare.mjs runs/<reference> runs/sg-v1-cut-x --label-a baseline --label-b "cut X for Y"
   ```
3. Read: MDD → sign test → per-opponent deltas → `anchor-forensics` on both and diff the tempo table.
4. Present the options to Colton with the numbers; he decides the list.

## 6. The review packet (P6)

`runs/<tag>/` → copy `REPORT.md`, `FORENSICS.md`, `LEARNING.md`, `CENSUS.md`, every `AB-vs-*.md` into
`docs/orchestration/sg-baseline/<date>/` (or wherever Colton wants to read), plus one page of Omnath's reading: what the
numbers say, what they cannot say (the three axes), the next cut.

## 7. Reading the numbers honestly

- A rate without its interval is not a number. At N=10,000 decisive the interval is about ±0.85 points around 25% (±4 at N=400).
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
- Deck plans (pack v5) change play for planned decks only (Squirrel Girl). To replay a v4-era seed: `OMNATH_DECK_PLANS=off node anchor-pod.mjs ...`.
- Forensics "offered" is a lower bound (rows carry castScores only when the engine's own scorer ran).
