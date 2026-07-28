# RUN-LEDGER — live resume anchor for the long build run

> **The work queue lives in [NEXT-QUEUE.md](NEXT-QUEUE.md)** — roadmap v2 is cleared, and that file is its
> successor. It is sequenced so risky work happens while sharp and mechanical work is available late.

> **If you are a fresh session picking this up after a crash, timeout, or context loss: READ THIS FILE
> FIRST, then `docs/orchestration/WAKE-REPORT.md`.** This file is rewritten at every slice boundary and is
> the single source of truth for what is in flight. Everything above the `---` is current; everything below
> is the completed trail.
>
> Rebuild your footing in four commands:
> ```
> git fetch origin && git log --oneline -8 origin/master
> git status --porcelain                       # must be clean, or finish/discard what's dirty
> grep -rl MUTANT app/src/ | head              # MUST be empty — a crash mid-mutation leaves sabotage
> cd app && npm test && npx eslint . --max-warnings 0
> ```
> If `MUTANT` appears anywhere in `app/src/`, a mutation check was interrupted. Restore that line to its
> pre-mutation form before doing anything else — the tests will be lying until you do.

## THE OBJECTIVE (Colton, 2026-07-27)

Work continuously, no status reports, cutting `v0.149.x` releases as work lands. **Corpus % is NO LONGER
the target — the deck SHELF is.** The 1.0 bar is shelf ≥90% native per deck.

Full authority granted: cut releases freely, choose the work, no check-ins. Stop only for something that
needs Colton's hands, touches secrets, or would ship a guess.

## THE TARGET — the real shelf, measured

Measure with the REAL profile dir, not the dev tree:
```
MTG_APP_ROOT="/c/Users/colto/AppData/Roaming/com.colton.mtg-tool" node app/scripts/measure-coverage.mjs
```

At run start: Slivers 100 · Vihaan 96 · Omnath 93 · Zaxara 90 · Mothman 90 · **Earth Bent 80 · cdh 79 ·
Dragons 76 · Jurassic 75 · Believe it 72 · Kellan 70 · Wolverine 70 · Captain America 69 · Kinnan 69.**

Blocking mechanisms, ranked by that same tool: 97 spell-effect · 78 ETB trigger · 35 attacks/blocks ·
33 upkeep/phase · 27 activated · 16 cast trigger · 15 static anthem · 11 aura/equip · 9 dies/LTB.

**Prefer mechanisms that appear across MULTIPLE decks** — one ETB pattern can move four decks at once.
That is the whole reason this target beats corpus %.

## THE DISCIPLINE (non-negotiable — this is what earned the autonomy)

1. Full suite + `eslint . --max-warnings 0` before every commit. Not the targeted tests — the FULL suite.
   It has caught things targeted runs could not (a dropped `"backup"` that silently un-credited 19 cards).
2. **Mutation-check every load-bearing change.** Break it on purpose, watch the RIGHT test fail, restore.
   A green test proves nothing until it has been seen to fail. Grep for the marker afterwards — a perl
   substitution has silently failed to apply before.
3. **Re-measure, don't infer.** When a flip count and a corpus delta disagree, isolate by disabling only
   that change and re-measuring. Twice this run the gap was innocent; assuming would have been wrong both times.
4. **Per-flip audit** anything over ~10 cards. Read the cards.
5. CI green on master before tagging. Never tag a red tree.
6. When a diagnosis and the runtime disagree, **the runtime wins** — and correct the written diagnosis in
   place rather than quietly rewriting it.

## IN FLIGHT

- **Nothing mid-edit.** v0.149.7 tagged and building. Corpus **35.0%** (11,950). Suite 861 / 11,119.

## NEXT ACTIONS

1. **Activation-timing vocabulary, continued.** The rider itself is the sole blocker on 123 cards
   (measured honestly — strip ONLY the rider, not the whole ability line; deleting the line conflates
   "the rider blocks" with "the ability blocks" and gives a much larger, wrong number). Shipped:
   "before attackers are declared" (+21). Remaining, by size:
   - `only during your upkeep` (11) — needs the offer window WIDENED to the upkeep step. The gate is
     `state.step !== "main"`, so an upkeep-only ability is currently never offerable at all. A widening,
     not a narrowing — so it needs more care than the last one.
   - `only if this creature attacked this turn and only once each turn` (10) — the once-limit already
     exists (`activationLimit`); check whether an attacked-this-turn flag is on the permanent.
   - `only if there are seven or more cards in your graveyard` (6) — a board-count condition.
2. **A3 Forge wiring** — ownership into the bench context (assumption stated in NEXT-QUEUE).
3. Shelf grind / dead-card hunting (section D of NEXT-QUEUE).

## WHAT THE SWEEP IS FOR — it found the run's best bug

Running `playability-sweep.mjs` at 150 games surfaced a real SOFT-LOCK (a tutor finding nothing wedged
~6% of human-path games) that no unit test could have caught, because every tutor fixture supplies
candidates. **Re-run it after any engine change to the decision path.** If it reports a catastrophe,
suspect the harness first — it has been wrong that way before.

## A POSTING BUG WORTH NOT REPEATING

COMMS entries live directly under the 4-line file header (line ~6). There is a legacy
`## LOG (newest first)` string ~670 lines down; anchoring a post on THAT buries the entry mid-file where
Omnath never reads it. Three of my entries went into that hole before Colton's screenshot of his idle loop
exposed it. **Post above the first `### ` header, and verify with `grep -n "^### " | head -3`.**

## PROBE LESSONS FROM THIS RUN — do not re-learn these

- **A probe that reports a big number is a claim about the PROBE** until each hit is explained. The
  shelf dead-card probe flagged 18; all 18 were board defects (ninjutsu casts from hand, "destroy target
  artifact" with no artifact on the board, Treasure-sacrificers with no Treasures).
- **The playability-sweep was scoring its own missing handlers as engine soft-locks** — it said 4/12
  games finish. With `unresolved` (the Arbiter escape hatch) and `soft-counter` handled: 24/24, zero
  wedges. Fixed. If it reports a catastrophe again, suspect the harness first.

## BLOCKED / REFUSED — do not restart these blind

- **Foundry rail re-home** — REFUSED solo. Needs live browser QA with Colton available same-day. Do the
  MTGAssistant decomp first regardless; the re-home is not a solo-at-2am change.
- **Layer-2 control** (28 cards) — control is represented STRUCTURALLY here (the permanent moves between
  battlefield arrays; 628 sites read `.controller`). Needs move-and-revert that can never miss a path, or
  it becomes permanent control theft. Scoped in the triage ledger. Take it EARLY in a run, never late.
- **Learn keyword** — uncredited on an UNCERTAIN rule reading, deliberately. Do not credit it without
  checking the actual rule.

---

## COMPLETED TRAIL (newest first)

- `d7148fa3` — v0.149.5: graveyard-ability composition (+14). Slice 56.
- v0.149.4 — devour/amplify, fuse unpark, aftermath unpark (+22). Slices 53–55.
- v0.149.3 — assist/casualty/provoke/ripple, training (+23). Slices 51–52.
- v0.149.2 — play-lands-from-graveyard, enters-tapped type set, dethrone, squad, the optional-mode
  family (+36), enlist/extort, unleash. Slices 44–50.
- v0.149.1 — firebending + end-of-combat held mana, split second, self-power block gate. Slices 41–43.
