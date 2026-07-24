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

| Lever | Carriers | Shape |
|---|---|---|
| Counter-proofing | Vexing Shusher, Hexing Squelcher, Veil of Summer | "can't be countered" (self and/or granted) + Ward-grant |
| Cast-as-though-flash | Valley Floodcaller, Borne Upon a Wind | Temporary flash grant to a spell class |
| Redirect a stack object | Deflecting Swat, Flare of Duplication (Chain of Vapor shares the shape but is parked — see below) | "Choose new targets for target spell/ability" already on the stack |
| Excess-damage payoff | Contest of Claws, Hell to Pay | A derived "damage beyond lethal" metric feeding discover/Treasure |

## BUILD

Grouped where a lever covers more than one card; otherwise one row each.

- **Contest of Claws, Hell to Pay** — excess-damage metric + discover(X)/Treasure-count payoff.
- **Vexing Shusher, Hexing Squelcher, Veil of Summer** — counter-proofing (self + grant).
- **Valley Floodcaller, Borne Upon a Wind** — cast-as-flash grant.
- **Deflecting Swat, Flare of Duplication** — redirect-target-of-a-stack-object.
- **Mondrak, Glory Dominus** — token-doubler registration; doublers are an established, tracked class
  (`doublerProfile`/`isPureDoubler` per `runtime-fingerprint.mjs`'s own header) — likely quick, a
  registration more than new architecture. Directly serves the slice manifest's token-copies lever
  (215 cards corpus-wide).
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
- **Thunderfoot Baloth** — "Lieutenant" ability word (commander-conditional static buff class).
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
- **For the Ancestors** — flashback already modeled (a runtime capability per the 07-17 census);
  gap is the type-filtered multi-reveal impulse-dig.
- **Mayhem Devil** — any-player (not just self) sacrifice-triggered ping.
- **Unbound Flourishing** — an X-value doubler variant (distinct from counter/mana doublers) + a
  copy-a-spell/ability-with-X trigger.
- **Nev, the Practical Dean** — counters-present-gated group grant + once-per-turn X-tracking
  trigger.
- **Kozilek, Butcher of Truth** — cast-trigger draw (not a resolve-trigger) + Annihilator + an
  anywhere-to-graveyard shuffle-back trigger; three real pieces, sizable as one card.

## INTERACTION (Phase 2, greenlit — tutors / counterspells / wheels)

- **Gamble** — tutor + random-discard composition. **Diagnosed in full tonight, not built.** Both
  sub-clauses (tutor-to-hand, discard-at-random) parse HIGH-confidence individually
  (`parseEffectClause` on each in isolation returns a clean single atom); the combined sentence
  parses as one unrecognized run-on — `splitClauses` doesn't split it, and `tutorClauseParser`'s
  regex is end-anchored on "...into your hand, then shuffle," which the interposed discard clause
  breaks. The actual fix lives inside `atoms/library.js` / `parser.js` — the single most sensitive
  file in the codebase, where a change needs a whole-corpus `program-fingerprint` diff, not just a
  tier diff, to rule out a silent false-positive elsewhere. Deliberately not attempted at this hour
  without that full verification harness carefully re-checked; queued as a clean, well-specified
  next slice — the hard diagnostic work is already done.
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
