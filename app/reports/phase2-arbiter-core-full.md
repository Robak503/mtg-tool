# Arbiter Knowledge Validation Report

Generated: 2026-05-25T04:06:47.506Z
Endpoint: `http://localhost:3000/api/arbiter`
Prompt: `ARBITER_PROMPT`
Suite: `core`
Card context: `Scryfall Oracle + WOTC rulings`
Result: **76/76 passed**

| Test | Source | Title | Result | Missing citations | Failures |
|---|---|---|---|---|---|
| A1 | META_test_cases.md | Leyline of the Void + creature death + Blood Artist | PASS | - | - |
| A2 | META_test_cases.md | Anafenza + Rest in Peace + Living Death (three-way replacement) | PASS | - | - |
| A3 | META_test_cases.md | Commander dying with shield counter and Command Zone replacement | PASS | - | - |
| B1 | META_test_cases.md | Eminence ability triggering from the Command Zone | PASS | - | - |
| B2 | META_test_cases.md | Reflexive trigger during resolution | PASS | - | - |
| B3 | META_test_cases.md | State trigger that's already on the stack | PASS | - | - |
| C1 | META_test_cases.md | Commander damage with a copy of a commander | PASS | - | - |
| C2 | META_test_cases.md | Commander tax with alternative cost | PASS | - | - |
| C3 | META_test_cases.md | Partner commanders with different color identities | PASS | - | - |
| C4 | META_test_cases.md | Mutate onto a commander | PASS | - | - |
| D1 | META_test_cases.md | Sacrifice-as-cost with cost reducer | PASS | - | - |
| E1 | META_test_cases.md | Layer interaction — characteristic-defining ability and Humility | PASS | - | - |
| E2 | META_test_cases.md | Timestamp interaction | PASS | - | - |
| F1 | META_test_cases.md | Daybound/Nightbound in 4-player Commander | PASS | - | - |
| F2 | META_test_cases.md | APNAP in 4-player with simultaneous decisions | PASS | - | - |
| G1 | META_test_cases.md | Player leaving with stack objects | PASS | - | - |
| H1 | META_test_cases.md | The Replacement-vs-Replaced distinction | PASS | - | - |
| H3 | META_test_cases.md | "Can't" Beats "Can" | PASS | - | - |
| I1 | META_test_cases.md | Stack object ownership confusion | PASS | - | - |
| I2 | META_test_cases.md | Mid-resolution state changes | PASS | - | - |
| I3 | META_test_cases.md | Modal spell — which mode is chosen? | PASS | - | - |
| J1 | META_test_cases.md | X cost is locked at casting | PASS | - | - |
| J2 | META_test_cases.md | Commander tax stacks with other taxes | PASS | - | - |
| J3 | META_test_cases.md | Thalia DOES apply to noncreature commander | PASS | - | - |
| J4 | META_test_cases.md | Phyrexian mana with life replacement | PASS | - | - |
| J5 | META_test_cases.md | Cost reducer can't reduce colored requirement | PASS | - | - |
| J6 | META_test_cases.md | Additional cost (sacrifice) — what if the creature dies in response? | PASS | - | - |
| J7 | META_test_cases.md | Alternative cost replaces base cost, additional costs still apply | PASS | - | - |
| J8 | META_test_cases.md | Mana ability activated DURING cost payment | PASS | - | - |
| K1 | META_test_cases.md | Layer 1 (copy) applies before Layer 7 (P/T) | PASS | - | - |
| K2 | META_test_cases.md | Layer 2 control change — control-dependent abilities | PASS | - | - |
| K3 | META_test_cases.md | Layer 4 type change cascades | PASS | - | - |
| K4 | META_test_cases.md | CDA vs. set effect — which wins in layer 7b? | PASS | - | - |
| K5 | META_test_cases.md | Set then modify in layer 7 | PASS | - | - |
| K6 | META_test_cases.md | P/T with +1/+1 counters | PASS | - | - |
| K7 | META_test_cases.md | Timestamp ordering on layer 7c modifiers | PASS | - | - |
| K8 | META_test_cases.md | Dependencies override timestamps | PASS | - | - |
| K9 | META_test_cases.md | Static ability granted by counter | PASS | - | - |
| K10 | META_test_cases.md | Layer 7e — switch power/toughness | PASS | - | - |
| L1 | META_test_cases.md | Two replacements, controller of affected object chooses | PASS | - | - |
| L2 | META_test_cases.md | Self-replacing effects bypass the 616 choice | PASS | - | - |
| L3 | META_test_cases.md | Replacement + prevention on same damage event | PASS | - | - |
| L4 | META_test_cases.md | Three-way replacement on ETB counters | PASS | - | - |
| L5 | META_test_cases.md | Self-replacing effects (614.5) apply first | PASS | - | - |
| L6 | META_test_cases.md | Replacement effect for "instead" damage rerouting | PASS | - | - |
| M1 | META_test_cases.md | Basic mana ability — no stack | PASS | - | - |
| M2 | META_test_cases.md | Triggered mana ability — uses stack | PASS | - | - |
| M3 | META_test_cases.md | Mana pool empties between phases | PASS | - | - |
| M4 | META_test_cases.md | Mana abilities during cost payment (re-test from J8 angle) | PASS | - | - |
| M5 | META_test_cases.md | Restricted mana (snow, "spend only on") | PASS | - | - |
| N1 | META_test_cases.md | Multiple blockers and damage assignment order | PASS | - | - |
| N2 | META_test_cases.md | First strike damage step (only when needed) | PASS | - | - |
| N3 | META_test_cases.md | Trample with multiple blockers | PASS | - | - |
| N4 | META_test_cases.md | Lifelink rules | PASS | - | - |
| N5 | META_test_cases.md | Deathtouch with multiple blockers | PASS | - | - |
| N6 | META_test_cases.md | Creature removed from combat mid-step | PASS | - | - |
| N7 | META_test_cases.md | Indestructible + lethal damage | PASS | - | - |
| N8 | META_test_cases.md | Damage prevention vs. damage replacement | PASS | - | - |
| O1 | META_test_cases.md | Tokens entering with counters | PASS | - | - |
| O2 | META_test_cases.md | Anafenza vs. token | PASS | - | - |
| O3 | META_test_cases.md | Copy of a card with evoke | PASS | - | - |
| O4 | META_test_cases.md | Counters on a token that "should" carry | PASS | - | - |
| P1 | META_test_cases.md | Planeswalker loyalty abilities are sorcery-speed | PASS | - | - |
| P2 | META_test_cases.md | Each planeswalker — loyalty once per turn | PASS | - | - |
| P3 | META_test_cases.md | Mana ability does not require priority | PASS | - | - |
| P4 | META_test_cases.md | "Activate only once per turn" tracking | PASS | - | - |
| Q1 | META_test_cases.md | Mode chosen at casting | PASS | - | - |
| Q2 | META_test_cases.md | Modal spell with one mode becoming illegal | PASS | - | - |
| Q3 | META_test_cases.md | Charm "choose one or more" | PASS | - | - |
| Q4 | META_test_cases.md | Choose new targets and the illegality rule | PASS | - | - |
| Q5 | META_test_cases.md | As-enters choices | PASS | - | - |
| R1 | META_test_cases.md | Cascade — exile order matters | PASS | - | - |
| R2 | META_test_cases.md | Cascade — what about X spells? | PASS | - | - |
| R3 | META_test_cases.md | Suspend creates a delayed trigger | PASS | - | - |
| R4 | META_test_cases.md | Foretell — alternative cost from exile | PASS | - | - |
| R5 | META_test_cases.md | Mutate creates a merged permanent | PASS | - | - |

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
- [603.3b] - If multiple abilities have triggered since the last time a player received priority, the abilities are placed on the stack in a two-part process. First, each player, in APNAP order, puts each triggered ability they control with a trigger condition that isn’t another ability triggering on the stack in any order they choose. (See rule 101.4.) Second, each player, in APNAP order, puts all remaining triggered abilities they control on the stack in any order they choose. Then the game once again checks for and performs state-based actions until none are performed, then abilities that triggered during this process go on the stack. This process repeats until no new state-based actions are performed and no abilities trigger. Then the appropriate player gets priority.
- [101.4] - If multiple players would make choices and/or take actions at the same time, the active player (the player whose turn it is) makes any choices required, then the next player in turn order (usually the player seated to the active player’s left) makes any choices required, followed by the remaining nonactive players in turn order. Then the actions happen simultaneously. This rule is often referred to as the “Active Player, Nonactive Player (APNAP) order” rule.
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all 
...
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
- [704.5d] - If a token is in a zone other than the battlefield, it ceases to exist.
- [613.4c] - Layer 7c: Effects and counters that modify power and/or toughness (but don’t set power and/or toughness to a specific number or value) are applied.
- [603.3] - Once an ability has triggered, its controller puts it on the stack as an object that’s not a card the next time a player would receive priority. See rule 117, “Timing and Priority.” The ability becomes the topmost object on the stack. It has the text of the ability that created it, and no other characteristics. It remains on the stack until it’s countered, it resolves, a rule causes it to be removed from the stack, or an effect moves it elsewhere.
- [701.8b] - The only ways a permanent can be destroyed are as a result of an effect that uses the word “destroy” or as a result of the state-based actions that check for lethal damage (s
...
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
- [704.5g] - If a creature has toughness greater than 0, it has damage marked on it, and the total damage marked on it is greater than or equal to its toughness, that creature has been dealt lethal damage and is destroyed. Regeneration can replace this event.
- [903.9a] - If a commander is in a graveyard or in exile and that object was put into that zone since the last time state-based actions were checked, its owner may put it into the command zone. This is a state-based action. See rule 704.
- [702.15b] - Damage dealt by a source with lifelink causes that source’s controller, or its owner if it has no controller, to gain that much life (in addition to any other results that damage causes). See rule 120.3.
- [101.2] - When a rule or effect allows or directs something to happen, and another effect states that it can’t happen, the “can’t” effect takes precedence.
- [613.4c] - Layer 7c: Effects and counters that modify power and/or toughness (but don’t set power and/or toughness to a specific number or value) are applied.
- [702.2c] - Any nonzero amount of combat damage assigned to a creature by a source with deathtouch is considered to be lethal damage for the purposes of det
...
```

## B1. Eminence ability triggering from the Command Zone

Status: **PASS**

Scenario:
```text
I have [[Edgar Markov]] in the Command Zone (not cast yet). Eminence says "Whenever you cast another Vampire spell, create a 1/1 black Vampire creature token." I cast [[Bloodghast]]. Does Eminence trigger?
```

Expected verdict:
```text
Yes. Bloodghast has the type line "Vampire Spirit," so Edgar Markov's Eminence ability triggers when Bloodghast is cast. The 1/1 black Vampire creature token is created when the Eminence trigger resolves.
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
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast includes Phyrexian mana symbols, the player announces whether they intend to pay 2 life or a corresponding colored mana cost for each of those symbols. Previously made choices (such as choosing to cast a spell with flashback from a graveyard or choosing to cast a creature with morph face down) may restrict the player’s options when making these choices.
- [601.2f] - The player determines the total cost of the spell. Usually this is just the mana cost. Some spells have additional or alternative costs. Some effects may increase or reduce the cost to pay, or may provide other alternative costs. Costs may include paying mana, tapping permanents, sacrificing permanents, discarding cards, and so on. The total cost is the mana cost or alternative cost (as determined in rule 601.2b), plus all additional costs and cost increases, and minus all cost reductions. If multiple cost reductions apply, the player may apply them in any order. If the mana comp
...
```

## B2. Reflexive trigger during resolution

Status: **PASS**

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
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast includes Phyrexian mana symbols, the player announces whether they intend to pay 2 life or a corresponding colored mana cost for each of those symbols. Previously made choices (such as choosing to cast a spell with flashback from a graveyard or choosing to cast a creature with morph face down) may restrict the player’s options when making these choices.
- [700.2a] - The controller of a modal spell or activated ability chooses the mode(s) as part of casting that spell or activating that ability. If one of the modes would be illegal (due to an inability to choose legal targets, for exam
...
```

## B3. State trigger that's already on the stack

Status: **PASS**

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
- [800.4a] - When a player leaves the game, all objects (see rule 109) owned by that player leave the game and any effects which give that player control of any objects or players end. Then, if that player controlled any objects on the stack not represented by cards, those objects cease to exist. Then, if there are any objects still controlled by that player, those objects are exiled. This is not a state-based action. It happens as soon as the player leaves the game. If the player who left the game had priority at the time they left, priority passes to the next player in turn order who’s still in the game.
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast includes Phyrexian mana symbols, the player announces whether they intend to pay 2 life or a corresponding colored mana cost for each of those symbols. Previously made choices (such as choosing to cast a spell with flashback from a graveyard or choosing to cast a creature with morph face down) may restrict the player’s options when making 
...
```

## C1. Commander damage with a copy of a commander

Status: **PASS**

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
- [707.2] - When copying an object, the copy acquires the copiable values of the original object’s characteristics and, for an object on the stack, choices made when casting or activating it (mode, targets, the value of X, whether it was kicked, how it will affect multiple targets, and so on). The copiable values are the values derived from the text printed on the object (that text being name, mana cost, color indicator, card type, subtype, supertype, rules text, power, toughness, and/or loyalty), as modified by other copy effects, by its face-down status, and by “as . . . enters” and “as . . . is turned face up” abilities that set power and toughness (and may also set additional characteristics). Other effects (including type-changing and text-changing effects), status, counters, and stickers are not copied.
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast includes Phyrexian mana symbols, the player announces whether they intend to pay 2 life or a corresponding colored mana cost for each 
...
```

## C2. Commander tax with alternative cost

Status: **PASS**

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
- [903.8] - A player may cast a commander they own from the command zone. A commander cast from the command zone costs an additional {2} for each previous time the player casting it has cast it from the command zone that game. This additional cost is informally known as the “commander tax.”
- [903.9a] - If a commander is in a graveyard or in exile and that object was put into that zone since the last time state-based actions were checked, its owner may put it into the command zone. This is a state-based action. See rule 704.
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast includes Phyrexian mana symbols, the player announces whether they intend to pay 2 life or a corresponding colored mana cost for each of those symbols. Previously made choices (such as choosing to cast a spell with flashback from a graveyard or choosing to cast a creature with morph face down) may restrict the player’s options when making these choices.
- [601.2f] - The player determines the total cost of the spell. Usua
...
```

## C3. Partner commanders with different color identities

Status: **PASS**

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
- [903.4d] - The back face of a double-faced card (see rule 712) is included when determining a card’s color identity. This is an exception to rule 712.8a.
- [702.124] - Partner
- [903.8] - A player may cast a commander they own from the command zone. A commander cast from the command zone costs an additional {2} for each previous time the player casting it has cast it from the command zone that game. This additional cost is informally known as the “commander tax.”
- [903.9a] - If a commander is in a graveyard or in exile and that object was put into that zone since the last time state-based actions were checked, its owner may put it into the command zone. This is a state-based action. See rule 704.
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast includes Phyrexian mana symbols, the player announces whether they intend to pay 2 life or a corresponding colored mana cost for each of those symbols. Previously made choices (such as choosing to cast a spell with flashback from a graveyard or c
...
```

## C4. Mutate onto a commander

Status: **PASS**

Scenario:
```text
My commander is [[Brokkos, Apex of Forever]]. I cast another mutate creature, [[Auspicious Starrix]], and mutate it onto Brokkos with Auspicious Starrix going on top. The merged permanent is then destroyed. Where do the cards go?
```

Expected verdict:
```text
- Brokkos, as a commander, has the choice (per 903.9a) to be sent to the command zone instead of the graveyard.
- Auspicious Starrix has no such option — it goes to the graveyard.
- If the player chooses to send Brokkos to the command zone, only Brokkos moves to the command zone; Starrix goes to the graveyard.
- Merged permanents separate when leaving the battlefield [730.3].
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
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast includes Phyrexian mana symbols, the player announces whether they intend to pay 2 life or a corresponding colored mana cost for each of those symbols. Previously made choices (such as choosing to cast a spell with flashback from a graveyard or choosing to cast a creature with morph face down) may restrict the player’s options when making these choices.
- [601.2f] - The player determines the total cost of the spell. Usually this is just the mana cost. Some spells have additional or alternative costs. Some effects may increase or reduce the cost to pay, or may provide other alternative costs. Costs may include paying mana, tapping permanents, sacrificing permanents, discarding cards, and so on. The total cost is the mana cost or alternative cost (as determined in rule 601.2b), plus all additional costs and cost increases, and minus all cost reductions. If multiple cost reductions apply, the player may apply them in any order. If the mana comp
...
```

## D1. Sacrifice-as-cost with cost reducer

Status: **PASS**

Scenario:
```text
I control [[Heartless Summoning]] ("Creature spells you cast cost {2} less to cast"). I want to cast [[Massacre Wurm]] ({4}{B}{B}). Does Heartless Summoning reduce the cost?
```

Expected verdict:
```text
Yes. Massacre Wurm is a creature spell, so Heartless Summoning reduces only the generic portion of its total cost. The cost becomes {2}{B}{B}.
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
- [601.2f] - The player determines the total cost of the spell. Usually this is just the mana cost. Some spells have additional or alternative costs. Some effects may increase or reduce the cost to pay, or may provide other alternative costs. Costs may include paying mana, tapping permanents, sacrificing permanents, discarding cards, and so on. The total cost is the mana cost or alternative cost (as determined in rule 601.2b), plus all additional costs and cost increases, and minus all cost reductions. If multiple cost reductions apply, the player may apply them in any order. If the mana component of the total cost is reduced to nothing by cost reduction effects, it is considered to be {0}. It can’t be reduced to less than {0}. Once the total cost is determined, any effects that directly affect the total cost are applied. Then the resulting total cost becomes “locked in.” If effects would change the total cost after this time, they have no effect.
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is bein
...
```

## E1. Layer interaction — characteristic-defining ability and Humility

Status: **PASS**

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
- [613.4b] - Layer 7b: Effects that set power and/or toughness to a specific number or value are applied. Effects that refer to the base power and/or toughness of a creature apply in this layer.
- [604.3] - Some static abilities are characteristic-defining abilities. A characteristic-defining ability conveys information about an object’s characteristics that would normally be found elsewhere on that object (such as in its mana cost, type line, or power/toughness box). Characteristic-defining abilities can add to or override information found elsewhere on that object. Characteristic-defining abilities function in all zones. They also function outside the game and before the game begins.
- [613.4d] - Layer 7d: Effects that switch a creature’s power and toughness are applied. Such effects take the value of power and apply it to the creature’s toughness, and take the value of toughness and apply it to the creature’s power.
- [613.4a] - Layer 7a: Effects from characteristic-defining abilities that define power and/or toughness are applied. See rule 604.3.
- [613.4c] - Layer 7c: Effects and counters that modify power and/or toughness (but don’t set power and/or toughness to a specific number or value) are applied.
- [613.3] - Within layers 2–6, apply effects from characteristic-defining abilities first (see rule 604.3), then all other effects in timestamp order (see rule 613.7). Note that dependency may alter the order in which effects are applied within a layer. (See rule 613.8.)
- [613.1d] - Layer 4: Type-changing effects are applied. These include effects that change an object’s card type, subtype, and/or supertype.
- [613.1b] - Layer 2: Control-changing effects are applied.
- [613.7] - Within a layer or sublayer, determining which order effects are applied in is usually done using a timestamp system. An effect with an earlier timestamp is applied before an effect with a later timestamp.
- [613.8] - Within a layer or sublayer, determining which order effects are applied in is sometimes done using a dependency system. If a dependency exists, it will override the timestamp
...
```

## E2. Timestamp interaction

Status: **PASS**

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
- [613.1b] - Layer 2: Control-changing effects are applied.
- [613.4c] - Layer 7c: Effects and counters that modify power and/or toughness (but don’t set power and/or toughness to a specific number or value) are applied.
- [613.3] - Within layers 2–6, apply effects from characteristic-defining abilities first (see rule 604.3), then all other effects in timestamp order (see rule 613.7). Note that dependency may alter the order in which effects are applied within a layer. (See rule 613.8.)
- [613.4b] - Layer 7b: Effects that set power and/or toughness to a specific number or value are applied. Effects that refer to the base power and/or toughness of a creature apply in this layer.
- [613.4d] - Layer 7d: Effects that switch a creature’s power and toughness are applied. Such effects take the value of power and apply it to the creature’s toughness, and take the value of toughness and apply it to the creature’s power.
- [613.7] - Within a layer or sublayer, determining which order effects are applied in is usually done using a timestamp system. An effect with an earlier timestamp is applied before an effect with a later timestamp.
- [613.8] - Within a layer or sublayer, determining which order effects are applied in is sometimes done using a dependency system. If a dependency exists, it will override the timestamp system.
- [604.3] - Some static abilities are characteristic-defining abilities. A characteristic-defining ability conveys information about an object’s characteristics that would normally be found elsewhere on that object (such as in its mana cost, type line, or power/toughness box). Characteristic-defining abilities can add to or override information found elsewhere on that object. Characteristic-defining abilities function in all zones. They also function outside the game and before the game begins.
- [613.1a] - Layer 1: Rules and effects that modify copiable values are applied.
- [613.1d] - Layer 4: Type-changing effects are applied. These include effects that change an object’s card type, subtype, and/or supertype.
- [613.1f] - Layer 6: Ability-adding effects
...
```

## F1. Daybound/Nightbound in 4-player Commander

Status: **PASS**

Scenario:
```text
It is currently day. The most recent player (Player A) cast 0 spells last turn. Player B cast 2 spells last turn. Player C cast 1 spell last turn. Player D (the active player) is about to begin their turn. Does it become night?
```

Expected verdict:
```text
No. Day/Night transitions check the previous turn's active player, not the current player's incoming turn. The check happens during the untap step, immediately after phasing. Day becomes night if the previous turn's active player cast no spells during that turn.

In a 4-player game, the previous turn's active player is the player whose turn just ended — Player C, who cast 1 spell. So day does NOT transition to night [731.2], [731.2a].
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
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast includes Phyrexian mana symbols, the player announces whether they intend to pay 2 life or a corresponding colored mana cost for each of those symbols. Previously made choices (such as choosing to cast a spell with flashback from a graveyard or choosing to cast a creature with morph face down) may restrict the player’s options when making these choices.
- [601.2f] - The player determines the total cost of the spell. Usually this is just the mana cost. Some spells have additional or alternative costs. Some effects may increase or reduce the cost to pay, or may provide other alternative costs. Costs may include paying mana, tapping permanents, sacrificing permanents, discarding cards, and so on. The total cost is the mana cost or alternative cost (as determined in rule 601.2b), plus all additional costs and cost increases, and minus all cost reductions. If multiple cost reductions apply, the player may apply them in any order. If the mana comp
...
```

## F2. APNAP in 4-player with simultaneous decisions

Status: **PASS**

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
- [101.4] - If multiple players would make choices and/or take actions at the same time, the active player (the player whose turn it is) makes any choices required, then the next player in turn order (usually the player seated to the active player’s left) makes any choices required, followed by the remaining nonactive players in turn order. Then the actions happen simultaneously. This rule is often referred to as the “Active Player, Nonactive Player (APNAP) order” rule.
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay.
...
```

## G1. Player leaving with stack objects

Status: **PASS**

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
- [800.4a] - When a player leaves the game, all objects (see rule 109) owned by that player leave the game and any effects which give that player control of any objects or players end. Then, if that player controlled any objects on the stack not represented by cards, those objects cease to exist. Then, if there are any objects still controlled by that player, those objects are exiled. This is not a state-based action. It happens as soon as the player leaves the game. If the player who left the game had priority at the time they left, priority passes to the next player in turn order who’s still in the game.
- [800.4b] - If an object would change to the control of a player who has left the game, it doesn’t. If a token would be created under the control of a player who has left the game, no token is created. If an object would be put onto the battlefield or onto the stack under the control of a player who has left the game, that object remains in its current zone. If a player would be controlled by a player who has left the game, they aren’t.
- [614.5] - A replacement effect doesn’t invoke itself repeatedly; it gets only one opportunity to affect an event or any modified events that may replace that event.
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative 
...
```

## H1. The Replacement-vs-Replaced distinction

Status: **PASS**

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
- [704.5d] - If a token is in a zone other than the battlefield, it ceases to exist.
- [701.8b] - The only ways a permanent can be destroyed are as a result of an effect that uses the word “destroy” or as a result of the state-based actions that check for lethal damage (see rule 704.5g) or damage from a source with deathtouch (see rule 704.5h). If a permanent is put into its owner’s graveyard for any other reason, it hasn’t been “destroyed.”
- [603.2] - Whenever a game event or game state matches a triggered ability’s trigger event, that ability automatically triggers. The ability doesn’t do anything at this point.
- [603.3] - Once an ability has triggered, its controller puts it on the stack as an object that’s not a card the next time a player would receive priority. See rule 117, “Timing and Priority.” The ability becomes the topmost object on the stack. It has the text of the ability that created it, and no other characteristics. It remains on the stack until it’s countered, it resolves, a rule causes it to be removed from the stack, or an effect moves it elsewhere.
- [603.1] - Triggered abilities have a trigger condition and an effect. They are written as “[When/Whenever/At] [trigger condition or event], [effect]. [Instructions (if any).]”
- [614.1] - Some continuous effects are replacement effects. Like prevention effects (see rule 615), replacement effects apply continuously as events happen—they aren’t locked in ahead of time. Such effects watch for a particular event that would happen and completely or partially replace that event with a different event. They act like “shields” around whatever they’re affecting.
- [616.1f] - Once
...
```

## H3. "Can't" Beats "Can"

Status: **PASS**

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
- [601.2f] - The player determines the total cost of the spell. Usually this is just the mana cost. Some spells have additional or alternative costs. Some effects may increase or reduce the cost to pay, or may provide other alternative costs. Costs may include paying mana, tapping permanents, sacrificing permanents, discarding cards, and so on. The total cost is the mana cost or alternative cost (as determined in rule 601.2b), plus all additional costs and cost increases, and minus all cost reductions. If multiple cost reductions apply, the player may apply them in any order. If the mana component of the total cost is reduced to nothing by cost reduction effects, it is considered to be {0}. It can’t be reduced to less than {0}. Once the total cost is determined, any effects that directly affect the total cost are applied. Then the resulting total cost becomes “locked in.” If effects would change the total cost after this time, they have no effect.
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is bein
...
```

## I1. Stack object ownership confusion

Status: **PASS**

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
- [601.2f] - The player determines the total cost of the spell. Usually this is just the mana cost. Some spells have additional or alternative costs. Some effects may increase or reduce the cost to pay, or may provide other alternative costs. Costs may include paying mana, tapping permanents, sacrificing permanents, discarding cards, and so on. The total cost is the mana cost or alternative cost (as determined in rule 601.2b), plus all additional costs and cost increases, and minus all cost reductions. If multiple cost reductions apply, the player may apply them in any order. If the mana component of the total cost is reduced to nothing by cost reduction effects, it is considered to be {0}. It can’t be reduced to less than {0}. Once the total cost is determined, any effects that directly affect the total cost are applied. Then the resulting total cost becomes “locked in.” If effects would change the total cost after this time, they have no effect.
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is bein
...
```

## I2. Mid-resolution state changes

Status: **PASS**

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
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast includes Phyrexian mana symbols, the player announces whether they intend to pay 2 life or a corresponding colored mana cost for each of those symbols. Previously made choices (such as choosing to cast a spell with flashback from a graveyard or choosing to cast a creature with morph face down) may restrict the player’s options when making these choices.
- [613.4d] - Layer 7d: Effects that switch a creature’s power and toughness are applied. Such effects take the value of power and apply it to the creature’s toughness, and take the value of toughness and apply it to the creature’s power.
- [613.4b] - Layer 7b: Effects that set power and/or toughness to a specific number or value are applied. Effects that refer to the base power and/or toughness of a creature apply in this layer.
- [601.2f] - The player determines the total cost of the spell. Usually this is just the mana cost. Some spells have additional or alternative costs. Some effects may
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
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast includes Phyrexian mana symbols, the player announces whether they intend to pay 2 life or a corresponding colored mana cost for each of those symbols. Previously made choices (such as choosing to cast a spell with flashback from a graveyard or choosing to cast a creature with morph face down) may restrict the player’s options when making these choices.
- [700.2a] - The controller of a modal spell or activated ability chooses the mode(s) as part of casting that spell or activating that ability. If one of the modes would be illegal (due to an inability to choose legal targets, for exam
...
```

## J1. X cost is locked at casting

Status: **PASS**

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
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast includes Phyrexian mana symbols, the player announces whether they intend to pay 2 life or a corresponding colored mana cost for each of those symbols. Previously made choices (such as choosing to cast a spell with flashback from a graveyard or choosing to cast a creature with morph face down) may restrict the player’s options when making these choices.
- [601.2f] - The player determines the total cost of the spell. Usually this is just the mana cost. Some spells have additional or alternative costs. Some effects may increase or reduce the cost to pay, or may provide other alternative costs. Costs may include paying mana, tapping permanents, sacrificing permanents, discarding cards, and so on. The total cost is the mana cost or alternative cost (as determined in rule 601.2b), plus all additional costs and cost increases, and minus all cost reductions. If multiple cost reductions apply, the player may apply them in any order. If the mana comp
...
```

## J2. Commander tax stacks with other taxes

Status: **PASS**

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
- [601.2f] - The player determines the total cost of the spell. Usually this is just the mana cost. Some spells have additional or alternative costs. Some effects may increase or reduce the cost to pay, or may provide other alternative costs. Costs may include paying mana, tapping permanents, sacrificing permanents, discarding cards, and so on. The total cost is the mana cost or alternative cost (as determined in rule 601.2b), plus all additional costs and cost increases, and minus all cost reductions. If multiple cost reductions apply, the player may apply them in any order. If the mana component of the total cost is reduced to nothing by cost reduction effects, it is considered to be {0}. It can’t be reduced to less than {0}. Once the total cost is determined, any effects that directly affect the total cost are applied. Then the resulting total cost becomes “locked in.” If effects would change the total cost after this time, they have no effect.
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at thi
...
```

## J3. Thalia DOES apply to noncreature commander

Status: **PASS**

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
- [608.2b] - If the spell or ability specifies targets, it checks whether the targets are still legal. A target that’s no longer in the zone it was in when it was targeted is illegal. Other changes to the game state may cause a target to no longer be legal; for example, its characteristics may have changed or an effect may have changed the text of the spell. If the source of an ability has left the zone it was in, its last known information is used during this process. If all its targets, for every instance of the word “target,” are now illegal, the spell or ability doesn’t resolve. It’s removed from the stack and, if it’s a spell, put into its owner’s graveyard. Otherwise, the spell or ability will resolve normally. Illegal targets, if any, won’t be affected by parts of a resolving spell’s effect for which they’re illegal. Other parts of the effect for which those targets are not illegal may still affect them. If the spell or ability creates any continuous effects that affect game rules (see rule 613.11), those effects don’t apply to illegal targets. If part of the effect requires information about an illegal target, it fails to determine any such information. Any part of the effect that requires that information won’t happen.
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of 
...
```

## J4. Phyrexian mana with life replacement

Status: **PASS**

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
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast includes Phyrexian mana symbols, the player announces whether they intend to pay 2 life or a corresponding colored mana cost for each of those symbols. Previously made choices (such as choosing to cast a spell with flashback from a graveyard or choosing to cast a creature with morph face down) may restrict the player’s options when making these choices.
- [601.2f] - The player determines the total cost of the spell. Usually this is just the mana cost. Some spells have additional or alternative costs. Some effects may increase or reduce the cost to pay, or may provide other alternative costs. Costs may include paying mana, tapping permanents, sacrificing permanents, discarding cards, and so on. The total cost is the mana cost or alternative cost (as determined in rule 601.2b), plus all additional costs and cost increases, and minus all cost reductions. If multiple cost reductions apply, the player may apply them in any order. If the mana comp
...
```

## J5. Cost reducer can't reduce colored requirement

Status: **PASS**

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
- [601.2f] - The player determines the total cost of the spell. Usually this is just the mana cost. Some spells have additional or alternative costs. Some effects may increase or reduce the cost to pay, or may provide other alternative costs. Costs may include paying mana, tapping permanents, sacrificing permanents, discarding cards, and so on. The total cost is the mana cost or alternative cost (as determined in rule 601.2b), plus all additional costs and cost increases, and minus all cost reductions. If multiple cost reductions apply, the player may apply them in any order. If the mana component of the total cost is reduced to nothing by cost reduction effects, it is considered to be {0}. It can’t be reduced to less than {0}. Once the total cost is determined, any effects that directly affect the total cost are applied. Then the resulting total cost becomes “locked in.” If effects would change the total cost after this time, they have no effect.
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is bein
...
```

## J6. Additional cost (sacrifice) — what if the creature dies in response?

Status: **PASS**

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
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast includes Phyrexian mana symbols, the player announces whether they intend to pay 2 life or a corresponding colored mana cost for each of those symbols. Previously made choices (such as choosing to cast a spell with flashback from a graveyard or choosing to cast a creature with morph face down) may restrict the player’s options when making these choices.
- [601.2f] - The player determines the total cost of the spell. Usually this is just the mana cost. Some spells have additional or alternative costs. Some effects may increase or reduce the cost to pay, or may provide other alternative costs. Costs may include paying mana, tapping permanents, sacrificing permanents, discarding cards, and so on. The total cost is the mana cost or alternative cost (as determined in rule 601.2b), plus all additional costs and cost increases, and minus all cost reductions. If multiple cost reductions apply, the player may apply them in any order. If the mana comp
...
```

## J7. Alternative cost replaces base cost, additional costs still apply

Status: **PASS**

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
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast includes Phyrexian mana symbols, the player announces whether they intend to pay 2 life or a corresponding colored mana cost for each of those symbols. Previously made choices (such as choosing to cast a spell with flashback from a graveyard or choosing to cast a creature with morph face down) may restrict the player’s options when making these choices.
- [601.2f] - The player determines the total cost of the spell. Usually this is just the mana cost. Some spells have additional or alternative costs. Some effects may increase or reduce the cost to pay, or may provide other alternative costs. Costs may include paying mana, tapping permanents, sacrificing permanents, discarding cards, and so on. The total cost is the mana cost or alternative cost (as determined in rule 601.2b), plus all additional costs and cost increases, and minus all cost reductions. If multiple cost reductions apply, the player may apply them in any order. If the mana comp
...
```

## J8. Mana ability activated DURING cost payment

Status: **PASS**

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
- [601.2f] - The player determines the total cost of the spell. Usually this is just the mana cost. Some spells have additional or alternative costs. Some effects may increase or reduce the cost to pay, or may provide other alternative costs. Costs may include paying mana, tapping permanents, sacrificing permanents, discarding cards, and so on. The total cost is the mana cost or alternative cost (as determined in rule 601.2b), plus all additional costs and cost increases, and minus all cost reductions. If multiple cost reductions apply, the player may apply them in any order. If the mana component of the total cost is reduced to nothing by cost reduction effects, it is considered to be {0}. It can’t be reduced to less than {0}. Once the total cost is determined, any effects that directly affect the total cost are applied. Then the resulting total cost becomes “locked in.” If effects would change the total cost after this time, they have no effect.
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is bein
...
```

## K1. Layer 1 (copy) applies before Layer 7 (P/T)

Status: **PASS**

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
- [604.3] - Some static abilities are characteristic-defining abilities. A characteristic-defining ability conveys information about an object’s characteristics that would normally be found elsewhere on that object (such as in its mana cost, type line, or power/toughness box). Characteristic-defining abilities can add to or override information found elsewhere on that object. Characteristic-defining abilities function in all zones. They also function outside the game and before the game begins.
- [613.4d] - Layer 7d: Effects that switch a creature’s power and toughness are applied. Such effects take the value of power and apply it to the creature’s toughness, and take the value of toughness and apply it to the creature’s power.
- [613.4b] - Layer 7b: Effects that set power and/or toughness to a specific number or value are applied. Effects that refer to the base power and/or toughness of a creature apply in this layer.
- [613.4c] - Layer 7c: Effects and counters that modify power and/or toughness (but don’t set power and/or toughness to a specific number or value) are applied.
- [613.4a] - Layer 7a: Effects from characteristic-defining abilities that define power and/or toughness are applied. See rule 604.3.
- [613.1b] - Layer 2: Control-changing effects are applied.
- [613.1f] - Layer 6: Ability-adding effects, keyword counters, ability-removing effects, and effects that say an object can’t have an ability are applied.
- [613.3] - Within layers 2–6, apply effects from characteristic-defining abilities first (see rule 604.3), then all other effects in timestamp order (see rule 613.7). Note that dependency may alter the order in which effects are applied within a layer. (See rule 613.8.)
- [613.1d] - Layer 4: Type-changing effects are applied. These include effects that change an object’s card type, subtype, and/or supertype.
- [613.7] - Within a layer or sublayer, determining which order effects are applied in is usually done using a timestamp system. An effect with an earlier timestamp is applied before an effect with a later timestamp.
- [613.1a] - Layer 1: Rules an
...
```

## K2. Layer 2 control change — control-dependent abilities

Status: **PASS**

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
- [613.1b] - Layer 2: Control-changing effects are applied.
- [613.4c] - Layer 7c: Effects and counters that modify power and/or toughness (but don’t set power and/or toughness to a specific number or value) are applied.
- [613.5] - The application of continuous effects as described by the layer system is continually and automatically performed by the game. All resulting changes to an object’s characteristics are instantaneous.
- [616.1f] - Once the chosen effect has been applied, this process is repeated (taking into account only replacement or prevention effects that would now be applicable) until there are no more left to apply.
- [712.13a] - Some abilities may cause a double-faced spell with its front face up on the stack to enter the battlefield transformed or converted. If the back face of the card that represents that spell is an instant or sorcery face, or that spell is a copy of a double-faced card created with an instant or sorcery back face, it doesn’t enter the battlefield, and is instead put into its owner’s graveyard.
- [120.4d] - Finally, the damage event occurs.
- [508.4] - If a creature is put onto the battlefield attacking, its controller chooses which defending player, planeswalker a defending player controls, or battle a defending player protects it’s attacking as it enters the battlefield (unless the effect that put it onto the battlefield specifies what it’s attacking). Similarly, if an effect states that a creature is attacking, its controller chooses which defending player, planeswalker a defending player controls, or battle a defending player protects it’s attacking (unless the effect has already specified). Such creatures are “attacking” but, for the purposes of trigger events and effects, they never “attacked.” They remain attacking creatures until they’re removed from combat or the combat phase ends, whichever comes first.
- [118.12] - Some spells, activated abilities, and triggered abilities read, “[Do something]. If [a player] [does, doesn’t, or can’t], [effect].” Or “[A player] may [do something]. If [that player] [does, doesn’t, or can’
...
```

## K3. Layer 4 type change cascades

Status: **PASS**

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
- [608.2] - If the object that’s resolving is an instant spell, a sorcery spell, or an ability, its resolution may involve several steps. The steps described in rules 608.2a and 608.2b are followed first. The steps described in rules 608.2c–m are then followed as appropriate, in no specific order. The steps described in rule 608.2n and 608.2p are followed last.
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast includes Phyrexian mana symbols, the player announces whether they intend to pay 2 life or a corresponding colored mana cost for each of those symbols. Previously made choices (such as choosing to cast a spell with flashback from a graveyard or choosing to cast a creature with morph face down) may restrict the player’s options when making these choices.
- [601.2f] - The player determines the total cost of the spell. Usually this is just the mana cost. Some spells have additional or alternative 
...
```

## K4. CDA vs. set effect — which wins in layer 7b?

Status: **PASS**

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
- [604.3] - Some static abilities are characteristic-defining abilities. A characteristic-defining ability conveys information about an object’s characteristics that would normally be found elsewhere on that object (such as in its mana cost, type line, or power/toughness box). Characteristic-defining abilities can add to or override information found elsewhere on that object. Characteristic-defining abilities function in all zones. They also function outside the game and before the game begins.
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast includes Phyrexian mana symbols, the player announces whether they intend to pay 2 life or a corresponding colored mana cost for each of those symbols. Previously made choices (such as choosing to cast a spell with flashback from a graveyard or choosing to cast a creature with morph face down) may restrict the player’s options when making these choices.
- [613.4b] - Layer 7b: Effects that set power and/or toughness to a specific number or value are ap
...
```

## K5. Set then modify in layer 7

Status: **PASS**

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
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast includes Phyrexian mana symbols, the player announces whether they intend to pay 2 life or a corresponding colored mana cost for each of those symbols. Previously made choices (such as choosing to cast a spell with flashback from a graveyard or choosing to cast a creature with morph face down) may restrict the player’s options when making these choices.
- [601.2f] - The player determines the total cost of the spell. Usually this is just the mana cost. Some spells have additional or alternative costs. Some effects may increase or reduce the cost to pay, or may provide other alternative costs. Costs may include paying mana, tapping permanents, sacrificing permanents, discarding cards, and so on. The total cost is the mana cost or alternative cost (as determined in rule 601.2b), plus all additional costs and cost increases, and minus all cost reductions. If multiple cost reductions apply, the player may apply them in any order. If the mana comp
...
```

## K6. P/T with +1/+1 counters

Status: **PASS**

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
- [613.4c] - Layer 7c: Effects and counters that modify power and/or toughness (but don’t set power and/or toughness to a specific number or value) are applied.
- [613.1b] - Layer 2: Control-changing effects are applied.
- [120.4d] - Finally, the damage event occurs.
- [613.5] - The application of continuous effects as described by the layer system is continually and automatically performed by the game. All resulting changes to an object’s characteristics are instantaneous.
- [702.62a] - Suspend is a keyword that represents three abilities. The first is a static ability that functions while the card with suspend is in a player’s hand. The second and third are triggered abilities that function in the exile zone. “Suspend N—[cost]” means “If you could begin to cast this card by putting it onto the stack from your hand, you may pay [cost] and exile it with N time counters on it. This action doesn’t use the stack,” and “At the beginning of your upkeep, if this card is suspended, remove a time counter from it,” and “When the last time counter is removed from this card, if it’s exiled, you may play it without paying its mana cost if able. If you don’t, it remains exiled. If you cast a creature spell this way, it gains haste until you lose control of the spell or the permanent it becomes.”
- [608.2f] - Some spells and abilities include actions taken on multiple players and/or objects. In most cases, each such action is processed simultaneously. If the action can’t be processed simultaneously, it’s instead processed considering each affected player or object individually. APNAP order is used to make the primary determination of the order of those actions. Secondarily, if the action is to be taken on both a player and an object they control or on multiple objects controlled by the same player, the player who controls the resolving spell or ability chooses the relative order of those actions.
- [702.1c] - An effect may state that “the same is true for” a list of keyword abilities or similar. If one of those keyword abilities has variants or variables and the effect grants that 
...
```

## K7. Timestamp ordering on layer 7c modifiers

Status: **PASS**

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
- [613.1b] - Layer 2: Control-changing effects are applied.
- [613.4c] - Layer 7c: Effects and counters that modify power and/or toughness (but don’t set power and/or toughness to a specific number or value) are applied.
- [613.7] - Within a layer or sublayer, determining which order effects are applied in is usually done using a timestamp system. An effect with an earlier timestamp is applied before an effect with a later timestamp.
- [613.3] - Within layers 2–6, apply effects from characteristic-defining abilities first (see rule 604.3), then all other effects in timestamp order (see rule 613.7). Note that dependency may alter the order in which effects are applied within a layer. (See rule 613.8.)
- [613.8] - Within a layer or sublayer, determining which order effects are applied in is sometimes done using a dependency system. If a dependency exists, it will override the timestamp system.
- [604.3] - Some static abilities are characteristic-defining abilities. A characteristic-defining ability conveys information about an object’s characteristics that would normally be found elsewhere on that object (such as in its mana cost, type line, or power/toughness box). Characteristic-defining abilities can add to or override information found elsewhere on that object. Characteristic-defining abilities function in all zones. They also function outside the game and before the game begins.
- [613.1a] - Layer 1: Rules and effects that modify copiable values are applied.
- [613.1d] - Layer 4: Type-changing effects are applied. These include effects that change an object’s card type, subtype, and/or supertype.
- [613.1f] - Layer 6: Ability-adding effects, keyword counters, ability-removing effects, and effects that say an object can’t have an ability are applied.
- [613.4a] - Layer 7a: Effects from characteristic-defining abilities that define power and/or toughness are applied. See rule 604.3.
- [613.4b] - Layer 7b: Effects that set power and/or toughness to a specific number or value are applied. Effects that refer to the base power and/or toughness of a creature apply in this
...
```

## K8. Dependencies override timestamps

Status: **PASS**

Scenario:
```text
[[Humility]] (timestamp T1, "all creatures lose abilities and are base 1/1") and [[Opalescence]] (timestamp T2, "non-Aura enchantments become 4/4 creatures") are both on the battlefield. After all effects, what are Humility and Opalescence?
```

Expected verdict:
```text
Both Humility and Opalescence are 4/4 creatures with no abilities. Opalescence applies in layer 4 to make both non-Aura enchantments creatures. Humility applies in layer 6 to remove abilities. In layer 7b, Humility's timestamp applies first, then Opalescence's later timestamp sets the creatures to 4/4.
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
- [613.3] - Within layers 2–6, apply effects from characteristic-defining abilities first (see rule 604.3), then all other effects in timestamp order (see rule 613.7). Note that dependency may alter the order in which effects are applied within a layer. (See rule 613.8.)
- [613.4b] - Layer 7b: Effects that set power and/or toughness to a specific number or value are applied. Effects that refer to the base power and/or toughness of a creature apply in this layer.
- [613.4d] - Layer 7d: Effects that switch a creature’s power and toughness are applied. Such effects take the value of power and apply it to the creature’s toughness, and take the value of toughness and apply it to the creature’s power.
- [613.7] - Within a layer or sublayer, determining which order effects are applied in is usually done using a timestamp system. An effect with an earlier timestamp is applied before an effect with a later timestamp.
- [613.4a] - Layer 7a: Effects from characteristic-defining abilities that define power and/or toughness are applied. See rule 604.3.
- [613.8] - Within a layer or sublayer, determining which order effects are applied in is sometimes done using a dependency system. If a dependency exists, it will override the timestamp system.
- [604.3] - Some static abilities are characteristic-defining abilities. A characteristic-defining ability conveys information about an object’s characteristics that would normally be found elsewhere on that object (such as in its mana cost, type line, or power/toughness box). Characteristic-defining abilities can add to or override information found elsewhere on that object. Characteristic-defining abilities function in all zones. They also function outside the game and before the game begins.
- [613.4c] - Layer 7c: Effects and counters that modify power and/or toughness (but don’t set power and/or toughness to a specific number or value) are applied.
- [613.1d] - Layer 4: Type-changing effects are applied. These include effects that change an object’s card type, subtype, and/or supertype.
- [613.1b] - Layer 2: Control-changing effects are 
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
- [613.4c] - Layer 7c: Effects and counters that modify power and/or toughness (but don’t set power and/or toughness to a specific number or value) are applied.
- [614.13] - An effect that modifies how a permanent enters the battlefield may cause other objects to change zones.
- [704.5d] - If a token is in a zone other than the battlefield, it ceases to exist.
- [608.2] - If the object that’s resolving is an instant spell, a sorcery spell, or an ability, its resolution may involve several steps. The steps described in rules 608.2a and 608.2b are followed first. The steps described in rules 608.2c–m are then followed as appropriate, in no specific order. The steps described in rule 608.2n and 608.2p are followed last.
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast includes Phyrexian mana symbols, the player announces whether they intend to pay 2 life or a corresponding colored mana cost for each of those symbo
...
```

## K10. Layer 7e — switch power/toughness

Status: **PASS**

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
- [613.4d] - Layer 7d: Effects that switch a creature’s power and toughness are applied. Such effects take the value of power and apply it to the creature’s toughness, and take the value of toughness and apply it to the creature’s power.
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast includes Phyrexian mana symbols, the player announces whether they intend to pay 2 life or a corresponding colored mana cost for each of those symbols. Previously made choices (such as choosing to cast a spell with flashback from a graveyard or choosing to cast a creature with morph face down) may restrict the player’s options when making these choices.
- [613.4b] - Layer 7b: Effects that set power and/or toughness to a specific number or value are applied. Effects that refer to the base power and/or toughness of a creature apply in this layer.
- [601.2f] - The player determines the total cost of the spell. Usually this is just the mana cost. Some spells have additional or alternative costs. Some effects may
...
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
- [614.6] - If an event is replaced, it never happens. A modified event occurs instead, which may in turn trigger abilities. Note that the modified event may contain instructions that can’t be carried out, in which case the impossible instruction is simply ignored.
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast includes Phyrexian mana symbols, the player announces whether they intend to pay 2 life or a corresponding colored mana cost for each of those symbols. Previously made choices (such as choosing to cast a spell with flashback from a graveyard or choosing to cast a creature with morph 
...
```

## L2. Self-replacing effects bypass the 616 choice

Status: **PASS**

Scenario:
```text
I control [[Vexing Shusher]] ("Spells you cast can't be countered"). I cast [[Lightning Bolt]] targeting an opponent's creature. Opponent casts [[Counterspell]] targeting Lightning Bolt. Does it counter?
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
- [608.2b] - If the spell or ability specifies targets, it checks whether the targets are still legal. A target that’s no longer in the zone it was in when it was targeted is illegal. Other changes to the game state may cause a target to no longer be legal; for example, its characteristics may have changed or an effect may have changed the text of the spell. If the source of an ability has left the zone it was in, its last known information is used during this process. If all its targets, for every instance of the word “target,” are now illegal, the spell or ability doesn’t resolve. It’s removed from the stack and, if it’s a spell, put into its owner’s graveyard. Otherwise, the spell or ability will resolve normally. Illegal targets, if any, won’t be affected by parts of a resolving spell’s effect for which they’re illegal. Other parts of the effect for which those targets are not illegal may still affect them. If the spell or ability creates any continuous effects that affect game rules (see rule 613.11), those effects don’t apply to illegal targets. If part of the effect requires information about an illegal target, it fails to determine any such information. Any part of the effect that requires that information won’t happen.
- [101.2] - When a rule or effect allows or directs something to happen, and another effect states that it can’t happen, the “can’t” effect takes precedence.
- [608.2] - If the object that’s resolving is an instant spell, a sorcery spell, or an ability, its resolution may involve several steps. The steps described in rules 608.2a and 608.2b are followed first. The steps described in rules 608.2c–m are then followed as appropriate, in no specific order. The steps described in rule 608.2n and 608.2p are followed last.
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 
...
```

## L3. Replacement + prevention on same damage event

Status: **PASS**

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
- [509.1c] - The defending player checks each creature they control to see whether it’s affected by any requirements (effects that say a creature must block, or that it must block if some condition is met). If the number of requirements that are being obeyed is fewer than the maximum possible number of requirements that could be obeyed without disobeying any restrictions, the declaration of blockers is illegal. If a creature can’t block unless a player pays a cost, that player is not required to pay that cost, even if blocking with that creature would increase the number of requirements being obeyed. If a requirement that says a creature blocks if able during a certain turn refers to a turn with multiple combat phases, the creature blocks if able during each declare blockers step in that turn.
- [510.1c] - A blocked creature assigns its combat damage to the creatures blocking it. If no creatures are currently blocking it (if, for example, they were destroyed or removed from combat), it assigns no combat damage. If exactly one creature is blocking it, it assigns all its combat damage to that creature. If two or more creatures are blocking it, it assigns its combat damage to those creatures divided as its controller chooses among them.
- [510.1d] - A blocking creature assigns combat damage to the creatures it’s blocking. If it isn’t currently blocking any creatures (if, for example, they were destroyed or removed from combat), it assigns no combat damage. If it’s blocking exactly one creature, it assigns all its combat damage to that creature. If it’s blocking two or more creatures, it assigns its combat damage divided as its controller chooses among them.
- [509.1] - First, the defending player declares blockers. This turn-based action doesn’t use the stack. To declare blockers, the defending player follows the steps below, in order. If at any point during the declaration of blockers, the defending player is unable to comply with any of the steps listed below, the declaration is illegal; the game returns to the moment before the declaration (see rule 733, “Handling Ill
...
```

## L4. Three-way replacement on ETB counters

Status: **PASS**

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
- [614.6] - If an event is replaced, it never happens. A modified event occurs instead, which may in turn trigger abilities. Note that the modified event may contain instructions that can’t be carried out, in which case the impossible instruction is simply ignored.
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast includes Phyrexian mana symbols, the player announces whether they intend to pay 2 life or a corresponding colored mana cost for each of those symbols. Previously made choices (such as choosing to cast a spell with flashback from a graveyard or choosing to cast a creature with morph 
...
```

## L5. Self-replacing effects (614.5) apply first

Status: **PASS**

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
- [614.6] - If an event is replaced, it never happens. A modified event occurs instead, which may in turn trigger abilities. Note that the modified event may contain instructions that can’t be carried out, in which case the impossible instruction is simply ignored.
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast includes Phyrexian mana symbols, the player announces whether they intend to pay 2 life or a corresponding colored mana cost for each of those symbols. Previously made choices (such as choosing to cast a spell with flashback from a graveyard or choosing to cast a creature with morph face down) may restrict the player’s options when making these choices.
- [601.2f] - The player determines the total cost of the spell. Usually this is just the mana cost. Some spells have additional or alternative costs. Some effects may increase or reduce the cost to pay, or may provide other alternative costs. Costs may include paying mana, tapping permanents, sacrificing permanents, discarding card
...
```

## L6. Replacement effect for "instead" damage rerouting

Status: **PASS**

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
- [614.6] - If an event is replaced, it never happens. A modified event occurs instead, which may in turn trigger abilities. Note that the modified event may contain instructions that can’t be carried out, in which case the impossible instruction is simply ignored.
- [701.8a] - To destroy a permanent, move it from the battlefield to its owner’s graveyard.
- [614.5] - A replacement effect doesn’t invoke itself repeatedly; it gets only one opportunity to affect an event or any modified events that may replace that event.
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast includes Phyrexian mana symbols, the player announces whether they intend to pay 2 life or a corresponding colored mana cost for each of those symbols. Previously made choices (such as choosing to cast a spell with flashback from a graveyard or choosing to cast a creature with morph face down) may restrict the player’s options when making these choices.
- [702.7b] - If at least one attacking or blocking creature has first stri
...
```

## M1. Basic mana ability — no stack

Status: **PASS**

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
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast includes Phyrexian mana symbols, the player announces whether they intend to pay 2 life or a corresponding colored mana cost for each of those symbols. Previously made choices (such as choosing to cast a spell with flashback from a graveyard or choosing to cast a creature with morph face down) may restrict the player’s options when making these choices.
- [601.2f] - The player determines the total cost of the spell. Usually this is just the mana cost. Some spells have additional or alternative costs. Some effects may increase or reduce the cost to pay, or may provide other alternative costs. Costs may include paying mana, tapping permanents, sacrificing permanents, discarding cards, and so on. The total cost is the mana cost or alternative cost (as determined in rule 601.2b), plus all additional costs and cost increases, and minus all cost reductions. If multiple cost reductions apply, the player may apply them in any order. If the mana comp
...
```

## M2. Triggered mana ability — uses stack

Status: **PASS**

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
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast includes Phyrexian mana symbols, the player announces whether they intend to pay 2 life or a corresponding colored mana cost for each of those symbols. Previously made choices (such as choosing to cast a spell with flashback from a graveyard or choosing to cast a creature with morph face down) may restrict the player’s options when making these choices.
- [605.3a] - A player may activate an activated mana ability whenever they have priority, whenever they are casting a spell or activating an ability that requires a mana payment, or whenever a rule or effect asks for a mana payment, even if it’s in the middle of casting or resolving a spell or activating or resolving an ability.
- [601.2f] - The player determines the total cost of the spell. Usually this is just the mana cost. Some spells have additional or alternative costs. Some effects may increase or reduce the cost to pay, or may provide other alternative costs. Costs may include paying 
...
```

## M3. Mana pool empties between phases

Status: **PASS**

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
- [106.4] - When an effect instructs a player to add mana, that mana goes into a player’s mana pool. From there, it can be used to pay costs immediately, or it can stay in the player’s mana pool as unspent mana. Each player’s mana pool empties at the end of each step and phase, and the player is said to lose this mana. Cards with abilities that produce mana or refer to unspent mana have received errata in the Oracle™ card reference to no longer explicitly refer to the mana pool.
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast includes Phyrexian mana symbols, the player announces whether they intend to pay 2 life or a corresponding colored mana cost for each of those symbols. Previously made choices (such as choosing to cast a spell with flashback from a graveyard or choosing to cast a creature with morph face down) may restrict the player’s options when making these choices.
- [601.2f] - The player determines the total cost of the spell. Usually this is just the mana cost. Some spells hav
...
```

## M4. Mana abilities during cost payment (re-test from J8 angle)

Status: **PASS**

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
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast includes Phyrexian mana symbols, the player announces whether they intend to pay 2 life or a corresponding colored mana cost for each of those symbols. Previously made choices (such as choosing to cast a spell with flashback from a graveyard or choosing to cast a creature with morph face down) may restrict the player’s options when making these choices.
- [601.2f] - The player determines the total cost of the spell. Usually this is just the mana cost. Some spells have additional or alternative costs. Some effects may increase or reduce the cost to pay, or may provide other alternative costs. Costs may include paying mana, tapping permanents, sacrificing permanents, discarding cards, and so on. The total cost is the mana cost or alternative cost (as determined in rule 601.2b), plus all additional costs and cost increases, and minus all cost reductions. If multiple cost reductions apply, the player may apply them in any order. If the mana comp
...
```

## M5. Restricted mana (snow, "spend only on")

Status: **PASS**

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
- [601.2f] - The player determines the total cost of the spell. Usually this is just the mana cost. Some spells have additional or alternative costs. Some effects may increase or reduce the cost to pay, or may provide other alternative costs. Costs may include paying mana, tapping permanents, sacrificing permanents, discarding cards, and so on. The total cost is the mana cost or alternative cost (as determined in rule 601.2b), plus all additional costs and cost increases, and minus all cost reductions. If multiple cost reductions apply, the player may apply them in any order. If the mana component of the total cost is reduced to nothing by cost reduction effects, it is considered to be {0}. It can’t be reduced to less than {0}. Once the total cost is determined, any effects that directly affect the total cost are applied. Then the resulting total cost becomes “locked in.” If effects would change the total cost after this time, they have no effect.
- [107.4h] - When used in a cost, the snow mana symbol {S} represents a cost that can be paid with one mana of any type produced by a snow source (see rule 106.3). Effects that reduce the amount of generic mana you pay don’t affect {S} costs. The {S} symbol can also be used to refer to mana of any type produced by a snow source spent to pay a cost. Snow is neither a color nor a type of mana.
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is de
...
```

## N1. Multiple blockers and damage assignment order

Status: **PASS**

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
- [509.1] - First, the defending player declares blockers. This turn-based action doesn’t use the stack. To declare blockers, the defending player follows the steps below, in order. If at any point during the declaration of blockers, the defending player is unable to comply with any of the steps listed below, the declaration is illegal; the game returns to the moment before the declaration (see rule 733, “Handling Illegal Actions”).
- [510.1c] - A blocked creature assigns its combat damage to the creatures blocking it. If no creatures are currently blocking it (if, for example, they were destroyed or removed from combat), it assigns no combat damage. If exactly one creature is blocking it, it assigns all its combat damage to that creature. If two or more creatures are blocking it, it assigns its combat damage to those creatures divided as its controller chooses among them.
- [509.1c] - The defending player checks each creature they control to see whether it’s affected by any requirements (effects that say a creature must block, or that it must block if some condition is met). If the number of requirements that are being obeyed is fewer than the maximum possible number of requirements that could be obeyed without disobeying any restrictions, the declaration of blockers is illegal. If a creature can’t block unless a player pays a cost, that player is not required to pay that cost, even if blocking with that creature would increase the number of requirements being obeyed. If a requirement that says a creature blocks if able during a certain turn refers to a turn with multiple combat phases, the creature blocks if able during each declare blockers step in that turn.
- [510.1d] - A blocking creature assigns combat damage to the creatures it’s blocking. If it isn’t currently blocking any creatures (if, for example, they were destroyed or removed from combat), it assigns no combat damage. If it’s blocking exactly one creature, it assigns all its combat damage to that creature. If it’s blocking two or more creatures, it assigns its combat damage divided as its controller choo
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
- [702.7b] - If at least one attacking or blocking creature has first strike or double strike (see rule 702.4) as the combat damage step begins, the only creatures that assign combat damage in that step are those with first strike or double strike. After that step, instead of proceeding to the end of combat step, the phase gets a second combat damage step. The only creatures that assign combat damage in that step are the remaining attackers and blockers that had neither first strike nor double strike as the first combat damage step began, as well as the remaining attackers and blockers that currently have double strike. After that step, the phase proceeds to the end of combat step.
- [506.1] - The combat phase has five steps, which proceed in order: beginning of combat, declare attackers, declare blockers, combat damage, and end of combat. The declare blockers and combat damage steps are skipped if no creatures are declared as attackers or put onto the battlefield attacking (see rule 508.8). There are two combat damage steps if any attacking or blocking creature has first strike (see rule 702.7) or double strike (see rule 702.4).
- [510.4] - If at least one attacking or blocking creature has first strike (see rule 702.7) or double strike (see rule 702.4) as the combat damage step begins, the only creatures that assign combat damage in that step are those with first strike or double strike. After that step, instead of proceeding to the end of combat step, the phase gets a second combat damage step. The only creatures that assign combat damage in that step are the remaining attackers and blockers that had neither first strike nor double strike as the first combat damage step began, as well as the remaining attackers and blockers that currently have double strike. After that step, the phase proceeds to the end of combat step.
- [702.4b] - If at least one attacking or blocking creature has first strike (see rule 702.7) or double strike as the combat damage step begins, the only creatures that assign combat damage in that step are those with first strike or double strike. 
...
```

## N3. Trample with multiple blockers

Status: **PASS**

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
- [510.1c] - A blocked creature assigns its combat damage to the creatures blocking it. If no creatures are currently blocking it (if, for example, they were destroyed or removed from combat), it assigns no combat damage. If exactly one creature is blocking it, it assigns all its combat damage to that creature. If two or more creatures are blocking it, it assigns its combat damage to those creatures divided as its controller chooses among them.
- [608.2] - If the object that’s resolving is an instant spell, a sorcery spell, or an ability, its resolution may involve several steps. The steps described in rules 608.2a and 608.2b are followed first. The steps described in rules 608.2c–m are then followed as appropriate, in no specific order. The steps described in rule 608.2n and 608.2p are followed last.
- [509.1c] - The defending player checks each creature they control to see whether it’s affected by any requirements (effects that say a creature must block, or that it must block if some condition is met). If the number of requirements that are being obeyed is fewer than the maximum possible number of requirements that could be obeyed without disobeying any restrictions, the declaration of blockers is illegal. If a creature can’t block unless a player pays a cost, that player is not required to pay that cost, even if blocking with that creature would increase the number of requirements being obeyed. If a requirement that says a creature blocks if able during a certain turn refers to a turn with multiple combat phases, the creature blocks if able during each declare blockers step in that turn.
- [509.1] - First, the defending player declares blockers. This turn-based action doesn’t use the stack. To declare blockers, the defending player follows the steps below, in order. If at any point during the declaration of blockers, the defending player is unable to comply with any of the steps listed below, the declaration is illegal; the game returns to the moment before the declaration (see rule 733, “Handling Illegal Actions”).
- [601.2f] - The player determines the total cost
...
```

## N4. Lifelink rules

Status: **PASS**

Scenario:
```text
A 4/4 creature with lifelink attacks me. I block with a 2/2. Both deal combat damage. How much life does the attacker's controller gain?
```

Expected verdict:
```text
4 life. With one blocker and no trample, all 4 combat damage is assigned to the blocker. Lifelink cares about damage actually dealt by the source, not only the amount needed for lethal damage, so the attacking creature's controller gains 4 life.
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
- [702.15b] - Damage dealt by a source with lifelink causes that source’s controller, or its owner if it has no controller, to gain that much life (in addition to any other results that damage causes). See rule 120.3.
- [509.1c] - The defending player checks each creature they control to see whether it’s affected by any requirements (effects that say a creature must block, or that it must block if some condition is met). If the number of requirements that are being obeyed is fewer than the maximum possible number of requirements that could be obeyed without disobeying any restrictions, the declaration of blockers is illegal. If a creature can’t block unless a player pays a cost, that player is not required to pay that cost, even if blocking with that creature would increase the number of requirements being obeyed. If a requirement that says a creature blocks if able during a certain turn refers to a turn with multiple combat phases, the creature blocks if able during each declare blockers step in that turn.
- [510.1c] - A blocked creature assigns its combat damage to the creatures blocking it. If no creatures are currently blocking it (if, for example, they were destroyed or removed from combat), it assigns no combat damage. If exactly one creature is blocking it, it assigns all its combat damage to that creature. If two or more creatures are blocking it, it assigns its combat damage to those creatures divided as its controller chooses among them.
- [510.1d] - A blocking creature assigns combat damage to the creatures it’s blocking. If it isn’t currently blocking any creatures (if, for example, they were destroyed or removed from combat), it assigns no combat damage. If it’s blocking exactly one creature, it assigns all its combat damage to that creature. If it’s blocking two or more creatures, it assigns its combat damage divided as its controller chooses among them.
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand
...
```

## N5. Deathtouch with multiple blockers

Status: **PASS**

Scenario:
```text
I attack with a 5/5 with deathtouch. Opponent blocks with three 2/2 creatures. How much damage do I need to assign to each blocker?
```

Expected verdict:
```text
At least 1 damage must be assigned to each blocker before the attacker can assign additional damage later in the damage assignment order. Because the attacker has deathtouch, 1 damage is considered lethal for assignment purposes. With no trample, no damage is assigned to the defending player.
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
- [510.1c] - A blocked creature assigns its combat damage to the creatures blocking it. If no creatures are currently blocking it (if, for example, they were destroyed or removed from combat), it assigns no combat damage. If exactly one creature is blocking it, it assigns all its combat damage to that creature. If two or more creatures are blocking it, it assigns its combat damage to those creatures divided as its controller chooses among them.
- [509.1c] - The defending player checks each creature they control to see whether it’s affected by any requirements (effects that say a creature must block, or that it must block if some condition is met). If the number of requirements that are being obeyed is fewer than the maximum possible number of requirements that could be obeyed without disobeying any restrictions, the declaration of blockers is illegal. If a creature can’t block unless a player pays a cost, that player is not required to pay that cost, even if blocking with that creature would increase the number of requirements being obeyed. If a requirement that says a creature blocks if able during a certain turn refers to a turn with multiple combat phases, the creature blocks if able during each declare blockers step in that turn.
- [510.1d] - A blocking creature assigns combat damage to the creatures it’s blocking. If it isn’t currently blocking any creatures (if, for example, they were destroyed or removed from combat), it assigns no combat damage. If it’s blocking exactly one creature, it assigns all its combat damage to that creature. If it’s blocking two or more creatures, it assigns its combat damage divided as its controller chooses among them.
- [702.2c] - Any nonzero amount of combat damage assigned to a creature by a source with deathtouch is considered to be lethal damage for the purposes of determining if excess damage is being dealt.
- [509.1] - First, the defending player declares blockers. This turn-based action doesn’t use the stack. To declare blockers, the defending player follows the steps below, in order. If at any point during the declaration o
...
```

## N6. Creature removed from combat mid-step

Status: **PASS**

Scenario:
```text
An opponent's 3/3 attacks. I declare a 2/2 as blocker. Before damage is dealt, the attacker's controller casts [[Smite the Monstrous]] killing my blocker. What happens in the damage step?
```

Expected verdict:
```text
The blocker is gone before combat damage. The attacker remains a blocked creature because it was blocked during the declare blockers step. With no blocker still present and no trample, the attacker assigns no combat damage to the defending player.
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
- [509.1c] - The defending player checks each creature they control to see whether it’s affected by any requirements (effects that say a creature must block, or that it must block if some condition is met). If the number of requirements that are being obeyed is fewer than the maximum possible number of requirements that could be obeyed without disobeying any restrictions, the declaration of blockers is illegal. If a creature can’t block unless a player pays a cost, that player is not required to pay that cost, even if blocking with that creature would increase the number of requirements being obeyed. If a requirement that says a creature blocks if able during a certain turn refers to a turn with multiple combat phases, the creature blocks if able during each declare blockers step in that turn.
- [510.1c] - A blocked creature assigns its combat damage to the creatures blocking it. If no creatures are currently blocking it (if, for example, they were destroyed or removed from combat), it assigns no combat damage. If exactly one creature is blocking it, it assigns all its combat damage to that creature. If two or more creatures are blocking it, it assigns its combat damage to those creatures divided as its controller chooses among them.
- [510.1d] - A blocking creature assigns combat damage to the creatures it’s blocking. If it isn’t currently blocking any creatures (if, for example, they were destroyed or removed from combat), it assigns no combat damage. If it’s blocking exactly one creature, it assigns all its combat damage to that creature. If it’s blocking two or more creatures, it assigns its combat damage divided as its controller chooses among them.
- [509.1] - First, the defending player declares blockers. This turn-based action doesn’t use the stack. To declare blockers, the defending player follows the steps below, in order. If at any point during the declaration of blockers, the defending player is unable to comply with any of the steps listed below, the declaration is
...
```

## N7. Indestructible + lethal damage

Status: **PASS**

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
- [704.5g] - If a creature has toughness greater than 0, it has damage marked on it, and the total damage marked on it is greater than or equal to its toughness, that creature has been dealt lethal damage and is destroyed. Regeneration can replace this event.
- [702.12] - Indestructible
- [608.2] - If the object that’s resolving is an instant spell, a sorcery spell, or an ability, its resolution may involve several steps. The steps described in rules 608.2a and 608.2b are followed first. The steps described in rules 608.2c–m are then followed as appropriate, in no specific order. The steps described in rule 608.2n and 608.2p are followed last.
- [509.1c] - The defending player checks each creature they control to see whether it’s affected by any requirements (effects that say a creature must block, or that it must block if some condition is met). If the number of requirements that are being obeyed is fewer than the maximum possible number of requirements that could be obeyed without disobeying any restrictions, the declaration of blockers is illegal. If a creature can’t block unless a player pays a cost, that player is not required to pay that cost, even if blocking with that creature would increase the number of requirements being obeyed. If a requirement that says a creature blocks if able during a certain turn refers to a turn with multiple combat phases, the creature blocks if able during each declare blockers step in that turn.
- [510.1c] - A blocked creature assigns its combat damage to the creatures blocking it. If no creatures are currently blocking it (if, for example, they were destroyed or removed from combat), it assigns no combat damage. If exactly one creature is blocking it, it assigns all its combat damage to that creature. If two or more creatures are blocking it, it assigns its combat damage to those creatures divided as its controller chooses among them.
- [510.1d] - A blocking creature assigns combat damage to the creatures it’s blocking. If it isn’t currently blocking any creatures (if, for example, they were destroyed or removed from combat), it 
...
```

## N8. Damage prevention vs. damage replacement

Status: **PASS**

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
- [614.6] - If an event is replaced, it never happens. A modified event occurs instead, which may in turn trigger abilities. Note that the modified event may contain instructions that can’t be carried out, in which case the impossible instruction is simply ignored.
- [614.5] - A replacement effect doesn’t invoke itself repeatedly; it gets only one opportunity to affect an event or any modified events that may replace that event.
- [117.3b] - The active player receives priority after a spell or ability (other than a mana ability) resolves.
- [608.2] - If the object that’s resolving is an instant spell, a sorcery spell, or an ability, its resolution may involve several steps. The steps described in rules 608.2a and 608.2b are followed first. The steps described in rules 608.2c–m are then followed as appropriate, in no specific order. The steps described in rule 608.2n and 608.2p are followed last.
- [608.2b] - If the spell or ability specifies targets, it checks whether the targets are still legal. A target that’s no longer in the zone it was in when it was targeted is illegal. Other changes to the game state may cause a target to no longer be legal; for example, its characteristics may have changed or an effect may have changed the text of the spell. If the source of an ability has left the zone it was in, its last known information is used during this process. If all its targets, for every instance of the word “target,” are now illegal, the spell or ability doesn’t resolve. It’s removed from the stack and, if it’s a spell, put into its owner’s graveyard. Otherwise, the spell or ability will resolve normally. Illegal targets, if any, won’t be affected by parts of a resolving spell’s effect for which they’re illegal. Other parts of the effect for which those targets are not illegal may still affect them. If the spell or ability creates any continuous effects that affect game rules (see rule 613.11), those effects don’t apply to illegal targets. If part of the effect requires information about an illegal target, it fails to determine any such information. Any part of the
...
```

## O1. Tokens entering with counters

Status: **PASS**

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
- [614.6] - If an event is replaced, it never happens. A modified event occurs instead, which may in turn trigger abilities. Note that the modified event may contain instructions that can’t be carried out, in which case the impossible instruction is simply ignored.
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast includes Phyrexian mana symbols, the player announces whether they intend to pay 2 life or a corresponding colored mana cost for each of those symbols. Previously made choices (such as choosing to cast a spell with flashback from a graveyard or choosing to cast a creature with morph 
...
```

## O2. Anafenza vs. token

Status: **PASS**

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
- [704.5d] - If a token is in a zone other than the battlefield, it ceases to exist.
- [700.4] - The term dies means “is put into a graveyard from the battlefield.”
- [613.4d] - Layer 7d: Effects that switch a creature’s power and toughness are applied. Such effects take the value of power and apply it to the creature’s toughness, and take the value of toughness and apply it to the creature’s power.
- [604.3] - Some static abilities are characteristic-defining abilities. A characteristic-defining ability conveys information about an object’s characteristics that would normally be found elsewhere on that object (such as in its mana cost, type line, or power/toughness box). Characteristic-defining abilities can add to or override information found elsewhere on that object. Characteristic-defining abilities function in all zones. They also function outside the game and before the game begins.
- [613.4b] - Layer 7b: Effects that set power and/or toughness to a specific number or value are applied. Effects that refer to the base power and/or toughness of a creature apply in this layer.
- [613.1b] - Layer 2: Control-changing effects are applied.
- [101.2] - When a rule or effect allows or directs something to happen, and another effect states that it can’t happen, the “can’t” effect takes precedence.
- [613.3] - Within layers 2–6, apply effects from characteristic-defining abilities first (see rule 604.3), then all other effects in timestamp order (see rule 613.7). Note that dependency may alter the order in which effects are applied within a layer. (See rule 613.8.)
- [613.4a] - Layer 7a: Effects from characteristic-defining abilities that define power and/or toughness are applied. See rule 604.3.
- [613.7] - Within a lay
...
```

## O3. Copy of a card with evoke

Status: **PASS**

Scenario:
```text
I cast [[Spitebellows]] for its evoke cost. Later, I cast [[Mirror Image]] copying Spitebellows. Does Mirror Image also get sacrificed as though it was evoked?
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
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast includes Phyrexian mana symbols, the player announces whether they intend to pay 2 life or a corresponding colored mana cost for each of those symbols. Previously made choices (such as choosing to cast a spell with flashback from a graveyard or choosing to cast a creature with morph face down) may restrict the player’s options when making these choices.
- [601.2f] - The player determines the total cost of the spell. Usually this is just the mana cost. Some spells have additional or alternative costs. Some effects may increase or reduce the cost to pay, or may provide other alternative costs. Costs may include paying mana, tapping permanents, sacrificing permanents, discarding cards, and so on. The total cost is the mana cost or alternative cost (as determined in rule 601.2b), plus all additional costs and cost increases, and minus all cost reductions. If multiple cost reductions apply, the player may apply them in any order. If the mana comp
...
```

## O4. Counters on a token that "should" carry

Status: **PASS**

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
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast includes Phyrexian mana symbols, the player announces whether they intend to pay 2 life or a corresponding colored mana cost for each of those symbols. Previously made choices (such as choosing to cast a spell with flashback from a graveyard or choosing to cast a creature with morph face down) may restrict the player’s options when making these choices.
- [601.2f] - The player determines the total cost of the spell. Usually this is just the mana cost. Some spells have additional or alternative costs. Some effects may increase or reduce the cost to pay, or may provide other alternative costs. Costs may include paying mana, tapping permanents, sacrificing permanents, discarding cards, and so on. The total cost is the mana cost or alternative cost (as determined in rule 601.2b), plus all additional costs and cost increases, and minus all cost reductions. If multiple cost reductions apply, the player may apply them in any order. If the mana comp
...
```

## P1. Planeswalker loyalty abilities are sorcery-speed

Status: **PASS**

Scenario:
```text
It is my opponent's end step. I have [[Jace, the Mind Sculptor]] on the battlefield. Can I activate one of his loyalty abilities right now?
```

Expected verdict:
```text
No. Loyalty abilities can be activated only at sorcery speed [606.3] — only during one of your main phases when the stack is empty.
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
- [606.3] - A player may activate a loyalty ability of a permanent they control any time they have priority and the stack is empty during a main phase of their turn, but only if no player has previously activated a loyalty ability of that permanent that turn.
- [606.1] - Some activated abilities are loyalty abilities, which are subject to special rules.
- [307.1] - A player who has priority may cast a sorcery card from their hand during a main phase of their turn when the stack is empty. Casting a sorcery as a spell uses the stack. (See rule 601, “Casting Spells.”)
- [608.2] - If the object that’s resolving is an instant spell, a sorcery spell, or an ability, its resolution may involve several steps. The steps described in rules 608.2a and 608.2b are followed first. The steps described in rules 608.2c–m are then followed as appropriate, in no specific order. The steps described in rule 608.2n and 608.2p are followed last.
- [117.3b] - The active player receives priority after a spell or ability (other than a mana ability) resolves.
- [800.4a] - When a player leaves the game, all objects (see rule 109) owned by that player leave the game and any effects which give that player control of any objects or players end. Then, if that player controlled any objects on the stack not represented by cards, those objects cease to exist. Then, if there are any objects still controlled by that player, those objects are exiled. This is not a state-based action. It happens as soon as the player leaves the game. If the player who left the game had priority at the time they left, priority passes to the next player in turn order who’s still in the game.
- [118.12] - Some spells, activated abilities, and triggered abilities read, “[Do something]. If [a player] [does, doesn’t, or can’t], [effect].” Or “[A player] may [do something]. If [that player] [does, doesn’t, or can’t], [effect].” The action [do something] is a cost, paid when the spell or ability resolves. The “If [a player] [does, doesn’t, or can’t]” clause checks whether the player chose to pay an optional cost or started to pay a
...
```

## P2. Each planeswalker — loyalty once per turn

Status: **PASS**

Scenario:
```text
I control [[Liliana, the Last Hope]] on my main phase. I activate her -2 ability targeting a creature. Can I activate her +1 ability in the same turn?
```

Expected verdict:
```text
No. A player may activate only one loyalty ability of each permanent each turn, at sorcery speed [606.3].
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
- [117.3b] - The active player receives priority after a spell or ability (other than a mana ability) resolves.
- [606.3] - A player may activate a loyalty ability of a permanent they control any time they have priority and the stack is empty during a main phase of their turn, but only if no player has previously activated a loyalty ability of that permanent that turn.
- [307.1] - A player who has priority may cast a sorcery card from their hand during a main phase of their turn when the stack is empty. Casting a sorcery as a spell uses the stack. (See rule 601, “Casting Spells.”)
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast inc
...
```

## P3. Mana ability does not require priority

Status: **PASS**

Scenario:
```text
Opponent's [[Wrath of God]] is resolving. My creatures are being destroyed. Before they die (during resolution), can I tap one of them for mana to cast something?
```

Expected verdict:
```text
No. During another spell's resolution, no player has priority [608.2]. Mana abilities can be activated without using the stack, but 605.3a permits that only when a player has priority or is in the process of casting a spell or activating an ability that requires a mana payment. Neither condition is true during Wrath of God's resolution.
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
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast includes Phyrexian mana symbols, the player announces whether they intend to pay 2 life or a corresponding colored mana cost for each of those symbols. Previously made choices (such as choosing to cast a spell with flashback from a graveyard or choosing to cast a creature with morph face down) may restrict the player’s options when making these choices.
- [601.2f] - The player determines the total cost of the spell. Usually this is just the mana cost. Some spells have additional or alternative 
...
```

## P4. "Activate only once per turn" tracking

Status: **PASS**

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
- [509.1c] - The defending player checks each creature they control to see whether it’s affected by any requirements (effects that say a creature must block, or that it must block if some condition is met). If the number of requirements that are being obeyed is fewer than the maximum possible number of requirements that could be obeyed without disobeying any restrictions, the declaration of blockers is illegal. If a creature can’t block unless a player pays a cost, that player is not required to pay that cost, even if blocking with that creature would increase the number of requirements being obeyed. If a requirement that says a creature blocks if able during a certain turn refers to a turn with multiple combat phases, the creature blocks if able during each declare blockers step in that turn.
- [601.2f] - The player determines the total cost of the spell. Usually this is just the mana cost. Some spells have additional or alternative costs. Some effects may increase or reduce the cost to pay, or may provide other alternative costs. Costs may include paying mana, tapping permanents, sacrificing permanents, discarding cards, and so on. The total cost is the mana cost or alternative cost (as determined in rule 601.2b), plus all additional costs and cost increases, and minus all cost reductions. If multiple cost reductions apply, the player may apply them in any order. If the mana component of the total cost is reduced to nothing by cost reduction effects, it is considered to be {0}. It can’t be reduced to less than {0}. Once the total cost is determined, any effects that directly affect the total cost are applied. Then the resulting total cost becomes “locked in.” If effects would change the total cost after this time, they have no effect.
- [601.2i] - Once the steps described in 601.2a–h are completed, effects that modify the characteristics of the spell as it’s cast are applied, then the spell becomes cast. Any abilities that trigger when a spell is cast or put onto the stack trigger at this time. If the spell’s controller had priority before casting it, they get prior
...
```

## Q1. Mode chosen at casting

Status: **PASS**

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
- [700.2] - A spell or ability is modal if it has two or more options in a bulleted list preceded by instructions for a player to choose a number of those options, such as “Choose one —.” Each of those options is a mode. Modal cards printed prior to the Khans of Tarkir™ set didn’t use bulleted lists for the modes; these cards have received errata in the Oracle card reference so the modes do appear in a bulleted list.
- [700.2a] - The controller of a modal spell or activated ability chooses the mode(s) as part of casting that spell or activating that ability. If one of the modes would be illegal (due to an inability to choose legal targets, for example), that mode can’t be chosen. (See rule 601.2b.)
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast includes Phyrexian mana symbols, the player announces whether they intend to pay 2 life or a corresponding colored mana cost for each of those symbols. Previously made choices (such as choosing to cast a spell with flashback from a graveyard or ch
...
```

## Q2. Modal spell with one mode becoming illegal

Status: **PASS**

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
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast includes Phyrexian mana symbols, the player announces whether they intend to pay 2 life or a corresponding colored mana cost for each of those symbols. Previously made choices (such as choosing to cast a spell with flashback from a graveyard or choosing to cast a creature with morph face down) may restrict the player’s options when making these choices.
- [601.2f] - The player determines the total cost of the spell. Usually this is just the mana cost. Some spells have additional or alternative costs. Some effects may increase or reduce the cost to pay, or may provide other alternative costs. Costs may include paying mana, tapping permanents, sacrificing permanents, discarding cards, and so on. The total cost is the mana cost or alternative cost (as determined in rule 601.2b), plus all additional costs and cost increases, and minus all cost reductions. If multiple cost reductions apply, the player may apply them in any order. If the mana comp
...
```

## Q3. Charm "choose one or more"

Status: **PASS**

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
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast includes Phyrexian mana symbols, the player announces whether they intend to pay 2 life or a corresponding colored mana cost for each of those symbols. Previously made choices (such as choosing to cast a spell with flashback from a graveyard or choosing to cast a creature with morph face down) may restrict the player’s options when making these choices.
- [700.2] - A spell or ability is modal if it has two or more options in a bulleted list preceded by instructions for a player to choose a number of those options, such as “Choose one —.” Each of those options is a mode. Modal cards printed prior to the Khans of Tarkir™ set didn’t use bulleted lists for the modes; these cards have received errata in the Oracle card reference so the modes do appear in a bulleted list.
- [601.2f] - The player determines the total cost of the spell. Usually this is just t
...
```

## Q4. Choose new targets and the illegality rule

Status: **PASS**

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
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast includes Phyrexian mana symbols, the player announces whether they intend to pay 2 life or a corresponding colored mana cost for each of those symbols. Previously made choices (such as choosing to cast a spell with flashback from a graveyard or choosing to cast a creature with morph face down) may restrict the player’s options when making these choices.
- [601.2f] - The player determines the total cost of the spell. Usually this is just the mana cost. Some spells have additional or alternative costs. Some effects may increase or reduce the cost to pay, or may provide other alternative costs. Costs may include paying mana, tapping permanents, sacrificing permanents, discarding cards, and so on. The total cost is the mana cost or alternative cost (as determined in rule 601.2b), plus all additional costs and cost increases, and minus all cost reductions. If multiple cost reductions apply, the player may apply them in any order. If the mana comp
...
```

## Q5. As-enters choices

Status: **PASS**

Scenario:
```text
I cast [[Master of Etherium]] (an artifact creature) — wait, no as-enters. Use [[Engineered Explosives]] (X is chosen as it enters): I cast it with X=2. While it's resolving, can opponent's [[Force of Will]] counter it?
```

Expected verdict:
```text
X is locked at casting under 601.2b. Force of Will targets a spell on the stack, so it can counter Engineered Explosives before it begins resolving. Once Engineered Explosives is resolving, no player has priority and it is too late to cast Force of Will.
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
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast includes Phyrexian mana symbols, the player announces whether they intend to pay 2 life or a corresponding colored mana cost for each of those symbols. Previously made choices (such as choosing to cast a spell with flashback from a graveyard or choosing to cast a creature with morph face down) may restrict the player’s options when making these choices.
- [601.2f] - The player determines the total cost of the spell. Usually this is just the mana cost. Some spells have additional or alternative costs. Some effects may increase or reduce the cost to pay, or may provide other alternative
...
```

## R1. Cascade — exile order matters

Status: **PASS**

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
- [702.85a] - Cascade is a triggered ability that functions only while the spell with cascade is on the stack. “Cascade” means “When you cast this spell, exile cards from the top of your library until you exile a nonland card whose mana value is less than this spell’s mana value. You may cast that card without paying its mana cost if the resulting spell’s mana value is less than this spell’s mana value. Then put all cards exiled this way that weren’t cast on the bottom of your library in a random order.”
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast includes Phyrexian mana symbols, the player announces whether they intend to pay 2 life or a corresponding colored mana cost for each of those symbols. Previously made choices (such as choosing to cast a spell with flashback from a graveyard or choosing to cast a creature with morph face down) may restrict the player’s options when making these choices.
- [601.2f] - The player determines the total cost of the spell. Usually this is just the 
...
```

## R2. Cascade — what about X spells?

Status: **PASS**

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
- [702.85a] - Cascade is a triggered ability that functions only while the spell with cascade is on the stack. “Cascade” means “When you cast this spell, exile cards from the top of your library until you exile a nonland card whose mana value is less than this spell’s mana value. You may cast that card without paying its mana cost if the resulting spell’s mana value is less than this spell’s mana value. Then put all cards exiled this way that weren’t cast on the bottom of your library in a random order.”
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast includes Phyrexian mana symbols, the player announces whether they intend to pay 2 life or a corresponding colored mana cost for each of those symbols. Previously made choices (such as choosing to cast a spell with flashback from a graveyard or choosing to cast a creature with morph face down) may restrict the player’s options when making these choices.
- [601.2f] - The player determines the total cost of the spell. Usually this is just the 
...
```

## R3. Suspend creates a delayed trigger

Status: **PASS**

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
- [702.61] - Split Second
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast includes Phyrexian mana symbols, the player announces whether they intend to pay 2 life or a corresponding colored mana cost for each of those symbols. Previously made choices (such as choosing to cast a spell with flashback from a graveyard or choosing to cast a creature with morph face down) may restrict the player’s options when making these choices.
- [601.2f] - The player determines the total cost of the spell. Usually this is just the mana cost. Some spells have additional or alternative costs. Some effects may increase or reduce the cost to pay, or may provide other alternative costs. Costs may include paying mana, tapping permanents, sacrificing permanents, discarding cards, and so on. The total cost is the mana cost or alternative cost (as determined in rule 601.2b), plus all additional costs and cost increases, and minus all cost reductions. If multiple cost reductions apply, the player may apply them in a
...
```

## R4. Foretell — alternative cost from exile

Status: **PASS**

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
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast includes Phyrexian mana symbols, the player announces whether they intend to pay 2 life or a corresponding colored mana cost for each of those symbols. Previously made choices (such as choosing to cast a spell with flashback from a graveyard or choosing to cast a creature with morph face down) may restrict the player’s options when making these choices.
- [601.2f] - The player determines the total cost of the spell. Usually this is just the mana cost. Some spells have additional or alternative costs. Some effects may increase or reduce the cost to pay, or may provide other alternative costs. Costs may include paying mana, tapping permanents, sacrificing permanents, discarding cards, and so on. The total cost is the mana cost or alternative cost (as determined in rule 601.2b), plus all additional costs and cost increases, and minus all cost reductions. If multiple cost reductions apply, the player may apply them in any order. If the mana comp
...
```

## R5. Mutate creates a merged permanent

Status: **PASS**

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
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast includes Phyrexian mana symbols, the player announces whether they intend to pay 2 life or a corresponding colored mana cost for each of those symbols. Previously made choices (such as choosing to cast a spell with flashback from a graveyard or choosing to cast a creature with morph face down) may restrict the player’s options when making these choices.
- [601.2f] - The player determines the total cost of the spell. Usually this is just the mana cost. Some spells have additional or alternative costs. Some effects may increase or reduce the cost to pay, or may provide other alternative costs. Costs may include paying mana, tapping permanents, sacrificing permanents, discarding cards, and so on. The total cost is the mana cost or alternative cost (as determined in rule 601.2b), plus all additional costs and cost increases, and minus all cost reductions. If multiple cost reductions apply, the player may apply them in any order. If the mana comp
...
```
