# Arbiter Knowledge Validation Report

Generated: 2026-05-22T22:37:03.731Z
Endpoint: `http://localhost:3000/api/anthropic`
Prompt: `ARBITER_PROMPT`
Card context: `Scryfall Oracle + WOTC rulings`
Result: **1/1 passed**

| Test | Title | Result | Missing citations | Failures |
|---|---|---|---|---|
| A2 | Anafenza + Rest in Peace + Living Death (three-way replacement) | PASS | - | - |

## A2. Anafenza + Rest in Peace + Living Death (three-way replacement)

Status: **PASS**

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
Q1 — [[Living Death]] is resolving (step 2 of 608.2 sequence).

RESOLUTION
1. (step 3 — replacement processing) [[Living Death]] instruction 1: "Each player exiles all creature cards from their graveyard" — Player A would exile three creature cards from graveyard.
2. No replacement effects apply to this exile instruction — [[Rest in Peace]] and [[Anafenza, the Foremost]] do not affect cards moving from graveyard to exile.
3. [[Living Death]] instruction 2: "then sacrifices all creatures they control" — all players sacrifice creatures simultaneously.
4. Sacrificed creatures would be put into graveyards, but [[Rest in Peace]] replacement effect applies: "If a card or token would be put into a graveyard from anywhere, exile it instead."
5. All sacrificed creatures are exiled instead of going to graveyards.
6. [[Living Death]] instruction 3: "then puts all cards they exiled this way onto the battlefield" — only cards exiled by instruction 1 qualify.
7. Player A puts the three creature cards exiled in step 1 onto the battlefield.
8. [[Phyrexian Arena]] remains in Player A's graveyard (not a creature card, not affected by [[Living Death]]).

RULE TRACE
- [608.2] Resolution follows instructions in order
- [614.6] Zone-change replacement effects change destinations
- [616.1a] Not used because no event has multiple applicable replacement effects
- [701.17] Sacrifice puts permanents into graveyards unless replaced
- Axiom 4 governs — [[Living Death]] only returns cards it actually exiled

VERDICT
Player A puts three creatures onto the battlefield from the cards exiled by [[Living Death]]'s first instruction; [[Phyrexian Arena]] remains in the graveyard; all sacrificed creatures are exiled by [[Rest in Peace]].
```
