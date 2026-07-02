# Corpus-lever build specs — adversarially FP-verified (workflow wf_ddad8446, 9 opus agents, 2026-07-02)

> Code-complete, refute-panel-verified build specs for the scouted corpus levers. Each was designed (opus),
> adversarially refuted (opus, tried to find an FP), then synthesized. Build serially through the CREED battery
> (shared files: parser.js / pendingChoice.js / effectAtoms.js / runProgram.js / learnSession.js / atoms/stack.js).
> All mirror the shipped `optional-mana-payment` / `optional-sac-payment` / `matchOptionalSacBySubtype` siblings.

## STATUS — ALL SHIPPED ✅ (batch complete, PR #383, 2026-07-02)
- ✅ **attacked-this-turn-interveningif** — SHIPPED (commit 69071b3, +12 native).
- ✅ **draw-then-discard-reflexive** — SHIPPED (a715b6e, **+11** native, spec said 9). FIX A (parse payoff under literal "Instant") was load-bearing exactly as flagged.
- ✅ **optional-discard-payment** — SHIPPED (65ea409, **+15** native, spec est. 32; the rest were already native or have non-draw/token payoffs). ⚠️ **SPEC DEFECT the refute panel missed:** §2 said parse the payoff under `cardType` — that drops all 30 draw-payoff flips (the draw atom's legacy gate is Instant/Sorcery-only). Fixed to literal "Instant" (same as draw-discard FIX A). Any future "payoff-under-cardType" spec for a draw payoff has this bug.
- ✅ **upkeep-sac-unless-pay** — SHIPPED (98a8022, **+20** native, spec said 15; incl. 5 granted-ability cards — Kataki/Aura Flux/Energy Flux/Pendrell Mists/Magus of the Tabernacle — each affected permanent sacs ITSELF via ctx.sourceId). The canAfford-arity crash fix applied as specified + pinned by an autoPick unit test. Required updating a parser.test.js FP-guard (the "sacrifice this creature unless you pay {2}" MUST-STAY-LOW pin → now a MUST-BE-HIGH pin).

**Session total (post-overhaul grind, 2026-07-02): +46 native across the 3 levers, LOST=0 each, all on PR #383.**

Two durable lessons: (1) the "parse payoff under literal Instant" trick is MANDATORY for any optional-payment fold whose payoff can be `draw` — mirror matchOptionalDrawDiscard/matchOptionalDiscardPayment. (2) refute panels can miss a cardType/Instant gating bug because the token-payoff sample passes while the draw-payoff sample (the bulk) fails — always probe a DRAW payoff on a creature cardType when reviewing these specs.

---

## 2. `optional-discard-payment` · 32 flips · **BUILD-CLEAN** (refute: CLEAN, all 4 vectors held)
Mirror `optional-sac-payment` (matchOptionalSacBySubtype @ parser.js:1689 + dispatch @ ~1918; applyOptionalSacPayment @ stack.js:514; setPendingOptionalSacBySubtypeChoice @ pendingChoice.js:349; autoPickOptionalSac @ runProgram.js:692 + resolveOptionalSacChoice @ 764; learnSession settle:533 / driver:1190 / apply:1801 / dispatch:2123).
- **parser.js ~1689** — `matchOptionalDiscardPayment(oracle, cardType)`. Regex `^you may discard a card\.\s*if you do,?\s+(.+)$/i`; reject a 2nd `if you do` / `otherwise`; parse payoff `parseEffectClauseImpl(payoffText, cardType, {hasX:false})`; require HIGH + non-modal + not-xSpell + every atom KNOWN + `!programNeedsChosenTarget`. **32-flip guard:** `if (inner.some(a => PAUSING_ATOM_OPS.has(a.op))) return null;`. Emit `{op:"optional-discard-payment", effectAtoms:inner, targetType:null}`.
- **parser.js ~1918** — dispatch block PRE-SPLITTER (mirror the osp block), guard `KNOWN.has(odp.atom.op)`.
- **pendingChoice.js:42** — add `"optional-discard-payment"`; **~349** — `setPendingOptionalDiscardPaymentChoice({controller, available, effectAtoms, sourceName})`.
- **atoms/stack.js:8** — add setter to import; **~514** — `applyOptionalDiscardPayment` (compute `available = hand.some(c=>!c.token)`, token filter mirrors hand.js:62); **stack.js:710** stackResolvers — register `"optional-discard-payment"`.
- **effectAtoms.js:95** PAUSING_OPS_LIST — add `"optional-discard-payment"`.
- **runProgram.js ~692** — `autoPickOptionalDiscard` (discard iff available); **~764** — `resolveOptionalDiscardPaymentChoice`. **32-flip simple path:** decline/empty→nothing; discard→run payoff after the cost-discard settles via `resolveDiscardChoice`'s existing `resumeAfterChoice` (NO outerResume).
- **learnSession.js** — import autoPickOptionalDiscard (:50); settleOptionalDiscardChoice (~533); driver branch (~1190); applyOptionalDiscardChoice (~1801); dispatch (~2123).
- **Do NOT hand-edit KNOWN** — `KNOWN = new Set(Object.keys(ATOM_RESOLVERS))`; registering in stackResolvers auto-adds the op.
- **FP guards:** `^you may discard a card\.` anchor · `if you do` not `if you don't` · payoff HIGH gate · `programNeedsChosenTarget`→null · `otherwise`→null · pausing-payoff→null.
- **MUST_DROP near-misses:** `…discard a card at random…` · `…discard two cards…` · `…If you don't, sacrifice this creature…` (Lim-Dûl's) · `…put a +1/+1 counter on that creature…` (Olivia) · `…return target instant or sorcery…` (Toph) · no-"you may" form.
- **Flips (32):** Keldon Raider, Academy Raider, Rank Officer, Wandering Champion, Boundary Lands Ranger, Furyblade Vampire… (payoffs: 30×draw, create-token, pump).
- **Tests:** MUST_STAY_HIGH `you may discard a card. If you do, draw a card` / `…draw two cards` / `…create a 2/2 black Zombie…`; sibling regression pins; MUST_DROP the 6 near-misses. Runtime: hand>1 discard→pick→draw · decline→no draw · empty-hand→no draw.

## 3. `draw-then-discard-reflexive` · 9 flips · **BUILD-CLEAN** + 2 MANDATORY FIXES
Mirror `matchOptionalSacBySubtype` + optional-mana-payment.
- **parser.js ~1689** — `matchOptionalDrawDiscard(oracle, cardType)`. Regex `^you may draw (a card|\w+ cards?)\.\s*if you do,?\s+(discard (?:a|an|one|two|three|four|five|\w+) cards?)$/i`.
  - **⚠️ FIX A (load-bearing):** compose `${drawText}, then ${discardText}` and parse under literal `"Instant"`, NOT `cardType` — the draw atom's legacy gate returns HIGH only for Instant/Sorcery; passing the card's own type = LOW → zero flips. A reviewer "fixing" this to match siblings breaks everything.
  - Require `inner.length===2 && inner[0].op==="draw" && inner[1].op==="discard"`, `inner[1].who` unset-or-`"controller"`, all KNOWN, `!programNeedsChosenTarget`, last-atom-only-pause. Emit `{op:"optional-draw-discard", effectAtoms:[draw,discard], targetType:null}`.
- **⚠️ FIX B (fails closed as designed):** the pendingChoice setter must store `effectAtoms:[draw,discard]` only (the settle reads `pc.effectAtoms`; a `drawAtom`+`payoffAtoms` split → DRAW branch runs empty → no draw/discard).
- Wiring: stack.js:8 import + ~514 applyOptionalDrawDiscard + :710 register `"optional-draw-discard"`; effectAtoms.js:95 PAUSING_OPS; pendingChoice.js:42 + ~349 setPendingOptionalDrawDiscardChoice; runProgram.js autoPickOptionalDrawDiscard + resolveOptionalDrawDiscardChoice (draw→run [draw,discard], last-pause chains onto continuation; decline→nothing); learnSession settle/driver/apply/dispatch.
- **MUST_DROP:** `…discard a card unless this creature entered this turn` (Moon-Circuit Hacker) · `…each opponent discards a card` · `…discard your hand` · a chained 2nd reflexive · once-per-turn rider (Academy Wall, Duelist of the Mind).
- **Flips (9):** Riddlesmith, Murder of Crows, Skyswimmer Koi, Shoal Kraken, Rook Turret, Jeskai Elder, Lamplighter of Selhoff, Surge Mare (→native-mixed), Izzet Keyrune (→native-mana).
- **Tests:** MUST_STAY_HIGH `you may draw a card. If you do, discard a card` / `…draw two cards…`; MUST_DROP the near-misses. Runtime: DRAW→loot+discard pause · DECLINE→hand/library UNCHANGED, no discard pause (cardinal CREED).

## 4. `upkeep-sac-unless-pay` · 15 flips · **BUILD-WITH-FIX** (confirmed crash — fix first)
Echo-without-the-keyword. Mirror optional-mana-payment (matchOptionalManaPayment / resolveOptionalManaPaymentChoice, inverted polarity: pay+afford→nothing; else→sacrifice-self).
- **parser.js ~1636** — `matchUpkeepSacUnlessPay` + `SAC_UNLESS_PAY_NOUNS` allowlist. Regex `^sacrifice this(?:\s+([a-z]+))?\s+unless you pay\s+(\{[^}]+\}(?:\{[^}]+\})*)$/i`; `parseFixedManaPips(pips)`→null on `{X}`; emit `{op:"sac-unless-pay", cost:{kind:"mana",mana}, targetType:null}`.
- **parser.js ~1821** — dispatch PRE-SPLITTER (**critical:** else bare `sacrifice this creature` hits sacrificeEdictClauseParser removal.js:270 → unconditional self-sac, drops the escape = cardinal FP).
- Wiring: stack.js:8 import setPendingSacUnlessPayChoice + ~498 applyUpkeepSacUnlessPay + :706 register; effectAtoms.js:83 PAUSING_OPS; pendingChoice.js:41 + ~347 setPendingSacUnlessPayChoice; runProgram resolveSacUnlessPayChoice (pay+afford→nothing; else→sacrificeCreatureEffect(ctx.sourceId)) + autoPickSacUnlessPay; learnSession import/settle/driver/apply/dispatch.
- **⚠️ MANDATORY FIX (crashes every AI-resolved instance):** the design's `autoPickSacUnlessPay` had wrong `canAfford` arity → `sources.map is not a function`. Write: `return canAfford(state.players[pc.controller].manaPool, manaSources(state, pc.controller), pc.cost.mana || {});` and import `manaSources` (runProgram.js:31). Mirror runProgram.js:632-637. **Add an autoPick unit test (affordable→true, empty→false) — the crash path the design never exercised.**
- **MUST_DROP:** `unless you pay {X}` · Draco's `{10}. This cost is reduced by {2} for each…` · `…{U}{U}, then draw a card` · `sacrifice a creature unless you pay {2}` (not self).
- **Flips (15):** Phantasmal Forces, Spindrift Drake, Whipstitched Zombie, Breeding Pit, Child of Gaea, Drifting Djinn…
- **Tests:** MUST_STAY_HIGH `sacrifice this creature unless you pay {U}` / `{1}{W}` / `{W}{U}`; MUST_DROP `…{X}` / Draco / not-self. Runtime: PAY-affordable→survives · DECLINE→sac · PAY-unaffordable→sac.
