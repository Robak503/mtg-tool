# Magic: The Gathering — Game State Assessor
## LAYER 0: ENGINE ORCHESTRATION — State Entry Protocol
## Effective February 27, 2026

---

# PURPOSE

The `L00_Orchestration_game_engine.md` execution loop assumes you are at the beginning of an event. This document addresses the other case: a judge or parsing system arriving at a game state mid-play that must determine where the game currently is in the loop, what has already happened, and what must happen next before priority can legally be given.

This is the **entry protocol** — how to assess any arbitrary game state and re-enter the execution loop at the correct point.

---

# 1. THE FIVE QUESTIONS

Any game state can be fully assessed by answering these five questions in order. Do not skip ahead. Each question can only be answered correctly once all prior questions have been resolved.

---

## Question 1: Is a process currently resolving?

A process is currently resolving if the top object on the stack has begun resolving and has not yet completed.

**How to determine this:**
- Is there an object on the stack?
- Have all players most recently passed in succession?
- Has resolution of that object begun but not completed?

**If YES — a process is resolving:**
- No player has priority
- No SBAs are being checked
- No triggers are being inserted
- The current instruction in the resolution sequence is what must happen next
- Locate the exact instruction within the resolution sequence (rule 608.2 ordering) and continue from there
- After resolution completes, proceed to Question 2

**If NO — no process is resolving:**
- Proceed to Question 2

---

## Question 2: Are any SBAs applicable?

State-based actions are checked at every point where a player would receive priority. Before asking whether a player can act, the full SBA loop must be confirmed stable.

**How to determine this:**
- Check every SBA condition in rule 704.5 and 704.6 against the current game state
- Do any apply? (Rule 704.3 — all applicable SBAs fire simultaneously)

**If YES — SBAs are applicable:**
- Perform all applicable SBAs simultaneously as a single event
- Those SBAs may generate triggered abilities — note them, they enter the waiting state
- Check SBAs again
- Repeat until no SBAs apply
- Then proceed to Question 3

**If NO — no SBAs apply:**
- Proceed to Question 3

---

## Question 3: Are any triggered abilities in the waiting state?

The waiting state contains triggered abilities that have fired but have not yet been placed on the stack. These must be placed before any player receives priority.

**How to determine this:**
- Have any triggered abilities fired since the last time a player received priority?
- Are any triggered abilities currently waiting that have not been placed on the stack?

**If YES — triggers are waiting:**
- Place all waiting triggered abilities on the stack using the 603.3b two-part APNAP process:
  - Part 1: Each player in APNAP order places triggers whose condition is NOT "another ability triggering"
  - Part 2: Each player in APNAP order places remaining triggers (ability-on-ability triggers)
- After placement, return to Question 2 — new SBAs may have been generated
- Continue the Question 2 → Question 3 loop until both return NO
- Then proceed to Question 4

**If NO — no triggers are waiting:**
- The checkpoint is stable
- Proceed to Question 4

---

## Question 4: What is on the stack?

Once the game state is stable (Questions 2 and 3 both answer NO), determine the current stack state.

**Assess the stack:**

| Stack state | What happens next |
|---|---|
| Stack is empty | The appropriate player receives priority for the current step/phase. If this is a step/phase that just began, the active player has priority. |
| Stack has objects and all players have most recently passed | The top object resolves — return to Question 1 |
| Stack has objects and not all players have passed | The appropriate player has priority and may act |

**Stack contents to identify:**
- Every object on the stack, in order (top to bottom)
- For each: is it a spell or ability? Who controls it? What are its targets (if any)?
- Are any targets currently illegal? (If so, note for resolution per rule 608.2b)
- Are any intervening-if conditions currently true/false? (If false, note for resolution per 608.2a)

---

## Question 5: Who has priority and what can they do?

Once the stack state is known and the game is stable, identify the priority holder and their legal options.

**Priority holder identification (rule 117.3):**

| Situation | Priority holder |
|---|---|
| Step/phase just began | Active player |
| Spell/ability just resolved | Active player |
| Player just cast/activated/acted | That same player |
| Player just passed | Next player in turn order |
| Untap step | No player has priority |
| Cleanup step (no SBAs, no triggers) | No player has priority |

**Legal actions for the priority holder (rule 117.1):**
- Cast an instant (any time)
- Cast a noninstant (main phase only, stack empty only)
- Activate an activated ability (any time, unless restricted)
- Activate a mana ability (any time, even without priority, when paying a cost)
- Take certain special actions (rule 116)
- Pass priority

**Illegal right now regardless of priority:**
- SBAs (automatic — not player actions)
- Triggering (automatic — not player actions)
- Acting during another player's resolution

---

# 2. COMMON ENTRY SCENARIOS

## Scenario A: Judge called during resolution
A player says "wait, something happened wrong during this spell's resolution."

1. Determine exactly which instruction in rule 608.2 is currently being executed
2. Determine what has already happened during this resolution (triggers already fired, replacement effects already applied)
3. Determine whether any illegal action occurred — if so, apply rule 732 (handling illegal actions)
4. If the resolution can continue legally from the current point, continue
5. If not, determine the appropriate backup point under rule 732

## Scenario B: Judge called between actions
A player says "I think he can't do that" after a player has just declared an action.

1. Confirm the action has been declared but not yet executed (if execution has begun, different rules apply)
2. Check Question 5 — did that player have priority when they acted?
3. Check rule 117.1 — was the action legal at that time?
4. If illegal, apply rule 732

## Scenario C: Judge called at a priority checkpoint
A player says "I want to do something in response."

1. Confirm the game is at a genuine priority checkpoint — run Questions 2 and 3 to confirm stability
2. Confirm this player has priority (Question 5)
3. Confirm the action they want to take is legal (Question 5 legal actions table)
4. If yes, they may act

## Scenario D: Ambiguous stack state
Multiple things happened in quick succession and the stack order is unclear.

1. List every action taken since the last confirmed priority exchange
2. Each player action that was taken while that player had priority created a new stack object
3. Stack objects are ordered LIFO — last cast/activated is on top
4. Triggered abilities that fired during those actions are in the waiting state until the current process completes
5. Apply the Question 2 → 3 loop to place those triggers in the correct order

---

# 3. CURRENT STATE LIMITATIONS

This assessor document operates correctly for:
- Resolving objects (Layer 6: rule 608)
- Triggered ability placement (Layer 4: rule 603)
- SBA processing (Layer 5: rule 704)
- Priority assignment (Layer 6: rule 117)

This assessor does **NOT** yet have full support for:

| Gap | Layer needed | Impact |
|---|---|---|
| Determining current object characteristics | L8 (Continuous Effects) | Cannot fully evaluate whether a trigger condition is met or a replacement effect applies without knowing current characteristics |
| Verifying zone membership | L7 (Object Model, full) | Cannot definitively confirm object identity across zones without full 400–408 coverage |
| Combat step state assessment | L2 (Time) | Cannot assess whether combat is in progress, what attackers/blockers are declared, without turn structure layer |
| Evaluating "can't" override interactions | L9 (Rule Constraint) | Cannot confirm whether a "can't" effect is preventing an action without full 101/614.17 integration |

When those layers are built, this document must be updated with additional assessment steps for each.

---

# 4. QUICK REFERENCE: WHAT CAN HAPPEN WHEN

| Game moment | SBAs? | Triggers fire? | Triggers insert? | Players act? |
|---|---|---|---|---|
| During resolution | No | Yes | No | No |
| After resolution, before checkpoint | No | Yes | No | No |
| At checkpoint, SBA loop running | Yes | Yes | No | No |
| At checkpoint, trigger insertion | No | Yes | Yes | No |
| At stable checkpoint | No | No | No | **Yes** |
| Untap step | No | Yes | No | No |
| Cleanup step (stable) | No | No | No | No |
| Cleanup step (unstable) | Yes | Yes | Yes | Yes (after stable) |
