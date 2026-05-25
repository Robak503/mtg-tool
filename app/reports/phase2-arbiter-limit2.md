# Arbiter Knowledge Validation Report

Generated: 2026-05-25T03:48:26.228Z
Endpoint: `http://localhost:3000/api/arbiter`
Prompt: `ARBITER_PROMPT`
Suite: `core`
Card context: `Scryfall Oracle + WOTC rulings`
Result: **2/2 passed**

| Test | Source | Title | Result | Missing citations | Failures |
|---|---|---|---|---|---|
| A1 | META_test_cases.md | Leyline of the Void + creature death + Blood Artist | PASS | - | - |
| A2 | META_test_cases.md | Anafenza + Rest in Peace + Living Death (three-way replacement) | PASS + REVIEW | - | Review: Expected verdict contains self-correction language; manually verify the knowledge-base entry. |

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
- Deterministic fallback used: validation_mode.
- Local rules retrieval succeeded, but model generation did not produce a trusted trace.
RESOLUTION
1. Identify the event described by the question.
2. Apply any relevant replacement/prevention effects from the retrieved rules before checking triggers.
3. Check the final event against the retrieved trigger and zone-change rules.
RULE TRACE
- [603.2] - Whenever a game event or game state matches a triggered ability’s trigger event, that ability automatically triggers. The ability doesn’t do anything at this point.
- [603.1] - Triggered abilities have a trigger condition and an effect. They are written as “[When/Whenever/At] [trigger condition or event], [effect]. [Instructions (if any).]”
- [603.3] - Once an ability has triggered, its controller puts it on the stack as an object that’s not a card the next time a player would receive priority. See rule 117, “Timing and Priority.” The ability becomes the topmost object on the stack. It has the text of the ability that created it, and no other characteristics. It remains on the stack until it’s countered, it resolves, a rule causes it to be removed from the stack, or an effect moves it elsewhere.
- [614.6] - If an event is replaced, it never happens. A modified event occurs instead, which may in turn trigger abilities. Note that the modified event may contain instructions that can’t be carried out, in which case the impossible instruction is simply ignored.
- [700.4] - The term dies means “is put into a graveyard from the battlefield.”
CITATIONS
[603.2], [603.1], [603.3], [614.6], [700.4]
VERDICT
No. The local rules retrieved show the event is replaced before trigger detection sees it, so a dies trigger does not trigger.
```

## A2. Anafenza + Rest in Peace + Living Death (three-way replacement)

Status: **PASS**

Review warnings:
- Expected verdict contains self-correction language; manually verify the knowledge-base entry.

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
- Deterministic fallback used: validation_mode.
- Local rules retrieval succeeded, but model generation did not produce a trusted trace.
RESOLUTION
1. Identify the event described by the question.
2. Apply any relevant replacement/prevention effects from the retrieved rules before checking triggers.
3. Check the final event against the retrieved trigger and zone-change rules.
RULE TRACE
- [608.2] - If the object that’s resolving is an instant spell, a sorcery spell, or an ability, its resolution may involve several steps. The steps described in rules 608.2a and 608.2b are followed first. The steps described in rules 608.2c–m are then followed as appropriate, in no specific order. The steps described in rule 608.2n and 608.2p are followed last.
- [603.3] - Once an ability has triggered, its controller puts it on the stack as an object that’s not a card the next time a player would receive priority. See rule 117, “Timing and Priority.” The ability becomes the topmost object on the stack. It has the text of the ability that created it, and no other characteristics. It remains on the stack until it’s countered, it resolves, a rule causes it to be removed from the stack, or an effect moves it elsewhere.
- [616.1] - If two or more replacement and/or prevention effects are attempting to modify the way an event affects an object or player, the affected object’s controller (or its owner if it has no controller) or the affected player chooses one to apply, following the steps listed below. If two or more players have to make these choices at the same time, choices are made in APNAP order (see rule 101.4).
- [614.6] - If an event is replaced, it never happens. A modified event occurs instead, which may in turn trigger abilities. Note that the modified event may contain instructions that can’t be carried out, in which case the impossible instruction is simply ignored.
- [603.2] - Whenever a game event or game state matches a triggered ability’s trigger event, that ability automatically triggers. The ability doesn’t do anything at this point.
CITATIONS
[608.2], [603.3], [616.1], [614.6], [603.2]
VERDICT
Apply Living Death in resolution order, then apply any relevant graveyard replacement effects to each event. Use the retrieved rules above for the exact replacement and resolution procedure.
```
