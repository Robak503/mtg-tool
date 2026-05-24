# Arbiter Knowledge Validation Report

Generated: 2026-05-22T22:32:26.188Z
Endpoint: `http://localhost:3000/api/anthropic`
Prompt: `ARBITER_PROMPT`
Card context: `Scryfall Oracle + WOTC rulings`
Result: **0/3 passed**

| Test | Title | Result | Missing citations | Failures |
|---|---|---|---|---|
| A1 | Leyline of the Void + creature death + Blood Artist | FAIL | 614.6, Axiom-4 | Missing required citations: 614.6, Axiom-4; Verdict polarity mismatch; expected NO-style answer |
| A2 | Anafenza + Rest in Peace + Living Death (three-way replacement) | FAIL | 614.6, 616.1a | Missing required citations: 614.6, 616.1a |
| A3 | Commander dying with shield counter and Command Zone replacement | FAIL | 122.1g, 701.7, 903.9a | Missing required citations: 122.1g, 701.7, 903.9a; Verdict polarity mismatch; expected NO-style answer |

## A1. Leyline of the Void + creature death + Blood Artist

Status: **FAIL**

Failures:
- Missing required citations: 614.6, Axiom-4
- Verdict polarity mismatch; expected NO-style answer

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
Q1: No process currently resolving.
Q2: SBA applicable - creature with lethal damage marked will be destroyed.
Q4: Not at stable checkpoint - SBA must be processed first.

RESOLUTION
1. (Step 9) SBA check identifies [[Grim Lavamancer]] with lethal damage [704.5f].
2. (Step 10) SBA attempts to destroy [[Grim Lavamancer]] - this would put it into graveyard.
3. (Step 3) [[Leyline of the Void]] replacement effect applies: "If a card would be put into an opponent's graveyard from anywhere, exile it instead."
4. (Step 4) Final event occurs - [[Grim Lavamancer]] is exiled instead of being destroyed to graveyard.
5. (Step 5) Trigger detection scans the final event - no creature "died" because dying requires going to graveyard [700.4].
6. (Step 12) SBA check is empty, stable checkpoint reached.

RULE TRACE
- [704.5f] Creature with damage ≥ toughness is destroyed
- [614.1] Replacement effect modifies event before it occurs  
- [700.4] "Dies" means "is put into a graveyard from the battlefield"
- [603.2] Triggered abilities only trigger if their condition is met

VERDICT
[[Blood Artist]] does not trigger because [[Grim Lavamancer]] was exiled instead of dying.
```

## A2. Anafenza + Rest in Peace + Living Death (three-way replacement)

Status: **FAIL**

Failures:
- Missing required citations: 614.6, 616.1a

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
Q1: [[Living Death]] is resolving (step-by-step through 608.2 instructions).
Q2: No SBAs currently applicable during resolution.

RESOLUTION
1. (step 4 — spell resolution begins) [[Living Death]] begins resolving via [608.2].
2. (step 4a — first instruction) "Each player exiles all creature cards from their graveyard" — Player A attempts to exile three creature cards from graveyard.
3. (step 3 — replacement processing) [[Rest in Peace]]'s replacement effect applies via [614.1a] — creature cards are already in exile, no movement occurs.
4. (step 4b — second instruction) "then sacrifices all creatures they control" — all creatures are sacrificed simultaneously.
5. (step 3 — replacement processing) Sacrificed creatures would go to graveyards, but [[Rest in Peace]] replaces this with exile via [614.1a].
6. (step 4c — third instruction) "then puts all cards they exiled this way onto the battlefield" — only cards exiled by Living Death's first instruction return.
7. (step 4 — resolution complete) Player A exiled zero creature cards via Living Death's first instruction, so returns zero creatures.

RULE TRACE
- [608.2] Spell resolves by following its instructions in order.
- [614.1a] Replacement effects apply when their triggering event would occur.
- [614.5] [[Rest in Peace]]'s replacement effect applies to each creature card movement attempt.
- Living Death ruling: "Only cards exiled by Living Death's first instruction are put onto the battlefield."

VERDICT
Player A returns no creatures to the battlefield because [[Rest in Peace]] prevented the initial exile from graveyard step.
```

## A3. Commander dying with shield counter and Command Zone replacement

Status: **FAIL**

Failures:
- Missing required citations: 122.1g, 701.7, 903.9a
- Verdict polarity mismatch; expected NO-style answer

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
Q1: [[Murder]] is resolving (step 1 of 608.2 sequence).
Q2: SBA check will occur after resolution completes.

RESOLUTION
1. (step 1 — spell resolution begins) [[Murder]] resolves via [608.2a], attempting to destroy target [[Atraxa, Praetors' Voice]].
2. (step 2 — destruction event) "Destroy" generates a would-event to destroy Atraxa.
3. (step 3 — replacement processing) Shield counter's replacement effect applies [614.1]: "If it would be destroyed, instead remove a shield counter from it."
4. (step 4 — final event) Original destruction event is replaced. Instead, one shield counter is removed from Atraxa.
5. (step 5 — spell resolution completes) [[Murder]] finishes resolving and goes to graveyard.
6. (step 8 — checkpoint) Game reaches stable checkpoint. Atraxa remains on battlefield with no shield counters.

RULE TRACE
- [608.2a] Spell resolution performs its instructions in order.
- [614.1] Replacement effects modify events before they happen.
- [Axiom 2] Replacement happens before the event; if replaced, original event never occurs.
- [614.5] Shield counter's self-replacement effect removes itself to prevent destruction.

VERDICT
Atraxa survives with the shield counter removed instead of being destroyed.
```
