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
**Now: 15.5% → 17% of the way to goal.** (γ1 shipped — no-choice pay-life + self-sacrifice activated-ability costs, ~+130 cards. The biggest single-slice jump of the run so far.)

```
[####······················] 15.5% native  ·  goal 90%  ·  17% of the way there
```

| Slice | Corpus native | Δ | → goal (now ÷ 90%) | Deck % | PR |
|---|---|---|---|---|---|
| Baseline (run start) | **14.8%** (4,977/33,540) | — | 16% | 47% | — |
| metric: corpus headline | 14.8% | +0.0 | 16% | 47% | #197 |
| α1: enemy/own trigger chooser | **14.9%** (4,996/33,540) | +0.1 | 17% | 47% | #198 |
| α2: you-may optional wrapper | **15.1%** (5,066/33,540) | +0.2 | 17% | 47% | #199 |
| strip: vacuous "can't be countered" | **15.1%** (~5,071/33,540) | +0.0 | 17% | 47% | #200 |
| γ1: pay-life + self-sac costs | **15.5%** (5,193/33,540) | +0.4 | 17% | 47% | #201 _(PR open)_ |

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
| γ1 | no-choice activated-ability costs — "Pay N life" + "Sacrifice this"; self-sac fires dies triggers (aristocrats payoff) | **#201 (PR open)** | ~+130 cards (15.1→15.5%) |

## In flight / next

- **γ1 — no-choice activated-ability costs: BUILT + in review (PR #201, branch
  `feat/gamma1-life-sac-costs`).**
  - **What it does:** `parseAbilityCost` now accepts two non-mana, no-decision cost items beside the
    mana+`{T}` allowlist — **`Pay N life`** (deduct N life; offered only when `life >= N`) and
    **`Sacrifice this[ permanent]`** (sacrifice the source; a creature → graveyard fires dies triggers
    — the aristocrats payoff — flushed above the ability). Detection relaxed so a pure word-cost line
    (no `{…}`) is recognized; choice-bearing `Sacrifice a creature` / `Discard a card` still drop to
    null (deferred to **γ1b** with a picker). Mirrored in `coverage.isActivatedAbilityLine` via the
    now-shared `parseAbilityCost`.
  - **Gauntlet (all green):** full suite **2,063** (new γ1 parser pins + a dispatch/resolution suite:
    life deducted, source → graveyard, real-card dies-trigger payoff, affordability gate) · lint clean ·
    **corpus sweep = 1000 γ1-cost cards, 441 native, 0 false-positives** (every flip a genuinely-modeled
    effect; the 4 "its owner's hand" flags are target refs, not source refs) · real-card e2e (Brindle
    Boar sacrifices for +4 life end-to-end).
  - **Adversarial review (3 lenses, Opus): found + FIXED one P1** — γ1's self-sac flipped two real
    cards with a COMPOUND/leave trigger (Carrot Cake, Mouser Foundry) into live-playable, where the
    sacrifice silently dropped half a trigger (a partial application — the cardinal sin). Closed at the
    single source of truth: `sacrificeDropsTrigger` leaves a self-sac `modeled:false` when the card
    carries an LTB / "when you sacrifice" / compound trigger, so the WHOLE card routes to the Arbiter
    (both runtime + metric mirror via `ab.modeled`). Verified: both cards now offer no self-sac; a
    normal "When this dies" outlet is NOT over-blocked; post-fix sweep = 200 native self-sac cards, 0
    leak-risk. The other two lenses returned clean (the P2 DFC nit also fixed). Commit 3e82d2d.
  - **Merge gate:** review SAFE + CI green, then `gh pr merge --squash`.
- **Next slice (re-scan first):** the cost-structure frontier continues — **γ1b** (`Sacrifice a
  creature` / `Discard a card` as costs, needs a sacrifice/discard PICKER UI, like α2's yes-no), then
  the rest of the corpus activated-ability + spell-effect gap. Re-run `npm run coverage` + a fresh gap
  scan before picking — the best next atom shifts as the modeled set grows.

## The cardinal rule

False-negative (route to Arbiter) = **safe**. False-positive (claim native, then mis-resolve) =
**forbidden**. When unsure → route to the Arbiter and move on.
