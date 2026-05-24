# Judge Engine Codex — Query Router
## Maps adjudication question categories to the files that answer them
## Primary format: Commander (4-player Free-for-All)
## CR baseline: February 27, 2026 | 91 codex files

---

# HOW TO USE THIS ROUTER

1. Find the question category below
2. Read **Primary** files first — these contain the engine logic
3. Check **Secondary** files for verbatim rule text or cross-layer detail
4. `_t` = expansion/engine file | `_v` = verbatim CR | no suffix = orchestration layer

---

# A. TURN STRUCTURE AND PRIORITY

## A1. Timing — can I take an action right now?

| Question | Primary | Secondary |
|---|---|---|
| Can I cast a spell at this moment? | `L06_601_seg2_t` (601.3 legality) | `L06_116_t` (special actions), `L06_117_t` (priority) |
| Can I activate this ability? | `L06_601_seg2_t` (602.5) | `L06_117_t` |
| Can I play a land? | `L06_116_t` (116.2a) | `L07_300to315_t` (305) |
| Sorcery speed or instant speed? | `L06_117_t` | `L06_601_seg1_t` (601.2b) |
| Creature has summoning sickness? | `L07_300to315_t` (302.6) | `L06_601_seg2_t` (602.5a) |
| Is this a special action (no stack)? | `L06_116_t` | `L07_300to315_t` (305.1 lands) |

## A2. Priority — who acts when?

| Question | Primary | Secondary |
|---|---|---|
| Who has priority right now? | `L06_117_t` | `L00_Orchestration_game_engine` |
| APNAP order in 4-player Commander | `L10_Variant_800to811_t` (§4) | `L09_Constraint_100to104_t` (101.4) |
| Priority after a spell resolves | `L06_117_t` | `L06_608_t` |
| Priority after a trigger resolves | `L06_117_t` | `L04_Trigger_engine` |
| Can I respond before this happens? | `L06_117_t` | `L06_116_t` (stackless actions can't be responded to) |
| Simultaneous decisions — who chooses first? | `L09_Constraint_100to104_t` (101.4 APNAP) | `L10_Variant_800to811_t` |

## A3. Turn structure

| Question | Primary | Secondary |
|---|---|---|
| What step/phase are we in and what happens? | `L02_Time_500to514_t` | `L02_Time_500to514_v` |
| Untap step — what untaps? | `L02_Time_500to514_t` (§2) | `L02_Time_703_t` (turn-based actions) |
| Cleanup step — what is removed? | `L02_Time_500to514_t` (§9) | `L06_723_t` |
| "Beginning of upkeep" triggers — when exactly? | `L04_Trigger_engine` (§4.1) | `L02_Time_500to514_t` |
| "End of turn" effect — when does it expire? | `L02_Time_500to514_t` (§9 cleanup) | `L08_611to613_t` (continuous effect duration) |
| Someone cast "end the turn" — what happens? | `L06_723_t` | `L04_Trigger_engine` (§4.1) |

---

# B. CASTING AND ACTIVATION

## B1. Casting a spell

| Question | Primary | Secondary |
|---|---|---|
| Full casting procedure, step by step | `L06_601_seg1_t` | `L06_601_seg1_v` |
| When does the spell officially become cast? | `L06_601_seg1_t` (§2.9 — 601.2i cast point) | `L04_Trigger_engine` (cast triggers) |
| How is total cost calculated? | `L06_601_seg1_t` (§2.6 — 601.2f lock-in) | `L06_118to121_t` (§1) |
| Sacrifice-as-cost with cost reducer — does it still apply? | `L06_601_seg1_t` (§2.6 lock-in precision) | `L06_118to121_t` (§1.2) |
| When can mana abilities be activated? | `L06_601_seg1_t` (§2.7 — 601.2g) | `L06_600to606_t` (§2) |
| Casting despite a prohibition | `L06_601_seg2_t` (§1 — 601.3) | `L09_Constraint_100to104_t` (§2.2 can't rule) |
| Flash permission — can I cast as instant? | `L06_601_seg2_t` (§1.2–1.4) | `L07_702_t` (Flash keyword routing) |
| X value — when announced, what does it equal? | `L06_601_seg1_t` (§2.2) | `L07_105_107_t` (§2 X variable) |
| Alternative cost (flashback, escape, etc.) | `L06_118to121_t` (§1.7) | `L07_702_t` (alt cost keyword routing) |
| Additional cost (kicker, buyback, etc.) | `L06_118to121_t` (§1.8) | `L06_601_seg1_t` (§2.2 601.2b) |
| Commander tax — how much? | `L10_Variant_903_t` (§5) | `L06_118to121_t` (§1.9) |
| Casting from command zone vs. hand/graveyard | `L10_Variant_903_t` (§5) | `L06_601_seg1_t` (§2.1 — zone of origin) |

## B2. Activating abilities

| Question | Primary | Secondary |
|---|---|---|
| Full activation procedure | `L06_601_seg2_t` (§5 — 602) | `L06_601_seg2_v` |
| Is this ability a mana ability? | `L06_600to606_t` (§2.1 — 605.1 three conditions) | `L06_601_seg1_t` (§2.7) |
| Mana abilities — do they go on the stack? | `L06_600to606_t` (§2.2) | `L06_106_t` (§2 mana pool) |
| Loyalty ability — timing and once-per-turn | `L06_600to606_t` (§3) | `L07_300to315_t` (§2.4 planeswalkers) |
| "Activate only as a sorcery" — what does that mean? | `L06_601_seg2_t` (§5.3 — 602.5d) | `L06_117_t` |

## B3. Targets

| Question | Primary | Secondary |
|---|---|---|
| Is this a legal target? | `L06_114to115_t` (§2.2) | `L06_114to115_v` |
| Hexproof / shroud / protection — blocks this? | `L06_114to115_t` (§2.3) | `L07_702_v` (look up specific keyword) |
| Target became illegal when spell resolves | `L06_114to115_t` (§2.4) | `L06_608_t` |
| Same target chosen twice — legal? | `L06_114to115_t` (§2.5) | `L06_601_seg1_v` (601.2c) |
| When do "when becomes target" triggers fire? | `L06_114to115_t` (§2.8) | `L04_Trigger_engine` |

---

# C. TRIGGERS

## C1. Does this trigger fire?

| Question | Primary | Secondary |
|---|---|---|
| General trigger detection | `L04_Trigger_engine` | `L04_Trigger_603_seg1_t` |
| Does this event match the trigger condition? | `L04_Trigger_603_seg1_t` | `L07_700_t` (§1 event definition) |
| One event or multiple events (e.g., blocked by two creatures)? | `L07_700_t` (§1 — 700.1) | `L04_Trigger_603_seg1_t` |
| Trigger from command zone (eminence, etc.)? | `L04_Trigger_603_seg1_t` | `L10_Variant_903_t` (§2.1 commander zone) |
| "At the beginning of [player's] upkeep" — which player? | `L04_Trigger_engine` (§4.1) | `L02_Time_500to514_t` |
| Delayed triggered ability — when does it fire? | `L03_Event_609to610_t` (§2.2) | `L04_Trigger_603_seg2_t` |

## C2. When does a trigger go on the stack?

| Question | Primary | Secondary |
|---|---|---|
| When are waiting triggers placed on the stack? | `L04_Trigger_engine` (§3 engine loop) | `L06_117_t` (117.5) |
| Stack ordering for multiple simultaneous triggers | `L04_Trigger_engine` | `L10_Variant_800to811_t` (§4 APNAP) |
| Trigger fired from a permanent that has since left — LKI? | `L04_Trigger_603_seg2_t` | `L07_108to113_t` (LKI) |

## C3. "When [card] dies" and zone-change triggers

| Question | Primary | Secondary |
|---|---|---|
| "Dies" — what exactly does it mean? | `L07_700_t` (§3 defined terms) | `L04_Trigger_603_seg1_t` |
| ETB trigger — when does it fire? | `L04_Trigger_603_seg1_t` | `L03_Event_614to616_t` (ETB replacement effects apply first) |
| LTB trigger — does it fire if permanent is replaced? | `L04_Trigger_603_seg1_t` | `L03_Event_614to616_t` |
| Commander dies — which triggers fire, what order? | `L10_Variant_903_t` (§6 — 903.9a SBA) | `L04_Trigger_engine`, `L05_StateEnforcement_704_t` |

---

# D. STATE-BASED ACTIONS (SBAs)

## D1. Does an SBA apply right now?

| Question | Primary | Secondary |
|---|---|---|
| Full SBA list and conditions | `L05_StateEnforcement_704_t` | `L05_StateEnforcement_704_v` |
| Creature with lethal damage — destroyed? | `L05_StateEnforcement_704_t` | `L06_118to121_t` (§3.3 damage marking) |
| Creature with deathtouch damage — destroyed? | `L05_StateEnforcement_704_t` | `L07_702_v` (702.2 deathtouch) |
| Creature at 0 or less toughness? | `L05_StateEnforcement_704_t` | `L07_300to315_t` (302.4) |
| Planeswalker at 0 loyalty? | `L05_StateEnforcement_704_t` | `L07_300to315_t` (§2.4) |
| Player at 0 or less life — lose? | `L09_Constraint_100to104_t` (§5.1) | `L05_StateEnforcement_704_t` (704.5a) |
| Player at 10+ poison counters? | `L05_StateEnforcement_704_t` (704.5c) | `L07_122to123_t` (§1.1 poison) |
| Legend rule — two same-name legendaries? | `L05_StateEnforcement_704_t` (704.5j) | `L07_200to213_t` (§4.2 supertypes) |
| Aura enchanting illegal object? | `L07_300to315_t` (§2.3 Auras) | `L05_StateEnforcement_704_t` (704.5m) |

## D2. Commander-specific SBAs

| Question | Primary | Secondary |
|---|---|---|
| Commander damage — 21 from same commander? | `L10_Variant_903_t` (§7) | `L05_StateEnforcement_704_t` (Commander addendum) |
| Commander in graveyard/exile — can it return? | `L10_Variant_903_t` (§6.1 — 903.9a) | `L05_StateEnforcement_704_t` (Commander addendum) |
| Commander would go to hand/library — replaced? | `L10_Variant_903_t` (§6.2 — 903.9b replacement effect) | `L03_Event_614to616_t` |

## D3. SBA timing and process

| Question | Primary | Secondary |
|---|---|---|
| When are SBAs checked? | `L05_StateEnforcement_704_t` (§ SBA timing) | `L00_Orchestration_game_engine` (§3.7) |
| SBAs and triggers — what order? | `L00_Orchestration_game_engine` (§3.7–3.10) | `L05_StateEnforcement_704_t` |
| Multiple SBAs at once — all simultaneous? | `L05_StateEnforcement_704_t` | `L09_Constraint_100to104_t` (§5.3) |

---

# E. DAMAGE, LIFE, AND COSTS

## E1. Damage

| Question | Primary | Secondary |
|---|---|---|
| What does damage do to a creature? | `L06_118to121_t` (§3.2 damage table) | `L05_StateEnforcement_704_t` (SBAs) |
| What does damage do to a player? | `L06_118to121_t` (§3.2) | `L06_118to121_t` (§2 life) |
| Lifelink — when does life gain happen? | `L06_118to121_t` (§3.4) | `L07_702_v` (702.15 lifelink) |
| Deathtouch — how much damage is lethal? | `L07_702_v` (702.2) | `L06_118to121_t` (§3.4), `L05_StateEnforcement_704_t` |
| Damage prevention — when does it apply? | `L06_118to121_t` (§3.5) | `L03_Event_614to616_t` (prevention effects) |
| Combat damage — how is it assigned? | `L06_118to121_t` (§3.8) | `L02_Time_500to514_t` (combat damage step) |
| Commander damage — how is it tracked? | `L10_Variant_903_t` (§7) | `L06_118to121_t` (§3) |

## E2. Life

| Question | Primary | Secondary |
|---|---|---|
| Gaining life vs. dealing damage vs. losing life — what triggers? | `L06_118to121_t` (§2) | `L04_Trigger_engine` |
| Paying life vs. losing life — same thing? | `L06_118to121_t` (§2.4) | `L06_118to121_t` (§2.3) |
| Starting life total in Commander | `L10_Variant_903_t` (§4) | `L09_Constraint_100to104_t` (§4) |

## E3. Costs

| Question | Primary | Secondary |
|---|---|---|
| Cost calculation and lock-in | `L06_601_seg1_t` (§2.6) | `L06_118to121_t` (§1) |
| Unpayable costs — what happens? | `L06_118to121_t` (§1.4) | `L06_601_seg2_t` |
| Cost reducers and increases | `L06_118to121_t` (§1.9) | `L06_601_seg1_t` (§2.6) |
| Paying {0} — is that a real cost? | `L06_118to121_t` (§1.5) | `L07_105_107_v` (107.4d) |

---

# F. KEYWORDS

## F1. What does this keyword do?

| Question | Primary | Secondary |
|---|---|---|
| Look up any keyword ability definition | `L07_702_v` (full reference dictionary, 189 keywords) | — |
| Which engine layer does this keyword feed into? | `L07_702_t` (§3 taxonomy table) | relevant layer file |
| Look up any keyword action definition | `L06_701_v` (full reference dictionary) | — |

## F2. Keyword routing by category

| Keyword type | Primary | Secondary |
|---|---|---|
| Evasion ability (flying, menace, trample, etc.) | `L07_702_v` (definition) → `L07_702_t` (→ L8 static) | `L02_Time_500to514_t` (509.1b blockers) |
| Alternative/additional cost keyword (flashback, kicker) | `L07_702_v` → `L07_702_t` (→ L6 casting) | `L06_601_seg1_t` (§2.2) |
| Triggered keyword (prowess, cascade, persist) | `L07_702_v` → `L07_702_t` (→ L4 trigger) | `L04_Trigger_engine` |
| Activated keyword (equip, reconfigure, saddle) | `L07_702_v` → `L07_702_t` (→ L6 activation) | `L06_601_seg2_t` (602) |
| Keyword counter (flying counter, etc.) | `L07_122to123_t` (§1.1 keyword counters) | `L07_702_t` (§6) |

---

# G. CONTINUOUS EFFECTS AND THE LAYER SYSTEM

## G1. What are an object's current characteristics?

| Question | Primary | Secondary |
|---|---|---|
| Full layer application procedure | `L08_611to613_t` (§3) | `L08_611to613_v` |
| What layer does this effect go in? | `L08_611to613_t` (§2.1 layer table) | `L08_604_t` (static abilities) |
| Timestamp ordering — which effect wins? | `L08_611to613_t` (§4) | — |
| Dependency — does this override timestamp order? | `L08_611to613_t` (§5) | — |
| Characteristic-defining ability (CDA) — how applied? | `L08_611to613_t` (§6) | `L08_604_t` (§3) |
| "Loses all abilities" — what survives? | `L08_611to613_t` (§8.3) | — |
| Power/toughness — which effect wins? | `L08_611to613_t` (§2.2 sublayers 7a–7d) | — |
| Text-changing effect — what layer? | `L08_611to613_t` (§7) | `L08_611to613_v` (612) |

## G2. Static abilities

| Question | Primary | Secondary |
|---|---|---|
| When is a static ability active? | `L08_604_t` (§1) | `L08_604_v` |
| Static ability in the command zone (eminence) | `L08_604_t` (§4) | `L04_Trigger_603_seg1_t` |
| Static ability paired with a triggered ability (603.11) | `L08_604_t` (§5) | `L07_607_t` (§4 linking) |

---

# H. COPY EFFECTS AND OBJECT IDENTITY

## H1. Copying objects

| Question | Primary | Secondary |
|---|---|---|
| What does a copy inherit? | `L07_707_t` (§1 copiable values table) | `L07_707_v` (707.2) |
| Copy-on-ETB vs. becoming a copy in play | `L07_707_t` (§2) | — |
| Copy of a spell — does it trigger "when cast"? | `L07_707_t` (§3.1) | `L04_Trigger_engine` |
| Copying a DFC — which face? | `L07_707_t` (§5) | `L07_708to712_t` (§5.4) |
| Copy exception: "except it's 7/7" — how does it work? | `L07_707_t` (§4 exceptions) | — |
| Copying a commander — is the copy also a commander? | `L10_Variant_903_t` (§2.1) | `L07_707_t` |

## H2. Object identity and zone changes

| Question | Primary | Secondary |
|---|---|---|
| New object rule — when does identity reset? | `L07_108to113_t` | `L07_400to408_t` (400.7) |
| Last known information (LKI) — what is it? | `L07_108to113_t` | `L04_Trigger_603_seg2_t` |
| Does an object "remember" what it was? | `L07_108to113_t` | `L07_607_t` (linked abilities) |

---

# I. ZONES

## I1. Zone-change rules

| Question | Primary | Secondary |
|---|---|---|
| What zones exist and what are their properties? | `L07_400to408_t` | `L07_400to408_v` |
| Public vs. hidden zones — what can be looked at? | `L07_400to408_t` (§2) | — |
| Object moves zones — what happens to its state? | `L07_400to408_t` (§3 — 400.7) | `L07_122to123_t` (§2 counters reset) |
| Counters survive a zone change? | `L07_122to123_t` (§2) | `L07_400to408_t` |
| Stickers survive a zone change? | `L07_122to123_t` (§5 stickers) | — |

## I2. The command zone

| Question | Primary | Secondary |
|---|---|---|
| What lives in the command zone? | `L07_400to408_t` | `L10_Variant_903_t` (§6) |
| Commander zone return — how does it work? | `L10_Variant_903_t` (§6.1–6.2) | `L03_Event_614to616_t` (replacement effects) |
| Commander cast from command zone — procedure | `L10_Variant_903_t` (§5) | `L06_601_seg1_t` |

---

# J. REPLACEMENT AND PREVENTION EFFECTS

| Question | Primary | Secondary |
|---|---|---|
| How do replacement effects work? | `L03_Event_614to616_t` | `L03_Event_614to616_v` |
| Multiple replacement effects — which applies first? | `L03_Event_614to616_t` | — |
| Shield counters / stun counters / finality counters | `L07_122to123_t` (§1.2) | `L03_Event_614to616_t` |
| Prevention effects — when do they apply? | `L03_Event_614to616_t` | `L06_118to121_t` (§3.5) |
| "If [event] would happen, instead [X]" — replacement or triggered? | `L03_Event_614to616_t` | `L08_604_t` |
| ETB replacement ("enters with X counters") | `L03_Event_614to616_t` | `L07_707_t` (§2.1 copy-on-ETB) |

---

# K. SPECIAL CARD TYPES

| Question | Primary | Secondary |
|---|---|---|
| Double-faced card (DFC) — transformation rules | `L07_708to712_t` (§5) | `L07_708to712_v` |
| Face-down permanent — what are its characteristics? | `L07_708to712_t` (§1) | `L06_116_t` (turning face-up) |
| Split card — mana value in vs. out of stack | `L07_708to712_t` (§2.3) | `L07_708to712_v` |
| Saga — chapter trigger timing | `L07_713to716_t` (§2.2) | `L04_Trigger_engine` |
| Adventure — cast Adventure then cast creature | `L07_713to716_t` (§3) | `L06_601_seg1_t` |
| Class — level activation timing | `L07_713to716_t` (§4.2) | `L06_600to606_t` (602.5d) |
| Mutate — merged permanent rules | `L07_729_t` | `L07_729_v` |
| Prototype — which characteristics apply? | `L07_717to721_t` (§2) | — |

---

# L. COMMANDER-SPECIFIC QUESTIONS

| Question | Primary | Secondary |
|---|---|---|
| Starting life total | `L10_Variant_903_t` (§4) | `L09_Constraint_100to104_t` |
| Commander designation — what follows the card? | `L10_Variant_903_t` (§2) | — |
| Commander tax — calculation | `L10_Variant_903_t` (§5, §10) | `L06_118to121_t` |
| Commander damage — tracking and SBA | `L10_Variant_903_t` (§7) | `L05_StateEnforcement_704_t` (addendum) |
| Commander zone return (graveyard/exile) | `L10_Variant_903_t` (§6.1) | `L05_StateEnforcement_704_t` |
| Commander zone return (hand/library) | `L10_Variant_903_t` (§6.2) | `L03_Event_614to616_t` |
| Partner — two commanders, color identity | `L10_Variant_903_t` (§11) | `L07_702_v` (702.124 partner) |
| Color identity — what counts? | `L10_Variant_903_t` (§3) | `L07_708to712_t` (§5.2 DFC) |
| Players leaving mid-game in Commander | `L10_Variant_800to811_t` (§5) | — |
| Attacking in 4-player — Attack Multiple Players | `L10_Variant_800to811_t` (§3) | `L02_Time_500to514_t` (508–509) |
| APNAP with 4 players | `L10_Variant_800to811_t` (§4) | `L09_Constraint_100to104_t` (101.4) |
| "Opponent" — means one or all three? | `L10_Variant_800to811_t` (§2) | `L10_Variant_903_t` (§8.2) |

---

# M. CONSTRAINT AND GOLDEN RULES

| Question | Primary | Secondary |
|---|---|---|
| "Can't" overrides "can" — unconditionally? | `L09_Constraint_100to104_t` (§2.2) | `L09_Constraint_t` (§5) |
| Impossible instruction — what happens? | `L09_Constraint_100to104_t` (§2.3 — 101.3) | — |
| Illegal action — game rewinds to when? | `L09_Constraint_t` (§4) | `L09_Constraint_731to732_v` |
| A player would win and lose simultaneously | `L09_Constraint_100to104_t` (§5.5 — 104.5) | — |
| Multiple players lose simultaneously | `L09_Constraint_t` (§6) | `L10_Variant_800to811_t` |
| One player controls another player | `L09_Constraint_722_v` | `L09_Constraint_t` (§1) |

---

# N. MECHANICS IN COMMANDER PLAY

| Question | Primary | Secondary |
|---|---|---|
| The Monarch — who gets it, what does it do? | `L10_Variant_724to730_t` (§1) | `L04_Trigger_engine` |
| The Initiative — venturing into Undercity | `L10_Variant_724to730_t` (§2) | — |
| Day/Night — how does it change? | `L10_Variant_724to730_t` (§4) | `L07_702_v` (702.145 daybound) |
| Rad counters — when do they trigger? | `L10_Variant_724to730_t` (§3) | `L07_122to123_v` (122.1i) |
| Saga completing — when is it sacrificed? | `L07_713to716_t` (§2.2) | `L05_StateEnforcement_704_t` (704.5n) |

---

# O. ENGINE ORCHESTRATION

| Question | Primary | Secondary |
|---|---|---|
| Full engine loop — start to finish | `L00_Orchestration_game_engine` | — |
| State assessor — how does the engine decide current characteristics? | `L00_Orchestration_state_assessor` | `L08_611to613_t` |
| What happens between any two game events? | `L00_Orchestration_game_engine` (§3.6–3.12) | `L06_117_t` |

---

# FILE SHORTHAND INDEX

For brevity, the tables above use shortened file names. Full names:

| Shorthand | Full filename |
|---|---|
| `L00_Orchestration_game_engine` | `L00_Orchestration_game_engine.md` |
| `L00_Orchestration_state_assessor` | `L00_Orchestration_state_assessor.md` |
| `L02_Time_500to514_t/v` | `L02_Time_500to514_t/v.md` |
| `L02_Time_703_t` | `L02_Time_703_t.md` |
| `L03_Event_609to610_t` | `L03_Event_609to610_t.md` |
| `L03_Event_614to616_t/v` | `L03_Event_614to616_t/v.md` |
| `L04_Trigger_engine` | `L04_Trigger_engine.md` |
| `L04_Trigger_603_seg1/2_t` | `L04_Trigger_603_seg1_t.md` / `seg2_t.md` |
| `L05_StateEnforcement_704_t/v` | `L05_StateEnforcement_704_t/v.md` |
| `L06_106_t` | `L06_PlayerAction_106_t.md` |
| `L06_114to115_t/v` | `L06_PlayerAction_114to115_t/v.md` |
| `L06_116_t` | `L06_PlayerAction_116_t.md` |
| `L06_117_t/v` | `L06_PlayerAction_117_t/v.md` |
| `L06_118to121_t/v` | `L06_PlayerAction_118to121_t/v.md` |
| `L06_600to606_t` | `L06_PlayerAction_600to606_t.md` |
| `L06_601_seg1_t/v` | `L06_PlayerAction_601_seg1_t/v.md` |
| `L06_601_seg2_t/v` | `L06_PlayerAction_601_seg2_t/v.md` |
| `L06_608_t` | `L06_PlayerAction_608_t.md` |
| `L06_701_v` | `L06_PlayerAction_701_v.md` |
| `L06_723_t` | `L06_PlayerAction_723_t.md` |
| `L07_105_107_t/v` | `L07_ObjectModel_105_107_t/v.md` |
| `L07_108to113_t/v` | `L07_ObjectModel_108to113_t/v.md` |
| `L07_122to123_t/v` | `L07_ObjectModel_122to123_t/v.md` |
| `L07_200to213_t` | `L07_ObjectModel_200to213_t.md` |
| `L07_300to315_t/v` | `L07_ObjectModel_300to315_t/v.md` |
| `L07_400to408_t/v` | `L07_ObjectModel_400to408_t/v.md` |
| `L07_607_t` | `L07_ObjectModel_607_t.md` |
| `L07_700_t` | `L07_ObjectModel_700_t.md` |
| `L07_702_v` | `L07_ObjectModel_702_v.md` |
| `L07_702_t` | `L07_ObjectModel_702_t.md` |
| `L07_707_t/v` | `L07_ObjectModel_707_t/v.md` |
| `L07_708to712_t/v` | `L07_ObjectModel_708to712_t/v.md` |
| `L07_713to716_t` | `L07_ObjectModel_713to716_t.md` |
| `L07_717to721_t` | `L07_ObjectModel_717to721_t.md` |
| `L07_729_t/v` | `L07_ObjectModel_729_t/v.md` |
| `L08_604_t/v` | `L08_ContinuousEffects_604_t/v.md` |
| `L08_611to613_t/v` | `L08_ContinuousEffects_611to613_t/v.md` |
| `L09_Constraint_100to104_t/v` | `L09_Constraint_100to104_t/v.md` |
| `L09_Constraint_t` | `L09_Constraint_t.md` |
| `L09_Constraint_722_v` | `L09_Constraint_722_v.md` |
| `L09_Constraint_731to732_v` | `L09_Constraint_731to732_v.md` |
| `L10_Variant_724to730_t` | `L10_Variant_724to730_t.md` |
| `L10_Variant_800to811_t` | `L10_Variant_800to811_t.md` |
| `L10_Variant_900to905_t` | `L10_Variant_900to905_t.md` |
| `L10_Variant_903_t/v` | `L10_Variant_903_t/v.md` |

---

*Last updated: after initial full build + cleanup pass*
*91 codex files | 0 open gaps | 0 stubs*
