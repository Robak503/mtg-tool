# OVERNIGHT PLAN — 2026-09-02 (Colton asleep; a 5-minute session cron keeps the seat working)

> **THE ORDER (Colton, 2026-09-02, verbatim intent):** "focus on 3 things: getting Cap with lands over
> the 90 percent mark or damn close; getting the lands section done; getting as far on Squirrel Girl as
> possible making her native" — then: "if you get Cap to basically 90, the lands fix, and SG to 90, then
> you move on to corpus." Earlier the same day: "I don't care how hard it is or slow."
>
> **A fresh seat boots from THIS file.** Read it, find the first stage whose DONE line is not met, take
> its first unfinished item, and work it through §5 in full. Do not re-plan. Do not wait for Colton —
> he is asleep; anything that needs him gets WRITTEN DOWN under §6 and you move to the next item.

Measured starting state (2026-09-02 evening): suite **1318 files / 15,090** green · corpus **39.53%** ·
**Cap America 75/100** · **Squirrel Girl 67/100** (just stored; the deck's engine is native, the
commander is not). Every number below was measured, not estimated; re-measure before claiming a stage.

---

## §1 STAGE ① — Cap America, WITH its lands, to ≥90 (or "damn close")

Cap has **25 non-native slots**: 13 land-partial · 10 body-only · 2 arbiter-spell. **The lands are the
path to 90** — the cheap card arms are gone (16 shipped 08-30 → 09-02, CAP1–CAP16). Work the lands
cheapest-first, then the two remaining single-blocker cards, then only if still short, the multis.

### 1a. The lands (probed 08-30 by ablation — do NOT re-probe, build)
| Slots | Card(s) | The ONE clause that blocks | Notes |
|---|---|---|---|
| ✅ +3 | Sacred Foundry · Hallowed Fountain · Steam Vents | "As this land enters, you may pay 2 life. If you don't, it enters tapped." | **SHIPPED (LANDS-2, 2026-09-03):** `paysLifeOrEntersTapped` + the `optional-life-payment` pause (play-land) / written pay-iff-life≥10 policy that CHARGES the life (tutor site). **All 10 corpus shocklands flipped**, zero LOST. Cap 79. The MDFC "pay 3 life" backs did not flip — they park on the double-faced back, not the clause. |
| ✅ +1 | Spectator Seating | "This land enters tapped unless you have two or more opponents." | **SHIPPED (LANDS-1, 2026-09-02):** `landEntersTapped.js` + six evaluator arms; **83 of 107 corpus lands flipped**, zero LOST. Cap 76. |
| ✅✅ +2 of 3 | ~~Mines of Moria~~ (✅ LANDS-4: the exile-three-from-graveyard COST — 63 corpus carriers, +31 flipped) · Mistrise Village · ~~Monumental Henge~~ (✅ LANDS-3) | their "unless" gates evaluate live now; each parks ONLY on its one activated ability: Mines "{3}{R},{T}, Exile three cards from your graveyard: Create two Treasure tokens" · Mistrise "{U},{T}: The next spell you cast this turn can't be countered" · Henge "{2}{W}{W},{T}: Look at the top five cards … reveal a historic card" | Same shape in Reef Roads / Wild Roads ("unless you control a Mount or Vehicle" + a Pilot-token sac ability). Mistrise's uncounterable-next-spell and Henge's look-at-5 may still park — that is honest. |
| ✅ +1 | Inventors' Fair | "{4}, {T}, Sacrifice ~: Search your library for an artifact card … Activate only if you control three or more artifacts." | **SHIPPED (LANDS-3, 2026-09-03):** the ONLY blocker was "Sacrifice Inventors' Fair" — its own name as a cost. `execSacrificeSelfName` → the same `sacSelf`. +9 riders corpus-wide. Cap 81. |
| ✅ +1 | Monumental Henge | "{2}{W}{W}, {T}: Look at the top five … You may reveal a historic card …" | **SHIPPED (LANDS-3):** the ONLY blocker was the word "historic" (CR 700.6) — now a gate on the shared tutor matcher. Weatherlight + Board the Weatherlight ride along. |
| ✅ +1 | Otawara, Soaring City | Channel — "{3}{U}, Discard this card: Return target … This ability costs {1} less … for each legendary creature you control." | **SHIPPED (LANDS-5, 2026-09-03):** prefix + four-type bounce union + live-board rider; +20 Channel riders corpus-wide. Cap 83. |
| ✅ +1 | Mistrise Village | "{U}, {T}: The next spell you cast this turn can't be countered." | **SHIPPED (LANDS-6, 2026-09-03):** per-turn flag → the cast chokepoint's `uncounterable` stamp. Cap 84. **Cap's land tail is now only the parks below.** |
| +1 | Uthros, Titanic Godcore | Station | a keyword subsystem. Probably a park — say so if it is. |
| hard | Urza's Saga · Hydroelectric Laboratory (MDFC back) · Soporific Springs (MDFC back) | Saga chapters on a land; two double-faced backs | genuine ceiling candidates — name them as such in §6 rather than sink the night into them |

**Where the land gate lives:** `coverage.js landFullyCovered` — line-granular; an unconditional
"enters tapped" line is admitted only when `staticAbilityParser.entersTapped(card)` is true, and that
function DELIBERATELY returns false on any `unless / if / may / pay` sentence (its own doc says so).
**The runtime half is the whole job:** find where the engine applies `entersTapped` at the enter
chokepoint (`resolvers.js enterPermanent` / the land-play path), add the conditional evaluation THERE,
and only then widen the classifier. A metric that credits a conditional the runtime never evaluates is
the hollow credit — CREED-forbidden. The pay-life form needs a real CHOICE (pause kind or a
deterministic policy documented as such: the AI pays life if it has ≥ N+2 and the land would otherwise
enter tapped on a turn it wants the mana — write the policy down, don't fake it).

### 1b. Cap's remaining cards (re-probed 09-02: only TWO single-blockers)
- **Illusionist's Bracers** — "Whenever an ability of equipped creature is activated, if it isn't a mana
  ability, copy that ability." An ability-COPY subsystem. Check whether a copy-ability atom exists for
  spells (Twincast-class) before building; if none, this is a park.
- **Iron Man, Titan of Innovation** — four pieces on one attack trigger: "noncreature artifact"
  sacrifice cost · optional-sac conditional tail ("If you do, …") · an EXACT-mana-value tutor filter ·
  that filter sized at 1 + the sacrificed artifact's MV. The dynamic-referent shape is CAP11/CAP14's
  (`capFromCombatDamage` / `unattachedEquipmentMv`) — copy that threading. Do the four as ONE slice
  only if each piece is ≤ ~40 lines; otherwise split and ship the exact-MV filter first (it is its
  own corpus vein).
- Multi-blockers (Mjölnir 3 lines, Zirda, Super-Soldier Serum, Sword of Wealth and Power, Forge Anew,
  the 3 MDFCs, Teferi's Protection, We Say Thee Nay!) — LAST, and only if Cap is still short of 90.

**DONE ①:** `measure-coverage.mjs captain` reads **≥90**, or every land + both singles above are shipped
or written up as parks in §6 and the number is as high as the remaining multis allow. Record the final
number in WAKE-REPORT.

---

## §2 STAGE ② — the LANDS SECTION done (corpus-wide)

Stage ① builds the arms; stage ② is making them COMPLETE across the corpus and closing the land tier.
1. Run the corpus flip-diff after each land arm — the LOST line is the whole point (a land arm touches
   `landFullyCovered`, which every land in the corpus passes through).
2. Census the remaining `land-partial` population by blocking clause (the census runbook:
   `docs/orchestration/RESIDUE-GRIND-RUNBOOK.md`). Every clause family with **≥3 corpus carriers** gets
   an arm or an explicit park entry in §6. Expected big families beyond stage ①: `enters tapped unless
   you control two or more other lands` (the Ixalan/Bloomburrow cycles), "As this land enters, choose a
   color" (the Cavern/Path family — Squirrel Girl has Cavern of Souls), the channel lands (Boseiju ×2 —
   Squirrel Girl has both), the creature-lands (Shifting Woodland, Evendo).
3. **DONE ②:** the wake report carries a table of every land-partial clause family with ≥3 carriers →
   `SHIPPED` or `PARKED (reason)`, and the corpus `land-partial` count is measured before/after.

**Progress (2026-09-03, stage ② opened after Cap's lands reached the parks; census baseline: 454
land-partial, 368 single-blockers):** ✅ reveal-lands (19, LANDS-7) · ✅ typed-basic union fetch — the
Landscapes/Panoramas (16, LANDS-8) · ✅ Channel (shipped in stage ①, LANDS-5: +20 riders) · ✅ shocklands
(LANDS-2) · ✅ "enters tapped unless" (LANDS-1, 83) · ✅ enters-with-N-counters lands (12, LANDS-9) ·
✅ storage-counter lands (13, LANDS-10) · ✅ the Karoos + pay-{1} lands (9 + Scythe Tiger, LANDS-11) ·
✅ choose-a-color permanents (21, LANDS-12). **Measured after LANDS-12 (the DONE ② number): land-partial
454 → 368 (single-blockers 368 → 291); after LANDS-13 (the lairs, +5): 363.** ⚠️ CORRECTION to an earlier
line here: NOT every ≥3-carrier family is shipped or parked — five families of exactly 5 carriers remain
OPEN: the Gates' once-only draw ("… Activate only once" — a once-ever ledger); ~~the Invasion lairs~~ (✅
LANDS-13 — the negated-subtype return cost); the Roads
("Sacrifice this land: create a Pilot token with a quoted sac ability"); the Gathering Place cycle ("Add
{X} or {Y}. Activate only if this land entered this turn OR you control a basic land" — an OR condition
the activation-gate vocabulary refuses structurally); the Overlooks (reflexive "When you do … and you gain
1 life"); and bands (5, PARK). Below 5: the Ice Age "If this land would enter, sacrifice a <type> instead"
(3), Station (2). Original queue for reference: "As it
enters, choose a color" (6 — `chosenColor` exists for Auras) · the Karoos (10) · the Gates (5) · "sacrifice
unless you pay {1}" (4). **Parks:** bands (5), the Overlooks' reflexive "When you do … and you gain 1 life"
tail (5), Station (2).

---

## §3 STAGE ③ — Squirrel Girl to 90, COMMANDER FIRST

**Progress (2026-09-03):** ✅ **SG-1 — the commander is NATIVE** (a "?"-terminated flavor-label rule, a "!" in
the activated label's character class, "squirrel" in the count vocabulary; 4/4 killed). Deck 67 → 68.
Ablation of the 33 remaining non-native cards: 19 single-blockers, ranked cheapest-first in the ledger's
SG-1 entry; 15 multis; 3 parks (Gemstone Caverns, Shifting Woodland, Evendo). ✅ **SG-2** — Woodland
Bellower · Altar of the Brood · Skullclamp shipped (+6 with riders; 6/6 killed). ✅ **SG-3** — the
Altars pay for real (+3; 7/7 killed; the payment planner's dropped cost riders fixed). ✅ **SG-4** —
Jaheira's token mana grant (+1). ✅ **SG-5** — Geier Reach Sanitarium + Lore Broker (the each-player
loot sentence, +2). ✅ **SG-6** — Elvish Spirit Guide (an exile-from-hand mana source; Simian rides, +2).
✅ **SG-7 + SG-8** — Altar of Dementia (the activated sac branch now stamps the sacrificed creature's LKI;
a sacrificed-power mill form) and Dosan (an own-turn cast lock at the instant-speed gate, symmetric; +2,
6/6 killed). ✅ **SG-9 + SG-12** — Evolutionary Leap (the reveal-until-creature frame's INTO-HAND sibling)
and Homeward Path (a mass "each player gains control of all creatures they own" reset; Vivien, Nature's
Avenger and Trostani Discordant rode the same two sentences; +4, 6/6 killed). ✅ **SG-10 + SG-11** —
Peregrin Took (a passive "+1 Food per token event" replacement at the one token-enter chokepoint) and
Frenzied Baloth ("Combat damage can't be prevented" — the fog latch, every printed/attached wall, the counter
shields, the floating shields and the prevent-style replacement ops all inert for COMBAT damage; +2, 7/7
killed). ✅ **SG-13** — Vexing Bauble (the dispatcher now knows whether mana was spent; a "no mana was
spent to cast it" intervening-if; "counter that spell" on a cast trigger — rewritten at the trigger
splitter so a spell's own "counter that spell instead" can never borrow it; Hesitation, Lunar Force and
Jace's emblem rode along; +4, 8/8 killed). ✅ **SG-14** — Allosaurus Shepherd (the colour axis of the
"…spells you control can't be countered" family, enforced where counter targets are enumerated; a
subtype-filtered base-P/T set with a same-turn Dinosaur add, collapsed ahead of the " and " split; +1,
8/8 killed — and a fixture typed from memory caught by the flip-diff: the card prints "other CREATURE
types"). **Deck 83/100.** What remains on her deck: Sylvan Library (a pending-choice stack), Boseiju's
channel (three pieces), and the multis/parks in §6 — every one a multi-slice program or a park, so per
Colton's order the walk moves to stage ④ (the corpus) from here.

Stored 09-02 on Colton's profile (100/0 unresolved). **67/100**: 14 native-mana · 10 native-spell ·
5 native-trigger · 4 native-activated · 5 native-static · 1 native-mana-aura · 6 native-mixed ·
22 land · **9 land-partial · 21 body-only · 2 arbiter-spell · 1 arbiter-pw**.

1. **The commander.** The Unbeatable Squirrel Girl is `body-only`. Probe her FULL oracle first (the
   intake read truncated her second ability). Ability 1: "Do You Like Squirrels? — Whenever ~ enters or
   attacks, create a 1/1 green Squirrel creature token." (an enters-OR-attacks disjunction — the Wise
   Mothman split shape exists). Ability 2: "I LOVE Squirrels! — …" (read it). Make her native; a Joe-deck /
   Colton-deck commander flipping is the highest-value single card on the shelf.
2. Stage ② should already have taken most of the 9 partial lands (Cavern of Souls, Boseiju ×2, Evendo,
   Shifting Woodland, Urza's Saga, Gemstone Caverns, Deserted Temple, Urza's Cave…). Re-measure.
3. Then the 24 real cards by ablation (probe → the cheapest single-blocker first). Intake gap buckets:
   8 ETB triggers (Altar of the Brood, Endurance, Itlimoc, Invasion of Ikoria, Tezzeret Cruel Captain,
   The One Ring…) · 4 unclassified (Disruptor Flute, Dosan, Evolutionary Leap, Frenzied Baloth) · Archdruid's
   Charm · Tempt with Discovery · Duskwatch Recruiter · Sylvan Library · Skullclamp · Vexing Bauble.
4. **DONE ③:** `measure-coverage.mjs squirrel` reads **≥90**, or the remaining residue is named as
   ceiling-class in §6 with the honest number.

---

## §4 STAGE ④ — the corpus grind
Only after ①–③'s DONE lines are met. Boot from the vault's `memory/orders/cindy-corpus-roadmap.md`
(WHAT/WHY/ORDER) + the repo's `RESIDUE-GRIND-RUNBOOK.md` (HOW): fresh census, largest clause family with
existing machinery first, vein doctrine — build systems, register cards.

---

## §5 THE PER-SLICE DISCIPLINE — never skip a step (SHELF-TAIL-PLAN §2, plus what 09-02 re-taught)

probe (print the FULL oracle + which line blocks — half the "gaps" are one missing arm on machinery that
exists) → build the smallest honest arm → **flip-diff by tier snapshot** (audit every gained row
whole-card; a LOST row is the whole point) → **witness file** with seen-to-fail controls → **mutations**
(`false &&` each arm; the named test must die; restore) → **ONE sequential lint + FULL suite, exit codes
unpiped** → RUN-LEDGER + CHANGELOG → measure the deck(s), update SHELF-TAIL-PLAN + WAKE-REPORT → commit,
push, **CI green (`gh run list`) before the next push**. THE CREED: false-negative SAFE, false-positive
FORBIDDEN. Stale MUST-STAY-LOW pins that flip are GRADUATED with the date + a surviving guard-class control.

**The 09-02 traps — each cost real time today, none may recur:**
1. **Never script a rewrite whose payload contains a regex escape.** `\b` became a literal 0x08 byte
   TWICE through the python/heredoc path; the source LOOKED right and matched nothing. Use the Edit tool
   for anything with a backslash. After any scripted edit: `grep -c $'\b' <file>` must print 0.
2. **Encode before opening for write, or temp-then-rename.** `open(p,'w')` truncates BEFORE the encode
   error throws — it zeroed two tracked files today (git restored them). Emoji as literals, never `\uD83D`.
3. **A mutation is not a mutation until you have SEEN it applied.** A `sed` that failed on `{}` left the
   source untouched and the suite passed — that is not a gate. Assert the match count. A "no tests" result
   is a LOAD ERROR, not a gate result — redo it with valid syntax.
4. **Full suite after every slice, never the targeted run alone.** Three stale-pin classes today were
   caught ONLY by the full suite.
5. **Chain verification steps with `;`, never `&&`.** `grep -c … && npx eslint .` reported LINT_EXIT=1 when
   grep found zero matches — lint never ran.
6. **A surviving mutation gets one of three answers, always written down:** DOCUMENT it (a live early exit
   that is real but redundant — CAP14 M4) · DELETE it (unreachable or duplicated — CAP15 M2, CAP16 M2) ·
   **WRITE THE MISSING TEST** (a real behaviour nothing asserted — CAP16 M4, the log). Never ignore it.
7. **COMMS feed:** every card PARKED gets a terse line in `memory/COMMS.md`, anchored on the exact
   `## LOG (newest first)` line (never on another agent's entry), then `sync-brain.cjs`. Flips need no line.
8. **Dates:** stamp entries with the real date (`date`). The 08-30 stamps on today's ledger entries are a
   known drift (the box's clock read 09-02); do not propagate it.
9. **Deck writes go through the app's own API** (`POST /api/decks`, server at 127.0.0.1:3000, `createBackup:
   true`), never a direct AppData write — Claude Desktop is MSIX-packaged and direct writes land in a
   private mirror the app never sees.
10. **A gate with no carrier in its own witness is unproven — when a mutation survives, first ask whether
    ANY fixture reaches the line.** LANDS-1's M7 (the reader's parseable gate) survived not because the gate
    was dead but because the park fixture's sentence shared a line with a preceding sentence, so the
    LINE ANCHOR refused it before the gate ran. The fix was a fixture that is refused ONLY by the gate
    (a single-line unreadable condition) plus a readable positive control. Write the carrier, re-run,
    then record the kill. Sibling of trap 6: the survive → document / delete / test decision needs the
    "does anything even reach it?" question answered first.

---

## §6 PARKED / NEEDS COLTON (append as you go — this is the morning report's raw material)
- Squirrel Girl's Archidekt URL — not captured; the deck does not survive a box move until it is.
- **Cap America (84/100) — every remaining card is multi-piece or a park:** Uthros, Titanic Godcore ·
  Station (a keyword subsystem — a charge-counter station action + a threshold-unlocked ability); Urza's
  Saga (Saga chapters on a land); Hydroelectric Laboratory / Soporific Springs (MDFC backs); Illusionist's
  Bracers (an "ability … is activated" trigger event + a copy-ability lane, neither exists); Iron Man
  (three pieces: a "noncreature artifact" optional-sac filter, a MV = sacrificed+1 relational tutor, an
  ARTIFACT battlefield-tutor admission); Teferi's Protection / We Say Thee Nay! (arbiter spells). Unpark =
  each is its own multi-slice program; none is one word.
- **Land tier (stage ②) parks, ≥3 carriers:** bands (5 — "bands with other legendary creatures", a retired
  keyword); the Overlooks' reflexive "When you do … and you gain 1 life" tail (5 — the typed-basic fetch is
  fixed, the reflexive-with-rider shape is not); Station (2). Every other family with ≥3 carriers shipped.
- **Squirrel Girl (77/100) parks:** Gemstone Caverns (an opening-hand replacement — no pre-game seam);
  Shifting Woodland (becomes a copy of a graveyard permanent card); Evendo, Waking Haven (Station); the
  multis: Cavern of Souls (choose a creature type + an uncounterable-creature-spell mana source), The One
  Ring, Endurance (evoke is not modeled), Disruptor Flute, Shang-Chi, Tezzeret, Urza's Saga, and the X-spells
  (Genesis Wave, Finale of Devastation, Green Sun's Zenith, Chord of Calling, Archdruid's Charm, Nature's
  Rhythm, Tempt with Discovery). Mediums still open: Sylvan Library (a pay-4-life-or-put-back pending
  choice — its own pending-choice stack, a full slice), Boseiju's channel effect (destroy + the opponent's
  basic-typed search + a legendary-count cost reduction — three pieces). (Shipped since this line was first
  written: Elvish Spirit Guide SG-6, Altar of Dementia SG-7, Dosan SG-8, Evolutionary Leap SG-9, Peregrin
  Took SG-10, Frenzied Baloth SG-11, Homeward Path SG-12, Vexing Bauble SG-13.)
- **Two engine holes found and FIXED tonight, worth a human eye on old harness data:** (a) the payment
  planner never carried cost riders — a planned Molt Tender tap exiled nothing until SG-3; (b) a played
  Vivid/depletion/Gemstone land arrived with no counters until LANDS-9. Any self-play game before tonight
  that involved those cards under-paid.
- (append here: card · blocker · why it parks · what would unpark it)

## §7 WHAT THE MORNING REPORT MUST CONTAIN
The three stage numbers (Cap %, land-partial corpus count before/after, Squirrel Girl %), every slice
shipped (SHA + card + tests), every park in §6, every trap that fired, and the suite/CI anchor. Facts
exact; the voice wraps them.
