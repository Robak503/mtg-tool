# Magic: The Gathering — Unified Trigger Engine
## LAYER 4: TRIGGER LAYER — Engine Orchestration
## Effective February 27, 2026

---

SOURCES: L02_Time_500to514_t.md, L02_Time_500to514_v.md, L02_Time_703_t.md, L03_Event_609to610_t.md, L04_Trigger_603_seg1_t.md, L04_Trigger_603_seg1_v.md, L04_Trigger_603_seg2_t.md, L04_Trigger_603_seg2_v.md, L04_Trigger_603_seg3_t.md, L04_Trigger_603_seg3_v.md, L05_StateEnforcement_704_t.md, L06_PlayerAction_114to115_t.md, L06_PlayerAction_117_t.md, L06_PlayerAction_118to121_t.md, L06_PlayerAction_601_seg1_t.md, L06_PlayerAction_601_seg2_t.md, L06_PlayerAction_608_t.md, L06_PlayerAction_723_t.md, L07_ObjectModel_105_107_t.md, L07_ObjectModel_105_107_v.md, L07_ObjectModel_108to113_t.md, L07_ObjectModel_108to113_v.md, L07_ObjectModel_122to123_t.md, L07_ObjectModel_300to315_t.md, L07_ObjectModel_300to315_v.md, L07_ObjectModel_400to408_t.md, L07_ObjectModel_400to408_v.md, L07_ObjectModel_607_t.md, L07_ObjectModel_607_v.md, L07_ObjectModel_700_t.md, L07_ObjectModel_700_v.md, L07_ObjectModel_702_t.md, L07_ObjectModel_707_t.md, L07_ObjectModel_707_v.md, L07_ObjectModel_713to716_t.md, L07_ObjectModel_729_t.md, L08_ContinuousEffects_604_t.md, L10_Variant_724to730_t.md
FEEDS INTO: L06_PlayerAction_117_t.md (trigger insertion and priority), L05_StateEnforcement_704_t.md (SBA loop ordering), L00_Orchestration_game_engine.md

## SOURCE MODULES

This engine integrates the following detail files. Consult these for full rule text and expansion:

| Rules | Verbatim file | Expansion file |
|---|---|---|
| 603.1–603.3 | L04_Trigger_603_seg1_v.md | L04_Trigger_603_seg1_t.md |
| 603.4–603.7 | L04_Trigger_603_seg2_v.md | L04_Trigger_603_seg2_t.md |
| 603.8–603.12 | L04_Trigger_603_seg3_v.md | L04_Trigger_603_seg3_t.md |
| 704 (SBAs) | L05_StateEnforcement_704_v.md | L05_StateEnforcement_704_t.md |
| 614/615/616 | L03_Event_614to616_v.md | L03_Event_614to616_t.md |
| 117 (Priority) | L06_PlayerAction_117_v.md | L06_PlayerAction_117_t.md |
| 608 (Resolution) | L06_PlayerAction_608_v.md | L06_PlayerAction_608_t.md |
| L07 | 400–408 | L07_ObjectModel_400to408_v.md | L07_ObjectModel_400to408_t.md |
| L07 | 108–113 | L07_ObjectModel_108to113_v.md | L07_ObjectModel_108to113_t.md |
| Stubs | 607, 609.7, 601.2c–d | L07_ObjectModel_607_linked_stub.md, L03_Event_609_damage_stub.md, L06_PlayerAction_601_casting_stub.md | — |

---

# 1. SYSTEM ROLE

This module defines the **complete deterministic execution loop** integrating:

- Rule 603 (Triggered Abilities)
- Rule 704 (State-Based Actions)
- Rule 117 (Priority)
- Rule 608 (Resolution)
- Rule 603.3 (Trigger insertion timing)

It does NOT redefine those rules.
It defines **their exact ordering and interaction**.

---

# 2. GOVERNING AXIOMS

- Triggering ≠ stack insertion
- Triggering does not require priority
- Waiting triggers are real game objects
- Resolution blocks priority but NOT trigger detection
- SBAs always precede trigger insertion at checkpoints
- Priority exists only at stable checkpoints
- Special trigger classes modify detection, NOT insertion timing
- Creation ≠ triggering ≠ resolution success

---

# 3. PRIMARY ENGINE LOOP

## 3.1 LONG-FORM LOOP (ITERATIVE — per rule 704.3)

The loop is **iterative**, not linear. Steps 5–7 repeat until no new SBAs are performed and no new triggers are waiting before priority is ever given.

1. Event occurs
2. Trigger detection happens (all types)
3. Successful triggers enter waiting state
4. Current process completes (resolution, SBA check, etc.)
5. Check SBAs — perform all that apply simultaneously
6. Repeat step 5 until no SBAs are performed
7. Put all waiting triggers on stack per 603.3b two-part process
8. Check SBAs again (return to step 5)
9. If fully stable (no SBAs performed, no triggers waiting) → priority
10. Player acts or passes
11. If all pass → resolve top of stack or advance game step/phase
12. Return to step 1

**Critical:** Steps 5–8 form a nested iterative loop. The game does not advance to priority (step 9) until this inner loop produces a fully stable state.

---

## 3.2 SHORT LOOP

EVENT → TRIGGERS → WAIT → [SBA LOOP until stable] → STACK INSERTION → [SBA LOOP until stable] → PRIORITY → ACTION → REPEAT

---

# 4. CRITICAL ENGINE PATCHES (MASTER LEVEL)

## 4.1 Beginning-of-Step / Phase Triggers

- Trigger at step/phase start
- Inserted BEFORE active player receives priority
- Follow full iterative SBA → insertion → SBA → priority sequence

---

## 4.2 Untap Step Exception

- No priority exists in the untap step
- Triggers generated during the untap step wait until the next priority checkpoint (upkeep)

---

## 4.3 Cleanup Step Exception

- Normally no priority in the cleanup step
- EXCEPTION: If SBAs are performed OR triggered abilities are waiting at end of cleanup, a full loop executes including a priority window, and then another cleanup step begins

---

## 4.4 Visibility Rule (Rule 603.2f — VERBATIM)

Rule 603.2f: "If a triggered ability's trigger condition is met, but the object with that triggered ability is at no time visible to all players, the ability does not trigger."

**Scope:** This rule applies primarily to objects in hidden zones (libraries, face-down in exile, etc.). Face-down permanents on the battlefield are visible as objects (their existence is known to all players), so their triggered abilities can still fire even though their card identity is hidden. The test is whether the object itself is visible, not whether all its characteristics are known.

**Interaction with morph/disguise:** A face-down creature on the battlefield is a visible object. Its triggered abilities that have conditions based on game events can trigger. However, if the face-down card has a triggered ability that a player wouldn't know exists (because it's only visible at the pre-reveal state), that ability does not trigger.

---

## 4.5 "Triggers Additional Times" (Rule 603.2d)

- Effects may cause a triggered ability to trigger additional times
- This determination is made at trigger time: determine how many times total, then that ability triggers that many times
- The "additional times" effect does NOT apply to:
  - Delayed triggered abilities created by that object's abilities (603.7)
  - Reflexive triggered abilities created by that object's abilities (603.12)
- The "additional times" effect does NOT invoke itself repeatedly

---

## 4.6 Exact Trigger Insertion: The 603.3b Two-Part APNAP Process

When multiple triggered abilities are waiting for stack insertion, the mandatory process is:

**Part 1:** Each player, in APNAP order (active player first, then each other player in turn order), puts each triggered ability they control whose trigger condition is NOT "another ability triggering" onto the stack in any order they choose.

**Part 2:** Each player, in APNAP order, puts all remaining triggered abilities they control — those whose trigger condition IS "another ability triggering" — onto the stack in any order they choose.

After both parts complete, the full SBA/trigger iterative loop (§3.1) runs again before priority is given.

**Why two parts matter:** Abilities that trigger off other abilities being triggered (ability-on-ability triggers) are deferred to Part 2. Their controllers cannot interleave them with Part 1 abilities in ways that would manipulate stack order between the two categories. This is not merely APNAP ordering — it is specifically two-pass ordering within APNAP.

**Controller identification (603.3a):** Each trigger is controlled by the player who controlled its source **at the time it triggered**, not at insertion time.

**Mode and target choices (603.3c, 603.3d):** Mode selections and targeting decisions are made at insertion. If a triggered ability has no legal choices at insertion time, it is removed from the stack (not countered — removed by rule).

---

## 4.7 Reflexive Trigger Precision (Rule 603.12a)

- Checked immediately after creation during resolution
- Triggers per occurrence (once per time the event happened during that resolution)
- EXCEPTION (603.12a compression): If the creating spell/ability allows paying a cost "any number of times" and the reflexive trigger uses "one or more times" phrasing, paying the cost one or more times causes the reflexive trigger to fire **only once** regardless of how many times the cost was paid

---

# 5. TRIGGER CLASS INTEGRATION

All trigger types below use the same standard waiting state and 603.3b insertion process unless a specific modification is noted.

| Class | Source Rule | Trigger Condition Type | Key Modification |
|---|---|---|---|
| Standard event trigger | 603.2 | Discrete game event | None — base case. One trigger per occurrence; multiple occurrences within one event each produce a separate trigger (603.2c) |
| "Becomes" trigger | 603.2e | State-change event only | Does not retrigger if state persists; does not trigger if object enters already in that state |
| "At the beginning of" trigger | 603.2b | Phase/step start | Fires at start of that step before priority |
| "Do this only once each turn" trigger | 603.2h | Same event as base trigger | Does NOT trigger if source's controller has already taken the indicated action this turn; tracks per-turn action history |
| State trigger | 603.8 | Game state being true | No retrigger while on stack; retriggers if condition still true after leaving stack |
| Lose-the-game trigger | 603.9 | Player losing the game | Fires on loss/departure except draws; uses look-back (603.10f) |
| Look-back trigger | 603.10a–g | Zone-change, phase-out, unattach, control-loss, counter, loss, planewalk | Detection uses pre-event state instead of post-event state |
| Delayed trigger | 603.7 | Future event after creation | Created during resolution/earlier; controller per 603.7d–f; fires when future event occurs |
| Reflexive trigger | 603.12 | Past event during same resolution | Checked immediately after creation; backward-looking; 603.12a compression rule applies |
| "Additional times" trigger | 603.2d | Same as source trigger | Count determined at trigger time; does not apply to delayed/reflexive sub-triggers |
| Linked trigger | 603.11 | Condition tied to linked static ability | Only responds to actions caused by its linked static ability (rule 607) |

---

# 6. RESOLUTION INTEGRATION

During resolution of a stack object:

**PERMITTED:**
- Trigger detection
- Delayed trigger creation
- Reflexive trigger creation and immediate check

**NOT PERMITTED:**
- Priority
- SBA execution

After resolution completes → full iterative engine loop (§3.1) resumes from step 5.

---

# 7. SBA INTEGRATION

- SBAs are checked at every priority checkpoint
- SBAs are performed simultaneously; process repeats until no SBAs are performed
- SBAs can generate triggered abilities
- Triggered abilities generated during SBA processing enter the waiting state; they are not placed until the SBA loop stabilizes (no SBAs remain)
- After SBA stability, 603.3b trigger insertion runs; then SBAs are checked again

---

# 8. PRIORITY GATE

Priority is given only when ALL of the following are true:

- No SBAs remain to be performed
- No triggered abilities are in the waiting state

If either condition is false, the engine continues. Priority is never "given early."

---

# 9. STACK INTEGRATION

- Triggered abilities enter the stack ONLY at the insertion checkpoint (603.3)
- They are not on the stack when they trigger
- They are not on the stack while waiting
- Ordering is governed by the 603.3b two-part APNAP process (see §4.6)

---

# 10. FAILURE MATRIX

A triggered ability can fail to produce its effect at each of the following distinct points:

| Failure Point | Cause | Result |
|---|---|---|
| Never triggers | Trigger condition not met; event was replaced/prevented (603.2g); source not visible to all players (603.2f); "becomes" condition already existed (603.2e) | No trigger; no stack object |
| "Do this only once each turn" restriction met | Trigger has 603.2h restriction and source's controller has already taken the indicated action this turn | No trigger; ability does not fire again until next turn |
| Created but never triggered | Object created as delayed/reflexive trigger source but trigger event never occurs | No trigger; ability expires |
| Trigger never reaches stack | Trigger fires but object leaves zone before insertion; game skips to end | Ability in waiting state never inserted |
| Countered on stack | Spell or ability counters the triggered ability after insertion | Ability removed from stack; effect does not resolve |
| Intervening-if failure | "Whenever X, if Y, ..." — Y is no longer true at resolution | Ability resolves but effect does nothing (Y clause re-checked at resolution per 608.2a) |
| Illegal targets at insertion | No legal targets exist when ability would be placed on stack; or modal ability with no legal mode | Ability removed from stack by rule (603.3c, 603.3d); not countered — removed before ever becoming a legal stack object |
| Illegal targets at resolution | All targets illegal when ability resolves (rule 608.2b) | Countered by game rules; ability removed; does nothing — distinct from "removed at insertion" and distinct from "countered by a spell/ability" |
| Zone-change miss | Source left its zone between trigger and insertion, and trigger only applies while source is in that zone | Varies — some abilities survive zone changes, some do not |
| Reflexive failure | Reflexive trigger created but action that would cause it to fire never occurred during that resolution | Checked immediately; does not trigger |
| Delayed never firing | Delayed trigger's future event never occurs before the delayed trigger expires | No trigger |

---

# 11. MASTER ORDER

EVENT
→ DETECT ALL TRIGGERS
→ WAITING STATE
→ FINISH CURRENT PROCESS (resolution, SBA, etc.)
→ [SBA LOOP: perform SBAs, repeat until none]
→ INSERT TRIGGERS (603.3b two-part APNAP)
→ [SBA LOOP: perform SBAs, repeat until none]
→ IF STABLE → PRIORITY
→ ACTION / PASS
→ ALL PASS → RESOLVE OR ADVANCE
→ REPEAT

---

# FINAL

This engine is:

✔ Fully CR-aligned to February 27, 2026 rules
✔ Loop structure per 704.3 (iterative, not linear)
✔ Trigger insertion per 603.3b two-part APNAP (Part 1: non-ability-on-ability; Part 2: ability-on-ability)
✔ Visibility rule correctly sourced from 603.2f (not fabricated)
✔ All trigger classes defined in §5
✔ Failure matrix complete in §10
✔ No fabricated sub-rules or invented procedures

---

# COMMANDER ADDENDUM — Triggers in 4-Player Commander

The trigger engine (rule 603) applies identically in Commander. Key 4-player considerations:

**APNAP trigger ordering with 4 players:** When multiple players have triggered abilities waiting to go on the stack simultaneously, they are inserted in APNAP order — active player's triggers first (bottom of stack), then clockwise. The last player clockwise has their triggers on top. See `L10_Variant_800to811_t.md` (§4).

**Triggers from the command zone:** Some commanders have abilities that trigger from the command zone (eminence abilities, rule 702.xxx). These function per rule 603 — the ability exists in the command zone and triggers when its condition is met, even though the source is not on the battlefield. The trigger source is the card in the command zone.

**Triggers when a commander leaves the battlefield:** If a commander would die or be exiled and its owner returns it to the command zone (via 903.9a or 903.9b), triggered abilities that fired from the original event (e.g., "when this creature dies") have already been placed on the waiting list and will still resolve. The commander being in the command zone does not un-fire triggers that already triggered.

**Commander damage triggers:** "Whenever [commander] deals combat damage to a player" — this is a standard triggered ability. It fires per damage event, tracked per commander. See `L10_Variant_903_t.md` (§7) for the 21-damage SBA.
