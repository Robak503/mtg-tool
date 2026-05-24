# Magic: The Gathering — Colors and Numbers/Symbols Expansion
## LAYER 7: OBJECT MODEL LAYER — Expansion (Rules 105, 107)
## Effective February 27, 2026

---

SOURCES: L07_ObjectModel_105_107_v.md
FEEDS INTO: L03_Event_614to616_t.md (color-based replacement/prevention), L04_Trigger_engine.md (color-based trigger conditions), L06_PlayerAction_601_seg1_t.md (X announcement at 601.2b), L00_Orchestration_game_engine.md

---

# 1. COLORS (105)

## 1.1 Color Is a Characteristic

Color is one of the fifteen characteristics listed in rule 109.3. An object's color is determined by:
1. Mana symbols in its mana cost (primary source)
2. A color indicator (circular symbol on type line — rule 204)
3. A characteristic-defining ability (CDA) that defines color

An object with no mana cost, no color indicator, and no CDA defining color is colorless.

## 1.2 Color Changing (105.3)

Effects that give an object a new color **replace** all previous colors unless they say "in addition." This is a layer 5 continuous effect (rule 613.4a). Key precision: "becomes blue" removes all other colors. "Becomes blue in addition to its other colors" adds blue while keeping everything else.

## 1.3 Choosing a Color (105.4)

When asked to choose a color, the player must choose one of the five colors. "Multicolored" and "colorless" are not valid choices.

## 1.4 Color Pairs (105.5)

Ten possible pairs. Effects that refer to a "color pair" mean exactly two colors. This matters for cards that reference specific pairs (enemy vs. allied color pairs).

---

# 2. THE X VARIABLE (107.3)

## 2.1 When X Is Announced

For spells and activated abilities: X is announced as part of casting/activating (601.2b / 602.2b). Once announced, X is locked in for the duration the spell or ability is on the stack.

## 2.2 X Outside the Stack

A card with {X} in its mana cost that is not on the stack has X = 0 for all purposes (107.3g). This applies to characteristic checks in graveyards, exile, hand, etc.

Similarly, if an effect instructs paying a cost including {X} for an object not on the stack, X is treated as 0 (107.3h).

## 2.3 X Independence for Activated Abilities (107.3k)

If a permanent has an activated ability with {X} in its activation cost, the value of X chosen for that activation is independent of any other X values on the object. Each activation sets its own X. This is an explicit exception to the "all instances of X have the same value" rule (107.3i).

## 2.4 X in ETB Triggers (107.3m)

If a spell had an X value when cast, and the permanent it became has an ETB trigger or replacement effect that refers to X, that trigger/effect uses the X value from casting — even though the permanent itself treats X as 0. This preserves the intent of cards like "enters with X counters."

## 2.5 X in Delayed Triggers (107.3n)

A delayed triggered ability created by a resolving spell/ability inherits the X value from the spell/ability that created it, if X isn't defined in the triggered ability's own text.

---

# 3. MANA SYMBOLS (107.4)

## 3.1 Symbol Categories

| Category | Symbols | Notes |
|---|---|---|
| Colored | {W}{U}{B}{R}{G} | Paid only with matching color |
| Colorless | {C} | Paid only with colorless mana |
| Generic | {0}{1}{2}... {X} | Paid with any mana type |
| Hybrid | {W/U} etc. | Pays either color |
| Monocolored hybrid | {2/W} etc. | Pays 2 generic OR 1 of the color |
| Phyrexian | {W/P} etc. | Pays 1 colored mana OR 2 life |
| Hybrid Phyrexian | {W/U/P} etc. | Pays either color OR 2 life |
| Snow | {S} | Pays any mana from a snow source |

## 3.2 Hybrid Mana Color Identity

A hybrid mana symbol is **all of its component colors** (107.4e). {W/U} is both white and blue. This affects:
- The color of the spell/permanent (if that symbol is in the mana cost)
- Color identity for Commander deckbuilding
- Effects that check "if {W} was spent" — paying {W/U} with white mana satisfies this

## 3.3 Phyrexian Mana Color

Phyrexian symbols are colored mana symbols (107.4f). {W/P} is white. A spell with {W/P} in its cost is a white spell even if the player pays the 2 life instead of the mana. Hybrid Phyrexian symbols are both component colors.

## 3.4 Snow Mana (107.4h)

{S} can be paid with any mana produced by a snow source. Generic mana cost reductions do not affect {S} costs — {S} must be paid specifically with snow-produced mana.

---

# 4. TAP AND UNTAP SYMBOLS (107.5–107.6)

{T} in an activation cost taps the permanent as part of paying the cost. A tapped permanent cannot pay {T} again (it is already tapped). The summoning sickness restriction applies to creatures with {T} or {Q} in their activation costs (302.6).

{Q} untaps the permanent as part of paying. An already-untapped permanent cannot pay {Q}.

---

# 5. INTEGERS AND ZERO (107.1–107.2)

Magic uses only integers. No fractions. No negative results from effects (unless the effect doubles, triples, or sets to a specific value a life total or P/T) — negative calculations floor at 0. But game values like P/T can be negative (from -X/-Y effects), and those negative values are used in further calculations.

If a number can't be determined, it is 0 (107.2). This matters for abilities that reference undefined values (e.g., a X whose value isn't set).

---

FEEDS INTO: L03_Event_614to616_t.md (color replacement/prevention matching), L04_Trigger_engine.md (color-based trigger conditions), L06_PlayerAction_601_seg1_t.md (X announced at 601.2b, cost lock-in at 601.2f), L05_StateEnforcement_704_t.md (SBA cost checks)
