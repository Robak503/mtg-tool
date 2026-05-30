# Magic: The Gathering — Resolving Spells and Abilities
## ABSOLUTE TRUTH MODULE — SEGMENT 6 EXPANSION
## LAYER 6: PLAYER ACTION LAYER — Expansion (Rule 608)
## Effective February 27, 2026

---

# PURPOSE

This module is the precision expansion layer for rule 608. It defines the complete resolution process for instant spells, sorcery spells, abilities, and permanent spells — including the target legality check, instruction execution, LKI rules during resolution, and the final act of removing the object from the stack.

SOURCES: L06_PlayerAction_114to115_t.md, L06_PlayerAction_114to115_v.md, L06_PlayerAction_601_seg2_t.md, L06_PlayerAction_608_v.md
FEEDS INTO: L04_Trigger_engine.md, L00_Orchestration_game_engine.md

---

# 1. WHAT RESOLUTION IS

Resolution is the process of executing the top stack object's instructions. It begins when all players pass in succession (rule 608.1 / rule 117.4) and ends when the object has finished its instructions and has been removed from the stack or has entered the battlefield.

**Resolution is not priority.** No player holds priority during resolution (rule 117.2e). Players cannot cast spells or activate non-mana abilities in the middle of resolution. Mana abilities remain activatable for paying costs.

**Resolution is not continuous.** It proceeds as a single uninterrupted process. Once a spell or ability starts resolving, it resolves fully (rule 608.2m) — it cannot be interrupted by another action mid-resolution. New spells and abilities triggered or created during resolution wait until resolution ends, then follow the standard 117.5 checkpoint process.

---

# 2. RESOLUTION OF INSTANT SPELLS, SORCERY SPELLS, AND ABILITIES

Rule 608.2 governs all three. The process runs in a fixed order: 608.2a → 608.2b first, then 608.2c–m in any appropriate order, then 608.2n and 608.2p last.

## 2.1 Step 1: Intervening-If Check (608.2a)

If the resolving triggered ability has an intervening-if clause ("Whenever X, if Y, [effect]"), the condition Y is checked first.

- If Y is false, the ability is removed from the stack and does nothing.
- If Y is true, resolution continues.

This is the second check of the intervening-if condition. The first check occurred at trigger time (rule 603.4). Both must be true for the effect to execute. This check is applied only to triggered abilities, not to spells.

## 2.2 Step 2: Target Legality Check (608.2b)

If the resolving object has targets, each target is checked for legality.

**A target is illegal if:**
- It is no longer in the zone it was in when targeted
- Its characteristics have changed in a way that makes it no longer match the targeting requirement
- An effect has changed the text of the targeting restriction

**LKI during 608.2b:** If the source of a triggered ability has left its zone, its last known information is used during the legality check. The source's characteristics at the time it last existed in its expected zone are used to evaluate the spell or ability.

**All targets illegal:** If every instance of the word "target" is now illegal, the spell or ability does not resolve. It is removed from the stack (abilities) or put into its owner's graveyard (spells). The distinction is important — spells go to the graveyard; abilities simply cease to exist on the stack.

**Some targets illegal:** If at least one target is still legal, the spell or ability resolves normally, but illegal targets are not affected by parts of the effect that require those specific targets. Other parts of the effect that don't require those targets may still apply. This is the partial-resolution rule.

## 2.3 Main Instruction Execution (608.2c)

The controller of the resolving object follows its instructions in the order written. Replacement effects may modify these actions as they occur. Instructions that are impossible to follow are ignored (rule 101.3).

**Important:** Later text may modify earlier text. A card that says "Destroy target creature. It can't be regenerated" means the regeneration shield does not apply to the destruction instruction — not that destruction happens first and regeneration happens second. Read the full card text as a unified statement.

## 2.4 Choices Made During Resolution (608.2d)

Any choices not already made during casting or activation are announced during resolution. The controller cannot choose illegal or impossible options.

**Division and distribution:** If an effect distributes damage, counters, or other quantities among any number of untargeted objects or players, the controller decides the amounts and divisions during resolution, with each chosen object or player receiving at least one. Compare to targeted distribution: if the distribution was across targeted objects, the amounts were fixed at cast time (rule 601.2d) and are not re-chosen now.

## 2.5 Multi-Player Instructions (608.2e, 608.2f)

If a resolution involves choices by multiple players, APNAP order governs the choice sequence, followed by simultaneous processing of each step. If simultaneous processing is impossible (one action depends on the result of another for the same player's objects), the player controlling the resolving spell decides the relative order.

## 2.6 Mana Payments and Nested Casting During Resolution (608.2g)

A player may activate mana abilities during resolution when an effect asks for a mana payment.

If an effect specifically allows or instructs a player to cast a spell during resolution, that spell is cast following the normal 601.2a–i procedure, except no player receives priority after it is cast. The new spell sits on top of the stack. The currently resolving object continues to resolve after the nested casting is complete. Multiple spells can be cast this way.

No other spells or non-mana abilities can be cast or activated during resolution.

## 2.7 Information Check During Resolution (608.2h)

When an effect requires information from the game, the answer is determined once, at the moment the effect is applied. The game state at that exact moment is used.

**LKI during resolution:** If the object whose information is needed has left its expected zone, or has been moved to a hidden zone, the effect uses the object's last known information — its characteristics as of when it last existed in the zone it was expected to be in.

## 2.8 Look-Back-in-Time Information (608.2i)

Some effects require information about previous game states or actions. For these effects, the referenced objects do not need to currently be in the relevant zone or meet the current criteria — only that they met those criteria at the specified time. This is an explicit exception to the 608.2h "information at time of application" rule.

## 2.9 Final Step: Remove from Stack (608.2n)

As the final act of resolution:
- An instant or sorcery spell is put into its owner's graveyard
- An ability is removed from the stack and ceases to exist

This is not a zone-change trigger event for the spell itself — the spell going to the graveyard from the stack during resolution may trigger abilities that look for cards entering the graveyard (check the specific trigger wording).

## 2.10 Post-Resolution Triggers (608.2p)

After all steps in 608.2c–n are complete, any abilities that trigger "when [this spell or ability] resolves" trigger. These enter the waiting state and are placed on the stack at the next 117.5 checkpoint.

---

# 3. RESOLUTION OF PERMANENT SPELLS

Rule 608.3 governs permanents (creatures, artifacts, enchantments, planeswalkers, lands, battles). The permanent enters the battlefield rather than going to the graveyard.

## 3.1 No Targets (608.3a)

If the permanent spell has no targets, it simply enters the battlefield under its controller's control. Replacement effects that modify how it enters apply at this time (rule 614.12).

## 3.2 Has Targets (608.3b)

If the permanent spell has a target, target legality is checked per 608.2b:
- If the target is legal, the permanent enters the battlefield attached to, targeting, or otherwise associated with that target.
- If the target is illegal, the permanent spell does not resolve and goes to its owner's graveyard.

**Exception — Bestow Auras:** A bestowed Aura spell with an illegal target becomes a creature spell and resolves as a creature (608.3a).
**Exception — Mutating spells:** A mutating creature spell with an illegal target becomes a regular creature spell and resolves as a creature (608.3a).

## 3.3 Aura Spells (608.3c)

An Aura spell enters the battlefield attached to the player or object it was targeting.

## 3.4 Permanent Cannot Enter (608.3e)

If the permanent spell resolves but its controller cannot put it onto the battlefield (due to a "can't enter" effect), it goes to its owner's graveyard instead.

## 3.5 Delayed Triggers Created on Entry (608.3g)

If a permanent spell's static ability creates a delayed triggered ability (such as Dash, Blitz, or Warp), that delayed triggered ability is created at the moment the permanent enters the battlefield during resolution.

---

# 4. THE THREE WAYS A TRIGGERED ABILITY LEAVES THE STACK

This is a critical precision distinction, relevant to the failure matrix in L04_Trigger_engine.md:

| Method | Rule | What happens |
|---|---|---|
| Removed at insertion (no legal mode or no legal targets at insertion time) | 603.3c, 603.3d | Removed by rule before becoming a stack object; never resolves |
| Countered by a spell or ability | 701.5 | Removed by an effect; its own effects do not happen |
| Countered by game rules (all targets illegal at resolution) | 608.2b | Removed by rule at resolution; its own effects do not happen |
| Intervening-if fails at resolution | 608.2a | Removed by rule at resolution; its own effects do not happen |
| Resolves normally | 608.2n | Removed from stack after full execution |

These five outcomes are mutually exclusive. "Countered by a spell/ability" and "countered by game rules" are both labeled "countered" in casual usage but have distinct causes and may interact differently with effects that check whether a spell or ability "was countered."

---

# 5. LKI DURING RESOLUTION: THE COMPLETE MODEL

Last known information (LKI) is used in two distinct situations during resolution:

**Situation 1 (608.2b — target legality check):**
If the source of a triggered ability has left its zone, LKI is used to evaluate whether the targeting requirement is still met.

**Situation 2 (608.2h — information check during execution):**
If an effect requires information about an object that has left its expected zone, LKI provides that information. Example: "Deal damage equal to [this creature's power]" — if the creature has left the battlefield, its last known power is used.

**Situation 3 (608.2i — look-back exception):**
Some effects explicitly look at a past game state, not the current one. These are not LKI in the strict sense — the rule 608.2i exception is broader and does not require the object to have been in a zone.

---

# 6. RESOLUTION AND TRIGGERS

During resolution:
- Triggered abilities may trigger (117.2a)
- Delayed triggered abilities may be created (603.7)
- Reflexive triggered abilities may be created and immediately checked (603.12)

None of these are placed on the stack during resolution. They wait in the waiting state until resolution ends, then the 117.5 checkpoint process runs.

After resolution:
1. 608.2n: resolving object is removed from stack
2. 608.2p: any "when this resolves" triggers fire and enter waiting state
3. 117.3b: active player would receive priority
4. 117.5: SBA loop runs, then all waiting triggers are placed on stack
5. If stable, active player receives priority

---

# FINAL STATEMENT

Rule 608 is the resolution ruleset. It defines:
- The order of the resolution process (608.2 sequence)
- The intervening-if re-check at resolution (608.2a)
- The target legality check and partial-resolution rule (608.2b)
- LKI during execution (608.2h) and the look-back exception (608.2i)
- The final removal of the resolved object from the stack (608.2n)
- The post-resolution trigger window (608.2p)
- Resolution of permanent spells and their ETB process (608.3)

The three failure modes for triggered abilities on the stack (removed at insertion / countered by effect / countered by game rules) are distinct categories with distinct rules and should not be conflated.
