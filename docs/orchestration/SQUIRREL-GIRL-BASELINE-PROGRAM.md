# SQUIRREL GIRL BASELINE — the anchor-pod program (Colton's 2026-09-05 order)

> **The order (Colton, 2026-09-05, verbatim intent):** *"I have a new Squirrel Girl deck that Cindy has pushed. I want
> to run a large amount of games with Squirrel Girl against 10 different decks — 3 of them must be Kinnan, Believe it!
> and Killer Turts. I want a baseline of how she plays; this is a full learning pass for you as well. After the baseline,
> A/B testing on the deck. All findings and learnings also feed the persona — everything gathered and used; a full test of
> the improvement system. Make MD of everything you learn and find — capture more, not less — so I can review it."*
>
> **Gate (Colton, same day): the sim does NOT start until Killer Turts, Kinnan and Believe it! are at 85 AND their
> Arbiter play-nuance batch is filed.** Until then this program BUILDS and PROVES the machine on witness runs only.
>
> Owner: **Omnath** (self-play harness + trajectory data quality, per the 2026-08-16 ruling). Cindy owns the engine,
> the corpus, and master. Companion runbook: [RUNBOOK-SG-BASELINE.md](RUNBOOK-SG-BASELINE.md). Memory:
> `memory/orders/squirrel-girl-baseline-program.md`. Tooling: `omnath-vault/omnath-tools/pilots/anchor-*.mjs`.

---

## 0. STATUS

| | |
|---|---|
| Phase | **P0 — WAITING on the pod-sim three** (Killer Turts 71 · Kinnan 75 · Believe it! 75, each needs 85) + their nuance batch |
| Machine | **BUILT + PROVEN 2026-09-05** on three witness runs (1, 2, 3 games) against the real shelf; full pilots gate green |
| Engine / persona at build | engine v0.150.0 · persona pack v4 (`exe-persona.mjs`) · play-hints ledger 1,640 entries · Arbiter verdict cache EMPTY |
| Squirrel Girl | 90/100 native (gate parity confirmed) · commander native · deck id `deck_squirrel_girl_02h46dkh` on Colton's profile · no Archidekt URL |
| Next call | Colton: confirm the 7 free pool picks (§3) and the baseline size (§7); then wait for Cindy's 85s |

---

## 1. WHAT A BASELINE IS HERE (and what it is not)

**The anchor design.** Squirrel Girl sits in EVERY game. The other three seats are drawn from a fixed 10-deck pool,
weighted toward least-used and never repeating a composition within a 4-game window. Her seat rotates every game and the
on-the-play seat rotates as a Latin square, so over any 16 games every (her seat, who leads) pair happens exactly once.
Every game is seeded (`base × 100000 + i`, the grind's own convention) so any single game replays and a later run on the
same base seed sees the same schedule — which is what makes the A/B paired.

**What the baseline measures (all in `REPORT.md`, every rate with a Wilson 95% interval):**
- her win rate against the fair-pod floor of 25%, by seat, by on-the-play, versus each opponent, per composition;
- finish-rank distribution, elimination turn and cause, how she wins (combat / win-game effect / …);
- tempo: commander online turn (the engine's own per-seat stat), lands by own T5, screw/flood, mulligans taken;
- the pool's health (every deck's own win rate — a pool deck that never wins is a pool problem, not her strength);
- the trust gate: how many games are GOLDEN (clean outcome, no decision-relevant no-op), and the HOLLOW list — every card
  that was cast and did nothing;
- decision forensics (`FORENSICS.md`): the first own turn she had commander mana up → first turn the engine offered the
  cast → first turn the persona cast it; what she cast instead by turn band; windows where she passed with mana up.

**What it is not.** Self-play volume is evidence about ENGINE behaviour and persona behaviour, never about human
playability (the data-trust bar's axis 0). And a win rate measured while three pool decks are hollow is a measurement of
the hollow decks — which is exactly why the gate above exists.

**The three axes the number rests on** (from the data-trust bar): engine correctness (coverage — Cindy's lane, the 85s),
piloting skill (the persona — the improvement loop's target), opponent realism (the pool — §3). All three are named in
every report so nobody reads a 40% win rate as "the deck is good" when it means "the pool couldn't cast its spells".

---

## 2. THE DECK — The Unbeatable Squirrel Girl (Colton's second project)

Deck memory: `memory/deck_squirrel_girl.md` (the list, the shape, the coverage history). The short version:

- **Commander:** The Unbeatable Squirrel Girl — `{1}{G}{G}{G}`, Legendary Creature — Squirrel Human Hero. *Enters or
  attacks → a 1/1 Squirrel. `{1}{G}{G}{G}`: create X Squirrels where X = Squirrels you control.* Native (SG-1).
- **Plan:** the mono-green combo-ramp lineage — Gaea's Cradle / Earthcraft / Cryptolith Rite mana engine into
  Craterhoof / Finale of Devastation / Walking Ballista + Staff of Domination, with a token sub-theme off the commander
  (the Squirrel doubling line turns Cradle absurd). Playbook pin: **ramp** (specialist `buildToInevitability`).
- **Engine coverage today (census 2026-09-05, engine v0.150.0): 90/100.** The ten non-native copies are the deck's
  hollow list — they sit in the list, get drawn, and either no-op on cast or play as vanilla bodies. Run
  `node deck-hollow-census.mjs "The Unbeatable Squirrel Girl"` for the current ten; the baseline REPORT prints them
  alongside which ones were actually cast.
- **Witness observation (6 smoke games, not the baseline):** she cast her commander in 2 of 6 games (own turn 6 both
  times) while casting Craterhoof, Finale, Ballista, Natural Order and the rest on schedule. Forensics on the 3-game
  witness: mana up by own T4.5, offered by the cast scorer at T4 (2 of 3 games), cast at T6; passed with mana up in
  0 of 77 windows. So the engine offers her late-ish and the persona casts her later still — a persona-side A/B
  candidate (§6), not an engine block. Measure at baseline size before touching anything.
- **Open:** no Archidekt URL captured (ask Colton, register in `reference_deck_sources`); the list is the pasted 100.

---

## 3. THE POOL — ten opponents

**Mandated (Colton):** Killer Turts (Colton, Gruul extra-combat cannon, **71**) · Kinnan Mana Overload (Joe, cEDH
big-mana, **75**) · Believe it! (Joe, cEDH ninjas + Thoracle, **75**). These three are the gate: they enter the pool only
at 85 with their nuance batch filed.

**The seven free picks — criteria:** ≥85 native today (the CREED: a hollow opponent measures nothing) · archetype spread
across the ten playbooks · both owners represented · no theft archetype (Colton's 2026-08-15 veto on training data) ·
prefer decks he actually sits across from. Candidates at ≥85 on 2026-09-04's table:

| Deck | Owner | Native | Playbook | Note |
|---|---|---|---|---|
| Omnath, Locus of Mana | Colton | 94 | ramp | the mono-G mirror — tests whether she out-ramps her own lineage |
| Vihaan, Goldwaker | Colton | 95 | aristocrats | the growth-zone archetype at the table |
| Zaxara kinda X'ish | Colton | 93 | ramp (~combo) | X-spell mana sink pressure |
| Veyran Cantrips | Colton | 91 | spellslinger | draw-go interaction — the deck that says no |
| Slivers | Colton | 99 | go-wide | tribal go-wide, the cleanest engine deck on the shelf |
| cdh (Rograkh/Thrasios) | Colton | 87 | combo | cEDH speed — pairs with Kinnan/Believe it! as the fast front |
| Did you say Dragons? | Joe | 91 | ramp (Dragon module) | big-body midrange |
| Earth Bent | Joe | 91 | ramp | Joe's real deck, +1/+1 lands |
| Kellan of the west | Joe | 85 | value-control | the grindy deck |
| Mothman Cometh | Joe | 89 | aristocrats | Joe's aristocrats |
| Wolverine / Cap America | Joe | 88 / 86 | voltron | commander-damage pressure |

**Proposed seven (Omnath's pick, for Colton's yes/no):** Omnath · Vihaan · Veyran · cdh · Did you say Dragons? ·
Kellan of the west · Wolverine, claws out!. Reasoning: two ramp mirrors (one his, one Joe's), one aristocrats, one
spellslinger, one combo, one value-control, one voltron — seven playbooks, both owners, nothing hollow. Slivers and
Zaxara are held back only because three green ramp decks already sit in the pool; swap freely.

**Pool tags:** `selfPlayDecks.poolOfDeck` marks a deck cEDH only by two dead ids or `memory.pool`; today Kinnan and
Believe it! read `mixed`. The anchor harness ignores pools by design (Colton wants them at her table), but the exe grind
would happily seat them in mixed pods too — a tag ask for Cindy (§9).

**"10 decks, 3 of the 7"** — the order said both numbers; this program reads it as ten opponents with three mandated and
seven free. If Colton meant seven total, drop the last three of the proposed list.

---

## 4. THE MACHINE — what existed, verified live 2026-09-05

| Piece | State | Evidence |
|---|---|---|
| Engine runner seam (`runSelfPlayGame`, pods via `grindPod.podToArgs`) | works in-process from omnath-tools | 3 witness runs, 6 real 4-seat games |
| Real shelf decks (`selfPlayDecks.loadAllProfileDecks`) | 30 decks across 3 profiles resolve; **most carry no `id`** (name = id) | dry run |
| Persona pack (`exe-persona.mjs`, pilotV 4) | drives every seat; seat 0 specialist + generalists seed-derived | records carry `{playbook,temperament,pilotType}` |
| Trust gate (`trust-gate.mjs`) | gates every game; hollow list per game | 0/6 witness games golden — the pod-sim three no-op'd (Untimely Malfunction ×3, Lim-Dûl's Vault) |
| Play-hints ledger (Omnath's 486 curated notes + derived roles) | **loads (1,640 entries) and threads as `policy.playHints`** in-process | default-off in the engine; the exe grind route does NOT accept `policy` |
| Arbiter verdict cache (`arbiter-verdicts.json`) | **EMPTY** — `resolveArbiter` stays off; parked cards are honest no-ops | the P1 in the harness-ownership program: author curated verdict ATOMS from the nuance notes |
| Persona deployment for the .exe (`%APPDATA%/com.colton.mtg-tool/pilots/`) | **directory does not exist on the real disk** (nor in the MSIX mirror) | the exe grind today = default AI; in-process runs import the pack directly |
| Grind shard headers | still no `header.breakage` (the 08-16 ask) — axis-1 blind on the exe path | grindPod.buildGrindHeader |
| Learning consumers (`lab ingest` → case store → `distill`; `export-training` → `train-eval-net` → `evalnet.mjs`; `recall.mjs`) | present; full flywheel dry-run green | `node test-all.mjs` |
| Pilots gate | **ALL GREEN** — 241 + 26 + 14 + **48 (new)** + 12 + lab smoke | 2026-09-05 |

## 5. WHAT WAS BUILT 2026-09-05 (`omnath-tools/pilots/`)

- **`anchor-pod.mjs`** — the runner. Anchor + pool by name/id across profiles; seeded schedule; persona pack on every seat
  (anchor pinned to its specialist by default); hints ON by default, arbiter cache optional; trust gate per game;
  writes `manifest.json` (engine/persona/flags/deck hashes/full schedule/row vocabulary), `games.jsonl` (append-as-you-go,
  `--resume`), `trajectories.all.jsonl` + `trajectories.golden.jsonl` (omnath-trajectory-v1, the learning feed), `census.json`,
  `summary.json`, `REPORT.md`. `--dry` prints schedule + census only. `--max-elapsed-min` for overnight caps.
- **`anchor-stats.mjs`** — the pure math: schedule, Wilson, exact sign test, `summarizeRun`, `pairedCompare`, renderers.
- **`ab-compare.mjs`** — paired A/B over two runs on the same schedule; refuses a schedule mismatch; names what moved
  (deckV / pilotV / engine / flags) and calls a confounded comparison confounded; states the minimal detectable delta.
- **`deck-hollow-census.mjs`** — replaces the dead `deck-coverage-census.mjs`; uses the realism gate's exact card
  projection (a parity bug found and fixed on the way: the raw index shape over-credited every deck by ~8 points).
- **`anchor-forensics.mjs`** — decision-level "why": commander tempo (mana up → offered → cast), casts by turn band,
  passed-with-mana-up, hollow casts, cast-scorer decisiveness.
- **`anchor-pod-selftest.mjs`** (48 checks, mutation-checked) in `test-all.mjs`; `classify.mjs` gained the shelf's
  commander → playbook pins (Squirrel Girl → ramp, Raph & Mikey → voltron, …); `_env.mjs` gained loaders for grindPod,
  coverage, the hints ledger and the verdict store.

Witness numbers (tool proof, NOT the baseline): 4-seat game ≈ 1.5–4.5 s; a stalled game 38 s; ~1,000–1,450 recorded
decisions per game across four seats; a 200-game run ≈ 10–20 minutes.

---

## 6. THE IMPROVEMENT-SYSTEM TEST (the part Colton called "a full learning pass for you")

The claim under test: *games → gated trajectories → mined cases → distilled invariants + a retrained eval net → a new
persona pack → measurably better play on the SAME schedule.* Each arrow is a step with its own file and its own gate.

1. **Baseline v0** — `anchor-pod` at N games (§7), persona pack v4, hints ON, arbiter off. Outputs the v0 REPORT +
   FORENSICS + the golden feed.
2. **Ingest** — `node lab.mjs ingest runs/<tag>/trajectories.golden.jsonl` (golden ONLY; the `.all` file is forensics).
   Record the ingest counts (games, rows, seat-trajectories, cases written) in the run's `LEARNING.md`.
3. **Distill** — `node lab.mjs distill` → cross-mode invariants vs mode-conditional. Copy the new invariants verbatim into
   `LEARNING.md`; they are the legible half of what was learned.
4. **Eval net** — `export-training` over the run's rows → `train-eval-net` → holdout correlation is the gate (a net that
   cannot rank positions does not ship). Record MSE / Pearson r / calibration.
5. **Persona pack v5** — recall snapshot rebuilt from the store, eval-net weights refreshed, `pilotPackV` bumped. The
   pack is the deliverable; it is what the exe should be running.
6. **Persona A/B** — `anchor-pod` again on the SAME base seed/pool/N with flags `--recall on --eval-net on` (pack v5) →
   `ab-compare` v0 vs v1. The sign test on the disagreements and the minimal-detectable-delta line decide whether
   anything was learned. **This is the improvement system's pass/fail.**
7. **Then deck A/B** (§8) with the persona frozen at whichever pack won.

Everything from steps 2–6 lands in `runs/<tag>/LEARNING.md` — counts, invariants, net metrics, the pack diff — so Colton
reviews the learning, not just the win rate.

## 7. PHASES + GATES

| Phase | What | Gate to pass | Owner |
|---|---|---|---|
| **P0 WAIT** | Cindy grinds Killer Turts → Kinnan → Believe it! to 85; nuance batch filed to `orders/arbiter-nuance-queue.md` | the three read ≥85 on `deck-hollow-census`; the batch is in the queue | Cindy / Omnath |
| **P1 READY** | `--dry` on the final pool; census on all 11; pool picks confirmed; the pod-sim three's hollow lists reviewed | census.json committed to the run; every pool deck ≥85; the anchor's 10 hollow cards listed | Omnath + Colton |
| **P2 BASELINE v0** | `anchor-pod` N=400 (base seed 1) — 100 per anchor seat, 25 per (seat, lead) pair; Wilson half-width ≈ ±4.5 pts at 400 decisive | ≥85% golden; zero engine halts unexplained (any halt → seed to Cindy, game excluded from the learning feed but kept in the report) | Omnath |
| **P3 LEARNING PASS** | §6 steps 2–5 | holdout r reported; invariants written; pack v5 built | Omnath |
| **P4 PERSONA A/B** | §6 step 6 | AB report with sign test + MDD; a verdict in one line | Omnath |
| **P5 DECK A/B** | §8 | per variant an AB report; only ONE list change per variant | Omnath + Colton |
| **P6 REVIEW** | the packet: REPORT v0, FORENSICS, LEARNING, AB reports, CENSUS, the hollow list, the asks | Colton reads; decides the next cut | Colton |

Baseline size reasoning: at 25% base rate the 95% interval half-width is ±4.2 pts at N=400 and ±6 at N=200. A deck
change worth making moves the win rate by more than that; a persona change might not — the A/B pairs games and uses the
sign test on disagreements, which is far more sensitive than two unpaired intervals.

## 8. DECK A/B PROTOCOL

- A variant = the baseline list with **one** change (a swap, at most a two-card package). The change is made in the app
  (the writable profile, through `/api/decks` so it hits the real disk, not the MSIX mirror) and the runner sees a new
  `deckV`. Keep the baseline list as its own saved deck so the two can be run side by side.
- Same base seed, same pool, same N, same persona pack, same flags. `ab-compare` enforces the schedule and names what moved.
- Read the AB report in this order: minimal detectable delta → sign test → per-opponent deltas → FORENSICS diff.
- Candidates come from the v0 forensics, not from taste: cards she cast that did nothing (hollow), cards that sat in
  hand with mana up, the commander-tempo question. Present options to Colton, never slot them.

## 9. FINDINGS SO FAR (2026-09-05, witness runs)

1. **Engine stalls (two, replayable)** — `engine-stuck: turn stall (2001 ticks in a single turn — non-terminating
   loop)`: seed **4200000** (Squirrel Girl user / Believe it! ai1 / Kinnan ai2 / Killer Turts ai3, lead user, T33) and
   seed **700000** (Squirrel Girl user / Kinnan ai1 / Killer Turts ai2 / Believe it! ai3, lead user, T26). Both pods
   hold all three pod-sim decks; a normal game in the same pool ends in 2–5 s. → Cindy, with both seeds.
2. **Pod-sim three no-ops, as expected:** Untimely Malfunction ×3, Rite of Flame, Avoid Fate, Grim Reaper's Sprint,
   Veil of Summer (Killer Turts) · Lim-Dûl's Vault, Tainted Pact, Force of Despair ×2, Misdirection (Believe it!) ·
   Tezzeret the Seeker (Kinnan). Every witness game was rejected by the trust gate on these — the concrete reason the
   sim waits. **Squirrel Girl's own hollow cast so far: Tezzeret, Cruel Captain** (one of her ten non-native).
3. **Squirrel Girl commander tempo** — cast in 2 of 6 witness games (own T6); offered T4, mana up T4.5. Persona A/B
   candidate #1; measure via FORENSICS at baseline size before touching anything.
4. **Census parity bug** (fixed) — the pilots' old census fed classifyCard the raw index shape and over-credited every
   deck by ~8 points (Squirrel Girl read 98). The new census reproduces the gate exactly (90 / 70 / 75 / 75 / 94).
5. **Personas are not deployed on the real disk** — `%APPDATA%/com.colton.mtg-tool/pilots/` does not exist. The exe's
   grind runs default AI. The in-process harness imports the pack directly, so the baseline is unaffected; the exe path
   needs a deploy step that escapes the MSIX container (schtasks or the app API) — see `reference_msix_container_hazard`.
6. **Most shelf decks have no `id`** — the runner keys them by name; fine until two decks share a name. The anchor harness
   refuses ambiguity loudly.
7. **The hints ledger reaches the in-process AI but not the exe grind** — `/api/grind` accepts no `policy` and no
   `resolveArbiter`; Omnath's nuance work reaches the exe sim only once those two knobs are exposed (or the defaults flip).

## 10. ASKS (posted to COMMS 2026-09-05)

- **Cindy:** (a) replay seed 4200000 (pod above) for the turn-stall loop; (b) `header.breakage` on grind shards (the
  08-16 ask, still open); (c) `memory.pool: "cedh"` on Kinnan and Believe it! (or ids for the CEDH_DEFAULT_IDS set);
  (d) when the three hit 85, a COMMS line naming the residue so the baseline's hollow list is expected, not discovered;
  (e) eventually: `policy.playHints` + `resolveArbiter` reachable from `/api/grind` so the exe sim sees the nuance work.
- **Colton:** the 7 pool picks (§3); N (400 proposed); the Archidekt URL for Squirrel Girl; confirm hints ON is the
  baseline (it is the app's intended state for the nuance notes) — or run both and pay the extra 10 minutes.

---

*Written 2026-09-05 by Omnath. Everything above traces to a live probe, a witness run, or a file read that day; nothing
is from memory. Update §0 in place as phases move.*
