# Magic: The Gathering — Mana: Engine Expansion
## LAYER 6: PLAYER ACTION LAYER — Expansion (Rule 106)
## Effective February 27, 2026

---

SOURCES: L06_PlayerAction_106_v.md, L06_PlayerAction_600to606_t.md
FEEDS INTO: L06_PlayerAction_600to606_t.md (mana abilities), L06_PlayerAction_601_seg1_t.md (601.2g mana window), L00_Orchestration_game_engine.md

---

# 1. WHAT MANA IS

Mana is the primary resource. It is produced by effects and held in a player's mana pool. It is not an object — mana has no characteristics, cannot be targeted, and cannot be moved between players except by specific effects (106.13).

There are **six types** of mana: white, blue, black, red, green, and colorless. There are five **colors** of mana (colorless is not a color — 105.2c, 106.1a–b).

---

# 2. THE MANA POOL (106.4)

Mana produced by an effect goes into the producing player's mana pool. It can be spent immediately or held as unspent mana. **The mana pool empties at the end of each step and phase.** Any unspent mana is lost — the player announces what mana they had (106.4a, 106.4b).

**Engine consequence:** Mana is purely transient within a step. It cannot carry across step boundaries except through cards that explicitly say otherwise.

---

# 3. THE MANA WINDOW (601.2g)

During casting (and activation), there is an exclusive window for activating mana abilities — between cost determination (601.2f) and cost payment (601.2h). Only the casting player may act during this window. No other player may respond, cast spells, or activate non-mana abilities.

Mana abilities resolve immediately when activated — they do not use the stack (605.3a). Their output goes directly to the mana pool.

---

# 4. RESTRICTED MANA (106.6)

Some mana comes with restrictions on how it can be spent. If mana can only be spent on certain spell types, the restriction travels with the mana until it is spent or lost.

**Doubling restricted mana (106.6a):** If a replacement effect doubles mana production, any restrictions apply to all produced mana. Delayed triggers tied to spending mana are duplicated — one per mana produced.

---

# 5. UNDEFINED MANA (106.5)

If an ability would produce mana of an undefined type (e.g., copying a mana ability without a defined output color), it produces no mana instead. The ability resolves but produces nothing.

---

# 6. MANA FROM PERMANENTS (106.7)

"Mana a permanent could produce" means any type of mana that any ability of that permanent would produce if activated right now — regardless of whether the activation cost could be paid. This is a hypothetical calculation:
1. Look at all mana abilities on the permanent
2. For each ability, determine what mana it would add if it resolved
3. Apply any replacement effects in any possible order
4. The union of all possible outputs is what the permanent "could produce"

---

# 7. SYMBOL-SPECIFIC MANA RULES (106.8–106.12)

**Hybrid mana added to pool (106.8):** If an effect adds hybrid mana to the pool, the player chooses which half — colored or generic. The mana pool receives that specific mana type.

**Phyrexian mana added to pool (106.9):** Produces one mana of the symbol's color.

**Generic mana added to pool (106.10):** Produces that much colorless mana.

**Snow mana added to pool (107.4h):** {S} can only be paid with mana produced by a snow source. This is a restriction on what can pay the cost, not on the type of mana produced.

**Tapping for mana (106.12):** "Tap [permanent] for mana" means activating a mana ability with {T} in its cost. Abilities that trigger "whenever [permanent] is tapped for mana" fire when such a mana ability resolves and produces mana — not when the permanent is tapped for non-mana purposes.

---

# 8. CROSS-LAYER CONNECTIONS

**→ Layer 6 (Casting, 601.2g):** The mana window is during casting. Mana abilities are the only actions allowed during this window.

**→ Layer 6 (605 — Mana Abilities):** The definition of a mana ability (what qualifies, when it can be activated) is in rule 605. Rule 106 covers what mana is and how the pool works.

**→ Layer 2 (Time, 500–514):** Mana empties at the end of each step and phase. After each step transition, mana pools are empty.

---

FEEDS INTO: L06_PlayerAction_600to606_t.md (mana ability definition at 605), L06_PlayerAction_601_seg1_t.md (601.2g), L02_Time_500to514_t.md (mana loss at step end)
