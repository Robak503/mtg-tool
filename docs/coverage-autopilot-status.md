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
**Now: 15.1% → 17% of the way to goal.** (α2 shipped — the "you may" optional wrapper, +70 cards.)

```
[####······················] 14.9% native  ·  goal 90%  ·  17% of the way there
```

| Slice | Corpus native | Δ | → goal (now ÷ 90%) | Deck % | PR |
|---|---|---|---|---|---|
| Baseline (run start) | **14.8%** (4,977/33,540) | — | 16% | 47% | — |
| metric: corpus headline | 14.8% | +0.0 | 16% | 47% | #197 |
| α1: enemy/own trigger chooser | **14.9%** (4,996/33,540) | +0.1 | 17% | 47% | #198 |
| α2: you-may optional wrapper | **15.1%** (5,066/33,540) | +0.2 | 17% | 47% | _PR open_ |

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

## In flight / next

- **α1 — enemy/own-aware trigger-target chooser: SHIPPED (merged to master, #198).**
  Adversarial review (3 lenses) returned unanimous SAFE; the one P3 (stale JSDoc) was fixed.
  - **What it does:** replaces the trigger-flush `firstLegalChoice` with an intent-aware chooser —
    `deal-damage`/`destroy`/`exile`/`counter`/`tap`/negative-pump pick an *enemy*; own-side buffs
    pick the controller's own; *ambiguous* atoms (bounce) route to the Arbiter. Flips the flush gate
    from a 2-item denylist to an allowlist, mirrored in `coverage.triggerRoutesNatively`.
  - **Also closes a latent on-master false-positive:** unrestricted harmful triggers
    (creature-destroy / `deal-damage` with no "an opponent controls" clause) used to first-legal a
    friendly; they now target an enemy.
  - **Gauntlet (all green):** 2,047 unit tests (incl. the friendly-target regression, counter-an-
    enemy-spell, an end-to-end) · lint clean · corpus sweep = 23 newly-native (all removal/counter
    triggers — Angel of Despair, Mystic Snake, Meteor Golem, …) + 3 correctly-gated bounces (Aether
    Adept, Man-o'-War, Mist Raven), 0 false-positives, 0 cast regressions · live real-enrichment QA
    on real cards (Angel destroys the enemy permanent; Mystic Snake counters the enemy spell).
  - **Merge is human-gated** (guardrail): `/code-review ultra` can't be launched from here, so the
    adversarial pass ran in-process — per the autopilot rules a fallback review doesn't auto-land.
- **Next slice (data-driven re-scan):** the corpus gap points at activated abilities (3,358) + the
  cost-structure work (γ1 — sacrifice / discard / pay-life / {X}; the aristocrats unlock).

## The cardinal rule

False-negative (route to Arbiter) = **safe**. False-positive (claim native, then mis-resolve) =
**forbidden**. When unsure → route to the Arbiter and move on.
