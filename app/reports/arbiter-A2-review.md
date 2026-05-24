# Arbiter Knowledge Validation Report

Generated: 2026-05-22T22:36:36.915Z
Endpoint: `http://localhost:3000/api/anthropic`
Prompt: `ARBITER_PROMPT`
Card context: `Scryfall Oracle + WOTC rulings`
Result: **0/1 passed**

| Test | Title | Result | Missing citations | Failures |
|---|---|---|---|---|
| A2 | Anafenza + Rest in Peace + Living Death (three-way replacement) | FAIL | 614.6 | Missing required citations: 614.6 |

## A2. Anafenza + Rest in Peace + Living Death (three-way replacement)

Status: **FAIL**

Failures:
- Missing required citations: 614.6

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
The stack contains [[Living Death]] mid-resolution (Q1). No SBAs or waiting triggers are relevant until resolution completes.

RESOLUTION
1. (step 7) [[Living Death]] resolves via [608.2] instruction sequence.
2. First instruction: "Each player exiles all creature cards from their graveyard" - Player A would exile three creature cards, but [[Rest in Peace]]'s replacement effect applies [614.1].
3. [[Rest in Peace]] replacement does not modify this instruction since the creatures are already being exiled to exile zone.
4. Second instruction: "then sacrifices all creatures they control" - players sacrifice creatures simultaneously.
5. The sacrificed creatures would be put into graveyards, but [[Rest in Peace]] replaces this with exile [614.1].
6. Third instruction: "then puts all cards they exiled this way onto the battlefield" - only cards exiled by [[Living Death]]'s first instruction return.
7. Player A exiled three creature cards from graveyard via first instruction, so those three creatures enter the battlefield.
8. [[Anafenza, the Foremost]]'s replacement effect does not apply because it only affects "nontoken creature an opponent owns" dying or "creature card not on the battlefield" going to opponent's graveyard - these are Player A's own cards.

RULE TRACE
- [608.2] - spell resolution follows text instructions in order
- [614.1] - replacement effects modify events as they would occur
- [616.1a] - not used because no event has multiple applicable replacement effects
- [[Rest in Peace]] ruling: cards sacrificed are exiled instead of going to graveyard
- [[Living Death]] ruling: only cards exiled by first instruction return to battlefield

VERDICT
Player A's three creature cards are exiled from graveyard, then return to battlefield; sacrificed creatures from all players are exiled by [[Rest in Peace]] and do not return; [[Phyrexian Arena]] remains in graveyard unaffected.
```
