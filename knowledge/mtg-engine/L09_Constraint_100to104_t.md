# Magic: The Gathering — General, Golden Rules, Players, Starting, Ending: Engine Expansion
## LAYER 9: CONSTRAINT LAYER — Expansion (Rules 100–104)
## Effective February 27, 2026

---

SOURCES: L09_Constraint_100to104_v.md
FEEDS INTO: L00_Orchestration_game_engine.md, L10_Variant_903_t.md (103 Commander start), L05_StateEnforcement_704_t.md (104 losing)

---

# 1. RULE 100 — GENERAL: THE CR IS AUTHORITATIVE

The Comprehensive Rules govern Magic in all sanctioned play. Card text takes precedence over the CR only where the card specifically overrides a rule (101.1). The CR overrides older card text through Oracle errata.

**"Can't" overrides "can" (101.2):** If one effect says a player can do something and another says they can't, "can't" wins. This is the single most important constraint in the game — it applies across all layers.

**Remaining actions (101.3):** If an effect says to do something impossible, that part of the effect does nothing — it doesn't cause the game to stop or become illegal. Only do what can be done.

**APNAP for simultaneous choices (101.4):** When multiple players must make choices or take actions simultaneously, the active player does so first, then each other player in turn order (clockwise in Commander). Each player must make their choices without changing a previous player's choices.

---

# 2. RULE 101 — THE GOLDEN RULES

## 2.1 Card Text Overrides the CR (101.1)

Specific beats general. A card that says "this creature can't be countered" overrides the general rule that spells can be countered. A card that says "players can't gain life" overrides the general rule that life gain effects work.

The card must **specifically** override the rule — a card that creates an unusual effect isn't "overriding" the CR, it's using the CR's framework for how effects work.

## 2.2 The "Can't" Rule (101.2) — Most Critical Constraint

**If an effect says a player or object CAN do something, and another effect says they CAN'T — "can't" wins unconditionally.**

This is not a layer-system interaction. It is a meta-constraint that applies above all other rules.

Examples:
- "You may cast spells as though they had flash" + "you can't cast spells" → can't cast spells
- "Target creature gains flying" + "creatures can't have flying" (e.g., Vintage Atmosphere) → creature doesn't have flying
- "Draw a card" + "players can't draw cards" → no card is drawn

**Engine consequence:** Before executing any action, check for "can't" constraints. They preempt any permission.

## 2.3 Impossible Instructions (101.3)

If an effect instructs something impossible, that instruction is skipped. The rest of the effect continues normally. No player receives an advantage or penalty from the impossible instruction — it simply doesn't happen.

## 2.4 APNAP (101.4) — Simultaneous Decision Order

**Active Player Non-Active Player order:**
- Active player makes choices/takes actions first
- Then each other player in turn order (clockwise in Commander)
- Each player's decisions are final when made; subsequent players can't force changes

**Where APNAP applies:**
- Simultaneous triggered ability insertion (stack ordering)
- Simultaneous player decisions ("each player chooses...")
- Simultaneous game actions multiple players take

**Exceptions:** Rule 101.4 itself notes that specific rules may override APNAP order. Rule 601.6b (opponent acts after controller during casting) is one such exception.

---

# 3. RULE 102 — PLAYERS

A player is a person participating in the game. In Commander, there are typically four players. "You" in card text refers to the controller of that spell or ability. "Opponent" means any player who isn't you.

Players are eliminated when they lose the game (rule 104). In Commander multiplayer, eliminated players leave and the game continues.

---

# 4. RULE 103 — STARTING THE GAME

## 4.1 Standard Start Sequence

1. Determine format (Commander: 100-card singleton, commanders to command zone)
2. Determine starting player (random; in Commander often determined by group agreement or die roll)
3. **Commander only:** Each player puts commander in command zone, shuffles remaining 99 cards
4. Set starting life totals (Commander: **40 each**)
5. Each player draws opening hand (7 cards)
6. Mulligan decisions (London mulligan: draw 7, keep or put all back and draw 7 again; each mulligan costs one card put to bottom of library)
7. Start of game effects resolve (rule 103.7)
8. Game begins

## 4.2 The London Mulligan (103.4)

Each player may mulligan any number of times. On each mulligan after the first, the player draws 7 and then puts a number of cards on the bottom of their library equal to the number of mulligans taken. A player who has taken 3 mulligans keeps 4 cards.

## 4.3 Start-of-Game Effects (103.7)

Some effects trigger or apply at the start of the game before the first turn begins. These are resolved in APNAP order before the first player takes their turn. In Commander: conspiracy cards, some companion effects, and similar.

## 4.4 Commander Start Modifications (903.6–903.7)

- Commanders placed face-up in command zone before shuffling
- Remaining 99 cards become the library
- Life totals set to 40 (not 20)

---

# 5. RULE 104 — ENDING THE GAME

## 5.1 Losing the Game (104.3)

A player loses the game when any of these occur:
- Life total reaches 0 or less (SBA 704.5a)
- Attempts to draw from empty library (SBA 704.5b)
- 10 or more poison counters (SBA 704.5c)
- A card effect says that player loses (e.g., "you lose the game")
- That player concedes (104.3a — may happen any time the player has priority, or in response to being prompted)

**Commander-specific:** 21 or more combat damage from the same commander (SBA 704.6c).

## 5.2 Winning the Game (104.2)

A player wins when:
- All opponents have lost (last player standing)
- A card effect says that player wins (e.g., "you win the game")

In Commander, the last player who hasn't been eliminated wins.

## 5.3 The Game Is a Draw (104.4)

If all remaining players would lose simultaneously, the game is a draw. In Commander, if two players would be eliminated by the same SBA check (e.g., both at 0 life from the same damage event), they both lose simultaneously — not a draw unless they were the only two remaining players.

## 5.4 Conceding (104.3a)

A player may concede at any time they have priority (or in response to being asked to make a choice). Concession is immediate — the player loses without the SBA check cycle.

## 5.5 Forced Win/Loss Loops

Some effects create situations where a player "wins" and "loses" simultaneously due to multiple replacement effects. Rule 104.5 covers cases where a player would both win and lose at the same time — they lose.

---

# 6. CROSS-LAYER CONNECTIONS

**→ All layers:** The "can't" rule (101.2) is a universal override that sits above the layer system. Before any engine execution, check whether "can't" constraints block the action.

**→ Layer 5 (SBAs):** Losing conditions (104.3) are triggered by SBAs (704.5a–c, 704.6c). The SBA loop in L5 is what detects and executes these.

**→ Layer 10 (Commander, 903):** Rule 103 starting sequence is modified by 903.6–903.7 for Commander (40 life, command zone setup).

**→ Layer 6 (APNAP):** Rule 101.4 APNAP is referenced throughout the casting and priority rules. It governs simultaneous decisions at 601.2c (targets) and trigger ordering at 117.5.

---

FEEDS INTO: L00_Orchestration_game_engine.md (101.2 can't rule, 101.4 APNAP), L05_StateEnforcement_704_t.md (104 loss conditions via SBAs), L10_Variant_903_t.md (103 start modified for Commander)
