# Magic: The Gathering — Mana Abilities and Loyalty Abilities: Engine Expansion
## LAYER 6: PLAYER ACTION LAYER — Expansion (Rules 600, 605–606)
## Effective February 27, 2026

---

SOURCES: L06_PlayerAction_106_t.md, L06_PlayerAction_600to606_v.md
FEEDS INTO: L06_PlayerAction_106_t.md (mana pool), L06_PlayerAction_601_seg1_t.md (601.2g mana window), L00_Orchestration_game_engine.md

---

# 1. RULE 600 — GENERAL (Spells and Abilities)

Rule 600 establishes that the rules in 600–608 govern all aspects of spells and abilities. No engine-specific expansion needed beyond what the verbatim provides.

---

# 2. MANA ABILITIES (Rule 605)

## 2.1 The Definition (605.1)

A mana ability is an activated or triggered ability that:
1. Isn't a loyalty ability
2. Could add mana to a player's mana pool as part of its effect
3. Doesn't have a target (for activated abilities) **OR** is a triggered ability that triggers from casting a spell and could add mana

**All three conditions must be met for an activated ability to be a mana ability.** A targeted ability that produces mana is NOT a mana ability — it uses the stack and can be responded to.

## 2.2 Why Mana Abilities Are Special (605.3)

Mana abilities do **not** use the stack. They:
- Resolve immediately when activated or triggered
- Cannot be countered (nothing to counter — they never go on the stack)
- Can be activated even when a player doesn't have priority, specifically during the mana window of 601.2g
- Cannot be responded to with instants or other abilities

**Engine consequence:** When a player activates a mana ability, no priority check occurs. The effect happens, mana enters the pool, and the player continues with whatever they were doing.

## 2.3 Triggered Mana Abilities (605.4)

A triggered ability is a mana ability if:
- It triggers from mana being added to a mana pool, OR
- It triggers from an activated mana ability resolving, AND
- It could add mana as part of its effect

These triggered mana abilities also don't use the stack — they resolve immediately when triggered.

## 2.4 Mana Abilities vs. Other Abilities That Produce Mana

Not every ability that produces mana is a mana ability. The key test is whether it **could** add mana. If an ability produces mana but also has a target, it uses the stack normally and is not a mana ability.

Example: "{T}: Add {G}" — no target, adds mana → mana ability (resolves immediately).
Example: "{T}: Target player adds {G}" — has a target → not a mana ability (uses stack).

---

# 3. LOYALTY ABILITIES (Rule 606)

## 3.1 What Loyalty Abilities Are (606.1)

Loyalty abilities are activated abilities on permanents with loyalty (planeswalkers and some other cards), written with a loyalty symbol ([+N], [-N], or [0]) as the cost.

## 3.2 Loyalty Ability Timing (606.3)

A player may activate a loyalty ability of a permanent they control:
- Any time they have priority
- Only during a main phase of their turn
- Only when the stack is empty
- Only once per permanent per turn (across all its loyalty abilities — not once per ability)

This is a tighter timing restriction than most activated abilities (which only need priority). The once-per-turn rule applies to the permanent as a whole — activating any loyalty ability prevents activating any other loyalty ability of that same permanent that turn.

## 3.3 Loyalty Cost (606.4, 606.5)

The loyalty symbol in the cost adjusts loyalty counters:
- [+N]: Add N loyalty counters as part of the cost
- [-N]: Remove N loyalty counters as part of the cost
- [0]: No change

The loyalty cost is paid **before** the ability goes on the stack, as part of paying costs (601.2h analog). If the permanent doesn't have enough loyalty counters to pay a [-N] cost, the ability cannot be activated.

**Engine consequence:** Unlike most activated ability costs which are checked at 601.2e/f, loyalty costs are paid when the ability is announced — loyalty changes happen immediately as the cost.

## 3.4 Modifying Loyalty Costs (606.6)

Some effects modify how much the loyalty cost changes. Effects that say "the next loyalty ability you activate costs {+N} more" or "costs {−N} more" modify the loyalty counter adjustment — not a mana cost.

---

# 4. CROSS-LAYER CONNECTIONS

**→ Layer 6 (106 — Mana):** Rule 605 defines what produces mana; rule 106 defines what the mana pool is and how it works. They are tightly paired.

**→ Layer 6 (601.2g):** Mana abilities are the only abilities that can be activated during the 601.2g mana window. Non-mana activated abilities cannot be activated during this window.

**→ Layer 7 (300–315 — Planeswalkers):** Loyalty abilities are specific to planeswalkers (and battle-adjacent cards). Rule 306.5d references rule 606.

**→ Layer 4 (Triggers):** Triggered mana abilities (605.4) resolve immediately without going on the stack — they are exceptions to the standard 603 trigger insertion process.

---

FEEDS INTO: L06_PlayerAction_106_t.md (mana pool), L06_PlayerAction_601_seg1_t.md (601.2g mana window), L07_ObjectModel_300to315_t.md (planeswalker loyalty)
