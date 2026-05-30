# Magic: The Gathering — Emblems and Targets: Engine Expansion
## LAYER 6: PLAYER ACTION LAYER — Expansion (Rules 114–115)
## Effective February 27, 2026

---

SOURCES: L06_PlayerAction_114to115_v.md
FEEDS INTO: L06_PlayerAction_601_seg1_t.md (601.2c target announcement), L06_PlayerAction_608_t.md (illegal targets at resolution), L04_Trigger_engine.md (targeting triggers)

---

# 1. EMBLEMS (Rule 114)

## 1.1 What an Emblem Is

An emblem is a card-like object that exists only in the command zone. It has no characteristics except the abilities printed on it (which come from the effect that created it). Emblems have no name, no mana cost, no type. They cannot be destroyed, exiled, or countered.

## 1.2 Control of an Emblem

An emblem is controlled by the player who created it. It cannot change control.

## 1.3 Emblem Abilities

Abilities on an emblem function as long as the emblem is in the command zone — which is permanent (it cannot leave). Emblem abilities affect the game exactly as if they were on any other permanent.

---

# 2. TARGETS (Rule 115)

## 2.1 Targeting Is Explicit

An object or player is a target of a spell or ability only if the word "target" appears in the text of that spell or ability and refers to that object or player. Effects that say "choose a creature" without the word "target" are not targeting — protection and hexproof do not apply.

## 2.2 Legal Targets (115.2)

A target must be:
- In the correct zone (typically the battlefield, unless the spell/ability says otherwise)
- The correct type (creature, player, land, etc. as specified)
- Not protected from the spell or ability by hexproof, shroud, protection, or other targeting restrictions
- Not the same as another target chosen for the same instance of the word "target" (115.4)

All these conditions are checked when the target is **chosen** (601.2c) and again when the spell or ability **resolves** (608.2b).

## 2.3 Targeting Restrictions — Summary

| Restriction | Source | Effect |
|---|---|---|
| Hexproof | 702.11 | Can't be targeted by spells/abilities opponents control |
| Shroud | 702.18 | Can't be targeted by any spell or ability |
| Protection | 702.16 | Can't be targeted by sources of protected quality |
| "can't be the target of" | Various | Specific restrictions on card text |
| Targeting self | 115.4 | Same object can't be chosen twice for same "target" instance |

## 2.4 Illegal Targets at Resolution (115.8, 608.2b)

If a target is illegal when the spell or ability resolves:
- **All targets illegal:** The spell or ability is countered. It does nothing.
- **Some targets illegal:** The spell or ability still resolves. It affects only the remaining legal targets. Parts of the effect that require the illegal target are simply not performed.

**Engine consequence:** Check target legality twice — at announcement and at resolution. Do not assume a legal target at announcement remains legal at resolution.

## 2.5 The Same Object as Multiple Targets

If a spell uses the word "target" multiple times independently ("destroy target artifact and target land"), the same object may be chosen for each independent use — an artifact land can be chosen as both the artifact and the land. But the same object cannot be chosen twice for a single use of the word "target" ("destroy two target creatures" requires two different creatures).

## 2.6 Variable Number of Targets (115.3)

If a spell has a variable number of targets, the player announces the number before choosing the targets. Once announced, the number is fixed — even if the basis for the number changes. Choosing zero targets is legal only if the spell says "up to" or "any number of."

## 2.7 Forced Targeting (115.5)

If an effect says an object or player must be chosen as a target, the casting player must maximize compliance with such requirements without violating any "can't be targeted" restrictions. They can't simply ignore a forced targeting instruction.

## 2.8 When-Targeted Triggers (115.9, 601.2c)

"Whenever [object] becomes the target of a spell or ability" triggers when a target is announced in 601.2c. These triggers wait in the waiting state until the spell finishes being cast, then are placed on the stack at 601.2i.

---

# 3. CROSS-LAYER CONNECTIONS

**→ Layer 6 (601.2c):** Targets are chosen in this step. The number of targets is locked in. When-targeted triggers enter the waiting state.

**→ Layer 6 (608.2b):** Target legality is rechecked at resolution. Illegal targets are handled here.

**→ Layer 4 (Triggers, 603):** When-targeted triggers from 601.2c are placed on the stack at 601.2i alongside cast triggers, in APNAP order.

**→ Layer 7 (702 — Protection, Hexproof, Shroud):** The targeting restrictions defined by these keywords are applied during the legality check at 601.2c and 608.2b.

---

FEEDS INTO: L06_PlayerAction_601_seg1_t.md (601.2c target announcement), L06_PlayerAction_608_t.md (illegal targets at resolution, 608.2b), L04_Trigger_engine.md (when-targeted trigger timing)
