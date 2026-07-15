# WAKE REPORT — live resume anchor

## 🪞 2026-07-15 — THE REFLECTING POOL: R1-R3 on master (6c043009), UNRELEASED pending Colton's look-check

The Post-Mortem grew into **The Reflecting Pool** (Colton's locked name) — the per-deck review dossier:
record · facts row (typical game / wins-end-by / dies-around / usually-closes-by / commander-online) ·
two lift-mined mirrors (what WINS you games — new R1 win catalog — / what LOSES you games), deck-shelf
chips browsing one dossier at a time. Internal `postmortem` view id + `/api/why-you-lost` route kept.
**R3**: every new grind header stamps `decks[].deckV` (grindPod.deckVersionHash — sha1/12 exact-to-the-card
incl. basics/commanders/companion) via the ONE shared builder on both write paths; forward-only; R4
(living history) parks until versioned games accrue. Suite **8,475** · lint 0 · walked live on the real
24,102 headers (seeded read-only into the dev tree).

**Honesty catches off the real-data probe (both fixed pre-push):** the generic "damage" winCondition
topped EVERY deck's wins at 80-97% → excluded from win patterns (facts-row mix only, "damage / drains");
closed-fast threshold set from real p10 (32), not a guess.

**⚠️ QUEUE — engine finding:** combat wins ≈ ZERO across all 24,102 games (Slivers closes 80%
generic-"damage" + 20% commander-damage, ~0 combat — a Sliver deck cannot honestly do that).
`lethalByCombat` likely unstamped at (most) combat eliminations → everything falls to the generic
bucket. Root-cause before any surface leans on combat-vs-burn splits. Also open: Colton's dossier
look-check → cut the release.

## ⚡ 2026-07-10 (later) — THE SHELF RUN: PHASE 1 IN FLIGHT — 28 tier flips shipped (v0.128.0 → master), all audited, LOST 0

**Shipped slices (each: flip-diff audited by name · whole-card verified · suite green · lint 0 · pushed to master):**
- **S1.1** cast-program strip (Harmonized Crescendo recurrence — root cause: unstripped `action.program` short-circuited the dispatcher fallback) — runtime fix, 0 flips.
- **PtH + sequencing-Then strip** (`parser.js` per-sentence loop, CR 608.2c): **+5** — Plan the Heist (conditional surveil `onlyIfHandEmpty` + resolver gate), Deadly Embrace, The Crystal's Chosen, Undercity Uprising, Insidious Fungus.
- **W1 COUNTER-THEN-GRANT collapse** (Snakeskin Veil class; add-counter gains layer-6 `grantKeywords`): **+15** — incl. Angelfire Ignition, Gaea's Gift, Take Up the Shield, 2 modal + 2 trigger carriers.
- **W2 Ram Through** (damage-target-power + `trampleExcess` → excess to controller, CR 702.19b deathtouch math): **+1**.
- **W3 Ancient Animus** (fight-pair + `fighterCounter{onlyIfLegendary}`, persistent counter before power lock): **+1**.
- **W4 Paradise Mantle** (granted-mana EQUIPMENT — parse widening only; layers.js attachment path already fires for any attachedTo): **+1**.
- **M1a ONCE-PER-TURN TRIGGER latch** ("This ability triggers only once each turn." — strip + descriptor stamp + flushTriggers latch; COMPOUND GUARD keeps MACH-1 parked): **+3** — Mirelurk Queen, Academy Wall, Flying Octobot.
- **M1b milled-count tokens** (Scorchbeast: milled sentinel → `countContext` + create-token joins ONCE_PER_TURN_HONORED with a real resolver latch): **+1**.
- **M1c Mothman distribute** (each-of-up-to-X via distribute-counters + `perTargetCap:1`; 3 coverage spell-guards widened): **0 flips — runtime only**; Mothman tier stays parked on the "enters or attacks" compound-event guard (mothmanRad.js coordination note).
- **M2 MILL-DOUBLER** (Bruvac → doubler family; `millMultiplier` at BOTH chokepoints incl. radiation): **+1**.
Tests 8,078 → **8,108**. Census/corpus republish pending the next slice batch.

**⚠️ MID-FLIGHT (uncommitted in the worktree, safe-inert):** M3 Mindcrank life-loss watcher — `gameState.js` registry + loseLife hook (null-watcher = byte-identical) + `triggers.js` lifeLost condition detect are IN; still needed: `checkLifeLossTriggers` + `registerLifeLossWatcher` wiring, the "that player mills that many cards" payoff clause (who:lifeLostPlayer + countContext:lifeLostAmount in applyMill), referent gates (triggerRouting + coverage ×3), tests, flip-diff.

**☀️ FOR COLTON:**
- Named parks so far: Chain of Vapor (standing), MACH-1 (compound limiter — needs the shared-latch build), Emrakul the Promised End (control-a-turn, Yuriko ledger park-candidate). Sign-off when convenient; work continues.
- **EXE DECK-PROFILE ISSUE RECURRED** (your screenshot: your 6 decks listed under "Joe"): queued as a PERMANENT-FIX workflow item — see the queue below. Likely the updater-relaunch ghost-registry thread (COMMS 2026-07-09 evidence note) or a mis-attributed re-import while the ghost was active. Interim: tray-Quit → manual relaunch; deck data repair + root-cause scheduled.

**QUEUE (next up, in order):** ① Omnath's featuresV=2 header bundle (manaHealth per-seat units fix + startSeat/turnOrder + per-seat mulligan summary + decisionsCount) — header-derivation only, no re-anchor; ② double-writer dedupe/reconcile idx ~24230–24318 at pool end; ③ finish M3 Mindcrank; ④ EXE deck-profile permanent fix (data repair + updater-relaunch root-cause); ⑤ compound-event trigger subsystem (Grave Titan / Mothman / Alpha Deathclaw / Kindred Discovery — big corpus lever); ⑥ resume Phase-1 ledger builds (Mothman → Kellan → Wolverine → Yuriko → Cap, workflow-verified dispositions in `tasks/wlg0dw5cn.output` digest).

## ⚡ 2026-07-10 — THE SHELF RUN: PHASE 0 BASELINE PUBLISHED (all six deliverables)

**1 · FRESH 15-DECK CENSUS** (lands-in-denominator; engine v0.128.0): AGGREGATE **78%**
(1,173/1,500; was 73.9% floor). Per deck: Slivers 99 · Koma 94 · Omnath 94 · Vihaan 93 ·
Zaxara 93 · Toph 79 · Rograkh 77 · Ur-Dragon 75 · Kinnan 74 · Pantlaza 71 · Cap 70 ·
Yuriko 65 · Wolverine 64 · Kellan 63 · **Mothman 62 (new worst — evidence re-ranks the
roadmap's Wolverine-first order)**. Gap = 327 slots (235 body-only · 87 arbiter-spell · 5 pw).

**2 · THE ONE CORPUS DENOMINATOR (decided): all 34,169 real bundled oracle cards**
(isRealCard: tokens/emblems/schemes/etc. excluded — the measure-coverage headline; compare
within-method only). **CORPUS: 27.6% native (9,415)**. Play-weighted lenses: **top-1k 66.2% ·
top-2.5k 47.5% · top-5k 36.9%** — the four numbers every session republishes.

**3 · NEWEST LIVE-FIRE BREAKAGE** (fresh 36-game 15-deck batch, v0.128.0): Veil of Summer ×4 ·
**Harmonized Crescendo ×3 (⚠️ RUNTIME-MISMATCH RECURRENCE — the v0.117 Convoke fix claimed this
class native; S1 must root-cause)** · Fraying Sanity ×2 · Plan the Heist ×2 · Seize the
Spotlight ×2 · Freed from the Real · Galvanic Blast · Ordeal of Nylea · Well Rested. 20 entries/36 games.

**4 · TRIGGER-LABEL RESIDUE**: R1.3 (v0.128.0) split condition-not-met from
trigger-removed-no-target at the engine level — the named cards (Kogla, Defense of the Heart,
Scourge of Fleets) get S7 verification during their decks' ledger closes (Scourge's DROP class
was FIXED in R1.2).

**5 · ARBITER-IN-RUNNER STATUS**: the seam exists (default-off `resolveArbiter` hook +
verdict store + prepass, v0.117) but **no verdict SOURCE is wired** — grind-time gated cards
still no-op (logged `spell-unresolved`, null-labeled). "Gated" in grind data = unplayed, not
Ollama-resolved. The verdict source remains the pending piece (Omnath-adjacent).

**6 · ★ THE SLICE MANIFEST** (`app/scripts/slice-manifest.json`, generator committed):
**2,520 ladder-matched non-native cards → projected corpus 27.6% → 34.9%** if the full ladder
lands. By size: transform-dfc 680 · tutors 417 (11 in top-1k — the most-played king) ·
loyalty-activated 313 · counterspells 219 · token-copies 217 · target-mill 136 · suspend 110 ·
cum-upkeep 71 · level-up 62 · venture 50 · batch-combat 44 · self-bounce 41 · cascade 33 ·
incubate 28 · wheels 26 · the small tail (spores/initiative/bite-pw/detain/graft ≤19 each).
INTERACTION CLASS TOTAL ≈ 662 cards — Omnath's call confirmed by data. Unmatched bespoke tail:
22,234 (mechanismBucket groups in the JSON). Method stated in-file (pattern-proxy; flip-diff is
truth at build time). Triage ledgers: `app/scripts/triage-ledgers.json` — 327 rows, all 15 decks.

☀️ **QUESTIONS FOR COLTON**: none yet — Phase 1 building started (S1 first per the order).


> ROTATING doc (rotation rule enforced 2026-07-09: current cycle only; history lives in
> [archive/WAKE-REPORT-through-2026-07-09.md](archive/WAKE-REPORT-through-2026-07-09.md) + git).
> Boot order + method: [MASTER-GUIDE.md](MASTER-GUIDE.md). The queue: `memory/orders/master-plan-2026-07-09.md`.

## ⚡ 2026-07-09 NIGHT — THE R-WAVE SESSION SHIPPED (v0.128.0): R1+R2+mulligan+pool-tag+epoch-2 = the ONE re-anchor

**One session, the master plan's whole critical path — epoch 2 starts here.**

- **R1 engine CREED-FPs (5)**: exile-instead no longer fires dies-triggers (phantom Blood-Artist
  drains gone; log relabeled `creature-exiled-instead`) · `eachOpponentCreature` registered
  (Scourge-class mass bounce was silently DROPPED at the flush while classified native) + the
  drift guard now SCANS EMITTERS (an omission fails by name) · upkeep-win not-met → sentinel
  (breakage-queue pollution gone) · storm combat-referent guard · payLife/discard affordability
  re-check. Tier flip-diff **LOST=0 GAINED=0** (10,157 native).
- **R2 store data-trust (7)**: decisive-only win rates + winner splits · run-caps never persist ·
  crash-window duplicate-index self-heal (write-side skip + read-side dedupe) · pool parent
  unhandled-rejection guard + tmp cleanup · `shuffleLibrary` requires the seeded rng ·
  seed math single-sourced (`seedMath.js`) · `/api/self-play` gamesPer clamp [1,50].
- **MULLIGAN OVERHAUL (SIM-INTEGRITY Phase 2)**: `makeMulliganPolicy(playbook)` — land windows,
  color-aware castable floors, piece demands, ship floors (combo mulls to 4) — replaces the
  poison filter for every persona seat; London bottoming now ranks WORST-N (excess lands →
  uncastable/highest-MV) instead of the blind tail; `mulliganPolicyV: 2` stamped. 27 policy tests.
- **POOL TAG (Phase 3)**: Rograkh/Thrasios + Kinnan = `cedh`; pods form within ONE pool
  (loop/workers/route/SimCenter selector); headers + summarize record it. 13 mixed / 2 cedh.
- **EPOCH-2 INSTRUMENTATION (all 6, ONE schema bump → v3)**: per-seat finishRank +
  eliminatedAtTurn + manaHealth (colorMiss PARKED — needs a legal-set counter) · winCondition
  taxonomy · rows v2 (legal histogram, rank, stackDepth, forced; nearTie PARKED — seam lacks
  chooser scores) · `build-grind-card-evidence.mjs` (cast×outcome, the corpus blend feed) ·
  `replay-canary.mjs` + dedupe guard · Wilson CIs + seat-skew flags + player-turns label +
  per-version/per-pool cuts in the readout.
- **🔴 CANARY FINDING (first run!)**: persona temperament assignment is RANDOM → persona games
  are NOT replay-regenerable; canary discriminates (ENGINE proven deterministic with fixed
  pilots) and gates pruning RED. The per-game seed now rides `buildPilots(seats,{mode,decks,seed})`
  — **Omnath must make temperaments seed-derived**, then the canary greens and pruning unlocks.
- **R7 deletions (Colton-approved, all verified)** + **R4.1** Arbiter CR citations fixed against
  the bundled CR (tax 903.8, shield 122.1c, destroy 701.8, Day/Night 731) with a permanent
  cite-guard test · **R6** CHANGELOG dated, E1 purged, this doc rotated · eslint now covers
  scripts/**/*.mjs (instantly caught a parse-breaking bug in grind-worker).

**ANCHOR LINEAGE (the ONE re-anchor, ×2 each):**
`53614053…` (6,629 rows — FFA sole-survivor era, v0.126.0)
→ `36afd790…` (6,304 rows — playbook mulligans + ranked bottoming changed kept hands)
→ **`3fe82499059d1086da0a67bfe336f22d2af4fe2a96884590bb0d5e5e712f1431`** (6,304 rows — rows-v2
payload growth; identical row count = decisions PROVEN unmoved). Legacy pins: `legacyUserPivot`
reproduces `ab524e20…`; `mulligan:false` byte-identical; playbook-less seats keep the old filter.
Suite **8,072/586** · lint 0/0 · census 1 breakage entry (unchanged).

**DATA ERAS**: epoch-1 archive (`self-play/grind-archive-2026-07-09-epoch1/`, 27.5 GB, winners
fabricated pre-schema-2 — decision-mining only) · **epoch 2 = schemaVersion 3, live store, starts
with the post-v0.128.0 pool relaunch — the clean baseline era.** Standings trust schemaVersion≥2;
mulligan data never pools across `mulliganPolicyV`.

**⚠️ OPEN / NEXT** (full queue in the master plan): Omnath — seed-derived temperaments (canary
gate) + golden mulligan hands (Colton eyeballs) · R4 remainder (Karn banlist, modelProvider
agentName, pilot cache-bust, export inventory, UI error-swallowing set, rulings degrade) · R5
ship-chain (SHA-pin actions, Node bump, placeholder nonce, lib.rs expect, port fallback per
Colton's design) · R6 remainder (README, CLAUDE.md updater doc — Colton: code is right, docs
wrong) · R8 test debt · updater-relaunch forensics (evidence in COMMS 2026-07-09) · HARNESS-DATA
waves 4-6 (reality reports → Stage-A tuning → distill handoff).
