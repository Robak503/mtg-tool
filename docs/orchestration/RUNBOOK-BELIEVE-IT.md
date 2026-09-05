# RUNBOOK — BELIEVE IT! to 85 (75/100 · 25 non-native · needs 10)

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
| B2 | **Demonic Consultation** | choose a name; exile top six; reveal until the name; that card to hand, exile the rest | S-G exile-until-named: a NAME choice (AI policy: name the deck's combo piece, or name a card NOT in the library when Oracle is in hand — the actual line) + the reveal loop | **M** | naming is a real decision — the policy must be legible and the pause kind must exist for the human path |
| B3 | **Tainted Pact** | exile the top card; may put it in hand unless it shares a name with another card exiled this way; repeat until a card is taken or two names match | the same loop with a different stop rule (a duplicate name ends it); singleton Commander decks make it a full-library dig | **M** | rides B2's loop; the "may put into hand" is a choice per card (an auto-policy: take it when it is the named target / Oracle) |

### 1b. The cheap fills (S / S-M)

| # | Card | Oracle gist | Blocker (probed) | Size | CREED note |
|---|---|---|---|---|---|
| B4 | **Sea Gate Restoration // Sea Gate, Reborn** | front: draw cards = hand size + 1; no maximum hand size for the rest of the game | "draw cards equal to the number of cards in your hand plus one" (a hand-count draw) + a no-max-hand-size FLAG (Nezahal's line is credited, so the static exists — here it is a spell-granted permanent flag) | **S/M** | the land back is already credited (land-partial) |
| B5 | **Force of Despair** | pitch (if not your turn, exile a black card); destroy all creatures that ENTERED THIS TURN | mass destroy with an entered-this-turn filter (the `enteredOnTurn` stamp exists — the damage doubler reads it) | **S** | the pitch's "if it's not your turn" condition must gate the alt cost |
| B6 | **Flare of Malice** | alt cost: sacrifice a nontoken black creature; each opponent sacrifices a creature or planeswalker with the GREATEST mana value among theirs | an edict with a greatest-MV selector (the opponent chooses among ties) + a sac-a-creature alt cost (the pitch seam's sac variant) | **M** | the greatest-MV set is per opponent |
| B7 | **Contagion** | pitch (pay 1 life + exile a black card); distribute two −2/−1 counters among one or two targets | "distribute N counters among one or two targets" (a split choice) | **M** | |

### 1c. The ninjas and their riders (M each)

| # | Card | Oracle gist | Blocker (probed) | Size | CREED note |
|---|---|---|---|---|---|
| B8 | **Moon-Circuit Hacker** | ninjutsu {U} (native); combat damage → may draw; if you do, discard unless it entered this turn | the "discard unless this creature entered this turn" rider (entered-this-turn stamp exists) on an optional draw | **S/M** | |
| B9 | **Thousand-Faced Shadow** | ninjutsu (native); flying; ETB from hand while attacking → token copy of another attacking creature, tapped and attacking | an ETB with a from-zone + attacking intervening-if, minting a token copy that enters ATTACKING (the token-copy-of-creature atom + an enters-attacking rider) | **M** | the token must actually be attacking the same player |
| B10 | **Satoru, the Infiltrator** | menace; whenever Satoru and/or other nontoken creatures enter, if none were cast or no mana was spent → draw | a batched ETB watcher with a "not cast / no mana spent" predicate (ninjutsu puts creatures in uncast — the castFromZone / manaSpent threads exist on cast triggers; ETB needs the same memo) | **M** | the deck's card-draw engine — plan-adjacent |
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
| BI-2 | Demonic Consultation · Tainted Pact | S-G exile-until-named (the name choice: a pause kind for the human path + an honest AI policy; the reveal loop; both stop rules) — THE WIN | +2 | 3 |
| BI-3 | Force of Despair · Sea Gate Restoration | entered-this-turn mass destroy + the not-your-turn pitch gate; hand-count draw + the no-max-hand-size flag | +2 | 5 |
| BI-4 | Flare of Malice · Contagion | greatest-MV edict + sac alt cost; distribute-counters split | +2 | 7 |
| BI-5 | Moon-Circuit Hacker · Satoru | optional draw with a conditional discard rider; the uncast/no-mana batched ETB watcher | +2 | 9 |
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
