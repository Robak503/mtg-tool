# Magic: The Gathering — Merging with Permanents: Engine Expansion
## LAYER 7: OBJECT MODEL LAYER — Expansion (Rule 729)
## Effective February 27, 2026

---

SOURCES: L07_ObjectModel_729_v.md
FEEDS INTO: L07_ObjectModel_707_t.md (merged permanent copiable values), L04_Trigger_engine.md (triggers involving merged permanents), L00_Orchestration_game_engine.md

---

# 1. WHAT MERGING IS

Merging (rule 729) occurs when the Mutate keyword (702.140) causes a spell to merge with a permanent on the battlefield. The resulting merged permanent is a single object with multiple components.

---

# 2. THE MERGED PERMANENT OBJECT

A merged permanent is one object, but it has multiple card components stacked physically. The merged permanent has:

- **The characteristics of the top component** (the most recently placed) for most purposes
- **All abilities of all components** that are characteristic-defining or granted (they all apply)
- **A single set of counters** (not one per component)
- **A single tapped/untapped status**

**Key:** The "top" card of the merged permanent determines name, mana cost, power, toughness, and non-ability characteristics. All components contribute their abilities.

---

# 3. ZONE CHANGES OF MERGED PERMANENTS

When a merged permanent would move to another zone (graveyard, hand, exile, library):
- Each component moves to that zone **as a separate object**
- The player who controlled the merged permanent (or its owner, for owned-but-not-controlled) chooses the order the components arrive in the new zone
- This matters for graveyard order (cards arrive individually, graveyard has order)

**Exception:** If the merged permanent is put into the command zone (via Commander replacement effect 903.9b), only the component that is a commander goes to the command zone; other components go to their appropriate zones.

---

# 4. COPY INTERACTIONS (Rule 729 + 707)

Copying a merged permanent copies the copiable values of the **top component** only — not the combined characteristics of all components. The copy does not reproduce the merged structure.

---

# 5. TRIGGERS AND MERGED PERMANENTS

When a merged permanent leaves the battlefield, "when [card name] leaves the battlefield" triggers on all components check whether that component's name matches. Each component that matches triggers its own ability.

For "when [card] dies" — each component that goes to the graveyard individually can trigger its own death-based abilities.

---

# 6. STICKERS ON MERGED PERMANENTS (123.5b–c)

If a component of a merged permanent has stickers, those stickers are on the merged permanent while it is merged. When the merged permanent leaves the battlefield and separates into components, the owner chooses which component retains the stickers.

---

FEEDS INTO: L07_ObjectModel_707_t.md (merged permanent has top component's copiable values), L04_Trigger_engine.md (LTB triggers for individual components of merged permanents)
