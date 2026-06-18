# Academy Coverage Autopilot — Live Status

> **This is the "where's it at" doc.** It's rewritten after every slice so you can catch up
> instantly, even mid-run. Pause anytime by saying **"status"**, **"pause"**, or **"where are we"** —
> I halt before the next slice and summarize from here.

**Run started:** 2026-06-17 · **Mode:** FULL AUTOPILOT · **Owner:** Colton
**Goal (locked 2026-06-17):** **corpus-primary** native coverage — play almost ALL of Magic
natively, not just the sample decks. The Arbiter is the permanent, correct home for the
irreducible tail. **Honest ceiling ~90% corpus native.** The one unforgivable failure is a
false-positive (claim native, then mis-resolve) — never trade correctness for a higher number.

## Progress to goal — corpus-wide native % (`cd app && npm run coverage`)

**Goal: ~90% corpus native** (the honest ceiling; the Arbiter permanently handles the rest).
**Now: 16.0% → 18% of the way to goal.** (β-2 shipped — compound permanent-type union targets ("destroy/exile target X or Y"), +13. Crossed 16%.)

```
[####······················] 16.0% native  ·  goal 90%  ·  18% of the way there
```

| Slice | Corpus native | Δ | → goal (now ÷ 90%) | Deck % | PR |
|---|---|---|---|---|---|
| Baseline (run start) | **14.8%** (4,977/33,540) | — | 16% | 47% | — |
| metric: corpus headline | 14.8% | +0.0 | 16% | 47% | #197 |
| α1: enemy/own trigger chooser | **14.9%** (4,996/33,540) | +0.1 | 17% | 47% | #198 |
| α2: you-may optional wrapper | **15.1%** (5,066/33,540) | +0.2 | 17% | 47% | #199 |
| strip: vacuous "can't be countered" | **15.1%** (~5,071/33,540) | +0.0 | 17% | 47% | #200 |
| γ1: pay-life + self-sac costs | **15.5%** (5,193/33,540) | +0.4 | 17% | 47% | #201 |
| γ1b: sacrifice-a-creature outlet | **15.7%** (5,270/33,540) | +0.2 | 17% | 47% | #202 |
| γ1c: exile-self + remove-a-counter | **15.7%** (5,274/33,540) | +0.0 | 17% | 47% | #203 |
| β-1: creature-target restrictions | **15.9%** (5,338/33,540) | +0.2 | 18% | 47% | #204 |
| β-2: permanent-type union targets | **16.0%** (5,351/33,540) | +0.1 | 18% | 47% | #205 _(PR open)_ |

**Projected trajectory** (roadmap §2): α (near-term clean atoms) → ~37% · α+β (full vocab grind) → ~90% · +δ (hard subsystems) → ~98%. A row is appended every time a slice merges — this table *is* the climb.

## Corpus gap — the prioritization signal (top mechanisms, run-start)

| # | Mechanism | Corpus cards | (16-deck gap, for contrast) |
|---|---|---|---|
| 1 | Spell effect (other) | 8,955 | 320 |
| 2 | ETB trigger | 4,939 | 130 |
| 3 | Activated ability | 3,358 | 39 |
| 4 | Copies / other-unclassified | 2,542 | 81 |
| 5 | Upkeep/phase trigger | 2,115 | 48 |
| 6 | Attacks/blocks trigger | 2,094 | 78 |
| 7 | Static (aura/equip) | 1,289 | 32 |
| 8 | Dies/LTB trigger | 1,191 | 28 |

*Note: activated abilities are an ~86× bigger lever corpus-wide than the 16-deck sample showed —
the corpus signal re-ranks the roadmap toward the cost-structure work (γ1) sooner.*

## Slices shipped this run

| Slice | What | PR | Corpus Δ |
|---|---|---|---|
| metric | corpus-primary headline (`allCards()` + corpus pass) | #197 (merged) | — (tooling) |
| α1 | enemy/own trigger-target chooser — un-gates counter + removal triggers, fixes the friendly-target hazard | **#198 merged** | +19 cards (14.8→14.9%) |
| α2 | "you may <effect>" optional wrapper — suspend/resume yes-no, expert/AI auto-take | **#199 merged** | +70 cards (14.9→15.1%) |
| strip | drop the vacuous "this spell can't be countered" rider | **#200 merged** | +5 cards (≈15.1%) |
| γ1 | no-choice activated-ability costs — "Pay N life" + "Sacrifice this"; self-sac fires dies triggers (aristocrats payoff) | **#201 merged** | +127 cards (15.1→15.5%) |
| γ1b | "Sacrifice a/another <type>" outlet — per-victim action expansion (no new picker), victim fail-safe reused | **#202 merged** | +77 cards (15.5→15.7%) |
| γ1c | exile-self + remove-a-counter costs (batched) — the end of the clean cost frontier | **#203 merged** | +4 cards (≈15.7%) |
| β-1 | creature-target restrictions — color/type negation + combat state (Doom Blade, Go for the Throat, Divine Verdict) | **#204 merged** | +64 cards (15.7→15.9%) |
| β-2 | compound permanent-type union targets ("destroy/exile target X or Y") — Mortify, Wrecking Ball, Demolish | **#205 (PR open)** | +13 cards (15.9→16.0%) |

## Cost-atom frequency (the data behind the γ-series, scanned over the real corpus)

Among activated-ability cost items the parser couldn't yet pay: **Sacrifice a/other 724** (γ1/γ1b) ·
Discard 310 (picker — deferred) · Exile 278 (γ1c — but only ~4 have a HIGH effect) · Remove a counter
253 (γ1c — 54 modeled, but mostly on cards with OTHER unmodeled text) · Tap a creature 163 (convoke-ish,
needs a picker) · {X} 157 · {E}/{S}/{Q} symbol-mana. **Lesson:** sacrifice was the one big clean cost
lever; the rest are either picker-gated (Discard, Tap-a-creature) or sit on complex cards (Exile, Remove-
counter). The cost frontier is now low-ROI — pivot to the spell-effect vocabulary grind.

## In flight / next

- **β-2 — compound permanent-type union targets: BUILT + in review (PR #205, branch
  `feat/beta2-permanent-type-unions`).** Extends the #192 permanent-removal path with five "X or Y" type
  unions (creatureOr{Enchantment,Land,Artifact}, artifactOrLand, enchantmentOrLand — Mortify, Wrecking
  Ball, Demolish, Angelic Edict). Four coordinated points: the matcher (unions before singles), TT map,
  `PERMANENT_TARGET_TYPES` (trigger flush → Arbiter), `PERMANENT_PREDICATES`. "creature or planeswalker" +
  riders → Arbiter; DFCs skipped (inherited); creature-via-union still feeds the dies look-back. Full
  suite green (+5 pins) · lint clean · corpus 15.9 → 16.0% (**+13**) · sweep 0 false-positives.
  - **LIVE-QA CATCH (fixed in-slice):** the single-atom CAST path used the legacy `parseSpellEffect`,
    whose `destroy target …` matched any phrase containing "creature" as creature-only — so a union's
    enchantment/land half was dropped from the cast options (Mortify offered only the creature). Fixed:
    the legacy match excludes a "creature or"/"or creature" union → routes to expandCastChoices via the
    program union atom; both halves now offered (verified live). **Lesson: the single-atom cast path has a
    second (legacy) target enumerator — a new program-level targetType must verify the LIVE cast path,
    not just enumerateTargets.**
  - **Adversarial review (3 lenses, Opus): MERGE (concerns/merge-but-note) — no P0, no false-positive,**
    CR-safe (verified vs the full 37,474-card corpus + live cast/trigger paths). Two honest P2 notes
    (non-blocking, recorded): (a) the `PERMANENT_TARGET_TYPES` trigger-gate is DEAD code — the live trigger
    flush is now gated by the α1 enemy-aware chooser (a union-removal trigger routes to an enemy or
    NO_SAFE_TARGET→Arbiter, NOT via the #192 helper); the misleading test/comment were corrected. (b) a
    SAFE AI play-quality regression — the legacy-exclusion nulls `effect`, so the AI now HOLDS the 5 union
    cards (it cast them pre-β-2); consistent with #192's "AI holds permanent removal", deferred to a
    future "teach the AI to cast union/permanent removal" slice. Pre-existing (NOT β-2): a comma-list
    multi-type "destroy target artifact, creature, or enchantment" (Bedevil/Vindicate, 9 cards) still
    offers creatures only — a clean follow-up to widen the legacy exclusion to any "or"/comma type list.
  - **Merge gate:** review SAFE + CI green, then `gh pr merge --squash`.
## β PHASE — the spell-effect vocabulary grind (SCOPED, ready to build)

The clean COST frontier is mined out. The biggest remaining bucket is **Spell effect (other) — ~7,028
unmodeled instants/sorceries** (of 7,595 total). **Scan finding (the key insight): the gap is NOT new
verbs — it's the TARGET vocabulary.** The removal verbs are already modeled; a RESTRICTED or COMPOUND
target drops the whole spell to LOW:

| Cause | Example (LOW) | vs modeled (HIGH) |
|---|---|---|
| compound type "X or Y" | Hero's Downfall `Destroy target creature or planeswalker` | Murder `Destroy target creature` |
| combat-state restriction | Immolating Glare `Destroy target attacking creature` | — |
| negated type | Doom Blade `Destroy target nonblack creature` | — |

**Ranked β atoms (unmodeled single-clause removal by target phrase):** attacking/blocking creature **24**
(combat-state filter) · creature-or-planeswalker **13** (needs planeswalker-as-target) · compound
permanent types — creature-or-enchantment 5, artifact-or-enchantment 3, creature-or-Vehicle 3,
artifact-or-land 2 (**~13, the cleanest — both halves are already-modeled permanent types, no new zone/
state**) · negated types (nonblack/nonland/etc.) ~12 · graveyard-card targets ~15 (return-from-gy variants).

**Recommended β-1 (cleanest first atom): compound permanent-type targets** (`target X or Y` where both
are modeled permanent types — artifact/enchantment/creature/land). One target-parser extension (accept a
type UNION) + enumerator (offer permanents matching either type) + confirm the resolver is type-agnostic.
A force multiplier — un-gates destroy/exile/return/bounce/tap with those targets at once. Then combat-
state targets, then negated types, then planeswalker-as-target (the biggest, needs the engine to model
planeswalkers as targetable permanents). ETB triggers (4,879) share the same target/effect lever.

**This is a bigger, more intricate phase than the cost atoms** (each atom touches the target parser +
the legalChoices/targeting enumerator + verification that resolvers are type-agnostic) — no trivial
1-cycle first win. Best built in a FRESH session for clean context; this scoping + the ranked list is the
handoff. Re-run `npm run coverage` + the verb/target scans first (the frontier shifts as atoms land).
**Sweep discipline (γ1c lesson): when verifying a β slice, also check for DROPPED compound text — a
target/clause the parser silently ignored — not just self-reference.**
- **Backlog (found during γ1 review — pre-existing, NOT γ1's regression):** the trigger detector
  **collapses a COMPOUND trigger** ("When this enters OR leaves the battlefield" / "…AND when you
  sacrifice it") to a single event and drops the rest. γ1 no longer exposes it (a self-sac on such a
  card is now `modeled:false`), but a card like Mouser Foundry still drops its leaves-the-battlefield
  token when it dies in combat / is destroyed, and a pure compound-trigger creature can mis-count as
  native-trigger. A future **trigger slice** should either model LTB / "when you sacrifice" / compound
  events or make `allTriggerSentencesModeled` reject an un-split second condition (route the whole card
  to the Arbiter). Safe-but-real false-positive in the trigger subsystem.

## The cardinal rule

False-negative (route to Arbiter) = **safe**. False-positive (claim native, then mis-resolve) =
**forbidden**. When unsure → route to the Arbiter and move on.
