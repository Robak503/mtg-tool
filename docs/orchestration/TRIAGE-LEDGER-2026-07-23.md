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
  now fixed; staticAbilityParser.js's GATED-SELFBUFF family for the continuous form, still needs its
  own equivalent "commander" special-case). Real, precisely scoped next slice.
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
- **Mayhem Devil** — any-player (not just self) sacrifice-triggered ping.
- **Unbound Flourishing** — an X-value doubler variant (distinct from counter/mana doublers) + a
  copy-a-spell/ability-with-X trigger.
- **Nev, the Practical Dean** — counters-present-gated group grant + once-per-turn X-tracking
  trigger.
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

## INTERACTION (Phase 2, greenlit — tutors / counterspells / wheels)

- **Gamble — BUILT tonight (`c98bd172`).** Diagnosed the composition gap (both sub-clauses parse
  HIGH individually; the combined sentence failed because `splitClauses` kept it whole and the
  tutor matchers are end-anchored past the interposed discard clause), then fixed it: a narrow
  `splitClauses` rule excises the interposed "discard a card at random" and reattaches "then
  shuffle" to the tutor half, so each half takes its own already-modeled path unmodified. Verified
  with a whole-corpus `program-fingerprint` diff (34,245 cards, exactly one line changed) — the
  full rigor this file demands, not skipped. Flip-diff GAINED=1/LOST=0; corpus 11459→11460; the cdh
  (Rograkh/Thrasios) deck 80%→81%. Pinned in `splitClauses.test.js`.
- **Vibrance, Sowing Mycospawn** — tutor-shaped (auto-tagged by the slice manifest's pattern match;
  not independently re-verified against oracle text tonight — re-check before building).
- **Pact of Negation, Mana Drain** — counterspell-shaped (auto-tagged; same caveat).
- **Land Tax** — conditional-upkeep multi-basic-fetch-to-hand; tutor-adjacent in spirit but the
  manifest's pattern match didn't catch it (the phrasing isn't "search your library for a/an ...
  card"). Same family, worth building alongside the tagged tutors.

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
