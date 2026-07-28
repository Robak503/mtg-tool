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

- **Nothing mid-edit.** Corpus **35%** (11,990). Suite **864 files / 11,156 tests**, lint 0.
- **PR #439 open** (5 commits: precombat timing, ledger, boast, activation conditions, delirium+formidable).
  CI was green on the first four; the fifth is building. Merge when green, then tag.
- Shelf re-measured this pass: **aggregate 78% across 16 decks** — Slivers 100 · Vihaan 96 · Omnath 93 ·
  Zaxara 90 · Mothman 90, then the tail: Earth Bent 80 · cdh 79 · Dragons 76 · Jurassic 75 · Believe it 72 ·
  Kinnan 71 · Kellan 70 · Wolverine 70 · Captain America 69 · Hulk Smash 68 · **Halfshell heroes 56**.

## WHAT SHIPPED THIS STRETCH — the activation-restriction vocabulary

Three riders the engine parsed straight past, so every carrier parked. All three now flag-then-enforce:

1. **`before attackers are declared`** (+21) — a NARROWING to the precombat main. Two sibling riders are
   safely stripped as implied; this one is not, because `step === "main"` spans BOTH mains and the
   postcombat one is after attackers. Refused the opponent's-turn form (disjoint windows).
2. **BOAST, CR 702.135** (+10) — needed a PER-PERMANENT attacked flag. The seat-level Raid flag already
   existed and reading it would have been the one-line build; it is also a materially stronger card.
3. **`Activate only if <cond>`, CR 602.5d** (+23) — added a THIRD probe to the existing interveningIf
   family rather than a second condition language. Trigger / spell / activation lanes now share ONE
   vocabulary, so every future reader reaches all three at once.
4. **DELIRIUM + FORMIDABLE readers** (+7) — the first slice that compounding paid for.

**Three CREED pins fired against my own work and graduated on evidence**, each with the reason recorded in
place rather than edited away. All four seams of every slice were mutation-checked.

## ❌ RETRACTED — the "trailing conditional clause" lever does not exist (I was wrong, same session)

I banked a 121-card lever here and it was **wrong**. Retracted rather than deleted, because the mistake is
more useful than the entry was.

**The claim:** the parser handled the LEADING conditional rider (`If <cond>, <effect>`) but not the TRAILING
form (`<effect> if <cond>`), and 121 parked cards carried the trailing form — the biggest lever of the run.

**The runtime disagreed, and the runtime wins.** The trailing form is ALREADY implemented — BLITZ CD-2, in
`effects/parser.js`, directly beneath the leading peel, with the same shared gate and guards. Verified live:

```
Draw a card if you have no cards in hand.  -> high  [{op:"draw", amount:1, condition:"you have no cards in hand"}]
Draw three cards if a creature died this turn. -> high [{op:"draw", amount:3, condition:"a creature died this turn"}]
```

**What my probe actually measured**, versus what I read it as:
- measured: parked cards CONTAINING a trailing-if clause whose condition is readable.
- read as:  cards that WOULD FLIP if the trailing form were built.
Those 121 cards park for reasons ELSEWHERE ON THE CARD. The trailing clause was never their blocker.

**This is the probe-instrument law biting a second time this run** — a probe reporting a big number is a
claim about the PROBE until each hit is explained. The cheap check I skipped: parse one example clause and
look at the output. It took under a minute once I finally did it, and it would have saved the whole banked
entry. **Before banking any lever, parse one real example and confirm the gap is real.**

Corollary worth keeping: a "would flip if X" probe must actually SIMULATE X (strip the blocker, re-classify)
— which is exactly what the alternative-cost probe did correctly ten minutes earlier, and it cheaply killed
that direction by showing only 2 of 14 would flip. Same session, right method and wrong method side by side.

## THE SHELF TAIL IS GENUINELY CARD-BY-CARD — measured, not assumed

I ran a SOLE-BLOCKING-SENTENCE sweep over every parked deck card: remove one sentence at a time, re-classify,
and record the sentence whose removal flips the card. 320 parked cards, **105 with a single identifiable
blocking sentence — and essentially every one is a singleton.** The top blocker unblocks 2 deck slots. There
is no cluster left.

**So Colton's guess was right: from here the shelf moves card by card.** That is a finding, not a
complaint — it means the remaining work is small, safe, individually auditable, and does not need a big
lever. It also means nobody should go looking for one again; the search is done and this is the answer.

Probe: `scratchpad/sole-sentence.mjs` (the method is the correct one — simulate the fix and re-classify).

## BANKED WITH SCOPE — group-granted WARD (4 corpus cards, ~0 deck slots)

Ward on a creature ITSELF is fully modeled, both cost forms. Bare-keyword GROUP grants work. The gap is
ward specifically inside a group grant, because ward carries a COST and so cannot be a bare member of
`GRANTABLE_STATIC_KEYWORDS`.

Good news, and the reason this is scoped rather than open: **the runtime already supports granted ward.**
`layers.permanentGrantedWardCosts` reads layer-6 `addWard` effects and `ward.js` unions them with printed
ward at the tax site. So this is a PARSER-emission gap, not an enforcement gap — no false-positive risk in
crediting it, provided only the fixed-generic form is emitted (which is all the layer op represents).

Why I did not build it at depth: the four carriers print four DIFFERENT selector shapes — "Other creatures
you control", "Other artifacts you control", "Artifacts you control", "Beasts and Birds you control" — which
means an arm in each shape's handler inside a 4,000-line parser. And the only card worth deck slots
(Hexing Squelcher, 2 slots) prints the LIFE form, which the layer op cannot represent, so it would not flip
even after the work. **~4 corpus cards, ~0 deck slots, medium blast radius.** Correct trade is to leave it.

If someone takes it: mirror the COUNTER-GATED GROUP WARD emission (staticAbilityParser ~line 2012) — it is
the exact pattern, already correct, already refusing the colored/{X}/life forms for the same reason.

## ⭐ VERIFIED LEVER — reminder-defined ABILITY-CARRYING TOKENS (68 cards) — take this FIRST

**68 parked cards would flip.** Measured by simulation (remove the create-token line, re-classify), and —
unlike the lever I retracted earlier tonight — **the premise was verified by parsing real clauses before
banking it.** That check is the whole difference between this entry and that one:

```
Create a Treasure token. (It's an artifact with "{T}, Sacrifice this token: Add one mana of any color.")
   -> high  create-named-token token:"treasure"          NAMED, in the registry
Create a Food token.     (It's an artifact with "{2}, {T}, Sacrifice this token: You gain 3 life.")
   -> high  create-named-token token:"food"              NAMED, in the registry (and NOT a mana ability)
Create a Mutagen token.  (It's an artifact with "{1}, {T}, Sacrifice this token: Put a +1/+1 counter ...")
   -> low   []                                            NOT in the registry -> parks
```

**The gap is not "non-mana abilities" — it is "not in the hardcoded named-token registry."** Food proves
non-mana abilities are fine when the token is known. What is missing is synthesizing an ARBITRARY token from
the reminder text that fully defines it.

**Why this is tractable rather than open-ended:** the T4 machinery already exists. `tokens.js` mints a token
carrying `atom.tokenOracle` as its real oracle, and every downstream subsystem then drives it like a printed
permanent — `manaProduction`, `legalChoices`, the dispatcher, all with no special-casing. Today that path is
gated by `parser.parseTokenManaAbility` (slice 1: clean mana abilities only). **The work is widening that
gate to any cleanly-parsing activated ability, not building a new path.**

Guards to keep, in the existing grain: synthesize ONLY when the token's type line, P/T, and its ability ALL
parse cleanly; anything partial parks the whole card (CREED). A reminder that defines a TRIGGERED ability is
a separate slice.

**Why I did not build it at depth: 68 flips is over the per-flip-audit threshold** (~10) and this is a
subsystem extension. Take it first in a fresh session, audit the flips in batches with the card text in
front of you, and re-run the sweep after.

Probe: `scratchpad/tokenoracle.mjs`. Examples: Michelangelo · Peregrin Took · April O'Neil · Arbalest
Engineers · Koilos Roc · Zoo Escapees.

## NEXT ACTIONS

1. **Bloom Tender / Faeburrow Elder** — "For each color among permanents you control, add one mana of that
   color." Only 2 corpus cards but **3 deck slots**, and Bloom Tender is a cEDH staple in Kinnan. The
   `colorsAmongPermanents` primitive ALREADY EXISTS in layers.js; this needs the color SET, not the count,
   plus a mana atom. Contained, no choice point. **This is the next build.**
2. **BANKED WITH A DESIGN QUESTION — `Tap N untapped creatures you control` as a cost** (39 corpus / 32
   parked; plus 40/28 for the singular). The SINGULAR is already fully modeled (γ1f, Earthcraft):
   parser → legalChoices expands one action per legal creature → dispatcher taps it. **The plural is NOT a
   simple generalization.** Enumerating N-combinations explodes legalChoices — 45 actions for two-of-ten,
   120 for three. The real choice is: enumerate combinations (correct, explosive) vs. auto-pick a
   deterministic set (legal, no explosion, silently removes player agency the singular case has). I did NOT
   guess at depth. Decide this one while sharp.
3. **Upkeep-only activation** (11) — still needs the offer window WIDENED, not narrowed. Riskier than
   anything above; take it EARLY in a run.
4. Shelf grind: 321 unmodeled non-land deck cards across 360 slots. The leverage head (2+ decks) is
   Wan Shi Tong ×3 · Chrome Mox ×3 · Mindbreak Trap ×3 · Bloom Tender ×3 · Teferi's Protection ×3 ·
   High Score ×3 · Level Up ×3, then a long ×2 tail.

## A3 IS DONE — verified, not built

Went to wire Forge-as-a-Karn-function and found it already shipped end to end: `/api/collection/deck-overlap`
feeds Karn's system prompt the owned-in-deck count AND the in-color owned upgrade pool;
`/api/collection/ownership` is called by ChatPanel's KarnApplyBar to tag each suggested ADD with
owned/wishlist; the KARN_DELTA collection line is already in agents.js. **Do not rebuild it.** Only real
gap: `isBuildFromCollectionPrompt` is exported and unused — a cosmetic "build from collection" affordance,
not plumbing. Receipts posted to COMMS.

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
