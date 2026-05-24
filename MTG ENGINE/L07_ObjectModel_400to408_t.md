# Magic: The Gathering — Zone System Expansion
## LAYER 7: OBJECT MODEL LAYER — Expansion (Rules 400–408)
## Effective February 27, 2026

---

SOURCES: L07_ObjectModel_400to408_v.md
FEEDS INTO: L04_Trigger_engine.md (§5 look-back class, zone-change triggers), L03_Event_614to616_t.md (replacement effects on zone entry), L05_StateEnforcement_704_t.md (SBA zone checks), L00_Orchestration_game_engine.md (§5.10)

---

# 1. THE ZONE SYSTEM — FOUNDATIONS

## 1.1 What a Zone Is

A zone is a defined location where game objects exist. Every object in a Magic game is in exactly one zone at any given moment. An object not in any zone is outside the game — which is not itself a zone (rule 400.11).

The seven standard zones:

| Zone | Shared or Per-Player | Public or Hidden |
|---|---|---|
| Library | Per-player | Hidden |
| Hand | Per-player | Hidden |
| Battlefield | Shared | Public |
| Graveyard | Per-player | Public |
| Stack | Shared | Public |
| Exile | Shared | Public (except face-down cards) |
| Command | Shared | Public |

The ante zone (rule 407) is a legacy zone used only in ante games.

## 1.2 Public vs. Hidden Zones — Operational Consequences

**Public zones (battlefield, graveyard, stack, exile, command):** All players can see the faces of cards in these zones unless a specific rule or effect says otherwise (e.g., face-down permanents, face-down exiled cards). Triggered abilities can fire based on objects in public zones. Replacement effects can be evaluated based on objects in public zones.

**Hidden zones (library, hand):** Players cannot be expected to see card faces. The visibility rule (603.2f) applies: a triggered ability does not fire if its source is at no time visible to all players. Objects in hidden zones cannot generally be seen, which affects whether triggers on those objects can detect events.

**Key exception — exile face-down:** Exile is normally public, but face-down exiled cards have no characteristics (rule 406.3a) and cannot be examined without specific permission. A face-down exiled card is effectively in a hidden state within a public zone.

## 1.3 Zone Ownership

Libraries, hands, and graveyards each belong to a specific player. If an object would go to a zone other than its owner's (e.g., an effect tries to put a card into an opponent's library), it goes to its owner's corresponding zone instead (rule 400.3).

---

# 2. THE NEW OBJECT RULE — RULE 400.7

## 2.1 The Default: A New Object Has No Memory

When an object moves from one zone to another, it becomes a completely new object. It has no memory of its previous existence. This means:

- Effects that tracked the old object can no longer find it unless an exception applies
- Damage marked on a creature is gone if the creature leaves the battlefield and returns
- Counters that were on an object do not follow it unless a rule preserves them
- The "new object" can be targeted by spells/abilities that previously couldn't target the old object (because it's different now)

This rule (400.7) is the foundation of why "the same card" is often not "the same object."

## 2.2 The Thirteen Exceptions (400.7a–m)

Rule 400.7 is a default with explicit exceptions. Every exception is a specific rule — if the situation doesn't match one of them, the new-object default applies.

| Exception | Rule | What Persists |
|---|---|---|
| Effects on permanent spells | 400.7a | Characteristic/controller effects on a spell on the stack continue when it becomes a permanent |
| Static ability grants to permanent spells | 400.7b | Abilities granted by static effects to spells on the stack carry to the resulting permanent |
| Prevention effects on permanent spells | 400.7c | Prevention shields on a spell carry to the resulting permanent |
| Cost-paid information | 400.7d | A permanent can reference what costs were paid to cast the spell it came from |
| Zone-change trigger finding | 400.7e | A trigger that fires when an object moves zones can find the new object in the destination zone if it's public |
| Aura trigger finding | 400.7f | Triggers on Auras when an enchanted permanent leaves can find the new object in the graveyard |
| Cast-granting ability persistence | 400.7g | An ability that grants a card the ability to be cast persists after the card moves to the stack |
| Effect finding after cast | 400.7h | Other parts of an effect that caused a nonland to be cast can find the new stack object |
| Effect finding after played | 400.7i | Other parts of an effect that caused a land to be played can find the new battlefield object |
| Public zone movement by effect | 400.7j | If an effect moves an object to a public zone, other parts of that effect can find it there |
| Madness exception | 400.7k | After a madness trigger resolves, if the card moved to a public zone, effects referencing it can still find it |
| Sticker persistence | 400.7m | Stickers on objects in public zones carry to the new object in the next public zone |

## 2.3 The 400.7e Finding Rule — Critical for Triggers

400.7e is the most operationally important exception for trigger adjudication. When an object triggers a zone-change ability as it moves (e.g., a leaves-the-battlefield trigger), that trigger is created as the object moves. At the time the trigger is placed on the stack, the old object is gone — but 400.7e allows the trigger to find the new object the card became in the zone it moved to, if that zone is public.

**What "find" means:** The trigger can reference and affect the new object in the destination zone. It doesn't mean the old object still exists. The trigger is operating on the new identity.

**Hidden zone limitation:** If the destination zone is hidden (library or hand), the trigger cannot find the new object there under 400.7e. The object moved but the trigger has no access to it.

## 2.4 The New Object Rule in SBA Processing

During SBA processing (rule 704), if an object changes zones as a result of an SBA, subsequent SBAs in the same pass check the new object's characteristics, not the old object's. This matters when multiple SBAs fire simultaneously and one of them causes a zone change that would affect another SBA's evaluation.

## 2.5 Exile Re-Exile Rule (400.8)

If an object already in the exile zone is exiled again (e.g., a second exile effect hits a card already in exile), it does not change zones. However, it becomes a new object that has just been exiled. This means:

- Duration-based effects ("until end of turn") reset on the new object
- "When [this card] is exiled" triggers do not fire again — the object didn't change zones
- Linked ability tracking resets — a new exile event has begun

The same principle applies to the command zone (rule 400.10).

---

# 3. ZONE-SPECIFIC OPERATIONAL RULES

## 3.1 Library (Rule 401)

**Face-down mandatory:** A library must be kept as a single face-down pile. No player may look at or change the order of cards in a library without a specific rule or effect permitting it (401.2).

**Counting is always permitted:** Any player may count the number of cards in any player's library at any time (401.3). This is an unconditional permission — it does not require priority.

**Top card revealed effects (401.5–401.6):** Effects that cause a player to "play with the top card revealed" or "look at the top card" are ongoing permissions. If the top card changes while a spell is being cast or an ability is being activated, the new top card doesn't get the revealed/look benefit until the current action completes (401.5). If a card stops being revealed under such an effect, it becomes a new object when revealed again (401.6).

## 3.2 Hand (Rule 402)

**Maximum hand size:** Seven cards by default. Excess must be discarded during the cleanup step. A player may hold any number of cards during the game (402.2).

**Privacy:** A player may not look at another player's hand but may count their cards at any time (402.3).

## 3.3 Battlefield (Rule 403)

**Spell/ability default zone:** A spell or ability affects and checks only the battlefield unless it specifically mentions a player or another zone (403.2). This is the zone-assumption rule — if an effect refers to a "creature" without a zone qualifier, it means a creature on the battlefield.

**New object on ETB:** Every time a permanent enters the battlefield, it becomes a new object (403.4). It has no relationship to any previous permanent from the same card, subject to the 400.7 exceptions. This is why ETB triggers fire on re-entry — the game sees a genuinely new object.

**Default statuses (110.5b):** All permanents enter the battlefield untapped, unflipped, face up, and phased in unless a replacement effect changes this.

## 3.4 Graveyard (Rule 404)

**Face-up, ordered:** Each graveyard is a face-up pile. All players may examine it at any time (404.2). Order normally can't be changed except at sanctioned events with specific rules permitting it.

**Simultaneous arrival ordering:** If multiple cards enter the same graveyard simultaneously, the owner of those cards may arrange them in any order (404.3). This affects graveyard-order-dependent effects.

## 3.5 Stack (Rule 405)

**LIFO structure:** Each object placed on the stack goes on top. Objects resolve from the top down (405.2, 405.5).

**Ability characteristics:** Activated and triggered abilities on the stack have only the text of the ability that created them and no other characteristics (405.4). They do not have mana costs, colors, or card types unless the ability text states otherwise.

**Simultaneous placement (405.3):** If multiple objects are placed on the stack simultaneously (e.g., the beginning-of-step trigger insertion point), active-player objects go on lowest, then APNAP order. The player controlling more than one such object chooses their relative order.

**What doesn't use the stack (405.6):** Effects, static abilities, mana abilities, special actions, turn-based actions, and state-based actions all happen without using the stack. This is a complete list — if something isn't on this list, it uses the stack.

## 3.6 Exile (Rule 406)

**Default public, face up:** Exiled cards are face up and examinable by all players unless explicitly exiled face down (406.3).

**Face-down exile has no characteristics:** A card exiled face down has no characteristics for rules purposes (406.3a). It cannot be targeted, cannot be referenced by characteristic-checking abilities, and cannot trigger conditions based on its card type or other characteristics.

**Pile management (406.4–406.5):** Face-down exiled cards should be kept in separate piles by when and how they were exiled. When choosing a face-down exiled card you can't look at, you choose a pile and a random card from that pile.

**Linked exile abilities (406.6):** When an object has an ability that exiles cards and another ability that refers to those exiled cards, those abilities are linked (rule 607). The second ability refers only to cards exiled by the first ability.

## 3.7 Command (Rule 408)

The command zone holds objects that affect the game but are not permanents — emblems, commanders, plane cards, vanguard cards, scheme cards, conspiracy cards. These objects function from the command zone per their specific rules (rule 113.6p).

---

# 4. ZONE MOVEMENT — THE COMPLETE PROCESS

## 4.1 The Movement Sequence (Rule 400.6)

When an object would move from one zone to another, this is the process:

1. Determine what event is causing the movement
2. If moving to a public zone where the owner can see it — owner examines it for abilities that affect the move
3. If moving to the battlefield — each other player who will be able to see it may also examine it
4. Apply all appropriate replacement effects to the movement event (under the 616 selection process)
5. If conflicting/mutually exclusive effects remain, the controller (or owner if no controller) chooses which effect applies
6. The event moves the object

**Note on step 2–3:** This is the owner's opportunity to discover whether the object has a relevant replacement effect *on itself* (like "enters with X counters" or "enters tapped"). It is not a priority window and does not pause the game for player actions.

## 4.2 400.4 Entry Restrictions

Instants and sorceries cannot enter the battlefield (400.4a) — if they somehow would, they remain in the previous zone. Conspiracy, phenomenon, plane, scheme, and vanguard cards cannot leave the command zone (400.4b).

## 4.3 Zone Change and Trigger Timing

Zone-change triggers fire as the object moves. At the moment of the move, the trigger fires and enters the waiting state. The new object exists in the destination zone. The trigger is placed on the stack at the next 117.5 checkpoint.

For look-back triggers (603.10a), the trigger detection uses the game state *before* the move — the pre-move state is used to determine whether the trigger fires. But once the trigger fires, 400.7e allows it to find the new object in the destination zone.

---

# 5. CRITICAL INTERACTIONS WITH OTHER LAYERS

## 5.1 With Layer 4 (Triggers)

Zone-change triggers and look-back triggers (603.10a) are the most direct interaction. The trigger fires as the zone change occurs. 400.7e determines whether the trigger can interact with the new object in the destination zone. The new-object rule (400.7) determines what characteristics the trigger can detect on the destination-zone object.

## 5.2 With Layer 3 (Replacement/Prevention Effects)

ETB replacement effects (614.12) operate on the zone-movement event. The process in 400.6 governs when replacement effects are evaluated during movement. The new object created by the zone entry is modified by these replacement effects. 400.7a–c determine what effects from the previous zone carry through.

## 5.3 With Layer 5 (SBAs)

SBAs check zone membership — a token in a zone other than the battlefield ceases to exist (111.7, rule 704). The SBA check uses current zone membership. After a zone change caused by SBAs, subsequent SBA checks see the new object in the new zone.

## 5.4 With Layer 6 (Priority/Resolution)

During resolution (rule 608.2h), effects that need to reference an object use the current object if it's still in the expected zone; otherwise they use LKI (last known information). LKI is always drawn from the object's characteristics as they last existed in the zone the effect expected it to be in.

## 5.5 With Layer 8 (Continuous Effects) — STUB

Continuous effects that modify object characteristics operate on whatever zone the object is currently in. When an object moves zones, continuous effects that were applying to the old object are re-evaluated against the new object. Unless an exception in 400.7 preserves an effect, effects that were applying to the old object do not automatically apply to the new object. Full treatment pending L08 completion.

---

# 6. ZONE REFERENCE TABLE

| Zone | Per-Player? | Public? | Order matters? | Stack-use objects? |
|---|---|---|---|---|
| Library | Yes | No (hidden) | Yes — can't change | No |
| Hand | Yes | No (hidden) | No | No |
| Battlefield | No (shared) | Yes | No | No (permanents) |
| Graveyard | Yes | Yes | Yes — can't normally change | No |
| Stack | No (shared) | Yes | Yes — LIFO | Yes |
| Exile | No (shared) | Yes (except face-down) | No | No |
| Ante | No (shared) | Yes | No | No |
| Command | No (shared) | Yes | No | No |

---

FEEDS INTO: L04_Trigger_engine.md (zone-change trigger class, look-back class), L03_Event_614to616_t.md (ETB replacement effects, 400.6 process), L05_StateEnforcement_704_t.md (SBA zone checks, token cessation), L00_Orchestration_game_engine.md (§5.10 Object Model integration)
