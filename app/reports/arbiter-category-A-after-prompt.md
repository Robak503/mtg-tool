# Arbiter Knowledge Validation Report

Generated: 2026-05-22T22:34:45.540Z
Endpoint: `http://localhost:3000/api/anthropic`
Prompt: `ARBITER_PROMPT`
Card context: `Scryfall Oracle + WOTC rulings`
Result: **1/3 passed**

| Test | Title | Result | Missing citations | Failures |
|---|---|---|---|---|
| A1 | Leyline of the Void + creature death + Blood Artist | PASS | - | - |
| A2 | Anafenza + Rest in Peace + Living Death (three-way replacement) | FAIL | 616.1a | Missing required citations: 616.1a |
| A3 | Commander dying with shield counter and Command Zone replacement | FAIL | 903.9a | Missing required citations: 903.9a |

## A1. Leyline of the Void + creature death + Blood Artist

Status: **PASS**

Scenario:
```text
I control [[Leyline of the Void]]. An opponent's [[Grim Lavamancer]] is dealt lethal damage in combat. Does [[Blood Artist]] trigger?
```

Expected verdict:
```text
No. Blood Artist does not trigger.
```

App response:
```text
STATE
Q2 — SBAs applicable: Grim Lavamancer has lethal damage marked, dies SBA pending.
Q3 — Triggered abilities waiting after SBA resolution.

RESOLUTION
1. (step 9) SBA check: Grim Lavamancer has lethal damage, apply destroy SBA [704.5g].
2. (step 1) Would-event: "Grim Lavamancer dies" (moves from battlefield to graveyard).
3. (step 3) Replacement processing: Leyline of the Void applies "exile it instead" to graveyard destination [614.6].
4. (step 4) Final event: Grim Lavamancer moves from battlefield to exile zone.
5. (step 5) Trigger detection: Blood Artist scans for "creature dies" condition against final event.
6. Blood Artist does not trigger — no creature died (moved to graveyard). Grim Lavamancer was exiled instead.

RULE TRACE
- [704.5g] Creature with lethal damage is destroyed by SBA.
- [614.6] Zone-change replacement effect changes destination from graveyard to exile.
- [700.4] "Dies" means "is put into a graveyard from the battlefield."
- Axiom 4 governs: Trigger detection sees only the final event (exile), not the would-event (graveyard).

VERDICT
No, Blood Artist does not trigger because Grim Lavamancer was exiled instead of dying.
```

## A2. Anafenza + Rest in Peace + Living Death (three-way replacement)

Status: **FAIL**

Failures:
- Missing required citations: 616.1a

Scenario:
```text
Three players are in the game. Player A controls [[Anafenza, the Foremost]]. Player B controls [[Rest in Peace]]. Player C casts [[Living Death]]. Player A's graveyard contains [[Phyrexian Arena]] and three creature cards. When Living Death resolves, what happens?
```

Expected verdict:
```text
- Rest in Peace exiles all graveyards as part of its static replacement *before* Living Death attempts to resolve — but only for cards as they would enter graveyards going forward, not retroactively. Wait — Rest in Peace's continuous effect ("If a card or token would be put into a graveyard from anywhere, exile it instead") applies to events occurring while it's in play. Cards already in graveyards when Rest in Peace entered the battlefield were exiled at that ETB time per the replacement loop.
- Therefore, when Living Death resolves, all graveyards are empty — no creatures to return, no creatures sacrificed (since no players have creatures on the battlefield except Anafenza and what was already there). Living Death resolves but does nothing.
```

App response:
```text
STATE
Q1 - [[Living Death]] is currently resolving (step 2 of 608.2 instruction sequence).
Q2 - No SBAs applicable during resolution.
Q3 - No triggers waiting during resolution.
Q4 - Not at stable checkpoint (spell resolving).
Q5 - No player has priority during resolution.

RESOLUTION
1. (step 4 — final event occurs) [[Living Death]] begins resolving per [608.2].
2. (step 1 — would-event generated) First instruction attempts to exile all creature cards from graveyards.
3. (step 3 — replacement processing) [[Rest in Peace]]'s replacement effect does not apply - creature cards are already in graveyards, moving to exile zone as instructed.
4. (step 4 — final event occurs) All players exile creature cards from their graveyards simultaneously. Player A exiles three creature cards; [[Phyrexian Arena]] remains in graveyard (not a creature card).
5. (step 4 — final event occurs) Second instruction: all players sacrifice all creatures they control simultaneously.
6. (step 3 — replacement processing) [[Rest in Peace]] replaces the sacrifice event - sacrificed creatures are exiled instead of going to graveyards per [614.6].
7. (step 4 — final event occurs) Third instruction attempts to return exiled creature cards to battlefield.
8. (step 4 — final event occurs) Only cards exiled by Living Death's first instruction return to battlefield. Cards exiled by [[Rest in Peace]]'s replacement effect do not return per ruling clarification.

RULE TRACE
- [608.2] - Spell resolution follows instructions in order
- [614.6] - Zone-change replacement effects modify destination
- [614.1] - [[Rest in Peace]] replaces graveyard-bound events with exile
- Living Death ruling - Only cards exiled by first instruction return; replacement-exiled cards do not

VERDICT
Player A's three creature cards return to the battlefield; [[Phyrexian Arena]] remains in the graveyard; any creatures sacrificed during resolution are permanently exiled and do not return.
```

## A3. Commander dying with shield counter and Command Zone replacement

Status: **FAIL**

Failures:
- Missing required citations: 903.9a

Scenario:
```text
I control my commander [[Atraxa, Praetors' Voice]]. It has one shield counter on it (from [[Shielded by Faith]] or similar). An opponent casts [[Murder]] targeting Atraxa. Atraxa would be destroyed. What happens?
```

Expected verdict:
```text
The shield counter is removed; Atraxa is not destroyed; Atraxa remains on the battlefield with no shield counters. The Command Zone replacement (903.9a) never triggers because Atraxa never went to a graveyard.
```

App response:
```text
STATE
Process currently resolving: [[Murder]] targeting [[Atraxa, Praetors' Voice]] with one shield counter.

RESOLUTION
1. (step 1 — would-event generated) [[Murder]] attempts to destroy [[Atraxa, Praetors' Voice]].
2. (step 3 — replacement processing) Shield counter's replacement effect applies: "If it would be destroyed this way, remove a shield counter from it instead" [122.1g].
3. (step 4 — final event occurs) Original destroy event is replaced. One shield counter is removed from [[Atraxa, Praetors' Voice]]. The creature is not destroyed.
4. (step 7 — current process completes) [[Murder]] finishes resolving with its effect fully replaced.
5. (step 17 — priority given) Active player receives priority.

RULE TRACE
- [122.1g]: Shield counters create a replacement effect that replaces destruction with counter removal.
- [701.7]: Destroy effects are the type of effect shield counters replace.
- [614.1]: Replacement effects use "instead" and modify events.
- Axiom 2 governs: Replacement happens before the event, so the original destruction never occurs.

VERDICT
[[Atraxa, Praetors' Voice]] is not destroyed and loses one shield counter instead.
```
