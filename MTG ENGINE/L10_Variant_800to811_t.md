# Magic: The Gathering — Multiplayer Rules: Engine Expansion
## LAYER 10: VARIANT LAYER — Expansion (Rules 800–811)
## Effective February 27, 2026

---

SOURCES: L10_Variant_800to811_v.md, L10_Variant_903_t.md
FEEDS INTO: L10_Variant_903_t.md (Commander uses Free-for-All + Attack Multiple Players), L06_PlayerAction_117_t.md (priority in multiplayer), L00_Orchestration_game_engine.md

**Commander context:** Standard Commander uses rule 806 (Free-for-All) and rule 802 (Attack Multiple Players). Rules 801, 803–805, 807–811 cover other variants. This file focuses on the rules that apply to Commander.

---

# 1. GENERAL MULTIPLAYER RULES (Rule 800)

## 1.1 Turn Structure in Multiplayer (800.1–800.3)

The turn structure from rule 500–514 applies normally. The active player takes their full turn, then the next player clockwise becomes the active player.

## 1.2 Players Leaving the Game (800.4)

When a player leaves a multiplayer game (by losing, conceding, or being eliminated):

**Permanents they own on the battlefield:** Go to the appropriate zone (usually the battlefield ceases to contain them; tokens they owned cease to exist; non-token permanents go to the graveyard or wherever they'd normally go if their controller left)

**More precisely (800.4a):** If the player controlled permanents that other players own (via control-change effects), those permanents return to those players' control. Then all permanents the leaving player owns are exiled.

**Spells and abilities:** If the leaving player controlled a spell or ability on the stack, it is exiled or otherwise removed. If they controlled a triggered or activated ability, it's removed.

**Effects:** Any effects that said "you" for the leaving player, ongoing effects that apply to them, and "until [that player's] next turn" effects all end.

**In Commander specifically:** A player who loses or concedes is eliminated. Their commander and all their permanents leave. The game continues among remaining players. Commander damage from an eliminated player's commander still counts toward the threshold — the 21 damage is already dealt.

## 1.3 Ending the Game (800.5–800.6)

In a multiplayer game, the game ends when only one player hasn't lost. That player wins. Some formats (team formats) end when all members of one team have lost.

---

# 2. FREE-FOR-ALL VARIANT (Rule 806) — Primary Commander Structure

Commander uses the Free-for-All variant. Key rules:

**806.1:** Each player is an opponent of every other player.

**806.2:** The player seated to the left of the first player goes next, continuing clockwise. (Turn order = clockwise seating order.)

**806.4:** If a rule or effect requires a player to "attack the player to their left" or similar directional instruction, use seating position.

**Relevance to "opponent" wording:** In Free-for-All, "target opponent" targets exactly one of the other players. "Each opponent" affects all others simultaneously.

---

# 3. ATTACK MULTIPLE PLAYERS OPTION (Rule 802) — Commander Default

With this option active (which Commander uses by default):

**802.2:** A player may attack multiple opponents in a single combat phase. When declaring attackers, the player announces which opponent each attacking creature is attacking.

**802.3:** Each defending player declares blockers and assigns damage only for creatures attacking them. Players don't block each other's creatures.

**802.4:** Combat damage is dealt separately for each group of attackers and their blockers. All combat damage is still dealt simultaneously within each pairing.

**Adjudication note:** "The defending player" in combat rules refers to whichever player a specific attacking creature is attacking. Different attacking creatures may have different defending players.

---

# 4. APNAP ORDER IN 4-PLAYER COMMANDER

APNAP (Active Player, Non-Active Players) governs simultaneous decisions and stack ordering.

**In 4-player Commander the order is:**
Active Player → Next player clockwise → Next player clockwise → Last player clockwise

**Where APNAP applies:**
- Triggered abilities entering the stack simultaneously: active player's triggers go on first (bottom), then clockwise — meaning last player's triggers end up on top
- Simultaneous decisions multiple players must make (e.g., choosing modes when each player must choose)
- SBA resolution when multiple players would lose simultaneously (all lose simultaneously — not sequential)

**Priority after stack object resolves:** Returns to the active player, then passes clockwise as each player passes.

---

# 5. PLAYERS LEAVING MID-GAME — COMMANDER SPECIFICS

When a Commander player is eliminated:
1. All permanents they own are exiled (including their commander)
2. All spells and abilities they control are removed from the stack
3. Effects from their permanents end
4. "Until [eliminated player's] next turn" effects expire immediately
5. Commander damage they dealt is already recorded — it doesn't disappear
6. Ongoing triggered abilities that triggered from their permanents but haven't resolved yet are removed

**Multiplayer continuation:** The remaining players continue normally. Turn order skips the eliminated player's seat.

---

# 6. OTHER VARIANTS — BRIEF NOTES

These variants are rarely used in casual Commander but are in the CR:

- **Rule 801 (Limited Range of Influence):** Not used in standard Commander
- **Rule 803 (Attack Left/Right):** Not used in standard Commander
- **Rule 805 (Shared Team Turns):** Two-Headed Giant and team formats
- **Rule 807 (Grand Melee):** Large group variant, not Commander
- **Rule 808 (Team vs. Team):** Not Commander
- **Rule 809 (Emperor):** Not Commander
- **Rule 810 (Two-Headed Giant):** Separate team format with shared life totals
- **Rule 811 (Alternating Teams):** Not Commander

---

FEEDS INTO: L10_Variant_903_t.md (Commander uses 806 + 802), L06_PlayerAction_117_t.md (APNAP in 4-player context)
