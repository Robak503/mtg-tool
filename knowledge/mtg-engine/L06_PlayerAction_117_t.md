# Magic: The Gathering — Timing and Priority
## ABSOLUTE TRUTH MODULE — SEGMENT 5 EXPANSION
## LAYER 6: PLAYER ACTION LAYER — Expansion (Rule 117)
## Effective February 27, 2026

---

# PURPOSE

This module is the precision expansion layer for rule 117. It defines the complete operational model for the priority system — who can act, when, and under what conditions — and integrates that model with the SBA loop, trigger insertion, stack management, and turn structure.

SOURCES: L02_Time_500to514_t.md, L02_Time_703_t.md, L04_Trigger_engine.md, L06_PlayerAction_116_t.md, L06_PlayerAction_116_v.md, L06_PlayerAction_117_v.md, L06_PlayerAction_601_seg1_t.md, L06_PlayerAction_601_seg2_t.md, L07_ObjectModel_108to113_t.md, L10_Variant_800to811_t.md, L10_Variant_800to811_v.md
FEEDS INTO: L04_Trigger_engine.md, L00_Orchestration_game_engine.md

---

# 1. THE CORE PRIORITY MODEL

## 1.1 Priority as the Gate for Player Action

Priority is the game's mechanism for determining when players may act. Only the player who currently holds priority may:
- Cast spells
- Activate activated abilities (other than mana abilities)
- Take special actions

Players without priority cannot do any of these things, regardless of what is happening in the game. This includes the nonactive player during their opponent's turn, and any player during resolution of a spell or ability.

## 1.2 Mana Abilities Are Exception to Priority

Mana abilities (rule 605) are the one category of activated ability that bypasses the normal priority requirement. A player may activate a mana ability:
- When they have priority (standard case)
- When they are in the process of casting a spell or activating an ability that requires mana payment
- When any rule or effect asks for a mana payment

This means mana abilities can be activated in the middle of paying costs, even though no player has priority at that moment. This exception is deliberately narrow — it applies only to mana abilities, not to all activated abilities.

---

# 2. WHAT DOES NOT USE PRIORITY

Rule 117.2 defines several game actions and effects that happen without any player holding priority:

| Action type | Priority used? | Timing |
|---|---|---|
| Triggered abilities triggering | No | At any time, including during resolution |
| Static abilities operating | No | Continuously — always active |
| Turn-based actions | No | At the start/end of steps and phases |
| State-based actions | No | Each time a player would receive priority |
| Actions during resolution | No | Players follow instructions, not priority |
| Mana ability activation | No (special rule) | When paying costs or when asked for mana |

**Critical note on triggered abilities (117.2a):** The moment of triggering does not use priority and does not create a stack object. Nothing happens at the time a trigger fires. The trigger enters the waiting state. The waiting state is not the stack. The trigger only reaches the stack the next time a player would receive priority, via the 117.5 checkpoint process.

---

# 3. THE 117.5 CHECKPOINT — THE MASTER GATE

Rule 117.5 is the single most important rule in the priority system for judge adjudication. It is the gate that must be passed before any player receives priority at any checkpoint.

## 3.1 The 117.5 Process (Verbatim Operational Model)

Each time a player would get priority:

**Step 1:** Perform all applicable state-based actions simultaneously as a single event.

**Step 2:** Repeat step 1 until no state-based actions are performed in a check.

**Step 3:** Put all waiting triggered abilities on the stack per the 603.3b two-part APNAP process.

**Step 4:** Repeat steps 1–3 (check SBAs again, then insert any new triggers) until no SBAs are performed and no triggers are waiting.

**Step 5:** The player who would have received priority now does so.

## 3.2 Why This Matters

This means that "a player receives priority" is a stable state that cannot be reached while:
- Any state-based action remains applicable
- Any triggered ability is in the waiting state

Priority is never "given early." It is given only after full stability is confirmed. The loop is iterative, not linear.

## 3.3 117.5 vs 117.3a — Not the Same Thing

117.3a says *who* gets priority at the start of steps/phases (active player, after turn-based actions and beginning-of-step triggers). 117.5 says *what happens before* anyone gets priority at any checkpoint. These work together: 117.3a identifies the priority recipient and timing; 117.5 runs the stability check before handing priority to that player.

---

# 4. WHEN PRIORITY IS GIVEN

## 4.1 Beginning of Most Steps and Phases (117.3a)

The active player gets priority at the beginning of most steps and phases, after:
1. Turn-based actions for that step/phase have been performed
2. Abilities that trigger "at the beginning of" that step/phase have been put on the stack (via 117.5)

Two exceptions:
- **Untap step:** No player receives priority at all. Triggers that fire during untap wait for the next priority checkpoint (upkeep).
- **Cleanup step:** Players usually do not receive priority. Exception: if any SBAs are performed or any triggered abilities are waiting after cleanup's turn-based actions (hand size discard, damage removal), the 117.5 process runs and priority is given. If that happens, after the stack empties and all players pass, another cleanup step begins.

## 4.2 After a Spell or Ability Resolves (117.3b)

The active player receives priority after each resolution, after the 117.5 stability check.

## 4.3 After Casting, Activating, or Taking a Special Action (117.3c)

The same player who had priority when they acted receives priority again afterward. This means a player can cast a spell and then immediately cast another spell in response to their own spell — they get priority back after casting.

## 4.4 Passing Priority (117.3d)

When a player chooses not to act and passes priority:
- If they have mana in their pool, they announce it
- Priority passes to the next player in turn order

---

# 5. PASSING AND RESOLUTION

## 5.1 When All Players Pass in Succession (117.4)

If all players pass in succession without anyone taking an action between passes:
- **Stack is nonempty:** Top object resolves
- **Stack is empty:** Current phase or step ends

"In succession" is critical — if any player acts between passes (casts a spell, activates an ability), the succession is broken and all players must pass again for the stack to progress.

## 5.2 "In Response To" (117.7)

When a player casts a spell or activates an ability while another spell or ability is already on the stack, the new object has been cast or activated "in response to" the earlier one. The new object sits on top of the stack and resolves first. This is the standard LIFO (last in, first out) stack model.

---

# 6. WHAT PRIORITY DOES NOT DO

Understanding priority failures prevents adjudication errors:

**Priority does not:**
- Prevent triggered abilities from triggering (they trigger regardless)
- Prevent SBAs from happening (they happen before priority, not during it)
- Give players a window to respond to SBAs directly (SBAs happen automatically)
- Give players a window during resolution (117.2e — no priority during resolution)
- Allow players to "respond to" entering the waiting state (triggers are not on the stack while waiting)

**Players can only respond to triggered abilities after they have been placed on the stack** — which only happens at the next priority checkpoint, after SBAs have stabilized.

---

# 7. PRIORITY IN MULTIPLAYER (117.6)

In multiplayer games not using the shared team turns option, priority passes through players in turn order (APNAP). In a game using the shared team turns option (rule 805), teams have priority rather than individual players.

The 603.3b APNAP trigger insertion process uses the same turn order as priority passing. This means the active player always places their triggers first (in both parts of the two-part process), followed by each nonactive player in turn order.

---

# 8. INTEGRATION WITH OTHER MODULES

## 8.1 Rule 117 → Rule 603 (Triggers)

117.2a establishes that triggered abilities enter the waiting state when they trigger but are not put on the stack until 117.5 runs. 603.3 defines how they are placed. The two rules are complementary: 117.5 is the timing gate, 603.3b is the ordering and insertion procedure.

## 8.2 Rule 117 → Rule 704 (SBAs)

117.2d establishes that SBAs happen before a player would receive priority. 117.5 is the rule that integrates SBAs and trigger insertion into the checkpoint structure. The SBA module (files 07/08) defines what SBAs are; 117.5 defines when they run.

## 8.3 Rule 117 → Rule 608 (Resolution)

117.2e establishes that no player has priority during resolution. 117.3b establishes that the active player receives priority after each resolution. 608 defines what resolution actually does. Together, these rules create the resolution → checkpoint → priority cycle that is the heartbeat of the game engine.

## 8.4 Rule 117 → Rule 116 (Special Actions)

117.1c references rule 116 for special actions. Special actions (turning face-down creatures face up, taking the initiative, etc.) can be taken at any time a player has priority, or in some cases only during main phases with an empty stack.

---

# FINAL STATEMENT

Rule 117 is the top-level orchestration rule for the priority system. Every "player receives priority" event in the game is governed by 117.3, and every checkpoint before that event is governed by 117.5. The SBA loop, trigger insertion, and resolution cycle are all components of the 117.5 process.

Key rules for immediate adjudication:
- Can a player act right now? → Do they have priority? (117.1)
- When does the trigger go on the stack? → Next time 117.5 runs (117.2a)
- What happens before any player gets priority? → 117.5 iterative loop
- When does the stack resolve? → When all players pass in succession with nonempty stack (117.4)
- Can a player respond to an SBA? → No — SBAs happen before priority, not during it (117.2d, 117.5)

---

# COMMANDER ADDENDUM — Priority in 4-Player Free-for-All

In Commander (the primary format for this codex), priority passes **clockwise** among four players rather than between two. All core priority rules (117.1–117.7) apply without modification; the only change is the number of players in the sequence.

**Active player → next player clockwise → next → last player clockwise**

After any player passes priority without casting or activating anything, the next player clockwise receives it. After a spell resolves, priority returns to the **active player** — not to whoever cast the spell if it was a non-active player.

For APNAP ordering of simultaneous trigger insertion and simultaneous decisions in 4-player Commander, see `L10_Variant_800to811_t.md` (§4) and `L09_Constraint_100to104_t.md` (101.4).
