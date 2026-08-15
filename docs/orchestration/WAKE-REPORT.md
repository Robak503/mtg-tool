# WAKE REPORT — live resume anchor

> **THE ANCHOR'S OWN RULE (2026-08-01, Colton).** A new chat boots off this file, so the heading and the
> first section after the state line always name **runnable work**. Anything blocked on Colton, or on
> another seat, goes BELOW, under a ⏸ heading that says so in its title. A seat booting on this file must
> be able to start inside a minute without asking a question first. The 08-01 entry originally led with a
> decision that needed Colton's yes — a booting seat had nothing it could act on until it read to the
> bottom. Do not lead with a question again.

## 🌙 2026-08-15 EVENING — **FOURTEEN slices · v0.159.0 LIVE · 13 decks at bar · TEVAL 79→85** — suite **1254 / 14,685** green

> ### ⏭ RUNNABLE NOW — the Teval vein (15 residue; all shipped work pushed + CI green through 08752d55)
> · **THE SHARED SEAM NEXT — the MILLED-REFERENT pick** serves TWO residue cards in one build:
>   Ripples of Undeath ("put a card from among THOSE [just-milled] cards into your hand" behind the
>   pay-{1}-and-3-life compound cost — the banked two-piece design below) AND Six ("you may put a
>   LAND card from among them into your hand" on the attack mill — no payment, just the pick). The
>   mill atom must stamp its milled ids into ctx/resume; the pick is a choice over that set (the
>   tutor-picker pattern). Build Six FIRST (no payment half) → then Ripples adds only the life-rider
>   cost on the optional-mana-payment atom.
> · Then: Court of Cunning (monarch ETB modeled; the upkeep any-number-of-target-players mill with
>   the monarch-conditional 10× count is the gap) · the ETB bucket (Titania, Overlord of the
>   Balemurk, Animate Dead — heavy) · Tasigur · Ardyn · Breach the Multiverse · Teval's Judgment ·
>   Toxic Deluge (the X-life sweep).
> · **Today's fourteen** (all full-discipline, all CI green): Swat retarget · Sarkhan-FB ·
>   Rivaz · Rith (Dragons→90) · Atzocan · Heirloom (Jurassic→90) · Tortured Existence (+17) ·
>   Teval herself · Molt Tender · Undead Butler (the optional-exile-self pause kind, 8 wiring
>   points) · Tormod (+12 tapped tokens) · Bloodghast (the landfall GY scan) + v0.159.0 + the
>   abBench wall measured honest (60s, the evidence in the test).
> · Batch **+37** post-tag. Colton's standing ask: grind ALL decks to 90 and call the ceiling when
>   the residue is genuinely unbuildable-class. Below the bar: Teval 85 · Wolverine 79 ·
>   Believe it! 79 · Kinnan 77 · Otharri 74 · Kellan 74 · Cap 73 · Halfshell 67 · Shalai 67.

## ☀️ 2026-08-15 — **🐉 DRAGONS AT 90 (the 12th deck) · QUARTET P3+P4 COMPLETE · batch +98 → v0.159.0 tags on CI green** — suite **1249 / 14,658** green

> ### ⏭ RUNNABLE NOW
> · **Tag v0.159.0 once afec8481's CI lands green** (`git tag v0.159.0 -a -m "Release v0.159.0" && git push origin v0.159.0`),
>   then verify the release workflow (~20-30 min). The +98 batch: Deflecting Swat's RETARGET machine
>   (CR 115.7) · Sarkhan Fireblood native-planeswalker + the fixed-amount restricted add · Rivaz's
>   graveyard-recursion machine (castFromZoneOnly + the dies-exile grant) · Rith's excess-damage
>   ledger + granted ward {N} (Dragons 89→90) · Atzocan's subtype GY return (+10) · Quartet Phase 3
>   (auditor always-on under tests + seeded replay) · Phase 4 (the restricted sub-pool, three
>   consumer classes) · TWO metric holes closed honestly (measure-coverage dropped `loyalty`;
>   manaCardResidueModeled never checked activated residue — 87 over-claims purged, runtime unchanged).
> · ✅ **Jurassic RE-CLOSED at 90 (Herd Heirloom shipped c5516947)** — 13 decks at the bar.
> · **TEVAL 79 IS THE NEXT VEIN (probed 08-15)**: ① Tortured Existence — the "Discard a creature
>   card" ACTIVATION-COST item is the only gap (the return effect + {B} parse; parseAbilityCost needs
>   the discard-cost item + payment pick). ② Teval herself (Joe-deck commander = the win): attack
>   mill-3 is modeled; needs the optional GY-land-to-battlefield-tapped tail + the LEAVE-GRAVEYARD
>   batch event ("whenever one or more cards leave your graveyard" — a new watcher class; every
>   GY-exit site funnels through moveCardToZone/recordGraveyardEvents — probe that chokepoint first).
>   ✅ SHIPPED so far down this vein: ① Tortured Existence ca6ec474 (+17) · ② TEVAL HERSELF f9259d35
>   (native-trigger — the article-form pickFromGraveyard land reanimate closed her; both triggers
>   pre-detected) · ④ Molt Tender 8d8253bd (the phantom-gate carve, both halves pay). **Teval 82.**
>   NEXT: ③ UNDEAD BUTLER — FULL BLUEPRINT (a 6-file pause-kind slice, all templates named):
>   the dies effect "you may exile it. When you do, return target creature card from your graveyard
>   to your hand" — both triggers already detect; matchOptionalReflexiveTrigger (parser ~1607) rejects
>   it only because "exile it" parses LOW. ⛔ NOT the α2/reflexiveGate route: if the dead card leaves
>   the GY during the pause window, take→no-op-exile→payoff-still-runs = a free return (FP). The
>   honest model is the PAUSING-PAYMENT pattern (availability re-checked at settle):
>   ① triggers.js ~6087: stamp diesCtx.triggeringCardId = d.card.id (additive+inert).
>   ② a whole-clause matcher beside matchOptionalReflexiveTrigger: /^you may exile it\. when you
>     do, (.+)$/ → { op:"optional-exile-self-payment", effectAtoms, targetType: lifted } with the
>     optional-mana-payment arm's THREE gates (parser ~1393: all KNOWN · ≤1 chosen targetType lifted
>     onto the wrapper for flush-time enumeration · no non-last PAUSING_ATOM_OPS) + stamp
>     excludeTriggeringCard on any graveyardCard payoff atom (the dead card never targets itself).
>   ③ applier (zones.js): availability = ctx.triggeringCardId present in its owner's graveyard NOW;
>     pause carries { controller, available, effectAtoms, cardId, targets: ctx.targets }.
>   ④ pendingChoice.js: the kind (register at ~48) + setter (setPendingOptionalDiscardPaymentChoice
>     at 582 is the template).
>   ⑤ runProgram settler (resolveOptionalDiscardPaymentChoice at 1537 is the template): on pay,
>     RE-SCAN the card in its owner's GY (CR 603.6e), move GY→exile (the exileGrantedDead move
>     shape), then run effectAtoms with pc.targets; decline/absent → nothing (no payoff without the
>     paid cost — the cardinal guarantee).
>   ⑥ learnSession: the three sites (auto-decide ~2104 · the settle fn ~872 region, mirror
>     settleOptionalDiscardChoice · the human panel label ~3774). ⑤ RIPPLES OF
>   UNDEATH — DESIGN BANKED: the firstMain trigger detects; the tail "you may pay {1} and 3 life. If
>   you do, put a card from among those cards into your hand" needs TWO pieces on the
>   optional-mana-payment machinery (stack.js ~909, settler-based, effectAtoms/elseAtoms ride the
>   pause): (a) a LIFE RIDER on the cost ("{1} and 3 life" — add costLife to the atom + charge it in
>   resolveOptionalManaPaymentChoice beside payManaCost), (b) the MILLED-REFERENT pick payoff ("those
>   cards" = this trigger's own mill — the mill atom must stamp the milled ids into ctx/resume, and
>   the payoff is a pick-a-card-to-hand choice over that set, the tutor-picker pattern). Then the ETB
>   bucket (Court of Cunning, Titania, Bloodghast, Overlord of the Balemurk…).
> · **The honest shelf** (post-purge): 12 at bar (Slivers 100 · Vihaan 96 · Omnath 93 · Zaxara 93 ·
>   Mothman 91 · Earth Bent 91 · cdh 91 · Rashmi 90 · Hulk 90 · Veyran 90 · **Dragons 90** · Jurassic
>   89→next). Below: Teval 79 · Believe it! 79 · Wolverine 78 · Kinnan 77 · Otharri 74 · Kellan 74 ·
>   Cap 73 · Halfshell 67 · Shalai 67.
> · Quartet tails (the plan file ledger is current): Phase 1 flip awaits a policy that beats the
>   tightened gate (the --diagnose loop exists); Phase 2 tail = evalScores on pending-window rows.

## ☀️ 2026-08-14 — **🚀 v0.158.0 CUT (the +94 batch) · 🏁 Rashmi at bar · batch resets +0** — suite **1216 / 14,485** green

> ### ⏭ RUNNABLE NOW — post-release
> · **Verify the release run finishes green** (workflowName "release" on v0.158.0 — ~20-30 min; if it
>   fails, fix the pipeline before anything else).
> · **The grind continues, new batch**: Jurassic 86. **MARAUDING RAPTOR, DESIGN REFINED (build next)**:
>   the trigger detects (etb/otherCreatureYouControl), "deals 2 damage to the triggering creature"
>   parses HIGH (the sentinel site at triggers.js ~4323 rewrites that-creature forms on
>   ETB_ENTERING_CREATURE_SCOPES — extend it with "to it" → "to the triggering creature"). The rider
>   "If a Dinosaur is dealt damage this way…" MUST honor prevention (PV-1 shields consume in
>   applyDamageEffect and SKIP the damagedBy mark) — so the honest condition reads the triggering
>   permanent's `damagedBy` (contains this source) AND its Dinosaur subtype, as a new interveningIf
>   predicate behind a sentinel phrase; thread triggeringPermanentId into applyConditional's context
>   (it passes only sourcePermanentId today — effectAtoms.js ~178). The conditional atom (branchOn,
>   NOT condition — the field-name trap is documented in-function) runs the self-pump branch.
> · Dragons 80: Terror of the Peaks parks ONLY on the target-tax static ("spells targeting this cost
>   3 life more" — a new framework, banked). Then Believe it! 79, Hulk Smash 79, Wolverine 78,
>   Kinnan 77, Teval 76, the rest.
> · **NEXT BUILD BANKED — Betor, Kin to All (Dragons 80)**: the end-step trigger with THREE sequential
>   toughness-threshold conditionals (total toughness 10 → draw · 20 → untap team · 30 → probe the
>   third). Pieces: ONE new interveningIf predicate ("creatures you control have total toughness N or
>   greater" — a layer-aware toughness SUM, the powerAtLeast pattern) + the sequential conditional fold
>   (the Bonehoard two-conditional template). Jeska COMMITTED locally (e5601c67) — push when b902522d CI
>   lands, then re-measure Hulk + Cap America. Parked with reasons: Rith (excess-damage tracking),
>   Sarkhan Fireblood (restricted-spend mana), Ancient Brass Dragon (d20 reflexive mass-reanimate).
> · 🏁 **JURASSIC RAMP AT THE BAR: 90/100 (Savage Order landed — the SECOND deck under the order).**
>   Eleven remain: Dragons 80 · Hulk Smash 80 · Teval 79 · Believe it! 79 · Wolverine 78 · Kinnan 77 ·
>   Kellan 74 · Otharri 74 · Cap America 73 · Halfshell 68 · Shalai 66. Next closest: Dragons/Hulk at
>   80 (ten flips each) — probe their parked veins fresh; the cross-deck staples (Jeska's Will in
>   BOTH Hulk+Cap, Teferi's Protection in THREE decks) are the multipliers.
> · (superseded) 🎯 **JURASSIC AT 89 — SAVAGE ORDER IS THE BAR CARD (Bonehoard SHIPPED cc09d6f9).** The precise
>   six-site design: ① SAC_COST_RE (effects/castModifiers.js ~152) doesn't admit "with power 4 or
>   greater" — add the qualified branch → { kind:"sacrifice", sacType:"creature", minPower:4 };
>   ② enforce minPower at the victim enumeration (legalChoices.sacTypeMatches call sites, e.g. ~845 —
>   layer-aware creaturePower ≥ N) AND wherever the dispatcher validates the paid victim; ③ widen the
>   bfm battlefield-tutor admission (atoms/library.js ~1963) with a guaranteed-CREATURE arm
>   (filter.groups.every(g => g.includes("creature")) — ["dinosaur","creature"] qualifies; the
>   destination:"battlefield" resolver already enters via enterCardFromZone with ETBs); ④ the "It
>   gains indestructible until end of turn" rider → a fetchedGrants field on the tutor atom, applied
>   at resolveTutorChoice's battlefield entry as a UEOT addKeyword continuous effect; ⑤ the fold
>   binding the rider sentence to the tutor; ⑥ witnesses: the cost refuses a 3-power victim, the
>   fetched Dino enters WITH indestructible UEOT, the tutor pauses for the pick. Landing it = JURASSIC
>   AT THE BAR (the second deck) — record the milestone.
> · **JURASSIC'S LAST TWO — designs banked (2026-08-14 late; ALTISAUR SHIPPED 8ccc0db6, Jurassic 88)**:
>   ① **Bonehoard Dracosaur** — the upkeep impulse-2 parses HIGH ALONE; the parkers are the two "If
>   you exiled a <land/nonland> card this way" riders. Build: the impulse-exile resolver stamps
>   { exiledLandThisWay, exiledNonlandThisWay } (a per-resolution state marker, the drainDelayed
>   pattern), two interveningIf predicates read the stamp, a parser fold emits [impulse-exile,
>   conditional(land→the 3/1 Dino token), conditional(nonland→self +2/+2)]. ② **Savage Order** — three
>   lows: the power-qualified sac additional cost ("power 4 or greater" — check the γ1b victim
>   vocabulary), the Dinosaur battlefield tutor (check parseTutorFilter('dinosaur creature')), and the
>   fetched-permanent "It gains indestructible" rider (the tutor-referent bind). Either flip + one more
>   puts Jurassic AT THE BAR (88 → 90 needs two).
> · **TEMPLE ALTISAUR DESIGN (banked 2026-08-14)**: "If a source would deal damage to another Dinosaur
>   you control, prevent all but 1 of that damage." A BOARD static (not attached — the Gaseous Form
>   class in combatEvasion.js is per-attachment), subtype-scoped with a FLOOR: needs ① a static reader
>   ("prevent all but N of that damage to <subtype> you control", source-excluding "another") ② consult
>   in BOTH damage funnels (applyDamageEffect's creature hit ~spellEffects:1320 AND combatResolution),
>   capping dealt to N ③ the classify registry entry. Note: the cap must NOT stamp damagedBy beyond
>   what actually lands (the Raptor rider reads it). Batch progress since v0.158.0: **+17**.
> · **KINNAN DRILL SCOUTED (2026-08-14 late)**: Wolverine's five remaining are ALL machines (kicked
>   modal, fight+delirium, fight+excess-to-mana, the modified predicate, the Ozolith transfer) — parked
>   with reasons. Kinnan's best two: **Elvish Spirit Guide** ("Exile this creature from your hand: Add
>   {G}") — needs a HAND-EXILE mana-source lane: manaSources reads battlefield only (manaModel.js
>   ~1300; its own line-495 comment names the class as deliberately unspent); the build = a
>   handCardId source entry + planPayment pays it + commitPaymentPlan exiles it. Determinism-critical
>   planner — build fresh, witness that an unspent guide STAYS in hand. **Moonsilver Key** — the tutor
>   filter "artifact card with a mana ability or a basic land card": compose the filter from the
>   manaModel's own recognizer (isArtifact && parseable-mana-ability) || basic land. Both moderate.
> · **RAPTOR SHIPPED (a5894539, +2 with Aether Flash — Jurassic 87).** Descendants' Path probed: the
>   trigger detects with the full three-sentence effectClause; the parker is the REVEAL-CONDITIONAL
>   FREE CAST ("you may cast it without paying its mana cost" — matchRevealTopConditional handles
>   put-routers only, not casting) + the shares-a-creature-type predicate. A real machine slice:
>   the freeCast.js lane (cascade/discover) is the casting half's home; the predicate wants a
>   board-scan against the revealed card's subtypes. Etali, Primal Storm shares the machine class.

## ☀️ 2026-08-14 (earlier) — **batch +89 · 🏁 TEST RASHMI HITS THE BAR (90%)** — suite **1215 / 14,481** green

> ### ⏭ RUNNABLE NOW — the shelf queue, exactly where it stands
> · 🏁 **Test Rashmi 90/100 — the first below-bar deck across ≥90 under the standing order** (was 83
>   when it started). Its remaining parked 10 stay banked for the corpus, not the bar.
> · **Twelve decks remain**: Jurassic 85 (closest — drill its parked list next), Dragons 80,
>   Believe it! 79, Hulk Smash 79, Wolverine 78, Kinnan 77, Teval 76, Kellan 74, Otharri 73,
>   Cap America 73, Halfshell 68, Shalai 66.
> · **NEXT SLICE, DESIGN BANKED — Pugnacious Hammerskull** (Jurassic): "Whenever this creature
>   attacks while you don't control another Dinosaur, put a stun counter on it." Five sites, all
>   scouted: ① interveningIf.js ~1168 — add `you don't control another (.+)` to the SOURCE-EXCLUDING
>   branch (it already fail-closes without sourcePermanentId); ② triggers.js — carve "attacks while
>   <cond>" BEFORE the blanket while-reject (~915), emitting the attacks event + `attacksWhileIf`
>   ONLY when interveningIfParseable(cond) (else the old reject → Arbiter, FN-safe); ③ the
>   descriptor-threading allowlist (~4487) — list attacksWhileIf or it silently drops (the
>   duringOpponentsTurn lesson); ④ checkAttackTriggers — the FIRE-TIME-ONLY gate via
>   evaluateInterveningIf with {sourcePermanentId} (CR: "attacks while" is part of the trigger EVENT,
>   checked at declaration, NOT re-checked at resolution — do NOT stamp it as interveningIf, that
>   over-suppresses); ⑤ the effect "put a stun counter on it" — the it→"this creature" sentinel on the
>   attacks-self event ("put a stun counter on this creature" already parses HIGH:
>   add-named-counter-self/stun). Witnesses: lone-Dino attack ⇒ stun lands; second Dino out ⇒ silent;
>   the stun counter's untap-replacement consumes it.
> · **Batch +89 of ~100** — cut the release tag after roughly one more slice, per the batching law.
> · Corrected en route: Mjölnir, Storm Hammer is NOT a discard-lane card (attach-ETB + tap-stun attack
>   trigger — its own slice).
> · **Fresh per-deck drills** — the realism gate, latest full read: Test Rashmi 84, Jurassic Ramp 84,
>   Dragons 80, Believe it! 79, Hulk Smash 79, Wolverine 78, Teval 76, Kinnan 76, Kellan 74, Otharri 73,
>   Captain America 73, Halfshell 68, Shalai 66 — all to ≥90 per Colton's standing order (non-stop, he
>   stops it). Colton's own six decks are all ≥90 already.
> · **Shipped since the 08-12 entry**: Karlach + the attacking batch (+5, extra combats enter properly),
>   Palani's Hatcher (+1), X-shaped ETBs (+5, Meathook), Displace (+2), Vedalken Aethermage (+1),
>   Wavebreak Hippocamp (+5), Ghostly Flicker (+1, the exact-two union blink), Laboratory Maniac (+1 —
>   and CR 104.3c deck-out modeled for the first time: sims now really eliminate decked players).
> · **Housekeeping that matters**: CHANGELOG.md had been silently DOUBLED since 954c150e with six
>   slices' bullets fused into the seam — repaired 2026-08-14 (8482 → 4300 lines, 35 bullets rehomed
>   into [Unreleased], structure-gated). Doc-append scripts must gate on structure counts, not "wrote OK".

## ☀️ 2026-08-12 (late night) — **batch +58 · the shelf grind's instruments are proven** — suite **1204 / 14,434** green, master 56b0fc5c

> ### ⏭ RUNNABLE NOW — the shelf queue, exactly where it stands
> · **Karlach, Fury of Avernus (×2 decks: Otharri Test + Hulk Smash)** — the named next: two pieces
>   remain on her attack trigger: the FIRST-COMBAT intervening-if (needs a combatsThisTurn tally —
>   increment at beginning-of-combat, reset at untap — plus the interveningIf arm) and the "They gain
>   first strike until end of turn" rider on the attacker batch (a they→attacking-creatures fold + an
>   attacking-scope keyword pump). "Untap all attacking creatures" and the extra combat ALREADY WORK.
>   Scourge of the Throne + Najeela share pieces.
> · **The cross-deck census** (24 shared parked cards, probed): Halana SHIPPED; parked-with-reasons:
>   Karlach (above), Forgotten Ancient (counter redistribution), Kodama (the "modified" predicate —
>   pays vocabulary), Teferi's Protection/Endurance/Solitude (machines), Mother of Runes (color-choice
>   protection), Thassa's Oracle (devotion-X + win gate), The One Ring (multi-blocked).
> · **The instruments**: measure-coverage <name> per deck · the cross-deck probe (scratchpad) · sole-
>   blocker per-line removal. Joe's nine below-bar decks + 4 test decks are the tail; closest bars:
>   Jurassic Ramp 82, Dragons 80, Believe it! 79.

> ### ⭐ THE DAY'S SYSTEMS (beyond the card slices)
> The PLAY-HINTS LEDGER (decision layer — see its design doc) · EXTRA-COMBAT Increment 3 (the after-
> main insertion; three park-pins graduated as their own comments predicted) · the leading-conditional
> protection FP fix · the Entish cost-skip FP fix · the play-hints byte-identity contract.
## ☀️ 2026-08-12 (night) — **THE PLAY-HINTS LEDGER SHIPPED + the shelf grind is the mode** — suite **1203 / 14,425** green

> ### ⭐ NEW SYSTEM: the AI's decision layer is never blind (docs/orchestration/PLAY-HINTS-LEDGER.md)
> Every card — parked included — carries a derived play role+timing (cardPlayHints.deriveCardRole, 14
> roles, pure printed-text). The ledger file (card-play-hints.json; curated > arbiter > derived,
> curated survives re-warms) overrides per card; `node scripts/warm-play-hints.mjs` re-warms it
> (currently 1,257 cards / 340 parked hinted). The five learn API routes thread it; selfPlayRunner is
> DELIBERATELY unwired (frozen-hash contract). Remains, in the doc: board-aware timing · the Arbiter
> enrichment pass · the verdict-cache source · role growth (utility 503 = the refinement target).

> ### ⏭ THE SHELF GRIND (Colton's standing order: deck testing) — targets in value order
> colton 93% — ALL SIX ≥90 (Flow State closed Veyran at exactly 90). joe 79% — NINE below bar:
> Jurassic Ramp 82 (closest) · Dragons 80 · Believe it! 79 · Wolverine 77 · Hulk Smash 77 · Kinnan 76 ·
> Kellan 74 · Captain America 73 · Halfshell 68 (deepest). Per-deck parked lists print from
> `measure-coverage.mjs <name>`; the Joe-deck law: 1-2 cards per shared subsystem is a huge win.
> Veyran's own residue is ledgered (Arcane Denial = the closest single arm).
## ☀️ 2026-08-12 (later) — **batch +48 · the SPELL-MASTERY vein is drilled and design-ready** — suite **1200 / 14,412** green

> ### ⏭ NEXT BUILD — SPELL-MASTERY riders (17 parked carriers, ONE shared condition, census in hand)
> The condition: "two or more instant and/or sorcery cards in your graveyard" at resolution. ONE bespoke
> precedent already evaluates it: library.js:587 (Nissa's Pilgrimage's untap rider — read it first, reuse
> its check). TWO rider classes:
> · **ADDITIVE** (condition true → extra atoms after the base): Unholy Hunger (+ gain 2), Calculated
>   Dismissal (+ scry 2, pausing-last OK), Dark Dabbling (+ draw), Kytheon's Tactics (+ riders on the
>   same group), Send to Sleep (those creatures don't untap — needs the tapped-lock grant), Gideon's
>   Phalanx (group gains indestructible EOT). START HERE: Unholy Hunger + Calculated Dismissal +
>   Dark Dabbling look like base-parses + one appended atom.
> · **INSTEAD replacement** (Fiery Impulse 2→4 damage): the `conditional` atom (applyConditional,
>   CR 608.2 "<base>. If <cond>, <alt> instead.") is the seam — check its condition vocabulary for a
>   graveyard-count arm before building a second evaluator.
> · Parked-for-machines: Swift Reckoning (flash grant), Exquisite Firecraft (can't-be-countered rider),
>   Talent of the Telepath (free-cast from reveal), Psychic Rebuttal (copy), Necromantic Summons
>   (+1/+1-counter rider on the reanimated body — check the reanimate atom's counter support first).
> ⚠️ The "Spell mastery — " ability-word label must strip on the SPELL lane the way static labels do —
> verify where splitClauses handles labels before assuming.
## ☀️ 2026-08-12 — **post-release batch +42 · six slices this sitting · CI green at f14e626c** — suite **1199 / 14,402** green by `npm run lint` / `npm test`

> ### ⏭ RUNNABLE NOW — the measured next candidates, in value order
> · **Aura-upkeep pay-or-else family (6):** Paralyze, Mind Whip, Apathy, Slow Motion, Dance of the Dead,
>   Errant Minion — same enchanted-controller's-upkeep event (BUILT today), else-effects vary (tap-keep,
>   sac, discard-random, return). Closest cousin: the sac-unless-pay seam's cost kinds.
> · **Scaled damagedPlayer lose-life (3):** Graveblade Marauder, Tomb Blade, Emissary of Despair —
>   "that player loses life equal to/for each X" needs RECIPIENT-scoped count sources (countForSpec
>   scoping, the one real gap). The fixed+half damagedPlayer arms exist as of today.
> · **Undrilled census rows:** spell mastery (12, one shared graveyard condition — applyConditional
>   exists) · addendum (8, cast-during-main-phase) · attacks-pump-per-attacker (8).
> · **Parked with reasons, don't re-walk:** gated lure/attacks-if-able (card-text enforcement reads need
>   a state-aware refactor) · threshold quoted-grant family (~17, joins the group quoted-grant order) ·
>   asymmetric -0/-1 counters (2 carriers, ptPrimitive weighs only ±1/±1) · Argentum Masticore
>   (reflexive rider) · Raving Dead (random-attack) · Shredder (token-copy machine).

> ### ⭐ TODAY'S SIX SLICES (all pushed, CI-verified through a55f771f; f14e626c's run in flight at write time)
> SAC-UNLESS-SACRIFICE (+3, the all-or-nothing cost row) → SAC-UNLESS-RETURN-LAND (+2, the Djinn's
> untapped gate; closed the upkeep-sac-unless row) → GATED-PROTECTION (+1 **and the leading-conditional
> protection FP fixed** — a tapped Pristine Angel was untargetable in every sim; whole-sentence guard in
> parseProtectionColors) → HALF-LIFE (+8, per-recipient CR 118.5 with printed rounding; two spell-lane
> bonus flips) → ENCHANTED-CONTROLLER'S-UPKEEP event (+7, the seat is the HOST's controller — whose:yours
> was the natural wrong answer) → HOST-REFERENT sentinel (+1, Unstable Mutation).
> ⛔ NEW STANDING TRAP: `gh run list --commit <sha>` went intermittently EMPTY today and manufactured two
> false dropped-event incidents — the reliable query is the UNFILTERED `gh run list --json headSha,…`
> filtered client-side. Dispatch lag ran ~7 min; a 6-min monitor threshold cried wolf twice.
> ⭐ Same-day pin graduations: Soul Bleed's CREED park (auraOwnTriggered) and my own hours-old Unstable
> Mutation park row — both flipped to positives with the Bequeathal protocol.
## ☀️ 2026-08-07 — **🏷 v0.157.0 PUBLISHED (103 cards) · post-release batch +13** — suite **1192 / 14,361** green by `npm run lint` / `npm test`

> ### ⏭ THE VEIN THAT IS PAYING RIGHT NOW: the ADDITIONAL-COST vocabulary
> Four consecutive slices, all on the same machinery, each banked by the previous one: AC-MANA (+8,
> "or pay {X}") → SAC-UNION (+10, "sacrifice a creature or enchantment/planeswalker/land", one evaluator
> across the cast and activated grammars) → AC-REVEAL (+9, the tribal reveal-or-pay cycle, ceiling 9 of 9)
> → AC-OR-SPLIT (+4, several " or "s try each split point; a union side only vets whole).
> · **Next in the vein, measured:** tap-N-untapped-permanents costs (Guardian of the Great Door, Warlord's
>   Elite — 2 carriers, convoke-adjacent, needs victim enumeration) · "sacrifice a legendary creature or
>   pay {2}" (Louisoix's Sacrifice — needs a supertype-qualified sacType) · behold-or-pay (2, needs the
>   behold keyword action) · Dusk Mangler's three REAL options (needs N-option choice emission).
> ⛔ THE STANDING TRAPS OF THIS VEIN, all hit once already: the spell CANNOT pay its own reveal/sac cost
> (CR 601.2h — it is on the stack; Daring Buccaneer is itself a Pirate); the printed-cost `affordable`
> flag is wrong in BOTH directions for merged-mana options; and every cost kind's DISTINGUISHING FIELD
> must join the OR-stamp identity comparison (pips, then subtype — check yours).

> ### ⭐ THE VERIFIED-HONESTY LEDGER (what this run does when a pin can't be written)
> Two guards are now documented as DEFENSIVE-ONLY rather than pinned by a faked path, each proven
> unreachable by a surviving mutation that was then explained instead of buried: the dispatcher's
> `ADDCOST_UNSUPPORTED` else (a non-choice cost iterates parsed costs, overrides ignored) and AC-OR-SPLIT's
> exactly-one ambiguity rule (a union's pieces never vet alone, so two valid splits cannot exist today).
> The pattern: run the mutation, and when it survives for a REACHABILITY reason, write that down in-file.
## ☀️ 2026-08-06 — **+78 this stretch · batch 7 at 85 post-v0.156.0 · the phrase veins are worked out** — suite **1189 / 14,339** green by bare exit code

> ### ⏭ NEXT SLICE — **AC-OR "…or pay {X}"**, ceiling **5 of 5**, spec is in the RUN-LEDGER
> The best ceiling ratio of the run. All five carriers (Spark Harvest, Lash of the Balrog, Morkrut
> Behemoth, Eaten Alive, Bayou Groff) have their EFFECT already modeled; the additional cost is the sole
> blocker on every one. The AC-OR splitter, the per-payable-option cast emission and the dispatcher charge
> ALL EXIST — the only missing piece is a `pay {mana}` cost kind in `parseOneAdditionalCost`.
> ⛔ **THE ONE HARD PART: affordability must merge the extra pips with the PRINTED cost and test them
> together**, across coloured/generic/hybrid. Undercharging here is a FREE SPELL — castModifiers.js says so
> in its own words. **Law 6 witness must be a POOL BALANCE, not a tier**: cast Bayou Groff with exactly
> printed+extra and assert the pool hits 0; then one pip short and assert the option is not offered.
> Bayou Groff is the fixture — the additional cost IS its whole card, so nothing can mask a mischarge.

> ### ⛔ DUNGEONS: my earlier "build venture first" call is RETRACTED — see the ledger
> 13 of 21 rooms parse, NO dungeon is complete (Lost Mine 6/7 is closest), and the Initiative dungeon is
> not in the bundled data at all. `node app/scripts/probe-dungeon-rooms.cjs` before believing any of it.
> ### ⭐⭐ THE INSTRUMENT TO START FROM — `app/scripts/probe-sole-blocker.cjs`
> For every multi-line parked card, remove ONE line and re-classify; if exactly one removal makes it native,
> that line IS the sole blocker. **6,859 of 12,917 multi-line parked cards have a single blocking line.**
> Then `probe-sole-blocker-drill.cjs <prefix>` groups a row by event + does-the-effect-parse + effect clause.
> ⛔⛔ **A ROW IS NOT A VEIN UNTIL THE DRILL COLLAPSES IT TO ONE EFFECT SHAPE.** The #1 row looks like a
> 30-card family (`whenever this creature deals combat damage to a player, yo…`) and is 30 DISTINCT effects
> with a correctly-detected trigger. A shared trigger PREFIX is not a shared cause — gate 20 in its most
> seductive form of the run.
> ⚠️ **THREE KNOWN FAILURE MODES OF THE CLAUSE CENSUSES, all of which bit me:** use `NATIVE_TIERS.has(tier)`
> not `startsWith("native")` (the `land` tier is covered without the prefix — my first run put 248 dual
> lands on top); a clause may have a DEDICATED parser (GY-recursion, suspend, mana) so an empty
> `parseEffectClause` is not proof; and parenthesised REMINDER TEXT is not an ability (it made unearth look
> like a 20-card vein with a real ceiling of 0).

> ### ⭐ THE STANDING RULE THIS STRETCH KEEPS EARNING
> **A VERIFICATION THAT RETURNS THE CONVENIENT ANSWER DESERVES MORE SUSPICION THAN ONE THAT RETURNS AN
> INCONVENIENT ONE.** Every wrong call today arrived as a clean-looking confirmation: a collision check
> reporting "all safe" (backslash eaten); a stack read reporting "never fires" (looked before the flush);
> a pin's prose reporting "board wipe". The all-zero rule is the loudest symptom of this, not the only one.
## ☀️ 2026-08-06 — **+78 this stretch · batch 7 at 85 post-v0.156.0 (tag at ~100)** — suite **1189 / 14,339** green by bare exit code

> ### ⏭ NEXT BUILD — the ACTIVATED-ABILITY census, freshly run and already filtered
> A second census axis (the trigger one is below): for every non-native card, run `parseActivatedAbilities`
> and tally the `effectClause`s that `parseEffectClause` returns EMPTY for. The surviving candidates after
> I probed the top rows:
> · **GY SELF-RECURSION RIDERS — ~52 carriers, but THREE separate causes.** `parseGraveyardSelfRecursion`,
> its offer site, dispatcher and classifier are all BUILT; each parked carrier fails on a different rider:
> Tymaret on a `, Sacrifice a creature` COST rider · Vivien's Jaguar on an `Activate only if you control a
> Vivien planeswalker` CONDITIONAL rider · Retrofitted Transmogrant on a `to the battlefield tapped with
> two +1/+1 counters` DESTINATION rider. **Gate 20: three slices, not one.** Probe each rider's own
> carrier count first — the biggest is likely the sac-cost one.
> · `the next N damage … would be dealt` prevention shields **18+9+8** · `copy target activated or
>   triggered ability` **10** · `target creature blocks this creature if able` **9** · `target creature
>   can't block this creature` **7**.
> ⛔ **DEAD ENDS, MEASURED — do not re-walk these:** `add {M} or {M}` (248) and friends are LANDS, already
> covered. `level N` (76) is the Level Up subsystem. `this creature gains indestructible` (10) ALREADY
> parses — those cards park elsewhere. Powerstone tokens (ceiling 12) are a DELIBERATE refusal: the token's
> restricted mana is unmodeled and `manaProduction` returns null for it — the note in tokens.js is accurate,
> not stale (I checked). Incubate (ceiling 12) needs transform. Bare-colour tutor filters ceiling 1,
> `noncreature, nonland` ceiling 2, `reveal until` ceiling 0.

> ### ⚠️ THE CENSUS INSTRUMENT HAS TWO KNOWN FAILURE MODES — both bit me today
> **1. `NATIVE_TIERS`, NOT `startsWith("native")`.** The `land` tier is COVERED but carries no "native"
> prefix, so a naive filter counts every land as parked. My first activated-ability census put 248 dual
> lands at the top of the list. Import `NATIVE_TIERS` from coverage.js and use `.has(tier)`.
> **2. A CLAUSE MAY HAVE A DEDICATED PARSER.** "parseEffectClause returns []" does NOT mean unmodeled —
> GY self-recursion, suspend, vanishing and the mana abilities all route through their own parsers. Always
> confirm against the card's TIER and the dedicated parse before calling a row a vein.

> ### ⭐⭐ THE RULE THIS STRETCH ADDED, and it is the one I keep needing
> **A VERIFICATION THAT RETURNS THE CONVENIENT ANSWER DESERVES MORE SUSPICION THAN ONE THAT RETURNS AN
> INCONVENIENT ONE.** Every wrong call today arrived as a clean-looking confirmation of what I already
> expected: a collision check that reported "all safe" because a backslash was eaten; a stack read that
> reported "never fires" because it looked before the flush; a test pin whose prose said "board wipe".
> The all-zero rule is the cheap version of this — but all-zero is only the loudest symptom, not the only one.

> ### ✅ SHIPPED THIS STRETCH — 16 slices
> `995051b4` UP-1 +4 · `4389cbe4` DD-1 +17 · `df8cccc0` CV-1 +4 · `23117164` BS-1 +8 · `70599074` CT-1 +4 ·
> `8dc56f21` KW-1 +6 · `954c150e` CV-2 +4 · `5b15511e` ST-1 +2 · `5b7a745b` CV-3 +2 · `638d684a` GX-2 +8 ·
> `d76b9063` RT-1 +5 · `8aa51294` LB-1 +5 · `41fe8bef` CP-1 +7 (and the negative-pump clamp bug, 19 cards) ·
> `03c3db84` TF-1 +2.
## ☀️ 2026-08-06 — **+76 this stretch · batch 7 at 83 cards post-v0.156.0 (tag at ~100)** — suite **1188 / 14,336** green by bare exit code

> ### ⏭ START HERE — the instrument that is finding everything
> **CENSUS THE UNPARSED TRIGGER EFFECT CLAUSES, NORMALIZED, RANKED BY COUNT.** For every card that is not
> native, run `detectTriggers`, take each `effectClause` that `parseEffectClause` returns EMPTY for,
> normalize it (digits → N, `{…}` → {M}), and tally. That one query produced the last four slices. It beats
> the target-phrase census because it groups by what the parser actually failed on, not by wording.
> Current top rows, minus the subsystem-sized ones (venture / initiative / the Ring / attractions):
> · `remove a time counter` **26** — suspend/vanishing. Check `KW-SUSPEND` first; part of it shipped earlier.
> · `look at the top N cards of your library. you may …` **~47 across N=4/5/6** — one shape, three counts.
> · `reveal cards from the top of your library until you …` **17** · `incubate N` **14** ·
>   `create a tapped powerstone token` **12** · `you may return this card from your graveyard to your hand` **12**.
> ⛔ **RULE 1 BEFORE BUDGETING ANY OF THEM: READ THE RESOLVER.** Four of the last five slices were budgeted
> as new-atom builds and turned out to be ONE regex group, because the machinery already existed and only
> the matcher was unreachable. **Fourteen "built engine, partial ignition" finds this run.** Grep the op
> name, read the resolver, THEN decide the cost.

> ### ⭐⭐ THE FIND THAT KEEPS PAYING: BUGS ON CARDS THE TIER ALREADY COUNTS AS WORKING
> This run has now found SEVEN, none visible to any flip-diff. The newest is the largest: `applyPumpEffect`
> computed `Math.max(0, count * per)`, so **every negative count-scaled pump resolved as zero** — Defile
> with a Swamp out left a 2/2 at 2/2, across **19 printed cards**, shipped. Found only because a runtime row
> asserted the NUMBER (`2/2 → 1/1`) instead of asserting the card was native.
> ⭐ The habit that finds these: after any slice, assert a printed VALUE at runtime — a pool membership, a
> P/T, a zone. "It classifies native" and "it parses" are both true of a card that does nothing.

> ### ⚠️ TWO FALSE CLAIMS I PUBLISHED TODAY, BOTH RETRACTED — same root cause
> **1. CT-1**: read a test pin's PROSE ("eachX would wrongly hit the unfiltered set"), inferred a board
> wipe, reverted a correct +4, banked the claim. The resolver had honoured restrictions for six days.
> **2. LB-1**: read `state.stack` immediately after a land drop, found it empty, and published "land ETB
> triggers never fire" — with a matched creature control that appeared to confirm it. Triggers go to
> `pendingTriggers` and flush on the NEXT PRIORITY PASS. Both controls were measuring the same premature
> moment. Karoo lands work fine.
> ⛔ **THE RULE: a matched control does not rescue a harness that stops one step early — it makes the wrong
> answer look rigorous.** Before believing a NEGATIVE result, assert that the POSITIVE control produced its
> actual effect, not merely that something appeared. Both retractions are pinned as end-to-end tests so
> neither claim can be re-derived.

> ### ⭐ THE OTHER STANDING RULES (earned earlier today, still load-bearing)
> · A mutation is not applied until the CHANGED LINE HAS BEEN PRINTED BACK. `grep -c` answering 0 proves
>   the pattern did not match, never that the edit landed.
> · A test's PROSE documents what was true when written; only its ASSERTION is a fact about now. A red pin
>   says a decision changed — not which way. **Run the card before graduating it.** (~17 pins cleared safely
>   this way since the CT-1 mistake.)
> · A pin that CONSTRUCTS THE ARGUMENT ITSELF is testing the callee, not the call. A mutation survived
>   because a pool row called the helper directly instead of going through `atomTargets`, the seam the
>   parser actually feeds.
> · No shell heredocs for content containing a backslash — write the script to a scratchpad `.cjs` and run
>   it. The trap struck five times today, once writing literal 0x08 bytes into a doc comment.

> ### ✅ SHIPPED THIS STRETCH — 15 slices, every one flip-diffed, audited, mutated, CI-read
> `995051b4` UP-1 union scope +4 · `4389cbe4` DD-1 dealt-damage +17 · `df8cccc0` CV-1 removal +4 ·
> `23117164` BS-1 bounce qualifier +8 · `70599074` CT-1 card type +4 · `8dc56f21` KW-1 keywords +6 ·
> `954c150e` CV-2 counters +4 · `5b15511e` ST-1 supertype +2 · `5b7a745b` CV-3 bounce +2 · `638d684a`
> GX-2 graveyard exile +8 · `d76b9063` RT-1 reanimate-tapped +5 · `8aa51294` LB-1 land bounce +5 ·
> `41fe8bef` CP-1 count-scaled pump +7.
## ☀️ 2026-08-06 — **+64 shipped this stretch · batch 7 now 71 cards post-v0.156.0** — suite **1186 / 14,327** green by bare exit code

> ### ⭐⭐ THE METHOD THAT IS WORKING RIGHT NOW — use this before picking a vein
> **1. READ THE RESOLVER BEFORE BUDGETING A BUILD.** Twice today a slice budgeted for a new atom AND
> resolver turned out to need ONE regex group, because the machinery already existed and only the matcher
> was unreachable. GX-2 (filtered graveyard exile, +8) and RT-1 (reanimate-tapped, +5) were both this.
> **Thirteen "built engine, partial ignition" finds this run** — it is the single most common shape in
> this codebase. Grep the op name, read the resolver, THEN decide what the slice costs.
> **2. SPLIT A SHARED ATOM BY ITS VERB OR ITS RIDER, not just by target phrase.** The phrase census buries
> these: `exile … from a graveyard` sat inside a heterogeneous 55-row bucket, but split by VERB against
> `return … from a graveyard` (native on 53+28) it was 25 carriers / ONE native — an obvious cause. Same
> for riders: on the reanimate lane, `tapped` had a ceiling of 7 while `with a +1/+1 counter` and `under
> your control` had ZERO parked carriers each.
> **3. CEILING-PROBE, AND TREAT IT AS AN ESTIMATE IN BOTH DIRECTIONS.** Substitute the unparsed phrase for
> one that provably parses, reclassify, count flips. DD-1 was 26 carriers → ceiling 18. But GX-2 shipped
> **8 against a ceiling of 6**, because the probe's regex was narrower than the real family. A ceiling is
> a guide, not a cap.

> ### ⏭ NEXT BUILD — measured, in order
> · **the `put … onto the battlefield` graveyard lane** — 25 carriers / 4 native, the biggest untouched
>   verb split left on the graveyard family. Apply rule 1 first: `reanimate`/`applyReanimate` may already
>   cover it, in which case this is a matcher-only edit like GX-2 and RT-1.
> · **`return … to the battlefield with a +1/+1 counter on it`** — 9 carriers / 0 native. Riders on the
>   same reanimate atom; the counter rider is NOT currently emitted (measured: ceiling 0 as written, so
>   check whether the carriers park on something else first).
> · **`creature or Vehicle` remainder ~8** — three lanes shipped (removal +4, counters +4, bounce +2). What
>   is left sits behind the pump and keyword-grant tables, each its own edit (gate 20).
> · **`creature blocking it` ceiling 3 · `creature or land` ceiling 3 · `creature or enchantment` 2.**
> ⛔ **PARKED WITH A PREREQUISITE:** positive card type shipped for single targets (CT-1), but the rest of
>   its ceiling needs the MASS lane's NON-CREATURE filter path, which has no restriction-honouring
>   resolver. Creature wipes are verified fine; non-creature ones are the hazard.

> ### ⭐⭐ FOUR METHOD RULES EARNED TODAY — all four cost real time
> **1. A MUTATION IS NOT APPLIED UNTIL THE CHANGED LINE HAS BEEN PRINTED BACK.** `grep -c` answering 0
> proves the pattern did not match, never that the edit landed. A perl mutation silently failed while grep
> reported success; I then "confirmed" a line was dead with a corpus-wide flip-diff showing 0 of 34,245
> changed — a rigorous measurement of an UNMUTATED FILE. The suite caught it.
> **2. A TEST'S PROSE DOCUMENTS WHAT WAS TRUE WHEN IT WAS WRITTEN; ONLY ITS ASSERTION IS A FACT ABOUT NOW.**
> A red pin says a recorded decision changed. It does not say WHICH WAY. I read a pin titled "eachX would
> wrongly hit the unfiltered set", inferred a board wipe, reverted a correct +4 and banked the false claim.
> **Every graduation since has RUN THE CARD first** — and that habit has now cleared ~15 stale pins safely.
> **3. SHELL HEREDOCS ARE BANNED FOR CONTENT CONTAINING A BACKSLASH.** The trap struck four more times,
> once writing literal 0x08 BYTES into a doc comment where `\b` was meant. Use the file-edit tool, or build
> the string with `String.fromCharCode`. Doc scripts now go to a scratchpad .cjs file and run from there.
> **4. GRADUATING A PIN IS AN ASSERTION ABOUT BEHAVIOUR** and needs the same evidence as any code change.
> One row was promoted to MUST_STAY_HIGH on an assumption and had to come back out.

> ### ✅ SHIPPED THIS STRETCH (each: flip-diff, whole-card audit, mutation, Law-6/runtime witness, CI read)
> `995051b4` UP-1 union scope **+4** (and FRY — a live FP on an already-native card) · `4389cbe4` DD-1
> dealt-damage-this-turn **+17** · `df8cccc0` CV-1 creature-or-Vehicle removal **+4** · `23117164` BS-1
> bounce state qualifier **+8** (found a fail-OPEN combat value) · `70599074` CT-1 positive card type **+4**
> · `8dc56f21` KW-1 keyword beyond flying **+6** · `954c150e` CV-2 counter lane **+4** · `5b15511e` ST-1
> supertype **+2** · `5b7a745b` CV-3 bounce lane **+2** · `638d684a` GX-2 filtered graveyard exile **+8** ·
> `d76b9063` RT-1 reanimate-tapped **+5**.
> ⭐ **THE HIGHEST-VALUE FINDS ARE STILL BUGS ON CARDS THE TIER ALREADY COUNTS AS WORKING** — Fry aiming at
> a green creature, the combat fail-open offering the whole board, the union offering your OWN planeswalker.
> None appeared in any flip-diff. Only parsed-atom and pool assertions catch that class.
## ☀️ 2026-08-06 — **+43 shipped this stretch · batch 7 now 50 cards post-v0.156.0** — suite **1181 / 14,312** green by bare exit code

> ### ⏭ NEXT BUILD, MEASURED AND CEILING-PROBED — pick the top and go
> Every number below is a CEILING PROBE (substitute the unparsed phrase for one that provably parses,
> reclassify, count the flips) — not a carrier count. That distinction has been worth an hour twice today:
> "dealt damage this turn" had 26 carriers and a ceiling of 18; "exile from a graveyard" has 25 carriers
> and a ceiling of 6. **Probe the ceiling before building.**
> · **`creature or Vehicle`, remaining ceiling ~14** — the removal lane shipped (+4). The rest sit behind
>   DIFFERENT noun tables: the BOUNCE matcher in zones.js takes a bare `creature` noun with no alternation
>   at all (~line 873), and the pump / keyword-grant / graveyard lanes each carry their own. Same symptom,
>   different causes — gate 20 says do them as separate measured edits, never one batch.
> · **exile-from-graveyard, ceiling 6** — `return … from a graveyard` is native on 53+28 carriers while
>   `exile … from a graveyard` is 25 carriers / 1 native. The VERB is the whole tier split. Needs a new atom
>   AND resolver (return-from-graveyard is the template) — budget for ignition, and prove it with a runtime
>   witness rather than a classification test.
> · **`creature blocking it` ceiling 3 · bare `creature or planeswalker` ceiling 5.**
> ⛔ **PARKED WITH A PREREQUISITE — do not retry as-is:** positive card type SHIPPED for single targets
>   (CT-1), but the remaining ~8 of its ceiling need the MASS lane's NON-CREATURE filter path, which has no
>   restriction-honouring resolver. Creature wipes are fine (verified end-to-end); non-creature ones are not.

> ### ⭐⭐ THREE METHOD RULES EARNED TODAY — all three cost real time, all three are cheap to obey
> **1. A MUTATION IS NOT APPLIED UNTIL THE CHANGED LINE HAS BEEN PRINTED BACK.** `grep -c` answering 0
> proves the pattern did not match — never that the edit landed. A perl mutation silently failed while grep
> reported success; on that false negative I "confirmed" a line was dead code with a corpus-wide flip-diff
> showing 0 of 34,245 changed — a rigorous measurement of an UNMUTATED FILE, which is worse than no
> measurement because of how convincing it looks. The full suite caught it. Corrections 22/30/31 say verify
> the mutant REACHES the guarded case; this adds the step before it: verify the mutant EXISTS.
> **2. A TEST'S PROSE DOCUMENTS WHAT WAS TRUE WHEN IT WAS WRITTEN; ONLY ITS ASSERTION IS A FACT ABOUT NOW.**
> A red pin says a recorded decision has changed. It does not say WHICH WAY, and it is not evidence of a
> defect until the behaviour has been run. I read a pin titled "eachX would wrongly hit the unfiltered set",
> concluded a board wipe had been admitted, reverted a correct +4, and banked the false claim in the ledger.
> The resolver had learned to honour restrictions six days earlier. Un-reverted; that claim is now an
> end-to-end assertion instead of prose.
> **3. SHELL HEREDOCS ARE BANNED FOR ANY CONTENT CONTAINING A BACKSLASH.** The `\b`-eating trap struck
> FOUR more times today (ninth through twelfth), once writing literal 0x08 BYTES into a doc comment where
> `\b` was meant — invisible in every diff, and lint does not flag control characters outside regexes.
> Use the file-edit tool, or build the string with `String.fromCharCode`. 11 such bytes were also swept out
> of this repo's own RUN-LEDGER, every one inside a sentence warning about this exact trap.

> ### ✅ SHIPPED THIS STRETCH (each: flip-diff, whole-card audit, mutation, Law-6 witness, CI conclusion read)
> `995051b4` UP-1 union targetType carries its scope **+4** — and FRY, a live false positive on a card that
> was ALREADY NATIVE: its printed "that's white or blue" was silently dropped, so the engine would aim 5
> damage at a green creature. **No coverage metric can find that class; only asserting the parsed atoms did.**
> `4389cbe4` DD-1 "dealt damage this turn" **+17** — the residue census's top vein. Two witnesses
> (damageMarked misses infect/wither; damagedBy is optional) — neither half visible to the tier number.
> `df8cccc0` CV-1 creature-or-Vehicle removal **+4** · `23117164` BS-1 bounce state qualifier **+8**, which
> also found a FAIL-OPEN: an unrecognised `combat` value satisfied every creature instead of none.
> `70599074` CT-1 positive card type **+4** (the revert-and-un-revert) · `8dc56f21` KW-1 keyword restriction
> beyond flying **+6**.
> ⭐ **THE HIGHEST-VALUE FIND CLASS REMAINS BUGS ON CARDS THE TIER ALREADY COUNTS AS WORKING** — Fry, the
> combat fail-open, and the union offering your OWN planeswalker were all invisible to the flip-diff.
## ☀️ 2026-08-06 — **🏷 v0.156.0 PUBLISHED · batch 7 (IC-1 +3 · DT-1 +1 · DT-2 +3)** — suite **1175 / 14,291** green by exit code

> ### ⏭ NEXT BUILD, MEASURED AND SEAM-MAPPED: **UNION TARGET + ANY SCOPE (4)** — the anaphor half SHIPPED
> ⭐ **HALF THIS LANE IS DONE.** DT-2 shipped the anaphor half (+3: Snapping Thragg, Skirk Commando, Spark
> Mage) via the sentinel rewrite. What remains is the UNION half: Skysovereign Consul Flagship, Careless
> Celebrant, Iroas's Blessing, Ossuary Rats — "deals N damage to target creature or planeswalker AN
> OPPONENT CONTROLS".
> ⭐⭐ **DIAGNOSED, AND IT IS NOT A SCOPE PROBLEM AT ALL — probe it in 30 seconds and see:**
> · `target creature or planeswalker` → **parses** (targetType creatureOrPlaneswalker)
> · `target creature or planeswalker an opponent controls` → **[]**
> · `target creature or planeswalker YOU CONTROL` → **[]** ← the tell
> **ANY scope fails on a union target**, so the union+scope framing was misleading: nothing is wrong with
> the scopes. parser.js's damage/destroy fold (~line 717) is gated on `atom.targetType === "creature"`, so
> a UNION atom skips the restriction parse entirely and falls through to `isCleanClause(s)` — where the
> scope phrase is ITSELF in UNMODELED_MARKERS (`you control|an opponent controls|you don't control`).
> **THE SEAM:** widen that fold's targetType condition to admit `creatureOrPlaneswalker`, so the scope is
> EXTRACTED as a restriction instead of tripping the marker list. parseCreatureTargetRestrictions must then
> also stop leaving "or planeswalker" as residue for that call — today it returns `clean:false` on it.
> ⛔⛔ **DO NOT make "or planeswalker" clean GLOBALLY.** That parser is shared by destroy / exile / damage
> AND legalChoices' legacy single-target path; swallowing the union into the noun there would let a union
> be treated as a plain CREATURE target elsewhere — offering a planeswalker where only creatures are legal.
> Scope the change to the union targetType, not to the shared noun grammar.
> ⛔ Law 6 (legal targets): 4-seat board with a creature AND a planeswalker on several sides; print the pool
> by id and assert the excluded seats by name.
> ⛔ AND THE STANDING WARNING FROM DT-2, which cost three flip-diffs to learn: this clause family has at
> least SIX literal readers ("that player controls" in removal.js ×3, zones.js's bounce matcher, stack.js's
> Balefire mass-damage matcher, plus the creature lane). **Any text rewrite here is a RENAME** — prefer a
> parser-side change that touches no clause text at all.
>
> ### ⓘ SUPERSEDED: **the FIXED-AMOUNT SINGLE-TARGET DAMAGE LANE (7)** — anaphor half shipped as DT-2
> ⭐⭐ **TWO SEPARATE MAPS TURNED OUT TO BE ONE LANE — that consolidation is the finding.** The union+scope
> gap and the damagedPlayer-scope gap are the same code path refusing two different qualifiers, so they
> should be built together, once.
> · **UNION + SCOPE (4)** — Skysovereign Consul Flagship, Careless Celebrant, Iroas's Blessing, Ossuary
>   Rats: "deals N damage to target creature or planeswalker AN OPPONENT CONTROLS".
> · **DAMAGED-PLAYER SCOPE (3)** — Snapping Thragg, Skirk Commando, Spark Mage: "you may have it deal N
>   damage to target creature THAT PLAYER controls" on a combat-damage trigger.
> ⓘ **THE EXACT BOUNDARY, PROBED — do not re-derive it (30 seconds of `parseEffectClause`):**
> · `deals 3 damage to target creature an opponent controls` → **parses**
> · `deals 3 damage to target creature defending player controls` → **parses** (DP-TGT shipped it)
> · `deals 3 damage to target creature THAT PLAYER controls` → **[]**
> · `deals 3 damage to EACH creature that player controls` → **parses** (DT-1 shipped it)
> · `deals 3 damage to target creature or planeswalker an opponent controls` → **[]**
> **So the EACH-creature lane composes scope fine and the SINGLE-TARGET lane is the holdout, on BOTH
> qualifiers.** `parseCreatureTargetRestrictions` already returns `clean:true` with the right restriction
> for the damagedPlayer case — the refusal is downstream of it, in the single-target damage matcher.
> ⭐⭐ **DIAGNOSED — and the earlier suspect (an amountCount TT interception) was WRONG, so ignore it.** The
> refusal is `UNMODELED_MARKERS` in parser.js (~line 341), which explicitly lists
> `that (?:player|creature|deals|has|was|spell)` and `its (?:owner|controller)`. parser.js's damage/destroy
> fold requires BOTH `clean` from parseCreatureTargetRestrictions AND `isCleanClause(cleanedOracle)`, and
> that second gate rejects the leftover anaphor. **"defending player controls" parses precisely because it
> is NOT in that list** — it is an unambiguous printed phrase, not an anaphor.
> ⭐ **SO THE PARSER'S REFUSAL IS DELIBERATE, AND IT IS THE SAME PRINCIPLE AS THE "its controller" REFUSAL
> (IC-1): bare anaphors are treated as unresolved residue by design.** The fix is therefore the SENTINEL
> pattern once more, and it is now mechanical:
> ① rewrite "that player controls" → an unambiguous sentinel in detectTriggers, gated to the combat-damage
>   events that bind ctx.damagedPlayerId (the DT-1 scope arm already emits the right restriction; it is the
>   clause TEXT that has to stop being an anaphor);
> ② add the sentinel to `MODELED_RESTRICTION_RES` (spellEffects ~275) so `cleanedOracle` strips it and
>   `isCleanClause` passes;
> ③ point the DT-1 scope arm at the sentinel as well as the raw phrase — the raw form must keep working for
>   the EACH-creature lane, which already ships and does not go through this gate.
> ⛔ Do NOT "fix" this by loosening UNMODELED_MARKERS. That list is what keeps every unresolved anaphor off
> the native path; widening it would admit exactly the class of card this run has twice caught silently
> doing nothing (or doing it to the wrong seat).
> ⛔⛔ **REAL CREED SURFACE, AND THE PRECEDENT IS ALREADY WRITTEN.** DT-1 measured +2 and one was a WRONG
> CARD: Flames of the Raze-Boar, a SPELL whose "that player" is a cross-clause reference, would have been
> credited native while its second clause hit nobody. The spell fence now catches it via
> `atomCarriesEventReferent` (coverage.js) — **whatever is built here must keep that fence satisfied**, and
> the whole-card audit of every gained row is what caught it, not the flip-diff.
> ⛔ Law 6 applies (legal targets): drive a 4-seat board with a creature AND a planeswalker on several
> sides, print the pool by id, and assert the excluded seats BY NAME — "an opponent controls" and "that
> player controls" differ in multiplayer, which is the whole point of the distinction.
> ⓘ Snapping Thragg / Skirk Commando / Spark Mage also carry a "you may have it deal" OPTIONAL wrapper.
> That is NOT the blocker — the bare form `it deals N damage to target creature that player controls`
> returns [] on its own — so do not chase the wrapper first.

> ### ⚠️⚠️ A BROKEN PROBE RETURNS A CLEAN-LOOKING **NEGATIVE** — THE MEASUREMENT NEEDS ITS OWN GATE
> A corpus probe for the colour-disjunction vein reported a confident **"0 flips"**. The vein is really **13**.
> The pattern had been BUILT from a template string through a shell heredoc, one backslash level was eaten,
> and the word-boundary escape became a literal BACKSPACE character — so the regex matched nothing and
> every card was skipped. (This sentence lost that same backslash on its own first write, same heredoc.)
> Nothing errored. The output was well-formed. **A false negative in a probe is worse than a false positive
> in a build**: a build gets caught by the gates, but a banked "0 flips" permanently buries a vein and looks
> like diligence in the ledger. Caught only because the number contradicted an earlier probe's +2.
> ⛔ **STANDING RULE, EARNED TWICE NOW (this and correction 22):** regex LITERALS in probe files written with
> the Write tool — never a pattern assembled from a template string, never through a heredoc. And every probe
> carries a **SANITY GATE**: assert the pattern matches one known carrier and `process.exit(1)` if it doesn't,
> so a broken run REFUSES to report instead of reporting zero.

> ### ⛔ AND THE BIGGEST KEYWORD COUNT WAS WORTH NOTHING: **saddle, 33 carriers, 0 flips**
> Saddle is crew's twin and looked like the prize of the sweep. Swapping it for crew flips **zero** cards —
> every carrier parks on its Mount abilities instead. Same story as domain (65 carriers, 2 flips). **The
> keyword sweep ranks by carriers, which is not payoff; causation-test before opening a file.** Also 0:
> exploit, melee, banding (each ≤1 carrier once real cards are filtered).

> ### ✅ THE COUNT-SOURCE VEIN IS **MEASURED OUT** — swept, causation-tested, don't re-walk it
> Three count kinds shipped today (+6 sunburst, +5 converge, +2 converge-spell, +7 multikicker), so I swept
> the whole corpus for unmodelled "for each <X>" / "where X is <Y>" phrases, asked `parseCountSource` which
> it already knows, and ranked the unknowns by PARKED carriers. 97 phrases with 4+ parked carriers — then the
> causation test (swap for a known count, re-classify) gutted the list:
> · **domain** ("basic land types among lands you control") — 65 carriers, **2 flip**
> · instant/sorcery in graveyard — 21 carriers, **0** · target beyond the first — 22, **0** · card in your
>   graveyard — 12, **0** · card exiled this way — 22, **1** · attacking creatures — 16, **1**
> · life gained this turn — 18, **2** · creature in your party — 27, **2**
> · **"+1/+1 counter on it"** — 19 carriers, **4** ← the only one left worth building
> ⛔ **THE TALLY OVERSTATED EVERY SINGLE ONE.** Domain looked like 52 and is 2. The phrase co-occurs with
> parked cards; it rarely blocks them. **Causation-test before opening a file** — this sweep cost minutes and
> saved several wasted builds.

> ### ✅ BUILT (+6): "for each +1/+1 counter on it" — the seam-map held, and the payoff was 6 not 4.
> Marketback Walker, Hooded Hydra, Bloodtracker (dies/leaves triggers) and Embalmed Brawler (attacks/blocks).
> ⛔⛔ **IT NEEDS TWO READS, NOT ONE, AND THAT IS THE WHOLE DIFFICULTY.** On a dies/leaves trigger the
> permanent is GONE at resolution, so the count must come from the CR 603.10a look-back — reading the live
> board silently yields 0, an under-count that looks like a working card. On an attacks/blocks trigger the
> permanent is live and the board is correct. **Same phrase, two sources.**
> ⭐ The look-back already carries what's needed: `checkDiesTriggers` has `d.counters` and threads only a
> BOOLEAN (`ctx.triggeringHadNoPlusCounters`, for undying). Thread the COUNT beside it, add a count kind that
> prefers the look-back and falls back to the live permanent, and pin BOTH paths — a pin that only drives the
> attacks case would pass with the dies path returning 0.

> ### ⭐⭐ A COUNT WHOSE TRUE VALUE IS ZERO IS STILL WORTH MODELLING — **+7 from it**
> "For each time it was kicked" parked 7 cards. Multikicker isn't offered (parseKickerCost refuses it), so
> the count is 0 on every cast the engine can make — **and 0 is the CORRECT answer for those casts.** The
> cards now play correctly rather than not at all. Modelled as a COUNT rather than stripped: a strip says
> "this text doesn't exist" and has to be revisited when multikicker ships; a count computes the true value
> now and goes live then. **Prove it isn't a dressed-up zero** — the pin stamps a non-zero count and shows
> the counters follow.
> ⛔ And when you lift a refusal, PIN THE PART THAT DIDN'T CHANGE: the kicker test gained an assertion that
> `parseKickerCost` still returns null, so "the count is modelled" can never be misread as "multikicker is
> offered".

> ### ⚠️⚠️ WHEN A LAW-6 WITNESS READS **ALL ZERO**, CHECK THE FIELD NAME BEFORE THE CODE
> Five harness errors today, and this is the sharpest: the converge-spell witness printed all zeros because
> the field is `damageMarked`, not `damage`. **All-zero is indistinguishable from "the value never arrived"**
> — which is the exact failure the pin exists to detect, so it reads as a real bug. Same family as
> `activate-ability` vs `activate`, and `runEffectProgram`'s stack-object signature. Confirm the harness can
> produce a NON-zero row before you conclude anything from a zero one.

> ### ✅ DONE (+13 across THREE slices): sunburst (+6), converge enters-with (+5), converge spells (+2).
> ⭐ **ONE CAPTURE, THREE READERS.** The colour count is derived once at cost-payment time; each slice added
> a consumer and none re-derived the number. That is the shape to aim for — a capability, then its readers.
> ⛔⛔ **THE LESSON BOTH SLICES SHARE: THE DANGEROUS MUTANT IS THE BELIEVABLE ONE.** Sunburst's kind-forcing
> mutant gives Baton of Courage the RIGHT NUMBER of counters, wrong kind. Converge's multiplier-forcing
> mutant gives Glinting Creeper HALF its counters — still a plausible pile. Neither shows up as an obviously
> broken board. **Pin the exact number and the exact kind, or the mutant walks.**
> ⏭ **STILL OPEN: the converge SPELL forms** (Radiant Flames, Painful Truths, Bring to Light — ~16
> sorceries/instants). Same capture point, different consumer: the count is on the CAST params but only the
> permanent-ETB resolver reads it; a spell needs it threaded into effect resolution as a dynamic amount.

> ### ⏭ ORIGINAL SEAM-MAP (kept — converge still open): **"how many COLOURS did you spend?"**
> 50 real carriers; the causation probe (swap the colour-count for a fixed count) says **10 flip**. One
> missing QUESTION behind both keywords, and **the answer already exists at payment time and is thrown away**:
> `commitPaymentPlan(state, playerId, plan)` receives `plan.spend`, a per-colour map. Nothing records it.
> **The seam, in order:**
> ① `applyCastSpell` (actionDispatcher) — after `commitPaymentPlan`, derive the distinct coloured keys of
>    `plan.spend` and put the count in `params`, exactly beside the existing `params.castFromZone`.
> ② the permanent stamp — `resolvers.enterPermanent` already stamps `wasCast` / `castFromZone`; add this the
>    same way, so an ETB rider can read it off the entering permanent.
> ③ parse arms — sunburst (CR 702.43) and converge. The dynamic-count enters-with machinery already exists
>    (`entersWithXCounters` reads a variable count), so this is a new count SOURCE, not a new lane.
> ⛔ VERIFY THROUGH THE REAL CAST PATH, not by hand-stamping the permanent — the whole point is that the
> number survives from payment to ETB, and a hand-stamped fixture would prove nothing about the wiring.
> ⓘ The other 40 carriers park on their effects; the colour count is not what holds them.

> ### ⭐ THE KEYWORD-TWIN INSTRUMENT: **a new ability WORD is usually an old one wearing a new label**
> EXHAUST (+10) was POWER-UP with a different prefix — same once-per-GAME activation limit, and
> `activationLimitScope:"game"` already shipped, already read by the offer gate, already stamped by the
> dispatcher. **The missing piece was the label.** When a modern keyword parks a cluster, find the OLDEST
> keyword with the same rules text and check whether its machinery is already general.
> ⛔ But never strip a label without carrying its restriction: the default ledger self-expires, so a per-turn
> scope would have re-armed every exhaust ability each turn — one free activation per turn on 39 carriers.

> ### ✅ SWEPT AND EMPTY: bare pure-helper calls (25 helpers, whole of src/lib/learn) — **zero remaining**
> The dispatcher discard fix was the only instance of that bug class. Don't re-run it.

> ### ⛔⛔ THE FIND OF THE DAY: **a PURE function called as a STATEMENT is a silent no-op**
> `checkDiscardTriggers` returns a new state with the fired triggers appended. All six DISPATCHER call sites
> invoked it bare and dropped the result, so every additional-cost discard, the activated-ability discard
> cost, **cycling**, and the alt-cost path fired **nothing** — Liliana's Caress and the whole
> opponent-discard family read native and did nothing on the commonest discard routes in the game.
> Every OTHER caller in the codebase already assigned it, which is precisely what hid it.
> **Grep for bare `check*Triggers(` / any pure helper called as a statement.** (Swept: none left.)
> ⚠️ **AND THE SEAM HAD NO TEST.** Trigger machinery green, dispatcher green, nobody drove one through the
> other. Its signature — `total: 0` with `cardInGraveyard: true` — is what a dropped return looks like from
> outside: the state change lands, the consequence doesn't. **When two subsystems are each well-tested, test
> the CALL between them.**

> ### 🏷 v0.155.0 TAGGED (batch 100) — release workflow running; verify assets before claiming it shipped.

> ### ⏭ THE REST OF THE DISCARD FAMILY IS **MORE EXPENSIVE THAN IT LOOKS** — sized, not built
> Two arms remain, and neither is a parser arm despite appearances:
> · **FILTERED** ("whenever you discard a CREATURE card" — Hashaton; "an ARTIFACT card" — Urza, Mishra).
>   `checkDiscardTriggers(state, playerId, count)` never receives the discarded CARD, so there is nothing to
>   filter on. Threading it is a signature change across **12 call sites** — and this time that count is
>   real, unlike the one I mis-derived for the event itself.
> · **COUNT-SCALED** ("whenever you discard TWO OR MORE cards" — Scrounging Skyray, Cryptcaller Chariot).
>   The checker takes a count, so a batch descriptor could fire once at `count >= N` — but **11 of the 12
>   call sites pass a literal 1** (only the discard-your-hand atom passes a real total). A per-card loop can
>   never satisfy a two-or-more batch, so the arm would be a permanent false negative until the cost paths
>   batch their discards. Safe, but worth ~0 cards today.
> ⭐ Both are honest FNs right now. Build the CARD-threading first: it unlocks the filtered arm AND is what a
> correct batch count would ride on.

> ### ⚠️⚠️ I SIZED THE DISCARD BUILD WRONG — **read the fire site before you size the build**
> The entry below called it a 12-site plumbing job needing a new chokepoint, and I nearly deferred it as a
> subsystem. It needed none of that: `checkDiscardTriggers` already existed and was already called from every
> discard path, COST sites included. It simply scanned `opponentsOf(discarder)` and stopped — the discarding
> player's own permanents were never consulted. **The entire build was a second loop.** +16.
> Counting call sites priced the plumbing of an event that was already plumbed. **Open the checker before
> counting the callers.**

> ### ⭐⭐ THE RICHEST INSTRUMENT FOUND ALL DAY: **a mechanic half-declared vacuous is a vein**
> +75 in one strip — the biggest slice of the run — and it was an INCONSISTENCY, not a gap. The codebase
> already stripped `morph {cost}` as vacuous and wrote out exactly why (no morph lane, every carrier hard-casts
> face up). The very same note then left the flip TRIGGER as residue. **One unreachable path, two treatments,
> 75 cards parked.** Grep the comments that justify a strip and check whether a SIBLING clause of the same
> mechanic was left behind. Then re-verify the preconditions yourself — vacuity is not transitive.

> ### ✅ DONE (+16): the SELF-DISCARD trigger — and what's left of that family
> `Whenever you [cycle or] discard a card` now detects on the shipped `discarded` event via a new `youDiscard`
> scope, with `checkDiscardTriggers` gaining a scan of the DISCARDING player's own sources. The prize-probe
> predicted 33; the honest flip-diff is **16** — the probe was optimistic because it also stripped referents
> ("that card", "that many"), so effects reading the discarded card don't survive.
> ⏭ **Still open, same event, different arms:** the COUNT-scaled forms ("whenever you discard TWO OR MORE
> cards" — Scrounging Skyray, Cryptcaller Chariot) and the FILTERED ones ("discard an ARTIFACT card" —
> Urza/Mishra). The scan exists now, so these are parser arms rather than plumbing.
> ⛔ CYCLE-ONLY forms stay refused (Stoic Champion, Warped Researcher): routing them through the discard
> event would fire them on an ordinary discard. They need a real cycling event.

> ### ⛔ WHERE THE VACUITY INSTRUMENT STOPS — attractions, contraptions, stickers (96 sole-blockers) DON'T qualify
> Tempting after the +75, and wrong. Morph is vacuous because the EVENT never occurs — the engine has no way
> to turn anything face up. "When this creature enters, open an Attraction" is different: **the ETB genuinely
> fires**, and only the EFFECT is unimplemented. Stripping it would credit a card whose trigger does nothing —
> the exact FP class the strip instrument is supposed to avoid. **The test is whether the EVENT is
> unreachable, not whether the effect is unbuilt.**

> ### ⚠️⚠️ A SURVIVING MUTANT MEANT A BAD PIN — for the THIRD time today
> Dropping the strip's leading anchor changed no outcome in any pin I'd written. The case that changes is a
> compound "enters or is turned face up" carrier whose ETB effect is UNMODELLED: with the anchor it parks,
> without it the sentence is stripped and the card is credited native **while its trigger silently vanishes.**
> **When a mutant lives, write the card that distinguishes the two worlds — don't delete the guard.**

> ### ⛔⛔ TWO WAYS A DELETION PROBE OVERCOUNTS — both bit me today, both caught before building
> ① **TOKENS.** "Is all colors" read 8 would-flip; the tier snapshot excludes tokens, so the real number was
> 3. Filter to real cards or the payoff is fiction.
> ② **TWO SENTENCES ON ONE LINE.** Stripping whole LINES removed Fallaji Wayfarer's colour-identity
> disclaimer along with its colour static, turning a non-flip into a flip. 3 → **2**.
> **Re-check the number against the real cards before opening a file** — a probe is a candidate generator,
> and it lies in the optimistic direction.

> ### ⭐ THE OTHER HALF OF THAT LESSON: a precise probe can also say DON'T BUILD
> "If you cast it from your hand" looked like 14 cards. Stripping only the conditional ENTERS-WITH line says
> **2** — and both want a counter kind the engine does not enforce, which `isHonestEnterCounterKind`
> correctly refuses. The condition itself has been modelled all along. **Zero payoff and a CREED violation,
> avoided by one targeted probe.** Detail in the run ledger.

> ### ⚠️⚠️ MEMO POISONING ISN'T JUST AN AURA PROBE HAZARD — it nearly shipped a WRONG PIN
> `parseAttachedBonus` caches into a slot on the permanent. Probing several EQUIPMENT cards in one process
> read a neighbour's bonus and told me a base-P/T-set wording was native AND correctly gated; I began writing
> a pin asserting it works. One card per process, the truth inverts — it parks, correctly, because that
> descriptor has no `layerOp` for a gate to ride. **Two rules: probe attachments ONE CARD PER PROCESS, and
> never swap `card` on a live permanent in a harness** (the slot is already warm — that cost a false failure
> in the same hour).
> ⭐ Silver lining worth copying: chasing the contradiction turned a guard I was about to label "defensive and
> unexercisable" into a live, mutation-killed one. **When a guard looks unexercisable, probe harder before
> you document it as dead.**

> ### ⭐ VACUITY IS NOT TRANSITIVE — re-verify the precondition for each new line you strip
> "Escapes with N +1/+1 counters" is inert for the same reason the escape COST line is: the runtime never
> offers a graveyard re-cast. Tempting to inherit the argument — I checked all twelve carriers of the new
> line myself instead (every one has a printed mana cost AND an escape line, so each is playable with the
> rider dormant). **A strip justified by another strip's evidence is a strip with no evidence.**
> ⛔ And strip the SENTENCE, not the line, when a real effect shares it — Polukranos' "enters with six +1/+1
> counters" lives on the same line as its escape rider.

> ### ⚠️⚠️ A PRINTED WITNESS TOLD A BROKEN **HARNESS** FROM A BROKEN **FIX** — read the values, not the verdict
> The self-prevent pin failed with `shields: []` — identical to the bug it was written to catch. The fix was
> fine; my harness called `runEffectProgram(state, program, ctx)` when it takes a STACK OBJECT with the
> program in `payload.params`, so confidence read `undefined` and nothing ran. **A boolean pass/fail would
> have sent me to rewrite working code.** When a Law-6 pin fails, check the harness signature BEFORE the fix.

> ### ⛔ THE LACCOLITH FAMILY — **SIZED AND NOT BUILT** (5 carriers, 0 native). Two mechanics, not one clause.
> "Whenever this creature becomes blocked, you may have it deal damage equal to its power to target creature.
> **If you do, this creature assigns no combat damage this turn.**" The TRIGGER is already detected correctly
> (event + scope + effectClause all present) — it is the EFFECT that has nothing. Both halves are missing:
> `deals damage equal to its power to target creature` parses LOW even standalone, and **"assigns no combat
> damage this turn" does not exist anywhere in the engine** (grep finds only a CR quotation in a comment).
> The second half is a combat-resolution change of the same class as the redirection one below, and the
> drawback is not optional — modelling only the damage would hand these cards a free ping. Laccolith Rig
> needs the attached-trigger seam on top. **Don't open it as a parser slice.**

> ### ⛔ DAMAGE REDIRECTION — **SIZED AND DELIBERATELY NOT BUILT** (8 carriers, 0 native). Read this first.
> "The next N damage that would be dealt to X this turn is dealt to <Y> INSTEAD" — the en-Kor cycle (6),
> Carom, Ward of Piety. Prevention is built (~48 native); redirection is not (CR 615.x). **The blocker is
> structural, not parsing:** the non-combat path (`applyDamageEffect`) could redirect today, but the COMBAT
> path funnels every hit through `consultCombat`, whose contract is *"return the reduced amount"* — it has no
> way to EMIT damage at a third permanent. Building only the non-combat half would make the en-Kor cycle work
> against burn and silently do nothing against combat damage, **which is the entire reason those cards exist**
> — a card reading native while failing its primary use. CREED forbids it.
> **What it actually needs:** give the combat funnel a way to return `{amount, redirects:[{targetId, amount}]}`
> and have the damage loops apply the extra deals (with their own lethal/SBA pass). That is a combat-resolution
> slice with its own runtime pins, not a parser slice. Don't open it as a wording fix.

> ### ⭐⭐ THE RICHEST SHAPE ISN'T A WORDING GAP — IT IS A **MISSING QUESTION**
> +12 in one slice, the biggest of the run. Every counter filter the engine had asked about the target
> spell's OWN characteristics (type, mana value, color); **none could ask what that spell was POINTING AT.**
> Fourteen carriers across nine wordings sat behind that one absent predicate. A wording gap flips 2–4 cards;
> a missing question flips a dozen. **When several unrelated wordings all park, ask what QUESTION the code
> cannot ask — not which regex is too narrow.**

> ### ⛔⛔ A 0-NATIVE LINE TALLY IS A **CANDIDATE, NOT A CAUSE** — verify with ONE command first
> The scoped-shape probe (tally every "target <noun> you control" line native-vs-parked, keep the 0-native
> ones with 3+ parked carriers) returned five. Two were real and shipped (**tuck +8, untap +4**). Of the rest,
> **two already parse HIGH** — Soulstinger / Defiant Greatmaw / Plague Belcher park on their SECOND abilities,
> and the fight mode likewise. A line-shape tally only proves the line CO-OCCURS with parked cards; the
> census's sole-blocker DELETION probe is what proves causation.
> **Before opening any file: `parseEffectClause(splitClauses(clause)[0], type)` and read the confidence.**
> One command, and it would have saved a whole wasted build.
> ⏭ **Genuinely open from that probe:** "counter target spell that targets a permanent you control" (3) and
> the en-Kor damage redirection (6). Both confirmed LOW.

> ### ⚠️ FOUR REFUSAL-PIN LIFTS IN ONE DAY — **a refusal list is a TODO list with the reasons pre-written**
> landTuck, graveyardToTopMulti, delayedTrigger, formidableSpeaker all had FN-guard lines that this run's
> slices made obsolete. Every one was REWRITTEN to assert the new truth with the history attached, never
> deleted. When a slice turns an old refusal red, that is the refusal being EARNED, not a regression — but
> read it carefully first, because a genuine regression looks identical from the exit code alone.

> ### ⭐⭐ THE CHEAPEST BIG SLICE OF THE DAY: **a parser that has NO RESTRICTION LANE**
> `tuckClauseParser` was one anchored regex. Bare "put target creature on top of its owner's library" native
> on 7; "…you control" native on ZERO; "attacking or blocking" native on ZERO. **+8 in one edit**, with
> nothing new at runtime — both restriction kinds already ship and the target spec already forwards them.
> **Go look for other single-regex clause parsers whose comments say a scoped variant "fails the anchor".**
> That phrase is a coverage vein, and grep finds it.

> ### ⭐ AND IT IS THE CLEANEST GATE-20 EXAMPLE I HAVE
> Four Guildmage-shaped creatures sharing a symptom proves nothing — they could share a Guildmage problem.
> The attacking-or-blocking SPELLS are the cards OUTSIDE that family with the same symptom. Finding them is
> what turned two guesses into one slice. **Always go find the out-of-family carrier before batching.**

> ### ⭐⭐ THE MOVE OF THE DAY: **REFUSE, WRITE DOWN WHY, THEN EARN IT NEXT SLICE**
> "Any number of target …" was one regex from +5 — and that regex would have been WRONG. `targetSubsets`
> filled from the SMALLEST subset upward against a 64-option cap, so on a 10-card graveyard the largest
> option offered was THREE: "put them ALL back", the whole point of those cards, was unavailable. Slice one
> refused the wording and recorded the measurement as a spec. Slice two fixed the enumeration order and
> earned it. **A refusal with its reasoning attached is a scoped next slice, not a dead end** — and the mutant
> now reproduces the old `largest: 3` so the reason can't rot.

> ### ⚠️ A FIXTURE WRITTEN FROM MEMORY SURVIVED IN THE SUITE UNTIL A SLICE MADE IT GO RED
> `delayedTrigger.test.js` used "Bone Harvest … put up to THREE target creature cards" — the real card says
> **ANY NUMBER**, and it is an Instant. It only surfaced because modelling the up-to-N wording turned the pin
> red. **A green suite does not certify its fixtures.** When a pin uses a named real card, the oracle must
> come from the corpus, not from recall (§1.2).

> ### ⭐⭐ A SURVIVING MUTANT MEANS **THE PIN IS WRONG**, NOT THAT THE GUARD IS UNNECESSARY
> Removing a scope gate broke nothing, because the pin I'd written tested the PARSER rather than the gate.
> The tempting read — "the guard is dead code, delete it" — was wrong: the case that fails is a NON-SELF
> watcher, which without the gate classifies native and locks the WRONG permanent. **Go find the case the
> guard protects and pin THAT.** Verify it live before writing the pin.

> ### ⚠️ CI `cancelled` IS NOT `success` — back-to-back pushes cancel the older run
> Pushing slices in quick succession cancels the in-flight run for the earlier SHA (concurrency group). The
> content is still covered by the newer run on a linear history, but **`conclusion: "cancelled"` must never be
> read as a pass.** Check the newest SHA's conclusion, and if a specific commit needs its own green, space
> the pushes or re-run it.

> ### ⛔⛔ A SENTINEL CONTAINING " and " NEEDS ITS KEEP-WHOLE GUARD IN THE SAME EDIT — twice burned now
> Detector ✅, rewrite ✅, atom matcher ✅, each verified in isolation, and every carrier still parked:
> `splitClauses` shatters a sentinel on its internal " and " and the program silently drops to LOW.
> **Three green components and a card that still does nothing.** The tap-creature-lockdown slice recorded
> this exact failure in its own header; the Kashi-Tribe slice hit it again anyway. If you write a sentinel
> with " and " in it, add the `splitClauses` keep-whole line before you measure.

> ### ⭐⭐ PROBE THE PRIZE BY NEUTRALIZING THE CAUSE **BEFORE** BUILDING IT
> "Whenever this creature blocks a creature" was 0-native across 14 cards — a whole missing EVENT, and it
> looked like a 14-card slice. Before writing anything I swapped the unmodelled event for the already-modelled
> per-creature sibling and re-classified: **ZERO flipped.** Every one of the 14 is ALSO blocked by its effect,
> so the honest prize was 3. **A sole-blocker count tells you a line blocks a card; it does NOT tell you the
> line is the ONLY thing blocking it.** The swap costs one probe and re-scopes the slice before the build.

> ### ⭐⭐ THE HIGHEST-YIELD INSTRUMENT RIGHT NOW: **split a shape by tier, then ask WHY the native side is native**
> `doesn't untap during its controller's next untap step` — 33 native / 63 parked, and every native carrier
> shares one wording: the lock rides a tap in the SAME sentence. The runtime never needed the tap; only the
> MATCHER did. **When a shape's native side is unanimous about some incidental wording, that wording is the
> gate.** Fresh census (2026-08-05) shows the shelf is thin — top clusters are 4-6 cards — so these
> wording-gate finds, not new subsystems, are where the remaining cards live.

> ### ⚠️⚠️ A WITNESS YOU CAN'T SEE IS A HOLLOW GATE — **vitest 4 swallows `console.log`**
> Law-6 witness rows print NOTHING under a plain `vitest run`; the pass reads clean and the row you were
> relying on never existed. Add **`--disable-console-intercept`** and read the values with your own eyes.
> Every printed-value witness in this file's method was written before vitest 4 — re-check yours.

> ### ⚠️⚠️ AURA PROBES ARE MEMO-POISONED — classify in a FRESH PROCESS
> `parseAttachedBonus` memoises into a slot, which makes **`isNativeAura` ORDER-DEPENDENT**: the same card in
> the same process answered `false / bonus=[]` or `true / bonus=3` depending on which predicate ran first.
> Two probes minutes apart disagreed and both looked authoritative. **One card per process, or warm the memo
> identically every time.** This is live in the codebase now, not a historical note.

> ### ⚠️⚠️ A FEATURE CAN BE BUILT, PINNED, AND STILL UNREACHABLE — test REACHABILITY
> The colour-OR gate arm shipped long ago and was **dead** in one clause position: the control-gate arms
> above it matched on a `(.+)` type group and `return`ed even when no gate parsed, swallowing the clause.
> Two cards flipped from that fix with **no new gate at all**. When a feature "exists" but a census shows
> zero natives, **check that the code path is reachable from that position** before building anything.

> ### ⚠️⚠️ DON'T TRUST A REFUSAL COMMENT — +9 sat behind one that had stopped being true
> The gate parser said *"you've drawn N or more cards this turn" has NO ledger*, and an FN-guard pin
> repeated it, so it looked VERIFIED. `cardsDrawnThisTurn` had been in gameState the whole time. **A stale
> "we can't do this" note converts a gap into a decision nobody re-examines.** When a census shows a big
> zero-native cluster, **check whether the refusal still holds.**

> ### ✅ RESOLVED: when a file is an ALLOWLIST, extend the allowlist
> The Elder Dragons landed **+5 / 0 / 0** from ONE anchored arm after two "more general" rewrites of the same
> seam measured −25 and −29. `rewriteSelfNameToThisCreature` is a list of exact grammars by design; the
> general fix wasn't the smaller change, it was the one that moved 30 cards the wrong way. Post-mortem below.

> ### ⛔ THE FAILED ATTEMPTS — two global rewrites, −25 and −29
> The Elder Dragons park because the trigger EFFECT CLAUSE keeps the printed name while the SUBJECT matchers
> understand it. Both fixes looked surgical; one stripped the reminders storm/cascade are read from, the
> other produced "this permanent" for a Creature and dropped 29 epithet legendaries. **Normalise
> per-descriptor where the type is known, or teach the one matcher — never rename globally.** Full
> post-mortem + the real fix in the run ledger.

> ### ⭐ THE INSTRUMENT TO KEEP RUNNING: **re-check RUNTIME refusal comments** — 6 bugs, 6 slices
> ⛔⛔ **NEWEST, AND THE LOUDEST: PLATINUM ANGEL WAS A 4/4 FLIER.** `isPlayerDead` enforced every lose
> condition and `hasWonGame` enforced winning — with **no exemption read anywhere**. And **Abyssal
> Persecutor played BETTER than printed**: it prints both halves inverted (*its* controller can't win), so
> the engine handed its controller the win outright. **A drawback the engine skips is not a safe false
> negative.** Whenever a card's text is entirely a restriction, ask who reads it.
> ⭐ **THE SHAPE THAT KEEPS RECURRING:** a rule the engine DOES enforce, whose **modifier or exemption side**
> was never modelled — with a comment explaining the gap as deliberate. legend rule → exemption unmodelled
> (Mirror Gallery inert). Max hand size → modifier unmodelled AND a blanket fail-open (Cursed Rack gave its
> own controller an unlimited hand). **Ask of every enforced rule: what turns it OFF, and is that modelled?**

> ⚠️ **AND ONE STALE COMMENT SEEDED THREE OF THEM.** cloneCopy.js's "the legend rule is UNENFORCED by the
> engine" was cited as settled by later work, so it produced Spark Double killing your commander, Miirym
> doing nothing, AND Mirror Gallery doing nothing. **When you find an expired refusal, grep for everything
> that CITES it** — the blast radius is bigger than the one line.

> `grep -rn "unenforced\|not enforced\|not modeled" src/lib/learn/*.js` → check each note against TODAY's
> engine. **Three live bugs in three consecutive slices** came out of it: ward—discard (creatures targeted
> for free), clone isn't-legendary (Spark Double killed your commander), token-copy isn't-legendary (Miirym
> did nothing at all). **A refusal comment is a claim with a timestamp** — and all three measured **+0**, so
> a flip-diff would never have found them. **The sweep is NOT exhausted.**

> ⏮️ (done) tokenCopy's "isn't legendary"
> Its twin in `cloneCopy.js` shipped today: the no-op justified by *"the legend rule is unenforced"* had
> become a live FP that **destroyed the player's commander**. `tokenCopy.js` still swallows the same rider
> inside `TOKEN_COPY_RE`. Fix shape is in the run ledger (carry a `notLegendary` flag on the atom, pass the
> `stripLegendary` rider to `snapshotCopiedCard`).
> ⭐ **THE INSTRUMENT THAT FOUND BOTH:** grep RUNTIME files for "unenforced" / "not enforced" / "not modeled"
> and re-check each note against today's engine. **A refusal comment is a claim with a timestamp** — two
> live bugs in two slices came from expired ones.

> ### ✅ WARD—DISCARD SHIPPED — +0 coverage, REAL rules gap closed
> ⚠️ **The lesson to carry:** ward is enforced at the TARGETING chokepoint, which is **tier-independent**, so
> those 12 creatures were being targeted **for free** regardless of their coverage tier. **A flip-diff
> measures classification, not correctness** — a 0 is not proof there was no bug. When a mechanic is
> enforced outside the classifier, check the RUNTIME seam before judging a slice by its flip count.

> ⏮️ (superseded) WARD — DISCARD A CARD scoping
> Scoped in full in the run ledger, not started. The structured ward-cost descriptor and the two-stage
> discard-payment chain BOTH already exist; the work is joining them inside the soft-counter settlement.
> Care points named there: the payer is the OPPONENT, the AI needs an auto-picker, and an empty hand must
> resolve as **can't pay → countered** rather than a free pass.

> ### ⭐ THE SHARPEST LENS RIGHT NOW: **compare a shape against its SIGN/SCOPE TWIN**
> Two slices in a row came from it. `+1/+1` enters-with was native on 28 and `−1/−1` on **ZERO** (one character).
> "from A graveyard → its owner's library" was native on 10 while "from YOUR graveyard → YOUR library" was
> native on 1. **When a shape is native on many, look for its mirrored wording and tally that separately** —
> the engine is usually already able to do the harder half.

> ### ⚠️ I MISREAD MY OWN CENSUS — a LINE census is not a SOLE-BLOCKER census
> This report suggested "you have no maximum hand size" (22) and "you may play an additional land" (14) as
> next targets. **Both are already modelled and enforced** — Azusa and Exploration are native today. My
> player-statics census counted cards whose LINE matched, not cards the line BLOCKS, so it over-counted
> exactly the way the counterweight note below warns. **Use `build-residue-census` (sole-blocker probing)
> to pick targets; use line censuses only to split a KNOWN shape by tier.**

> ### ✅ THE PLAYER-STATIC PATTERN — two subsystems, two slices, +7
> **player hexproof (+4)** then **can't-gain-life (+3)**, both on one shape: an **INERT layer-6 op the layer
> engine skips, with exactly ONE consumer**. No new affects-scope, no collector had to learn anything.
> **Reach for this for every remaining player-scoped static** — "you have no maximum hand size" (22 carriers)
> and "you may play an additional land" (14) are next, and `landDropAllowance` already exists for the latter.
> ⛔ Watch the SCOPE: a symmetric "players can't …" must bind its own controller too.

> ### ✅ FIRST SUBSYSTEM OF THE NEW MODE SHIPPED: **player hexproof** (+4)
> Proof the subsystem mode works at the expected size. The pattern that made it cheap: **an INERT layer-6 op
> with exactly one consumer** (the `assignsCombatDamageWithToughness` precedent) instead of inventing a new
> affects-scope every collector would have to learn. **Reach for that shape for the next player-scoped
> static** — Orbs of Warding's damage prevention and the "you can't lose / opponents can't win" family are
> the same problem.

> ### 🛠 THE MODE HAS CHANGED: IGNITION IS EXHAUSTED, WHAT'S LEFT IS SUBSYSTEM BUILDING
> Probed each top census candidate for existing machinery. **None of them is ignition.** Every one needs a
> mechanism that does not exist yet, and each is worth only 4-6 cards:
> · **sunburst** (6) — needs mana-SPENT-BY-COLOUR tracking · **take the initiative** (6) / **open an
> attraction** (6) — whole subgame states · **double team** (6) — needs conjure · **specialize** (5) — a
> whole mechanic · **"a +1/+1 counter for each time it was kicked"** (5) — kicker is tracked as a BOOLEAN,
> multikicker has no count · **damage-prevention shields** (5) — damage redirection · **mana batteries** (5)
> — an X-cost mana ability · **player hexproof** (4) — player-TARGETING legality, which does not exist ·
> **escape-with-a-counter** (4) — needs escape.
> ✅ **Plan accordingly:** budget a subsystem per slice and expect 4-6, or pick the two with the widest
> downstream reach (**player-targeting legality** unlocks more than its 4; **multikicker counting** is
> narrow). The cheap "the mechanism exists, wire it up" era is over — four slices today were ignition and
> that vein is now dry.

> ### 📉 THE EASY VEINS ARE GONE — fresh census, top cluster is SIX
> `build-residue-census` (2026-08-05): 34,245 scanned · 20,739 non-native · **11,252 sole-blocker cards**,
> and the largest single shape is worth **6**. Expect 2-6 per slice now, not 9-13. Ranked candidates with
> ZERO native carriers are listed in the run ledger — sunburst, take-the-initiative, double team, specialize,
> mana batteries, player hexproof, the Elder Dragon upkeep sacrifice.

> ### ⚠️⚠️ MAKE THE RUNTIME DRIVE CONSUME THE PARSER'S OUTPUT
> A slice with a parse half and a runtime half can have BOTH green and still be broken. My drive passed a
> hand-written atom, so a typo in the parser's keyword string left the runtime row passing — each half
> tested, the seam between them not. Feed the **parsed** atom into the resolver.

> ### ✅ THE COUNTERWEIGHT: "N carriers, 0 native" ≠ "the condition is the blocker"
> The gate census paid +4 (monstrous) and +9 (cards-drawn) because those had **fully modelled effects behind
> an unmodelled condition**. The Lieutenant family ("you control your commander", 7 carriers, 0 native) looks
> identical in the census and would flip **ZERO** — every carrier is blocked by a quoted-ability grant or a
> group anthem instead. **Check the EFFECT side of every carrier before building a gate.** The census cannot
> tell the two apart.

> ### ▶️ START HERE: **CENSUS THE GATES, NOT THE EFFECTS** — the live vein map is in the run ledger
> When the rider census dried up, tallying the as-long-as CONDITIONS native-vs-parked immediately found a
> fully-modelled effect sitting behind a condition the parser didn't know (monstrous: +4 for TWO LINES).
> The ledger entry lists ~10 more conditions with **zero** natives, biggest first, **and names the two that
> must be REFUSED** ("remains tapped", "remains on the battlefield" — they scope lockdown/control effects
> on OTHER permanents, not self buffs; reading them as self gates would be a false positive).

> ### ✅ GOAD SHIPPED (+2) — both halves, driven on a 4-player board. Next: see the run ledger.
> ⚠️ **NEW TRAP WORTH THE READ: a card name can resolve to a TOKEN entry.** "Mark of the Rani" does —
> it classifies and flips, but `tier-snapshot` correctly excludes it, so pins built on it prove a gain the
> instrument will never count. **Check fixture provenance, not just that `lookupCard` returned something.**

> ### ⏮️ (superseded) GOAD scoping — ~15 carriers
> A **subsystem, not a slice**, so it was left clean rather than half-built. Half of it already exists: the
> `mustAttack` pseudo-keyword shipped today is goad's first half. The second half — *"attacks a player
> other than you if able"* — has nothing. **Two named traps, both in the ledger entry:** "if able" means the
> creature MUST still attack the goader when they're the only legal defender (a naive defender filter makes
> it attack nobody — an illegal board, a false positive), and **"you" is the GOADER, not the controller**.
> Start with the 8 AURA statics; the triggered forms need an until-your-next-turn duration on top.

> ### ⚠️ A FIX THAT MEASURED RIGHT AND WAS STILL WRONG — the flip-diff could not have caught it
> Widening a gated lane, I first added a **generic arm in the MIDDLE** of the control-gate block. It
> intercepted clauses the SPECIFIC equipped/counter/graveyard lanes owned and handed them the wrong gate
> shape. **Same +10 / 0 / 0.** Six pins across four files are what caught it. **A generic fallback belongs
> LAST, never mid-block** — and check whether the right home already exists before adding an arm (it did).
> Pair this with the standing rule that a clean flip-diff is not proof of a safe change.

> ### 🔁 THE HIGHEST-YIELD LENS RIGHT NOW: **re-cut a census by RIDER, not by ability word**
> Two slices back-to-back (+9, +10) came out of one observation — **every gated lane in
> `staticAbilityParser` demanded the effect open with "gets" or "has"**, so any gate carrying a bare
> permission or restriction parked even though `emitGatedEffect` already understood the rider. Nothing
> routed it there. Ask of any parked family: *is the mechanism missing, or only its entry point?*

> ### ⛔ A CORRECTION TO THIS FILE — it queued 38 cards behind a cause that does not exist
> This report said threshold + spell mastery + lieutenant "share ONE cause". **They share an ability WORD.**
> Censused: **91 parked across 82 distinct effect shapes.** Gate 20 exactly — grouped by symptom — and I
> wrote the claim here myself, so it read as settled to every seat that booted on it. **Do not queue those
> 82 as one job.** What works: **re-cut the census by RIDER**, not by ability word. That produced the +9
> can't-block / can't-be-blocked cluster in one pass, and the next one is already scoped:
> **"can attack as though it didn't have defender" — 8 carriers, 0 native.** ⛔ That one is NOT ignition:
> an as-though effect (CR 609.4b) is not a keyword removal, so `removeKeyword:defender` would be observably
> wrong to everything else that reads defender. It needs its own pseudo-keyword honored at BOTH
> attack-declaration enumeration sites.

> ### 🧭 THE SWEEP IS AT ZERO — and that is the point, not a footnote
> `phantomParenSweep.test.js` holds the last two (champion, fading-"seven"), both at **+0 flips**, both
> shipped. **A phantom is a wrong DATA SHAPE, not a missing feature** — on graft it sat as a *hidden second
> blocker* and would have fired a bogus trigger the moment the first cleared. An instrument only reads true
> at zero. **Re-run the sweep after any reminder-strip work or bulk Scryfall refresh.**
> ⛔ **AND ONE THING WAS BUILT, MEASURED, AND WITHHELD** — the "obvious" widening to accept Scryfall's
> re-worded self form ("When this **leaves** …", noun dropped). Sweeping with every parenthetical removed
> found **ZERO real carriers**: unexercisable code, guarding a *safe* false-negative. Patch recorded beside
> both anchors. **121 long-form carriers will migrate as sets re-print — that is when it ships.**

> ### 🔎 THE PHANTOM-TRIGGER TELL — seen SIX times, and the last two were **HUNTED, not stumbled into**
> (fading · vanishing · squad · impending · **graft** · **champion**)
> A keyword's REMINDER TEXT can contain a real trigger sentence ("At the beginning of your end step, …",
> "Whenever another creature enters, …"), and the trigger anchor catches it INSIDE the parens. The
> descriptor routes UNNATIVELY and parks the card.
> **The signature is unmistakable once you know it: the effectClause ends with a STRAY `)`.** If a keyword
> is credited and its carriers still park, dump the descriptors and look for the paren before anything else.
> ⭐ **AND NOW IT IS A SWEEP, NOT A HUNCH.** After the fourth instance I stopped waiting for the next card
> to trip me and scanned the whole corpus for descriptors with an unbalanced `)` — that found graft cold
> (12 carriers, 0/12 routing). **Re-run that sweep after any reminder-strip work.** It is 5-for-5.
> ⛔ Graft's second lesson, gate 20's cousin: teaching `entersWithPlusCounters` a new shape made
> **coverage's** enters-with strip start firing on cards it had never seen, and that strip is not
> paren-aware — it cut inside the reminder and left orphan residue. **When you widen a helper, check who
> else consumes it.** Fix was the existing Ravenous exemption, three lines up.


> ### ⭐ THE CHECK THAT PAID TWICE TODAY: **when a pin refuses something, test its REASON against the
> list the pin lives in.** Cipher was refused for "changing the card's disposition" while BUYBACK — same
> disposition change, same optionality — sat stripped three entries away. The refusal was the
> inconsistency. Champion crossed the *opposite* line the same day and for the opposite reason (credited
> because ENFORCED, never for being declinable). **Both calls are now pinned as a PAIR in cipher.test.js**
> so the next declinability claim has something concrete to test against.


> ### ✅ CHAMPION — **SHIPPED (`c0f3fb30`, +6).** Design kept below; it held exactly as written.
> "Champion a Kithkin *(When this enters, sacrifice it unless you exile another Kithkin you control. When
> this leaves the battlefield, that card returns to the battlefield.)*" — Thoughtweft Trio, Changeling
> Berserker, Nova Chaser, Mistbind Clique et al.
> **THE RETURN HALF IS FREE.** `applyExileUntilLeaves` stamps `detainedExile: [{cardId, ownerId}]` on the
> SOURCE permanent, and `checkLeavesTriggers` synthesizes the return on ANY exit (CR 610.3a). Champion's
> "when this leaves, that card returns" IS that mechanism — so the build only has to produce the exile and
> the link, never a second trigger. ⛔ Do NOT also synthesize an LTB trigger: that double-returns the card
> (the same trap the two-trigger detain fold documents).
> **WHAT'S ACTUALLY NEW — two things:**
> ① the exiled permanent is **YOUR OWN and CHOSEN, not targeted** (champion never prints "target"), so it
>    picks at RESOLUTION exactly like populate's `creatureTokenYouControl` source — same precedent, same
>    deterministic-and-stated policy. Pick the WEAKEST eligible (power+toughness, ties by id): keeping the
>    champion body is the obvious play and any legal pick is faithful.
> ② the **sacrifice fallback** when no eligible creature exists. Not optional — "sacrifice it UNLESS" means
>    a player with no eligible creature MUST sacrifice.
> **THE THREE-PIECE KEYWORD PATTERN APPLIES** (see the ingest entry — each piece looks like the finish
> line): ① atom + resolver · ② keyword→trigger synthesis in detectTriggers + the shaped-count bump in
> `allTriggerSentencesModeled` · ③ credit the bare "Champion a <X>" line in the `isKeywordOnly` list.
> ⛔ EXCLUDE SELF from the eligible pool ("another"), or the card exiles itself and never comes back.

> ### 🔭 NEXT SLICES, ALREADY SCOPED — start here, the probing is done
> Fresh sole-blocking-line rank (re-run after the +103, so these are current):
> · ✅ **INGEST — SHIPPED (`74b69e8c`, +8).** Was: Its effect is *"that player exiles the top card of their library"*.
>   The MILL twin is already native with the exact same shape: `{op:"mill", who:"damagedPlayer", amount:N}`.
>   Needs a parallel `exile-top-of-library` atom + resolver, with `applyMill`/`millOnePlayer` as the
>   template. ⛔ **It cannot be ALIASED to mill** — milled cards land in the graveyard where recursion can
>   reach them, exiled ones don't. A real destination, not a rename.
> · **THRESHOLD (21) + SPELL MASTERY (12) + LIEUTENANT (5) share ONE cause** — and it is NOT the gate.
>   Measured: the gates all parse (Nimble Mongoose is native; the graveyard-count and the leading/trailing
>   orders both work). The blocker is that `emitGatedEffect` consumes only `gets +X/+Y [and has <kw>]`, so
>   every COMPOUND gated effect parks. Largest sub-shape is a **gated QUOTED-ability grant (17)** — but
>   ⛔ the UNGATED form (`This creature has "<quoted>"`) does not parse either, so that is a BASE gap, not a
>   gating one. Fix the ungated self quoted-grant first; the gate is already waiting.
> · ✅ champion SHIPPED · ✅ cipher SHIPPED · ⛔ **clash (9) is NOT one cause** — measured: its nine
>   "if you win" bonuses are nine DIFFERENT unmodeled effects, so modelling clash alone flips nothing.
> · Untouched, each a real build: take the initiative (8, drags in
>   the Undercity dungeon) · specialize (6) · double team (5) · sunburst (5) · mana batteries (5).

> ### ✅ **COLTON'S +100-EXTRA ORDER IS COMPLETE at +103** (94 → 197 this sitting).
> Eight slices, ONE lens, and it is the lens worth keeping: **find the built engine with no ignition.**
> Every one of these was a mechanism someone had already finished, missing only its entry point —
> battalion (label + condition) · inspired (event, firing site and scope gate all shipped with Mesmeric
> Orb) · populate (one copy-source on a complete minter) · the detain fold (an older PRINTING of a modeled
> frame) · the named tutor (`sourceZones` built for Finale) · fixed-type reveal (the choose-a-type resolver).
> **Before writing a new mechanism, grep for one that already exists and count its producers.**


> ### 🎯 THE LENS THAT REOPENED THE CORPUS AFTER IT MEASURED "EXHAUSTED": **sole-blocked BY MECHANIC**
> The exhaustion finding below is still true *for the census*, which groups by exact clause and caps at 4.
> Tallying **keyword MECHANICS** by sole-blocked carriers instead found **+51 in five slices**, because one
> implementation covers every carrier of a mechanic. Battalion alone was 22 carriers / 0 native.
> **The shape to look for: a mechanic whose RUNTIME already exists but whose DETECTOR or LABEL is missing.**
> Inspired's event, firing site and scope gate had all shipped with Mesmeric Orb; only the detector was
> absent. Self-dealer destroy's whole pipeline existed for the Toxin Sliver twin. Look for a built engine
> with no ignition before writing anything new.

> ### ⛔ CORRECTION 32 — **A CLEAN FLIP-DIFF CANNOT SEE A DEAD TRIGGER**
> The self-dealer destroy slice measured **GAINED 5 / LOST 0** with a trigger that fired **ZERO times**.
> Reusing `scope:"self"` was the error: that scope asks *triggeringPermanent === sourcePermanent*, but the
> triggering permanent is deliberately the DAMAGED creature (it is the destroy target, threaded so "that
> creature" binds) while the dealer is the watcher — never equal. Five cards would have shipped native with
> an ability that can never happen.
> **Rule: for any TRIGGER slice, a flip-diff proves recognition and NOTHING about firing.** Drive the
> firing site. Same slice also caught a PREFIX effect-anchor crediting "destroy that creature AT END OF
> COMBAT" as immediate — anchor the WHOLE effect, or a delayed payoff resolves early.


> ### 🛑 MEASURED: **THE CORPUS'S CHEAP VEINS ARE EXHAUSTED.** Three scoping probes, three decisive zeros.
> Run these before proposing any "big family" build — each one killed a build that looked obviously worth it:
> · **Composition failures across every parked instant/sorcery: `1`.** Scanned 4,782 arbiter-spells for the
>   shape that paid all night (every clause parses ALONE, whole program empty). The single hit is **Witch's
>   Mark — the card already built, measured and REVERTED today**. The parser-assembly vein is *provably*
>   dry; there is no second referent-chain waiting.
> · **Class enchantments (38 parked, 0 native): payoff `0`.** Modeling the whole level-up mechanic flips
>   NOTHING — every one of the 38 has band abilities that are *also* unmodeled. The payoff sits behind a
>   second wall.
> · **"That player shuffles" (63 carriers): sole-blocked `0`.** Every carrier is also blocked by its
>   opponent-library search/exile.
> **What this means for the next seat:** remaining parked cards are each blocked by their OWN mechanic, and
> the census confirms the shape — ~11.3k sole-blocked cards spread so thin that the LARGEST single signature
> is **4 cards**. Corpus grinding is now ≈1–4 cards per real build, not per slice.
> **The honest recommendation, unchanged from the 08-04 shelf measurement above: work the SHELF, not the
> census.** Corpus work has been measured moving Colton's decks by ZERO.

> ### ✅ SHIPPED (`fd7392db`, +2): **the Glimmer dies-trigger "needed a keyword line"** — a classifier bug
> Kept in full because the DIAGNOSTIC PATTERN is the reusable part, not the card fact. The repro that
> exposed it, which contradicts itself on its face:
> ```
> DIES = "When ~ dies, if it was a creature, return it to the battlefield under its owner's control. It's an enchantment."
> dies alone                 -> body-only      ❌
> Vigilance + dies           -> native-trigger ✅
> lifegain trigger + dies    -> body-only      ❌
> Vigilance + lifegain + dies-> native-trigger ✅
> lifegain alone             -> native-trigger ✅
> ```
> **The presence of "Vigilance" cannot have any bearing on whether a dies-trigger is modeled**, so the
> keyword dependency is spurious. `detectTriggers` + `triggerRoutesNatively` BOTH already return
> **native=true** for that dies line on the parked cards — this is a classifier-vs-router divergence
> (the [ghost-registry] / [engine⇄UI wiring] family), not a missing mechanic.
> **The corpus split confirmed it:** identical dies line, byte-for-byte. NATIVE — Enduring Vitality ·
> Curiosity · Innocence (each led by Vigilance / Flash / Lifelink). PARKED — **Tenacity · Courage** (no
> keyword line). **The cause:** the trailing sentence *"It's an enchantment."* survived the trigger-sentence
> strip and failed `isKeywordOnly` — but it is NOT residue. triggers.js rewrites the whole effect to the
> `[self-return-bf:enchantment]` marker *because* the type change is part of the modeled effect, and says so
> at the rewrite site. **The classifier was double-counting text the atom already owns.** Fixed in
> `classifyCard`'s strip chain; triggers.js was correct throughout.
> ⭐ **THE REUSABLE PATTERN: when a card's verdict depends on something that CANNOT bear on it (a keyword
> line deciding whether a dies-trigger is modeled), the real cause is a leftover fragment that only becomes
> decisive when it is the last one standing.** Look for a trailing sentence the effect already owns.
> ⛔ Enduring Friendship is NOT part of this — its cast trigger routes **false**, a genuinely different
> blocker. Old-Growth Troll and Harold and Bob return as an *Aura* ("It's an Aura enchantment with enchant
> …"), also a different shape. **Three causes here, not one — do not batch them** (gate 20).

> ### 🎯 THE HIGHEST-YIELD PROBE OF THE WHOLE RUN, and it costs one command: **SPLIT A SHAPE BY TIER**
> Take a phrase, tally its carriers native-vs-parked, and normalize the surrounding line. When the same
> shape is native on many and parked on some, the diff between the two wordings IS the bug — no theory
> needed. It found the last two slices outright:
> · `"…dealt to ANY TARGET this turn"` native **33** / `"…to TARGET CREATURE this turn"` parked **9** → +8,
>   one matcher, runtime untouched.
> · the attached-count and zone-count families the same way.
> **Contrast with the two reverts today**, both of which came from reasoning about a shape instead of
> counting it. Count first.

> ### ✅ **v0.151.0 IS OUT.** Release workflow completed+success; signed installer + `.sig` + `latest.json`
> published, version synced from the tag. Every running `.exe` picks it up on its next 24h check. Colton's
> ≈100-card cadence fired at batch 100; the counter reset and post-tag work has already banked **+17**.

> ### ⭐ THE BIGGEST SINGLE SLICE OF THE RUN: **THREATEN (+17)** — and the cause was NOT the family name
> 47 corpus cards print *"Gain control of target creature until end of turn"* and **zero** were native.
> control.js's own header blamed *"an end-of-turn revert schedule + the untap/haste rider"*. **The riders
> were fine.** Measured before building anything:
> `"Untap target creature. It gains haste…"` → `[untap, pump]` ✅ ·
> `"Tap target creature. Untap that creature. It gains haste…"` → `[]` ❌ — **a card with no control clause
> in it at all.** The real blocker was that exactly ONE referent could chain; a second "that creature"/"it"
> dropped the whole program. **This is gate 20 in the open** — 47 cards nearly got attributed to a
> control-duration cause that was never theirs.
> **The transferable move: when a family shares a SYMPTOM, find a card OUTSIDE the family that shows the
> same symptom.** One clause with no control in it collapsed the whole theory in a single probe.
> ⛔ **AND THE ORDER OF THE TWO HALVES WAS LOAD-BEARING.** Loosening the parse gate alone admits the card
> while the tail atom reads the slice of an atom the enumerator never allocated — EMPTY. Act of Treason
> would classify native-spell and **silently drop its haste grant**: clean flip-diff, green suite, wrong
> board. The runtime walk was written FIRST for exactly that reason.

> ### ⛔ BUILT · MEASURED · REVERTED — **leading-duration normalization (−17 net). DO NOT REBUILD AS-IS.**
> The theory looked airtight and had a clean probe behind it: `"Until end of turn, target creature gains
> haste."` → `[]` while the trailing twin → `[pump]`. Rewriting the leading form into the trailing one
> measured **GAINED 6 · LOST 17**.
> **WHY, and this is the part worth keeping:** the leading form is **NOT** universally unsupported. There is
> already a matcher built FOR it, covering the **quoted-ability grant** — *"Until end of turn, target
> creature gains \"When this creature dies, return it…\""* (Feign Death · Supernatural Stamina · Undying
> Malice · Banishing Knack · Abnormal Endurance · 12 more). Moving the duration to the very end pushes it
> **past the closing quote** and breaks exactly those.
> **The general trap: a probe showing "shape X never parses" is evidence about the CLAUSE YOU PROBED, not
> about the shape.** One counter-example family was already relying on it.
> ⓘ A safe version exists — rewrite ONLY when the un-rewritten clause fails to parse (strictly additive) —
> but "try both, take whichever parses" is a heuristic that can silently pick a WRONG parse, so it wants its
> own slice with its own evidence, not a tail-of-session bolt-on. **Traitorous Instinct still needs a THIRD
> thing regardless** (the referent pump+keyword form `"It gets +2/+0 and gains haste until end of turn"`
> fails even TRAILING), so this was never the whole story for the cards that motivated it.

> ### ⛔ CORRECTION 31 — **AN UNTAGGED TARGET LIST MAKES A TARGET-BINDING PIN HOLLOW**
> `targetsForAtom` returns the **whole** target list when no target carries an `atomIndex`:
> `const tagged = targets.some(t => typeof t?.atomIndex === "number"); return tagged ? filter… : targets;`
> So a harness that passes untagged targets hands **every** atom the same target no matter which index it
> asks for — which sidesteps any bug about *which* atom a referent binds to. Measured: with untagged
> targets, reverting the runtime walk left **all 14 tests green**. The real cast-time enumerator tags per
> atom, so tagging is fidelity, not decoration.
> **Rule: any pin about target BINDING must tag `atomIndex`, or it is testing nothing.** Third instance of
> the correction-30 family today (a mutant that applies but never reaches the guarded case).

> ### ⛔ CORRECTION 30 — **A MUTANT CAN PASS BECAUSE IT NEVER TOUCHED THE CASE UNDER TEST**
> The double-count guard on counters-on-self was mutated and the suite **stayed green**, which reads as
> "this line isn't load-bearing — delete it". It was load-bearing. The mutant widened a character class to
> allow a leading `+` but left `+` out of the MIDDLE of the class, so `"+1/+1"` still failed to match and
> the guarded case never ran. Re-run with a mutant that genuinely admits it, the card flips to
> native-static and the pin goes red — and the underlying bug is real: a printed 0/0 carrying three +1/+1
> counters derives **6/6** where CR gives **3/3**.
> **This extends correction 22, it does not repeat it.** 22 says *confirm the mutation APPLIED*. 30 says
> *confirm it applied TO THE CASE UNDER TEST* — grep proving the line changed is necessary and NOT
> sufficient. Cheapest check: assert the mutant's own behaviour once (here, `classifyCard(...)` under the
> mutant) before reading the suite result. Twice today a mutation silently applied nothing at all
> (shell escaping); this is the third variant of the same family and the subtlest.

> ### ⛔ CORRECTION 29 — **A CLEAN FLIP-DIFF HID TWO WRONG CARDS. The whole-card audit is what caught them.**
> The attached-permanent count slice (`3a868e43`) first measured **GAINED 7 · LOST 0 · RETIERED 0** and
> **two of those seven were FALSE POSITIVES.** Nothing in the diff said so. Reading each gained row's whole
> card did.
> **The shape, because it will recur.** The count evaluator reads the **AFFECTED** permanent — which is
> exactly what makes an Equipment's *"EQUIPPED CREATURE gets +1/+0 for each Equipment attached to IT"*
> resolve against the host. In a self-buff the affected **is** the source, so it's exact. But a **GROUP
> ANTHEM names its source explicitly**, and the card name is normalized to `"this creature"` upstream — so
> *"Other Kor creatures you control get +2/+2 for each Equipment attached to **this creature**"* (Armament
> Master; Kellan, the Fae-Blooded) **arrives looking self-referential.** There source ≠ affected, and
> counting the affected **inverts the card**. Measured wrong in BOTH directions:
> two Equipment on the MASTER → the Kor read **2/2, correct 6/6**; two on the KOR → read **6/6, correct 2/2**.
> **The rule to carry forward: when a count phrase can name either the source or the affected permanent,
> the pronoun is load-bearing.** Accept `"attached to it"` only; `"this creature"` is a source reference in
> disguise. Cost of the fix: zero — every genuine carrier prints "it".
> ⚠️ The Aura arm pushed one commit earlier (`325c8cfd`) carried the **same latent phrasing**. It admitted
> no group anthem in practice — re-measuring without it showed **LOST 0** against that build, which is the
> proof nothing wrong reached master — but the hazard was live. Closed before the siblings fired it.

> ### 🐞 A REAL BUG THAT HAD BEEN ON MASTER FOR A LONG TIME, found only by driving a NEW card
> **"For each X you control" on an Aura/Equipment read the HOST's controller, not the granter's** (CR
> 109.5). Invisible on your own creatures — and **QUAG SICKNESS is a removal Aura whose entire purpose is
> to sit on an OPPONENT'S creature.** It was counting the opponent's Swamps and doing nothing at all.
> A dozen-plus carriers (Blanchwood Armor, Sigil of the Nayan Gods, Raised by Wolves, Cranial Plating,
> Pennon Blade, Blackblade Reforged). It surfaced ONLY because Empyrial Armor joined the family and got a
> law-6 drive. **Fixed BEFORE the new cards were allowed to ship**, rather than booking a thirteenth
> carrier of a known-wrong branch as a gain.
> **The transferable lesson: a bug that is invisible in the common case is found by driving the UNCOMMON
> one.** The same-controller rows were green throughout and stayed green after the fix — which is exactly
> why nobody had caught it. When a granted effect says "you", drive it cross-controller.

> ### ⛔ CORRECTION 29 — **A CLEAN FLIP-DIFF HID TWO WRONG CARDS. The whole-card audit is what caught them.**
> The attached-permanent count slice (`3a868e43`) first measured **GAINED 7 · LOST 0 · RETIERED 0** and
> **two of those seven were FALSE POSITIVES.** Nothing in the diff said so. Reading each gained row's whole
> card did.
> **The shape, because it will recur.** The count evaluator reads the **AFFECTED** permanent — which is
> exactly what makes an Equipment's *"EQUIPPED CREATURE gets +1/+0 for each Equipment attached to IT"*
> resolve against the host. In a self-buff the affected **is** the source, so it's exact. But a **GROUP
> ANTHEM names its source explicitly**, and the card name is normalized to `"this creature"` upstream — so
> *"Other Kor creatures you control get +2/+2 for each Equipment attached to **this creature**"* (Armament
> Master; Kellan, the Fae-Blooded) **arrives looking self-referential.** There source ≠ affected, and
> counting the affected **inverts the card**. Measured wrong in BOTH directions:
> two Equipment on the MASTER → the Kor read **2/2, correct 6/6**; two on the KOR → read **6/6, correct 2/2**.
> **The rule to carry forward: when a count phrase can name either the source or the affected permanent,
> the pronoun is load-bearing.** Accept `"attached to it"` only; `"this creature"` is a source reference in
> disguise. Cost of the fix: zero — every genuine carrier prints "it".
> ⚠️ The Aura arm pushed one commit earlier (`325c8cfd`) carried the **same latent phrasing**. It admitted
> no group anthem in practice — re-measuring without it showed **LOST 0** against that build, which is the
> proof nothing wrong reached master — but the hazard was live. Closed before the siblings fired it.

> ### 🧩 THE LANE THAT PAID THIS BLOCK: **an evaluator existed as a BOOLEAN; the count twin was one arm away**
> `layers.gateMet`'s `isEnchanted` gate has always asked *"is ANY Aura, on ANY battlefield, attached to
> perm.id?"* — a plain `attachedTo` back-pointer read. `countSelfSpecOnBoard` now asks the identical
> question and **tallies instead of short-circuiting**; `isEquipped` is the same twin for Equipment. That
> single arm, plus three vocabulary entries, turned **+10 cards** (`325c8cfd` +5, `3a868e43` +5) including
> **Uril, the Miststalker** and **Kor Spiritdancer** — the Voltron statics.
> **The generalizable move: when a card wants a COUNT, look for an existing BOOLEAN predicate over the same
> state.** Admission is free there — the exactness argument is already made and already shipped.
> Also this block: **RIPPLE N** on an Aura's own line (`dfef06e9`, Surging Might) — the dredge admission's
> twin. ✅ **That vein is now SWEPT TO EXHAUSTION:** a corpus-wide probe for *any* parked Aura whose entire
> residue is covered-keyword lines returns **0**. Dredge and ripple were the whole set. Don't re-walk it.

> ### ⚠️ THE HARNESS LIED FIRST, AGAIN — and the fix is now a standing pin
> The law-6 board drive for the attached-count slice initially read **0/0 on every row, including the bare
> printed 2/3** — because `permanentPower` takes a **permanent ID** and was handed the permanent **object**.
> A broken harness returns a *uniform* answer that reads exactly like a clean negative. **Every board-drive
> pin in that file now opens with a bare-printed-P/T witness row**, so the harness has to prove itself
> before any other row counts as evidence. Third harness-scar of this run; treat the witness row as the
> default shape for board drives.

> ### 📐 AND THE SHELF'S STRUCTURE IS NOW MEASURED: **no cheap wins left on it**
> Line-deletion probe over every unmodeled card in all 21 decks: **ZERO two-flip composition failures,
> 139 single-blocker cards** — 139 distinct missing mechanics. **That is the explanation for the line
> below.** The corpus still had cheap composition bugs to harvest all night; the shelf does not, so shelf
> progress is per-card mechanic work by construction. Blocker "clusters" are SHAPE-level only and do NOT
> share a cause — checked: the landfall trio (Scythecat Cub · Bloodghast · Earthbender Ascension) has
> three different unrouted effects. **Don't batch them.** One such card was built tonight (Gyre Sage,
> counter-scaled mana, `ce642ada`) as the reference for what that work looks like.
>
> ### 📊 THE SHELF WAS RE-MEASURED, AND THE HONEST READ IS: **+22 corpus cards moved it by ZERO**
> Corpus 38.6% → **38.7%**. Shelf **unchanged at 82% (1715/2097) across 21 decks** — colton 93% (Veyran
> Cantrips 88% the only miss) · joe 79% (9 below the bar) · test 73% (all 4 below). A night of strong
> corpus work touched none of Colton's decks. **If the next seat wants Colton-facing value, work the
> SHELF list, not the census.** The two are diverging and the shelf is its own roadmap: Spell effect
> (other) 127 · **ETB trigger 80** (Solitude · Rosie Cotton · Skyclave Apparition · Staff of the
> Storyteller) · Attacks/blocks 40 · Upkeep/phase 35.
> **▶ VEYRAN CANTRIPS — remainder is 12, not 2** (an earlier note claiming "its last 2 are honest parks"
> was WRONG — corrected here). Veyran himself is ✅ BUILT (`4fb4fef0`). **The other 11 were each probed
> tonight, and every one is a REAL BUILD — none is a cheap composition win.** Triage, so nobody re-probes:
> · **Dragon's Rage Channeler** — closest of the eleven. Its surveil trigger routes and the delirium GATE
>   machinery exists (`cardTypesInGraveyard`); the blocker is the third segment of the gated compound,
>   *"and attacks each combat if able"*. `emitGatedEffect` consumes only `gets +X/+Y [and has <kw>]`, and
>   must-attack is modeled as a CARD-LEVEL text check enforced in `opponentAI.pickAttackPlan`, not as a
>   gated layer effect. **Needs a GATED must-attack** — crediting the ungated one would force attacks
>   without delirium, a forbidden FP. New mechanism, touches the AI attack planner.
> · **Aria of Flame** (ETB "each opponent gains 10 life" + verse-counter scaling damage — both unrouted) ·
>   **Fiery Inscription** (the Ring tempts you — a whole subsystem) · **Thunderdrum Soloist** (mana-spent
>   escalation) · **Vivi Ornitier** ({0}: add X = its own power, once per turn).
> · The five SPELLS, all parsing LOW with zero atoms, each needing distinct machinery: **Expressive
>   Iteration** (three-way library split, three different destinations) · **Arcane Denial** (delayed
>   both-sides upkeep draws) · **Mizzix's Mastery** (exile-and-copy-and-cast-free) · **Vivi's Persistence**
>   (token carrying a quoted trigger + a commander watcher) · **Flame of Anor** (modal choose-two gated on
>   controlling a Wizard as you cast).
> **So the "+11 puts Colton at the bar" framing is honest about the GOAL and misleading about the COST.**
> Joe's tail or the shelf ETB vein (80 slots, cards like Rosie Cotton / Skyclave Apparition) is likely the
> better next spend per card.

> ### ⭐ THE VEIN THAT PAID OUT MOST TODAY — and it is now MEASURED AND NEARLY DRY
> **A NON-BATTLEFIELD-ZONE ability reads as residue to every battlefield-oriented gate.** An ability
> played from the GRAVEYARD, from HAND, or from EXILE is modeled by its own lane, so
> `parseActivatedAbilities` calls it unmodeled and the residue walks treat its line as leftover text.
> **Four slices today, +6 cards:** Aura graveyard self-recursion (AU-GY) · no-maximum-hand-size · the
> discard-cost hand ability · the plot line on permanents. The fix each time was ONE shared source (a
> `classifyCard` pre-strip, or strip-then-revalidate), never a patch on whichever gate happened to bite.
> **Swept to exhaustion at the end:** cycling **0** · plot **1** (built) · warp **0** (my first sweep
> reported 2, both FALSE — "Warp Vortex —" / "Warp Blast —" are ability-word LABELS, not the keyword; the
> regex over-matched). **Consider this vein closed** unless a new zone keyword ships.
> ⚠️ Two of the four needed a RUNTIME drive before the credit was honest, not just a tier diff — the
> graveyard one because GY-1 was built for creatures, and plot because a card plotted into exile that
> could never be cast back would be a dead end, strictly worse than parking it.

> **▶ START HERE — the Block-4 grind off a FRESH census (34,245 scanned, ran 2026-08-03).**
> The subsystem vein is DRY for a 4th consecutive time (largest sole-blocker cluster = 6, all unrelated
> mechanics), so the live ore is BUG SIGNATURES — shapes that block some cards while classifying native on
> others. Ranked leads, straight off that census, each with its own scoping job:
> · **`enchanted creature doesn't untap during its controller's untap step`** — 25 native / **2 sole**.
>   ⚠️ **PROBED, AND THE CENSUS'S `examples` ARE NOT THE SOLE-BLOCKERS** — they are carriers of the SHAPE.
>   Controlled Instincts, Ice Over and Coma Veil are each blocked by a **restricted/compound ENCHANT
>   SUBJECT** ("red or green creature", "artifact or creature"), not by the untap line: deleting that line
>   leaves them body-only. Real remaining candidates are **Ray of Frost** (multi-line, incl. "loses all
>   abilities") and **Bubble Snare** (a kicked-conditional ETB). The compound-enchant-subject cluster is
>   the bigger, unscoped prize here — it needs cast-lane targeting work, so size it before committing.
> · ~~**`you control enchanted creature`** — 7 native / 4 sole~~ ✅ **BUILT (`21a0ea19`, +2)**. Its other
>   two carriers are honest parks (Krovikan Whispers = cumulative upkeep; Hypnotic Siren = bestow).
> · ~~**`{C}{C}: return this card from your graveyard to your hand`** — 6 native / 3 sole~~ ✅ **BUILT
>   (`d28e3b30`, +3)**. Convenient Target / The Sound of Drums stay parked on other unmodeled clauses.
> · ⏸ **`reinforce N—{C}{C}`** — 5 native / 3 sole — **PROBED AND PARKED, with the reason measured.**
>   Reinforce is a hand-activated discard ability (CR 702.77) whose effect is "put N +1/+1 counters on
>   TARGET creature". The DC-1 hand-activation lane exists but explicitly skips targeted programs
>   (`programNeedsChosenTarget(program)` → `continue`, and it returns TRUE here — measured). So this needs
>   per-target offer expansion plus dispatcher threading in the hand-activation seam: a NEW mechanism, not
>   assembly. Park stands until that seam is built; +3 cards waiting behind it.
> · ⏸ **The qualified-enchant-subject remainder — 13 of the measured 16**, in three named families:
>   colour DISJUNCTION ("red or green creature" ×2) needs a disjunctive restriction kind (restrictions are
>   ANDed today); TYPE UNIONS ("artifact or creature" ×4, "creature or vehicle" ×2, +3 singletons) need a
>   targetType not fixed to "creature"; and "modified" / "with another Aura attached" / "nonland permanent"
>   have no predicate at all. The 3 that mapped onto existing kinds are BUILT (`765d80d4`).
> · **The two-flip list** — 8 of its 22 are now BUILT. Remaining unscoped, with what's known:
>   **Waker of Waves · Glorious Sunrise · Elaborate Firecannon · Artisan of Kozilek** (annihilator — an
>   unmodeled keyword, likely an honest park) **· Witch's Mark** (the named exception: two spell clauses).
>   ⭐ **The pattern that has paid out five times running: a two-flip card is a COMPOSITION failure, so
>   find the lane that owns each half and ask why they don't compose — the mechanic is almost never
>   missing.** Prove the shared cause by COMBINATION (parse each subset) before batching any of them.
> ⚠️ **PROVE THE SHARED CAUSE BEFORE BATCHING** — probe each candidate's line combinations, don't group by
> symptom. That rule earned +8 today and would have cost a bad commit without it.
>
> **State:** last commit `e61fba34`, tree clean, nothing in flight. **Do not tag** — 41 of ~100 banked.
> Shelf/corpus numbers below are from 08-02 and are now STALE by +8 cards — re-measure before quoting them.
>
> **Shipped this sitting (+8, five slices, each pushed to master with its own full gate):**
> EQ-3 Candlestick quoted-grant composite (+1) · LA-2 Verdant Haven ETB rider on the boost aura (+1) ·
> the remove-counter fail-safe narrowing (+2, Charforger rode along) · AU-ACT+TRIG aura-own activated ×
> triggered (+2, Strands of Undeath rode along) · the no-max-hand-size sentence-boundary fix (+2).
> **All four of 08-02's two-flip leads are CLOSED.**
>
> ### ✅ THE FALSE POSITIVE IS FIXED, AND THE +2 IT BLOCKED HAS SHIPPED (`d617074d`)
> Banked last night, closed this morning. **Root cause:** the `if you do` / `when you do` residue strips
> ended in `\s*`, and **`\s` matches a NEWLINE** — so the strip ate the line break, WELDED the next oracle
> line onto the stripped one, and the line-based activated filter dropped the whole welded line, carrying a
> genuinely unmodeled sentence with it. Time Vault's skip-your-turn replacement effect vanished that way.
> **The identical hazard is documented eight lines away** in `stripTriggerEffectTails` ("NO `\s` ANYWHERE
> — it matches a NEWLINE, and this file has already shipped that exact false positive once"); these two
> chains never got the treatment. Fixed at all four sites to horizontal-whitespace-only, with the
> sentence body barred from crossing a newline either.
> **Found by instrumenting each residue stage, not by reading regexes** — three rounds of reasoning about
> the pattern got it wrong; one print of the intermediate text got it right.
> ⚠️ **The order mattered and is worth remembering:** the composition slice ALONE measured a clean
> **+3**/0/0 whose third row was Time Vault; with the FP fixed it measures **+2** and Time Vault correctly
> parks. **A tier diff cannot tell those two situations apart.** The FP fix by itself flips 0 cards — it
> was LATENT until the composition exposed it.

> ### ⏸ TWO TWO-FLIP CARDS PROBED AND PARKED (reasons measured, so nobody re-probes)
> · **Bubble Snare** — an AURA with kicker. `parseKickerEtbCreature` is hard-gated to creatures, but
>   widening it is NOT the fix on its own: the kicker cast branch in legalChoices pushes
>   `targets: [], needsTargets: false`, which is right for a creature and wrong for an Aura (it needs a
>   host). Crediting it would produce a card the cast lane cannot attach — the same FP shape as the
>   qualified-subject slice. **Needs the kicker cost expansion AND aura host enumeration together.**
> · **The Spear of Leonidas / Glorious Sunrise** — modal triggers (choose one — with bullet modes) on an
>   equipment-attacks and a begin-combat trigger. Unprobed beyond the deletion pass; the modal machinery
>   is its own subsystem.
> · **Artisan of Kozilek** — annihilator, an unmodeled keyword. Almost certainly an honest park.

> ### ⚠️ READ BEFORE YOUR FIRST GATE — the corrections still standing, plus three earned today
> **19 — THE GATE IS THE EXIT CODE** and **20 — A CLEAN FLIP-DIFF IS NOT A SAFE CHANGE** (both below).
> **21 — A BANKED CAUSE IS A HYPOTHESIS WITH A TIMESTAMP.** Three of the four two-flip causes written down
> on 08-02 were stale or wrong by the time they were built — and the split that produced them was itself
> the right call. Re-probe a banked claim before building on it; all three were CHEAPER than their notes said.
> **22 — A MUTATION THAT HITS THE WRONG LINE IS WORTH NOTHING.** A `string.replace` matched the tail of a
> *different* line carrying the same needle and ran GREEN. Verify the aim landed, not merely that something
> changed — and re-check the surviving occurrence count.
> **23 — ASSERT THROUGH THE PATH THE ENGINE ACTUALLY USES.** A bare `flushTriggers(state)` takes the FIRST
> LEGAL target, so a "target player discards" probe picked its own controller and read as a dead effect;
> the engine's real path passes `{ chooseTargets: chooseTriggerTargets }`. Same family as law 6. Second
> instance the same night: an activated-ability probe asserted right after `dispatchAction` and read as a
> no-op because the ability uses the STACK — assert after `resolveTopOfStack`.
> **24 — A TIER DIFF CANNOT SEE AN UNCASTABLE CARD.** The qualified-subject slice took a clean +3/0/0
> while one of its three was UNCASTABLE: it reaches its tier through a composite whose cast is offered by
> a DIFFERENT lane, and that lane didn't read the filter being widened. **When you widen something a tier
> stands on, find every LANE that offers the card, not just every gate that classifies it.** (Correction
> 20's sibling, one level out: 20 asks what else READS the guard; 24 asks what else has to ACT on it.)
> **25 — RESTORE BY FILE COPY, NEVER BY `git checkout`, ON UNCOMMITTED WORK.** A `git checkout` used to
> undo a mutation silently discarded an uncommitted slice file. The runbook already names this; it still
> bit. The full-suite gate caught it — which is the argument for running the gate bare, every time.
> **26 — INSTRUMENT THE INTERMEDIATE TEXT; DON'T REASON ABOUT THE REGEX.** Three rounds of careful
> reading got the "If you do" root cause WRONG (I twice concluded the strip couldn't reach the earlier
> sentence). One `console.log` of the residue at each chain stage got it right in a minute: the strip's
> trailing `\s*` was eating the NEWLINE and welding the next line on. **When a strip's effect surprises
> you, print what it produced — a regex you are confident about is exactly the one worth printing.**
> **27 — A LATENT FP IS STILL AN FP, AND IT SHIPS THE DAY SOMETHING ELSE UNCOVERS IT.** The newline bug
> flipped ZERO cards on its own; Time Vault was accidentally shielded by residue that an unrelated,
> perfectly good slice was about to remove. **A "0 gained / 0 lost" correctness fix can be the most
> load-bearing commit of the day** — and the order (fix, then compose) is the whole safety argument.
> **29 — A DELIBERATE PARK'S PINS ARE LOAD-BEARING. READ THE HEADER BEFORE ASSUMING IT'S STALE.** I
> extended a trick that had just worked (the per-clause matcher, +4 on impulse-exile) to the
> optional-discard pair; Witch's Mark flipped on a clean **+1/0/0** with both atoms present. The full
> suite then went red on FOUR pins a previous author wrote specifically to stop it, reason stated in the
> file header. **They were right and my version was worse than they feared:** driving the FULL program
> showed the Role token is **never created on EITHER answer** — the α2 invariant (`optionalsFormSuffix`)
> needs optionals LAST, and with the optional first the mandatory atom after it never runs. Reverted.
> ⚠️ **And the sharper half: I had already "driven the runtime" — but only the FIRST ATOM in isolation,
> which passed.** Only running the WHOLE program exposed it. *Driving one atom is not driving the card.*
> (Correction 21 says a banked cause goes stale; **this is its counterweight — a banked REFUSAL usually
> has not.** Check which kind you're looking at.)
> **28 — WHEN YOU FIND A BUG CLASS, SWEEP THE FILE FOR IT BEFORE MOVING ON.** One `\s`-eats-a-newline
> bug became two: sweeping coverage.js for the class immediately afterward turned up the
> enters-with-counters strips leading with `[^.]*`, **and `[^.]` matches a newline too** (only `.`
> excludes it). It could eat the line ABOVE it — harmless after a period, dangerous after a KEYWORD LINE,
> which has none: `"Champion a Goblin"` + an enters-with-counters line read native-body. Also latent,
> ⭐ **A FOURTH instance turned up later the same day** and it is the one to remember: `stripReminder`
> COLLAPSES newlines BY DESIGN, so a period-less KEYWORD LINE loses its identity and welds onto the body
> (`e8e4918b`, +2). The class is bigger than the two strips originally swept.
> also fixed (`7ca82bbd`). **The sweep is now COMPLETE, and the result is mixed on purpose:** of five
> candidate strips, **one was a real hazard (fixed)**, two are safe by their own anchors, and the last two
> — the die-roll `create a number of … equal to the result` tail and the `no maximum hand size for the
> rest of the game` tail — **DO provably eat the newline (measured), but no FP could be constructed from
> either**: the welded remnant still carries the unmodeled text and the card still parks in every shape I
> could build. **Left unchanged deliberately** — changing a strip with no failing test is the same
> widening-on-a-hunch this project keeps getting burned by. Recorded so the next seat has the measurement
> instead of re-deriving it, and knows exactly where to look if one ever does bite.
>
> ### 🧰 WORKTREE NOTE (cost 4 red tests at baseline)
> A reused worktree may lack `app/data/rules-index.json` → 4 pre-existing rules-retrieval failures that are
> NOT your slice. Rebuild with `npm run build:rules-index` (gitignored artifact). And **run suite gates
> env-clean**: under vitest a real-install `MTG_APP_ROOT` is REFUSED by design (the ghost-registry guard).
> Env-point only the non-vitest tools — the census and `tier-snapshot.mjs`.

## ☀️ 2026-08-02 (session end) — **v0.150.1 SHIPPED · +33 cards · 3 features** — suite **1081 / 13,640** · batch **33** since v0.150.1

> **▶ START HERE — four two-flip cards, and they are FOUR SEPARATE SLICES, not one.**
> ⚠️ **My own first read was WRONG and is corrected here — do not trust the version of this paragraph in
> the git history.** A line-deletion probe made them look like one shape ("trigger + second ability");
> the follow-up probe (detectTriggers / parseActivatedAbilities / the bonus parsers, per card) found a
> DIFFERENT cause behind each. This is correction 20 biting a second time in one session: *a probe that
> groups cards by SYMPTOM is not evidence of a shared CAUSE.* Diagnosed causes, each its own scoping job:
> · **Verdant Haven** — ✅ **BUILT 2026-08-03 (`cd8d30d6`, +1)**. The cause line here was HALF-STALE: the
>   tapped-for-mana line is not an undetected trigger shape — it is the fully-built native-mana-aura BOOST
>   subsystem (Fertile Ground is byte-identical and native; CR 605.1b, it never goes near detectTriggers).
>   The real blocker was the ETB line as residue in manaAuraResidueClauses — composition after all.
>   Receipt in RUN-LEDGER.
> · **Candlestick** — ✅ **BUILT 2026-08-03 (`19b5600d`, +1)**. The cause line here was STALE against the
>   tree (the parser captures the +1/+1 and the runtime delivered both halves all along — the park was
>   pure tier composition, EQ-2's GUARD-QUOTE). Receipt in RUN-LEDGER's top entry.
> · **Vat of Rebirth** — ✅ **BUILT 2026-08-03 (`49758ef1`, +2 — Charforger rode along)**. Probed, not
>   assumed, exactly as this note asked: the source provably stays and keeps watching. And the
>   vanishing caveat this note raised was REAL — time/fade and P/T counters keep the blanket refusal.
>   Receipt in RUN-LEDGER.
> · **Fiery Mantle** — ✅ **BUILT 2026-08-03 (`04c2a6da`, +2 — Strands of Undeath rode along)**. The dig
>   this note asked for found a SIBLING ASYMMETRY: the card is Firebreathing plus one modeled LTB line,
>   and no lane composed aura-own ACTIVATED with aura-own TRIGGERED. Receipt in RUN-LEDGER.
> **Witch's Mark is a fifth, different shape** (two spell clauses, arbiter-spell) — don't fold it in.
>
> ✅ **ALL FOUR TWO-FLIP LEADS ARE CLOSED (2026-08-03, +6 total).** Next work is the Block-4 grind:
> the shelf ETB vein (80 slots), the remaining bug signatures (doesn't-untap residue ~+2), and the rest
> of the census's two-flip list beyond these four. Re-census at the slice boundary, per the runbook.
>
> **State:** last commit `c8d0c1c7`, tree clean, nothing in flight. **Do not tag** — 33 of ~100 banked.
> Shelf **21 decks · 82% aggregate (1715/2097) · 7 at the ≥90% bar**; corpus **38.6% native**
> (13,225/34,245). Colton 93% (Veyran 88 the only miss, its last 2 are honest parks) · joe 79% · test 72%.
> 200-game playability sweep: **200/200 complete, ZERO wedges**.
>
> **Shipped this run:** v0.150.1 (Moxfield TLS fix — published, verified by content) · A0b that-player +5 ·
> Tibalt gremlin live (**default OFF — Colton's toggle is in Settings → Models**) · cross-deck commitments
> in Karn's context · 3 shell banners extracted with render gates · another-return +7 · START YOUR ENGINES
> speed subsystem +6 (two live FPs closed) · Wisps/Pym compounds +2 · Brainstorm put-back +6 (new
> pendingChoice kind) · suspend no-cost trio +3 · sac-scoped self-LTB +2.
>
> ### ⚠️ READ BEFORE YOUR FIRST GATE — two method corrections earned tonight
> **19 — THE GATE IS THE EXIT CODE, never a piped summary.** `vitest run | tail` reports the PIPE's exit,
> so the chain cannot stop on failure; eleven gates passed through that hole and the twelfth pushed a RED
> suite to master (fixed forward `a03f65e6`). Run bare: `vitest run > gate.log 2>&1; echo EXIT:$?`.
> **20 — A CLEAN FLIP-DIFF DOES NOT MEAN A SAFE CHANGE.** The self-LTB narrowing took a perfect +2/0/0
> tier diff and turned the suite red in 5 files: the guard I widened is SHARED by three cost paths and I
> had probed ONE. A tier diff cannot see a path credited on evidence that doesn't exist for it. Ask what
> ELSE reads the thing you are loosening. (Also: a mutation that silently fails to apply proves nothing —
> verify the edit landed before reading the result.)

## ☀️ 2026-08-02 (mid-run) — v0.150.1 shipped · +26 cards · suite 1079 / 13,626 · batch 26

> Mid-session anchor for the 24h/100-card run (the plan below is the map; RUN-LEDGER is the state).
> **▶ NEXT: Block 4 continues** — the shelf ETB vein (80 slots) or the next census bug-signature;
> Veyran Cantrips is MEASURED 88% with its last 2 all medium-parks (Arcane Denial's "up to two"
> opponent choice · Thunderdrum's two unbuilt pieces · the rest named in RUN-LEDGER's triage).
> **Shipped this run:** v0.150.1 (Moxfield TLS fix, published + verified) · A0b that-player +5 ·
> Tibalt gremlin live (default OFF — Colton's toggle awaits him in Settings→Models) · cross-deck
> commitments in Karn's context · 3 shell banners extracted w/ render gates · another-return +7 ·
> START YOUR ENGINES speed subsystem +6 (2 live FPs closed) · Wisps/Pym compounds +2 · Brainstorm
> put-back chain +6 (new pendingChoice kind, family of 6).
> ⚠️ **Method correction 19 (read before your first gate): the gate is the EXIT CODE, never a piped
> summary** — a `| tail` gate pushed a red suite to master this session (fixed forward a03f65e6, CI
> green re-confirmed). `vitest run > gate.log 2>&1; echo EXIT:$?`.

## ☀️ 2026-08-02 — **SESSION PLAN LIVE: 24h or +100 cards** — full sweep re-measured · suite **1070 / 13,535** · batch 42

> Colton ordered a full sweep + a bounded session plan. Both done; **the plan is
> [SESSION-PLAN-2026-08-02.md](SESSION-PLAN-2026-08-02.md) — boot there, take Block 1 (A0 Moxfield
> 403), and work the blocks in order.** Stop at 24 elapsed hours or +100 session cards, whichever
> first; the v0.151.0 tag fires mid-session at +58 (batch crosses ~100).
>
> Sweep results (2026-08-02, box AppData, this worktree): suite 1070/13,535 green · lint 0 · shelf
> **21 decks, aggregate 82% (1710/2097), 7 at the ≥90% bar, 226 cards to clear** — colton 93%
> (Veyran 85 the only miss) · joe 79% (nine below) · test 72% (all four below, Shalai and Hallar 64
> the floor). Fresh census (34,245 scanned): 21,066 non-native, 11,403 sole-blocker, **largest
> cluster = 6** — subsystem vein dry, third confirmation. Live ore = bug signatures (`start your
> engines!` 8/6 · suspend 15/3 · `you control enchanted` 7/4 = B1b credit · doesn't-untap 25/2 ·
> dies-return-artifact 3/3) + 29 two-flip composition failures + the shelf mechanism table (ETB 80 ·
> attacks 40 · upkeep 35 — all in the plan).

## ☀️ 2026-08-01 — **the shelf is 21 decks now** · batch 42 since v0.150.0 · suite **1070 / 13,535** · **next slice: the "that player" referent binding (A0b)**

> Last CODE commit `2054a2ce` (docs commits land on top of it), tree clean, nothing in flight. **Do not
> tag** — 42 cards banked toward the ~100 batch. `RUN-LEDGER.md` is the state; this is the summary.
>
> ### ▶ START HERE — the next slice: "that player" referent binding (`NEXT-QUEUE.md` A0b)
> **~3 cards, spec already written, trap already named.** Four spells parse HIGH but classify non-native —
> **Recoil · Ozai's Cruelty · Compelling Deterrence · Frightful Delusion** — all ending in a `discard` atom
> carrying `who: "damagedPlayer"`. That referent is stamped ONLY by combat-damage triggers, never by a
> spell, so all four are **correctly refused today**.
> ⛔ **The obvious fix — threading a spell-side `damagedPlayer` — is a REAL false positive.** "That player"
> only means the damaged player on Ozai's Cruelty. It is the bounced permanent's OWNER on Recoil and
> Compelling Deterrence, and the countered spell's CONTROLLER on Frightful Delusion. The honest build binds
> "that player" to the PRECEDING ATOM'S SUBJECT. Leave Compelling Deterrence parked regardless: its
> intervening condition ("if you control a Zombie") is dropped from the atom list entirely, so crediting it
> would discard unconditionally.
>
> **If the user-facing bug outranks 3 cards, take A0 instead** — Moxfield import 403s in the packaged
> `.exe`. Proven NOT the user-agent and NOT stale code; bundled-Node TLS is a hypothesis and is labelled
> untested. First step is one measurement, not a fix: find `resources/node/node.exe` and run the same
> `node:https` request through it. Second, independent defect in that path — the error message asserts
> "Check the link is public" when the links were public, which sent this investigation the wrong way first
> and would do the same to a user.
>
> ### WHAT CHANGED STRUCTURALLY: the shelf tripled, and the metric was wrong for an hour
> Colton split the app into real profiles — **Colton** (6 decks) · **Joe** (11) · **Omnath** (4 Bracket-3 test
> decks, imported 2026-08-01) — and imported **Veyran Cantrips** from Archidekt. The shelf census used to read
> ONE hardcoded profile path; after the split it would have reported a healthy 5-deck shelf and lost two
> thirds of its subject without a word. It walks every profile now.
> ⛔ **The four TEST decks COUNT.** I excluded them as a junk sandbox; Colton overruled it — *"those need to be
> done just as much as me and Joe's decks."* Do not restore the exclusion.
>
> **Shelf: 21 decks · 7 at the ≥90% bar · 226 cards to clear** — colton 5/6 (7) · joe 2/11 (144) · test 0/4 (75).
>
> ### ⏸ BLOCKED ON COLTON — the Arbiter verdict source (context for the era, not a work item)
> The parser era is closing. Four axis veins measured to ZERO on 07-30; this session's ten slices ran
> +14/+9/+8/+7/+6/+5/+3/+3/+1, and the last one paid **+9 engine but only −3 shelf**. Meanwhile the shelf's
> parked set is **357 distinct cards, and 321 of them appear in exactly ONE deck.** A per-card tail that
> large is not reachable by a matcher — no phrase swap flips a card that exists once.
>
> That is what makes `ARBITER-IN-RUNNER-SPEC.md` the live question rather than a backlog item. Steps 1–4 are
> BUILT (store · applier · default-off `resolveArbiter` hook · `warmArbiterCache`). **The flag is not the
> blocker — flipping it changes nothing, because `warmArbiterCache` throws without a `resolve` function and
> there is no verdict source.** ON with an empty cache is the same no-op with more machinery in the path.
> The spec's own note is the real constraint: *a small local model can't emit valid MTG-Tool atoms.*
> The open call is **where verdicts come from**, and the recommendation on the desk is: author them
> BUILD-TIME (offline, committed as data, shipped in the bundle — the model in the authoring path, exactly
> like the Scryfall snapshot), never runtime. That keeps §1.1 intact. It still needs Colton's yes.
> ⚠️ And the persona does NOT protect this: the runner path consumes structured atoms and no-ops on malformed
> ones — it never reads Arbiter prose. What prevents a bad verdict is the CREED gate on the verdict set.
> **Until that yes lands, this section is background. Do not open a session on it; work the queue above.**
>
> ### METHOD: 17 corrections now (RUN-LEDGER, read before the first slice)
> Newest: **17 — naming the risk in the pre-size is not testing it.** The multi-keep pre-size flagged the
> exact thread that broke, in bold; the assertion written for it was a COUNT, and the mutation walked through
> it because both branches leave the same number of cards in a different order. Assert the mechanism.
>
> ### HOUSEKEEPING FOR COLTON
> Reload the app window before touching the deck library (the client holds pre-split state). The 608 MB
> profile backup at `scratchpad/profile-backup-20260801-183934` is still on disk and can go once you've
> clicked through the three profiles.

## ☀️ 2026-07-30 — **v0.149.20 shipped (89 cards, ten slices, ONE tag)** — Colton shelf 93% · `cdh` 86/100 — suite **1005/12,802**

> **Read [RUN-LEDGER.md](RUN-LEDGER.md) first if you are resuming after a crash** — it is rewritten at every
> slice boundary. This entry is the summary; that file is the state.
>
> ⚠️ **This file had gone twelve releases stale** (its previous entry was v0.149.8 / suite 864). CLAUDE.md
> §9 calls this the live resume anchor and the single source of truth for the suite count, so a fresh session
> was booting on numbers that were badly wrong. Keep this entry current at each release, not each slice.
>
> **THE CADENCE CHANGED (Colton, 07-29): one tag per ~100 cards, not per slice.** Slices still land on master
> individually with their full gates; only the TAG batches, because every tag raises an update banner in every
> running `.exe`. v0.149.20 was the first full batch: **89 cards across ten slices**. Live counter at the top
> of the run ledger.
>
> **Biggest slice: colour as a cast-trigger filter (+52)** — `castSpellFilter` already carved out `historic`
> and `multicolored` as whole-object QUALITIES, and the `multicolored` comment had already written the CR
> justification. Single colours were the same shape. The rest: planeswalker subtypes +11, cost-reducer filter
> vocabulary +8, life-gain replacement +7, controller sac nouns +5, condition disjunction/negation +4, plus
> three 1-card shelf slices.
>
> **⭐ THE STATE OF THE CORPUS HAS CHANGED, and this is the thing to read before planning work.** Four
> separate axis veins were measured this session with verified controls and **all four attribute to ZERO**
> (delayed triggers 157→4, combat-damage-to-you 7→0, opponent-scoped impulse 25→0, cast-vs-play 7→0). The
> residue census's largest remaining cluster is **5 cards**, mostly Un-set mechanics. **The era where one
> parse arm paid 52 is over.** What remains is narrow modeled forms surrounded by several independent gaps
> each — the unit of work is now "a card's whole stack," not "a vein." Expect a few cards per session.
>
> **Shelf:** four of Colton's five decks clear the ≥90% bar. The whole remaining distance is `cdh` at
> **86/100** — four cards, each a 2-to-4-mechanic build. The tractable half of that deck's gap is spent.
>
> **Two corrections worth not rediscovering:** the `noncreature` flash qualifier was queued as unmodeled and
> is **already built** (do not build it); and 24 CR citations for countering pointed at the wrong rule across
> nine files — `701.5a` is the CAST rule and `701.5e` does not exist; countering is **701.6a/701.6b**.
>
> ⚠️ **v0.149.20 carries one known defect**, fixed on master for the next release: lifegain triggers read the
> OFFERED amount rather than the gained one, so a "whenever you gain life" rider under a Rhox Faithmender saw
> half. Under-report only; nothing fabricated.


## ☀️ 2026-07-28 — v0.149.8 shipped — the ACTIVATION-RESTRICTION vocabulary — corpus 35% (11,993) — shelf 78%→79% — suite 864/11,167

> **Read [RUN-LEDGER.md](RUN-LEDGER.md) first if you are resuming after a crash** — it is rewritten at every
> slice boundary. This entry is the summary; that file is the state.
>
> **The theme: restriction sentences the engine parsed straight past.** An activated ability's cost and
> effect were read; the sentence *after* them was not. Every card printing one parked — and stripping such a
> sentence without enforcing it would hand the engine an ability the card never printed. Three shipped, all
> flag-then-enforce:
> - **`before attackers are declared`** (+21) — a NARROWING to the precombat main. Two sibling riders are
>   safely stripped as already-implied; this one is not, because the gate's `step === "main"` spans BOTH
>   mains and the postcombat one is *after* attackers. **This crossed the corpus over 35%.**
> - **BOAST, CR 702.135** (+10) — needed a PER-PERMANENT attacked flag. The seat-level Raid flag already
>   existed and reading it was the one-line build; it is also a materially stronger card than the one
>   printed. The load-bearing test is "a DIFFERENT creature attacked".
> - **`Activate only if <cond>`, CR 602.5d** (+23) — added a **THIRD probe to the existing interveningIf
>   family** rather than a second condition language. Trigger / spell / activation lanes now share ONE
>   vocabulary, so every future reader reaches all three. Four readers followed on that seam (+10): delirium,
>   formidable, corrupted-poison, greatest-power-on-board.
>
> **Two real gameplay bugs fixed earlier in the same run**, neither visible to the coverage metric: Mana
> Vault / Basalt Monolith / Grim Monolith offered **no ability at all** (completely dead), and a tutor
> finding nothing **soft-locked** ~6% of human-path games (found by the playability sweep, not by any test).
>
> **FOUR CREED pins fired against my own work and graduated on evidence** — boast's label-strip guard, the
> formidable/delirium refusal, the poison refusal, and High Score's body-only pin. Each caught a real change
> the moment it landed; each moved with its reason recorded in place, never deleted. One of them only fired
> because the FULL suite ran.
>
> **A retraction worth reading.** Mid-run I banked a "121-card trailing-conditional lever" as the biggest
> find of the run. It does not exist — the trailing form was already implemented, directly beneath the
> leading one I had just read. My probe counted parked cards CONTAINING such a clause; I read it as cards
> that WOULD FLIP if it were built. Retracted in place in the ledger with both readings written down. Second
> time the probe-instrument law caught me this run. **Standing rule now: before banking any lever, parse one
> real example and confirm the gap is real.**
>
> **The shelf search is finished, and the answer is that there is no big lever.** A sole-blocking-sentence
> sweep over all 320 parked deck cards found 105 single blockers, essentially all singletons; the best
> unblocks 2 deck slots. From here the shelf moves **card by card**, exactly as Colton guessed. Don't go
> hunting for a cluster again — the search is in the ledger.
>
> Shelf now: Slivers 100 · Vihaan 96 · Omnath 93 · Zaxara 90 · Mothman 90 · Earth Bent 80 · cdh 79 ·
> Dragons 76 · Jurassic 75 · Believe it 72 · Wolverine 71 · Kinnan 71 · Kellan 70 · Captain America 69 ·
> Hulk Smash 69 · Halfshell 57. **Aggregate 79% (1255/1597).** Sweep 20/20, no wedges.


## ☀️ 2026-07-27 — PR #421 MERGED (`d407ec96`) + slices 41–42 — corpus 34.4%→34.5% (11,785) — suite 845/10,914

> The forty-slice grind below is now **on master**. `gh` was installed and authorized on the box this
> morning, which unblocked the merge that had been waiting on a human click; master's tree verified
> byte-identical to the tested branch tree before the merge went in.
>
> Two slices since, both keyword work with a subsystem underneath:
> - **Slice 41 `3aacb283` (+7)** — **firebending N**, and with it a real MANA-DURATION mechanism. The
>   trigger was the easy half (reminder-paren synthesis, the renown/mobilize/backup pattern). The point was
>   "This mana lasts until end of combat" — a printed exception to CR 500.4. Crediting the card with a plain
>   `add {R}` would have handed the player mana that evaporates a step EARLY while the metric claimed the
>   card was modeled, which is the exact over-claim the native-mana correction spent two days undoing. Built
>   as a per-color survival CAP (`manaHold`) read only by `emptyManaPools` and cleared at end of combat, so
>   the mana stays in the ordinary pool and no payment path learns a second currency. Serves all 30 corpus
>   cards carrying a mana-duration clause.
> - **Slice 42 `17dcb6a0` (+7)** — **split second**, credited because it is genuinely ENFORCED. Unlike the
>   zone-option keywords (credited for being vacuous), the engine really does grant opponents priority with
>   a non-empty stack, so an unenforced split second would be a live divergence. Note it could NOT reuse the
>   Grand Abolisher lane: that one is scoped to "your opponents" and could lean on own-turn activation
>   gating, while split second binds the caster too.
>
> **Two process notes worth keeping.** (1) Slice 42's first draft silently dropped `"backup"` from
> COVERED_KEYWORDS — the edit anchored on that line — un-crediting 19 cards. The full suite caught it; a
> targeted-test-only run would not have. (2) Both slices' raw-index flip counts (11 and 9) exceeded their
> corpus deltas (+7 and +7). Rather than assume, the slice-42 delta was isolated by disabling only its
> classification changes and re-measuring: 11778 ⇄ 11785 exactly. The gap is the metric's denominator
> excluding token-typed entries, not a regression.

## ☀️ 2026-07-25/27 — CENSUS-DRIVEN GRIND: FORTY slices (net +301 after an HONEST −143) — corpus 33.5%→34.4% — suite 843/10,887

> Colton's standing order: work autonomously on the census method until told to stop. Four slices shipped,
> each through the full RESIDUE-GRIND-RUNBOOK battery (fingerprint both directions · mechanical per-flip
> audit · stale-pin sweep · suite · lint):
> - **Slice 1 `6a524e47` (+144)** — zone-option / optional-cost keywords (unearth, evoke, dredge, kicker,
>   improvise, typecycling…), the permanent side.
> - **Slice 2 `23140a7f` (+37)** — the spell-side siblings (buyback / entwine / conspire / mayhem +
>   improvise), completing the WIP checkpoint left at the power-down pause.
> - **Slice 3 `c93b6d56` (+23) — DELAYED TRIGGERED ABILITIES (CR 603.7), a NEW ENGINE SUBSYSTEM.** 679
>   corpus carriers schedule an ability for a future step and there was no scheduler at all. Built
>   `state.delayedTriggers` + a `schedule-delayed` atom + a step-entry drain that hands fired records to the
>   EXISTING flush→stack→resolve pipeline (zero new resolution code — targeting, the Arbiter fallback and
>   serialization all inherited). **A real resolution-order FP was caught mid-build by an existing
>   MUST_DROP_TO_LOW pin**: the trail matcher first folded a spell's IMMEDIATE effect into the delayed
>   clause (Ideas Unbound would have deferred its own draw-three). Fixing it nearly tripled the yield, 8→23.
> - **Slice 4 `5d3e8d2a` (+9)** — eternalize + reinforce, closing slice 1's explicit deferral with the
>   castability audit that separates them from suspend (their only no-mana-cost carriers are LANDS —
>   played, not cast; suspend's genuinely cannot be played at all, so it stays refused).
>
> **Method notes worth keeping:** the census re-ranks after every slice, so the queue stays honest as the
> corpus moves. Four stale pins updated with NOTEs across the day — each had been RIGHT until its slice
> landed, and two earned their keep by catching real bugs on the way out. Full-suite runs under CPU
> contention produced ~13 spurious failures that all passed in isolation: the runbook's "red under load
> proves nothing" rule, honored rather than assumed.
>
> - **Slice 5 `efdcd659` (+22)** — self-bounce noun widening. "Return this <noun> to its owner's hand" was
>   credited only for creature|permanent; the atom bounces the SOURCE, so the noun is pure templating.
>   Widening it to aura/enchantment/artifact/equipment/land flipped 22 (Shackles + the Aura cycle, the five
>   Trials, the Dragonstorm cycle, Batterskull) with ZERO new runtime code.
> - **Slice 6 `11a85ca7` (+12) — KW-RENOWN (CR 702.111)**, keyword→trigger synthesis on the evolve
>   precedent. The design note worth keeping: CR 702.111a's "if it isn't renowned" is a ONE-SHOT LATCH, so
>   it lives inside the atom beside monstrosity's `monstrous` flag — NOT as an intervening-if, where a
>   fail-open board read would re-renown the creature every combat (unbounded counters, the forbidden FP).
>
> - **Slice 7 `ae0c1c3c` (+13) — the DAMAGE-TAKEN-THIS-TURN ledger + KW-BLOODTHIRST.** New per-seat ledger
>   tallied at the loseLife chokepoint but ONLY when its `combatDamage` flag is defined — the two damage
>   callers pass it, every non-damage loss leaves it undefined, so a drain/pay-life turn can never fire
>   bloodthirst. Its own audit caught an FP mid-slice: the first pass credited the keyword via startsWith,
>   which also swallowed "Bloodthirst X" (a count the synthesizer can't produce → native card, nothing
>   placed). Gate is now digit-anchored.
> - **Slice 8 `60773d7a` (+13) — STATE TRIGGERS (CR 603.8), a new trigger class.** "When you control no
>   Islands, sacrifice this creature" is a continuously-checked condition, not an event; checkStateTriggers
>   runs from the CR 704.3 SBA fixpoint with an arm/disarm latch (that fixpoint runs several times per
>   priority window — a naive check would enqueue a trigger per pass, an unbounded-trigger FP). Three stale
>   pins updated, all of which had named this exact sac frame as their blocker.
> - **Slice 9 `3e4f7b90` (+10) — narrowed a STALE fail-safe.** The γ1 sacrifice-drops-a-trigger guard
>   parked the Spellbomb/Implement cycles; its "zone-LTB the detector misses" clause was no longer true for
>   the SELF form. Verified at RUNTIME (drove the exact move the cost path performs) before narrowing, and
>   only the self subject is exempt — the watcher shapes it was really written for stay flagged, pinned.
>
> - **Slice 10 `c75d9159` (+12) — the single-target TAP-AND-LOCK family, and a CREED hardening.** The
>   runtime already owned every piece (setDoesNotUntapNext + a self-clearing skip in untapAll); only the
>   recognition lane was missing. Needed THREE seams, and the first attempt shipped two of them and measured
>   ZERO flips — the fold joined the rider with " and " and the top-level " and " split shattered it right
>   back, so a keep-whole guard was the load-bearing third piece. The residue strip also knew only one of the
>   rider's two printed pronouns. Hardening, no yield: coverage credited "doesn't untap during your NEXT untap
>   step" while the runtime deliberately refuses that wording (a one-shot rider on a mana ability, the
>   slow-dual family) — zero cards flip on the narrowing, so it removed a loaded gun rather than a live FP.
>
> **SLICE 40 `07b3fcbc` (+14) — the Thriving cycle, via an ALLOWLIST not a denylist.** The optional-payment
> lane already existed; only the bare pronoun failed ("you may pay {E}{E}. If you do, put a +1/+1 counter on
> IT"). A denylist would have to anticipate every way another object enters the sentence — "create a 2/2
> Robot token … it gains haste" slips through and pumps the WRONG permanent. Same trap that made
> "sacrifice it at the beginning of the next end step" unsafe (1 safe card vs 48 landmines, refused). Only
> the two printed self-shapes are rewritten; the token-maker hazard is pinned as a CREED negative.
>
> **SLICE 39 `95226f8f` (+12)** — ENCORE joins the graveyard zone-option family (unearth/scavenge class).
> The list's required castability audit was RUN, not assumed: all 26 carriers have a printed mana cost.
>
> **🚨 SLICE 38 `9bf6db43` (−143, DELIBERATELY) — the number now means what it says.** `hasManaAbility` is a
> TEXT check; the runtime produces mana through `manaProduction`. Crediting on text alone tiered 154 cards
> native-mana whose mana the engine cannot obtain BY ANY PATH — costed activations, dynamic amounts, colours
> chosen on entry. Corpus 34.8% → 34.4%, Colton's call.
>
> **THE FIRST MEASUREMENT WAS WRONG AND WOULD HAVE DELETED WORKING CARDS.** `manaProduction` returning null
> only answers "is this a standing source". Burning-Tree Emissary fails that and still delivers {R}{G} via
> its ETB. The honest instrument is to put each card on a board and ask whether the mana is obtainable by ANY
> path — standing source, offered ability, or a trigger that resolves. 154 by that measure; 0 after the gate.
> Of 157 cards moved, 15 were RECLASSIFIED to a still-native tier and 142 genuinely dropped.
>
> **SLICE 37 `7d0ce6ee` (+6) — counter transfer on death, and a THIRD seam worth remembering.** The clause
> parsed HIGH and the card STILL read body-only, because `atomTargetIntent` had no entry for the new op:
> the trigger-flush chooser refuses to route a targeted op whose SIDE it cannot name, so a new targeted op
> silently stays on the Arbiter until its intent is declared. Parser + resolver is only two thirds of a
> targeted-trigger slice. The effect itself moves the dying object's WHOLE counter bag (CR 603.6e LKI), not
> just +1/+1 — a +1/+1-only build passes every test in the file except the shield-counter one.
>
> **SLICE 36 `a4936d05` (+11) — the lesson from a REVERT, applied immediately.** Between 35 and 36 I built
> a sacrifice-cost lane off a GROUPED count (5 carriers), verified it end to end, measured ZERO flips
> because every carrier had a second blocker, and reverted it. Slice 36 was then picked off the census's
> HONEST column — 5 sole blockers, 0 co — and flipped 11. **A grouped count says a shape exists; the
> sole-blocker column says fixing it moves something.** Now a runbook law. The slice itself was a subject
> widening: "enchanted creature gains <kw> until end of turn" onto the referent slice 23 had just hardened.
>
> **SLICE 35 `43539626` (+1)** — the exile-from-graveyard COST on the GY recursion lane. Small yield; the
> vocabulary is the durable part, and the unpayable-cost gate is mutation-checked (without it the ability is
> free recursion). The triage ledger maps what the rest of that lane needs — 36 cards behind cost vocabulary,
> and a WARNING that its enumerator is instant-speed, so the timing riders are NOT free.
>
> **SLICE 34 `cdfaeac2` (+16) — the day's biggest single slice, and it needed NO new resolver.** BACKUP N,
> modeled as its SELF-TARGET line: self-target is one of the card's own legal choices (forced when it is
> your only creature) and makes the "if that's another creature" ability grant vacuous, so the engine plays
> a real legal line. It simply never offers backup on another creature — an under-offer, the safe direction.
> The synthesized clause is ORDINARY MODELED TEXT rather than a sentinel, so it rides the existing
> self-scoped add-counter atom on a runtime path already proven.
>
> **SLICE 33 `07928070` (net −1) — a slice worth MORE than its card count.** Added the graveyard-exile
> additional cost (ADDCOST-3, +1), and building it surfaced that `extractAdditionalCosts` is consumed ONLY
> on the spell program path — so an additional cost is charged for instants and sorceries AND NOTHING ELSE.
> A PERMANENT carrying one is castable for its bare mana cost, the same over-permissive shape as the free
> Ancestral Visions cast. Two cards had reached native that way and are now parked (−2). **Losing a card to
> delete an over-permissiveness is the correct trade.**
>
> **SLICE 32 `004be245` (+3)** — the bare "You have no maximum hand size" static. The runtime already
> suspended the CR 514.1 cleanup discard for it; only the one-shot dice-roll variant was credited. Cursed
> Rack's "maximum hand size is four" stays parked — the engine suspends enforcement rather than guess, so
> crediting it would claim a number never applied.
>
> **SLICE 31 `272fa79a` (+9) — MOBILIZE, the slice that was correctly REFUSED in the morning and correctly
> built by evening.** It needed two things that didn't exist when it was first scoped: tokens that genuinely
> join `state.combat.attackers` (the `entersAttacking` field is a dead write — attacking-ness is combat
> membership, so "tapped and attacking" tokens would otherwise be inert), and a delayed sacrifice, which the
> CR 603.7 scheduler built earlier the same day now provides. Proven by asserting the defender loses exactly
> 4 life — a number only reachable if the minted 1/1s really attacked. Reading the printed reminder also
> corrected my own scoping note: it sacrifices at the next END STEP, not end of combat.
>
> **SLICE 30 `f6addce6` — the drift probe found something on its SECOND run too.** The attached-form pair
> (`attachedNoUntapOf` metric vs `attachmentPreventsUntap` runtime) disagreed on 7 of 72 Auras: the runtime
> accepts "Enchanted creature|permanent", the metric only "creature". Safe direction (under-credit), zero
> cards flip — all seven also park on their "Enchant permanent" SUBJECT, a separate honest gap — but a
> metric narrower than its runtime twin is a latent divergence the next person to widen enchant subjects
> would have inherited silently. **Two runs, two finds: point it at any metric/runtime pair.**
>
> **SLICE 29 `a71de406` — I turned the day's lesson on MY OWN work, and it caught something.** The metric
> strip added in slice 16 and the runtime's `selfPreventsUntap` are two implementations of one judgement —
> the exact shape that produced eleven bugs earlier. Probing them against each other across all 248 corpus
> carriers found ELEVEN disagreements, all CONDITIONAL statics ("…doesn't untap during your untap step IF IT
> HAS A DEPLETION COUNTER ON IT"). No card had flipped, because an orphaned "if …" fragment happened to keep
> them parked — the metric was crediting what the engine refuses, with only an unrelated leftover preventing
> a false positive. Drift now 0/248, zero tier movement. **The drift probe is worth reusing: any two
> functions answering one question can be run against each other corpus-wide.**
>
> **SLICE 28 `63c72372` (+4)** — dredge was credited on PERMANENTS but missing from the spell-side keyword
> strip, so the identical keyword parked every dredge SPELL (Darkblast, Shenanigans, Life from the Loam,
> Nightmare Void). No costless hazard unlike suspend — dredge never replaces CASTING, so every carrier has a
> normal mana cost.
>
> **🚨 SLICES 26-27 `53247f2c` `81664b6a` — the engine had an INVULNERABLE ATTACKER.** An animated land
> could attack (combat reads the layer-aware check) but could NOT be targeted by "destroy target creature"
> (the enumerator read the printed card). That is not the safe direction an under-offer usually is — the two
> halves disagreed IN THE CONTROLLER'S FAVOUR, giving self-play a threat no removal could answer. Fixed in
> the enumerator and in the four atom-level mass filters; the full suite was UNCHANGED by both, and no pin
> anywhere asserted an animated permanent should be untargetable — evidence it was an oversight, not a call.
>
> **SLICES 23-25 `1fb2ce42` `99e44a78` `820f5a12` — the same defect, swept.** Slice 22's root cause turned
> out to be a CLASS: a permanent looked up on the battlefield and then gated on its PRINTED card rather than
> the LAYER-AWARE read. Six more sites — the "that creature" referent (in TWO places that a comment claimed
> were mirrors of each other and weren't), the "enchanted creature" referent, the shield counter, explore's
> +1/+1, and the source-power fan-out. Every one silently did nothing on an animated land or a crewed
> Vehicle, which CR 613 says IS a creature right then.
>
> **⚠️ WHY THESE SURVIVED — AND THE GATE GAP IT EXPOSES.** All four slices changed ZERO coverage. The tier and
> program fingerprints compare the parse pipeline against itself, so a runtime function returning an empty
> list is structurally invisible to them. **Any slice touching a resolver needs a runtime pin; a
> classification test proves the parse and nothing else.** Now standing guidance in the runbook, along with
> the specific tell: a bare `isCreatureCard` on an already-resolved permanent is nearly always a bug.
>
> **🚨 SLICE 22 `f285dd14` — a NON-CREATURE permanent's self-reference silently did NOTHING.** selfTargets
> returned [] unless the source was a creature, so an Aura / artifact / enchantment saying "return this Aura
> to its owner's hand" parsed HIGH and then no-opped. Measured on Mark of Fury: trigger detected, stacked,
> resolved — Aura still attached. Zero coverage change (runtime-only), which is exactly why it survived: the
> metric never disagreed with itself. The comment directly above that function already warns about this FP
> class for animated lands; this was the same catch one card type wider.
>
> **TWO FALSE TRAILS RULED OUT en route, recorded in the triage ledger so nobody re-walks them:** a
> non-native Aura appearing to VANISH on cast is the intended `pendingArbiter` seam, and auras use a narrow
> own-trigger ALLOWLIST (rather than equipment's general gate) because `isNativeAura` lives in a leaf module
> that cannot import coverage. Also reverted a no-op: extending that allowlist with the aura-ETB-draw shape
> changed ZERO cards, because the shape was already admitted by another route.
>
> **SLICE 21 `277f558b` (+14)** — the COMPOSITE tier didn't normalize self-names, so a legacy card that
> names itself ("Mortivore's power and toughness …") read as unmodeled residue there while the static tier
> credited the identical line. Cards with a modeled static AND a modeled activated ability fell between both
> tiers. **This was the FOURTH one-path-only credit found today** (after slices 10, 16 and 20) — when two
> code paths implement one judgement, the newer gets the normalization and the older doesn't, and the
> disagreement only shows on cards needing BOTH at once. The fix is always to point both at one helper.
>
> **SLICE 20 `b3a4a87a` (+4)** — the kicked-counter credit no longer depends on the base body. Urborg
> Skeleton parked with EVERY line individually credited; the gate hard-coded native-body and rejected any
> base body that wasn't keyword-only. It now re-classifies the stripped body and takes that tier. **New
> reusable signature: a card with TWO different single-line deletions that each flip it native is a
> COMPOSITION failure, never a missing mechanic** — now in the runbook.
>
> **SLICE 19 `c98553e8` (+16) — suspend, correctly split.** The keyword is vacuous on a card WITH a mana
> cost (the hard cast resolves identically — the shipped flashback/escape rationale) and must NOT be credited
> on a costless one, which can only ever be suspended. The earlier blanket refusal of suspend was right for
> the wrong reason: "its carriers can't be played at all" describes about a fifth of the family. Corpus
> crossed 34.6% on this one.
>
> **🚨 SLICE 18 `7505e6a3` — THE BIG ONE: the engine was casting FREE Ancestral Visions.** CR 202.1a says a
> card with no mana cost can't be cast. manaCostOf correctly returned "" for such a card, but
> parseManaCost("") built an all-ZERO cost, which the cast loop offered as legal. Measured, not reasoned:
> Ancestral Vision produced **4 cast actions with ZERO lands on the battlefield** before the fix, and none
> after. Crashing Footfalls (two 4/4 tramplers), Wheel of Fate and Profane Tutor were the same. The earlier
> empty-mana_cost audit fixed the DFC half of this landmine but its tripwire required cmc>0, so genuinely
> costless cards walked past it — don't assume that audit closed the area.
>
> **SLICE 17 `1d837dd9` (+5)** — qualified "Enchant <X>" Aura subjects (tapped / without flying / power N or
> less), each mapping onto a restriction the target filter already enforces. Pinned at the OFFER layer,
> because the FP here is a wrongly-LEGAL target: Roots must not be castable on a flier. Its first harness
> filtered on `a.card?.name` when the action carries `a.name`, so three assertions passed VACUOUSLY against
> an empty array — the hollow-gate trap, caught by mutation-checking.
>
> **THE CENSUS NOW FINDS THESE ITSELF.** `build-residue-census.mjs` gained a BUG SIGNATURES report: any shape
> that blocks cards while OTHER cards carrying it classify native cannot be an unbuilt mechanic — it is
> built, and something upstream mis-binds it. Slices 17 and 18 both came straight off that report on its
> first run. Read it BEFORE the ranked list.
>
> **SLICES 11-16 — the shift turned from adding lanes to REPAIRING them.** Six more slices, and the last
> four were bug fixes the census surfaced rather than coverage gaps:
> - **11 `5e2f24cc` (+7)** — the per-turn activation limit became a COUNT, not a boolean. A boolean cannot
>   say "twice", so Pit Imp / Soul Kiss and five siblings had no lane. `used >= limit` is the whole safety
>   property; off by one hands out a free activation, the forbidden direction.
> - **12 `661f47f8` (+5)** — attach printed as a plain "{cost}: Attach this Equipment …" activated ability
>   (the Cranial Plating cycle). Routes to the SAME ATTACH resolver; the engine only under-offers it
>   (own-main ⊂ any-priority), a safe FN.
> - **13 `0122de3a` (+7)** — "create a token, then attach this Equipment to it", the spelled-out Living
>   Weapon. Deliberately NOT routed through livingWeaponToken: these carry a real printed trigger, so the
>   keyword path would have minted the token TWICE.
> - **14 `585a9562` (+4)** — **a bug I introduced in slice 10**: the fold ate the rider's terminating period
>   and glued the NEXT sentence on. Invisible to the fingerprint, which only shows cards that MOVE — these
>   were held back without changing tier.
> - **15 `0e65ccc9` (+3)** — RIDER-REMOVAL was anchored to end-of-oracle, so an ordinary trailing "Draw a
>   card." killed the match. A pin calling that draw an "unmodeled rider" was simply a misreading: the
>   CASTER draws.
> - **16 `ab0dfcd5` (+4)** — the self no-untap static was credited in ONE residue path only, so the same
>   static flipped a trigger card and parked an activated-ability card. Three paths now share one helper.
>
> **THE READING HABIT THAT PAID FOR 14/15/16 — an OBVIOUSLY MODELED shape in the census is a BUG SIGNATURE.**
> When the census lists `draw a card` as a sole blocker on 8 cards, it is not saying draw is unmodeled; it is
> saying that deleting an already-built line FLIPS the card, so something upstream mis-binds it. That one row
> paid out twice for two unrelated root causes. Scan the census for shapes you KNOW are built and treat each
> as a defect report. Now standing guidance in the runbook.
>
> **THE HEURISTIC THAT OPENED SLICE 10 — SIBLING ASYMMETRY.** Frost Trickster classified native and Frost
> Lynx parked, and the two cards are identical modulo the word "Flying". A card penalized for having LESS
> text is always a strip or residue gate keying on the wrong thing. It costs nothing to check (read two
> examples from one census cluster side by side) and it is now written into the runbook as a standing lead.
>
> **SCOPED, NOT BUILT (banked with reasons so nobody re-derives them):**
> - **backup N** (15 sole) — grants the card's OWN remaining text to a target conditionally; a new
>   value-threading path between objects, which the runbook says to bank rather than rush.
> - **bloodthirst N** (13) / **sunburst** (6) — both need ledgers the engine lacks: damage-dealt-this-turn
>   and mana-colors-spent. Reusing `lifeLostThisTurn` for bloodthirst would over-fire on non-damage life
>   loss — an FP, so it stays parked until the real ledger exists.
> - **mobilize N** (9) — its delayed-sac half is NOW covered by the new scheduler; the remaining blocker is
>   tokens created **tapped and attacking** (real combat-state creation).
> - **split second** (7) — deliberately NOT credited: unlike the optional-cost family it's a restriction on
>   OPPONENTS, so ignoring it makes the engine wrongly permissive rather than merely less capable.
> - **suspend** (12+6) — still refused; its no-mana-cost carriers cannot be played at all without it.
>
> **NEXT on the ranked queue:** backup N (15 sole) · bloodthirst N (13 — needs a damage-specific per-turn
> ledger; reusing life-loss tracking would over-fire on non-damage loss, an FP) · renown N (12 — needs a
> renowned state flag) · aftermath (10) · the Aura self-bounce activated (12 across two cost shapes).

## ☀️ 2026-07-24 MIDDAY — THE CENSUS ERA OPENS: +144 in one slice (zone-option keywords) — corpus 33.5%→33.9% — suite 814/10,608

> **The strategy pivot Colton called this morning is now the standing method** — subsystem-first,
> ranked by the parser's own confessions instead of hand-hunting cards. Full chain shipped today:
> - **`build-residue-census.mjs` (`b56c3810`)** — deletion-probing census: remove one oracle line,
>   re-classify; a flip means the classifier itself named that line THE blocker. v1's line-heuristic
>   approach mis-blamed built subsystems on its first run and was rebuilt classifier-exact the same
>   hour. Headline: **12,067 of 22,775 non-native cards are ONE clause from flipping**; no single
>   shape >18 sole-blockers remains; the aggregate keyword-cost-line family was the top lever.
> - **`RESIDUE-GRIND-RUNBOOK.md` (`28b45f32`)** — the whole method written model-agnostic
>   (Colton's ask: near-identical results from any seat), registered in MASTER-GUIDE; 5 laws, the
>   owning-pipeline table, the full gate battery, a 10-row failure-mode table where every row is a
>   real incident from this shift.
> - **First census-ranked slice (`6a524e47`): +144 flips, zero down** — ten optional-cost /
>   zone-option keywords (unearth, evoke, disturb, embalm, scavenge, mayhem, dredge, kicker/
>   multikicker/offspring, improvise, typecycling) credited on the existing ninjutsu/flashback
>   rationale, every flip mechanically audited against a family-line check, suspend deliberately
>   refused (a no-cost suspend card can't be hard-cast at all), four stale park-pins updated with
>   NOTEs, composed negatives (Skizzik, Hexmark) verified still parked. Corpus 11,477 → 11,621
>   native (33.9%).
> - **Overnight grind data closed out:** two full 6-hour pools, **159,798 games** total
>   (81,386 + 78,412), stuck <0.11%, 0 rejected — totals posted to COMMS for Omnath's data-trust
>   ledger. Not relaunched; the box's cores now belong to the census grind.
> - **NEXT (queued):** the spell-side siblings (buyback/entwine/kicker-on-spells via the
>   COST_ONLY_KEYWORD_LINE family) · then the gy-phase-return build (23+5 carriers, plan in the
>   triage ledger) · then the delayed-trigger spell family (Pact/Mana Drain — 15 sole + 25 co,
>   exactly sized by the census).

> **LATE ADDENDUM 8 — Colton woke up, asked "how is Nev hard," and that question found a sixth real
> flip (`538d0a86`).** Re-checked both of Nev's clauses properly instead of re-defending the 2am
> read. The trigger half really is hard (two separate systems — `castNth` ordinal counting and the
> `{X}`-cost cast filter — that have never been composed, plus no generic way to hand a cast
> spell's own X value to a THIRD permanent's payoff; Zaxara's precedent is a bespoke hook, not a
> reusable one). But the STATIC half ("creatures you control with counters on them have trample")
> was NOT hard and I was wrong to lump it in — Cathedral Acolyte already proved the exact selector
> (`requiresAnyCounter`) generically wired into the layer engine, just never generalized past
> `addWard`. Generalized it to any grantable keyword. Full-corpus grep found 6 real carriers sharing
> the selector; **Winged Hive Tyrant flips clean** (needed one more ability-word label added to the
> STATIC-side strip list too — a separate small gap, same root cause as the Lieutenant fix earlier
> tonight). The other four (Nev, Tesak, Rishkar, Matt Murdock) correctly stay body-only on their own
> separate residue — confirmed, not assumed, via isolated-clause tests proving the selector itself
> works. Whole-corpus tier-fingerprint: 34,210 cards, exactly 1 changed, zero collateral. Full suite
> 811/10,579, lint 0. **Also relaunched the grind pool** — the first 6-hour run finished clean
> (81,386 games, 81 stuck, 0 rejected) while everyone was asleep; a second one is running now.

> **LATE ADDENDUM 7 — first grind pool run completed clean; a second launched behind it.** The
> standing self-play pool (`--max-hours=6 --mode=commander`, 10 workers) ran its full cap and
> finished on its own: **81,386 games (81,305 trusted, 81 stuck, 0 rejected) in exactly 360.0 min,
> 226.1 games/min average, seed 2466789311.** Stuck rate held under 0.1% the entire run — a clean,
> healthy, uneventful 6 hours, exactly as designed. No corpus-code changes riding on this run
> specifically; it's standing WAVE 6 Phase 1 shelf-grind data accumulation. Relaunched a second
> identical 6-hour pool immediately after (no sign yet that Colton's up, and the standing order was
> to keep grinding until he is) — new log, fresh monitor, same throttled heartbeat-plus-anomaly
> pattern (learned mid-shift: an untouched per-tick monitor is way too chatty for an unattended
> multi-hour stretch — throttled to every ~10th tick, immediate passthrough on any real error
> signature). Whoever reads this next: check `data/self-play/` counts against this run's numbers to
> confirm both pools' data landed, and note the run boundary (seed 2466789311 marks the first pool's
> end) if segmenting the accumulated games for analysis.

> **LATE ADDENDUM 6 — fifth real flip, a one-card fix found while scoping a dead end (`2e4738c7`).**
> While checking whether the Lieutenant static half's gate mechanism could reach further (it can't —
> see the correction above), traced a "Commander creatures you own have '...'" grant (Agent of the
> Iron Throne) into the existing creature-or-artifact PiG family (Marionette Apprentice's "put into a
> graveyard from the battlefield" scope) and found the ONE gap: the existing code only matched
> "creature or artifact" word order; Agent prints the reverse ("artifact or creature"). The original
> author's own comment on the symmetric branch said "no live corpus card" for that shape — this one
> just uses the OTHER symmetric form. One-line fix, exactly 1 real carrier (confirmed via corpus grep
> before claiming it), zero collateral. **Small note on process:** the full suite's first run after
> this threw 15 unrelated failures (versionAlignment.test.js among them — a pure file-diff check with
> no possible connection to this change) — pure CPU contention with the grind pool's 10 background
> workers, confirmed by re-running every failed file in isolation (46/46 green). Worth remembering:
> a red run under heavy background load isn't automatically a real regression, but it still has to be
> RE-VERIFIED in isolation before trusting that read, never just assumed.

> **LATE ADDENDUM 5 — fourth real flip, the Lieutenant cycle's triggered half (+3, `71ba3a66`).** "At
> the beginning of combat on your turn, if you control your commander" had a double gap: the
> "Lieutenant —" ability-word label wasn't in the strip list (so the trigger regex never saw the bare
> sentence), and "you control your commander" itself was flat missing from interveningIf.js's
> vocabulary — a genuine, previously-undiscovered condition, not a listed Arbiter exception. Full-corpus
> grep found 16 real carriers of the underlying condition (not just the named Lieutenant cards); 7 use
> this TRIGGERED form, 3 flip clean (Loyal Drake/Guardian/Subordinate), 4 stay body-only on separate
> unrelated residue each. The other 9 carriers use a DIFFERENT mechanism (a continuous "as long as…"
> static buff — Thunderfoot Baloth + 6 more, plus Convergence of Dominion) needing the same fix in a
> different parser (staticAbilityParser.js) — scoped, not built this slice.
>
> **Third bug in a row tonight caught by a test before commit, not after — worth naming as a pattern:**
> Karn's-eyes invented a field name the whitelist reconstruction silently dropped; Mayhem Devil's
> nontoken filter hit the identical class of bug; this one read `permanent.isCommander` instead of
> `permanent.card.isCommander` (the field rides the card everywhere else in the codebase). All three
> would have shipped invisibly — the classification-level tier-fingerprint doesn't see any of them
> (a wrong-but-defined field, or a runtime-only miswiring, still produces A definite answer on the
> probe board, so the coverage metric can't tell the difference). Only the DEDICATED runtime/behavior
> test caught each one. The lesson banked plainly: a tier flip is necessary evidence, never sufficient
> — write the test that actually exercises the new code path, every time, not just the census diff.
>
> **LATE ADDENDUM 4 — back to corpus after the roadmap-queue pass: third real flip tonight, any-player
> sacrifice triggers (+4, `e68a3df3`).** "Whenever A PLAYER sacrifices a permanent/creature" (Mayhem
> Devil, Mazirek Kraul Death Priest, Merchant of Venom, Mortician Beetle) had zero support —
> `checkSacrificeTriggers` structurally only ever scanned the SACRIFICER's own battlefield, so a
> watcher controlled by a different player could never fire no matter what the parser recognized.
> Mirrored the dies-trigger's existing cross-player scan (checkDiesTriggers already iterates every
> player for "eachCreature"-scope watchers) via a new `scope:"anyPlayerSac"` value — same
> architecture, not new. Full-corpus grep (not just the ledger's single named card) found 8 real
> carriers; 4 flip, the other 4 (Carmen/Thraximundar/Fumulus/Zodiark) correctly stay body-only on
> separate, unrelated residue each. **Bug caught by the tier-fingerprint gate itself:** first attempt
> invented a field name (`sacNontokenFilter`) instead of reusing the codebase's existing generic
> `nontokenFilter` convention (already used by dies/etb scopes) — detectTriggers' whitelist
> reconstruction step silently dropped the unknown field, which the fingerprint diff would have
> masked as "0 residual gap" had the test suite not caught it first (the nontoken-exclusion test
> failed outright). Renamed to match convention; refixed. Whole-corpus tier-fingerprint: 34,210
> cards, exactly 4 changed, zero collateral. Full suite 810/10,562, lint 0.
>
> **LATE ADDENDUM 3 — pivoted from corpus-hunting back to the roadmap queue (cindy-roadmap-v2's own
> rule: the queue outranks grinding).** Two findings, both the same shape as the Koma surprise above
> — the vault-side roadmap doc lagging real shipped state:
> - **WAVE 1 items 1+2 were ALREADY SHIPPED** — Colton's laptop session built the free-play London
>   mulligan flow (`64c8a976` HTTP surface, `5c05d739` the fanned-hand/keep-ship/bottom-N screen) +
>   the academy-findings trio (`61716d78`), released as **v0.149.0** ("the game lets you mulligan",
>   `41a256d3`) — this IS the "149" Colton flagged at the top of tonight's session. Verified, didn't
>   just trust: 55/55 targeted tests green, `LearnView.jsx` passes `humanMulligan:true`
>   unconditionally on both start paths, `MulliganPanel` wiring reads clean end to end. Roadmap
>   closed out with commit citations (cindy-roadmap-v2 §Wave 1).
> - **WAVE 3 item 9 "Karn's eyes" was ALSO mostly already built** — `deckOracleContext` already
>   attaches full oracle text for every locked-deck card via `buildCardContextForNames`; the
>   "names/counts only" premise was stale. The one genuinely open half — "sized to a per-chat context
>   budget" — was real and unaddressed: measured live on a 100-card deck, the old 2-rulings/card
>   default nearly doubled the block to ~35%+ of the 32,768 default Ollama context window. Fixed
>   (`be034185`): rulings dropped from the bulk attachment (a specific card's rulings already attach
>   in full the moment the user asks about it directly), oracle text alone now ~15% of the window.
>   Also closes a live per-card Scryfall-rulings-fallback call storm (up to 30/100 cards in the
>   measured deck) that fired on every message. New mutation-checked test pair on
>   `buildCardContextForNames`'s `includeRulings` flag (none existed before).
> - **Lesson banked twice tonight now:** before building ANY roadmap item, verify it isn't already
>   done — the vault doc and the repo's actual shipped state can diverge fast when work happens
>   outside the session that owns the doc (laptop sessions, this session's own earlier corpus work).
>
> **LATE ADDENDUM 2 (Colton, live): "koma is no longer a deck i tore it down."** Retired properly —
> `deck_koma.md` → `deck_koma_retired.md` (memory-side, mirrors the Meren-retired precedent),
> `project_colton_deck_shelf.md`/`reference_deck_sources.md`/`MEMORY.md` all corrected. The dead
> Archidekt link wasn't stale, the deck's just gone. Shelf is genuinely 5 Colton + 11 Joe = 16.
>
> **Second real coverage flip: RAMP-MULTI-TO-HAND (+9, `60a8618c`).** "Search your library for up to
> N &lt;type&gt; cards[, reveal them,] put them into your hand[, then shuffle]" (Land Tax, Yavimaya
> Elder, Ignite the Beacon, Armillary Sphere, Seek the Horizon, Gaea's Bounty, You Happen On a
> Glade, Wild-Field Scarecrow, Plea for Guidance, +7 more — 16 real carriers) had zero parser
> support; only the battlefield-destination sibling existed. Verified the runtime's chain-until-N
> resolver was already destination-agnostic BEFORE writing anything (hand/battlefield/top all reuse
> the identical re-suspend loop) — a proven-infrastructure parser extension, not new architecture,
> found only because a corpus check was run before assuming scope (unlike the very next few
> candidates, below). Whole-corpus program-fingerprint: 11 changed, all expected, zero collateral.
> 9 of 16 carriers flip to native; the other 7 have separate residue and correctly stay non-native.
> Also fixed a stale MUST_DROP_TO_LOW gate entry in parser.test.js (removed with a NOTE per the
> file's own retirement convention — it was pinning the old unmodeled behavior). Vihaan 93%→94%,
> corpus 11460→11469, aggregate 78%→79%.
>
> **Six more candidates precisely scoped, deliberately not built tonight** — real diagnostic value,
> clear reasons each stopped short of a ship, banked so a future session doesn't re-derive any of
> this from scratch:
> - **Mondrak / Keskit, the Flesh Sculptor** (sacrifice "two other artifacts and/or creatures") —
>   the codebase's OWN comment already documents this as a deliberate non-build: a count-sacrifice
>   of a distinguishable (non-fungible) type is a REAL choice the auto-pick can't make faithfully;
>   needs a genuine new interactive multi-pick-by-filter sacrifice mechanism (tutors have one,
>   sacrifice doesn't). 2-card lever, real new architecture required.
> - **Hexing Squelcher's Ward-group-grant** / **Vexing Shusher's activated counter-protection
>   grant** — both re-scoped correctly this time (the counter-proofing SELF/controller-scope statics
>   already work, per the earlier entry below): each remaining gap is a genuine 1-card lever
>   requiring new architecture (a static group-keyword-grant recognizer; a temporary spell-protection
>   grant tracked through the SAME counter-target-enumeration chokepoint). Not worth the build cost
>   at 1 card each relative to tonight's other finds.
> - **Redirect-a-stack-object** (Deflecting Swat, Insidious Will, Redirect, Emissary of Grudges) —
>   a real 4-card lever, but "choose new targets for target spell/ability already on the stack" has
>   ZERO existing runtime support anywhere (grepped) — needs a new atom + a new two-stage
>   interactive choice + stack-object mutation logic. Moderate leverage, substantial new build.
> - **Cumulative upkeep** (88 corpus cards, only 8 native) — the bare keyword already works
>   (native-body alone); the 80 non-native cards have DIVERSE, unrelated residue, not one shared
>   gap. Same "shared label ≠ shared fix" trap as transform/DFC earlier tonight, rediscovered here.
> - **The "steal top card of an opponent's library" family** (15 cards matching the phrase,
>   incl. Ragavan, Nimble Pilferer) — turned out to be the SAME trap at a finer grain: reading all
>   15 cards' full text shows genuinely heterogeneous compositions (permanent vs. this-turn exile
>   duration, modal wrappers, granted/quoted triggered abilities, conditional sacrifice-to-unlock,
>   some with NO cast permission at all). Ragavan's own specific shape ("create a Treasure token and
>   exile...") needs a bespoke new compound matcher + a runtime extension to read `ctx.damagedPlayerId`
>   (an existing, proven context field other atoms already consume) for the library source while
>   keeping the exile zone/cast permission on the controller — real, ~1-2 card yield, worse
>   effort-to-value than tonight's two ships.
> - **Tervigon's "Spawn Termagants —" label** — `detectTriggers` doesn't even see this trigger at
>   all; ability-word labels are a deliberate, hand-verified allowlist (NOT a generic strip — the
>   codebase's own comment: "a blanket strip would mis-normalize hundreds of cards"), and each real
>   CR ability word needs its own hand-coded trigger-shape handler, not just an allowlist entry.
>   Tervigon-only (1 card) in the corpus.
>
> **Methodology note for whoever picks up the ladder next:** a shared oracle-text PHRASE across
> cards is a weak signal for a shared FIX — six candidates tonight looked like clean multi-card
> levers from a `grep` count and turned out to be heterogeneous under the hood once the full text
> was actually read. Check the real parse state and read full oracle text before estimating a
> candidate's size; the BLEND ranking (most-played × live grind-breakage) the standing corpus
> roadmap already calls for is a better prioritization signal than phrase-matching.
>
> **Gate:** full suite **810 files / 10,554 green** at commit `60a8618c`, lint 0.

> **LATE ADDENDUM:** after the diagnostic wind-down below, reimported Joe's all 11 Moxfield decks
> (same verified pipeline as Colton's Archidekt reimport, reference_deck_sources.md's IDs) — a
> genuinely different, lower-risk task than more static-ability-parser archaeology, deliberately
> chosen after two self-corrected diagnostic passes on the same mechanism area in one night (the
> "two failed attempts, change approach" signal, even though both were caught before shipping).
> **Shelf census: 1→16 decks loaded on this box tonight, all real.** Found a SECOND instance of the
> same bug CLASS as the Archidekt maybeboard fix (not the same bug — checked properly this time
> before concluding anything): Kinnan Mana Overload and Hulk Smash imported with 121/111 raw cards
> respectively, both explained exactly by `mainboard(99) + commander(1) = 100` legal plus Joe's
> Moxfield "sideboard" board holding a real wishlist (Worldly Tutor, Mystical Tutor, Counterspell,
> Sylvan Library, Walking Ballista — clearly "considering" cards, not the actual 100). Verified this
> is NOT a bug before touching anything: `deckAnalytics.js`, `deckContextBuilder.js`,
> `deckMemory.js`, AND `measure-coverage.mjs` all already, consistently filter `section !== 
> "Sideboard"` — the store correctly preserves Joe's tracking data, every real consumer already
> ignores it. Confirmed empirically post-save: Kinnan measures 75/100, Hulk Smash 69/100, Mothman
> 88/98 (its known, documented 2-basics-short state) — all against the correct denominators.
> **Full fresh per-deck census, 16 real decks:** Slivers 99%, Omnath 94%, Vihaan 93%, Zaxara 93%,
> Mothman 90% (88/98), cdh 81%, Earth Bent 79%, Did you say Dragons? 76%, Kinnan 75%, Believe it!
> 73%, Jurassic Ramp 72%, Kellan/Captain America/Wolverine/Hulk Smash all 69%, Halfshell heroes 55%.
> **Aggregate: 78% native, 1,253/1,597 slots.** **UPDATE (Colton, live): Koma is retired — "no longer
> a deck i tore it down."** The 404 wasn't a stale link, it was the deck being gone; shelf is
> genuinely 5 Colton decks (not 6) + Joe's 11 now. Historical decklist kept memory-side
> (`deck_koma_retired.md`). Veyran still has no ID (scoping-only per the registry).
> No code changed this pass — pure data operations through the running server's own API, backed up
> before every save (`decks.local.*.reimport-*.json` under the profile's `backups/`).

> **Colton, from his phone mid-session:** "run all night, full auto, your own recommendation, don't
> stop — v1 roadmap first, corpus grind if you run out." First-ever `/cindy` boot on the always-on
> box itself, not the laptop — matters because this box has the real Scryfall/profile data the
> laptop lacked, unblocking WAVE 6 for the first time.
>
> **WAVE 5 closed out.** Baseline verify caught a real gap: lint was 2 warnings dirty (an orphaned
> `eslint-disable-next-line` in `ScrySurveilPanel`, one line off after the mulligan commit touched
> that `useEffect`) despite the standing "lint 0" claim — fixed (`4bc0f102`), a genuine hollow-gate
> instance. **B5 and C3 (07-18 improvement slate) turned out already done** — just never marked
> closed in the memory-side doc; saved real time, only needed one missing `sync:cardkingdom` alias
> (`162b6ca9`). **C4 broadened**: new `triggerTierPins.test.js`, 16 real corpus cards live-verified
> before hardcoding, pins the native-trigger residue gate — the most complex chain in `coverage.js`,
> zero dedicated pins before tonight (`e5ea27fe`). Found but NOT pinned (ambiguous whether deliberate
> park or a real gap): **Skullclamp classifies body-only** — equipment+trigger combo the runtime
> doesn't credit as a unit; flagged as a corpus-grind lead. **B1 phase 2 — the real work of the
> night** (`f154e94d`): `/api/rules-retrieval` deleted its own duplicate CR-rule pipeline, now calls
> the shared `lib/server/rulesRetrieval.js` instead — card-name-awareness (`[[Card Name]]` syntax)
> and RulesGuru precedent matching reach this endpoint for the first time. Verified with real
> before/after query snapshots, not just the pinned shape contract — caught and fixed a live
> regression (route.js's curated topic→anchor knowledge, e.g. "legend rule"→704.x, wasn't reaching
> the merged ranking) by seeding those anchors into the query text so the shared engine's own
> exact-rule-number scoring picks them up. **Two real bugs found and fixed along the way, not just
> refactor risk:** CI never built `data/rules-index.json` before running tests (added the step to
> `ci.yml`, pure local transform, zero network cost) · the shared engine's card-name-seeking
> hard-throws when the local oracle repo is absent (legitimate in CI/fresh checkouts) — now degrades
> to "no names detected," scoped narrowly to an ENOENT-only catch.
>
> **WAVE 6 Phase 0 re-baseline.** Fresh corpus-wide census: **33.5% native (11,459/34,245)**; play-
> weighted top-1000=69.3%, top-2500=51.3%, top-5000=41%, top-10000=33.8%. **The slice manifest is
> built** (`build-slice-manifest.mjs`): ladder-matched 2,369 cards project to 40.4% if fully built;
> biggest levers by EDHREC-weighted count — transform/DFC (669), tutors (389, Phase-2 GREENLIT),
> loyalty-activated (312), token-copies (215), counterspells (207). Full per-subsystem table with
> top-1k/2.5k/5k breakdowns in the manifest JSON (not yet committed to the repo — regenerate with
> `MTG_APP_ROOT=<AppData root> node scripts/build-slice-manifest.mjs`).
>
> **Shelf census: 5 of 15 decks now loaded** on this box (was 1 — a fresh profile as of 07-19 per
> `reference_deck_sources.md`; laptop data doesn't travel). Reimporting the rest surfaced a genuine,
> previously-unknown bug: `normalizeArchidektDeck` only excluded a card tagged literally
> `"Maybeboard"`, not Archidekt's real signal (a deck-level `categories[]` array with
> `includedInDeck` per category — a deck's own "Tokens & Extras" bucket, or any custom board name,
> can independently be excluded, and a card can carry BOTH a real type tag and an excluded-bucket
> tag at once). Verified live: Zaxara imported at 108 cards (8 phantom "Tokens & Extras" token-
> tracking entries counted as real) before the fix, 100 after. Fixed + regression-tested
> (`1ca400c7`) — this was a live correctness bug in the shipped `.exe`'s import feature, not just a
> data-loading gap. **Aggregate per-deck coverage: 92% (458/499 slots)** — Slivers 99% (98/99, deck
> is honestly 99 cards on Archidekt — 2 real token-tracking entries excluded, not a missing spell;
> matches the established Mothman-98-card precedent, not silently patched), Omnath 94%, Vihaan 93%,
> Zaxara 93%, "cdh" (Rograkh/Thrasios) 80% (→81% after tonight's Gamble flip, below). **Open (at the
> time):** Koma's registered Archidekt id (18157040) 404s — later resolved live: Colton confirmed the
> deck is retired, not a stale link (see the shelf-census addendum below); Joe's 11 Moxfield decks
> not yet reimported at this point (time budget + Moxfield-specific fetch quirks — done later
> tonight, see below); no grind history exists
> on this box yet, so the "newest spell-unresolved ranking" and "trigger-label residue" Phase-0 items
> are genuinely N/A until Phase 1 generates the first data here.
>
> **Arbiter-in-runner status (stated, per Phase 0):** the engine never calls Ollama/network at
> runtime, in self-play or otherwise. An unresolved cast is logged honestly as `spell-unresolved` +
> `state.pendingArbiter` — the UI (not the grind loop) is what hands a gated card to the Ollama-only
> Arbiter for a ruling.
>
> **WAVE 6 Phase 1A: dispositioned triage ledger for the 5 loaded decks** —
> [TRIAGE-LEDGER-2026-07-23.md](TRIAGE-LEDGER-2026-07-23.md). 41 non-native slots, every one read
> against real oracle text (never memory) and tagged BUILD / INTERACTION / PARK-CANDIDATE, zero
> left blank. Reading every card's actual text (not just its mechanism bucket) surfaced four
> cross-deck "build-once-flip-many" groups: counter-proofing (3 cards), cast-as-flash (2 cards),
> redirect-a-stack-object (2 buildable + 1 parked), excess-damage-linked payoff (2 cards). Also
> flags Battle cards (Invasion of Ikoria // Zilortha) as a whole uncounted corpus vein — not on any
> existing D-vein list, worth a fresh census before scoping.
>
> **A real flip landed: Gamble, native (`c98bd172`).** Diagnosed in the ledger, then actually built:
> both sub-clauses (tutor-to-hand, discard-at-random) already parsed HIGH individually, but the
> composed sentence failed entirely because `splitClauses` kept "any search-your-library sentence"
> whole (correct for most tutors) and the tutor matchers are end-anchored right after "into your
> hand" — an interposed clause before the trailing "then shuffle" broke the whole match. Fixed with
> a narrow, exact-wording-anchored split rule (no new atom type, the tutor matcher itself untouched)
> and verified with a **whole-corpus `program-fingerprint` diff** (the full rigor this file
> demands): 34,245 cards, identical count, **exactly one line changed** — Gamble. Nothing else
> shifted by a byte. A live corpus check also caught that "Night Out in Vegas" prints the identical
> phrase in a modal bullet (a different, verified-untouched parse path) — corrected an initial
> "corpus's only such card" claim before it shipped. Corpus 11,459→11,460; the cdh (Rograkh/
> Thrasios) deck 80%→81%. Pinned in `splitClauses.test.js`.
>
> **Deep-scoped three more ledger candidates rather than rushing a second flip** (see
> [TRIAGE-LEDGER-2026-07-23.md](TRIAGE-LEDGER-2026-07-23.md) for the full, twice-corrected diagnosis):
> the counter-proofing cluster turned out to be a SPLIT verdict — Vexing Shusher's and Hexing
> Squelcher's SELF/controller-scope "can't be countered" clauses already classify `native-static`
> (already built, already enforced at the counter-target-enumeration chokepoint); Hexing Squelcher's
> whole remaining gap narrows to exactly one clause (a static group-grant of Ward); Vexing Shusher's
> is a different one (an activated grant to another spell); Veil of Summer is genuinely unbuilt (it's
> an instant, so identical-looking words hit a different code path than a permanent's static). Also
> precisely scoped Mondrak's residue (an activated ability, not the doubler — that already works).
>
> **Also censused the slice manifest's #1-ranked lever (transform/DFC, 669 cards) and it's not one
> project**: 871 DFC cards in the corpus, 170 native (19.5%), and the gap spans every mechanism
> bucket roughly evenly — DFC cards just skew toward complex/named templating and inherit whatever's
> unbuilt corpus-wide. The manifest's raw count overstates this as a standalone target; most of those
> cards flip as OTHER subsystems land, not from a "DFC support" project. Same lesson twice tonight:
> a shared bucket label isn't a shared fix size — check the real parse before trusting a ranking.
>
> **Gate:** full suite **809 files / 10,551 green** at commit `cb23861f`, lint 0 (no code landed after
> the Gamble flip — the rest of the night was diagnostic + data work, deliberately: two self-
> corrected mistakes on the same static-ability code area was the "change approach" signal, and deck
> reimport was the safe, different, still-valuable pivot). **Shelf census is DONE — genuinely
> complete**, not just "16/17ish": Koma's dead link turned out to mean the deck is retired (Colton,
> live: "no longer a deck i tore it down"), so 16 real decks IS the whole active shelf (5 Colton + 11
> Joe), no gap remaining there. **NEXT:** three precisely-scoped build candidates ready to open
> properly (Hexing Squelcher's Ward-grant, Vexing Shusher's activated grant, Mondrak's activated
> ability) — each needs real build time, not another spot-check. Otherwise: real subsystem work off
> the manifest (tutors/counterspells/wheels, Phase 2 GREENLIT) rather than the DFC/transform framing,
> now backed by a full 16-deck coverage picture to prioritize against. Session wound down here by
> choice — the safe, gate-verifiable slices are exhausted
> for tonight, not the work.

## 🃏 2026-07-23 — v0.149.0 SHIPPED: the game lets you MULLIGAN (+ academy fixes + B3 cold-start) — suite 10,514

> **Autonomous grind (Colton: "grind 4 hrs, get as much done as you can").** Master is well ahead of
> v0.149.0 now; tip carries WAVE 5 health work not yet in a release.
>
> **v0.149.0 (tagged, CI built) — WAVE 1 of the [[cindy-roadmap-v2]] queue:**
> - **The free-play human London mulligan** — the one real playability gap from Colton's first live 4P
>   (a dead 7 with no recourse). Built in 4 verified slices: engine step-primitives (`applyMulliganShip`/
>   `applyMulliganKeep`) + an interactive `chooseBottom` seam (`3804040f`) · a session-level
>   `advanceMulligan` state machine that deals-don't-open → keep/ship/bottom → opens the game, off a
>   `startGame` split into `prepareStart`/`dealOpeningHands`/`openFirstPriority` (`7f9a8663`) ·
>   `/api/learn/start` `humanMulligan` + new `POST /api/learn/mulligan` (`64c8a976`) · `MulliganPanel`
>   UI — fanned hand, Keep/Ship, tap-to-pick bottom (`5c05d739`). Verified live against the running dev
>   server end-to-end, not just vitest. **A real bug the wiring test caught:** `isComplete` treated the
>   new "mulligan" status as a finished game → the routes DELETED the session mid-mulligan; fixed.
> - **Academy findings trio** (`61716d78`): tableSnapshot `eliminated` flag → "☠ Eliminated" badge (no
>   more "-4 life") · a CR-103.8c turn-1 draw note (commander, turn 1) · "Expert" difficulty → "Autopilot".
>
> **v0.149.0 CI succeeded + PUBLISHED** (24m) — signed installer + `.sig` + `latest.json` live; the
> mulligan feature is on the auto-updater.
>
> **Post-release, on master (WAVE 5 health — next release will carry these):**
> - **B3 cold-start, both halves.** Cheap half (`a996572f`): a lone `scryfall-bulk` sync now rebuilds the
>   derived oracle-index + printings-index (the "all" sequence already did; the single-action path left
>   them stale) — a failed rebuild fails loud, never a silent "refreshed". Fuller half (`aaf4c52f`): a
>   non-blocking `setImmediate` boot pre-warm of the card + rulings indexes so the first lookup is hot.
> - **B4 god-component decomp — CollectionView pass (`2d726b0a`).** The 6 pure presentational panels
>   (Conflicts/CenterMessage/EmptyState/BulkActionBar/HeaderOverflowMenu/ShowpieceShelf) moved to
>   `collectionViewPanels.jsx` (1,240→~930 lines), **byte-identical proven** by a new render-fingerprint
>   gate. MTGAssistant.jsx (the stateful shell) is the harder remaining B4 target — no clean fingerprint,
>   stale-closure risk; do it in a focused session, not a fast autonomous pass.
>
> **Gate:** full suite green — **807 files / 10,527** at the current master tip, lint 0, prettier clean.
>
> **☀️ Next unblocked (queue):** WAVE 2 / WAVE 3-core / WAVE 4 are GATED on Omnath (Room-Guide voices ·
> Foundry deck-model schema · docket-RAG seam). Remaining unblocked lanes: WAVE 5 (B4 god-component
> decomp · small bundle — but the coverage-classifier dedup is FP-risky, park it for a Colton-present
> session) or WAVE 6 corpus grind ([[cindy-corpus-roadmap]] — Phase 0 re-baseline first). The mulligan
> UI's browser SCREENSHOT is still owed (dev profile had no decks to reach it live; API round-trip was
> verified instead) — grab it next time a profile with decks is loaded.

## 🌱 2026-07-18 — LADDER RUNG 0.6 "ROOTS THAT TRAVEL" SHIPPED — engine/shell seam is now ENFORCED, suite 10,422

> **What landed:** `app/src/lib/enginePortability.test.js` — a structural guard that fails the build if the
> durable engine surface ever couples to the Tauri shell. Surface = `src/lib/learn/**`, `src/lib/server/**`,
> `src/app/api/**` + `src/middleware.js` + `src/instrumentation.js`, **plus everything they transitively
> import** (255 seeds → 260 files scanned). The seam is now written down in
> [PROJECT-SCAFFOLD §2.3](PROJECT-SCAFFOLD.md), per step 2 of the portability plan.
>
> **This closes step 1 of the vault's `plan_engine_portability` roadmap** (the highest-leverage move: turn an
> accidentally-clean boundary into a guaranteed one). Steps 3–6 (Ollama adapter shape, request-level headless
> smoke test, Mac bundle targets) remain open and are still box-gated or low-urgency.
>
> **Mutation-checked** (per the HOLLOW-GATE LAW — every probe reverted, `git status` verified clean):
> direct `@tauri-apps` import in `cardIndex.js` → RED · backtick dynamic import → RED · **transitive** leak
> (engine → `hooks/useTauriAppVersion.js` → Tauri), chain reported → RED · `window.__TAURI_INTERNALS__` with
> **no import at all** → RED · moved engine root → RED with an actionable message · stale exception → RED.
>
> **Two things the adversarial review caught that the original audit did not, both now fixed:**
> 1. **The globals are a real bypass.** The vault audit scoped the risk to `@tauri-apps` *imports*, but this
>    repo's own shell idiom is `window.__TAURI__ || window.__TAURI_INTERNALS__` (used in all 5 shell files).
>    An engine file copying that pattern couples to the shell with zero imports. The guard now forbids the
>    globals inside the surface too — this is the likeliest real-world leak, not the import.
> 2. **The guard was nearly a hollow gate itself.** Only 5 files are reached transitively on the live tree,
>    so if the resolver regressed to always-null the whole graph-walk feature would die while the file-count
>    floor still cleared and the suite stayed green. Fixed with a fixture-tree SEEN-TO-FAIL that proves a
>    2-hop violation is caught and its chain reported, plus resolver unit tests and a cycle test.
>
> **One live finding, judged NOT a break:** `src/lib/server/originGuard.js:36` carries `"tauri://localhost"`
> in its CSRF Origin allowlist. That is an inert string in a pure, dependency-free module — it never matches
> on a Mac and needs no shell present — so it is a `DOCUMENTED_EXCEPTIONS` entry with a written rationale,
> not a violation. The exception list is self-policing: an allowance that stops matching fails the suite, so
> it can't quietly become a dumping ground.
>
> **Gate:** full suite **10,422 green / 801 files**, lint 0 warnings, prettier clean. No new public surface,
> no secrets, no endpoints — test + docs only.

## 🌇 2026-07-17 ~15:30 — DAY-SHIFT WIND-DOWN (Colton called it) — FLOOR EMPTY — 34.01%, suite 10,307, v0.146.0 cut

> Colton called the wind-down and asked for memory + push + omnath comms. All three in-flight seats harvested
> clean and swept — **UT-1** group don't-untap lock (87656bca, +5 Winter-Orb/Meekstone), **TR-3** trigger scopes
> R2 (3ee079ba, +44 historic/multicolored/end-step/artifact-PiG), **FE-1** for-each drain-by-count (cd66f0f1, +4).
> **No agent worktrees remain.**
> **FINAL DAY STATE: 34.01% native = 11,619 / 34,161 (crossed 34%), suite 10,307 green, LOST=0 on every genuine
> native across all 23 slices.** Day-shift NET +398 (from the v0.145.0 morning at 32.85%). Method: the CEN-3
> whole-corpus census (085d2dbe) ranked the veins, then census-driven parallel Opus seats mined them — no more
> guessing. Fable credits ran out ~12:00 → switched to Opus (Colton's standing order); the earlier selfPlayRunner
> flake was root-caused + fixed (51418c92, engine proven deterministic).
> **CORRECTNESS WINS beyond coverage:** killed latent FPs (Tarmogoyf 0/0, Arrest mana-tap leak, magecraft copy-half,
> menace 2-blocker wedge, multi-block CR 510.1d damage-division); swept 36 stale 701.15→701.19 regen cites +
> corrected in-flight cites (509.1c, 201.4→201.5, 701.27/701.28→701.34, 613.3c→613.4c, 514→513, 702.x→700.6).
> **KEY STRATEGIC FINDINGS (for the next grind session):** modal vein is MINED OUT (singleton-atom tail, drop it);
> alt-cast/flashback is CAPABILITY-ONLY (+0 coverage — the strip already flips native bodies, so jump-start/retrace
> won't move the metric either); the aura program is the most fertile remaining vein (stage 4+: aura dies-triggers
> ~49 + counter-on-enchanted need [TRG]/[EFX]); group quoted-grant statics (133, [SAP]+[TRG]) and the face-down
> (164) + subgame (126) new-subsystems are the biggest untapped tier-movers.
> **DEFERRED / FLAGGED (queued for future slices):** the detectTriggers period-truncation bug (TK-1: quoted-ability
> effect clause truncated at first period, parks ~15 Pest/Devil makers — quote-aware extraction, corpus-wide blast
> radius); combat-damage-"to a player"-deliberate-FN (blocks Grateful Apparition + the proliferate saboteurs);
> totem-armor cite 702.116→702.89 (task_3329dfa8); the crime subsystem (CR 700.13, ~20 cards); the remaining
> cite-hygiene families. See the pre-verified cite mapping in the deferred-cleanup note further down.
> **1.0 ROADMAP** (Colton, deferred to a full weekend sitting): Vault-zone full rework (1.0 req), Academy →
> playable shelf, random effects (RNG primitive already landed), and the coverage-bar-for-1.0 question still open.

## ☀️ 2026-07-17 ~09:15 — FLAKE CLOSED + FLOOR RELIT (Colton: full-autonomy grind, Fable back, until he calls stop)

> **selfPlayRunner flake ROOT-CAUSED and fixed (51418c92)**: engine PROVEN deterministic — a 960-game probe
> (300× same-seed with id-reset, 300× without, 120 batches) produced ONE fingerprint per scenario, plus 12/12
> green full-suite reruns. Diagnosis: spurious timeout under MULTI-SUITE contention (3 agent gates + the
> integration gate concurrently), the class vitest.config.js documents. Fix: legacy nextId de-randomized
> (was crypto.randomUUID — ids feed sort tie-breaks, a replay hazard), NEW selfPlaySeatingDeterminism.test.js
> (5 load-independent pins incl. serialize→mid-game-restore→byte-identical continuation), 90s per-file ceiling
> on the heavy runner file. Gate: 9,825 green, lint 0, flip-diff 0. v0.145.0 CI was queued at ~08:45 (~22 min
> typical) — verify the release published when checking in.
> **STANDING ORDER (Colton, 09:10)**: corpus grind NON-STOP, full autonomy, dynamic agent/model choice (Fable
> restored), until he stops me or interjects from his phone. 1.0 roadmap + Vault deferred to a full weekend
> sitting. Floor relit: 3 Fable seats.
>
> **~14:45 checkpoint — 33.85% (11,565), suite 10,243, day-shift +344, all Opus.** Since 13:00: **AU-2**
> pacifism-locks (8a080e04, +12 — mana-leak FP closed via 605.1a) · **RG-1** regenerate (29cdfe72, +5 — the
> shield subsystem already existed; swept 36 stale 701.15→701.19 regen cites off the cleanup queue; flagged
> totem-armor 702.116→702.89 as task_3329dfa8) · **TK-1** tokens (08a4faf4, +8 — keyword tokens already won;
> quoted dies-triggers + plural mana tokens; flagged a detectTriggers period-truncation bug for a future
> [TRG] slice) · **CDP-1** CDA P/T (28455101, +27 — Tarmogoyf/Maro/Lhurgoyf; closed a latent 0/0 FP: */*
> creatures were native but computed 0/0 for non-you-control counts) · **FB-1** flashback (c7fbf2ab, **+0
> native** — HONEST: flashback flip-ceiling already realized by the strip, so the graveyard-recast+exile flow
> is a runtime CAPABILITY not coverage; 85 cards now recastable, foundation for jump-start/retrace — ALT-CAST
> DROPPED from the coverage queue) · **AU-3** aura-own triggers (5da1064f, +9 — classifier-only gate,
> runtime-verified all 9 fire+resolve) · **PV-1** damage prevention (2ba6311c, +2 — Fog Bank; prevention
> machinery mostly pre-existed). **IN FLIGHT (3 Opus)**: **PR-1** proliferate · **TR-3** trigger scopes R2
> (end-step/artifact-to-gy/historic-cast/crime) · **UT-1** untap-control. Agents keep hitting the MTG_APP_ROOT
> main-tree-edit confusion but self-correct; my desk flip-diff is the authoritative backstop.
>
> **(superseded ~13:00) — 33.67% (11,502), suite 10,136, day-shift +281. Fable credits ran out ~12:00 → agents
> switched to OPUS (Colton's standing "keep working set to opus").** Since 11:30: **EK-1** connive+suspect
> (6e496cb3, +20 — honest learn/incubate parks; flagged ~184 digital/Un-set denominator noise) · **CC-2**
> counter-cost activations (f2f7a791, +26 — Thallid tribe) · **CC-3** self-NAME counter costs (c0a83f68, +1
> Mikaeus — but threaded card-context through the metric⇄runtime pair, so ~28 carriers flip free later) ·
> **EW-1** enters-with extensions (4580c0aa, +45 — named-kind was a COVERAGE seam not a resolver gap; shield
> counters already modeled; corrected CA-2's stale "no raid ledger") · **AU-1** aura stage-1 (5c502419, +6 —
> KEY FINDING: pump family already 62/71 done, the 253 was a POOL count; real aura residue is stage-2
> restrictions) · **KK-1** kicker keyword grants (912165fa, +7; desk-corrected its 201.4→201.5 cite) · **ML-1**
> modal (236b0138, +3 — KEY FINDING: modal vein MINED OUT, residue is singleton-atom whack-a-mole, drop from
> queue). THREE main-tree cherry-pick slips total today (all caught pre-push, reset clean) — root cause was the
> `cd /c/Projects/mtg-tool` prefix for cite checks; FIXED PERMANENTLY: worktree has knowledge/, cite checks now
> run from cwd, that prefix is BANNED. **IN FLIGHT (3 Opus)**: **AU-2** aura pacifism-locks · **TK-1** keyword/
> ability tokens · **RG-1** regeneration shield. Sync note (Colton asked): work → git push → GitHub master
> only; the omnath Weaviate brain does NOT auto-ingest — needs a vault memory write to reach it (offered at
> wind-down).
>
> **(superseded ~11:30) — 33.42% (11,420), suite 9,998, day-shift +199.** Since 10:15: **TR-2** trigger scopes
> (91ab0265, +31 — each-player-upkeep + blocks/becomes-blocked + attacks-alone; 4 house cites corrected in new
> text) · **CS-1** combat statics (7aaa6b47, +31 — multi-block WITH the CR 510.1d damage-division fix the old
> loop lacked (full-power-to-each was fabricated damage), must-be-blocked, can't/must-attack-unless; fixed
> Reckless Cohort over-enforcement) · **CA-2** self as-long-as gates (581c058f, **+85 — CAMPAIGN'S BIGGEST
> SLICE**; 16 gate families incl. life/hand/GY/poison/planeswalker-type/counters; rightly parked color-counts
> on derive re-entry risk) · **CC-2** counter-cost activations (f2f7a791, +26 — the Thallid tribe pays;
> latent costX no-choice-gate seam closed). Queue from census follow-ups: CC-3a X-count lane, CC-3b self-NAME
> costs (~49), DF-1 "as though no defender" [SAP] statics, aura-residue staged program (979 pool).
>
> **(superseded ~10:15 checkpoint) — 32.92% (11,247), suite 9,874.** Landed since relight:
> **CEN-3** fresh census (085d2dbe — THE vein map: 17,395 body-only, 10,908 single-residue; top-12 ranked
> with collision groups; read it before picking any lane) · **EV-3** set-level ≥N min-blockers + compound/
> subtype except-by (f7e22399, +8 — ALSO fixed a pre-existing menace offer-gate wedge where a legal 2-blocker
> pair could never complete; flagged repo-wide 509.1c-for-restrictions mis-cite family → cleanup queue) ·
> **CA-1** condition-gated group anthems (01cd8cdf, +18 — live "as long as" gates at 613.4c/613.1f per
> 611.3a/b; two anti-fabrication guards TIGHTENED (structural gated-descriptor assertions), desk-audited;
> census vein #1 machinery now open). **IN FLIGHT (3 Fable seats)**: **TR-2** each-player-upkeep +
> blocks/becomes-blocked trigger scopes · **CS-1** combat block/attack statics (census #12) · **CA-2**
> self-subject as-long-as gates (vein #1's other half). Deferred for a QUIET floor: the cite-hygiene pass
> (now incl. 509.1c family) + the census's free Contraption denominator fix (−43 Un-set noise; re-baseline
> required — never mid-flight).

## 🌅 2026-07-17 ~08:40 — WIND-DOWN (Colton called it) — FLOOR EMPTY, v0.145.0 CUT — 32.85%, suite 9,820

> Colton stopped the floor and asked to wind down. All three in-flight seats harvested clean and swept:
> **EV-2** evasion "can't be blocked except by flying/color" (93b0fa09, +8; cite 702.9b verbatim) · **GA-1**
> global each-creature anthems/debuffs (77377b21, +14; the all-players sibling of SF-1, opponent-creature
> lethal-toughness pin) · **CTR-2** self-scope counter multiplication (50f79460, +1 Mowu; the doubler seam was
> already 18/26 saturated — a full seat for +1, the diminishing-returns signal). **No agent worktrees remain.**
> **FINAL NIGHT STATE: 32.85% native = 11,221 / 34,161, suite 9,820 green, LOST=0 on every genuine native.**
> **v0.145.0 CUT** = 53 engine slices since v0.144.0 (30.87% → 32.85%, +674 native); CHANGELOG [0.145.0] written.
> Two main-tree cherry-pick slips tonight (stray `cd` into the stale main checkout) — both caught in a second,
> nothing pushed, reset clean; hard rule now: cherry-picks run ONLY in the worktree seat.
> **NEXT SESSION — the 1.0 pivot decision is Colton's** (posed at wind-down, awaiting his read): keep nibbling
> corpus (diminishing returns) vs. pivot to the 1.0 feature shelf he blessed — the reworked **Vault** zone (1.0
> req), the **Academy** play/teaching fix, moving the **sim center to the playable shelf**, and **random effects**
> (already seeded tonight: the RNG primitive + random discard landed). The DEFERRED CITE-CLEANUP below is now
> runnable on the empty floor — pre-verified target numbers are in that note; do it as the first clean pass.

## (superseded) — 32.78%, suite 9,771 — 3 OPUS seats hot

> Standing order (Colton, bedtime): fully autonomous, 3 Opus seats, hand-held briefs + hard desk audits,
> shelf-first then frontier, NO release and NO wind-down until he stops the floor himself. Chat + agents Opus.
> **GROUND TRUTH (fresh tier-fingerprint on master 413a325a): 32.78% native = 11,198 / 34,161 name-deduped.**
> Since the prior campaign's WIND-DOWN handoff (041dc82e @ 30.80%): **54 engine slices landed, NET native +677,
> suite → 9,771, LOST=0 on genuine natives**, ~17 loose/wrong CR cites caught at the desk. **Landed since the
> 07:00 entry below**: **CM-1** double/triple combat-damage replacements (c119895f, +6 — the CR 614 replacement
> seam, NOT the assignment seam, so trample distributes correctly) · **DM-1** defending-player attacks-trigger
> mill (191f1c63, +2 — Nemesis of Reason, Flint Golem; cite 701.13→701.17, the repo's 701.13-for-mill is stale)
> · **SF-1** anthem subject-filters (413a325a, +14 — legendary/colorless/multicolored/non&lt;color&gt;/tapped/
> untapped, layer-aware with a color-derive re-entry guard mirroring the Tetsuko precedent; untapped liveness
> pinned). **IN FLIGHT (3 Opus seats)**: **MC-1** magecraft copy-trigger · **GA-1** global "each creature"
> anthems/debuffs (Ascendant Evincar / Crovax — the all-players scope SF-1 parked) · **EV-2** combat-evasion
> residue census (can't-be-blocked-except-by / lure / can't-block).
> **DEFERRED CLEANUP (run on an EMPTY floor to avoid merge conflicts)**: a comment-only CR-cite-integrity pass
> for the repo-wide stale families flagged tonight. Target numbers pre-verified vs cr_current.json (08:20):
> — SAFE blanket swaps: **701.8→701.9** (701.8 is "Destroy", 701.9 is "Discard") · **701.15a→701.19** (701.15a
> is "goad", 701.19 is "Regenerate") · **701.13→701.17** (701.13 is "Exile", 701.17 is "Mill").
> — CONTEXT-DEPENDENT, per-site judgment NOT a sed: **603.6e** is a REAL rule (Aura LTB-trigger); general
> "look-back-in-time" is **603.10a** — only swap sites that mean the general concept. **509.1a** is a REAL rule
> (defending player chooses blockers); the defending-player DEFINITION is **508.5a** — only swap sites that mean
> the definition (DM-1 correctly used 508.5a for the mill referent). Plus the selfPlayRunner seating-determinism
> flake chip and a broader phantom-mana FP sweep.

## (superseded ~70 min later) — 32.07%, suite 9,678 — 3 OPUS seats hot

> Standing order (Colton, bedtime): fully autonomous, 3 Opus seats, hand-held briefs + hard desk audits,
> shelf-first then frontier, NO release and NO wind-down until he stops the floor himself. Chat + agents Opus.
> **CORPUS CROSSED 32%.** **Landed since the 05:50 entry below**: **LF-1** landfall/"another target you control
> gets +P/+T" pump (370468b0, +10) · **EX-1** chosen-target explore + Map token (3c85ed50, +7; cite 701.53→
> 701.44) · **CD-2** trailing-if riders (40b4e0dc, +4 — CD-1 mirror; Plan-the-Heist unified byte-identical) ·
> **SL-1** the SOULBOND subsystem (0faaf3b4, +13 — a real pairing subsystem: soulbondPartner state, ETB
> auto-pair, layer bond-grant, teardown closed TWICE — explicit clear at leave + control-change AND a liveness
> guard; cite 702.96→702.95) · **AC-1** additional-cost count-N (b1e81a67, +3 — SE-1's "42" was really 4;
> N=1 byte-identical, program-fingerprint confirmed) · **TR-1** the becomes-tapped SELF event (d2084f7a, +24
> — new tap event mirroring the untap event, records only real untapped→tapped transitions; DESK: cite
> 701.20a→701.26a (701.20a is REVEAL not tap) + 701.15a→701.19a (goad→regenerate)). Slices integrated: **54**
> (+ the Opus FP-removal); night NET native **+407** (30.87%→32.07%), suite 8,932→9,678, LOST=0 on genuine
> natives (1 phantom-mana FP removed), FOURTEEN loose/wrong CR cites caught at the desk.
> **IN FLIGHT (3 Opus seats)**: **MOD-1** modular dies-move-counters · **LB-1** library-effect residue census ·
> **ST-2** non-anthem static census (round 2). Standing flake chip + repo-wide stale cites (701.8 discard,
> 701.15a-for-regeneration) still open for a cleanup pass; phantom-mana FP sweep worth a future pass.

## (superseded ~70 min later) — 31.89%, suite 9,576 — 3 OPUS seats hot

> Standing order (Colton, bedtime): fully autonomous, 3 Opus seats, hand-held briefs + hard desk audits,
> shelf-first then frontier, NO release and NO wind-down until he stops the floor himself. Chat + agents Opus.
> **Landed since the 05:00 entry below**: **DI-1** dies/leaves triggers (ae0b639f, +10 — 3 new scopes:
> enchantment-PiG, creature-any-leaves, another-nontoken-dies) · **CD-1** conditional spell riders (ab7b5261,
> **+21** — leading "If <board-cond>, <effect>" as a condition-gated atom; metric⇄runtime share evaluateInterveningIf;
> the split-guard prevents a severed unconditional orphan) · **CB-1** single-sided can't-attack/block-alone
> (e31a49f3, +5 — SM-2 gate reused) · **INST-1** condition-gated "instead" amount upgrades (1445bcc1, +8 —
> Brimstone Volley kin; CURATED ability-word→reader map avoids a broken-graveyard-reader FP) · **EQ-2** (was
> 04:05, already logged) · **DN-1** toughness-assigns-damage (41692ea8, +3 — Doran/Arcades family; a
> combat-damage-reader change, VERIFIED byte-identical on the no-static path) · **CNT-1** counter-predicate
> scope (bc579d21, +8 — "creature you control with a +1/+1 counter dies/attacks"; caught+fixed an FP where the
> dies look-back didn't carry counters, firing on any death; bolster/support now 0 body-only = saturated).
> Slices integrated: **45** (+ the Opus FP-removal); night NET native **+346** (30.87%→31.89%), suite
> 8,932→9,576, LOST=0 on genuine natives (1 phantom-mana FP removed), TWELVE loose/wrong CR cites caught.
> **IN FLIGHT (3 Opus seats)**: **CD-2** trailing-if riders (CD-1 mirror) · **EX-1** chosen-target explore +
> Map token · **LF-1** landfall payoff census. Standing flake chip + repo-wide stale "701.8" discard cites
> still open (below); a phantom-mana FP sweep worth a future pass.

## (superseded ~50 min later) — 31.73%, suite 9,463 — 3 OPUS seats hot

> Standing order (Colton, bedtime): fully autonomous, 3 Opus seats, hand-held briefs + hard desk audits,
> shelf-first then frontier, NO release and NO wind-down until he stops the floor himself. Chat + agents Opus.
> **Landed since the 04:05 entry below**: **RV-1** reveal-top-conditional (45a0e128, +1 — Thrasios, Rograkh
> shelf; family mostly already native) · **ST-1** blanket combat-restriction statics (07a17514, +5 — "creatures
> can't attack/block", Pacifism enforcement reused; player-scoped "can't attack YOU" correctly excluded) ·
> **SE-1** restricted exile-target (6565f99b, +9 — exile gained destroy's restriction grammar; census maps
> the spell space as near-saturated but for real subsystems) · **CC-1** cast/draw-count triggers (f76c936b,
> +4 — Flurry/Eukrasia ability-word labels hid the trigger; ledgers already existed) · **the OPUS FP-removal**
> (61f7c4cc, director-solo — Molten-Core Maestro was a phantom-mana FP; strip the Opus label → body-only, a
> CORRECT −1 the CREED demands) · **EQ-2** aura/equip+activated composite (d4153f85, +5 — self-sac cost noun
> + composite classifier reusing isNativeAura/permanentEquipmentCovered; Capashen Standard, Lightning Spear).
> Slices integrated: **37** (+ the FP-removal); night NET native **+291** (30.87%→31.73%), suite 8,932→9,463,
> LOST=0 on genuine natives (1 phantom-mana FP intentionally removed), TWELVE loose/wrong CR cites caught.
> **IN FLIGHT (3 Opus seats)**: **CD-1** conditional spell riders (board-condition subset) · **DI-1** dies/
> leaves-trigger census · **CB-1** combat-effect residue census. Standing flake chip + repo-wide stale
> "701.8" discard cites still open (below); a broader phantom-mana FP sweep is worth a future pass (Opus FP
> was the first found).

## (superseded ~55 min later) — 31.66%, suite 9,404 — 3 OPUS seats hot

> Standing order (Colton, bedtime): fully autonomous, 3 Opus seats, hand-held briefs + hard desk audits,
> shelf-first then frontier, NO release and NO wind-down until he stops the floor himself. Chat + agents Opus.
> **Landed since the 03:15 entry below**: **TOK-1** predefined-token abilities (1dc7f491, +8 — Blood token
> wired via the discard-COST path; Clue/Food already done, mission premise was stale; Map/Powerstone/Incubator
> parked) · **IF-1** intervening-if vocab (965835a7, +13 — monarch/opponent-lost-life/no-cards-in-hand/
> creature-died-under-your-control, each reusing a live reader; controller-SCOPED not all-seats) · **AA-1**
> activated abilities (f14d2f62, +8 — "Activate only during your turn" timing-strip; safe because runtime
> offers on own-main ⊂ your-turn = under-offer only; named shelf commanders' real oracles need new atoms,
> parked) · **GY-2** filtered reanimate (c506d041, +2 — permanent-type filter, Sun Titan; the dynamic-MV
> premise had ZERO corpus carriers, census-refuted) · **LG-1** the life-gained-this-turn LEDGER (8ca43e21,
> +9 — new per-turn ledger fed at the single gainLife chokepoint, reset with its siblings, serialize-safe;
> Angelic Accord / Griffin Aerie / Crested Sunmare). Slices integrated: **30**; night native total **+268**
> (30.87%→31.66%), suite 8,932→9,404, LOST=0 unbroken, TWELVE loose/wrong CR cites caught at the desk.
> **IN FLIGHT (3 Opus seats)**: **RV-1** reveal-top-conditional (Thrasios entersTapped route, Rograkh shelf)
> · **ST-1** non-anthem static census · **SE-1** spell-effect near-miss census. Standing flake chip + repo-wide
> stale "701.8" discard cites still open (below).

## (superseded ~50 min later) — 31.54%, suite 9,332 — 3 OPUS seats hot

> Standing order (Colton, bedtime): fully autonomous, 3 Opus seats, hand-held briefs + hard desk audits,
> shelf-first then frontier, NO release and NO wind-down until he stops the floor himself. Chat + agents Opus.
> **Landed since the 02:30 entry below** (a strong run): **ETB-1** enters-trigger census (4fd42880, +11 —
> Support N + source-excluding board sweep; census found the ETB machinery already robust, pivoted to 2 real
> buckets) · **GY-1** filtered graveyard return-to-hand (947795c3, +7 — generalized the SS-1 matcher to route
> the MV/type filter through the shared chokepoint; my first clean AUTO-MERGE with ETB-1's spellEffects) ·
> **KW-1** keyword actions (962254bd, +23 — bolster N least-toughness selector + endure N modal; connive
> correctly PARKED, its nonland-discard tally would be an FP) · **EQ-1** equipment/aura static (be7dbda1,
> **+58**, night's biggest — added infect/wither/intimidate/skulk/horsemanship/basic-landwalk to the
> grantable-keyword set + ward {N} grant, EACH verified layer-aware-enforced; toxic + nonbasic-landwalk
> PARKED because their enforcement reads printed oracle not layers; DESK: fixed a wither cite 702.79b→702.80a,
> incl. the pre-existing stale copies) · **AT-1** attacks triggers (c71ab234, +4 — another-creature-you-control
> + creature-with-keyword scopes). Slices integrated: **24**; night native total **+228** (30.87%→31.54%),
> suite 8,932→9,332, LOST=0 unbroken, TWELVE loose/wrong CR cites caught at the desk.
> **IN FLIGHT (3 Opus seats)**: **TOK-1** predefined-token abilities (Clue/Food/Blood/Map — ETB-1's biggest
> park bucket) · **AA-1** activated-ability shelf census (Scion of the Ur-Dragon / Thrasios) · **IF-1**
> intervening-if vocabulary (AT-1's parked 22-card bucket). Standing flake chip + repo-wide stale "701.8"
> discard cites still open (below).

## (superseded ~45 min later) — 31.24%, suite 9,261 — 3 OPUS seats hot

> Standing order (Colton, bedtime): fully autonomous, 3 Opus seats, hand-held briefs + hard desk audits,
> shelf-first then frontier, NO release and NO wind-down until he stops the floor himself. Chat + agents Opus.
> **Landed since the 01:50 entry below**: **BC-1** batch combat-damage (b739817c, +1 — Keeper of Fables,
> the corpus's only "non-Human" batch; a prior session had already built the batch machinery, so this was
> the honest one-card completion + end-to-end pins) · **SN-1** the {S} snow-mana primitive (8583fdca, +13 —
> Frost Augur + 12 snow kin; a mana-model addition threading {S} as its own requirement, satisfied ONLY by
> a fresh snow tap, never fake-paid — gated on cost.snow so every non-snow payment is byte-identical; DESK
> CATCH: seat cited 107.4s → real rule is 107.4h, fixed 7 spots) · **PW-1** planeswalker loyalty (eb03b5f0,
> +13 — 3 buckets: reanimate-MV / untap-N-lands / layer-aware destroy-power; flipped Ajani/Garruk/Elspeth
> + 10 corpus riders incl. modal commands; Tezzeret parked on a −X ultimate, Sarkhan on restricted-mana —
> both honest) · **MD-1** nonland mana doubler (4e50e693, +0 native but real: Kinnan's nonland-tap doubler
> now fires in the sim — Joe's Kinnan grind games are accurate now; Kinnan the card parks on its impulse-dig
> ability, whole-card law). Slices integrated tonight: 17; night native total **+125** (30.87%→31.24%),
> suite 8,932→9,261, LOST=0 unbroken, ELEVEN loose/wrong CR cites caught at the desk.
> **IN FLIGHT (3 Opus seats)**: **ETB-1** enters-trigger census+build (the 59-slot bucket) · **GY-1** filtered
> graveyard return-to-hand (extends PW-1's cardMatchesGraveyardFilter) · **EQ-1** equipment/aura static census
> (Cap America shelf). Standing flake chip + the repo-wide stale "701.8" discard cites both still open (below).

## (superseded ~40 min later) — 31.16%, suite 9,183 — 3 OPUS seats hot

> Standing order (Colton, bedtime): fully autonomous, 3 Opus seats, hand-held briefs + hard desk audits,
> shelf-first then frontier, NO release and NO wind-down until he stops the floor himself. Chat + all
> agents on Opus (Fable budget spent).
> **Landed since the 01:20 entry below**: **SG-1** source-gated group anthems (5dec8ea8, +2 — Kabira
> Vindicator / Coralhelm Commander; a `gateOn:"source"` gate-subject swap so a leveler band anthem reads
> the SOURCE's counters; Bladeback park was a brief-correction — its hellbent line is an activated-ability
> grant, not an anthem; NO dead handSize vocab shipped) · **LK-2** top-card take-or-leave (32e19e4b, +3 —
> Herald's Horn's last blocker, Dryad Greenseeker, + bonus Domri Rade native-planeswalker; a new 21st
> pendingChoice kind + UI panel + PLAY-API-CONTRACT entry; DESK NOTE: my hand-probe read Domri arbiter-pw,
> the classic publicCard-shape trap — the tier-fingerprint authority confirmed native-planeswalker, all 3
> loyalty abilities modeled incl. the static keyword-emblem) · **RD-1** the SEEDED RNG PRIMITIVE (985c6a2e,
> +14 — owner-blessed milestone): `seedMath.nextRandomInt(state,n)→{value,state}` is now THE canonical
> single-integer draw off the serialized `rngSeed`; the dice-roll atom draws through it, VERIFIED
> byte-identical at the desk (mulberry32 + LCG constants op-for-op identical to roll.js's old inline draw,
> library.js shuffle untouched — every recorded-game replay stays deterministic). First consumer = RANDOM
> DISCARD (Hymn to Tourach, Hypnotic Specter, Mindwhip Sliver, +11). PRIMITIVE CONTRACT in the commit body
> (next consumer threads the returned state; never re-inline the PRNG).
> **KNOWN FLAKE (flagged, not blocking)**: a selfPlayRunner seating-determinism test fails intermittently
> under full-suite load, passes in isolation + on rerun. Pre-existing (unrelated to any slice; no profile
> deck has a leveler). Spawned as its own task-chip — matters because the whole replay/grind pipeline
> rides on same-seed determinism. If a gate hits it, rerun the suite once to confirm green.
> **REPO-WIDE STALE CITE (noted by RD-1, not fixed — out of scope)**: existing discard code pervasively
> cites "CR 701.8" — that's the pre-renumber number (701.8 is now "Destroy"); discard is 701.9 / 701.9b.
> A comment-only cleanup pass for later.
> **IN FLIGHT (3 Opus seats)**: **BC-1** batch combat-damage (Quartzwood Crasher, Pantlaza's #1 lever) ·
> **PW-1** planeswalker loyalty completion (Tezzeret the Seeker / Sarkhan Fireblood) · **SN-1** the snow-mana
> {S} primitive (Frost Augur's last blocker). Night total so far: **+98** (30.87% → 31.16%), suite
> 8,932 → 9,183, LOST=0 unbroken, TEN loose/wrong CR cites caught.

## (superseded ~30 min later) — 31.10%, suite 9,123 — 3 OPUS seats hot

> Standing order (Colton, bedtime): fully autonomous, 3 Opus seats, hand-held briefs + hard desk audits,
> shelf-first then frontier, NO release and NO wind-down until he stops the floor himself.
> **Landed since the entry below**: **TS-1** (6260ee99, +9 — grant-aura CAST lane: ~30 already-native
> grant auras were metric-native but their cast resolved SPELL_NOOP — the drift found by probe; plus
> keyword-line residue admits) · **SP-1** (8e1440c5, +22 — Sliver interiors: defender/shadow/flanking/
> exalted vocabulary + keywordInstanceCount, a latent exalted over-count fixed; 34-card bucketed park
> list in the commit) · **LK-1** (b4c884a6, +13 — look-at-top reveal-take rides impulse-dig; Icon of
> Ancestry composed; Herald's Horn deferred to LK-2 as its own take-or-leave mechanic) · **UP-1**
> (1340397d, +8 — the Brass Man untap-tax family; the runtime now honors the self "doesn't untap"
> static; DESK CATCH: the seat's regex also froze the Cloudcrest Lake slow-dual family via the one-shot
> "next untap step" wording — narrowed + pinned before landing).
> **IN FLIGHT (3 Opus seats)**: **LK-2** top-card take-or-leave (Herald's Horn's last blocker) ·
> **SG-1** source-gated group anthems (Kabira/Coralhelm bands + Bladeback hellbent) · **RD-1** the
> owner-blessed SEEDED RNG primitive + random discard. Night total so far: **+79** (30.87% → 31.10%),
> suite 8,932 → 9,123, LOST=0 throughout, EIGHT wrong/loose CR cites caught (7 at the desk + SP-1's
> self-caught batch).

## (superseded same-night) — shelf-first team era: 30.95% (+27 tonight), suite 9,042 — 2 Fable seats hot

> **The state**: census **10,574 of 34,161 (30.95%)** native+land (name-dedup; tally = `native*`+`land`
> rows, playable-pw excluded). Master tip **61625022** · suite **9,042 green** · lint 0 · LOST=0 on every
> flip-diff · no release tag since v0.144.0 (the unreleased train accumulates). **Shelf-first per Colton's
> evening call** — the fresh 15-deck census (real profiles, re-imported to the box app tonight) reads
> aggregate 81% native; worst-first: Wolverine 68 · Kellan 69 · Yuriko 70 · Cap/Pantlaza 72 · Kinnan/
> Ur-Dragon 75 · Rograkh/Toph 79 · Vihaan 85 · Mothman 90 · Zaxara 93 · Koma/Omnath 94 · Slivers 99.
>
> **Landed tonight (each desk-audited, full per-slice gate, pushed serially)**: **TC-1** typal cast-draw
> (c8259299, +2 — Vanquisher's Banner / Chronicle of Victory; unblocks the Slivers card-A/B ask) ·
> **OC-1** the Ordeal cycle (b40ad2b0, +5 — all five Ordeals; NEW youSacrificeThis look-back event off the
> sacrifice chokepoint + a real Ordeal cast lane + cross-controller attack-watcher hardening) · **SB-1**
> saboteur cdmg payoffs (54d22160, +4 — Skullsnatcher / Mistblade Shinobi / Zombie Cannibal / Arm with
> Aether; damagedPlayer bounce + gy-exile scopes) · the **cdmg cross-controller hardening** (df7608aa,
> director solo — the OC-1 mirror, 0 flips) · **SB-2** damaged-player reanimate (243e2493, +2 — Ink-Eyes /
> Scion of Darkness; NEW owner discipline at the zone-exit chokepoint — a stolen creature's death now
> lands in its OWNER's graveyard — plus the desk-completed owner-link so a detained stolen card's return
> still connects) · **LV-1** Level Up (61625022, +14 levelers; leveler.js band parser + gated 7b/6 layers
> + 2 pre-existing runtime FPs fixed: band abilities/keywords no longer always-on; NOTE: Wolverine runs
> ZERO levelers — its "Level Up" card is a green Aura, the roadmap note was stale).
> **Cite-audit law, reaffirmed**: SEVEN wrong CR citations caught at the desk tonight (207.2c→207.2a ·
> 701.15a→701.19 · 701.17a→701.21a · 601.2/603.3→109.5 · 613→106.1b · 603.3c→603.3d · 704.5g→404.1, the
> last caught by an agent in the DIRECTOR's brief). Every cite gets verified against cr_current.json.
>
> **IN FLIGHT (2 Fable seats, worktree isolation, never push)**: **SP-1** sliver interiors (census +
> group-grant buckets) · **TS-1** enchant-land activations (the Tin Street lane; licensed to pivot to
> adjacent enchant-land interiors if the family's tiny). Harvest per the standing protocol: audit
> line-by-line at the desk, re-gate, integrate serially, sweep the worktree.
> **Also tonight (pre-shift)**: v0.143.0 + v0.144.0 shipped (CI green, assets verified) · the box app
> got the REAL profiles (Colton 6 / Joe 9, 0-miss vs the oracle index; box AppData = deck truth now) ·
> the Academy turn-1 break does NOT reproduce on the current build (API + real-UI repro both healthy
> through turn 5+; likely fixed by C1 B1-B4 on 07-15; Colton re-tests on v0.144.0 with a FRESH game) ·
> Colton's 1.0 calls logged in vault CONTINUITY: Vault full-rework = a 1.0 requirement · shelf-first
> grind · seeded-RNG random primitive BLESSED (lane not yet built) · C2/C3 stay laptop/app-side.

## ✅ 2026-07-16 (evening) — HARVEST COMPLETE + v0.143.0 & v0.144.0 SHIPPED: 30.87% (+27), all 6 agent worktrees swept

> **The state**: census **10,547 of 34,161 (30.87%)** native+land (name-dedup; tally = tier-fingerprint
> rows matching `native*`+`land`, playable-pw excluded — reconciled against the prior 10,520 exactly).
> Suite **8,932 green** (717 files) · lint 0 · campaign total **+964** across 71 slices, LOST=0 on every
> audited flip-diff. **v0.143.0 SHIPPED** (Colton lifted the Vault taste-gate — the Vault heads into a
> full rework, so Phase 2 rode out as-is; release CI green, installer + .sig + latest.json verified on
> the GitHub release). **v0.144.0 tagged** with the harvest below.
>
> **THE HARVEST (the 3 in-flight Opus worktrees, per the wind-down protocol)** — every slice
> desk-audited line-by-line, full per-slice gate (suite exit 0 + lint 0 + flip-diff vs a fresh baseline,
> every GAINED audited by name), pushed serially:
> - **EC-1a** (7a97ad09, +1 committed-in-seat): aura-grant gate reads reminder-stripped oracle —
>   Oracle's Insight. Desk fix: cite 207.2c→207.2/207.2a (207.2c is ability words).
> - **EC-1b** (d0135508, +3 committed-in-seat): lifegain-scaled self counters (Sunbond / Light of
>   Promise / Ageless Entity) — the event-specific sentinel discipline; cites 603.2/119.3 verified.
> - **GC-1** (e6a1780e, +5, finished at the desk from the seat's uncommitted diff + test file):
>   Gustcloak becomes-blocked escape — untap + remove-from-combat atom; attacker record dropped,
>   blockers stay and assign nothing (CR 506.4/510.1d). Desk fix: cite 701.15a→701.19 (goad ≠ regen).
> - **EC-1c** (2ab88eb8, **+14**, finished at the desk — the seat left machinery, no tests): the bare
>   CONTROLLER edict "sacrifice a creature" (CR 109.5/701.21a) through the shared sacrifice chain —
>   Inevitable End's granted upkeep edict, the α2 reflexive pair (Shrapnel Slinger / Unscrupulous
>   Contractor — decline skips the reflexiveGate payoff, pinned live), Desecration Elemental's
>   any-player cast scope, Smothering Abomination's edict-feeds-own-draw. Also fixed the seat's missed
>   third stale boundary pin (parser.test.js MUST-DROP).
> - **MF-1** (51822a6d, +4, finished at the desk — machinery, no tests): Mana Flare all-players
>   same-type land-tap augment (Mana Flare / Heartbeat of Spring / Zhur-Taa Ancient / Dictate of
>   Karametra) — allPlayers battlefield scan + sameAsProduced bonus bound to the primary color (one
>   dual tap = WW or UU, never W+U). Desk fix: cite 613→106.1b.
> - **SP-1 (sliver interiors) and TS-1 (enchanted-land discard-cost activations) were NEVER STARTED
>   in their seats — returned to the frontier.**
>
> **Worktrees**: all 6 agent trees removed (3 dead Fable, fully harvested earlier; 3 Opus, harvested
> above). Remaining trees are the desk (cindy) + Omnath's — not build seats.
>
> **NEXT**: the remaining frontier is unchanged from the wind-down entry below MINUS GC-1/MF-1, PLUS
> SP-1 + TS-1 returned. The 1.0 roadmap conversation with Colton is OPEN (his call, evening 07-16:
> harvest first, then talk out the path-to-1v0 queue — C1 status vs the 07-15 B1-B4 ship, C2's
> app-required check, the Vault full-rework re-scope of C5).

## 🌙 2026-07-16 (day 2, WOUND DOWN ~20:00) — HANDOFF (superseded — harvest complete above): 30.8%, campaign +937, 66 slices, LOST=0 — 3 Opus worktrees IN FLIGHT

> **The state**: census **10,520 of 34,161 (30.80%)** native+land (name-dedup, the tier-fingerprint is
> the tally authority — generate a FRESH baseline before any new slice; session scratchpad files are
> gone). Master tip **eef29c12**; suite green + lint 0 at tip; NO release tag (the unreleased train
> still carries the far-from-ready Vault UI — unchanged). Day 2 total: +937 campaign, 66 slices, LOST=0
> on every flip-diff, every slice gated (suite exit VERIFIED before commit + lint + audited flip-diff).
>
> **HARVEST FIRST — three OPUS agents were mid-lane at wind-down.** Their commits (if finished) sit in
> their worktrees; none can push. For each: `git -C <path> log --oneline -5` — any feat(engine) commit
> above the branch base is deliverable. Cherry-pick into the build tree, AUDIT THE DIFF YOURSELF, then
> the full per-slice gate at the desk (suite exit 0 + lint exit 0 + flip-diff vs a fresh baseline with
> every GAINED audited by name, LOST=0) before pushing serially:
> - `C:\Projects\mtg-tool\.claude\worktrees\agent-ab239de3af440ff66` — **EC-1** the 19-carrier
>   enchant-creature interior sweep (its park map is the batch-6 planning artifact — capture it from
>   the commit body / test file even if the yield is small)
> - `C:\Projects\mtg-tool\.claude\worktrees\agent-af9c51fa1611291e8` — **MF-1** Mana Flare (via the
>   manaMultiplier machinery) + **SP-1** sliver interiors
> - `C:\Projects\mtg-tool\.claude\worktrees\agent-a83f560f46f0276d1` — **GC-1** Gustcloak escape
>   (combat-state surgery — park-prone, audit hard) + **TS-1** enchanted-land discard-cost activations
> The three DEAD Fable worktrees (agent-a9051935634e9b54a / agent-a559ab0e57185554d /
> agent-a19965a385e2da5d7) are FULLY harvested — safe to `git worktree remove --force`.
>
> **The working model (Colton's standing order, evening of 07-16)**: the DIRECTOR runs a team of three
> build agents (Opus seats; worktree isolation; they build + gate locally and NEVER push) and
> personally audits every diff, re-runs the full gate against the live census, integrates serially,
> pushes `git push origin HEAD:master`, and refills seats immediately — plus solo slices on
> non-contested files between integrations. Uninterrupted, no check-ins, no release tag. Known seat
> mechanics: agents junction node_modules via PowerShell New-Item (Git Bash mklink mangles the target);
> probes run from app/ with MTG_APP_ROOT="C:/Projects/mtg-tool/app"; briefs carry the CREED + workflow
> + park-with-evidence license; expect and welcome brief corrections from probes.
>
> **The remaining frontier (post-batch-5)**: the backgrounds' 16 unmodelable bodies · enchant-land
> interiors 6 (mostly parked with reasons) · Zelyon Sword 4 · block-additional 3 · copy-with-ability 3
> (Gigantoplasm, heavy) · random-discard 3 (HOUSE POLICY — needs Colton's call on a random primitive) ·
> suspend/trample-tail 5 · soulbond 24 (pairing subsystem) · banding 7 · the sub-2 singles trunk ·
> Declare Dominance's it-anaphor lure fold (combat.js pump rider) · Roar of Challenge's Ferocious
> rider · Geralf's Masterpiece's hand-scaled stat · Kormus Bell's layer-5 color delivery.

## ⚙️ 2026-07-16 (day 2, RUNNING) — **30.8%, campaign +937**: 66 slices, LOST=0 — OPUS batch 4 landed whole (+37)

> Census **10,520 of 34,161 (30.80%)**, baseline scratchpad cand79.txt. The Opus fleet's first full
> batch, every gate reproduced at the director's desk: **RT-1** RIOT (a115996a, +7 — modeled end-to-end
> at the entry chokepoint with a documented deterministic counter-vs-haste policy; the layer-6 haste
> grant over raw summoningSick) · **DV-1** DEVOID (711ad664, +8 — the agent's probe REFUTED the brief's
> hypothesized color bug: Scryfall bakes colors:[] into devoid cards and both derivation chokepoints
> read it; the real gap was the spell credit — the CDA line now strips like storm, plus a zero-cost
> hardening guard; Complete Disregard's pin lifted in-lane) · **BB-1** the same-name mass pump
> (330540d1, +3 — Bile Blight / Echoing Decay / Echoing Courage, the buff twin included on pure
> vocabulary) · **AF-2** AFTERLIFE (50963e3c, +7 — the dies→N-Spirits synthesis, salvaged partial diff
> evaluated and reused; tokens enter under the DYING creature's controller, pinned) · **MN-1** MENTOR
> (4e644eed, +8 — a new powerVsSource dynamic restriction, layer-aware, FAIL-CLOSED; equal power
> excluded, mentor-alone fires nothing, the own-intent chooser as a second net) · plus the director's
> **LU-2** this-turn lure (02f08256, +4 — Alluring Scent kin + Mortipede's activated self form on the
> FOG-latch marker; Declare Dominance's it-anaphor and Roar of Challenge's rider parked).
> Batch 5 out: EC-1 the 19-carrier enchant-creature interior sweep (the batch-planning artifact) ·
> MF-1 Mana Flare via the manaMultiplier machinery + SP-1 sliver interiors · GC-1 the Gustcloak
> combat-surgery escape + TS-1 the enchanted-land discard-cost activations.

## (superseded same-day) — 30.7%, campaign +900: the limit-restart entry

> Census **10,483 of 34,161 (30.69%)** — campaign +900 exactly. The session limit hit mid-batch-4
> (~17:45, reset 18:50); all three Fable agents died mid-lane. Post-reset salvage: **LU-1** LURE
> (0f03aa80, +6 — the long-parked block-requirements lane shipped at the MUST-ATTACK bar: opponentAI.
> pickBlockers force-assigns every legal blocker of a lured attacker; Taunting Elf / Elvish Bard /
> Ochran Assassin / Prized Unicorn / Breaker of Armies / Treeshaker Chimera; the this-turn/targeted/
> "it" variants all pinned off the anchor) — gated pre-limit, committed post-reset · **MA-1** the
> madness AURAS (3c40b189, +3 — harvested COMMITTED from the dead static seat's worktree, re-gated
> whole at the director's desk: Senseless Rage / Strength of Isolation / Strength of Lunacy via the
> FA-1-precedent auraResidueClauses admission on MD-1's rationale).
> Batch 4 RELAUNCHED on OPUS seats (Colton's call — Fable budget to the director): AF-2 afterlife +
> MN-1 mentor (with the dead seat's partial diff as reference) · DV-1 devoid correctness-first +
> BB-1 same-name debuff · RT-1 riot. The combat seat's dead AF-2 work and the zones seat's DV-1
> probes were captured before relaunch; MA-1's worktree commit was the only finished piece.

> Census **10,474 of 34,161 (30.66%)**, baseline scratchpad cand71.txt. This cycle: director solos —
> **TD-1** the tapped-count draw (0c6a5761, +2, Theft of Dreams kin) · **GR-1** the discard-N graveyard
> recursion (4a9ffb3b, +3, Stitchwing Skaab kin — the sacCount slice discipline for multi-victim costs)
> · **MD-1** MADNESS credited on permanents (6b23d689, **+18** — the ninjutsu/morph rationale + the
> spell path's versioned strip; Gorgon Recluse lifted DG-1's park; the 3 madness AURAS queued to the
> static seat). Team batch 3 — combat seat: **BT-2** the basilisk siblings (7d199925, +6 — non-Wall trio
> with the changeling-IS-a-Wall pin, bare pair, Abomination) · **CT-1** becomes-blocked-by-a-creature
> self-pumps (b4dc5792, +5 — a DEDICATED CR 509.3d per-blocker event, deliberately un-deduped vs 509.3c;
> Retaliation rides the group grant) — zones seat: **LT-1** land tuck (742c6200, +3) · **PX-1**
> power-filtered exile both directions (215a0307, +7 — probe corrected the brief: N=3, ≥ evidenced; four
> modal charms complete) · **GS-1** the gy shuffle-in (1b5c0d8f, +6 — dependent enumeration BY
> CONSTRUCTION, the unconditional-shuffle CR 701.24 pin) — static seat: **NV-1** mass land animation
> (5acfe069, +2 — dynamic layer-4 + 7b with a recursion-free type-identity branch + summoningSickNow
> enforcement; Kormus Bell parked on layer-5 color delivery) · **SU-1** single-target base-P/T set
> (50c7c980, +4 — Diminish/Square Up + two modal completions; counters-on-top-of-base pinned).
>
> Batch 4 out: combat seat — AF-2 afterlife (11) / MN-1 mentor (20) · static seat — MA-1 the madness
> auras (+3) / RT-1 riot (13, documented auto-pick policy) · zones seat — DV-1 the devoid
> correctness-first probe / BB-1 the same-name mass debuff.

## (superseded same-day) — 30.5%, campaign +835: 47 slices — TEAM batch 2

> Census **10,418 of 34,161 (30.50%)**, baseline scratchpad cand61.txt. Batch 2 (+18 team, +4 director):
> **XT-1** EXTRA TURNS, director solo (6dea9f58, +4) — Time Walk / Temporal Manipulation / Capture of
> Jingzhou / Second Chance; a CR 500.7 LIFO stack popped at advanceStep's end-of-turn branch ·
> **DG-1** the basilisk-touch delayed destroy (3f47ba5c, +2) — Deathgazer/Dread Specter; the engine's
> FIRST end-of-combat queue (turn-stamped, stale-dropped, drained after the last damage sub-step; the
> agent corrected the brief — first-strike sub-steps DO exist), destroys via the shared primitive so
> indestructible/regen/shields behave; Gorgon parked on the madness-permanent policy gap ·
> **AR-1** GY-TO-BOTTOM (0ade8b82, +9 — the probe found 14 carriers, not 3): Cogwork Archivist kin +
> Junktroller/Reito pair/Grazing Kelpie/Hoverstone/Chandelier; plus a REAL side-correctness catch —
> atomTargetIntent now reports anyGraveyard returns "ambiguous" so the Nantuko Tracer ETB class stays
> off the side-blind flush · **BW-1** the triple destroy/exile union (1a95b86d, +7) — Broken Wings kin
> + Shoot Down's exile twin + VIVIEN REID goes native-planeswalker (her −3 was the last unmodeled
> loyalty ability); layer-aware flying on the creature arm only · **BG-2** a REPAIR lane (39d3cc05, +0
> by construction): the agent's probe overturned the director's brief (the Background selector was
> BG-1's, already banked) and instead found TWO live CREED defects on claimed-native Candlekeep Sage —
> the granted leave-half never fired (dynamic dead-look-back added) and the granter phantom-drew off
> its own quoted text (quote-mask on the compound splitter + counter, one mask no drift).
>
> Batch 3 out: zones seat — LT-1 land tuck / PX-1 power-capped exile / GS-1 gy shuffle-in · static
> seat — NV-1 Nature's Revolt mass land animation / SU-1 Diminish base-P/T · combat seat — BT-2 the
> contact siblings (non-Wall trio, bare pair, Abomination) / CT-1 the becomes-blocked self-pumps.

## (superseded same-day) — 30.4%, campaign +813: 42 slices — the TEAM's first batch

> Census **10,396 of 34,161 (30.43%)**, baseline scratchpad cand56.txt. Colton's order (evening): three
> Fable build agents under the director (me) — isolated worktrees, local gates, NONE push; every diff is
> audited at the director's desk, re-gated against the live census, integrated serially to master.
>
> **TEAM BATCH 1 — all three landed, +13**: **MG-1** the modal shared-type graveyard pair (1d1583a1, +3)
> — Return from Extinction / Raise the Draugr / Unbury; the sharesCreatureType subset constraint runs
> through a CR 205.3m ALLOWLIST (a bare after-dash intersection would certify Gingerbrute "Food" shares —
> the agent caught it), DFC front-face split, Time Lord bigram, changeling unconstrained ·
> **FT-1** the Falter-class mass block lock (f67d9447, +7) — ONE dynamic-selector layer-6 endOfTurn
> cantBlock rule (CR 611.2c rules-modification license verified); withoutKeyword joins WD-1's withKeyword
> with the shared re-entry guard; Falter / Magmatic Chasm / Seismic Stomp / Fire of Orthanc / Tectonic
> Rift / Destructive Tampering / Seismic Elemental; parked-with-evidence: opponent-scoped (no resolution-
> controller plumbing), color-pair (selector colors not layer-5-aware — refused the half-enforcement) ·
> **NR-1** the artifact activation lock (da0ee5fa, +3) — Null Rod / Stony Silence / Collector Ouphe;
> SIX enumeration sites gated on one reader (manaSources the affordability/payment chokepoint, tap-for-
> mana, double-mana-pool, activate-ability incl. granted+equip, crew CR 702.122a, loyalty), layer-aware
> Artifact reads, cycling/gy-zone correctly NOT locked (CR 109.2).
>
> BATCH 2 out: **AR-1** gy-to-bottom (Cogwork Archivist kin) + **BW-1** the Broken Wings triple union
> (one seat) · **BG-2** the Background family ("Commander creatures you own have «…»" — 26 carriers,
> 6 bodies pass today's validators; the selector is the lock) · **DG-1** the basilisk-touch delayed
> destroy (Deathgazer kin — needs the first end-of-combat queue; park-if-dirty clause).
>
> Post-30% solo slices since the last entry: **TG-1** UNTIL-EOT QUOTED GRANTS (4a928a44, +12) — the
> Feign Death machinery: one fixed-ids layer-6 addAbility vehicle (CR 611.2c set-lock) riding the
> existing group-grant collectors both halves (triggered fire incl. a dead-look-back dies path;
> activated enumeration), body-gated by the SAME validators the static group grants use; the
> [dies-return-bf] sentinel keeps the bare wording off the FLICKER spell half (Momentary Blink pinned
> Arbiter); Feign Death / Undying Malice / Showstopper / Lightning Volley / Resuscitate / both Helixes
> live; one graduated pin (enduringGlimmer's bare-return guard now owns only the no-type-strip boundary)
> · **WD-1** the WITH-FLYING anthem (c748f21f, +7) — parseCreatureSelector withKeyword + a layer-aware
> matchesSelector gate with a re-entry guard; Favorable Winds, Empyrean Eagle, Thunderclap Wyvern,
> Cynette, Air Nomad Legacy · **LG-1** the SPLIT-DAMAGE pair (9d2db72f, +4) — one normalize rewrite,
> zero new atoms; Lunge / Hungry Flames / Shower of Sparks / Cunning Strike; the Assembled Alphas
> trigger tail and the X form pinned off the rewrite.

> Census **10,360 of 34,161 (30.33%)**, baseline scratchpad cand50.txt. Post-30% slices:
> **FA-1/AB-1** (a6546592, +31) — FLASH admitted as aura residue (26 flash auras cascade: Rancor-kin
> timing was never a modeling gap, just an unadmitted clause) + the type-conditional unblockable
> gate (artifact/enchantment/untapped-land defender checks in canBlockAttacker) ·
> **SL-1** the dealt-by lifegain links (5f0edf91, +12) — "Whenever this creature deals [combat]
> damage, you gain that much life": a new dealtBy event fired with per-source totals at BOTH damage
> paths (CR 510.2 combat totals; per-resolution spell totals), the ATTACHED form gaining for the
> AURA's controller (Spirit Link on their fatty feeds YOU), combat-only honored, "dealtBy" admitted
> to the combatDamageAmount referent gate, and isNativeAura widened so a TRIGGER-ONLY aura (Spirit
> Link / Spirit Loop / Vampiric Link — no bonus line) qualifies. Zebra Unicorn, Armadillo Cloak,
> Exalted Angel, Sunhome Enforcer live. Suite 8,682 green · lint 0. Housekeeping: app/data/self-play/
> (the crucible harness's local logs) gitignored — a day's batch nearly rode into the SL-1 commit.

> **DC-1, the Discard-a-card cost (84d200f2, +96)** — the single biggest slice of the campaign took the
> census from 10,221 to **10,317 (30.2% of 34,161)**, straight through the 10,248 line. One cost-vocabulary
> entry (γ1h + the per-distinct-hand-card offer + the pay-before-stack dispatch) unlocked the looter
> class, the madness enablers, YAWGMOTH THRAN PHYSICIAN, Trading Post, The Underworld Cookbook, and
> brought the Immobilizing Ink granted family back from its UT-1 eviction with real runtime. Six pins
> graduated — every one had used the discard cost as its canonical unmodeled example. Suite 8,676 green.

> Latest: **SC-1** cant-be-blocked SELF + the life-comparison intervening-if (16d80461, +15) — the
> unblockable-activation class (Gearseeker Serpent kin) + Sword Coast Sailor; the Tar Pit pin caught a
> real layer-blindness in selfTargets (now permanentIsCreature-aware) · **the JB-1 widening**
> (14cf09a0, +1) — "this PERMANENT deals N damage to you" → Plague Sliver's group drain flips.
> The exact-30% line (10,248) is 27 cards out; baseline scratchpad cand46.txt (10,221).
>
> ENCHANT-LAND SEVEN probed and PARKED with reasons: Chamber (control-until-EOT duration unmodeled) ·
> Farmstead (upkeep pay-offer) · Equinox (conditional counter) · Urban Burgeoning (other-players'
> untap-step modifier) · Tin Street Market + friends (the "{T}, Discard a card:" COST — a cost-vocabulary
> + activation-pause extension, the likeliest medium build next) · Animal Boneyard (sac cost + dynamic
> toughness lifegain). Sunken Field already native. The big remaining machinery lanes: until-EOT quoted
> TEMP-GRANTS (13 across three tails — needs a grant-vehicle continuous effect + enumeration read) and
> the 20 enchant-creature grant interiors (one-by-one).

> **THE +600 MILESTONE**: campaign native+land 9,583 → 10,200 name-dedup (~29.9% of 34,161 — one slice
> from 30%). Latest: **LV-1** the leavesSelf event + the LTB disjunction (a4b8c521, +20) — THRAGTUSK
> lives (any-exit LTB, bounce included); the fading/vanishing phantom-reminder strip un-parked every
> vanishing+trigger card (Aven Riftwatcher, Keldon Marauders); Illusions AND Delusions of Grandeur ·
> **OD-1** the opponent-debuff anthem (c7ca39c0, +5) — ELESH NORN, GRAND CENOBITE both-sides native.
> Latest: **KM-1** Kismet imposition (61024daf, +3) · **GX-1** up-to-three single-graveyard exile
> (7fc54227, +6) · **TW-1** the whole-hand cycle (260db308, +3) — Tolarian Winds as ONE composite atom,
> disarming the bare "draw that many cards" combat-damage mis-bind for the known wordings · **BC-1**
> KW-BATTLE CRY (2323c7d7, +7) — per-instance attacks synthesis over the Trumpet-Blast scope with
> excludeSource · **AF-1** the aura-own activated pump (a2f11b6f, +9) — Armor of Faith compounds +
> Firebreathing kin via the injected aura-own-activated validator (the PZ-1 pattern).
>
> PARKED WITH REASONS: bloodrush (needs a combat-step activation window the engine's action surface
> lacks — native-but-unusable would be an FP by uselessness) · block-additional (the multi-block
> damage-DIVISION choice is unmodeled — an over-deal trap) · lure (needs a block-requirements
> subsystem; half-enforcement = FP) · (SC-1 SHIPPED 16d80461 — see the top entry) · "sac unless
> discard at random" (needs a random primitive — check house policy). FRESH FRONTIER
> (post-31-slice census): enchant-creature grant interiors 20 ·
> backgrounds 17 · enchant-land interiors 7 · slivers 6 · until-EOT +N/+N-and-gains quoted grants 5 ·
> the "trample-tail" suspend carriers 5 · until-EOT team/target quoted grants 4+4 · lure 4 · Zelyon
> Sword 4 — the ≥3 trunk is long-tail interiors + temp-grant machinery from here. Baseline tier file:
> scratchpad cand43.txt (10,205 native+land names, ~29.9%; the exact-30% line is 10,248).

> Numbers audited against the tier-census files (9,791 → 10,152 name-dedup native+land, ~29.7% of
> 34,161): the running "+358/20 slices" line pushed earlier in the day OVER-COUNTED by a drifted slice
> tally — the census delta is authoritative. (The ledger doesn't care how ya feel.)
>
> Post-correction slices, each gated + audited + pushed: **PS-1** KW-PERSIST (a11e1eb4, +12) — undying's
> -1/-1 mirror + the immediate 0/0 SBA; Kitchen Finks / Glen Elendra / Woodfall Primus live · **RL-1**
> the one-spell-per-turn law (1a2c5757, +4) — Rule of Law rides the existing cantCast gate ·
> **AT-1** the ATTACKING anthem (25ed02ff, +13) — a real combat-state selector in layers; both
> Oriflammes, War Horn, Berserkers' Onslaught, Windbrisk Raptor. Suite at 8,658 · lint 0 throughout.

Colton's standing order (morning): the Vault walk became a future full overhaul (parked); the corpus
grind resumes uninterrupted — full trust, no check-ins. Day-2 slices, each gated (suite+lint+audited
flip-diff) and pushed: **GY-2** exile-cost graveyard abilities, Seasoned Pyromancer frame (588487ce,
+17) · **AC-1** compound pump+grant attachments, Deviant Glee/Mortarpod (ea4920c9, +12) · **LA-1**
aura-own ETB riders, Gift of Paradise/Abundant Growth (fb29da9d, +6) · **PV-1** PREVENTION SHIELDS
(CR 615), the Samite Healer/Bandage system — floating this-turn shields consumed at BOTH damage paths,
lifelink-honest in combat (ff9cea09, +43) · **FOG-1b** players-only fog + self prevent-all walls,
integrated with the incumbent fog op after the suite caught my duplicate (d50bde1e, +6) · **AP-1**
attached prevention walls, Gaseous Form/Defang — the reader lives in staticAbilityParser so the aura
CAST gate and the metric can't drift (368951e4, +8) · **PZ-1** the Paralyze-class attached tap-lock +
aura-own-ETB validator (6cd9013d, +42) — PLUS the HARDENING: auraTouchClausesAllModeled caught the
Bind-the-Monster shape (a pronoun follow-up sentence riding the runtime descriptor while the touch
heuristic ate it — 7 would-be FPs evicted pre-commit, and it retro-caught AP-1's Candletrap classify
hole) · **UT-1** the untap-self atom (2f847746, +28) — one anchor, three families: the tap-lock
escape grants (Singing Bell Strike returns WITH runtime support), printed untappers (Morphling wakes
up), cast/ETB-watcher self-untap triggers (Thermo-Alchemist) · **DT-1** the DETAIN frame (c2eb4906,
+26) — "exile … until this <word> leaves the battlefield" (Banishing Light / Banisher Priest / Seal
Away / Trapjaw's enrage): linked exile on the source permanent, [detain-return] one-shot on ANY exit,
CR 610.3b + token-vanish guards, v1 aura exclusion at enumeration · **VH-1** CREW (f1c8c74f, +40) —
Vehicles animate: actionsCrewVehicle (sick-first auto tap-set) + a layer-4 endOfTurn type-add +
CR 302.6 same-turn sickness + the classify crew-line strip (audit catch: the first strip regex ate
Imposter Mech's clone rider — re-anchored line-start) · **OR-1** the attacks-or-blocks disjunction
split (159536b6, +8) — both halves fire; Smuggler's Copter crews AND loots (a same-day VH-1+OR-1
compound flip) · **TP-1** the tap-freeze fold (f893ae90, +7) — Frost Breath class, the plural Junk
Winder fold · **SM-2** can't attack or block alone (f7b533b4, +5) — Mogg Flunkies at both declare
gates · **TE-1** assign-as-unblocked (053ec13a, +8) — Thorn Elemental's full power through blockers ·
**BF-1** the blocks-a-flyer pump (cf0df1af, +6) — Netcaster Spider, the rampage fire-time family ·
**EC-1** KW-ECHO (5b063ead, +37) — the one-time first-upkeep pay-or-sacrifice on the cumulative-upkeep
chassis; Karmic Guide / Avalanche Riders / Goblin Marshal ride their already-modeled ETBs · **FL-1**
KW-FLANKING (5958b217 + the 936598d4 pin graduation — A GATE SLIP is on record in that commit: the
FL-1 push carried one red pin because commit+push were chained behind the suite in one shell command;
discipline since: gate exit verified BEFORE any commit) · **IE-1** contact damage (c44c4cb5, +4) —
Inferno Elemental per block pair, both roles; the audit caught two rider-eating FPs (Assembled
Alphas / Sawtooth Ogre) pre-commit and the regexes are sentence-end anchored · **JB-1** the BITE
union + upkeep self-drain (21948f30, +15) — Bite Down's creature-or-planeswalker dealee via the pw
damage path; Juzám Djinn's "deals 1 damage to you" as REAL controller damage. Suite 8,588 → 8,650 ·
lint 0 throughout · NO release tag (the unreleased train now carries C5 + both blitz days).
Prevention is now a real subsystem: next-N shields, fogs (all + players scopes), self walls,
attached walls — each new prevention wording from here is a clause, not a build. Running census after
day-2 so far: native+land 9,791 → 10,123 by name-dedup (~29.6% of 34,161).

## 🌙 2026-07-16 (overnight) — THE CORPUS BLITZ: +208 audited native adds, 14 slices, LOST=0 everywhere

**The one-night autonomous order ([[overnight-corpus-blitz-2026-07-16]], now archived) ran 01:00–03:30.**

### 1 · THE HEADLINE
**Corpus native: 28.05% → 28.7%** (tier-fingerprint name-dedup 9,583 → 9,791 = **+208 audited GAINED,
LOST=0 on every slice**; measure-coverage headline 9,798/34,196). Suite **8,519 → 8,588** (+69 tests) ·
lint 0 throughout · every push individually gated green. Data root: the fresh 2026-07-15 Scryfall
snapshot (main tree), before/after measured against the same root. NO release tag (the order's hard
bound — C5's taste walk is still the open gate).

Slices shipped (each: flip-diff audited by name · full suite · lint 0 · pushed):
- **TM-1** fixed-amount targeted mill (da30e80f) — **+46** (incl. Jace Beleren → native-planeswalker)
- **TUT-1** fixed-MV battlefield tutors, the Rebel/Mercenary chains + Zur (e7d64e88) — **+20**
- **BG-1** commander-qualified group selector, Backgrounds + Bastion Protector (5890e7ff) — **+7**
- **SS-1** KW-soulshift, keyword→trigger synthesis + subtype+MV gy filter (d939192f) — **+19**
- **CS-1** counter riders: soft+exile-instead (Syncopate) + the mill rider (51800d9d) — **+6**
- **SM-1** islandhome attack restriction, per-defender gate (2fc1c6ef) — **+12**
- **GT-1** power-capped cant-be-blocked, Goblin Tunneler class (7365980c) — **+11**
- **OA-1+RE-1** self-hit damage + per-blocker pump (e0e67f20) — **+15**
- **PA-1** the Pacifism class, attached can't-attack/block (39899c62) — **+6**
- **ONCE-1** "Activate only once each turn" ledger, the Rootwalla frame (08975c7f) — **+31**
- **EX-1** KW-exalted, the attacks-alone fire (e333de59) — **+22**
- **GY-1** graveyard-activated self-recursion, the engine's first gy-zone ability (99edc84a) — **+10**
- **DT-1** "During your turn" gated self-buff (8738c917) — **+3**
- Chores: card-names.json refresh committed (78da0245) · slice manifest regenerated (867cef4a).

### 2 · PLAY-WEIGHTED LENSES (before → after)
top-1k **67.1 → 67.4%** · top-2.5k **48.7 → 48.9%** · top-5k **37.9 → 38.2%** · top-10k **30.3 → 30.6%**.

### 3 · ARBITER-ROUTED / HONESTLY-HELD (each verified still-gated, with its blocker)
- **General Marhault Elsdragon · Berserk Murlodont** — GROUP per-blocker-pump watchers; the runtime fire
  reads the blocked attacker's own card, so a group form would pump on the wrong scope. Needs a
  group-watcher fire lane.
- **Lin Sivvi, Defiant Hero** — {X}-cost activated recruiting (the activated-X tutor lane is unbuilt).
- **Woodland Bellower** (nonlegendary+color tutor filter) · **Guardian Sunmare** (nonland filter + saddle).
- **Soul of Mirrodin** — its second ability activates from the graveyard with an EXILE-self cost
  (GY-1 modeled the mana-only return shape; the cost-zone-exile shape is the natural GY-2).
- **Captain America, Liberator** — the for-each-Equipment token attack trigger.
- **Arrest** — the compound "…and its activated abilities can't be activated" tail (PA-1 took the clean class).
- **The two-line sea monsters** (Sea Serpent, Dandân, Bog Serpent, Gorilla Pack…) — "When you control no
  Islands, sacrifice…" is an unmodeled STATE trigger; SM-1 took the one-line class.
- **The Backgrounds with unmodeled interiors** (Inspiring Leader's quoted static anthem, Scion of
  Halaster's replacement, the attacks-a-player intervening-if family) — BG-1's selector waits under them;
  each interior that ever parses flips its card for free.
- **The healer class** ("{T}: Prevent the next N damage…", 9 cards) — needs a prevention-shield system
  (floating replacement with a decrementing counter). The biggest named leave-behind.
- **"Activate only twice each turn"** — the ONCE-1 ledger counts one activation; a counted variant is a
  small extension.

### 4 · ☀️ DECISIONS I MADE FOR YOU (one line each)
- The main tree's dirty `card-names.json` was a REAL data refresh (Scryfall 07-15) — committed, not reverted.
- Slice manifest regenerated against v0.142.0 + fresh data and committed as the night's map.
- Per-slice proof = the order's own 3-part law (suite + lint + name-audited flip-diff); the deeper
  program/runtime fingerprints were reserved for parser-seam-only changes (none tonight qualified).
- The trajectory-hash anchor is UNRUNNABLE on this box (no profile decks in the main tree — the app isn't
  installed here); the suite's determinism pins carried behavior coverage. Flagged, not silently skipped.
- BG-1 models "commander creatures you OWN" as controller-scoped — an engine invariant (no native
  control-theft, no owner field); documented at the parse site with a revisit marker.
- OA-1/RE-1 + PA-1 rode one gate and one push (the intermediate commit was never pushed alone).
- No release tag, per the order — see NEEDS COLTON.

### 5 · ☀️ NEEDS COLTON (ranked) — ⚠️ STALE AS WRITTEN; reconciled 2026-07-18, see below
> **This block is historical.** Two of its four items were resolved days after it was written and kept
> being re-read as open. Audited against CONTINUITY/COMMS on 2026-07-18 (Cindy):
> 1. ~~C5 taste walk + the release call~~ — **CLOSED 2026-07-16**: Colton LIFTED the C5 taste-gate (the
>    Vault is getting a full rework instead), v0.143.0 + v0.144.0 shipped, and v0.145.0/v0.146.0 followed.
> 2. **Rograkh in the grind pool?** — **STILL OPEN** (carried from 07-15).
> 3. **Real Omnath-deck reconciliation** (Newt→Last March) — **STILL OPEN**; dev copy done, his AppData
>    deck awaits him. NOTE: this box has no app install / AppData, so it can only be done where one exists.
> 4. ~~Golden-hands review (120 hands)~~ — **CLOSED 2026-07-17**: all 100 non-combo hands judged, 77% agree,
>    policy banked in `user_colton_mulligan_philosophy`. The 20-hand combo lane stays parked pending Rog/Thras.
>
> The two genuinely-open asks are **2** and **3**. Live open questions belong in CONTINUITY's top entry,
> not here — this section is a snapshot of one night and goes stale by design.

### 6 · PARKED WITH ANALYSIS (the written next step for each)
- **Prevention shields (healers, 9)** — design: a `preventNextDamage` floating replacement keyed
  source→target-scope with an amount counter, consulted at the damage chokepoint; AI value is low but
  legality is what matters. Medium build.
- **GY-2 (exile-self-cost graveyard abilities)** — extend parseGraveyardSelfRecursion's cost grammar +
  the dispatcher's cost items; Soul of Mirrodin + siblings flip.
- **Group per-blocker watchers (Marhault)** — a `perBlockerPumpGroup` descriptor whose fire loop scans
  the CONTROLLER's watchers per blocked attacker; reuse RE-1's amount math.
- **Aura compound "gets +N/+N and has '<activated>'"** (Lunarch Mantle class, 8) — parseAttachedClause
  already folds quoted-TRIGGERED tails; the quoted-ACTIVATED fold + grantedActivatedForHost surfacing is
  the missing half.
- **Enchant-land quoted grants** (Farmstead/Urban Burgeoning class, 8) — the granted-ability machinery
  wants a land-host acceptance pass.

### 7 · THE SELF-ASSESSMENT (the real read, not a highlight reel)
**What worked:** recon-instruments-first (clause-frontier + the family probe) made every slice
evidence-picked — the manifest's static priors would have sent me at cumulative upkeep (already built,
a mirage) and underweighted the Rootwalla frame (+31 from a bucket the ladder never named). The
audit-every-GAINED-row law caught TWO real would-be FP classes before they shipped (RE-1's group-scope
regex — Marhault would have pumped the wrong creature — and the OA/RE double-descriptor twin). The
CREED pins did their job in reverse too: five stale must-stay-LOW pins graduated tonight, each
repointed at a still-unmodeled example rather than deleted.
**What I'd do differently:** (1) the BG-1 commit message states suite 8,556 — the true count was 8,546;
caught one commit later, correction recorded here and in SS-1's message (can't amend a pushed commit).
(2) Two early gate runs piped through `tail`, which masked exit codes — one suite failure surfaced a
run later than it should have; switched to explicit exit-code capture mid-night. (3) One gate ran while
I was mid-edit on the next slice, making its verdict ambiguous — re-gated the final tree and pushed both
commits under the one verified state; cleaner is to not touch the tree while a gate runs. (4) I spent
~25 minutes on cumulative upkeep before probing whether it was already built — probe FIRST, always.

**Carried items unchanged:** Feature B (Omnath's persona narration) · the mirrored-pod targeting
re-anchor (needs scheduling) · everything in §5.

## 🏛️ 2026-07-15 (night) — VAULT PHASE 2 COMPLETE on master: C5 is DONE end-to-end (awaiting Colton's taste walk)

Colton fired the parked C5 Phase-2 layout batch ("fire it up and let'er rip"). All five items
shipped in spec order, each suite-green + lint-0, then live-walked in the dev server (kiosk → Census
→ Stacks → overflow → shelf → trophy page → edit drawer → Gallery, driven via the accessibility tree;
seeded 2 stage-prop cards through the real API for the walk, deleted after):
- **P2.2 (ececb650):** Stacks header → Add + Import + ONE ⋯ overflow menu (reversible by design).
- **P2.3 (ba8a6d74):** Ledger split — finance stays; stats become **THE CENSUS** (kiosk 5→6 doors,
  live pane = biggest color share + unique count; tally-mark icon; area tagline updated).
- **P2.1 (2248e70e):** **THE SHOWPIECE SHELF** + elevated grid cells — provenance-flagged rows
  (signed/artistProof/altered/showcase) + top-5 by value (\$50 Finance grail floor) open The Stacks
  large under the glow; flagged grid cells get glow ring + ★ chip. Shared predicate:
  `app/src/lib/showpiece.js` (unit-tested).
- **P2.4 (1fe12c4e):** **VaultTrophyPage** — flagged cards open full-page (hero art, provenance
  plaque, worth + trend, copies, notes); "Edit details" opens the drawer BESIDE it; unflagged cards
  keep the drawer.
- **P2.5 (b493e9e4):** Gallery rides the shared CollectionView shell (embedded mode, no dup header).

Suite **8,519** (+20) · lint 0 · CHANGELOG [Unreleased] written. **OPEN for Colton: the C5 spec's
review gate — a packaged-UI taste walk (shelf + trophy page are taste features; expect one
adjustment round) → then cut the release.** Carried items unchanged: Rograkh in the pool? · real
Omnath-deck reconciliation · Feature B (Omnath) · mirror-targeting spec.

## 🚢 2026-07-15 (night, later) — v0.142.0 TAGGED (c08d8d09): the whole Crucible batch ships

Colton eyeballed and called it ("ship this is good"). One release: The Reflecting Pool R1-R4 +
Living History, ▶ watch-the-highlight, the A/B coverage trust banner, the grind-store guards.
Tag v0.142.0 pushed; CI release run 29469377709 was in progress at handoff — if it failed, fix and
re-tag per RELEASE.md before anything else. Remaining Colton/Omnath items unchanged from the entry
below (Rograkh? · real Omnath-deck reconciliation · Feature B · mirror-targeting spec).

## 🎬 2026-07-15 (night) — CRUCIBLE SWEEP COMPLETE: dream shelf A ✅ + C ✅ (B = Omnath's lane) · queue item ② closed · sim-integrity order closed · A/B trust gate live

Autonomous continuation (Colton's standing order: any Crucible-attached work, full auto). Shipped to
master, each suite-green + lint-0 + live-verified:
- **Feature C "▶ Watch it" (b0e22ea4):** game-anchored highlight facts re-run their exact game
  (deterministic seed-index replay, cross-checked vs the recorded row) → per-turn scrubber. New
  `engineLogNarrator.js` (engine log → honest plain-English play-by-play; reusable). perGame rows now
  record their SEED index (array position drifts on engine-throws — the replay anchor bug that never
  shipped).
- **A/B bench coverage trust gate (3748e0fc):** both swap cards classified at start
  (coverage.classifyCard); a not-fully-modeled card gets a plain banner framing the result as a
  partial read — "no effect" can no longer masquerade as a verdict (Omnath's Chronicle-of-Victory rule).
- **Grind-store double-writer guard (18d2b652):** wake-queue ② audited STALE (0 dupes in the live
  store AND the epoch-2 archive, both dense) + a permanent dedupe-on-read (last-line-wins) in
  readAllGrindHeaders.
- **Sim-integrity order effectively CLOSED (0de1d309):** Phases 0-3 verified shipped; the missing
  Phase-0 guard shipped as a formPod deck→seat uniformity tripwire (2,000 seeded pods, >4σ, 39ms).
  **⚠ ENGINE FINDING (banked, not fixed): mirrored pods pile onto early seats (0/5/14/41 @ n=60)** —
  attack-targeting heuristics; real-deck pods are FAIR (25.0/25.1/24.8/25.1 by position over 23,313
  games). Any mirror-based measurement (pilot A/B, temperament benches) is position-poisoned until a
  spec'd targeting fix — a RE-ANCHOR event, needs scheduling.
- Removed the committed scratch dump `after-clone2.txt` (4b2b61c6).

Suite **8,499** · lint 0 · master tip b0e22ea4 (+docs). **OPEN for Colton:** eyeball the Reflecting
Pool + the highlight replay → cut the release (one batch: R1-R4 + trust gate + ▶ Watch it) · Rograkh
in the grind pool? · real Omnath-deck reconciliation (Newt→Last March; the dev copy already matches).

## 🪞 2026-07-15 (later) — R4 THE LIVING HISTORY on master (600768d6): the Pool is COMPLETE R1-R4; combat-stamp finding RESOLVED (data age, not a bug)

R4 un-parked and finished per Colton's standing order (autonomous session — he authorized working
around parks). **mineDeckHistory** slices a deck's games into chronological eras by `decks[].deckV`;
the **deck-versions registry** (`<profile>/self-play/deck-versions.json`, written at grind start by
BOTH paths via grindPod.deckVersionEntry — the same hash fn as the header stamp) names each version's
exact list, so the dossier shows real card diffs ("+ Last March of the Ents · − Noxious Newt").
HONESTY IS STRUCTURAL: the pre-tracking era never anchors a comparison (mixed engines/pilots/stamps —
live probe proof: 'combat 0%→93%' was the STAMP era changing); deltas need 100 games both sides,
shifts 30-a-side + 5pt, and everything clears a two-proportion 2σ noise gate. UI: era timeline at the
dossier's foot, hidden under 2 eras.

**Combat-stamp finding RESOLVED:** fresh games stamp winCondition 24/24 'combat' — the mechanism
(loseLife combatDamage flag → lethalDamageCombat → epochStats) is live and correct; the 24k games
simply predate v0.140.0's split. Legacy 'damage' inflation self-heals as new-era games accrue.

**Dev-tree data note:** the worktree app/data copy grew to 25,334 headers (two 600-game pool batches:
pre-swap + post-swap) and its Omnath deck copy carries the Colton-sanctioned Newt→Last March swap
(matches his verified-100 target; his REAL AppData deck is untouched and still awaits his own
reconciliation). Suite **8,487** · lint 0 · walked live in-browser.

**OPEN:** Colton's dossier look-check → cut the release (his gate). The Rograkh-in-the-grind-pool
question is still his to answer.

## 🪞 2026-07-15 — THE REFLECTING POOL: R1-R3 on master (6c043009), UNRELEASED pending Colton's look-check

The Post-Mortem grew into **The Reflecting Pool** (Colton's locked name) — the per-deck review dossier:
record · facts row (typical game / wins-end-by / dies-around / usually-closes-by / commander-online) ·
two lift-mined mirrors (what WINS you games — new R1 win catalog — / what LOSES you games), deck-shelf
chips browsing one dossier at a time. Internal `postmortem` view id + `/api/why-you-lost` route kept.
**R3**: every new grind header stamps `decks[].deckV` (grindPod.deckVersionHash — sha1/12 exact-to-the-card
incl. basics/commanders/companion) via the ONE shared builder on both write paths; forward-only; R4
(living history) parks until versioned games accrue. Suite **8,475** · lint 0 · walked live on the real
24,102 headers (seeded read-only into the dev tree).

**Honesty catches off the real-data probe (both fixed pre-push):** the generic "damage" winCondition
topped EVERY deck's wins at 80-97% → excluded from win patterns (facts-row mix only, "damage / drains");
closed-fast threshold set from real p10 (32), not a guess.

**⚠️ QUEUE — engine finding:** combat wins ≈ ZERO across all 24,102 games (Slivers closes 80%
generic-"damage" + 20% commander-damage, ~0 combat — a Sliver deck cannot honestly do that).
`lethalByCombat` likely unstamped at (most) combat eliminations → everything falls to the generic
bucket. Root-cause before any surface leans on combat-vs-burn splits. Also open: Colton's dossier
look-check → cut the release.

## ⚡ 2026-07-10 (later) — THE SHELF RUN: PHASE 1 IN FLIGHT — 28 tier flips shipped (v0.128.0 → master), all audited, LOST 0

**Shipped slices (each: flip-diff audited by name · whole-card verified · suite green · lint 0 · pushed to master):**
- **S1.1** cast-program strip (Harmonized Crescendo recurrence — root cause: unstripped `action.program` short-circuited the dispatcher fallback) — runtime fix, 0 flips.
- **PtH + sequencing-Then strip** (`parser.js` per-sentence loop, CR 608.2c): **+5** — Plan the Heist (conditional surveil `onlyIfHandEmpty` + resolver gate), Deadly Embrace, The Crystal's Chosen, Undercity Uprising, Insidious Fungus.
- **W1 COUNTER-THEN-GRANT collapse** (Snakeskin Veil class; add-counter gains layer-6 `grantKeywords`): **+15** — incl. Angelfire Ignition, Gaea's Gift, Take Up the Shield, 2 modal + 2 trigger carriers.
- **W2 Ram Through** (damage-target-power + `trampleExcess` → excess to controller, CR 702.19b deathtouch math): **+1**.
- **W3 Ancient Animus** (fight-pair + `fighterCounter{onlyIfLegendary}`, persistent counter before power lock): **+1**.
- **W4 Paradise Mantle** (granted-mana EQUIPMENT — parse widening only; layers.js attachment path already fires for any attachedTo): **+1**.
- **M1a ONCE-PER-TURN TRIGGER latch** ("This ability triggers only once each turn." — strip + descriptor stamp + flushTriggers latch; COMPOUND GUARD keeps MACH-1 parked): **+3** — Mirelurk Queen, Academy Wall, Flying Octobot.
- **M1b milled-count tokens** (Scorchbeast: milled sentinel → `countContext` + create-token joins ONCE_PER_TURN_HONORED with a real resolver latch): **+1**.
- **M1c Mothman distribute** (each-of-up-to-X via distribute-counters + `perTargetCap:1`; 3 coverage spell-guards widened): **0 flips — runtime only**; Mothman tier stays parked on the "enters or attacks" compound-event guard (mothmanRad.js coordination note).
- **M2 MILL-DOUBLER** (Bruvac → doubler family; `millMultiplier` at BOTH chokepoints incl. radiation): **+1**.
Tests 8,078 → **8,108**. Census/corpus republish pending the next slice batch.

**⚠️ MID-FLIGHT (uncommitted in the worktree, safe-inert):** M3 Mindcrank life-loss watcher — `gameState.js` registry + loseLife hook (null-watcher = byte-identical) + `triggers.js` lifeLost condition detect are IN; still needed: `checkLifeLossTriggers` + `registerLifeLossWatcher` wiring, the "that player mills that many cards" payoff clause (who:lifeLostPlayer + countContext:lifeLostAmount in applyMill), referent gates (triggerRouting + coverage ×3), tests, flip-diff.

**☀️ FOR COLTON:**
- Named parks so far: Chain of Vapor (standing), MACH-1 (compound limiter — needs the shared-latch build), Emrakul the Promised End (control-a-turn, Yuriko ledger park-candidate). Sign-off when convenient; work continues.
- **EXE DECK-PROFILE ISSUE RECURRED** (your screenshot: your 6 decks listed under "Joe"): queued as a PERMANENT-FIX workflow item — see the queue below. Likely the updater-relaunch ghost-registry thread (COMMS 2026-07-09 evidence note) or a mis-attributed re-import while the ghost was active. Interim: tray-Quit → manual relaunch; deck data repair + root-cause scheduled.

**QUEUE (next up, in order):** ① Omnath's featuresV=2 header bundle (manaHealth per-seat units fix + startSeat/turnOrder + per-seat mulligan summary + decisionsCount) — header-derivation only, no re-anchor; ② double-writer dedupe/reconcile idx ~24230–24318 at pool end; ③ finish M3 Mindcrank; ④ EXE deck-profile permanent fix (data repair + updater-relaunch root-cause); ⑤ compound-event trigger subsystem (Grave Titan / Mothman / Alpha Deathclaw / Kindred Discovery — big corpus lever); ⑥ resume Phase-1 ledger builds (Mothman → Kellan → Wolverine → Yuriko → Cap, workflow-verified dispositions in `tasks/wlg0dw5cn.output` digest).

## ⚡ 2026-07-10 — THE SHELF RUN: PHASE 0 BASELINE PUBLISHED (all six deliverables)

**1 · FRESH 15-DECK CENSUS** (lands-in-denominator; engine v0.128.0): AGGREGATE **78%**
(1,173/1,500; was 73.9% floor). Per deck: Slivers 99 · Koma 94 · Omnath 94 · Vihaan 93 ·
Zaxara 93 · Toph 79 · Rograkh 77 · Ur-Dragon 75 · Kinnan 74 · Pantlaza 71 · Cap 70 ·
Yuriko 65 · Wolverine 64 · Kellan 63 · **Mothman 62 (new worst — evidence re-ranks the
roadmap's Wolverine-first order)**. Gap = 327 slots (235 body-only · 87 arbiter-spell · 5 pw).

**2 · THE ONE CORPUS DENOMINATOR (decided): all 34,169 real bundled oracle cards**
(isRealCard: tokens/emblems/schemes/etc. excluded — the measure-coverage headline; compare
within-method only). **CORPUS: 27.6% native (9,415)**. Play-weighted lenses: **top-1k 66.2% ·
top-2.5k 47.5% · top-5k 36.9%** — the four numbers every session republishes.

**3 · NEWEST LIVE-FIRE BREAKAGE** (fresh 36-game 15-deck batch, v0.128.0): Veil of Summer ×4 ·
**Harmonized Crescendo ×3 (⚠️ RUNTIME-MISMATCH RECURRENCE — the v0.117 Convoke fix claimed this
class native; S1 must root-cause)** · Fraying Sanity ×2 · Plan the Heist ×2 · Seize the
Spotlight ×2 · Freed from the Real · Galvanic Blast · Ordeal of Nylea · Well Rested. 20 entries/36 games.

**4 · TRIGGER-LABEL RESIDUE**: R1.3 (v0.128.0) split condition-not-met from
trigger-removed-no-target at the engine level — the named cards (Kogla, Defense of the Heart,
Scourge of Fleets) get S7 verification during their decks' ledger closes (Scourge's DROP class
was FIXED in R1.2).

**5 · ARBITER-IN-RUNNER STATUS**: the seam exists (default-off `resolveArbiter` hook +
verdict store + prepass, v0.117) but **no verdict SOURCE is wired** — grind-time gated cards
still no-op (logged `spell-unresolved`, null-labeled). "Gated" in grind data = unplayed, not
Ollama-resolved. The verdict source remains the pending piece (Omnath-adjacent).

**6 · ★ THE SLICE MANIFEST** (`app/scripts/slice-manifest.json`, generator committed):
**2,520 ladder-matched non-native cards → projected corpus 27.6% → 34.9%** if the full ladder
lands. By size: transform-dfc 680 · tutors 417 (11 in top-1k — the most-played king) ·
loyalty-activated 313 · counterspells 219 · token-copies 217 · target-mill 136 · suspend 110 ·
cum-upkeep 71 · level-up 62 · venture 50 · batch-combat 44 · self-bounce 41 · cascade 33 ·
incubate 28 · wheels 26 · the small tail (spores/initiative/bite-pw/detain/graft ≤19 each).
INTERACTION CLASS TOTAL ≈ 662 cards — Omnath's call confirmed by data. Unmatched bespoke tail:
22,234 (mechanismBucket groups in the JSON). Method stated in-file (pattern-proxy; flip-diff is
truth at build time). Triage ledgers: `app/scripts/triage-ledgers.json` — 327 rows, all 15 decks.

☀️ **QUESTIONS FOR COLTON**: none yet — Phase 1 building started (S1 first per the order).


> ROTATING doc (rotation rule enforced 2026-07-09: current cycle only; history lives in
> [archive/WAKE-REPORT-through-2026-07-09.md](archive/WAKE-REPORT-through-2026-07-09.md) + git).
> Boot order + method: [MASTER-GUIDE.md](MASTER-GUIDE.md). The queue: `memory/orders/master-plan-2026-07-09.md`.

## ⚡ 2026-07-09 NIGHT — THE R-WAVE SESSION SHIPPED (v0.128.0): R1+R2+mulligan+pool-tag+epoch-2 = the ONE re-anchor

**One session, the master plan's whole critical path — epoch 2 starts here.**

- **R1 engine CREED-FPs (5)**: exile-instead no longer fires dies-triggers (phantom Blood-Artist
  drains gone; log relabeled `creature-exiled-instead`) · `eachOpponentCreature` registered
  (Scourge-class mass bounce was silently DROPPED at the flush while classified native) + the
  drift guard now SCANS EMITTERS (an omission fails by name) · upkeep-win not-met → sentinel
  (breakage-queue pollution gone) · storm combat-referent guard · payLife/discard affordability
  re-check. Tier flip-diff **LOST=0 GAINED=0** (10,157 native).
- **R2 store data-trust (7)**: decisive-only win rates + winner splits · run-caps never persist ·
  crash-window duplicate-index self-heal (write-side skip + read-side dedupe) · pool parent
  unhandled-rejection guard + tmp cleanup · `shuffleLibrary` requires the seeded rng ·
  seed math single-sourced (`seedMath.js`) · `/api/self-play` gamesPer clamp [1,50].
- **MULLIGAN OVERHAUL (SIM-INTEGRITY Phase 2)**: `makeMulliganPolicy(playbook)` — land windows,
  color-aware castable floors, piece demands, ship floors (combo mulls to 4) — replaces the
  poison filter for every persona seat; London bottoming now ranks WORST-N (excess lands →
  uncastable/highest-MV) instead of the blind tail; `mulliganPolicyV: 2` stamped. 27 policy tests.
- **POOL TAG (Phase 3)**: Rograkh/Thrasios + Kinnan = `cedh`; pods form within ONE pool
  (loop/workers/route/SimCenter selector); headers + summarize record it. 13 mixed / 2 cedh.
- **EPOCH-2 INSTRUMENTATION (all 6, ONE schema bump → v3)**: per-seat finishRank +
  eliminatedAtTurn + manaHealth (colorMiss PARKED — needs a legal-set counter) · winCondition
  taxonomy · rows v2 (legal histogram, rank, stackDepth, forced; nearTie PARKED — seam lacks
  chooser scores) · `build-grind-card-evidence.mjs` (cast×outcome, the corpus blend feed) ·
  `replay-canary.mjs` + dedupe guard · Wilson CIs + seat-skew flags + player-turns label +
  per-version/per-pool cuts in the readout.
- **🔴 CANARY FINDING (first run!)**: persona temperament assignment is RANDOM → persona games
  are NOT replay-regenerable; canary discriminates (ENGINE proven deterministic with fixed
  pilots) and gates pruning RED. The per-game seed now rides `buildPilots(seats,{mode,decks,seed})`
  — **Omnath must make temperaments seed-derived**, then the canary greens and pruning unlocks.
- **R7 deletions (Colton-approved, all verified)** + **R4.1** Arbiter CR citations fixed against
  the bundled CR (tax 903.8, shield 122.1c, destroy 701.8, Day/Night 731) with a permanent
  cite-guard test · **R6** CHANGELOG dated, E1 purged, this doc rotated · eslint now covers
  scripts/**/*.mjs (instantly caught a parse-breaking bug in grind-worker).

**ANCHOR LINEAGE (the ONE re-anchor, ×2 each):**
`53614053…` (6,629 rows — FFA sole-survivor era, v0.126.0)
→ `36afd790…` (6,304 rows — playbook mulligans + ranked bottoming changed kept hands)
→ **`3fe82499059d1086da0a67bfe336f22d2af4fe2a96884590bb0d5e5e712f1431`** (6,304 rows — rows-v2
payload growth; identical row count = decisions PROVEN unmoved). Legacy pins: `legacyUserPivot`
reproduces `ab524e20…`; `mulligan:false` byte-identical; playbook-less seats keep the old filter.
Suite **8,072/586** · lint 0/0 · census 1 breakage entry (unchanged).

**DATA ERAS**: epoch-1 archive (`self-play/grind-archive-2026-07-09-epoch1/`, 27.5 GB, winners
fabricated pre-schema-2 — decision-mining only) · **epoch 2 = schemaVersion 3, live store, starts
with the post-v0.128.0 pool relaunch — the clean baseline era.** Standings trust schemaVersion≥2;
mulligan data never pools across `mulliganPolicyV`.

**⚠️ OPEN / NEXT** (full queue in the master plan): Omnath — seed-derived temperaments (canary
gate) + golden mulligan hands (Colton eyeballs) · R4 remainder (Karn banlist, modelProvider
agentName, pilot cache-bust, export inventory, UI error-swallowing set, rulings degrade) · R5
ship-chain (SHA-pin actions, Node bump, placeholder nonce, lib.rs expect, port fallback per
Colton's design) · R6 remainder (README, CLAUDE.md updater doc — Colton: code is right, docs
wrong) · R8 test debt · updater-relaunch forensics (evidence in COMMS 2026-07-09) · HARNESS-DATA
waves 4-6 (reality reports → Stage-A tuning → distill handoff).
