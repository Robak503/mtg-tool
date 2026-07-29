# NEXT QUEUE — the successor to roadmap v2

> **Why this file exists.** Roadmap v2's six waves are effectively cleared (2, 3-item-8, 4 and most of 5
> landed 2026-07-27/28). Colton's standing order is a 5-hour minimum run, 8-hour stretch, no check-ins —
> and the thing that would end that run early is not stamina, it is **running out of queue**. This is the
> queue. It is sequenced so the risky work happens while sharp and the mechanical work is available late.
>
> Read with [RUN-LEDGER.md](RUN-LEDGER.md) (what is in flight right now) and the triage ledger (banked
> engine findings with their traps named).

## THE SEQUENCING LAW FOR A LONG RUN

Judgment degrades before mechanics do. So:

1. **Risky / novel / subsystem work goes EARLY**, while the run is fresh. Layer-2 control is the standing
   example — it can produce permanent control theft if the revert misses a path.
2. **Mechanical, testable work goes LATE.** A decomp or a card-by-card grind is still safe at hour seven.
3. **Anything needing Colton's eyes is REFUSED, not deferred quietly** — say so and move on.
4. Every item below states its SIZE and its FAILURE MODE, so a tired seat can judge whether to start it.

---

## A — UNBLOCKED NOW (do these first, in this order)

### A1. Tibalt gremlin mode · ~1h · low risk
Omnath's design landed 2026-07-27 ~23:05 (COMMS [O2]): trigger policy, frequency cap, bubble register.
Per-profile setting, default OFF, Colton's ON. **Failure mode:** an unprompted interjection firing for a
guest profile, or a jab with no real criticism behind it — both violate standing law. Build the cap and
the profile gate before the copy.

### A2. `MTGAssistant.jsx` decomp · ~2h · **RISK RE-RATED UPWARD — the safety net does not exist**

⚠️ **Checked 2026-07-28 before starting, and the estimate was wrong.** The CollectionView precedent
(`2d726b0a`) was only safe because it fingerprinted ALREADY-EXPORTED sub-components and snapshotted their
markup before moving them. MTGAssistant has **no sub-components at all** — it is one 1,704-line function
with everything inline — so there is nothing to fingerprint until after the risky step.

The obvious fallback, snapshotting the whole component before and after, **does not work either**: it
touches `window` at render time and dies under `renderToStaticMarkup` with `ReferenceError: window is not
defined`. The project bans jsdom/RTL, so there is no cheap harness.

**What that means:** a 1,700-line refactor with no render net and no live QA is the same shape as C1, and
it should be treated the same way. Do NOT do the full decomp solo at hour seven.

**The safe subset, if you want progress here:** the three BANNERS (app-update, first-launch import, Ollama
health — roughly lines 1091–1351) are purely presentational, touch no `area` state, and take explicit
props. Extract those into their own module AS PURE COMPONENTS, and fingerprint the extracted components
directly — they do not touch `window`. That shrinks the god-component ~260 lines with a real net over the
moved code. The residual risk is only the call-site wiring, which the full suite and lint do cover.

**Original note, still true:** 11 hardcoded `setArea("agents")` sites; leave the `area` state machine
alone — re-homing and decomposing in one step is how you get an unreviewable diff.

**Failure mode:** a nav regression nobody notices until a room stops opening.

### A3. Forge wiring — ownership into the bench context · ~1h · low risk
Scoped in the triage ledger. `/api/collection/ownership` is built and has **zero consumers**; the
COLLECTION SUMMARY Karn already gets is aggregate-only (no per-card status, no `inDecks`).
**The decision that must come first, and it is mine to make with a stated assumption:** ownership of WHICH
names? The locked deck's cards are known up front (context injection); Karn's SUGGESTED cards are not
known until he answers (post-hoc UI enrichment). **Assumption to build on: do the deck's cards now** — it
is the half that is a clean context injection, it answers "what have I already committed elsewhere", and
it does not block the other half later.

---

## B — THE ENGINE BACKLOG (each is a real slice; sizes measured, traps named)

### B1. Layer-2 control · 28 cards · **HIGH RISK — do it EARLY or not at all**
"You control enchanted creature" (7 sole + 21 co). Control is represented STRUCTURALLY here: the permanent
MOVES between battlefield arrays, and 628 sites read `.controller`. So this is a move-and-revert, not a
layer. **Failure mode: permanent control theft** — if the revert misses any path by which the Aura leaves,
the creature never goes home. Requires a single chokepoint for "Aura left the battlefield" and a test that
kills the Aura by every route (destroy, bounce, exile, sacrifice, its host dying).

### B2. Phantom damage prevention with counter cost · 6 sole · **HIGH RISK**
"If damage would be dealt to this creature, prevent that damage. Remove a +1/+1 counter." **Failure mode:
an INVULNERABLE CREATURE** if the prevention lands but the decrement does not. The decrement is the whole
slice; the prevention is the easy half.

### B3. Shuffle-into-library instead of graveyard · 5 sole · medium
Darksteel Colossus / Progenitus. Needs a hook at `moveCardToZone` — the chokepoint every zone change runs
through, so a mistake here is broad. Read the existing replacement-effect registry first.

### B4. Sunburst · 6 sole · medium
Requires tracking WHICH COLORS were spent to cast. The mana system has no such record today; that is the
real work, not the counter placement.

### B5. Mistform type-change · 5 sole · low-medium — ✅ **SHIPPED (`d1e34e10`), exactly +5**
"{1}: This creature becomes the creature type of your choice until end of turn." The size estimate was
right on the nose. Two things the scoping note did not anticipate, both recorded in `becomeCreatureType.test.js`:
- **"Becomes" REPLACES.** A new layer-4 `setCreatureSubtypes` op carrying the printed subtypes it supersedes
  (snapshotted at resolution, CR 613.1d). Mistform Sliver's "in addition to its other types" is a DIFFERENT
  effect and still parks.
- **The auto-pick had to MOVE, not be mirrored.** `autoPickCreatureType` now lives in `choicePolicy.js`, a
  zero-import leaf — the only shape shareable across the runProgram cycle. A duplicated formatter is
  harmless; a duplicated POLICY forks the sim's behaviour silently. And the activated caller must pass
  `excludePermanentId`: the source is on the battlefield, so it tallied its own type and replaced Illusion
  with Illusion — a legal activation that did nothing. Only the empty-board assertion caught it.

### B6. The GY-1 cost vocabulary tail · ~7 · low
Three carriers are blocked by unsafe timing riders — leave those. The rest are cost-shape additions to a
lane that already works.

---

## C — REFUSED / NEEDS COLTON (do not start these solo)

### C1. Foundry rail re-home (roadmap wave 3 item 10)
Stateful navigation across the app's most central, least-decomposed file, with 11 hardcoded call sites.
A previous session of mine wrote: *"fresh session, live browser QA, ideally with Colton able to eyeball it
same-day — not a 1am solo pass."* That judgment stands.

**Note the knock-on:** A2 was the prerequisite for this, and A2 has now been re-rated as needing the same
treatment. So C1 is not merely waiting on a refactor — the whole MTGAssistant surface wants Colton awake
before it is touched. Both are gated on the same thing, and neither is a solo job.

### C2. Anything touching secrets, repo visibility, or the signing keys
Standing rule, no exceptions.

---

## D — THE STANDING WORK (never runs out; use it to fill any gap)

### D1. Shelf grind, card by card
The 1.0 bar is shelf ≥90% per deck. **Measure with the REAL profile dir**, not the dev tree:
```
MTG_APP_ROOT="/c/Users/colto/AppData/Roaming/com.colton.mtg-tool" node app/scripts/measure-coverage.mjs
```
Genuinely long-tail now — 129 distinct blocking shapes across 362 unmodeled slots, biggest cluster 3. So
it is card-by-card, and Colton has explicitly said that rate is acceptable.

### D2. DEAD-CARD hunting — higher value than coverage, and invisible to the corpus number
⭐ **PAID TWICE ON 2026-07-29** — and the second one names a whole blind spot: **`tier: "land"` is assigned
to every land regardless of what it does**, so the metric can never see a dead land. Audit that works:
*top-3000 lands with no mana production AND an activated ability yielding zero legal actions* → 5 dead,
one of them (Fabled Passage #50) in three shelf decks. Re-run it after any land-side change.
**And the chain that found it:** phantom mana → "fine, but do these lands do their REAL job?". After
removing something an object was doing WRONGLY, ask what it should have been doing INSTEAD.
The Mana Vault find (three premium ramp cards offered NO ability at all) was worth more than any coverage
point, and the coverage metric could not see it. The productive method is NOT a broad "offers nothing"
probe — that flagged 18 cards and all 18 were board defects. The method that worked: take the shelf's
blocking-shape list, and for each shape ask whether the RUNTIME agrees with the CLASSIFIER.

### D3. Playability sweep at scale — ⭐ **RAN IT, AND IT PAID (2026-07-29)**
150 games: **150/150 complete, zero wedges** — but only after the one it caught. 60 games surfaced a
`dispatch-error` that turned out to be a whole CLASS: 34 instants/sorceries whose additional cost was never
enumerated because legalChoices gated cost-reading on `isHigh` while the dispatcher enforces costs
unconditionally (`b903119f`). **A cost is not an effect.** The full suite was green before, during, and
after — this is only findable by playing games.
**The sweep is now debuggable:** `--only=N` replays a single game, throws name the ACTION rather than the
decision kind, and `--only` dumps the wedging decision. Use those before writing a repro by hand.

### D3. Playability sweep at scale
Now that the harness is honest (it was scoring its own missing handlers as engine soft-locks), run it
wide — hundreds of games — and mine any genuine wedge. Each wedge is a real soft-lock and the 1.0 bar is
zero of them.
```
MTG_APP_ROOT="/c/Users/colto/AppData/Roaming/com.colton.mtg-tool" node app/scripts/playability-sweep.mjs 200 beginner commander
```

### D6. ⭐⭐ BOUND THE PHASES-PER-TURN (turn termination ≠ game completion) · ~1h · low risk
⚠️ **REWRITTEN 2026-07-29 — the first version of this item said "teach the sweep to attack" and was wrong.
The sweep already attacks** (measured: 117 `declare-attacker` picks in 12 games). The real gap is subtler
and more interesting.

**Aurelia with her once-per-turn latch removed grants 40+ extra combats in a single turn and the turn NEVER
ENDS** — driven directly, the 200-step guard exhausts at `combat/declare-attackers`. Yet the sweep reports
12/12 complete with her forced 20× into every deck, because **a non-terminating turn that kills the opponent
looks exactly like a completed game.** Lethal arrives long before any step cap.

**Build:** a per-turn phase counter with a hard bound (a real turn never needs more than a handful of
combats), reported as its own wedge class distinct from `step-cap`. Game completion and turn termination are
different properties; the sweep only measures the first.
**Failure mode:** a bound tight enough to false-positive on legitimate multi-combat cards (Aggravated
Assault chains are real Magic). Report the count, do not just assert a limit.

### D5. ⭐ TRIGGER-TIER PARITY PROBE — ✅ **BUILT (`7013f236`)**, 324 measurable / 0 divergent
`probe-classifier-runtime-parity` covers native-spell / activated / equipment and **skips native-trigger**,
the largest tier and the one where both of this run's engine bugs lived. `triggerRoutesNatively` is a
hand-written MIRROR of `buildTriggerStack`'s α1 allowlist (its own comment says so) — and this run hit five
mirror/whitelist divergences, so drift here is likely rather than hypothetical. Build: drive each
native-trigger descriptor through `buildTriggerStack` on a synthetic board and diff the verdict against the
classifier's.
The named failure mode (calling `triggerRoutesNatively` inside it) was avoided — it drives the public
`flushTriggers` instead. **A DIFFERENT one bit anyway:** the first draft reported 6 divergences, all ghosts,
because the runtime folds five different outcomes into one byte-identical `resolver:"manual"` return. It now
measures only the subset where that return can only mean a routing refusal (targetless + no intervening-if),
and reports the rest as `notSoundlyMeasurable`. Coverage witness: forcing the classifier to over-claim makes
it report 68; restored, 0.

### D4. Census re-run when a vein feels dry
`node app/scripts/build-residue-census.mjs` — 52s, and it re-ranks everything. The keyword vein is mined
out; do not re-mine it on a hunch.

---

## THE STANDING DISCIPLINE (unchanged — this is what earned the autonomy)

Full suite + `eslint . --max-warnings 0` before every commit. Mutation-check every load-bearing change and
grep for the marker afterwards. Re-measure rather than infer when two numbers disagree. Per-flip audit
anything over ~10 cards. CI green on master before tagging. **When a diagnosis and the runtime disagree,
the runtime wins** — and correct the written diagnosis in place rather than quietly rewriting it.

Sweep `memory/COMMS.md` at every boundary. Post ABOVE the first `### ` header — there is a legacy
`## LOG (newest first)` string ~670 lines down and anchoring on it buries the entry where Omnath never
reads it. Verify with `grep -n "^### " memory/COMMS.md | head -3`.
