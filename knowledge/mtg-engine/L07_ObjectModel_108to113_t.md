# Magic: The Gathering — Object Model Expansion
## LAYER 7: OBJECT MODEL LAYER — Expansion (Rules 108–113)
## Effective February 27, 2026

---

SOURCES: L07_ObjectModel_108to113_v.md
FEEDS INTO: L04_Trigger_engine.md (source, controller of triggered abilities), L03_Event_614to616_t.md (object characteristics for replacement effects), L05_StateEnforcement_704_t.md (SBA characteristic checks), L06_PlayerAction_117_t.md (priority and controller identification), L00_Orchestration_game_engine.md (§5.10)

---

# 1. THE OBJECT TAXONOMY

## 1.1 What Is an Object?

Rule 109.1 defines exactly what an object is:

> An object is an ability on the stack, a card, a copy of a card, a token, a spell, a permanent, or an emblem.

This is a complete, closed list. If something is not one of these seven types, it is not an object for rules purposes.

| Object type | Where it exists | Has characteristics? | Has controller? |
|---|---|---|---|
| Card (not spell, not permanent) | Library, hand, graveyard, exile, command | Yes | No (use owner) |
| Spell | Stack | Yes | Yes |
| Permanent | Battlefield | Yes | Yes |
| Token | Battlefield (normally) | Yes | Yes |
| Copy of a card | Stack or battlefield (as spell or permanent) | Yes | Yes |
| Activated/triggered ability on stack | Stack | Yes (text only) | Yes |
| Emblem | Command zone | Yes (text only) | Yes (creator) |

## 1.2 The Characteristics (Rule 109.3)

An object's characteristics are a defined list — not everything about an object is a characteristic:

**Characteristics (rule 109.3):**
- Name
- Mana cost
- Color
- Color indicator
- Card type
- Subtype
- Supertype
- Rules text
- Abilities
- Power
- Toughness
- Loyalty
- Defense
- Hand modifier
- Life modifier

**Not characteristics:**
- Whether a permanent is tapped/untapped/flipped/phased (these are status — see 110.5)
- A spell's targets
- An object's owner or controller
- What an Aura enchants
- Counters on a permanent
- Damage marked on a permanent

This distinction matters because effects that refer to characteristics (e.g., "creatures you control get +1/+1") only apply based on the listed characteristics, not based on status or other game information.

## 1.3 Characteristics of Stack Objects (Rule 405.4)

Activated and triggered abilities on the stack have only the **text of the ability** and no other characteristics. They have no mana cost, no color, no card type, and no card name. They are not spells. They cannot be countered by effects that counter spells; they can only be countered by effects that specifically counter abilities (rule 113.9).

---

# 2. OWNERSHIP AND CONTROL

## 2.1 Owner (Rules 108.3, 110.2, 111.2, 112.2)

Ownership is determined at game start and generally does not change:

| Object type | Owner is... |
|---|---|
| Card (started in deck) | Player who started the game with it in their deck |
| Card (brought from outside) | Player who brought it into the game |
| Card (started in command zone) | Player who put it in the command zone |
| Token | Player who created it |
| Spell (noncopy) | Same as the card's owner |
| Spell (copy) | Player under whose control it was put on the stack |
| Permanent (nontoken) | Same as the card's owner |

**Legal ownership is irrelevant** to game rules (108.3). Whether a player legally owns the physical card does not affect game play.

## 2.2 Controller (Rules 108.4, 109.4, 110.2, 112.2)

Control is a dynamic game property. Only objects on the stack or on the battlefield have a controller. Objects elsewhere are not controlled by any player (109.4), with six exceptions:

| Exception | Rule | Controller |
|---|---|---|
| Mana ability | 109.4a | Determined as if on the stack |
| Triggered ability in waiting state | 109.4b | Player who controlled source at trigger time (or per 603.7d–f for delayed) |
| Emblem | 109.4c | Player who put it in command zone |
| Face-up plane/phenomenon | 109.4d | Planar controller (usually active player) |
| Vanguard card | 109.4e | Its owner |
| Scheme card | 109.4f | Its owner |

**Critical for triggers:** Rule 109.4b is the rule that governs who controls a triggered ability in the waiting state. It is not rule 603.3a (which governs control after the ability is placed on the stack — but 603.3a and 109.4b say the same thing: the player who controlled the source when it triggered).

**"You" and "your" (rule 109.5):** On an ability, "you" means the controller of that ability (which may differ based on whether it's a static, activated, or triggered ability and whether it's currently on the stack or waiting).

## 2.3 Default Controller of Permanents (Rule 110.2)

A permanent's controller is by default the player under whose control it entered the battlefield. This can be changed by control-changing effects, but the default anchors the starting point.

---

# 3. PERMANENTS

## 3.1 What a Permanent Is (Rule 110.1)

A permanent is a card or token on the battlefield. It becomes a permanent as it enters and stops being a permanent as it leaves. The six permanent types are: artifact, battle, creature, enchantment, land, planeswalker.

Instants and sorceries can never be permanents — if they would enter the battlefield, they remain in their previous zone (rule 400.4a).

## 3.2 Characteristics vs. Status (Rules 110.3, 110.5)

**Characteristics** (109.3) are defined by the card's printed text plus continuous effects (rule 613). Power, toughness, color, abilities — all are characteristics.

**Status** (110.5) is separate: tapped/untapped, flipped/unflipped, face up/face down, phased in/phased out. Status is not a characteristic. However, status can affect characteristics — a face-down permanent typically has no characteristics, or has the face-down characteristics defined by rules 708–712.

Status persists through changes that don't specifically address it (110.5c). A permanent that becomes a copy of something retains its current status, even if that status is irrelevant to the copy.

**Status only exists on the battlefield (110.5d):** Cards not on the battlefield have no status. An exiled card being physically face-down is not the same as a face-down permanent. Cards in graveyards are neither tapped nor untapped.

## 3.3 Losing All Permanent Types (Rule 110.4c)

If a permanent somehow loses all its permanent types (artifact, battle, creature, enchantment, land, planeswalker), it remains on the battlefield. It is still a permanent even without any permanent type. It just has no type-specific rules applying to it.

---

# 4. TOKENS

## 4.1 Token Identity

Tokens are permanents that are not represented by cards. They are objects under rule 109.1 but are not cards (111.6, 108.2b).

**Owner:** The player who created the token (111.2).
**Characteristics:** Defined entirely by the effect that created them (111.3). A token has no characteristics not defined by its creation effect.
**Name:** Set by the creation effect. If no name is specified, the name is the subtype(s) plus "Token" (111.4).

## 4.2 Token Zone Behavior (Rules 111.7–111.8)

Tokens cease to exist when they enter any zone other than the battlefield. This is a state-based action (rule 704). However, before the token ceases to exist, any triggered abilities that fire from the zone change (e.g., leave-the-battlefield triggers on the token) still trigger — they trigger before the token's ceasing-to-exist SBA is checked.

Once a token has left the battlefield, it cannot move to another zone. If something would cause it to change zones again, it stays where it is and ceases to exist at the next SBA check.

## 4.3 Predefined Tokens

Rules 111.10a–111.10v define the characteristics of named token types (Treasure, Food, Clue, etc.). When an effect says "create a Treasure token," it uses the predefined characteristics from 111.10a without needing to state them explicitly. The creating effect may modify or add to the predefined characteristics.

---

# 5. SPELLS

## 5.1 A Spell Is a Card on the Stack (Rule 112.1)

When a card is cast, it moves to the stack and becomes a spell. It remains a spell until it resolves, is countered, or otherwise leaves the stack. Copies of spells are also spells (112.1a).

## 5.2 Spell Characteristics (Rule 112.3)

A noncopy spell's characteristics are the same as those on its card, as modified by continuous effects. The card text is the starting point; L8 (continuous effects layer) governs what modifications apply.

## 5.3 Spell Control vs. Permanent Control (Rule 110.2b)

If a player gains control of another player's permanent *spell* (while it's still on the stack), the first player controls the permanent that spell becomes when it resolves. However, the default controller of that permanent is the player who originally put the spell on the stack. This distinction matters in multiplayer contexts (rule 800.4c).

---

# 6. ABILITIES

## 6.1 Three Kinds of Ability Objects (Rule 113.1)

1. A characteristic of an object (on the card or granted)
2. Something a player has
3. An activated or triggered ability on the stack (a stack object)

Type 3 is the most critical for the engine — activated and triggered abilities on the stack are objects (rule 109.1) with specific rules governing their source, controller, and characteristics.

## 6.2 Ability Source vs. Ability Controller (Rules 113.7–113.8)

**Source (113.7):** The object that generated the ability. For a triggered ability in the waiting state or on the stack, the source is the object whose ability triggered. For a delayed triggered ability, the source is determined by 603.7d–f.

**Independence (113.7a):** Once an ability is on the stack, it exists independently of its source. Destruction or removal of the source does not affect the ability already on the stack. But if the ability references information about its source, it checks that information when placed on the stack; if the source is gone, it uses LKI.

**Controller (113.8):** The controller of an activated ability is the player who activated it. The controller of a triggered ability is the player who controlled the source when it triggered (or the owner if there was no controller). For delayed triggered abilities, see 603.7d–f.

## 6.3 Ability Zone Function (Rule 113.6)

The general rule is that abilities function only in the zone they're on — battlefield for permanents, stack for instants/sorceries. But 113.6 has many exceptions covering:

- Characteristic-defining abilities (function everywhere)
- Zone-specific function declarations
- Cast-modification abilities (function from any zone the card can be cast from, plus the stack)
- ETB-modification abilities (function as the object enters)
- Activated abilities with costs that can't be paid on the battlefield (function from whatever zone the cost can be paid)
- Graveyard-activation abilities (function from the graveyard because their cost specifies graveyard)
- Command zone abilities (emblems, commanders, etc.)

**For trigger adjudication:** Rule 113.6k is particularly important — a trigger condition that cannot trigger from the battlefield functions from all zones where it can trigger. This means the trigger can fire when the card is in graveyard, exile, or hand (if the condition is met there), not just when it's on the battlefield.

## 6.4 Multiple Instances of the Same Ability (Rule 113.2c)

If an object has multiple instances of the same ability, each functions independently. This may produce more effects (e.g., having two "whenever this attacks, draw a card" abilities draws two cards on attack) or may not (check the specific ability — some abilities are explicitly one-per-trigger).

## 6.5 Characteristic-Setting vs. Ability-Granting (Rule 113.12)

This distinction is live for continuous effects adjudication (L8 territory) but the rule belongs here:

- If an effect says "[object] gains [ability]" or "[object] has [ability]" — that's ability granting. The ability can be removed by a "loses" effect.
- If an effect says "[object] is [characteristic]" — that's characteristic setting. It's not granting an ability. It cannot be removed by an ability-removal effect (but it can be overridden by another characteristic-setting effect per L8 layer rules).
- If an effect says "[object] can't be blocked" — that's neither granting an ability nor setting a characteristic. It's a quality statement. It cannot be removed by ability-removal effects.

---

# 7. LAST KNOWN INFORMATION (LKI)

## 7.1 What LKI Is

Last known information is the mechanism by which the game accesses characteristics of an object that has left an expected zone. It is not a zone, not a special state — it is simply the rule that an effect or trigger can use the characteristics the object had *at the time it last existed in the zone the effect expected it to be in*.

## 7.2 When LKI Applies

| Situation | Rule | LKI Used? |
|---|---|---|
| Triggered ability's source left its zone; trigger checks source info at insertion time | 113.7a | Yes |
| Triggered ability's source left its zone; trigger checks source info at resolution | 113.7a | Yes |
| Target legality check at resolution; source of triggered ability left its zone | 608.2b | Yes |
| Effect during resolution references an object that moved to a hidden zone | 608.2h | Yes |
| SBA fires simultaneously with a zone change; affected object characteristics needed | 704.8 | Yes (pre-SBA state) |

## 7.3 What LKI Is NOT

LKI does not allow a trigger to fire from an object that's no longer in the expected zone at the time of trigger detection. LKI applies after a trigger has already fired, when it needs to reference information about its source or targets. If the trigger condition itself requires the object to be in a zone it's no longer in, the trigger does not fire — there is no LKI rescue at detection time.

The look-back exception in 603.10 is separate from LKI. Look-back governs which *moment in time* is used for trigger detection. LKI governs what *information* is used when referencing an object that has left its zone after detection.

## 7.4 LKI and the 704.8 SBA Rule

Rule 704.8 specifically governs LKI in the context of SBAs. If SBAs cause a permanent to leave the battlefield at the same time as other SBAs, that permanent's LKI is drawn from the game state *before any of those SBAs were performed*. This prevents a cascade problem where the first SBA changes the state and the LKI check for the second SBA sees incorrect information.

---

# 8. INTEGRATION SUMMARY

## What This Layer Provides to Other Layers

| Layer | What it gets from L7 |
|---|---|
| L3 (Event) | What "object" means in replacement effects; characteristic checking for which replacements apply |
| L4 (Trigger) | Source identification (113.7); controller of waiting triggers (109.4b); visibility check (whether source is in a visible zone); zone-change trigger ability to find new objects (400.7e) |
| L5 (State) | Characteristic checking for SBA conditions (toughness ≤ 0, etc.); token cessation (111.7); LKI during simultaneous SBAs (704.8) |
| L6 (Player Action) | Who "you" refers to in ability text (109.5); controller determination for priority (109.4) |
| L8 (Continuous Effects) | The characteristic list (109.3) that L8 modifies; status vs characteristic distinction (110.5a) |

---

FEEDS INTO: L04_Trigger_engine.md, L03_Event_614to616_t.md, L05_StateEnforcement_704_t.md, L06_PlayerAction_117_t.md, L00_Orchestration_game_engine.md (§5.10)
