# Magic: The Gathering — Parts of a Card: Engine Expansion
## LAYER 7: OBJECT MODEL LAYER — Expansion (Rules 200–213)
## Effective February 27, 2026

---

SOURCES: L07_ObjectModel_200to213_v.md
FEEDS INTO: L07_ObjectModel_707_t.md (copiable values), L08_ContinuousEffects_611to613_t.md (characteristics in layers), L00_Orchestration_game_engine.md

---

# 1. CARD PARTS vs. CHARACTERISTICS

Card parts are the physical elements printed on a card. Characteristics are the game properties an object has at any given moment. They are related but not identical.

**Card parts** (rule 200.1): name, mana cost, illustration, color indicator, type line, expansion symbol, text box, power/toughness, loyalty, defense, hand modifier, life modifier, illustration credit, legal text, collector number.

**Characteristics** (rule 109.3): name, mana cost, color, color indicator, card type, subtype, supertype, rules text, abilities, power, toughness, loyalty, defense, hand modifier, life modifier.

The key difference: characteristics are what the game reads; card parts are what's printed. Continuous effects modify characteristics, not card parts. The layer system (613) produces characteristics from card parts as the baseline, then applies effects on top.

---

# 2. NAME (Rule 201)

## 2.1 English Name Is Canonical

A card's name is always treated as its English Oracle name regardless of what language the physical card is printed in (201.2). When rules reference a card by name, they reference the English Oracle name.

## 2.2 Same Name Rules (201.2a–c)

Two objects have the same name if they share **at least one** name in common. An object with no name has no name in common with any other object — including other nameless objects.

This matters for: legend rule (704.5j), "can't have the same name" effects, "you control a card named X" checks.

## 2.3 Interchangeable Names (201.3)

Some cards are explicitly treated as having the same name as other cards (e.g., some reprints or variants). These pairs are specified in the Oracle reference.

---

# 3. MANA COST AND COLOR (Rule 202)

## 3.1 Color Is Derived from Mana Cost

A permanent's color is determined by the colored mana symbols in its mana cost, unless a color indicator or CDA overrides (202.2). This determination happens at layer 5 of the continuous effect system.

## 3.2 Mana Value (202.3)

Mana value (formerly converted mana cost) is the total amount of mana in an object's mana cost, where:
- Each colored symbol = 1
- Each generic symbol = its number
- {X} = the announced value (or 0 if not on the stack)
- Hybrid symbols = 1 per symbol regardless of payment choice
- Phyrexian symbols = 1 per symbol

Mana value is always 0 or greater. An object with no mana cost has mana value 0.

---

# 4. TYPE LINE (Rules 204–205)

## 4.1 Type Line Components

The type line contains: [supertypes] [card types] — [subtypes]

Everything before the dash is the card type (and any supertypes). Everything after is subtypes.

## 4.2 Supertypes (205.4)

Current supertypes: Basic, Legendary, Ongoing, Snow, World.

- **Legendary** → subject to legend rule (SBA 704.5j)
- **Basic** → land may be searched with basic land search effects
- **Snow** → relevant for snow-specific abilities and costs

## 4.3 Subtypes

Subtypes are listed by card type in rule 205.3. Key subtypes for Commander:
- **Creature subtypes** (creature types): Human, Elf, Wizard, Dragon, etc. — relevant for tribal effects
- **Land subtypes** (land types): Plains, Island, Swamp, Mountain, Forest (basic), plus others
- **Planeswalker subtypes**: Jace, Liliana, etc.
- **Enchantment subtypes**: Aura, Saga, Class, Role

---

# 5. TEXT BOX — RULES TEXT AND REMINDER TEXT (Rule 207)

## 5.1 Rules Text

The rules text (ability text) of an object is what defines what it does. Rules text is a characteristic — it can be modified by text-changing effects at layer 3 of the continuous effect system.

## 5.2 Reminder Text (207.2)

Reminder text (italicized in parentheses) explains keywords or concepts for players but has **no rules force**. If reminder text conflicts with the full rule in the CR, the CR governs. Reminder text is ignored for color identity determination (903.4c).

---

# 6. POWER AND TOUGHNESS (Rule 208)

## 6.1 Printed vs. Actual P/T

The numbers printed in the lower right of a creature card are the base power and toughness. The actual P/T at any moment is determined by the layer system applying all continuous effects to the printed values.

## 6.2 Negative P/T (208.3)

Power and toughness can be negative or zero. A creature with 0 or less toughness is destroyed as an SBA (704.5f). A creature with negative power does not deal combat damage (it deals 0).

## 6.3 * in P/T (208.2)

Some cards have * or *+1 as power or toughness — these are CDAs (rule 604.3) and are evaluated continuously at layer 7b.

---

# 7. LOYALTY AND DEFENSE (Rules 209, 210)

Loyalty (planeswalkers) and defense (battles) work as characteristics. Their values are set by intrinsic ETB replacement effects when the permanent enters, then modified by counters. See rules 306 (planeswalker) and 310 (battle) for full treatment.

---

# 8. COPIABLE VALUES (Rule 200.3, Rule 707)

Objects that aren't cards (tokens, copies of spells) have only those parts that are also characteristics. The full treatment of what gets copied is in rule 707 and L07_ObjectModel_707_v.md.

**For adjudication:** When determining what a copy of an object has, start with the printed card parts that are characteristics, apply copy effects, face-down status, and "as [this] enters" setting abilities. Everything else (non-copy continuous effects, counters, status) is not copiable.

---

FEEDS INTO: L07_ObjectModel_707_t.md (copiable values framework), L08_ContinuousEffects_611to613_t.md (card parts as baseline for layer application), L05_StateEnforcement_704_t.md (legend rule via legendary supertype)
