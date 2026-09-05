# RUNBOOK — BELIEVE IT! to 85 — ✅ AT THE BAR 2026-09-05 (85/100 · was 75/100 · 25 non-native · needed 10; the remaining non-native go to Omnath's Arbiter list now that all three decks are at the bar)

> Umbrella: [POD-SIM-THREE-DECKS.md](POD-SIM-THREE-DECKS.md). cEDH by Colton's word (Satoru Umezawa ninjas,
> Thoracle-Consultation win). Measured 2026-09-05; every card below dumped with its REAL oracle and live tier;
> every sizing probed the same day.

---

## 0. THE DECK IN ONE PARAGRAPH (what the pod sim must be able to do)

A blue-black **ninjutsu** deck whose real win is **Thassa's Oracle + Demonic Consultation / Tainted Pact**
(name a card not in the deck, exile the library, Oracle wins on an empty library). The ninjas (Satoru, the
commander's ninjutsu grants, Moon-Circuit Hacker, Thousand-Faced Shadow, Kaito) are the tempo shell; the free
interaction (Misdirection, Commandeer, Force of Despair, Contagion, Flare of Malice, Subtlety, Mindbreak Trap)
protects the combo turn. Ninjutsu itself is ALREADY native (Ninja of the Deep Hours / Yuriko native-trigger).
**Plan-critical:** Thoracle + Consultation + Tainted Pact. A sim that never wins this way is not this deck.

## 1. THE 25 NON-NATIVE CARDS — sized

### 1a. THE WIN (seams S-A, S-G · plan-critical · build FIRST)

| # | Card | Oracle gist | Blocker (probed) | Size | CREED note |
|---|---|---|---|---|---|
| B1 | **Thassa's Oracle** | (see Kinnan K1) | devotion count kind + the look/order/win ETB | **M** (lands FREE if Kinnan's slice is built first) | X read at resolution |
| B2 | **Demonic Consultation** | ✅ DONE 2026-09-05 (BI-2): ONE atom; the NAME is chosen through the tutor pause in consultation mode — one candidate per DISTINCT library name, declining = a name not in the library (the whole library is exiled: the Thassa's Oracle line); the settle exiles the top six then reveals until the name (to hand), every other revealed card exiled; never a search (no library-search event) | **M** | pinned: nine distinct names offered from a ten-card library; naming the Oracle behind the six exiles seven and puts it in hand with two untouched; declining exiles all ten; naming a card inside the top six exiles everything; an opponent's Wan Shi Tong does not fire |
| B3 | **Tainted Pact** | ✅ DONE 2026-09-05 (BI-2): ONE atom; each exiled card raises a NEW take-or-continue pause (`tainted-pact`, the Sylvan chain's shape — server settle, AI driver branch with a nonland-takes fallback, session apply, hook callback, side-sheet panel); a duplicate name ends the dig with nothing; an empty library ends it quietly | **M** | pinned: continue-continue-take lands the third card in hand with two exiled; the second Alpha ends the dig with nothing taken and the rest untouched; an empty library ends quietly; the AI seat settles the pause by policy (never spins) |

### 1b. The cheap fills (S / S-M)

| # | Card | Oracle gist | Blocker (probed) | Size | CREED note |
|---|---|---|---|---|---|
| B4 | **Sea Gate Restoration // Sea Gate, Reborn** | ✅ DONE 2026-09-05 (BI-3): "draw cards equal to the number of cards in your hand plus one" = the hand count PLUS a constant through the shared scaled-amount reader (the spell itself is on the stack, CR 608.2h); "you have no maximum hand size for the rest of the game" is no longer stripped — the program-level peel appends a FLAG atom that sets a player flag the cleanup step reads (cleanup discard is real now; the old clause-level strip predated it) | **S/M** | pinned: three other cards in hand → draws four; the flag is set; cleanup keeps twelve cards with the flag and would discard six without it; the land back was already whole |
| B5 | **Force of Despair** | ✅ DONE 2026-09-05 (BI-3): "Destroy all creatures that entered this turn" = the mass destroy narrowed by the shared entered-this-turn restriction (the `enteredOnTurn` stamp); the not-your-turn black pitch was already modeled and composes | **S** | pinned: only the two creatures that entered this turn die (mine and theirs), the older two live; castable on the opponent's turn with no mana by exiling a black card, not on my own |
| B6 | **Flare of Malice** | ✅ DONE 2026-09-05 (BI-4): the edict over a creature-or-planeswalker pool, narrowed PER SACRIFICER to their greatest mana value inside the sacrifice chain (tokens are 0, CR 202.3; ties stay the sacrificer's choice — the pause); the sentence is kept whole past the splitter's "and"; the sacrifice-a-nontoken-black-creature alt cost was already modeled and composes | **M** | pinned: with an Ogre (4) and a Jace (4) tied above a Bear (2), the pause offers exactly those two; a lone greatest is forced; the alt cost is offered with no mana when I control a black nontoken creature |
| B7 | **Contagion** | ✅ DONE 2026-09-05 (BI-4): the distribute arm reads ANY P/T counter ("-2/-1") among one or two target creatures of ANY controller; counter deltas are now PER AXIS (every "±a/±b" counter contributes a×n to power and b×n to toughness — the engine only knew ±1/±1), so the counters shrink real creatures; the distribute fallback prefers the opponents' creatures for a harmful counter; the pay-1-life-and-exile-a-black-card pitch composes | **M** | pinned: two -2/-1 counters on their 4/4 make it 0/2; one on each of two creatures; the fallback never picks my own creature for a harmful counter; the pitch is offered with no mana |

### 1c. The ninjas and their riders (M each)

| # | Card | Oracle gist | Blocker (probed) | Size | CREED note |
|---|---|---|---|---|---|
| B8 | **Moon-Circuit Hacker** | ✅ DONE 2026-09-05 (BI-5): the optional draw-then-discard arm accepts an "unless this creature entered this turn" tail; the resolver reads the source's entered-this-turn stamp at resolution and raises the draw alone for a fresh ninja | **S/M** | pinned: a Hacker that entered this turn pauses on the draw alone; one that entered earlier pauses on draw-then-discard |
| B9 | **Thousand-Faced Shadow** | ninjutsu (native); flying; ETB from hand while attacking → token copy of another attacking creature, tapped and attacking | an ETB with a from-zone + attacking intervening-if, minting a token copy that enters ATTACKING (the token-copy-of-creature atom + an enters-attacking rider) | **M** | the token must actually be attacking the same player |
| B10 | **Satoru, the Infiltrator** | ✅ DONE 2026-09-05 (BI-5): a `selfOrOtherCreatureYouControl` enter scope (nontoken) deduped ONCE PER BATCH against the unflushed pending triggers (Satoru prints no once-per-turn rider, so the batch approximation every "one or more … enter" watcher uses was refused by design); the predicate "none of them were cast or no mana was spent to cast them" reads the ENTERING permanent's arrival stamps — `wasCast` (already there) and a new `castForNoMana` threaded from the dispatcher's payment plan through the entry resolver; the trigger splitter did not know the plural "enter" as an event verb and split inside the intervening-if ("…were cast" read as a cast event) — fixed | **M** | pinned: a creature PUT from hand fires it (the ninjutsu shape), a creature cast with mana does not, a free alt-cost cast is stamped and fires; Satoru's own entry fires; a token never; two entries before a flush leave ONE pending trigger and one draw, a third after the flush draws again; the predicate is null with no entering permanent |
| B11 | **Roaming Throne** | ward 2; choose a creature type; is that type; triggered abilities of OTHER creatures of that type trigger an additional time | a trigger multiplier scoped by chosen type (etb/attack/dies multipliers exist per event — a general "triggers an additional time" scoped by subtype) | **M** | |
| B12 | **Ingenious Prodigy** | skulk; enters with X counters (native); upkeep: if it has a counter, may remove one → draw | the optional remove-a-counter-then-draw upkeep (an optional cost-then-effect pause) | **M** | |
| B13 | **Subtlety** | flash flying; ETB: up to one target creature or planeswalker SPELL → its owner puts it on top or bottom of their library; Evoke—Exile a blue card | a spell-targeting ETB that tucks a STACK OBJECT (owner's choice top/bottom) + S-B card-exile evoke | **M** | the evoke composition (S-B) pays Endurance + Solitude too |

### 1d. The Ls and the park

| # | Card | Blocker | Size |
|---|---|---|---|
| B14 | **Misdirection** | redirect (S-H) | **L** |
| B15 | **Commandeer** | gain control of target NONCREATURE SPELL (a stack-object control change; permanents enter under your control) + pitch two blue cards | **L** |
| B16 | **Mindbreak Trap** | any-number spell targets + trap cost (shared with Kinnan) | **M** |
| B17 | **Nanogene Conversion** | each other creature becomes a copy of target creature until EOT, except not legendary | **L** (mass temporary copy) |
| B18 | **Doomsday** | search library AND graveyard for five, exile the rest, order them on top, lose half your life | **L** (a pile policy) — 🅿 |
| B19 | **Lim-Dûl's Vault** | repeat: pay 1 life, bottom five, look at the next five; shuffle, the last five on top in any order | **L** (library ordering) — 🅿 |
| B20 | **Emrakul, the Promised End** | cast trigger: control target opponent during their next turn, then they take an extra turn; cost reduction by card types in graveyard | **L** (control a player) |
| B21 | **Kaito, Bane of Nightmares** | planeswalker with ninjutsu, a conditional creature-ness static, three abilities incl. an emblem | **L** |
| B22 | **Agadeem's Awakening // Undercrypt** | front: mass reanimate creatures with DIFFERENT mana values ≤ X (the land back is credited) | **L** |
| B23 | **Sink into Stupor // Soporific Springs** | spell-or-nonland-permanent target union (shared with Kinnan; the land back is credited) | **M** |
| B24 | **Hydroelectric Specimen // Laboratory** | redirect-to-self (S-H); the land back is credited | **L** |
| B25 | **Gemstone Caverns** | pregame | 🅿 |

---

## 2. THE SLICE PLAN (to 10)

| Slice | Cards | Seam | Expected | Running |
|---|---|---|---|---|
| BI-1 | Thassa's Oracle | S-A (built under Kinnan KN-1 — verify it flips here, +0 cost) | +1 | 1 |
| BI-2 | Demonic Consultation · Tainted Pact | S-G exile-until-named — THE WIN | ✅ +3 | 3 |
| BI-3 | Force of Despair · Sea Gate Restoration | entered-this-turn mass destroy + the not-your-turn pitch gate; hand-count draw + the no-max-hand-size flag | ✅ +3 | 5 |
| BI-4 | Flare of Malice · Contagion | greatest-MV edict + sac alt cost; distribute-counters split | ✅ +7 | 7 |
| BI-5 | Moon-Circuit Hacker · Satoru | optional draw with a conditional discard rider; the uncast/no-mana batched ETB watcher | ✅ +2 | 9 |
| BI-6 | Subtlety (S-B) or Thousand-Faced Shadow or Roaming Throne or Ingenious Prodigy | whichever lands cleanest | +1 | **10** |

Stop the deck at ≥85. Below the line → the Omnath arbiter list (Misdirection, Commandeer, Mindbreak Trap,
Nanogene Conversion, Doomsday, Lim-Dûl's Vault, Emrakul, Kaito, Agadeem's Awakening, Sink into Stupor,
Hydroelectric, Gemstone Caverns, and any of BI-6's unbuilt three).

---

## 3. PER-SLICE DISCIPLINE

SHELF-85 §5 in full (see the Killer Turts runbook §3). Deck-specific warnings:

- **The combo must be witnessed END TO END:** Consultation naming a card not in the library → the whole library
  exiled → Oracle cast → X ≥ 0 = library size → the game ends with the win. One test, the real stack, both seats.
  If any link is a pause the AI cannot decide, the sim stalls at the win — that is a soft-lock, the 1.0 bar's
  forbidden class.
- **The name choice is a real decision.** Consultation's AI policy: with Oracle in hand or on the stack and the
  library ≥ 7, name a card NOT in the library (the deck's known list makes "not in library" computable);
  otherwise name the best missing combo piece. Legible in the decision log (the DECISION-QUALITY law).
- **Tainted Pact in a singleton deck** never hits a duplicate before a basic land does — the witness must
  include duplicate basics to show the stop rule fires.

## 4. THE OMNATH HAND-OFF (after 85)

Dump the remaining non-native cards → `memory/orders/arbiter-nuance-queue.md` batch "Pod-sim three — Believe it!,
parked on the Arbiter", one line per card with the blocker and the play nuance (e.g. "Commandeer: pitch two blue
cards to steal an opposing Rhystic Study or a wheel; never spend it on a creature spell"). COMMS + sync-brain.
