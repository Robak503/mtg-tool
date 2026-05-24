# Arbiter Knowledge Validation Report

Generated: 2026-05-22T22:35:50.542Z
Endpoint: `http://localhost:3000/api/anthropic`
Prompt: `ARBITER_PROMPT`
Card context: `Scryfall Oracle + WOTC rulings`
Result: **2/3 passed**

| Test | Title | Result | Missing citations | Failures |
|---|---|---|---|---|
| A1 | Leyline of the Void + creature death + Blood Artist | PASS | - | - |
| A2 | Anafenza + Rest in Peace + Living Death (three-way replacement) | FAIL | 616.1a | Missing required citations: 616.1a |
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
A combat damage resolution process has completed. Checking if SBAs apply to the opponent's [[Grim Lavamancer]] that was dealt lethal damage, and whether [[Blood Artist]]'s triggered ability conditions are met.

RESOLUTION
1. (Step 9 — SBA check) State-based actions check reveals [[Grim Lavamancer]] has lethal damage marked and should be destroyed [704.5g].
2. (Step 10 — SBA execution) The destroy effect would put [[Grim Lavamancer]] into its owner's graveyard.
3. (Step 3 — replacement processing) [[Leyline of the Void]]'s replacement effect applies: "If a card would be put into an opponent's graveyard from anywhere, exile it instead" [614.1].
4. (Step 4 — final event) [[Grim Lavamancer]] is exiled instead of being put into the graveyard.
5. (Step 5 — trigger detection) [[Blood Artist]] scans for "whenever this creature or another creature dies" — the creature was exiled, not put into a graveyard, so it did not "die" [700.4].
6. No triggers enter waiting state.

RULE TRACE
- [704.5g] Creatures with lethal damage are destroyed by state-based actions.
- [614.1] Replacement effects modify events as they would happen.
- [614.6] Zone-change replacement effects can change the destination zone.
- [700.4] A creature "dies" only if it's put into a graveyard from the battlefield.
- Axiom 4 governs: Trigger detection operates from the final event, not the would-event.

VERDICT
No, [[Blood Artist]] does not trigger because [[Grim Lavamancer]] was exiled instead of dying.
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
- No process currently resolving; [[Living Death]] is beginning resolution (Q1: Yes, continue 608.2 sequence)
- Multiple replacement effects apply to the same events (Q2: Not applicable during spell resolution)

RESOLUTION
1. (step 1 — [[Living Death]] resolution begins via 608.2) First instruction: "Each player exiles all creature cards from their graveyard"
2. (step 2 — would-event generation) Player A would exile three creature cards from graveyard
3. (step 3 — replacement processing) [[Rest in Peace]]'s replacement effect does not apply - cards are being moved from graveyard to exile, which matches the destination [[Rest in Peace]] would create
4. (step 4 — final event occurs) Player A exiles three creature cards; other players exile their creature cards as applicable
5. (step 1 continued — second instruction) "then sacrifices all creatures they control" - no creatures are controlled by any player based on scenario
6. (step 1 continued — third instruction) "then puts all cards they exiled this way onto the battlefield"
7. (step 2 — would-event generation) Player A would put three creature cards onto battlefield from exile
8. (step 3 — replacement processing) [[Anafenza, the Foremost]]'s replacement effect does not apply - it only affects cards going to opponent graveyards, not cards entering battlefield
9. (step 4 — final event occurs) Player A puts three creature cards onto battlefield; [[Phyrexian Arena]] remains in graveyard as it is not a creature card

RULE TRACE
- [608.2] Spell resolution follows instructions in order
- [614.1] Replacement effects apply to would-events
- [614.6] [[Rest in Peace]] creates a zone-change replacement but does not apply when the destination is already exile
- [[Anafenza, the Foremost]]'s replacement only affects "creature card not on the battlefield would be put into an opponent's graveyard" - does not apply to cards being put onto battlefield

VERDICT
Player A exiles their three creature cards, then puts those three creatures onto the battlefield; [[Phyrexian Arena]] remains in Player A's graveyard as it is not a creature card and [[Living Death]] only affects creature cards.
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
Q2 — [[Murder]] is resolving and would destroy [[Atraxa, Praetors' Voice]] which has a shield counter.

RESOLUTION
1. (step 4 — final event occurs) [[Murder]]'s destroy effect would be applied to [[Atraxa, Praetors' Voice]].
2. (step 2 — "can't" check) Shield counter prevents the destruction via [122.1g].
3. (step 4 — final event modified) Instead of being destroyed, remove a shield counter from [[Atraxa, Praetors' Voice]].
4. (step 5 — trigger detection) No triggers generated from this interaction.
5. (step 8 — checkpoint reached) [[Murder]] finishes resolving and goes to graveyard.

RULE TRACE
- [122.1g] Shield counters prevent destruction by removing themselves instead
- [701.7] Destroy effects can be prevented by replacement effects
- [903.9a] Command zone replacement not reached because destruction was prevented

VERDICT
[[Atraxa, Praetors' Voice]] is not destroyed and does not go to the command zone; instead, one shield counter is removed from it.
```
