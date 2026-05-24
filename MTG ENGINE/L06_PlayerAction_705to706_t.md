# Magic: The Gathering — Flipping a Coin and Rolling a Die: Engine Expansion
## LAYER 6: PLAYER ACTION LAYER — Expansion (Rules 705–706)
## Effective February 27, 2026

---

SOURCES: L06_PlayerAction_705to706_v.md
FEEDS INTO: L00_Orchestration_game_engine.md

---

# 1. FLIPPING A COIN (Rule 705)

A coin flip is a random binary outcome. The player who causes the flip chooses heads or tails before flipping, then flips. The result is compared to the choice.

Replacement effects can modify coin flips — some effects allow a player to "ignore" a flip and flip again, or to always win coin flips. These apply per the standard replacement effect rules (rule 614).

---

# 2. ROLLING A DIE (Rule 706)

## 2.1 What Rolling a Die Means

"Roll a [die]" means use a random number generator to produce a number from the die's natural range. The standard die for Magic is a d20 (1–20). The number rolled is the result before modifications.

## 2.2 Result Modifications

Effects that add or subtract from die results apply after rolling. The modified result is used for all purposes. If multiple modifications apply, apply them in the order specified or in timestamp order.

## 2.3 "Roll Again" Effects

Some effects allow rerolling. Each reroll is a new die roll — replacement effects on die rolls apply to the new roll as well.

## 2.4 Die Rolls and Probability

A die roll is a random event. No player makes choices that affect the result (other than activating abilities that modify results). Die rolls cannot be responded to before their result is known — the result is determined as part of the resolution of the spell or ability that instructs the roll.

---

FEEDS INTO: L00_Orchestration_game_engine.md (random event handling)
