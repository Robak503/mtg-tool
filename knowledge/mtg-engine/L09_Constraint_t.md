# Magic: The Gathering — Constraint Rules: Engine Expansion
## LAYER 9: CONSTRAINT LAYER — Expansion (Rules 722, 726, 728, 731–732)
## Effective February 27, 2026

---

SOURCES: L09_Constraint_722_v.md, L09_Constraint_726to728_v.md, L09_Constraint_731to732_v.md
FEEDS INTO: L06_PlayerAction_601_seg2_t.md (732 illegal actions), L00_Orchestration_game_engine.md

---

# 1. CONTROLLING ANOTHER PLAYER (Rule 722)

## 1.1 What It Means

Some effects allow a player to control another player (e.g., "you control [player] this turn"). The controlling player makes all game decisions for the controlled player during that effect's duration:
- Which spells to cast and how
- Which abilities to activate
- Which attackers and blockers to declare
- What choices to make during resolution

## 1.2 Limits on Control (722.2–722.4)

Even while controlled, a player:
- Cannot be forced to use mana the controlled player doesn't have access to
- Cannot be made to pay life they don't have
- Cannot be made to take actions that are already impossible

Choices made by the controlling player are the controlled player's choices for all rules purposes — triggered abilities fire, costs are paid, etc., as though the controlled player made those decisions.

## 1.3 Controller Identity

While a player is controlled, the controlling player makes choices but the controlled player is still the "owner" and "controller" of their permanents. The controlling player doesn't gain the permanents — they gain decision authority over them.

---

# 2. RESTARTING THE GAME (Rule 726)

Some effects (e.g., Karn Liberated's emblem) restart the game. When a game restarts:
- All game objects are removed
- Cards exiled "to restart the game" by that effect are brought into the new game
- The new game starts from scratch with those cards and the players' libraries
- Life totals reset to starting values
- In Commander: life totals reset to 40; commander damage counters reset to 0; commanders return to command zone

The restarted game is a completely new game state. Effects, counters, and continuous effects from the previous game do not carry over (except as specifically stated by the restart effect).

---

# 3. SUBGAMES (Rule 728)

Some cards (e.g., Shahrazad) create subgames — complete games of Magic played within the main game. Subgames use the same rules as normal games with these modifications:

- Players use their sideboards as their decks for the subgame
- Life totals in the subgame start at 20 (or format-appropriate amount)
- When the subgame ends, the main game resumes
- Results of the subgame may affect the main game (as specified by the card that created the subgame)

Subgames are extremely rare in Commander play. Shahrazad is banned in Commander.

---

# 4. HANDLING ILLEGAL ACTIONS (Rule 732)

## 4.1 The Rewind Rule

If a player takes an illegal action, the game rewinds to the moment before that action was taken. The action is undone. No permanent changes from the illegal action persist.

**What "illegal" means:** An action is illegal if it violates the rules or effects in play at the time it was taken. This includes:
- Casting a spell when the player can't legally cast it
- Declaring an illegal attacker or blocker
- Paying a cost that can't be paid
- Taking a targeting action that violates targeting restrictions

## 4.2 The Rewind Point

The rewind point for casting a spell is **before the spell was proposed** — before the card moved to the stack. If a casting is illegal, the card returns to its previous zone and the player is back to having priority with the same game state as before.

The rewind point for illegal actions during a turn is the moment before that action began.

## 4.3 Good Faith Play

In casual play (including Commander), if a player makes an error in good faith and it's discovered immediately, the game rewinds. If significant game actions have occurred since the error, tournament rules (not the CR) govern how to handle it. The CR describes the ideal; tournament policy governs the practical.

---

# 5. THE "CAN'T" OVERRIDE — CONSTRAINT LAYER SUMMARY

The most important constraint in the entire codex is rule 101.2: **"can't" unconditionally overrides "can."**

This constraint is the reason Layer 9 exists as a concept. Every lower layer (1–8) generates what can happen. Layer 9 checks whether "can't" constraints block any of those actions.

**Common "can't" patterns in Commander:**
- "Spells can't be countered" — blocks the normal counter mechanic
- "Creatures can't attack you" — blocks the normal attack declaration
- "Players can't gain life" — blocks all life gain
- "This spell can't be the target of spells or abilities" — blocks targeting
- "You can't lose the game" — blocks the loss condition (e.g., Platinum Angel)

When a "can't" effect is found:
- If it prevents the action entirely, the action doesn't happen
- If it prevents one part of an effect, that part is skipped (101.3) and the rest continues
- "Can't" effects have no layer — they apply as meta-constraints before layer resolution

---

# 6. APNAP IN COMMANDER — CONSTRAINT APPLICATION

Rule 101.4 (APNAP) is a constraint on simultaneous decisions. In 4-player Commander, APNAP is critical in:

**Trigger ordering:** When multiple players have triggered abilities waiting to go on the stack at the same time, the active player places all of their triggers first (in their chosen order), then the next player clockwise, and so on. The last player clockwise has their triggers on top of the stack.

**Simultaneous choices:** "Each player chooses a creature they control" — active player chooses first, then clockwise. This matters when later players know what earlier players chose.

**Multiple loss conditions:** If multiple players would lose simultaneously (same SBA check), they all lose at the same time — not sequentially. In a 4-player game, if three players would all die simultaneously, all three lose together and the fourth player wins.

---

FEEDS INTO: L06_PlayerAction_601_seg2_t.md (illegal action rewind point from 732), L00_Orchestration_game_engine.md (can't override, APNAP, rewind), L10_Variant_903_t.md (simultaneous loss in multiplayer)
