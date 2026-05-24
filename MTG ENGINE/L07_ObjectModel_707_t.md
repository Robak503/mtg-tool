# Magic: The Gathering — Copying Objects Expansion
## LAYER 7: OBJECT MODEL LAYER — Expansion (Rule 707)
## Effective February 27, 2026

---

SOURCES: L03_Event_614to616_t.md, L07_ObjectModel_200to213_t.md, L07_ObjectModel_607_t.md, L07_ObjectModel_700_t.md, L07_ObjectModel_707_v.md, L07_ObjectModel_708to712_t.md, L07_ObjectModel_729_t.md, L08_ContinuousEffects_611to613_t.md
FEEDS INTO: L03_Event_614to616_t.md (copy replacement effects on ETB), L04_Trigger_engine.md (ETB triggers on copies, source tracking), L05_StateEnforcement_704_t.md (copy token SBAs), L00_Orchestration_game_engine.md

---

# 1. THE COPIABLE VALUES DEFINITION

## 1.1 What Gets Copied (707.2)

When an object is copied, the copy acquires only the **copiable values** of the original. This is a precise, closed set:

| Copiable | Not copiable |
|---|---|
| Name | Counters |
| Mana cost | Status (tapped, flipped, face-down, phased) |
| Color indicator | Stickers |
| Card type, subtype, supertype | Type-changing continuous effects |
| Rules text | Text-changing continuous effects |
| Power and toughness (printed) | Other non-copy continuous effects |
| Loyalty | "As [this] enters" choices made for the original |
| Defense | Equipment/Aura attachments |
| Results of other copy effects applied to the original | Damage marked on it |
| Face-down status (affects what characteristics exist) | |
| "As enters" and "as turned face up" ability results that set P/T | |

**The defining rule (707.2):** "Other effects (including type-changing and text-changing effects), status, counters, and stickers are not copied."

If a creature has been given +2/+2 by an effect and has a +1/+1 counter, a copy of that creature gets neither. The copy starts from printed characteristics, then stacks other copy effects and face-down status — nothing more.

## 1.2 Cascading Copy Effects

Copy effects stack (707.2, 707.3). If A copies B which copied C, A's copiable values include all modifications that B accumulated from the copy-of-C effect. Objects that copy A see those stacked values.

Once copied, changing the original's copiable values does **not** update the copy (707.2b). Copy snapshots are fixed at the moment the copy is made.

If a **static ability** generates an ongoing copy effect (707.2c), the copiable values are fixed when the effect first applies.

---

# 2. ENTERING AS A COPY vs. BECOMING A COPY IN PLAY

## 2.1 Entering the Battlefield as a Copy (707.5)

An object that enters "as a copy" becomes the copy **as it enters** — not after. This means:

- ETB replacement effects from the copied text apply ("enters with X counters on it," "enters tapped")
- ETB triggered abilities on the copy trigger normally
- The copy's controller makes fresh "as [this] enters" choices — the original's choices are not inherited (707.6)

**L3 engine consequence:** A Clone entering as a copy of a creature with "This permanent enters with three +1/+1 counters on it" gets those counters — because that ETB replacement effect is part of the copiable text and applies during the entry event (rule 614.1c, 707.5).

## 2.2 Becoming a Copy While on the Battlefield (707.4)

When a permanent already on the battlefield becomes a copy of something else:
- No ETB triggers fire — the permanent didn't enter
- No LTB triggers fire — the permanent didn't leave
- Non-copy continuous effects currently applying to the permanent survive the transition
- The permanent receives a new timestamp

The permanent's status (tapped, untapped, etc.) is also unchanged — it carries through the copy transition.

---

# 3. COPYING SPELLS AND ABILITIES (707.10)

## 3.1 A Copy of a Spell Is Not Cast

Copying a spell puts the copy **directly onto the stack** without casting it. Therefore:
- "When a spell is cast" triggers do **not** fire for the copy
- The copy is not subject to casting restrictions (flash, sorcery timing)
- The copy inherits all decisions made during casting: modes, targets, X values, kicker/buyback choices
- Choices made **on resolution** (not during casting) are not copied

## 3.2 Mana References in Copies

If the copy's effect references mana spent to cast it, it uses mana spent on the **original** spell (707.10). Mana isn't an object — it cannot be transferred to the copy. The copy checks what mana was actually spent when the original was cast.

## 3.3 Choosing New Targets (707.10c)

When an effect allows "choose new targets" for a copy:
- Unchanged targets stay as-is, even if now illegal
- Changed targets must be legal at time of choice
- The copy goes onto the stack with the finalized targets

## 3.4 Copy a Spell vs. Cast a Copy (707.10 vs. 707.12)

| Property | Copy a spell (707.10) | Cast a copy (707.12) |
|---|---|---|
| How created | Placed directly on stack | Created in origin zone, then cast |
| Follows 601.2? | No | Yes (601.2a–h) |
| "When cast" triggers? | No | Yes |
| Can be countered? | Yes | Yes |
| Owner | Player who put it on stack | Player instructed to create/cast it |

## 3.5 Permanent Spell Copies Become Tokens (707.10f)

A copy of a permanent spell resolves as a token permanent with the spell's copiable values. That token is subject to rule 111.7 — it ceases to exist if it leaves the battlefield.

---

# 4. COPY EFFECT EXCEPTIONS (707.9)

## 4.1 Added Abilities Become Copiable (707.9a)

If a copy effect adds an ability ("except it has [ability]"), that ability becomes part of the copy's copiable values. Subsequent copies of the copy inherit that added ability.

## 4.2 Modified Characteristics Become Copiable (707.9b)

If a copy effect modifies a characteristic ("except it's an enchantment in addition to its other types"), the modified value becomes the copiable value for subsequent copies.

## 4.3 CDA Suppression (707.9d)

When a copy effect excludes a characteristic or provides a specific value for it, any **characteristic-defining ability (CDA)** that defines that characteristic is not copied. This prevents the CDA from overriding the specific value the copy effect is intentionally setting.

**Exception:** Copy effects that add a type/subtype/supertype "in addition to its other types" do copy CDAs that define those types — because the exception is additive, not replacing.

## 4.4 Conditional Exceptions (707.9f)

To evaluate a conditional exception ("if it's a creature, it enters with +1/+1 counters"), determine what the object's characteristics would be *without* that exception, applying all other components of the copy effect. If the result satisfies the condition, the exception applies.

---

# 5. DOUBLE-FACED CARDS AND COPIES (707.8, 707.8a, 707.10g)

Copying a DFC uses the copiable values of the **currently-face-up side** (707.8). The copy is not itself double-faced unless rule 707.8a applies.

**707.8a** creates a double-faced token when an effect creates a token as a copy of a DFC. That token has both faces. If the original has its back face up, the token enters with its back face up.

**707.10g** applies to copies of permanent spells: if the spell is a DFC with its back face up, the copy is created with its back face up, and resolves as a double-faced token.

---

# 6. LINKED ABILITIES IN COPIES (707.7)

When a pair of linked abilities is copied, the copies are linked to each other on the new object — not to any identically worded ability from another source. This scoping rule prevents unintended merging of exile-tracking or damage-tracking between independent ability instances.

**L7 engine connection to 607:** The linked-abilities rule preserves the integrity of the per-object linking regardless of copy history.

---

# 7. NAME TRACKING (707.11)

If a continuous effect references a permanent by name ("put a +1/+1 counter on [Card Name]"), it tracks that **specific object** — not any object currently bearing that name. The effect continues to apply even if:
- The permanent changes its name via a copy effect
- The permanent becomes a copy of a differently-named object

---

# 8. ADJUDICATION QUICK REFERENCE

## 8.1 Copy Does NOT Inherit

- Damage marked on original
- Counters on original
- Status of original (tapped/untapped carries through copy-while-in-play; fresh on ETB-as-copy)
- Enchantments/Equipment attached to original
- Original's "as enters" choices (controller makes new choices)
- Non-copy continuous effects modifying original's characteristics

## 8.2 Copy DOES Inherit

- All printed text (name, mana cost, color indicator, type line, rules text, P/T, loyalty, defense)
- Results of all prior copy effects stacked on the original
- For stack objects: modes, targets, X values, kicker/buyback decisions from casting

## 8.3 ETB Trigger Source

When a copy enters the battlefield, its ETB triggered abilities have the copy as their source — not the original. If the copy leaves the battlefield before the triggered ability resolves, LKI applies to the copy's last known characteristics, not the original's.

---

FEEDS INTO: L03_Event_614to616_t.md (ETB replacement effects apply to copy-on-entry), L04_Trigger_engine.md (trigger source is copy object; LKI on copy after zone change), L05_StateEnforcement_704_t.md (copy-token ceasing to exist in non-battlefield zones)
