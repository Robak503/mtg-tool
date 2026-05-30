# Magic: The Gathering — Turn-Based Actions Expansion
## LAYER 2: TIME LAYER — Expansion (Rule 703)
## Effective February 27, 2026

---

SOURCES: L02_Time_703_v.md
FEEDS INTO: L02_Time_500to514_t.md, L05_StateEnforcement_704_t.md, L00_Orchestration_game_engine.md (§5.8), L04_Trigger_engine.md

---

# 1. WHAT TURN-BASED ACTIONS ARE

Turn-based actions (TBAs) are automatic game actions that:
- Happen when certain steps or phases begin, or when each step/phase ends
- Do not use the stack
- Are not controlled by any player
- Happen before state-based actions are checked, before triggered abilities are placed on the stack, and before players receive priority (703.3)

**Critical distinction from triggered abilities (703.1a):** Abilities that watch for a step or phase to begin are triggered abilities, not turn-based actions. A triggered ability reading "at the beginning of your upkeep" is a trigger — it fires because the upkeep begins, but the watching and firing is handled by rule 603. The drawing of a card in the draw step (703.4d) is a turn-based action — it happens automatically without any ability watching for it.

---

# 2. THE ORDERING RULE (703.3)

Rule 703.3 establishes the priority of TBAs over everything else at a step's start:

```
Step/phase begins
    → Turn-based actions for that step execute (703.3)
    → State-based actions are checked (117.5 / rule 704)
    → Triggered abilities placed on stack (603.3b)
    → Priority given (117.3a)
```

TBAs are not optional, not counterable, and cannot be responded to. They simply happen.

---

# 3. COMPLETE TURN-BASED ACTION REFERENCE

All 17 turn-based actions from rule 703.4, organized by when they occur:

## Untap Step TBAs

| Rule | Action | Notes |
|---|---|---|
| 703.4a | Phasing: active player's phased-in permanents with phasing phase out; phased-out permanents phase in | Simultaneous |
| 703.4b | Day/Night check: designation may change based on previous turn's spell count | Only if game has day/night designation |
| 703.4c | Untap: active player chooses which permanents untap, then all untap simultaneously | Effects may restrict untapping |

These three happen in sequence (703.4a → 703.4b → 703.4c), not simultaneously. The CR wording "immediately after" marks each step's dependency on the previous one.

## Draw Step TBAs

| Rule | Action | Notes |
|---|---|---|
| 703.4d | Active player draws a card | Does not use the stack; still triggers draw-watching abilities |

## Precombat Main Phase TBAs (in order)

| Rule | Action | Notes |
|---|---|---|
| 703.4e | Archenemy only: active archenemy sets top scheme card in motion | Archenemy games only |
| 703.4f | Lore counters placed on each Saga with chapter abilities | After scheme action in Archenemy |
| 703.4g | Roll to visit Attractions (if any controlled) | After Saga lore counters |

## Beginning of Combat Step TBAs

| Rule | Action | Notes |
|---|---|---|
| 703.4h | Multiplayer only: active player chooses defending player | Only if opponents don't all automatically become defending players |

## Declare Attackers Step TBAs

| Rule | Action | Notes |
|---|---|---|
| 703.4i | Active player declares attackers | Follows full declaration sequence of rule 508.1 |

## Declare Blockers Step TBAs

| Rule | Action | Notes |
|---|---|---|
| 703.4j | Defending player declares blockers | Follows full declaration sequence of rule 509.1 |

## Combat Damage Step TBAs (in order)

| Rule | Action | Notes |
|---|---|---|
| 703.4k | Each player in APNAP order assigns combat damage | Active player's assignment first |
| 703.4m | All combat damage dealt simultaneously | No window between assignment and dealing |

## Cleanup Step TBAs (in order)

| Rule | Action | Notes |
|---|---|---|
| 703.4n | Active player discards to hand size (if over maximum) | Does not use the stack |
| 703.4p | Damage removed from all permanents; "until end of turn" and "this turn" effects end | Simultaneous |

## Every Step/Phase End

| Rule | Action | Notes |
|---|---|---|
| 703.4q | Unspent mana empties from all players' mana pools | Applies at the end of every step and phase |

---

# 4. KEY OPERATIONAL DISTINCTIONS

## 4.1 TBAs vs. Triggered Abilities — The Practical Difference

This distinction matters for responding, countering, and timing:

| Property | Turn-Based Action | Triggered Ability |
|---|---|---|
| Uses the stack? | No | Yes (after waiting state) |
| Can be countered? | No | Yes (via Stifle etc.) |
| Can players respond? | No | Yes (after it's on the stack) |
| Controlled by a player? | No | Yes (603.3a) |
| Source rule | 703 | 603 |

**Example:** The draw in the draw step (703.4d) is a TBA. It cannot be Stifled. An ability that reads "Whenever you draw a card" is a triggered ability fired by that TBA. The triggered ability can be Stifled.

## 4.2 The Declare Attackers/Blockers TBAs (703.4i, 703.4j)

These are unusual TBAs in that they involve player choices (which creatures to attack/block with). The player choices are part of the TBA execution — they are not optional actions that occur before or after the TBA. The full declaration sequence of rule 508.1 (for attackers) and 509.1 (for blockers) is the body of those TBAs.

If the declaration is illegal at any point, rule 732 applies (handling illegal actions) — the game returns to before the declaration began.

## 4.3 Combat Damage Assignment vs. Dealing (703.4k vs. 703.4m)

These are two separate TBAs:
- **703.4k** — Assignment: each player in APNAP order announces how each creature assigns its damage. This establishes the damage plan.
- **703.4m** — Dealing: all assigned damage is dealt simultaneously.

There is no priority window between these two TBAs (510.2). Players cannot cast spells or activate abilities between assignment and dealing.

## 4.4 The Simultaneous Untap Rule (703.4c)

Untapping happens simultaneously. There is no priority window during untapping. An ability that watches for a creature to become untapped fires during the untap step, enters the waiting state, and is not placed on the stack until the first priority checkpoint (upkeep).

## 4.5 Mana Empty at Every Step/Phase End (703.4q)

Mana empties at the end of every step and phase, not just at end of turn. This means mana cannot be "saved" across steps or phases. Floating mana from a mana ability activated during the declare attackers step will empty at the end of that step if not spent.

---

# 5. INTERACTION WITH THE ENGINE LOOP

Rule 703.3 establishes TBAs' position in the full execution sequence:

```
Step/phase begins
→ TBAs (703.3, 703.4x) — cannot be interrupted or responded to
→ SBA check loop (117.5, rule 704) — repeats until stable
→ Trigger insertion (603.3b, 117.5) — two-part APNAP
→ SBA check loop again
→ Priority given (117.3a) — only when fully stable
```

TBAs always execute before the SBA/trigger checkpoint. If a TBA causes game state changes that trigger SBAs or abilities (e.g., the draw TBA causes a player to mill their last card), those SBAs and triggers are handled in the 117.5 loop after the TBA completes — not during it.

---

FEEDS INTO: L02_Time_500to514_t.md (step-by-step detail), L05_StateEnforcement_704_t.md (703.3 ordering, TBA before SBA), L06_PlayerAction_117_t.md (117.3a priority after TBAs), L04_Trigger_engine.md (§4.1 beginning-of-step, §4.2 untap, §4.3 cleanup), L00_Orchestration_game_engine.md (§5.8 turn structure integration)
