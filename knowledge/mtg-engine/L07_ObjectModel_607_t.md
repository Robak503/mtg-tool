# Magic: The Gathering — Linked Abilities Expansion
## LAYER 7: OBJECT MODEL LAYER — Expansion (Rule 607)
## Effective February 27, 2026

---

SOURCES: L07_ObjectModel_607_v.md
FEEDS INTO: L04_Trigger_engine.md (603.11 static-trigger linking), L03_Event_614to616_t.md (anchor words 614.12b), L07_ObjectModel_707_t.md (linked abilities in copies)

---

# 1. WHAT LINKING MEANS

Two abilities are linked when one "sets up" something (takes an action, affects objects/players, stores a value) and the other "refers back" to exactly what the first did — and nothing else (607.1).

**The core restriction:** The referring ability is scoped to the specific actions/objects/players from its linked partner. It cannot reference identically worded but independently sourced effects.

---

# 2. THE THIRTEEN KINDS OF LINKED ABILITIES (607.2)

| Rule | Setup ability | Referring ability | Refers to |
|---|---|---|---|
| 607.2a | Activated/triggered: exile cards | "the exiled cards" / "exiled with [this]" | Cards put in exile by first ability |
| 607.2b | Replacement effect: exile cards | "the exiled cards" / "exiled with [this]" | Cards put in exile by replacement |
| 607.2c | Activated/triggered: put objects onto battlefield | "put onto battlefield with [this]" / "created with [this]" | Objects from first ability only |
| 607.2d | "Choose a [value]" | "the chosen [value]" / "the last chosen [value]" | Choice made by first ability |
| 607.2e | Note information | Information "noted for [this object]" | Information from first ability |
| 607.2f | Choose from flavor words | Reference to that word choice | Choice made by first ability |
| 607.2g | Pay a cost as it enters | "the cost paid as [this] entered" | Cost paid because of first ability |
| 607.2h | Static ability + triggered ability (same paragraph) | The triggered ability's scope | Actions from static ability only |
| 607.2i | Additional cost permission | "if that cost was paid" | Whether first ability's cost was declared |
| 607.2j | Variable additional cost | "the cost paid as [this] was cast" | Value from first ability's cost |
| 607.2k | Champion keyword | The two champion abilities | Per rule 702.72 |
| 607.2m | Anchor word ability | Abilities with that anchor word | Per rule 614.12b |
| 607.2n | Pre-game exile static | "exiled with cards named [this]" | Cards from pre-game ability |
| 607.2p | Pre-game CDA choice | The CDA | Choice from first ability, persists across zones |
| 607.2q | Exile-as-cost during cast | "exiled with [this object]" on permanent | Cards exiled paying the cast cost |

---

# 3. THE "PRINTED ON" EXPANSION (607.1a–d)

Linking is based on being "printed on" the same object. This concept is expanded in three ways:

**607.1a — Granted abilities:** If an ability is granted to an object via another ability on that object, it is considered printed on the object. A card that says "gains: [exile ability]" and separately has a "cast exiled cards" ability — those are linked on the object that gained the exile ability.

**607.1b — DFC faces:** Both faces of a nonmodal DFC are considered "printed on" the same object regardless of which face is up. Front-face and back-face abilities can be linked.

**607.1c — Self-linking:** An ability can be linked to itself if it both sets up and refers to its own setup.

**607.1d — Cross-object linking:** Abilities on two objects can be linked if one object is a token/emblem/nontoken permanent and the other was its source. The most common application: a card that creates a token and instructs a player to put counters on the token, with a later ability on the original card referencing "creatures created with [this card]."

---

# 4. COPYING AND LINKING (607.5, rule 707.7)

When a pair of linked abilities is copied together as part of the same effect, the copied abilities are linked to each other on the new object — and only to each other. They are not linked to any identically worded ability on the new object from any other source (607.5).

**Undefined choice (607.5a):** If an object gains an ability that refers to a choice but didn't gain the linked setup ability (or gained it but no choice was made), the choice is "undefined" and the referring ability does nothing with that part of its text.

---

# 5. MULTIPLE PAIRS (607.4)

An ability may participate in more than one linked pair. A setup ability can have two referring abilities linked to it; a referring ability could theoretically link to multiple setups. The key is that each pair is independent — the scoping applies per pair.

---

# 6. 607.2h — THE STATIC-TRIGGER PAIR

Rule 607.2h covers the case where a static ability and a triggered ability appear in the same paragraph on a card. The triggered ability is linked to the static ability and can only refer to actions taken as a result of that static ability.

**Engine connection (L4, 603.11):** This rule is the basis for rule 603.11, which governs "when/whenever" triggered abilities that fire as part of static ability effects. The linking ensures the trigger doesn't misfire for independently-caused identical events.

---

# 7. 607.2a vs 607.2b — EXILE LINKING DISTINCTION

**607.2a** (instruction to exile): Activated or triggered ability says "exile [cards]" as part of its instructions. The linking refers to cards put in exile by that instruction.

**607.2b** (replacement effect exiles): A replacement effect generated by the first ability causes cards to be exiled. The linking refers to cards exiled as a direct result of that replacement.

**Practical difference:** If an ETB replacement effect says "if this would enter the battlefield, instead exile it and exile cards from [opponent's] library," the exiled cards are linked via 607.2b, not 607.2a. The exile happened through a replacement, not a direct instruction.

---

# 8. STUB PROMOTION NOTE

This file supersedes `L07_ObjectModel_607_linked_stub.md`. That stub covered only the basic exile-tracking use case. This full file covers all 16 kinds of linked abilities and the cross-object, copying, and self-linking extensions.

---

FEEDS INTO: L04_Trigger_engine.md (603.11 static-trigger linking), L03_Event_614to616_t.md (anchor words 614.12b), L07_ObjectModel_707_t.md (linked abilities preserved through copy effects, 707.7)
