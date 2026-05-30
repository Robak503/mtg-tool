# Magic: The Gathering — Face-Down, Split, Flip, Leveler, DFC: Engine Expansion
## LAYER 7: OBJECT MODEL LAYER — Expansion (Rules 708–712)
## Effective February 27, 2026

---

SOURCES: L07_ObjectModel_708to712_v.md
FEEDS INTO: L07_ObjectModel_707_t.md (copiable values for DFC), L08_ContinuousEffects_611to613_t.md (layer application for DFC), L06_PlayerAction_116_t.md (face-down face-up as special action)

---

# 1. FACE-DOWN SPELLS AND PERMANENTS (Rule 708)

## 1.1 What Face-Down Means

A face-down permanent has no name, no mana cost, no color, no card types, no subtypes, no supertypes, and no abilities — unless a face-down-granting effect specifically provides them. By default face-down permanents are 2/2 colorless creatures with no abilities (as established by the morph rules).

## 1.2 Copiable Values of Face-Down Objects

A face-down object's copiable values are its face-down characteristics (the blank 2/2, not the printed card). Copying a face-down object copies the face-down form, not what the card "really is." (707.2)

## 1.3 Turning Face Up (Special Action — 116.2b)

Turning a face-down permanent face up is a special action (rule 116.2b) — it doesn't use the stack and can't be responded to before it happens. When a permanent turns face up:
- It immediately has all characteristics of its face-up card
- "As [this permanent] turns face up" triggered abilities fire
- Continuous effects that applied because it was face-down cease; continuous effects that apply based on its actual characteristics now apply
- The timestamp of the permanent doesn't change (it didn't leave and re-enter the battlefield)

---

# 2. SPLIT CARDS (Rule 709)

## 2.1 What Split Cards Are

Split cards have two halves, each with its own name, mana cost, and rules text. Only one half is cast at a time (except with fuse — 702.102).

## 2.2 Characteristics of a Split Card

When a split card is **not on the stack:** It has the combined characteristics of both halves — both names, the mana cost of the half that matters for the current context, all types and subtypes from both halves. For color identity (Commander 903.4): both halves count.

When a split card is **on the stack as a spell:** It has only the characteristics of the half being cast (plus any fuse modifications if both halves are cast).

## 2.3 Mana Value of Split Cards

- Not on stack: mana value = sum of both halves' mana values
- On stack casting one half: mana value = that half's mana cost only

---

# 3. FLIP CARDS (Rule 710)

Flip cards have a top half (normal orientation) and a bottom half (upside down). They enter as the top half. Some effects cause them to flip, at which point they have only the bottom half's characteristics. Flipping is not a zone change — no ETB/LTB triggers.

---

# 4. LEVELER CARDS (Rule 711)

Levelers have level symbols in their text box that define different power/toughness and abilities at different level counter thresholds. The level symbols are static abilities (implemented as CDAs at layer 7b for P/T). The characteristics apply based on how many level counters are currently on the permanent.

---

# 5. DOUBLE-FACED CARDS (Rule 712)

## 5.1 The Two-Face Model

A DFC has a front face and a back face. In most zones, only the front face is relevant. On the battlefield, the face that is "up" determines the card's characteristics. Transformation switches which face is up.

## 5.2 Characteristics of a DFC

**Not on the battlefield:** Only the front face's characteristics exist (except for color identity — 903.4d includes both faces).

**On the battlefield, front face up:** Has front face characteristics only.

**On the battlefield, back face up:** Has back face characteristics only. The back face may be a different card type entirely (e.g., a creature that transforms into an enchantment).

## 5.3 Transforming

Transformation is not a zone change. No ETB or LTB triggers fire when a permanent transforms. The permanent simply switches which face is up. Continuous effects that applied to the permanent may change because the characteristics change, but no new timestamp is assigned.

**The back face does not have a mana cost** (in most cases). Its mana value is 0 unless the back face specifically has a mana cost printed.

## 5.4 Copiable Values and DFC (707.8)

Copying a DFC uses the copiable values of the face that is currently up. A copy of a DFC that is face-up on its back face copies the back face's characteristics. The copy may or may not also be a DFC depending on whether 707.8a applies (token copies become DFC tokens).

## 5.5 Daybound and Nightbound (702.145)

Some DFCs transform based on day/night conditions. Day becomes night when the active player casts no spells on their turn; night becomes day when any player casts two or more spells on their turn. Daybound permanents transform to nightbound (back face) when night begins; nightbound permanents transform to daybound (front face) when day begins.

## 5.6 Modal DFCs (MDFCs)

Some DFCs are modal — the player may cast either face. MDFCs don't "transform" — the face cast is the permanent that enters. The other face never matters in play (except for color identity in Commander).

---

# 6. CROSS-LAYER CONNECTIONS

**→ Layer 7 (707 Copying):** Copiable values of face-down, split, and DFC objects are determined by rules 708–712 and feed into the copy framework at 707.2 and 707.8.

**→ Layer 8 (Continuous Effects):** Layer 1 (copy effects) applies first, then layer 3–7 effects. For DFCs, the characteristics available for layers to modify change when transformation occurs.

**→ Layer 6 (116 Special Action):** Turning face-down permanents face up is a special action. Transformation of DFCs is usually a triggered or activated ability effect, not a special action (except morph/manifest which use the special action).

**→ Layer 10 (Commander, 903.4d):** Both faces of a DFC count toward color identity for Commander deck construction.

---

FEEDS INTO: L07_ObjectModel_707_t.md (DFC copiable values), L08_ContinuousEffects_611to613_t.md (layer application when transformation changes characteristics), L10_Variant_903_t.md (both DFC faces in color identity)
