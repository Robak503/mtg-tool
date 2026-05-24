# Arbiter Knowledge Validation Report

Generated: 2026-05-22T22:38:43.748Z
Endpoint: `http://localhost:3000/api/anthropic`
Prompt: `ARBITER_PROMPT`
Card context: `Scryfall Oracle + WOTC rulings`
Result: **3/3 passed**

| Test | Title | Result | Missing citations | Failures |
|---|---|---|---|---|
| A1 | Leyline of the Void + creature death + Blood Artist | PASS | - | - |
| A2 | Anafenza + Rest in Peace + Living Death (three-way replacement) | PASS + REVIEW | - | Review: Expected verdict contains self-correction language; manually verify the knowledge-base entry.; Review: Expected verdict says no creatures return, but app response says creature cards enter the battlefield. |
| A3 | Commander dying with shield counter and Command Zone replacement | PASS | - | - |

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
Q2 — SBAs applicable: Grim Lavamancer has lethal damage marked, 704.5g applies.
Q3 — Triggered abilities may be generated from the resolution.

RESOLUTION
1. (Step 9) SBA check: Grim Lavamancer has lethal damage, 704.5g requires it to be destroyed.
2. (Step 10) SBA performs: Grim Lavamancer would be put into opponent's graveyard from battlefield.
3. (Step 3) Replacement processing: Leyline of the Void applies - "if a card would be put into an opponent's graveyard from anywhere, exile it instead."
4. (Step 4) Final event: Grim Lavamancer is exiled instead of being put into graveyard.
5. (Step 5) Trigger detection: Blood Artist's ability looks for "creature dies" events.
6. No "dies" event occurred - Grim Lavamancer was exiled, not put into graveyard.

RULE TRACE
- [704.5g] Creature with lethal damage is destroyed
- [614.6] Zone-change replacement effect changes destination from graveyard to exile
- [700.4] "Dies" means "is put into a graveyard from the battlefield"
- Axiom 4 governs: trigger detection sees only the final event (exile), not the would-event (graveyard)

VERDICT
No, [[Blood Artist]] does not trigger because [[Grim Lavamancer]] was exiled instead of dying.
```

## A2. Anafenza + Rest in Peace + Living Death (three-way replacement)

Status: **PASS**

Review warnings:
- Expected verdict contains self-correction language; manually verify the knowledge-base entry.
- Expected verdict says no creatures return, but app response says creature cards enter the battlefield.

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
- Living Death is currently resolving (Q1 applies).
- No other processes are mid-resolution.

RESOLUTION
1. (step 7 — current process completes) Living Death begins resolution per [608.2].
2. Living Death's first instruction: "Each player exiles all creature cards from their graveyard" attempts to execute.
3. (step 3 — replacement processing) Player A's three creature cards would move from graveyard to exile. Rest in Peace does not apply because these cards are already in a graveyard, not being "put into" one [614.6].
4. All players exile creature cards from graveyards simultaneously. Phyrexian Arena remains in Player A's graveyard (not a creature card).
5. Living Death's second instruction: "then sacrifices all creatures they control" executes.
6. (step 3 — replacement processing) Sacrificed creatures would be put into graveyards. Rest in Peace applies: "If a card or token would be put into a graveyard from anywhere, exile it instead" [614.6].
7. All sacrificed creatures are exiled instead of going to graveyards.
8. Living Death's third instruction: "then puts all cards they exiled this way onto the battlefield" executes.
9. Only cards exiled by Living Death's first instruction return. Cards exiled by Rest in Peace's replacement effect were not "exiled this way" by Living Death.
10. Player A puts their three creature cards onto the battlefield. Other players put their exiled creature cards onto the battlefield.

RULE TRACE
- [608.2] — Spell resolution follows instructions in order.
- [614.6] — Zone-change replacement effects apply when cards change zones.
- [616.1a] — Not used because no event has multiple applicable replacement effects.
- [903.9a] — Not reached because no commanders are changing zones.
- Axiom 4 governs — Rest in Peace creates the final events that Living Death's third instruction operates on.

VERDICT
Player A's three creature cards return to the battlefield; the sacrificed creatures are exiled by Rest in Peace and do not return; Phyrexian Arena remains in Player A's graveyard.
```

## A3. Commander dying with shield counter and Command Zone replacement

Status: **PASS**

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
Q1 — [[Murder]] is resolving (608.2 sequence)
Q2 — No SBAs currently applicable
Q4 — Processing spell resolution

RESOLUTION
1. (step 19 — [[Murder]] resolves from stack) [[Murder]]'s effect attempts to destroy [[Atraxa, Praetors' Voice]].
2. (step 2 — "can't" check) No "can't" effects prevent the destroy attempt.
3. (step 3 — replacement processing) Shield counter replacement effect applies: instead of being destroyed, remove a shield counter from [[Atraxa, Praetors' Voice]].
4. (step 4 — final event) [[Atraxa, Praetors' Voice]] is not destroyed; one shield counter is removed instead.
5. (step 8 — checkpoint reached) [[Murder]] finishes resolving and goes to graveyard.

RULE TRACE
- [122.1g] Shield counters provide replacement effect for destroy events
- [701.7a] Destroy means put into graveyard from battlefield due to lethal damage or destroy effect
- [614.1a] Replacement effects use "instead" to replace events
- [614.6] Zone-change replacement effects can change the destination or prevent the move entirely
- [903.9a] Commander command-zone replacement not reached because destruction was prevented

VERDICT
[[Atraxa, Praetors' Voice]] is not destroyed and remains on the battlefield with one fewer shield counter.
```
