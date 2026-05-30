# Magic: The Gathering — Ending Turns and Phases: Engine Expansion
## LAYER 6: PLAYER ACTION LAYER — Expansion (Rule 723)
## Effective February 27, 2026

---

SOURCES: L06_PlayerAction_723_v.md
FEEDS INTO: L02_Time_500to514_t.md (turn structure), L04_Trigger_engine.md (end-of-turn triggers), L00_Orchestration_game_engine.md

---

# 1. ENDING TURNS (723.1–723.4)

## 1.1 What "End the Turn" Means

Some effects instruct a player to "end the turn." This is a one-time action that immediately:
1. Removes all spells and abilities currently on the stack (they are exiled or moved without resolving)
2. Skips to the cleanup step of the current turn

"End the turn" does not:
- End the game
- Skip the cleanup step itself (that still happens)
- Remove damage from creatures (cleanup does that)
- Prevent "at the beginning of the next end step" triggers that have already been created

## 1.2 What Is Exiled

When a turn ends this way, everything on the stack is exiled. This includes spells, activated abilities, and triggered abilities. None of them resolve. Players do not receive refunds on costs paid.

## 1.3 After the Stack Is Cleared

The game proceeds directly to the cleanup step. In cleanup:
- Damage is removed from creatures
- "Until end of turn" and "this turn" effects end
- The active player discards down to maximum hand size
- SBAs are checked and triggers placed on the stack if needed

---

# 2. ENDING PHASES (723.5–723.7)

## 2.1 Skipping Phases and Steps

Some effects cause a player to skip a phase or step. When a phase is skipped:
- The game does not enter that phase at all
- Nothing that would happen in that phase happens
- "At the beginning of [skipped phase]" triggers do not trigger (there is no beginning of that phase)
- "At the beginning of the next [phase after the skipped one]" triggers fire normally

## 2.2 Multiple Skip Effects

If multiple effects cause the same phase to be skipped, each skip applies in turn order. The phase is skipped once per instruction.

---

# 3. CROSS-LAYER CONNECTIONS

**→ Layer 2 (Time, 500–514):** Rule 723 modifies the normal turn structure. The cleanup step (rule 514) is what actually removes damage and ends duration effects.

**→ Layer 4 (Triggers):** "At the beginning of the end step" triggers that have already been created before "end the turn" is called do not trigger (they were created for the current end step, which is now skipped). "At the beginning of the next end step" delayed triggers created after "end the turn" fire at the end step of the next turn.

---

FEEDS INTO: L02_Time_500to514_t.md (cleanup step, phase skipping), L04_Trigger_engine.md (trigger interaction with skipped phases)
