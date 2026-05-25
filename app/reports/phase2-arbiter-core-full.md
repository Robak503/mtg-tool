# Arbiter Knowledge Validation Report

Generated: 2026-05-25T03:51:56.050Z
Endpoint: `http://localhost:3000/api/arbiter`
Prompt: `ARBITER_PROMPT`
Suite: `core`
Card context: `Scryfall Oracle + WOTC rulings`
Result: **7/76 passed**

| Test | Source | Title | Result | Missing citations | Failures |
|---|---|---|---|---|---|
| A1 | META_test_cases.md | Leyline of the Void + creature death + Blood Artist | PASS | - | - |
| A2 | META_test_cases.md | Anafenza + Rest in Peace + Living Death (three-way replacement) | PASS | - | - |
| A3 | META_test_cases.md | Commander dying with shield counter and Command Zone replacement | PASS | - | - |
| B1 | META_test_cases.md | Eminence ability triggering from the Command Zone | FAIL | 603.6, 702.106 | Missing required citations: 603.6, 702.106; Missing retrieved rules: 603.6, 702.106; Verdict polarity mismatch; expected NO-style answer; Review: Expected verdict contains self-correction language; manually verify the knowledge-base entry. |
| B2 | META_test_cases.md | Reflexive trigger during resolution | FAIL | 117.3b | Missing required citations: 117.3b; Missing retrieved rules: 117.3b; Verdict polarity mismatch; expected NO-style answer |
| B3 | META_test_cases.md | State trigger that's already on the stack | FAIL | 603.8 | Missing required citations: 603.8; Missing retrieved rules: 603.8 |
| C1 | META_test_cases.md | Commander damage with a copy of a commander | FAIL | 903.4, 903.10 | Missing required citations: 903.4, 903.10; Missing retrieved rules: 903.4, 903.10; Verdict polarity mismatch; expected NO-style answer |
| C2 | META_test_cases.md | Commander tax with alternative cost | FAIL | 601.2f, 903.7 | Missing required citations: 601.2f, 903.7; Missing retrieved rules: 601.2f, 903.7; Verdict polarity mismatch; expected YES-style answer |
| C3 | META_test_cases.md | Partner commanders with different color identities | FAIL | 702.124, 903.4d | Missing required citations: 702.124, 903.4d; Missing retrieved rules: 702.124, 903.4d; Verdict polarity mismatch; expected YES-style answer |
| C4 | META_test_cases.md | Mutate onto a commander | FAIL | 729.6 | Missing required citations: 729.6; Missing retrieved rules: 729.6 |
| D1 | META_test_cases.md | Sacrifice-as-cost with cost reducer | FAIL | 601.2f | Missing required citations: 601.2f; Missing retrieved rules: 601.2f; Verdict polarity mismatch; expected NO-style answer; Review: Expected verdict contains self-correction language; manually verify the knowledge-base entry. |
| E1 | META_test_cases.md | Layer interaction — characteristic-defining ability and Humility | FAIL | 613.1f, 613.3, 604.3 | Missing required citations: 613.1f, 613.3, 604.3; Missing retrieved rules: 613.1f, 613.3, 604.3 |
| E2 | META_test_cases.md | Timestamp interaction | FAIL | 613.3c | Missing required citations: 613.3c; Missing retrieved rules: 613.3c |
| F1 | META_test_cases.md | Daybound/Nightbound in 4-player Commander | FAIL | 730.3 | Missing required citations: 730.3; Missing retrieved rules: 730.3; Verdict polarity mismatch; expected NO-style answer |
| F2 | META_test_cases.md | APNAP in 4-player with simultaneous decisions | FAIL | 101.4 | Missing required citations: 101.4; Missing retrieved rules: 101.4 |
| G1 | META_test_cases.md | Player leaving with stack objects | FAIL | 800.4, 800.4a, 800.4b | Missing required citations: 800.4, 800.4a, 800.4b; Missing retrieved rules: 800.4, 800.4a, 800.4b |
| H1 | META_test_cases.md | The Replacement-vs-Replaced distinction | FAIL | - | Verdict polarity mismatch; expected NO-style answer |
| H3 | META_test_cases.md | "Can't" Beats "Can" | FAIL | 101.2 | Missing required citations: 101.2; Missing retrieved rules: 101.2; Verdict polarity mismatch; expected NO-style answer |
| I1 | META_test_cases.md | Stack object ownership confusion | FAIL | 112.3 | Missing required citations: 112.3; Missing retrieved rules: 112.3 |
| I2 | META_test_cases.md | Mid-resolution state changes | FAIL | - | Verdict polarity mismatch; expected NO-style answer |
| I3 | META_test_cases.md | Modal spell — which mode is chosen? | PASS | - | - |
| J1 | META_test_cases.md | X cost is locked at casting | FAIL | 601.2b, 601.2f | Missing required citations: 601.2b, 601.2f; Missing retrieved rules: 601.2b, 601.2f |
| J2 | META_test_cases.md | Commander tax stacks with other taxes | FAIL | 601.2f, 903.7 | Missing required citations: 601.2f, 903.7; Missing retrieved rules: 601.2f, 903.7 |
| J3 | META_test_cases.md | Thalia DOES apply to noncreature commander | FAIL | 601.2f, 601.2i | Missing required citations: 601.2f, 601.2i; Missing retrieved rules: 601.2f, 601.2i; Verdict polarity mismatch; expected YES-style answer |
| J4 | META_test_cases.md | Phyrexian mana with life replacement | FAIL | 101.2, 107.4, 601.2g | Missing required citations: 101.2, 107.4, 601.2g; Missing retrieved rules: 101.2, 107.4, 601.2g; Verdict polarity mismatch; expected NO-style answer |
| J5 | META_test_cases.md | Cost reducer can't reduce colored requirement | FAIL | 601.2f | Missing required citations: 601.2f; Missing retrieved rules: 601.2f |
| J6 | META_test_cases.md | Additional cost (sacrifice) — what if the creature dies in response? | FAIL | 601.2, 601.2g, 601.2i, 117.3c | Missing required citations: 601.2, 601.2g, 601.2i, 117.3c; Missing retrieved rules: 601.2, 601.2g, 601.2i, 117.3c; Verdict polarity mismatch; expected NO-style answer |
| J7 | META_test_cases.md | Alternative cost replaces base cost, additional costs still apply | FAIL | 118.9, 601.2f | Missing required citations: 118.9, 601.2f; Missing retrieved rules: 118.9, 601.2f; Verdict polarity mismatch; expected YES-style answer |
| J8 | META_test_cases.md | Mana ability activated DURING cost payment | FAIL | 605.3a, 601.2g | Missing required citations: 605.3a, 601.2g; Missing retrieved rules: 605.3a, 601.2g; Verdict polarity mismatch; expected YES-style answer |
| K1 | META_test_cases.md | Layer 1 (copy) applies before Layer 7 (P/T) | FAIL | 613.1a, 613.3c | Missing required citations: 613.1a, 613.3c; Missing retrieved rules: 613.1a, 613.3c |
| K2 | META_test_cases.md | Layer 2 control change — control-dependent abilities | FAIL | 613.1b, 613.3c | Missing required citations: 613.1b, 613.3c; Missing retrieved rules: 613.1b, 613.3c |
| K3 | META_test_cases.md | Layer 4 type change cascades | FAIL | 613.1d | Missing required citations: 613.1d; Missing retrieved rules: 613.1d |
| K4 | META_test_cases.md | CDA vs. set effect — which wins in layer 7b? | FAIL | 613.1f, 613.3, 604.3 | Missing required citations: 613.1f, 613.3, 604.3; Missing retrieved rules: 613.1f, 613.3, 604.3 |
| K5 | META_test_cases.md | Set then modify in layer 7 | FAIL | 613.3a, 613.3c | Missing required citations: 613.3a, 613.3c; Missing retrieved rules: 613.3a, 613.3c |
| K6 | META_test_cases.md | P/T with +1/+1 counters | FAIL | 613.3c, 613.3d | Missing required citations: 613.3c, 613.3d; Missing retrieved rules: 613.3c, 613.3d |
| K7 | META_test_cases.md | Timestamp ordering on layer 7c modifiers | FAIL | 613.3c, 613.7 | Missing required citations: 613.3c, 613.7; Missing retrieved rules: 613.3c, 613.7 |
| K8 | META_test_cases.md | Dependencies override timestamps | FAIL | 613.3b, 613.7, 613.1d, 613.1f | Missing required citations: 613.3b, 613.7, 613.1d, 613.1f; Missing retrieved rules: 613.3b, 613.7, 613.1d, 613.1f; Review: Expected verdict contains self-correction language; manually verify the knowledge-base entry. |
| K9 | META_test_cases.md | Static ability granted by counter | PASS | - | - |
| K10 | META_test_cases.md | Layer 7e — switch power/toughness | FAIL | 613.3c, 613.3e | Missing required citations: 613.3c, 613.3e; Missing retrieved rules: 613.3c, 613.3e |
| L1 | META_test_cases.md | Two replacements, controller of affected object chooses | PASS | - | - |
| L2 | META_test_cases.md | Self-replacing effects bypass the 616 choice | FAIL | 101.2, 608.2b | Missing required citations: 101.2, 608.2b; Missing retrieved rules: 101.2, 608.2b; Verdict polarity mismatch; expected NO-style answer |
| L3 | META_test_cases.md | Replacement + prevention on same damage event | FAIL | 615.1, 614.6 | Missing required citations: 615.1, 614.6; Missing retrieved rules: 615.1, 614.6 |
| L4 | META_test_cases.md | Three-way replacement on ETB counters | FAIL | 614.6 | Missing required citations: 614.6; Missing retrieved rules: 614.6 |
| L5 | META_test_cases.md | Self-replacing effects (614.5) apply first | FAIL | 704.5f | Missing required citations: 704.5f; Missing retrieved rules: 704.5f |
| L6 | META_test_cases.md | Replacement effect for "instead" damage rerouting | FAIL | 614.6, 614.9 | Missing required citations: 614.6, 614.9; Missing retrieved rules: 614.6, 614.9 |
| M1 | META_test_cases.md | Basic mana ability — no stack | FAIL | 605.1, 605.3a | Missing required citations: 605.1, 605.3a; Missing retrieved rules: 605.1, 605.3a; Verdict polarity mismatch; expected NO-style answer |
| M2 | META_test_cases.md | Triggered mana ability — uses stack | FAIL | 605.1, 605.1a | Missing required citations: 605.1, 605.1a; Missing retrieved rules: 605.1, 605.1a |
| M3 | META_test_cases.md | Mana pool empties between phases | FAIL | 106.4 | Missing required citations: 106.4; Missing retrieved rules: 106.4; Verdict polarity mismatch; expected NO-style answer |
| M4 | META_test_cases.md | Mana abilities during cost payment (re-test from J8 angle) | FAIL | 605.3a, 601.2g | Missing required citations: 605.3a, 601.2g; Missing retrieved rules: 605.3a, 601.2g; Verdict polarity mismatch; expected YES-style answer |
| M5 | META_test_cases.md | Restricted mana (snow, "spend only on") | FAIL | 107.4h | Missing required citations: 107.4h; Missing retrieved rules: 107.4h |
| N1 | META_test_cases.md | Multiple blockers and damage assignment order | FAIL | 509.1c, 510.1c | Missing required citations: 509.1c, 510.1c; Missing retrieved rules: 509.1c, 510.1c |
| N2 | META_test_cases.md | First strike damage step (only when needed) | PASS | - | - |
| N3 | META_test_cases.md | Trample with multiple blockers | FAIL | 510.1c | Missing required citations: 510.1c; Missing retrieved rules: 510.1c |
| N4 | META_test_cases.md | Lifelink rules | FAIL | 702.15b, 510.1c | Missing required citations: 702.15b, 510.1c; Missing retrieved rules: 702.15b, 510.1c; Review: Expected verdict contains self-correction language; manually verify the knowledge-base entry. |
| N5 | META_test_cases.md | Deathtouch with multiple blockers | FAIL | 702.2c, 510.1c | Missing required citations: 702.2c, 510.1c; Missing retrieved rules: 702.2c, 510.1c; Review: Expected verdict contains self-correction language; manually verify the knowledge-base entry. |
| N6 | META_test_cases.md | Creature removed from combat mid-step | FAIL | 509.1, 510.1d | Missing required citations: 509.1, 510.1d; Missing retrieved rules: 509.1, 510.1d; Review: Expected verdict contains self-correction language; manually verify the knowledge-base entry. |
| N7 | META_test_cases.md | Indestructible + lethal damage | FAIL | 702.12, 704.5g | Missing required citations: 702.12, 704.5g; Missing retrieved rules: 702.12, 704.5g |
| N8 | META_test_cases.md | Damage prevention vs. damage replacement | FAIL | 614.5 | Missing required citations: 614.5; Missing retrieved rules: 614.5 |
| O1 | META_test_cases.md | Tokens entering with counters | FAIL | 614.13 | Missing required citations: 614.13; Missing retrieved rules: 614.13 |
| O2 | META_test_cases.md | Anafenza vs. token | FAIL | 704.5d | Missing required citations: 704.5d; Missing retrieved rules: 704.5d; Verdict polarity mismatch; expected NO-style answer |
| O3 | META_test_cases.md | Token copy of a card with kicker | FAIL | 707.2, 702.74 | Missing required citations: 707.2, 702.74; Missing retrieved rules: 707.2, 702.74 |
| O4 | META_test_cases.md | Counters on a token that "should" carry | FAIL | 704.5d | Missing required citations: 704.5d; Missing retrieved rules: 704.5d; Verdict polarity mismatch; expected NO-style answer |
| P1 | META_test_cases.md | Planeswalker loyalty abilities are sorcery-speed | FAIL | 606.5, 307.1 | Missing required citations: 606.5, 307.1; Missing retrieved rules: 606.5, 307.1; Verdict polarity mismatch; expected NO-style answer |
| P2 | META_test_cases.md | Each planeswalker — loyalty once per turn | FAIL | 606.5b | Missing required citations: 606.5b; Missing retrieved rules: 606.5b; Verdict polarity mismatch; expected NO-style answer |
| P3 | META_test_cases.md | Mana ability does not require priority | FAIL | 605.3a | Missing required citations: 605.3a; Missing retrieved rules: 605.3a; Verdict polarity mismatch; expected NO-style answer; Review: Expected verdict contains self-correction language; manually verify the knowledge-base entry. |
| P4 | META_test_cases.md | "Activate only once per turn" tracking | FAIL | 602.5 | Missing required citations: 602.5; Missing retrieved rules: 602.5; Verdict polarity mismatch; expected NO-style answer |
| Q1 | META_test_cases.md | Mode chosen at casting | FAIL | 601.2b, 700.2 | Missing required citations: 601.2b, 700.2; Missing retrieved rules: 601.2b, 700.2 |
| Q2 | META_test_cases.md | Modal spell with one mode becoming illegal | FAIL | 700.2 | Missing required citations: 700.2; Missing retrieved rules: 700.2 |
| Q3 | META_test_cases.md | Charm "choose one or more" | FAIL | 700.2a | Missing required citations: 700.2a; Missing retrieved rules: 700.2a; Verdict polarity mismatch; expected NO-style answer |
| Q4 | META_test_cases.md | Choose new targets and the illegality rule | FAIL | 115.6 | Missing required citations: 115.6; Missing retrieved rules: 115.6; Verdict polarity mismatch; expected YES-style answer |
| Q5 | META_test_cases.md | As-enters choices | FAIL | 601.2b | Missing required citations: 601.2b; Missing retrieved rules: 601.2b; Verdict polarity mismatch; expected NO-style answer; Review: Expected verdict contains self-correction language; manually verify the knowledge-base entry. |
| R1 | META_test_cases.md | Cascade — exile order matters | FAIL | 702.85a | Missing required citations: 702.85a; Missing retrieved rules: 702.85a; Verdict polarity mismatch; expected NO-style answer |
| R2 | META_test_cases.md | Cascade — what about X spells? | FAIL | 702.85a, 107.3, 704.5f | Missing required citations: 702.85a, 107.3, 704.5f; Missing retrieved rules: 702.85a, 107.3, 704.5f; Verdict polarity mismatch; expected YES-style answer |
| R3 | META_test_cases.md | Suspend creates a delayed trigger | FAIL | 702.61 | Missing required citations: 702.61; Missing retrieved rules: 702.61 |
| R4 | META_test_cases.md | Foretell — alternative cost from exile | FAIL | 702.143 | Missing required citations: 702.143; Missing retrieved rules: 702.143 |
| R5 | META_test_cases.md | Mutate creates a merged permanent | FAIL | 702.139, 729.6 | Missing required citations: 702.139, 729.6; Missing retrieved rules: 702.139, 729.6 |

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

## B1. Eminence ability triggering from the Command Zone

Status: **FAIL**

Failures:
- Missing required citations: 603.6, 702.106
- Missing retrieved rules: 603.6, 702.106
- Verdict polarity mismatch; expected NO-style answer

Review warnings:
- Expected verdict contains self-correction language; manually verify the knowledge-base entry.

Scenario:
```text
I have [[Edgar Markov]] in the Command Zone (not cast yet). Eminence says "Whenever you cast another Vampire spell, create a 1/1 black Vampire creature token." I cast [[Bloodghast]]. Does Eminence trigger?
```

Expected verdict:
```text
No. Bloodghast is not a Vampire (it's a Vampire Spirit — wait, actually it is a Vampire). Let me reconsider. Bloodghast IS a Vampire Spirit. So Eminence does trigger because Bloodghast is a Vampire spell.

Corrected verdict: **Yes**, Eminence triggers. A 1/1 black Vampire creature token is created when Bloodghast resolves (Eminence is a triggered ability that fires when the spell is cast, and resolves through normal stack procedure).
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
- [903.9a] - If a commander is in a graveyard or in exile and that object was put into that zone since the last time state-based actions were checked, its owner may put it into the command zone. This is a state-based action. See rule 704.
- [608.2] - If the object that’s resolving is an instant spell, a sorcery spell, or an ability, its resolution may involve several steps. The steps described in rules 608.2a and 608.2b are followed first. The steps described in rules 608.2c–m are then followed as appropriate, in no specific order. The steps described in rule 608.2n and 608.2p are followed last.
- [603.2] - Whenever a game event or game state matches a triggered ability’s trigger event, that ability automatically triggers. The ability doesn’t do anything at this point.
- [603.1] - Triggered abilities have a trigger condition and an effect. They are written as “[When/Whenever/At] [trigger condition or event], [effect]. [Instructions (if any).]”
- [603.3] - Once an ability has triggered, its controller puts it on the stack as an object that’s not a card the next time a player would receive priority. See rule 117, “Timing and Priority.” The ability becomes the topmost object on the stack. It has the text of the ability that created it, and no other characteristics. It remains on the stack until it’s countered, it resolves, a rule causes it to be removed from the stack, or an effect moves it elsewhere.
CITATIONS
[903.9a], [608.2], [603.2], [603.1], [603.3]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```

## B2. Reflexive trigger during resolution

Status: **FAIL**

Failures:
- Missing required citations: 117.3b
- Missing retrieved rules: 117.3b
- Verdict polarity mismatch; expected NO-style answer

Scenario:
```text
I activate [[Bow of Nylea]]'s second ability: "Put up to four target creature cards from your graveyard on the bottom of your library." It targets three creature cards. The ability is resolving. While it's resolving, does anything trigger?
```

Expected verdict:
```text
No reflexive trigger here (Bow of Nylea doesn't have one). For a true reflexive-trigger test, see the next case. But the test for B2 is whether the engine correctly identifies that resolution proceeds without a priority window — players cannot respond mid-resolution.
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
- [603.2] - Whenever a game event or game state matches a triggered ability’s trigger event, that ability automatically triggers. The ability doesn’t do anything at this point.
- [603.1] - Triggered abilities have a trigger condition and an effect. They are written as “[When/Whenever/At] [trigger condition or event], [effect]. [Instructions (if any).]”
- [603.3] - Once an ability has triggered, its controller puts it on the stack as an object that’s not a card the next time a player would receive priority. See rule 117, “Timing and Priority.” The ability becomes the topmost object on the stack. It has the text of the ability that created it, and no other characteristics. It remains on the stack until it’s countered, it resolves, a rule causes it to be removed from the stack, or an effect moves it elsewhere.
- [608.2b] - If the spell or ability specifies targets, it checks whether the targets are still legal. A target that’s no longer in the zone it was in when it was targeted is illegal. Other changes to the game state may cause a target to no longer be legal; for example, its characteristics may have changed or an effect may have changed the text of the spell. If the source of an ability has left the zone it was in, its last known information is used during this process. If all its targets, for every instance of the word “target,” are now illegal, the spell or ability doesn’t resolve. It’s removed from the stack and, if it’s a spell, put into its owner’s graveyard. Otherwise, the spell or ability will resolve normally. Illegal targets, if any, won’t be affected by parts of a resolving spell’s effect for which they’re illegal. Other parts of the effect for which those targets are not illegal may still affect th
...
```

## B3. State trigger that's already on the stack

Status: **FAIL**

Failures:
- Missing required citations: 603.8
- Missing retrieved rules: 603.8

Scenario:
```text
[[Phage the Untouchable]] is in my graveyard. State-based actions are about to be checked. Will Phage's "if not cast from your hand, that player loses the game" trigger fire?
```

Expected verdict:
```text
This isn't a state trigger — it's a triggered ability that fires when Phage *enters the battlefield* not from being cast from your hand. So if Phage was put onto the battlefield by Reanimate, it triggers; if it's just sitting in the graveyard, no trigger.

For an actual state-trigger test, consider:[[Brago, King Eternal]]'s "if it has six or more counters on it" type effects. Or: A 0/0 creature is on the battlefield with no counters. SBA destroys it. Then I cast a spell that gives it +0/+1 with a static ability. Does anything re-fire?

For a state trigger like the planeswalker chapter trigger pattern: once a state trigger has been put on the stack, it does NOT trigger again from the same state until it leaves the stack and the state is no longer true (603.8).
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
- [903.9a] - If a commander is in a graveyard or in exile and that object was put into that zone since the last time state-based actions were checked, its owner may put it into the command zone. This is a state-based action. See rule 704.
- [701.8a] - To destroy a permanent, move it from the battlefield to its owner’s graveyard.
- [701.8b] - The only ways a permanent can be destroyed are as a result of an effect that uses the word “destroy” or as a result of the state-based actions that check for lethal damage (see rule 704.5g) or damage from a source with deathtouch (see rule 704.5h). If a permanent is put into its owner’s graveyard for any other reason, it hasn’t been “destroyed.”
- [603.2] - Whenever a game event or game state matches a triggered ability’s trigger event, that ability automatically triggers. The ability doesn’t do anything at this point.
- [704.5] - The state-based actions are as follows:
CITATIONS
[903.9a], [701.8a], [701.8b], [603.2], [704.5]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```

## C1. Commander damage with a copy of a commander

Status: **FAIL**

Failures:
- Missing required citations: 903.4, 903.10
- Missing retrieved rules: 903.4, 903.10
- Verdict polarity mismatch; expected NO-style answer

Scenario:
```text
I control my commander [[Krenko, Mob Boss]]. I cast [[Mirror Image]] copying Krenko. The copy attacks an opponent and deals 6 combat damage. The original Krenko also attacked and dealt 6 damage. Does the opponent have 12 commander damage from Krenko?
```

Expected verdict:
```text
No. The opponent has 6 commander damage. Only the original Krenko is a commander. The Mirror Image copy is a permanent that has Krenko's copiable values, but it is not a commander — commander status is not a copiable value [707, 903.4].
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
- [603.3] - Once an ability has triggered, its controller puts it on the stack as an object that’s not a card the next time a player would receive priority. See rule 117, “Timing and Priority.” The ability becomes the topmost object on the stack. It has the text of the ability that created it, and no other characteristics. It remains on the stack until it’s countered, it resolves, a rule causes it to be removed from the stack, or an effect moves it elsewhere.
- [603.1] - Triggered abilities have a trigger condition and an effect. They are written as “[When/Whenever/At] [trigger condition or event], [effect]. [Instructions (if any).]”
- [603.2] - Whenever a game event or game state matches a triggered ability’s trigger event, that ability automatically triggers. The ability doesn’t do anything at this point.
- [707.10] - To copy a spell, activated ability, or triggered ability means to put a copy of it onto the stack; a copy of a spell isn’t cast and a copy of an activated ability isn’t activated. A copy of a spell or ability copies both the characteristics of the spell or ability and all decisions made for it, including modes, targets, the value of X, and additional or alternative costs. (See rule 601, “Casting Spells.”) Choices that are normally made on resolution are not copied. If an effect of the copy refers to objects used to pay its costs, it uses the objects used to pay the costs of the original spell or ability. A copy of a spell is owned by the player under whose control it was put on the stack. A copy of a spell or ability is controlled by the player under whose control it was put on the stack. A copy of a spell is itself a spell, even though it has no spell card associated with it. A copy of an ability is itself an ability.
- [707.2] - When copying an object, the copy acquires the copiable values of the original object’s characteristics and, for an object on the stack, choices made when casting or activating it (mode, targets, the value of X, whether it was kicked, how it will affect multiple targets, and so on). The copiable values are the values derived f
...
```

## C2. Commander tax with alternative cost

Status: **FAIL**

Failures:
- Missing required citations: 601.2f, 903.7
- Missing retrieved rules: 601.2f, 903.7
- Verdict polarity mismatch; expected YES-style answer

Scenario:
```text
My commander [[Animar, Soul of Elements]] has died and returned to the command zone twice. I want to cast it for its evoke cost — wait, Animar doesn't have evoke. Use a generic example: my commander has been cast twice from the command zone already. I want to cast it again, but I have a [[Fist of Suns]] in play (allowing me to pay {WUBRG} as the alternative cost). Do I still pay the commander tax?
```

Expected verdict:
```text
Yes, the tax still applies. Commander tax is an additional cost that applies regardless of whether you're using the base mana cost or an alternative cost [903.7, 601.2f].
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
- [903.9a] - If a commander is in a graveyard or in exile and that object was put into that zone since the last time state-based actions were checked, its owner may put it into the command zone. This is a state-based action. See rule 704.
- [608.2] - If the object that’s resolving is an instant spell, a sorcery spell, or an ability, its resolution may involve several steps. The steps described in rules 608.2a and 608.2b are followed first. The steps described in rules 608.2c–m are then followed as appropriate, in no specific order. The steps described in rule 608.2n and 608.2p are followed last.
- [903.8] - A player may cast a commander they own from the command zone. A commander cast from the command zone costs an additional {2} for each previous time the player casting it has cast it from the command zone that game. This additional cost is informally known as the “commander tax.”
- [903.9] - A commander may return to the command zone during a Commander game.
- [603.3] - Once an ability has triggered, its controller puts it on the stack as an object that’s not a card the next time a player would receive priority. See rule 117, “Timing and Priority.” The ability becomes the topmost object on the stack. It has the text of the ability that created it, and no other characteristics. It remains on the stack until it’s countered, it resolves, a rule causes it to be removed from the stack, or an effect moves it elsewhere.
CITATIONS
[903.9a], [608.2], [903.8], [903.9], [603.3]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```

## C3. Partner commanders with different color identities

Status: **FAIL**

Failures:
- Missing required citations: 702.124, 903.4d
- Missing retrieved rules: 702.124, 903.4d
- Verdict polarity mismatch; expected YES-style answer

Scenario:
```text
I'm playing with partner commanders [[Tymna the Weaver]] and [[Thrasios, Triton Hero]]. Tymna is WB, Thrasios is GU. My deck includes [[Cyclonic Rift]]. Legal?
```

Expected verdict:
```text
Yes. With partner, the deck's color identity is the union of both commanders' identities: W ∪ B ∪ G ∪ U = WUBG. Cyclonic Rift (blue) is legal in a WUBG deck.
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
- [903.9a] - If a commander is in a graveyard or in exile and that object was put into that zone since the last time state-based actions were checked, its owner may put it into the command zone. This is a state-based action. See rule 704.
- [903.8] - A player may cast a commander they own from the command zone. A commander cast from the command zone costs an additional {2} for each previous time the player casting it has cast it from the command zone that game. This additional cost is informally known as the “commander tax.”
- [603.3] - Once an ability has triggered, its controller puts it on the stack as an object that’s not a card the next time a player would receive priority. See rule 117, “Timing and Priority.” The ability becomes the topmost object on the stack. It has the text of the ability that created it, and no other characteristics. It remains on the stack until it’s countered, it resolves, a rule causes it to be removed from the stack, or an effect moves it elsewhere.
- [903.9] - A commander may return to the command zone during a Commander game.
- [603.2] - Whenever a game event or game state matches a triggered ability’s trigger event, that ability automatically triggers. The ability doesn’t do anything at this point.
CITATIONS
[903.9a], [903.8], [603.3], [903.9], [603.2]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```

## C4. Mutate onto a commander

Status: **FAIL**

Failures:
- Missing required citations: 729.6
- Missing retrieved rules: 729.6

Scenario:
```text
My commander is [[Brokkos, Apex of Forever]]. I cast another mutate creature, [[Auspicious Starrix]], and mutate it onto Brokkos with Auspicious Starrix going on top. The merged permanent is then destroyed. Where do the cards go?
```

Expected verdict:
```text
- Brokkos, as a commander, has the choice (per 903.9a) to be sent to the command zone instead of the graveyard.
- Auspicious Starrix has no such option — it goes to the graveyard.
- If the player chooses to send Brokkos to the command zone, only Brokkos moves to the command zone; Starrix goes to the graveyard.
- Merged permanents separate when leaving the battlefield [729.6].
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
- [903.9a] - If a commander is in a graveyard or in exile and that object was put into that zone since the last time state-based actions were checked, its owner may put it into the command zone. This is a state-based action. See rule 704.
- [701.8b] - The only ways a permanent can be destroyed are as a result of an effect that uses the word “destroy” or as a result of the state-based actions that check for lethal damage (see rule 704.5g) or damage from a source with deathtouch (see rule 704.5h). If a permanent is put into its owner’s graveyard for any other reason, it hasn’t been “destroyed.”
- [123.6c] - The text that a name sticker is modifying may change due to other effects and/or a permanent’s face-down status (see rule 708, “Face-Down Spells and Permanents”). To determine the name of an object with one or more name stickers, start with the object’s copiable values, then apply each name sticker’s effect and each other text-changing effect in timestamp order. The position of each name sticker will continue to be after the number of words that were before it in the object’s name when it was placed. If there are fewer words in the object’s current name, the word on that sticker is added at the end of its name instead. The position and timestamp order of each name sticker on an object is remembered as the object that sticker is on moves from one public zone to another, and it continues to apply to the new object it becomes in that zone (see rule 123.5). This is an exception to rule 400.7.
- [607.5] - If an object acquires a pair of linked abilities as part of the same effect, the abilities will be similarly linked to one another on that object even though they weren’t printed on that object. They can’t be linked to any other ability, regardless of what other abilities the object may currently have or may have had in the past.
CITATIONS
[701.8a], [903.9a], [701.8b], [123.6c], [607.5]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model exp
...
```

## D1. Sacrifice-as-cost with cost reducer

Status: **FAIL**

Failures:
- Missing required citations: 601.2f
- Missing retrieved rules: 601.2f
- Verdict polarity mismatch; expected NO-style answer

Review warnings:
- Expected verdict contains self-correction language; manually verify the knowledge-base entry.

Scenario:
```text
I control [[Heartless Summoning]] (creatures cost {2} less to cast, enter with -1/-1). I want to cast [[Massacre Wurm]] (6-cost) by sacrificing [[Diligent Excavator]] using [[High Market]]'s ability — wait, that's not relevant. Better example: I want to cast [[Eldritch Evolution]] (cost {2}{G}) by sacrificing a creature. Does Heartless Summoning reduce the cost?
```

Expected verdict:
```text
No. Heartless Summoning reduces the cost of *creature spells*. Eldritch Evolution is a sorcery, not a creature. No reduction.

For a true sacrifice-as-cost-with-reducer test:I want to cast [[Massacre Wurm]] under Heartless Summoning. Does Heartless Summoning reduce the cost? Yes — Massacre Wurm is a creature spell. Cost becomes {2}{B}{B} instead of {2}{2}{B}{B} — wait, original cost is {4}{B}{B}, so reduced to {2}{B}{B}.
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
- [700.4] - The term dies means “is put into a graveyard from the battlefield.”
- [701.8a] - To destroy a permanent, move it from the battlefield to its owner’s graveyard.
- [603.3] - Once an ability has triggered, its controller puts it on the stack as an object that’s not a card the next time a player would receive priority. See rule 117, “Timing and Priority.” The ability becomes the topmost object on the stack. It has the text of the ability that created it, and no other characteristics. It remains on the stack until it’s countered, it resolves, a rule causes it to be removed from the stack, or an effect moves it elsewhere.
- [405.1] - When a spell is cast, the physical card is put on the stack (see rule 601.2a). When an ability is activated or triggers, it goes on top of the stack without any card associated with it (see rules 602.2a and 603.3).
CITATIONS
[608.2], [700.4], [701.8a], [603.3], [405.1]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```

## E1. Layer interaction — characteristic-defining ability and Humility

Status: **FAIL**

Failures:
- Missing required citations: 613.1f, 613.3, 604.3
- Missing retrieved rules: 613.1f, 613.3, 604.3

Scenario:
```text
[[Humility]] is on the battlefield: "All creatures lose all abilities and have base power and toughness 1/1." I control [[Tarmogoyf]] (a creature whose power/toughness are defined by the card types in all graveyards). What is Tarmogoyf's power and toughness?
```

Expected verdict:
```text
Tarmogoyf is 1/1.
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
- [704.5] - The state-based actions are as follows:
- [712.13a] - Some abilities may cause a double-faced spell with its front face up on the stack to enter the battlefield transformed or converted. If the back face of the card that represents that spell is an instant or sorcery face, or that spell is a copy of a double-faced card created with an instant or sorcery back face, it doesn’t enter the battlefield, and is instead put into its owner’s graveyard.
- [707.9d] - When applying a copy effect that doesn’t copy a certain characteristic, retains one or more original values for a certain characteristic, or provides a specific set of values for a certain characteristic, any characteristic-defining ability (see rule 604.3) of the object being copied that defines that characteristic is not copied. If that characteristic is color, any color indicator (see rule 204) of that object is also not copied. This rule does not apply to copy effects with exceptions that state the object is a certain card type, supertype, and/or subtype “in addition to its other types.” In those cases, any characteristic-defining ability that defines card type, supertype, and/or subtype is copied.
- [707.2] - When copying an object, the copy acquires the copiable values of the original object’s characteristics and, for an object on the stack, choices made when casting or activating it (mode, targets, the value of X, whether it was kicked, how it will affect multiple targets, and so on). The copiable values are the values derived from the text printed on the object (that text being name, mana cost, color indicator, card type, subtype, supertype, rules text, power, toughness, and/or loyalty), as modified by other copy effects, by its face-down status, and by “as . . . enters” and “as . . . is turned face up” abilities that set power and toughness (and may also set additional characteristics). Other effects (including type-changing and text-changing effects), status, counters, and stickers are not copied.
CITATIONS
[700.4],
...
```

## E2. Timestamp interaction

Status: **FAIL**

Failures:
- Missing required citations: 613.3c
- Missing retrieved rules: 613.3c

Scenario:
```text
[[Crusade]] is on the battlefield (controlled by Player A, timestamp T1): "White creatures get +1/+1." Player B casts [[Glorious Anthem]] (timestamp T2): "Creatures you control get +1/+1." Player A controls a white 2/2 creature. What is its P/T?
```

Expected verdict:
```text
The white 2/2 controlled by Player A is 3/3. (Crusade buffs Player A's creature, but Glorious Anthem does not — it only buffs Player B's creatures.)
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
- [616.1f] - Once the chosen effect has been applied, this process is repeated (taking into account only replacement or prevention effects that would now be applicable) until there are no more left to apply.
- [608.2f] - Some spells and abilities include actions taken on multiple players and/or objects. In most cases, each such action is processed simultaneously. If the action can’t be processed simultaneously, it’s instead processed considering each affected player or object individually. APNAP order is used to make the primary determination of the order of those actions. Secondarily, if the action is to be taken on both a player and an object they control or on multiple objects controlled by the same player, the player who controls the resolving spell or ability chooses the relative order of those actions.
- [712.13a] - Some abilities may cause a double-faced spell with its front face up on the stack to enter the battlefield transformed or converted. If the back face of the card that represents that spell is an instant or sorcery face, or that spell is a copy of a double-faced card created with an instant or sorcery back face, it doesn’t enter the battlefield, and is instead put into its owner’s graveyard.
- [613.5] - The application of continuous effects as described by the layer system is continually and automatically performed by the game. All resulting changes to an object’s characteristics are instantaneous.
- [120.4d] - Finally, the damage event occurs.
CITATIONS
[616.1f], [608.2f], [712.13a], [613.5], [120.4d]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```

## F1. Daybound/Nightbound in 4-player Commander

Status: **FAIL**

Failures:
- Missing required citations: 730.3
- Missing retrieved rules: 730.3
- Verdict polarity mismatch; expected NO-style answer

Scenario:
```text
It is currently day. The most recent player (Player A) cast 0 spells last turn. Player B cast 2 spells last turn. Player C cast 1 spell last turn. Player D (the active player) is about to begin their turn. Does it become night?
```

Expected verdict:
```text
No. Day/Night transitions check the *previous player's* turn, not the current player's incoming turn. The check happens at the start of the active player's precombat main phase. Day becomes night if the previous player cast no spells during their turn.

In a 4-player game, "previous player" means the player whose turn just ended — Player C, who cast 1 spell. So day does NOT transition to night [730.3].
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
- [117.3b] - The active player receives priority after a spell or ability (other than a mana ability) resolves.
- [603.3] - Once an ability has triggered, its controller puts it on the stack as an object that’s not a card the next time a player would receive priority. See rule 117, “Timing and Priority.” The ability becomes the topmost object on the stack. It has the text of the ability that created it, and no other characteristics. It remains on the stack until it’s countered, it resolves, a rule causes it to be removed from the stack, or an effect moves it elsewhere.
- [405.1] - When a spell is cast, the physical card is put on the stack (see rule 601.2a). When an ability is activated or triggers, it goes on top of the stack without any card associated with it (see rules 602.2a and 603.3).
- [608.2] - If the object that’s resolving is an instant spell, a sorcery spell, or an ability, its resolution may involve several steps. The steps described in rules 608.2a and 608.2b are followed first. The steps described in rules 608.2c–m are then followed as appropriate, in no specific order. The steps described in rule 608.2n and 608.2p are followed last.
- [603.2] - Whenever a game event or game state matches a triggered ability’s trigger event, that ability automatically triggers. The ability doesn’t do anything at this point.
CITATIONS
[117.3b], [603.3], [405.1], [608.2], [603.2]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```

## F2. APNAP in 4-player with simultaneous decisions

Status: **FAIL**

Failures:
- Missing required citations: 101.4
- Missing retrieved rules: 101.4

Scenario:
```text
[[Wrath of God]] resolves in a 4-player game. Players in turn order: A (active), B, C, D. Each player has a creature with a "When this dies" trigger. All four triggers fire simultaneously. What order do they go on the stack?
```

Expected verdict:
```text
- Triggers go on the stack in APNAP order: A first, then B, then C, then D.
- Each player can order their own triggers if they have multiple, but with one per player, the order is A → B → C → D.
- The stack resolves LIFO, so D's trigger resolves first.
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
- [700.4] - The term dies means “is put into a graveyard from the battlefield.”
- [701.8a] - To destroy a permanent, move it from the battlefield to its owner’s graveyard.
- [603.3] - Once an ability has triggered, its controller puts it on the stack as an object that’s not a card the next time a player would receive priority. See rule 117, “Timing and Priority.” The ability becomes the topmost object on the stack. It has the text of the ability that created it, and no other characteristics. It remains on the stack until it’s countered, it resolves, a rule causes it to be removed from the stack, or an effect moves it elsewhere.
- [117.3b] - The active player receives priority after a spell or ability (other than a mana ability) resolves.
CITATIONS
[608.2], [700.4], [701.8a], [603.3], [117.3b]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```

## G1. Player leaving with stack objects

Status: **FAIL**

Failures:
- Missing required citations: 800.4, 800.4a, 800.4b
- Missing retrieved rules: 800.4, 800.4a, 800.4b

Scenario:
```text
Player B controls [[Mind Control]] on Player A's [[Lord of the Pit]]. Player B has just cast [[Lightning Bolt]] targeting Player C. While Lightning Bolt is on the stack, Player B loses the game. What happens?
```

Expected verdict:
```text
- Player B leaving causes [800.4]:
  - All objects owned by Player B leave the game (Lightning Bolt is removed from the stack — countered by leaving the game).
  - All effects controlled by Player B end. Mind Control's continuous effect ends, returning Lord of the Pit to Player A's control.
  - All triggers/effects on the stack controlled by Player B but not owned by Player B: these are removed from the stack (cease to exist).
- Net result: Lightning Bolt does not resolve. Player A regains control of Lord of the Pit immediately.
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
- [405.1] - When a spell is cast, the physical card is put on the stack (see rule 601.2a). When an ability is activated or triggers, it goes on top of the stack without any card associated with it (see rules 602.2a and 603.3).
- [603.2] - Whenever a game event or game state matches a triggered ability’s trigger event, that ability automatically triggers. The ability doesn’t do anything at this point.
- [117.3b] - The active player receives priority after a spell or ability (other than a mana ability) resolves.
CITATIONS
[608.2], [603.3], [405.1], [603.2], [117.3b]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```

## H1. The Replacement-vs-Replaced distinction

Status: **FAIL**

Failures:
- Verdict polarity mismatch; expected NO-style answer

Scenario:
```text
[[Rest in Peace]] is on the battlefield. A creature is destroyed. Does anything see the creature "die"?
```

Expected verdict:
```text
No. The replacement effect substitutes "to exile" for "to graveyard." The final event is exile, not death. No "dies" trigger fires. [Axiom 4]
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
- [700.4] - The term dies means “is put into a graveyard from the battlefield.”
- [614.6] - If an event is replaced, it never happens. A modified event occurs instead, which may in turn trigger abilities. Note that the modified event may contain instructions that can’t be carried out, in which case the impossible instruction is simply ignored.
- [701.8b] - The only ways a permanent can be destroyed are as a result of an effect that uses the word “destroy” or as a result of the state-based actions that check for lethal damage (see rule 704.5g) or damage from a source with deathtouch (see rule 704.5h). If a permanent is put into its owner’s graveyard for any other reason, it hasn’t been “destroyed.”
- [603.2] - Whenever a game event or game state matches a triggered ability’s trigger event, that ability automatically triggers. The ability doesn’t do anything at this point.
CITATIONS
[701.8a], [700.4], [614.6], [701.8b], [603.2]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```

## H3. "Can't" Beats "Can"

Status: **FAIL**

Failures:
- Missing required citations: 101.2
- Missing retrieved rules: 101.2
- Verdict polarity mismatch; expected NO-style answer

Scenario:
```text
An opponent controls [[Teferi's Protection]] in effect (their permanents have "phased out" status and they can't lose the game). I cast [[Mindslaver]] targeting that opponent. I want to use my Mindslaver-controlled turn to make them concede — wait, they can still concede regardless. Different test:[[Iona, Shield of Emeria]] is on the battlefield naming "Red." I am controlling Iona (it's my permanent, but I named red when it ETBed). I want to cast [[Lightning Bolt]]. Iona's static ability says I "can't cast red spells." Can I cast Lightning Bolt?
```

Expected verdict:
```text
No. Iona's "can't" overrides any "can" permissions [101.2].
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
- [608.2] - If the object that’s resolving is an instant spell, a sorcery spell, or an ability, its resolution may involve several steps. The steps described in rules 608.2a and 608.2b are followed first. The steps described in rules 608.2c–m are then followed as appropriate, in no specific order. The steps described in rule 608.2n and 608.2p are followed last.
- [603.3] - Once an ability has triggered, its controller puts it on the stack as an object that’s not a card the next time a player would receive priority. See rule 117, “Timing and Priority.” The ability becomes the topmost object on the stack. It has the text of the ability that created it, and no other characteristics. It remains on the stack until it’s countered, it resolves, a rule causes it to be removed from the stack, or an effect moves it elsewhere.
- [701.8b] - The only ways a permanent can be destroyed are as a result of an effect that uses the word “destroy” or as a result of the state-based actions that check for lethal damage (see rule 704.5g) or damage from a source with deathtouch (see rule 704.5h). If a permanent is put into its owner’s graveyard for any other reason, it hasn’t been “destroyed.”
- [405.1] - When a spell is cast, the physical card is put on the stack (see rule 601.2a). When an ability is activated or triggers, it goes on top of the stack without any card associated with it (see rules 602.2a and 603.3).
CITATIONS
[701.8a], [608.2], [603.3], [701.8b], [405.1]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```

## I1. Stack object ownership confusion

Status: **FAIL**

Failures:
- Missing required citations: 112.3
- Missing retrieved rules: 112.3

Scenario:
```text
Player A casts [[Mind's Desire]] and exiles [[Brainstorm]]. Player A cast Brainstorm from exile per Mind's Desire's effect. Who is the controller of Brainstorm while it's on the stack?
```

Expected verdict:
```text
Player A.
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
- [405.1] - When a spell is cast, the physical card is put on the stack (see rule 601.2a). When an ability is activated or triggers, it goes on top of the stack without any card associated with it (see rules 602.2a and 603.3).
- [117.3b] - The active player receives priority after a spell or ability (other than a mana ability) resolves.
- [608.2] - If the object that’s resolving is an instant spell, a sorcery spell, or an ability, its resolution may involve several steps. The steps described in rules 608.2a and 608.2b are followed first. The steps described in rules 608.2c–m are then followed as appropriate, in no specific order. The steps described in rule 608.2n and 608.2p are followed last.
- [603.3] - Once an ability has triggered, its controller puts it on the stack as an object that’s not a card the next time a player would receive priority. See rule 117, “Timing and Priority.” The ability becomes the topmost object on the stack. It has the text of the ability that created it, and no other characteristics. It remains on the stack until it’s countered, it resolves, a rule causes it to be removed from the stack, or an effect moves it elsewhere.
- [603.1] - Triggered abilities have a trigger condition and an effect. They are written as “[When/Whenever/At] [trigger condition or event], [effect]. [Instructions (if any).]”
CITATIONS
[405.1], [117.3b], [608.2], [603.3], [603.1]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```

## I2. Mid-resolution state changes

Status: **FAIL**

Failures:
- Verdict polarity mismatch; expected NO-style answer

Scenario:
```text
[[Crackling Doom]] resolves: each opponent sacrifices the creature with the greatest power among creatures they control, then Crackling Doom deals 2 damage to each opponent. Between the sacrifice step and the damage step, can I cast an instant?
```

Expected verdict:
```text
No. The two parts of Crackling Doom's effect are part of the same resolution. No priority window between them.
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
- [701.8a] - To destroy a permanent, move it from the battlefield to its owner’s graveyard.
- [701.8b] - The only ways a permanent can be destroyed are as a result of an effect that uses the word “destroy” or as a result of the state-based actions that check for lethal damage (see rule 704.5g) or damage from a source with deathtouch (see rule 704.5h). If a permanent is put into its owner’s graveyard for any other reason, it hasn’t been “destroyed.”
- [707.10] - To copy a spell, activated ability, or triggered ability means to put a copy of it onto the stack; a copy of a spell isn’t cast and a copy of an activated ability isn’t activated. A copy of a spell or ability copies both the characteristics of the spell or ability and all decisions made for it, including modes, targets, the value of X, and additional or alternative costs. (See rule 601, “Casting Spells.”) Choices that are normally made on resolution are not copied. If an effect of the copy refers to objects used to pay its costs, it uses the objects used to pay the costs of the original spell or ability. A copy of a spell is owned by the player under whose control it was put on the stack. A copy of a spell or ability is controlled by the player under whose control it was put on the stack. A copy of a spell is itself a spell, even though it has no spell card associated with it. A copy of an ability is itself an ability.
- [608.2f] - Some spells and abilities include actions taken on multiple players and/or objects. In most cases, each such action is processed simultaneously. If the action can’t be processed simultaneously, it’s instead processed considering each affected player or object individually. APNAP order is used to make the primary determination 
...
```

## I3. Modal spell — which mode is chosen?

Status: **PASS**

Scenario:
```text
When is the mode chosen for a modal spell — at casting or at resolution?
```

Expected verdict:
```text
At casting (601.2b). The mode is locked in when the spell is cast.
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
- [707.10] - To copy a spell, activated ability, or triggered ability means to put a copy of it onto the stack; a copy of a spell isn’t cast and a copy of an activated ability isn’t activated. A copy of a spell or ability copies both the characteristics of the spell or ability and all decisions made for it, including modes, targets, the value of X, and additional or alternative costs. (See rule 601, “Casting Spells.”) Choices that are normally made on resolution are not copied. If an effect of the copy refers to objects used to pay its costs, it uses the objects used to pay the costs of the original spell or ability. A copy of a spell is owned by the player under whose control it was put on the stack. A copy of a spell or ability is controlled by the player under whose control it was put on the stack. A copy of a spell is itself a spell, even though it has no spell card associated with it. A copy of an ability is itself an ability.
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that
...
```

## J1. X cost is locked at casting

Status: **FAIL**

Failures:
- Missing required citations: 601.2b, 601.2f
- Missing retrieved rules: 601.2b, 601.2f

Scenario:
```text
I cast [[Fireball]] with X=3 against a single target. While Fireball is on the stack, my opponent casts [[Mana Drain]] countering it and gains 3 mana. Later, I cast another [[Fireball]] — does its X carry over from the first, or is it determined fresh?
```

Expected verdict:
```text
X is determined and locked when the spell is cast [601.2f]. Each Fireball cast is an independent casting event with its own X chosen at 601.2b (modes/choices) and locked at 601.2f. The first Fireball's X=3 has no bearing on the second.
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
- [700.4] - The term dies means “is put into a graveyard from the battlefield.”
- [405.1] - When a spell is cast, the physical card is put on the stack (see rule 601.2a). When an ability is activated or triggers, it goes on top of the stack without any card associated with it (see rules 602.2a and 603.3).
- [117.3b] - The active player receives priority after a spell or ability (other than a mana ability) resolves.
- [603.3] - Once an ability has triggered, its controller puts it on the stack as an object that’s not a card the next time a player would receive priority. See rule 117, “Timing and Priority.” The ability becomes the topmost object on the stack. It has the text of the ability that created it, and no other characteristics. It remains on the stack until it’s countered, it resolves, a rule causes it to be removed from the stack, or an effect moves it elsewhere.
CITATIONS
[608.2], [700.4], [405.1], [117.3b], [603.3]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```

## J2. Commander tax stacks with other taxes

Status: **FAIL**

Failures:
- Missing required citations: 601.2f, 903.7
- Missing retrieved rules: 601.2f, 903.7

Scenario:
```text
My commander [[Krenko, Mob Boss]] has been cast from the command zone twice already (tax = {4}). My opponent controls [[Thalia, Guardian of Thraben]]: "Noncreature spells cost {1} more to cast." I want to cast Krenko again. What's the total mana cost?
```

Expected verdict:
```text
Krenko is a creature spell, so Thalia's static effect does NOT apply. Total cost = Krenko's mana cost {2}{R}{R} + commander tax {4} = {6}{R}{R}. Thalia is irrelevant here.
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
- [903.9a] - If a commander is in a graveyard or in exile and that object was put into that zone since the last time state-based actions were checked, its owner may put it into the command zone. This is a state-based action. See rule 704.
- [903.9] - A commander may return to the command zone during a Commander game.
- [903.8] - A player may cast a commander they own from the command zone. A commander cast from the command zone costs an additional {2} for each previous time the player casting it has cast it from the command zone that game. This additional cost is informally known as the “commander tax.”
- [603.3] - Once an ability has triggered, its controller puts it on the stack as an object that’s not a card the next time a player would receive priority. See rule 117, “Timing and Priority.” The ability becomes the topmost object on the stack. It has the text of the ability that created it, and no other characteristics. It remains on the stack until it’s countered, it resolves, a rule causes it to be removed from the stack, or an effect moves it elsewhere.
- [603.2] - Whenever a game event or game state matches a triggered ability’s trigger event, that ability automatically triggers. The ability doesn’t do anything at this point.
CITATIONS
[903.9a], [903.9], [903.8], [603.3], [603.2]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```

## J3. Thalia DOES apply to noncreature commander

Status: **FAIL**

Failures:
- Missing required citations: 601.2f, 601.2i
- Missing retrieved rules: 601.2f, 601.2i
- Verdict polarity mismatch; expected YES-style answer

Scenario:
```text
My commander is [[Niv-Mizzet, Parun]] (a creature). My opponent controls [[Thalia, Guardian of Thraben]]. I want to cast [[Counterspell]] (not my commander). Niv-Mizzet has "Niv-Mizzet, Parun can't be countered. Whenever you cast an instant or sorcery spell, draw a card." Does Thalia's tax apply to Counterspell, and does the draw trigger?
```

Expected verdict:
```text
Yes, Thalia's tax applies — Counterspell is a noncreature spell, costs {1}{U}{U} instead of {U}{U}. The draw trigger fires when Counterspell is cast [601.2i].
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
- [603.1] - Triggered abilities have a trigger condition and an effect. They are written as “[When/Whenever/At] [trigger condition or event], [effect]. [Instructions (if any).]”
- [603.2] - Whenever a game event or game state matches a triggered ability’s trigger event, that ability automatically triggers. The ability doesn’t do anything at this point.
- [707.10] - To copy a spell, activated ability, or triggered ability means to put a copy of it onto the stack; a copy of a spell isn’t cast and a copy of an activated ability isn’t activated. A copy of a spell or ability copies both the characteristics of the spell or ability and all decisions made for it, including modes, targets, the value of X, and additional or alternative costs. (See rule 601, “Casting Spells.”) Choices that are normally made on resolution are not copied. If an effect of the copy refers to objects used to pay its costs, it uses the objects used to pay the costs of the original spell or ability. A copy of a spell is owned by the player under whose control it was put on the stack. A copy of a spell or ability is controlled by the player under whose control it was put on the stack. A copy of a spell is itself a spell, even though it has no spell card associated with it. A copy of an abili
...
```

## J4. Phyrexian mana with life replacement

Status: **FAIL**

Failures:
- Missing required citations: 101.2, 107.4, 601.2g
- Missing retrieved rules: 101.2, 107.4, 601.2g
- Verdict polarity mismatch; expected NO-style answer

Scenario:
```text
I control [[Platinum Emperion]] (my life total can't change). I want to cast [[Mutagenic Growth]] paying its Phyrexian green: 2 life instead of {G}. Can I cast it?
```

Expected verdict:
```text
No. Paying 2 life requires losing 2 life. Platinum Emperion's static "your life total can't change" prevents this loss. Since the cost cannot be paid, the spell cannot be cast [101.2, 601.2g].
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
- [903.9a] - If a commander is in a graveyard or in exile and that object was put into that zone since the last time state-based actions were checked, its owner may put it into the command zone. This is a state-based action. See rule 704.
- [603.3] - Once an ability has triggered, its controller puts it on the stack as an object that’s not a card the next time a player would receive priority. See rule 117, “Timing and Priority.” The ability becomes the topmost object on the stack. It has the text of the ability that created it, and no other characteristics. It remains on the stack until it’s countered, it resolves, a rule causes it to be removed from the stack, or an effect moves it elsewhere.
- [405.1] - When a spell is cast, the physical card is put on the stack (see rule 601.2a). When an ability is activated or triggers, it goes on top of the stack without any card associated with it (see rules 602.2a and 603.3).
- [603.2] - Whenever a game event or game state matches a triggered ability’s trigger event, that ability automatically triggers. The ability doesn’t do anything at this point.
CITATIONS
[608.2], [903.9a], [603.3], [405.1], [603.2]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```

## J5. Cost reducer can't reduce colored requirement

Status: **FAIL**

Failures:
- Missing required citations: 601.2f
- Missing retrieved rules: 601.2f

Scenario:
```text
I control [[Heartless Summoning]] (creature spells cost {2} less). I want to cast [[Lightning Angel]] (cost {1}{U}{R}{W}). What is the cost after reduction?
```

Expected verdict:
```text
{U}{R}{W}. Heartless Summoning reduces the generic portion ({1}) by {1} maximum — only {1} of generic is available to reduce. The colored requirements {U}, {R}, {W} cannot be reduced by generic-mana reductions.
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
- [702.51b] - The convoke ability isn’t an additional or alternative cost and applies only after the total cost of the spell with convoke is determined.
- [700.14] - Some abilities trigger “Whenever you expend N.” A player expends N if they pay a cost to cast a spell and the amount of mana that player spent this turn to cast spells prior to paying that cost was less than N and became at least N after paying that cost.
- [118.12] - Some spells, activated abilities, and triggered abilities read, “[Do something]. If [a player] [does, doesn’t, or can’t], [effect].” Or “[A player] may [do something]. If [that player] [does, doesn’t, or can’t], [effect].” The action [do something] is a cost, paid when the spell or ability resolves. The “If [a player] [does, doesn’t, or can’t]” clause checks whether the player chose to pay an optional cost or started to pay a mandatory cost, regardless of what events actually occurred.
- [707.10] - To copy a spell, activated ability, or triggered ability means to put a copy of it onto the stack; a copy of a spell isn’t cast and a copy of an activated ability isn’t activated. A copy of a spell or ability copies both the characteristics of the spell or ability and all decisions made for it, including modes, targets, the value of X, and additional or alternative costs. (See rule 601, “Casting Spells.”) Choices that are normally made on resolution are not copied. If an effect of the copy refers to objects used to pay its costs, it uses the objects used to pay the costs of the original spell or ability. A copy of a spell is owned by the player under whose control it was put on the stack. A copy of a spell or ability is controlled by the player under whose control it was put on the stack. A copy of a spell is itself a spell, even though it has no spell card associated with it. A copy of an ability is itself an ability.
- [601.2h] - The player pays the total cost. First, they pay all costs that don’t involve random elements or moving objects from the library to a public zone, in any order. Then they pay all remaining costs in any order. Partial pay
...
```

## J6. Additional cost (sacrifice) — what if the creature dies in response?

Status: **FAIL**

Failures:
- Missing required citations: 601.2, 601.2g, 601.2i, 117.3c
- Missing retrieved rules: 601.2, 601.2g, 601.2i, 117.3c
- Verdict polarity mismatch; expected NO-style answer

Scenario:
```text
I begin casting [[Diabolic Intent]] (cost: {B}, sacrifice a creature). I have one creature: a [[Llanowar Elves]]. I announce the spell. My opponent casts [[Murder]] on Llanowar Elves in response — wait, can they?
```

Expected verdict:
```text
No. The cast process for Diabolic Intent (announcing it, paying its costs including the sacrifice) is a single uninterruptable sequence. No player gets priority during cost payment [601.2]. After Diabolic Intent is on the stack (Llanowar Elves already sacrificed), opponents get priority — but the Elves are already in the graveyard.
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
- [701.8a] - To destroy a permanent, move it from the battlefield to its owner’s graveyard.
- [405.1] - When a spell is cast, the physical card is put on the stack (see rule 601.2a). When an ability is activated or triggers, it goes on top of the stack without any card associated with it (see rules 602.2a and 603.3).
- [117.3b] - The active player receives priority after a spell or ability (other than a mana ability) resolves.
- [701.8b] - The only ways a permanent can be destroyed are as a result of an effect that uses the word “destroy” or as a result of the state-based actions that check for lethal damage (see rule 704.5g) or damage from a source with deathtouch (see rule 704.5h). If a permanent is put into its owner’s graveyard for any other reason, it hasn’t been “destroyed.”
CITATIONS
[608.2], [701.8a], [405.1], [117.3b], [701.8b]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```

## J7. Alternative cost replaces base cost, additional costs still apply

Status: **FAIL**

Failures:
- Missing required citations: 118.9, 601.2f
- Missing retrieved rules: 118.9, 601.2f
- Verdict polarity mismatch; expected YES-style answer

Scenario:
```text
I want to cast [[Force of Will]] using its alternative cost: exile a blue card from my hand and pay 1 life. My opponent controls [[Trinisphere]] ("Each spell costs at least {3} to cast"). Does Trinisphere apply?
```

Expected verdict:
```text
Yes. Trinisphere's effect modifies the *total cost* of the spell, including when an alternative cost is paid. Force of Will's alternative cost is {0} mana + exile blue card + 1 life. Trinisphere raises the total mana cost to {3}. So Force of Will costs: {3} + exile blue card + 1 life.
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
- [405.1] - When a spell is cast, the physical card is put on the stack (see rule 601.2a). When an ability is activated or triggers, it goes on top of the stack without any card associated with it (see rules 602.2a and 603.3).
- [117.3b] - The active player receives priority after a spell or ability (other than a mana ability) resolves.
- [614.1] - Some continuous effects are replacement effects. Like prevention effects (see rule 615), replacement effects apply continuously as events happen—they aren’t locked in ahead of time. Such effects watch for a particular event that would happen and completely or partially replace that event with a different event. They act like “shields” around whatever they’re affecting.
- [608.2] - If the object that’s resolving is an instant spell, a sorcery spell, or an ability, its resolution may involve several steps. The steps described in rules 608.2a and 608.2b are followed first. The steps described in rules 608.2c–m are then followed as appropriate, in no specific order. The steps described in rule 608.2n and 608.2p are followed last.
- [614.6] - If an event is replaced, it never happens. A modified event occurs instead, which may in turn trigger abilities. Note that the modified event may contain instructions that can’t be carried out, in which case the impossible instruction is simply ignored.
CITATIONS
[405.1], [117.3b], [614.1], [608.2], [614.6]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```

## J8. Mana ability activated DURING cost payment

Status: **FAIL**

Failures:
- Missing required citations: 605.3a, 601.2g
- Missing retrieved rules: 605.3a, 601.2g
- Verdict polarity mismatch; expected YES-style answer

Scenario:
```text
I want to cast [[Cryptic Command]] (cost {1}{U}{U}{U}). I have 3 Islands tapped already and an [[Urza's Tower]] (taps for {3}) untapped. Can I tap Urza's Tower to add mana during cost payment, after I've already started paying?
```

Expected verdict:
```text
Yes. Mana abilities (605) can be activated during cost payment without using the stack. Players may activate them between announcing a spell and finishing payment [605.3a].
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
- [702.180a] - Harmonize represents three static abilities: one that functions while the card is in a player’s graveyard and two that function while the spell with harmonize is on the stack. “Harmonize [cost]” means “You may cast this card from your graveyard by paying [cost] and tapping up to one untapped creature you control rather than paying this spell’s mana cost,” “If you cast this spell using its harmonize ability, its total cost is reduced by an amount of generic mana equal to the tapped creature’s power,” and “If the harmonize cost was paid, exile this card instead of putting it anywhere else any time it would leave the stack.” Casting a spell using its harmonize ability follows the rules for paying alternative costs in rules 601.2b and 601.2f–h.
- [702.143a] - Foretell is a keyword that functions while the card with foretell is in a player’s hand. Any time a player has priority during their turn, that player may pay {2} and exile a card with foretell from their hand face down. That player may look at that card as long as it remains in exile. They may cast that card after the current turn has ended by paying any foretell cost it has rather than paying that spell’s mana cost. Casting a spell this way follows the rules for paying alternative costs in rules 601.2b and 601.2f–h.
- [702.78a] - Conspire is a keyword that represents two abilities. The first is a static ability that functions while the spell with conspire is on the stack. The second is a triggered ability that functions while the spell with conspire is on the stack. “Conspire” means “As an additional cost to cast this spell, you may tap two untapped creatures you control that each share a color with it” and “When you cast this spell, if its co
...
```

## K1. Layer 1 (copy) applies before Layer 7 (P/T)

Status: **FAIL**

Failures:
- Missing required citations: 613.1a, 613.3c
- Missing retrieved rules: 613.1a, 613.3c

Scenario:
```text
I control [[Phyrexian Metamorph]] entering as a copy of an opponent's [[Birds of Paradise]] (1/1). I also control [[Glorious Anthem]] ("Creatures you control get +1/+1"). What is Phyrexian Metamorph's power and toughness?
```

Expected verdict:
```text
2/2. The copy effect in layer 1 sets the printed/copyable values to Birds of Paradise's (1/1). Layer 7c then applies Glorious Anthem's +1/+1. Result: 2/2.
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
- [405.1] - When a spell is cast, the physical card is put on the stack (see rule 601.2a). When an ability is activated or triggers, it goes on top of the stack without any card associated with it (see rules 602.2a and 603.3).
- [117.3b] - The active player receives priority after a spell or ability (other than a mana ability) resolves.
- [603.2] - Whenever a game event or game state matches a triggered ability’s trigger event, that ability automatically triggers. The ability doesn’t do anything at this point.
CITATIONS
[608.2], [603.3], [405.1], [117.3b], [603.2]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```

## K2. Layer 2 control change — control-dependent abilities

Status: **FAIL**

Failures:
- Missing required citations: 613.1b, 613.3c
- Missing retrieved rules: 613.1b, 613.3c

Scenario:
```text
Player A controls [[Steal Enchantment]] enchanting Player B's [[Honor of the Pure]] ("Creatures you control get +1/+1"). Player A has 2/2 humans on the battlefield. Player B has 2/2 humans. Whose creatures get +1/+1?
```

Expected verdict:
```text
Player A's creatures get +1/+1. "Creatures you control" refers to the controller of Honor of the Pure. After Steal Enchantment, Honor of the Pure's controller is Player A. So "you" = Player A.
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
- [613.5] - The application of continuous effects as described by the layer system is continually and automatically performed by the game. All resulting changes to an object’s characteristics are instantaneous.
- [616.1f] - Once the chosen effect has been applied, this process is repeated (taking into account only replacement or prevention effects that would now be applicable) until there are no more left to apply.
- [712.13a] - Some abilities may cause a double-faced spell with its front face up on the stack to enter the battlefield transformed or converted. If the back face of the card that represents that spell is an instant or sorcery face, or that spell is a copy of a double-faced card created with an instant or sorcery back face, it doesn’t enter the battlefield, and is instead put into its owner’s graveyard.
- [120.4d] - Finally, the damage event occurs.
- [508.4] - If a creature is put onto the battlefield attacking, its controller chooses which defending player, planeswalker a defending player controls, or battle a defending player protects it’s attacking as it enters the battlefield (unless the effect that put it onto the battlefield specifies what it’s attacking). Similarly, if an effect states that a creature is attacking, its controller chooses which defending player, planeswalker a defending player controls, or battle a defending player protects it’s attacking (unless the effect has already specified). Such creatures are “attacking” but, for the purposes of trigger events and effects, they never “attacked.” They remain attacking creatures until they’re removed from combat or the combat phase ends, whichever comes first.
CITATIONS
[613.5], [616.1f], [712.13a], [120.4d], [508.4]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```

## K3. Layer 4 type change cascades

Status: **FAIL**

Failures:
- Missing required citations: 613.1d
- Missing retrieved rules: 613.1d

Scenario:
```text
I control [[Mycosynth Lattice]] ("All permanents are artifacts in addition to their other types"). I cast [[Shatterstorm]] ("Destroy all artifacts"). What is destroyed?
```

Expected verdict:
```text
All permanents. Layer 4 makes everything an artifact. Shatterstorm destroys all artifacts. Everything dies (except Shatterstorm itself, which is in the graveyard after resolving).
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
- [701.8b] - The only ways a permanent can be destroyed are as a result of an effect that uses the word “destroy” or as a result of the state-based actions that check for lethal damage (see rule 704.5g) or damage from a source with deathtouch (see rule 704.5h). If a permanent is put into its owner’s graveyard for any other reason, it hasn’t been “destroyed.”
- [405.1] - When a spell is cast, the physical card is put on the stack (see rule 601.2a). When an ability is activated or triggers, it goes on top of the stack without any card associated with it (see rules 602.2a and 603.3).
- [117.3b] - The active player receives priority after a spell or ability (other than a mana ability) resolves.
- [608.2] - If the object that’s resolving is an instant spell, a sorcery spell, or an ability, its resolution may involve several steps. The steps described in rules 608.2a and 608.2b are followed first. The steps described in rules 608.2c–m are then followed as appropriate, in no specific order. The steps described in rule 608.2n and 608.2p are followed last.
CITATIONS
[701.8a], [701.8b], [405.1], [117.3b], [608.2]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```

## K4. CDA vs. set effect — which wins in layer 7b?

Status: **FAIL**

Failures:
- Missing required citations: 613.1f, 613.3, 604.3
- Missing retrieved rules: 613.1f, 613.3, 604.3

Scenario:
```text
[[Tarmogoyf]] has a characteristic-defining ability setting its P/T based on card types in graveyards. There are 5 card types in graveyards. I cast [[Overwhelming Splendor]] ("Each creature has base power and toughness 1/1 and loses all abilities"). What is Tarmogoyf?
```

Expected verdict:
```text
1/1 with no abilities. Overwhelming Splendor's effects apply in layer 6 (lose all abilities) and layer 7b (set base P/T 1/1). Layer 6 removes the CDA. Layer 7b (Tarmogoyf's CDA would have set base) no longer applies because the CDA is gone. Layer 7b then applies Overwhelming Splendor's set effect: 1/1.
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
- [700.4] - The term dies means “is put into a graveyard from the battlefield.”
- [603.3] - Once an ability has triggered, its controller puts it on the stack as an object that’s not a card the next time a player would receive priority. See rule 117, “Timing and Priority.” The ability becomes the topmost object on the stack. It has the text of the ability that created it, and no other characteristics. It remains on the stack until it’s countered, it resolves, a rule causes it to be removed from the stack, or an effect moves it elsewhere.
- [405.1] - When a spell is cast, the physical card is put on the stack (see rule 601.2a). When an ability is activated or triggers, it goes on top of the stack without any card associated with it (see rules 602.2a and 603.3).
- [117.3b] - The active player receives priority after a spell or ability (other than a mana ability) resolves.
CITATIONS
[608.2], [700.4], [603.3], [405.1], [117.3b]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```

## K5. Set then modify in layer 7

Status: **FAIL**

Failures:
- Missing required citations: 613.3a, 613.3c
- Missing retrieved rules: 613.3a, 613.3c

Scenario:
```text
I control [[Tarmogoyf]] (a 4/5 from 4 card types in graveyards). I cast [[Bound in Silence]] on it — wait, that doesn't change P/T. Use this: I cast [[Sleep]] (taps creatures) — also doesn't. Better example: [[Crab Umbra]]? Replace with: I control a [[Maro]] (CDA: P/T = number of cards in your hand, currently 5/5). I cast [[Sleeper Agent]] which has P/T... actually let's use Goblin Cohort.
```

Expected verdict:
```text
Maro is 2/2. Layer 7a CDA: 4/4. Layer 7c applies +1/+1 (Anthem) and -3/-3 (Crippling Fear) by timestamp. Net: 4+1-3 / 4+1-3 = 2/2.
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
- [700.4] - The term dies means “is put into a graveyard from the battlefield.”
- [701.8a] - To destroy a permanent, move it from the battlefield to its owner’s graveyard.
- [616.1] - If two or more replacement and/or prevention effects are attempting to modify the way an event affects an object or player, the affected object’s controller (or its owner if it has no controller) or the affected player chooses one to apply, following the steps listed below. If two or more players have to make these choices at the same time, choices are made in APNAP order (see rule 101.4).
- [701.8b] - The only ways a permanent can be destroyed are as a result of an effect that uses the word “destroy” or as a result of the state-based actions that check for lethal damage (see rule 704.5g) or damage from a source with deathtouch (see rule 704.5h). If a permanent is put into its owner’s graveyard for any other reason, it hasn’t been “destroyed.”
CITATIONS
[608.2], [700.4], [701.8a], [616.1], [701.8b]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```

## K6. P/T with +1/+1 counters

Status: **FAIL**

Failures:
- Missing required citations: 613.3c, 613.3d
- Missing retrieved rules: 613.3c, 613.3d

Scenario:
```text
I control a [[Glistener Elf]] (1/1) with one +1/+1 counter on it. [[Glorious Anthem]] is in play (+1/+1 to my creatures). What is Glistener Elf's P/T?
```

Expected verdict:
```text
3/3. Base 1/1 → layer 7c Glorious Anthem +1/+1 → 2/2 → layer 7d counters +1/+1 → 3/3.
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
- [120.4d] - Finally, the damage event occurs.
- [613.5] - The application of continuous effects as described by the layer system is continually and automatically performed by the game. All resulting changes to an object’s characteristics are instantaneous.
- [702.62a] - Suspend is a keyword that represents three abilities. The first is a static ability that functions while the card with suspend is in a player’s hand. The second and third are triggered abilities that function in the exile zone. “Suspend N—[cost]” means “If you could begin to cast this card by putting it onto the stack from your hand, you may pay [cost] and exile it with N time counters on it. This action doesn’t use the stack,” and “At the beginning of your upkeep, if this card is suspended, remove a time counter from it,” and “When the last time counter is removed from this card, if it’s exiled, you may play it without paying its mana cost if able. If you don’t, it remains exiled. If you cast a creature spell this way, it gains haste until you lose control of the spell or the permanent it becomes.”
- [608.2f] - Some spells and abilities include actions taken on multiple players and/or objects. In most cases, each such action is processed simultaneously. If the action can’t be processed simultaneously, it’s instead processed considering each affected player or object individually. APNAP order is used to make the primary determination of the order of those actions. Secondarily, if the action is to be taken on both a player and an object they control or on multiple objects controlled by the same player, the player who controls the resolving spell or ability chooses the relative order of those actions.
- [702.1c] - An effect may state that “the same is true for” a list of keyword abilities or similar. If one of those keyword abilities has variants or variables and the effect grants that keyword or counters of that keyword to one or more objects and/or players, it grants each appropriate variant and variable of that keyword.
CITATIONS
[120.4d], [613.5], [702.62a], [608.2f], [702.1c]
VERDICT
The local rule
...
```

## K7. Timestamp ordering on layer 7c modifiers

Status: **FAIL**

Failures:
- Missing required citations: 613.3c, 613.7
- Missing retrieved rules: 613.3c, 613.7

Scenario:
```text
I play [[Crusade]] (timestamp T1, "white creatures get +1/+1"). Later, opponent plays [[Glorious Anthem]] (timestamp T2, "creatures you control get +1/+1"). I have a white 2/2 I control. What is its P/T?
```

Expected verdict:
```text
3/3. Crusade applies (+1/+1 to my white creature). Glorious Anthem does NOT apply (opponent's "you control" doesn't include my creature). Result: 2+1 / 2+1 = 3/3.
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
- [613.5] - The application of continuous effects as described by the layer system is continually and automatically performed by the game. All resulting changes to an object’s characteristics are instantaneous.
- [611.2c] - If a continuous effect generated by the resolution of a spell or ability modifies the characteristics or changes the controller of any objects, the set of objects it affects is determined when that continuous effect begins. After that point, the set won’t change. (Note that this works differently than a continuous effect from a static ability.) A continuous effect generated by the resolution of a spell or ability that doesn’t modify the characteristics or change the controller of any objects modifies the rules of the game, so it can affect objects that weren’t affected when that continuous effect began. If a single continuous effect has parts that modify the characteristics or changes the controller of any objects and other parts that don’t, the set of objects each part applies to is determined independently.
- [613.9] - One continuous effect can override another. Sometimes the results of one effect determine whether another effect applies or what another effect does.
- [611.3b] - The effect applies at all times that the permanent generating it is on the battlefield or the object generating it is in the appropriate zone.
- [611.3c] - Continuous effects that modify characteristics of permanents do so simultaneously with the permanent entering the battlefield. They don’t wait until the permanent is on the battlefield and then change it. Because such effects apply as the permanent enters the battlefield, they are applied before determining whether the permanent will cause an ability to trigger when it enters the battlefield.
CITATIONS
[613.5], [611.2c], [613.9], [611.3b], [611.3c]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```

## K8. Dependencies override timestamps

Status: **FAIL**

Failures:
- Missing required citations: 613.3b, 613.7, 613.1d, 613.1f
- Missing retrieved rules: 613.3b, 613.7, 613.1d, 613.1f

Review warnings:
- Expected verdict contains self-correction language; manually verify the knowledge-base entry.

Scenario:
```text
[[Humility]] (timestamp T1, "all creatures lose abilities and are base 1/1") and [[Opalescence]] (timestamp T2, "non-Aura enchantments become 4/4 creatures") are both on the battlefield. After all effects, what are Humility and Opalescence?
```

Expected verdict:
```text
Both are 4/4 creatures with no abilities (1/1 from Humility doesn't apply because Opalescence's later timestamp makes them 4/4 in layer 7b). Wait — let me re-derive carefully.

Actually: **Both are 4/4 with no abilities.** Opalescence applies first (it makes Humility a creature). Then Humility, being a creature, has its ability... but Humility has no abilities of its own that remove other abilities? Yes it does — "all creatures lose abilities."

Let me trace dependencies. Opalescence depends on Humility's layer 4 (whether non-Aura enchantments are creatures depends on whether Humility removed Opalescence's ability). Actually Opalescence's ability adds creature type — that's layer 4. Humility removes abilities in layer 6. They're in different layers, no dependency.

Layer 4 (type-changing): Opalescence makes both Opalescence and Humility (non-Aura enchantments) into creatures.
Layer 6 (ability removing): Humility removes all abilities from all creatures. Now Opalescence has no abilities — but it already applied in layer 4 (its effect persists).
Layer 7b (set base P/T): Opalescence sets non-Aura enchantments to 4/4 base. Humility sets all creatures to base 1/1.
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
- [613.9] - One continuous effect can override another. Sometimes the results of one effect determine whether another effect applies or what another effect does.
- [707.2] - When copying an object, the copy acquires the copiable values of the original object’s characteristics and, for an object on the stack, choices made when casting or activating it (mode, targets, the value of X, whether it was kicked, how it will affect multiple targets, and so on). The copiable values are the values derived from the text printed on the object (that text being name, mana cost, color indicator, card type, subtype, supertype, rules text, power, toughness, and/or loyalty), as modified by other copy effects, by its face-down status, and by “as . . . enters” and “as . . . is turned face up” abilities that set power and toughness (and may also set additional characteristics). Other effects (including type-changing and text-changing effects), status, counters, and stickers are not copied.
- [123.6c] - The text that a name sticker is modifying may change due to other effects and/or a permanent’s face-down status (see rule 708, “Face-Down Spells and Permanents”). To determine the name of an object with one or more name stickers, start with the object’s copiable values, then apply each name sticker’s effect and each other text-changing effect in timestamp order. The position of each name sticker will continue to be after the number of words that were before it in the object’s name when it was placed. If there are fewer words in the object’s current name, the word on that sticker is added at the end of its name instead. The position and timestamp order of each name sticker on an object is remembered as the object that sticker is on moves from one public zone to another, and it continues to apply to the new object it becomes in that zone (see rule 123.5). This is an exception to rule 400.7.
- [712.13a] - Some abilities may cause a double-faced spell with its front face up on the stack to enter the battlefield transformed or converted. If the back face of the card that represents that spell is 
...
```

## K9. Static ability granted by counter

Status: **PASS**

Scenario:
```text
I have a [[Hangarback Walker]] (a 0/0 artifact creature with X +1/+1 counters, etc.). It enters with 2 +1/+1 counters and dies. The trigger "When Hangarback Walker dies, create X 1/1 Thopter tokens where X is the number of +1/+1 counters on it" fires. How many tokens?
```

Expected verdict:
```text
2 tokens. The trigger uses last-known information for Hangarback Walker — it had 2 +1/+1 counters when it died [603.10].
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
- [608.2] - If the object that’s resolving is an instant spell, a sorcery spell, or an ability, its resolution may involve several steps. The steps described in rules 608.2a and 608.2b are followed first. The steps described in rules 608.2c–m are then followed as appropriate, in no specific order. The steps described in rule 608.2n and 608.2p are followed last.
- [603.3] - Once an ability has triggered, its controller puts it on the stack as an object that’s not a card the next time a player would receive priority. See rule 117, “Timing and Priority.” The ability becomes the topmost object on the stack. It has the text of the ability that created it, and no other characteristics. It remains on the stack until it’s countered, it resolves, a rule causes it to be removed from the stack, or an effect moves it elsewhere.
- [603.2] - Whenever a game event or game state matches a triggered ability’s trigger event, that ability automatically triggers. The ability doesn’t do anything at this point.
- [603.1] - Triggered abilities have a trigger condition and an effect. They are written as “[When/Whenever/At] [trigger condition or event], [effect]. [Instructions (if any).]”
CITATIONS
[700.4], [608.2], [603.3], [603.2], [603.1]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```

## K10. Layer 7e — switch power/toughness

Status: **FAIL**

Failures:
- Missing required citations: 613.3c, 613.3e
- Missing retrieved rules: 613.3c, 613.3e

Scenario:
```text
I control a [[Phantom Warrior]] (2/2). I cast [[Inside Out]] on it ("Switch the power and toughness of target creature until end of turn"). [[Glorious Anthem]] is also in play. What is Phantom Warrior's P/T?
```

Expected verdict:
```text
3/3 (it's symmetrical so switching has no visible effect). Tracing: Layer 7c Anthem +1/+1 → 3/3. Layer 7e switch → 3/3 (same).

If we instead made the creature non-symmetrical (e.g., a 1/3 Llanowar Visionary with Anthem):
- Base: 1/3.
- Layer 7c: +1/+1 → 2/4.
- Layer 7e: switch → 4/2.

Use the non-symmetrical version for clearer test. Let me restate:
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
- [603.3] - Once an ability has triggered, its controller puts it on the stack as an object that’s not a card the next time a player would receive priority. See rule 117, “Timing and Priority.” The ability becomes the topmost object on the stack. It has the text of the ability that created it, and no other characteristics. It remains on the stack until it’s countered, it resolves, a rule causes it to be removed from the stack, or an effect moves it elsewhere.
- [405.1] - When a spell is cast, the physical card is put on the stack (see rule 601.2a). When an ability is activated or triggers, it goes on top of the stack without any card associated with it (see rules 602.2a and 603.3).
- [117.3b] - The active player receives priority after a spell or ability (other than a mana ability) resolves.
- [603.2] - Whenever a game event or game state matches a triggered ability’s trigger event, that ability automatically triggers. The ability doesn’t do anything at this point.
- [603.1] - Triggered abilities have a trigger condition and an effect. They are written as “[When/Whenever/At] [trigger condition or event], [effect]. [Instructions (if any).]”
CITATIONS
[603.3], [405.1], [117.3b], [603.2], [603.1]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```

## L1. Two replacements, controller of affected object chooses

Status: **PASS**

Scenario:
```text
[[Doubling Season]] is on the battlefield (my permanent: doubles tokens and counters my permanents enter with). [[Hardened Scales]] is also mine ("If one or more +1/+1 counters would be put on an artifact or creature you control, that many plus one +1/+1 counters are put on it instead"). I cast [[Walking Ballista]] with X=2. How many +1/+1 counters does it enter with?
```

Expected verdict:
```text
6 counters. Walking Ballista enters with 2 (X). Two replacements modify "would put 2 counters": Doubling Season (doubles → 4) or Hardened Scales (+1 → 3). The affected player (me, controller of Walking Ballista) chooses the order [616.1].

- Order 1: Doubling Season first (2→4), then Hardened Scales (+1 → 5). Result: 5.
- Order 2: Hardened Scales first (2→3), then Doubling Season (3→6). Result: 6.

Optimal: apply Hardened Scales first → 6.
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
- [616.1] - If two or more replacement and/or prevention effects are attempting to modify the way an event affects an object or player, the affected object’s controller (or its owner if it has no controller) or the affected player chooses one to apply, following the steps listed below. If two or more players have to make these choices at the same time, choices are made in APNAP order (see rule 101.4).
- [700.4] - The term dies means “is put into a graveyard from the battlefield.”
- [701.8a] - To destroy a permanent, move it from the battlefield to its owner’s graveyard.
- [608.2] - If the object that’s resolving is an instant spell, a sorcery spell, or an ability, its resolution may involve several steps. The steps described in rules 608.2a and 608.2b are followed first. The steps described in rules 608.2c–m are then followed as appropriate, in no specific order. The steps described in rule 608.2n and 608.2p are followed last.
- [701.8b] - The only ways a permanent can be destroyed are as a result of an effect that uses the word “destroy” or as a result of the state-based actions that check for lethal damage (see rule 704.5g) or damage from a source with deathtouch (see rule 704.5h). If a permanent is put into its owner’s graveyard for any other reason, it hasn’t been “destroyed.”
CITATIONS
[616.1], [700.4], [701.8a], [608.2], [701.8b]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```

## L2. Self-replacing effects bypass the 616 choice

Status: **FAIL**

Failures:
- Missing required citations: 101.2, 608.2b
- Missing retrieved rules: 101.2, 608.2b
- Verdict polarity mismatch; expected NO-style answer

Scenario:
```text
[[Lifelink]] grants "the source's controller gains that much life when this deals damage." A creature with lifelink deals 4 damage and the controller has [[Sanguine Bond]] also out ("Whenever you gain life, target opponent loses that much life"). Wait — Sanguine Bond is a trigger, not a replacement. Let me redo.
```

Expected verdict:
```text
No, Lightning Bolt cannot be countered due to Vexing Shusher's static ability. Counterspell will resolve but its "counter target spell" effect cannot apply to Lightning Bolt. Per 608.2b, if all targets become illegal during resolution, the spell is countered by the rules; here, the target was legal at cast time but the effect "counter target spell" cannot execute on an uncounterable target. Counterspell does nothing; Lightning Bolt continues to resolve.
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
- [603.3] - Once an ability has triggered, its controller puts it on the stack as an object that’s not a card the next time a player would receive priority. See rule 117, “Timing and Priority.” The ability becomes the topmost object on the stack. It has the text of the ability that created it, and no other characteristics. It remains on the stack until it’s countered, it resolves, a rule causes it to be removed from the stack, or an effect moves it elsewhere.
- [603.2] - Whenever a game event or game state matches a triggered ability’s trigger event, that ability automatically triggers. The ability doesn’t do anything at this point.
- [603.1] - Triggered abilities have a trigger condition and an effect. They are written as “[When/Whenever/At] [trigger condition or event], [effect]. [Instructions (if any).]”
- [616.1] - If two or more replacement and/or prevention effects are attempting to modify the way an event affects an object or player, the affected object’s controller (or its owner if it has no controller) or the affected player chooses one to apply, following the steps listed below. If two or more players have to make these choices at the same time, choices are made in APNAP order (see rule 101.4).
- [614.6] - If an event is replaced, it never happens. A modified event occurs instead, which may in turn trigger abilities. Note that the modified event may contain instructions that can’t be carried out, in which case the impossible instruction is simply ignored.
CITATIONS
[603.3], [603.2], [603.1], [616.1], [614.6]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```

## L3. Replacement + prevention on same damage event

Status: **FAIL**

Failures:
- Missing required citations: 615.1, 614.6
- Missing retrieved rules: 615.1, 614.6

Scenario:
```text
A 3/3 creature deals 3 combat damage to me. I control [[Soul Warden]] — wait, that's a trigger. I control [[Spirit Link]] enchanting the attacker ("Whenever enchanted creature deals damage, you gain that much life") — also a trigger. Better: I have a [[Shielding Plax]] effect "If a source would deal damage to you, prevent 1 of that damage." My opponent also enchanted me with [[Embargo]] — wait, doesn't help.
```

Expected verdict:
```text
1 damage. Healing Salve prevents 3 of the 4 damage. The other 1 deals to me.
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
- [603.2] - Whenever a game event or game state matches a triggered ability’s trigger event, that ability automatically triggers. The ability doesn’t do anything at this point.
- [603.1] - Triggered abilities have a trigger condition and an effect. They are written as “[When/Whenever/At] [trigger condition or event], [effect]. [Instructions (if any).]”
- [603.3] - Once an ability has triggered, its controller puts it on the stack as an object that’s not a card the next time a player would receive priority. See rule 117, “Timing and Priority.” The ability becomes the topmost object on the stack. It has the text of the ability that created it, and no other characteristics. It remains on the stack until it’s countered, it resolves, a rule causes it to be removed from the stack, or an effect moves it elsewhere.
- [405.1] - When a spell is cast, the physical card is put on the stack (see rule 601.2a). When an ability is activated or triggers, it goes on top of the stack without any card associated with it (see rules 602.2a and 603.3).
CITATIONS
[608.2], [603.2], [603.1], [603.3], [405.1]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```

## L4. Three-way replacement on ETB counters

Status: **FAIL**

Failures:
- Missing required citations: 614.6
- Missing retrieved rules: 614.6

Scenario:
```text
I control [[Doubling Season]], [[Pir, Imaginative Rascal]] ("If one or more +1/+1 counters would be put on a permanent you control, that many plus one +1/+1 counters are put on it instead"), and [[Hardened Scales]]. I cast [[Walking Ballista]] with X=1. Maximum counters possible?
```

Expected verdict:
```text
Optimal ordering yields 8 counters.

Pir = "+1 counter if any would be put on a permanent I control" (same effect as Hardened Scales but for any permanent).

Three replacements: Doubling Season (doubles), Pir (+1), Hardened Scales (+1).

Try orderings:
- DS, Pir, HS: 1→2→3→4
- DS, HS, Pir: 1→2→3→4
- Pir, DS, HS: 1→2→4→5
- Pir, HS, DS: 1→2→3→6
- HS, DS, Pir: 1→2→4→5
- HS, Pir, DS: 1→2→3→6

So max is 6, not 8. Let me recompute:

Pir and HS are both +1 effects. They can each only apply once per event (each replacement effect applies once per event normally per 615.1). So both add +1 in sequence.

DS is "double" → ×2.

For X=1: optimal is HS, Pir, DS: 1+1=2+1=3×2=6. Or Pir, HS, DS: 1+1=2+1=3×2=6.
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
- [616.1] - If two or more replacement and/or prevention effects are attempting to modify the way an event affects an object or player, the affected object’s controller (or its owner if it has no controller) or the affected player chooses one to apply, following the steps listed below. If two or more players have to make these choices at the same time, choices are made in APNAP order (see rule 101.4).
- [903.9a] - If a commander is in a graveyard or in exile and that object was put into that zone since the last time state-based actions were checked, its owner may put it into the command zone. This is a state-based action. See rule 704.
- [700.4] - The term dies means “is put into a graveyard from the battlefield.”
- [701.8a] - To destroy a permanent, move it from the battlefield to its owner’s graveyard.
- [608.2] - If the object that’s resolving is an instant spell, a sorcery spell, or an ability, its resolution may involve several steps. The steps described in rules 608.2a and 608.2b are followed first. The steps described in rules 608.2c–m are then followed as appropriate, in no specific order. The steps described in rule 608.2n and 608.2p are followed last.
CITATIONS
[616.1], [903.9a], [700.4], [701.8a], [608.2]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```

## L5. Self-replacing effects (614.5) apply first

Status: **FAIL**

Failures:
- Missing required citations: 704.5f
- Missing retrieved rules: 704.5f

Scenario:
```text
[[Solemnity]] is on the battlefield ("Players can't get counters. Permanents enter the battlefield without counters"). I control [[Hangarback Walker]] (an artifact creature that enters with X +1/+1 counters). I cast Hangarback Walker with X=3. What happens?
```

Expected verdict:
```text
Hangarback Walker enters with 0 +1/+1 counters. Solemnity's "permanents enter without counters" replacement substitutes the ETB-with-counters event to ETB-without. The 3 counters are not placed.
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
- [608.2] - If the object that’s resolving is an instant spell, a sorcery spell, or an ability, its resolution may involve several steps. The steps described in rules 608.2a and 608.2b are followed first. The steps described in rules 608.2c–m are then followed as appropriate, in no specific order. The steps described in rule 608.2n and 608.2p are followed last.
- [616.1] - If two or more replacement and/or prevention effects are attempting to modify the way an event affects an object or player, the affected object’s controller (or its owner if it has no controller) or the affected player chooses one to apply, following the steps listed below. If two or more players have to make these choices at the same time, choices are made in APNAP order (see rule 101.4).
- [603.3] - Once an ability has triggered, its controller puts it on the stack as an object that’s not a card the next time a player would receive priority. See rule 117, “Timing and Priority.” The ability becomes the topmost object on the stack. It has the text of the ability that created it, and no other characteristics. It remains on the stack until it’s countered, it resolves, a rule causes it to be removed from the stack, or an effect moves it elsewhere.
- [614.6] - If an event is replaced, it never happens. A modified event occurs instead, which may in turn trigger abilities. Note that the modified event may contain instructions that can’t be carried out, in which case the impossible instruction is simply ignored.
CITATIONS
[700.4], [608.2], [616.1], [603.3], [614.6]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```

## L6. Replacement effect for "instead" damage rerouting

Status: **FAIL**

Failures:
- Missing required citations: 614.6, 614.9
- Missing retrieved rules: 614.6, 614.9

Scenario:
```text
I cast [[Lightning Bolt]] targeting an opponent. They control [[Boros Reckoner]] ("If a source would deal damage to you, instead it deals that much damage to a target creature or player of your choice"). Wait, that's not quite right — let me use real Oracle text: [[Boros Reckoner]] has "Whenever Boros Reckoner is dealt damage, it deals an equal amount of damage to any target." That's a trigger, not a replacement.
```

Expected verdict:
```text
Palisade Giant takes 3 damage instead of the opponent. The damage is redirected via 614.5 replacement.
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
- [603.3] - Once an ability has triggered, its controller puts it on the stack as an object that’s not a card the next time a player would receive priority. See rule 117, “Timing and Priority.” The ability becomes the topmost object on the stack. It has the text of the ability that created it, and no other characteristics. It remains on the stack until it’s countered, it resolves, a rule causes it to be removed from the stack, or an effect moves it elsewhere.
- [603.2] - Whenever a game event or game state matches a triggered ability’s trigger event, that ability automatically triggers. The ability doesn’t do anything at this point.
- [603.1] - Triggered abilities have a trigger condition and an effect. They are written as “[When/Whenever/At] [trigger condition or event], [effect]. [Instructions (if any).]”
- [616.1] - If two or more replacement and/or prevention effects are attempting to modify the way an event affects an object or player, the affected object’s controller (or its owner if it has no controller) or the affected player chooses one to apply, following the steps listed below. If two or more players have to make these choices at the same time, choices are made in APNAP order (see rule 101.4).
CITATIONS
[701.8a], [603.3], [603.2], [603.1], [616.1]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```

## M1. Basic mana ability — no stack

Status: **FAIL**

Failures:
- Missing required citations: 605.1, 605.3a
- Missing retrieved rules: 605.1, 605.3a
- Verdict polarity mismatch; expected NO-style answer

Scenario:
```text
I tap a Forest for {G}. My opponent says "in response, I cast [[Pyroblast]] on your Forest." Can they?
```

Expected verdict:
```text
No. Mana abilities don't use the stack [605.3a]. There's no point in time when the tap-Forest activation can be responded to. The tap, the mana production, and the result all happen as a single uninterruptable instant.
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
- [701.8a] - To destroy a permanent, move it from the battlefield to its owner’s graveyard.
- [405.1] - When a spell is cast, the physical card is put on the stack (see rule 601.2a). When an ability is activated or triggers, it goes on top of the stack without any card associated with it (see rules 602.2a and 603.3).
- [117.3b] - The active player receives priority after a spell or ability (other than a mana ability) resolves.
- [701.8b] - The only ways a permanent can be destroyed are as a result of an effect that uses the word “destroy” or as a result of the state-based actions that check for lethal damage (see rule 704.5g) or damage from a source with deathtouch (see rule 704.5h). If a permanent is put into its owner’s graveyard for any other reason, it hasn’t been “destroyed.”
CITATIONS
[608.2], [701.8a], [405.1], [117.3b], [701.8b]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```

## M2. Triggered mana ability — uses stack

Status: **FAIL**

Failures:
- Missing required citations: 605.1, 605.1a
- Missing retrieved rules: 605.1, 605.1a

Scenario:
```text
I control [[Llanowar Visionary]] (a 2/2 with ETB "draw a card" and "{T}: Add one mana of any color"). I cast another creature spell. While that's on the stack, can I tap Llanowar Visionary for mana? Yes obviously. But — what about its ETB? Is "draw a card" on ETB a mana ability or triggered ability?
```

Expected verdict:
```text
The "draw a card" ETB trigger is NOT a mana ability — it doesn't produce mana. It's a normal triggered ability that uses the stack and can be responded to.

The tap ability ({T}: Add) IS a mana ability — no stack.
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
- [405.1] - When a spell is cast, the physical card is put on the stack (see rule 601.2a). When an ability is activated or triggers, it goes on top of the stack without any card associated with it (see rules 602.2a and 603.3).
- [603.3] - Once an ability has triggered, its controller puts it on the stack as an object that’s not a card the next time a player would receive priority. See rule 117, “Timing and Priority.” The ability becomes the topmost object on the stack. It has the text of the ability that created it, and no other characteristics. It remains on the stack until it’s countered, it resolves, a rule causes it to be removed from the stack, or an effect moves it elsewhere.
- [117.3b] - The active player receives priority after a spell or ability (other than a mana ability) resolves.
- [603.2] - Whenever a game event or game state matches a triggered ability’s trigger event, that ability automatically triggers. The ability doesn’t do anything at this point.
- [608.2] - If the object that’s resolving is an instant spell, a sorcery spell, or an ability, its resolution may involve several steps. The steps described in rules 608.2a and 608.2b are followed first. The steps described in rules 608.2c–m are then followed as appropriate, in no specific order. The steps described in rule 608.2n and 608.2p are followed last.
CITATIONS
[405.1], [603.3], [117.3b], [603.2], [608.2]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```

## M3. Mana pool empties between phases

Status: **FAIL**

Failures:
- Missing required citations: 106.4
- Missing retrieved rules: 106.4
- Verdict polarity mismatch; expected NO-style answer

Scenario:
```text
I'm in my upkeep step. I tap 2 lands for {2}. I don't cast anything. We move to draw step. Then main phase. Do I still have {2} available?
```

Expected verdict:
```text
No. The mana pool empties as a turn-based action at the end of each step and phase [106.4]. The {2} was lost at the end of upkeep.
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
- [117.3a] - The active player receives priority at the beginning of most steps and phases, after any turn-based actions (such as drawing a card during the draw step; see rule 703) have been dealt with and abilities that trigger at the beginning of that phase or step have been put on the stack. No player receives priority during the untap step. Players usually don’t get priority during the cleanup step (see rule 514.3).
- [118.11] - The actions performed when paying a cost may be modified by effects. Even if they are, meaning the actions that are performed don’t match the actions that are called for, the cost has still been paid.
- [307.5] - If a spell, ability, or effect states that a player can do something only “any time they could cast a sorcery” or “only as a sorcery,” it means only that the player must have priority, it must be during the main phase of their turn, and the stack must be empty. The player doesn’t need to have a sorcery card they could cast. Effects that would preclude that player from casting a sorcery spell don’t affect the player’s capability to perform that action (unless the action is actually casting a sorcery spell).
- [500.10] - Some effects add a step after a particular phase. In that case, that effect first creates the phase which normally contains that step directly after the specified phase. Any other steps that phase would normally have are skipped (see rule 500.11).
- [506.7e] - If a spell states that it may be cast “only before [a particular point in the combat phase],” but the stated point doesn’t exist within the relevant combat phase because the declare blockers step and the combat damage step are skipped (see rule 508.8), then the spell may be cast only before the declare attackers step ends. If the stated point doesn’t exist because the relevant combat phase has been skipped, then the spell may be cast only before the precombat main phase ends.
CITATIONS
[117.3a], [118.11], [307.5], [500.10], [506.7e]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as th
...
```

## M4. Mana abilities during cost payment (re-test from J8 angle)

Status: **FAIL**

Failures:
- Missing required citations: 605.3a, 601.2g
- Missing retrieved rules: 605.3a, 601.2g
- Verdict polarity mismatch; expected YES-style answer

Scenario:
```text
I'm casting a 4-cost spell. I have {2} in my mana pool from a previous tap. I have a Forest untapped. Can I tap the Forest for {G} during cost payment to help pay?
```

Expected verdict:
```text
Yes. Mana abilities can be activated during cost payment of another spell or ability [602.1, 605.3a]. The Forest's {T} mana ability activates without using the stack and adds {G} to your pool, available immediately for the cost being paid.
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
- [702.51a] - Convoke is a static ability that functions while the spell with convoke is on the stack. “Convoke” means “For each colored mana in this spell’s total cost, you may tap an untapped creature of that color you control rather than pay that mana. For each generic mana in this spell’s total cost, you may tap an untapped creature you control rather than pay that mana.”
- [702.126a] - Improvise is a static ability that functions while the spell with improvise is on the stack. “Improvise” means “For each generic mana in this spell’s total cost, you may tap an untapped artifact you control rather than pay that mana.”
- [702.143a] - Foretell is a keyword that functions while the card with foretell is in a player’s hand. Any time a player has priority during their turn, that player may pay {2} and exile a card with foretell from their hand face down. That player may look at that card as long as it remains in exile. They may cast that card after the current turn has ended by paying any foretell cost it has rather than paying that spell’s mana cost. Casting a spell this way follows the rules for paying alternative costs in rules 601.2b and 601.2f–h.
- [702.113a] - Awaken appears on some instants and sorceries. It represents two abilities: a static ability that functions while the spell with awaken is on the stack and a spell ability. “Awaken N—[cost]” means “You may pay [cost] rather than pay this spell’s mana cost as you cast this spell” and “If this spell’s awaken cost was paid, put N +1/+1 counters on target land you control. That land becomes a 0/0 Elemental creature with haste. It’s still a land.” Casting a spell using its awaken ability follows the rules for paying alternative costs in rules 601.2b and 601.2f–h.
- [118.13b] - If a cost paid during the resolution of a spell or ability contains a mana symbol that can be paid in multiple ways, the player paying that cost chooses how to pay for that symbol immediately before they pay that cost.
CITATIONS
[702.51a], [702.126a], [702.143a], [702.113a], [118.13b]
VERDICT
The local rules above ground the answer, but Arb
...
```

## M5. Restricted mana (snow, "spend only on")

Status: **FAIL**

Failures:
- Missing required citations: 107.4h
- Missing retrieved rules: 107.4h

Scenario:
```text
I tap a [[Snow-Covered Mountain]] for {R}. The rules say this mana can be spent as snow. I want to cast [[Skred]] ("Skred deals X damage to any target, where X is the number of snow permanents you control"). Do I need to spend the snow mana, or just have snow permanents?
```

Expected verdict:
```text
Skred counts snow PERMANENTS, not snow mana. The {R} from Snow-Covered Mountain is regular red mana that also has "snow" attribute, but Skred doesn't require snow mana — it requires snow permanents (it counts them at resolution).
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
- [700.4] - The term dies means “is put into a graveyard from the battlefield.”
- [707.10] - To copy a spell, activated ability, or triggered ability means to put a copy of it onto the stack; a copy of a spell isn’t cast and a copy of an activated ability isn’t activated. A copy of a spell or ability copies both the characteristics of the spell or ability and all decisions made for it, including modes, targets, the value of X, and additional or alternative costs. (See rule 601, “Casting Spells.”) Choices that are normally made on resolution are not copied. If an effect of the copy refers to objects used to pay its costs, it uses the objects used to pay the costs of the original spell or ability. A copy of a spell is owned by the player under whose control it was put on the stack. A copy of a spell or ability is controlled by the player under whose control it was put on the stack. A copy of a spell is itself a spell, even though it has no spell card associated with it. A copy of an ability is itself an ability.
- [608.2f] - Some spells and abilities include actions taken on multiple players and/or objects. In most cases, each such action is processed simultaneously. If the action can’t be processed simultaneously, it’s instead processed considering each affected player or object individually. APNAP order is used to make the primary determination of the order of those actions. Secondarily, if the action is to be taken on both a player and an object they control or on multiple objects controlled by the same player, the player who controls the resolving spell or ability chooses the relative order of those actions.
- [608.2b] - If the spell or ability specifies targets, it checks whether the targets are still legal.
...
```

## N1. Multiple blockers and damage assignment order

Status: **FAIL**

Failures:
- Missing required citations: 509.1c, 510.1c
- Missing retrieved rules: 509.1c, 510.1c

Scenario:
```text
I attack with a 5/5. Opponent declares two blockers: a 2/2 and a 3/3. As the attacker, can I choose to assign all 5 damage to just one?
```

Expected verdict:
```text
I (attacker) choose damage assignment order at declare-blockers step [509.1c]. I can order them: 2/2 first, then 3/3. I must assign at least lethal damage to a creature before moving to the next in order. Lethal to 2/2 is 2 damage. After 2 to the 2/2, I have 3 damage left, which I assign to the 3/3 (lethal). So 2/2 takes 2 (dies), 3/3 takes 3 (dies). I cannot pile all 5 on the 2/2 — I must assign at least lethal before the next.
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
- [702.19b] - The controller of an attacking creature with trample first assigns damage to the creature(s) blocking it. Once all those blocking creatures are assigned lethal damage, any excess damage is assigned as its controller chooses among those blocking creatures and the player, planeswalker, or battle the creature is attacking. When checking for assigned lethal damage, take into account damage already marked on the creature and damage from other creatures that’s being assigned during the same combat damage step, but not any abilities or effects that might change the amount of damage that’s actually dealt. The attacking creature’s controller need not assign lethal damage to all those blocking creatures but in that case can’t assign any damage to the player or planeswalker it’s attacking.
- [107.1b] - Most of the time, the Magic game uses only positive numbers and zero. You can’t choose a negative number, deal negative damage, gain negative life, and so on. However, it’s possible for a game value, such as a creature’s power, to be less than zero. If a calculation or comparison needs to use a negative value, it does so. If a calculation that would determine the result of an effect yields a negative number, zero is used instead, unless that effect doubles, triples, or sets to a specific value a player’s life total or the power and/or toughness of a creature or creature card.
- [510.4] - If at least one attacking or blocking creature has first strike (see rule 702.7) or double strike (see rule 702.4) as the combat damage step begins, the only creatures that assign combat damage in that step are those with first strike or double strike. After that step, instead of proceeding to the end of combat step, the phase gets a second combat damage step. The only creatures that assign combat damage in that step are the remaining attackers and blockers that had neither first strike nor double strike as the first combat damage step began, as well as the remaining attackers and blockers that currently have double strike. After that step, the phase proceeds to the end of combat ste
...
```

## N2. First strike damage step (only when needed)

Status: **PASS**

Scenario:
```text
An attacker has first strike, defender has no first strike or double strike. How many damage steps are in this combat?
```

Expected verdict:
```text
Two damage steps. Because at least one creature has first strike (or double strike), a first-strike damage step occurs [702.7]. Regular damage step follows.
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
- [506.1] - The combat phase has five steps, which proceed in order: beginning of combat, declare attackers, declare blockers, combat damage, and end of combat. The declare blockers and combat damage steps are skipped if no creatures are declared as attackers or put onto the battlefield attacking (see rule 508.8). There are two combat damage steps if any attacking or blocking creature has first strike (see rule 702.7) or double strike (see rule 702.4).
- [510.4] - If at least one attacking or blocking creature has first strike (see rule 702.7) or double strike (see rule 702.4) as the combat damage step begins, the only creatures that assign combat damage in that step are those with first strike or double strike. After that step, instead of proceeding to the end of combat step, the phase gets a second combat damage step. The only creatures that assign combat damage in that step are the remaining attackers and blockers that had neither first strike nor double strike as the first combat damage step began, as well as the remaining attackers and blockers that currently have double strike. After that step, the phase proceeds to the end of combat step.
- [702.4b] - If at least one attacking or blocking creature has first strike (see rule 702.7) or double strike as the combat damage step begins, the only creatures that assign combat damage in that step are those with first strike or double strike. After that step, instead of proceeding to the end of combat step, the phase gets a second combat damage step. The only creatures that assign combat damage in that step are the remaining attackers and blockers that had neither first strike nor double strike as the first combat damage step began, as well as the remaining attackers and blockers that currently have double strike. After that step, the phase proceeds to the end of combat step.
- [702.4d] - Giving double strike to a creature with first strike after it has already dealt combat damage in the first combat damage step will allow the creature to assign combat damage in the second combat damage step.
- [702.7b] - If at least one
...
```

## N3. Trample with multiple blockers

Status: **FAIL**

Failures:
- Missing required citations: 510.1c
- Missing retrieved rules: 510.1c

Scenario:
```text
I attack with a 5/5 with trample. Opponent blocks with a 2/2 and 3/3. I order damage: 2/2 first. How much trample damage goes to the defending player?
```

Expected verdict:
```text
0 trample damage. Trample only assigns to the player AFTER lethal is assigned to all blockers. 5 damage total: 2 to the 2/2 (lethal), 3 to the 3/3 (lethal). 5-2-3 = 0 to the player.
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
- [405.1] - When a spell is cast, the physical card is put on the stack (see rule 601.2a). When an ability is activated or triggers, it goes on top of the stack without any card associated with it (see rules 602.2a and 603.3).
- [117.3b] - The active player receives priority after a spell or ability (other than a mana ability) resolves.
- [707.10] - To copy a spell, activated ability, or triggered ability means to put a copy of it onto the stack; a copy of a spell isn’t cast and a copy of an activated ability isn’t activated. A copy of a spell or ability copies both the characteristics of the spell or ability and all decisions made for it, including modes, targets, the value of X, and additional or alternative costs. (See rule 601, “Casting Spells.”) Choices that are normally made on resolution are not copied. If an effect of the copy refers to objects used to pay its costs, it uses the objects used to pay the costs of the original spell or ability. A copy of a spell is owned by the player under whose control it was put on the stack. A copy of a spell or ability is controlled by the player under whose control it was put on the stack. A copy of a spell is itself a spell, even though it has no spell card associated with it. A copy of an ability is itself an ability.
- [702.19b] - The controller of an attacking creature with trample first assigns damage to the creature(s) blocking it. Once all those blocking creatures are assigned lethal damage, any excess damage is assigned as its controller chooses among those blocking creatures and the player, planeswalker, or battle the creature is attacking. When checking for assigned lethal damage, take into account damage already marked on the creature and damage from other
...
```

## N4. Lifelink rules

Status: **FAIL**

Failures:
- Missing required citations: 702.15b, 510.1c
- Missing retrieved rules: 702.15b, 510.1c

Review warnings:
- Expected verdict contains self-correction language; manually verify the knowledge-base entry.

Scenario:
```text
A 4/4 creature with lifelink attacks me. I block with a 2/2. Both deal combat damage. How much life does the attacker's controller gain?
```

Expected verdict:
```text
4 life. Lifelink causes the controller of a source with lifelink to gain life equal to the damage the source deals [702.15b]. The attacker deals 4 damage total: 2 to my blocker (the 2/2 dies), and trample? No, no trample. With no trample and a 2/2 blocker, the attacker assigns at least 2 to the blocker. With only 1 blocker, the attacker can assign... wait, if there's only one blocker, all damage to the blocker (no trample). So 4 damage to the 2/2 (overkill), 0 to player. Lifelink: 4 life gained.

Actually corrected: with 1 blocker and no trample, all 4 damage goes to the blocker. The 2/2 dies and only 2 of the damage was needed; the other 2 is wasted. Lifelink works on damage dealt, not lethal — so 4 life.
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
- [405.1] - When a spell is cast, the physical card is put on the stack (see rule 601.2a). When an ability is activated or triggers, it goes on top of the stack without any card associated with it (see rules 602.2a and 603.3).
- [117.3b] - The active player receives priority after a spell or ability (other than a mana ability) resolves.
- [608.2] - If the object that’s resolving is an instant spell, a sorcery spell, or an ability, its resolution may involve several steps. The steps described in rules 608.2a and 608.2b are followed first. The steps described in rules 608.2c–m are then followed as appropriate, in no specific order. The steps described in rule 608.2n and 608.2p are followed last.
- [707.10] - To copy a spell, activated ability, or triggered ability means to put a copy of it onto the stack; a copy of a spell isn’t cast and a copy of an activated ability isn’t activated. A copy of a spell or ability copies both the characteristics of the spell or ability and all decisions made for it, including modes, targets, the value of X, and additional or alternative costs. (See rule 601, “Casting Spells.”) Choices that are normally made on resolution are not copied. If an effect of the copy refers to objects used to pay its costs, it uses the objects used to pay the costs of the original spell or ability. A copy of a spell is owned by the player under whose control it was put on the stack. A copy of a spell or ability is controlled by the player under whose control it was put on the stack. A copy of a spell is itself a spell, even though it has no spell card associated with it. A copy of an ability is itself an ability.
- [120.4d] - Finally, the damage event occurs.
CITATIONS
[405.1], [117.3b], [608.2], [707.10], [120.4d]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```

## N5. Deathtouch with multiple blockers

Status: **FAIL**

Failures:
- Missing required citations: 702.2c, 510.1c
- Missing retrieved rules: 702.2c, 510.1c

Review warnings:
- Expected verdict contains self-correction language; manually verify the knowledge-base entry.

Scenario:
```text
I attack with a 5/5 with deathtouch. Opponent blocks with three 2/2 creatures. How much damage do I need to assign to each blocker?
```

Expected verdict:
```text
1 damage each for deathtouch is enough (deathtouch makes any damage from a creature with deathtouch "lethal"). So 1+1+1 = 3 damage, all three blockers die. 2 damage left over — wait, with no trample, the remaining 2 doesn't go to the player. The remaining 2 is wasted on... actually, by 702.2c, "with deathtouch, 1 damage is considered lethal" for assignment purposes.
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
- [702.19b] - The controller of an attacking creature with trample first assigns damage to the creature(s) blocking it. Once all those blocking creatures are assigned lethal damage, any excess damage is assigned as its controller chooses among those blocking creatures and the player, planeswalker, or battle the creature is attacking. When checking for assigned lethal damage, take into account damage already marked on the creature and damage from other creatures that’s being assigned during the same combat damage step, but not any abilities or effects that might change the amount of damage that’s actually dealt. The attacking creature’s controller need not assign lethal damage to all those blocking creatures but in that case can’t assign any damage to the player or planeswalker it’s attacking.
- [723.5] - While controlling another player, a player makes all choices and decisions the controlled player is allowed to make or is told to make by the rules or by any objects. This includes choices and decisions about what to play, and choices and decisions called for by spells and abilities.
- [701.54c] - If a player doesn’t have an emblem named The Ring at the time the Ring tempts them, they get an emblem named The Ring before choosing a creature to be their Ring-bearer. The Ring has “Your Ring-bearer is legendary and can’t be blocked by creatures with greater power.” As long as the Ring has tempted that player two or more times, it has “Whenever your Ring-bearer attacks, draw a card, then discard a card.” As long as the Ring has tempted that player three or more times, it has “Whenever your Ring-bearer becomes blocked by a creature, the blocking creature’s controller sacrifices it at end of combat.” As long as the Ring has tempted that player four or more times, it has “Whenever your Ring-bearer deals combat damage to a player, each opponent loses 3 life.”
- [702.19c] - Trample over planeswalkers is a variant of trample that modifies the rules for assigning combat damage to planeswalkers. The controller of a creature with trample over planeswalkers assigns that creature’s c
...
```

## N6. Creature removed from combat mid-step

Status: **FAIL**

Failures:
- Missing required citations: 509.1, 510.1d
- Missing retrieved rules: 509.1, 510.1d

Review warnings:
- Expected verdict contains self-correction language; manually verify the knowledge-base entry.

Scenario:
```text
An opponent's 3/3 attacks. I declare a 2/2 as blocker. Before damage is dealt, the attacker's controller casts [[Smite the Monstrous]] killing my blocker. What happens in the damage step?
```

Expected verdict:
```text
The blocker is dead before damage. The 3/3 attacker is still attacking (it's not blocked anymore? actually it was blocked at declare-blockers, that doesn't change). Per 510.1d: if a blocker leaves the battlefield, the attacker is treated as if not blocked for damage UNLESS another blocker remains. With my only blocker dead, the 3/3 is effectively unblocked — it deals 3 to me.
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
- [701.8b] - The only ways a permanent can be destroyed are as a result of an effect that uses the word “destroy” or as a result of the state-based actions that check for lethal damage (see rule 704.5g) or damage from a source with deathtouch (see rule 704.5h). If a permanent is put into its owner’s graveyard for any other reason, it hasn’t been “destroyed.”
- [702.19b] - The controller of an attacking creature with trample first assigns damage to the creature(s) blocking it. Once all those blocking creatures are assigned lethal damage, any excess damage is assigned as its controller chooses among those blocking creatures and the player, planeswalker, or battle the creature is attacking. When checking for assigned lethal damage, take into account damage already marked on the creature and damage from other creatures that’s being assigned during the same combat damage step, but not any abilities or effects that might change the amount of damage that’s actually dealt. The attacking creature’s controller need not assign lethal damage to all those blocking creatures but in that case can’t assign any damage to the player or planeswalker it’s attacking.
- [701.54c] - If a player doesn’t have an emblem named The Ring at the time the Ring tempts them, they get an emblem named The Ring before choosing a creature to be their Ring-bearer. The Ring has “Your Ring-bearer is legendary and can’t be blocked by creatures with greater power.” As long as the Ring has tempted that player two or more times, it has “Whenever your Ring-bearer attacks, draw a card, then discard a card.” As long as the Ring has tempted that player three or more times, it has “Whenever your Ring-bearer becomes blocked by a creature, the blocking creature’s controller sacrifices it at end of combat.” As long as the Ring has tempted that player four or more times, it has “Whenever your Ring-bearer deals combat damage to a player, each opponent loses 3 life.”
- [801.13b] - If a spell or ability creates an effect that preven
...
```

## N7. Indestructible + lethal damage

Status: **FAIL**

Failures:
- Missing required citations: 702.12, 704.5g
- Missing retrieved rules: 702.12, 704.5g

Scenario:
```text
I attack with [[Ulamog, the Ceaseless Hunger]] (10/10 indestructible). Opponent blocks with [[Avacyn, Angel of Hope]] (8/8 with indestructible and "creatures you control have indestructible"). Combat damage occurs. What happens?
```

Expected verdict:
```text
Neither dies. Both have indestructible. Combat damage is dealt (10 to Avacyn, 8 to Ulamog) but state-based actions don't destroy creatures with indestructible regardless of damage [702.12, 704.5g].
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
- [405.1] - When a spell is cast, the physical card is put on the stack (see rule 601.2a). When an ability is activated or triggers, it goes on top of the stack without any card associated with it (see rules 602.2a and 603.3).
- [117.3b] - The active player receives priority after a spell or ability (other than a mana ability) resolves.
- [603.2] - Whenever a game event or game state matches a triggered ability’s trigger event, that ability automatically triggers. The ability doesn’t do anything at this point.
CITATIONS
[608.2], [603.3], [405.1], [117.3b], [603.2]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```

## N8. Damage prevention vs. damage replacement

Status: **FAIL**

Failures:
- Missing required citations: 614.5
- Missing retrieved rules: 614.5

Scenario:
```text
I have [[Worship]] in play ("If you control a creature, damage that would reduce your life total to less than 1 reduces it to 1 instead"). I'm at 1 life. Opponent's 5/5 attacks me. I have one creature in play. How much damage do I take?
```

Expected verdict:
```text
Damage is dealt; my life would go to -4. Worship's replacement substitutes "to less than 1" with "to 1." Result: I stay at 1.
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
- [614.6] - If an event is replaced, it never happens. A modified event occurs instead, which may in turn trigger abilities. Note that the modified event may contain instructions that can’t be carried out, in which case the impossible instruction is simply ignored.
- [614.1] - Some continuous effects are replacement effects. Like prevention effects (see rule 615), replacement effects apply continuously as events happen—they aren’t locked in ahead of time. Such effects watch for a particular event that would happen and completely or partially replace that event with a different event. They act like “shields” around whatever they’re affecting.
- [117.3b] - The active player receives priority after a spell or ability (other than a mana ability) resolves.
- [405.1] - When a spell is cast, the physical card is put on the stack (see rule 601.2a). When an ability is activated or triggers, it goes on top of the stack without any card associated with it (see rules 602.2a and 603.3).
CITATIONS
[608.2], [614.6], [614.1], [117.3b], [405.1]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```

## O1. Tokens entering with counters

Status: **FAIL**

Failures:
- Missing required citations: 614.13
- Missing retrieved rules: 614.13

Scenario:
```text
I control [[Doubling Season]]. I cast [[Helm of the Host]] (an artifact that creates token copies at combat — wait, that's at combat, not ETB). Better example: I cast [[Trostani, Selesnya's Voice]] effect... actually:
```

Expected verdict:
```text
4 Servo tokens. Anointed Procession is a replacement effect doubling token creation.
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
- [616.1] - If two or more replacement and/or prevention effects are attempting to modify the way an event affects an object or player, the affected object’s controller (or its owner if it has no controller) or the affected player chooses one to apply, following the steps listed below. If two or more players have to make these choices at the same time, choices are made in APNAP order (see rule 101.4).
- [608.2] - If the object that’s resolving is an instant spell, a sorcery spell, or an ability, its resolution may involve several steps. The steps described in rules 608.2a and 608.2b are followed first. The steps described in rules 608.2c–m are then followed as appropriate, in no specific order. The steps described in rule 608.2n and 608.2p are followed last.
- [603.3] - Once an ability has triggered, its controller puts it on the stack as an object that’s not a card the next time a player would receive priority. See rule 117, “Timing and Priority.” The ability becomes the topmost object on the stack. It has the text of the ability that created it, and no other characteristics. It remains on the stack until it’s countered, it resolves, a rule causes it to be removed from the stack, or an effect moves it elsewhere.
- [603.1] - Triggered abilities have a trigger condition and an effect. They are written as “[When/Whenever/At] [trigger condition or event], [effect]. [Instructions (if any).]”
- [405.1] - When a spell is cast, the physical card is put on the stack (see rule 601.2a). When an ability is activated or triggers, it goes on top of the stack without any card associated with it (see rules 602.2a and 603.3).
CITATIONS
[616.1], [608.2], [603.3], [603.1], [405.1]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```

## O2. Anafenza vs. token

Status: **FAIL**

Failures:
- Missing required citations: 704.5d
- Missing retrieved rules: 704.5d
- Verdict polarity mismatch; expected NO-style answer

Scenario:
```text
I control [[Anafenza, the Foremost]] ("If a nontoken creature an opponent controls would die, exile it instead"). Opponent's 1/1 Goblin token is destroyed by [[Wrath of God]]. Does Anafenza exile it?
```

Expected verdict:
```text
No. Anafenza's replacement applies only to NONTOKEN creatures. The Goblin token is a token, so Anafenza doesn't apply. The token is destroyed and ceases to exist as a state-based action.
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
- [614.6] - If an event is replaced, it never happens. A modified event occurs instead, which may in turn trigger abilities. Note that the modified event may contain instructions that can’t be carried out, in which case the impossible instruction is simply ignored.
- [701.8a] - To destroy a permanent, move it from the battlefield to its owner’s graveyard.
- [700.4] - The term dies means “is put into a graveyard from the battlefield.”
- [701.8b] - The only ways a permanent can be destroyed are as a result of an effect that uses the word “destroy” or as a result of the state-based actions that check for lethal damage (see rule 704.5g) or damage from a source with deathtouch (see rule 704.5h). If a permanent is put into its owner’s graveyard for any other reason, it hasn’t been “destroyed.”
- [614.1] - Some continuous effects are replacement effects. Like prevention effects (see rule 615), replacement effects apply continuously as events happen—they aren’t locked in ahead of time. Such effects watch for a particular event that would happen and completely or partially replace that event with a different event. They act like “shields” around whatever they’re affecting.
CITATIONS
[614.6], [701.8a], [700.4], [701.8b], [614.1]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```

## O3. Token copy of a card with kicker

Status: **FAIL**

Failures:
- Missing required citations: 707.2, 702.74
- Missing retrieved rules: 707.2, 702.74

Scenario:
```text
I cast [[Verdurous Gearhulk]] WITHOUT kicker. Then I cast [[Saheeli's Artistry]] copying Verdurous Gearhulk. Does the token copy have counters as if kicker had been paid?

Wait, Verdurous Gearhulk doesn't have kicker. Better example: I cast [[Aether Vial]]'s ability putting a creature directly into play (no kicker option for Vial). Bad example.
```

Expected verdict:
```text
Mirror Image becomes a copy of Spitebellows, copying its printed characteristics including the evoke trigger. However, Mirror Image was not cast by paying evoke's alternative cost (it was cast normally). The "if you evoked it, sacrifice" trigger only fires when the creature was evoked — Mirror Image was not. So the sacrifice doesn't happen.
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
- [405.1] - When a spell is cast, the physical card is put on the stack (see rule 601.2a). When an ability is activated or triggers, it goes on top of the stack without any card associated with it (see rules 602.2a and 603.3).
- [603.3] - Once an ability has triggered, its controller puts it on the stack as an object that’s not a card the next time a player would receive priority. See rule 117, “Timing and Priority.” The ability becomes the topmost object on the stack. It has the text of the ability that created it, and no other characteristics. It remains on the stack until it’s countered, it resolves, a rule causes it to be removed from the stack, or an effect moves it elsewhere.
- [603.2] - Whenever a game event or game state matches a triggered ability’s trigger event, that ability automatically triggers. The ability doesn’t do anything at this point.
- [117.3b] - The active player receives priority after a spell or ability (other than a mana ability) resolves.
- [608.2] - If the object that’s resolving is an instant spell, a sorcery spell, or an ability, its resolution may involve several steps. The steps described in rules 608.2a and 608.2b are followed first. The steps described in rules 608.2c–m are then followed as appropriate, in no specific order. The steps described in rule 608.2n and 608.2p are followed last.
CITATIONS
[405.1], [603.3], [603.2], [117.3b], [608.2]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```

## O4. Counters on a token that "should" carry

Status: **FAIL**

Failures:
- Missing required citations: 704.5d
- Missing retrieved rules: 704.5d
- Verdict polarity mismatch; expected NO-style answer

Scenario:
```text
I control a 1/1 Servo token with three +1/+1 counters on it (currently a 4/4). I cast [[Cytoshape]] making it a copy of [[Wurm Cavalcade]] (a 4/4) — wait, Cytoshape doesn't exist as a card. Use [[Mirrorhall Mimic]]? Doesn't quite work either.
```

Expected verdict:
```text
No. Tokens cease to exist when moved off the battlefield. The Servo goes from battlefield → hand briefly → ceases to exist (704.5d).
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
- [614.6] - If an event is replaced, it never happens. A modified event occurs instead, which may in turn trigger abilities. Note that the modified event may contain instructions that can’t be carried out, in which case the impossible instruction is simply ignored.
- [608.2] - If the object that’s resolving is an instant spell, a sorcery spell, or an ability, its resolution may involve several steps. The steps described in rules 608.2a and 608.2b are followed first. The steps described in rules 608.2c–m are then followed as appropriate, in no specific order. The steps described in rule 608.2n and 608.2p are followed last.
- [603.3] - Once an ability has triggered, its controller puts it on the stack as an object that’s not a card the next time a player would receive priority. See rule 117, “Timing and Priority.” The ability becomes the topmost object on the stack. It has the text of the ability that created it, and no other characteristics. It remains on the stack until it’s countered, it resolves, a rule causes it to be removed from the stack, or an effect moves it elsewhere.
- [603.2] - Whenever a game event or game state matches a triggered ability’s trigger event, that ability automatically triggers. The ability doesn’t do anything at this point.
- [614.1] - Some continuous effects are replacement effects. Like prevention effects (see rule 615), replacement effects apply continuously as events happen—they aren’t locked in ahead of time. Such effects watch for a particular event that would happen and completely or partially replace that event with a different event. They act like “shields” around whatever they’re affecting.
CITATIONS
[614.6], [608.2], [603.3], [603.2], [614.1]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```

## P1. Planeswalker loyalty abilities are sorcery-speed

Status: **FAIL**

Failures:
- Missing required citations: 606.5, 307.1
- Missing retrieved rules: 606.5, 307.1
- Verdict polarity mismatch; expected NO-style answer

Scenario:
```text
It is my opponent's end step. I have [[Jace, the Mind Sculptor]] on the battlefield. Can I activate one of his loyalty abilities right now?
```

Expected verdict:
```text
No. Loyalty abilities can be activated only as sorceries [606.5] — only during one of your main phases when the stack is empty.
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
- [800.4a] - When a player leaves the game, all objects (see rule 109) owned by that player leave the game and any effects which give that player control of any objects or players end. Then, if that player controlled any objects on the stack not represented by cards, those objects cease to exist. Then, if there are any objects still controlled by that player, those objects are exiled. This is not a state-based action. It happens as soon as the player leaves the game. If the player who left the game had priority at the time they left, priority passes to the next player in turn order who’s still in the game.
- [118.12] - Some spells, activated abilities, and triggered abilities read, “[Do something]. If [a player] [does, doesn’t, or can’t], [effect].” Or “[A player] may [do something]. If [that player] [does, doesn’t, or can’t], [effect].” The action [do something] is a cost, paid when the spell or ability resolves. The “If [a player] [does, doesn’t, or can’t]” clause checks whether the player chose to pay an optional cost or started to pay a mandatory cost, regardless of what events actually occurred.
- [607.5] - If an object acquires a pair of linked abilities as part of the same effect, the abilities will be similarly linked to one another on that object even though they weren’t printed on that object. They can’t be linked to any other ability, regardless of what other abilities the object may currently have or may have had in the past.
- [702.109a] - Dash represents three abilities: two static abilities that function while the card with dash is on the stack, one of which may create a delayed triggered ability, and a static ability that functions while the object with dash is on the battlefield. “Dash [cost]” means “You may cast this card by paying [cost] rather than its mana cost,” “If this spell’s dash cost was paid, return the permanent this spell becomes to its owner’s hand at the beginning of the next end step,” and “As long as this permanent’s dash cost was paid, it has haste.” Casting a spell for its dash cost follows the rules for paying alternative costs in 
...
```

## P2. Each planeswalker — loyalty once per turn

Status: **FAIL**

Failures:
- Missing required citations: 606.5b
- Missing retrieved rules: 606.5b
- Verdict polarity mismatch; expected NO-style answer

Scenario:
```text
I control [[Liliana, the Last Hope]] on my main phase. I activate her -2 ability targeting a creature. Can I activate her +1 ability in the same turn?
```

Expected verdict:
```text
No. A player may activate only one loyalty ability of each planeswalker each turn [606.5b].
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
- [603.3] - Once an ability has triggered, its controller puts it on the stack as an object that’s not a card the next time a player would receive priority. See rule 117, “Timing and Priority.” The ability becomes the topmost object on the stack. It has the text of the ability that created it, and no other characteristics. It remains on the stack until it’s countered, it resolves, a rule causes it to be removed from the stack, or an effect moves it elsewhere.
- [608.2] - If the object that’s resolving is an instant spell, a sorcery spell, or an ability, its resolution may involve several steps. The steps described in rules 608.2a and 608.2b are followed first. The steps described in rules 608.2c–m are then followed as appropriate, in no specific order. The steps described in rule 608.2n and 608.2p are followed last.
- [405.1] - When a spell is cast, the physical card is put on the stack (see rule 601.2a). When an ability is activated or triggers, it goes on top of the stack without any card associated with it (see rules 602.2a and 603.3).
- [117.3b] - The active player receives priority after a spell or ability (other than a mana ability) resolves.
- [603.2] - Whenever a game event or game state matches a triggered ability’s trigger event, that ability automatically triggers. The ability doesn’t do anything at this point.
CITATIONS
[603.3], [608.2], [405.1], [117.3b], [603.2]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```

## P3. Mana ability does not require priority

Status: **FAIL**

Failures:
- Missing required citations: 605.3a
- Missing retrieved rules: 605.3a
- Verdict polarity mismatch; expected NO-style answer

Review warnings:
- Expected verdict contains self-correction language; manually verify the knowledge-base entry.

Scenario:
```text
Opponent's [[Wrath of God]] is resolving. My creatures are being destroyed. Before they die (during resolution), can I tap one of them for mana to cast something?
```

Expected verdict:
```text
No. During resolution, no player has priority [608.2]. Mana abilities CAN be activated without priority, BUT only when a player is in the middle of casting a spell or activating an ability — not during another spell's resolution.

Wait — let me reread. 605.3a: mana abilities can be activated "whenever a player has priority" or "when a player is in the process of casting a spell or activating an ability requiring a mana payment."

So during another spell's resolution, neither condition is met. Can't activate.
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
- [608.2] - If the object that’s resolving is an instant spell, a sorcery spell, or an ability, its resolution may involve several steps. The steps described in rules 608.2a and 608.2b are followed first. The steps described in rules 608.2c–m are then followed as appropriate, in no specific order. The steps described in rule 608.2n and 608.2p are followed last.
- [701.8b] - The only ways a permanent can be destroyed are as a result of an effect that uses the word “destroy” or as a result of the state-based actions that check for lethal damage (see rule 704.5g) or damage from a source with deathtouch (see rule 704.5h). If a permanent is put into its owner’s graveyard for any other reason, it hasn’t been “destroyed.”
- [603.12] - A resolving spell or ability may allow or instruct a player to take an action and create a triggered ability that triggers “when [a player] [does or doesn’t]” take that action or “when [something happens] this way.” These reflexive triggered abilities follow the rules for delayed triggered abilities (see rule 603.7), except that they’re checked immediately after being created and trigger based on whether the trigger event or events occurred earlier during the resolution of the spell or ability that created them.
- [608.2g] - If an effect gives a player the option to pay mana, they may activate mana abilities before taking that action. If an effect specifically instructs or allows a player to cast a spell during resolution, they do so by following the steps in rules 601.2a–i, except no player receives priority after it’s cast. That spell becomes the topmost object on the stack, and the currently resolving spell or ability continues to resolve, which may include casting other spells this way. No other spells can normally be cast and no other abilities can normally be activated during resolution.
CITATIONS
[701.8a], [608.2], [701.8b], [603.12], [608.2g]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. 
...
```

## P4. "Activate only once per turn" tracking

Status: **FAIL**

Failures:
- Missing required citations: 602.5
- Missing retrieved rules: 602.5
- Verdict polarity mismatch; expected NO-style answer

Scenario:
```text
I control [[Mishra's Bauble]] — wait, that's not "once per turn." Use [[Memnite]] — also no. Use [[Sword of Feast and Famine]] — its trigger is "whenever attacks." Bad example.
```

Expected verdict:
```text
No, because Mind Stone is now tapped — the second ability also requires tapping it as a cost. Until it untaps, neither can be activated.

But: there's no "once per turn" restriction. If Mind Stone is untapped at some point (untap step or via Aether Vial-style effect), it can be activated again.
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
- [603.3] - Once an ability has triggered, its controller puts it on the stack as an object that’s not a card the next time a player would receive priority. See rule 117, “Timing and Priority.” The ability becomes the topmost object on the stack. It has the text of the ability that created it, and no other characteristics. It remains on the stack until it’s countered, it resolves, a rule causes it to be removed from the stack, or an effect moves it elsewhere.
- [603.2] - Whenever a game event or game state matches a triggered ability’s trigger event, that ability automatically triggers. The ability doesn’t do anything at this point.
- [603.1] - Triggered abilities have a trigger condition and an effect. They are written as “[When/Whenever/At] [trigger condition or event], [effect]. [Instructions (if any).]”
- [405.1] - When a spell is cast, the physical card is put on the stack (see rule 601.2a). When an ability is activated or triggers, it goes on top of the stack without any card associated with it (see rules 602.2a and 603.3).
- [117.3b] - The active player receives priority after a spell or ability (other than a mana ability) resolves.
CITATIONS
[603.3], [603.2], [603.1], [405.1], [117.3b]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```

## Q1. Mode chosen at casting

Status: **FAIL**

Failures:
- Missing required citations: 601.2b, 700.2
- Missing retrieved rules: 601.2b, 700.2

Scenario:
```text
I cast [[Cryptic Command]]. When do I choose which two of its four modes to use?
```

Expected verdict:
```text
At casting, specifically at 601.2b (choosing modes/X). The modes are locked in when the spell is cast, before payment and before resolution.
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
- [707.10] - To copy a spell, activated ability, or triggered ability means to put a copy of it onto the stack; a copy of a spell isn’t cast and a copy of an activated ability isn’t activated. A copy of a spell or ability copies both the characteristics of the spell or ability and all decisions made for it, including modes, targets, the value of X, and additional or alternative costs. (See rule 601, “Casting Spells.”) Choices that are normally made on resolution are not copied. If an effect of the copy refers to objects used to pay its costs, it uses the objects used to pay the costs of the original spell or ability. A copy of a spell is owned by the player under whose control it was put on the stack. A copy of a spell or ability is controlled by the player under whose control it was put on the stack. A copy of a spell is itself a spell, even though it has no spell card associated with it. A copy of an ability is itself an ability.
- [601.2c] - The player announces their choice of an appropriate object or player for each target the spell requires. A spell may require some targets only if an alternative or additional cost (such as a kicker cost) or a particular mode was chosen for it; otherwise, the spell is cast as though it did not require those targets. Similarly, a spell may require alternative targets only if an alternative or additional cost was chosen for it. If the spell has a variable number of targets, the player announces how many targets they will choose before they announce those targets. In some cases, the number of targets will be defined by the spell’s text. Once the number of targets the spell has is determined, that number doesn’t change, even if the information used to determine the number of 
...
```

## Q2. Modal spell with one mode becoming illegal

Status: **FAIL**

Failures:
- Missing required citations: 700.2
- Missing retrieved rules: 700.2

Scenario:
```text
I cast [[Charm of the Tempest]] (hypothetical: choose two — destroy artifact, draw card, deal 2 damage to a creature). I choose "destroy artifact" and "draw a card," targeting opponent's [[Sol Ring]]. In response, opponent sacrifices Sol Ring to a mana ability — wait, mana abilities don't go on stack. Let me say: opponent uses [[Snapback]] to bounce Sol Ring. Now Sol Ring isn't on the battlefield. What happens?
```

Expected verdict:
```text
Per 608.2b, when the spell resolves, the engine checks if all targets are still legal. The "destroy artifact" mode has no legal target (Sol Ring is no longer on battlefield). The other mode (draw a card) has no target. The illegal-target mode is skipped; the legal one (draw a card) still happens. So: no destruction (target illegal), but I draw a card.
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
- [701.8a] - To destroy a permanent, move it from the battlefield to its owner’s graveyard.
- [405.1] - When a spell is cast, the physical card is put on the stack (see rule 601.2a). When an ability is activated or triggers, it goes on top of the stack without any card associated with it (see rules 602.2a and 603.3).
- [117.3b] - The active player receives priority after a spell or ability (other than a mana ability) resolves.
- [701.8b] - The only ways a permanent can be destroyed are as a result of an effect that uses the word “destroy” or as a result of the state-based actions that check for lethal damage (see rule 704.5g) or damage from a source with deathtouch (see rule 704.5h). If a permanent is put into its owner’s graveyard for any other reason, it hasn’t been “destroyed.”
CITATIONS
[608.2], [701.8a], [405.1], [117.3b], [701.8b]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```

## Q3. Charm "choose one or more"

Status: **FAIL**

Failures:
- Missing required citations: 700.2a
- Missing retrieved rules: 700.2a
- Verdict polarity mismatch; expected NO-style answer

Scenario:
```text
I cast [[Crosis's Charm]] ("Choose one — Return target permanent to its owner's hand; or destroy target creature; it can't be regenerated; or target player discards a card"). Can I choose multiple modes?
```

Expected verdict:
```text
No. "Choose one" — exactly one mode. Some charms say "choose one or more" or "choose two," allowing multiple. Crosis's Charm says "choose one," so exactly one.
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
- [608.2] - If the object that’s resolving is an instant spell, a sorcery spell, or an ability, its resolution may involve several steps. The steps described in rules 608.2a and 608.2b are followed first. The steps described in rules 608.2c–m are then followed as appropriate, in no specific order. The steps described in rule 608.2n and 608.2p are followed last.
- [701.8b] - The only ways a permanent can be destroyed are as a result of an effect that uses the word “destroy” or as a result of the state-based actions that check for lethal damage (see rule 704.5g) or damage from a source with deathtouch (see rule 704.5h). If a permanent is put into its owner’s graveyard for any other reason, it hasn’t been “destroyed.”
- [405.1] - When a spell is cast, the physical card is put on the stack (see rule 601.2a). When an ability is activated or triggers, it goes on top of the stack without any card associated with it (see rules 602.2a and 603.3).
- [117.3b] - The active player receives priority after a spell or ability (other than a mana ability) resolves.
CITATIONS
[701.8a], [608.2], [701.8b], [405.1], [117.3b]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```

## Q4. Choose new targets and the illegality rule

Status: **FAIL**

Failures:
- Missing required citations: 115.6
- Missing retrieved rules: 115.6
- Verdict polarity mismatch; expected YES-style answer

Scenario:
```text
Opponent casts [[Lightning Bolt]] targeting my creature. I cast [[Misdirection]] ("Change the target of target spell"). I want to redirect Bolt to my opponent. Legal?
```

Expected verdict:
```text
Yes, if my opponent is a legal target. Lightning Bolt targets "any target" — a player is legal. Misdirection changes the target to my opponent. Bolt resolves dealing 3 to my opponent.
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
- [405.1] - When a spell is cast, the physical card is put on the stack (see rule 601.2a). When an ability is activated or triggers, it goes on top of the stack without any card associated with it (see rules 602.2a and 603.3).
- [603.3] - Once an ability has triggered, its controller puts it on the stack as an object that’s not a card the next time a player would receive priority. See rule 117, “Timing and Priority.” The ability becomes the topmost object on the stack. It has the text of the ability that created it, and no other characteristics. It remains on the stack until it’s countered, it resolves, a rule causes it to be removed from the stack, or an effect moves it elsewhere.
- [117.3b] - The active player receives priority after a spell or ability (other than a mana ability) resolves.
- [603.1] - Triggered abilities have a trigger condition and an effect. They are written as “[When/Whenever/At] [trigger condition or event], [effect]. [Instructions (if any).]”
CITATIONS
[608.2], [405.1], [603.3], [117.3b], [603.1]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```

## Q5. As-enters choices

Status: **FAIL**

Failures:
- Missing required citations: 601.2b
- Missing retrieved rules: 601.2b
- Verdict polarity mismatch; expected NO-style answer

Review warnings:
- Expected verdict contains self-correction language; manually verify the knowledge-base entry.

Scenario:
```text
I cast [[Master of Etherium]] (an artifact creature) — wait, no as-enters. Use [[Engineered Explosives]] (X is chosen as it enters): I cast it with X=2. While it's resolving, can opponent's [[Force of Will]] counter it?
```

Expected verdict:
```text
No. Once the spell is resolving, it cannot be countered (counterspells target spells on the stack). During resolution, no priority [608.2]. The X choice happens at casting (601.2b), not during resolution.

But wait — [[Engineered Explosives]] is "with X charge counters." Is X chosen at casting or as it enters?

Looking at Oracle text: "Engineered Explosives enters with X charge counters on it." The X here is in the casting cost (Engineered Explosives is {X}), and X for the counter count equals the X paid in the cost. X is chosen at 601.2b during casting.
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
- [701.8a] - To destroy a permanent, move it from the battlefield to its owner’s graveyard.
- [700.4] - The term dies means “is put into a graveyard from the battlefield.”
- [701.8b] - The only ways a permanent can be destroyed are as a result of an effect that uses the word “destroy” or as a result of the state-based actions that check for lethal damage (see rule 704.5g) or damage from a source with deathtouch (see rule 704.5h). If a permanent is put into its owner’s graveyard for any other reason, it hasn’t been “destroyed.”
- [702.62a] - Suspend is a keyword that represents three abilities. The first is a static ability that functions while the card with suspend is in a player’s hand. The second and third are triggered abilities that function in the exile zone. “Suspend N—[cost]” means “If you could begin to cast this card by putting it onto the stack from your hand, you may pay [cost] and exile it with N time counters on it. This action doesn’t use the stack,” and “At the beginning of your upkeep, if this card is suspended, remove a time counter from it,” and “When the last time counter is removed from this card, if it’s exiled, you may play it without paying its mana cost if able. If you don’t, it remains exiled. If you cast a creature spell this way, it gains haste until you lose control of the spell or the permanent it becomes.”
CITATIONS
[608.2], [701.8a], [700.4], [701.8b], [702.62a]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```

## R1. Cascade — exile order matters

Status: **FAIL**

Failures:
- Missing required citations: 702.85a
- Missing retrieved rules: 702.85a
- Verdict polarity mismatch; expected NO-style answer

Scenario:
```text
I cast [[Bloodbraid Elf]] (Cascade). I exile the top card of my library: [[Lightning Bolt]] (cost {R}, mana value 1 — less than 4, can be cast). Do I get to look at the next card too?
```

Expected verdict:
```text
No. Cascade stops at the first card with lesser mana value that's a nonland. Bloodbraid Elf is mana value 4; Lightning Bolt is 1 < 4. I may cast Lightning Bolt (or choose not to). Either way, cascade then resolves the remaining "put the exiled cards on the bottom in random order" — meaning the rest of the exiled cards (none in this case) go to the bottom.
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
- [405.1] - When a spell is cast, the physical card is put on the stack (see rule 601.2a). When an ability is activated or triggers, it goes on top of the stack without any card associated with it (see rules 602.2a and 603.3).
- [603.3] - Once an ability has triggered, its controller puts it on the stack as an object that’s not a card the next time a player would receive priority. See rule 117, “Timing and Priority.” The ability becomes the topmost object on the stack. It has the text of the ability that created it, and no other characteristics. It remains on the stack until it’s countered, it resolves, a rule causes it to be removed from the stack, or an effect moves it elsewhere.
- [117.3b] - The active player receives priority after a spell or ability (other than a mana ability) resolves.
- [603.2] - Whenever a game event or game state matches a triggered ability’s trigger event, that ability automatically triggers. The ability doesn’t do anything at this point.
CITATIONS
[608.2], [405.1], [603.3], [117.3b], [603.2]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```

## R2. Cascade — what about X spells?

Status: **FAIL**

Failures:
- Missing required citations: 702.85a, 107.3, 704.5f
- Missing retrieved rules: 702.85a, 107.3, 704.5f
- Verdict polarity mismatch; expected YES-style answer

Scenario:
```text
I cast [[Maelstrom Wanderer]] (Cascade, Cascade). Cascade reveals [[Walking Ballista]] (cost {X}{X}, mana value 0 when on the stack). Can I cast it?
```

Expected verdict:
```text
Yes — Walking Ballista's mana value with X=0 is 0, which is less than Maelstrom Wanderer's 8. Cast it. But: I must pay X=0 (cascade lets me cast without paying mana cost, so X is 0 by default — there's no mana to pay). Walking Ballista enters with 0 +1/+1 counters and dies to SBAs.
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
- [700.4] - The term dies means “is put into a graveyard from the battlefield.”
- [701.8a] - To destroy a permanent, move it from the battlefield to its owner’s graveyard.
- [405.1] - When a spell is cast, the physical card is put on the stack (see rule 601.2a). When an ability is activated or triggers, it goes on top of the stack without any card associated with it (see rules 602.2a and 603.3).
- [117.3b] - The active player receives priority after a spell or ability (other than a mana ability) resolves.
CITATIONS
[608.2], [700.4], [701.8a], [405.1], [117.3b]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```

## R3. Suspend creates a delayed trigger

Status: **FAIL**

Failures:
- Missing required citations: 702.61
- Missing retrieved rules: 702.61

Scenario:
```text
I exile [[Lotus Bloom]] (Suspend 3, {0}) from my hand using suspend. Three turns pass with time counters removed. Now there are 0 time counters. What triggers?
```

Expected verdict:
```text
A delayed triggered ability fires: "When the last time counter is removed from this card, if it's exiled, play it without paying its mana cost." Lotus Bloom enters the battlefield via this delayed trigger [702.61].
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
- [603.3] - Once an ability has triggered, its controller puts it on the stack as an object that’s not a card the next time a player would receive priority. See rule 117, “Timing and Priority.” The ability becomes the topmost object on the stack. It has the text of the ability that created it, and no other characteristics. It remains on the stack until it’s countered, it resolves, a rule causes it to be removed from the stack, or an effect moves it elsewhere.
- [603.2] - Whenever a game event or game state matches a triggered ability’s trigger event, that ability automatically triggers. The ability doesn’t do anything at this point.
- [603.1] - Triggered abilities have a trigger condition and an effect. They are written as “[When/Whenever/At] [trigger condition or event], [effect]. [Instructions (if any).]”
- [405.1] - When a spell is cast, the physical card is put on the stack (see rule 601.2a). When an ability is activated or triggers, it goes on top of the stack without any card associated with it (see rules 602.2a and 603.3).
- [608.2] - If the object that’s resolving is an instant spell, a sorcery spell, or an ability, its resolution may involve several steps. The steps described in rules 608.2a and 608.2b are followed first. The steps described in rules 608.2c–m are then followed as appropriate, in no specific order. The steps described in rule 608.2n and 608.2p are followed last.
CITATIONS
[603.3], [603.2], [603.1], [405.1], [608.2]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```

## R4. Foretell — alternative cost from exile

Status: **FAIL**

Failures:
- Missing required citations: 702.143
- Missing retrieved rules: 702.143

Scenario:
```text
Last turn, I foretold a card by paying {2}: now there's a face-down card in exile. This turn, I want to cast it via its foretell cost. The card is [[Behold the Multiverse]] (Foretell {1}{U}{U}, normal cost {3}{U}). What cost do I pay?
```

Expected verdict:
```text
{1}{U}{U} (the foretell cost), and I cast it from exile. Foretell cost is an alternative cost [702.143].
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
- [405.1] - When a spell is cast, the physical card is put on the stack (see rule 601.2a). When an ability is activated or triggers, it goes on top of the stack without any card associated with it (see rules 602.2a and 603.3).
- [117.3b] - The active player receives priority after a spell or ability (other than a mana ability) resolves.
- [603.1] - Triggered abilities have a trigger condition and an effect. They are written as “[When/Whenever/At] [trigger condition or event], [effect]. [Instructions (if any).]”
CITATIONS
[608.2], [603.3], [405.1], [117.3b], [603.1]
VERDICT
The local rules above ground the answer, but Arbiter could not produce a full model explanation. Use the RULE TRACE as the authoritative local source.
```

## R5. Mutate creates a merged permanent

Status: **FAIL**

Failures:
- Missing required citations: 702.139, 729.6
- Missing retrieved rules: 702.139, 729.6

Scenario:
```text
I control [[Brokkos, Apex of Forever]] (my commander, 6/6). I cast [[Auspicious Starrix]] for its mutate cost, placing Auspicious Starrix on TOP of Brokkos. What is the merged permanent?
```

Expected verdict:
```text
A single permanent with Auspicious Starrix's printed name on top: it has the top card's name, types, P/T, mana cost, AND all abilities of all cards in the merged stack. Effectively, Auspicious Starrix is on top; the merged permanent is "Auspicious Starrix" (5/5 with Auspicious Starrix's abilities + Brokkos's abilities).
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
- [702.62a] - Suspend is a keyword that represents three abilities. The first is a static ability that functions while the card with suspend is in a player’s hand. The second and third are triggered abilities that function in the exile zone. “Suspend N—[cost]” means “If you could begin to cast this card by putting it onto the stack from your hand, you may pay [cost] and exile it with N time counters on it. This action doesn’t use the stack,” and “At the beginning of your upkeep, if this card is suspended, remove a time counter from it,” and “When the last time counter is removed from this card, if it’s exiled, you may play it without paying its mana cost if able. If you don’t, it remains exiled. If you cast a creature spell this way, it gains haste until you lose control of the spell or the permanent it becomes.”
- [707.10] - To copy a spell, activated ability, or triggered ability means to put a copy of it onto the stack; a copy of a spell isn’t cast and a copy of an activated ability isn’t activated. A copy of a spell or ability copies both the characteristics of the spell or ability and all decisions made for it, including modes, targets, the value of X, and additional or alternative costs. (See rule 601, “Casting Spells.”) Choices that are normally made on resolution are not copied. If an effect of the copy refers to objects used to pay its costs, it uses the objects used to pay the costs of the original spell or ability. A copy of a spell is owned by the player under whose control it was put on the stack. A copy of a spell or ability is controlled by the player under whose control it was put on the stack. A copy of a spell is itself a spell, even though it has no spell card associated with it. A copy of an ability is itself an ability.
- [118.12] - Some spells, activated abilities, and triggered abilities read, “[Do something]. If [a player] [does, doesn’t, or can’t], [effect].” Or “[A player] may [do something]. If [that player] [does, doesn’t, or can’t], [effect].” The action [do something] is a cost, paid when the spell or ability resolves. The “If [a player] 
...
```
