# Magic: The Gathering — Static Abilities: Engine Expansion
## LAYER 8: CONTINUOUS EFFECTS LAYER — Expansion (Rule 604)
## Effective February 27, 2026

---

SOURCES: L08_ContinuousEffects_604_v.md
FEEDS INTO: L08_ContinuousEffects_611to613_t.md (static abilities generate continuous effects), L04_Trigger_engine.md (603.11 static-trigger linking), L00_Orchestration_game_engine.md

---

# 1. WHAT STATIC ABILITIES ARE

Static abilities generate continuous effects as long as:
- The object with the ability is in the correct zone (usually the battlefield)
- Any conditions stated in the ability are met

Static abilities don't go on the stack. They don't resolve. They don't "trigger." They are simply active whenever their conditions are met and inactive otherwise.

**The fundamental distinction from triggered and activated abilities:** There is no event that causes a static ability to "fire" — it is either currently applying or not. If a permanent enters the battlefield with "creatures you control get +1/+1," that effect is active from the moment the permanent is on the battlefield, applies to all your creatures including itself, and stops the moment the permanent leaves.

---

# 2. TYPES OF STATIC ABILITY EFFECTS (604.2)

Static abilities can generate:

| Effect type | Example | Layer |
|---|---|---|
| Characteristic-modifying | "Creatures you control get +1/+1" | Layer 7c |
| Type-changing | "All lands are also artifacts" | Layer 4 |
| Color-changing | "All permanents are red" | Layer 5 |
| Ability-granting | "Creatures you control have flying" | Layer 6 |
| Restriction effects | "Spells can't be countered" | Special |
| Permission effects | "Players may cast spells as though they had flash" | Special |
| Rule-modifying | "Creatures can't attack unless their controller pays {1}" | Special |

---

# 3. CHARACTERISTIC-DEFINING ABILITIES (CDAs) (604.3)

A CDA is a static ability that defines what a characteristic of the object is, rather than modifying it relative to some other value.

**Key properties of CDAs:**
- Evaluated continuously — they re-calculate whenever the game needs to know that characteristic
- Applied in the layer system based on what characteristic they define (usually layer 7b for P/T, layer 4 for type, layer 5 for color)
- Apply in all zones — a creature card in the graveyard still has its CDA active for determining power and toughness of that card

**Recognizing CDAs:** They use "is" rather than "gets" or "gains." "Tarmogoyf's power is equal to..." is a CDA. "This creature gets +1/+1" is not.

---

# 4. STATIC ABILITIES IN HIDDEN ZONES (604.4)

Some static abilities function from zones other than the battlefield:
- **Hand:** Flash works from the hand (though the card isn't a permanent yet, the ability allows casting at instant speed)
- **Graveyard:** Some effects function from the graveyard
- **Exile:** Some effects granted by "cast from exile" mechanics
- **Command zone:** Conspiracy and scheme cards

Unless the ability specifically says it functions in another zone, a static ability only functions while the object is on the battlefield.

---

# 5. STATIC ABILITIES AND TRIGGERED ABILITY PAIRS (604.5, 603.11)

Some static abilities are paired with triggered abilities in the same paragraph. The trigger fires when the static ability causes something to happen. These are **linked** per rule 607.2h — the triggered ability only refers to events caused by the static ability in the same paragraph.

**Classic pattern:** "Enchanted creature gets +2/+2 and has lifelink. Whenever enchanted creature deals combat damage, draw a card." The second ability triggers only from damage dealt by the enchanted creature (due to the static ability of the aura granting lifelink doesn't link to this trigger — it's a separate trigger on combat damage).

---

# 6. "AS LONG AS" CONDITIONS

Many static abilities include conditions: "As long as [condition], [effect]." When the condition is met, the effect applies. When it stops being met, the effect stops.

**Simultaneity:** The condition and effect are evaluated simultaneously at each relevant point. There is no lag between the condition stopping and the effect ending.

**SBA interaction:** If a static ability prevents an SBA from applying (e.g., "indestructible" prevents the lethal damage SBA), but then the ability is lost (e.g., the creature loses all abilities), the SBA is checked again at the next SBA check. The protection doesn't linger after the ability ends.

---

# 7. STATIC ABILITIES ON THE STACK

An object on the stack has the characteristics of the spell it represents. Static abilities on a spell don't generate continuous effects for the game while the spell is on the stack — they will generate effects once the spell resolves and becomes a permanent. Exception: some static abilities explicitly say they apply while the card is being cast (e.g., "you may cast this as though it had flash").

---

# 8. CROSS-LAYER CONNECTIONS

**→ Layer 8 (611–613):** Static abilities are the primary generators of continuous effects. Every static ability that affects a characteristic runs through the layer system.

**→ Layer 4 (Triggers, 603.11):** Static-trigger pairs are linked per 607.2h. The trigger is linked to the static ability and only fires for events the static ability directly causes.

**→ Layer 5 (SBAs, 704):** Static abilities that grant indestructible, protection, or prevent certain SBAs are checked each time SBAs would apply. If the static ability is removed before the SBA check, the protection no longer applies.

**→ Layer 7 (702 Keywords):** Most keyword abilities are static abilities. Flying, trample, hexproof, indestructible — all are static. Their continuous effects enter the layer system at layer 6 (ability presence) and cascade to their actual game-relevant effects.

---

FEEDS INTO: L08_ContinuousEffects_611to613_t.md (static abilities generate the effects that the layer system processes), L04_Trigger_engine.md (603.11 static-trigger pairs), L05_StateEnforcement_704_t.md (static abilities modify SBA checks)
