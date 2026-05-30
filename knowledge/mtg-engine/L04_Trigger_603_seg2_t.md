# Magic: The Gathering — Triggered Abilities
## ABSOLUTE TRUTH MODULE — SEGMENT 2
## Rule[[603.4](00_Source_CR_2026-02-27_LINKED.md#603-4)](00_Source_CR_2026-02-27_LINKED.md#603-4)–[603.7](00_Source_CR_2026-02-27_LINKED.md#603-7)
## Refined to judge-precision against the February 27, 2026 Comprehensive Rules

---

SOURCES: L04_Trigger_603_seg2_v.md

# PURPOSE

This module defines the execution model for:

- intervening “if” clauses ([603.4](00_Source_CR_2026-02-27_LINKED.md#603-4))
- optional and “unless” triggered abilities ([603.5](00_Source_CR_2026-02-27_LINKED.md#603-5))
- zone-change triggers ([603.6](00_Source_CR_2026-02-27_LINKED.md#603-6))
- delayed triggered abilities ([603.7](00_Source_CR_2026-02-27_LINKED.md#603-7))

This module is an engine document, not a casual explanation document.

It is written to integrate with, but not duplicate:

- priority and stack insertion timing ([603.3](00_Source_CR_2026-02-27_LINKED.md#603-3) / 117)
- resolution rules (608)
- replacement effects (614)
- state-based actions (704)
- linked look-back rules for special trigger classes (especially [603.10](00_Source_CR_2026-02-27_LINKED.md#603-10))

Primary rule basis for this module: Rule[[603.4](00_Source_CR_2026-02-27_LINKED.md#603-4)](00_Source_CR_2026-02-27_LINKED.md#603-4)–[603.7](00_Source_CR_2026-02-27_LINKED.md#603-7), with limited cross-references where required for engine accuracy. See the Comprehensive Rules text in the uploaded CR document. fileciteturn2file0turn2file4

---

# GLOBAL EXECUTION FRAME

For everything in this segment, keep the following engine sequence fixed:

1. A trigger event or state occurs.
2. Trigger legality is checked under the relevant trigger rule.
3. If the ability triggers, it exists in the waiting state; it is not yet on the stack.
4. The game reaches the next priority checkpoint.
5. State-based actions are checked and performed as required.
6. Waiting triggered abilities are put on the stack.
7. The game checks state-based actions again.
8. Priority is then given if the loop is stable.

That placement sequence is mandated by the SBA / trigger insertion loop. fileciteturn2file12turn2file14

---

# 1. RULE [603.4](00_Source_CR_2026-02-27_LINKED.md#603-4) — INTERVENING “IF” CLAUSE

## [1.1](00_Source_CR_2026-02-27_LINKED.md#1-1) Structural Definition

An intervening-“if” ability has the form:

- “When/Whenever/At [trigger event], if [condition], [effect].”

For this rule to apply, the “if” clause must immediately follow the trigger condition. An “if” elsewhere in the text is just ordinary English and is not governed by rule[[603.4](00_Source_CR_2026-02-27_LINKED.md#603-4)](00_Source_CR_2026-02-27_LINKED.md#603-4). fileciteturn2file0

---

## [1.2](00_Source_CR_2026-02-27_LINKED.md#1-2) Dual-Checkpoint Model

An intervening-“if” ability performs two distinct checks.

### A. Trigger-time check
At the moment the trigger event occurs, the game checks the stated condition.

- If the condition is true, the ability triggers.
- If the condition is false, the ability does not trigger at all.

If it fails here, there is no trigger object, no waiting trigger, and nothing will later be put on the stack. fileciteturn2file0

### B. Resolution-time check
If the ability triggered and later resolves, the game checks the same stated condition again during resolution.

- If the condition is still true, the ability resolves normally.
- If the condition is false, the ability is removed from the stack and does nothing. fileciteturn2file0

---

## [1.3](00_Source_CR_2026-02-27_LINKED.md#1-3) Classification of Failure

Failure of the second check is not:

- countering,
- replacement,
- prevention,
- or a state-based action.

It is rule-governed resolution failure under the intervening-“if” clause rule itself. The CR text expressly says the ability is removed from the stack and does nothing, and notes that this mirrors the legal-target check. fileciteturn2file0

That means:

- an ability that fails its second intervening-“if” check was still triggered,
- was still put onto the stack,
- and still attempted to resolve,
- but its own rule text caused it to be removed from the stack with no effect.

---

## [1.4](00_Source_CR_2026-02-27_LINKED.md#1-4) Relationship to Target Legality

Intervening-“if” validation is separate from target legality.

Both are checked at resolution, but they are not the same rule.

- The “if” clause is checked because [603.4](00_Source_CR_2026-02-27_LINKED.md#603-4) requires it.
- Targets are checked because resolution rules require that.

An ability can fail because:

- its intervening condition is false,
- its targets are illegal,
- or both.

These are separate axes of failure.

---

## [1.5](00_Source_CR_2026-02-27_LINKED.md#1-5) Interaction with the Waiting State and Stack Insertion

If the trigger-time check is passed, the ability triggers immediately but does not go on the stack immediately. It waits until the next insertion point under [603.3](00_Source_CR_2026-02-27_LINKED.md#603-3) / [704.3](00_Source_CR_2026-02-27_LINKED.md#704-3). fileciteturn2file2turn2file12

Therefore:

- the condition can be true when the event happens,
- the trigger can exist in the waiting state,
- and the condition can become false before stack insertion or before resolution.

That does not undo the trigger. It only matters when the ability later resolves and performs the second check.

---

## [1.6](00_Source_CR_2026-02-27_LINKED.md#1-6) Interaction with State-Based Actions

State-based actions are checked before waiting triggers are put on the stack, and again after they are put on the stack. fileciteturn2file12turn2file14

Therefore:

- an intervening-“if” ability can trigger,
- wait while SBAs are performed,
- then be put on the stack,
- then later resolve and fail because the condition changed before resolution.

This is one of the main ways an intervening-“if” trigger can be valid at trigger time and invalid at resolution time.

---

## [1.7](00_Source_CR_2026-02-27_LINKED.md#1-7) Interaction with Replacement Effects

Replacement effects can prevent or modify the event that would otherwise satisfy the trigger condition.

If the relevant event never actually happens because it is replaced, then there is no trigger event to satisfy the first [603.4](00_Source_CR_2026-02-27_LINKED.md#603-4) check, so the ability does not trigger. If the event is modified rather than wholly prevented, the modified event is what is tested. This follows from the general interaction of triggers with replacement-modified events. fileciteturn2file0

---

## [1.8](00_Source_CR_2026-02-27_LINKED.md#1-8) Interaction with Delayed Triggers

An ability created under [603.7](00_Source_CR_2026-02-27_LINKED.md#603-7) can itself contain an intervening “if” clause. If so, [603.4](00_Source_CR_2026-02-27_LINKED.md#603-4) applies normally:

- the delayed ability must pass the condition when its trigger event occurs,
- and it must pass the condition again when it resolves.

Delayed status does not remove the two-check structure.

---

## [1.9](00_Source_CR_2026-02-27_LINKED.md#1-9) Edge Precision

A condition becoming false during the resolution of a different spell or ability does not matter by itself. What matters is whether the condition is true at the exact resolution point of the intervening-“if” ability itself. The second check belongs to that ability’s own resolution. fileciteturn2file0turn2file2

---

# 2. RULE [603.5](00_Source_CR_2026-02-27_LINKED.md#603-5) — OPTIONAL TRIGGERS AND “UNLESS” TRIGGERS

## [2.1](00_Source_CR_2026-02-27_LINKED.md#2-1) Core Rule

Some triggered abilities have optional effects because they contain “may.” Some triggered abilities contain an “unless” structure. Rule[[603.5](00_Source_CR_2026-02-27_LINKED.md#603-5)](00_Source_CR_2026-02-27_LINKED.md#603-5) makes both categories behave the same at trigger time and stack-insertion time:

- they trigger normally,
- they go on the stack normally,
- the later choice or “unless” determination is handled on resolution. fileciteturn2file0

---

## [2.2](00_Source_CR_2026-02-27_LINKED.md#2-2) Optional Trigger Execution

If a triggered ability says “you may” do something, that optionality does not exist at trigger creation.

The sequence is:

1. trigger event occurs;
2. ability triggers;
3. ability waits;
4. ability is put on the stack;
5. on resolution, the controller chooses whether to perform the optional effect. fileciteturn2file0turn2file2

Therefore:

- “may” does not let a player choose not to have the ability trigger;
- “may” does not let a player choose not to put the ability on the stack;
- “may” only governs what happens when the ability resolves.

---

## [2.3](00_Source_CR_2026-02-27_LINKED.md#2-3) “Unless” Structure

An “unless” triggered ability also triggers normally and goes on the stack normally. The “unless” clause is not a trigger-time gate.

Instead, it creates a conditional resolution branch.

Examples of what that means in engine terms:

- the ability still exists on the stack;
- players can respond to it;
- it can be countered like any other triggered ability that is on the stack;
- the “unless” determination is made when the ability resolves, not before. fileciteturn2file0

So “unless” is not an opt-out from triggering. It is a rule for how resolution is processed once the ability is already resolving.

---

## [2.4](00_Source_CR_2026-02-27_LINKED.md#2-4) Independence from Ordering and APNAP

Because optionality and “unless” are handled only on resolution, they do not affect:

- whether the ability triggers,
- whether it is waiting,
- APNAP stack insertion order,
- or whether players may respond to it.

All of those are settled before the resolution choice is made. fileciteturn2file2turn2file12

---

## [2.5](00_Source_CR_2026-02-27_LINKED.md#2-5) Interaction with Countering and Illegal Targets

If a [603.5](00_Source_CR_2026-02-27_LINKED.md#603-5) trigger is on the stack, it can still be countered, and any target requirements are still governed by the normal resolution rules.

This means:

- a “may” trigger can be countered before its controller ever gets to choose the “may” option;
- an “unless” trigger can be countered before the “unless” branch is reached;
- if targets are illegal at resolution, target illegality is handled under normal resolution rules rather than by [603.5](00_Source_CR_2026-02-27_LINKED.md#603-5) itself.

[603.5](00_Source_CR_2026-02-27_LINKED.md#603-5) does not change the ordinary rules for targets or for countering an ability that is already on the stack.

---

# 3. RULE [603.6](00_Source_CR_2026-02-27_LINKED.md#603-6) — ZONE-CHANGE TRIGGERS

## [3.1](00_Source_CR_2026-02-27_LINKED.md#3-1) Core Definition

Zone-change triggers are triggers whose triggering event involves an object changing zones. Many of these abilities attempt to do something to that object after the zone change. During resolution, the ability looks for the object in the zone it moved to. If it cannot find it there, the part of the ability that tries to do something to that object fails to do anything. fileciteturn2file0

The CR identifies enters-the-battlefield and leaves-the-battlefield abilities as the most common zone-change triggers. fileciteturn2file0

---

## [3.2](00_Source_CR_2026-02-27_LINKED.md#3-2) Triggering vs Resolving

There are two separate questions:

### A. Did the ability trigger?
That is determined under the trigger rules, often using the object and event as the rules define them for trigger detection. Segment 1 already established that zone-change triggers track objects by identity across zones. fileciteturn2file6

### B. Can the ability affect the object on resolution?
That is the [603.6](00_Source_CR_2026-02-27_LINKED.md#603-6) question. During resolution, the ability looks for the object in the zone it moved to. If it is not there, the object-dependent part fails. fileciteturn2file0

This distinction is critical. “Triggered” and “can still affect the object when resolving” are not the same thing.

---

## [3.3](00_Source_CR_2026-02-27_LINKED.md#3-3) Failure-to-Find Is Not Countering

If the object cannot be found in the destination zone, that does not mean the ability was countered, and it does not mean the ability was removed from the stack by rule[[603.6](00_Source_CR_2026-02-27_LINKED.md#603-6)](00_Source_CR_2026-02-27_LINKED.md#603-6).

What rule[[603.6](00_Source_CR_2026-02-27_LINKED.md#603-6)](00_Source_CR_2026-02-27_LINKED.md#603-6) says is narrower: the part of the ability attempting to do something to that object fails to do anything. fileciteturn2file0

Judge-level consequence:

- the ability still resolves unless something else prevents that;
- only the object-dependent portion fails;
- any independent portions of the effect still resolve if they can.

So “fail to find the object” is not equivalent to “the ability fizzles” in the broad sense. It is a partial or total effect failure depending on the text of the ability.

---

## [3.4](00_Source_CR_2026-02-27_LINKED.md#3-4) Why the Ability May Fail to Find the Object

Rule[[603.6](00_Source_CR_2026-02-27_LINKED.md#603-6)](00_Source_CR_2026-02-27_LINKED.md#603-6) gives several specific failure modes:

- the object never entered the specified zone;
- it left that zone before the ability resolved;
- it is in a hidden zone from the relevant player, such as a library or an opponent’s hand. fileciteturn2file0

It also expressly states that the rule still applies even if the object left the zone and returned before the ability resolved. That is because the returned object is a new object, not the original one the trigger is tracking. fileciteturn2file0

---

## [3.5](00_Source_CR_2026-02-27_LINKED.md#3-5) Relationship to Last Known Information

Last known information helps determine triggering in appropriate cases, but [603.6](00_Source_CR_2026-02-27_LINKED.md#603-6) is about later resolution against the object in the zone it went to. Segment 1 correctly identified that zone-change triggers use object identity across zones for trigger detection. fileciteturn2file6

However, once [603.6](00_Source_CR_2026-02-27_LINKED.md#603-6) is in play, the rule is:

- look for the object in the destination zone;
- if it is not found there as required, the object-dependent portion fails. fileciteturn2file0

So LKI is not a blanket substitute for finding the object during [603.6](00_Source_CR_2026-02-27_LINKED.md#603-6) resolution.

---

## [3.6](00_Source_CR_2026-02-27_LINKED.md#3-6) Rule[[603.6a](00_Source_CR_2026-02-27_LINKED.md#603-6a)](00_Source_CR_2026-02-27_LINKED.md#603-6a) — Enters-the-Battlefield Abilities

Enters-the-battlefield abilities trigger when a permanent enters the battlefield. When one or more permanents enter at once, all permanents on the battlefield are checked for matching ETB triggers, including the newly entered permanents. fileciteturn2file0

Judge-level consequences:

- existing permanents can see the new entries;
- entering permanents can see themselves and other simultaneous entrants if their trigger conditions match;
- each relevant permanent is checked against the same event.

This rule is one of the foundations of simultaneous ETB trigger handling.

---

## [3.7](00_Source_CR_2026-02-27_LINKED.md#3-7) Rule[[603.6b](00_Source_CR_2026-02-27_LINKED.md#603-6b)](00_Source_CR_2026-02-27_LINKED.md#603-6b) — Continuous-Effect Timing at Entry

Continuous effects that modify a permanent’s characteristics apply the moment the permanent is on the battlefield, not before then. The permanent is never on the battlefield with unmodified characteristics. But those continuous effects do not apply before the permanent is on the battlefield. fileciteturn2file0

This timing boundary matters.

### What is true:
- once the permanent is on the battlefield, applicable continuous effects already modify it;
- ETB trigger checking sees the permanent as it exists on the battlefield under those effects. fileciteturn2file0

### What is not true:
- those effects are not applied in some pre-battlefield staging zone before entry.

So the correct statement is not merely “the object never exists unmodified” in the abstract. The precise statement is:

- it is never on the battlefield unmodified,
- but pre-entry application still does not happen. fileciteturn2file0

That boundary is why “all lands are creatures” can let a land entering the battlefield trigger creature-entry abilities, while “all creatures lose all abilities” can prevent a creature’s own ETB ability from triggering. Rule[[603.6b](00_Source_CR_2026-02-27_LINKED.md#603-6b)](00_Source_CR_2026-02-27_LINKED.md#603-6b) gives both examples directly. fileciteturn2file0

---

## [3.8](00_Source_CR_2026-02-27_LINKED.md#3-8) Rule[[603.6c](00_Source_CR_2026-02-27_LINKED.md#603-6c)](00_Source_CR_2026-02-27_LINKED.md#603-6c) — Leaves-the-Battlefield Abilities

Leaves-the-battlefield abilities trigger when a permanent moves from the battlefield to another zone, or when a phased-in permanent leaves the game because its owner leaves the game. These abilities check only the first zone the object went to when trying to do something to the card that left the battlefield. fileciteturn2file0

Critical distinction:

- a trigger that cares about a card being put into a zone “from anywhere” is never treated as a leaves-the-battlefield ability, even when the actual movement was from the battlefield. fileciteturn2file0

This matters because the trigger class determines what special zone-change handling applies.

Also note: some leaves-the-battlefield-type triggers are in the [603.10](00_Source_CR_2026-02-27_LINKED.md#603-10) look-back set, but that is a separate rule family and should be handled there rather than duplicated here. fileciteturn2file4

---

## [3.9](00_Source_CR_2026-02-27_LINKED.md#3-9) Rule[[603.6d](00_Source_CR_2026-02-27_LINKED.md#603-6d)](00_Source_CR_2026-02-27_LINKED.md#603-6d) — “Enters with / as / tapped” Is Not a Trigger

Text of the form:

- “[This permanent] enters with …”
- “As [this permanent] enters …”
- “[This permanent] enters as …”
- “[This permanent] enters tapped”

is not a triggered ability. It is a static ability whose effect occurs as part of the event of entering the battlefield. fileciteturn2file0

Engine consequence:

- no trigger is created,
- nothing waits to be put on the stack,
- no player can respond to that text as though it were a trigger,
- and it is part of the entry event itself.

---

## [3.10](00_Source_CR_2026-02-27_LINKED.md#3-10) Rule[[603.6e](00_Source_CR_2026-02-27_LINKED.md#603-6e)](00_Source_CR_2026-02-27_LINKED.md#603-6e) — Aura Tracking Special Case

Some Auras have triggered abilities that trigger when the enchanted permanent leaves the battlefield. These abilities can find:

- the new object that permanent card became in the zone it moved to, and
- the new object the Aura card became in its owner’s graveyard after SBAs have been checked. fileciteturn2file0

This is a specific rule carve-out. It is not a general permission for all zone-change triggers to track every resulting object through every later state. It is a special [603.6e](00_Source_CR_2026-02-27_LINKED.md#603-6e) tracking rule.

Because the Aura’s own movement to the graveyard commonly depends on SBA cleanup after becoming unattached, the rule expressly ties this case into post-SBA identification. fileciteturn2file0turn2file12

---

# 4. RULE [603.7](00_Source_CR_2026-02-27_LINKED.md#603-7) — DELAYED TRIGGERED ABILITIES

## [4.1](00_Source_CR_2026-02-27_LINKED.md#4-1) Core Definition

An effect may create a delayed triggered ability that does something later. A delayed triggered ability contains “when,” “whenever,” or “at,” though that word usually does not begin the ability. fileciteturn2file0

Delayed triggered abilities are real triggered abilities. They use the normal trigger / waiting / stack-insertion model unless a more specific rule says otherwise.

---

## [4.2](00_Source_CR_2026-02-27_LINKED.md#4-2) Rule[[603.7a](00_Source_CR_2026-02-27_LINKED.md#603-7a)](00_Source_CR_2026-02-27_LINKED.md#603-7a) — How Delayed Triggers Are Created

A delayed triggered ability can be created:

- during the resolution of a spell,
- during the resolution of an ability,
- as the result of a replacement effect being applied,
- or as the result of a static ability that allows a player to take an action. fileciteturn2file0

This is broader than “created during resolution” alone. For judge precision, all four creation routes matter.

---

## [4.3](00_Source_CR_2026-02-27_LINKED.md#4-3) Creation Timing Is Absolute

A delayed triggered ability cannot trigger before it exists.

Rule[[603.7a](00_Source_CR_2026-02-27_LINKED.md#603-7a)](00_Source_CR_2026-02-27_LINKED.md#603-7a) is explicit: a delayed triggered ability will not trigger until it has actually been created, even if its trigger event occurred just beforehand. Earlier events can make the later trigger event impossible. fileciteturn2file0

This means:

- the ability is not “missed”;
- the game does not retroactively generate it;
- it is not waiting for a past event;
- it simply did not yet exist when that event happened.

That is the correct engine model for “event already happened” cases.

---

## [4.4](00_Source_CR_2026-02-27_LINKED.md#4-4) Rule[[603.7b](00_Source_CR_2026-02-27_LINKED.md#603-7b)](00_Source_CR_2026-02-27_LINKED.md#603-7b) — Single-Use vs Duration-Based Delayed Triggers

By default, a delayed triggered ability triggers only once: the next time its trigger event occurs. If it has a stated duration, such as “this turn,” it can remain applicable within that duration. fileciteturn2file0

### Single-use model
Without a stated duration:

- it is waiting for the next qualifying occurrence,
- it triggers once,
- and that consumes it.

### Duration model
With a stated duration:

- it remains operative for the stated duration,
- and can trigger during that duration according to its wording.

---

## [4.5](00_Source_CR_2026-02-27_LINKED.md#4-5) Simultaneous Multiple Events Under [603.7b](00_Source_CR_2026-02-27_LINKED.md#603-7b)

If the trigger event occurs more than once simultaneously and the delayed triggered ability does not have a stated duration, the controller of that delayed triggered ability chooses which event causes it to trigger. fileciteturn2file0

This is a precise consumption rule.

So for a single-use delayed trigger:

- simultaneous multiple qualifying events do not create multiple triggerings;
- the controller selects which simultaneous event is the one that counts;
- the delayed trigger is then consumed by that chosen event. fileciteturn2file0

This is stricter than merely saying it “fires once.”

---

## [4.6](00_Source_CR_2026-02-27_LINKED.md#4-6) Rule[[603.7c](00_Source_CR_2026-02-27_LINKED.md#603-7c)](00_Source_CR_2026-02-27_LINKED.md#603-7c) — Object Reference, Characteristic Change, and Zone Failure

A delayed triggered ability that refers to a particular object still affects it even if that object changes characteristics. But if the object is not in the zone it is expected to be in when the delayed triggered ability resolves, the ability will not affect it. If it left that zone and returned, it is a new object and also will not be affected. fileciteturn2file0

This yields three distinct principles:

### A. Characteristic changes do not break the reference
The object can still be affected if it is the same object in the expected zone.

### B. Zone expectation matters
If the object is not in the expected zone at resolution, the ability does not affect it.

### C. New-object rule still applies
If it left and came back, it is a new object and not the originally referenced one. fileciteturn2file0

---

## [4.7](00_Source_CR_2026-02-27_LINKED.md#4-7) Rule[[603.7d](00_Source_CR_2026-02-27_LINKED.md#603-7d)](00_Source_CR_2026-02-27_LINKED.md#603-7d)–[603.7g](00_Source_CR_2026-02-27_LINKED.md#603-7g) — Source and Controller of Delayed Triggers

These subrules matter because delayed triggered abilities need a source and a controller for stack interaction and rules processing.

### [603.7d](00_Source_CR_2026-02-27_LINKED.md#603-7d) — created by a spell
- source = that spell
- controller = the player who controlled that spell as it resolved fileciteturn2file0

### [603.7e](00_Source_CR_2026-02-27_LINKED.md#603-7e) — created by an activated or triggered ability
- source = the same source as that ability
- controller = the player who controlled that ability as it resolved fileciteturn2file0

### [603.7f](00_Source_CR_2026-02-27_LINKED.md#603-7f) — created by a replacement effect generated by a static ability
- source = the object with that static ability
- controller = the controller of that object when the replacement effect was applied fileciteturn2file0

### [603.7g](00_Source_CR_2026-02-27_LINKED.md#603-7g) — created because a static ability allowed a player to take an action
- source = the object with that static ability
- controller = the controller of that object when the action was taken fileciteturn2file0

These controller/source assignments are locked by the creation method; they are not re-determined later when the delayed trigger eventually goes on the stack.

---

## [4.8](00_Source_CR_2026-02-27_LINKED.md#4-8) Rule[[603.7h](00_Source_CR_2026-02-27_LINKED.md#603-7h)](00_Source_CR_2026-02-27_LINKED.md#603-7h) — Resolution-Count Delayed Triggers

An activated or triggered ability may create a delayed triggered ability that triggers when the ability that created it has resolved a certain number of times in a turn. In that case, that delayed triggered ability is created only once, during the appropriate resolution of that ability. fileciteturn2file0

This is a narrow but important rule:

- the delayed trigger is not repeatedly recreated each time earlier resolutions happen;
- the CR fixes the creation point to the appropriate resolution instance.

---

## [4.9](00_Source_CR_2026-02-27_LINKED.md#4-9) Delayed Trigger Stack Insertion

Once a delayed triggered ability has actually triggered, it follows the ordinary triggered-ability insertion model:

- it waits until the next time a player would receive priority;
- SBAs are processed first;
- then it is put on the stack in the proper order. fileciteturn2file2turn2file12

So “delayed” changes creation and trigger timing, not the basic stack-entry procedure after the trigger has occurred.

---

## [4.10](00_Source_CR_2026-02-27_LINKED.md#4-10) Delayed Trigger Value Tracking

When a delayed triggered ability refers to the spell or ability that created it, the relevant information is locked in according to the creating rule text. Rule[[603.7](00_Source_CR_2026-02-27_LINKED.md#603-7)](00_Source_CR_2026-02-27_LINKED.md#603-7) itself assigns source/controller, and the broader variable-value rules also preserve chosen X values for delayed triggers created by a spell or ability that used X. The uploaded CR explicitly preserves X in that case. fileciteturn2file0turn2file4

For this module’s purposes, the operative engine rule is:

- delayed triggers use the information established by the effect that created them,
- rather than re-deriving that information from a no-longer-existing spell or ability later.

---

# 5. STACK AND PRIORITY INTEGRATION FOR [603.4](00_Source_CR_2026-02-27_LINKED.md#603-4)–[603.7](00_Source_CR_2026-02-27_LINKED.md#603-7)

## [5.1](00_Source_CR_2026-02-27_LINKED.md#5-1) Nothing in This Segment Bypasses [603.3](00_Source_CR_2026-02-27_LINKED.md#603-3) / [704.3](00_Source_CR_2026-02-27_LINKED.md#704-3)

None of the rules in [603.4](00_Source_CR_2026-02-27_LINKED.md#603-4)–[603.7](00_Source_CR_2026-02-27_LINKED.md#603-7) cause a triggered ability to jump directly onto the stack at the moment it triggers.

That includes:

- intervening-“if” triggers,
- “may” triggers,
- “unless” triggers,
- zone-change triggers,
- delayed triggered abilities.

They all still use the standard triggered-ability waiting state and insertion point unless some other explicit rule says otherwise. fileciteturn2file2turn2file12

---

## [5.2](00_Source_CR_2026-02-27_LINKED.md#5-2) APNAP Ordering Still Governs

When multiple triggered abilities are waiting, they are ordered under the normal APNAP procedure during stack insertion. Optionality, delayed status, and zone-change status do not alter that ordering system. fileciteturn2file2

---

## [5.3](00_Source_CR_2026-02-27_LINKED.md#5-3) SBA Loop Comes First

Because the game checks SBAs before putting waiting triggers onto the stack, all trigger classes in this module are subordinate to the SBA gate:

- if a creature dies and that event causes triggers, SBAs are still processed before those triggers are stacked;
- if an Aura special case under [603.6e](00_Source_CR_2026-02-27_LINKED.md#603-6e) depends on SBA cleanup, that cleanup occurs in the normal SBA place;
- if a delayed trigger is waiting, it still waits through the same checkpoint structure. fileciteturn2file12turn2file14

---

# 6. EDGE-CASE MATRIX

## [6.1](00_Source_CR_2026-02-27_LINKED.md#6-1) Intervening-“If” Becomes False Before Stack Insertion
The trigger still exists if it passed the initial check. The second [603.4](00_Source_CR_2026-02-27_LINKED.md#603-4) check occurs on resolution, not on stack insertion. So the ability can still be put on the stack and later be removed from the stack on resolution for failing the condition. fileciteturn2file0turn2file2

## [6.2](00_Source_CR_2026-02-27_LINKED.md#6-2) Trigger Event Happens Before Delayed Trigger Exists
No trigger occurs. The delayed triggered ability was not yet created, so there is nothing to trigger from that already-completed event. fileciteturn2file0

## [6.3](00_Source_CR_2026-02-27_LINKED.md#6-3) Single-Use Delayed Trigger Faces Simultaneous Multiple Events
It triggers only once, and its controller chooses which simultaneous event is the one that causes it to trigger. fileciteturn2file0

## [6.4](00_Source_CR_2026-02-27_LINKED.md#6-4) Zone-Change Trigger Cannot Find the Moved Object
The ability still resolves unless another rule stops it, but the part trying to do something to that object fails. fileciteturn2file0

## [6.5](00_Source_CR_2026-02-27_LINKED.md#6-5) Object Left Destination Zone and Came Back
[603.6](00_Source_CR_2026-02-27_LINKED.md#603-6) and [603.7c](00_Source_CR_2026-02-27_LINKED.md#603-7c) both preserve the new-object principle. The original reference is not preserved by simply returning to the same zone. fileciteturn2file0

## [6.6](00_Source_CR_2026-02-27_LINKED.md#6-6) ETB Ability and Continuous Effects Conflict
The permanent is checked as it exists on the battlefield under immediately applicable continuous effects, but those effects are not applied before entry. That timing boundary determines whether the ETB trigger exists. fileciteturn2file0

---

# 7. REFLEXIVE TRIGGERED ABILITIES — CROSS-RULE NOTICE

Reflexive triggered abilities are not part of rule[[603.4](00_Source_CR_2026-02-27_LINKED.md#603-4)](00_Source_CR_2026-02-27_LINKED.md#603-4)–[603.7](00_Source_CR_2026-02-27_LINKED.md#603-7). They are defined later in rule[[603.12](00_Source_CR_2026-02-27_LINKED.md#603-12)](00_Source_CR_2026-02-27_LINKED.md#603-12). However, they matter here because the CR expressly states that they follow the rules for delayed triggered abilities, except for their immediate post-creation check timing. fileciteturn2file4

Therefore, for engine integration:

- do not treat reflexive triggered abilities as if they are themselves contained in [603.7](00_Source_CR_2026-02-27_LINKED.md#603-7);
- do treat [603.7](00_Source_CR_2026-02-27_LINKED.md#603-7) as their baseline operational model unless [603.12](00_Source_CR_2026-02-27_LINKED.md#603-12) says otherwise. fileciteturn2file4

This document includes that note only to prevent a future codex collision. Full reflexive-trigger treatment belongs in the later [603.12](00_Source_CR_2026-02-27_LINKED.md#603-12) module, not here.

---

# FINAL STATEMENT

This segment now defines, to judge precision:

- the exact two-check structure of intervening-“if” clauses,
- the fact that “may” and “unless” do not alter trigger creation or stack insertion,
- the distinction between zone-change trigger occurrence and later ability-to-affect-object on resolution,
- the exact creation, consumption, source/controller, and resolution behavior of delayed triggered abilities,
- and the way all of those systems pass through the standard SBA / stack / priority loop.

This document is the proper Absolute Truth expansion layer for Rule[[603.4](00_Source_CR_2026-02-27_LINKED.md#603-4)](00_Source_CR_2026-02-27_LINKED.md#603-4)–[603.7](00_Source_CR_2026-02-27_LINKED.md#603-7).

**Delayed trigger insertion note:** When a delayed triggered ability fires (its future trigger event occurs), it enters the waiting state like any other triggered ability. It is then inserted via the standard 603.3b two-part APNAP process at the next priority checkpoint. The two-part process is documented in L04_Trigger_603_seg1_v.md and L04_Trigger_603_seg1_t.md. Nothing about being a delayed trigger changes the insertion mechanics — only the timing of when the trigger fires.

---

FEEDS INTO: L04_Trigger_engine.md (intervening-if in failure matrix §10; delayed trigger controller in §4.6), L00_Orchestration_game_engine.md (trigger detection §3.4)
