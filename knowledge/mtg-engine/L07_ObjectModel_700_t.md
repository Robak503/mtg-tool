# Magic: The Gathering — General Rules Expansion
## LAYER 7: OBJECT MODEL LAYER — Expansion (Rule 700)
## Effective February 27, 2026

---

SOURCES: L07_ObjectModel_700_v.md
FEEDS INTO: L04_Trigger_engine.md (event definition, one-vs-many events), L06_PlayerAction_601_seg1_t.md (modal choice at 601.2b), L00_Orchestration_game_engine.md

---

# 1. EVENTS (700.1)

Every game occurrence is an event. The same occurrence can be one event for one ability and multiple events for another — determined entirely by how each ability's trigger condition is worded.

**Engine consequence for L4:** When adjudicating whether a trigger fired, determine how many events the triggering occurrence produces *for that specific ability's wording*. "Whenever this creature becomes blocked" fires once per blocked-becoming event. "Whenever this creature becomes blocked by a creature" fires once per blocking creature.

---

# 2. MODAL SPELLS AND ABILITIES (700.2)

## 2.1 Mode Selection Timing

- **Spells and activated abilities:** Mode chosen during casting/activation (601.2b, 602.2b)
- **Triggered abilities:** Mode chosen as the ability is placed on the stack (603.3c analog)

An illegal mode (no legal targets available) cannot be chosen. For triggered abilities, if no legal mode exists, the ability is removed from the stack (700.2b).

## 2.2 Copying Copies Modes (700.2g)

A copy of a modal spell/ability copies the modes already chosen. The copy's controller cannot change the mode. See rule 707.10.

## 2.3 Per-Mode Costs (700.2h)

Some modal spells have costs listed before individual modes. Choosing such a mode commits to paying that additional cost. All additional costs from chosen modes must be paid during 601.2f–h.

## 2.4 Pawprint Modes (700.2i)

Some spells use {P} symbols with an instruction to choose "up to N {P} worth of modes." The player may choose any combination of modes whose total pawprint count does not exceed N. This is a variant on standard modal selection.

---

# 3. DEFINED TERMS — ENGINE REFERENCE

These terms appear throughout all layers and have precise rule definitions in 700:

| Term | Rule | Definition |
|---|---|---|
| Dies | 700.4 | "Is put into a graveyard from the battlefield" — not destroyed by effect, not sacrifice-to-cost; any path to graveyard from battlefield |
| Historic | 700.6 | Has the legendary supertype, OR the artifact card type, OR the Saga subtype |
| Modified | 700.9 | Has one or more counters, OR is equipped, OR is enchanted by an Aura controlled by its controller |
| Outlaw | 700.12 | Has the Assassin, Mercenary, Pirate, Rogue, and/or Warlock creature type |
| Enters / Enter[s] | 700.15 | Short for "enters the battlefield" |

**"Dies" adjudication note:** The term triggers zone-change abilities reading "when [creature] dies." It does not require the creature to have been destroyed. A creature sacrificed, exiled from battlefield then moved to graveyard via replacement effect failing, or put into graveyard by any other effect — none of these are "dying" unless the card goes from battlefield to graveyard. A card countered and going to graveyard does not die (it was never on the battlefield as a permanent resolving as such during that casting).

---

# 4. PILES (700.3)

When effects create piles from a set of objects, each object goes into exactly one pile, the objects remain in their current zone, and each pile contains zero or more objects. Piles are not objects. Order constraints of the zone (e.g., graveyard order) persist within piles.

---

# 5. DEVOTION (700.5)

Devotion to a color counts mana symbols of that color among mana costs of permanents the player controls. Devotion to two colors counts symbols that are either or both.

**Calculation order (700.5a):** Devotion is calculated *after* copy, control, and text-changing effects, but *before* other effects that modify permanent characteristics. This is an explicit exception to rule 613.10 (the general layering order for continuous effects). Practically: a devotion-modifying effect (like "your devotion to each color is increased by one") is applied before checking type-changing effects that might depend on devotion count.

---

# 6. PARTY (700.8)

A player's party: up to one Cleric + one Rogue + one Warrior + one Wizard they control. Maximum four members.

A multi-type creature filling multiple roles is counted once, in whichever role maximizes the total party count (700.8b). The game calculates party count automatically — players don't declare party composition for most effects (700.8a).

---

# 7. OBJECT SELF-REFERENCE (700.7)

If an ability uses "this [something]" to identify an object, it tracks that specific object regardless of whether the object still has that quality. A triggered ability reading "destroy that creature at the beginning of the next end step" tracks the object it was applied to even if that object has since lost the creature type.

---

# 8. GAME TERMINOLOGY — CROSS-LAYER CONNECTIONS

**→ Layer 4 (Trigger):** The event definition (700.1) directly governs how trigger conditions match. One occurrence can satisfy multiple triggers independently or satisfy a single trigger once — determined by the trigger's wording.

**→ Layer 6 (Casting, 601):** Modal choice for spells occurs at 601.2b. The rules in 700.2 define what modal means, how modes work, and which modes are legal to choose.

**→ Layer 7 (Object Model, 707):** Modal copies inherit chosen modes (700.2g, 707.10).

---

FEEDS INTO: L04_Trigger_engine.md (event granularity for trigger matching), L06_PlayerAction_601_seg1_t.md (modal choice at 601.2b), L07_ObjectModel_707_t.md (modal copy inherits modes)
