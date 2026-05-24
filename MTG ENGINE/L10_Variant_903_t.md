# Magic: The Gathering — Commander: Engine Expansion
## LAYER 10: VARIANT LAYER — Expansion (Rule 903)
## Effective February 27, 2026

---

SOURCES: L03_Event_614to616_t.md, L07_ObjectModel_708to712_t.md, L09_Constraint_100to104_t.md, L09_Constraint_100to104_v.md, L09_Constraint_t.md, L10_Variant_800to811_t.md, L10_Variant_800to811_v.md, L10_Variant_903_v.md
FEEDS INTO: L05_StateEnforcement_704_t.md (commander damage SBA), L06_PlayerAction_601_seg1_t.md (commander tax as additional cost), L00_Orchestration_game_engine.md

**PRIMARY FORMAT:** Commander (4-player Free-for-All) is the primary target of this codex. All engine files should be read with this context. Where core rules say "opponent" in a 2-player context, in Commander that means "any of your three opponents."

---

# 1. COMMANDER FORMAT OVERVIEW

Commander adds the following to the base rules:
- Each deck has a designated legendary creature (the commander) that begins in the command zone
- Starting life total: **40** (not 20)
- Deck construction: 100 cards singleton (except basic lands), color identity restriction
- Commander returns to command zone as a zone-replacement option
- Commander tax: {+2} to cast for each previous cast from command zone
- Commander damage: 21 or more combat damage from a single commander = lose the game (SBA)
- Default setup: Free-for-All variant, Attack Multiple Players option

The base rules (all L0–L9 files) apply in full. Rule 903 adds to and modifies specific base rules. Where there is a conflict, rule 903 takes precedence.

---

# 2. THE COMMANDER DESIGNATION (903.3)

A commander designation is an attribute of the **card itself**, not the object. This means:

- A commander that is face-down (via Ixidron, morph) is still a commander
- A commander that is copying another card (via Cytoshape) is still a commander
- A permanent copying a commander (e.g., Body Double copying a commander in a graveyard) is **not** a commander

**Commander vs. being a commander:** The designation follows the card through all zones. The current object in any zone that represents that card is the commander.

## 2.1 Commander and Zone References (903.3d–e)

- "Controlling a commander" → permanent on the battlefield with the commander designation
- "Casting a commander" → spell on the stack with the commander designation
- "A commander in [zone]" → card in that zone with the commander designation
- "Characteristics of your commander" → found in any zone, using current characteristics (including continuous effects)

## 2.2 Melded and Merged Commanders (903.3b–c)

If a commander is melded with its partner card, the resulting melded permanent is the commander. If a commander is a component of a merged permanent (via mutate, etc.), the merged permanent is the commander.

---

# 3. COLOR IDENTITY (903.4)

Color identity is determined **before the game begins** and does not change during the game.

**What counts toward color identity:**
- Mana symbols in the mana cost
- Mana symbols in the rules text (including activated ability costs, reminder text is excluded per 903.4c)
- Colors defined by CDAs (rule 604.3)
- Color indicator (rule 204)
- Both faces of a DFC (903.4d — exception to rule 712.8a)
- Alternative characteristics such as Adventure spells (903.4e)

**Deck construction constraint:** Every card in the deck must have a color identity that is a subset of the commander's color identity. A colorless card has no colors in its identity and is always legal.

**Color identity in-game:** If an effect references the colors or count of colors in a commander's color identity, and that player has no commander, the result is undefined — the ability does nothing with that part, and costs referencing it are unpayable (903.4f).

---

# 4. STARTING THE GAME (903.6–903.7)

1. Each player places their commander face-up in the command zone
2. Players shuffle their remaining 99 cards into their library
3. Starting player is determined (standard rules)
4. Each player sets life total to **40**
5. Each player draws 7 cards
6. Mulligan proceeds per normal rules (London mulligan)

---

# 5. CASTING FROM THE COMMAND ZONE (903.8)

A player may cast their commander from the command zone as though it were in their hand, following all normal casting rules (rule 601). The commander tax applies:

**Commander tax = {+2} for each previous cast from the command zone this game**

- First cast from command zone: no tax (normal mana cost)
- Second cast from command zone: {+2} additional
- Third cast: {+4} additional
- And so on

**The tax is an additional cost** (rule 118.9), added to the total cost at 601.2f. It cannot be reduced below {0} by cost reducers, but cost reducers apply normally to the mana component of the total cost.

**The tax tracks casts from the command zone specifically.** If a commander is cast from the hand or graveyard via another effect, that casting does not increment the tax count and does not cost the tax.

---

# 6. THE COMMAND ZONE REPLACEMENT EFFECTS (903.9)

A commander has two ways to return to the command zone:

## 6.1 Graveyard/Exile → Command Zone (903.9a) — SBA

If a commander is in a graveyard or exile **and was put there since the last time SBAs were checked**, its owner may put it into the command zone. This is a **state-based action** — it happens at the SBA check, not immediately when the commander would move zones.

**Sequence:**
1. Commander would go to graveyard or exile
2. Commander arrives in graveyard or exile
3. SBA check fires
4. Owner may choose: leave it in graveyard/exile OR move to command zone

## 6.2 Hand/Library → Command Zone (903.9b) — Replacement Effect

If a commander would be put into its owner's hand or library from anywhere, its owner **may** replace that event with putting it into the command zone instead. This is a **replacement effect** (exception to rule 614.5 — it may apply more than once to the same event).

**Key distinction from 903.9a:**
- 903.9a (graveyard/exile): the commander actually arrives in the zone first, then an SBA offers the choice
- 903.9b (hand/library): the move is **replaced** before it happens — the commander never actually reaches the hand/library

**Why this matters for adjudication:**
- If a commander is destroyed (goes to graveyard): arrive in graveyard → SBA → may move to command zone. Any "when [commander] dies" triggers have already fired.
- If a commander would be put into its owner's hand by an effect: the replacement effect intercepts the move. The commander goes directly to the command zone. The hand-put never happens. No "card entered hand" triggers fire.

---

# 7. COMMANDER DAMAGE (903.10a)

**A player who has been dealt 21 or more combat damage by the same commander over the course of the game loses the game.**

This is a **state-based action** (704.6c). Key properties:

- Tracks cumulative combat damage by a single commander, not total per turn
- Resets: **never** — the counter persists for the entire game
- Damage must be **combat damage** specifically. Non-combat damage from the commander (e.g., ability damage) does not count
- The commander designation must be active when the damage is dealt. If a permanent deals damage and is then later designated as a commander, that previous damage doesn't count retroactively
- Tracking is per commander, not per player. If a commander changes controllers, damage dealt while under each controller is combined toward the same 21-damage threshold against each victim
- If a commander is replaced by a copy (e.g., clone targeting a commander), the clone is not a commander, so its damage doesn't count

**Brawl exception (903.12h):** The 21-damage SBA does not apply in Brawl games.

---

# 8. MULTIPLAYER CONTEXT — 4-PLAYER FREE-FOR-ALL

Commander uses the Free-for-All variant (rule 806) with the Attack Multiple Players option (rule 802) by default.

## 8.1 APNAP in 4-Player Commander

Active Player Non-Active Player (APNAP) order determines:
- Who puts simultaneous triggered abilities on the stack (active player first, then clockwise)
- Who makes choices when multiple players must make choices simultaneously
- The order priority passes after a spell resolves

In 4-player Commander: active player → next player clockwise → next → last player clockwise.

## 8.2 "Opponent" in 4-Player Commander

When the base rules say "opponent" or "an opponent," in Commander that means **any one of your three opponents** (unless context makes it unambiguous). When a card says "each opponent" or "all opponents," it means all three.

**Cards that say "target opponent"** target exactly one opponent of your choice. Cards that say "each opponent" affect all three simultaneously.

## 8.3 Priority in 4-Player Commander

Priority passes clockwise after the active player passes. After a spell resolves, priority returns to the active player (not to whoever cast the spell if it was cast by a non-active player). After a non-active player resolves a spell, priority goes back to the active player, who may then pass it clockwise.

## 8.4 Players Leaving the Game (Rule 800.4)

When a player leaves the game in Commander:
- All permanents, spells, and abilities that player owns leave the game
- All effects that said "you" referring to that player end if they were owned by or applied only to that player
- Any "until [that player's] next turn" effects expire
- Tokens that player controlled but doesn't own go to the appropriate zone (usually exile or the owner's control)
- Objects that player owns in other zones (hand, library, graveyard, exile) are removed from the game

## 8.5 Attacking in 4-Player Commander

Under the Attack Multiple Players option (rule 802), a player declares which opponent each creature attacks during the declare attackers step. Multiple attackers may attack multiple different opponents in the same combat. Blockers are declared by each defending player for creatures attacking them.

---

# 9. COMMANDER-SPECIFIC SBA REFERENCE

| SBA | Rule | Condition | Result |
|---|---|---|---|
| Commander in graveyard/exile | 903.9a | Commander in GY/exile since last SBA check | Owner may move to command zone |
| Commander damage | 704.6c | Player dealt 21+ combat damage by one commander | That player loses |

The 903.9a command-zone option is also an SBA. It is checked at the same time as all other SBAs.

---

# 10. COMMANDER TAX — ADJUDICATION PRECISION

The tax applies only when casting from the **command zone**. Count carefully:

| Previous casts from command zone | Tax added |
|---|---|
| 0 | {0} |
| 1 | {+2} |
| 2 | {+4} |
| 3 | {+6} |

The count is "times cast from the command zone" — not "times the commander has been in the command zone." If a commander returns to the command zone without being cast, the count does not change.

Cost reducers (Goblin Electromancer, Trinisphere, etc.) interact with the total cost after tax is added, per the normal cost calculation rules at 601.2f.

---

# 11. PARTNER (702.124)

Some commanders have the Partner keyword, allowing a player to use two commanders simultaneously. Key rules:

- Both commanders start in the command zone
- Both may be cast from the command zone (each has its own tax counter)
- Commander damage tracks each commander separately — 21 from one OR 21 from the other each trigger the loss condition independently
- Color identity of the deck = combined color identity of both commanders
- If one partner goes to the command zone, the other can still be on the battlefield

---

# 12. BRAWL VARIANT NOTE (903.12)

Brawl uses Commander rules with these modifications:
- Standard-legal cards only
- 60-card decks
- Commander may be a planeswalker
- Life totals: 25 (2-player) or 30 (multiplayer)
- No commander damage SBA (903.12h)

---

FEEDS INTO: L05_StateEnforcement_704_t.md (add 704.6c commander damage SBA), L06_PlayerAction_601_seg1_t.md (commander tax as additional cost at 601.2f), L10_Variant_800to811_t.md (Free-for-All variant details), L00_Orchestration_game_engine.md

## EMINENCE — ZONE REQUIREMENT

Eminence abilities are triggered abilities that work while the commander is in the command zone or on the battlefield. The commander must be in one of these two zones both when the trigger event occurs AND when the triggered ability resolves. If the commander changes zones between those two moments, the ability does nothing when it resolves. (Official WotC ruling for all eminence cards.)
