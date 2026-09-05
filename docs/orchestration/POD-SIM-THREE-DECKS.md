# POD-SIM THREE — Killer Turts · Kinnan · Believe it! to 85 (Colton's 2026-09-05 order)

> **The order (Colton, 2026-09-05, mid-cron):** "the next 3 i want you to work on to 85 is killer turt kinnan and
> believe … i need them to be accurate for a pod sim." These three jump the SHELF-85 queue. Shalai (84, needs 1)
> waits behind them. **After all three are at 85, every card still on the Arbiter in these lists goes to
> Omnath's arbiter play-nuance list** (`memory/orders/arbiter-nuance-queue.md` — Omnath owns, Cindy feeds).
>
> Per-deck runbooks (super in depth, every non-native card sized against the live engine):
> [RUNBOOK-KILLER-TURTS.md](RUNBOOK-KILLER-TURTS.md) · [RUNBOOK-KINNAN.md](RUNBOOK-KINNAN.md) ·
> [RUNBOOK-BELIEVE-IT.md](RUNBOOK-BELIEVE-IT.md). This file is the umbrella: what "accurate for a pod sim"
> means, the engine-capability map the sizing rests on, the seams shared across the three decks, and the
> global order.

---

## 0. THE NUMBERS (measured 2026-09-05, corpus 14,425 / 34,245)

| Deck | Native | Non-native | Needs for 85 | Role in the pod |
|---|---|---|---|---|
| Killer Turts | ✅ **85/100** (2026-09-05; was 70) | 15 | **0** | extra-combat red-green aggro-storm |
| Kinnan Mana Overload | ✅ **85/100** (2026-09-05; was 75) | 15 | **0** | cEDH big-mana / copy / Thoracle |
| Believe it! | ✅ **85/100** (2026-09-05; was 75) | 15 | **0** | cEDH ninjas + Thoracle-Consultation |

**35 slots across the three.** Shared cards: Thassa's Oracle (Kinnan + Believe it!), Mindbreak Trap (both),
Misdirection (both), Gemstone Caverns (all three — PARKED, pregame), Veil of Summer (Turts + Kinnan), Sink into
Stupor and Hydroelectric Specimen (Kinnan + Believe it!). A seam that lands one of those pays twice.

---

## 1. WHAT "ACCURATE FOR A POD SIM" MEANS (the bar above 85)

85% native is the runbook's bar. For a POD SIM the bar has a second half: **the deck's actual game plan must
be executable by the runtime**, not just 85 arbitrary cards. A pod sim where Believe it! never assembles
Thoracle + Consultation, or where Killer Turts never chains a second combat, "runs" and lies. So each deck
runbook names its **PLAN-CRITICAL cards** and puts them first even when a cheaper card would reach 85 sooner:

- **Killer Turts:** the extra-combat family (Port Razer, Savage Beating, Full Throttle, World at War, Grim
  Reaper's Sprint, Overpowering Attack, Great Train Heist) and the ritual mana that fuels it (Rite of Flame,
  Irencrag Feat, Geosurge). Those are the deck.
- **Kinnan:** the mana engine is already native (Kinnan himself is native-mixed). The plan-critical misses are
  the COPY family (Clever Impersonator, Copy Enchantment, Flash Photography, Imposter Mech) and Thassa's Oracle.
- **Believe it!:** Thassa's Oracle + Demonic Consultation / Tainted Pact IS the win. Without those three the sim
  plays a ninja tempo deck that never wins the way the real deck does. They go first.

THE CREED applies doubly here: a card the runtime cannot actually play is never credited. A pod-sim deck with a
credited-but-hollow card is worse than the same deck with the card parked on the Arbiter, because the sim's
decision quality is being measured.

---

## 2. THE ENGINE CAPABILITY MAP (probed live 2026-09-05 — every sizing below rests on this, not on memory)

Real cards probed for their live tier, standing in for whole families:

| Family | Exists? | Evidence (live tier) | Consequence for the three decks |
|---|---|---|---|
| Pitch alternative cost ("exile a blue card from your hand rather than pay") | **YES** | Force of Will, Force of Negation, Snuff Out, Gush = native-spell | Misdirection / Commandeer / Force of Despair / Contagion fail on their EFFECT, not their cost |
| Evoke with a MANA cost | credited hard-cast only | Mulldrifter native-trigger; coverage treats `evoke {cost}` as an option-cost line; no runtime evoke | a KNOWN under-offer (safe FN); the evoke mode is never offered |
| Evoke with a CARD-EXILE cost ("Evoke—Exile a blue card from your hand") | **NO** | Solitude, Fury, Grief, Subtlety, Endurance = body-only | the composition rule the SHELF runbook wanted: pays Subtlety + Endurance here, Solitude on Shalai, Fury/Grief in the corpus |
| Extra combat phase (spell) | **YES** | Relentless Assault, Seize the Day = native-spell; atoms `extra-combat` (+ `insertAfter: "main"`) | the untap-attacked-this-turn + delayed-untap + two-combats forms are the missing arms |
| Extra combat (trigger) | **YES** | Aurelia = native-trigger; Port Razer's trigger line alone = native-trigger | Port Razer needs only its "can't attack the same player twice" line |
| Ritual mana, fixed pips | **YES** | Dark/Seething/Desperate/Pyretic Ritual = native-spell; `add-mana` with a pip map | "Add seven {R}" (the WORD form) is unparsed; Cabal Ritual (threshold) is not |
| Restricted-spend mana on a SPELL | **NO** | Geosurge / Open the Omenpaths = arbiter-spell (the Klauth restricted-mana seam exists for ABILITIES) | the spell-side twin of the QUARTET lane |
| Cast lock "only one more spell this turn" | seam exists (castLocksThisTurn, Permission Denied) | Irencrag's rider unparsed | a rider on a ritual |
| Counter with ONE filter | **YES** | Counterspell, Negate, Essence Scatter, Dispel, Flusterstorm, REB = native-spell; `colorFilter` + `spellFilter` | "blue instant" (two filters at once) unparsed; "if it's blue" (Pyroblast's mode form) unparsed |
| Counter "that targets a permanent you control" | **YES** (2026-09-05, KT-9a/9b) | Avoid Fate + Not of This World native; the predicate reads a spell's OR an ability's recorded targets | — |
| Redirect ("change the target of target spell") | **NO** | Misdirection, Bolt Bend, Deflecting Palm = arbiter | an L seam: retargeting a stack object; 5 Turts cards + Misdirection ×2 + Hydroelectric |
| Exile any number of target spells | **NO** | Mindbreak Trap = arbiter | any-number spell targets |
| Clone (creature) | **YES** | Clone, Phantasmal Image, Spark Double = native-clone | widening "any nonland permanent" / "any enchantment" / token-copy-of-permanent = the copy seam |
| Token copy of target permanent | **NO** (creature form likely yes) | Flash Photography = arbiter | |
| Devotion | **NO** | Gray Merchant = body-only | a new count kind (colour pips among permanents you control) |
| Win the game (library empty) | **YES** | Laboratory Maniac = native-static | Thoracle's "X ≥ library size" is the same family with a devotion X |
| Ninjutsu | **YES** | Ninja of the Deep Hours, Ingenious Infiltrator, Yuriko = native-trigger | Thousand-Faced Shadow / Moon-Circuit Hacker fail on their OTHER lines |
| Threshold-gated sac ability on a land | unknown | Cephalid Coliseum = land-partial | probe on approach |
| Modal spells + entwine | **YES** | Tooth and Nail = native-spell | Savage Beating's modes are each native; its "cast only during combat on your turn" timing is the miss |
| Spree / Freerunning / Rebound | unknown per keyword | Great Train Heist / Overpowering Attack / World at War = arbiter | probe each keyword's runtime on approach |
| Pregame ("If this card is in your opening hand…") | **NO** | Gemstone Caverns = land-partial | 🅿 PREGAME across all three decks |

---

## 3. SHARED SEAMS (build once, pay in two or three decks)

| Seam | Pays | Size | Notes |
|---|---|---|---|
| **S-A Devotion count + Thassa's Oracle ETB** | ✅ DONE 2026-09-05 (KN-1) — the devotion count already existed (the Gods); the ETB is one `devotion-dig-win` atom (live X, win-if, else a keep-one-on-top dig pause) | — | Thoracle native in both decks |
| **S-B Card-exile evoke composition** | Subtlety (Believe it!), Endurance (Kinnan), Solitude (Shalai), Fury/Grief corpus | M | an alternative cost "exile a <colour> card from your hand" at cast + sac-on-ETB when evoked; the mana-evoke option-cost line becomes offerable by the same rule |
| **S-C Copy widening** | ✅ DONE 2026-09-05 (KN-2 + KN-3): Clever Impersonator, Copy Enchantment, Flash Photography, Imposter Mech all native (the clone head + one shared copiability reader; the token-copy `target permanent` arm; the become-Vehicle rider). Auras/Sagas never copied on any path | — | the copy family is whole |
| **S-D Extra-combat forms** | Full Throttle, Overpowering Attack, World at War, Grim Reaper's Sprint, Great Train Heist mode, Savage Beating mode (Turts) | M | `extra-combat` exists; the arms: "untap all creatures you control THAT ATTACKED THIS TURN", "two additional combat phases", "at the beginning of each combat this turn, untap all creatures that attacked" (a delayed trigger), "if it's your main phase" conditional, "followed by an additional main phase" |
| **S-E Ritual riders** | Rite of Flame, Irencrag Feat, Geosurge, Open the Omenpaths (Turts) | S+S+M+M | the word-number pip form; the cast-lock rider; restricted spend on a spell's add-mana |
| **S-F Two-filter counters** | Guttural Response, Pyroblast (Turts), REB-family corpus | S | `colorFilter` AND `spellFilter` together; the "if it's blue" mode form |
| **S-G Exile-until-named** | ✅ DONE 2026-09-05 (BI-2): Demonic Consultation (the name via the tutor pause in consultation mode; decline = exile all) + Tainted Pact (a new chained take-or-continue pause; duplicate-name stop) — the Believe it! win is playable end to end with Thassa's Oracle | — | — |
| **S-H Redirect** | Misdirection ×2, Bolt Bend, Redirect Lightning, Ricochet Trap, Untimely Malfunction, Hydroelectric Specimen | **L** | retargeting a stack object with a single target; LAST across all three decks — the pod sim loses little if these stay on the Arbiter |
| 🅿 **Pregame** | Gemstone Caverns ×3 | park | no pregame phase in the runtime |

---

## 4. THE GLOBAL ORDER

1. ✅ **Killer Turts to 85** — DONE 2026-09-05 (85/100; needed 15) — the deck's plan is the extra-combat family; S-D and S-E carry ~9 of the
   15 on their own; the counters (S-F), Port Razer's second line, City of Traitors and Carpet of Flowers fill it.
2. ✅ **Kinnan to 85** — DONE 2026-09-05 (85/100; needed 10) — S-A (Thoracle) and S-C (copy widening, four cards) first; Treasure Vault,
   Moonsilver Key, Cephalid Coliseum, Wan Shi Tong, Nezahal's fourth line, Hullbreaker Horror fill it.
3. ✅ **Believe it! to 85** — DONE 2026-09-05 (85/100; needed 10) — S-A lands Thoracle for free (built in step 2); S-G (Consultation + Pact)
   completes the WIN; then Sea Gate Restoration's front, Force of Despair, Flare of Malice, S-B (Subtlety),
   Satoru, Moon-Circuit Hacker, Thousand-Faced Shadow, Roaming Throne, Ingenious Prodigy.
4. **Then:** the Omnath arbiter list (§5), then Shalai's last card (Solitude rides S-B), then the §5 SHELF order.

Every slice runs the SHELF-85 §5 discipline in full (probe → smallest honest arm → runtime before classifier →
flip-diff → witness → mutations seen to fail → lint + full suite → docs → measure → commit → push → CI green
before the next push). The nine traps are law.

---

## 5. THE CLOSING STEP — OMNATH'S ARBITER LIST

When all three decks read ≥85: dump each deck's remaining non-native cards (the `dump-decks.mjs` probe shape:
name, type, mana, tier, oracle) and append them, deck by deck, to `memory/orders/arbiter-nuance-queue.md` as a
new batch ("Pod-sim three — parked on the Arbiter"), one line per card with the blocker in engine terms and
the play-nuance the Arbiter should carry (what the card is FOR in that deck). Then a COMMS line anchored on
`## LOG (newest first)` + `sync-brain.cjs`. Omnath merges to `card-play-hints.json` as before.

---

## 6. PARKS (the plan's §6 mirror for these decks)

| Card | Decks | Why parked | Unpark when |
|---|---|---|---|
| Gemstone Caverns | all three | pregame action ("if in your opening hand and you're not the starting player") — no pregame phase | a mulligan/opening-hand phase exists (the Academy's human mulligan flow is the seam) |
| Doomsday · Lim-Dûl's Vault | Believe it! | pile-building / library-ordering AI policy — an L with no honest short arm | a library-ordering choice kind + a pile policy |
| Redirect family (S-H) | all three | retargeting stack objects — L | after the three are at 85 if slots are still wanted |
| Nanogene Conversion · Emrakul, the Promised End · Kaito · Agadeem's Awakening · Tezzeret ×2 · Invasion of Ikoria · Tibalt's Trickery · Wandering Archaic | various | each an L on its own (mass-copy-until-EOT, control-a-player, planeswalker+ninjutsu, different-MV mass reanimate, battles, random-mill-then-free-cast, opponent-copy-with-tax) | the decks are at 85 without them |
