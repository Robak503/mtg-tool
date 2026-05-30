# Magic: The Gathering — Triggered Abilities
## LAYER 4: TRIGGER LAYER — Expansion (Rule 603.1–603.3)
## 603.1–603.3 (VERBATIM + EXPANSION LAYERS)
## Effective February 27, 2026

---

SOURCES: L04_Trigger_603_seg1_v.md

# PURPOSE

This document contains two strictly separated layers:

LAYER 1 — Verbatim-aligned rule text (structure and wording fidelity to the February 27, 2026 CR)
LAYER 2 — Engine expansion (explanatory precision layer)

---

# LAYER 1 — RULE TEXT (VERBATIM-ALIGNED)

## 603.1

Triggered abilities have a trigger condition and an effect. They are written as "[When/Whenever/At] [trigger condition or event], [effect]. [Instructions (if any).]"

### 603.1a

A triggered ability may include instructions after its effects that limit what the ability may target or state that it can't be countered. This text is not part of the ability's effect. It functions while the ability is on the stack.

### 603.1b

A triggered ability may have more than one trigger condition, and an instruction that refers to whether "all" of those conditions have happened during a particular period. This refers to whether or not all of those conditions have occurred during that period, regardless of whether that ability has triggered based on those conditions.

---

## 603.2

Whenever a game event or game state matches a triggered ability's trigger event, that ability automatically triggers. The ability doesn't do anything at this point.

### 603.2a

Because they aren't cast or activated, triggered abilities can trigger even when it isn't legal to cast spells and activate abilities. Effects that preclude abilities from being activated don't affect them.

### 603.2b

When a phase or step begins, all abilities that trigger "at the beginning of" that phase or step trigger.

### 603.2c

An ability triggers only once each time its trigger event occurs. However, it can trigger repeatedly if one event contains multiple occurrences.

> Example: A permanent has an ability whose trigger condition reads, "Whenever a land is put into a graveyard from the battlefield, . . . ." If someone casts a spell that destroys all lands, the ability will trigger once for each land put into the graveyard during the spell's resolution.

### 603.2d

An ability may state that a triggered ability triggers additional times. In this case, rather than simply determining that such an ability has triggered, determine how many times it should trigger, then that ability triggers that many times. An effect that states that an ability triggers additional times doesn't invoke itself repeatedly and doesn't apply to other effects that affect how many times an ability triggers. An effect that states a triggered ability of an object triggers additional times refers only to triggered abilities that object has, not to any delayed or reflexive triggered abilities (see rule 603.7 and rule 603.12) that may be created by abilities the object has.

### 603.2e

Some trigger events use the word "becomes" (for example, "becomes attached" or "becomes blocked"). These trigger only at the time the named event happens—they don't trigger if that state already exists or retrigger if it persists. An ability that triggers when a permanent "becomes tapped" or "becomes untapped" doesn't trigger if the permanent enters the battlefield in that state.

> Example: An ability that triggers when a permanent "becomes tapped" triggers only when the status of a permanent that's already on the battlefield changes from untapped to tapped.

### 603.2f

If a triggered ability's trigger condition is met, but the object with that triggered ability is at no time visible to all players, the ability does not trigger.

### 603.2g

An ability triggers only if its trigger event actually occurs. An event that's prevented or replaced won't trigger anything.

> Example: An ability that triggers on damage being dealt won't trigger if all the damage is prevented.

### 603.2h

A triggered ability may have an instruction followed by "Do this only once each turn." This ability triggers only if its source's controller has not yet taken the indicated action that turn.

---

## 603.3

Once an ability has triggered, its controller puts it on the stack as an object that's not a card the next time a player would receive priority. See rule 117, "Timing and Priority." The ability becomes the topmost object on the stack. It has the text of the ability that created it, and no other characteristics. It remains on the stack until it's countered, it resolves, a rule causes it to be removed from the stack, or an effect moves it elsewhere.

### 603.3a

A triggered ability is controlled by the player who controlled its source at the time it triggered, unless it's a delayed triggered ability. To determine the controller of a delayed triggered ability, see rules 603.7d–f.

### 603.3b

If multiple abilities have triggered since the last time a player received priority, the abilities are placed on the stack in a two-part process. First, each player, in APNAP order, puts each triggered ability they control with a trigger condition that isn't another ability triggering on the stack in any order they choose. (See rule 101.4.) Second, each player, in APNAP order, puts all remaining triggered abilities they control on the stack in any order they choose. Then the game once again checks for and performs state-based actions until none are performed, then abilities that triggered during this process go on the stack. This process repeats until no new state-based actions are performed and no abilities trigger. Then the appropriate player gets priority.

### 603.3c

If a triggered ability is modal, its controller announces the mode choice when putting the ability on the stack. If one of the modes would be illegal (due to an inability to choose legal targets, for example), that mode can't be chosen. If no mode is chosen, the ability is removed from the stack. (See rule 700.2.)

### 603.3d

The remainder of the process for putting a triggered ability on the stack is identical to the process for casting a spell listed in rules 601.2c–d. If a choice is required when the triggered ability goes on the stack but no legal choices can be made for it, or if a rule or a continuous effect otherwise makes the ability illegal, the ability is simply removed from the stack.

---

# LAYER 2 — ENGINE EXPANSION

## Trigger Lifecycle

The trigger lifecycle has three distinct states that must not be conflated:

1. **Triggered** — The trigger condition is met. The ability fires. No stack object exists yet.
2. **Waiting** — The ability exists in the waiting state. It is not on the stack. Players cannot respond to it.
3. **On the stack** — The ability is a stack object. Players may respond to it.

These states are separate. An ability being in the waiting state does not mean it is on the stack, and does not give players any window to act.

---

## Priority Loop Integration (Rule 117.5)

The full checkpoint sequence before any player receives priority is:

1. Check state-based actions; perform all that apply simultaneously.
2. Repeat step 1 until no state-based actions are performed.
3. Put all waiting triggered abilities onto the stack per the 603.3b two-part process.
4. Check state-based actions again (step 1 and 2 repeat).
5. If stable (no SBAs performed, no triggers waiting), the appropriate player gets priority.

This loop is **iterative**, not linear. SBAs and trigger insertion alternate until the game state is fully stable.

**Untap step exception:** No player receives priority during the untap step (rule 117.3a). Triggered abilities that fire during the untap step enter the waiting state and are not placed on the stack until the next priority checkpoint — normally the upkeep.

**Cleanup step exception:** Players normally do not receive priority during the cleanup step. However, if any SBAs are performed or any triggered abilities are waiting after the cleanup step's turn-based actions (hand-size discard and damage removal), the full 117.5 loop runs, priority is opened, and once the stack empties and all players pass, a new cleanup step begins. This repeats until a cleanup ends with no SBAs and no waiting triggers.

This loop is **iterative**, not linear. SBAs and trigger insertion alternate until the game state is fully stable.

---

## The 603.3b Two-Part APNAP Stack Insertion Process

Rule 603.3b mandates a specific two-part ordering when multiple triggered abilities are waiting:

**Part 1:** Each player, in APNAP order (active player first, then each other player in turn order), puts all triggered abilities they control whose trigger condition is **not** "another ability triggering" onto the stack in any order they choose.

**Part 2:** Each player, in APNAP order, puts all remaining triggered abilities they control — those whose trigger condition **is** another ability triggering — onto the stack in any order they choose.

After both parts are complete, the game runs the SBA/trigger loop again before giving priority.

**Why this matters:** Triggers created by other triggers (such as additional triggers granted by Panharmonicon or cascade chains) are deferred to Part 2. Their controller cannot place them on the stack until all Part 1 abilities have been placed first. This prevents manipulation of stack ordering between the two categories.

**Example:** Yarok, the Desecrated doubles ETB triggers. A creature enters. Yarok's ability says "If a permanent entering would trigger an ability you control, it triggers an additional time." The ETB ability itself is a Part 1 trigger (condition: creature enters). The second copy created by Yarok is a Part 2 trigger (condition: another ability triggers). They are placed in different parts of the process. Both still go on the stack before priority is received.

---

## APNAP Controller Identification

603.3a: Each triggered ability is controlled by the player who controlled its source **when it triggered** — not when it is inserted. If a triggered ability's source changes control between the trigger event and stack insertion, the original controller at the time of triggering still controls the triggered ability.

For delayed triggered abilities, the controller is determined by the specific rules at 603.7d–f, not by 603.3a.

---

## 603.3c — Modal Triggered Abilities

Mode choices for triggered abilities are made **at insertion time** (when the ability is put on the stack), not at trigger time. If all modes are illegal (no legal targets for any mode), the ability is removed from the stack under 603.3d rather than 603.3c.

603.3c governs which modes may be chosen. 603.3d governs what happens if the ability cannot legally go on the stack at all.

---

## 603.3d — Removal From Stack at Insertion

If a triggered ability requires a choice at insertion and no legal choice exists, the ability is removed from the stack and does nothing. This is not countering. It is not a triggered-ability resolution failure. It is a rule-mandated removal at the insertion step.

This applies to:
- Targeted triggered abilities with no legal targets
- Modal triggered abilities with no legal mode
- Any triggered ability that a continuous effect makes illegal

---

## Trigger Detection: What Triggers and What Does Not

### 603.2a — No priority requirement
Triggered abilities can trigger during resolution, during SBA processing, during the untap step, and at any other game moment. Priority is not required for triggering.

### 603.2c — One trigger per event occurrence
A single event produces one trigger per triggering condition satisfied, unless 603.2c allows multiple occurrences within one event. A spell that destroys all lands produces one "whenever a land dies" trigger per land — the multiple occurrences within the single event each count separately.

### 603.2d — Additional times
An effect that says a trigger fires additional times is multiplicative from the base trigger count. If a trigger fires once normally and is doubled, it fires twice. The doubling does not apply to delayed or reflexive triggers created by that ability.

### 603.2e — "Becomes" is state-change only
An ability that triggers when something "becomes" a condition only fires when the change occurs, not when the object already exists in that state and persists there.

### 603.2f — Visibility requirement
An ability does not trigger if its source is at no time visible to all players when the trigger condition is met. This applies primarily to objects in hidden zones. Face-down permanents on the battlefield are visible as objects (though their identity is hidden), so their triggered abilities can still fire.

### 603.2g — Replaced events do not trigger
If the event is replaced or prevented, it does not trigger abilities that look for that event. Only the final actual event is tested against trigger conditions.

---

## State-Triggered Abilities

State-triggered abilities (governed by rule 603.8, not rules 603.1–603.3) trigger based on a game state being true rather than a discrete event occurring. They are not governed by the event-matching language of 603.2. Their specific behavior — including the false→true requirement and the no-retrigger-until-off-stack rule — is defined in 603.8. Do not apply 603.2 event-trigger logic to state triggers.

---

# FINAL STATEMENT

LAYER 1 contains verbatim-aligned text for all rules 603.1, 603.1a, 603.1b, 603.2, 603.2a–h, 603.3, and 603.3a–d as written in the February 27, 2026 Comprehensive Rules.

LAYER 2 expands those rules to engine precision, with particular attention to:
- The iterative SBA/trigger checkpoint loop
- The mandatory two-part 603.3b stack insertion process
- The distinction between triggering, waiting, and being on the stack
- The limits of 603.2d additional-times effects
- The inapplicability of 603.2 to state-triggered abilities

---

FEEDS INTO: L04_Trigger_engine.md (trigger insertion model, §4.6 two-part process), L00_Orchestration_game_engine.md (checkpoint loop §3.7–3.10)

## ZONE REQUIREMENT FOR ABILITIES THAT WORK IN SPECIFIC ZONES

Some abilities specifically state they work while the permanent is in a certain zone (e.g., "as long as this card is in your hand", "from the command zone"). These follow the standard trigger rule: the condition must be met both when the trigger event occurs AND when the ability resolves.

**Eminence (Commander):** Eminence abilities trigger while the commander is in the command zone or on the battlefield. The commander must be in one of those two zones at the moment the trigger event occurs AND still be in one of those two zones when the triggered ability resolves. If the commander moves to a different zone (e.g., dies, is exiled) between triggering and resolving, the ability does nothing.

Example: Edgar Markov's eminence triggers when you cast a Vampire spell. If Edgar dies to a board wipe while that trigger is on the stack, the trigger resolves but has no effect — because Edgar is no longer in the command zone or battlefield.

This is the official WotC ruling for all eminence cards (Edgar Markov, Inalla, Arahbo, Sidar Jabari).
