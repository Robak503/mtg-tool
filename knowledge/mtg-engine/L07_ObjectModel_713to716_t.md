# Magic: The Gathering — Substitute, Saga, Adventurer, Class: Engine Expansion
## LAYER 7: OBJECT MODEL LAYER — Expansion (Rules 713–716)
## Effective February 27, 2026

---

SOURCES: L07_ObjectModel_713to716_v.md
FEEDS INTO: L04_Trigger_engine.md (Saga chapter triggers, Class level triggers), L06_PlayerAction_601_seg1_t.md (Adventurer casting), L00_Orchestration_game_engine.md

---

# 1. SUBSTITUTE CARDS (Rule 713)

Substitute cards are used in specific casual variants to represent cards with the same name from outside the game. They have no rules relevance in Commander.

---

# 2. SAGA CARDS (Rule 714)

## 2.1 What Sagas Are

Sagas are enchantments that accumulate lore counters each turn and trigger abilities at defined chapter thresholds (rule 107.15). When all chapters have resolved, the Saga is sacrificed.

## 2.2 The Lore Counter Engine

**Entry:** A Saga enters with one lore counter (ETB replacement effect, rule 614.1c).

**Upkeep:** At the beginning of the controller's precombat main phase (not upkeep), one lore counter is added.

**Chapter triggers (107.15a):** Each chapter symbol represents "when one or more lore counters are put on this Saga such that the count transitions from below N to N or above, trigger the chapter N effect." Multiple chapters can trigger in the same event if multiple counters are added at once.

**Final chapter:** When the last chapter's ability is on the stack or has resolved, the Saga is sacrificed as an SBA (704.5n) — specifically, after the last chapter ability resolves.

## 2.3 Read Ahead Sagas (702.155)

Some Sagas have Read Ahead, allowing the controller to enter with as many lore counters as they choose (up to the final chapter). This modifies the ETB replacement to allow more counters, and earlier chapter triggers fire only if the counter placement crosses their threshold.

---

# 3. ADVENTURER CARDS (Rule 715)

## 3.1 The Two-Face Adventure Model

Adventurer cards have a main card and an Adventure — a smaller spell in the lower-left corner with its own name, type, and effect.

## 3.2 Casting the Adventure

A player may cast the Adventure half from their hand as if it were an independent spell (following normal casting rules). The adventure spell has the characteristics of the Adventure text only. When it resolves, the card is exiled (not put in the graveyard).

## 3.3 Casting the Main Card from Exile

After the Adventure resolves and the card is in exile, the owner may cast the main card from exile. The main card is cast using its normal rules (mana cost, timing, etc.). Once cast or if the player can't/doesn't cast it, the card remains in exile.

## 3.4 Identity and Color Identity (903.4e)

The Adventure half's mana symbols count toward color identity in Commander. A creature with a blue Adventure has blue in its color identity even if the creature itself is green.

---

# 4. CLASS CARDS (Rule 716)

## 4.1 Class Structure

Classes are enchantments with levels (using class level bars — rule 107.16). Each level is activated by paying its cost as a sorcery. The class has one static ability per level that applies as long as the class is at or above that level.

## 4.2 Level Activation

A class starts at level 1 when it enters. Paying the level 2 cost advances it to level 2, which unlocks the level 2 static ability. Further payments unlock level 3.

The level activation is an activated ability with sorcery timing restriction (602.5d). It can't be activated at instant speed.

## 4.3 Level Static Abilities

Class static abilities are cumulative in some sense — level 2 classes have both their level 2 ability and their level 1 ability active simultaneously, because "as long as this Class is level N or greater" applies to all levels below N as well.

---

# 5. CROSS-LAYER CONNECTIONS

**→ Layer 4 (Triggers):** Saga chapter triggers fire through standard 603 trigger insertion. Class level activation is an activated ability (602) but generates static effects, not triggers.

**→ Layer 6 (Casting, 601):** Adventures are cast normally following 601. The exile-then-cast-from-exile pathway is an alternative zone for casting — all 601.2a–i steps still apply.

**→ Layer 5 (SBAs):** The final Saga chapter SBA (704.5n) causes sacrifice after the last chapter resolves.

**→ Layer 10 (Commander, 903.4e):** Adventure half mana symbols count in color identity.

---

FEEDS INTO: L04_Trigger_engine.md (Saga chapter triggers, lore counter transitions), L06_PlayerAction_601_seg1_t.md (Adventure casting from exile), L05_StateEnforcement_704_t.md (704.5n Saga sacrifice SBA)
