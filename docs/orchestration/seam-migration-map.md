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
- **B1: ✅ `parseGrantedKeywords` → parseHelpers leaf DONE (batch 12b `7bd7820`, program-diff=0).** **NEXT: pump** →
  atoms/combat.js (uses parseGrantedKeywords[leaf] + parseCountSource[leaf] for OVERRUN-X). pump = MOST fragmented
  (14 branches ~1025-1213 now, re-grep — interleaved w/ cant-block/animate/destroy/bounce/add-counter) — extract
  ONLY op:"pump" returns; keep the variant order (target/eachCreature/youControl/self/thatCreature). Highest-risk
  Wave-B migration — the gate is the safety net (counter already proved it catches entanglement).
- **B2: `parseTutorFilter`+`parseTutorMv`+`BASIC_LAND_SUBTYPES`+`UP_TO_N_WORD` → leaf** (parser.js-local; shared w/ impulse-dig), then **tutor** (atoms/library.js; contiguous 680-812; overlap-possible: tm/ttm/bfm share `^search your library for a…` prefix, first-match-wins ORDER load-bearing → keep block order tm,ttm,bfm,mf,spm,lfh).

### Wave C — INTERLEAVED families needing parseCountSource (already in leaf) + careful surgical pull.
- **animate** (combat.js; 2 adjacent blocks 1085-1120; parseGrantedKeywords[B1] + inline COLOR_MAP) — after B1.
- **deal-damage** (stack.js; DMG-SCALE board-count 592-607; parseCountSource; standard "N damage" stays via legacyToAtom — leave it).
- **return-from-graveyard + reanimate** (zones.js; 916-926; share `^return target … from graveyard` prefix → CO-EXTRACT both; parseGraveyardFilter from spellEffects.js, importable).
- **lose-life + gain-life** (life.js; scaled[parseCountSource]+fixed-N clusters at 644-667 & 828-847; gain/lose interleave each other → CO-EXTRACT the life family together).
- **draw** (misc.js; MOST scattered 552-1429; parseCountSource+NUM_WORD; 3 clusters incl. combat-damage + for-each + each-player) — co-handle with discard's each-player block.
- **discard** (hand.js; 1440-1455; NUM_WORD; interleaved w/ draw each-player above).
- **rad** (counters.js; player-grant block 531/533/535 clean; cdmg 559/562 + dies 581 variants belong to a future cdmg/dies-payoff family — pull ONLY the contiguous player-grant block per ledger; SMALL_NUM[leaf]).
- **add-counter** (counters.js; 5 +1/+1 branches 1233-1277; SMALL_NUM; interleaved w/ bounce/sacrifice/pump/regen).
- **sacrifice** (removal.js; self 1208 + triggering 1231 + EDICTS 1467-1485; no shared helper; 2 far regions).
- **destroy + exile** (removal.js; SHARE the `^(destroy|exile) target …` regex @993-1005 emitting both via rm[1] → CO-EXTRACT; plus mass forms destroy 1128/1137, exile 956/1129; local TT maps).
- **create-named-token** (tokens.js; contiguous 1278-1338; parseCountSource+SMALL_NUM+NUM_WORD; order matters — dynamic-count anchors before fixed-N).
- **create-token** (tokens.js; 1361-1393; parseCountSource+SMALL_NUM+parseTokenManaAbility+parseTokenKeywords; inline toughness<1 & land guards must travel).

### Wave D — OUT OF parseExtendedAtom scope (standalone up-front matchers, different `{atom,rest}` shape). Defer — separate seam.
- **impulse-dig** (`matchImpulseDig` ~1829; DIG_NUM local + parseTutorFilter) · **discard-chosen** (`matchHandDisruption` ~1716; HAND_FILTER_MAP) · **create-emblem** (`matchEmblem` ~1957; emblemAbilityModeled + stripReminder). Each is a whole-helper relocation, not an if/else lift.

## Couplings (MUST move together)
- destroy ⇄ exile (one regex emits both). · return-from-graveyard ⇄ reanimate (shared prefix). · gain-life ⇄ lose-life (interleaved clusters). · draw ⇄ discard each-player block.

## After Wave A+B+C the if/else chain is largely drained → re-measure parseExtendedAtom; remaining residue + the legacyToAtom path are the tail. Then Phase 2 (prove one coverage wave).
