# Magic: The Gathering Judge Engine — Master Layer Index
## Complete File Registry and Rule Coverage Map
## CR baseline: February 27, 2026 | Build: Complete
## Primary format: Commander (4-player Free-for-All)

---

# FILE CONVENTION

Every rule block has two files:

| Suffix | Purpose | Content rule |
|---|---|---|
| `_v.md` | Verbatim anchor | Exact CR text only. No paraphrase, no commentary. Sub-rules reproduced in full. |
| `_t.md` | Engine expansion | Operational definitions, edge cases, cross-layer connections. Never contradicts `_v`. |

**Exceptions:** `L00_Orchestration_*.md` (orchestration layer, no verbatim counterpart), `META_*.md` (documentation), `L06_PlayerAction_701_v.md` (reference dictionary, no _t needed — same decision as 702).

**Naming format:** `L{nn}_{LayerName}_{descriptor}_{v|t}.md`

---

# THE 10-LAYER ARCHITECTURE

| Layer | Name | Core Question | Rules Covered |
|---|---|---|---|
| 0 | Engine Orchestration | How do all layers combine into one loop? | (spans all) |
| 1 | Source | What does the CR actually say? | Full CR (00_cr.md) |
| 2 | Time | When does something happen? | 500–514, 703 |
| 3 | Event | What would happen / what actually happened? | 609–616 |
| 4 | Trigger | What fired as a result of that event? | 603 |
| 5 | State Enforcement | What automatic corrections happen next? | 704 |
| 6 | Player Action | What can players do right now? | 106, 114–121, 116–117, 600–608, 701, 705–706, 723 |
| 7 | Object Model | What are objects, zones, and characteristics? | 105, 107–113, 122–123, 200–213, 300–315, 400–408, 607, 700, 702, 707–721, 729 |
| 8 | Continuous Effects | What is true right now on the board? | 604, 611–613 |
| 9 | Rule Constraint | What overrides or constrains everything? | 100–104, 722, 726, 728, 731–732 |
| 10 | Format / Variant | What format-specific rules apply? | 724–725, 727, 730, 800–811, 900–905 |

---

# LAYER 0 — ENGINE ORCHESTRATION

| File | Contents | Status |
|---|---|---|
| `L00_Orchestration_game_engine.md` | Full game engine: pre-event → replacement → event → trigger → SBA → insertion → priority loop | ✅ |
| `L00_Orchestration_state_assessor.md` | State assessor: how engine determines current characteristics of any object | ✅ |

---

# LAYER 1 — SOURCE LAYER

| File | Contents | Status |
|---|---|---|
| `00_cr.md` *(CR upload, not in zip)* | Full CR, February 27, 2026 — do not edit | ✅ |

---

# LAYER 2 — TIME LAYER

Rules: 500–514 (Turn Structure), 703 (Turn-Based Actions)

| File | Contents | Status |
|---|---|---|
| `L02_Time_500to514_v.md` | Rules 500–514 verbatim | ✅ |
| `L02_Time_500to514_t.md` | Turn structure expansion: beginning-of-step triggers, untap/cleanup exceptions, combat timing | ✅ |
| `L02_Time_703_v.md` | Rule 703 verbatim (turn-based actions) | ✅ |
| `L02_Time_703_t.md` | Rule 703 expansion: TBA vs trigger distinction, step-by-step TBA reference | ✅ |

**Note:** Second-pass verified — 12 verbatim errors corrected in 500to514_v (509.3a–g, 509.1c–d, 508.4d, 508.5, 509.4).

---

# LAYER 3 — EVENT LAYER

Rules: 609 (Effects), 610 (One-Shot Effects), 614 (Replacement Effects), 615 (Prevention Effects), 616 (Interaction)

| File | Contents | Status |
|---|---|---|
| `L03_Event_609to610_v.md` | Rules 609–610 verbatim (Effects, One-Shot Effects) | ✅ |
| `L03_Event_609to610_t.md` | Effects expansion: one-shot vs continuous, delayed triggers, resolution order | ✅ |
| `L03_Event_614to616_v.md` | Rules 614–616 verbatim (Replacement, Prevention, Interaction) | ✅ |
| `L03_Event_614to616_t.md` | Replacement/prevention/interaction expansion engine | ✅ |

---

# LAYER 4 — TRIGGER LAYER

Rules: 603 (Handling Triggered Abilities)

| File | Contents | Status |
|---|---|---|
| `L04_Trigger_603_seg1_v.md` | Rules 603.1–603.3d verbatim | ✅ |
| `L04_Trigger_603_seg1_t.md` | 603.1–603.3 expansion: lifecycle, two-part APNAP insertion, iterative loop | ✅ |
| `L04_Trigger_603_seg2_v.md` | Rules 603.4–603.7h verbatim | ✅ |
| `L04_Trigger_603_seg2_t.md` | 603.4–603.7 expansion: intervening-if, optional triggers, zone-change, delayed triggers | ✅ |
| `L04_Trigger_603_seg3_v.md` | Rules 603.8–603.12a verbatim | ✅ |
| `L04_Trigger_603_seg3_t.md` | 603.8–603.12 expansion: state triggers, look-back, reflexive triggers | ✅ |
| `L04_Trigger_engine.md` | Trigger layer orchestration: class table, insertion, failure matrix | ✅ |

---

# LAYER 5 — STATE ENFORCEMENT LAYER

Rules: 704 (State-Based Actions)

| File | Contents | Status |
|---|---|---|
| `L05_StateEnforcement_704_v.md` | Rule 704 verbatim — all 704.5a–z SBAs, 704.6 variant SBAs | ✅ |
| `L05_StateEnforcement_704_t.md` | Rule 704 expansion: SBA loop, simultaneous processing, LKI at SBA time; Commander SBA addendum (704.6c, 903.9a) | ✅ |

---

# LAYER 6 — PLAYER ACTION LAYER

Rules: 106 (Mana), 114 (Emblems), 115 (Targets), 116 (Special Actions), 117 (Priority), 118 (Costs), 119 (Life), 120 (Damage), 121 (Drawing), 600 (General), 601 (Casting), 602 (Activating), 605 (Mana Abilities), 606 (Loyalty Abilities), 608 (Resolution), 701 (Keyword Actions), 705–706 (Coin/Die), 723 (Ending Turns)

| File | Contents | Status |
|---|---|---|
| `L06_PlayerAction_106_v.md` | Rule 106 verbatim (Mana) | ✅ |
| `L06_PlayerAction_106_t.md` | Mana pool, mana window (601.2g), restricted mana, tapping for mana | ✅ |
| `L06_PlayerAction_114to115_v.md` | Rules 114–115 verbatim (Emblems, Targets) | ✅ |
| `L06_PlayerAction_114to115_t.md` | Emblems, legal targets, targeting restrictions, when-targeted trigger timing | ✅ |
| `L06_PlayerAction_116_v.md` | Rule 116 verbatim (Special Actions) | ✅ |
| `L06_PlayerAction_116_t.md` | Special action types, timing matrix, priority after special actions | ✅ |
| `L06_PlayerAction_117_v.md` | Rule 117 verbatim (Priority) | ✅ |
| `L06_PlayerAction_117_t.md` | Priority model, 117.5 checkpoint gate, untap/cleanup exceptions | ✅ |
| `L06_PlayerAction_118to121_v.md` | Rules 118–121 verbatim (Costs, Life, Damage, Drawing) | ✅ |
| `L06_PlayerAction_118to121_t.md` | Cost lock-in, damage marking, lifelink, damage prevention, draw events, SBA cross-reference | ✅ |
| `L06_PlayerAction_600to606_v.md` | Rules 600, 605–606 verbatim (General, Mana Abilities, Loyalty Abilities) | ✅ |
| `L06_PlayerAction_600to606_t.md` | Mana ability stackless resolution, once-per-turn loyalty, loyalty cost as counter adjustment | ✅ |
| `L06_PlayerAction_601_seg1_v.md` | Rules 601.1–601.2i verbatim (casting procedure) | ✅ |
| `L06_PlayerAction_601_seg1_t.md` | Casting procedure step-by-step: 601.2a–i, cast point, cost lock-in | ✅ |
| `L06_PlayerAction_601_seg2_v.md` | Rules 601.3–601.7, 602 verbatim (legality and activation) | ✅ |
| `L06_PlayerAction_601_seg2_t.md` | Casting legality, flash permissions, activation procedure, 602.5 prohibitions | ✅ |
| `L06_PlayerAction_608_v.md` | Rule 608 verbatim (Resolving Spells and Abilities) | ✅ |
| `L06_PlayerAction_608_t.md` | Resolution: intervening-if, illegal targets, LKI, three-way removal distinction | ✅ |
| `L06_PlayerAction_701_v.md` | Rule 701 verbatim — reference dictionary for all keyword actions | ✅ |
| `L06_PlayerAction_705to706_v.md` | Rules 705–706 verbatim (Flipping a Coin, Rolling a Die) | ✅ |
| `L06_PlayerAction_705to706_t.md` | Coin flip and die roll random event handling | ✅ |
| `L06_PlayerAction_723_v.md` | Rule 723 verbatim (Ending Turns and Phases) | ✅ |
| `L06_PlayerAction_723_t.md` | "End the turn" stack clearing, phase skipping and trigger interaction | ✅ |

**Note:** Rule 701 follows the same reference-dictionary model as rule 702 — verbatim only, no _t needed. Keyword actions are looked up directly.

---

# LAYER 7 — OBJECT MODEL LAYER

Rules: 105, 107–113, 122–123, 200–213, 300–315, 400–408, 607, 700, 702, 707–721, 729

| File | Contents | Status |
|---|---|---|
| `L07_ObjectModel_105_107_v.md` | Rules 105, 107 verbatim (Colors; Numbers and Symbols) | ✅ |
| `L07_ObjectModel_105_107_t.md` | Color characteristics, mana symbol taxonomy, X variable rules | ✅ |
| `L07_ObjectModel_108to113_v.md` | Rules 108–113 verbatim (Cards, Objects, Permanents, Tokens, Spells, Abilities) | ✅ |
| `L07_ObjectModel_108to113_t.md` | Object model: characteristics, controllers, LKI model, token behavior | ✅ |
| `L07_ObjectModel_122to123_v.md` | Rules 122–123 verbatim (Counters, Stickers) | ✅ |
| `L07_ObjectModel_122to123_t.md` | Counter types with built-in effects, +1/+1 vs -1/-1 SBA, Nth counter trigger, sticker zone retention | ✅ |
| `L07_ObjectModel_200to213_v.md` | Rules 200–213 verbatim (Parts of a Card) | ✅ |
| `L07_ObjectModel_200to213_t.md` | Card parts vs characteristics, mana value, type line, P/T, copiable values | ✅ |
| `L07_ObjectModel_300to315_v.md` | Rules 300–315 verbatim (Card Types) | ✅ |
| `L07_ObjectModel_300to315_t.md` | Equipment/Aura/creature/planeswalker/land rules, type-based SBA table, casting timing | ✅ |
| `L07_ObjectModel_400to408_v.md` | Rules 400–408 verbatim (Zones) | ✅ |
| `L07_ObjectModel_400to408_t.md` | Zone system: public/hidden, 400.7 new-object rule, zone-change effects | ✅ |
| `L07_ObjectModel_607_v.md` | Rule 607 verbatim (Linked Abilities) | ✅ |
| `L07_ObjectModel_607_t.md` | All 16 linked ability types, cross-object linking, copy scoping, undefined choice | ✅ |
| `L07_ObjectModel_700_v.md` | Rule 700 verbatim (General) | ✅ |
| `L07_ObjectModel_700_t.md` | Event definition, modal choice timing, defined terms (dies, historic, modified, outlaw) | ✅ |
| `L07_ObjectModel_702_v.md` | Rule 702 verbatim — reference dictionary, all 189 keyword abilities | ✅ |
| `L07_ObjectModel_702_t.md` | Keyword engine taxonomy: layer routing for all 189 keywords by category | ✅ |
| `L07_ObjectModel_707_v.md` | Rule 707 verbatim (Copying Objects) | ✅ |
| `L07_ObjectModel_707_t.md` | Copiable values table, copy-on-ETB vs in-play, spell copy vs cast-a-copy, exceptions | ✅ |
| `L07_ObjectModel_708to712_v.md` | Rules 708–712 verbatim (Face-Down, Split, Flip, Leveler, DFC) | ✅ |
| `L07_ObjectModel_708to712_t.md` | Face-down copiable values, DFC transformation, split card mana value, morph/manifest | ✅ |
| `L07_ObjectModel_713to716_v.md` | Rules 713–716 verbatim (Substitute, Saga, Adventurer, Class) | ✅ |
| `L07_ObjectModel_713to716_t.md` | Saga chapter triggers, Adventure casting pathway, Class level activation | ✅ |
| `L07_ObjectModel_717to721_v.md` | Rules 717–721 verbatim (Attraction, Prototype, Case, Omen, Station) | ✅ |
| `L07_ObjectModel_717to721_t.md` | Prototype alternative characteristics, Case solving SBA, Station unlock | ✅ |
| `L07_ObjectModel_729_v.md` | Rule 729 verbatim (Merging with Permanents) | ✅ |
| `L07_ObjectModel_729_t.md` | Merged permanent: top component characteristics, zone separation, copy interactions | ✅ |

---

# LAYER 8 — CONTINUOUS EFFECTS LAYER

Rules: 604 (Static Abilities), 611 (Continuous Effects), 612 (Text-Changing Effects), 613 (Interaction of Continuous Effects)

| File | Contents | Status |
|---|---|---|
| `L08_ContinuousEffects_604_v.md` | Rule 604 verbatim (Static Abilities) | ✅ |
| `L08_ContinuousEffects_604_t.md` | Static ability types, CDAs, static-trigger pairs (603.11), "as long as" conditions | ✅ |
| `L08_ContinuousEffects_611to613_v.md` | Rules 611–613 verbatim (Continuous Effects, Text-Changing, Layer Interaction) | ✅ |
| `L08_ContinuousEffects_611to613_t.md` | Seven layers with sublayers, timestamp ordering, dependency, adjudication procedure | ✅ |

---

# LAYER 9 — RULE CONSTRAINT LAYER

Rules: 100–104 (General, Golden Rules, Players, Starting, Ending), 722 (Controlling Another Player), 726 (Restarting), 728 (Subgames), 731–732 (Illegal Actions)

| File | Contents | Status |
|---|---|---|
| `L09_Constraint_100to104_v.md` | Rules 100–104 verbatim | ✅ |
| `L09_Constraint_100to104_t.md` | Golden Rules, can't override (101.2), APNAP (101.4), starting game, win/loss in Commander | ✅ |
| `L09_Constraint_722_v.md` | Rule 722 verbatim (Controlling Another Player) | ✅ |
| `L09_Constraint_726to728_v.md` | Rules 726, 728 verbatim (Restarting the Game, Subgames) | ✅ |
| `L09_Constraint_731to732_v.md` | Rules 731–732 verbatim (Handling Illegal Actions) | ✅ |
| `L09_Constraint_t.md` | Expansion for 722, 726, 728, 731–732: can't override, APNAP 4-player, illegal action rewind | ✅ |

---

# LAYER 10 — FORMAT / VARIANT LAYER

Rules: 724 (Monarch), 725 (Initiative), 727 (Rad Counters), 730 (Day/Night), 800–811 (Multiplayer), 900–905 (Casual Variants incl. Commander)

| File | Contents | Status |
|---|---|---|
| `L10_Variant_724to730_v.md` | Rules 724–725, 727, 730 verbatim (Monarch, Initiative, Rad Counters, Day/Night) | ✅ |
| `L10_Variant_724to730_t.md` | Monarch/Initiative theft mechanic, rad counter trigger, Day/Night cycle in 4-player | ✅ |
| `L10_Variant_800to811_v.md` | Rules 800–811 verbatim (all multiplayer rules) | ✅ |
| `L10_Variant_800to811_t.md` | Free-for-All, Attack Multiple Players, APNAP 4-player, players leaving mid-game | ✅ |
| `L10_Variant_900to905_v.md` | Rules 900–902, 904–905 verbatim (Planechase, Vanguard, Archenemy, Conspiracy Draft) | ✅ |
| `L10_Variant_900to905_t.md` | Planechase planar die, Archenemy schemes, Vanguard modifiers, Conspiracy | ✅ |
| `L10_Variant_903_v.md` | Rule 903 verbatim (Commander) — primary format | ✅ |
| `L10_Variant_903_t.md` | Commander: designation, 40 life, tax, zone return, commander damage SBA, 4-player APNAP, Partner | ✅ |

---

# COMPLETE RULE NUMBER → FILE MAP

All CR rule sections covered. ✅ = verbatim + expansion built and verified.

| Rule(s) | Layer | File(s) | Status |
|---|---|---|---|
| 100–104 | L09 | L09_Constraint_100to104_v/t.md | ✅ |
| 105, 107 | L07 | L07_ObjectModel_105_107_v/t.md | ✅ |
| 106 | L06 | L06_PlayerAction_106_v/t.md | ✅ |
| 108–113 | L07 | L07_ObjectModel_108to113_v/t.md | ✅ |
| 114–115 | L06 | L06_PlayerAction_114to115_v/t.md | ✅ |
| 116 | L06 | L06_PlayerAction_116_v/t.md | ✅ |
| 117 | L06 | L06_PlayerAction_117_v/t.md | ✅ |
| 118–121 | L06 | L06_PlayerAction_118to121_v/t.md | ✅ |
| 122–123 | L07 | L07_ObjectModel_122to123_v/t.md | ✅ |
| 200–213 | L07 | L07_ObjectModel_200to213_v/t.md | ✅ |
| 300–315 | L07 | L07_ObjectModel_300to315_v/t.md | ✅ |
| 400–408 | L07 | L07_ObjectModel_400to408_v/t.md | ✅ |
| 500–514 | L02 | L02_Time_500to514_v/t.md | ✅ |
| 600, 605–606 | L06 | L06_PlayerAction_600to606_v/t.md | ✅ |
| 601–602 | L06 | L06_PlayerAction_601_seg1/2_v/t.md | ✅ |
| 603 | L04 | L04_Trigger_603_seg1/2/3_v/t.md + L04_Trigger_engine.md | ✅ |
| 604 | L08 | L08_ContinuousEffects_604_v/t.md | ✅ |
| 607 | L07 | L07_ObjectModel_607_v/t.md | ✅ |
| 608 | L06 | L06_PlayerAction_608_v/t.md | ✅ |
| 609–610 | L03 | L03_Event_609to610_v/t.md | ✅ |
| 611–613 | L08 | L08_ContinuousEffects_611to613_v/t.md | ✅ |
| 614–616 | L03 | L03_Event_614to616_v/t.md | ✅ |
| 700 | L07 | L07_ObjectModel_700_v/t.md | ✅ |
| 701 | L06 | L06_PlayerAction_701_v.md (ref dict, no _t) | ✅ |
| 702 | L07 | L07_ObjectModel_702_v/t.md | ✅ |
| 703 | L02 | L02_Time_703_v/t.md | ✅ |
| 704 | L05 | L05_StateEnforcement_704_v/t.md | ✅ |
| 705–706 | L06 | L06_PlayerAction_705to706_v/t.md | ✅ |
| 707 | L07 | L07_ObjectModel_707_v/t.md | ✅ |
| 708–712 | L07 | L07_ObjectModel_708to712_v/t.md | ✅ |
| 713–716 | L07 | L07_ObjectModel_713to716_v/t.md | ✅ |
| 717–721 | L07 | L07_ObjectModel_717to721_v/t.md | ✅ |
| 722 | L09 | L09_Constraint_722_v.md + L09_Constraint_t.md | ✅ |
| 723 | L06 | L06_PlayerAction_723_v/t.md | ✅ |
| 724–725, 727, 730 | L10 | L10_Variant_724to730_v/t.md | ✅ |
| 726, 728 | L09 | L09_Constraint_726to728_v.md + L09_Constraint_t.md | ✅ |
| 729 | L07 | L07_ObjectModel_729_v/t.md | ✅ |
| 731–732 | L09 | L09_Constraint_731to732_v.md + L09_Constraint_t.md | ✅ |
| 800–811 | L10 | L10_Variant_800to811_v/t.md | ✅ |
| 900–902, 904–905 | L10 | L10_Variant_900to905_v/t.md | ✅ |
| 903 | L10 | L10_Variant_903_v/t.md | ✅ |

---

# CROSS-LAYER DEPENDENCY MAP

```
L0  (Orchestration)  ←→  All layers
L2  (Time)            →  L1
L3  (Event)           →  L7, L8, L9
L4  (Trigger)         →  L3, L6, L7
L5  (State)           →  L4, L6, L7
L6  (Player Action)   →  L7, L9
L7  (Object Model)    →  L1
L8  (Continuous)      →  L7, L9
L9  (Constraint)      →  L1
L10 (Variant)         →  All core layers
```

---

# BUILD STATUS SUMMARY

| Layer | Rules | Files | Status |
|---|---|---|---|
| L0 Orchestration | All | 2 | ✅ Complete |
| L2 Time | 500–514, 703 | 4 | ✅ Complete (second-pass verified) |
| L3 Event | 609–610, 614–616 | 4 | ✅ Complete |
| L4 Trigger | 603 | 7 | ✅ Complete |
| L5 State | 704 | 2 | ✅ Complete (Commander addendum included) |
| L6 Player Action | 106, 114–121, 116–117, 600–608, 701, 705–706, 723 | 23 | ✅ Complete |
| L7 Object Model | 105, 107–113, 122–123, 200–213, 300–315, 400–408, 607, 700, 702, 707–721, 729 | 28 | ✅ Complete |
| L8 Continuous Effects | 604, 611–613 | 4 | ✅ Complete |
| L9 Constraint | 100–104, 722, 726, 728, 731–732 | 6 | ✅ Complete |
| L10 Variant | 724–725, 727, 730, 800–811, 900–905 (903 primary) | 8 | ✅ Complete |
| **Total** | **All CR sections** | **88 rule files + 4 META** | **✅ Complete** |

**Open gaps: 0 | Stubs: 0 | Stale entries: 0**
