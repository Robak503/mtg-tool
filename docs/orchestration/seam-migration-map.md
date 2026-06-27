# Seam migration map — parseExtendedAtom → CLAUSE_PARSERS (recon 2026-06-26)

> Built by a 4-agent read-only recon fan-out (evidence-quoted). The autonomous loop executes this top-down;
> **every batch is still gated `program-fingerprint` byte-identical** (line numbers here are a planning aid — the
> serial pass re-reads each branch before extracting, and the gate is the truth). Line numbers are as of master
> ~`8beefd8` and drift as batches land; re-grep `op: "<op>"` each batch. Done batches: explore · proliferate ·
> gain-experience · count-source-leaf · earthbend.

## Execution order (readiness-ranked)

### Wave A — CLEAN singletons/groups (no shared-helper, anchored, low overlap). Batch by resolver module.
| batch | ops | module | deps | notes |
|---|---|---|---|---|
| ✅A1 | discover · shuffle · scry · surveil | atoms/library.js | local-var/parseInt only | DONE batch 6 `d45aaa4`, program-diff=0 |
| ✅A2 | regenerate · untap · cant-block · tap | atoms/combat.js | tap: local-var; rest none | DONE batch 7 `fb7b5a4`, program-diff=0 |
| ✅A3 | fog · divide-damage | atoms/misc.js | divide-damage: local-var+parseInt | DONE batch 8 `11d4b68`, program-diff=0 |
| ✅A4 | self-attach · attach-to-self | atoms/stack.js | attach-to-self: local-var | DONE batch 9 `79cd743`, program-diff=0 (fall-through preserved via return-null) |
| ✅A5 | tuck | atoms/zones.js | local-var | DONE batch 10 `7167e70`, program-diff=0 |
| ✅A6 | mill | atoms/library.js | NUM_WORD (leaf) | DONE batch 11 `2560c6e`, program-diff=0 |
| ⏸️A7 | counter | atoms/stack.js | local-var (mv/sc/scx) | **DEFERRED — needs order-handling** (batch 12 attempt reverted; program-diff=16). The 8 bare `^counter…$` branches are entangled with rider-folding in the DISPATCH (`matchCounterControllerRider` + `exileInstead` detection) that strips the trailing sentence BEFORE the bare anchor matches then re-attaches `controllerRider`/`exileInstead` to the atom (Swan Song, Strix Serenade, An Offer You Can't Refuse, Deny Existence). Extracting only the bare branches → those riders' clauses fail the `$` → 16 cards drop to low. To migrate: move the rider-folding machinery WITH counter (or have the dispatch feed the clause parser the rider-stripped clause + re-attach). A dedicated batch, not a clean lift. |

### Wave B — HELPER-LEAF extractions first, THEN the family (each its own gated batch).
- **B1: ✅ DONE.** parseGrantedKeywords → leaf (batch 12b `7bd7820`) + **✅ pump → atoms/combat.pumpClauseParser
  (batch 12c `483f0ac`, program-diff=0)** — 14 returns / 7 interleaved clusters, the single largest monolith chunk;
  no dispatch-wrapper entanglement (unlike counter), clean byte-identical lift.
- **B2: ✅ DONE.** B2a tutor-helpers (`parseTutorFilter`+`parseTutorMv`+`BASIC_LAND_SUBTYPES`+`UP_TO_N_WORD`) → parseHelpers leaf (batch 12d `beb5cfc`); B2b **tutor → atoms/library.tutorClauseParser** (batch 12e `d0f2890`, program-diff=0) — 6 contiguous ordered blocks tm/ttm/bfm/mf/spm/lfh, first-match order preserved inside the parser; clean byte-identical lift (the regex-matched-but-rejected `return null` cases preserve the inline fall-through, like A4 attach). parser.js-local `parseTutorMv`/`BASIC_LAND_SUBTYPES`/`UP_TO_N_WORD` imports dropped (now only in tutorClauseParser); `parseTutorFilter` kept (still used by the rd reveal-dig block). **Wave B COMPLETE.**

### Wave C — INTERLEAVED families needing parseCountSource (already in leaf) + careful surgical pull.
- ✅ **animate** (atoms/combat.animateClauseParser; batch 14 `1daa5ef`, program-diff=0) — 2 adjacent blocks (anm target-land + anmSelf man-land self-animate), order preserved; inline COLOR_WORDS/COLOR_MAP/capHyphen travel with them; parseGrantedKeywords from leaf. parser.js dropped the now-unused parseGrantedKeywords import (only atoms/combat uses it: pump + animate).
- ✅ **deal-damage** (atoms/stack.dealDamageScaledClauseParser; batch 15 `0bac6f5`, program-diff=0) — DMG-SCALE board-count branch only ("… deals damage to … equal to the number of …", parseCountSource leaf imported into stack.js); the printed "N damage" form stays on legacyToAtom. Order-safe: moving DMG-SCALE past the FOR-EACH block changed nothing (gate-verified).
- ✅ **return-from-graveyard ⇄ reanimate** (atoms/zones.graveyardReturnClauseParser; batch 16 `6dc6022`, program-diff=0) — CO-EXTRACTED the shared-`^return target … from your graveyard`-prefix pair (to-hand then to-battlefield, order preserved); parseGraveyardFilter moved to zones.js from spellEffects (leaf-safe) + dropped from parser.js.
- ✅ **gain-life ⇄ lose-life** (atoms/life.lifeClauseParser; batch 17 `fe9fb06`, program-diff=0) — CO-EXTRACTED both clusters into one parser (scaled for-each [parseCountSource leaf] + fixed-N, original first-match order). The draw for-each branches stay inline (disjoint "draw …" anchor). parseCountSource imported into life.js; the first life branch's `let m` became `let m;` so the counter branches keep their declaration.
- **draw** (misc.js; MOST scattered 552-1429; parseCountSource+NUM_WORD; 3 clusters incl. combat-damage + for-each + each-player) — co-handle with discard's each-player block.
- **discard** (hand.js; 1440-1455; NUM_WORD; interleaved w/ draw each-player above).
- ✅ **rad** (atoms/counters.radClauseParser; batch 13 `2c0e967`, program-diff=0) — pulled ONLY the contiguous player-grant block (each/you/target "gets N rad counters", SMALL_NUM leaf). The cdmg (who:damagedPlayer) + dies (power-scaled) rad variants STAY inline with the CDMG-PLAYER-PAYOFF family (disjoint they/that-player anchor → no collision; deferred to a future cdmg/dies-payoff family batch).
- **add-counter** (counters.js; 5 +1/+1 branches 1233-1277; SMALL_NUM; interleaved w/ bounce/sacrifice/pump/regen).
- 🟡 **sacrifice** (removal.js; no shared helper; 2 far regions). ✅ EDICTS region → atoms/removal.sacrificeEdictClauseParser (batch 21 `b66e7e8`, program-diff=0 — target/each-player/each-opponent, the last matchers in parseExtendedAtom). ⏳ REMAINING: self ("sacrifice this creature") + triggering ("sacrifice the triggering creature") — non-contiguous mid-function pair, a later batch (co-extract or one-each).
- **destroy + exile** (removal.js; SHARE the `^(destroy|exile) target …` regex @993-1005 emitting both via rm[1] → CO-EXTRACT; plus mass forms destroy 1128/1137, exile 956/1129; local TT maps).
- ✅ **create-named-token** (atoms/tokens.createNamedTokenClauseParser; batch 18 `6c4b25e`, program-diff=0) — the contiguous Treasure/Clue/Food/Gold family (6 matchers: dynamic-X / for-each / that-many / dies-power / fixed-N / investigate, dynamic-count before fixed-N, order preserved; parseCountSource+SMALL_NUM+NUM_WORD leaf imported into tokens.js).
- ✅ **token-helper leaf** (batch 19 `946319f`, program-diff=0) — parseTokenManaAbility + parseTokenKeywords (+ TOKEN_MANA_ABILITY / canonicalizeManaAbility / TOKEN_KEYWORD_CANON) moved parser.js → parseHelpers leaf; parser.js dropped its now-unused keywords.js import. **create-token now UNBLOCKED.**
- ✅ **create-token** (atoms/tokens.createTokenClauseParser; batch 20 `45c0206`, program-diff=0) — vanilla creature-token family (for-each mtf + fixed-N m w/ the quoted-mana-ability / keyword "with" slot), order preserved; toughness<1 + land guards + quote-vs-keyword split travel; leaf helpers (incl. parseTokenManaAbility/parseTokenKeywords). parseTokenManaAbility import dropped from parser.js.

### Wave D — OUT OF parseExtendedAtom scope (standalone up-front matchers, different `{atom,rest}` shape). Defer — separate seam.
- **impulse-dig** (`matchImpulseDig` ~1829; DIG_NUM local + parseTutorFilter) · **discard-chosen** (`matchHandDisruption` ~1716; HAND_FILTER_MAP) · **create-emblem** (`matchEmblem` ~1957; emblemAbilityModeled + stripReminder). Each is a whole-helper relocation, not an if/else lift.

## Couplings (MUST move together)
- destroy ⇄ exile (one regex emits both). · return-from-graveyard ⇄ reanimate (shared prefix). · gain-life ⇄ lose-life (interleaved clusters). · draw ⇄ discard each-player block.

## After Wave A+B+C the if/else chain is largely drained → re-measure parseExtendedAtom; remaining residue + the legacyToAtom path are the tail. Then Phase 2 (prove one coverage wave).
