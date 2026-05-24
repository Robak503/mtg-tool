# Magic: The Gathering — State-Based Actions (SBA)
## ABSOLUTE TRUTH MODULE — REVISED AND DOUBLE-CHECKED
## LAYER 5: STATE ENFORCEMENT LAYER — Expansion (Rule 704)

---

SOURCES: L02_Time_500to514_t.md, L02_Time_703_t.md, L03_Event_614to616_t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v.md, L06_PlayerAction_118to121_t.md, L06_PlayerAction_118to121_v.md, L06_PlayerAction_701_v.md, L07_ObjectModel_105_107_t.md, L07_ObjectModel_108to113_t.md, L07_ObjectModel_122to123_t.md, L07_ObjectModel_122to123_v.md, L07_ObjectModel_200to213_t.md, L07_ObjectModel_300to315_t.md, L07_ObjectModel_300to315_v.md, L07_ObjectModel_400to408_t.md, L07_ObjectModel_702_t.md, L07_ObjectModel_707_t.md, L07_ObjectModel_713to716_t.md, L08_ContinuousEffects_604_t.md, L08_ContinuousEffects_611to613_t.md, L09_Constraint_100to104_t.md, L10_Variant_724to730_t.md, L10_Variant_903_t.md, L10_Variant_903_v.md

# PURPOSE

This module replaces the earlier SBA document.

It is rebuilt directly against the uploaded **Magic: The Gathering Comprehensive Rules** and the revised Stack hub.
The goal here is strict completeness for Rule[704](00_Source_CR_2026-02-27_LINKED.md#704) and its immediately relevant stack timing context.

This document therefore includes:

- every subrule in Rule[704](00_Source_CR_2026-02-27_LINKED.md#704)
- every variant SBA in Rule[[704.6](00_Source_CR_2026-02-27_LINKED.md#704-6)](00_Source_CR_2026-02-27_LINKED.md#704-6)
- Rule[[704.7](00_Source_CR_2026-02-27_LINKED.md#704-7)](00_Source_CR_2026-02-27_LINKED.md#704-7) and [704.8](00_Source_CR_2026-02-27_LINKED.md#704-8)
- stack/priority integration notes where needed
- no skipped subrules, even when small

---

# HOW SBAs FIT INTO THE STACK ENGINE

State-based actions do **not** use the stack.
They are checked whenever a player would get priority.
That means they are part of the timing loop that sits *before* players can cast spells, activate abilities, or take most actions.

The revised Stack hub already reflects this relationship:
- SBAs are checked before priority
- they do not use the stack
- they happen automatically and simultaneously
- if they happen, the game checks again before moving on

See also the orchestration layer for how SBAs integrate with triggers and priority:
- **L04_Trigger_engine.md** — SBA loop integration with trigger insertion (§7)
- **L00_Orchestration_game_engine.md** — SBA loop as checkpoint gate (§3.7–3.8, §8.1)
- **L06_PlayerAction_117_v.md / L06_PlayerAction_117_t.md** — Rule 117.5 (the gate rule that triggers SBA checks)

---

FEEDS INTO: L04_Trigger_engine.md (§7 SBA integration), L00_Orchestration_game_engine.md (§3.7–3.10 SBA checkpoint loop)

---

# RULE 704 — FULL TEXT STRUCTURE

# 704. State-Based Actions
## [704.1](00_Source_CR_2026-02-27_LINKED.md#704-1). State-based actions are game actions that happen automatically whenever certain conditions (listed below) are met. State-based actions don’t use the stack.
## [704.1a](00_Source_CR_2026-02-27_LINKED.md#704-1a) Abilities that watch for a specified game state are triggered abilities, not state-based actions. (See rule[603](00_Source_CR_2026-02-27_LINKED.md#603), “Handling Triggered Abilities.”)
## [704.2](00_Source_CR_2026-02-27_LINKED.md#704-2). State-based actions are checked throughout the game and are not controlled by any player.
## [704.3](00_Source_CR_2026-02-27_LINKED.md#704-3). Whenever a player would get priority (see rule[117](00_Source_CR_2026-02-27_LINKED.md#117), “Timing and Priority”), the game checks for any of the listed conditions for state-based actions, then performs all applicable state-based actions simultaneously as a single event. If any state-based actions are performed as a result of a check, the check is repeated; otherwise all triggered abilities that are waiting to be put on the stack are put on the stack, then the check is repeated. Once no more state-based actions have been performed as the result of a check and no triggered abilities are waiting to be put on the stack, the appropriate player gets priority. This process also occurs during the cleanup step (see rule[514](00_Source_CR_2026-02-27_LINKED.md#514)), except that if no state-based actions are performed as the result of the step’s first check and no triggered abilities are waiting to be put on the stack, then no player gets priority and the step ends.
## [704.4](00_Source_CR_2026-02-27_LINKED.md#704-4). Unlike triggered abilities, state-based actions pay no attention to what happens during the resolution of a spell or ability.
> Example: A player controls Maro, a creature with the ability “Maro’s power and toughness are each equal to the number of cards in your hand” and casts a spell whose effect is “Discard your hand, then draw seven cards.” Maro will temporarily have toughness 0 in the middle of the spell’s resolution but will be back up to toughness 7 when the spell finishes resolving. Thus Maro will survive when state-based actions are checked. In contrast, an ability that triggers when the player has no cards in hand goes on the stack after the spell resolves, because its trigger event happened during resolution.
## [704.5](00_Source_CR_2026-02-27_LINKED.md#704-5). The state-based actions are as follows:
## [704.5a](00_Source_CR_2026-02-27_LINKED.md#704-5a) If a player has 0 or less life, that player loses the game.
## [704.5b](00_Source_CR_2026-02-27_LINKED.md#704-5b) If a player attempted to draw a card from a library with no cards in it since the last time state-based actions were checked, that player loses the game.
## [704.5c](00_Source_CR_2026-02-27_LINKED.md#704-5c) If a player has ten or more poison counters, that player loses the game. Ignore this rule in Two-Headed Giant games; see rule[[704.6b](00_Source_CR_2026-02-27_LINKED.md#704-6b)](00_Source_CR_2026-02-27_LINKED.md#704-6b) instead.
## [704.5d](00_Source_CR_2026-02-27_LINKED.md#704-5d) If a token is in a zone other than the battlefield, it ceases to exist.
## [704.5e](00_Source_CR_2026-02-27_LINKED.md#704-5e) If a copy of a spell is in a zone other than the stack, it ceases to exist. If a copy of a card is in any zone other than the stack or the battlefield, it ceases to exist.
## [704.5f](00_Source_CR_2026-02-27_LINKED.md#704-5f) If a creature has toughness 0 or less, it’s put into its owner’s graveyard. Regeneration can’t replace this event.
## [704.5g](00_Source_CR_2026-02-27_LINKED.md#704-5g) If a creature has toughness greater than 0, it has damage marked on it, and the total damage marked on it is greater than or equal to its toughness, that creature has been dealt lethal damage and is destroyed. Regeneration can replace this event.
## [704.5h](00_Source_CR_2026-02-27_LINKED.md#704-5h) If a creature has toughness greater than 0, and it’s been dealt damage by a source with deathtouch since the last time state-based actions were checked, that creature is destroyed. Regeneration can replace this event.
## [704.5i](00_Source_CR_2026-02-27_LINKED.md#704-5i) If a planeswalker has loyalty 0, it’s put into its owner’s graveyard.
## [704.5j](00_Source_CR_2026-02-27_LINKED.md#704-5j) If two or more legendary permanents with the same name are controlled by the same player, that player chooses one of them, and the rest are put into their owners’ graveyards. This is called the “legend rule.”
## [704.5k](00_Source_CR_2026-02-27_LINKED.md#704-5k) If two or more permanents have the supertype world, all except the one that has had the world supertype for the shortest amount of time are put into their owners’ graveyards. In the event of a tie for the shortest amount of time, all are put into their owners’ graveyards. This is called the “world rule.”
## [704.5m](00_Source_CR_2026-02-27_LINKED.md#704-5m) If an Aura is attached to an illegal object or player, or is not attached to an object or player, that Aura is put into its owner’s graveyard.
## [704.5n](00_Source_CR_2026-02-27_LINKED.md#704-5n) If an Equipment or Fortification is attached to an illegal permanent or to a player, it becomes unattached from that permanent or player. It remains on the battlefield.
## [704.5p](00_Source_CR_2026-02-27_LINKED.md#704-5p) If a battle or creature is attached to an object or player, it becomes unattached and remains on the battlefield. Similarly, if any nonbattle, noncreature permanent that’s neither an Aura, an Equipment, nor a Fortification is attached to an object or player, it becomes unattached and remains on the battlefield.
## [704.5q](00_Source_CR_2026-02-27_LINKED.md#704-5q) If a permanent has both a +1/+1 counter and a -1/-1 counter on it, N +1/+1 and N -1/-1 counters are removed from it, where N is the smaller of the number of +1/+1 and -1/-1 counters on it.
## [704.5r](00_Source_CR_2026-02-27_LINKED.md#704-5r) If a permanent with an ability that says it can’t have more than N counters of a certain kind on it has more than N counters of that kind on it, all but N of those counters are removed from it.
## [704.5s](00_Source_CR_2026-02-27_LINKED.md#704-5s) If the number of lore counters on a Saga permanent with one or more chapter abilities is greater than or equal to its final chapter number and it isn’t the source of a chapter ability that has triggered but not yet left the stack, that Saga’s controller sacrifices it. See rule[714](00_Source_CR_2026-02-27_LINKED.md#714), “Saga Cards.”
## [704.5t](00_Source_CR_2026-02-27_LINKED.md#704-5t) If a player’s venture marker is on the bottommost room of a dungeon card, and that dungeon card isn’t the source of a room ability that has triggered but not yet left the stack, the dungeon card’s owner removes it from the game. See rule[309](00_Source_CR_2026-02-27_LINKED.md#309), “Dungeons.”
## [704.5u](00_Source_CR_2026-02-27_LINKED.md#704-5u) If a permanent with space sculptor and any creatures without a sector designation are on the battlefield, each player who controls one or more of those creatures and doesn’t control a permanent with space sculptor chooses a sector designation for each of those creatures they control. Then, each other player who controls one or more of those creatures chooses a sector designation for each of those creatures they control. See rule[[702.158](00_Source_CR_2026-02-27_LINKED.md#702-158)](00_Source_CR_2026-02-27_LINKED.md#702-158), “Space Sculptor.”
## [704.5v](00_Source_CR_2026-02-27_LINKED.md#704-5v) If a battle has defense 0 and it isn’t the source of an ability that has triggered but not yet left the stack, it’s put into its owner’s graveyard.
## [704.5w](00_Source_CR_2026-02-27_LINKED.md#704-5w) If a battle has no player in the game designated as its protector and no attacking creatures are currently attacking that battle, that battle’s controller chooses an appropriate player to be its protector based on its battle type. If no player can be chosen this way, the battle is put into its owner’s graveyard. See rule[310](00_Source_CR_2026-02-27_LINKED.md#310), “Battles.”
## [704.5x](00_Source_CR_2026-02-27_LINKED.md#704-5x) If a Siege’s controller is also its designated protector, that player chooses an opponent to become its protector. If no player can be chosen this way, the battle is put into its owner’s graveyard. See rule[310](00_Source_CR_2026-02-27_LINKED.md#310), “Battles.”
## [704.5y](00_Source_CR_2026-02-27_LINKED.md#704-5y) If a permanent has more than one Role controlled by the same player attached to it, each of those Roles except the one with the most recent timestamp is put into its owner’s graveyard.
## [704.5z](00_Source_CR_2026-02-27_LINKED.md#704-5z) If a player controls a permanent with start your engines! and that player has no speed, that player’s speed becomes 1. See rule[[702.179](00_Source_CR_2026-02-27_LINKED.md#702-179)](00_Source_CR_2026-02-27_LINKED.md#702-179), “Start Your Engines!”
## [704.6](00_Source_CR_2026-02-27_LINKED.md#704-6). Some variant games include additional state-based actions that aren’t normally applicable:
## [704.6a](00_Source_CR_2026-02-27_LINKED.md#704-6a) In a Two-Headed Giant game, if a team has 0 or less life, that team loses the game. See rule[810](00_Source_CR_2026-02-27_LINKED.md#810), “Two-Headed Giant Variant.”
## [704.6b](00_Source_CR_2026-02-27_LINKED.md#704-6b) In a Two-Headed Giant game, if a team has fifteen or more poison counters, that team loses the game. See rule[810](00_Source_CR_2026-02-27_LINKED.md#810), “Two-Headed Giant Variant.”
## [704.6c](00_Source_CR_2026-02-27_LINKED.md#704-6c) In a Commander game, a player who’s been dealt 21 or more combat damage by the same commander over the course of the game loses the game. See rule[903](00_Source_CR_2026-02-27_LINKED.md#903), “Commander.”
## [704.6d](00_Source_CR_2026-02-27_LINKED.md#704-6d) In a Commander game, if a commander is in a graveyard or in exile and that object was put into that zone since the last time state-based actions were checked, its owner may put it into the command zone. See rule[903](00_Source_CR_2026-02-27_LINKED.md#903), “Commander.” 
## [704.6e](00_Source_CR_2026-02-27_LINKED.md#704-6e) In an Archenemy game, if a non-ongoing scheme card is face up in the command zone, and no triggered abilities of any scheme are on the stack or waiting to be put on the stack, that scheme card is turned face down and put on the bottom of its owner’s scheme deck. See rule[904](00_Source_CR_2026-02-27_LINKED.md#904), “Archenemy.”
## [704.6f](00_Source_CR_2026-02-27_LINKED.md#704-6f) In a Planechase game, if a phenomenon card is face up in the command zone, and it isn’t the source of a triggered ability that has triggered but not yet left the stack, the planar controller planeswalks. See rule[901](00_Source_CR_2026-02-27_LINKED.md#901), “Planechase.”
## [704.7](00_Source_CR_2026-02-27_LINKED.md#704-7). If multiple state-based actions would have the same result at the same time, a single replacement effect will replace all of them.
> Example: You control Lich’s Mirror, which says “If you would lose the game, instead shuffle your hand, your graveyard, and all permanents you own into your library, then draw seven cards and your life total becomes 20.” There’s one card in your library and your life total is 1. A spell causes you to draw two cards and lose 2 life. The next time state-based actions are checked, you’d lose the game due to rule[[704.5a](00_Source_CR_2026-02-27_LINKED.md#704-5a)](00_Source_CR_2026-02-27_LINKED.md#704-5a) and rule[[704.5b](00_Source_CR_2026-02-27_LINKED.md#704-5b)](00_Source_CR_2026-02-27_LINKED.md#704-5b). Instead, Lich’s Mirror replaces that game loss and you keep playing.
## [704.8](00_Source_CR_2026-02-27_LINKED.md#704-8). If a state-based action results in a permanent leaving the battlefield at the same time other state-based actions were performed, that permanent’s last known information is derived from the game state before any of those state-based actions were performed.
> Example: You control Young Wolf, a 1/1 creature with undying, and it has a +1/+1 counter on it. A spell puts three -1/-1 counters on Young Wolf. Before state-based actions are performed, Young Wolf has one +1/+1 counter and three -1/-1 counters on it. After state-based actions are performed, Young Wolf is in the graveyard. When it was last on the battlefield, it had a +1/+1 counter on it, so undying will not trigger.

---

# REVISION NOTES AGAINST THE PRIOR SBA MODULE

The earlier SBA module was **not complete**.
The biggest issues corrected here were:

- the first several [704.5](00_Source_CR_2026-02-27_LINKED.md#704-5) entries were misassigned or out of order
- several core SBAs were missing entirely
- Rule[[704.1a](00_Source_CR_2026-02-27_LINKED.md#704-1a)](00_Source_CR_2026-02-27_LINKED.md#704-1a), [704.2](00_Source_CR_2026-02-27_LINKED.md#704-2), [704.3](00_Source_CR_2026-02-27_LINKED.md#704-3), [704.4](00_Source_CR_2026-02-27_LINKED.md#704-4), [704.7](00_Source_CR_2026-02-27_LINKED.md#704-7), and [704.8](00_Source_CR_2026-02-27_LINKED.md#704-8) were missing
- many [704.5](00_Source_CR_2026-02-27_LINKED.md#704-5) subrules were omitted, including copies, deathtouch, unattaching, counters, dungeon, space sculptor, protector, and speed
- the full variant SBA set in [704.6](00_Source_CR_2026-02-27_LINKED.md#704-6) was not included
- commander-related SBAs needed to be tied to [704.6](00_Source_CR_2026-02-27_LINKED.md#704-6), not only described generally

This revised version is the one you should keep as the codex reference.

---

# PRACTICAL STACK INTEGRATION SUMMARY

Even though this module is now rule-complete, the key operational takeaway remains:

1. A player would get priority.
2. The game checks all applicable SBAs.
3. All applicable SBAs happen simultaneously.
4. If any happened, the game checks again.
5. Then triggered abilities waiting to be put on the stack are put on the stack.
6. If that creates more SBAs or more waiting triggers, the process repeats.
7. Only after that does a player actually get priority.

That loop is why SBAs are one of the core enforcement engines of Magic.

---

# COMMANDER ADDENDUM — SBAs Added by Rule 903/704.6

The Commander variant (rule 903) adds additional SBAs checked at the same time as all standard SBAs. These are found in rule 704.6, which lists SBAs that apply only in certain variants.

## Commander-Specific SBAs (704.6c, 903.9a)

| SBA | Rule | Condition | Result |
|---|---|---|---|
| Commander damage | 704.6c | A player has been dealt 21 or more combat damage by a single commander | That player loses the game |
| Commander zone return | 903.9a | A commander is in a graveyard or exile and was put there since the last SBA check | Its owner may put it into the command zone |

**704.6c — Commander Damage Precision:**
- Tracks cumulative combat damage by a single commander over the entire game
- Only combat damage counts — ability damage from the same commander does not
- Each commander is tracked separately; two partner commanders each have independent counters
- The tracking persists even if the commander leaves the battlefield and returns — it's tracking by the card's commander designation, not by object identity
- Does not apply in Brawl (903.12h)

**903.9a — Command Zone Return as SBA:**
- The commander must have arrived in the graveyard or exile **since the last SBA check**
- The owner is offered a choice at the SBA check point — they may return it or leave it
- This is the SBA version (graveyard/exile). The hand/library version (903.9b) is a replacement effect, not an SBA

**Both are checked simultaneously with all other SBAs** in the standard SBA loop described in section 4 of this file.
