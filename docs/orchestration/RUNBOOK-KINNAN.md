# RUNBOOK — KINNAN MANA OVERLOAD to 85 (75/100 · 25 non-native · needs 10)

> Umbrella: [POD-SIM-THREE-DECKS.md](POD-SIM-THREE-DECKS.md). cEDH by the code's CEDH_DEFAULT_IDS. Measured
> 2026-09-05; every card below dumped with its REAL oracle and live tier; every sizing probed the same day.

---

## 0. THE DECK IN ONE PARAGRAPH (what the pod sim must be able to do)

Kinnan doubles every nonland mana source and makes big mana turn two; the deck converts that into either a
Thassa's Oracle win (Kinnan's own activation digs it), a Tezzeret / Transmute Artifact toolbox, or a copy pile
(Clever Impersonator, Copy Enchantment, Flash Photography, Imposter Mech, The Mycosynth Gardens) on the best
thing in play. Kinnan himself is ALREADY native-mixed and the mana rocks are native (Lotus Petal, Chrome Mox,
Mox Diamond, Mana Vault, Sol Ring, LED all native-mana; Mana Crypt is body-only — a corpus item, not this deck's).
**Plan-critical:** Thassa's Oracle and the copy family. A sim where Kinnan ramps into nothing is not this deck.

## 1. THE 25 NON-NATIVE CARDS — sized

### 1a. The win and the copy family (seams S-A, S-C · plan-critical)

| # | Card | Oracle gist | Blocker (probed) | Size | CREED note |
|---|---|---|---|---|---|
| K1 | **Thassa's Oracle** | ✅ DONE 2026-09-05 (KN-1): the three sentences fold into ONE `devotion-dig-win` atom because they share X — read at RESOLUTION (CR 608.2c) through the existing devotion count (hybrid pips count, the Oracle's own {U}{U} included); X ≥ library → the win-game stamp (CR 104.2a), look skipped; else the impulse-dig pause with a new TOP destination (the pick stays on top, the rest bottom in the mover's seeded random order) and a decline for "up to one" | **M** | pinned: devotion 4 over six cards = four candidates, pick on top, three under the untouched two; decline bottoms all four; devotion 4 over three = win, no pause; ⭐ LIVE X — a two-pip permanent arriving after the trigger and before resolution turns a look into a win (the stale-X FP, seen to fail); the Oracle gone in response: X = 0 still wins an EMPTY library (0 ≥ 0, the Consultation line) and looks at nothing over one card |
| K2 | **Clever Impersonator** | ✅ DONE 2026-09-05 (KN-2): the clone head admits "any nonland permanent on the battlefield" (scope `anyNonlandPermanent`); one shared copiability reader for the enumerator AND the settle — creature / artifact / enchantment / planeswalker / battle, never a land, never an Aura (no attach choice on entry, CR 303.4f) or a Saga (no lore counter on entry, CR 714.2) | **M** | pinned: the pause offers exactly the four nonland non-Aura non-Saga permanents; entering as the opponent's Sol Ring the creature card BECOMES an artifact; entering as their anthem MY bear is 3/3; picking the land enters it as itself (a 0/0 that dies) |
| K3 | **Copy Enchantment** | ✅ DONE 2026-09-05 (KN-2): scope `anyEnchantment`, the non-creature clone gate widened for it | **S** | pinned: as a copy of Glorious Anthem my bear is 3/3 and theirs stays 3/3; declining enters as itself (bear 2/2); a wrong pick (the Aura) is refused → enters as itself |
| K4 | **Flash Photography** | ✅ DONE 2026-09-05 (KN-3): the token-copy atom gains a `target permanent` arm (any controller — a token Sol Ring, a token land, a second bear); an Aura or a Saga is never a legal target (no attach choice / no lore counter on the token path — false-negative safe). The card's own "as though it had flash if it targets a permanent you control" line is stripped and NOT honored: sorcery-speed only (documented FN) | **S** | pinned: the offered targets are exactly Ogre, Sol Ring, Island and my bear (no Aura, no Saga); copying their Sol Ring gives ME an artifact token that is not a creature while theirs stays; copying my bear gives a token bear |
| K5 | **Imposter Mech** | ✅ DONE 2026-09-05 (KN-3): the clone head admits "this vehicle" and the `opponentCreature` scope (the enumerator skips your own seat; the settle re-checks controller); the rider "it's a Vehicle artifact with crew N" rewrites the copy's type line to exactly `Artifact — Vehicle` (a non-creature keeps no creature subtypes, CR 205.3d), keeps the creature's P/T, and appends a Crew N line the crew parser reads; "it loses all other card types" is the same rewrite (idempotent); the printed trailing Crew line is stripped before the head match (the normalizer folds the line break) | **M** | pinned: the pause offers only the Ogre; as the Ogre it is a 4/4 `Artifact — Vehicle`, crew 3, NOT a creature, printed name Imposter Mech; picking my own bear is refused and declining enters it as itself |
| K6 | **The Mycosynth Gardens** | {X},{T}: becomes a copy of target nontoken artifact you control with MV X | a land becoming a copy (Shifting Woodland's delirium twin) | **L** | |

### 1b. The cheap fills (S each)

| # | Card | Oracle gist | Blocker (probed) | Size | CREED note |
|---|---|---|---|---|---|
| K7 | **Treasure Vault** | ✅ DONE 2026-09-05 (KN-4): a run of X pips in an activation cost (`{X}{X}`) is modeled — the mana cost carries both pips so the activation lane owes 2X (CR 107.3); the bare "Create X Treasure tokens" reads X off the activation | **S** | pinned: six in the pool offers X = 1..3 at 2/4/6 (never X = 4); X = 2 makes two Treasures and the Vault is sacrificed; one mana funds no X |
| K8 | **Moonsilver Key** | ✅ DONE 2026-09-05 (KN-4): a dedicated tutor-to-hand arm; the artifact group carries a MANA-ABILITY demand (the matcher reads the card's own "…: Add …" line — FN-safe on odd phrasings), the other group is basic land | **S/M** | pinned: the pause offers Sol Ring + Island only — never Swiftfoot Boots, Command Tower (nonbasic) or a creature; the pick lands in hand, the Key is sacrificed |
| K9 | **Cephalid Coliseum** | ✅ DONE 2026-09-05 (KN-4): the mana line was already credited (the ping-land arm); threshold = a new intervening-if arm "N or more cards in your graveyard" read at activation; "Target player draws three cards, then discards three cards" is ONE atom (kept whole past the comma-then splitter) so the SAME chosen player draws and then discards | **S/M** | pinned: not offered at six cards in my graveyard, offered at seven; aimed at the opponent their library −3, graveyard +3, hand unchanged; the land is sacrificed |

### 1c. The bodies with one unmodeled line (M each)

| # | Card | Oracle gist | Blocker (probed) | Size | CREED note |
|---|---|---|---|---|---|
| K10 | **Nezahal, Primal Tide** | lines 1–3 native-mixed; line 4: discard three cards: exile, return tapped at next end step | a discard-three activated cost + a self-blink with a delayed return | **M** | the return is at the NEXT end step (a delayed trigger), not immediate |
| K11 | **Wan Shi Tong, Librarian** | ETB X counters then draw half X (rounded down); opponent searches → counter + draw | an X-ETB with a derived draw; an "opponent searches their library" event (does the tutor path emit one? probe) | **M** | the search event must fire from every tutor atom, or the trigger under-fires (safe) but the card should then NOT be credited for that line |
| K12 | **The Unagi of Kyoshi Island** | Ward—Waterbend {4}; opponent draws second card each turn → you draw two | the draw-two-on-second-draw line is ALREADY native; the miss is Ward—Waterbend (a ward whose payment can tap artifacts/creatures) | **M** | waterbend as a ward cost — probe whether the bend costs exist for wards |
| K13 | **Hullbreaker Horror** | flash; can't be countered; cast trigger: choose up to one — bounce target spell you don't control / bounce target nonland permanent | a cast-trigger with a "choose up to one" modal whose first mode targets a SPELL on the stack (return spell to hand) | **M** | bouncing a spell = removing a stack object to hand |
| K14 | **Gilded Drake** | ETB exchange control with up to one target opponent's creature; sacrifice if no exchange; resolves even if the target is illegal | control exchange (the control seam exists for one-way steals) + the sac-if-not clause + the illegal-target override | **M** | the "still resolves if illegal" line means the sac happens even when the target is gone |
| K15 | **Tezzeret the Seeker** | +1 untap two artifacts; −X artifact tutor onto the battlefield; −5 animate | planeswalker with three abilities (arbiter-pw) | **M/L** | |
| K16 | **Transmute Artifact** | sac an artifact; tutor an artifact; if its MV ≤ the sacrificed MV put it onto the battlefield, else pay the difference or it goes to the graveyard | a sac-then-tutor with an MV comparison and an optional X payment | **M** | |
| K17 | **Mindbreak Trap** | trap alt cost ({0} if an opponent cast 3+ spells); exile any number of target spells | any-number SPELL targets + the trap condition | **M** | shared with Believe it! |
| K18 | **Chain of Vapor** | bounce target nonland permanent; then its controller may sac a land to copy the spell | the bounce is native; the copy-if-sac chain (each player's choice) | **M/L** | |
| K19 | **Endurance** | flash reach; ETB: up to one target player puts their graveyard on the bottom of their library in random order; Evoke—Exile a green card | the graveyard-to-bottom-random atom (S) + S-B card-exile evoke (M) | **M** | the evoke composition pays Subtlety and Solitude too |
| K20 | **Veil of Summer** | three effects (see Turts C5) | **M/L** | shared with Killer Turts |

### 1d. The Ls and the park

| # | Card | Blocker | Size |
|---|---|---|---|
| K21 | **Misdirection** | redirect (S-H) | **L** |
| K22 | **Wandering Archaic // Explore the Vastlands** | opponent-copy-with-tax trigger; the back is a symmetric look-five | **L** |
| K23 | **Hydroelectric Specimen // Laboratory** | redirect-to-self ETB (S-H); the land back is credited (land-partial) | **L** |
| K24 | **Sink into Stupor // Soporific Springs** | "target spell OR nonland permanent an opponent controls" — a spell-or-permanent target union; the land back is credited | **M** |
| K25 | **Gemstone Caverns** | pregame | 🅿 |

---

## 2. THE SLICE PLAN (to 10)

| Slice | Cards | Seam | Expected | Running |
|---|---|---|---|---|
| KN-1 | Thassa's Oracle | S-A devotion count + the look/order/win ETB | ✅ +1 (Kinnan +1, Believe it! +1) | 1 |
| KN-2 | Clever Impersonator · Copy Enchantment | S-C clone widening to nonland permanents / enchantments | ✅ +2 (a copied anthem applies — witnessed) | 3 |
| KN-3 | Flash Photography · Imposter Mech | S-C token-copy-of-permanent + the Vehicle "except" rider | ✅ +3 | 5 |
| KN-4 | Treasure Vault · Moonsilver Key · Cephalid Coliseum | the three S fills | ✅ +7 | 8 |
| KN-5 | Nezahal (line 4) · Wan Shi Tong | discard-three blink with a delayed return; X-ETB derived draw + the search event | +2 | **10** |
| KN-6 (reserve) | Hullbreaker Horror · Gilded Drake · Endurance (S-B) · Sink into Stupor | if any KN slice lands short | +1 each | |

Stop the deck at ≥85. Below the line → the Omnath arbiter list (Tezzeret, Transmute Artifact, Mindbreak Trap,
Chain of Vapor, Veil of Summer, Misdirection, Wandering Archaic, Hydroelectric, Mycosynth Gardens, Unagi's ward,
Gemstone Caverns).

---

## 3. PER-SLICE DISCIPLINE

SHELF-85 §5 in full (see the Killer Turts runbook §3 — identical). Two deck-specific warnings:

- **The copy seam is where hollow credits hide.** A clone that copies a non-creature's TYPE LINE but not its
  abilities classifies native and plays wrong. The witness for KN-2 must copy an anthem (a Glorious Anthem twin)
  and show the team pumped, and copy a mana rock and show the mana offered.
- **Thassa's Oracle's X is read at RESOLUTION** (CR 608.2c). A witness must change devotion between cast and
  resolution (a permanent leaving) and see X follow.

## 4. THE OMNATH HAND-OFF (after 85)

Dump the remaining non-native cards → `memory/orders/arbiter-nuance-queue.md` batch "Pod-sim three — Kinnan,
parked on the Arbiter", one line per card with the blocker and the play nuance (e.g. "Chain of Vapor: bounce the
opposing Rhystic Study in response to Kinnan's activation; never copy it into your own board"). COMMS + sync-brain.
