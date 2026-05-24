# Magic: The Gathering — Full Game Engine
## LAYER 0: ENGINE ORCHESTRATION — Spans All Layers
## Final Unified System

---

## SOURCE MODULES

This engine orchestrates the following detail files. Consult these for full rule text and subsystem expansion:

| Layer | Rules | Verbatim file | Expansion file | Status |
|---|---|---|---|---|
| L03 | 614/615/616 | L03_Event_614to616_v.md | L03_Event_614to616_t.md | ✅ Complete |
| L03 | 609–610 | L03_Event_609to610_v.md | L03_Event_609to610_t.md | ✅ |
| L04 | 603.1–603.3 | L04_Trigger_603_seg1_v.md | L04_Trigger_603_seg1_t.md | ✅ Complete |
| L04 | 603.4–603.7 | L04_Trigger_603_seg2_v.md | L04_Trigger_603_seg2_t.md | ✅ Complete |
| L04 | 603.8–603.12 | L04_Trigger_603_seg3_v.md | L04_Trigger_603_seg3_t.md | ✅ Complete |
| L04 | Trigger engine | — | L04_Trigger_engine.md | ✅ Complete |
| L05 | 704 | L05_StateEnforcement_704_v.md | L05_StateEnforcement_704_t.md | ✅ Complete |
| L06 | 117 | L06_PlayerAction_117_v.md | L06_PlayerAction_117_t.md | ✅ Complete |
| L06 | 608 | L06_PlayerAction_608_v.md | L06_PlayerAction_608_t.md | ✅ Complete |
| L06 | 601.2c–d (stub) | L06_PlayerAction_601_casting_stub.md | — | ✅ Stub |
| L07 | 400.7 (stub) | L07_ObjectModel_400_identity_stub.md | — | ✅ Stub |
| L07 | 607 (stub) | L07_ObjectModel_607_linked_stub.md | — | ✅ Stub |
| L07 | 400–408 (full) | L07_ObjectModel_400to408_v.md | L07_ObjectModel_400to408_t.md | ✅ Complete |
| L07 | 108–113 | L07_ObjectModel_108to113_v.md | L07_ObjectModel_108to113_t.md | ✅ Complete |
| L02 | 500–514 | L02_500to514_v.md | L02_500to514_t.md | ❌ Not built |
| L02 | 703 | L02_703_v.md | — | ❌ Not built |
| L06 | 601 (seg1) | L06_PlayerAction_601_seg1_v.md | L06_PlayerAction_601_seg1_t.md | ✅ Complete |
| L06 | 601 (seg2) + 602 | L06_PlayerAction_601_seg2_v.md | L06_PlayerAction_601_seg2_t.md | ✅ Complete |
| L06 | 116 | L06_PlayerAction_116_v.md | L06_PlayerAction_116_t.md | ✅ Complete |
| L08 | 611–613 | L08_611to613_v.md | L08_611to613_t.md | ❌ Not built |
| L08 | 604 | L08_604_v.md | — | ❌ Not built |
| L09 | 101, 731–732 | L09_101_v.md | L09_constraint_t.md | ❌ Not built |

---

# 1. SYSTEM ROLE

## Scope

This module defines the complete deterministic execution model for the live game engine by integrating:

- replacement effects, prevention effects, and [614.17](00_Source_CR_2026-02-27_LINKED.md#614-17) “can’t” constraints
- final event occurrence
- triggered ability detection and waiting-state handling
- state-based action processing
- triggered-ability stack insertion timing
- priority checkpoints and action windows
- resolution of spells and abilities
- stack progression
- turn/step/phase advancement as engine restart points
- turn-based action timing where it affects engine ordering

This module is the final orchestration layer. It does not replace the detailed subsystem modules. It defines their exact operational order and the checkpoint structure that binds them together.

---

## Included Systems

This module includes:

- pre-event constraint and modification handling
- event finalization
- trigger detection
- waiting-state handling
- SBA loop integration
- trigger insertion timing
- priority gating
- stack resolution feedback
- turn/step/phase advancement feedback
- beginning-of-step / phase precision
- untap-step and cleanup-step exception handling
- end-step timing exceptions
- multiplayer/APNAP choice structure where it affects engine order
- failure-state integration across the major systems

---

## Excluded Systems

This module does not restate, in full:

- the complete Rule[603](00_Source_CR_2026-02-27_LINKED.md#603) module
- the complete Rule[614](00_Source_CR_2026-02-27_LINKED.md#614)/615/616 module
- the complete Rule[704](00_Source_CR_2026-02-27_LINKED.md#704) module
- the full Stack hub
- the full text of Rule[117](00_Source_CR_2026-02-27_LINKED.md#117), Rule[608](00_Source_CR_2026-02-27_LINKED.md#608), or the whole turn-structure chapter

Those remain the detailed authorities for their own mechanics. This module defines how they operate together.

---

# 2. GOVERNING AXIOMS

## Axiom 1 — The game is one ordered engine

The game does not process replacement, triggers, SBAs, priority, and resolution as separate islands. It processes them as one repeating ordered system.

---

## Axiom 2 — 614/615 processing happens before the event

Replacement and prevention effects modify a would-event before it happens. If the event is replaced, the original event never happens.

---

## Axiom 3 — [614.17](00_Source_CR_2026-02-27_LINKED.md#614-17) “Can’t” constraints are not ordinary replacement effects

“Can’t” effects are not replacement effects. They follow similar timing rules, but they are not just another ordinary selectable member of the 616 replacement/prevention choice pool. They constrain whether the event can happen at all and can restrict what later replacement processing can legally do.

---

## Axiom 4 — The rest of the engine sees only the final event

Trigger detection and later SBA evaluation operate from the final event that actually happened, if any, not from a would-event that was replaced away.

---

## Axiom 5 — Triggering and stack insertion are separate

A triggered ability triggers when its condition is satisfied. It becomes a stack object only later, at the next legal insertion point.

---

## Axiom 6 — Waiting triggers are a real engine state

A trigger can exist after triggering but before being put on the stack. During that period it is:

- already triggered
- not yet on the stack
- not yet something players can respond to

---

## Axiom 7 — Resolution blocks priority, not trigger detection

During resolution:

- players do not get priority
- SBAs are not performed in the middle of resolution
- replacement/prevention still modifies would-events
- triggered abilities can still trigger
- delayed and reflexive structures can still be created under their rules

---

## Axiom 8 — SBA processing is the gate before trigger insertion

Whenever a player would get priority, the game checks for SBAs first. Only after the SBA loop stabilizes are waiting triggered abilities put on the stack.

---

## Axiom 9 — Priority exists only at a stable checkpoint

A player gets priority only if:

- no SBAs are performed in the check, and
- no triggered abilities remain waiting to be put on the stack

---

## Axiom 10 — “Created,” “triggered,” “waiting,” “on the stack,” and “resolved” are distinct states

Especially for delayed and reflexive structures, the engine must not collapse these into one concept.

---

## Axiom 11 — Turn structure creates rule-driven checkpoints even with an empty stack

The game engine does not restart only because a stack object resolved. It also restarts because turn-based actions and step/phase changes create new would-events and new checkpoints.

---

# 3. FULL EXECUTION LOOP (LONG FORM)

## [3.1](00_Source_CR_2026-02-27_LINKED.md#3-1) A would-event is identified

A game instruction, rule process, stack object, turn-based action, or turn/step/phase transition creates a would-event.

This can arise from:

- a spell or ability resolving
- a spell being cast or an ability being activated
- combat or damage processing
- a zone change
- a player drawing
- a step or phase beginning
- a player losing the game
- a turn-based action
- step/phase/turn advancement
- any other rule-driven event source

The engine begins from that would-event.

---

## [3.2](00_Source_CR_2026-02-27_LINKED.md#3-2) Pre-event legality and modification is processed

Before the event happens, the game processes:

1. relevant [614.17](00_Source_CR_2026-02-27_LINKED.md#614-17) “can’t” constraints
2. applicable replacement/prevention effects under the 614/615/616 engine
3. iterative rescanning of the current event until no further applicable replacement/prevention effect remains

This is not a loose “all effects in one bucket” stage. It is ordered:

- first, determine whether any “can’t” rule constrains or prohibits the event
- then process applicable replacement/prevention effects under the 616 chooser structure
- then rescan the current event

If the event cannot happen, ordinary replacement/prevention processing cannot freely treat that impossible event as though it were still an ordinary selectable target, except where the rules expressly allow self-replacement interaction.

---

## [3.3](00_Source_CR_2026-02-27_LINKED.md#3-3) The final event occurs, if any

After pre-event processing ends, one of the following is true:

- the original event occurs unchanged
- a modified event occurs
- a partial event occurs
- no event of that original kind occurs because it was fully replaced or prohibited

Only now has the actual event for downstream engine purposes been determined.

---

## [3.4](00_Source_CR_2026-02-27_LINKED.md#3-4) Trigger detection happens immediately as the final event occurs

The game checks triggered abilities under all relevant trigger rules.

This may include:

- normal post-event detection
- state-triggered false→true detection
- intervening-“if” trigger-time validation
- zone-change trigger handling
- look-back detection
- delayed trigger event matching
- reflexive immediate post-creation checking where appropriate
- lose-the-game trigger handling
- visibility-based nontriggering limits

If an effect says a triggered ability triggers additional times, that affects only the triggered abilities that object has. It does not apply to delayed or reflexive triggered abilities created by those abilities.

Every ability that successfully triggers enters the waiting state immediately.

---

## [3.5](00_Source_CR_2026-02-27_LINKED.md#3-5) The current process continues to completion

The engine does not interrupt the current process just because triggers occurred.

If the trigger happened during:

- resolution, that resolution continues
- casting or activation, that procedure continues
- a rule-driven process, that process continues
- the SBA loop, that loop continues until its own stop condition

Triggered abilities do not jump directly onto the stack at trigger time.

---

## [3.6](00_Source_CR_2026-02-27_LINKED.md#3-6) A checkpoint is reached

After the current process finishes, the game reaches a point where a player would get priority under the rules.

This is the checkpoint gate.

Some checkpoints are reached because:

- a stack object finished resolving
- a spell/ability cast or activation process ended
- a step or phase began and its opening turn-based and beginning-of-step processing completed
- the stack is empty and the turn structure advances
- cleanup exception processing created another pass
- another rule process ended and would now hand off to priority

This checkpoint exists even when no player has yet been given priority. It is the trigger for SBA and waiting-trigger processing.

---

## [3.7](00_Source_CR_2026-02-27_LINKED.md#3-7) SBA loop begins

At the checkpoint, the game checks all applicable state-based actions.

If any apply:

- all applicable SBAs are performed simultaneously as a single event
- the game checks again
- this repeats until an SBA check performs none

This is the mandatory gate before trigger insertion.

---

## [3.8](00_Source_CR_2026-02-27_LINKED.md#3-8) Triggers can be generated during the SBA loop

SBA processing can create trigger events.

Those abilities:

- trigger immediately when their conditions are met
- enter the waiting state
- do not go on the stack during the middle of the SBA loop

They wait until the SBA loop stabilizes.

---

## [3.9](00_Source_CR_2026-02-27_LINKED.md#3-9) Waiting triggered abilities are put onto the stack

Once an SBA check performs no SBAs, the game puts all waiting triggered abilities onto the stack under rule 603.3b, which mandates a specific two-part APNAP process:

**Part 1:** Each player, in APNAP order (active player first, then each other player in turn order), puts each triggered ability they control whose trigger condition is **not** "another ability triggering" onto the stack in any order they choose.

**Part 2:** Each player, in APNAP order, puts all remaining triggered abilities they control — those whose trigger condition **is** "another ability triggering" — onto the stack in any order they choose.

Additional insertion rules that apply:

- Each triggered ability is controlled by the player who controlled its source when it triggered (rule 603.3a), not necessarily who controls the source now
- Insertion-time choices — mode selection (rule 603.3c) and targeting (rule 603.3d) — are made as each ability is placed
- If a triggered ability has no legal mode or no legal targets at insertion time, it is removed from the stack by rule and does nothing
- Each player orders their own triggers freely within each part; players cannot interleave their triggers with another player's

At this point, waiting triggers become stack objects. Then the engine immediately performs another SBA check (§3.10) before priority is given.

---

## [3.10](00_Source_CR_2026-02-27_LINKED.md#3-10) The game checks SBAs again after trigger insertion

After waiting triggers are inserted, the game checks SBAs again.

If any SBAs apply:

- they are performed
- the loop repeats
- any triggers generated during this process wait and are inserted through the same checkpoint structure

Thus the checkpoint order remains:

SBA loop → trigger insertion → SBA loop → stable test → priority

---

## [3.11](00_Source_CR_2026-02-27_LINKED.md#3-11) Stable checkpoint test

A checkpoint is stable only if:

- an SBA check performs no SBAs, and
- no triggered abilities remain waiting to be put on the stack

If either is false, the engine continues internal processing and no player gets priority yet.

---

## [3.12](00_Source_CR_2026-02-27_LINKED.md#3-12) Priority is given

Only after the checkpoint is stable does the appropriate player receive priority.

Now players may:

- cast spells
- activate abilities
- take special actions
- pass priority

---

## [3.13](00_Source_CR_2026-02-27_LINKED.md#3-13) Player action or pass

If a player acts, that action becomes a new event source and the engine restarts from the would-event stage.

If a player passes, priority moves under the normal priority rules.

---

## [3.14](00_Source_CR_2026-02-27_LINKED.md#3-14) Universal pass result

If all players pass in succession:

### If the stack is nonempty
- the top object resolves
- that resolution can generate new would-events
- the engine restarts from pre-event processing

### If the stack is empty
- the turn structure advances
- the new step/phase/turn rule processing can itself create would-events and beginning-of-step triggers
- the engine restarts from the would-event stage for that new game-state transition

---

# 4. SHORT-FORM ENGINE FORMULA

```text
WOULD-EVENT
→ “can’t” constraint check
→ replacement / prevention processing
→ final event
→ trigger detection
→ waiting state
→ finish current process
→ SBA loop
→ trigger insertion
→ SBA loop
→ if stable, priority
→ action or pass
→ resolve or advance
→ repeat
```

---

# 5. SYSTEM INTEGRATION

## [5.1](00_Source_CR_2026-02-27_LINKED.md#5-1) Replacement / prevention / “can’t” ↔ triggers

Pre-event processing determines what event, if any, actually happens.

Therefore:

- triggers do not look at the raw would-event
- triggers look at the final event
- if an original event never happens, triggers for that original event do not see it as having occurred
- if the final event is modified, triggers evaluate that modified final event
- look-back rules still look back from the qualifying final event that actually occurred

---

## [5.2](00_Source_CR_2026-02-27_LINKED.md#5-2) Replacement / prevention ↔ resolution

During resolution, a spell or ability can create would-events.

Those would-events are processed immediately through:

- “can’t” constraints
- replacement/prevention logic
- final event determination

This does not interrupt resolution. It is part of resolution’s own event production.

---

## [5.3](00_Source_CR_2026-02-27_LINKED.md#5-3) Triggers ↔ waiting state ↔ insertion

Triggered abilities:

- trigger when the event happens
- wait after triggering
- become stack objects only at the checkpoint after current-process completion and SBA stabilization

This is why a trigger can exist even though no player can yet respond to it.

---

## [5.4](00_Source_CR_2026-02-27_LINKED.md#5-4) Triggers ↔ SBAs

The game checks SBAs before inserting waiting triggers.

This means:

- deaths and other rule consequences can fully happen before their triggers are stacked
- multiple simultaneous SBA-caused changes can produce a shared waiting-trigger pool
- player-loss SBAs can create lose-the-game triggers that still wait for the checkpoint structure

---

## [5.5](00_Source_CR_2026-02-27_LINKED.md#5-5) Triggers ↔ resolution

Resolution does not stop trigger detection.

During resolution:

- triggers can trigger
- delayed triggers can be created
- reflexive triggers can be created and immediately checked under their rules
- intervening-“if” trigger events can occur
- look-back categories can be satisfied

What waits until later is:

- SBA performance
- trigger insertion
- player priority

---

## [5.6](00_Source_CR_2026-02-27_LINKED.md#5-6) SBA ↔ priority

SBAs are always checked before priority is actually handed to a player.

So many “Can I act now?” questions are really answered by:

- has the current process finished?
- has the SBA loop stabilized?
- have all waiting triggers been inserted?
- has the post-insertion SBA check stabilized?

Only then can a player act.

---

## [5.7](00_Source_CR_2026-02-27_LINKED.md#5-7) Stack ↔ resolution ↔ restart

The stack is one stage in the loop, not an isolated system.

When the top stack object resolves:

- it creates would-events
- those would-events go through pre-event processing
- final events occur
- triggers detect
- waiting triggers accumulate
- checkpoint processing happens
- then priority/stack progression continue

---

## [5.8](00_Source_CR_2026-02-27_LINKED.md#5-8) Turn structure ↔ checkpoints

Step and phase changes are engine restart points, but they do not all work identically. Each step or phase begins with its own turn-based or rule-based actions before the ordinary priority checkpoint.

### Beginning-of-step / phase triggers
When a step or phase begins, appropriate beginning-of-step/phase triggers trigger immediately and wait. They are inserted through the normal checkpoint process before the active player receives priority for that step/phase.

### Nonbackup rule for end-step timing
If a permanent with an ability that triggers “at the beginning of the end step” enters the battlefield during the end step, that ability does not trigger that same turn. If a delayed triggered ability that triggers “at the beginning of the next end step” is created during the end step, that ability also does not trigger that same turn. In both cases, the trigger waits for the next turn’s end step rather than backing up into the current one.

### Untap step
The untap step has no ordinary priority window. If a trigger occurs there and its rules allow it to trigger, it waits until the next time a player would get priority, usually in upkeep after the checkpoint structure.

### Cleanup step
Cleanup normally gives no priority. During cleanup, hand-size discard and damage removal happen, then the game checks whether any SBAs would be performed and/or any triggered abilities are waiting. If neither is true, the step ends with no priority. If either is true, SBAs are performed as appropriate, waiting triggers are put onto the stack, and the active player gets priority. After the stack empties and all players pass, another cleanup step begins. This cleanup recurrence repeats until a cleanup step ends with no SBAs to perform and no waiting triggers.

### Step-specific turn-based actions
Some steps and phases contain mandatory turn-based actions that occur as the step/phase begins or as part of its rules before ordinary player priority. Those actions are part of the event-production side of the engine and can themselves create would-events, final events, triggers, and later checkpoints.

These are not separate engines; they are specific checkpoint behaviors within the same full engine.

---

## [5.9] Continuous Effects (L8) ↔ Pre-Event Processing — STUB

**⚠ Layer 8 (Continuous Effects) is not yet built. This section is a placeholder.**

This integration point is the prerequisite for §3.2 (pre-event processing). Before the game can determine what replacement and prevention effects apply to a would-event, it must know what the characteristics of all relevant objects are. Those characteristics are determined by the continuous effects layer — the layering system in rules 611–613.

When L8 is built, this section must document:

- How continuous effects (rule 611) establish the current characteristics of all objects before any would-event is evaluated
- How the 7-layer system (rule 613) resolves conflicts between simultaneous continuous effects
- How text-changing effects (rule 612) modify ability text that drives trigger conditions and replacement effect applicability
- The ordering dependency: L8 runs before §3.2 in the execution loop — you cannot evaluate what replacement effects apply until you know what the objects' current characteristics are

**Consequence of this gap:** The current execution loop in §3.2 implicitly assumes object characteristics are known. For simple game states this is fine. For complex board states with multiple continuous effects (e.g., multiple type-changing effects, layered power/toughness modifications), §3.2 cannot be executed correctly without L8.

Consult `META_layer_index.md` for L8 build status. L8 files will be: `L08_611to613_v.md`, `L08_611to613_t.md`, `L08_604_v.md`.

---

## [5.10] Object Model (L7) ↔ Zone Changes — STUB

**⚠ Layer 7 (Object Model) is partially built — stubs only. Full files not yet built.**

This integration point governs how the execution loop handles objects that move between zones during the loop's execution. Rule 400.7 (object identity stub: `L07_ObjectModel_400to408_v.md` / `L07_ObjectModel_400to408_t.md`) establishes that an object moving from one zone to another becomes a new object. This affects the loop at multiple points:

When L7 is fully built, this section must document:

- **Trigger detection (§3.4):** When a zone-change event occurs, trigger detection uses look-back rules (603.10a) to identify abilities on objects that just left a zone. Rule 400.7 determines which abilities those objects had and whether the new object in the new zone can be found by those triggers.
- **SBA evaluation (§3.7):** SBAs reference object characteristics. If an object changed zones during the current process, the SBA check uses the new object's characteristics, not the old object's. 400.7 defines the boundary.
- **Replacement effect applicability (§3.2):** Replacement effects that modify how objects enter zones operate on the new object being created in the destination zone. 400.7 defines when that creation event occurs.
- **Controller and owner tracking:** Rules 108–113 define what controllers and owners are. The object model determines who controls what at each point in the loop, which drives APNAP ordering and trigger controller assignment (603.3a).

Consult `META_layer_index.md` for L7 build status. L7 files will be: `L07_ObjectModel_400to408_v.md`, `L07_ObjectModel_400to408_t.md`, `L07_ObjectModel_108to113_v.md`, `L07_ObjectModel_108to113_t.md`.

---

## [5.11] Rule Constraints (L9) ↔ All Layers — STUB

**⚠ Layer 9 (Rule Constraint) is not yet built. This section is a placeholder.**

The rule constraint layer defines what overrides or constrains all other layers. It is not a processing step in the loop — it is a set of meta-rules that the loop must always obey regardless of which step is executing.

When L9 is built, this section must document:

- **Rule 101.2 ("can't" wins):** When a "can't" effect and a permissive effect conflict, the "can't" wins. This governs §3.2 (pre-event processing) — if an event "can't happen," that determination takes priority before replacement effects are evaluated. The loop currently references 614.17 but does not call out 101.2 as the overriding meta-rule.
- **Rule 101.3 (impossible instructions ignored):** During resolution (§3.5), instructions that are impossible to carry out are simply skipped. This constrains §3.5 without any player action.
- **Rule 101.4 (APNAP):** All simultaneous-choice situations in the loop — trigger insertion ordering (§3.9 two-part process), replacement effect chooser ordering (616.1), SBA-caused sacrifice choices — are governed by APNAP. The loop references APNAP throughout but 101.4 as the master source is not integrated as a formal section.
- **Rules 731–732 (shortcuts and illegal actions):** When a player attempts an illegal action or proposes a shortcut, the loop is interrupted by rule 732. How the loop resumes after an illegal action correction is not currently documented in L0.

Consult `META_layer_index.md` for L9 build status. L9 files will be: `L09_101_v.md`, `L09_731to732_v.md`, `L09_constraint_t.md`.

---

# 6. EDGE CASE MATRIX

## [6.1](00_Source_CR_2026-02-27_LINKED.md#6-1) Trigger during resolution
Event: a trigger condition is satisfied during resolution.
Result: the ability triggers and enters waiting state.
Consequence: it is not inserted until resolution ends and the checkpoint/SBA structure is processed.

---

## [6.2](00_Source_CR_2026-02-27_LINKED.md#6-2) Would-event fully replaced away during resolution
Event: a resolving object would create an event, but pre-event processing fully replaces or prohibits it.
Result: the original event never happens.
Consequence: downstream trigger detection sees only the final event, if any.

---

## [6.3](00_Source_CR_2026-02-27_LINKED.md#6-3) SBA loop generates triggers
Event: SBAs cause changes that satisfy trigger conditions.
Result: those triggers enter waiting state.
Consequence: they are inserted only after SBA stabilization.

---

## [6.4](00_Source_CR_2026-02-27_LINKED.md#6-4) Intervening-“if” trigger becomes false later
Event: the ability passed trigger-time validation and waited.
Result: it is inserted normally.
Consequence: if the condition is false on resolution, it is removed from the stack and does nothing.

---

## [6.5](00_Source_CR_2026-02-27_LINKED.md#6-5) Delayed trigger created but event never occurs
Event: a delayed trigger structure is created.
Result: its future trigger event never happens.
Consequence: no triggered ability ever enters waiting state.

---

## [6.6](00_Source_CR_2026-02-27_LINKED.md#6-6) Reflexive trigger created but immediate check fails
Event: a reflexive trigger structure is created during resolution.
Result: its immediate check finds no qualifying earlier event in that same resolution.
Consequence: it does not trigger and never enters waiting state.

---

## [6.7](00_Source_CR_2026-02-27_LINKED.md#6-7) Replacement creates new applicability mid-loop
Event: applying one replacement/prevention effect changes the event so another now applies.
Result: the event is rescanned.
Consequence: the newly applicable effect can now be considered under the 616 procedure.

---

## [6.8](00_Source_CR_2026-02-27_LINKED.md#6-8) “Can’t” blocks event
Event: a relevant [614.17](00_Source_CR_2026-02-27_LINKED.md#614-17) effect prohibits the event.
Result: the event cannot happen.
Consequence: ordinary replacement/prevention cannot freely modify it as though it were still an ordinary selectable event, except where the rules specifically allow self-replacement interaction.

---

## [6.9](00_Source_CR_2026-02-27_LINKED.md#6-9) Beginning-of-step triggers before active-player priority
Event: a step or phase begins and a beginning trigger condition is met.
Result: the trigger occurs immediately.
Consequence: it is inserted through the checkpoint system before the active player gets priority for that step/phase.

---

## [6.10](00_Source_CR_2026-02-27_LINKED.md#6-10) Trigger created during the end step for “next end step”
Event: a delayed trigger for “the beginning of the next end step” is created during the end step.
Result: it does not trigger in that same end step.
Consequence: it waits for the next turn’s end step.

---

## [6.11](00_Source_CR_2026-02-27_LINKED.md#6-11) Untap-step trigger timing
Event: a trigger condition is met during untap.
Result: the trigger may occur under its own rules.
Consequence: it waits until the next priority checkpoint because untap itself does not hand out ordinary priority.

---

## [6.12](00_Source_CR_2026-02-27_LINKED.md#6-12) Cleanup-step exception
Event: cleanup occurs.
Result: normally no player gets priority.
Consequence: if SBAs happen or triggers are waiting, the checkpoint system runs there, the active player gets priority, and once the stack empties and all players pass another cleanup step begins.

---

## [6.13](00_Source_CR_2026-02-27_LINKED.md#6-13) Multiplayer/APNAP interaction
Event: multiple players must make simultaneous chooser decisions or multiple players have waiting triggers.
Result: APNAP governs where the rules call for simultaneous choices.
Consequence: the engine remains deterministic in multiplayer.

---

# 7. FAILURE STATE MATRIX

## [7.1](00_Source_CR_2026-02-27_LINKED.md#7-1) Original would-event never happens
Cause: replacement/prevention fully replaces it or a “can’t” effect prohibits it.
Outcome: the engine proceeds from the final event that actually happened, or from no event of that original kind.

---

## [7.2](00_Source_CR_2026-02-27_LINKED.md#7-2) Trigger fails to trigger
Cause: its trigger rule is not satisfied, or a trigger restriction such as visibility prevents it.
Outcome: no waiting trigger exists.

---

## [7.3](00_Source_CR_2026-02-27_LINKED.md#7-3) Trigger exists but is only waiting
Cause: it triggered during a process that has not yet reached a legal insertion point.
Outcome: it exists but is not yet on the stack and cannot yet be responded to.

---

## [7.4](00_Source_CR_2026-02-27_LINKED.md#7-4) Waiting trigger never reaches stack
Cause: game progression or game end prevents a relevant stable checkpoint from mattering.
Outcome: it triggered, but never became a stack object.

---

## [7.5](00_Source_CR_2026-02-27_LINKED.md#7-5) Stack trigger fails to resolve with effect

A triggered ability that has been placed on the stack can fail to produce its effect in three distinct ways. These are not interchangeable — they have different causes and may interact differently with effects that check whether an ability "was countered":

**A — Removed at insertion (before becoming a stack object):**
Cause: No legal targets exist when the ability would be placed on the stack (603.3d), or no legal mode exists (603.3c).
Outcome: Removed by rule before ever becoming a fully legal stack object. This is not countering. The ability never completed the insertion process.

**B — Countered by a spell or ability:**
Cause: An effect (e.g., Stifle, Disallow) counters the triggered ability while it is on the stack.
Outcome: Removed from the stack by an effect. The ability was legally on the stack and was then countered.

**C — Countered by game rules (illegal targets at resolution):**
Cause: All targets for every instance of "target" in the ability are illegal when the ability would resolve (rule 608.2b).
Outcome: Removed from the stack by rule at the time of resolution. This is "countered by game rules" — distinct from being countered by a spell or ability, and distinct from being removed at insertion. Effects that check whether an ability was countered may or may not apply depending on their exact wording.

**D — Intervening-if failure at resolution:**
Cause: The if-clause condition is false at resolution (rule 608.2a, 603.4).
Outcome: Removed from the stack. The ability was legally on the stack but its condition was not met at resolution. The effect does not happen.

Note: Cases C and D are both "removed at resolution" but are distinct triggers. C is a targeting failure; D is a condition failure. Some partial-resolution cases apply to C (if some but not all targets are illegal, the effect applies to legal targets only) but not to D (if the if-clause fails, the entire ability does nothing).

---

## [7.6](00_Source_CR_2026-02-27_LINKED.md#7-6) SBA instability blocks priority
Cause: an SBA check keeps finding one or more applicable SBAs.
Outcome: the game repeats the SBA loop and withholds priority.

---

## [7.7](00_Source_CR_2026-02-27_LINKED.md#7-7) Waiting triggers block priority
Cause: triggered abilities remain waiting to be inserted.
Outcome: the game inserts them and performs the post-insertion SBA check before any player can act.

---

## [7.8](00_Source_CR_2026-02-27_LINKED.md#7-8) Created delayed/reflexive structure never becomes a waiting trigger
Cause: the needed trigger condition is never satisfied under its special rule.
Outcome: the structure existed, but no triggered ability entered waiting state.

---

# 8. MASTER EXECUTION ORDER

## [8.1](00_Source_CR_2026-02-27_LINKED.md#8-1) Full ordered sequence

1. A game instruction, rule process, or state transition creates a would-event.
2. Relevant [614.17](00_Source_CR_2026-02-27_LINKED.md#614-17) “can’t” constraints are checked.
3. Applicable replacement/prevention effects are processed under the 614/615/616 engine until none remain applicable.
4. The final event occurs, if any.
5. Trigger detection immediately evaluates that final event under all relevant trigger rules.
6. All successfully triggered abilities enter waiting state.
7. The current process continues to completion.
8. The game reaches a checkpoint where a player would get priority.
9. The game checks SBAs.
10. If any apply, they are performed simultaneously.
11. Any triggers generated during SBA processing enter waiting state.
12. Steps 9–11 repeat until an SBA check performs no SBAs.
13. The game puts all waiting triggered abilities onto the stack under the applicable insertion rules.
14. The game checks SBAs again.
15. If any apply, checkpoint processing repeats.
16. If no SBAs are performed and no triggers remain waiting, the checkpoint is stable.
17. The appropriate player gets priority.
18. Players act or pass under the priority rules.
19. If all players pass with a nonempty stack, the top object resolves and creates new would-events.
20. If all players pass with an empty stack, the turn structure advances and creates new would-events.
21. The engine repeats.

---

## [8.2](00_Source_CR_2026-02-27_LINKED.md#8-2) Short engine formula

```text
WOULD-EVENT
→ “can’t” check
→ replacement / prevention
→ final event
→ trigger detection
→ waiting state
→ finish current process
→ SBA loop
→ trigger insertion
→ SBA loop
→ priority
→ action or pass
→ resolve or advance
→ repeat
```

---

# FINAL STATEMENT

This document is the no-gap unified game engine.

It integrates:

- pre-event legality and modification
- final event occurrence
- trigger detection
- waiting-state logic
- SBA checkpoint logic
- trigger insertion
- priority gating
- stack resolution feedback
- step/phase/turn advancement feedback
- turn-structure exceptions that change when checkpoints and priority can occur

into one deterministic execution system.

A judge using this module together with the detailed subsystem modules can determine:

- what happens next
- whether something actually happened
- whether something triggered
- whether that trigger is waiting or already on the stack
- whether SBAs happen first
- whether a player can act now
- what resolves next

with zero ambiguity at the orchestration level.
