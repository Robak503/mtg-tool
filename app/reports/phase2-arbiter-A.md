# Arbiter Knowledge Validation Report

Generated: 2026-05-25T03:51:47.172Z
Endpoint: `http://localhost:3000/api/arbiter`
Prompt: `ARBITER_PROMPT`
Suite: `core`
Card context: `Scryfall Oracle + WOTC rulings`
Result: **3/3 passed**

| Test | Source | Title | Result | Missing citations | Failures |
|---|---|---|---|---|---|
| A1 | META_test_cases.md | Leyline of the Void + creature death + Blood Artist | PASS | - | - |
| A2 | META_test_cases.md | Anafenza + Rest in Peace + Living Death (three-way replacement) | PASS | - | - |
| A3 | META_test_cases.md | Commander dying with shield counter and Command Zone replacement | PASS | - | - |

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
- [700.4] - The term dies means “is put into a graveyard from the battlefield.”
- [614.6] - If an event is replaced, it never happens. A modified event occurs instead, which may in turn trigger abilities. Note that the modified event may contain instructions that can’t be carried out, in which case the impossible instruction is simply ignored.
- [701.8a] - To destroy a permanent, move it from the battlefield to its owner’s graveyard.
- [616.1] - If two or more replacement and/or prevention effects are attempting to modify the way an event affects an object or player, the affected object’s controller (or its owner if it has no controller) or the affected player chooses one to apply, following the steps listed below. If two or more players have to make these choices at the same time, choices are made in APNAP order (see rule 101.4).
- [603.2] - Whenever a game event or game state matches a triggered ability’s trigger event, that ability automatically triggers. The ability doesn’t do anything at this point.
CITATIONS
[700.4], [614.6], [701.8a], [616.1], [603.2]
VERDICT
No. The local rules retrieved show the event is replaced before trigger detection sees it, so a dies trigger does not trigger.
```

## A2. Anafenza + Rest in Peace + Living Death (three-way replacement)

Status: **PASS**

Scenario:
```text
Three players are in the game. Player A controls [[Anafenza, the Foremost]]. Player B controls [[Rest in Peace]]. Player C casts [[Living Death]]. Player A's graveyard contains [[Phyrexian Arena]] and three creature cards. When Living Death resolves, what happens?
```

Expected verdict:
```text
- First note the state issue: if Rest in Peace is already on the battlefield and its enter-the-battlefield trigger has resolved, Player A's graveyard should already be empty.
- Living Death resolves in instruction order. It exiles creature cards currently in graveyards, then each player sacrifices all creatures, then returns only the cards exiled by Living Death's first instruction.
- As sacrificed creatures would be put into graveyards, Rest in Peace and Anafenza can both apply to applicable nontoken creature cards. If multiple replacement effects apply to the same object, the affected controller/owner/player chooses the order under 616.1; in this case the result is exile either way.
- Creatures sacrificed during Living Death are not returned, because they were not exiled by Living Death's first instruction.
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
- [616.1] - If two or more replacement and/or prevention effects are attempting to modify the way an event affects an object or player, the affected object’s controller (or its owner if it has no controller) or the affected player chooses one to apply, following the steps listed below. If two or more players have to make these choices at the same time, choices are made in APNAP order (see rule 101.4).
- [614.6] - If an event is replaced, it never happens. A modified event occurs instead, which may in turn trigger abilities. Note that the modified event may contain instructions that can’t be carried out, in which case the impossible instruction is simply ignored.
- [700.4] - The term dies means “is put into a graveyard from the battlefield.”
- [701.8a] - To destroy a permanent, move it from the battlefield to its owner’s graveyard.
CITATIONS
[608.2], [616.1], [614.6], [700.4], [701.8a]
VERDICT
Apply Living Death in resolution order, then apply any relevant graveyard replacement effects to each event. Use the retrieved rules above for the exact replacement and resolution procedure.
```

## A3. Commander dying with shield counter and Command Zone replacement

Status: **PASS**

Scenario:
```text
I control my commander [[Atraxa, Praetors' Voice]]. It has one shield counter on it (from [[Shielded by Faith]] or similar). An opponent casts [[Murder]] targeting Atraxa. Atraxa would be destroyed. What happens?
```

Expected verdict:
```text
The shield counter is removed; Atraxa is not destroyed; Atraxa remains on the battlefield with no shield counters. The Commander command-zone state-based action (903.9a) never applies because Atraxa never went to a graveyard or exile.
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
- [701.8a] - To destroy a permanent, move it from the battlefield to its owner’s graveyard.
- [122.1c] - One or more shield counters on a permanent create a single replacement effect and a single prevention effect that protect the permanent. These effects are “If this permanent would be destroyed as the result of an effect, instead remove a shield counter from it” and “If damage would be dealt to this permanent, prevent that damage and remove a shield counter from it.” See rule 614, “Replacement Effects,” and rule 615, “Prevention Effects.”
- [608.2] - If the object that’s resolving is an instant spell, a sorcery spell, or an ability, its resolution may involve several steps. The steps described in rules 608.2a and 608.2b are followed first. The steps described in rules 608.2c–m are then followed as appropriate, in no specific order. The steps described in rule 608.2n and 608.2p are followed last.
- [903.9a] - If a commander is in a graveyard or in exile and that object was put into that zone since the last time state-based actions were checked, its owner may put it into the command zone. This is a state-based action. See rule 704.
- [701.8b] - The only ways a permanent can be destroyed are as a result of an effect that uses the word “destroy” or as a result of the state-based actions that check for lethal damage (see rule 704.5g) or damage from a source with deathtouch (see rule 704.5h). If a permanent is put into its owner’s graveyard for any other reason, it hasn’t been “destroyed.”
CITATIONS
[701.8a], [122.1c], [608.2], [903.9a], [701.8b]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```
