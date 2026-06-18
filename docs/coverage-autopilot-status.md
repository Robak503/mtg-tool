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
**Now: 15.7% → 17% of the way to goal.** (γ1b shipped — "Sacrifice a/another <type>" outlets, +77 cards. The aristocrats sacrifice engine is now playable.)

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
| γ1b: sacrifice-a-creature outlet | **15.7%** (5,270/33,540) | +0.2 | 17% | 47% | #202 _(PR open)_ |

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
| γ1b | "Sacrifice a/another <type>" outlet — per-victim action expansion (no new picker), victim fail-safe reused | **#202 (PR open)** | +77 cards (15.5→15.7%) |

## Cost-atom frequency (the data behind the γ-series, scanned over the real corpus)

Among activated-ability cost items the parser couldn't yet pay: **Sacrifice a/other 724** (γ1b) ·
Discard 310 · Exile 278 · Remove a counter 253 · Tap a creature 163 · {X} 157 · {E} 59 · Return 50.
Sacrifice-as-cost is ~3× the next item — γ1 (self-sac) + γ1b (a-creature) take the lion's share.

## In flight / next

- **γ1b — "Sacrifice a/another <type>" outlet: BUILT + in review (PR #202, branch
  `feat/gamma1b-sacrifice-a-creature`).**
  - **What it does:** `parseAbilityCost` recognizes `Sacrifice a/an/another <creature|permanent|
    artifact|enchantment|land>` → `{sacOther}`. The CHOICE (which permanent) is modeled WITHOUT a new
    picker: `legalChoices` expands one action per legal victim (a permanent you control of the type;
    source excluded when "another"). The shared `sacrificePermanentForCost` sacrifices the chosen victim
    (creature → dies triggers, flushed above the ability). The γ1 `sacrificeDropsTrigger` fail-safe is
    **reused on the victim** — a victim whose sacrifice would drop its own leave/compound trigger is
    excluded. Multi-sacrifice (count > 1) / compound types still drop to null (deferred).
  - **Gauntlet (all green):** full suite **2,074** (+7 γ1b pins: per-victim expansion, "another"
    excludes source, victim fail-safe, dispatch sacrifices the CHOSEN one, Blood-Artist payoff) · lint
    clean · **corpus sweep = 84 native sacOther outlets, 0 false-positives** (Nantuko Husk, Fallen
    Angel, Atog, Razaketh, Viscera-Seer family; no effect references the sacrificed victim) · real-card
    e2e (Nantuko Husk offers all victims, sacrifices the chosen creature, source stays).
  - **Adversarial review (3 lenses, Opus): found + FIXED a real P0** — the victim fail-safe missed the
    CR 700.4 dies-EQUIVALENT wording "is put into [a/your] graveyard from the battlefield" (+ the exile
    variant), which the dies detector also misses (it keys on the literal word "dies"). Sacrificing such
    a creature (Brood of Cockroaches, Psychomancer, Triumph of Saint Katherine) silently dropped its
    death trigger — a partial application. Closed in `sacrificeDropsTrigger` (now trips on that wording,
    matches trigger clauses regardless of an ability-word/reminder prefix, reads the raw oracle) — shared
    with γ1's self-sac, so both paths are fixed. All 81 corpus self-triggers of this shape now flagged
    (was missing 18). Also filtered the pointless sac-the-thing-you-target action (the review's P2; not a
    false-positive — it cleanly no-ops). Commit 691c3e9.
  - **Merge gate:** review SAFE after the fix + CI green, then `gh pr merge --squash`.
- **Next slice (re-scan first):** the cost frontier continues — the cleanest no-UI next atoms are
  **exile-as-cost** (278; "Exile this" mirrors self-sac, reuse the leave-trigger fail-safe) and
  **remove-a-counter** (253; often from the source = no choice). **Discard-a-card** (310) needs a
  hand picker (a bigger UI slice). Or pivot to the huge **spell-effect (other)** tail (8,863). Re-run
  `npm run coverage` + a fresh cost/gap scan before picking — the best next atom shifts each slice.
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
