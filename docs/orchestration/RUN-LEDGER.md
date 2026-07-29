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
>
> **⚠️ AND WHEN YOU MUTATE: `grep -c MUTANT` proves a mutation APPLIED, not that it applied to YOUR line.**
> **⚠️⚠️ A GREEN SUITE IS NOT EVIDENCE THE MODULE GRAPH STILL LOADS.** After touching imports anywhere in
> `src/lib/learn/`, run `node --input-type=module -e "import './src/lib/learn/legalChoices.js'"`. One added
> import edge (a constant read only inside a function, per the existing convention) reordered module init
> into `ReferenceError: Cannot access '_lifeLossWatcher' before initialization` while **914 test files stayed
> green** — vitest resolves modules in a different order than node. Fixed by extracting the constant to a
> leaf; the check is one command and it is now mandatory.
>
> **⚠️⚠️ AND A DELETION MUTATION IS INVISIBLE TO THE SWEEP.** `grep -rl MUTANT` only finds mutations that
> left a MARKER. A mutation that DELETES a line leaves none — so when a revert fails (mine failed on a file
> Windows had locked, and `cp` printed `Permission denied` in the middle of a long output block), the sweep
> still reads clean while the sabotage is still in the tree. **After any mutation round, confirm the revert
> with `git diff -- <file>`, not with the marker sweep.** Verified live 2026-07-28: the synonym line was
> missing and every gate was green.
>
> `perl` without `/g` replaces the FIRST occurrence in the file. I burned two runs "confirming" a test was
> hollow when the mutation was landing on an identical string 180 lines earlier (a different atom's
> `spellFilter: "instantSorcery"`). **Anchor on something unique, or `grep -n` the line number before and
> after.** A green mutation run is only evidence if you know WHAT you broke.

## 🔧 SHIPPED — the "if you cast it" ETB rider (`6b92fe37`, +5 · **Dragons 79 → 80%**)

**38 corpus cards** print `When ~ enters, IF YOU CAST IT, <effect>` and none could be modelled — yet
`detectTriggers` had been **capturing the condition all along** (`interveningIf: "you cast it"`); only the
evaluator had no vocabulary for it. Sole blocker on **five**: Tiamat (shelf) · **Zacama, Primal Calamity**
(rank 1786) · Geological Appraiser · Yathan Roadwatcher · Iridescent Tiger. The remaining 33 need their own
payoffs and will collect this rider for free when they land.

The rider separates CAST from PUT (reanimation, Show and Tell, blink, token copy), so it is a per-permanent
fact about HOW the object arrived — modelled exactly like the `wasKicked` flag sitting one arm above it.
**⛔ Fail-open would hand a free Tiamat tutor to every reanimation spell**, which is the abuse the printed
rider exists to prevent; every uncertain path returns null or false.

**⭐ BOTH OF TIAMAT'S SEARCH RIDERS ARE ENFORCED, NOT WAVED THROUGH AS VACUOUS.** "not named Tiamat" and
"that each have different names" are *automatically satisfied by a singleton Commander library* — Tiamat is
on the battlefield, every name unique. Ignoring them would have passed every realistic game and still been a
search wider than the card allows. **The riders were cheap to honour; the argument for skipping them was the
expensive part.**

**⭐ A THIRD SURVIVED SABOTAGE CHECK OF THE SEAM KIND — and the second in two slices.** Removing
`wasCast: true` from the PERMANENT_ETB resolver (so no real cast is ever stamped and the rider can never
fire) left all twelve assertions green, because they call `enterPermanent` directly with the flag already
set. Stamp mechanism: covered. Evaluator: covered. **The cast path actually setting it: not covered.** A
section now casts through `legalChoices → dispatchAction → resolveTopOfStack` and reads the flag off the
permanent that entered. *Two slices running, the survivor was the join between two well-tested halves. When
a check survives, look at the seam first.*

Tier diff **GAINED 5 · LOST 0 · RETIERED 0** — predicted and confirmed. Sixth capability pin graduated
(`conniveSuspectKeywords` parked Geological Appraiser because this vocabulary "is unmodeled" — its own
words); learn and incubate stay parked for their own still-valid reasons.

Mutation-checked: **M85** fail open → killed by 3 · **M86** drop the name exclusion → killed ·
**M87 SURVIVED** → seam section → **M87b** killed by 2.

## 🔧 SHIPPED — colored-PIP cost reduction (`1ba87fc5`, +3 · **Dragons 78 → 79%**)

Every reducer before this returned a **scalar** the cast site subtracts from `generic`. Four cards reduce
**COLORED PIPS**, and Edgewalker's own reminder states the difference: a `{1}{W}` Cleric costs `{1}` — the
generic is untouched and the `{W}` goes. Through the scalar channel that Cleric would cost `{W}`, and
Morophon would take 5 off a `{4}{R}{R}` Dragon's generic (leaving `{R}{R}`) where the card leaves `{4}{R}`.
**Cheaper than printed is the forbidden direction** — which is why the family was parked, not approximated.

**⛔ A RUNTIME-VACUOUS NATIVE THIS SLICE NEARLY SHIPPED, AND AN OLD PIN IS WHAT CAUGHT IT.** A `chosenType`
reduction resolves against the source's stored `chosenType` (CR 614.12), which exists only because the card
prints the modelled *"choose a creature type"* ETB. I argued the classifier was structurally safe — *"a card
with the reducer but no chooser still has the chooser line as residue"* — **which is circular: a card that
never prints a chooser has no such line to park on.** `chosenTypeSelfAdd.test.js` had pinned that exact
fixture as body-only and failed. `parseStaticAbilities` now drops a chooser-less `chosenType` descriptor.
Closes the same latent hole on the older GENERIC chosen-type path for free.

**⭐ A PIN THAT OUTLIVED ITS REASON AND EARNED A NEW ONE** — worth knowing this shape exists. That same
assertion was written to prove the colored reduction wasn't quietly credited; when the reduction became
real it failed, and **the failure was still correct, for a different reason than it was written for.**
Read what a failing pin is telling you now, not what it was for.

**⭐ AND ONE PIN WAS RE-POINTED, NOT FLIPPED.** The residue-swallow guard used Morophon's unmodelled rider
as a canary. Flipping it to `native-static` would have left the guard with no end-to-end assertion at all,
so it moves to **Vorthos, Steward of Myth** (an unmodellable filter that will stay unmodellable). *When a
graduated pin was someone else's canary, find it a live bird.*

**M79 SURVIVED → pinned, not deleted** (same call as storm, one commit earlier). Ungating the qualifier
sentence left everything green because Vorthos and Head of the Class are held by their own unmatched
clause. The case the gate defends is a GENERIC reducer printed with the colored-only qualifier — no such
card exists yet, which is exactly the point.

⚠️ **Two fabricated fixtures, exposed by the tier diff's SILENCE** (3 gained where I predicted 4):
Ragemonger is `{1}{B}{R}`, not `{2}{B}`; **Nekrataal Avatar is a VANGUARD card** — no mana cost, no P/T,
outside the playable corpus — and was in my test as an invented *"Creature — Zombie Avatar"*. *A diff that
moves FEWER cards than predicted is as informative as one that moves more.*

Mutation-checked: **M78** shave generic instead of pips → killed by 2 · **M79 SURVIVED** → pin → **M79b**
killed · **M80** apply an unfiltered pip reducer to every spell → killed.

## 🔧 SHIPPED — STORM on a PERMANENT spell (`9a177075`, +2 · **Dragons 77 → 78%**)

Every storm card the engine handled was an instant or a sorcery. A storm **CREATURE** resolves through
`PERMANENT_ETB` (`params.card`), not an EFFECT_PROGRAM body, so `applyCopySpell`'s program-clone path
produced nothing usable: N copies **all sharing the original card's id**, none flagged `token`, each headed
for a graveyard as a real card. The classifier parked them at body-only, so **the hole never surfaced as an
FP — the path was simply never built.** CR **707.10f** is the rule; the per-copy snapshot is the one
`applyCopyCreatureSpell` (Double Major) already used.

**⛔ THE BARE-KEYWORD-LINE ANCHOR EARNED ITS KEEP IMMEDIATELY.** Five corpus cards **GRANT** storm rather
than having it — Prismari, the Inspiration · the Ral, Crackling Wit emblem · Storm, Force of Nature ·
Crackling Spellslinger. Matching the reminder sentence would strip the granting ability off all five and
credit them native with the card's whole point gone — *the nine-card cascade mistake, waiting to be
repeated one line below where it is written down.* **Read the note next to the code you are copying.**

**⛔ The three storm AURAS are NOT credited** — their tier path reads oracle separately from the shared
strip, and an Aura copy needs an attach target this arm does not model. Safe FN, left deliberately.

**⭐ A SURVIVED MUTANT MADE A GUARD REAL INSTEAD OF DELETED.** Removing `!params.program` left all 33 tests
green — no payload the dispatcher builds carries BOTH `card` and `program` (EFFECT_PROGRAM carries `cardId`;
`card` only ever appears nested under `spellToGraveyard`/`adventureExile`). The M65 precedent says drop a
redundant guard, but this one is real protection that merely had nothing exercising it. So the new test
**drives `applyCopySpell` directly with the ambiguous payload the guard exists for** — re-mutated after, and
killed. *A guard nothing can kill is not proven redundant; it is proven untested. Those are different, and
the fix is usually a test, not a deletion.*

Mutation-checked: **M74** no fresh per-copy id → killed · **M75** drop `token:true` → killed by 2 ·
**M76 SURVIVED** → pin added → **M76b** killed · **M77** reminder-wide anchor → killed by the granting pin.
**Reverts confirmed by `git diff`, not by the marker sweep.**

## 🔧 SHIPPED — the selfPower mana metric (`25f90a28`, +9 incl. **Marwyn, the Nurturer**)

Nine mana dorks whose whole plan is *grow, then tap* produced **ZERO** mana at runtime: `parseManaMetric`
knew permanentsYouControl / devotion / greatest-power-or-toughness-among-creatures-you-control and had no
**SELF** metric. Two printed connectors, one metric — `"where X is this creature's power"` and
`"Add an amount of {G} equal to Marwyn's power"`.

**⛔ THE SELF-REFERENCE GATE IS THE WHOLE SAFETY ARGUMENT.** Printed text names the source three ways —
"this creature", the full name, or the **pre-comma short name** ("Helga" for "Helga, Skittish Seer"). Every
OTHER `"<x>'s power"` in the corpus is a referent to a **different object**: "that creature's" (Mercy
Killing), "the sacrificed creature's" (Ghoulcaller Gisa), "the exiled card's" (Lobelia). Reading the
source's power there fabricates an amount belonging to another permanent, so the name arm matches only this
card's own name and refuses everything else.

**Helga and Redshift print the identical metric behind "Spend this mana only to …"** and stay parked on the
per-ability restriction refusal — pinned so they cannot ride in.

**⭐ A CAPABILITY PIN GRADUATED.** `coverage.test.js` pinned "this creature's power" under `MUST_STAY_BODY`
while the metric was absent — that pinned a **missing capability, not a decision**, so it MOVES to
`MUST_FLIP` rather than being deleted. The two genuinely-unmodelled metrics beside it (battlefield-wide
Elves, graveyard counts) stay, and a referent case joins them. *A capability pin outlives its truth
silently; the suite is where you find out.*

**⚠️ AND THE TRAP THAT NEARLY MIS-SCORED THIS SLICE AS CORPUS-NEUTRAL: MEASURE ON THE CENSUS CARD SHAPE.**
Fed a **raw oracle-index record** (`oracle_text`/`type_line`) instead of the `{type, oracle, mana}` that
`publicCard` hands the census, `classifyCard` reads an **empty oracle** and calls the card a vanilla
`native-body` — **Sol Ring included**. My scratch probe did exactly that and reported all nine already
native. Normalize before you classify, or the number is fiction.

Tier diff **GAINED 9 · LOST 0 · RETIERED 0** (all `body-only → native-mana`). Five of the nine I did not
predict — the mono-green connector form (Cradle Clearcutter, Topiary Lecturer, Rainveil Rejuvenator,
Viridian Joiner, Marwyn). **The shelf does not move; none of the nine are on it.**

Mutation-checked: **M71** drop the self-reference gate → killed by 2 · **M72** fall through to the
board-wide max → killed by the bystander control · **M73** printed power instead of layer-aware → killed by
the counters test.

## 🩸 THE VACUOUS SUBTYPE FILTER — a new FP class, found and closed (`57011a09`)

**A filter the runtime can never satisfy is worse than a missing one.** `subtypeFilterMatches` enforces
`subtypeFilter` as a substring of the triggering permanent's TYPE LINE. Mint a string no card carries —
"Commander", "Outlaw", "Allie" — and the card classifies **native**, the trigger fires **zero**, and
**nothing in the static toolkit can see it**: the per-card tier diff shows no movement because the card was
already native and stays native. This is the same lesson as the dropped layer grant, in a second location:
**the tier is not evidence about the board.**

**The instrument: `app/scripts/probe-vacuous-subtype-filters.mjs`.** It derives the real subtype vocabulary
from printed type lines and reports any minted filter absent from it. **A finding here is always a defect** —
there is no benign reason to gate on a subtype no printed card carries. Run it after touching ANY path that
mints a `subtypeFilter`. It reads **0** today.

**⚠️ AND THE PROBE WAS WRONG ON ITS FIRST RUN — 72 false findings.** It scoped the vocabulary to post-dash
subtypes, but `subtypeFilterMatches` tests the WHOLE line, so "Artifact" legitimately matches
"Artifact — Equipment". *The instrument was the problem, not the engine.* Fixed before trusting a single row.

The three real classes, all now closed:
```
"Commander"  CR 903.3 DESIGNATION, not a type word   Norn's Choirmaster #3286 (etb+attacks) · Keleth #6637
"Outlaw"     CR 203.4c UMBRELLA over five subtypes    Rakish Crew
"Allie"      naive -s strip on the plural "Allies"    Invasion Tactics #13305
```
Commander now takes `commanderYouControl` (the scope Kediss already proved); outlaw expands to its five;
singularization now **generates candidates and validates against `CR_CREATURE_TYPES`** — the closed 317-word
set — instead of trusting a rule (Allies→Ally, Elves→Elf, Wolves→Wolf, Oxen→Ox; unresolvable → null →
Arbiter, a safe FN). **Do not replace that with a hand-written plural dictionary — it would just relocate
the fabrication.**

**⭐ TWO FOLLOW-ONS THE DIFF CAUGHT AND REASONING DID NOT.** Both are the argument for running it every time:
1. Moving commander triggers off the subtype path dropped **Keleth to body-only** — `NONSELF_TRIGGERING_SCOPES`
   gates the "put a +1/+1 counter on IT" pronoun rewrite, and the new scope wasn't in it. Fixing only the
   scope would have swapped a silent no-op for a silent park.
2. Denying "commanders" to `parseSubtypeList` killed the BATCHED form outright — and the pin protecting it
   was protecting an FP (its old output was itself vacuous). `batchCommander` makes the plural CORRECT
   rather than absent. **New descriptor field → the whitelist, or it is silently dropped.**

**Tier diff GAINED 0 · LOST 0 · RETIERED 0. Coverage does not move.** Three cards that claimed native and did
nothing now work. That is the whole result, and it is worth more than a number.

### 📋 NEXT OFF THIS SHELF — the 26 top-2500 "one or more" carriers still parked, DIAGNOSED

**⚠️ FIRST, THE TRAP THAT COST ME A WRONG ANSWER: `publicCard()` STRIPS `edhrec_rank`.** An ad-hoc probe
built on `publicCard` read every rank as the 999999 fallback and reported *"0 of the remaining carriers are
in the top 2500"* — which would have retired this whole vein. `measure-coverage.mjs` reads `raw.edhrec_rank`
off `allCards()` for exactly this reason. **Take the rank from the RAW card, the oracle from `publicCard`.**

The real answer is 26, and detection status splits them cleanly (`detectTriggers` count in brackets):

```
DETECTION IS THE ONLY BLOCKER — the batch arm exists, the SUBJECT FILTER is the gap
  1729 Elvish Warmaster   [0]  "one or more other ELVES you control enter" + rider   ← the subtype cross
  1544 Losheel            [0]  "one or more ARTIFACT CREATURES you control enter" + rider
   648 Caretaker's Talent [0]  "one or more TOKENS you control enter" + rider   ⚠️ any token, incl. Treasure
  2459 General Kreat      [0]  "one or more GOBLINS you control attack"          ← maps onto youAttack
  2500 Dollmaker's Shop   [0]  "one or more NON-TOY creatures you control attack a player"
  1281 Duelist's Heritage [0]  "one or more creatures attack"  ⚠️ ANY player's — NOT youAttack
  1591 The Skullspore Nexus [0] "one or more NONTOKEN creatures you control die"  ← diesBatch + nontoken
  2356 Spiteful Banditry  [1]  "one or more creatures YOUR OPPONENTS CONTROL die" + rider

DETECTED ALREADY — the EFFECT is the blocker, so these are spell-effect work, not trigger work
  1903 Grazilaxx   combatDamageBatch ✓ … blocked by its OTHER line ("becomes blocked")
  2484 Nature's Will combatDamageBatch ✓ … "tap all lands that player controls and untap all lands you control"
  2438 Rev          combatDamageBatch ✓ … "look at the top card of that player's library" rider
   897 The Gitrog Monster / 1290 Hedge Shredder / 1987 Colossal Grave-Reaver — gyEnterBatch ✓, effect gaps
  1838 Teval's Judgment  gyLeaveBatch ✓ … modal "choose one that hasn't been chosen this turn"
   914 Evolution Witness / 2085 Basking Broodscale / 1259 Simic Ascendancy — countersPut ✓, effect gaps
```

**The cheapest next slice is the ETB SUBJECT CROSS** (the first three rows): the batched-ETB arm shipped at
`619b9513` handles *"with power/mana value N or less"*, and these are the same grid cell with a different
filter — subtype, card-type, token-ness — all of which the SINGULAR etb path already enforces
(`subtypeYouControl` / `otherSubtypeYouControl` / `tokenFilter` / `nontokenFilter`).

**⭐ BUILD IT BY DELEGATION, NOT BY A SECOND PARSER.** De-pluralize the subject and hand the singular clause
back to `classifyCondition`, then decorate the result with `requiresOncePerTurn: true`. That inherits every
scope the singular arm can enforce **and every refusal it makes** — which is the whole safety argument, and
the shape the `diesBatch` arm already documents. Use `singularCreatureType` for the subtype word; it is the
validated singularizer built in `57011a09` precisely so "Elves" cannot become "Elve".

**⚠️ Caretaker's Talent needs care: "tokens" is ANY token, including Treasures.** A creature-scoped gate
would under-fire while claiming native — the FP direction. It needs a token-permanent scope or it parks.

### ✅ THE DELEGATION ARM IS BUILT (`ef8bfbfc`, +2: Elvish Archivist, Ingenious Smith)

Shipped exactly as scoped above, and **the shape is the deliverable — the two cards are not.** Reuse it for
every remaining batch verb rather than writing a second subject parser.

**⭐ THE GATE WAS TOO NARROW ON THE FIRST CUT, and only measuring caught it.** The singular path splits
"something entered" across **two** events — `etb` for creature-shaped subjects and **`permanentEnters`** for
the card-type ones ("an artifact you control" → `artifactYouControl`, "a token you control" →
`tokenYouControl`, each with its own check function `checkPermanentEntersTriggers`). Gating on `etb` alone
silently dropped the artifact and token carriers, i.e. most of the family. **Before assuming a subject is
unmodeled, check BOTH entry events.**

**⚠️ AND ONE GUARD MEASURED INERT** — the subject-list early-out in `singularizeBatchSubject` changes nothing
when mutated away, because the delegated clause is refused downstream anyway. Kept as intent, labelled as
belt-and-suspenders in both source and pin. *Do not re-sell it as the guard.*

Still parked and why: **Caretaker's Talent #648** (Class levels), **Losheel #1544** ("artifact creatures" is
not modeled SINGULAR either — fix it there and the batch form follows for free), **Elvish Warmaster #1729**
(detects correctly now; blocked by its `{5}{G}{G}` subtype pump), **Kambal #1145** ("tokens your opponents
control" + a copy effect), **Merry #5398** / **Baron Bertram #4221** (effects).

## 🎯 THE OBJECTIVE — RETARGETED BY COLTON, 2026-07-28 (supersedes the shelf framing below)

**The target is now the TOP 2500 MOST-PLAYED CARDS by `edhrec_rank`.** Colton, verbatim: *"lets focus now
on the top 2500 that['s] probably 95% of what's actually played."* This supersedes both "corpus %" and
"the deck shelf" as the number to move. The shelf sections further down are still TRUE and still useful
as a secondary read — do not delete them — but they are no longer the bar.

Measure it with the project's own tool (it already had this view; the comment in the script says the
corpus number *"treats a never-played junk card the same as Sol Ring"*):
```
MTG_APP_ROOT="/c/Users/colto/AppData/Roaming/com.colton.mtg-tool" node app/scripts/measure-coverage.mjs
```
`playable = native OR land`. Lands count — they run trivially, which is why **Bojuka Bog #24 was never
a gap** even though an ad-hoc probe of mine listed it as parked. Do not re-derive that; it is settled.

**WHY THE RETARGET HAPPENED — the lesson is worth more than the number.** Colton pushed back twice, and
both times the instrument was the problem, not the codebase:

1. *"why are we gated on no new card or easy cards when we're not even half way"* — every search
   instrument built in this run asks the SAME question: *"which cards are ONE sentence from flipping?"*
   That seam genuinely was exhausted, but it is a thin surface layer. It goes quiet long before the WORK
   does. "No cheap wins" was an artifact of the instrument.
2. *"we don't [want to] assume cards are hard just cause they['re] multi part — some of those may be
   really easy as we have a lot of what they're doing already done."* — **Blocker COUNT is not cost.**
   A card needing two VOCABULARY fixes is cheaper than one needing a new SUBSYSTEM. Every slice shipped
   since that message was a case of the engine already knowing the effect and not knowing the phrasing.

**The instrument that replaced them:** for a given family, parse each blocking phrase in isolation AND a
near variant that differs by one qualifier. When "destroy all artifacts" is HIGH and "exile all artifacts"
is LOW, the gap is a missing CROSS, not a missing mechanic. That single diff found three slices in a row.

Full authority granted: cut releases freely, choose the work, no check-ins. Stop only for something that
needs Colton's hands, touches secrets, or would ship a guess.

## 🪶 THE TOP-2500 GAP IS A LONG TAIL — measured, not guessed (`probe-top2500-blockers.mjs`)

**This is the most important strategic fact on the page, and it is unwelcome.** The probe asks what no earlier
instrument in this run asked — *which SENTENCES block the cards that matter, and how many each* — with a card
blocked by three lines counting toward all three, so a shape can rank high even when no single card flips from
it alone. The answer:

```
1137 parked top-2500 cards  →  1626 distinct blocking shapes  →  1568 of them block exactly ONE card
                                                                 the LARGEST cluster is 9
```

**There is no big lever left in the top 2500 by sentence shape.** This is the quantified form of the rate
problem: ~438 cards to reach 70% against a tail where the median shape is worth one card. Any plan that
assumes a hidden vein is wrong; the work is either (a) whole MECHANICS, or (b) accepting a low per-slice yield.

**⚠️ THE PROBE WAS WRONG THREE TIMES BEFORE IT WAS RIGHT — all three corrections are baked in.** Every one was
a line that cannot classify standing alone, scoring as a blocker for every card carrying it:
```
"//"                21 cards, looked like the biggest lever on the board — it is a FACE SEPARATOR.
                    Multi-face cards in the top 2500 are 72.7% native (56/77), ABOVE the 54.2% baseline.
"Enchant creature"  19 cards — CR 702.5 is a targeting restriction handled by the aura path, not an ability.
"Choose one —" + 4  the modal WRAPPER and its bullets. VERIFIED DIRECTLY: "Choose one — • Destroy target
 mode shapes        artifact. • Draw a card." classifies native-spell. Modes are now de-bulleted and judged
                    as the whole spells they are, so a mode that ranks is a REAL gap.
```
**Two classes still over-report and are labelled in the file:** bare KEYWORDS (Spree, Ascend, Flashback), and
EFFECT FRAGMENTS off a permanent ("Draw a card." as a whole Artifact; "Equipped creature gets +3/+2" without
its Equip line). **The probe is trustworthy on instants and sorceries, where a printed line IS the spell.**

**The genuinely actionable clusters it found — all whole MECHANICS, none a one-liner:**
```
  9x  "You may look at the top card of your library any time."   Bolas's Citadel #263 · Mystic Forge #414 · Realmwalker #607
  8x  Spree                                                       Return the Favor #625 · Three Steps Ahead #1093
  7x  "{2}{U}: Level 2"  (Class enchantments)                     Wizard Class #634 · Caretaker's Talent #648 · Innkeeper's Talent #678
  5x  "As this creature enters, choose a creature type."          Roaming Throne #133 · Realmwalker #607 · Metallic Mimic #1055
  5x  Ascend (CR 702.131, the city's blessing)                    Wayward Swordtooth #986 · Twilight Prophet #1095 · Ocelot Pride #1122
  4x  Choose a Background · 4x Gift a card · 3x Station           Jaheira #876 · Dawn's Truce #359
  4x  "each player draws an additional card" (symmetric draw)     Rites of Flourishing #1524 · Kami of the Crescent Moon #1817
  3x  "If you would gain life, you gain twice that much instead"  Alhammarret's Archive #982 · Rhox Faithmender #1637
```
**Roaming Throne #133 and Realmwalker #607 each appear TWICE**, which is the probe's whole point — they are
two mechanics from flipping, and no one-mode-away list would ever surface them.

### ✅ THE DRAW-STEP CROSS IS DONE (`2c102157`, +5 — Howling Mine #723 is top-1000)

Shipped as scoped below. **Three findings worth more than the five cards:**

1. **The trigger was never the blocker — the word "additional" was.** Once the draw-step arm landed,
   *"that player loses 1 life"* on the draw step routed immediately while *"draws an additional card"* failed
   **on the upkeep twin too**. Widened on the `upkeepPlayer` arm ONLY: the corpus prints *"that player draws N
   additional cards"* 12 times and the each-player / target-player variants **zero** times. **Always isolate
   which half is broken before building the half you assumed.**
2. **⚠️ THE REFERENT IS A DOUBLE GATE** — `checkStepTriggers`' ctx threading AND `triggerRouting`'s event
   check. Widen one without the other and you get the two failure modes this project cares about: thread
   without routing → refused (safe FN); **route without threading → the referent is unset at resolution and
   the clause silently NO-OPS while the card claims native** (the FP). Mutation M10 un-widens the threading
   and four runtime pins fail.
3. **A whole intervening-if family was missing: the SELF TAP-STATE** (CR 603.4 + 106.1). The machinery
   understood only BOARD-COUNT conditions, so *"if this artifact is untapped"* parked everything carrying it —
   **29 cards across five wordings, including Mana Vault #145.** Only 2 flipped (Howling Mine, Nim Abomination);
   **the rest are parked for their own effects, so this seam is now open but nearly exhausted** — do not
   re-mine it expecting the other 27.

**⚠️ AND A PROCESS RULE, one step past the last one: `git checkout --` IS NOT A MUTATION REVERT.** M12's perl
anchor silently failed to apply, and using `git checkout` to "restore" **discarded the real change instead**.
The mutation round then measured a file that no longer had the feature in it. `git diff --stat` after every
mutation round is the standing check — the marker sweep cannot see this class either.

### ✅ THE RESTRICTION WORKLIST IS AUDITED AND CLEAN — no second Mox Opal. Do not re-mine it.

Every remaining entry was checked against the engine, not assumed. **All modeled:**
```
Rhystic Study #44 · Mystic Remora #98   a dedicated `taxed-draw` atom (OPPONENT-PAYS-TO-DENY, CR 603.7c)
                                        with a real payer choice in learnSession. NOT an unconditional draw.
Torment of Hailfire #614                a dedicated `iterated-edict` atom whose resolver drives the
                                        X × opponents pausing choice chain. Its own comment names the naive
                                        split as "a forbidden partial" — the exact hazard, already handled.
Weathered Wayfarer #1412                legalChoices ~1736 gates on `ab.condition` via evaluateInterveningIf,
                                        and uses `!== true` so an UNPARSEABLE condition also blocks. Safe.
can't-be-blocked-except-by              ignoring a blocking restriction makes the attacker EASIER to block —
                                        weaker than printed, the safe direction. Deprioritized, not skipped.
```
**⚠️ And one fixture lesson, again:** my board test showed Weathered Wayfarer's ability offered in NEITHER
the condition-true nor condition-false case, which looked like a dead gate. `evaluateInterveningIf` answers
that exact string **`true`** when asked directly — the fixture was incomplete, not the engine. *Isolate the
predicate before concluding the mechanism is broken.*

### ✅ DONE (`a65dd03e`, +6) — condition-gated mana is now ENFORCED, not refused

The follow-up below was built the same session it was written. The condition rides on the mana product and
is evaluated LIVE at **`manaSources` — the ONE chokepoint**; gating at each consumer would guarantee one of
them forgets. `!== true` so an unconfirmable condition blocks, matching `legalChoices`' comparison exactly.

**Board-asserted:** a lone Mox Opal (metalcraft unmet) yields NO source, still none one artifact short, and
exactly one at three artifacts.

**⚠️ THE PIECE THAT KEEPS THE METRIC HONEST — `conditionIsExpressible`.** Tagging every gate and letting
`manaSources` drop whatever is not `=== true` would be runtime-safe **and still wrong**: the card would be
credited `native-mana` while its source could never be offered — a runtime-vacuous native, the same class as
the vacuous subtype filter and the aura grants that never applied. **A gate the evaluator cannot DECIDE
parks the card.** So the 16 split honestly: **6 back, 10 still parked.**

**This was the THIRD time the same pattern paid this run** — a guard that existed at one entry point and not
its sibling (`legalChoices` gated activated abilities; `manaSources` gated nothing).

### 🎯 (original scoping, kept) — the 16 parked mana cards can be RESTORED properly

`b84252af` routes condition-gated mana sources out entirely (a safe FN) "until conditions are real". **They
are more real than that fix assumed:** `evaluateInterveningIf` already answers these gates —
`"you control three or more artifacts"` → `false` on an empty board, correctly. So the honest fix is to keep
`manaProduction` and have **`manaSources` filter on the condition at runtime**, exactly as `legalChoices`
~1736 already does for activated abilities. That restores Mox Opal #241 and 15 others as the cards they
actually are, instead of leaving them parked.

**Scope note before starting:** the source list is consumed by the payment planner in several places, so the
condition must gate at `manaSources` (one chokepoint), never at each consumer.

### 🔬 AMULET OF VIGOR #1301 — SCOPED, NOT BUILT. Four pieces, and the FOURTH is the one that matters.

Applied last turn's rule ("re-read the machinery before believing the subsystem label") to the rest of Earth
Bent. Amulet looked like the best candidate and **one piece IS a clean missing-family-member** — but it is
not the piece that decides the card.

**The enter-subject family is complete except one:**
```
an artifact you control enters     → permanentEnters/artifactYouControl   ✅
an enchantment you control enters  → permanentEnters/enchantmentYouControl ✅
a token you control enters         → permanentEnters/tokenYouControl      ✅
a creature you control enters      → etb/creatureYouControl               ✅
a land you control enters          → landfall/landYouControl              ✅
a PERMANENT you control enters     → (none)                               ⛔  ← the gap
```
**Corpus reach is only 2 cards** (Amulet of Vigor #1301, Fire Lord Zuko #6200), so this is worth doing for
the shelf, not for volume.

**The four pieces:**
1. the `permanentYouControl` subject above;
2. an **"enters TAPPED"** filter on the entering permanent (the play path DOES tap before triggers fire —
   `actionDispatcher` ~161 taps, ~202 fires — so the state is readable);
3. an **"untap it"** referent atom bound to the triggering permanent;
4. **⚠️ THE DECIDER — `checkPermanentEntersTriggers` DOES NOT FIRE ON THE PLAY-LAND PATH.** It is called from
   exactly three sites (`tokens.js` ~68 mint, `zones.js` ~241 zone-enter, `resolvers.js` ~537 cast), and
   `actionDispatcher`'s land drop calls only `checkEnterTriggers`. **Amulet's entire purpose is untapping
   lands that entered tapped.** Building 1–3 without 4 produces a card that classifies native and never fires
   on its signature use — a runtime-vacuous native, the FP class this run keeps closing.

**So the build order is 4 FIRST** (wire the fire site, prove it on a board with a tapped land drop), then the
subject, filter and referent. This is the same "10+ callers, wiring each is how a path silently misses the
pass" trap the `diesBatch` note already records — and the reason it is scoped rather than started at depth.

### ✅ EARTH BENT **87%** — 3 from the bar (`8454dbe6` Planar Engineering). Shelf-wide it is still the closest.

**⭐ "SUBSYSTEM" WAS TOO PESSIMISTIC ON ONE OF THEM — check the machinery before believing the label.** I had
Planar Engineering filed as needing multi-pick sacrifice. It needed nothing new: `advanceSacrificeChain`
already drives a QUEUE "one permanent apiece", and `setPendingSacrificeChoice` already accepted that queue.
N sacrifices are N entries. **When a card is filed as a subsystem, re-read the machinery — the last three
"subsystems" have each turned out to be one guard, one field, or one queue entry away.**

**⚠️ A DOCUMENTED APPROXIMATION rides with it, and the reasoning is the reusable part.** The fetch half
prints the MANDATORY *"Search your library for FOUR basic land cards"*; the engine models it on the "up to
four" chain. The only divergence is whether the player MAY take fewer — **strictly worse for them, so it
cannot make the engine play a better card than printed.** A choice-FIDELITY gap in the safe direction, which
is categorically unlike a dropped effect. **No unread `mandatory` flag was stamped** — a field nothing
enforces is the captured-but-unread trap in another costume.

**⚠️ AND ANOTHER PIN PASSING FOR THE WRONG REASON.** M38 admits *"any number"* to the sacrifice arm and the
Scapeshift refusal STILL passes — **the linked-X fetch is what holds it**, not the sacrifice count. Relabelled.
That is the third pin this run found to be green for a reason other than the one it claimed.

### ✅ EARTH BENT 86% (`dbb5f632` Avatar Kyoshi) — the referent lesson

**⭐ THE REFERENT LESSON, which generalizes:** *"untap that land"* is printed on FOUR cards and **THREE mean a
DIFFERENT land** — Fabled Passage (fetched), Land Aid '04 (searched), Tiller Engine (entered), Avatar Kyoshi
(earthbent). A bare clause parser would bind all four to the earthbend stamp. **Match the COMPOUND when a
referent's meaning comes from the clause before it.** The stamp itself reuses the `revealedCardMV` /
`diceResult` pattern.

**⚠️ AND A MUTATION THAT PROVED NOTHING.** M35's first form loosened the regex prefix but left the rest
requiring the earthbend count, so a bare clause still could not match and nothing failed. **A green from a
mutation that never reaches the behaviour is not evidence** — re-run as M35b (add the actual unsafe arm),
which fails correctly. Same family as the deletion-mutation and `git checkout` traps already in this file.

**THE REMAINING 14, and none is a slice** (re-derived, not recalled):
```
LINKED X ("up to THAT MANY")   Scapeshift · The Earth King        ← the biggest shared mechanism left here
multi-pick sacrifice           Planar Engineering                 applySacrificeLand pauses for ONE
layer-4 GROUP type-add         Ashaya  ⚠️ its own P/T counts lands — a real feedback loop
mass GY return                 Lumra ("return ALL land cards from your graveyard")
new trigger EVENT              Amulet of Vigor ("enters tapped" is a play-path check today)
two unmodeled triggers         The Ozolith
REFUSED by our own guards      Scythecat Cub (inexpressible condition) · Herd Heirloom (spend-restricted mana)
Saga/DFC · quoted grant · replacement-meta   Legend of Kyoshi · Tale of Katara · Traveling Chocobo
```
**`earthbend N, then earthbend N` already composes** (Cracked Earth Technique is native-spell) — only the
untap referent was missing, which is why this was the last contained item in the deck.

### ✅ BUILT (`6975eb40`, +5 — Scute Swarm #229, Entish Restoration #439). **Earth Bent 83% → 85%.**

The scoping below was accurate, including the prescribed order. **Two bugs came out of it, and both are the
kind that look exactly like success — record them, they will recur:**

**1. ⚠️⚠️ FIELD-NAME COLLISION — the atom field is `branchOn`, NEVER `condition`.** `atom.condition` already
means something else in `runProgram` (~163): a rider GATE, *"skip this atom unless the condition holds"*.
Naming the branch field `condition` made the runner **skip the whole conditional whenever it was false** — so
`ifTrue` worked perfectly and `ifFalse` silently never ran. **Every true-condition test passed.** Only a
three-lands board showed it. *Before reusing a field name, grep what the runner already does with it.*

**2. ⚠️ HIJACKING BY FALLING SHORT — a new arm must FALL THROUGH, not return LOW.** The grammar also matches
*"…If that creature would die this turn, exile it instead"* — **23 cards** (Anger of the Gods, Pillar of
Flame) already modeled elsewhere, whose alternative is a rider rather than a branch. Returning LOW on a match
this arm could not fully model dragged all 23 from `native-spell` to `arbiter-spell`. **The tier diff caught
it (LOST 23 → LOST 0).** Falling through leaves everything unclaimed byte-identical.

**Decidability is checked at PARSE time, not just resolution**, so the metric and runtime agree — Scythecat
Cub's *"second time this ability has resolved this turn"* parks by design rather than rejecting mid-resolve.

**Three stale pins split, member by member** — Scapeshift (linked X) and Scythecat Cub keep their
assertions; Entish Restoration, Life Goes On and Scute Swarm moved to positive pins. The conditional-spell
RIDER family (the *additive* form) is a different shape and is untouched.

### ⭐ (original scoping, kept — it was accurate) "IF \<condition\>, \<X\> INSTEAD"

**This is the highest-leverage thing left on the shelf's nearest deck, and the expensive half is already
built.** No general conditional-replacement wrapper exists today (only two anchored exile-if-dies riders),
so all three cards park:
```
Scute Swarm       create a 1/1 Insect. IF you control six or more lands, create a COPY of this creature instead.
Entish Restoration search for up to two basic lands. IF you control a creature with power 4+, up to THREE instead.
Scythecat Cub     put a +1/+1 counter. IF this is the SECOND time this ability resolved this turn, DOUBLE instead.
```
**⭐ THE CONDITIONS WERE PRE-VERIFIED against `evaluateInterveningIf` — two of three already answer:**
```
"you control six or more lands"                              → true   ✅ expressible
"you control a creature with power 4 or greater"             → false  ✅ expressible (correctly, on that board)
"this is the second time this ability has resolved this turn" → null   ⛔ NOT expressible — Scythecat parks
```
So the work is **NOT** a conditional subsystem from scratch. It is: a **branch node in the effect program**
(`{ condition, ifTrue:[…], ifFalse:[…] }`), evaluated at resolution through the evaluator that already
exists. Narrow arms of this shape are precedent — `reveal-top-conditional` carries `thenRoute`/`elseRoute`,
and `structure:"modal"` already means the program shape is not flat.

**⚠️ REFUSING THE HALF-MODEL IS CORRECT TODAY, so do not "simplify" by dropping the instead-clause:** creating
the 1/1 when the card says copy is under-delivery, but it is still a printed effect that does not happen —
the dropped-effect class. Park until the branch is real.

**Build order, from the pattern that has worked three times this run:** the evaluator half is done, so add
the branch node and its resolution FIRST, then admit the parse arm — never the reverse.

### 🎯 EARTH BENT — 81% → **83%** (`25f9943d` Lotus Cobra, `74533daf` Toph). SEVEN cards to the bar.

**⭐ A GUARD THAT EXPLAINS ITSELF IS AN INSTRUCTION, NOT A WALL — third time this run.** The CDA count
allowlist's rule is *"every branch maps to an evaluator `countForSpec` computes EXACTLY"*, and its comment
named Toph's *"+1/+1 counters on lands"* as excluded **for having none**. Writing the evaluator dissolved the
reason. Same shape as the once-per-turn latch (*latch first, admit second*) and the condition-gated mana
whose *"until conditions are real"* had already come true. **Satisfy the condition; do not widen the guard.**
Order is load-bearing here: a CDA SETS base P/T, so admitting first would have set a fabricated **0/0**.

**The remaining seven, diagnosed — do not re-derive:**
```
Scapeshift          "sacrifice ANY NUMBER of lands … up to THAT MANY" — a linked X. Subsystem.
Planar Engineering  "sacrifice TWO lands" — a pure COUNT variant of a modeled arm, BUT applySacrificeLand
                    pauses for ONE pick; N picks need multi-select choice machinery. 15 corpus carriers.
Entish Restoration  a third sentence: "instead search for up to three" — a conditional REPLACEMENT.
Ashaya              "Nontoken creatures you control are Forest LANDS in addition…" — a layer-4 GROUP
                    type-add. The applier already handles op.types/op.subtypes; the selector is the work.
                    ⚠️ Its own first line counts lands, so this is a real feedback loop — check for it.
Amulet of Vigor     needs an "enters tapped" TRIGGER event (entersTapped is a play-path check today).
Scute Swarm         six-land token-copy rider · Scythecat Cub second-resolution doubler — both riders.
The Ozolith         counter-migration on leave + a combat-step move. Two triggers, both unmodeled.
```
**`sacrifice a land` already composes with the fetch** (`["sacrifice-land","tutor"]` parses HIGH) — the count
is the only gap, which is why Planar Engineering is the nearest of these and still not a slice.

With no shared lever left (below), the way to move the 1.0 metric is to convert ONE deck at a time, and Earth
Bent is nearest. Its gap, from `measure-coverage.mjs "earth bent"`:
```
8 ETB trigger · 4 spell effect · 2 static anthem · 1 each dies / attacks / activated / upkeep / other
```
Named: Amulet of Vigor · Scute Swarm · **Lotus Cobra** · Scythecat Cub · Lumra · Toph · Ashaya · Scapeshift ·
The Ozolith · Earth Rumble.

### ✅ BUILT (`25f9943d`, +4 — Lotus Cobra #323; Earth Bent 81% → **82%**)

**The scoping below held up exactly, and its central claim is the reusable part: this had the SHAPE of a
missing-sibling guard and was not one.** A tap source can DEFER the colour choice to the payment planner; a
resolution-time add must commit, because the pool has no wildcard slot. The regex was the easy half.

**THE RULE:** colour from the controller's **commander colour identity** (CR 903.4), falling back to the
**source permanent's own colours**. Board-asserted — green cmdr → `{G}`, **blue cmdr → `{U}`** (the identity
drives it, not the source), no cmdr → the source's `{G}`, nothing determinable → **adds nothing**.

**⚠️ THE IMPORT EDGE WAS AVOIDED ON PURPOSE.** `layers.commanderColorIdentity` exists but is module-local;
exporting it adds an edge into layers — *the class that crashed module init while the suite stayed green.*
The command zone is plain state, so it is read inline (the codebase's own "kept local to avoid coupling"
convention). **Module-graph check run.**

**⭐ N=1 ONLY** — "two mana of any ONE color" is a different promise and "two mana of any color" lets them
DIFFER. Corpus: **615** printings of the N=1 form vs 35/29/23 for the multi forms. The rest stay Arbiter.

**⚠️ AND A FIXTURE LESSON, AGAIN:** the source-colour fallback looked DEAD until tested against the REAL
card — a synthetic fixture without a `colors` field makes that branch unreachable and the whole effect look
broken. **That is the fourth time this session a fixture, not the engine, was the bug.**

Two stale CREED pins were **split, not rewritten**: both named Lotus Cobra on *"a fabricated mana is a
forbidden FP"* (true when written). Their other members — the filtered basic-land subject, Scute Swarm's
six-land rider, Scythecat Cub's second-resolution doubler — were **re-verified as still parking** and left
untouched.

### ⚠️ (original scoping, kept — it was accurate) "ADD ONE MANA OF ANY COLOR" IS A DESIGN CALL

The parse gap is real and tiny: **`add {G}` parses HIGH, `add one mana of any color` parses LOW**, while the
MANA-ABILITY side has understood that phrasing forever (Birds of Paradise is `native-mana`). Fifth
missing-sibling of the run — *except it isn't, and that is the point.*

**The blocker is not the regex, it is the COLOUR CHOICE.** `addMana` takes one specific colour and the pool
has no wildcard slot, so a tap-source defers the choice to the payment planner (`colors:[W,U,B,R,G]`) while a
RESOLUTION-time add must commit to a colour immediately. Inventing that heuristic is a modelling decision,
not a parse fix, and a quietly-wrong one degrades sim fidelity invisibly.

**Payoff, measured:** 234 parked cards contain the phrase, but only **11 are trigger-shaped** (the rest are
tap abilities already handled). **Lotus Cobra #323** is the prize; then Nissa #2106, Outcaster Trailblazer
#2968, Quirion Sentinel.

**Two viable designs — pick deliberately, do not drift into one:**
1. **Controller's commander colour identity**, deterministic in WUBRG order. `commanderColorIdentity` already
   exists in `layers.js` (~1495) but is NOT exported — exporting it adds a manaModel→layers edge, and *that
   edge class is what crashed module init two slices ago*, so check the graph before adding it.
2. **The source card's own colour identity** (Lotus Cobra → `{G}`). No new import, and it matches what the
   card's deck almost always wants — but it is wrong for a 5-colour deck holding a mono-coloured source.

**Either way the AMOUNT is exact, so the error can only be play-QUALITY (a safe FN), never more mana than
printed.** That is what makes this buildable at all — but it still deserves a deliberate choice, not one
invented at the end of a session.

### 🪶🪶 THE SHELF GAP IS A PER-DECK TAIL TOO — measured (`probe-shelf-blockers.mjs`, `c1204aa2`)

**Read this before planning any "push Joe to 90%" work.** The probe ranks blocking sentences by **how many
DECKS** they touch, because the 1.0 bar is per-deck: six cards inside one deck move one deck; the same six
spread across six decks move six.
```
16 decks · 340 parked card-slots · 468 distinct blocking shapes · 411 of them touch exactly ONE deck
```
**There is no shared lever left on the shelf.** Joe's ten sub-bar decks are **ten separate grinds of ~30
slots each**, not a few mechanics. This is the same shape the top-2500 blocker probe found, arrived at
independently — treat "a mechanic will unlock several decks" as disproven unless a probe says otherwise.

**The widest shared blocker is `Teamwork` (3 decks) and it is a SUBSYSTEM, not a slice:** an optional
additional cost (*tap any number of creatures you control with total power N or more*) **plus a cast-time
flag every carrier reads back** (*"if this spell was cast using teamwork, choose both instead"*). Crediting
the keyword alone drops the conditional half — the forbidden direction. 17 corpus cards.

**⚠️ THE PROBE OVER-REPORTS IN THREE WAYS** (all documented in-file): bare KEYWORDS, EFFECT FRAGMENTS off a
permanent, and — surfaced live by this run — **multi-face/Saga lines**, because each line is judged carrying
the SOURCE CARD'S TYPE. That rule is load-bearing everywhere else; the noise is its price on transforming
cards, and it is why a bare `Flying` appeared in the top rows.

### 🎯 THE SHELF IS THE TARGET — and Colton's side is effectively DONE

```
colton  92%  (457/499, 5 decks)   below the bar: cdh 79% ONLY — and cdh is arithmetically capped (~82%)
joe     73%  (797/1098, 11 decks) below the bar: TEN decks. Halfshell heroes 57% is the worst on the shelf.
```
**So every remaining point of shelf work is JOE'S**, which matches the standing note that 1–2 Joe cards per
subsystem is a big win. `node app/scripts/measure-coverage.mjs <deckname>` filters to one deck and prints its
gap by mechanism — that is the fastest way in.

### ✅ COMMAND-ZONE PAIRING KEYWORDS (`62c473c9`, +7) — found by walking the SHELF, not the corpus

Halfshell heroes has **three of the four turtles** blocked on `Partner—Character select`. Bare `Partner` was
already credited as inert; its siblings were not, on a comment claiming they *"carry extra unmodeled text"*.
**Read against the corpus rather than recalled, that was wrong** — all 47 pairing lines carry ONLY a reminder,
and the engine never reads them to seat anyone (`commanderCards` comes from the DECK DEFINITION).
```
Partner—Friends forever / Character select / Survivors / Father & son   ×18
Choose a Background  ×31        Doctor's companion  ×27
```
**⛔ `Partner with <name>` STAYS REFUSED** — its reminder is a REAL linked ETB tutor (CR 702.124f). The
em-dash in the label alternation is what keeps it out; M26 loosens it to `.` and three pins fail.

**⚠️ The alternation is corpus-derived — I enumerated every distinct pairing line before writing it.
`Partner—Father & son` is why the class is `[a-z'& ]`; omitting the ampersand silently dropped two cards.**

**The turtles still park** (Donatello's token replacement, Raphael's damage doubler, Leonardo's token trigger,
Michelangelo's Raid) — this removed one shared blocker, not all of them. **Those four effects are the next
shelf target, and they are one deck's commanders.**

### ✅ LEONARDO IS THE FIRST TURTLE HOME (`e1e1977c`, +1 — Halfshell 57% → 58%)

His real blocker was **`"Do this only once each turn."`** on an ADD-COUNTER atom. The rider was modeled for
`discover / draw / gain-life / create-token` and not for counters, because `ONCE_PER_TURN_HONORED` admits
only ops whose RESOLVER reads the flag. **Latch first, admit second** — implementing the latch before
touching the set is what kept this from crediting a card that fires on every token. Board-asserted: first
token 3 → 4, second token places nothing.

**⚠️ TWO FIXTURE TRAPS, both mine, both cost real time — they are in the test file so nobody repeats them:**
1. **Token-ness is read off the CARD, not the permanent wrapper.** `token:true` on the permanent alone fires
   NOTHING and looks exactly like a dead trigger.
2. **A one-letter fixture name ("T") collided with self-reference detection** and turned *"Whenever a TOKEN
   you control enters"* into an `etb/self` trigger. The real card was always fine.

Both were caught the same way: **re-test against the REAL card before concluding anything about the engine.**
That rule has now saved three wrong conclusions this session (this pair plus Weathered Wayfarer).

### ✅ MICHELANGELO HOME TOO (`83269996`, +2 — Halfshell 58% → **60%**)

He needed **two** independent fixes, and my prediction above was **half wrong in an instructive way**:

1. **`"At the beginning of your SECOND main phase"` detected NOTHING** — while *first / precombat* main had
   mapped to `firstMain` since its own slice. **The fourth missing-sibling guard this run.** Fires at the
   postcombat-main entry, gated on the PHASE because both mains share step `"main"` (the firstMain comment
   already calls that double-fire "the landmine here").
2. The `Raid (the Fridge) —` label — corpus-checked: **exactly ONE card** prints a parenthesised ability word.

**⭐ THE LEDGER PREDICTED (2) AND CALLED IT THE BLOCKER. It wasn't.** Bisecting to the simplest failing form —
*"At the beginning of your second main phase, draw a card."* — showed EVERY variant failing, label or no
label. **Fixing the label alone would have moved nothing.** Bisect to the simplest failing case before
believing a diagnosis, including one of mine.

**⚠️ AND A PIN THAT READ STRONGER THAN IT WAS:** `post.hand === pre.hand + 1` still passes under the
double-fire mutation (pre becomes 2, post 3). Measured, then tightened to ABSOLUTE counts. **A relative
assertion about a counter is no guard against something that increments both sides.**

**The remaining two turtles:** Raphael's filtered damage doubler ("Double all damage that creatures you
control WITH COUNTERS ON THEM would deal") and Donatello's "those tokens PLUS a Mutagen token" replacement.
Both are replacement effects with a filter, and `tokenMultiplier` (Wave-3a) is the nearest existing seam.

### ⭐⭐ THE RULE THAT MAKES THIS WHOLE SEAM TRACTABLE — DIRECTION, NOT PRESENCE

Auditing the tail-injection probe's top five clusters (~110 of its 165 cards) found **exactly one** defect.
The clusters that were fine and the one that wasn't differ in one way, and it is the whole filter:
```
an ignored tail that ADDS an effect  →  the engine UNDER-delivers  →  FN, SAFE       (Talismans, Signets)
an ignored tail that RESTRICTS       →  the engine OVER-delivers   →  FP, FORBIDDEN  (Mox Opal, Jeweled Lotus)
```
**Do not grind "is any text ignored" — grind "is a RESTRICTION ignored".** `probe-ignored-restrictions.mjs`
does exactly that: restriction-shaped phrases on cards the metric already calls NATIVE. **22 cards across 7
phrases in the top 2500** — small enough to audit by hand, and it found Mox Opal on its FIRST run.

### 🩸 CONDITION-GATED MANA — Mox Opal #241 offered unconditionally (`b84252af`, −16)

*"Metalcraft — {T}: Add one mana of any color. **Activate only if** you control three or more artifacts."*
`manaSources` has no activation-condition concept. **Verified on a board: a LONE Mox Opal — its own
metalcraft unmet, being the only artifact — came back as a live any-colour source.** A turn-one ritual out
of a card that should be dead. Fanatic of Rhonas #418 handed over `{G}{G}{G}{G}` with no ferocious check.
All 16 LOST cards carry the gate, **zero collateral**.

**NARROW ON PURPOSE:** only the `activate only if <condition>` board gate. *"Activate only as a sorcery"* is
a TIMING rule handled elsewhere and is deliberately excluded (pinned).

**✅ AUDITED AND CLEARED — do not re-mine these:** the Talisman/Signet mana cluster (under-models: the
coloured painful ability is not offered AT ALL, so the engine gets less than printed), **enters-tapped**
(handled at the play path in `actionDispatcher`, not `createPermanent` — a low-level constructor check will
mislead you), and the **token/counter doublers** (`tokenMultiplier`, Wave-3a).

**Still unaudited on the restriction worklist:** `unless that player pays` (Rhystic Study #44, Mystic Remora
#98 — a "may draw unless they pay" the AI must actually be offered), `activate only as a sorcery`,
`can't be blocked except by`. **Rhystic Study is the highest-rank card on the list — start there.**

### 🩸 SPEND-RESTRICTED MANA WAS GENERAL MANA — 60 cards, incl. JEWELED LOTUS (`9861e475`, −60)

**Corpus went 12,288 → 12,228 and that is the honest direction.** `"{T}: Add {U}. Spend this mana only to
cast an artifact spell."` (CR 106.6) was modeled as ordinary mana, because the payment planner has no
restricted-mana concept. Jeweled Lotus's three **commander-only** mana were spendable on anything — the
engine was playing a strictly better card than the one printed.

**⚠️ THE GUARD ALREADY EXISTED — for QUOTED/GRANTED abilities only** (`stripNonSelfQuotedGrants`, Battery
Bearer), with the reasoning spelled out in its own comment: *"the payment planner has no restricted-mana
concept → route out (FN-safe)"*. **A card's OWN printed mana line had no such check.** That is the identical
shape as the lossy anthem tail: **a guard written for one entry point and never applied to its sibling.**
When you find a guard, check every other path that needs it — this run has now hit that pattern three times.

Verified NARROW: all 60 LOST cards carry a spend restriction, **zero collateral**.

### ⭐ THE INSTRUMENT — `probe-lossy-clause-tails.mjs` (find this class ON PURPOSE)

Injects a clause that can never be modeled (`"and glorbulate"`) into each printed line of every native card
and re-classifies. **A card that STAYS native proves its parser read a prefix and ignored the rest.** The
previous instance of this FP class was found BY ACCIDENT; this one was found by looking.

**⚠️ EXCLUDE `tier === "land"` — the probe's own first run was wrong.** A land is credited playable by BEING
a land, so its tier cannot respond to an injected tail and every land reports as a finding: 4 of the top 5
shapes and ~48% of flagged cards. Excluding lands cut 612 shapes/657 cards → **148/169** and left the real
cluster visible. `native-mana` cards are KEPT — their tier does come from parsing.

**The remaining 148 shapes are an unworked seam.** The mana cluster was the biggest and is now closed; the
rest (`Storm`, `Flashback {2}{R}`, token/counter doublers, `Overload`, `Enchant creature`) are unaudited —
some will be legitimately-dropped whole lines, some will be more of this. **Re-run it after the fix and work
down the list.**

### ⛔⛔ A PIN THAT PASSES IS NOT EVIDENCE IT TESTS WHAT IT SAYS (`bd4973cd`) — the run's sharpest lesson

Crediting the ETB chosen-type chooser (a real setup replacement the engine implements) turned **five green
tests red**. Every one was already broken; the chooser line was an unaccounted line propping them up.

**The live FP it uncovered — the group-anthem parser had an all-or-nothing guard for a `have <tail>` and NONE
for any other tail:**
```
"Creatures you control get +1/+1 and can't be blocked."   →  native-static, PUMP ONLY
"Creatures you control get +1/+1 and glorbulate."         →  native-static, PUMP ONLY
```
**Half the printed effect, credited.** Two CREED pins claimed to cover exactly this and passed for the wrong
reason. Fixed: any trailing text that is not a `parseAnthemHaveTail`-validated grant now drops the WHOLE
clause. **Tier diff LOST 0** — no real card was leaning on it, so this was a loaded gun, not a wall.

**⭐ AND FOUR STALE FIXTURES, each VERIFIED rather than re-baselined.** Two named a clause "unmodeled" that
has since been BUILT — *"exile target nonland permanent an opponent controls"* classifies `native-trigger`
standing alone, and *"draw a card. Then discard a card"* is captured WHOLE (nothing was being shed). Both
now use clauses that **cannot be built later**, so the pins cannot go stale again. **When a CREED pin goes
red, first ask whether its "unmodeled" fixture got modeled — do not flip the expectation.**

**Realmwalker #607 (top-1000) also landed**: chosen-type cast-from-top, a DYNAMIC filter resolved in
`playFromTopPermission` against the granter's stored `chosenType`. **Unchosen grants NOTHING, not everything.**

### ✅ CHOSEN-TYPE ON CREATURES — BUILT (`665e45fa`, +1) and the scoping below held up exactly

Built in the order the scoping demanded: **selector layer-awareness FIRST**, then the self-type-add, then the
`"Other …"` cell. Building the parser arm first — the obvious order — would have credited these cards native
while their printed self-type-add did nothing for any selector.

**⛔ THE REAL FIND IS A PRE-EXISTING FALSE POSITIVE IT SURFACED, and its class is broad.** Morophon, the
Boundless flipped to native-static with its **{W}{U}{B}{R}{G} cost reduction UNMODELED**. Cause: the residue
builders stripped periods (`.replace(/[\s.]+/g, " ")`), **deleting the sentence boundaries `isKeywordOnly`
splits on** — the exact guard its own comment describes (*"a trailing non-keyword sentence glued on by a
strip is swallowed whole"*). A leading `"Changeling "` then absorbed the whole rider:
```
isKeywordOnly("Changeling Spells … cost {W}{U}{B}{R}{G} less to cast. This effect …")   → false  ✅
isKeywordOnly(same text with periods stripped)                                          → TRUE   ⛔
```
**Any keyword line could have swallowed any unmodeled text behind it.** Fixed on the two residues that feed
`isKeywordOnly`; the three siblings that merely test `length > 0` are unaffected and were left alone.
`LOST 0` says nothing else was leaning on it — this was a loaded gun, not a load-bearing wall.

**⭐ THE RULE: a residue that feeds `isKeywordOnly` MUST keep its periods.** Normalize whitespace with
`/\s+/g`, never `/[\s.]+/g`.

Still parked, with reasons: **Metallic Mimic #1055** (an enters-with-counters replacement), **Roaming Throne
#133** (trigger doubling), **Realmwalker #607** (chosen-type cast-from-top — the one place the cast-from-top
seam and this one meet).

### 🔬 (original scoping, kept — it was accurate) CHOSEN-TYPE ON CREATURES

The blocker probe ranked this cluster high (*"As this creature enters, choose a creature type"* ×5 plus
*"This creature is the chosen type in addition to its other types"* ×3), and it holds real cards:
**Roaming Throne #133 · Metallic Mimic #1055 · Adaptive Automaton #1755 · Realmwalker #607**. I scoped it
fully before writing any code. **Do not treat it as a vocabulary cross — it is not.**

**What ALREADY exists (more than expected):**
```
perm.chosenType + resolvers.autoPickCreatureType     ✅  the ETB chooser is real state
chosen-type ANTHEM statics (Vanquisher's Banner #361) ✅  native today
chosen-type CAST trigger (Kindred Discovery #345)     ✅  native today
layer-4 subtype ADDITION                              ✅  the applier already does `op.subtypes → subtypes.add()`
```

**The three things missing, in dependency order:**
1. **No parser arm** for *"This creature is the chosen type in addition to its other types."* It needs to emit
   a layer-4 effect whose subtype is read from `permanent.chosenType` at DERIVE time (the value does not
   exist at parse time), so it must be emitted in `staticEffectsOf`, not baked into the card descriptor.
2. **⚠️ THE TRAP, and it is the reason this is a subsystem: `permHasChosenTypeLayer` (layers.js ~126) reads
   the PRINTED CARD'S TYPE LINE, not the layer-4 derived subtypes.** So even after (1) emits the effect
   correctly, a Metallic Mimic that IS the chosen type still would not satisfy any chosen-type selector —
   the card would classify native while its printed self-type-add did nothing. **That is the vacuous-filter
   class again, in a third location.** Making the selector layer-aware is the real work, and its blast radius
   covers every chosen-type consumer.
3. **`classifyChosenTypeCastDraw` explicitly excludes creatures** (`coverage.js` ~3104:
   `if (!/\b(?:artifact|enchantment)\b/.test(type) || /\bcreature\b/.test(type)) return null;`). That gate is
   correct TODAY precisely because of (2) — lift it only after the selector is layer-aware.

**Also one genuine one-diff waiting behind it:** `CT_CAST_ANTHEM_LINE_RE` matches *"Creatures you control of
the chosen type get +N/+N"* but not **"OTHER creatures…"** (Adaptive Automaton). One word — but worthless
until (2) lands, because that card carries the self-type-add line too.

**Verdict: correct order is (2) → (1) → (3) → the "other" cross.** Anything else credits a card whose printed
text does nothing.

### ✅ CAST-FROM-TOP IS DONE (`9afbfb0d`, +7 — Elven Chorus #1376)

**⚠️⚠️ THE FINDING THAT MATTERS MOST IN THIS SLICE HAS NOTHING TO DO WITH CARDS: I SHIPPED A CRASH THE
SUITE COULD NOT SEE.** Adding one import edge — `CR_CREATURE_TYPES` into `staticAbilityParser`, read only
inside a function, exactly as the existing convention prescribes — reordered module init so that a plain
`import legalChoices.js` threw:
```
ReferenceError: Cannot access '_lifeLossWatcher' before initialization
```
**914 test files stayed green**, because vitest resolves modules in a different order than node. It surfaced
only because an ad-hoc probe script imported the module directly. **Reading a constant lazily does NOT make
an import edge safe — the EDGE is what reorders init.** Fixed by extracting the constant to the leaf
`effects/creatureTypes.js` (targeting.js re-exports it, so no existing importer changed).

**⭐ THE STANDING RULE THIS ADDS: after touching imports in `src/lib/learn/`, run
`node --input-type=module -e "import './src/lib/learn/legalChoices.js'"` — a green suite is not evidence
that the module graph still loads.**

Two other things worth keeping:
- **A closed vocabulary, again.** Filter words are validated against card types + `CR_CREATURE_TYPES`; an
  unlisted word parks the clause. Galea #12094 ("aura and equipment spells" — non-creature SUBTYPES) pays
  for that line and parks. Correct trade, straight from the vacuous-filter class.
- **The merge had to become a UNION.** `a || b` was fine while the only values were `"any"` and `null`;
  with type filters it silently dropped the second permission (Eladamri + Mystic Forge → creature-only).

**⛔ AND A DELIBERATE PIN WAS OVERTURNED — read this before re-parking it.** The parser declined to credit
*"You may look at the top card of your library any time"* citing "an existing pin (topCardRouter's Iron Lad)
deliberately keeps such cards body-only". **That was circular** — Iron Lad was parked ONLY by that line, and
its activated ability classifies `native-activated` standing alone. The line is now credited INERT beside
its already-credited and strictly MORE public sibling *"play with the top card revealed"*: looking changes
no game state and this sim is perfect-information, so **no effect is being dropped**, which is exactly why
crediting it cannot become a claimed-native no-op. It was the shared blocker on **6 of the 8** cards here.

Still parked and why: **Bolas's Citadel #263** (life-cost cast rider), **Mystic Forge #414** ("artifact
spells and COLORLESS spells" — colorless is not a type word), **Realmwalker #607** (needs the chosen-type
mechanic), **Augur of Autumn #1124** (Coven), **The Reality Chip #1025** (attach-gated permission).

### (original scoping, kept) — CAST-FROM-TOP-OF-LIBRARY, and half the seam already exists

The 9-card cluster the blocker probe ranked #1. **Measured, so build against this and not a guess:**
```
"You may play lands from the top of your library."            → native-static   ✅ ALREADY MODELED
"You may look at the top card of your library any time."      → body-only       ⛔
"You may cast artifact spells from the top of your library."  → body-only       ⛔  ← the real machinery
"You may play the top card of your library."                  → body-only       ⛔
```
**The land form is the reference implementation** — a play-from-top seam already exists and works; this is
extending it to a TYPE-FILTERED cast and to the unfiltered form.

Cards: **Bolas's Citadel #263 · Mystic Forge #414 · Realmwalker #607** (+6).

**The look-at-top static is a separate, cheaper piece and is safe to model as a genuine no-op:** "look" changes
no game state (it changes DECISIONS), so recognizing it costs nothing and unparks the cards that pair it with
a cast-from-top they'd otherwise get credit for. **Do the cast machinery first** — crediting the look line
alone would be the transformed-text trap in a new outfit.

### (original scoping, kept — "each player's DRAW STEP" is the missing sibling of a pattern already SHIPPED)

The cheapest item on the list above, and it is a textbook missing-cross. Measured with the one-diff probe:
```
At the beginning of your draw step, draw an additional card.               →  draw/you          ✅
At the beginning of each player's UPKEEP, that player loses 1 life.        →  upkeep/you        ✅  fully built
At the beginning of each END STEP, draw a card.                            →  endStep/you       ✅
At the beginning of each player's DRAW STEP, that player draws a card.     →  (none)            ⛔  THE GAP
```
**The upkeep version is complete and is the reference implementation** — `triggers.js` ~3099 carries the
UPKEEP-PLAYER REFERENT machinery (CR 603.2b + 503.1a): an `eachPlayersUpkeep` flag set only by the anchored
"each player's upkeep" condition, a "that player" → "the upkeep player" rewrite, and `ctx.upkeepPlayerId`
threaded at ~4918. **Mirror it for the draw step; do not invent a second mechanism.**

Cards: **Rites of Flourishing #1524 · Kami of the Crescent Moon #1817 · Dictate of Kruphix #1907** (+1 more).

**⚠️ Check FIRST whether the draw-step check function fires for EVERY player or only the active one** — that
is the real work, and it is the same question the batch-arm feasibility table asks. The detection arm is
worthless if the event only reaches the controller, and that is exactly the trap the `enter` arm hit.

## 📈 THE CEILING QUESTION — ANSWERED WITH EVIDENCE (Colton asked 2026-07-28: "can't we get top 2500 to 70%?")

**There is NO structural cap. 70% is reachable; the constraint is RATE, not possibility.**
Regenerate with `node app/scripts/probe-top2500-ceiling.mjs` (MTG_APP_ROOT set to the install).

**⚠️ THE TWO TOOLS DISAGREE BY ~0.3pp — `measure-coverage.mjs` IS AUTHORITATIVE.** The ceiling probe read
52.5% (1,312/2,500 · 1,188 parked) while `measure-coverage` read 52.2% (1,305/2,500) *later*, which is
impossible from shipping features. Cause: they slice the top 2500 from DIFFERENT POOLS — `measure-coverage`
filters to "real cards in the active index" (dropping art-series and similar), the probe uses `allCards()`
raw, so the two 2,500-card memberships differ. **Trust `measure-coverage` for any number quoted to Colton;
trust the probe for the BUCKET SHAPE only** (which is what it exists for and is unaffected by a few
membership swaps). Reconciling the probe's pool to measure-coverage's loader is a small unstarted task.

```
 381  (cum 32%)  Spell effect (other)      Chaos Warp #30 · Brainstorm #72 · Deflecting Swat #77
 195  (cum 48%)  ETB trigger               The One Ring #90 · Chrome Mox #144 · Tireless Provisioner #182
 118  (cum 58%)  Activated ability         Ashnod's Altar #132 · Sensei's Divining Top #226
 112  (cum 68%)  Upkeep/phase trigger      Arcane Denial #55 · Mana Drain #117 · Mana Vault #145
  94  (cum 76%)  Other / unclassified      Toxic Deluge #67 · Panharmonicon #261
  78  (cum 82%)  Attacks/blocks trigger    Ragavan #271 · Etali #260
```

**Four ORDINARY buckets are 68% of everything left** — spell effects, ETB triggers, activated abilities,
phase triggers. Categorically unlike cdh, where the cap is arithmetic and proven (79% now → 82% ceiling,
short by 8 multi-blocker staples). Nothing of that shape exists here.

**70% needs 438 more cards (37% of parked). 80% needs 688 (58%).**

### ⚠️ AND THE HONEST PART — THE RATE PROBLEM IS SELF-INFLICTED

This run's 14 slices moved top-2500 by only **~16 cards**, because every one was a *named single staple*
picked off the one-mode-away shortlist (Austere Command, Rakdos Charm, Cryptic Command, Warping Wail…).
Superb value per CARD — each is a real format staple — and terrible VOLUME. At ~1.3 top-2500 cards per
slice, 438 cards is hundreds of slices.

**So the strategy must change to reach 70%: stop hunting named staples, attack the BUCKETS.** The
one-mode-away list is a finishing tool, not a grinding tool — it goes quiet by construction (that is the
same instrument-blindness Colton caught twice already; see THE OBJECTIVE above).

### 🧭 THE VEINS ARE MINED OUT — what remains are THREE WAVES, each scoped below

Re-ran `probe-spell-effect-veins.mjs` after 23 slices: the pile is 381 → **371** and every remaining vein is
≤12 cards AND needs real machinery rather than vocabulary. The cheap-crossing phase of this pile is over.
**Do not go looking for another one-line fix here — pick a wave and commit to it.**

**~~WAVE A — SPELL COPY~~ ✅ SHIPPED `3c3fd256` (+5).** Remaining in it: Fork's "except that the copy is red" (changes the copy), Narset's Reversal #740 (copy + return to hand), Return the Favor #625 (Spree). ORIGINAL SCOPING BELOW — kept because the reference-implementation note is what made it quick:
**WAVE A — SPELL COPY** (Reverberate #1380 · Fork · Narset's Reversal #740 · Return the Favor #625).
`"copy target instant or sorcery spell"` is **entirely unmodeled** — the "you may choose new targets for the
copy" rider is NOT the gap, the copy itself is. Only CREATURE-spell copy exists today (Double Major, via
`snapshotCopiedCard` + the `copyNotCounter` targeting flag). Needs: a stack copy of a non-creature spell,
plus optional retargeting through `expandCastChoices`. The creature path is the reference implementation.

**WAVE B — THE ATTACK TAX** (⭐ highest RANK on the board: Propaganda #115 · Ghostly Prison #161 ·
Windborn Muse #1011). *"Creatures can't attack you unless their controller pays {2} for each creature they
control that's attacking you."* No attack-cost machinery exists at all.
**⚠️ THE FP TRAP, and it is a bad one:** modelling this as a mere RESTRICTION without actually DEDUCTING the
mana makes the AI attack for free — i.e. Propaganda does nothing while the card claims native. That is a
wrong model, not a missing one. It needs a combat-time payment (the `pendingChoice` machinery) AND an AI
decision to pay. Do not ship the restriction half alone.

**WAVE C — BATCHED ETB ENTRY. ATTEMPTED AND REVERTED — read all of this before retrying.**

**The design is CORRECT and was validated; do not re-derive it.** The one-permanent signature of
`checkEnterTriggers` is NOT the real obstacle: record each entry on a `pendingEnterEvents` queue from INSIDE
that function (covering all six call sites at once, the diesBatch trick) and drain it in `flushTriggers`
beside the graveyard / tap / counter queues. **`flushTriggers` runs at every priority-grant checkpoint
(CR 603.3), so entries between two flushes are EXACTLY the simultaneous ones** — three tokens from one effect
fire a watcher once; separate resolutions are separated by a flush. That reasoning held up; the build did not.

**WHY IT WAS REVERTED — three findings, in the order they landed:**
1. **My "~28 cards" was wrong.** The BARE forms are only **5** (Twilight Diviner, Celes, Frantic Scapegoat,
   Kotis, Back-Alley Gardener). The other ~23 carry FILTERS — "with power 2 or less" (Welcoming Vampire
   #428, Enduring Innocence #785), "with mana value 3 or less" (Tocasia's Welcome #866), nontoken, subtype,
   "tokens your opponents control".
2. **Those 5 bare-form cards flip ZERO** — every one is blocked by other text.
3. **⭐ THE ACTUAL BLOCKER, and the thing to fix FIRST:** the FILTERED clause never reaches a new detection
   arm at all. `detectTriggers` returns 0 for "whenever one or more other creatures you control WITH POWER 2
   OR LESS enter" even though a correct regex matches that exact string — so something UPSTREAM rewrites or
   rejects the clause before the arm runs. **Find that guard before writing any batch machinery**; the
   valuable cards are all behind it, and the machinery is worthless until it is found.

**AND THE COST THAT MADE REVERTING RIGHT:** the queue records on EVERY permanent entry. Paying for that with
0 cards, while the cards that mattered sat behind an undiagnosed guard, was a bad trade.

### ⭐ FOLLOW-UP: THE GUARD IS FOUND, AND WAVE C MAY NOT NEED THE MACHINERY AT ALL

**THE GUARD (finding #3 above):** `triggers.js` ~810 —
`if (!castWithExempt && /\b(?:with|while|during|named)\b/.test(c)) return null;`
A blanket reject of any trigger condition containing "with". Several PRECISELY-CHECKABLE shapes are already
carved out ABOVE it (keyword-batch combat damage, with-keyword attacks, cast-with-mana-value). A
`with power N or less` / `with mana value N or less` filter is equally checkable and belongs in that carve-out.

**AND THE SCOPING INVERTS — the FILTERED cards are the clean ones, the bare ones are hopeless:**
```
Welcoming Vampire #428   Flying + the batched trigger + the once-per-turn rider   ← NOTHING else blocks it
Tocasia's Welcome #866   the batched trigger + the rider, and nothing else        ← NOTHING else blocks it
Twilight Diviner · Celes · Kotis (the BARE forms)   all carry an "if they entered
   from a graveyard" intervening-if                                               ← blocked regardless
```

**⭐ THE CHEAP PATH — and it needs NO queue, NO drain, and NO per-entry cost.** Both clean cards carry
*"This ability triggers only once each turn"*, and that rider IS ENFORCED (`gameEngine` ~1401, keyed per
source+event on `onceTriggersFiredThisTurn`, cleared at untap). So for a card carrying the rider:

| model | behaviour |
|---|---|
| batch-once, then rider-capped | once per turn |
| **per-creature (singular `etb`), then rider-capped** | **once per turn** |

**Observably IDENTICAL** — the printed rider does the capping either way. So the batched phrasing can map
onto the EXISTING singular `etb` event, with the filter as a descriptor field.

**⚠️ VALID ONLY WITH THE RIDER.** A rider-less batched ETB mapped this way OVER-FIRES (once per token). Gate
it: have the condition matcher return `requiresOncePerTurn: true` and have the descriptor builder DROP the
descriptor when the rider is absent — the builder computes `oncePerTurnTrigger` from the effect clause and
has `cls` in hand, so that gate belongs there.

**⚠️ AND REMEMBER THE WHITELIST:** any new descriptor field (`etbMaxPower`, `etbMaxMv`, `requiresOncePerTurn`)
must be added to the explicit field list at `triggers.js` ~3171 or it is SILENTLY DROPPED — the trap that
nearly shipped the Sidisi over-fire.

### ✅ THE CATCH-ALL IS NOW DECOMPOSED — `app/scripts/probe-spell-effect-veins.mjs`

The 381-card `Spell effect (other)` pile, split into sentences with the modeled ones filtered out. The
veins, in order (top-2500 ranks shown — these are the next grinding targets, NOT single staples):

```
 12x  choose one —                                     (modal — the wrapper is built; the MODES fail)
  7x  exile ~                                          Teferi's Protection #107 · Mizzix's Mastery #796
  6x  this ability triggers only once each turn        Morbid Opportunist #255 · Welcoming Vampire #428
  5x  as an additional cost …, sacrifice a creature    Eldritch Evolution #728 · Fling #1462
  4x  gift a card                                      Dawn's Truce #359 (the Gift mechanic)
  4x  you may choose new targets for the copy          Narset's Reversal #740 · Return the Favor #625
  3x  creatures can't attack you unless … pays {C}     ⭐ Propaganda #115 · Ghostly Prison #161
  3x  you may look at the top card of your library     Bolas's Citadel #263 · Mystic Forge #414
  3x  exile target creature you control, then return   Cloudshift #792 (BLINK) — see the BLINK box below
  3x  exile top two + play them until end of next turn Light Up the Stage #1211 — see IMPULSE box
```

### ⭐ THE FAMILY IS NOW BUILT ON ONE SHAPE — DELEGATION. Reuse it; do not write a fourth subject parser.

Two arms rebuilt (`ef8bfbfc` entry, `1bc0b717` dies). Both singularize the plural subject via
`singularizeBatchSubject`, hand the clause back to `classifyCondition`, and keep only what they need from the
result. **The batch form therefore inherits the singular arm's REFUSALS as well as its capabilities and can
never be more permissive than the arm it is built on** — that containment is the entire safety argument, and
a parallel subject parser destroys it.

**The two arms differ in ONE way, and it is the thing to get right when adding the next verb:**
```
diesBatch     its OWN event + own check fn, fires once per CALL   → deaths arrive as an ARRAY: batching is REAL
              → NO rider needed
batched ENTRY mapped onto the per-entry event (etb / permanentEnters) → batching is SIMULATED
              → the printed "triggers only once each turn" rider is MANDATORY; riderless is refused
```
**Ask which one the verb is before writing anything:** if the check function already receives the whole batch,
build a dedicated event; if it receives one object, you need the rider and you must refuse without it.

### 🥇 THE BIGGEST VEIN IN THE ENGINE — "Whenever ONE OR MORE …" (CR 603.1), **291 parked cards**

Found by the vein probe and then ISOLATED with the one-diff technique. This is an order of magnitude
bigger than anything else on the board, and it is dense in the top 2500: Morbid Opportunist #255,
Kutzil #385, Welcoming Vampire #428, Caretaker's Talent #648, Enduring Innocence #785, Tocasia's
Welcome #866, The Gitrog Monster #897, Evolution Witness #914, Kambal #1145, Simic Ascendancy #1259,
Coveted Jewel #1278, Duelist's Heritage #1281, Laelia #1297, Insidious Roots #1386, Dour Port-Mage #1485.

**The one-diff isolation — the surprise is what is ALREADY done:**
```
native-trigger   Whenever another creature dies, draw a card.
native-trigger   … draw a card. This ability triggers ONLY ONCE EACH TURN.   <- the RIDER is already modeled
body-only        Whenever ONE OR MORE creatures die, draw a card.            <- the ONLY blocker
body-only        Whenever ONE OR MORE creatures you control enter, …
```
The events are modeled. The once-per-turn rider is modeled. `detectTriggers` returns **0** on the
"one or more" phrasing — it is a pure DETECTION gap, and everything downstream already exists.

### ⛔ BUT IT IS A WAVE, NOT A SLICE — and the reason is a FALSE-POSITIVE hazard, not size

**"One or more" is NOT a synonym for the singular.** "Whenever one or more creatures die" fires **ONCE**
for a simultaneous batch; "whenever a creature dies" fires once PER creature. Mapping the plural onto the
existing singular detector would OVER-FIRE — a forbidden false positive (a board wipe would draw 5 cards
instead of 1).

And the phrasing spans **SEVEN events**, each with its own check function that batches independently:
```
  77  deal (combat damage)   57  are put (into a graveyard)   46  attack   39  leave
  28  enter                  20  die                           5  become
```
`checkDiesTriggers` iterates `for (const d of dead)` and fires per object. A batched trigger needs a
SECOND pass that fires ONCE per call when ANY member of the batch matches its scope.

### ⭐ THE PATTERN ALREADY EXISTS — copy `combatDamageBatch`, do NOT invent a mechanism

**This is the single most useful thing on this page: the engine ALREADY batches triggers.** The
combat-damage arm of this very family is built and shipped — Grim Hireling / Professional Face-Breaker /
Olivia ("Whenever one or more creatures you control deal combat damage to a player"). Its anatomy:

- **A DEDICATED EVENT NAME** — `combatDamageBatch`, *not* a `batched:true` flag on `combatDamageToPlayer`
  (`triggers.js` ~1532).
- **Its own check function** — `checkBatchCombatDamageTriggers` (`triggers.js` ~5148), which fires once
  per controller rather than once per object.
- **A `descriptorFilter` predicate on `triggersForEvent`** (already a supported parameter, ~4113) that
  gates a FILTERED batch on the actual matching objects — the documented no-over-fire gate.

**A separate event name is strictly better than the whitelist I sketched above.** The singular `dies`
path is then untouched *by construction* — an unbuilt event simply has no detection and no check
function, so over-firing is unrepresentable rather than merely gated. Ignore the whitelist idea; it was
written before this precedent was found.

### ✅ ARM 1 SHIPPED — `diesBatch` (`028a999b`). **Copy this shape for the remaining six.**

The reference implementation is done and is the deliverable; the +4 cards (Morbid Opportunist #255,
Vraan #4072, Sengir Connoisseur, Vengeful Townsfolk) are almost beside the point.

**The shape to repeat, per event verb:**
1. Detection: an ANCHORED `/^one or more (…) <verb>$/` arm returning a DEDICATED event name
   (`diesBatch`), normalising the plural subject to its singular form ("one or more other creatures" →
   "another creature") and handing it to the EXISTING `creatureSubjectScope` switch — scope semantics
   shared, never duplicated. Any rider fails the `$` → undetected → Arbiter (safe FN).
2. A `check<Event>BatchTriggers(state, objects)` modelled on `checkBatchCombatDamageTriggers`: loop
   watchers, and **`break` after the first matching object** — that one line IS the batching.
3. **Chain it from INSIDE the singular check function**, not at the call sites. `checkDiesTriggers` has
   10+ callers (combat, destroy, sacrifice, amass, SBA); wiring each is how a death path silently
   misses the pass.
4. **Mind the early-return fast path** — see the bug below.
5. The pin MUST include the n=3 once-only test AND its singular n=3 counterpart firing three times.
   The contrast is the whole safety argument.

**⚠️ THE BUG THE n=1 TEST CAUGHT — expect its twin in every remaining arm.** `checkDiesTriggers` ends
with `if (!fired.length) return state2`. A board holding ONLY batch watchers fires no SINGULAR trigger,
so that early return skipped the batch pass entirely: the card classified native and never fired. **The
n=3 test passed the whole time; only n=1 exposed it.** Every singular check function has an equivalent
fast path — check it before chaining.

**CONFIRMED ON THE SECOND ARM.** `checkGraveyardEventTriggers` has the identical
`if (!fired.length) return cleared` shape. Because this entry existed, placing the batch pass ABOVE it was
a five-second check instead of a second debugging session — and the only-batch-watcher test is pinned in
`gyLeaveBatchTrigger.test.js`. **Assume the trap is present in every remaining arm until you have looked.**

### 🔍 PER-ARM FEASIBILITY — CHECKED, and it is NOT six mechanical repeats

**The arm is only buildable if its check function already sees the WHOLE batch.** `dies` worked because
`checkDiesTriggers(state, dead[])` takes an ARRAY — deaths are naturally batched by the SBA. Verified
signatures for the rest:

| arm | check function | receives | verdict |
|---|---|---|---|
| ~~`are put` (57)~~ | `checkGraveyardEventTriggers(state)` | drains `pendingGraveyardEvents` | ✅ **DONE** `e05c796b` |
| ~~`attack` (46)~~ | `checkAttackTriggers(state)` | whole combat (all attackers at once) | ✅ **DONE** `eb701643` |
| ~~`leave` (39)~~ | `checkGraveyardEventTriggers(state)` — the GY half | drains `pendingGraveyardEvents` | ✅ **DONE** `22e2293d` (+13) |
| ~~`enter` (28)~~ | `checkEnterTriggers(state, enteredPerm)` | **ONE permanent** | ✅ **DONE** `619b9513` (+3) — via the rider, no batching |

**⚡ `attack` cost ONE LINE and no machinery — check for this before building any arm.** "Whenever one or
more creatures you control attack" is merely the OLDER TEMPLATING for "Whenever you attack" (CR 508.1);
both fire once per combat, so it maps straight onto the EXISTING `youAttack` event whose once-per-combat
pass long predates this work. **Before writing a batch check function, ask whether the modern wording of
that trigger already has a once-per-event home.** It flips 0 cards today (the five bare-form carriers —
Grand Warlord Radha #5380, Angelic Guardian, Ancestor Dragon — are blocked by their EFFECTS, not
detection), and it is recorded as 0 rather than counted.

**⛔ `enter` MUST NOT be built the same way — it would over-fire.** Entries are dispatched one at a time,
so an `etbBatch` watcher would fire once PER entering permanent: "create three 1/1 tokens" would make
Welcoming Vampire #428 draw THREE cards instead of one. Building it requires first teaching the entry
path to collect simultaneous entries (token creation, mass reanimation, blink returns) and dispatch them
as one batch — a separate, larger piece of work. **Do not treat `enter` as a repeat of `dies`; the
signature is the tell.**

**So the ready work is 142 cards (are-put + attack + leave), not 214.** Plus the 16 remaining `die`
carriers, which add subtype/nontoken filters to the shape already built. `become` (5) unchecked.

**Note the 77 "deal" cards are ALREADY partly served** by `combatDamageBatch`; the parked ones there
carry a variant its anchors reject (a qualified object, a rider, a colour filter). So the true remaining
volume is nearer 214 than 291 — do not claim 291 without re-measuring per event.

### ⚠️ THE PROBE LIED TWICE BEFORE IT WAS RIGHT — both corrections are baked in, do not undo them

This instrument reported TWO false veins before it was trustworthy. Both are the same class of error as the
line-deletion trap in THE PROBE RULE, and both are now fixed in the banked script:

1. **`parseEffectClause` is not the modeled-oracle.** It misses the LEGACY whole-card path
   (`parseSpellEffect`), so plain `"draw a card"` and `"destroy target creature"` reported as blockers —
   a 9-card phantom vein. Use `classifyCard` on a synthetic single-sentence card instead.

2. **The synthetic card must carry the SOURCE CARD'S TYPE.** Wrapping every sentence as an *Instant* means
   a PERMANENT'S STATIC can never classify native however well modeled. That reported
   `"you may play an additional land on each of your turns"` as a 4-card vein (Dryad of the Ilysian Grove
   #295, Oracle of Mul Daya #499, Wayward Swordtooth #986) when `extraLandDropsOf` has modeled it all
   along — Exploration and Azusa are `native-static` TODAY. Those three are parked for their OTHER lines
   (Dryad's basic-land-type layer effect, Oracle's play-from-top, Wayward's Ascend).

**Both were caught by checking the claim against the real cards BEFORE building.** That check costs one
command and it has now prevented two wasted slices in a single sitting.

## THE SHELF (secondary read — no longer the bar, kept because it is measured and true)

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

### ✅ SHIPPED — Esper Sentinel (`a117f8a5`, rank **76** · Kellan 71→72% · Cap America 67→68%)

Both halves landed. **A** the "first <kind> spell each turn" FREQUENCY gate (CR 603.2) — **per PLAYER**, not
the source's once-per-turn, so three opponents means up to three fires a turn. The bare form was already
handled by `castNth`; only the filtered form was missing, so this adds a noncreature counter beside
`spellsCastThisTurn`. **B** the LIVE tax amount — `{X}` resolved at resolution through the SAME `selfPower`
metric slice 78 built, so a grown Sentinel taxes more and the tax can never drift from the mana model.

**⚠️ THE FIRST ATTEMPT SHIPPED AN OVER-FIRE THAT LOOKED PERFECTLY HEALTHY.** `firstEachTurn` was not in
`detectTriggers`' descriptor whitelist, so it was silently dropped — the built descriptor kept only its
`spellFilter` and fired on **every** opponent noncreature spell. `detectTriggers(card)` showed an event and
a filter and looked right. **The ledger already records this exact trap from batchCommander** ("new
descriptor field → the whitelist, or it is silently dropped") and I walked into it anyway. *Read the BUILT
descriptor, never the arm's return.*

**⭐ A SURVIVED SABOTAGE CHECK THAT WAS A TEST GAP, NOT A REDUNDANT GUARD — the third this run, and the
first of that kind.** Weakening the runtime gate from `n !== 1` to `n < 1` (fire on EVERY cast) left every
descriptor and counter assertion green. Those covered the two halves; **nothing covered the join**, which is
the only place the card's behaviour lives. Six end-to-end assertions now drive `checkCastTriggers` directly.
*When a check survives, ask which of the three it is: redundant guard, untested guard, or untested SEAM
between two tested halves. Storm and the pip qualifier were the second kind; this was the third.*

**Tier diff GAINED 1 / LOST 0** — scored honestly per `eb701643`: the trigger half reaches **9** cards, each
still needs its own payoff modelled, and only Esper Sentinel had both. Predicted and confirmed, not
discovered.

Mutation-checked: **M81** drop the whitelist entry → killed by 2 · **M82 SURVIVED** → end-to-end section →
**M82b** killed · **M83** count creature spells as noncreature → killed by 2 · **M84** ignore the metric →
killed by 2.

⚠️ **A NOTE ON THE BOOT SWEEP:** my first draft of the new test wrote the literal marker word in a comment,
which would have tripped `grep -rl MUTANT app/src/` on every future boot and trained the next session to
ignore a real alarm. Reworded. **Never let that token appear outside a live sabotage check.**

- **Nothing mid-edit.** Corpus **35.9%** (12,298/34,245). Suite **944 files / 12,053 tests**,
  lint 0, MUTANT sweep clean. Branch `claude/aura-enchant-noun-vocab` (NOT pushed; the name is stale —
  it carries dozens of unrelated slices and wants a rename before any PR).

  **PLAY-WEIGHTED — the bar:** top-1000 **73.2%** 🎉 · top-2500 **55.0%** · top-5000 **43.5%** · top-10k **36.1%**.
  (Session start: 69.6 / 51.8 / 41.5 / 34.7.)

  **SHELF:** six decks at/above 90% — Slivers 100 · Vihaan 96 · Omnath 93 · Zaxara 92 · Mothman 90 ·
  Earth Bent 90. Next real target **Did you say Dragons? 80%**. cdh 81% (capped ~82 — do not start).

  **⚠️ THE SHELF IS NOW WAVE-SHAPED, NOT SLICE-SHAPED — read this before hunting for another quick win.**
  Every deck below the bar needs 13+ cards across DISTINCT mechanics; the one-line-away list's repeated
  shapes are worked out (equipment-combat-damage: non-lever · power-scaled mana: shipped). Dragons needs 12
  and has 12 one-line-away rows, each its own build. Sized cold, so the next session does not re-derive it:
  ```
  Hellkite Courser   NO COMMAND ZONE in gameState — a whole zone, not a slice
  Ancient Brass Dragon  d20 roll
  Klauth             TRIGGERED mana + spend-restricted — the over-claim class, likely a refusal
  Terror of the Peaks   a LIFE-cost tax on opponents' spells — Hexing Squelcher's class
  Morophon           ✅ SHIPPED (colored-pip cost reduction)
  ✅ Tiamat SHIPPED · Sarkhan Soul Aflame · Betor · Call the Spirit Dragons · Scion of the Ur-Dragon · Lorehold  multi-piece
  ```

### Shipped this stretch — EVERY ONE was "the engine knew the EFFECT, not the PHRASING"

| commit | slice | flips |
|---|---|---|
| `3259071d` | attached-bonus parser reads the host NOUN, not the literal `"creature"` | 0 — infrastructure |
| `48d8560c` | positive COLOR target restriction (CR 105.2), layer-aware | **+18**, incl. Red Elemental Blast #433 |
| `4f915ba6` | whole-graveyard exile (CR 701.10a) + mass-exile verb parity | **+10**, incl. Farewell #163 |
| `1fc6a1f8` | mana-value-filtered creature wipe (CR 202.3) | **+2**, incl. **Austere Command #169** |
| `40359cd4` | disjunctive power-OR-toughness bound | **+1**, Warping Wail #2046 |
| `45a9e771` | symmetric self-damage atom (CR 119.3) | **+1**, **Rakdos Charm #330** |
| `97415979` | mass own-board regenerate (CR 701.19) + `eachCreatureYouControl` scope | **+1**, Golgari Charm #1603 |
| `0361e27c` | opponent-scoped mass tap (CR 701.21a) — applier now honors non-chosen scopes | **+1**, Cryptic Command #1617 |
| `b7bf0e46` | counter an ABILITY on the stack (CR 701.5a) — new `stackAbility` target class | **+7**, Stifle · Bind · Trickbind · **Sublime Epiphany #1709** |
| `75dbd1a1` | repeatable modes (CR 700.2d) — `kMultisets` in the cast enumerator | **+5**, **Mystic #1431** · **Fiery Confluence #1561** |
| `028a999b` | batched DEATH triggers (CR 603.1) — new `diesBatch` event ⭐ reference impl | **+4**, **Morbid Opportunist #255** · Vraan #4072 |
| `eb701643` | batched ATTACK → the existing `youAttack` event (one line, no machinery) | **0** — detection half only, honestly scored |
| `22e2293d` | batched GRAVEYARD-LEAVE — new `gyLeaveBatch` event | **+13**, **Insidious Roots #1386** · Desecrated Tomb #4196 · Quintorius #9596 |
| `f682aadb` | scoped counters-put WATCHERS — the slice the source comment deferred | **+2**, Enduring Scalelord · Wickersmith's Tools |
| `e05c796b` | batched graveyard-ENTER + a silently-dropped zone filter ⚠️ | **+1**, Sidisi #3513 |
| `c5e68496` | BLINK / FLICKER (CR 400.7) + a splitter keep-whole guard ⚠️ | **+7**, **Ephemerate #440** · Cloudshift #792 · Blur · Momentary Blink |
| `a3488b65` | impulse-exile takes a COUNT (the runtime already existed) | **+2**, Act on Impulse · Rob the Archives |
| `db4e6d51` | SACRIFICED REFERENT (CR 608.2h LKI) — narrowed a safety guard ⚠️ | **+7**, **Fling #1462** · Thud · Bloodshot Cyclops |
| `484c3a0d` | …second reader off that stamp: GAIN-LIFE | **+7**, Reckoner's Bargain #3671 (family 14) |
| `6e030eb0` | …third reader: DRAW | **+2**, Life's Legacy #2490 (family 16) |
| `46798947` | …and the NATIVE-TRIGGER chain gets the same strip | **+1**, plus 42 cards RETIERED mixed→trigger (a better label, not a gain) |
| `f61fd1d6` | ⭐⭐ **THE RESIDUE CHAIN STOPS GUESSING** — measured GAINED 49 · LOST 0 · RETIERED 0 | **+49** corpus-wide; Abbot of Keral Keep · Sea Gate Oracle · Voldaren Epicure · Adaptive Omnitool |
| `6d892d21` | ⭐ **EQUIPMENT composes with its trigger** — a composition gap, not a card gap | **+8**, **Mask of Memory #1002** · **Goldvein Pick #2100** · Prying Blade · Skeleton Key |
| `2c90b6fa` | typed uncounterable — the read went per-PLAYER → per-SPELL | **+2**, Prowling Serpopard #3581 · **Surrak Dragonclaw #3186** |
| `58c1dd23` | ⚠️ subtype-scaled MANA — the vocabulary gate runs the OPPOSITE way | **+4**, **Elvish Archdruid #942** · Magus of the Coffers #5409 |
| `04a8e665` | activated-cost reduction for ARTIFACTS — the subject is a FILTER | **+1**, Forensic Gadgeteer #1374 |
| `44e2b391` | the "creature TOKEN you control" trigger scope — THREE states, not two | **+2**, **Curiosity Crafter #1734** · Anointer Priest #11214 |
| `469bee92` | ⭐ the **"ANOTHER" qualifier** (CR 109.5) — bounce target + ETB scope | **+7**, **Aether Channeler #1526** · **Garruk's Packleader #2014** · Paleoloth |
| `1b43caf7` | ⚠️ basic-land-SUBTYPE tap augment — a banked "can't" that wasn't true | **+2**, **Crypt Ghast #525** · Nirkana Revenant #2848 |
| `80261920` | untap target ARTIFACT / ENCHANTMENT / NONLAND PERMANENT — vocabulary, not machinery | **+6**, **Voltaic Key #1776** |
| `766bfabe` | ⭐ ENTERS-trigger multiplier — **two** fire sites (ETB *and* landfall) | **+4**, **Panharmonicon #261** · **Ancient Greenwarden #681** · **Yarok #2530** · Starfield Vocalist #2082 |
| `3b2ac11a` | ATTACK-trigger multiplier — Teysa's twin, shared expansion body | **+1**, **Isshin, Two Heavens as One #1456** |
| `d0d0c09c` | token-split + planeswalker EDICT pools — the sense IS the card | **+5**, **Sheoldred's Edict #1154** · **Accursed Marauder #464** · Angrath's Rampage · M.O.D.O.K. |
| `7a1fab1d` | type-filtered untap — the family's 3rd shape, PARAMETERIZED not a 3rd twin | **+3**, Unwinding Clock #545 · Drumbellower #1940 · Prophet of Kruphix |
| `ab92c504` | ⭐ **THE MISSING-CROSS FINDER** (probe) + COLOR×TYPE cost reduction | **+4**, the **Monument cycle** #664 · #1009 · #1879 · #2151 |
| `9d1e4f8b` | lands-only play-from-top — needed a NEW spell gate to stay honest | **+2**, **Oracle of Mul Daya #499** · **Courser of Kruphix #1232** |
| `d1cc3eb4` | the you-scoped land doubler — an empty CELL, zero new machinery | **+2**, **Mirari's Wake #680** · Zendikar Resurgent #2260 |
| `0168559a` | ⭐ **WAVE B — the ATTACK TAX** (CR 508.1g): restriction + payment as ONE change | **+3**, **Propaganda #115** · **Ghostly Prison #161** · Windborn Muse #1011 |
| `b9d1d3c9` | ⭐ THE DRAIN MIRROR — lifegain⇄lifeloss, one UNBLOCKED + one RE-POINTED | **+6**, **Sanguine Bond #496** · **Vito #492** · **Exquisite Blood #508** · Bloodthirsty Conqueror #901 |
| `619b9513` | ⭐ WAVE C — batched-ETB filter, WITHOUT the batch machinery | **+3**, **Welcoming Vampire #428** · **Tocasia's Welcome #866** · Enduring Innocence #785 |
| `3c3fd256` | ⭐ WAVE A — copy an instant or sorcery (CR 707.10) | **+5**, **Reverberate #1380** · Reiterate · Twincast |
| `9381112d` | impulse NEXT-TURN window — controller-scoped expiry ⭐ | **+6**, **Light Up the Stage #1211** · Reckless Impulse #2120 · Wrenn's Resolve #2116 |

### ⭐ THE MISSING-CROSS METHOD — `app/scripts/probe-near-miss-clauses.mjs` (banked 2026-07-28)

Four slices in a row were the same shape and **none was a new mechanic**: a parked clause sitting one
word from a clause the engine already reads, with the runtime for it fully built. A grid whose other
cells exist and whose corner nobody closed.

```
MANA DOUBLER          all players            controller ("you tap")
  land                MF-1 Mana Flare ✓      ← Mirari's Wake sat HERE
  nonland             —                      MD-1 Kinnan ✓

COST REDUCTION        color only             color × card-type
                      Ruby Medallion ✓       ← the Monument cycle sat HERE
```

**Run it before hunting named staples.** `--maxRank=2500 --distance=1` is 28s and returned 23 honest
candidates. `--distance=3` widens to 157.

⚠️ **NEAR ≠ EASY.** "Destroy target creature" and "Exile target creature" are one word apart and
different subsystems. The probe sizes the candidate list; the build still opens the file.

⚠️ **AND THE PROBE'S FIRST TWO RUNS WERE BOTH WRONG.** `land` is inside `NATIVE_TIERS`, but a land is
credited *wholesale by its type line* — its printed abilities may be entirely unmodeled. Harvesting
land text as "shapes the engine reads" produced a confident false lead (Ashnod's Altar ← Phyrexian
Tower, whose sac-for-mana is **not** modeled); excluding lands from the harvest *alone* was worse —
they fell into the parked branch and the report's whole top became phantom "blocks 13 cards" clusters.
Lands are skipped outright now. **A ranked list of plausible leads is exactly the output that doesn't
announce when it's wrong.** Verify against the corpus, never off the report.

**⚠️ THE CHEAP CROSSES ARE EXHAUSTED.** Twelve of the original nineteen distance-1 rows shipped this
run; the remainder is **wave-sized, not slice-sized**. Checked card by card, not assumed — each row
below needs a subsystem that doesn't exist yet, and each is worth roughly ONE card.

| card | what it actually needs | flips |
|---|---|---|
| Aqueous Form #735 | an `unblockable` grantable pseudo-keyword + enforcement in canBlockAttacker | 1 of 2 |
| Blade of Selves #905 | the MYRIAD keyword itself (unbuilt) | 1 |
| Reprieve #633 | a SPELL target class for bounce — only counters can target the stack today | 1 |
| Mother of Runes #512 | protection-from-a-chosen-colour, as an activated grant | 1 |
| Deafening Silence #1946 | a per-turn cast limit filtered by card type | 1 |
| Helm of Awakening #1889 | a SYMMETRIC cost reducer — the collector is controller-only by construction | 1 |

✅ **The can't-be-countered AND is DONE** (`2c90b6fa`) — it was the last row with a better-than-one-card
ratio, so **everything left in this table is subsystem work**: a keyword, a target class, or a scope the
engine doesn't express.

**`--distance=2` on the top-2500 was then run** (44 blockers) and it does NOT change that picture — the
new rows are all one card each, but they're cheap-looking and un-triaged, so they're recorded rather
than lost:

| card | the gap | note |
|---|---|---|
| Stormfist Crusader #1913 | `each player` vs `target player` draws-and-loses | an eachPlayer arm on a compound upkeep payoff |
| Spine of Ish Sah #2486 | "when this **artifact** is put into a graveyard…" vs "this **aura**" | a noun widening on the self-return; its ETB destroy already parses |
| Junk Diver #1977 · Myr Retriever #875 | dies + **another** target artifact card in your graveyard | ⚠️ "another" here excludes a GRAVEYARD card, and `notSource` matches battlefield permanent ids — not the same restriction |
| Adaptive Omnitool #2237 + 3 | an equipment trigger whose effect spans SENTENCES | the trigger-sentence strip can't fold them — a different gap in a different chain |

✅ **Goldvein Pick was looked at first and it paid — 8 cards, not 1** (`6d892d21`). The equippedCreature
scope was never the problem; two TIERS couldn't talk to each other, and each understood its own half.

⭐ **That is the transferable lesson of this whole run.** When a near-miss row can't be explained by its
own one-word diff, spend ONE probe on *why not* before writing it off as a one-card cross. Three of the
biggest finds today — the mana-doubler cell, the untap type list, this one — were all "the machinery is
built, the composition isn't."

### 🔶 THE NEXT PROBE TO RUN — `app/scripts/probe-residue-artifacts.mjs`

Asks the sub-gates directly instead of reading the tier: for every parked card, does EVERY detected
trigger route, is EVERY activated ability modeled, and was every trigger-SHAPED sentence actually
DETECTED (that third check is not optional — without it Archaeomancer's Map reported as a candidate
because its ETB routes while its second trigger isn't detected at all, so "every detected trigger
routes" passed vacuously). **68 such cards in the top-2500.** It prints the leftover text so a genuine
unmodeled static can be told from a residue artifact by eye.

Reading that list, the big remaining cluster is **EQUIPMENT/AURA grants the layer engine can't express**:
unions ("can't be blocked and has shroud"), conditionals ("as long as equipped creature is legendary"),
myriad, nonbasic landwalk. Most are honestly parked. See the attached-unblockable entry under
BLOCKED / REFUSED before touching any of them — that seam bites this whole cluster.

### ✅ DONE — the residue chain's trigger strip was a REGEX GUESS (`f61fd1d6`, +49 · LOST 0)

Chasing the four Equipment that still park (Adaptive Omnitool #2237 · Sword of Hours · Reaper's Talisman
· Mask of Immolation) leads somewhere general. Every residue chain in `coverage.js` strips trigger
sentences with

```js
.replace(/(?:^|[\n.;]\s*)(When|Whenever|At)\b[^.]+\./gi, "\n")
```

`[^.]+` stops at the FIRST period. So a trigger whose EFFECT spans sentences — Adaptive Omnitool's
"look at the top six… You may reveal… Put the rest on the bottom…" — is verified as modeled by
`allTriggerSentencesModeled` (the span matchers fold it into one trigger, correctly) and then leaves its
2nd and 3rd sentences behind as *apparent residue*, sinking a card every piece of which is understood.

The accumulated `.replace()` tail-strips (reflexive "if you do", the entering-pronoun pump, the
counters-on-it tail) are all **patches on that one wrong assumption** — each added when a specific card
fell through.

**Shipped.** Strip what detectTriggers actually consumed — `effectClause`, which carries the WHOLE folded
effect (`sourceText` does not; it truncates at the first period, so the obvious field is the wrong one).
**GAINED 49 · LOST 0 · RETIERED 0**, measured per card.

⭐ **`app/scripts/tier-snapshot.mjs` is the tool that made this safe and is the reusable part.** A TOTAL
can hide a swap — five gained and five lost nets zero and reads as "no change". For any change to a
SHARED path (a residue chain, the layer engine, a splitter) run it before and after and diff per card;
it classifies every movement GAINED / LOST / RETIERED and exits non-zero on any LOST.

⚠️ **TWO BUGS ON THE WAY, both worth knowing:**
1. **My licence was wrong.** I claimed `allTriggerSentencesModeled` proved every sentence parses HIGH so
   stripping was free. It doesn't — that gate passes for triggers whose folded follow-up is unmodeled,
   and for those cards *the residue check is the only guard*. Four FP pins went red. The licence is
   per-descriptor `triggerRoutesNatively`. **Measured afterwards, it is inert today** (remove it: suite
   green, diff zero) — labelled as belt-and-suspenders in both source and test rather than sold as a guard.
2. **`\s` matches a NEWLINE.** The strip swallowed the line break, welded the NEXT oracle line onto the
   stripped one, and hid it — Drowner of Hope credited native with a real unmodeled ability.
   `tokenAbilityGrantResidue.test.js` pins that exact card for that exact reason, **from a previous
   author's previous attempt at this same idea.** I reproduced it verbatim. Horizontal whitespace only.

**FOUR scope pins graduated, every one DRIFTED into looking like a safety pin** — each was parking its
card only because the residue chain left a sentence behind, for a reason that had stopped being true:
the optional discard, Blood tokens, the folded `damageRider`, and — on the trigger chain — a
discard-CHOICE from a trigger, which now fires, resolves, and pauses with correctly filtered candidates.
Verified end to end, not assumed.

⭐ **THE PATTERN, banked because it will recur:** a residue check that parks a card for the WRONG reason
looks exactly like one that parks it for the right reason, and the pins written on top of it age into
false confidence. That is why the **per-card tier diff — not the total —** is what makes this class of
change safe to attempt at all.

**NOT crosses, don't re-diagnose:** Shriekmaw #1546 — its "sibling" is also unparsed. Jhoira's Familiar
#1035 — "historic" isn't a type-line token, and that refusal is CORRECT.

**Deliberately NOT taken:** the Altar family (Ashnod's #132, Phyrexian #307, Skirk Prospector #1351,
Krark-Clan Ironworks #1356 — 12 corpus carriers). A costless "Sacrifice a creature: Add {C}{C}" needs
the mana model to pick a *victim* at production time; the modeled sibling sacrifices the SOURCE. Real
work, not a cross — but the best-sized unbuilt mana lever on the board.

### 🔶 THE TRIGGER-MULTIPLIER FAMILY — three of five shapes built; the 4th is scoped and NOT worth it

"If <event> causes a triggered ability of a permanent you control to trigger, that ability triggers an
additional time." All of it now shares one expansion body (`multiplyTriggers`, parameterized by its
counter) and one `triggerMultiplierCount` walk, so the distinct-instance rule can't fork.

```
  ✅ DIES     Teysa Karlov #1270                                  (pre-existing)
  ✅ ATTACKS  Isshin #1456                                         3b2ac11a
  ✅ ENTERS   Panharmonicon #261 · Greenwarden #681 · Yarok #2530   766bfabe  ← FILTERED, two fire sites
  ⛔ CAST     Veyran #789 · Wulfgar #4729 · Felix Five-Boots #4799  — not attempted
  ⛔ SOURCE   "a triggered ability OF <filter> you control"         — MEASURED AND DECLINED, see below
```

**The SOURCE-filtered shape is the one to skip, and here is the receipt.** It multiplies ANY trigger
from a matching permanent regardless of event, so it can't ride an enqueue site — it wants a pass at
the `flushTriggers` chokepoint, which is more surface than any slice this run. A one-diff probe on all
seven carriers says the payoff is **2 cards**: Harmonic Prodigy #676 and Katara #4836, and BOTH need a
subtype filter with an "another" exclusion. Delney #854, Annie Joins Up #1033 and Echoes of Eternity
#1505 all stay parked on their OTHER text even with the multiplier free. Don't build it on the
strength of the name recognition.

Also parked with a NAMED reason, not an oversight: Naban #6168 and Traveling Chocobo #2035 (controller-
qualified / subtype entry filter), Elesh Norn #1003 (her second static HALVES opponents' triggers — a
genuinely different mechanism), Drivnod #1801 (Teysa's own twin, blocked on its activated ability).

### 🔶 IMPULSE-EXILE — the COUNT is done; the **NEXT-TURN WINDOW** is the remaining 22 cards

`a3488b65` generalised the count only. The family splits cleanly by (count / window), measured:
```
  27  N>1 / this-turn    ✅ machinery done (a3488b65) — most still parked on their OTHER text
  22  N>1 / NEXT-TURN    ⛔ BLOCKED — needs a controller-scoped expiry
  10  N>1 / other        (until-your-next-end-step, "one of those cards", filtered)
```

### ✅ THE NEXT-TURN WINDOW IS DONE — `9381112d` (+6). The pattern below is reusable for any "your next turn".

Solved WITHOUT arithmetic on the turn counter: the stamp carries the **OWNER** plus its creation turn, and
`gameEngine.finishCleanupActions` lapses it when a turn ENDS that (a) belongs to that owner and (b) began
after the stamp. Cleanup runs BEFORE the turn advance, so `state.activePlayer` is the ENDING turn's player —
that is the fact the whole rule rests on. Correct for both castings (own turn / opponent's turn), pinned in
`impulseExtendedWindow.test.js`.

**TWO SITES, DELIBERATELY ASYMMETRIC — copy this shape.** The offer gate (`legalChoices`) treats the mere
PRESENCE of an extended stamp as permission; ONLY the cleanup knows when it dies. Giving both sites the
window logic is precisely how they drift; giving exactly one the authority removes the possibility.

**Reuse it for any other "until your next turn" effect** — the same owner-plus-stamp-turn trick applies and
needs no scheduler.

**⛔ THE ORIGINAL ANALYSIS (kept — it is why the fix took the shape it did): do not "just add turn + 1".** `state.turn`
increments once per PLAYER turn, so in a 4-player game "until the end of YOUR next turn" is roughly
`turn + 4`, not `turn + 1`. The shipped `_impulseTurn === state.turn` gate and the cleanup that strips it
both assume a single-turn window. Reusing that stamp closes the window at the WRONG MOMENT — a wrong
effect, not a missing one. `templateMatchers.matchImpulseExilePlay` documented this refusal before I got
here and it still stands.

**The shape of the fix:** stamp a controller-scoped expiry (an `_impulseUntil` keyed to the controller's
next turn, or schedule the lapse through the delayed-trigger scheduler that already exists) and change BOTH
the offer gate (`legalChoices.actionsPlayImpulseFromExile`) and the cleanup (`gameEngine
.clearImpulsePlayPermissions`) to read it. Two sites, and they must not drift.

**⚠️ ALSO: read the printed wording before writing the matcher.** My first pass admitted "them" but not
"those cards" and flipped ZERO cards — "those cards" is the dominant printed referent (6 carriers vs 3).
The fix took seconds; finding it took a corpus dump. Dump the real sentences first.

### ✅ BLINK / FLICKER — SHIPPED `c5e68496` (+7). The lesson below outlived the blocker; keep it.

**Ephemerate #440 · Cloudshift #792 · Blur #2252 · Momentary Blink #2675 · Acrobatic Maneuver #5574 ·
Personify · Settle Beyond Reality.** The atom was pure composition (moveCardToZone off the battlefield →
`enterCardFromZone` back on); the real work was the splitter, described below, which is why the original
"blocked" analysis is kept rather than deleted.

### ☠️ THE SPLITTER'S SAFE-FAILURE ASSUMPTION HAS AN EXCEPTION — the generalisable finding

`splitClauses` reasons, in its own comment, that a mis-split *"just yields an unmodeled clause → low →
Arbiter, never a confident wrong partial."* **That is true only when every fragment is individually
unmodelable.** Blink is the counter-example:

```
"Exile target creature you control, then return that card to the battlefield under your control."
   split →  "Exile target creature you control"            <- parses HIGH, entirely on its own
            "return that card to the battlefield…"          <- fails
```
**⚠️ CORRECTION TO MY OWN FIRST WRITE-UP (verify before repeating it).** I first recorded this as the card
*"becoming a spell that exiles your creature and never returns it."* **That overstated it — the hazard was
LATENT, never live.** The trailing fragment is LOW on its own, so the whole program was LOW and the card
PARKED. Nothing ever played wrong. Checked by parsing the orphaned fragment in isolation.

The accurate statement, which is still worth the guard: **the card's safety depended entirely on the
TRAILING fragment failing to parse.** The leading one is a complete, confident instruction. The day anything
teaches the parser "return that card to the battlefield" in isolation — a plausible future slice — the card
flips native meaning *exile, then return something unbound*. The split moved the safety from "by
construction" to "by luck", and that is what the keep-whole guard restores.

**THE RULE: before trusting a split to fail safe, parse the LEADING fragment alone.** If it is HIGH, the
split is not safe and the sentence needs a keep-whole guard (the mechanism the conditional-rider seams at
`splitClauses` ~455/473 already use).

### ✅ HUNTED FOR LIVE FALSE POSITIVES OF THIS CLASS — **found none.** Do not re-run this.

The obvious follow-up worry: are there NATIVE cards where a split orphaned a back-reference ("it", "that
card", "those creatures") and the fragments all parsed anyway — i.e. cards playing the wrong effect today?
Swept all **11,141** native cards for a split fragment OPENING with a back-reference. 158 flagged; the
highest-value ones were checked by hand and **every one is correctly bound**:

```
Swords to Plowshares #11  exile + controllerRider{gainLifePower}
Path to Exile #15         exile + controllerRider{rampBasic, entersTapped}
Beast Within #25          destroy + controllerRider{createToken 3/3 green Beast}
Swan Song #71             counter + controllerRider{createToken 2/2 blue Bird, Flying}
Assassin's Trophy #124    destroy(opponent) + controllerRider{rampBasic}
Pongify #155              destroy + cannotRegenerate:true + controllerRider{createToken}
Inspiring Call #270       draw{requiresCounter} + grant-keywords-group{requiresCounter}  ← scope matches
```

**⚠️ AND THE INSTRUMENT CORRECTION, which is why the 158 is not a finding:** `splitClauses` output is **NOT
the parser's final clause set.** The SPAN MATCHERS (`spanMatchers.js`) fold multi-sentence patterns —
"…Its controller creates a 3/3" becomes a `controllerRider` ON THE SAME ATOM — before/independently of the
clause split. So reading `splitClauses` alone massively over-reports orphans. **To reason about what the
engine actually does, read the ATOMS of `parseEffectProgram`, never the clause split.**

Blink was reachable only because no span matcher covered its shape. The class is otherwise well defended.

### 🔵 THE ORIGINAL BLOCKED ANALYSIS (kept — it is how the above was found)

**Ephemerate #440 · Conjurer's Closet #485 · Cloudshift #792 · Essence Flux #928 · Blur #2252 · Momentary
Blink · Splash Portal · Acrobatic Maneuver · Siren's Ruse …** — a core Commander mechanic at 0 native.

**ATTEMPTED AND REVERTED THIS SESSION — read this before re-attempting.** The atom and applier are
straightforward and were written: blink is pure COMPOSITION of two existing chokepoints —
`moveCardToZone` off the battlefield (fires LTB) then `enterCardFromZone` (the same helper reanimation
uses, fires ETB). CR 400.7's "new object" (fresh id, no counters, summoning-sick) follows for free because
`enterCardFromZone` mints a new permanent.

**The blocker is upstream of all that.** `splitClauses` breaks the printed sentence on ", then":
```
"Exile target creature you control, then return that card to the battlefield under your control."
  ->  ["Exile target creature you control",
       "return that card to the battlefield under your control"]
```
So a whole-clause matcher is UNREACHABLE — the first fragment parses HIGH on its own (a plain exile!) and
the second fails, dropping the card. Writing the atom without fixing the splitter produces dead code, which
is why it was reverted rather than left in the tree.

**THE FIX, with precedent:** `splitClauses` already carries normalize FOLDS that rewrite a sentence before
the split — see the WHEEL fold (~line 120) turning `"each player discards their hand, then draws N cards"`
into two properly-subjected sentences. Blink needs the mirror: a fold that keeps the two halves together (or
rewrites them into one recognisable clause) so the matcher sees the whole thing.

**Do it in a session with room.** `splitClauses` shapes EVERY card's parse, so it is the highest-blast-radius
file touched by this vein — worth the full suite between each step, not a tail-end slice.

**⚠️ And note the shape of the trap:** the first fragment parsing HIGH as a bare exile is exactly the kind of
partial success that could ship a card which EXILES a creature and never returns it. Any future fold must be
paired with a runtime test that the creature comes BACK and its ETB fires.

### 🩸 THE SACRIFICED REFERENT — `db4e6d51`. Capture is GENERAL; only the DAMAGE arm reads it yet.

`state.sacrificedForCost = { power, toughness, manaValue }` is stamped by actionDispatcher at COST-PAYMENT
time (the only moment the victim is still on the battlefield — CR 608.2h + 603.6e LKI), read back through
`countForSpec` kinds `sacrificedPower` / `sacrificedToughness` / `sacrificedManaValue`, and the phrase lives
in the SHARED `parseCountSource` so every scaling atom family gets it from one edit.

**~84 parked cards reference this** (29 power · 23 mana value · 18 toughness · 7 "power to any target").
Family is at **14 native** after two readers (damage `db4e6d51`, gain-life `484c3a0d`).

**⭐ THE SHAPE OF THE REMAINING WORK: this vein is ONE capture plus N SMALL READERS, not one fix.** Each
atom family carries its OWN "equal to …" grammar rather than sharing one, so the stamp has to be read
per-family. Every reader so far has been a two-line sibling of an existing `the triggering creature's …`
arm in the same file — find that arm, copy it, swap the count kind. Near-mechanical.

**⚠️ TWO TRAPS INSIDE THAT, both hit for real:**
1. The triggering-creature arms are SENTINEL-gated ("the triggering creature's …" is text `detectTriggers`
   writes INTO a trigger, never printed on a spell). Assert a new reader at the CLAUSE level, not with a
   whole-card fixture — a card fixture tests the sentinel gate instead of your arm and fails for the wrong
   reason.
2. **Check whether the sibling arm you are copying TAKES A TARGET.** The draw family's neighbour is
   "draw cards equal to the power of TARGET creature", which does. The sacrificed referent is the
   ALREADY-PAID cost, so `targetType` must be null — copying the neighbour would make the spell demand a
   target it never prints (a wrong cast, not a missing one). Pinned with both arms side by side.

**⚠️ AND A PROBE CORRECTION — do not trust a "governing verb" bucket without checking the tier.** Bucketing
this vein by verb reported 9 parked gain-life cards; most were not gaps at all. Miren, the Moaning Well is
`land` tier (already counted playable), Animal Boneyard and Bloodshot Cyclops had ALREADY flipped, and Life
Chisel is blocked by "Activate only during your upkeep" — not the referent. Check the tier and the ACTUAL
blocker before queueing from a verb bucket.

Next reads, cheapest first:
```
~~gain-life  equal to the sacrificed creature's toughness   Reckoner's Bargain #3671~~  ✅ 484c3a0d
discard    a number of cards equal to its power           Tormented Thoughts #22752 — needs a NEW discard-scaled matcher (the arm is absent even for the ordinary count form)
tutor      a creature with mana value X or less           Eldritch Evolution #728
```

**⚠️ I NARROWED A REAL SAFETY GUARD HERE — read before touching it again.** `castModifiers` refused ANY body
referencing the paid cost, on the stated grounds that such an effect *"can't be fed the cost details."* That
was true until this slice. It is now narrowed to admit ONLY the three modeled magnitudes; an object
reference, an unmodeled characteristic, or a discard/exile self-reference still parks the card.

**AND THE HONEST LIMIT, found by mutation:** deleting that guard entirely leaves every "still refused" test
PASSING. The guard is **belt-and-suspenders** (its own comment says so) — the UNDERLYING PARSE is what
refuses those bodies. No reachable input makes it load-bearing, which is exactly why narrowing it was safe.
The pins are labelled in-file as INTENT, not proof. **Do not cite them as evidence the guard works.** The
capture-and-read chain IS mutation-verified separately.

### ☠️ THE DESCRIPTOR WHITELIST SILENTLY DROPS UNLISTED FIELDS — this nearly shipped an over-fire

`detectTriggers` rebuilds every descriptor through an **explicit field whitelist** (`triggers.js` ~3171).
A key your detector returns that is NOT listed there **vanishes with no error**. On the gyEnterBatch arm
that meant `gyFromZone` never reached the check, so **Sidisi fired on EVERY graveyard entry** instead of
only on a mill — a live over-fire.

**Why nothing caught it:** the card classified `native-trigger` either way, so the tier was unchanged; the
full suite was green; and the trigger DID fire, just too often. It surfaced only because a probe printed
the descriptor field and it read `undefined`.

**THE RULE: after adding any new descriptor field, print the descriptor and confirm the field survives
`detectTriggers` before writing a single test.** A test written first would simply have encoded the
dropped-field behaviour as correct. The whitelist entry now carries a warning comment for the next field.

### ⚠️ NOT EVERY "ONE OR MORE" NEEDS BATCHING — the counters arm proves the rule has an exception

`f682aadb` looked like a seventh batch arm and is NOT one. **One `addCounter` event places N counters on ONE
permanent**, so "one or more counters are put on…" is already satisfied per event — and a spell putting
counters on three creatures correctly fires THREE times, because the plural counts COUNTERS, not creatures.
A batch pass there would have been WRONG (an under-fire).

**The test to apply per arm: does the plural quantify the OBJECTS the event is about, or something INSIDE a
single object's event?** Deaths/graveyard-leaves quantify objects → batch. Counters quantify counters on one
object → no batch. Getting this backwards is a silent wrong-count in either direction.

Its real hazard was different and worth remembering: the watcher pass needed a `scope !== "self"` guard,
because `scopeMatches` also matches a SELF descriptor when the watcher happens to BE the receiving
permanent — which the self loop already fired. Without it every self-trigger fires TWICE.

**The last three flip 1–2 cards each and are still the right work** — that is the entire point of the
play-weighted target. Austere Command #169 and Rakdos Charm #330 are worth more than fifty pieces of jank,
and the corpus % barely notices either. Do not judge a slice by its corpus delta any more.

### ⚠️ THREE SCOPE-BOUNDARY PINS GRADUATED THIS STRETCH — read the pin's COMMENT before judging it

`gyExile.test.js` (whole-graveyard exile) and `planeswalkerLoyaltyCompletion.test.js` (the MV wipe, listed
among near-misses of the POWER anchor) each fired against new work. **Neither was a safety pin.** Both were
markers for what a PRIOR slice deliberately didn't build, and `gyExile.test.js` already documented the exact
graduation ritual for Scarab Feast. Each was retired the same way: annotate the graduation in place, point
at the new test file, and keep the genuine refusals (the filtered whole-zone wording; the strict
"greater than"; the toughness bound) alive in the new file.

**A scope marker graduates when the machinery lands. A safety pin never does. Both look like a red test —
the comment is what tells them apart.** This is now 3 graduations vs 0 wrongly-dropped pins.

### ⭐ AND ONE **BEHAVIOURAL** PIN FIRED — a different animal, handled differently

`counterWiring.test.js` asserted Cryptic Command is never offered at an empty stack. That was CORRECT while
its unmodeled tap mode dropped the whole card below HIGH and made it a blanket counter. Once the mass-tap
scope landed it became a real modal card, and CR 700.2 says a "Choose two" whose counter mode has no legal
target is still castable via two OTHER modes — so continuing to withhold it would itself be the bug,
making the card uncastable in a whole class of board states.

**The procedure that made this safe, and the one to repeat:** do NOT edit the test to match the new
behaviour. First ask the ENGINE what it now does. A throwaway probe printed the offers — exactly one
combination, `[2,3]` = tap-all + draw, the only legal pair on an empty stack and empty board. Only THEN
was the assertion replaced, and replaced with a STRONGER one: offered, exactly one combination, and the
counter mode never present in ANY offered pair (CR 601.2c). *"Offered at all"* is the weak assertion that
would have let an illegal combination through.

**Three pin types, three responses.** SCOPE marker → graduate with a pointer to the new file. SAFETY pin →
never retire. BEHAVIOURAL pin → verify against the engine, then replace with a tighter assertion.

**Running count: 6 scope graduations + 1 behavioural replacement, 0 safety pins dropped.** The fourth was
`parser.test.js`'s MUST_DROP_TO_LOW merge gate, which listed "Counter target activated or triggered
ability." annotated *"an ability is not a spell"* — a scope marker for the counter-SPELL slice. Note that
file already documents its OWN graduations (Windfall, fixed-N at-random discard), so the convention was
there to follow rather than invent: move the entry out, leave a NOTE naming the positive pin.

**Every one of these fired on a green suite that had just passed.** They are the reason the "full suite,
not the targeted tests" rule exists — a targeted run would have shipped all five silently.

`3259071d` flips NOTHING on its own and is recorded that way rather than dressed up. It still earned its
place: the subject sniff was misfiling `"Enchanted permanent …"` Auras as EQUIPMENT, and the metric's
no-untap gate was NARROWER than the runtime matcher it was supposed to describe. Its second half — the
Enchant SUBJECT vocabulary plus the offer / CR 608.2b / CR 704.5n wiring — is measured at **+15** and is
deliberately deferred, because the play-rank data says modal staples outrank it.

### ⭐ A PRIOR CREED PIN FIRED AND WAS **GRADUATED**, NOT DROPPED — the precedent matters

`gyExile.test.js` pinned `"exile target player's graveyard"` as low, commented *"whole graveyard, not a
single card"*. That is a **SCOPE-BOUNDARY marker** left by the single-card slice, NOT a safety pin — and
the very same file records the identical graduation for Scarab Feast once ITS machinery landed. So the
line was retired the documented way: the near-miss intent lives on (the filtered wording
`"exile all creature cards from all graveyards"` is still refused, now pinned in the NEW file), and the
graduation is annotated in place with a pointer to `exileGraveyardZone.test.js`.

**Read the pin's COMMENT before deciding it is stale.** A scope marker graduates when the machinery lands;
a safety pin never does. Both look like a red test.

### 🎯 THE LIVE QUEUE — top-2500 staples, each ONE small effect away (probe-verified, not guessed)

The modal WRAPPER is already built and is genuinely sophisticated (escalate, "choose one or more", even
Akroma's-Will conditional-both). `effects/parser.js:602` is the whole story: **one mode that parses low
kills the entire card.** So these are single-effect builds, not mechanic builds:

Re-measured after this stretch — **27 parked modal instants/sorceries in the top 2500, 26 blocked by ≥1
mode.** Regenerate the list any time with `scratchpad/modes.mjs` (it prints both the ranked failing modes
and the one-mode-away shortlist). ~~Austere Command~~, ~~Warping Wail~~, ~~Rakdos Charm~~,
~~Red/Null Elemental Blast~~ are DONE. Still one mode away:

- ~~**Golgari Charm #1603**~~ ✅ `97415979` · ~~**Cryptic Command #1617**~~ ✅ `0361e27c` ·
  ~~**Sublime Epiphany #1709**~~ ✅ `b7bf0e46`
- **Flame of Anor #1760** — `if you control a Wizard as you cast this spell, you may choose both` (the
  Akroma's-Will conditional-both lead, generalized off "commander" to an arbitrary permanent type)
- **Dawn Charm #2079** — `counter target spell that targets you`
- **Hull Breach #2368** — `destroy target artifact and target enchantment` (TWO targets in one mode)

**⛔ DEFERRED WITH A REASON — Archmage's Charm #1746** (`gain control of target nonland permanent with mana
value 1 or less`). Looks like noun vocabulary; it is not. `control.js` line ~82 hard-refuses a non-creature
target (`if (t?.type !== "creature") continue`), so this needs control-change extended to arbitrary
permanents — which touches layers, mana abilities, and the soulbond teardown. That is a WAVE, not a slice,
for one card. Do not start it as a "quick vocabulary fix"; that misread is exactly what the deferral records.

**Two modes away** (so cheaper than they look — count is not cost): Prismari Command #1108 wants
`target player creates a Treasure token` AND `target player draws two cards, then discards two cards`;
both are player-scoped versions of effects that already parse for the controller.

**24 cards** want REPEATABLE modes (`"you may choose the same mode more than once"` — the Confluence cycle
incl. Mystic #1431 / Fiery #1561, plus the Season cycle). Needs multiset expansion in `expandCastChoices`;
a wrapper feature, bigger than every single above, and the largest remaining modal lever.

**24 cards** additionally want REPEATABLE modes (`"you may choose the same mode more than once"` — the
Confluence cycle incl. Mystic #1431 / Fiery #1561, plus the Season cycle). That needs multiset expansion
in `expandCastChoices` — a wrapper feature, bigger than the singles above.

### ⛔ MEASURED AND CLOSED THIS STRETCH — do not re-derive

- **Graveyard exile was 0-native/62-parked before `4f915ba6`.** The remaining 52 are blocked by OTHER
  text, not by the zone exile.
- **`exile all artifacts and enchantments`** still parses low (the clause splitter appears to break on
  `" and "` before the matcher sees it). Not needed for Farewell; unexamined beyond that.
- **Pyroblast / Hydroblast are DELIBERATELY not claimed.** They word colour as a post-hoc condition on an
  UNRESTRICTED target (`"counter target spell if it's blue"`) — a different rule from the adjective form,
  and pinned as a CREED test so surface similarity cannot sweep them in later.
- **The play-weighted view already existed** in `measure-coverage.mjs`. Making it the TARGET is what
  changed; the instrument was not missing.

## 📊 THE SPLIT IS LIVE WITH THE REAL MAPPING — the two bars, measured

Omnath supplied `deck-owners.json` from [[reference_deck_sources]] (Colton's Archidekt table + Joe's
Moxfield table, user `Blocks420`, verified live). All 16 decks assigned, nothing unassigned:

```
  92%  colton   (457/499 across 5 decks)     below the bar: cdh 79%
  73%  joe      (802/1098 across 11 decks)   below the bar: 10 of 11
```

**The two bars are now separately readable, and they say different things.** PLAYABILITY (Colton's own
decks — can the one real user play his own decks?) is 92% and blocked by a SINGLE deck. POD REALISM (Joe's
decks — can he sim his playgroup?) is 73% across 11 decks and is a broad grind. The old single 79% could
not distinguish "one deck from done" from "ten decks out", which is exactly why it was worth splitting.

**"Believe it!" is Joe's Yuriko** — neither of us could place it because the deck is named for the
catchphrase, not the commander. Closed in both our notes.

**A near-miss worth keeping:** Omnath nearly mis-assigned *Halfshell heroes* to Colton by reasoning from the
crossover pattern (TMNT → Colton's `deck_raph_and_mikey`). The registry carries a note written for exactly
that trap — TWO different TMNT decks exist; Joe's "Halfshell heroes" is NOT Colton's "Raph & Mikey", which
isn't built and isn't in the app. **Ownership is not inferable from card themes**, only from the roster.

**OPERATIONAL NOTE (Omnath's flag, confirmed):** the file lives in AppData, which is what `MTG_APP_ROOT`
resolves to for deck runs — the measurement above used exactly that and worked. A run that points
`MTG_APP_ROOT` at the MAIN TREE for the corpus pass ([[reference_realism_gate_in_worktree]]) will not see it
and simply prints the single aggregate, which is the designed graceful degradation, not a failure.

**No deck is CLOSE to the bar.** cdh needs ~11 slots (characterized below — no slice closes it); the nearest
of Joe's is Earth Bent at 81%, ~9 slots. The shelf is a long grind on both halves, not a near-miss anywhere.

## 🎯 cdh IS THE WHOLE PLAYABILITY GAP — and here is exactly what it needs

The owner split named the target precisely: **Colton's playability shelf is 92% and cdh (79%) is the only
deck below the 1.0 bar.** So I characterized cdh rather than guessing at it. It needs ~11 more slots; 21
non-land slots are parked. Sole-blocker sweep scoped to the deck:

**SOLE-BLOCKER (one sentence away) — 6 cards, and 3 of them are REFUSED or BANKED, not open work:**
- Springleaf Drum, Gene Pollinator — the tap-another-permanent mana cost. **DELIBERATELY REFUSED**
  (phantom mana, SHELF S7 audit, `manaCostModelable` names Springleaf Drum outright). Do not "fix" these.
- Hexing Squelcher — group-granted ward, and the LIFE form specifically, which the layer op cannot represent.
  Already banked.
- Biomancer's Familiar — an adapt-cost modifier. Niche, 1 card.
- Vexing Shusher — "{R/G}: Target spell can't be countered." Needs an uncounterable flag on a stack object.
- Borne Upon a Wind — a TURN-SCOPED flash permission. The mechanism nearly exists (`flashPermissionSpecsFor`
  + `flashCastPermissionsOf` already serve the STATIC form, e.g. Valley Floodcaller), but the turn-scoped
  variant needs a new per-player field, an atom, a spec source and an untap reset — **four touch points for
  ONE card** (corpus-wide the shape is 12 cards / 9 parked / only this one would flip). Below the bar.

**MULTI-BLOCKER — 15 cards, each needing two or more independent builds.** These are cEDH staples and none
is a slice: Chrome Mox (imprint), Pact of Negation (delayed cost with a loss condition), Chain of Vapor,
Mindbreak Trap (alt cost + exile-any-number-of-spells), Wan Shi Tong, Hidden Strings (cipher), Invasion of
Ikoria (Battle // Siege), Vibrance, Deflecting Swat, Flare of Duplication, Veil of Summer, Ragavan,
Springheart Nantuko (bestow), Valley Floodcaller, The Cabbage Merchant.

**THE HONEST CONCLUSION: cdh will not close soon, and no single slice moves it.** It is ~11 slots spread
across 15 multi-blocker cEDH cards plus 3 refusals. Anyone told "just finish cdh" should read this list
first — the deck is hard because cEDH cards are hard, not because a lever is missing.

## ✅ SHIPPED — the SHELF OWNER SPLIT (Omnath's call, and he was right)

`measure-coverage` can now report the shelf **per owner** instead of one aggregate. Omnath's argument, which
the numbers back: the single figure AVERAGES TWO DIFFERENT QUESTIONS — the owner's decks gate PLAYABILITY
(can the one actual user play his own decks?), the pod's decks gate POD REALISM (can he sim his playgroup?).
Neither is the other, and "79%" cannot tell you which is failing.

**Measured with the split on** (temporary config, using only the four decks Omnath said he Moxfield-verified):

```
  92%  colton (playability)   (457/499 across 5 decks)   below the bar: cdh 79%
  76%  joe (pod realism)      (304/400 across 4 decks)   below the bar: 4 decks
  71%  (unassigned)           (498/698 across 7 decks)
```

**The playability half is ONE DECK from the 1.0 bar.** The aggregate was hiding that completely.

**DESIGN — ownership is NOT derivable from the data, so it is not guessed.** Verified earlier: every deck
lives in ONE profile on this box, so profile structure says nothing. Rather than hard-code Colton's deck
names into a repo script, the split reads an OPTIONAL `<MTG_APP_ROOT>/data/deck-owners.json`
(`{ "Deck Name": "owner-label" }`) and stays completely silent when absent — output byte-identical to before.
A deck the file omits lands in "(unassigned)" rather than being dropped, because a silently shrinking
denominator is how a split metric starts lying.

**I did NOT ship a mapping file.** The roster is Omnath's ([[deck_joe_roster]]) and my knowledge of it is
second-hand; asserting ownership I cannot verify is exactly the kind of confident-wrong entry this run has
already had to retract twice. Told him in COMMS that the seam is live and the mapping is his to supply.

## 🧭 ALL FOUR INSTRUMENTS ARE MINED OUT — the run's search phase is over

Four independent instruments were built and exhausted this run. Recording them together so the next session
does not rebuild any of them:

| instrument | what it found | state |
|---|---|---|
| shelf sole-blocker sweep | 105 single blockers, all singletons | mined out |
| mis-park scanner (`residuegap.mjs`) | 3 real bugs (+15, +1, +4) | mined out |
| undetected trigger events (`undetected2.mjs`) | 1 feasible lead (+2); the rest are UNBUILT mechanics | mined out |
| tier composition (`composition.mjs`) | the aura pair (+10); no general fix | closed |

**All four converge on the same answer: what remains is per-shape work at 1-4 cards each.** Even inside a
single bucket the shapes do not share a fix — the 9 composition-failing Enchantments need four DIFFERENT
gate pairs (static+granted-activated, activated+trigger, trigger+trigger, trigger+mana-aura), one or two
cards apiece.

**That is not a reason to stop; it is a change of mode.** Stop hunting for levers — there are none left —
and grind shapes individually, cheapest-first, verifying each against the gate that owns it.

## ⛔ CLOSED — the GENERAL tier-composition lead (38 cards) has no general fix

The aura static+trigger composition paid +10, so I generalized the instrument: for every parked card,
classify each oracle line ALONE; if every line is native by itself, only the composition is missing.
**38 cards** match — 17 Creature, 9 Enchantment, 4 Artifact, 4 Legendary Creature — and they line up exactly
with the residue census's TWO-FLIP list (Artisan of Kozilek, Wasteland Raider, Vat of Rebirth, Tundra Tank,
Compulsory Rest, Verdant Haven, Fiery Mantle, Nurturing Presence, Mouser Foundry, Tishana).

**There is no general fix, and chasing one would be a false positive.** Two things killed it:

1. **The single-mechanism discipline is DELIBERATE.** `permanentTriggersCovered` and its siblings each own
   ONE mechanism and treat everything else as residue — the code says so outright: *"this single-mechanism
   tier must never claim one through a residue coincidence."* Birthing Hulk is keyword + trigger + activated
   ability; composing across all three would dissolve the tier system, not extend it. The aura fix worked
   precisely because it composed TWO NAMED gates with each half re-verified by its OWN gate — that is
   composition. A blanket "every line is native alone" rule is loosening wearing composition's clothes.

2. **The COVERED_KEYWORDS angle is a mirage.** It looked like the residue set was merely missing modeled
   keywords. Ranking the "keywords credited alone but absent" gave equip (394), crew (142), draw a card
   (147) — **none of which are vacuous keywords.** They classify alone because their OWN tier handles them
   (equipment, vehicle, spell). Adding them to the residue set would make the walk treat a real ability as
   inert text: a false positive on hundreds of cards. And the two genuinely-missing modeled keywords I
   suspected — squad, firebending — turn out to have **zero** parked carriers; earlier slices already
   covered them.

**Take from this**: composition is only safe when each half is re-verified by the gate that owns it. If you
cannot name the two gates, you are loosening. The remaining 38 need per-shape work at 1-4 cards each.

## 🛑 THE MIS-PARK SCANNER IS MINED OUT — re-run after shipping, and it is thin

Re-ran `scratchpad/residuegap.mjs` after the counters + once-per-turn slices landed. 888 candidates, but the
buckets are exhausted for practical purposes and the next session should not re-mine them:

- **Top bucket (116) = "trailing sentence inside a trigger line."** Already mined — the once-per-turn rider
  came out of it (+4). Re-extracted its sub-shapes: the largest remaining is 3 cards
  ("you may play that card this turn"), then a tail of 1-2.
- **"this ability triggers only once each turn" still shows 9 — those are NOT residue failures any more.**
  My strip fixed the residue; they now park because a SECOND trigger line's event is undetected. Verified on
  Twilight Diviner and Tolls of War: two trigger lines, one detected. Do not "re-fix" the rider.
- **The keyword buckets (flying 14, cumulative upkeep 6, enchant creature 5-7) are the same story** — an
  undetected second trigger EVENT, not a keyword problem and not a residue blindness.

**So what remains is genuine feature work at ~1-3 cards per mechanism**, which is the same conclusion the
shelf sweep reached independently. There is no cheap lever left in either instrument.

## ⛔ CLOSED LEAD — the SCOPED counters-put-on variants are worth ~1 card each

The natural follow-on to the shipped self-scoped slice, and it does NOT pay. 15 non-self carriers, 14 parked
— but I swapped each scoped subject for the known-good `this creature` and re-classified, and only **4** flip:

| card | scope it needs |
|---|---|
| Enduring Scalelord | "another creature you control" — `otherCreatureYouControl`, already exists |
| Wildwood Scourge | "another NON-HYDRA creature you control" — a negated subtype filter |
| Wickersmith's Tools | "a creature" — any player's, a global scope |
| Axgard Artisan | "…for the first time each turn" — a frequency rider, not a scope at all |

**The biggest bucket flips ZERO.** "a creature you control" (5 cards — Simic Ascendancy, The Powerful Dragon,
A-Moss-Pit Skeleton …) is stuck on other clauses entirely. So this is roughly one new mechanism per card.

Also worth knowing: **Lonis and Berta are NOT scope gaps.** Their subject is the card's own name, which the
shipped detector already resolves via `shortName`; they park on their effects ("investigate that many times").

## ✅ SHIPPED — the +1/+1 COUNTERS-PUT-ON trigger event (CR 122.6), +4

Rebuilt from the ledger's own notes and landed. Both paths verified at runtime, mutation-checked three ways.

**A BUG WORTH NOT REPEATING — Python `` is a BACKSPACE.** The rebuild silently wrote literal 0x08 control
characters into two JS regexes (`/^Hone or more…`), so the detector never matched and I burned most of a turn
probing a correct-looking arm. `cat -A` on the line is what finally showed it. **Write regexes into JS with
Python RAW strings (`r'...'`) or an Edit tool — never a plain quoted string.** Third escaping incident of the
run and by far the most expensive.

**The cascade concern, resolved honestly.** Two carriers (Generous Pup; Scurry Oak via evolve) do feed each
other — a genuine paper infinite, which the rules call a draw (CR 104.4b). `learnSession`'s per-turn tick
budget is the backstop. **I could NOT construct a valid end-to-end demonstration that it bounds THIS
cascade** — my session test injected a board that setup discarded — so that stays UNVERIFIED rather than
claimed. Shipped anyway because: the trigger models the card correctly (the loop is a real game interaction,
not a modeling error), no saved deck holds two of the four carriers, and suite + sweep are green.

**Prior entries here were wrong twice and both are superseded:** "no cascade guard anywhere" (false — the
tick budget exists) and then the implication that the hazard blocked shipping (it does not).

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

## ✅ SHIPPED — Amulet of Vigor #1301, and the RUNTIME-VACUOUS trap it nearly walked into (`e0d15930`)

Four pieces; **only three were visible to any static instrument.**

1. `permanentYouControl` — the missing member of a subject family that already had artifact / enchantment /
   token / creature / land. Every other subject there is a type-narrowed version of this one.
2. `enteredTapped` — a live read on the entering permanent, gated in `scopeMatches` beside
   nontokenFilter/tokenFilter, and carried EXPLICITLY through the descriptor build (an unlisted field there
   is silently dropped → fires on every entry → over-fire).
3. The "untap it" referent → sentinel `untap the triggering permanent` → `target:"thatPermanent"`. **NOT the
   existing `thatCreature` referent**: that one is creature-only by design and Amulet normally untaps a
   LAND, so reusing it returns `[]` and no-ops. New `triggeringPermanentTargets` rather than a flag on the
   creature one — every existing caller of that is creature-scoped and its check is load-bearing.
4. **THE FIRE SITE.** `checkPermanentEntersTriggers` was called from token mint, zone-enter and the
   cast/resolve path, and NOWHERE ELSE. A land is PLAYED, not cast, so a land drop reached none of them.
   Building 1–3 alone produces a card that classifies native and never fires on its signature use.

⭐ **THE LESSON, restated because it will recur:** the per-card tier diff would have read `GAINED 1` for the
broken version too. A subject/filter/referent can all be correct while the EVENT never reaches them, and no
instrument keyed on classification can see that — the tier is not evidence about a board. **When a slice adds
a subject to an event family, enumerate the event's fire sites before building anything else.** The order in
the scoping was right and it is the reason this shipped working.

Mutation-checked M39–M42, each seen to fail: fire site deleted → 4 runtime tests; `enteredTapped` deleted →
the untapped-land no-fire test; `thatPermanent` dropped from the resolver's permanent branch → 4 (the
creature-only fallback silently drops an entering land); controller scope made optional → the CREED refusal.

Tier diff (34,189 cards): **GAINED 1 · LOST 0 · RETIERED 0.** Fire Lord Zuko, the only other corpus card on
this subject, reads "enters FROM EXILE" — a different filter, still Arbiter.

One stale pin updated (`subtypeScopedTriggers.test.js`): it asserted the permanent-wide subject was
UNDETECTED, true only while the subject was unmodeled. Its real guarantee — never mis-read as a SUBTYPE — is
what it asserts now, the same way that file's token line was updated when the token slice landed.

## 🚨 SHIPPED — MIXED MANA BUNDLES: a live FALSE POSITIVE on 51 staples, found by chasing a +2 (`003e29d1`)

I went looking for Bloom Tender (NEXT ACTIONS #1, worth 2 cards / 3 deck slots) and found that **"Add {G}{W}"
has never worked.** The planner's primary component picked ONE color and credited `amount` of it, so a
Selesnya Signet was wrong in BOTH directions — measured on the real card before a line changed:

```
{G}{W}  → REFUSED   the only thing the card actually does   (false negative)
{G}{G}  → PAID      which it cannot do                      (THE FORBIDDEN DIRECTION)
```

**51 corpus cards sit on this shape**: every karoo bounce land, every Signet, the Eggs, the filter duals.
Core Commander mana, on Colton's shelf and Joe's.

⭐ **WHY NOTHING CAUGHT IT — and this is the SECOND time this stretch:** all 51 were ALREADY `native-mana`.
The tier was right; the BEHAVIOR was wrong. A per-card tier diff cannot see it, a census cannot see it, and
the coverage % was never off by a point. Same lesson as the Amulet fire site one slice earlier, reached from
the opposite direction: **the tier is not evidence about a board.** Two independent instances in one stretch
means the runtime-assertion rule is not a nicety — a native card with no runtime pin is an unverified claim.

**THE SHAPE:** a bundle is a per-color tally (`fixed`), not a bigger `amount`, threaded parser → manaSources
→ planPayment → commitManaTap. Stamped ONLY when >1 distinct color, so every single-color source is
byte-identical (Sol Ring pinned). The commit half is load-bearing: "affordable per planPayment" == "actually
paid" is the invariant that seam exists to hold.

**A companion bug the bundle exposed:** the generic loop drained only the tap's recorded primary color,
stranding the rest — a Signet could not pay {2}. Generic is paid LAST, so anything left in `working` is
legitimately spendable there.

**VIVID (+2) rides the same shape** with a board-derived color set (Bloom Tender, Faeburrow Elder). It CANNOT
ride the existing amountSpec path — that yields N mana freely spendable across its colors, which on a W/G
board pays {G}{G}, reintroducing the exact FP above. That near-miss is the reason to distrust "just reuse the
variable-amount path" for anything whose colors are simultaneous.

Mutation-checked M43–M46, each seen to fail. Tier diff: **GAINED 2 · LOST 0 · RETIERED 0.**

⚠️ **ONE PROCESS NOTE ON MYSELF:** my first probe of this used `planPayment(sources, cost)` — the real
signature is `(pool, sources, cost)`. Every cost read as "nothing owed" and everything came back PAYABLE. I
had written the words "51 staples over-deliver" before noticing. **A probe that reports what you expected is
the one to re-check first.** The real seam then showed a worse bug than the imagined one.

## 🔭 SCOPED, NOT BUILT — IMPRINT (29 corpus cards, 0 native today). Build in THIS order.

Chrome Mox is a ×3 shelf card and the leverage head's next entry, but it is not a card-sized job: **imprint
has zero engine support.** Measured: 29 corpus cards carry an `Imprint —` line, none classify native.

**THE 29 SHARE ONLY THE STAMP.** The payoffs diverge hard, and lumping them is how this becomes a swamp:

- **STATIC-CHARACTERISTIC payoffs (the contained subset — build these):** Chrome Mox (the exiled card's
  COLORS → a mana source), Semblance Anvil (shares a card type → cost reduction), Extraplanar Lens (same-name
  land taps → extra mana), Ugin's Labyrinth.
- **COPY/CAST payoffs (a separate, much larger project — do NOT start here):** Isochron Scepter, Panoptic
  Mirror, Soul Foundry, Spellbinder, Prototype Portal, Mimic Vat.
- **TARGETED-EXILE-ON-ETB payoffs (a third family):** Duplicant, Phyrexian Ingester, Exclusion Ritual,
  Invader Parasite, Mirror Golem.

**PIECES, in build order — and the order is the whole point:**

1. ⚠️ **THE STAMP AND ITS FIRE SITE, FIRST.** An optional "you may exile a card from your hand" ETB choice
   that records the exiled card on the permanent. `setPendingHandDiscardChoice` (pendingChoice.js) is the
   nearest sibling to copy. **Nothing may read the stamp until something SETS it at runtime.**
2. The colors-from-imprint mana source for Chrome Mox — a `colors` set read off the stamp, `amount: 1` (a
   CHOICE among the imprinted colors, which the existing `colors` array already expresses; no new shape).
3. Only then the other static payoffs.

⛔ **THE TRAP, NAMED IN ADVANCE** (this is Amulet's lesson and the mixed-bundle lesson, and imprint is where
they meet): build 2 before 1 and Chrome Mox classifies `native-mana` while tapping for **nothing** — a
runtime-vacuous native the tier diff reads as a WIN. And an empty Mox modeled as "any color" is worse than
useless: it is a turn-one ritual out of a card that should be dead, the same forbidden shape as the
condition-gated Mox Opal already refused elsewhere in this ledger. **An un-imprinted Mox must produce
nothing.** Pin that on a board before pinning anything else.

## ✅ SHIPPED — IMPRINT pieces 1+2: Chrome Mox is native (`5d24a81d`, `7af34dc1`)

The scoped order held, and the two commits are the proof of why it is the right one:
**piece 1 (the stamp) moved ZERO cards. Piece 2 (the payoff) moved one.** Had they been built in the other
order, the tier diff would have read GAINED 1 for a Chrome Mox that taps for nothing.

**Piece 1 — the stamp and its fire site.** `setPendingImprintChoice` / `resolveImprintChoice` / `applyImprint`,
plus an ALLOWLIST span matcher. Two details worth keeping:
- The **first bug was the ability word.** Imprint is CR **207.2c** — the same list as landfall/enrage/raid —
  so the unstripped "Imprint —" label sat between the line start and "When" and the boundary-anchored trigger
  regex never matched. Measured: even `Imprint — When this artifact enters, draw a card.` detected NOTHING.
  All 29 cards' ETB was invisible.
- The **"you may" is NOT peeled before the span matchers.** α2's peel lives inside parseEffectClause and the
  up-front matchers run first, so the prefix is consumed in the matcher and re-stamped `optional:true`.
  Measured, not assumed — the clause fell to LOW until this was handled.

**Piece 2 — the payoff is the GATE, nothing else.** "One mana of any of the exiled card's colors" is a CHOICE
among the stamp's colors; the existing `colors` array already expresses it, so no new shape. No stamp → not a
mana source AT ALL. Colorless card imprinted → same. Mutation-checked both.

⚠️ **A FABRICATED RULE NUMBER, MINE, CAUGHT IN-FLIGHT.** I wrote "CR 702.61" throughout the first draft of
this slice. **702.61 is Split Second.** Fixed every instance — and the check turned up the SAME class of bug
sitting in the tree already: `rulesRetrieval.js` mapped **suspend** to 702.61, so a suspend question was being
handed the split-second rule. Fixed to 702.62 and audited all **129** hint numbers in that table against
cr_current.json; the rest are clean. **The lesson is procedural: I cited a plausible number from memory in a
codebase whose §1.2 forbids exactly that. Verify against the CR file at WRITE time, not at review time.**

⚠️ **THE CONTRACT TESTS EARNED THEIR KEEP.** Adding a pendingChoice kind failed three pins immediately —
a missing fixture, and `KNOWN_UNWIRED` (which is empty and *may only shrink*) catching that a human seat had
no panel to answer with. That is a soft-lock, not a cosmetic gap, so this shipped with `ImprintPanel` + hook
method + server entry/dispatch rather than an ignore-list entry. **The panel's submit guard differs from the
one it was cloned from on purpose**: HandDiscardPanel's `if (!cardId) return` would have swallowed imprint's
legal DECLINE.

**Still body-only, deliberately:** Semblance Anvil, Isochron Scepter, Soul Foundry, Spellbinder, Prototype
Portal, Mimic Vat. Their payoffs (cost reduction / copy / cast) are separate slices; the stamp they all need
now exists and is board-proven.

## 🗺 FRESH SHELF READ (2026-07-28, after slices 57–61) — the cheap shelf work is DONE

⚠️ **RUN THE SHELF PROBE AGAINST APPDATA, NOT THE REPO.** `MTG_APP_ROOT=<repo>/app` makes
probe-shelf-blockers.mjs report **`decks scanned: 0`** and print an empty, entirely convincing table. The real
deck store is the installed app's:

```
MTG_APP_ROOT="C:/Users/colto/AppData/Roaming/com.colton.mtg-tool" node app/scripts/probe-shelf-blockers.mjs
```

(The *oracle* probes still want the main-tree `app/`. The two roots are different and neither errors when
wrong — the shelf one just reads zero.)

**THE REAL STATE: 403 shapes touch exactly ONE deck.** The ×3 head is now entirely subsystems — there is no
cheap shelf card left:

| card | ×decks | what it actually needs |
|---|---|---|
| Wan Shi Tong | 3 | an **opponent-searches-their-library EVENT** the engine has no concept of |
| Mindbreak Trap | 3 | an alternate cost + "exile any number of TARGET spells" |
| Teferi's Protection | 3 | **PHASING** (a whole subsystem) + "life total can't change" |
| Level Up | 3 | THREE unbuilt pieces — sized below |
| Herd Heirloom | 3 | ⛔ spend-restricted mana — a DELIBERATE refusal, do not "fix" |

**LEVEL UP, sized honestly** (all three measured LOW today, none exist):
1. the Aura's own ETB "put a +1/+1 counter on ENCHANTED CREATURE" (the enchanted referent on a counter atom);
2. the quoted GRANT of an attack trigger to the host;
3. "DOUBLE the number of +1/+1 counters on it", then a power≥10 threshold draw.
It is the most contained of the four, and it is still a three-piece slice. **Build the grant (2) before the
payoff (3)** — same law as Amulet and imprint.

## ⛔ MEASURED AND CLOSED — the "another target creature" BITE is a FALSE SHELF LEAD

The probe ranks `Target creature you control deals damage equal to its power to another target creature` at
2 decks (Contest of Claws, Hulk's Thunderclap), and the existing bite arm is genuinely one target-scope away
(it anchors "target creature you don't control"). **Building it moves NEITHER shelf card**: Contest of Claws
is blocked by **discover**, Hulk's Thunderclap by **behold** + a conditional destroy. The bite is not their
blocker.

Corpus-wide the shape is 11 cards, and only **Fall of the Hammer** is the bare one-arm case (+1). The others
are distinct shapes, not one vein: Mutiny/Breaking of the Fellowship put the damage on an OPPONENT'S creature
with a linked "that player controls" target, Deadshot is a tap-compound with an "it" referent, Cosmic Hunger
widens to a creature/planeswalker/battle union.

**+1 corpus, +0 shelf.** Recorded so no future resume re-chases the row — this is the probe header's own
"confirm against the real card before building" rule paying for itself a seventh time.

## 🏁 EARTH BENT IS AT 90% — the first JOE-side deck across the 1.0 per-deck bar (`277f161b`, `977b72e9`)

Verified, not asserted: `90%  Earth Bent  (90/100)` · `below the bar: none`. It was the closest deck on the
shelf at 88%, and it took exactly the two cards it needed.

**Earth Rumble (+1)** — one arm. Earthbend, the CR 603.7 reflexive "when you do" seam and fight-pair ALL
already existed; "up to one" was supported on the ENEMY side of the pair and never on the FIGHTER side — the
missing-sibling shape again. It needed its OWN flag (`secondaryOptionalTarget`): `optionalTarget` binds to
the PRIMARY, and a fight-pair's primary is the ENEMY, so reusing it would have made the OPPONENT's creature
declinable — a different card, and one that reads as working until you check which half got declined. M50
puts the flag on the wrong half to pin exactly that.

**Tale of Katara and Toph (+1)** — ⚠️ **the detection arm was the small part, and on its own it shipped a card
that classified `native-static` while doing NOTHING at runtime.** Two false positives underneath, neither
visible to the classifier:

1. **THE FIRE SITE.** `checkTapTriggers` read the PRINTED card (`lk.permanent.card`) and never consulted
   GROUP-GRANTED abilities. The recipient creatures' own text says nothing about tapping, so the granted
   trigger could never fire. Routed through `triggersForEvent`, which already collects grants AND applies the
   gates that path skipped entirely. **Every granted becomes-tapped ability now works**, not just this card.
2. **THE DROPPED LATCH.** The descriptor build RECOMPUTES `oncePerTurnTrigger` from the printed sentence
   "This ability triggers only once each turn." and overwrote the flag the arm sets from the EVENT wording
   ("for the first time"). Detection looked correct and the latch was gone — it would have fired on EVERY tap
   instead of the first: an over-fire, the forbidden direction.

⭐ **THE RULE THIS COST ME, stated plainly: assert on the BUILT DESCRIPTOR, not on the arm's return value.**
The arm returned the right object and a later stage overwrote the field. Same class as the
captured-but-unread trap, one layer further down the pipeline.

⚠️ **PLACEMENT, banked so it is not rediscovered:** `classifyCondition` has a blanket
`with|while|during|named` reject. The first draft of the arm sat BELOW it and was simply never reached
(measured — the bare form detected, EVERY qualified form returned `[]`). A specific, enforceable qualifier
belongs beside `castWithExempt` ABOVE the reject, never as a weakening of it.

**Remaining Earth Bent gap (10 slots — at the bar now, so no longer blocking):** Scapeshift + The Earth King
(linked X), Ashaya, Lumra, The Ozolith, Traveling Chocobo, Earthbender Ascension, The Legend of Kyoshi —
plus the two DELIBERATE refusals, Scythecat Cub (inexpressible condition) and Herd Heirloom
(spend-restricted mana). **Do not re-chase the refusals.**

## ✅ SHIPPED — NONCREATURE artifact/enchantment targets (+5), a narrowing (`a8279062`)

48 corpus cards use "noncreature artifact / enchantment" and NONE classified native. The qualifier EXCLUDES
artifact and enchantment CREATURES, so approximating it as the bare type would let the engine destroy an
artifact creature the printed card cannot touch. **These shapes were REFUSING correctly** — this slice is
FP-closing, and the new arms are strictly narrower than the bare ones beside them.

Two details worth keeping:
- **Alternation order is load-bearing.** The qualified nouns are listed BEFORE the bare ones so the qualifier
  is consumed whole; left-to-right matching would otherwise let "artifact" win and silently drop
  "noncreature". M53 reproduces exactly that.
- **⭐ The enumerator is LAYER-AWARE.** A permanent can be a creature only BY LAYERS. `addPermanents` now
  passes the permanent as a second argument (every pre-existing predicate takes one parameter and ignores it,
  so it is inert for them) and the new predicates consult `permanentIsCreature`.
  **Proven on real machinery, not asserted:** an ARTIFACT LAND under a mass land-animation (Nature's Revolt)
  is an Artifact whose live type line includes Creature — un-animated it is offered, animated it is not.

⚠️ **MEASURED SCOPE LIMIT:** the engine models mass LAND animation but **not** mass ARTIFACT animation ("All
artifacts are 2/2 creatures" does not animate; March of the Machines is not modelled as an animator). So the
artifact-land case is the only scenario reaching the layer branch today. Recorded because the obvious test to
reach for — March of the Machines — silently proves nothing.

⛔ **AND THE ADJACENT VERBS ARE NOT WORTH EXTENDING — measured, 0 would flip.** `exile` already shares
the destroy arm, so it came free. `return` / `gain control of` / `tap` / `untap` + a noncreature target exist
on 6 corpus cards (Salvaging Station, Ghirapur, Yuffie, Blinkmoth Well, The Fearsome Flock, Souvenir
Snatcher) and EVERY ONE stays blocked with the qualifier stripped — the qualifier is not their blocker. The
destroy/exile arm captured the whole vein.

## ⛔ MEASURED AND CLOSED — TEAMWORK is a FALSE LEVER (the shelf probe's new #1 row)

`Teamwork 2` ranks TOP of the shelf blockers at **3 cards across 3 decks** (We Say Thee Nay!, HULK SMASH!,
Earth's Mightiest Heroes) — the best spread on the board. It is not worth building, and here is the
arithmetic so nobody re-derives it:

- Teamwork is an OPTIONAL additional cost, *"tap any number of creatures you control with total power N or
  more"* — i.e. **exactly the banked "tap N creatures as a cost" design fork** (enumerate combinations =
  correct but explosive, vs. auto-pick = legal but removes agency). It is a parked DECISION, not a slice.
- ⭐ **And solving it would move at most ONE of the three cards**, because teamwork is not their only
  blocker. Measured on the non-teamwork halves judged alone:
  - We Say Thee Nay! — "counter target spell unless its controller pays {2}" → **HIGH** (only card teamwork
    actually gates)
  - HULK SMASH! — mode 1 "destroy target noncreature artifact" was LOW (**now fixed by this slice**), but the
    modal wrapper + the "if cast using teamwork, choose both instead" conditional remain
  - Earth's Mightiest Heroes — "reveal the top eight … put a creature card from among them onto the
    battlefield" → **LOW**, unrelated to teamwork

**Verdict: a top-ranked row by spread that is worth ~1 card.** Same shape as the bite row closed earlier —
the probe measures WHERE a blocking sentence appears, never whether it is the card's ONLY blocker. That check
is manual and it has now paid off twice in two sessions.

## 🚨 SHIPPED — MANA REFUSALS ARE PER-ABILITY, NOT PER-CARD: 23 DEAD LANDS revived (+16) (`9eba4b2e`)

An ability is a LINE (CR 113.3). Both standing mana refusals — the SPEND RESTRICTION and the CONDITION GATE
— matched anywhere in the oracle and nulled the WHOLE CARD, so a restricted or gated SECOND ability silently
killed an UNCONDITIONAL FIRST one.

**Measured: 30 corpus LANDS produced NO MANA AT ALL.**
- the entire **Verge cycle** — Bleachbone Verge prints a plain `{T}: Add {B}.` beside a gated
  `{T}: Add {W}. Activate only if …`
- the **Village cycle**, Tournament Grounds, **Castle Garenbrig**
- **Madblind Mountain**, whose gated ability is a **SHUFFLE** and whose mana is the basic-land reminder
  `({T}: Add {R}.)` — pure collateral

23 are now live. The remaining 7 are genuinely restricted-only and still refuse.

⭐ **AND NO METRIC COULD SEE IT — this is the THIRD find of this exact class this run.** Lands are credited
native by BEING lands, so coverage was never off by a point while ~100 real fixing lands (painlands, filter
lands, Verges) were **Wastes** in the sim. Identical blind spot to the karoo/signet bundle. **The rule is now
earned, not theoretical: when a card class is credited by TYPE rather than by parse, the metric cannot see
its runtime at all — audit those classes directly.**

**The refusals are unchanged where they matter.** A card whose ONLY mana line is restricted or inexpressibly
gated still returns null — Herd Heirloom, Jeweled Lotus, Springleaf Drum all stay refused (pinned). Keeping
the UNRESTRICTED line is strictly what the card does with no strings attached, so the change can only
under-deliver.

**Two precision fixes on the gate stamp**, both under-delivering bugs the naive version would have added:
an inexpressible gate must not be stamped onto mana parsed from a DIFFERENT line; and the gate is taken from
the line actually PARSED. Fanatic of Rhonas is the case that proves the second — plain `{T}: Add {G}.` plus a
Ferocious-gated bigger line, and the old any-match form gated the {G} on ferocious, switching the dork off
until a 4-power creature was out. **Mox Opal keeps its live gate** (expressible, on its only mana line).

Mutation-checked M55–M56. Tier: **GAINED 16 · LOST 0 · RETIERED 0**, every gain verified as crediting only
freely-made mana (Delighted Halfling gets its {C}, never the legendary-restricted any-color). **The land
fixes do not appear in the tier at all, which is the whole point.**

## ⚠️ STILL OPEN IN THIS AREA — the colorless-only lands (73), NOT yet fixed

Separate bug, same family, **left deliberately**: `parseAddClause` takes the FIRST `Add` clause and stops, so
a land printing `{T}: Add {C}.` on line 1 and its colours on line 2 models as **colorless only**. That is the
whole painland cycle (Shivan Reef, Adarkar Wastes, Karplusan Forest, Battlefield Forge…), the filter lands
(Flooded Grove, Mystic Gate, Graven Cairns) and ~60 more. **22 SHELF land-slots across 18 cards.**

⛔ **Do NOT just union the colours — the riders are the reason it is not a one-liner.** Each second ability
carries a real cost the engine would otherwise ignore, which turns an under-delivery into an over-delivery:
- **painlands** — `This land deals 1 damage to you.` Ignoring it = painless painlands, strictly better than
  printed (the forbidden direction). Needs a life cost on the tap; `commitManaTap` already has the shape for
  it (`sacrifices` does the same job).
- **filter lands** — `{G/U}, {T}: Add {G}{G}, {G}{U}, or {U}{U}.` A hybrid mana COST to make a 2-mana
  BUNDLE. The bundle half already exists (`fixed`, shipped this run); the mana-cost-to-tap half does not.
- **Mogg Hollows** — `doesn't untap during your next untap step` (`setDoesNotUntapNext` exists).

Sized honestly: the colour union is easy, the riders are the slice. Build the rider first, then the union —
the same order law that has held all run.

## 🚨 FOUND, MEASURED, NOT FIXED — MANA-ABILITY ACTIVATION COSTS ARE NEVER CHARGED (93 cards, FP direction)

**A mana ability's own MANA cost is dropped.** `manaProduction` records what the ability produces and nothing
records what it costs, so `planPayment` taps it for free.

⭐ **Verified live, not inferred:** a lone **Prismite** (`{2}: Add one mana of any color.`) on an otherwise
EMPTY board — no lands, empty pool — pays `{U}`. Mana fabricated from nothing. That is the forbidden
direction and it needs no board state at all to trigger.

**Precise split** (the modelled line's cost carries plain mana symbols; `{X}`/phyrexian/hybrid skipped as
uncountable, variable output skipped):

| class | count | reality vs engine | examples |
|---|---|---|---|
| **NET-ZERO or worse** | **51** | produce ≤ cost → real net is 0; engine gives free mana | Prismite, Prophetic Prism, Orochi Leafcaller, Golden Egg, Nomadic Elf (`{1}{G}` for ONE mana) |
| **NET-POSITIVE** | **39** | real ramp, engine over-counts by exactly the cost | every Signet (`{1}, {T}` → 2 mana), Sungrass Prairie, Shadowblood Ridge |

⛔ **I TRIED THE PARSE-LAYER FIX AND BACKED IT OUT — read this before trying it again.** Refusing net-zero
abilities in `manaProduction` works and removes the fabrication, but it **breaks five existing pins that
deliberately keep filters producing**, and `manaModel.test.js` states the design intent in its own words:

> *"A mana FILTER (pure mana cost, no {T}) is **payable from the pool** — kept exactly as before."*

That is a claim about the **PAYMENT layer**, and the payment layer is precisely where the gap is. The parse
layer is the wrong place to fix it, and refusing there would also delete the cards' colour FIXING, which is
most of why they are played. **The pins are not wrong; the runtime never implemented what they assume.**

**THE FORK (Colton-grade or sharp-Cindy-grade, not a 3am call):**
- **(A) Charge it in `planPayment`** — the architecturally right layer. Give the source an activation cost;
  a costed source may only be tapped when the cost is coverable. Conservative first cut: require the cost
  from ALREADY-FLOATING mana (never chain tap→filter→spend). Never fabricates; under-delivers on
  land-then-filter lines, which is the safe direction.
- **(B) Refuse net-zero at the parse layer** — smaller, but contradicts the shipped design intent above,
  deletes colour fixing, and costs 51 cards of native-mana.

**Recommendation: (A), and only while sharp** — it touches the payment core that the karoo bundle and the
generic-drain fix also live in, and that core is the one seam where "affordable == actually paid" must hold.

⚠️ **Note the asymmetry vs. the per-line refusal shipped in slice 65:** that one was a pure under-delivery
being corrected, so it was safe to ship unattended. This one is an over-delivery whose fix trades against a
documented decision — different risk class, deliberately left for a waking decision.

## ✅ SHIPPED — PAINLANDS tap for their colours and pay the life (`b15cdecd`)

All 10 (`Shivan Reef`, `Adarkar Wastes`, `Karplusan Forest`, `Battlefield Forge`, `Llanowar Wastes`,
`Caves of Koilos`, `Yavimaya Coast`, `Brushland`, `Underground River`, `Sulfurous Springs`) modelled as
**COLORLESS ONLY** — premium fixing that could not cast a coloured spell.

⛔ **The life cost is why this was not a one-line colour union.** Admitting {U}/{R} while ignoring
"deals 1 damage to you" is a PAINLESS painland — strictly better than printed. Colours ride together with
`painColors`/`painAmount`, charged only when the tap actually picks a painful colour; the {C} half stays
free. **M58 over-charges the free half specifically**, because over-charging is just a different infidelity.

**Mogg Hollows deliberately KEEPS its colourless read** — same two-line shape, but a "doesn't untap during
your next untap step" rider. Dropping that drawback is the same over-delivery in a different costume.

⭐ **Tier diff: GAINED 0 · LOST 0 — and that IS the point.** The fix is invisible to every number the project
tracks, because lands are credited by TYPE. Third find of that blind spot this run.

## 📌 STILL OPEN in the colorless-land family (~60 lands) — the RIDERS are the work, not the union

- **FILTER LANDS** (Flooded Grove, Mystic Gate, Graven Cairns, Twilight Mire, Sunken Ruins, Wooded Bastion,
  Fetid Heath, Rugged Prairie — **the biggest SHELF group here**): `{G/U}, {T}: Add {G}{G}, {G}{U}, or
  {U}{U}.` Needs a MANA cost to activate → **blocked on the activation-cost fork banked above**, not on the
  colour union. Do not start it before that decision.
- **MOGG HOLLOWS-class**: needs the no-untap rider (`setDoesNotUntapNext` already exists) — the nearest
  buildable one after painlands.
- **Storage / counter lands** (Saltcrusted Steppe, Dreadship Reef, Fountain of Cho): remove-counter costs,
  already covered by the consumable-cost refusal. Leave alone.

## ✅ SHIPPED — enchanted-creature counter referent + the self doubling pronoun (+4) (`21c471a8`)

Two pronoun gaps, each one word wide, found while chasing Level Up:
- **`target:"enchanted"` on add-counter** (+4: Forced Adaptation, Sadistic Glee, Ephara's Enlightenment,
  Predatory Hunger). The referent already existed for tap / untap / pump / regenerate — only the counter atom
  lacked it, so the whole card parked. Runtime-verified: counter lands on the HOST; a DETACHED aura
  fabricates nothing.
- **`"double the number of +1/+1 counters on IT"`** — the parser already models the same clause written
  "…on THIS CREATURE", so only the pronoun was missing. Joins `SELF_PUMP_IT` / `SELF_COUNTER_IT`, same
  self-scope + whole-clause guards.

## 📏 RE-SIZED HONESTLY — LEVEL UP IS A **FOUR**-PIECE CARD, NOT THREE (and still body-only)

The ledger sized it at three. Measured, it is four, and one of the three was already done:

| piece | state |
|---|---|
| the Aura's ETB "counter on enchanted creature" | ✅ **shipped above** |
| the quoted attack-trigger GRANT to the host | ✅ **already worked** — verified with a control: an Aura's quoted trigger reaches its host and an unmodelled body routes to the Arbiter |
| "double the number of +1/+1 counters on it" | ✅ **shipped above** (the bare clause) |
| the COMPOUND + a SELF power-threshold ("Then if it has power 10 or greater, draw a card") | ❌ **unbuilt — the remaining blocker** |

`"draw a card if THIS CREATURE has power 10 or greater"` is LOW while the board-condition form
(`"…if you CONTROL a creature with power 4 or greater"`) is HIGH — so the gap is a SELF power threshold in
the condition vocabulary, plus the "A. Then if <cond>, B." composition. **Level Up stays body-only until both
land: a partial fire is the false positive.**

⚠️ **The build-order law had nothing to enforce here** — the grant was already live, so there was no
payoff-before-grant hazard. Worth recording: checking the fire site FIRST cost one probe and saved building a
piece that already existed.

## 🎓 TWO PARK PINS GRADUATED — and the pattern is now explicit

`auraOwnTriggered.test.js` asserted Forced Adaptation parks **because the counter parser rejected
`target:'enchanted'`** — a statement about a MISSING CAPABILITY, not a refusal to keep. That file already
carried the precedent in its own words on the very next test: *"This pin asserted the opposite and fired the
moment the detector arm landed, which is exactly its job."* So it graduated, and the park guarantee it
protected kept a live fixture (Followed Footsteps).

⭐ **DISTINGUISH THIS FROM THE FILTER-LAND PINS I REFUSED TO OVERRIDE LAST SLICE.** Those state a design
INTENT ("payable from the pool") about a layer that was never implemented — overriding them would decide a
banked question. These state a CAPABILITY GAP that has now closed. **Capability pins graduate; intent pins
need a decision.** Read which kind you are looking at before touching it.

⚠️ `aura.test.js`'s routing test had Forced Adaptation as its FIXTURE (itself a swap from Bequeathal for the
same reason — this is the third rotation). Re-anchored on Writ of Passage, and it now asserts the fixture is
**actually OFFERED** before reading it: the board's pool is colorless-only, so a coloured fixture is never
offered and the test dies on a `TypeError` that reads exactly like a routing failure. Hit live while
swapping.

## ✅ SHIPPED — SELF power threshold in the condition vocabulary, layer-aware (`fb3bfa85`)

`"if THIS CREATURE has power N or greater"` — the SELF referent beside the existing board-wide form,
resolved through `context.sourcePermanentId`. **Layer-aware** (`creaturePower(perm, state)`), which is the
entire point on a card that doubles its counters and then asks whether it got big enough. FN-safe: a missing
or departed referent is `null` ("can't confirm"), never `false`.

Reachable today through the **intervening-if** path, pinned end to end in both directions including the
10-vs-9 boundary. Tier GAINED 0 — no corpus card uses that variant yet; the value is the vocabulary plus its
pinned consumer.

## 🚧 LEVEL UP — ONE BLOCKER LEFT, AND IT IS PARSER PLUMBING, NOT VOCABULARY

Three of four pieces are done (`21c471a8` shipped two, the grant already worked, `fb3bfa85` the condition).
The last one is precise:

> Both parser arms that attach an atom-level `condition` — the LEADING `"If <cond>, <effect>"` and the
> TRAILING `"<effect> if <cond>"` — gate on **`spellConditionParseable`**, which BY DESIGN probes with an
> EMPTY context. A source-dependent condition can never pass it. **The parser cannot tell a TRIGGER clause
> (which supplies `sourcePermanentId`) from a SPELL clause (which does not).**

⭐ **The runtime half is already verified and is NOT the problem:** `triggers.js` threads `sourcePermanentId`
into the trigger context and `runProgram` passes that context to `evaluateInterveningIf`, so a trigger CAN
answer at resolution and a spell gets `null` and skips. **No runtime-vacuous native lurking here** — checked
before building anything.

**THE FIX (contained, but it touches shared plumbing — do it while sharp):** thread a `triggerScoped` flag
through `parseEffectClause` options from `buildTriggerStack`, and let the two conditional arms accept
source-dependent conditions only when it is set. Sized: one option, two call sites, two arms.

**Then the compound:** `"A. Then if COND, B."` is already the LEADING form once `"Then"` is stripped — no new
condition machinery needed. Measured: with the compound rewritten and a KNOWN condition, the whole clause
parses HIGH, so the composition works.

**What it is worth, measured, so the next resume can judge it cold:**
- the "Then if" compound alone → **+4 corpus** (Shuri, Replicating Ring, Psychic Whorl, Hour of Promise);
  118 cards carry the shape but it is rarely their only blocker
- the self threshold alone → **2 cards** (Level Up, Hog-Monkey Rampage)
- **together → Level Up, a ×3 SHELF card** — which is the actual reason to do it

## ✅ SHIPPED — source-scoped atom conditions + the sequenced "Then if" form (+3) (`9b6441c0`)

Two composing changes. **The scope gate:** an atom-level `condition` may attach only when the resolver can
evaluate it, but BOTH conditional arms used the SPELL probe (empty context) — so a source-dependent condition
could never attach even on a TRIGGER, which has a source. Now split by the context the caller can honestly
supply:

- resolving SPELL → no object thread → `spellConditionParseable`
- a PERMANENT'S ABILITY → has its SOURCE → `activationConditionParseable`

⭐ **The source-only probe is deliberate.** A trigger's context also carries per-event fields (triggering
permanent, defender, damage snapshots) that VARY BY EVENT; probing with all of them would admit conditions
some other event's trigger cannot answer. `sourcePermanentId` is the one field EVERY trigger carries — the
honest floor.

⚠️ **`triggerRouting`'s validator had to move WITH `buildTriggerStack`** — its own comment requires it to
mirror the allowlist exactly, and leaving it behind would have been a metric⇄runtime divergence (the metric
saying "won't route" about something the runtime routes).

**The sequenced form** `"A. Then if COND, B."` needed no new machinery: `splitClauses` already hands the
second sentence over as `"then if <cond>, <effect>"`, so peeling the connective was the whole gap.

## 🎓 ONE MORE PIN GRADUATED — and I verified it was a graduation, not an FP

`rampMulti` asserted **Hour of Promise** stays LOW because a "Then if" rider had no route. Before flipping it
I checked BOTH halves are real: `"you control three or more Deserts"` evaluates correctly at the boundary
(0/2 → false, 3/5 → true) and the rider parses to a genuine `create-token` atom **carrying** that condition.
A rider that fires only when its condition holds is not a dropped rider. The guarantee it protected keeps a
live fixture — a rider whose condition is outside the vocabulary still parks the whole card.

**This is the capability-vs-intent rule from slice 68 paying off twice now.** Capability pins graduate once
the capability lands; intent pins (the filter-land "payable from the pool") need a decision. Check which kind
before touching one.

## ⛔ LEVEL UP — PARKED, and the last blocker is a CREED ANCHOR, not a gap

Four of five pieces are in (`21c471a8` two, the grant already worked, `fb3bfa85` the condition, `9b6441c0`
the scope gate + compound). The remainder:

> The `SELF_DOUBLE_IT` pronoun rewrite is **whole-clause anchored ON PURPOSE** so a rider can never be
> silently dropped. Level Up's granted body is `"…on it. Then if…"`, which does not match — deliberately.

**Completing it means deciding whether that anchor may fire PER-SENTENCE inside a compound.** That is a real
CREED call (the anchor is the thing standing between "modelled" and "silently dropped rider"), not plumbing,
so it is NOT a 3am change. Pinned as parked in `sourceScopedCondition.test.js` so the state cannot drift
unnoticed.

⭐ **Worth noting what this cost:** Level Up was sized at 3 pieces, then 4, and is now 5 — each re-size came
from measuring the next layer rather than assuming it. The three shipped pieces are all independently useful;
none of the work is stranded on the card that motivated it.

## ✅ SHIPPED — painland cycle COMPLETED: 5 slow variants + 6 that were PAINLESS (`aad5b36c`)

Two more shapes of the same family. The second was live in the **forbidden** direction:

1. **THE SLOW HALF (+5).** Skyshroud Forest, Scabland, Pine Barrens, Salt Flats, Caldera Lake carry a leading
   `"This land enters tapped."` line; my original anchor started at `{T}: Add {C}` and silently missed FIVE of
   the fifteen. ⚠️ **I shipped that arm last slice believing it covered the cycle** — it covered two thirds.
   Counting the family AFTER building, not before, is what caught it.
2. ⭐ **THE SINGLE-ABILITY FORM — an FP that was already live.** The Odyssey threshold cycle (Cabal Pit,
   Barbarian Ring, Cephalid Coliseum, Centaur Garden, Nomad Stadium) + Fogwell's Gym print ONE coloured
   ability that costs life. These were **never colourless** — their first Add clause IS coloured, so they
   parsed fine and the damage rider was simply DROPPED. Painless painlands: strictly better than printed.
   Unlike the two-line cycle's under-delivery, this was an **over**-delivery.

⛔ **Tomb of Urami stays excluded** — `"deals 1 damage to you IF you don't control an Ogre"` is a condition
nothing models, so charging always would over-charge. Known, recorded gap; not a new wrong answer.

⭐ **A REDUNDANT GUARD REMOVED BECAUSE ITS MUTATION SURVIVED.** I wrote a second `!/damage to you if/` test
beside the regex. M65 removed it and nothing failed — the anchor's own `\.` already excludes the conditional
printing, which has no period there. **Dropped rather than kept: a guard that cannot be seen to fail implies
protection it does not add.** This is the hollow-gate law applied to my own belt-and-braces.

Tier GAINED 0 · LOST 0, as expected — this whole family is invisible to the metric.

## 🗺 THE COLOURLESS-LAND REMAINDER, grouped (so the next resume picks by shape, not by card)

| shape | n | state |
|---|---|---|
| COUNTER cost (Saltcrusted Steppe, Dreadship Reef) | 15 | ⛔ covered by the consumable-cost refusal — leave |
| CONDITION-gated (the Tainted cycle) | 10 | needs per-line conditions + colour union |
| NO-UNTAP (Mogg Hollows cycle) | 10 | buildable (`setDoesNotUntapNext` exists) — **but 0 SHELF slots, 0 tier** |
| "other" (Phyrexian Tower, Crypt of Agadeem) | 10 | mixed one-offs |
| FILTER, hybrid cost (Mystic Gate, Flooded Grove) | 10 | ⛔ **blocked on the activation-cost fork** — biggest shelf group |
| MANA-COST activation (Cabal Stronghold) | 8 | ⛔ same fork |
| SPEND-restricted (Village cycle) | 6 | ⛔ deliberate refusal — leave |
| PAINLAND | ✅ | **done, all 15** |

**Read: the cheap land work is finished.** What remains is either a deliberate refusal, worth zero on the
shelf, or blocked on the banked activation-cost decision.

## 🔍 AUDIT — the `native-body` tier is HONEST (and one hollow test found) (`45b23547`)

I swept `native-body` for the blind spot the lands had: **a tier credited by ABSENCE of parsed abilities
rather than by parse.** If a vanilla-credited creature carries a real restriction the engine ignores, that is
an over-delivery nobody would ever see.

**Result: the tier is honest.** 1,844 native-body cards carry non-reminder text; almost all is keyword-only,
and of the 102 distinct non-keyword SENTENCES the high-frequency ones are all genuinely implemented AND
wired — `can't block` (39), `attacks each combat if able` (29), `can block only creatures with flying` (24),
`can't attack unless defending player controls…` (10), `enters tapped` (15, verified behaviourally on both a
creature and an artifact). **No FP found.** Recording that, because "we checked and it was clean" is worth
exactly as much as a find the next time someone wonders.

⚠️ **ONE PROBE OF MINE WAS WORTHLESS AND I ALMOST BELIEVED IT.** I grepped the engine source for each
restriction sentence and got "55 of 62 unimplemented" — including `can't block`, which I had *already
confirmed* is implemented. The engine stores these as REGEXES (`reCantBlock`), never as literal sentences, so
fragment-matching source text can never distinguish implemented from missing. **Discarded the list; tested
behaviourally instead.** A probe whose answer contradicts something you have already verified is wrong about
everything else too.

## ⭐ THE REAL FIND — a green test that never touched the shipped path

`attackDefenderLandRequirement` / `defenderMeetsAttackLandRequirement` are exported and **tested**, with **no
engine caller**: `legalChoices` enforces islandhome via the generalized `attackDefenderRequirementOf` +
`defenderMeetsAttackRequirement`. So `islandhome.test.js`'s helper assertions were green while never
exercising the live path — **and would have stayed green if the live path broke.** The file header even
documented the dead function as the enforcement route.

Fixed in the order that keeps the guarantee live at every step: (1) verify the live pair is behaviourally
IDENTICAL on island / snow land / swamp; (2) repoint both test files and correct the header; (3) only then
delete. The old comment claimed the pair was *"kept because tests and callers pin the land-string contract"*
— true of the tests, false of the callers, which is precisely how it survived.

**The integration half of that file (`legalActionsForPlayer`) was always real** and is untouched — it is the
part that actually proved the restriction works, and it is why this was a bookkeeping hazard rather than a
live bug.

⭐ **RULE EARNED: "exported + tested" is not "wired."** Before trusting a green suite as evidence for a
behaviour, check the function it calls has a NON-TEST caller. Cheap: `grep -rl <fn> src/ | grep -v test`.

## 🔧 SHIPPED — `probe-dead-exports.mjs`: "exported + tested" is not "wired", mechanized (`c053e89b`)

The islandhome find generalizes into a sweep: **a green suite is evidence only if the function it calls has a
production caller.** Definitions from `src/lib/learn`, callers searched across ALL of `src/` and `scripts/`.

⭐ **IT CARRIES ITS OWN CONTROL, and the control earned its place TWICE.**
1. My first version printed **"0 dead exports" while completely blind** — a mangled `\b` escape made every
   reference count wrong. A sweep that cannot see a dead export reports a comforting zero.
2. After adding the control, it failed again on the real script for a DIFFERENT reason: `scripts/` is in the
   caller set and the file mentions the control name as a literal, so the control counted as referenced.

**Both bugs were invisible in the output. Both were caught by the control.** The probe now refuses to print a
result unless the planted export is found.

⚠️ **SCOPE CORRECTED:** a learn-only caller scan reported **37** rows, mostly false — engine functions are
routinely consumed by API routes, components and hooks (`puzzleGoalLabel` ← `LearnView.jsx`).

## ✅ TRIAGE OF THE 16 REAL ROWS — all benign (do not re-chase)

| class | examples | verdict |
|---|---|---|
| test helpers by convention | `_resetComboCacheForTests` | hidden unless `--all` |
| CONTRACT PINS | `serializeState` / `deserializeState` | trivial JSON wrappers; the file's own docstring says the round-trip test **is** the contract |
| BACK-COMPAT SHIMS | `blockableOnlyBySubtypeOf` | documented as superseded by `groupBlockRestrictionOf` |
| THIN WRAPPERS over a used fn | `opponentsEnterTappedOf`, `cantAttackOrBlockAlone` | guarantee live through the other name — verified |

Every underlying guarantee is wired: menace via `attackerMinBlockers` (legalChoices:2903), the
alone-restrictions via the `cantAttackAlone`/`cantBlockAlone` pair (both return true on the combined text).

**So islandhome was the ONLY genuine instance, and it is already fixed.** A clean sweep is worth recording
precisely because the next run would otherwise wonder.

⚠️ **FIXTURE TRAP, logged in the probe header:** I briefly "found" that a Bear could block a
can't-be-blocked-except-by-Walls attacker — using a wording **I invented**. Nearly all real
"can't be blocked except by" text is REMINDER text for Menace / Flying / Fear, modelled as keywords. Test
against the real card; this is the seventh time that rule has caught me this run.

## 🧭 THE AUDIT PROGRAMME SO FAR — where the blind spots were, and were not

| class | credited by | result |
|---|---|---|
| **lands** | TYPE (playable because they are lands) | ⭐ **3 real bugs** — karoo bundles, per-ability refusals, painlands |
| **native-body** | ABSENCE of parsed abilities | ✅ clean — every high-frequency combat restriction implemented AND wired |
| **exported+tested helpers** | a passing test | ⭐ **1 real hollow gate** (islandhome), now mechanized against |

**Read:** the productive audits target things credited WITHOUT a parse. That vein is now swept. The next
candidates would be `native-equipment` / `native-aura` / `native-clone` (grants credited from a parse but
applied through a separate layer walk) — i.e. parse-credited but APPLICATION-unverified, a different shape
worth its own pass.

## 🚨 SHIPPED — a clone with a cost-only keyword line NEVER CLONED at runtime (`368cb402`)

**Visage Bandit** was credited `native-clone` and, on a board with a legal copy target, raised **no clone
choice at all** — it entered as itself.

`parseCloneSpec` requires the WHOLE oracle to be the copy clause, so a cost-only keyword line
(`Plot {2}{U}`, Convoke, Affinity) made it return null. **coverage.js knew that and stripped those lines
before calling `isCloneCard` — the RUNTIME (`resolvers.js` PERMANENT_ETB) called it on the RAW card.**
Classifier and runtime were reading different text about the same card.

⭐ **FIXED AT THE SHARED READER, NOT THE CALL SITE.** The strip now lives inside `parseCloneSpec`, so every
consumer — classifier, resolver, `legalChoices`' X-cost check — sees the same oracle. Patching `resolvers.js`
would have fixed this card and left the next caller free to repeat it. **This is the same lesson as
`triggerRouting` mirroring `buildTriggerStack` in slice 70: when two sides must agree, make them read one
source rather than promising to stay in step.**

⚠️ **MY FIRST RUNTIME HARNESS WAS WRONG AND THE CONTROLS CAUGHT IT.** I drove `enterPermanent`, and EVERY
card — Clone and Mirror Image included — showed "no choice", which reads exactly like the bug. That is not
the clone route; the PERMANENT_ETB resolver is. **Both controls now live in the test file** so the harness
cannot silently stop reaching the path.

Tier: GAINED 0 · LOST 0 — the tier was already claiming this card; the fix is that **the claim is now true.**

## 🧭 AUDIT PROGRAMME — the third shape swept, and this one paid

| shape | credited by | result |
|---|---|---|
| lands | TYPE (playable because they are lands) | ⭐ 3 real bugs |
| native-body | ABSENCE of parsed abilities | ✅ clean |
| exported+tested helpers | a passing test | ⭐ 1 hollow gate (islandhome) |
| **grants: parse-credited, APPLICATION-unverified** | a parse, applied through a separate layer/resolver | **⭐ 1 real bug (clone)** |

Within the last shape: **Equipment and Aura grants are CLEAN** — Bonesplitter/Loxodon Warhammer apply P/T
and keywords, Rancor/Unholy Strength/Flight apply theirs, all with unattached controls. `native-clone` is
where it broke, and it broke on the one card in the tier carrying an extra keyword line.

⭐ **THE GENERALIZABLE QUESTION, now stated for the next pass:** *does the classifier transform the oracle
before deciding, and does the runtime apply the SAME transform?* Every pre-strip, normalization or elision in
`coverage.js` is a candidate. That is a concrete, finite list worth walking — this find was one entry in it.

## 🚨 SHIPPED — CLASSIFIER/RUNTIME ORACLE PARITY: 8 native spells were routed to the Arbiter (`7fbd341d`)

The question the last slice told me to ask, asked corpus-wide: **for every card classified `native-spell`,
does the program the RUNTIME parses come back HIGH?** Eight said no — counted native by the metric, adjudicated
by the Arbiter in play.

- **PLOT** (Plan the Heist, Rise of the Varmints) — coverage stripped the `Plot {cost}` line before deciding;
  the runtime did not, and the leftover line dragged the body LOW.
- **CASCADE** (Violent Outburst, Demonic Dread, Deny Reality, Captured Sunlight, Forceful Denial, Natural
  Reclamation) — the keyword line belongs to the TRIGGER subsystem, not the spell's effect program. Verified
  the cascade trigger detects AND routes natively before stripping, so the effect still fires.

⭐ **Both fixed in the SHARED helper** — third time this conclusion has come up (clone `368cb402`,
triggerRouting `9b6441c0`). **When two readers must agree, make them read one source instead of promising to
stay in step.**

⛔ **The plot strip is GATED and the gate is real:** a `becomes plotted` TRIGGER card (Longhorn Sharpshooter,
Aloe Alchemist) keeps its line, or an unmodeled trigger would be hidden. The text check reproduces coverage's
`parsePlotCost` gate **34/34 across the corpus** — measured before relying on it, not assumed.

## ⚠️ THE FIRST CASCADE FIX WAS TOO WIDE, AND THE TIER DIFF IS THE ONLY REASON I KNOW

Reusing coverage's cascade matcher (which also matches the reminder sentence) stripped a **REAL ability** off
cards that GRANT cascade — *"Delirium — This spell has cascade as long as…"* (Bloodbraid Marauder), *"The
first spell you cast each turn has cascade"* (Maelstrom Nexus) — and credited **9** of them native with the
granting ability silently gone. The forbidden direction.

**Why the borrow was unsafe:** coverage can use that matcher because it runs INSIDE a branch already gated on
the card HAVING cascade. A shared helper runs on EVERY card, so the same regex means something different.
⭐ **RULE: a matcher lifted out of a gated branch must be re-narrowed for the ungated context.**

⭐ **AND THE ACCEPTANCE TEST FOR A PARITY FIX IS "THE TIER MOVES ZERO."** Parity work aligns two readers; it
should not reclassify anything. When the tier moved, the strip was wrong. That is now the stated check.

## 🧪 THE SWEEP IS A PROBE, NOT A TEST — and that distinction bit me

I first wrote the corpus invariant as a test assertion. It died with `Local Oracle repository missing`: it
needs the bundled index the hermetic suite lacks, so it would have **failed CI for a reason unrelated to the
thing under test**. Per-card regressions are pinned hermetically in `classifierRuntimeParity.test.js`; the
sweep ships as `scripts/probe-classifier-runtime-parity.mjs`.

**Convention, now explicit: corpus-wide checks are PROBES (local-only, need the oracle); per-card guarantees
are TESTS (hermetic).** Mixing them makes the suite environment-dependent.

## 🧭 AUDIT PROGRAMME — the transform list is now walked for spells

`coverage.js` applies ~12 distinct oracle transforms (`stripReminder` ×25, `stripCostOnlyKeywordLines` ×4,
`stripTriggerEffectTails`, `stripTriggerAbilityLabel`, `stripModeledSelfNoUntap`, `stripCounterCostManaLines`,
`foldModalBulletLines`, `stripKickerText`, …). **The spell-cast path is now parity-clean (2282 cards, 0
divergences) and guarded by a probe.** The same question is open for the PERMANENT paths — triggers, statics,
activated abilities — where the runtime reads through different entry points. That is the next pass.

## ✅ PARITY SWEEP EXTENDED TO THE PERMANENT PATHS — all clean (`f334d31b`)

The spell side found 8 bugs last slice; this walks the same question through the permanent entry points.

```
native-spell      2282 checked · 0 divergent
native-activated  1782 checked · 0 divergent
native-equipment   170 checked · 0 divergent
```

**EQUIPMENT was the sharpest case** and is the one I expected to break: coverage strips trigger sentences
before its own Equip check (a trigger-bearing equipment like Pip-Boy would otherwise fail the residue test),
so it is *exactly* the transform-divergence shape that broke clones. The runtime reads the RAW card and finds
the Equip ability on all 170 regardless.

**TRIGGERS are aligned by construction, not by sweep:** `triggerRouting`'s validator is required to mirror
`buildTriggerStack`'s allowlist exactly, both call `detectTriggers` on the raw card, and the one divergence
that did exist (the source-scoped condition gate) was fixed in `9b6441c0`.

## ⚠️ MY FIRST ACTIVATED RUN REPORTED 71 "DIVERGENCES" — EVERY ONE WAS MY PROBE

I checked only the PRINTED abilities. The runtime has **three** entry points and the other two are not
optional:
- **GRANTED** — an Aura's quoted ability lives on the HOST (Dragon Mantle, Hot Springs); `legalChoices` reads
  it via `grantedActivatedQuotedFor`, never off the Aura's own card.
- **GRAVEYARD** — `"{4}{B}: Return this card from your graveyard…"` (Tunnel Rats, Stitchwing Skaab) is
  offered from the graveyard, a separate path entirely.

With all three: **0**.

⭐ **THIRD TIME THIS EXACT SHAPE:** the dead-export sweep's first 37, the restriction-grep's "55 of 62", now
this 71. **A probe that models only PART of the runtime reports the missing part as a defect.** The tell is
always the same — a suspiciously large number against code that has been exercised for months. The habit that
saves it: open two or three of the named cards and read them before believing the count.

## 🧭 THE TRANSFORM-PARITY VEIN IS SWEPT

| side | result |
|---|---|
| spells | ⭐ **8 real bugs** (2 plot, 6 cascade) — fixed in the shared helper |
| activated / equipment / triggers | ✅ clean |

Both sides are now guarded by `probe-classifier-runtime-parity.mjs`, so a future transform added to
`coverage.js` without a runtime counterpart shows up as a row instead of shipping silently.

**The audit programme's four shapes are now all swept** (things credited without a parse: lands ⭐3,
native-body ✅; a passing test as evidence: ⭐1; parse-credited but application-unverified: ⭐1 clone;
transform parity: ⭐8). **The systematic-audit vein is worked out** — further finds will come from specific
mechanics, not from another sweep of this kind.

## 🔧 SHIPPED — the shelf "ONE LINE AWAY" probe, + its first target (+3) (`e549e411`)

⭐ **THE PROBE IS THE BIGGER DELIVERABLE.** `probe-shelf-one-line-away.mjs` drops exactly ONE oracle line and
asks whether the card goes native. If yes, **that line IS the whole blocker** — a sized build target, not a
lead. **132 shelf cards qualify**, ranked by DECKS touched.

**Why it was needed:** `probe-shelf-blockers` ranks blocking SENTENCES by spread and kept surfacing rows
worth ~1 card — Teamwork ranked #1 (3 cards / 3 decks, worth one); the bite row ranked high and was worth
ZERO on the shelf. Both times the sentence was not the card's *only* blocker. **That is precisely the
question this probe asks instead**, and it is the shelf-gap list this run has needed all along.

⚠️ Its header carries the three ways a row still misleads: "one line" measures the CLASSIFIER not the effort
(Level Up tops the list and is a four-piece build); some rows are **deliberate refusals** (Hexing Squelcher's
life-cost ward); and proving the line is the blocker does not prove it can be modelled CREED-safely.
⭐ And the wrong-`MTG_APP_ROOT` trap that cost a run earlier is now a **guard** — pointed at the repo it
REFUSES rather than printing a convincing empty table.

### THE TOP OF THE LIST (for the next resume, cold)
| decks | card | blocker |
|---|---|---|
| 3 | Level Up | the granted compound — **banked**, needs the per-sentence anchor decision |
| 2 | Hexing Squelcher | ⛔ life-cost ward — **deliberate refusal, do not build** |
| 2 | Rhythm of the Wild | group grant of **riot** — riot is an ENTRY REPLACEMENT, not a static keyword, so it cannot join `GRANTABLE_STATIC_KEYWORDS`; multi-piece for 3 cards |
| 2 | Valley Floodcaller | multi-subtype batch pump on noncreature cast |
| 1 | Acidic Slime | ✅ **done below** |

## ✅ FIRST TARGET OFF IT — the three-way type union (+3)

Every TWO-way union existed; no three-way one did, so `destroy target artifact, enchantment, or land` parked
six corpus cards including **Acidic Slime** (staple, shelf card).

⛔ **Mapped as a straight OR of the three printed types, NOT to "permanent"** — the lazy mapping offers
creatures and planeswalkers the card cannot touch. M70 makes that substitution and the enumerator pin
catches it.

⚠️ **MY ENUMERATOR PIN PASSED VACUOUSLY AT FIRST.** A combo is `{targets:[…]}`, not a bare array, so my
extractor produced `[undefined]` and *"the creature is not offered"* was trivially true. **The hollow-gate
shape this whole run has been hunting, in my own test.** The fix is the non-empty assertion beside it —
a negative assertion needs a positive one next to it or it proves nothing.

## 🧭 WHERE THE SHELF STANDS

Six decks at/above 90% (Slivers 100, Vihaan 96, Omnath 93, Zaxara 92, Mothman 90, Earth Bent 90). cdh 81%
(capped ~82 — do not start). Next real target **Did you say Dragons? 77%**, needing ~13 cards across distinct
mechanics. Recent slices moved Zaxara 91→92, cdh 80→81, Kinnan 72→73.

**The cheap shelf work is genuinely done; the 132-row list is now the map for what remains.**

## NEXT ACTIONS

1. ✅ **DONE — Bloom Tender / Faeburrow Elder** (`003e29d1`). Shipped as the VIVID half of the mixed-bundle
   fix above; the read was right that it needed the color SET rather than the count, and wrong that it was
   contained — the shape it needed did not exist and 51 staples were broken for want of it.
2. **BANKED WITH A DESIGN QUESTION — `Tap N untapped creatures you control` as a cost** (39 corpus / 32
   parked; plus 40/28 for the singular). The SINGULAR is already fully modeled (γ1f, Earthcraft):
   parser → legalChoices expands one action per legal creature → dispatcher taps it. **The plural is NOT a
   simple generalization.** Enumerating N-combinations explodes legalChoices — 45 actions for two-of-ten,
   120 for three. The real choice is: enumerate combinations (correct, explosive) vs. auto-pick a
   deterministic set (legal, no explosion, silently removes player agency the singular case has). I did NOT
   guess at depth. Decide this one while sharp.
3. **Upkeep-only activation** (11) — still needs the offer window WIDENED, not narrowed. Riskier than
   anything above; take it EARLY in a run.
4. Shelf grind: the leverage head (2+ decks), re-read 2026-07-28 after Bloom Tender closed:
   - ✅ **Bloom Tender ×3** — DONE (`003e29d1`).
   - ✅ **Chrome Mox ×3** — DONE (`7af34dc1`). The imprint STAMP is now shared infrastructure.
   - ✅ **High Score ×3** — VERIFIED at runtime (`405756b6`), no bug. Both halves hold: the +1/+1
     replacement really is N+1 (pinned at 3→4, since a DOUBLING bug reads 6 and passes a 1→2 test), and the
     end-step draw really is gated in both directions. ⭐ The probe that "proved" the gate first was a
     BROKEN HARNESS — wrong runEffectProgram signature, so nothing drew, which reads identically to
     fail-closed. A plain unconditional draw through the same harness also returned 0; that is what exposed
     it. **The control is now a test.** Third fixture-trap of this run, and the only one caught by a control
     rather than by luck.
   - **Wan Shi Tong ×3** — ETB X-counters + "half X rounded down" draw, plus an
     opponent-SEARCHES-their-library trigger the engine has no event for.
   - **Level Up ×3** — an Aura granting a quoted attack trigger that DOUBLES counters, then a
     power-threshold draw. Multi-piece.
   - **Mindbreak Trap ×3 / Teferi's Protection ×3** — alternate cost + "exile any number of target spells",
     and PHASING. Both are subsystems, not cards; neither is a grind item.
   then a long ×2 tail.

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

## ✅ AURA GRANTS THAT NEVER APPLY — **ALL CLOSED** (`4096bfae` + `303858c5`). The probe reads ZERO.

**Reproducer:** `MTG_APP_ROOT=… node app/scripts/probe-dropped-attached-grants.mjs` — attaches each to a
2/2 and compares the host's LAYER-DERIVED P/T against the printed bonus.

| card | resolution |
|---|---|
| Dark Privilege #11269 · Serpent Skin · The Brute · Gaea's Embrace | ✅ **FIXED** — grants apply (3/3, 3/3, 3/2, 5/5); now `native-aura` (`4096bfae`) |
| Elephant Guide · Griffin Guide · Most Wanted · A-Most Wanted · Failed Conversion · Sleeper's Robe · Elder Mastery | ✅ **PARKED** — they did NOTHING; the composition crediting them was a false positive (`303858c5`) |

⚠️ **COVERAGE WENT DOWN, and that is the honest direction:** 35.9% → 35.8% (12,278 → 12,271). Those seven
were counted and delivered neither half. *A metric that only ever rises has stopped measuring.*

**⛔ THE COMPOSITION SLICE SHIPPED EARLIER IN THIS RUN WAS WRONG.** It credited ten Auras by verifying the
static half and the trigger half each through its own gate — "composed, not loosened". But each half is
verified on **text the composition invented**, and the runtime sees neither: `parseAuraBonus` drops the
static (an aura-own trigger line isn't on its skip list) and `checkDiesTriggers` never enqueues an
aura-own dies trigger (the Aura leaves with its host and is never scanned — measured, pendingTriggers 0).

⭐ **THREE of the ten survive, and the split is the reusable part:** Demonic Appetite, Mark of Fury and
Recumbent Bliss carry the AURA'S OWN upkeep/end-step trigger, which never references the enchanted
creature and so never poisons the bonus. **The dividing line is whether the trigger keys on the ENCHANTED
CREATURE.**

**To make the seven honestly native the ENGINE must change, not the metric** — `parseAuraBonus` must skip
a modeled aura-own host trigger, AND `checkDiesTriggers` must scan auras attached to a dying creature (an
LKI walk; the Aura is already gone by then). Neither is a slice.

**Root cause, diagnosed:** `parseAuraBonus` is all-or-nothing BY DESIGN — an Aura carrying a sibling the
bonus parser doesn't own (a regenerate activated line, an unmodeled own-trigger) drops the WHOLE bonus
to `[]`. Correct. But two crediting paths reason about a **transformed card the layer engine never sees**:
`nativeStaticGrantPlusActivated` (strips the extra activated lines, then asks `isNativeAura(stripped)`)
and `isNativeOwnTriggeredAura` (composes the halves, each checked in isolation). Each gate is right about
its own half; neither checks that the UNTRANSFORMED card still produces the grant.

**FIXED in `4096bfae`** — the aura-own-activated validator admits `regenerate`, and its caller's
pre-filter stopped demanding a MANA symbol before the colon (Dark Privilege's cost is "Sacrifice a
creature:", so its line was never even handed to the validator).

⚠️ **That widening re-opened a DIFFERENT FP** — letting ANY cost-bearing line be skipped meant a
SELF-SAC aura (Briar Shield, Thrull Retainer, Stamina, Carapace) kept its static half and went native.
Sacrificing the AURA detaches the host as a COST, before the ability resolves. Caught by two GUARD-LEAVE
pins that already existed; that rule now lives on both paths, not one.

⚠️ **AND I REPORTED THE OPPOSITE ONE TURN EARLIER** — that widening the validator "did NOT restore the
grant" — and reverted on that basis. I had checked only Gaea's Embrace, whose "+3/+3 AND HAS TRAMPLE"
union failed for a different reason; three of the four were already fixed by that change. **Re-test per
card. Never generalize a subsystem verdict from one sample.**

`auraOwnRegenerate.test.js` pinned all four at `native-activated` — written on the assumption the
composite delivers the bonus. Corrected, with the reason recorded in the test.

⭐ **THE STANDING RULE THIS LEAVES:** no static instrument can see this class — the tier says native, the
residue walk is satisfied, and a per-card tier diff shows nothing because nothing MOVES. **Anything that
emits a layer grant needs a RUNTIME assertion. The tier is not evidence about the board.**

## BLOCKED / REFUSED — do not restart these blind

- **ATTACHED UNBLOCKABLE** ("Equipped/Enchanted creature can't be blocked" — Whispersilk Cloak #329,
  Aqueous Form #735, Cloak of Mists, Protective Bubble). **BUILT, MEASURED CLEAN, AND REVERTED**
  (`055a47f2`) — do not re-attempt without closing the seam below first.
  - The `unblockable` pseudo-keyword and its enforcement ALREADY exist (canBlockAttacker reads it for
    Herald of Secret Streams); only the attach-side emission is missing. It looks like a one-line win.
  - Tier diff said **GAINED 4 · LOST 0 · RETIERED 0**. Suite green. Lint green. It was still wrong.
  - ⚠️ **Aqueous Form classified native-trigger while its grant did NOT apply** —
    `permanentHasKeyword(host, "unblockable")` was FALSE on a real board. `parseAuraBonus` returns `[]`
    for ANY aura with an own-trigger outside `isModeledAuraOwnTrigger` (scry-on-attack isn't in it), which
    is DELIBERATE. But a clause-level "modeled static" credit let the TRIGGER tier's residue check pass,
    so the card went native through a different door while the bonus was still being dropped.
  - ⭐ **THE SEAM IS PRE-EXISTING AND GENERAL: a clause-level static credit can contradict the CARD-level
    attached-bonus gate, and the tier diff CANNOT SEE IT.** GAINED/LOST/RETIERED all looked perfect. Only
    asking the runtime "is the keyword actually on the creature" exposed it. **For any change that emits
    a layer GRANT, add a runtime keyword/board assertion — the tier diff is necessary and not sufficient.**
  - Reconciling the trigger tier with the attached-bonus gate is its own wave. Three cards is not worth
    shipping a known FP to reach it early.
- **Foundry rail re-home** — REFUSED solo. Needs live browser QA with Colton available same-day. Do the
  MTGAssistant decomp first regardless; the re-home is not a solo-at-2am change.
- **Layer-2 control** (28 cards) — control is represented STRUCTURALLY here (the permanent moves between
  battlefield arrays; 628 sites read `.controller`). Needs move-and-revert that can never miss a path, or
  it becomes permanent control theft. Scoped in the triage ledger. Take it EARLY in a run, never late.
- **Learn keyword** — uncredited on an UNCERTAIN rule reading, deliberately. Do not credit it without
  checking the actual rule.

---

## COMPLETED TRAIL (newest first)

- `e549e411` — shelf one-line-away probe + three-way type union (+3). Slice 77.
- `f334d31b` — parity sweep extended to permanents; all clean. Slice 76.
- `7fbd341d` — classifier/runtime oracle parity: 8 native spells were Arbiter-routed. Slice 75.
- `368cb402` — clone with a cost-only keyword line never cloned (metric/runtime divergence). Slice 74.
- `c053e89b` — probe-dead-exports (self-controlled); 16 rows triaged benign. Slice 73.
- `45b23547` — native-body audit (clean) + a green test that never touched the shipped path. Slice 72.
- `aad5b36c` — painland cycle completed: 5 slow variants + 6 painless (FP). Slice 71.
- `9b6441c0` — source-scoped atom conditions + sequenced "Then if" (+3). Slice 70.
- `fb3bfa85` — SELF power threshold condition, layer-aware (+0; Level Up 3/4 pieces). Slice 69.
- `21c471a8` — enchanted counter referent + self doubling pronoun (+4); Level Up re-sized to 4 pieces. Slice 68.
- `b15cdecd` — painlands tap for colours + pay the life; 10 lands un-Wastes-ed (+0 tier, by nature). Slice 67.
- `9eba4b2e` — mana refusals per-ABILITY; 23 dead lands revived (+16). Slice 65.
- `a8279062` — NONCREATURE artifact/enchantment targets, layer-aware (+5). Slice 64.
- `977b72e9` — first-tap-each-of-your-turns + GRANTED becomes-tapped fire site (+1). **Earth Bent 90%.** Slice 63.
- `277f161b` — optional FIGHTER half of fight-pair; Earth Rumble (+1). Slice 62.
- `405756b6` — High Score pinned at runtime; verified, no bug (+0, x3 slots confirmed). Slice 61.
- `7af34dc1` — IMPRINT piece 2: Chrome Mox's mana gated on the stamp (+1). Slice 60.
- `5d24a81d` — IMPRINT piece 1: the stamp + its fire site; the CR-207.2c ability word (+0, by design). Slice 59.
- `003e29d1` — mixed mana bundles one-of-each: a live runtime FP on 51 staples, + Vivid (+2). Slice 58.
- `e0d15930` — Amulet of Vigor: permanent-wide enters-tapped trigger + the missing land fire site (+1). Slice 57.
- `d7148fa3` — v0.149.5: graveyard-ability composition (+14). Slice 56.
- v0.149.4 — devour/amplify, fuse unpark, aftermath unpark (+22). Slices 53–55.
- v0.149.3 — assist/casualty/provoke/ripple, training (+23). Slices 51–52.
- v0.149.2 — play-lands-from-graveyard, enters-tapped type set, dethrone, squad, the optional-mode
  family (+36), enlist/extort, unleash. Slices 44–50.
- v0.149.1 — firebending + end-of-combat held mana, split second, self-power block gate. Slices 41–43.
