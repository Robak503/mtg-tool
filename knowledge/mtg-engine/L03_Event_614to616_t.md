# Magic: The Gathering — Replacement Effects Engine
## ABSOLUTE TRUTH MODULE — PRECISION LOCK
## LAYER 3: EVENT LAYER — Expansion

---

SOURCES: L03_Event_609to610_t.md, L03_Event_609to610_v.md, L03_Event_614to616_v.md, L07_ObjectModel_105_107_t.md, L07_ObjectModel_105_107_v.md, L07_ObjectModel_108to113_t.md, L07_ObjectModel_122to123_t.md, L07_ObjectModel_300to315_t.md, L07_ObjectModel_400to408_t.md, L07_ObjectModel_607_t.md, L07_ObjectModel_607_v.md, L07_ObjectModel_702_t.md, L07_ObjectModel_707_t.md, L07_ObjectModel_707_v.md
FEEDS INTO: L05_StateEnforcement_704_t.md (type-specific replacement effects), L06_PlayerAction_601_seg1_t.md (ETB replacement at 601.2a), L07_ObjectModel_707_t.md (copy-on-ETB), L10_Variant_903_t.md (commander zone replacement 903.9b)

# 1. SYSTEM ROLE

This module defines the deterministic **pre-event modification engine** for:

- replacement effects (Rule[614](00_Source_CR_2026-02-27_LINKED.md#614))
- prevention effects (Rule[615](00_Source_CR_2026-02-27_LINKED.md#615))
- interaction of replacement and/or prevention effects (Rule[616](00_Source_CR_2026-02-27_LINKED.md#616))

This module does **not** restate the full text of those rules. It defines how they operate as a live engine.

This module integrates with, but does not replace:

- trigger detection (Rule[603](00_Source_CR_2026-02-27_LINKED.md#603))
- resolution (Rule[608](00_Source_CR_2026-02-27_LINKED.md#608))
- state-based actions (Rule[704](00_Source_CR_2026-02-27_LINKED.md#704))
- the broader unified game loop

Replacement/prevention processing occurs **before** the final event happens. Trigger detection and SBA processing occur only after the final event, if any, occurs.

---

# 2. GOVERNING AXIOMS

## Axiom 1 — Replacement and prevention effects modify events before they happen

A replacement or prevention effect watches for an event that **would** happen. It applies before that event occurs and changes, prevents, redirects, skips, or otherwise modifies it. If the event is modified, the original event does not happen; the modified event happens instead.

---

## Axiom 2 — Replacement and prevention effects do not use the stack

They are not triggered abilities. They are not put onto the stack. They are applied as part of event processing itself.

---

## Axiom 3 — Prevention effects are handled inside the same engine family

Prevention effects are not a separate timing engine. They are processed under the same pre-event modification model as replacement effects. fileciteturn11file0

---

## Axiom 4 — A replacement/prevention effect applies to a given event only once

A single effect does not apply repeatedly to the same event or to any modified version of that same event more than once. fileciteturn11file0

---

## Axiom 5 — Replacement processing is iterative

After one effect is applied, the event is re-evaluated. Newly applicable effects may now exist; previously applicable effects may cease to apply. The engine repeats this process until no more applicable replacement/prevention effects remain. fileciteturn11file0

---

## Axiom 6 — Self-replacement has priority within the 616 choice sequence

Self-replacement effects are not a universal super-layer over all other effects in all contexts. They matter when the event being processed is the event of a resolving spell or ability replacing part or all of its own effect. In the [616.1](00_Source_CR_2026-02-27_LINKED.md#616-1) selection process, if any applicable replacement/prevention effects are self-replacement effects, one of them must be chosen first. fileciteturn11file0

---

## Axiom 7 — “Can’t” effects are not replacement effects, but they participate in the same timing space

Rule[[614.17](00_Source_CR_2026-02-27_LINKED.md#614-17)](00_Source_CR_2026-02-27_LINKED.md#614-17) states that “can’t” effects are not replacement effects, but follow similar rules. They must already exist before the event, and they constrain what can happen. They are not chosen in the ordinary replacement/prevention choice loop as though they were ordinary replacement effects. fileciteturn11file0

---

## Axiom 8 — The final modified event, not the replaced event, is what the rest of the engine sees

Triggered abilities check the final event that actually happened. SBAs evaluate the state created by the final event that actually happened. If an event was fully replaced and therefore never happened, the game does not process that original event as though it had occurred. fileciteturn11file0

---

# 3. PRIMARY REPLACEMENT / PREVENTION LOOP

## [3.1](00_Source_CR_2026-02-27_LINKED.md#3-1) Event definition stage

Start with a specific event that would occur.

This event must be defined precisely enough to answer:

- what is happening
- which object(s) or player(s) are affected
- whether the event contains multiple affected objects or subevents
- whether the event is occurring during resolution, turn progression, combat damage, entry, zone change, draw, token creation, counter placement, or another event class

Replacement/prevention processing cannot be done correctly on a vague event description.

---

## [3.2](00_Source_CR_2026-02-27_LINKED.md#3-2) Applicability scan

Identify all replacement effects, prevention effects, and relevant [614.17](00_Source_CR_2026-02-27_LINKED.md#614-17) “can’t” effects that apply to this event in its current form.

At this stage, effects are tested against the event **as currently defined**, not as it was originally defined before prior modifications.

---

## [3.3](00_Source_CR_2026-02-27_LINKED.md#3-3) Selection framework

If no applicable effects exist, the event occurs as currently defined.

If one or more applicable replacement/prevention effects exist, selection is governed by Rule[[616.1](00_Source_CR_2026-02-27_LINKED.md#616-1)](00_Source_CR_2026-02-27_LINKED.md#616-1). The engine does **not** simply say “affected player/controller chooses any effect.” The real structure is ordered. fileciteturn11file0

---

## [3.4](00_Source_CR_2026-02-27_LINKED.md#3-4) Apply chosen effect

Apply the selected replacement/prevention effect to the current event.

This may:

- replace the event entirely
- replace only part of the event
- redirect damage
- prevent some or all damage
- change a destination zone
- change under whose control something enters
- change whether a permanent is a copy as it enters
- replace a step, phase, turn, or draw
- prohibit part of a choice
- create a modified event containing nested subevents

---

## [3.5](00_Source_CR_2026-02-27_LINKED.md#3-5) Re-evaluate the modified event

After application, the current event is no longer the original event. The engine now evaluates the modified event in its new form.

At this point:

- some effects may no longer apply
- some effects may become newly applicable
- dependency relationships may change
- object- or player-choice authority may change if the affected object/event changes
- contained subevents may now exist that earlier did not exist

The loop repeats until no applicable replacement/prevention effects remain.

---

## [3.6](00_Source_CR_2026-02-27_LINKED.md#3-6) Finalization

Only after all applicable replacement/prevention processing is complete does the final event occur.

Then:

- trigger detection can evaluate that event
- SBA processing can later evaluate resulting game state
- the rest of the game engine continues from the final event, not the replaced event

---

# 4. RULE [616.1](00_Source_CR_2026-02-27_LINKED.md#616-1) — TRUE SELECTION ORDER

## [4.1](00_Source_CR_2026-02-27_LINKED.md#4-1) Baseline chooser rule

If two or more replacement and/or prevention effects are attempting to modify the way an event affects an object or player, the affected object’s controller (or its owner if it has no controller) or the affected player chooses one to apply, subject to the ordered exceptions in [616.1a](00_Source_CR_2026-02-27_LINKED.md#616-1a)–e. If multiple players must make these choices simultaneously, APNAP order governs. fileciteturn11file0

This is the real baseline. Player/controller choice exists, but only inside the ordered framework below.

---

## [4.2](00_Source_CR_2026-02-27_LINKED.md#4-2) [616.1a](00_Source_CR_2026-02-27_LINKED.md#616-1a) — Self-replacement first

If any applicable effects are self-replacement effects, one of them must be chosen. If not, proceed to [616.1b](00_Source_CR_2026-02-27_LINKED.md#616-1b). fileciteturn11file0

### Consequence
Self-replacement is not “always globally first” in an abstract sense. It is first **within the [616.1](00_Source_CR_2026-02-27_LINKED.md#616-1) ordered choice procedure when applicable to the current event**.

---

## [4.3](00_Source_CR_2026-02-27_LINKED.md#4-3) [616.1b](00_Source_CR_2026-02-27_LINKED.md#616-1b) — Control-of-entry modification next

If any applicable effects would modify under whose control an object would enter the battlefield, one of them must be chosen. If not, proceed to [616.1c](00_Source_CR_2026-02-27_LINKED.md#616-1c). fileciteturn11file0

### Consequence
These effects have ordering priority over later categories, even before the general free-choice stage.

---

## [4.4](00_Source_CR_2026-02-27_LINKED.md#4-4) [616.1c](00_Source_CR_2026-02-27_LINKED.md#616-1c) — Copy-as-entering modification next

If any applicable effects would cause an object to become a copy of another object as it enters the battlefield, one of them must be chosen. If not, proceed to [616.1d](00_Source_CR_2026-02-27_LINKED.md#616-1d). fileciteturn11file0

### Consequence
Copy-entry replacement handling is a privileged ordering category.

---

## [4.5](00_Source_CR_2026-02-27_LINKED.md#4-5) [616.1d](00_Source_CR_2026-02-27_LINKED.md#616-1d) — Back-face-up entry modification next

If any applicable effects would cause a card to enter the battlefield with its back face up, one of them must be chosen. If not, proceed to [616.1e](00_Source_CR_2026-02-27_LINKED.md#616-1e). fileciteturn11file0

---

## [4.6](00_Source_CR_2026-02-27_LINKED.md#4-6) [616.1e](00_Source_CR_2026-02-27_LINKED.md#616-1e) — Free-choice stage

If none of the above special categories are forcing a choice, any of the remaining applicable replacement/prevention effects may be chosen. fileciteturn11file0

---

## [4.7](00_Source_CR_2026-02-27_LINKED.md#4-7) [616.1f](00_Source_CR_2026-02-27_LINKED.md#616-1f) — Repeat after application

Once the chosen effect has been applied, the full process repeats, taking into account only the effects that are now applicable. fileciteturn11file0

### Consequence
This is why the engine must be iterative and why “ordering” is not decided once up front for the whole event.

---

## [4.8](00_Source_CR_2026-02-27_LINKED.md#4-8) [616.1g](00_Source_CR_2026-02-27_LINKED.md#616-1g) — Contained-event rule

While following [616.1a](00_Source_CR_2026-02-27_LINKED.md#616-1a)–f, one effect may apply to an event, and another may apply to an event contained within the first event. In that case, the second effect cannot be chosen until after the first effect has been chosen. fileciteturn11file0

### Consequence
This is the real nested-event rule. It is stricter than a vague “apply outer first, inner later” summary because it specifically limits selection timing.

---

# 5. DEPENDENCY SYSTEM — PRECISION MODEL

## [5.1](00_Source_CR_2026-02-27_LINKED.md#5-1) What dependency means here

Dependency is not the general [616.1](00_Source_CR_2026-02-27_LINKED.md#616-1) choice ladder. It is the relationship where one effect’s application changes whether or how another effect applies to the event.

This is an **event-state-sensitive** concept. Dependency is evaluated on the current event, not abstractly in the air.

---

## [5.2](00_Source_CR_2026-02-27_LINKED.md#5-2) Correct dependency consequences

If one effect changes the event in a way that changes another effect’s applicability or operation, then the engine cannot treat those effects as freely orderable.

The dependent relationship constrains valid ordering because the first application changes the event definition used for all later applications.

---

## [5.3](00_Source_CR_2026-02-27_LINKED.md#5-3) Dependency is recalculated after each application

Because the event changes after every replacement/prevention application, the engine must recalculate dependency on the current event each time through the loop.

This means:

- dependency can appear mid-loop
- dependency can disappear mid-loop
- an effect can become newly applicable only after another effect is applied
- an effect can become inapplicable because another effect changed the event away from its scope

This is already reflected in the rule text of [616.1f](00_Source_CR_2026-02-27_LINKED.md#616-1f) and [616.2](00_Source_CR_2026-02-27_LINKED.md#616-2). fileciteturn11file0

---

## [5.4](00_Source_CR_2026-02-27_LINKED.md#5-4) Cycles and mutual dependence

If two effects are mutually entangled such that neither can be cleanly treated as prior by dependency logic, the engine does not gain a magical extra rule that resolves all such cases automatically. At that point, the chooser framework for currently applicable effects controls selection where the rules permit choice.

### Consequence
The engine must not invent a fake universal topological resolution rule that overrides the actual 616 chooser structure.

---

## [5.5](00_Source_CR_2026-02-27_LINKED.md#5-5) [616.2](00_Source_CR_2026-02-27_LINKED.md#616-2) — New applicability created by prior replacement

Rule[[616.2](00_Source_CR_2026-02-27_LINKED.md#616-2)](00_Source_CR_2026-02-27_LINKED.md#616-2) explicitly states that one replacement/prevention effect can become applicable to an event as the result of another replacement/prevention effect modifying that event. fileciteturn11file0

### Consequence
A correct engine cannot compute one fixed set of applicable effects at the start and then simply run through them. It must repeatedly rescan the current event.

---

# 6. SELF-REPLACEMENT — JUDGE-PERFECT HANDLING

## [6.1](00_Source_CR_2026-02-27_LINKED.md#6-1) Definition

Some replacement effects are not continuous effects. They are part of a resolving spell or ability that replace part or all of that spell or ability’s own effect. These are self-replacement effects. fileciteturn11file0

---

## [6.2](00_Source_CR_2026-02-27_LINKED.md#6-2) Priority rule

When Rule[[616.1](00_Source_CR_2026-02-27_LINKED.md#616-1)](00_Source_CR_2026-02-27_LINKED.md#616-1) is selecting among applicable effects, if any self-replacement effects are present, one of them must be chosen first. fileciteturn11file0

---

## [6.3](00_Source_CR_2026-02-27_LINKED.md#6-3) What this does not mean

It does **not** mean:

- every self-replacement effect globally outranks every other effect in every abstract context
- dependency ceases to matter forever
- self-replacement remains a permanent priority label after the event has changed

It means that at the current selection pass, within [616.1](00_Source_CR_2026-02-27_LINKED.md#616-1), self-replacement gets first-choice priority if applicable.

---

## [6.4](00_Source_CR_2026-02-27_LINKED.md#6-4) Interaction with later rescans

After the self-replacement is applied, the event is rescanned. Now:

- the self-replacement has already applied and cannot apply again to that event
- new effects may become applicable
- previously applicable effects may disappear
- the next selection pass uses the current event and the same 616 structure

---

# 7. “CAN’T” EFFECTS — NO-GAP MODEL

## [7.1](00_Source_CR_2026-02-27_LINKED.md#7-1) Classification

Rule[[614.17](00_Source_CR_2026-02-27_LINKED.md#614-17)](00_Source_CR_2026-02-27_LINKED.md#614-17) says these effects are **not** replacement effects, but they follow similar rules. fileciteturn11file0

---

## [7.2](00_Source_CR_2026-02-27_LINKED.md#7-2) Timing rule

They must exist before the event occurs. They cannot go back in time. fileciteturn11file0

---

## [7.3](00_Source_CR_2026-02-27_LINKED.md#7-3) Cost restriction

If an event cannot happen, a player cannot choose to pay a cost that includes that event. fileciteturn11file0

---

## [7.4](00_Source_CR_2026-02-27_LINKED.md#7-4) Replacement interaction boundary

If an event cannot happen, it can only be replaced by a self-replacement effect; other replacement/prevention effects cannot modify or replace it. fileciteturn11file0

### Consequence
This is much more precise than saying “can’t effects override most replacement effects.” The actual rule is narrower and stricter.

---

## [7.5](00_Source_CR_2026-02-27_LINKED.md#7-5) Entry modification version of “can’t”

Some “can’t” effects modify how a permanent enters or whether it can enter. Those are evaluated similarly to the entry-modification rule family by looking at how the permanent would exist on the battlefield, including already-applied entry modifications and applicable continuous effects. fileciteturn11file0

---

# 8. MULTI-OBJECT / MULTI-PLAYER EVENTS

## [8.1](00_Source_CR_2026-02-27_LINKED.md#8-1) Affected player vs affected object chooser precision

The chooser is not a single vague “affected player/controller.” The rules distinguish:

- if the event affects a player, that player chooses
- if the event affects an object, that object’s controller chooses, or its owner if it has no controller
- if multiple players must choose at the same time, APNAP applies fileciteturn11file0

---

## [8.2](00_Source_CR_2026-02-27_LINKED.md#8-2) Different objects inside one event

One event can affect multiple objects. Replacement/prevention processing may not collapse into one monolithic global choice if the event affects multiple objects or players in different ways.

The engine must evaluate applicability against the current event as defined, including which object or player is affected by which part of it.

---

## [8.3](00_Source_CR_2026-02-27_LINKED.md#8-3) Different parts of one event

Some effects may apply only to:

- one portion of damage
- one object among several
- one entering permanent
- one created token
- one placed counter set
- one subevent within a compound event

### Consequence
A correct engine must preserve partial-event structure and cannot simplify everything into “replace the whole event or not.”

---

# 9. SPECIAL RULE FAMILIES

## [9.1](00_Source_CR_2026-02-27_LINKED.md#9-1) Damage replacement and prevention

Some replacement effects apply to damage from a source. Some prevention effects prevent damage from a source. Damage processing is still pre-event processing. A prevented damage event does not happen, but additional effects tied to prevention may occur immediately afterward if the prevention effect says so. fileciteturn11file0

### Important zero-damage rule
If a source would deal 0 damage, it does not deal damage at all. Therefore, effects that would increase or redirect that damage have no event to replace. fileciteturn11file0

---

## [9.2](00_Source_CR_2026-02-27_LINKED.md#9-2) Regeneration

Regeneration is a destruction-replacement effect. The card may not say “instead,” but the rule definition supplies it. The destruction event is replaced by the regeneration event. Damage-dealt triggers still trigger if damage had been dealt before the destruction replacement matters. fileciteturn11file0

---

## [9.3](00_Source_CR_2026-02-27_LINKED.md#9-3) Redirection

Redirection effects replace damage to one battle, creature, planeswalker, or player with damage to another. If the relevant permanent or player is no longer a legal object for the redirected damage at replacement time, the redirection does nothing. fileciteturn11file0

---

## [9.4](00_Source_CR_2026-02-27_LINKED.md#9-4) Skip effects

Skipping an event, step, phase, or turn is replacement. Once a step/phase/turn has started, it cannot be skipped anymore; the effect waits for the next occurrence. Things scheduled for the skipped occurrence do not happen. fileciteturn11file0

---

## [9.5](00_Source_CR_2026-02-27_LINKED.md#9-5) Draw replacement

Draw replacement applies even when the library is empty. If part of a draw sequence is replaced, the replacement instructions are completed before resuming the sequence. If an effect would both draw and do something additional to that card, and the draw is replaced, the additional action is not performed on cards drawn by the replacement effect. fileciteturn11file0

---

## [9.6](00_Source_CR_2026-02-27_LINKED.md#9-6) Enters-the-battlefield modification

Replacement effects that modify how a permanent enters require special evaluation using the permanent as it would exist on the battlefield, considering:

- prior entry modifications already applied
- continuous effects from its own static abilities that would apply once on the battlefield
- continuous effects already existing that would apply to it fileciteturn11file0

### Choices
If such an effect requires a choice, that choice is made before the permanent enters. If multiple simultaneous entry modifications requiring choices would affect multiple permanents, the player cannot make choices that would make the combined costs unpayable. fileciteturn11file0

---

## [9.7](00_Source_CR_2026-02-27_LINKED.md#9-7) ETB-linked zone changes

When an effect modifying entry also changes other objects’ zones, you cannot choose the object that is becoming that permanent or another object entering simultaneously with it, and the same object cannot be chosen more than once for zone change while applying entry-modification replacement effects. fileciteturn11file0

---

## [9.8](00_Source_CR_2026-02-27_LINKED.md#9-8) Exile-link replacement objects

Some objects have one ability generating a replacement effect that exiles cards and another ability referring to “the exiled cards” or cards “exiled with [this object].” Those abilities are linked; the second refers only to cards exiled as the direct result of the replacement event caused by the first. fileciteturn11file0

---

## [9.9](00_Source_CR_2026-02-27_LINKED.md#9-9) Token and counter replacement

Some replacement effects apply if an effect would create one or more tokens or put one or more counters on a permanent. These apply to the effect of a resolving spell/ability, and they also apply if another replacement/prevention effect does so, even if the original event modified was not itself an effect. fileciteturn11file0

---

# 10. PARTIAL REPLACEMENT AND EVENT REDEFINITION

## [10.1](00_Source_CR_2026-02-27_LINKED.md#10-1) Partial replacement is real

A replacement/prevention effect may change only part of an event. The unaffected portion may still occur.

This matters for:

- compound events
- damage involving multiple recipients
- multiple-object events
- sequences of draws
- entry events that also move other objects

---

## [10.2](00_Source_CR_2026-02-27_LINKED.md#10-2) The original event is gone once replaced

After replacement is applied, the engine is no longer processing the original event as though it still exists unchanged. It is processing the modified event.

This is why:

- trigger detection keys off the final event
- applicability must be rescanned after each replacement
- dependency and chooser analysis are event-state-sensitive

---

## [10.3](00_Source_CR_2026-02-27_LINKED.md#10-3) Impossible instructions inside modified events

If the modified event contains instructions that cannot be carried out, those impossible instructions are ignored. This does not retroactively restore the original event. fileciteturn11file0

---

# 11. FAILURE STATE MATRIX

## No applicable replacement/prevention effect
### Cause
The event has no effects applying to it in its current form.
### Outcome
The event occurs unchanged.

---

## Effect applicable in the abstract but not to the current modified event
### Cause
Prior replacement changed the event so the effect no longer applies.
### Outcome
That effect is not in the current candidate set.

---

## Effect becomes newly applicable mid-loop
### Cause
A prior replacement changed the event to one this effect now applies to.
### Outcome
The effect can now be considered on the next pass. fileciteturn11file0

---

## Same effect trying to apply twice
### Cause
The loop returns to a modified event that the same effect would otherwise still seem to apply to.
### Outcome
It cannot apply again to that event or its modified versions. fileciteturn11file0

---

## Replaced event never happens
### Cause
A replacement effect replaces it.
### Outcome
The original event does not occur; only the modified event occurs. fileciteturn11file0

---

## Event never happens at all
### Cause
Skip/prevention/complete event elimination/no remaining executable event.
### Outcome
There is no final event of that original kind to detect triggers from.

---

## Prevented damage with additional rider
### Cause
A prevention effect prevents damage and has an added effect.
### Outcome
Prevention happens at damage time; the additional effect happens immediately afterward. fileciteturn11file0

---

## “Can’t” prohibits event
### Cause
A relevant [614.17](00_Source_CR_2026-02-27_LINKED.md#614-17) effect makes the event impossible.
### Outcome
The event cannot happen; only self-replacement can replace it. Other replacement/prevention effects cannot modify it. fileciteturn11file0

---

# 12. MASTER ENGINE FORMULA

## [12.1](00_Source_CR_2026-02-27_LINKED.md#12-1) Full ordered sequence

1. Define the event that would occur.
2. Determine the current affected player(s) and/or affected object(s).
3. Identify all applicable replacement/prevention effects and any relevant “can’t” constraints.
4. If a “can’t” effect prohibits the event, enforce [614.17](00_Source_CR_2026-02-27_LINKED.md#614-17) before ordinary replacement/prevention modification.
5. If no replacement/prevention effect remains applicable, the current event is final.
6. If one or more effects are applicable, apply Rule[[616.1](00_Source_CR_2026-02-27_LINKED.md#616-1)](00_Source_CR_2026-02-27_LINKED.md#616-1):
   - self-replacement first if present
   - then control-of-entry modifier if present
   - then copy-as-entering modifier if present
   - then back-face-up entry modifier if present
   - otherwise chooser may select among the applicable effects
7. Apply the chosen effect to the current event.
8. Mark that effect as already applied to this event so it cannot apply again.
9. Re-define the event in its modified form.
10. Re-scan for newly applicable or newly inapplicable effects.
11. Repeat until no applicable effects remain.
12. The final event occurs.
13. Trigger detection sees the final event.
14. Later, SBA processing sees the resulting game state.

---

## [12.2](00_Source_CR_2026-02-27_LINKED.md#12-2) Short formula

```text
WOULD-EVENT
→ identify applicable replacement/prevention effects + “can’t” constraints
→ apply [616.1](00_Source_CR_2026-02-27_LINKED.md#616-1) ordered selection
→ modify event
→ rescan current event
→ repeat until none apply
→ final event occurs
→ triggers see final event
→ SBA later sees final state
```

---

# 13. FINAL STATEMENT

This module is the judge-perfect integrated engine for Rules 614, 615, and 616.

It preserves:

- true pre-event processing
- exact [616.1](00_Source_CR_2026-02-27_LINKED.md#616-1) ordered choice structure
- self-replacement handling without overstatement
- dynamic rescanning under [616.2](00_Source_CR_2026-02-27_LINKED.md#616-2)
- partial-event and multi-object precision
- [614.17](00_Source_CR_2026-02-27_LINKED.md#614-17) “can’t” constraints without misclassifying them
- final-event supremacy for downstream trigger/SBA processing

This is the correct no-gap engine specification for replacement and prevention processing.
