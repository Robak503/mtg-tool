# Magic: The Gathering — Triggered Abilities
## LAYER 4: TRIGGER LAYER — Expansion (Rule 603.8–603.12)
## Rules 603.8–603.12: Special Trigger Categories
## Effective February 27, 2026

---

SOURCES: L04_Trigger_603_seg3_v.md

# PURPOSE

This module is the precision expansion layer for rules 603.8–603.12. It defines the exact operational behavior of:

- State triggers (603.8)
- Lose-the-game triggers (603.9)
- Look-back-in-time exceptions (603.10, 603.10a–g)
- Linked static + triggered ability pairs (603.11)
- Reflexive triggered abilities (603.12, 603.12a)

All five categories follow the standard trigger waiting state and insertion model unless a specific rule in this section states otherwise. Where a rule in this section modifies standard behavior, that modification is precisely identified.

---

# 1. RULE 603.8 — STATE TRIGGERS

## 1.1 Definition

State triggers are triggered abilities whose trigger condition is a **game state being true**, rather than a discrete event occurring. The trigger fires as soon as the game state matches the condition.

State triggers are explicitly distinguished from state-based actions. They are triggered abilities that follow the normal trigger lifecycle (trigger, waiting state, insertion, resolution) — they are not the automatic game actions of rule 704.

## 1.2 The Three Defining Behaviors of State Triggers

### Behavior A — Immediate triggering on condition becoming true

A state trigger fires the moment the relevant game state becomes true. "The moment it becomes true" means the first time that condition is satisfied, whether during resolution of a spell or ability, during SBA processing, or at any other game point.

This contrasts with event triggers, which fire when a discrete event occurs. A state trigger does not require an event — it requires only that the condition is currently true when the game checks.

### Behavior B — No retriggering until the ability leaves the stack

Once a state trigger is on the stack, it will not trigger again, even if the condition remains continuously true. The ability must leave the stack — by resolving, being countered, or any other method — before it can trigger again.

This rule prevents infinite loop problems. If a state trigger's condition is true while the trigger is resolving, the trigger still does not retrigger during that resolution. It can only retrigger after leaving the stack.

### Behavior C — Retrigger condition: condition still true after leaving the stack

Once the state trigger leaves the stack, the game checks whether:
(1) the object with the ability is still in the same zone, and
(2) the game state still matches the trigger condition.

If both are true, the ability triggers again immediately.

## 1.3 The Mid-Resolution Triggering Rule

The CR example for 603.8 illustrates a critical edge case. If a spell causes the game state to momentarily satisfy a state trigger's condition during the spell's resolution — even if the state returns to false before resolution ends — the state trigger fires during that moment.

Example from CR: An ability reads "Whenever you have no cards in hand, draw a card." A spell says "Discard your hand, then draw that many cards." After the discard instruction executes, the player has no cards. The state trigger fires at that moment, even though the draw instruction will immediately give the player cards. The state trigger fires during the resolution because the condition was true at that point.

## 1.4 State Trigger vs. Standard Event Trigger: What Changes

| Aspect | Event Trigger | State Trigger |
|---|---|---|
| Trigger condition | A specific event occurs | A game state is true |
| Can trigger during resolution | Yes, if event occurs | Yes, if condition becomes true |
| Can retrigger while on stack | Not applicable | **No** — must leave stack first |
| Can retrigger after leaving stack | Not applicable | Yes, if condition still true |
| Governed by 603.2 event matching | Yes | No — 603.8 controls instead |

## 1.5 Interaction with Standard Trigger Rules

State triggers still use the standard waiting state and insertion process per 603.3. They are put on the stack at the next priority checkpoint. They can be countered. They can have targets. They can fail intervening-if checks at resolution. None of these standard behaviors are modified by 603.8 — only the firing and retriggering model is different.

## 1.6 Untap Step and Cleanup Step Behavior for State Triggers

**Untap step:** No player receives priority during the untap step (rule 117.3a). If a state trigger's condition becomes true during the untap step, the trigger fires and enters the waiting state. It is not inserted until the next priority checkpoint — normally upkeep. The no-retrigger-while-on-stack rule still applies once the trigger reaches the stack; it is simply deferred in getting there.

**Cleanup step:** Players normally do not receive priority during cleanup. If a state trigger fires during the cleanup step and is waiting when cleanup would end, the cleanup exception (rules 514.3 / 117.3a) applies: the 117.5 loop runs, the trigger is placed on the stack, priority opens, and once the stack empties and all players pass, a new cleanup step begins. A state trigger whose condition remains true after its resolution during the cleanup exception will immediately retrigger, potentially extending the cleanup sequence.

## 1.7 Intervening-If Clauses and State Triggers

State triggers can have intervening-if clauses. A state trigger written as "Whenever [game state is true], if [additional condition], [effect]" is subject to the full 603.4 / 608.2a two-check process:

- **At trigger time:** The game state condition is true (firing the trigger). The if-clause condition is also checked. If false, the ability does not trigger.
- **At resolution:** The if-clause condition is checked again (rule 608.2a). If false, the ability is removed from the stack and does nothing.

The state trigger's no-retrigger-while-on-stack model (603.8) and the intervening-if removal-at-resolution (608.2a) are independent. Being removed at resolution by a failed if-clause does not itself retrigger the state trigger — the state condition is what determines retriggering, not what caused the ability to leave the stack.

## 1.8 LKI and Reflexive Triggers

Reflexive triggered abilities (603.12) check whether an event occurred earlier during the same resolution that created them. If that event involved a zone change — for example, "when you sacrifice a creature this way" — the creature has already moved zones before the reflexive trigger checks. At the point of that check, the creature is in the graveyard and is now a new object (rule 400.7). The reflexive trigger found that the event occurred (the sacrifice happened), so it fires. When the reflexive trigger later resolves, if it refers to "that creature," it uses LKI — the characteristics of the creature as it last existed in the zone it was expected to be in (the battlefield) before the sacrifice.

---

# 2. RULE 603.9 — LOSE-THE-GAME TRIGGERS

## 2.1 Definition

Some triggered abilities fire specifically when a player loses the game. Rule 603.9 establishes that these fire when a player loses or leaves the game, with one exception.

## 2.2 The Exception: Draws

If a player leaves the game as the result of a draw — not a loss — then a "when a player loses the game" trigger does not fire. The rule specifically says "loses or leaves the game, regardless of the reason, **unless** that player leaves the game as the result of a draw."

## 2.3 Relationship to 603.10f

603.10f is a companion rule: abilities that trigger when a player loses the game are in the look-back-in-time exception list. These triggers detect using the game state immediately before the player lost. This matters for knowing what that player controlled at the time.

## 2.4 Interaction with Commander Zone and Multiplayer

In a Commander game where a player is eliminated, a "when a player loses the game" trigger fires. The trigger's controller uses 603.3a (and 603.7d–g for delayed versions) to identify the appropriate controller of that triggered ability.

---

# 3. RULE 603.10 — LOOK-BACK-IN-TIME EXCEPTIONS

## 3.1 The General Rule (What Is Being Excepted From)

Normally, trigger detection uses the game state that exists **immediately after** an event. Objects that no longer exist after the event are not checked for trigger conditions. Continuous effects that exist after the event determine what the trigger conditions and objects look like.

## 3.2 The Exception

For certain trigger categories listed in 603.10a–g, the game looks back in time to the state **immediately before** the event. The existence of those triggered abilities and the appearance of objects at that pre-event moment are used for detection purposes.

## 3.3 Why Look-Back Matters

The most important practical consequence is simultaneous death. If an artifact with a triggered ability "whenever a creature dies" is destroyed by the same spell that kills creatures, the artifact's ability still triggers — because the look-back rule examines the state before the spell resolved, at which point the artifact existed.

Without look-back, the artifact would not exist after the event, so it could not trigger. Look-back reverses this by anchoring detection to the pre-event state.

## 3.4 603.10a — Zone-Change Triggers That Look Back

Three categories of zone-change triggers use look-back:

**Leaves-the-battlefield abilities:** Triggered abilities whose trigger condition is a permanent leaving the battlefield. These fire based on the pre-event state, meaning an object that leaves the battlefield at the same time as another object can still trigger from that other object's departure.

**Abilities that trigger when a card leaves a graveyard:** These detect based on pre-event state.

**Abilities that trigger when an object all players can see is put into a hand or library:** Also look-back.

## 3.5 603.10b — Phasing-Out Triggers

Abilities that trigger when a permanent phases out use look-back to detect that event using pre-phase-out state.

## 3.6 603.10c — Unattachment Triggers

Abilities that trigger specifically when an object becomes unattached from something look back in time. Note the qualifier "specifically when an object becomes unattached" — general abilities watching for other events do not gain look-back from this rule.

## 3.7 603.10d — Control-Loss / Opponent-Gaining-Control Triggers

Abilities that trigger when a player loses control of an object, or when an opponent gains control of an object from a player, look back in time. This allows the object's prior controller's triggers to detect correctly.

## 3.8 603.10e — Counterspell Triggers

Abilities that trigger when a spell is countered use look-back. This includes triggered abilities on the spell that was countered — those abilities can detect that the countering event occurred using pre-counter state.

## 3.9 603.10f — Player-Loss Triggers

Abilities that trigger when a player loses the game use look-back. This is the companion to 603.9. At the moment of loss, the pre-loss state shows what the player controlled, which is relevant for triggers checking characteristics of the losing player.

## 3.10 603.10g — Planeswalker-Away-From-Plane Triggers

Abilities that trigger when a player planeswalks away from a plane use look-back. Planechase-specific.

## 3.11 Critical Precision: What Look-Back Does NOT Do

Look-back is not a general permission for all triggered abilities to see pre-event state. It applies only to the specific categories listed in 603.10a–g. For all other triggers, detection uses the post-event state.

Look-back also does not allow an ability to trigger from a pre-event state if that ability's trigger condition was not satisfied even in the pre-event state. Look-back changes which moment in time is used for detection; it does not change what the trigger condition actually requires.

---

# 4. RULE 603.11 — LINKED STATIC AND TRIGGERED ABILITY PAIRS

## 4.1 Definition

Some objects combine a static ability and one or more triggered abilities into a single paragraph. When this format is used, the static ability and the triggered ability (or abilities) are linked under rule 607.

## 4.2 What This Means for the Triggered Ability

The triggered ability is linked to the static ability. The triggered ability refers only to actions taken, objects affected, or conditions produced as a result of that specific linked static ability. It does not respond to similar actions or conditions produced by other means.

## 4.3 Format Recognition

The format is: static ability first, then triggered ability. Example from CR: "Reveal the first card you draw each turn. Whenever you reveal a basic land card this way, draw a card." The phrase "this way" indicates the linked relationship.

## 4.4 The "Trigger Condition in the Middle" Format

603.11 also acknowledges that a very few objects have triggered abilities written with the trigger condition in the middle of the ability text, rather than at the beginning. This is a deviation from standard triggered ability format. Such abilities are still triggered abilities; the format does not change their nature.

## 4.5 Interaction with Copying

If a permanent is copied and the copy gains the linked static ability and its linked triggered ability, the linked relationship is preserved on the copy for those specific abilities.

---

# 5. RULE 603.12 — REFLEXIVE TRIGGERED ABILITIES

## 5.1 Definition

A reflexive triggered ability is created during the resolution of a spell or ability. It triggers based on whether a specified action was (or was not) taken earlier during that same resolution.

The characteristic language is: "When you do" or "when [something happens] this way."

## 5.2 How Reflexive Triggers Work

Reflexive triggered abilities follow the rules for delayed triggered abilities (603.7), with one critical difference: they are checked **immediately after being created**, using events that occurred earlier during the current resolution.

This means:
- A reflexive triggered ability is created during resolution.
- Immediately after creation, the game checks whether the triggering condition was satisfied by earlier actions in the same resolution.
- If yes, the ability triggers and enters the waiting state.
- If no, the ability does not trigger.

The reflexive trigger does not wait for a future event to occur. It looks backward at the resolution that created it.

## 5.3 Reflexive vs. Delayed Triggers

The critical distinction from standard delayed triggers (603.7b):

- A **delayed trigger** waits for its trigger event to occur in the future, then fires.
- A **reflexive trigger** is created during resolution and immediately checks whether the event already occurred during that same resolution.

Both are created during resolution. Both follow 603.7 rules for source and controller. But the reflexive trigger's check is immediate and backward-looking, not future-looking.

## 5.4 Independence from the Original Trigger

A reflexive triggered ability is independent of the original triggered ability or spell ability that created it. Once created, it is a separate triggered ability on its own. It can be countered, targeted, responded to, and fails to resolve independently of the first ability.

Example: Heart-Piercer Manticore's second ability ("When you do, this creature deals damage equal to that creature's power to any target") is reflexive. If an opponent counters this second trigger, no damage is dealt — even though the sacrifice already occurred. The sacrifice cannot be undone; only the damage trigger is countered.

## 5.5 Rule 603.12a — Multiple Occurrences vs. "One or More Times" Compression

### Standard case (multiple occurrences)
If the triggering action occurred multiple times during the resolution that created the reflexive trigger, the reflexive trigger fires once for each occurrence.

### Exception (cost paid "any number of times" + "one or more times" phrasing)
If the resolving spell or ability offers a choice to pay a cost "any number of times" AND the reflexive trigger uses the phrasing "when [a player] pays [that cost] **one or more times**," then paying the cost one or more times causes the reflexive trigger to fire **only once**, regardless of how many times the cost was actually paid.

**Why this matters:** Without the compression rule, paying a cost three times would normally produce three reflexive triggers. The "one or more times" phrasing collapses these into one trigger, regardless of quantity. But that one trigger may still have effects that scale with the number of payments, if its text refers to the count.

## 5.6 Reflexive Triggers in the Waiting State

Once a reflexive trigger fires, it enters the standard waiting state and is inserted via the normal 603.3b process at the next priority checkpoint. It is not immediately placed on the stack at the moment of creation. The same SBA/trigger checkpoint loop governs its insertion.

---

# FINAL STATEMENT

This module is the complete expansion layer for rules 603.8–603.12.

It precisely defines:
- The three unique behaviors of state triggers
- The lose-the-game trigger scope and exception
- Each of the seven look-back categories and what they do (and do not) permit
- The linked static/triggered pair structure and its interaction with rule 607
- The creation, firing, independence, and 603.12a compression rule for reflexive triggered abilities

All five categories still use the standard trigger waiting state and 603.3b insertion process. The rules in this module modify **detection and firing logic** only; they do not bypass the standard checkpoint loop.

---

FEEDS INTO: L04_Trigger_engine.md (§5 trigger class table — state, look-back, reflexive, linked, lose-the-game classes), L00_Orchestration_game_engine.md (trigger detection §3.4)
