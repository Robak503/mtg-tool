# Magic: The Gathering — Costs, Life, Damage, and Drawing: Engine Expansion
## LAYER 6: PLAYER ACTION LAYER — Expansion (Rules 118–121)
## Effective February 27, 2026

---

SOURCES: L06_PlayerAction_118to121_v.md
FEEDS INTO: L06_PlayerAction_601_seg1_t.md (601.2f–h cost payment), L05_StateEnforcement_704_t.md (damage SBAs), L02_Time_500to514_t.md (combat damage), L00_Orchestration_game_engine.md

---

# 1. COSTS (Rule 118)

## 1.1 What a Cost Is

A cost is a payment required to take a game action. Costs always have two phases: **determination** (what must be paid) and **payment** (actually paying it). These are separated by the lock-in point at 601.2f.

## 1.2 Paying Costs — The Lock-In Rule (118.1, 601.2f)

Total cost is calculated once and locked in before any payment begins. If paying a cost removes a cost-reducer (e.g., sacrificing a creature that was reducing spell costs), the reduction still applies — it was locked in before the sacrifice happened.

**Engine consequence:** Never calculate cost mid-payment. Calculate first, lock, then pay everything.

## 1.3 Paying Mana (118.1)

Mana costs are paid from the mana pool. Spending mana empties it from the pool. Mana in the pool at the end of a step or phase is lost (rule 106.4).

## 1.4 Unpayable Costs (118.1)

If a cost cannot be paid — because it requires sacrificing something that doesn't exist, or paying mana that can't be produced — the action requiring that cost is illegal. The game returns to before that action was attempted.

**Specifically:** A cost is unpayable if there is no combination of legal choices that would allow it to be paid. An alternative cost that requires a specific card type in the graveyard is unpayable if no such card exists.

## 1.5 Paying 0 (118.5)

The {0} symbol represents a cost that can be paid with no resources. A spell or ability with a mana cost of {0} is castable if all other requirements are met — no mana needed.

## 1.6 Splitting Costs (118.6)

If a cost is split across multiple payments, each split must be paid fully. Partial payment of one component is not permitted.

## 1.7 Alternative Costs (118.8)

An alternative cost replaces a spell's mana cost for casting. Rules:
- Only one alternative cost may apply to a single casting (601.2b)
- Alternative costs may be used only when casting — not when copying or putting a spell on the stack by other means
- If an effect allows casting a spell "without paying its mana cost," that is an alternative cost of {0}
- Some effects allow casting "as though it had flash" — this modifies timing, not cost

## 1.8 Additional Costs (118.9)

Additional costs are paid on top of the mana cost or alternative cost. Multiple additional costs may apply simultaneously. Examples: buyback, kicker, sacrificing a creature as an additional cost.

Additional costs are announced in 601.2b and paid in 601.2h.

## 1.9 Cost Increases and Reductions (118.7)

Effects that increase or reduce costs apply during 601.2f. Order of application for reductions: player may apply them in any order. The mana component cannot go below {0}.

---

# 2. LIFE (Rule 119)

## 2.1 Life Totals

Each player has a life total. Default is 20 (standard). Life is a number — it can be negative. A player at 0 or less life loses the game as an SBA (704.5a).

## 2.2 Gaining Life (119.3)

"Gain N life" increases life total by N. Multiple simultaneous life gain events from one source are treated as a single gain event for trigger purposes (119.3a). "You gain 1 life for each creature that died this turn" — if four creatures died, you gain 4 life, but this is one life gain event.

## 2.3 Losing Life (119.4)

"Lose N life" decreases life total by N. Losing life is distinct from being dealt damage — effects that prevent damage do not prevent life loss. Effects that say "you can't lose life" prevent life loss but not damage.

## 2.4 Paying Life (119.5)

Paying life is a cost. Paying life reduces the player's life total by the paid amount. Paying life is not the same as losing life for trigger purposes — "whenever you lose life" does not trigger from paying life unless the effect specifically says so.

**Phyrexian mana:** Paying 2 life for a Phyrexian mana symbol is paying life as a cost, not losing life.

## 2.5 Setting Life Totals (119.6)

Some effects set a player's life total to a specific number. If the new total is lower, the player loses the difference. If higher, they gain the difference. This matters for lifelink and life-loss triggers.

## 2.6 Doubling Life Totals (119.7)

"Double your life total" means gain life equal to your current life total (if positive). If life total is negative, doubling does nothing by default (the wording determines exact behavior).

---

# 3. DAMAGE (Rule 120)

## 3.1 What Damage Is

Damage is a discrete event. Sources deal damage to targets. Damage has:
- A **source** (the object dealing it)
- An **amount** (always a positive integer in a damage event; 0 damage does nothing)
- A **recipient** (creature, planeswalker, battle, or player)

## 3.2 What Damage Does (120.3)

| Recipient | What damage does |
|---|---|
| Creature | Marked on the creature; checked against toughness at SBA |
| Player | Player loses that much life |
| Planeswalker | That many loyalty counters removed |
| Battle | That many defense counters removed |

## 3.3 Damage Marking on Creatures (120.3)

Damage is **marked** on creatures, not subtracted from toughness. The creature's toughness doesn't change — damage accumulates alongside it. At each SBA check, if total marked damage ≥ toughness, the creature is destroyed.

Marked damage is removed: at the end of each turn (cleanup step, 514.2) and when a creature regenerates (701.19).

## 3.4 Sources of Damage and Their Properties

Properties that affect how damage is dealt (deathtouch, infect, wither, lifelink) are determined by the source at the time damage is dealt. If the source has left the battlefield, use last known information.

**Deathtouch:** Any nonzero damage from a deathtouch source is lethal for SBA purposes and for excess damage assignment in combat.

**Infect:** Damage to creatures is dealt as -1/-1 counters instead of marked damage. Damage to players is dealt as poison counters instead of life loss.

**Wither:** Damage to creatures is dealt as -1/-1 counters. Unlike infect, damage to players is still life loss.

**Lifelink:** Dealing damage causes the controller of the source to gain that much life simultaneously. This is a replacement-style characteristic — it happens as part of the damage event, not as a triggered ability.

## 3.5 Damage Prevention (120.4)

Prevention effects intercept damage before it is dealt. A prevention effect:
- Prevents damage from being dealt at all (it never marks, never removes counters, never causes life loss)
- Prevention shields apply per damage event; if multiple sources deal damage, each is checked separately
- "The next N damage that would be dealt" — tracks total prevented, not events

## 3.6 Damage Redirection (120.5)

Redirection effects change the recipient of damage. If damage is redirected, it is dealt to the new recipient with the same source and properties. Protection and prevention effects on the new recipient apply.

## 3.7 Dealing 0 Damage (120.2)

A damage event of 0 does nothing. It does not trigger "whenever damage is dealt" abilities. It does not cause lifelink. It does not interact with deathtouch.

## 3.8 Combat Damage Assignment (120.6–120.12)

In the combat damage step:
1. Each attacking/blocking creature assigns combat damage (508/509 determines which)
2. Assignment must cover lethal damage before assigning to secondary targets (120.9)
3. Trample allows excess assignment to be applied to the defending player (702.19)
4. Deathtouch: any nonzero combat damage is considered lethal for excess assignment purposes
5. All combat damage is dealt simultaneously (120.12)

---

# 4. DRAWING CARDS (Rule 121)

## 4.1 The Draw Event

Drawing a card is a distinct game event: move the top card of the player's library to their hand. If the library is empty when a player would draw, that player loses the game as an SBA (704.5b).

## 4.2 Simultaneous Draws

If an effect causes multiple draws, they are processed one at a time in sequence, not simultaneously. "Draw three cards" means draw, draw, draw — each draw is a separate event that can trigger separately.

## 4.3 Replacement Effects on Drawing

Effects that say "if you would draw a card, instead [do something else]" apply as replacement effects. The most common: drawing while the library is empty would normally cause a loss, but effects like "if you would draw a card and your library is empty, you don't lose the game" intercept this.

## 4.4 Drawing Versus Other Card Movement

Moving a card from library to hand through an effect is not drawing unless the effect uses the word "draw." "Look at the top card of your library; you may put it into your hand" is not drawing — it does not trigger "whenever you draw" abilities.

---

# 5. CROSS-LAYER CONNECTIONS

**→ Layer 5 (SBAs):**
- Player at 0 or less life → lose game (704.5a)
- Player with 10+ poison → lose game (704.5c)
- Creature with lethal marked damage → destroyed (704.5g)
- Creature damaged by deathtouch source → destroyed (704.5h)
- Player attempts to draw from empty library → lose game (704.5b)
- Empty library draw during resolution → lose game at next SBA check (704.5b)

**→ Layer 4 (Triggers):**
- "Whenever you gain life" — fires once per life-gain event regardless of amount (119.3a)
- "Whenever you lose life" — fires on life loss, not on damage dealt unless damage causes life loss
- "Whenever damage is dealt to [permanent]" — fires for nonzero damage events
- "Whenever you draw a card" — fires per individual draw (121)

**→ Layer 6 (601):**
- Costs determined at 601.2f (lock-in)
- Mana abilities activated at 601.2g
- Costs paid at 601.2h — alternative costs and additional costs
- Life payment (Phyrexian mana) is a cost paid at 601.2h

---

FEEDS INTO: L06_PlayerAction_601_seg1_t.md (cost lock-in and payment at 601.2f–h), L05_StateEnforcement_704_t.md (damage and life SBAs), L02_Time_500to514_t.md (combat damage step, cleanup), L04_Trigger_engine.md (life gain/loss/draw triggers)

## LIFELINK — MULTIPLE INSTANCES

Multiple instances of lifelink on the same creature are **redundant**. A creature with two instances of lifelink still only causes its controller to gain life equal to the damage dealt once — not twice. (Official WotC ruling, confirmed across many cards.)

This is different from multiple lifelink creatures dealing damage simultaneously — each creature's damage is its own life-gaining event and triggers separately.
