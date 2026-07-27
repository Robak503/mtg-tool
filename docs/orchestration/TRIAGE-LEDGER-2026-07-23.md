# Phase 1A triage ledger — 5 loaded decks, 2026-07-23 overnight grind

Per the standing corpus-grind roadmap's Phase 1A (`cindy-corpus-roadmap.md`, memory-side — not part
of this repo): one row per non-native card, every row dispositioned BUILD / INTERACTION /
PARK-CANDIDATE, zero rows left untagged. This covers the 5 of 15 shelf decks currently loaded on
this box (see WAKE-REPORT for the reimport story — 1→5 tonight, plus a real Archidekt import bug
found and fixed along the way). The other 10 decks (Koma, Veyran, and Joe's 11 Moxfield decks)
aren't loaded here yet; their ledgers wait on that reimport.

**Method:** every disposition below is grounded in real oracle text pulled live from the bundled
index (`lookupCard`/`publicCard`), never from memory, per CLAUDE.md §1.2. "Likely quick" notes are a
confidence read from adjacent already-modeled pieces, not a verified estimate.

## Cross-deck BUILD-ONCE-FLIP-MANY groups (the highest-leverage finding)

Reading every card's real oracle text (not just its mechanism bucket) surfaced four groups where a
single lever flips multiple carriers across different decks at once — exactly the roadmap's own
"build-once-flip-every-carrier" principle:

| Lever | Carriers | Shape | Real scope (triple-checked — see the methodology note below) |
|---|---|---|---|
| Counter-proofing | Vexing Shusher, Hexing Squelcher, Veil of Summer | "can't be countered" (self and/or granted) + Ward-grant | **Split verdict, precisely scoped.** On the two CREATURES (permanent statics, tested via the correct `parseStaticAbilities`/`classifyCard` pair): "This spell can't be countered" (self) and "Spells you control can't be countered" (controller-scope) ALREADY classify `native-static` individually and combined — `staticAbilityParser.js` already has both (`cantBeCountered: {scope:"self"\|"youControl"}`), and `spellEffects.js:581`+`:570-572` already ENFORCE both at the counter-target-enumeration chokepoint. Ward-on-self also already works. **Vexing Shusher's sole real gap: the ACTIVATED "{R/G}: Target spell can't be countered" — a temporary GRANT to another spell, which the engine explicitly doesn't model yet** (spellEffects.js's own comment: "granted/external can't be countered isn't modeled"). **Hexing Squelcher's sole real gap: "Other creatures you control have \"Ward—Pay 2 life.\"" — a static GROUP-grant of a quoted keyword-with-cost**, confirmed empirically (isolating every other clause combination classifies `native-static`; only this one clause drags the whole card to body-only) — no existing recognizer for this shape in `staticAbilityParser.js` (grepped, zero matches), and it's unverified whether the RUNTIME even honors a granted (vs. printed) Ward the same way. **Veil of Summer is genuinely the "bigger than it looks" case**: it's an INSTANT (a one-shot spell effect, not a permanent static), so the identical words go through `parseEffectClause` instead — and there, all three clauses (temporary "this turn" counter-protection, a cast-this-turn-conditional draw, temporary hexproof-from-specific-colors) are unbuilt. Same phrase, two totally different code paths depending on card type — don't assume printed-on-a-permanent and printed-on-a-spell share a fix. |
| Cast-as-though-flash | Valley Floodcaller, Borne Upon a Wind | Temporary flash grant to a spell class | Checked via `parseEffectClause` (both are spell/trigger effects, the right tool here): both fail to parse. This needs a hook into the casting-legality check itself (what's castable and when), not just a resolver-side effect. A real subsystem, not a quick lever — unlike counter-proofing, there's no permanent-static escape hatch here since both carriers are temporary spell/ability grants. |
| Redirect a stack object | Deflecting Swat, Flare of Duplication (Chain of Vapor shares the shape but is parked — see below) | "Choose new targets for target spell/ability" already on the stack | Not re-checked live tonight — treat the "buildable" read as unverified until someone opens the file, per the methodology note below. |
| Excess-damage payoff | Contest of Claws, Hell to Pay | A derived "damage beyond lethal" metric feeding discover/Treasure | Not re-checked live tonight — same caveat. |

**Methodology lesson, banked so it isn't relearned the hard way a third time:** this row went through
three passes tonight before landing on the accurate scope, and the mistake both earlier passes made
was the SAME one: testing a permanent's static-ability clause through `parseEffectClause` (the
spell/trigger/activated-ability effect parser) instead of `parseStaticAbilities` + `classifyCard`
(the actual static-ability pipeline) — `parseEffectClause` will honestly report "unparsed" for text
that a DIFFERENT, correct parser already handles fine, and that false negative looks identical to a
real gap unless you check which pipeline actually owns the clause's card type. Rule of thumb: a
permanent's own printed static ability → `parseStaticAbilities`/`classifyCard`; a spell, triggered,
or activated EFFECT → `parseEffectClause`. Grouping by shared THEME (what this ledger did on first
draft) is also not the same as grouping by shared FIX SIZE or even shared CODE PATH — Vexing Shusher
and Hexing Squelcher's SELF clauses already work today; their SECOND clauses are two DIFFERENT unbuilt
mechanisms (activated-grant vs. static-group-grant); and Veil of Summer's identical-looking words are
a third, unrelated code path entirely because it's a spell, not a creature. The Mondrak row below got
this same rigor and came back with an equally precise answer.

## BUILD

Grouped where a lever covers more than one card; otherwise one row each.

- **Contest of Claws, Hell to Pay** — excess-damage metric + discover(X)/Treasure-count payoff.
- **Vexing Shusher, Hexing Squelcher, Veil of Summer** — counter-proofing (self + grant).
- **Valley Floodcaller, Borne Upon a Wind** — cast-as-flash grant.
- **Deflecting Swat, Flare of Duplication** — redirect-target-of-a-stack-object.
- **Mondrak, Glory Dominus** — **precisely scoped tonight, not built.** The token-doubler clause is
  ALREADY correctly recognized — `doublerProfile`'s own header names Mondrak by name as a covered
  example, and `coverage.js`'s `doublerCardTier` already runs it. The card stays body-only for a
  DIFFERENT, already-documented reason: `coverage.js:2082`'s own comment names "an unmodeled
  activated on Mondrak" as the residue. That activated ability — "{1}{W/P}{W/P}, Sacrifice two
  other artifacts and/or creatures: Put an indestructible counter on Mondrak" — combines a
  Phyrexian-mana cost with a type-UNION multi-sacrifice cost ("artifacts and/or creatures", not one
  fixed type); neither piece was checked live tonight, so treat this as scoped-not-verified-buildable.
  A real next slice, now with a precise target instead of a vague "registration" guess.
- **Ragavan, Nimble Pilferer** — combat-damage impulse-exile + Dash; both pieces look individually
  common elsewhere in the corpus — likely quick.
- **Tervigon** — Ravenous is already modeled (`isRavenous`/`entersWithXCounters`); the gap is only
  the damage-scaled "Spawn Termagants" token trigger.
- **Nyxborn Hydra** — Bestow + entersWithXCounters both already modeled; gap is the Aura's-own-
  counter → host-bonus cross-reference.
- **Nexos** — restricted-mana grant ("spend only on costs with {X}"); mana-restriction machinery is
  referenced elsewhere (the 107.4h / 601.2g hint family) — may be close.
- **Old One Eye** — main-phase discard-to-recur trigger (graveyard→hand via an optional cost).
- **Selvala, Heart of the Wilds** — power-comparison conditional draw trigger. Same card used
  tonight as a MUST_NOT_OVER-CLAIM pin exemplar in `triggerTierPins.test.js` — same reason it's
  genuinely hard (the comparison condition needs "greatest power among all creatures," dynamically,
  per entry event).
- **Thunderfoot Baloth** — **re-scoped 2026-07-24, half BUILT (`71ba3a66`).** "Lieutenant" is a pure CR
  207.2c flavor label (now stripped) over TWO different mechanisms in this one cycle: a TRIGGERED
  "at the beginning of combat, if you control your commander" form (7 cards — BUILT, 3 flip: Loyal
  Drake/Guardian/Subordinate; the other 4 have separate unrelated residue) and a CONTINUOUS "as long
  as you control your commander, <static buff>" form (Thunderfoot Baloth + Demon of Wailing Agonies,
  Angelic Field Marshal, Tyrant's Familiar, Stormsurge Kraken, Skyhunter Strike Force, Convergence of
  Dominion — 7 cards, NOT built). Both needed the SAME missing piece — "commander" is a game-state
  designation, not a card type, so the generic "you control <type>" filter correctly rejects it
  (NON_TYPE_WORDS) — but each lives in a DIFFERENT parser (interveningIf.js for the trigger form,
  now fixed; staticAbilityParser.js's GATED-SELFBUFF family for the continuous form).
  **⚠️ Checked closer before claiming this as a clean next slice (2026-07-24) — it ISN'T one.** Every
  one of the 7 static-form carriers has a SEPARATE, ADDITIONAL gap beyond the gate-source itself:
  Demon of Wailing Agonies / Tyrant's Familiar / Stormsurge Kraken gate a whole GRANTED triggered
  ability (not just P/T); Angelic Field Marshal / Thunderfoot Baloth gate a TEAM buff, and
  GATED-SELFBUFF is self-only (`affects: {mode:"self"}` throughout); Skyhunter Strike Force grants
  "melee" — not in GRANTABLE_KEYWORDS (grepped, zero hits), a separate keyword-modeling gap;
  Convergence of Dominion is a cost-REDUCTION static, a different effect family entirely. Adding the
  "your commander" gate-source alone would flip ZERO of these 7 — real infra, zero immediate payoff.
  Not built tonight; the honest next slice is whichever ONE of these 6 additional gaps gets tackled
  first, THEN the gate-source fix has something to unlock.
- **Kellogg, Dangerous Mind** — sacrifice-N-of-a-kind → temporary control-change, duration tied to
  the source staying in play.
- **Agent of the Iron Throne** — group-grant scoped specifically to "Commander creatures you own."
- **Springheart Nantuko** — Bestow already modeled; gap is the landfall-conditional token-copy-of-
  host.
- **Wan Shi Tong, Librarian** — trigger keyed on an OPPONENT's search action (needs to hook the
  tutor-resolution path itself as a trigger source, not just the caster's own actions).
- **The Cabbage Merchant** — opponent-cast trigger + reactive sacrifice-on-damage-taken + a
  multi-permanent-tap mana ability — three real pieces.
- **Mindbreak Trap** — count-this-turn-gated free-cast + variable-target-count exile.
- **For the Ancestors** — **re-scoped 2026-07-24 (Cindy), not built.** flashback already modeled;
  the dig itself is CLOSE but not free: `applyImpulseDigAtom`/`applyLookTopTakeAtom` already support
  a `filter.chosenTypeOfSource` branch (Herald's Horn precedent — ANDs a base filter with the source
  permanent's stored `chosenType`) and `applyRevealPutFiltered` already does "reveal top N, take
  EVERY matching card, bottom the rest in random order" — but for the BATTLEFIELD, via
  `enterCardFromZone`, not hand. **Real remaining gap:** a hand-destination sibling of
  `applyRevealPutFiltered` (swap the battlefield "enter" for a hand move) — a plausible small
  extension, not verified end-to-end tonight. **Icon of Ancestry** shares the "chosen type + random
  order" phrasing (found via the same full-corpus grep habit that found Mayhem Devil's siblings) but
  is a DIFFERENT shape — "reveal AT MOST ONE creature card of the chosen type" (singular, an
  activated ability) vs. For the Ancestors' "any number" (plural, a spell) — closer to
  `applyImpulseDigAtom`'s existing multi-candidate choice than the battlefield atom's "take-all"
  resolution. Two related but genuinely different builds, not one lever; parked for a session with
  room to verify both against the real atom code rather than reasoning from comments alone.
- **Unbound Flourishing** — an X-value doubler variant (distinct from counter/mana doublers) + a
  copy-a-spell/ability-with-X trigger.
- **Nev, the Practical Dean — re-checked 2026-07-24 (Colton asked, rightly, "how is this hard"),
  split into its real two halves.** The static half ("creatures you control with counters on them
  have trample") was NOT hard and is now BUILT (`538d0a86` — see the new COUNTER-GATED GROUP
  KEYWORD entry below); lumping it in here originally was under-checked. The trigger half ("cast
  your first spell with {X}, put X counters on Nev") IS genuinely hard: `castNth` (ordinal
  per-turn counting) and the `{X}`-cost cast filter are two separate, uncomposed systems, and
  there's no generic way to thread a cast spell's own X value to a DIFFERENT permanent's payoff
  (Zaxara's precedent is a bespoke hook). Whole card stays body-only on this half alone.
- **Kozilek, Butcher of Truth** — cast-trigger draw (not a resolve-trigger) + Annihilator + an
  anywhere-to-graveyard shuffle-back trigger; three real pieces, sizable as one card.

## BUILD — flips shipped after this ledger was first written

- **Mayhem Devil family — BUILT (`e68a3df3`, +4: Mayhem Devil, Mazirek Kraul Death Priest, Merchant
  of Venom, Mortician Beetle).** Not on this ledger's original BUILD list (it only names Mayhem
  Devil under a different context) — a full-corpus grep for "a player sacrifices" turned up 8 real
  carriers total. Root cause: `checkSacrificeTriggers` structurally only ever scanned the
  sacrificer's OWN battlefield, so a watcher controlled by a DIFFERENT player could never fire
  regardless of parsing — same shape as the dies-trigger's existing cross-player scan, just never
  extended to sacrifice. The other 4 carriers (Carmen, Thraximundar, Fumulus, Zodiark) correctly
  stay body-only — each has a separate, different, unrelated unmodeled ability (attack-triggered
  power-scaled reanimation, a defending-player edict, a 4-way creature-type attack filter, a
  fractional ETB edict) — real, distinct residues, not a shared lever; not chased further tonight.
- **Counter-gated group keyword — BUILT (`538d0a86`, +1: Winged Hive Tyrant).** Cathedral Acolyte
  already proved a `requiresAnyCounter` dynamic selector generically wired into the layer engine
  ("each creature you control with a counter on it has ward {N}"); generalized past `addWard` to
  any GRANTABLE_KEYWORDS keyword, plus an "other" prefix onto `excludeSelf` (already a real
  selector field elsewhere, just not wired here). 6 real carriers share this selector; Nev, Tesak,
  and Rishkar/Matt Murdock correctly stay body-only on separate residue each (see their own
  entries above/below).

## INTERACTION (Phase 2, greenlit — tutors / counterspells / wheels)

- **Gamble — BUILT tonight (`c98bd172`).** Diagnosed the composition gap (both sub-clauses parse
  HIGH individually; the combined sentence failed because `splitClauses` kept it whole and the
  tutor matchers are end-anchored past the interposed discard clause), then fixed it: a narrow
  `splitClauses` rule excises the interposed "discard a card at random" and reattaches "then
  shuffle" to the tutor half, so each half takes its own already-modeled path unmodified. Verified
  with a whole-corpus `program-fingerprint` diff (34,245 cards, exactly one line changed) — the
  full rigor this file demands, not skipped. Flip-diff GAINED=1/LOST=0; corpus 11459→11460; the cdh
  (Rograkh/Thrasios) deck 80%→81%. Pinned in `splitClauses.test.js`.
- **Land Tax — ALREADY FLIPPED**, no action needed. Caught by RAMP-MULTI-TO-HAND (`60a8618c`,
  same night) — it's literally the pin card in `rampMultiToHand.test.js`. This ledger entry
  predates that build; leaving the correction here so nobody re-chases it.
- **Vibrance, Sowing Mycospawn — re-checked 2026-07-24 (Cindy), NOT the quick tutor-reuse the
  auto-tag implied.** Vibrance's gap is a "which color pips were SPENT to cast it" condition (mana
  actually paid, not mana available) — a different tracking axis than anything tutor-shaped.
  Sowing Mycospawn's is a "When you CAST this spell" trigger (fires pre-resolution, a distinct
  timing from ETB) plus a kicked-conditional second effect. Both real, both separate small builds,
  neither is "the same tutor matcher, just re-run it."
- **Pact of Negation, Mana Drain — re-checked 2026-07-24 (Cindy), NOT quick either.** Both already
  classify `arbiter-spell` (a real, working, INTENTIONAL Arbiter route, not an undetected gap) — the
  base "counter target spell" half is fine; what's missing is a genuinely new mechanism: a
  RESOLVING SPELL setting up its own delayed trigger ("at the beginning of your next upkeep/main
  phase, <effect>"). That's an engine capability, not a parser regex — sizable, not a slice.

## PARK-CANDIDATE (genuinely bespoke, or a whole new subsystem — not a quick slice)

- **Chain of Vapor** — the roadmap's own named, already-signed parked exception. Not relitigated.
- **Helix Pinnacle** — bespoke single-card alt-win-condition (100-counter threshold); minimal
  corpus-transitive value.
- **Biomancer's Familiar** — a single-card "un-adapt" activated ability with no other carriers seen.
- **Season of the Bold** — a genuinely novel pip-weighted modal shape ("up to five {P} worth of
  modes, may repeat the same mode") — not the standard choose-one / choose-up-to-N-distinct shape
  the modal engine already handles. Real, but substantial; flagging rather than rushing a novel
  modal-engine extension at the end of a long session.
- **Invasion of Ikoria // Zilortha, Apex of Ikoria** — **Battle cards are a whole new card-type/zone
  mechanic** (Siege framing, "choose an opponent to protect it," defeat-then-transform). Not on any
  existing D-vein list on the roadmap — worth a fresh corpus-wide count of how many Battle cards
  exist before scoping; likely bigger than a single slice.
- **Hidden Strings** — Cipher is a whole keyword subsystem (encode-on-a-creature, recast free on
  combat damage) — not a 1-card fix even though it's the only Cipher card seen tonight.

Related: [WAKE-REPORT.md](WAKE-REPORT.md) · `cindy-corpus-roadmap.md` (memory-side, Phase 1A's
definition — not part of this repo) · [ARBITER-IN-RUNNER-SPEC.md](ARBITER-IN-RUNNER-SPEC.md) (the
authoritative spec for the Arbiter-in-runner status noted in tonight's WAKE-REPORT entry).

## NEXT SLICE (scoped + censused 2026-07-24 morning, Colton-directed): the graveyard-phase-return family

Old One Eye's Fast Healing decomposed into its REAL families (Colton's push — "this isn't the only
card that's gonna have either of these effects" — proved correct by census):
- **Phase-timed graveyard self-return: 23 real carriers** (Squee Goblin Nabob, Charmbreaker Devils,
  Palace Siege, Wort Boggart Auntie, …) — "At the beginning of <phase>, [you may] return this card
  from your graveyard to your hand." Needs: ① a gy-functioning scan for PHASE events (checkStepTriggers
  walks battlefields only; mirror checkMilledTriggers' existing graveyard scan + functionsFromGraveyard
  stamp — the Radroach precedent, CR 113.6c) · ② a self-return-from-gy-to-hand atom (parses LOW today).
- **Optional-discard-cost reflexive: 5 carriers** (Old One Eye, Erebos's Titan, Gigapede, Toph,
  Jadzi) — "you may discard N cards. If you do, <effect>": extend the existing optional-mana-payment
  atom family (only {mana} costs today) with a discard-N cost variant.
- **"Fast Healing —" label strip** (1 card) rides along.
- **Timing prerequisite SHIPPED (`dd6ff026`):** the firstMain event already existed
  (triggerScheduler.detectPhaseTrigger — grep before building, lesson re-banked); the vanishing-reminder
  + compound-at-beginning fixes unlocked Four Knocks + Crack in Time (+2).

## MOBILIZE — scoped 2026-07-25, NOT built (a landmine found, not a slice)

14 carriers (Zurgo Stormrender, Nightblade Brigade, Zurgo Thunder's Decree…). Two of its three pieces
are now DONE: the attack trigger exists, and the "Sacrifice them at the beginning of the next end step"
half is covered by the new delayed-trigger scheduler (`c93b6d56`). The remaining piece looked like a
one-line parser widening — the token matcher just doesn't allow the "tapped and attacking" riders that
print BEFORE the P/T, and `atom.entersAttacking` already exists.

**It is not a one-line fix, and the reason is worth remembering: `entersAttacking` IS A DEAD WRITE.**
It sets `permanent.attacking = true`, and grep confirms NOTHING reads that property — attacking-ness is
membership in `state.combat.attackers` (combatResolution iterates that list at every damage step;
layers.js's `attacking` selector queries it; zero other readers exist). Crediting mobilize off the
parser alone would classify 14 cards native while their tokens sit inert — never attacking, never
dealing damage. Classic "classification right, runtime never fires" (runbook failure table, row 4).

**The honest build:** the token atom must register minted tokens in `state.combat.attackers` with the
correct defender, during the declare-attackers window. That is real combat-state work, not a regex.
A dead-field warning has been added at the atom so the next person doesn't trust the field on sight.

## AFTERMATH — scoped 2026-07-25, deliberately NOT lifted (a reasoned park, plus a real hazard found)

27 carriers, 10 sole-blockers by census. It looks exactly like the flashback class ("Cast this spell only
from your graveyard. Then exile it." — a zone option the engine never offers), which is the basis on which
flashback/transmute/unearth are all credited. It is NOT the same, and there are two separate findings:

**1. There is already a deliberate park, with a stated reason.** `splitCard.parseSplitCard` explicitly
returns null for aftermath: *"an aftermath card's second half casts only from the graveyard (an unmodeled
zone). Either makes the card not-fully-modeled → null → it stays an Arbiter spell (safe FN)."* So the
blocker is NOT the keyword residue — a coverage credit alone changes nothing, because the card never
reaches the split-card lane at all. Left standing: whether "a card whose second half we can never cast is
fully played" counts as native is a SCOPE call the original author already made deliberately, not a bug.
Unlike flashback (one spell, one extra zone option), an aftermath card's back half is a DIFFERENT spell
with different effects — never casting it means always playing a strictly weaker card.

**2. If that park is ever lifted, a from-hand filter MUST land in the same change.** `legalChoices`'
`actionsCastSplitFromHand` offers BOTH faces of any native split card from hand, with no aftermath check.
The moment aftermath cards classify native they become castable from HAND — an ILLEGAL play (CR 702.127a),
not a missing option. The fix is small (skip the face whose reminder-stripped text is the bare "aftermath"
keyword) but it is load-bearing and must precede, not follow, the credit. Verified live this session; no
live bug today only because the park keeps these cards non-native.

Written up rather than built: lifting a reasoned park is Colton's scope call, and shipping the guard alone
would have added an unreachable code path (the entersAttacking lesson from the same session).

---

## ✅ DONE — activation limit as a COUNT (`Activate no more than N times each turn`)

Scoped 2026-07-25 at the tail of census day 2. Not built because it touches the action-LEGALITY
path (the simulator's most load-bearing seam) for a 7-card yield, at the end of a long shift. It is
fully scoped here so the next session can start cold.

**The gap.** The engine models the frequency restriction as a BOOLEAN (`oncePerTurn`), so only the
"Activate only once each turn." frame is expressible. The counted frames have no lane:

| wording | native | non-native |
|---|---|---|
| `activate only once each turn` | 56 | 52 (blocked on other text) |
| `activate no more than twice each turn` | 0 | **5** (Pit Imp, Phyrexian Battleflies, …) |
| `activate no more than three times each turn` | 1 | **2** (Soul Kiss, …) |

**Exactly three sites** (verified by grep; no others read the ledger):

1. `effects/abilities.js:673` — `ONCE_RIDER` regex + the `oncePerTurn` flag set at :674, surfaced
   on the parsed ability at :741. Generalize to `activationsPerTurn: N`, with the existing "only
   once" frame parsing as N=1 so the 56 native carriers keep byte-identical behavior.
2. `legalChoices.js:1655` — the gate. Today:
   `if (ab.oncePerTurn && state.activatedOncePerTurn?.[`${perm.id}:${ab.raw}`] === state.turn) continue;`
   Becomes a count comparison against N.
3. `actionDispatcher.js:1034-1035` — the record. Stores `[key] = turn`; needs `{ turn, n }` (or a
   turn-scoped counter) so the gate can compare.

**Coupling is low:** only `activateOncePerTurn.test.js` touches the stored shape (3 references).

**The FP to avoid.** Getting the comparison backwards (`>` vs `>=`) or failing to reset the counter
on turn change grants an EXTRA activation — a permissive engine, which is the forbidden direction.
Pin both boundaries: the Nth activation must be legal and the N+1th must not, and the counter must
reset across a turn boundary. Also pin one of the 56 existing "only once" carriers unchanged — that
regression is the real risk here, not the new cards.


**BUILT IN THE SAME SESSION THIS WAS WRITTEN — the entry above is the pre-build scope and was left stale.**
Verified 2026-07-27: `parseActivatedAbilities` emits `activationLimit: 2` for Pit Imp, the ledger records
`{turn, n}`, and the third activation is genuinely not offered. Carriers (Pit Imp, Phyrexian Battleflies,
Fire-Belly Changeling, Roterothopter …) all read native-activated. **Do not re-build this.**

---

## OPEN POLICY CALL — should an UNCASTABLE card count as native? (31 cards)

Raised 2026-07-25 by census slice 18, which fixed the runtime half (CR 202.1a: a card with no mana
cost can't be cast; the engine was offering Ancestral Vision as a free draw-three). Deliberately NOT
bundled into that fix — it is a metric-policy question, not a defect.

**The situation.** 31 REAL cards (excluding tokens / art-series / emblems) have no mana cost anywhere,
are not lands, and still classify native. The engine can no longer cast any of them:

- **Suspend-only spells** — Ancestral Vision, Crashing Footfalls, Wheel of Fate, Profane Tutor,
  Evermind (splice-only). Genuinely unplayable without a mechanic the engine doesn't model.
- **Archenemy / Hero cards** — The Harvester, The Avenger, Bow of the Hunter, Spear of the General …
  Not castable in any format the app supports.
- **Meld results and similar** — Chittering Host. Never cast; it ARRIVES via melding, and the engine
  may well play it correctly once it is on the battlefield.

**Why it isn't obvious.** The three groups want different answers. A suspend-only spell claiming
native is a clean overclaim — the engine cannot play it at all. A meld result is the opposite: parking
it would understate an entity the engine handles fine once it exists. The Hero cards are out of scope
entirely and arguably shouldn't be in the denominator.

**What NOT to do:** blanket-park everything with an empty mana cost. That is one line and it is wrong
for at least the meld group, and it silently moves the corpus number for reasons unrelated to
capability.

Cost if fixed: at most -31 native (~0.26%), and the honest direction. Needs Colton-level agreement on
what "native" claims for a card that can never be cast, since the corpus % is a headline number.

---

## READY-TO-BUILD — AURA composition: an aura with a bonus AND a trigger (census slice 22 candidate)

Scoped 2026-07-25 off the census TWO-FLIP report. Not built in-session because `isNativeAura` also drives
legalChoices' aura TARGET enumeration (slice 17 wired qualified subjects through it), so a careless
widening risks a wrongly-legal target — the forbidden direction — rather than merely a tier change.

**The gap, measured.** Mark of Fury ("Enchant creature" / "Enchanted creature has haste." / "At the
beginning of the end step, return this Aura to its owner's hand."):

| card text | tier |
|---|---|
| Enchant + the haste bonus | `native-aura` |
| Enchant + the return trigger | `native-trigger` |
| **all three together** | **`body-only`** |

**Root cause.** Auras admit triggers through a narrow ALLOWLIST — `isModeledAuraOwnTrigger` (SL-1, the
Spirit Link / Vampiric Link watcher shapes) — while EQUIPMENT already does the general thing:
`permanentEquipmentCovered` runs `allTriggerSentencesModeled`, then STRIPS the trigger sentences before its
bonus and residue checks. The aura gate should do what the equipment gate does. This is the same
one-path-only shape as slices 10, 16, 20 and 21.

**Carriers visible in the two-flip report** (51 cards total, auras are the largest cluster): Mark of Fury,
Fiery Mantle, Compulsory Rest, Nurturing Presence, Verdant Haven. Expect more once the gate generalizes.

**WHY AURAS USE AN ALLOWLIST AND EQUIPMENT DOESN'T** (investigated 2026-07-25 — do not re-derive):
equipment nativeness is gated by `coverage.permanentEquipmentCovered`, which INDEPENDENTLY requires every
trigger sentence to route (`allTriggerSentencesModeled`). That separate gate is what makes it safe for the
bonus parse to skip ALL trigger sentences. Auras have no equivalent independent gate, because
`isNativeAura` lives in `staticAbilityParser.js` — a LEAF module that cannot import coverage without
creating a cycle. Hence the narrow `AURA_OWN_MODELED_TRIGGER_RE` allowlist instead.

**Do it in one of these two ways:**
1. *(cheap, same architecture)* EXTEND the allowlist, one verified shape at a time. The bar the allowlist
   holds itself to is end-to-end RUNTIME proof: attach the aura, advance to the trigger's timing, confirm
   it fires and its effect resolves (for Mark of Fury: the aura detaches and returns to hand). Cheap per
   shape, no architectural risk.
2. *(proper, larger)* Inject the trigger validator. Give `isNativeAura` an optional
   `triggersAllModeled` parameter supplied by its callers — coverage.js and legalChoices.js both already
   import coverage-side helpers — and skip ALL trigger sentences in the bonus parse when it's provided.
   Preserves the leaf-module boundary and generalizes in one move.

Either way: keep `auraEnchantRestrictions` untouched — the TARGET set must not move — and re-run
`auraEnchantRestrictions.test.js` to confirm the offer-layer pins still hold.

**FALSE ALARM, recorded so nobody chases it:** a non-native Aura cast appears to make the card VANISH — it
leaves hand, goes on the stack, and lands in no zone. That is INTENDED. Resolution sets `state.pendingArbiter`
(the "engine can't model this, ask the Arbiter" seam) rather than creating a do-nothing permanent, and
`aura.test.js` pins exactly that. A probe that doesn't check `pendingArbiter` misreads it as a lost card.
Non-native ENCHANTMENTS and CREATURES do reach the battlefield, which makes the asymmetry look like a bug.

---

## ✅ RESOLVED same-day (slices 26-27) — an ANIMATED permanent can ATTACK but cannot be TARGETED

Found 2026-07-25 while sweeping the printed-vs-layer-aware creature checks (slices 22-25). NOT fixed
in-session: the fix lands on the single most-used path in the engine and deserves its own slice.

**Measured, both directions:**

| question | answer |
|---|---|
| `permanentIsCreature(state, animatedLand)` | `true` |
| can it be declared as an attacker? | **yes** (`animate.framework.test.js` pins this) |
| `enumerateTargets(state, pid, {targetType:"creature"})` | **`[]`** — not offered |
| `controllerCreatureTargets(...)` | **`[]`** — not offered |

**Why this is worse than a normal false negative.** The usual FN posture ("the engine under-offers, which
is safe") does NOT hold here, because the two halves disagree in the SAME direction as the controller's
interest: an animated land can attack every turn and no removal in the engine can ever target it. In
self-play that is an invulnerable attacker, which distorts exactly the signal the sim exists to produce.

**Root cause.** Creature-ness for TARGETING is read from the printed card (`isCreatureCard`) throughout
`spellEffects.enumerateTargets` and the `shared.js` battlefield filters, while COMBAT reads the layer-aware
`permanentIsCreature`. CR 613 says the layer read is the truth.

**Why it wasn't done as part of slices 22-25.** Those were single-permanent referent lookups — each a
one-line change with a bounded blast radius. This is the enumerator every targeted effect in the game
funnels through; widening it changes which targets are legal for every removal spell, pump, aura and
trigger at once. It needs its own tier-and-runtime gate battery, and probably a deliberate check that
nothing downstream assumes a "creature" target has printed P/T.

**Suggested approach:** change the base creature filter in `enumerateTargets` and the `shared.js` filters to
`isCreatureCard(card) || permanentIsCreature(state, perm.id)`, then diff the full suite and drive a removal
spell at an animated land end-to-end. Expect existing pins that assert an animated land is NOT targetable to
need re-examination — check whether each is a deliberate CREED guard or just a snapshot of this bug.


**RESOLVED 2026-07-25, slices 26 (`53247f2c`) and 27 (`81664b6a`).** The enumerator's creature branch and
the four atom-level mass filters now read `isCreatureCard(card) || permanentIsCreature(state, id)`. The full
suite was UNCHANGED by both — no pin anywhere asserted an animated permanent should be untargetable, which
is itself the evidence this was an oversight rather than a decision. Eleven sites fixed across slices 22-27;
all were invisible to the metric, which is why they accumulated.

---

## ✅ MOBILIZE — BUILT same-day (slice 31, `272fa79a`)

Banked that morning as "not buildable — `entersAttacking` is a dead write". That is still true, but it was
only HALF the reason, and the other half has since been built. Recording so the next session doesn't re-park
it on stale grounds.

**Mobilize N** ("Whenever this creature attacks, create N 1/1 red Warrior creature tokens that are tapped and
attacking. Sacrifice them at end of combat.") needs exactly two things:

1. **Register the minted tokens as attackers.** `atom.entersAttacking` sets `permanent.attacking`, which
   NOTHING reads — attacking-ness is membership in `state.combat.attackers` (verified by grep; the warning
   block above applyCreateTokenCopy in tokens.js records this). The build must push the minted ids into that
   list with a defender. The defender IS known at that moment: mobilize triggers on attack, so combat is live.
2. **Sacrifice them at end of combat.** ← **THIS NOW EXISTS.** The CR 603.7 delayed-trigger scheduler shipped
   this morning as slice `c93b6d56` (`effects/atoms/delayedTrigger.js` — `applyScheduleDelayed` /
   `drainDelayedTriggers`). When mobilize was parked, there was no way to express "at end of combat, sacrifice
   these"; there is now.

9 sole blockers + 5 co-blockers. The remaining risk is entirely in (1): registering attackers mid-combat has
to not disturb the already-declared attack, and the tokens must be excluded from any "attacking creatures you
control" count that was locked earlier in the step. Verify at RUNTIME that the tokens actually deal combat
damage — a classification that the runtime never honours is precisely the trap the runbook's failure table
names, and it is the trap this card family sits on.


**BUILT 2026-07-25 (slice 31, `272fa79a`), +9 cards.** Both predicted requirements were real and both were
met: the minted tokens are registered in `state.combat.attackers` against the source's defender
(`ctx.defenderId`), and the sacrifice rides the CR 603.7 scheduler. One correction to the note above — the
printed reminder says "at the beginning of the next END STEP", not end of combat; reading the real oracle
fixed that before it reached code. Proven at runtime by asserting the defender loses exactly 4 life (a 2/2
source plus two 1/1 Warriors), a number only reachable if the tokens genuinely entered combat.

---

## 🚨 OPEN — 159 cards claim `native-mana` but the engine sees NO mana source (metric over-claim)

Found 2026-07-25 by the drift probe's THIRD run (metric gate vs runtime twin). Verified end-to-end, not
inferred. NOT fixed in-session: the honest fix is a real decision about which side moves, and it changes a
headline number either way.

**The evidence.** Of 679 cards the metric tiers `native-mana`, `manaProduction(publicCard)` returns
null/empty for **159**. Spot-checked six on a real board — tier vs `manaSources(state, player).length`:

| card | tier | mana sources seen |
|---|---|---|
| The Eternity Elevator | native-mana | **0** |
| Heritage Druid | native-mana | **0** |
| Bloom Tender | native-mana | **0** |
| Staff of Compleation | native-mana | **0** |
| Sol Grail | native-mana | **0** |
| Akki Rockspeaker | native-mana | **0** |

The metric says "this card's defining ability is modeled"; the engine cannot tap any of them for a single
mana. That is the CREED's forbidden direction — claiming faithful play we do not deliver.

**Root cause is the familiar one: two implementations of one judgement.** The metric gates on
`hasManaAbility` (a TEXT check) plus a residue check; the runtime reads `manaProduction`. Nothing forces
them to agree, and they don't.

**The 159 are not one bug — at least four sub-causes, and they want different answers:**
- **A costed mana ability** — "Tap three untapped Elves you control: Add {G}{G}{G}" (Heritage Druid),
  "{T}, Pay 2 life" (Staff of Compleation), "{T}, Sacrifice a Forest" (Goblin Clearcutter). The runtime's
  standing-mana reader deliberately refuses these.
- **A TRIGGERED mana ability** — "When this creature enters, add {R}" (Akki Rockspeaker). Not a standing
  source at all; this is the shape the phantom-mana FP was about, so tread carefully.
- **A SECOND, unmodeled mana ability on the same card** — The Eternity Elevator prints "{T}: Add {C}{C}{C}"
  AND a station-threshold "20+ | {T}: Add X mana of any one color, where X is the number of charge
  counters". **CORRECTION (same session): I first wrote this up as "extra text defeats the reader" and
  that was wrong** — the reader handles extra lines fine, and it is right to bail on a card whose second
  mana ability it cannot model. The runtime is correct here; the METRIC is the only side over-claiming.
- **A choice-dependent color** — "Add one mana of the chosen color" (Sol Grail).

**Where this most likely lands.** In every sub-cause checked, the RUNTIME's refusal was correct and the
METRIC was the permissive side. That points at one fix — gate `native-mana` on `manaProduction` actually
returning something, i.e. point both at the single reader, the same "one judgement, one helper" move that
resolved eleven bugs this session. It is a HONEST correction, and it drops up to 159 cards (~1.3% of the
corpus) off a headline number, so it wants Colton's eyes before it ships rather than after.

**Do this first:** re-run the probe grouped by sub-cause and confirm the direction holds for all four —
I checked six cards, not 159. `scratchpad/probe-drift3.mjs` is the starting point, and TWO of my readings
in this thread were wrong before they were right: the first draft tested a hand-simplified oracle instead
of the real `publicCard`, and the sub-cause above was misdiagnosed. Keep it on real card text, and
re-derive rather than trusting the table.

---

## ❌ CHECKED AND REFUSED — normalizing "sacrifice IT at the beginning of the next end step"

Investigated 2026-07-25 (after the CR 603.7 scheduler shipped). Looks like free yield; it is a trap.

**The finding.** The delayed-trigger matcher handles the trailing form correctly — `matchDelayedTrigger`
returns `{delayedClause:"sacrifice it", fireStep:"end"}`. What fails is the INNER clause: `sacrifice it`
parses LOW because the pronoun has no referent, while `sacrifice this creature` parses HIGH. So the obvious
fix is to normalize the pronoun.

**Why not to.** Measured across the corpus:

| the immediate clause before it | cards | what "it" means |
|---|---|---|
| acted on the SOURCE ("This creature gets +1/+1…") | **1** | the source — normalization would be correct |
| acted on SOMETHING ELSE | **48** | a created token, a stolen creature, a cheated-in planeswalker |

Those 48 are the Threaten family ("Gain control of target creature… It gains haste until end of turn.
Sacrifice it at the beginning of the next end step") and the token-makers. Normalizing "it" to "this
creature" there would sacrifice the SOURCE instead of the stolen creature or the token — a wrong permanent
destroyed, which is about as bad an FP as this engine can produce.

**One card of upside against 48 ways to be wrong.** Not a slice.

**What WOULD unlock the 48** is a real feature: a delayed trigger that carries a BOUND REFERENT (the
permanent id the immediate clause acted on) rather than re-parsing a pronoun at fire time. The scheduler's
record is plain JSON and already carries `sourcePermanentId`, so adding a `boundPermanentId` is the natural
shape. That is a proper slice with a proper gate — not a regex change.

## ⚠️ RE-MEASURED — the BOUND-REFERENT delayed trigger is SIX cards, not 48

Designed 2026-07-25 while refusing the pronoun normalization. Not built in-session: its failure mode is
severe enough to want a fresh head, see the FP note at the bottom.

**The shape.** "Gain control of target creature until end of turn. It gains haste. **Sacrifice it** at the
beginning of the next end step." (Threaten family) and "Create a token… **sacrifice it** at the beginning of
the next end step." In both, "it" is the object the IMMEDIATE clause acted on — a runtime value, not
something a parser can resolve from text.

**Why it's tractable: the machinery already exists.** The engine already has a referent for exactly this —
`target: "thatCreature"` resolves via `shared.triggeringTargets(state, ctx)` off `ctx.triggeringPermanentId`.
So the delayed path does NOT need a new referent concept:

1. `applyScheduleDelayed` captures the bound id at schedule time (`ctx.targets?.[0]?.id`, or the minted token
   id for the create-then-sacrifice shape) onto the record as `boundPermanentId`. The record is plain JSON
   already, so nothing about serialization changes.
2. `drainDelayedTriggers` threads it into the fired trigger's context AS `triggeringPermanentId`.
3. The delayed clause "sacrifice it" normalizes to "sacrifice that creature", which already parses HIGH.

**⚠️ THE FP THAT MAKES THIS DANGEROUS, and the reason it wasn't rushed:** if the binding ever fails, the
scheduled sacrifice silently does nothing — and the player KEEPS the token or the stolen creature forever.
That is strictly better than printed, the forbidden direction, and it fails SILENTLY because the delayed
trigger still fires and still logs. So:

- If no bound id was captured, DO NOT SCHEDULE at all (and log it) — the same posture applyMobilize takes
  when `ctx.defenderId` is absent. A no-op sacrifice is worse than an unmodeled card.
- The runtime pins must cover BOTH shapes end to end: a stolen creature really returning/being sacrificed,
  AND a created token really leaving. Assert the permanent is GONE, not merely that the trigger fired.
- Pin the negative too: a card whose immediate clause binds nothing must stay non-native.


**RE-MEASURED 2026-07-27: SIX cards, not 48** (Hungry for More, Krovikan Elementalist, Deathknell Kami,
The Fire Crystal, Tidal Wave, Footsteps of the Goryo). The 48 counted the SHAPE — how many cards print
"sacrifice it at the beginning of the next end step" — not how many would actually flip. 107 of them are
blocked by other text, and a further chunk went native when mobilize shipped (slice 31), since the mobilize
reminder text contains that very phrase.

**This is precisely the mistake the runbook now warns about**, made by me, in my own ledger entry: a grouped
count says a shape exists, not that fixing it flips anything. Six cards against a failure mode where a
missed binding means the player KEEPS a stolen creature or token forever is a poor trade — the design below
is still correct, the yield is not what it claimed.

---

## MAPPED — the GY-1 graveyard self-recursion lane: 36 cards behind COST VOCABULARY

Investigated 2026-07-25. The lane itself is FINE and end-to-end (`parseGraveyardSelfRecursion` is the
single source for the offer, the payment and the metric). Clean forms already classify native-activated:
`{1}{B}: Return this card from your graveyard to the battlefield tapped.` works today.

**⚠️ DO NOT TRUST A LINE-DELETION PROBE HERE.** Deleting the recursion line and re-classifying reports ~60
flips, but that conflates two different cards: ones whose LINE is unparseable, and ones whose line is fine
while the REST of the card is unmodeled (The Sound of Drums parses its line perfectly and parks on goad +
double-damage). The honest measure — "the line fails the GY-1 parse AND the card would be native with a
clean line" — is **36**.

**What actually blocks them is the COST vocabulary, not the effect.** GY-1 accepts mana-only plus a bare
`, discard N cards` rider. The corpus wants more:

| blocker | cards | example |
|---|---|---|
| non-mana cost: sacrifice N of a type | 5 | Gangrenous Goliath (`{2}{B}, Sacrifice three Zombies`) |

**⚠️ THE SACRIFICE-COST ROW IS A TRAP — BUILT, MEASURED AT ZERO, AND REVERTED (2026-07-25).** I implemented
the N=1 type forms across all three sites and verified it end to end (no victim → not offered; with a
victim → offered, the victim sacrificed, the card returned). It flipped **ZERO cards**: every carrier is
blocked by OTHER text as well — Necrosavant by "Activate only as a sorcery", Tymaret / Earthquake Dragon /
Grafted Butcher by further abilities. Reverted rather than kept, because working-but-unused capability is
still speculative surface. **Before building any row in this table, delete-probe the carriers to confirm the
COST is their only blocker** — the row counts say a cost shape appears, not that fixing it flips anything.
The exile row (GR-2) was worth it only because Scrapheap Scrounger had no second blocker.
| non-mana cost: exile N cards from your graveyard | 4 | Scrapheap Scrounger, Despoiler of Souls |
| `Activate only during your upkeep` | 2 | Eternal Dragon, Undead Gladiator |
| `Activate only as a sorcery` | 2 | Summoned Dromedary, Deathless Behemoth |
| an effect rider (enters with counters, gains an ability) | 2 | Retrofitted Transmogrant, Llanowar Greenwidow |

**⚠️ BOTH TIMING RIDERS ARE UNSAFE HERE — and I got this wrong once before checking, so read the code.**
`actionsActivateGraveyardRecursion` offers at INSTANT SPEED (its own comment: "an activated ability may be
activated whenever the player has priority — no timing rider is in the modeled shape"). It is NOT restricted
to the controller's own main phase the way the battlefield activated-ability path is. So crediting EITHER
"Activate only during your upkeep" OR "Activate only as a sorcery" would let the engine use the ability at a
time the card forbids — an over-offer, the forbidden direction. My first pass through this assumed the
own-main window and concluded the sorcery rider was free; it is not. Teaching the enumerator a timing gate
is a prerequisite for both, and it is its own slice.

**Suggested order:** the exile-from-graveyard cost first — census slice 33 just built that exact cost kind
for the SPELL additional-cost lane, so the vocabulary and its victim-selection policy already exist and
only need porting to the activated-cost parser.

---

## SCOPED — DETHRONE (CR 702.104), 5 sole blockers, with one real design question

"Dethrone (Whenever this creature attacks the player with the most life or tied for most life, put a +1/+1
counter on it.)" The keyword's ability is entirely in reminder parens, so it synthesizes like renown /
mobilize / backup — three precedents built 2026-07-25, all straightforward.

**What is missing is a life-comparison vocabulary.** The engine has no "player with the most life" predicate
today; `triggers.js` deliberately leaves the equipment rider "attacks the player with the most life"
(Seraphic Greatsword) UNDETECTED as a safe FN. The comparison itself is trivial — `ctx.defenderId` is
threaded on the attacks event and life totals are on the players — so the work is small.

**⚠️ THE DESIGN QUESTION, and the reason this was not built on sight: WHEN is the condition evaluated?**
Dethrone's life check is part of the TRIGGER CONDITION (CR 603.2 — it is checked as the attack is declared),
not part of the effect. So:

- Putting the check inside the ATOM (the renown/monstrosity pattern, where a latch lives in the resolver)
  evaluates it at RESOLUTION. If a life total changes between declare-attackers and resolution, the engine
  gets it wrong — the trigger should already have fired or not.
- Putting it in an INTERVENING-IF is also wrong: an intervening-if is re-checked at resolution by design,
  which is the same divergence.
- The correct home is the FIRE decision — gate it in `checkAttackTriggers`, where the defender is known and
  the attack has just been declared.

That is a different shape from the three keyword syntheses shipped today, which is why it wants a fresh
head rather than a tired pattern-match. Everything else about it is routine.

---

## SCOPED — two census targets with SEVERE failure modes (do not rush either)

Both examined 2026-07-27. Each is a real slice; each fails dangerously if half-built, which is why they were
banked rather than started at the tail of a long session.

### 1. Self damage-prevention with a counter cost — the PHANTOM cycle (6 sole, 1 co)

"If damage would be dealt to this creature, prevent that damage. Remove a +1/+1 counter from this creature."
(Phantom Nantuko, Phantom Tiger, Phantom Centaur…)

The engine HAS damage prevention, but not this shape: `combatEvasion.attachedDamagePrevention(state, permId)`
covers the AURA form (Gaseous Form on a host) and `prevent-next-damage` covers one-shot floating shields.
Phantom is the SELF form, continuous, and it PAYS A COUNTER per instance.

**⚠️ THE FP: modelling the prevention without the counter decrement makes the creature INVULNERABLE FOREVER.**
Both halves are mandatory, plus the exhaustion case — when the counters run out the damage applies normally,
and these bodies are printed 0/0, so the creature then dies to the lethal SBA. A build that prevents but
never decrements is strictly better than printed, which is the forbidden direction. Pin the exhaustion path
first, before the prevention path.

### 2. Shuffle-into-library instead of the graveyard (5 sole, 0 co)

"If <NAME> would be put into a graveyard from anywhere, reveal <NAME> and shuffle it into its owner's
library." (Darksteel Colossus, Progenitus, Legacy Weapon, Nexus of Fate…)

There is NO general zone-replacement lane. gameState has replacements for DESTROY (totem armor, shield
counters) but nothing intercepting a move to the graveyard, so this means instrumenting `moveCardToZone` —
the chokepoint every zone change in the engine funnels through.

**Blast radius is the whole problem**: five cards against a hook on the hottest path in the state layer. If
it is built, gate it as narrowly as possible (self-reference only, graveyard destination only) and diff the
runtime fingerprint, not just the tier fingerprint — a mistake here changes where EVERY card goes when it
dies, and the metric would not see it.

---

## ✅ NEGATIVE RESULT — the `native-activated` tier shows NO over-claim (checked 2026-07-27)

After the `native-mana` correction found 154 cards the engine could not actually produce mana for, the
obvious next question was whether the ACTIVATED tier had the same disease: is a card tiered
native-activated actually OFFERED at runtime? Checked 401 of them by driving each on a board.

**Answer: no.** Two rounds of probing, and every apparent hit was a defect in MY BOARD, not the tier:

| first board (92 "hits") | second board (49 "hits") |
|---|---|
| one land per colour → `{U}{U}{U}` unaffordable | counterspells need a SPELL ON THE STACK (empty) |
| empty hand → discard costs unpayable | "Enchanted creature has …" are AURAS, left UNATTACHED |
| empty graveyard → graveyard-targeting costs dead | graveyard-recursion abilities, put on the BATTLEFIELD |
| only basics → "destroy target nonbasic land" dead | "target attacking creature" with no combat |
| no colorless/snow source | "remove a fade counter" with no counters |

**The lesson is the instrument, again.** Both rounds produced a confident-looking number that meant nothing.
This is the third time in two days that a probe's premise, not the engine, was the thing at fault — the
mana measurement, the bound-referent count, and now this. **A probe that reports a big number is a claim
about the probe until each hit is explained individually.**

Do not re-run this without also supplying: a spell on the stack, attached auras, cards in the graveyard AND
the card itself in the graveyard for GY abilities, an attacking creature, and the relevant counters.

---

## 🚧 SCOPED, NOT BUILT — "You control enchanted creature" (28 cards: 7 sole + 21 co)

The biggest single cluster left in the census, and it is a SUBSYSTEM, not a parser slice. Recording the
reason so the next seat doesn't rediscover it by shipping a bug.

The engine has a one-shot `gain-control` atom (`effects/atoms/control.js`, Sliver Overlord's activated
ability). It does NOT have layer-2 control (CR 613.1b). Those are not the same thing, and the difference is
exactly where the false positive lives:

- **One-shot** "Gain control of target creature" — control changes and simply stays changed. Modeling this
  by reassigning the permanent is fine, because nothing is supposed to give it back.
- **Static** "You control enchanted creature" (Mind Control / Control Magic / Confiscate) — control is a
  CONTINUOUS effect that exists only while the Aura is attached. Kill the Aura and the creature goes home.

Reusing the one-shot atom for the static shape would therefore produce **permanent control theft**: destroy
the Mind Control and the engine keeps the creature. That is a worse outcome than leaving all 28 cards on the
Arbiter, so they stay there until layer 2 exists.

**What it actually needs:** a controller-override in the layer engine (there is currently no
`controlledBy` / `controllerOverride` field on a permanent — checked), recomputed like any other continuous
effect, so detaching the Aura restores the printed controller with no explicit "give it back" step. Sizeable
but well-defined, and it would also unlock the "gain control until end of turn" (Threaten) family.

**Do not** approach this by moving permanents between battlefields.

---

## ✅ BUILT (was REFUSED, same day) — unleash (17 carriers, +11) — the sharp edge of the optional-mode family

Slice 48/49 credited a family of keywords on one rule: the keyword offers an OPTION the engine never takes,
and declining it leaves a real, complete, legal play (delve, myriad, replicate, fuse, squad, enlist, extort).
Unleash sits right beside them in the census and looks identical. It is not, and the difference is worth
writing down because it is the line the whole family depends on.

> **Unleash** (CR 702.86a) — "You may have this creature enter with a +1/+1 counter on it. **It can't block
> as long as it has a +1/+1 counter on it.**"

The first sentence is an option in the family's sense. The second is a REAL CONDITIONAL STATIC. Declining the
entry counter is faithful only for as long as the creature never gains a +1/+1 counter from anywhere else —
an anthem, a counter effect, another card's trigger, its own other text. The moment one arrives, the printed
card can no longer block and a credited card still would. **That is the false-positive direction: a creature
blocking when the card says it cannot.**

**The test for membership in this family, stated once:** the option must be one the player may decline *with
no consequence to the rest of the card*. If the unpaid/undeclined state still leaves a rider that can bite
later, the keyword needs a lane that models it, not a credit.

**What it would take:** model "can't block as long as it has a +1/+1 counter" as a counter-gated block
restriction. The machinery exists — the counter-gated group keyword grant (Winged Hive Tyrant) is the same
shape — so this is a real slice, not a subsystem. It just is not a free one, and must not be taken as one.

**RESOLVED the same session (slice 50).** The refusal above was right, and the fix was to build the
enforcement rather than widen the credit. `canBlockAttacker` now reads the permanent's `+1/+1` counters LIVE
at block declaration, so the restriction binds no matter where the counter came from — which is precisely the
case that made a free credit unsafe. A flag stamped at entry would have passed the easy tests and still been
wrong, because the engine never takes unleash's own entry option: every counter an unleash creature carries
here arrives from somewhere else.

Unleash is therefore native for the OPPOSITE reason to the rest of the family: not because the option is
untaken, but because the static is enforced. The membership test above still stands unchanged, and `outlast`
is now the standing example of a keyword that fails it with no enforcement to fall back on.


---

## 🔎 SYSTEMIC LEAD — the TIER COMPOSITION failure (62 cards, root cause identified 2026-07-27)

The census's "TWO-FLIP SIGNATURE" bucket is not a pile of missing mechanics. It is ONE bug, and it is now
diagnosed rather than merely counted.

**The rule that's wrong:** a card carrying BOTH a triggered ability and an activated ability classifies
`body-only` — even when each ability is individually fully modeled. The tiers behave as mutually exclusive
where they should COMPOSE.

**Evidence** (classify each line alone, then the card without it — `scratchpad/probe-twoflip.mjs`):

| card | line alone | other line alone | whole card |
|---|---|---|---|
| Haunted Dead | `native-trigger` | `native-activated` | **`body-only`** |
| Teacher's Pest | `native-trigger` | `native-activated` | **`body-only`** |
| Postmortem Professor | `native-trigger` | `native-activated` | **`body-only`** |
| Compulsory Rest | `native-aura` | `native-activated` | **`body-only`** |
| Mark of Fury | `native-aura` | `native-trigger` | **`body-only`** |

That is the whole signature: every pair is two DIFFERENT native tiers meeting on one card.

**Why this is worth real care rather than a quick fix.** The tiers are not just labels — each one is a
claim about which runtime lane plays the card. Letting them compose means asserting that BOTH lanes fire
for the same permanent, and that is a runtime question, not a classifier one. The dangerous version of this
fix is a one-line change to the tier resolver that makes 62 cards go green while the engine only ever runs
one of the two abilities. That would be a textbook false positive — a card claimed native whose trigger (or
whose activated ability) silently never happens.

**So the order of work is fixed, and it is not negotiable:**
1. Prove at the RUNTIME that a single permanent can carry a modeled trigger AND a modeled activated ability,
   and that both actually fire/are offered. Drive a board; do not read the parser.
2. Only then relax the composition rule, and only for the pairs proven in step 1.
3. Per-flip audit the resulting cards — 62 is far too many to eyeball as a batch.

Nothing about this is hard. It is just the exact shape of bug where "it went green" is the least
trustworthy signal available.
