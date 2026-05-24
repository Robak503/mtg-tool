# Magic: The Gathering — Casual Variants: Engine Expansion
## LAYER 10: VARIANT LAYER — Expansion (Rules 900–902, 904–905)
## Effective February 27, 2026

---

SOURCES: L10_Variant_900to905_v.md
FEEDS INTO: L00_Orchestration_game_engine.md

NOTE: Rule 903 (Commander) is the primary format — see L10_Variant_903_v.md and L10_Variant_903_t.md.

---

# 1. RULE 900 — GENERAL

All casual variants use the normal rules with specified additions or modifications. Rule 900 establishes this baseline. No engine-specific expansion needed.

---

# 2. PLANECHASE (Rule 901)

## 2.1 What Planechase Adds

Planechase adds a planar deck — a separate deck of plane and phenomenon cards — and a planar die. One plane card is face-up in the command zone at all times, creating game-wide effects.

## 2.2 The Planar Die (901.9)

The planar die has six faces: four blank, one Planeswalker symbol {PW}, one chaos symbol {CHAOS}. Rolling the planar die is a special action (rule 116.2i) with an increasing mana cost per roll on the same turn.

**Results:**
- Blank: nothing
- {PW}: Planeswalk — current plane goes to the bottom of the planar deck, reveal next plane
- {CHAOS}: Chaos ability of the current plane triggers

## 2.3 Planar Controller

The planar controller is the active player by default (rule 311.5). The planar controller controls face-up plane abilities.

## 2.4 Phenomena (Rule 312, 901.10)

Phenomenon cards trigger when revealed off the planar deck. After a phenomenon's triggered ability resolves and no more phenomena triggers are on the stack, the planar controller planeswalks again (SBA 312.7).

## 2.5 Engine Connections

- Plane cards are non-permanents in the command zone (rule 311)
- Plane static abilities affect the game as long as the card is face-up (311.4)
- Chaos abilities are triggered abilities controlled by the planar controller (311.7)
- Planar die rolls are special actions (116.2i) — no stack, can't be responded to before result

---

# 3. VANGUARD (Rule 902)

## 3.1 What Vanguard Adds

Each player uses a vanguard card that modifies their starting hand size and life total. Vanguard cards remain in the command zone throughout the game.

## 3.2 Hand and Life Modifiers

- **Hand modifier** (313.6): Applied to starting hand size (default 7) and maximum hand size
- **Life modifier** (313.7): Applied to starting life total (default 20)

These modifiers are applied once at game start and do not change during the game.

## 3.3 Vanguard in Commander

Vanguard is not used in standard Commander. If used in a hybrid format, the life modifier would stack with Commander's 40-life starting total per agreement of the players.

---

# 4. ARCHENEMY (Rule 904)

## 4.1 What Archenemy Adds

One player is the Archenemy — they face all other players simultaneously. The Archenemy uses a scheme deck (separate from their main deck) of scheme cards in the command zone.

## 4.2 The Scheme Mechanic

At the start of the Archenemy's turn, they "set a scheme in motion" — reveal the top card of their scheme deck and turn it face-up. The scheme's "When you set this scheme in motion" triggered ability fires.

**Ongoing schemes** stay face-up and active indefinitely. **Non-ongoing schemes** are turned face-down and placed at the bottom of the scheme deck after their triggered ability has left the stack (SBA 314.6).

## 4.3 Engine Connections

- Scheme cards are non-permanents in the command zone (rule 314)
- Scheme static and triggered abilities function while face-up (314.4)
- The controller of a scheme is its owner — the Archenemy (314.5)
- "This scheme" in ability text refers to the scheme card in the command zone that is the source (314.7 — exception to 109.2)

---

# 5. CONSPIRACY DRAFT (Rule 905)

## 5.1 What Conspiracy Draft Adds

A draft format where players add conspiracy cards to their decks before play begins. Conspiracy cards go face-up or face-down in the command zone before the game starts.

## 5.2 Conspiracy Card Mechanics

- Conspiracy cards may be placed face-down (hidden agenda — 702.106)
- Face-down conspiracy cards have no characteristics (315.5b)
- Players may look at their own face-down conspiracy cards but not opponents' (315.7)
- Conspiracy abilities can affect the start-of-game procedure (315.5a)
- Turning a face-down conspiracy face-up is a special action (116.2j)

## 5.3 Engine Connections

- Conspiracy cards are non-permanents in the command zone (rule 315)
- They cannot be cast, targeted, or otherwise interacted with during the game through normal means
- Their static and triggered abilities function when face-up (315.5)

---

# 6. INTERACTION WITH COMMANDER

These variants are rarely combined with Commander. If combined:

| Variant | Commander Interaction |
|---|---|
| Planechase | Legal "Planechase Commander" — planar deck added, 40-life still applies |
| Vanguard | Rarely used with Commander; life modifiers stack if used |
| Archenemy | "Archenemy Commander" — one player has commander + scheme deck |
| Conspiracy Draft | Not combined with Commander |

For any hybrid format, the base Commander rules (rule 903) apply first, and the variant rules are layered on top per rule 900.

---

FEEDS INTO: L00_Orchestration_game_engine.md (variant rules layer on top of base rules)
