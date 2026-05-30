# Magic: The Gathering — Counters and Stickers Expansion
## LAYER 7: OBJECT MODEL LAYER — Expansion (Rules 122–123)
## Effective February 27, 2026

---

SOURCES: L07_ObjectModel_122to123_v.md, L10_Variant_724to730_t.md
FEEDS INTO: L05_StateEnforcement_704_t.md (counter SBAs), L03_Event_614to616_t.md (shield/stun/finality replacement effects), L04_Trigger_engine.md (Nth counter trigger), L00_Orchestration_game_engine.md

---

# 1. COUNTERS — FOUNDATIONS (122.1)

Counters are markers, not objects. They have no characteristics, cannot be targeted, cannot trigger independently. They modify the object they're on or create specific rule interactions.

**Critical distinction:** A counter is not a token. A token is not a counter. They are completely separate game concepts (122.1).

## 1.1 Counter Types with Built-In Rules Effects

| Counter type | Built-in effect | Rule |
|---|---|---|
| +1/+1 | +1 power, +1 toughness | 122.1a, 613.4c |
| -1/-1 | -1 power, -1 toughness | 122.1a, 613.4c |
| Keyword counter | Object gains that keyword | 122.1b, 613.1f |
| Shield counter(s) | Replacement + prevention vs. destruction and damage | 122.1c |
| Stun counter(s) | Replacement vs. untapping | 122.1d |
| Loyalty counter | Defines planeswalker loyalty | 122.1e |
| Defense counter | Defines battle defense | 122.1g |
| Finality counter(s) | Replacement vs. graveyard (exile instead) | 122.1h |
| Poison counter (player) | 10+ → lose game (SBA) | 122.1f |
| Rad counter (player) | Trigger at precombat main phase start | 122.1i |

## 1.2 Shield and Stun Counters — Multiple Counters, One Effect

Rules 122.1c and 122.1d specify that **one or more** shield/stun counters create a **single** replacement/prevention effect. Multiple counters don't create multiple separate effects — they create one effect, and when it triggers, one counter is removed. This matters for layering and for counting how many protections remain.

## 1.3 +1/+1 and -1/-1 Annihilation SBA (122.3)

If a permanent has both +1/+1 and -1/-1 counters, the game removes N of each type simultaneously as a state-based action (where N is the smaller count). This happens before anything else. The result is that these opposing counters can never coexist — one type is always completely eliminated.

**Engine consequence:** After any event that places both types of counter on a permanent, the SBA check triggers immediately. The permanent will never have both types simultaneously after an SBA pass.

---

# 2. COUNTERS AND ZONE CHANGES (122.2)

Counters do not survive zone changes. When an object moves from one zone to another, its counters "cease to exist" — they are not removed (no "counter removed" triggers fire), they simply stop existing. This is a consequence of rule 400.7 (new object rule).

**Key adjudication:** "When a counter is removed from [permanent]" triggers do not fire when a permanent leaves the battlefield. The counter is not removed — it ceases to exist as part of the zone change.

## 2.1 ETB Counter Placement (122.6a)

When an effect gives an object counters as it enters the battlefield, and the effect specifies a player to put them on, that player does so. If no player is specified, the object's controller puts them on.

---

# 3. THE NTH COUNTER TRIGGER (122.7)

An ability reading "Whenever the Nth [kind] counter is put on [object]" triggers when:
- Counters of that kind are placed on the object
- The object had fewer than N of that kind before placement
- The object has N or more of that kind after placement

This correctly handles multiple counters placed simultaneously — if 3 counters are placed and the threshold goes from below N to above N, it triggers once.

---

# 4. MOVING COUNTERS (122.5, 122.8, 122.9)

"Move a counter" = remove from one object + put on another. If either step is impossible, the move fails entirely — no counter is removed and none is placed.

Rules 122.8 and 122.9 handle special cases where counters would logically "move" but the source no longer exists:
- **122.8:** Triggered ability that says "put that object's counters on [this object]" when the trigger fires because the object left the battlefield — instead of moving, put the same **number** of each counter type on the target
- **122.9:** Same principle for activated abilities where paying the cost destroys the source

---

# 5. STICKERS — OVERVIEW (123)

Stickers are Unfinity-specific physical markers. Key engine facts:
- Not objects, not counters, not tokens
- Changes from stickers are **not copiable values** (123.1) — critical for copy effects
- Four kinds: name, ability, power/toughness, art

## 5.1 Zone Retention (123.5)

Stickers are lost moving to **hidden** zones (library, hand). Stickers are **retained** moving to **public** zones — this is an exception to rule 400.7. The sticker follows the new object the card becomes in the new zone.

## 5.2 Name Stickers (123.6)

Add a word to the object's name at a chosen position. The position is remembered across public zone changes. Name sticker effects are text-changing effects (rule 613.1c) and interact with timestamp ordering against other text-changing effects.

## 5.3 Ability Stickers (123.7)

Grant abilities just like an effect that says "gains [ability]." These are layer 6 ability-granting effects (613.1f).

## 5.4 P/T Stickers (123.8)

Set power and toughness — a layer 7b effect (613.4b). If multiple P/T stickers apply, timestamp order determines precedence.

---

# 6. CROSS-LAYER CONNECTIONS

**→ Layer 5 (SBAs):**
- +1/+1 / -1/-1 annihilation (122.3) → 704.5q
- Planeswalker at 0 loyalty (122.1e) → 704.5i
- Battle at 0 defense (122.1g) → 704.5sa
- Player at 10+ poison (122.1f) → 704.5c

**→ Layer 3 (Replacement Effects):**
- Shield counters create replacement + prevention effects (122.1c) → handled under rule 614/615
- Stun counters create untap replacement (122.1d) → 614
- Finality counters create graveyard replacement (122.1h) → 614

**→ Layer 8 (Continuous Effects):**
- +1/+1 counters modify P/T at layer 7c (613.4c)
- Keyword counters grant abilities at layer 6 (613.1f)
- P/T stickers set P/T at layer 7b (613.4b)
- Ability stickers grant abilities at layer 6 (613.1f)
- Name stickers are text-changing effects at layer 3 (613.1c)

---

FEEDS INTO: L05_StateEnforcement_704_t.md (counter-related SBAs), L03_Event_614to616_t.md (shield/stun/finality replacement effects), L04_Trigger_engine.md (Nth counter trigger, 122.7), L08_ContinuousEffects (counter effects in layer system)
