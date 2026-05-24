# Magic: The Gathering — Card Types Expansion
## LAYER 7: OBJECT MODEL LAYER — Expansion (Rules 300–315)
## Effective February 27, 2026

---

SOURCES: L06_PlayerAction_600to606_t.md, L06_PlayerAction_701_v.md, L07_ObjectModel_300to315_v.md
FEEDS INTO: L05_StateEnforcement_704_t.md (type-specific SBAs), L03_Event_614to616_t.md (type-specific replacement effects), L04_Trigger_engine.md (type-based trigger conditions), L00_Orchestration_game_engine.md

---

# 1. THE TYPE SYSTEM — FOUNDATIONS

## 1.1 Complete Type List (300.1)

Artifact, battle, conspiracy, creature, dungeon, enchantment, instant, kindred, land, phenomenon, plane, planeswalker, scheme, sorcery, vanguard.

**Permanent types** (can be on the battlefield): artifact, battle, creature, enchantment, land, planeswalker.

**Non-permanent types** (cannot be on the battlefield): instant, sorcery, dungeon, conspiracy, phenomenon, plane, scheme, vanguard.

## 1.2 Multi-Type Objects (300.2)

An object with multiple types is subject to all rules for each type. Two constraints:
- Land + other type: can only be **played** as a land, never cast (300.2a)
- Kindred always has another type; casting/resolution follows that other type (300.2b)

## 1.3 Casting Timing by Type

| Type | Timing |
|---|---|
| Artifact, Battle, Creature, Enchantment, Planeswalker, Sorcery | Sorcery speed: main phase, stack empty, own turn |
| Instant | Any time with priority |
| Land | Special action — not cast; main phase, stack empty, own turn |

---

# 2. PERMANENT TYPES

## 2.1 Artifacts (301)

Colorless by default, but can have colors. No type-specific characteristics.

**Equipment (301.5):** Attaches to creatures. Key rules:
- Enters unattached; equip ability attaches it
- Only the Equipment's controller can activate equip — regardless of who controls the creature
- Illegal Equipment (attached to non-creature, no legal target) becomes unattached as SBA
- Cannot equip itself; cannot equip more than one creature simultaneously
- If an Equipment also has reconfigure (702.151), it may equip as a creature

**Fortification (301.6):** Equipment analog for lands. Rules 301.5a–f apply.

**Vehicle (301.7):** Has printed P/T — active only when it's also a creature (typically via crew). P/T values apply immediately when crew resolves.

## 2.2 Creatures (302)

**Summoning sickness (302.6):** Cannot attack or use {T}/{Q} abilities unless continuously under controller's control since the start of their most recent turn. Haste bypasses. Mid-turn control change means the creature must wait until the new controller's next turn.

**Damage marking (302.7):** Non-wither/non-infect damage is marked. If total marked damage ≥ toughness at SBA check → lethal → destroyed. Marked damage clears at cleanup and on regeneration.

## 2.3 Enchantments (303)

**Auras (303.4) — adjudication-critical rules:**
- Aura spell requires target defined by enchant ability (303.4a)
- Aura entering by non-spell means chooses enchanted object/player as it enters (303.4f)
- No legal enchant target: remains in current zone; if on stack → graveyard (303.4g, 303.4i)
- Illegal enchantment SBA: Aura enchanting illegal object → owner's graveyard (303.4c)
- Aura cannot enchant itself; cannot enchant more than one object; Aura-creature cannot enchant anything (303.4d)
- Controller of Aura ≠ controller of enchanted object. Each independently controls their respective object. Abilities granted to enchanted object can only be activated by enchanted object's controller (303.4e)

**Role (303.7):** If a permanent has multiple Roles controlled by the same player, all but the most recently timestamped go to graveyard. This is an SBA (704).

## 2.4 Planeswalkers (306)

Loyalty starts at printed value via intrinsic replacement effect (306.5b). Damage removes loyalty counters equal to damage dealt (306.8). Loyalty reaching 0 → graveyard (SBA). Legend rule applies (legendary supertype via errata). Can be attacked.

## 2.5 Battles (310)

Defense starts at printed value via intrinsic replacement effect (310.4b). Damage removes defense counters (310.6). Defense reaching 0 → graveyard (SBA, 310.7). Each battle has a designated protector who defends it and may block attackers.

**Siege (310.11):** Only existing battle subtype. Protector must be an opponent. When last defense counter removed: intrinsic triggered ability exiles it, then controller may cast it transformed for free (310.11b).

---

# 3. NON-PERMANENT TYPES

## 3.1 Instants and Sorceries (304, 307)

Cannot enter the battlefield — if they would, they remain in previous zone.

"Any time you could cast an instant" / "only as a sorcery": only requires appropriate priority and timing. No actual spell of that type needed. Restrictions on casting those spell types don't affect non-casting actions using these phrases.

## 3.2 Lands (305)

**Play vs. cast:** Land play is special action (116.2a) — not a spell. Cannot be countered. Cannot be responded to before it enters.

**Play limit:** One per turn by default. Compare "lands playable" to "lands played." Effects can increase playable count. Cannot play a land on an opponent's turn (305.3).

**"Putting" a land ≠ "playing" a land (305.4):** "Put" effects bypass the once-per-turn limit.

**Intrinsic mana abilities (305.6):** Basic land type → corresponding mana ability intrinsically, even without printed text.

**Subtype replacement (305.7):** Setting land subtype to basic land type(s) removes old types, rules text from those types, copiable effects — then grants new mana ability. External non-copy effects are preserved. Card type and supertype unaffected.

---

# 4. COMMAND ZONE TYPES (311–315)

All share: remain in command zone, not permanents, cannot be cast, cannot leave command zone.

| Type | Variant | Key rule |
|---|---|---|
| Plane | Planechase | Chaos abilities; planar controller (usually active player) |
| Phenomenon | Planechase | Triggers on encounter; planarwalk SBA when face-up and trigger resolved (312.7) |
| Vanguard | Vanguard | Hand modifier + life modifier applied at game start |
| Scheme | Archenemy | Set in motion during archenemy's precombat main phase |
| Conspiracy | Conspiracy Draft | Hidden agenda; start-of-game procedure effects |

**Dungeons (309):** Begin outside the game. Enter command zone via venture into the dungeon. Traverse rooms triggering room abilities. Removed from game when bottommost room is reached (309.5b, 309.6). One dungeon per player in command zone at a time.

---

# 5. TYPE-BASED SBA REFERENCE (→ Layer 5)

| Condition | SBA |
|---|---|
| Creature: marked damage ≥ toughness | Destroy |
| Creature: toughness ≤ 0 | Destroy |
| Creature: deathtouch damage | Destroy |
| Aura: enchanting illegal object | → owner's graveyard |
| Equipment: attached to non-creature | Unattach |
| Fortification: attached to non-land | Unattach |
| Planeswalker: loyalty = 0 | → owner's graveyard |
| Battle: defense = 0, no triggered ability pending | → owner's graveyard |
| Legend rule: two legendary permanents with same name | Controller chooses one to keep |
| Role duplicates (same controller, same host) | All but newest timestamp → graveyard |
| Copy-of-spell: not on stack or battlefield | Cease to exist |
| Token: in non-battlefield zone | Cease to exist |

---

FEEDS INTO: L05_StateEnforcement_704_t.md (all type-specific SBAs above), L03_Event_614to616_t.md (Aura ETB targeting, planeswalker/battle counter replacement effects), L04_Trigger_engine.md (type-based trigger condition matching), L06_PlayerAction_601_seg2_t.md (casting legality by type)
