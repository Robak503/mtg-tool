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
**Now: 15.7% → 17% of the way to goal.** (γ1c shipped — exile-self + remove-a-counter costs, +4. The clean COST frontier is now mined out; next is the spell-effect vocabulary grind.)

```
[####······················] 15.7% native  ·  goal 90%  ·  17% of the way there
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
| γ1c: exile-self + remove-a-counter | **15.7%** (5,274/33,540) | +0.0 | 17% | 47% | #203 _(PR open)_ |

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
| γ1c | exile-self + remove-a-counter costs (batched) — the end of the clean cost frontier | **#203 (PR open)** | +4 cards (≈15.7%) |

## Cost-atom frequency (the data behind the γ-series, scanned over the real corpus)

Among activated-ability cost items the parser couldn't yet pay: **Sacrifice a/other 724** (γ1/γ1b) ·
Discard 310 (picker — deferred) · Exile 278 (γ1c — but only ~4 have a HIGH effect) · Remove a counter
253 (γ1c — 54 modeled, but mostly on cards with OTHER unmodeled text) · Tap a creature 163 (convoke-ish,
needs a picker) · {X} 157 · {E}/{S}/{Q} symbol-mana. **Lesson:** sacrifice was the one big clean cost
lever; the rest are either picker-gated (Discard, Tap-a-creature) or sit on complex cards (Exile, Remove-
counter). The cost frontier is now low-ROI — pivot to the spell-effect vocabulary grind.

## In flight / next

- **γ1c — exile-self + remove-a-counter costs: BUILT + in review (PR #203, branch
  `feat/gamma1c-exile-removecounter-costs`).** `parseAbilityCost` → `{exileSelf, removeCounter:{type}}`.
  Exile-self mirrors self-sac (exile is NOT "dies" → no dies trigger; shares the leave-trigger fail-safe;
  the `$` anchor excludes "Exile this card from your graveyard"). Remove-counter is offered only when the
  source HAS the counter; a lethal +1/+1 removal runs the SBA + dies triggers. Full suite **2,086** (+8
  pins) · lint clean · sweep **0 false-positives** · **only +4 native** (most exile/remove-counter
  abilities sit on cards with other unmodeled text — the machinery is laid, the whole card isn't native).
  - **Merge gate:** 3-lens adversarial review (Opus) + CI green, then `gh pr merge --squash`.
- **Next slice — PIVOT to the spell-effect vocabulary grind (β).** The clean COST frontier is mined out
  (γ1/γ1b took the sacrifice volume; the rest is picker-gated or on complex cards). The biggest remaining
  bucket by far is **Spell effect (other) — 8,863 cards**: instants/sorceries whose effect the
  EffectProgram parser doesn't yet model. Re-run `npm run coverage`, then scan the unmodeled
  instant/sorcery effects for the highest-frequency UNMODELED verb/clause (a clean atom: a new effect-atom
  + parser clause + the all-or-nothing gate), and grind those. ETB triggers (4,879) share the same
  effect-vocabulary lever. This is where the next ~30 points of corpus coverage live.
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
