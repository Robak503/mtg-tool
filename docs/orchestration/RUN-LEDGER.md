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
3. **THE PROBE RULE — a "would flip" probe must SIMULATE THE FIX AND CHANGE ONE VARIABLE.** This cost
   more time than anything else in the run; it misfired FOUR times, three of which I acted on before
   catching. The failure is always the same: **deleting the whole line** answers "is the REST of the card
   modelable?", which is not the question. The line carries the trigger, the condition, and the effect
   together, so a card blocked by any of them scores as blocked by the one you're studying.
   - **Right instrument:** substitute a KNOWN-GOOD equivalent for the one thing under test and re-classify.
     Swap the unknown token name for Treasure. Swap the unrecognized condition for "you control a Forest".
     Everything else on the card holds still, so the delta is attributable.
   - It turned a "68-card lever" into 15 real cards, and it killed a "5-card Lieutenant cycle" that was
     worth **zero** — the condition was never the blocker there, the compound static content was.
   - **Second clause:** a "would flip" probe measures whether the METRIC would credit a card. It says
     NOTHING about whether crediting it would be CORRECT. The tap-another-permanent mana sources "would
     flip" 5 cards and would mint phantom mana. Check the runtime can actually pay/execute before believing
     any number.

4. **Re-measure, don't infer.** When a flip count and a corpus delta disagree, isolate by disabling only
   that change and re-measuring. Twice this run the gap was innocent; assuming would have been wrong both times.
5. **Per-flip audit** anything over ~10 cards. Read the cards.
6. CI green on master before tagging. Never tag a red tree.
7. When a diagnosis and the runtime disagree, **the runtime wins** — and correct the written diagnosis in
   place rather than quietly rewriting it.

## IN FLIGHT

- **Nothing mid-edit.** Corpus **35.1%** (12,032). Shelf 1259/1597. Suite **869 files / 11,229 tests**,
  lint 0, sweep 20/20. Master green. **v0.149.10 tagged, release build in progress** (v0.149.9 took 25 min).

## ✅ THE MIS-PARK SCANNER — built, run, and it has now been MINED OUT

The which-layer diagnostic below is now a corpus SCANNER (`scratchpad/residuegap.mjs`, `layer2.mjs`). It
looks for cards where two layers disagree, which is the signature of a MIS-PARK — a card the engine can
already drive but the metric refuses. Three bugs came out of it this run (+15, +1, +4).

**Signature 1 — residue gap:** every trigger routes natively AND the card has no activated abilities, yet
`permanentTriggersCovered` says no. Both other explanations are excluded, so the residue strip is the only
suspect. Found the token ability-grant (+15) and the once-per-turn trigger rider (+4).

**Signature 2 — pre-parse gate:** an ability's cost PARSES and its effect parses HIGH standalone, yet the
ability is unmodeled. Found the quoted-grant/mana-ability misclassification (+1).

**IT IS NOW LARGELY EXHAUSTED, which is a result worth trusting rather than re-deriving:**
- Signature 2's remaining ~9 abilities are ALL the `sacrificeDropsTrigger` guard working AS DESIGNED — a
  sacrifice-as-cost ability on a card that also has a sacrifice/LTB trigger stays parked because paying the
  cost would silently drop that trigger. Verified by removing the sibling trigger and watching the card go
  native. **Deliberate refusals, not bugs. No work there.**
- Signature 1's remaining buckets are NOT keyword-residue cases — I wrote that and it was imprecise.
  Checked properly: those cards (Fathom Mage, Lonis, Relic Seeker …) carry a SECOND trigger line whose EVENT
  the detector does not recognize at all, so that line looks like residue. `detectTriggers` returns zero for
  it. The keyword (evolve/renown/firebending) is a red herring — the bare trigger alone is body-only too.
  **Real feature work: a missing trigger EVENT, not a blindness.** Biggest one sized below.

**Re-run the scanner after any coverage change** — it is cheap and it is how the false positive I shipped
got caught (see below).

## ⛔ REFUSED WITH EVIDENCE — "Do this only once each turn." must NOT reuse the trigger latch

32 corpus carriers, 28 parked, and it looks like a two-line fix: teach `detectTriggers` this wording and let
the EXISTING flush-level `oncePerTurnTrigger` enforcement handle it. **Do not.**

The two riders are not the same restriction:
- *"This ability triggers only once each turn"* latches on FIRING — the ability does not trigger again.
- *"Do this only once each turn"* latches on DOING — the ability triggers, but the effect is skipped.

The existing enforcement marks the ledger AT FLUSH, before resolution. So a player who DECLINES the first
trigger would be wrongly blocked from a second — they never "did this", so the printed card lets them.

**I checked whether a safe subset exists and there is none: all 28 parked carriers are OPTIONAL ("you may").
Zero mandatory.** Every single one hits the decline case. Crediting them would mis-play all 28.

The correct build is a general EFFECT-level latch that marks only when the effect is actually performed —
the shape `applyDiscoverAtom` already uses for Pantlaza (`atom.oncePerTurn`, keyed `sourceId_discover`), but
generalized to any atom, which is a real subsystem slice with the decline semantics as its whole difficulty.

## 🛑 BUILT, TESTED, THEN REVERTED — the counters-put-on trigger, and the ENGINE HAZARD it exposed

I built this end to end, verified both halves at runtime, and then **reverted it**, because building it
surfaced something more important than the 4 cards it flipped.

**THE ENGINE HAS NO TRIGGER-CASCADE GUARD. None. Anywhere.** Two "Whenever one or more +1/+1 counters are
put on this creature → put a +1/+1 counter on each other creature you control" permanents (Generous Pup;
Scurry Oak via evolve) feed each other forever. Measured, not theorised: **5,001 counters after 200 flush
cycles and still climbing.** In paper that is a legal mandatory loop (a draw, CR 104.4b). In this simulator
it is a HANG — the game never leaves that priority window.

**Why reverting was the only honest option:** the hazard does NOT depend on crediting the cards. Once
`detectTriggers` returns the event, the trigger FIRES at runtime for any board holding two cascade-capable
permanents, whether or not the metric credits them. So narrowing the credit fixes nothing. The choice was a
loop guard or nothing, and a cascade cap belongs at `flushTriggers` — the most load-bearing chokepoint in
the engine — which is not a change to make at the end of a long run.

The playability sweep stayed 20/20 GREEN throughout, because its decks happen not to hold two of these four
cards. **The sweep did not catch this and would not have.** I found it by asking what a payoff that places
counters does to a trigger that watches for counters being placed.

### What is already proven, for whoever picks this up

All of it worked. The revert was about the hazard, not the implementation:
- **CR 122.6 is the governing rule** (quoted in the previous entry) — a permanent ENTERING with counters
  fires this, verified at runtime via `enterPermanent`.
- **Design confirmed:** `gameState.addCounter` appends a plain row to `state.pendingCounterEvents`; a new
  `triggers.checkCounterTriggers` drains it at the `flushTriggers` funnel, exactly beside the existing
  `checkTapTriggers` / `checkGraveyardEventTriggers` drains. No import cycle. It fires ONCE per placement
  event (2 counters at once = 1 trigger, verified), and a -1/-1 counter does NOT trip a +1/+1 watcher.
- **The descriptor field must be registered** in the explicit whitelist at triggers.js (~line 3070) or it is
  silently dropped — `counterType` came through `undefined` until I added it, which would have made every
  counter kind fire every watcher.
- **Detection scope:** the PLURAL "one or more … are put on <self>" only. The singular ("a +1/+1 counter is
  put on") may fire once PER COUNTER and the bundled CR does not settle it — do not guess a firing count.
  Scoped subjects ("a creature you control") are a separate ~14 cards needing the shared scopeMatches vocabulary.
- Measured value: **+4 corpus** (Herd Baloth, Dusk Legion Duelist, Generous Pup, Scurry Oak), 0 lost.

### THE PREREQUISITE, and it is worth more than this slice

**Build a trigger-cascade guard at `flushTriggers` first.** It is not specific to counters — any
trigger family that can feed itself has this hazard today, and the engine simply has never met one.
A bounded cascade counter per priority window, logging a distinct "cascade-capped" event (the honest-label
law), converts a hang into a visible, correct-ish stop. Do that, then this slice lands unchanged.

## ⭐ BANKED — "Do this only once each turn." does NOT set the flag

The sibling wording of the rider just fixed. `detectTriggers` does NOT set `oncePerTurnTrigger` for it and
leaves the rider INSIDE the effect clause — contrary to what a comment in `permanentTriggersCovered` claims.
So it needs the DETECTOR taught, not just a residue strip, and the runtime enforcement already exists to
receive it. Recorded rather than guessed at. Verify the comment's claim before trusting it.

## ⭐ THE DIAGNOSTIC THAT FOUND TWO BUGS IN A ROW — ask WHICH LAYER said no

Both engine bugs this stretch were found the same way, and neither was a missing mechanic. When a card looks
like it should already work, do NOT go hunting for the feature. Ask which layer rejected it:

| symptom | meaning |
|---|---|
| `triggerRoutesNatively` true + `classifyCard` body-only | a WHOLE-CARD gate (residue check) — not a mechanic |
| effect clause parses HIGH standalone + ability `program === null` | the ability was rejected BEFORE its effect was parsed — look at what gated it |
| `classify` native + `permanentActivatedCovered` false | the card is being credited while carrying something unmodeled (a possible FP) |

Bug 1 was `permanentTriggersCovered`'s residue strip never being told about token ability-grants (+15).
Bug 2 was `effectIsManaAbility` reading "Add" inside a QUOTED GRANT and flagging a token-maker as the card's
own mana ability — which skipped building its program entirely, so it was invisible from both the effect
lane and the mana lane (+1, and a whole misclassification class removed).

I burned several probes on bug 1 hunting a mechanic that already existed. The layer question would have
answered it in one step.

## ⚠️ TWO OF MY OWN FAILURES THIS STRETCH — read these before trusting a green number

**1. I SHIPPED A FALSE POSITIVE AND CAUGHT IT AN HOUR LATER.** The token-grant residue strip ended with
`\s*`, and `\s` matches a NEWLINE — so it swallowed the line break and welded the NEXT oracle line onto the
stripped one, hiding it from the residue check. Drowner of Hope was credited native-trigger while carrying
"Sacrifice an Eldrazi Scion: Tap target creature." — an ability `parseActivatedAbilities` does not model.
A false positive is the one direction the CREED forbids.

**How it surfaced is the reusable part: I applied the diagnostic rule the SAME slice had just taught me to
the cards the slice did NOT flip.** Drowner came back `classify=native-trigger` with `actCov=false`, and a
card cannot honestly be both. **Checking the cards a change did NOT move is how the one it moved WRONGLY
shows up.** Do that after every coverage change. Fixed with `[^\S
]`, both directions pinned as tests;
net was one FP out and one legitimate card (Catacomb Sifter) in.

**2. THE DIRECT-TO-MASTER DRIFT RECURRED AFTER I SAID I HAD FIXED IT.** Last entry I wrote "branch first
next slice." Three commits then went to master anyway. Worse, `git push -q … 2>&1 | tail -1` hid a failing
push for two commits, so I believed work was on a branch that had actually diverged, and PR #443 sat open
containing none of it.

**The mechanical fixes, since intent alone demonstrably did not work:**
- After `git checkout -b`, VERIFY: `[ "$(git rev-parse --abbrev-ref HEAD)" = "<branch>" ]`. A `-b` onto an
  existing branch fails, and in a `&&` chain that silently leaves you where you were.
- NEVER `git push -q` into a pipe. The `-q` plus `| tail -1` swallowed a non-fast-forward rejection twice.
  Push plainly and read the result, or assert `git rev-parse origin/<branch>` afterwards.
- Before opening a PR, confirm the remote head is what you think: `gh pr view N --json headRefOid`.

No work was lost — master carries all of it, CI green — but I reported branch discipline I had not achieved,
which matters more than the drift itself.

## ⭐ A DIAGNOSTIC RULE THAT PAID FOR ITSELF — routing vs. whole-card gates

The last slice (+15) was NOT a missing mechanic. TK-1 had already built the trigger fold AND the splitClauses
normalization for `…token. It has "<ability>"`; the effect parsed HIGH and the trigger routed natively. The
only thing missing was that `permanentTriggersCovered`'s RESIDUE check had never been told, so the grant
sentence looked like leftover text and parked a fully-modeled card.

**The tell, and it generalizes:** `triggerRoutesNatively === true` while `classifyCard === "body-only"` means
a WHOLE-CARD gate is rejecting it — never a missing mechanic. Check that pair FIRST on any parked card whose
text looks like it should already work. I burned several probes hunting a mechanic that already existed.

The whole-card gates worth checking in order: `permanentTriggersCovered` (residue strip — the one that bit),
`permanentActivatedCovered`, `permanentFullyCovered`.

## STILL PARKED IN THAT FAMILY — 22 cards, not yet diagnosed

Serpent Generator · Mitotic Slime · From Beyond · Blight Herder · Call Up Emrakul to Help. They carry the
same `It has "…"` grant but park for other reasons (their granted abilities are outside the curated
mana/triggered gates, or a sibling clause is unmodeled). Diagnose with the routing-vs-gate pair above before
assuming a mechanic is missing.

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

## ✅ RESOLVED — the token lever was 15 cards, not 68, and needed no subsystem work

Shipped as three NAMED_TOKENS entries (Lander / Mutagen / Junk) + one alternation. **+18 corpus, +2 deck
slots, corpus crossed 35.1%.** All 18 flips audited individually, mutation-checked three ways.

**I banked this as a 68-card subsystem extension and it was neither.** Both errors were the same error:

- **The bad instrument.** I measured "would flip" by DELETING the line carrying the create-token clause —
  but that line also carries the TRIGGER, so I counted cards blocked by their trigger as blocked by their
  token. The tell was in my own output and I missed it: the hit list contained Treasure(12), Food(8),
  Clue(2), all already in the registry, so the token demonstrably was not their blocker.
- **The good instrument — CHANGE ONLY THE THING UNDER TEST.** Rename the unknown token to a known one,
  strip its defining reminder, re-classify. Nothing else moves. Real answer: 15 cards, three names.

**Third time this run a probe's big number was a claim about the probe.** The standing rule now has two
clauses: *(1) parse one real example before banking a lever; (2) a "would flip" probe must simulate the
ACTUAL fix and change ONE variable.*

## ⛔ DO NOT REBUILD — tap-another-permanent mana costs are a DELIBERATE refusal

A probe said 5 cards flip if `manaProduction` accepted "{T}, Tap an untapped creature you control: Add …"
(Springleaf Drum, Gene Pollinator — both in cdh, plus Loam Dryad / Saruli Caretaker / Jaspera Sentinel).
**Do not act on that number.** `manaModel.manaCostModelable` refuses this cost explicitly, names Springleaf
Drum in its comment, and cites a prior audit (SHELF S7): riding the {T} half alone **minted phantom mana
every turn**, because the sim never taps the other permanent.

Crediting these without teaching the mana subsystem to spend a second resource is a false positive, not a
coverage win. **The lesson generalizes: a "would flip" probe measures whether the METRIC would credit a card,
never whether crediting it would be CORRECT.** That distinction is the whole false-positive direction.

## cdh IS ALSO CARD-BY-CARD — its clusters were checked and are empty

Per Omnath's sequencing (cdh is Colton's only sub-90 deck), I measured its 21 parked non-land slots.
Cluster candidates all came back near-zero: can't-be-countered self (83 corpus / 0 would-flip),
can't-be-countered static (0), flash permission (1). Its remaining blockers are individually hard cEDH
cards — imprint (Chrome Mox), cipher (Hidden Strings), Battle//Siege (Invasion of Ikoria), X-counters+draw-half
(Wan Shi Tong). Consistent with the shelf-wide finding: no clusters anywhere.

**Data note for the roster split:** all 16 decks live in ONE profile on this box (`prof_bdb11b3e`), so the
Colton-vs-Joe split CANNOT be derived from profile structure — it rests entirely on `deck_joe_roster`. Told
Omnath, since his two-number recommendation depends on it.

## ⛔ CLOSED LEAD — the LIEUTENANT cycle is NOT a condition gap (worth 0, not 5)

"Lieutenant — As long as you control your commander, <static>" (6 corpus cards). The line-removal probe said
5 would flip, and the diagnosis looked clean: conditional statics WORK ("gets +2/+2 as long as you control a
Forest" is native-static, in both word orders), so the missing piece appeared to be the condition
"you control your commander" — which the TRIGGER lane already has and the STATIC lane does not. A tidy
parallel to the activation-condition slice, and a small build.

**It is worth zero.** I substituted the known-good Forest condition into all six real cards and re-classified:
every one stays body-only. The condition was never the blocker — the COMPOUND STATIC CONTENT is
("gets +2/+2 AND has '<quoted triggered ability>'", "AND other creatures you control get +2/+2 and have
trample"). Adding the condition would have modeled nothing.

Anyone reviving this needs compound gated statics — a self pump PLUS a granted quoted trigger or a group
effect, all under one gate — not a condition entry. That is a real subsystem, correctly sized before it is
started.

**Caught BEFORE building, which is the first time in this run.** The probe rule above is why.

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
