# Magic: The Gathering — Casting Spells: The Procedure
## LAYER 6: PLAYER ACTION LAYER — Expansion (Rules 601.1–601.2i)
## Effective February 27, 2026

---

SOURCES: L03_Event_614to616_t.md, L06_PlayerAction_106_t.md, L06_PlayerAction_106_v.md, L06_PlayerAction_114to115_t.md, L06_PlayerAction_114to115_v.md, L06_PlayerAction_118to121_t.md, L06_PlayerAction_118to121_v.md, L06_PlayerAction_600to606_t.md, L06_PlayerAction_600to606_v.md, L06_PlayerAction_601_seg1_v.md, L07_ObjectModel_105_107_t.md, L07_ObjectModel_700_t.md, L07_ObjectModel_700_v.md, L07_ObjectModel_702_t.md, L07_ObjectModel_713to716_t.md, L10_Variant_903_t.md
FEEDS INTO: L06_PlayerAction_601_seg2_t.md, L04_Trigger_engine.md (cast triggers), L00_Orchestration_game_engine.md

---

# 1. THE CASTING PROCEDURE — OVERVIEW

Casting a spell consists of two phases defined in rule 601.2:

**Proposal (601.2a–d):** The spell moves to the stack, mode/cost choices are announced, targets are chosen, division is declared. At the end of this phase, the spell is "proposed."

**Cost determination and payment (601.2f–h):** Total cost is calculated and locked in, mana abilities are activated, costs are paid.

**Legality gate (601.2e):** Between proposal and cost determination. If the proposed spell is illegal after announcement, the game rewinds.

**Completion (601.2i):** After costs are paid, the spell officially becomes cast and cast triggers fire.

```
601.2a  Move to stack, gain characteristics, controller assigned
601.2b  Modes, splice, alt/add costs, X values, hybrid/Phyrexian announced
601.2c  Targets chosen; target-trigger abilities enter waiting state
601.2d  Division announced (if any)
601.2e  ← LEGALITY GATE: game checks the proposed spell
601.2f  Total cost determined and LOCKED IN
601.2g  Mana ability activation window
601.2h  Costs paid (non-random first, then random/library-reveal)
601.2i  ← CAST POINT: spell becomes cast; cast triggers fire; caster gets priority
```

---

# 2. STEP-BY-STEP PRECISION

## 2.1 Step 2a — The Spell Moves to the Stack

The card physically moves from its origin zone (usually hand, but may be graveyard, exile, command zone, or top of library) to the top of the stack. **This is the moment the spell enters the game.** It immediately has all characteristics of the card. Continuous effects that modify its characteristics as it's being cast begin here (rule 611.2f). One-shot effects that grant it abilities as it's cast also apply here (rule 610.5).

**The card is on the stack before anything else happens.** Targeting hasn't been announced. Costs haven't been paid. But it is on the stack as a spell.

## 2.2 Step 2b — Modes, Costs, and Variables

In this order:
1. **Modal choice:** If the spell has modes, choose now. (Rule 700.2)
2. **Splice reveal:** If splicing, reveal the cards from hand now.
3. **Alternative/additional cost announcement:** Declare intent to pay buyback, kicker, overload, etc. A player can't use two alternative costs simultaneously.
4. **X value:** If the spell has {X}, announce X now. If X is defined by a later choice (e.g., "X is the number of creatures you sacrifice"), make that choice now instead.
5. **Hybrid mana:** Announce which non-hybrid equivalent costs you'll pay for each hybrid symbol.
6. **Phyrexian mana:** Announce whether paying 2 life or colored mana for each Phyrexian symbol.

**Critical rule:** All these announcements are made simultaneously in this step. Previous choices (casting with flashback, casting face down via morph) may constrain options.

## 2.3 Step 2c — Targets

The player announces all targets the spell requires. Key rules:

**Target count:** If the spell has a variable number of targets (e.g., "up to X target creatures"), announce the number first, then the targets.

**Once locked:** Once the number of targets is determined, that number is fixed — even if the basis for the number changes later.

**No duplicate targets per instance:** The same target can't be chosen twice for a single use of the word "target." But if "target" appears multiple times independently, the same object can be chosen once per instance.

**Forced targets:** If an effect says an object *must* be targeted, the player must maximize compliance with such effects without violating any "can't be targeted" restrictions.

**When-targeted triggers:** Triggered abilities that fire when an object becomes a target trigger at this point — but they wait in the waiting state until the spell has finished being cast (601.2i completion) before being placed on the stack.

## 2.4 Step 2d — Division

If the spell divides damage, counters, or other quantities among targets, announce the division now. Every target must receive at least 1 unit. The division is locked in here — it cannot be altered after this point.

## 2.5 Step 2e — The Legality Gate

After the full proposal (2a–d), the game checks whether the proposed spell is legal. If illegal, the game rewinds to before the proposal started — the card returns to its previous zone, all announcements are undone, and the player is back to having priority with no spell on the stack.

**This is not an opportunity for players to respond.** It is an automatic check before costs are determined.

## 2.6 Step 2f — Total Cost: Calculation and Lock-In

The total cost is calculated:

```
Total cost = [mana cost or chosen alternative cost]
           + [all additional costs]
           + [all cost increases]
           - [all cost reductions]
```

Rules:
- Multiple cost reductions can be applied in any order the player chooses
- Mana component cannot go below {0}
- Once calculated, any effects that directly affect the total are applied
- Then the total is **locked in** — subsequent changes have no effect

**The locked-in rule is critical for sacrifice-as-cost interactions.** If a creature's static ability reduces spell costs, and that creature is sacrificed as an additional cost, the cost reduction is calculated before the sacrifice happens — so the benefit is still captured. (See 601.2h example.)

## 2.7 Step 2g — Mana Ability Activation Window

If the locked-in total cost includes any mana payment, the player now has the opportunity to activate mana abilities. This is the only moment mana abilities may be activated as part of casting. Mana abilities (rule 605) don't use the stack — they resolve immediately. The player may activate them in any order and as many as needed.

**Other players cannot act during this window.** It is not a priority window — no one can cast spells or activate non-mana abilities while the caster is activating mana abilities.

## 2.8 Step 2h — Paying Costs

The player pays all locked-in costs. Sequence:
1. First: all costs that don't involve random elements or moving cards from the library to a public zone
2. Then: remaining costs (random elements, library-to-public moves)

Within each group, costs may be paid in any order. Partial payment is not allowed — if a player can't pay everything, they can't pay anything and the casting is illegal.

**Unpayable costs:** Some costs cannot be paid regardless (e.g., you can't sacrifice a creature you don't control). Such costs make the spell impossible to cast.

## 2.9 Step 2i — The Cast Point

After all costs are paid:
1. Any cast-modifying effects apply (e.g., effects that change the spell's characteristics as it's cast)
2. **The spell becomes cast**
3. "When a spell is cast" and "when put onto the stack" triggered abilities fire
4. "When-targeted" triggers that have been waiting since 2c are now placed on the stack along with cast triggers (per the standard 117.5 checkpoint after casting completes)
5. If the caster had priority before casting, they get priority back

**Cast triggers and stack ordering:** All triggered abilities that fired during the casting process (target triggers from 2c, cast triggers from 2i) are placed on the stack in APNAP order after the spell has finished being cast.

---

# 3. PLAYING vs. CASTING (601.1, 601.1a)

"Playing" a card means playing it as a land (special action, rule 116.2a) or casting it as a spell, whichever applies. Older cards may say "play" where current Oracle text says "cast." These have received errata.

**An effect that lets you "play" a card from exile gives you both options** — play it as a land if it's a land card, cast it as a spell otherwise.

---

# 4. THE STUB PROMOTION

Rule 601.2c (target announcement) and 601.2d (division) were previously covered in the `L06_PlayerAction_601_casting_stub.md`. That stub is superseded by this file. The stub content is now subsumed into sections 2.3 and 2.4 above.

---

# 5. CRITICAL INTERACTION POINTS FOR ADJUDICATION

## 5.1 The Cast Point vs. Stack Entry Point

The spell enters the stack at **601.2a** — before targets, before costs, before anything. "When put onto the stack" triggers and "when cast" triggers both fire at **601.2i**. Do not confuse the physical movement to the stack with the legal becoming-cast moment.

## 5.2 Target Trigger Timing (601.2c)

"When [object] becomes the target of a spell" triggers fire when the target is announced in 601.2c. They wait in the waiting state. They are not placed on the stack until the spell finishes being cast at 601.2i — then they go on the stack per the 117.5 process along with any cast triggers.

## 5.3 Cost Lock-In and Sacrifice Interactions (601.2f/h)

Cost lock-in happens at 601.2f. Payment happens at 601.2h. If paying a cost removes a cost-reducer (e.g., sacrificing a creature that reduced costs), the reduction is already locked in and still applies.

## 5.4 Mana Window Exclusivity (601.2g)

Only the casting player can act in the mana window. No other player receives priority. No counterspells can be cast during mana activation.

## 5.5 After Casting — Priority (601.2i)

After the spell is cast and cast triggers are placed on the stack, if the caster had priority before casting, they get it back. They can then cast another instant, activate abilities, or pass. Only when they pass does the next player get priority.

---

FEEDS INTO: L06_PlayerAction_601_seg2_t.md (601.3 legality), L04_Trigger_engine.md (cast triggers at 601.2i, when-targeted triggers at 601.2c), L06_PlayerAction_117_t.md (priority after casting), L00_Orchestration_game_engine.md (casting in the engine loop)

---

# COMMANDER ADDENDUM — Casting from the Command Zone

When a commander is cast from the command zone, all standard casting rules (601.2a–i) apply with one addition: the **commander tax** is an additional cost.

**Commander tax = {+2} for each previous cast from the command zone this game**

This is an additional cost (rule 118.9) added at 601.2f during total cost determination. It is included in the locked-in total before mana abilities are activated at 601.2g. Cost reducers apply to the total after the tax is added.

The cast zone is the command zone (not the hand). The spell moves from the command zone to the stack at 601.2a. All other steps proceed normally.

For full commander cast rules including the tax counter and once-per-format-game restrictions, see `L10_Variant_903_t.md` (§5).
