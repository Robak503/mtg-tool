# Arbiter Knowledge Validation Report

Generated: 2026-05-25T04:32:43.072Z
Endpoint: `http://localhost:3000/api/arbiter`
Prompt: `ARBITER_PROMPT`
Suite: `rulesguru`
Card context: `Scryfall Oracle + WOTC rulings`
Mutation mode: `on`
Result: **25/25 passed**

| Test | Source | Title | Result | Missing citations | Failures |
|---|---|---|---|---|---|
| RG2 | META_test_cases_rulesguru.md | Noel controls a Kruphix, God of Horizons and has 3 red mana and 2 colorless mana in... | PASS | - | - |
| RG3 | META_test_cases_rulesguru.md | Alessandra attacks with 4 Cultivator of Blades. What is the greatest amount of dama... | PASS | - | - |
| RG4 | META_test_cases_rulesguru.md | Abram attacks with Wild Beastmaster and Ruination Wurm. Nola casts Constricting Ten... | PASS | - | - |
| RG5 | META_test_cases_rulesguru.md | Adrian controls Dream Halls. Can they cast Dragonlord's Prerogative by discarding P... | PASS | - | - |
| RG6 | META_test_cases_rulesguru.md | Ari controls a Falkenrath Gorger and has 8 cards in their hand. During their cleanu... | PASS | - | - |
| RG7 | META_test_cases_rulesguru.md | Nicole controls Aubrey's Whiptail Wurm enchanted with their Treachery. Aubrey casts... | PASS | - | - |
| RG8 | META_test_cases_rulesguru.md | Allison controls a 2/2 green Bear Creature token. They cast Acrobatic Maneuver, tar... | PASS | - | - |
| RG10 | META_test_cases_rulesguru.md | Alvin attacks with a Rakdos Ragemutt. Nico blocks with an Elvish Ranger. How much l... | PASS | - | - |
| RG12 | META_test_cases_rulesguru.md | Arian controls a Chittering Host enchanted by Flickerform. They activate the abilit... | PASS | - | - |
| RG13 | META_test_cases_rulesguru.md | Armando casts Phyrexian Ingester, exiling Naomi's Optimus Prime, Autobot Leader tha... | PASS | - | - |
| RG15 | META_test_cases_rulesguru.md | Aspen casts Bishop of Binding, exiling Noor's Creeping Tar Pit that is currently a... | PASS | - | - |
| RG17 | META_test_cases_rulesguru.md | Alden has to choose a card name for Council of the Absolute. Can they choose Homura... | PASS | - | - |
| RG19 | META_test_cases_rulesguru.md | Arianna controls Possibility Storm and casts a Whetwheel for its morph cost. Ariann... | PASS | - | - |
| RG20 | META_test_cases_rulesguru.md | Autumn casts a kicked Rite of Replication targeting their Hamletback Goliath. After... | PASS | - | - |
| RG21 | META_test_cases_rulesguru.md | Nathanael controls a Leonin Arbiter. Alex activates their Shred Memory, and then bo... | PASS | - | - |
| RG22 | META_test_cases_rulesguru.md | Ashton controls an animated Mishra's Factory with a -1/-1 counter on it. On their n... | PASS | - | - |
| RG24 | META_test_cases_rulesguru.md | Ari activates Phyrexian Portal's ability. Can they look at the cards in the exiled... | PASS | - | - |
| RG25 | META_test_cases_rulesguru.md | Avery activates Phyrexian Portal's ability. Nyla chooses to put all 10 cards into o... | PASS | - | - |
| RG26 | META_test_cases_rulesguru.md | Addilyn controls Eidolon of Rhetoric. They want to cast Lady Zhurong, Warrior Queen... | PASS | - | - |
| RG28 | META_test_cases_rulesguru.md | Andrew casts Commune with Lava, which exiles Kishla Village. Can they play it? | PASS | - | - |
| RG29 | META_test_cases_rulesguru.md | Alexzander controls a Rites of Flourishing and has played 2 lands this turn. They c... | PASS | - | - |
| RG30 | META_test_cases_rulesguru.md | Anastasia controls Oracle of Mul Daya and has played 2 lands this turn. They casts... | PASS | - | - |
| RG31 | META_test_cases_rulesguru.md | Adriel controls Karador, Ghost Chieftain and has cast a spell with it this turn. Th... | PASS | - | - |
| RG32 | META_test_cases_rulesguru.md | Autumn controls a Hero of Bladehold, a Nobilis of War, and an Akroan Hoplite. They... | PASS | - | - |
| RG33 | META_test_cases_rulesguru.md | Augustine controls a Valakut, the Molten Pinnacle and 5 Mountains. They plays a 6th... | PASS | - | - |

## RG2. Noel controls a Kruphix, God of Horizons and has 3 red mana and 2 colorless mana in...

Status: **PASS**

Scenario sent (mutated):
```text
Paraphrased validation prompt. Answer from the local rules and card text, not from an exact imported question.
Relevant cards: [[Kruphix, God of Horizons]], [[Drain Power]].
Situation: Noel has on the battlefield a Kruphix, God of Horizons and has 3 red mana and 2 colorless mana in their mana pool. Autumn plays a Drain Power, choosing Noel. once that spell finishes resolving, what mana does each player have in their mana pool?
```

Expected verdict:
```text
Drain Power causes all mana to empty from Noel's mana pool and that much mana to be added to Autumn's mana pool. (106.13) Kruphix, God of Horizons causes the mana to turn into colorless mana instead of emptying, so no mana is added to Autumn's mana pool. The final result is that Autumn has no mana and Noel has 5 colorless mana.
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
- [106.13] - One card (Drain Power) causes one player to lose unspent mana and another to add “the mana lost this way.” (Note that these may be the same player.) This empties the former player’s mana pool and causes the mana emptied this way to be put into the latter player’s mana pool. Which permanents, spells, and/or abilities produced that mana are unchanged, as are any restrictions or additional effects associated with any of that mana.
- [604.3] - Some static abilities are characteristic-defining abilities. A characteristic-defining ability conveys information about an object’s characteristics that would normally be found elsewhere on that object (such as in its mana cost, type line, or power/toughness box). Characteristic-defining abilities can add to or override information found elsewhere on that object. Characteristic-defining abilities function in all zones. They also function outside the game and before the game begins.
- [613.4d] - Layer 7d: Effects that switch a creature’s power and toughness are applied. Such effects take the value of power and apply it to the creature’s toughness, and take the value of toughness and apply it to the creature’s power.
- [613.1d] - Layer 4: Type-changing effects are applied. These include effects that change an object’s card type, subtype, and/or supertype.
- [613.4b] - Layer 7b: Effects that set power and/or toughness to a specific number or value are applied. Effects that refer to the base power and/or toughness of a creature apply in this layer.
- [613.4c] - Layer 7c: Effects and counters that modify power and/or toughness (but don’t set power and/or toughness to a specific number or value) are applied.
- [613.4a] - Layer 7a: Effects from characteristic-defining abilities that define power and/or toughness are applied. See rule 604.3.
- [613.1f] - Layer 6: Ability-adding effects, keyword counters, ability-removing effects, and effects that say an object can’t have an ability are applied.
- [613.3] - Within layers 2–6, apply effects from characteristic-defining abilities first (see rule 604.3), then all other effects in 
...
```

## RG3. Alessandra attacks with 4 Cultivator of Blades. What is the greatest amount of dama...

Status: **PASS**

Scenario sent (mutated):
```text
Paraphrased validation prompt. Answer from the local rules and card text, not from an exact imported question.
Relevant cards: [[Cultivator of Blades]].
Situation: Alessandra attacks with 4 Cultivator of Blades. What is the greatest amount of damage that can be dealt to Nico in total?
```

Expected verdict:
```text
49. Let's look at the 4 Cultivator of Blades's powers in the order their triggers resolve:
1 1 1 1
The first trigger resolves and adds 1 to the power of each other Cultivator of Blades:
1 2 2 2
The second trigger resolves and adds 2 to the power of each other Cultivator of Blades:
3 2 4 4
The third trigger, adding 4:
7 6 4 8
And the fourth trigger, adding 8:
15 14 12 8
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
- [608.2] - If the object that’s resolving is an instant spell, a sorcery spell, or an ability, its resolution may involve several steps. The steps described in rules 608.2a and 608.2b are followed first. The steps described in rules 608.2c–m are then followed as appropriate, in no specific order. The steps described in rule 608.2n and 608.2p are followed last.
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast includes Phyrexian mana symbols, the player announces whether they intend to pay 2 life or a corresponding colored mana cost for each of those symbols. Previously made choices (such as choosing to cast a spell with flashback from a graveyard or choosing to cast a creature with morph face down) may restrict the player’s options when making these choices.
- [601.2f] - The player determines the total cost of the spell. Usually this is just the mana cost. Some spells have additi
...
```

## RG4. Abram attacks with Wild Beastmaster and Ruination Wurm. Nola casts Constricting Ten...

Status: **PASS**

Scenario sent (mutated):
```text
Paraphrased validation prompt. Answer from the local rules and card text, not from an exact imported question.
Relevant cards: [[Wild Beastmaster]], [[Ruination Wurm]], [[Constricting Tendrils]].
Situation: Abram attacks with Wild Beastmaster and Ruination Wurm. Nola plays Constricting Tendrils, choosing the Wild Beastmaster. what is the result for the Ruination Wurm when the Wild Beastmaster trigger resolves?
```

Expected verdict:
```text
Wild Beastmaster has a negative power when the trigger resolves, but the game treats it as 0 for the purpose of modifying the power and toughness of Ruination Wurm. (107.1b) Ruination Wurm gets +0/+0, and nothing happens to it.
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
- [107.1b] - Most of the time, the Magic game uses only positive numbers and zero. You can’t choose a negative number, deal negative damage, gain negative life, and so on. However, it’s possible for a game value, such as a creature’s power, to be less than zero. If a calculation or comparison needs to use a negative value, it does so. If a calculation that would determine the result of an effect yields a negative number, zero is used instead, unless that effect doubles, triples, or sets to a specific value a player’s life total or the power and/or toughness of a creature or creature card.
- [608.2] - If the object that’s resolving is an instant spell, a sorcery spell, or an ability, its resolution may involve several steps. The steps described in rules 608.2a and 608.2b are followed first. The steps described in rules 608.2c–m are then followed as appropriate, in no specific order. The steps described in rule 608.2n and 608.2p are followed last.
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being 
...
```

## RG5. Adrian controls Dream Halls. Can they cast Dragonlord's Prerogative by discarding P...

Status: **PASS**

Scenario sent (mutated):
```text
Paraphrased validation prompt. Answer from the local rules and card text, not from an exact imported question.
Relevant cards: [[Dream Halls]], [[Dragonlord's Prerogative]], [[Phantasmal Dragon]].
Situation: Adrian has on the battlefield Dream Halls. is it legal for that player to play Dragonlord's Prerogative by discarding Phantasmal Dragon, and also reveal it to make the Dragonlord's Prerogative uncounterable?
```

Expected verdict:
```text
Yes. Revealing and discarding the Phantasmal Dragon are both costs to cast the Dragonlord's Prerogative. (118.8, 118.9) Costs can be paid in any order. (601.2h)
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
- [601.2h] - The player pays the total cost. First, they pay all costs that don’t involve random elements or moving objects from the library to a public zone, in any order. Then they pay all remaining costs in any order. Partial payments are not allowed. Unpayable costs can’t be paid.
- [118.8] - Some spells and abilities have additional costs. An additional cost is a cost listed in a spell’s rules text, or applied to a spell or ability from another effect, that its controller must pay at the same time they pay the spell’s mana cost or the ability’s activation cost. Note that some additional costs are listed in keywords; see rule 702.
- [118.9] - Some spells have alternative costs. An alternative cost is a cost listed in a spell’s text, or applied to it from another effect, that its controller may pay rather than paying the spell’s mana cost. Alternative costs are usually phrased, “You may [action] rather than pay [this object’s] mana cost,” or “You may cast [this object] without paying its mana cost.” Note that some alternative costs are listed in keywords; see rule 702.
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana s
...
```

## RG6. Ari controls a Falkenrath Gorger and has 8 cards in their hand. During their cleanu...

Status: **PASS**

Scenario sent (mutated):
```text
Paraphrased validation prompt. Answer from the local rules and card text, not from an exact imported question.
Relevant cards: [[Falkenrath Gorger]], [[Soul Collector]].
Situation: Ari has on the battlefield a Falkenrath Gorger and has 8 cards in their hand. During their cleanup step, they discard Soul Collector. is it legal for that player to play it for its morph cost?
```

Expected verdict:
```text
No. Morph gives the card an alternative cost that allows the player to cast it for its morph cost. (702.37a) Madness also gives the card an alternative cost that allows it to be cast for its madness cost. (702.35a) Only one alternative cost can be chosen to cast a given spell. (118.9a) There is no restriction on casting spells as part of the resolution of a spell or ability during the cleanup step. (514.3)
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
- [702.35a] - Madness is a keyword that represents two abilities. The first is a static ability that functions while the card with madness is in a player’s hand. The second is a triggered ability that functions when the first ability is applied. “Madness [cost]” means “If a player would discard this card, that player discards it, but exiles it instead of putting it into their graveyard” and “When this card is exiled this way, its owner may cast it by paying [cost] rather than paying its mana cost. If that player doesn’t, they put this card into their graveyard.”
- [702.37a] - Morph is a static ability that functions in any zone from which you could play the card it’s on, and the morph effect works any time the card is face down. “Morph [cost]” means “You may cast this card as a 2/2 face-down creature with no text, no name, no subtypes, and no mana cost by paying {3} rather than paying its mana cost.” (See rule 708, “Face-Down Spells and Permanents.”)
- [514.3] - Normally, no player receives priority during the cleanup step, so no spells can be cast and no abilities can be activated. However, this rule is subject to the following exception:
- [118.9a] - Only one alternative cost can be applied to any one spell as it’s being cast. The controller of the spell announces their intentions to pay that cost as described in rule 601.2b.
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined i
...
```

## RG7. Nicole controls Aubrey's Whiptail Wurm enchanted with their Treachery. Aubrey casts...

Status: **PASS**

Scenario sent (mutated):
```text
Paraphrased validation prompt. Answer from the local rules and card text, not from an exact imported question.
Relevant cards: [[Whiptail Wurm]], [[Treachery]], [[Volition Reins]].
Situation: Nicole has on the battlefield Aubrey's Whiptail Wurm enchanted with their Treachery. Aubrey plays their own Volition Reins, choosing Nicole's Treachery. once that spell finishes resolving, who has on the battlefield the Whiptail Wurm? Who has on the battlefield the Treachery?
```

Expected verdict:
```text
Aubrey controls both permanents. Out of the two auras, Treachery has the earlier timestamp (613.7a, 613.7e), and would normally be applied first. (613.7) However, the effects from both auras apply in the same layer (613.1b), applying the Volition Reins's effect would change how the Treachery's effect is applied, and applying the Treachery's effect would not change how the Volition Reins's effect is applied, so the Treachery's effect is dependent on the Volition Reins's effect. (613.8a) The Volition Reins's effect applies first (613.8b), giving Aubrey control of Treachery, and then the Treachery's effect applies, giving Aubrey control of Whiptail Wurm.
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
- [613.7a] - A continuous effect generated by a static ability has the same timestamp as the object the static ability is on, or the timestamp of the effect that created the ability, whichever is later. If the effect that created the ability has the later timestamp and the object the ability is on receives a new timestamp, each continuous effect generated by static abilities of that object receives a new timestamp as well, but the relative order of those timestamps remains the same.
- [613.8a] - An effect is said to “depend on” another if (a) it’s applied in the same layer (and, if applicable, sublayer) as the other effect; (b) applying the other would change the text or the existence of the first effect, what it applies to, or what it does to any of the things it applies to; and (c) neither effect is from a characteristic-defining ability or both effects are from characteristic-defining abilities. Otherwise, the effect is considered to be independent of the other effect.
- [613.8b] - An effect dependent on one or more other effects waits to apply until just after all of those effects have been applied. If multiple dependent effects would apply simultaneously in this way, they’re applied in timestamp order relative to each other. If several dependent effects form a dependency loop, then this rule is ignored and the effects in the dependency loop are applied in timestamp order.
- [613.7] - Within a layer or sublayer, determining which order effects are applied in is usually done using a timestamp system. An effect with an earlier timestamp is applied before an effect with a later timestamp.
- [613.7e] - An Aura, Equipment, or Fortification receives a new timestamp each time it becomes attached to an object or player.
- [608.2] - If the object that’s resolving is an instant spell, a sorcery spell, or an ability, its resolution may involve several steps. The steps described in rules 608.2a and 608.2b are followed first. The steps described in rules 608.2c–m are then followed as appropriate, in no specific order.
...
```

## RG8. Allison controls a 2/2 green Bear Creature token. They cast Acrobatic Maneuver, tar...

Status: **PASS**

Scenario sent (mutated):
```text
Paraphrased validation prompt. Answer from the local rules and card text, not from an exact imported question.
Relevant cards: [[Acrobatic Maneuver]], [[Cease]].
Situation: Allison has on the battlefield a 2/2 green Bear Creature token. They play Acrobatic Maneuver, choosing the token. what is the result for the token when it resolves?
```

Expected verdict:
```text
The token is exiled. When it tries to return to the battlefield, it can't. (111.8) It will Cease to exist when state-based actions are checked after the spell resolves. (704.5d)
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
- [704.5d] - If a token is in a zone other than the battlefield, it ceases to exist.
- [111.8] - A token that has left the battlefield can’t move to another zone or come back onto the battlefield. If such a token would change zones, it remains in its current zone instead. It ceases to exist the next time state-based actions are checked; see rule 704.
- [608.2] - If the object that’s resolving is an instant spell, a sorcery spell, or an ability, its resolution may involve several steps. The steps described in rules 608.2a and 608.2b are followed first. The steps described in rules 608.2c–m are then followed as appropriate, in no specific order. The steps described in rule 608.2n and 608.2p are followed last.
- [701.8a] - To destroy a permanent, move it from the battlefield to its owner’s graveyard.
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast includes Phyrexian mana symbols, the player announces whether they intend to pay 2 life or a corresponding colored mana cost for each of those sym
...
```

## RG10. Alvin attacks with a Rakdos Ragemutt. Nico blocks with an Elvish Ranger. How much l...

Status: **PASS**

Scenario sent (mutated):
```text
Paraphrased validation prompt. Answer from the local rules and card text, not from an exact imported question.
Relevant cards: [[Rakdos Ragemutt]], [[Elvish Ranger]].
Situation: Alvin attacks with a Rakdos Ragemutt. Nico blocks with an Elvish Ranger. How much life does Alvin gain?
```

Expected verdict:
```text
3. Lifelink means that damage the creature deals also causes its controller to gain that much life. (702.15b) Rakdos Ragemutt deals damage equal to its power to the Elvish Ranger in combat, regardless of the Elvish Ranger's toughness. (510.1a)
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
- [603.10a] - Some zone-change triggers look back in time. These are leaves-the-battlefield abilities, abilities that trigger when a player sacrifices a permanent, abilities that trigger when a card leaves a graveyard, and abilities that trigger when an object that all players can see is put into a hand or library.
- [608.2h] - If an effect requires information from the game (such as the number of creatures on the battlefield), the answer is determined only once, when the effect is applied. If the effect requires information from a specific object, including the source of the ability itself, the effect uses the current information of that object if it’s in the public zone it was expected to be in; if it’s no longer in that zone, or if the effect has moved it from a public zone to a hidden zone, the effect uses the object’s last known information. See rule 113.7a. If an ability states that an object does something, it’s the object as it exists—or as it most recently existed—that does it, not the ability.
- [120.3e] - Damage dealt to a creature by a source with neither wither nor infect causes that much damage to be marked on that creature.
- [510.1a] - Each attacking creature and each blocking creature assigns combat damage equal to its power. Creatures that would assign 0 or less damage this way don’t assign combat damage at all.
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single
...
```

## RG12. Arian controls a Chittering Host enchanted by Flickerform. They activate the abilit...

Status: **PASS**

Scenario sent (mutated):
```text
Paraphrased validation prompt. Answer from the local rules and card text, not from an exact imported question.
Relevant cards: [[Chittering Host]], [[Flickerform]], [[Midnight Scavengers]], [[Graf Rats]].
Situation: Arian has on the battlefield a Chittering Host enchanted by Flickerform. They activate the ability of Flickerform. what is the result as the delayed triggered ability resolves?
```

Expected verdict:
```text
Permanents can only be melded on the battlefield (712.8a), so the cards in exile are Midnight Scavengers and Graf Rats. The triggered ability is able to find them both and return them to the battlefield. (712.21c) Arian chooses which one to attach the Flickerform to. (303.4d)
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
- [712.21c] - If an effect can find the new object that a melded permanent becomes as it leaves the battlefield, it finds both cards. (See rule 400.7.) If that effect causes actions to be taken upon those cards, the same actions are taken upon each of them.
- [712.8a] - While a double-faced card is outside the game or in a zone other than the battlefield or stack, it has only the characteristics of its front face.
- [303.4d] - An Aura can’t enchant itself. If this occurs somehow, the Aura is put into its owner’s graveyard. An Aura that’s also a creature can’t enchant anything. If this occurs somehow, the Aura becomes unattached, then is put into its owner’s graveyard. (These are state-based actions. See rule 704.) An Aura can’t enchant more than one object or player. If a spell or ability would cause an Aura to become attached to more than one object or player, the Aura’s controller chooses which object or player it becomes attached to.
- [608.2] - If the object that’s resolving is an instant spell, a sorcery spell, or an ability, its resolution may involve several steps. The steps described in rules 608.2a and 608.2b are followed first. The steps described in rules 608.2c–m are then followed as appropriate, in no specific order. The steps described in rule 608.2n and 608.2p are followed last.
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice
...
```

## RG13. Armando casts Phyrexian Ingester, exiling Naomi's Optimus Prime, Autobot Leader tha...

Status: **PASS**

Scenario sent (mutated):
```text
Paraphrased validation prompt. Answer from the local rules and card text, not from an exact imported question.
Relevant cards: [[Phyrexian Ingester]], [[Optimus Prime, Autobot Leader]].
Situation: Armando plays Phyrexian Ingester, exiling Naomi's Optimus Prime, Autobot Leader that is currently a creature. What are the power and toughness of the Phyrexian Ingester?
```

Expected verdict:
```text
3/3. Phyrexian Ingester refers to "the exiled creature card", and the Optimus Prime, Autobot Leader in exile is not a creature card. [700.7] and [607.2a] are both worded in ways that could apply to it, but Wizards has posted an official answer that they don't.
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
- [607.2a] - If an object has an activated or triggered ability printed on it that instructs a player to exile one or more cards and an ability printed on it that refers either to “the exiled cards” or to cards “exiled with [this object],” these abilities are linked. The second ability refers only to cards in the exile zone that were put there as a result of an instruction to exile them in the first ability.
- [700.7] - If an ability uses a phrase such as “this [something]” to identify an object, where [something] is a characteristic or other quality, it is referring to that particular object, even if it isn’t the appropriate quality at the time.
- [613.4d] - Layer 7d: Effects that switch a creature’s power and toughness are applied. Such effects take the value of power and apply it to the creature’s toughness, and take the value of toughness and apply it to the creature’s power.
- [604.3] - Some static abilities are characteristic-defining abilities. A characteristic-defining ability conveys information about an object’s characteristics that would normally be found elsewhere on that object (such as in its mana cost, type line, or power/toughness box). Characteristic-defining abilities can add to or override information found elsewhere on that object. Characteristic-defining abilities function in all zones. They also function outside the game and before the game begins.
- [613.4b] - Layer 7b: Effects that set power and/or toughness to a specific number or value are applied. Effects that refer to the base power and/or toughness of a creature apply in this layer.
- [613.4c] - Layer 7c: Effects and counters that modify power and/or toughness (but don’t set power and/or toughness to a specific number or value) are applied.
- [613.4a] - Layer 7a: Effects from characteristic-defining abilities that define power and/or toughness are applied. See rule 604.3.
- [613.1d] - Layer 4: Type-changing effects are applied. These include effects that change an object’s card type, subtype, and/or supertype.
- [613.3] - Within layers 2–6, apply effects from characteristic-defining abilit
...
```

## RG15. Aspen casts Bishop of Binding, exiling Noor's Creeping Tar Pit that is currently a...

Status: **PASS**

Scenario sent (mutated):
```text
Paraphrased validation prompt. Answer from the local rules and card text, not from an exact imported question.
Relevant cards: [[Bishop of Binding]], [[Creeping Tar Pit]].
Situation: Aspen plays Bishop of Binding, exiling Noor's Creeping Tar Pit that is currently a creature. On their next turn, they attack with the Bishop of Binding. What are its power and toughness after the trigger resolves?
```

Expected verdict:
```text
1/1. Bishop of Binding refers to "the exiled card", so it doesn't matter that it isn't currently a creature. However the Creeping Tar Pit in exile has no power and toughness, so the Bishop of Binding gets +0/+0. (107.2)
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
- [607.3] - If, within a pair of linked abilities, one ability refers to a single object as “the exiled card,” “a card exiled with [this object],” or a similar phrase, and the other ability has exiled multiple cards (usually because it was copied), the ability refers to each of the exiled cards. If that ability asks for any information about the exiled card, such as a characteristic or mana value, it gets multiple answers. If these answers are used to determine the value of a variable, the sum of the answers is used. If that ability performs any actions on “the” card, it performs that action on each exiled card. If that ability creates a token that is a copy of “the” card, then for each exiled card, it creates a token that is a copy of that card. If that ability performs any actions on “a” card, the controller of the ability chooses which card is affected.
- [107.2] - If anything needs to use a number that can’t be determined, either as a result or in a calculation, it uses 0 instead.
- [608.2] - If the object that’s resolving is an instant spell, a sorcery spell, or an ability, its resolution may involve several steps. The steps described in rules 608.2a and 608.2b are followed first. The steps described in rules 608.2c–m are then followed as appropriate, in no specific order. The steps described in rule 608.2n and 608.2p are followed last.
- [613.4d] - Layer 7d: Effects that switch a creature’s power and toughness are applied. Such effects take the value of power and apply it to the creature’s toughness, and take the value of toughness and apply it to the creature’s power.
- [604.3] - Some static abilities are characteristic-defining abilities. A characteristic-defining ability conveys information about an object’s characteristics that would normally be found elsewhere on that object (such as in its mana cost, type line, or power/toughness box). Characteristic-defining abilities can add to or override information found elsewhere on that object. Characteristic-defining abilities function in all zones. They also function outside the game and before the game begins.
- 
...
```

## RG17. Alden has to choose a card name for Council of the Absolute. Can they choose Homura...

Status: **PASS**

Scenario sent (mutated):
```text
Paraphrased validation prompt. Answer from the local rules and card text, not from an exact imported question.
Relevant cards: [[Council of the Absolute]], [[Homura's Essence]].
Situation: Alden has to choose a card name for Council of the Absolute. is it legal for that player to choose Homura's Essence?
```

Expected verdict:
```text
Yes. The flipped characteristics of a flip card are used to determine the characteristics of its alternative name. (201.4c)
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
- [201.4c] - If a player wants to choose a flip card’s alternative name, the player may do so. (See rule 710.) If a player is instructed to choose a card name with certain characteristics, use the card’s characteristics as modified by its alternative characteristics to determine if this name can be chosen.
- [700.4] - The term dies means “is put into a graveyard from the battlefield.”
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast includes Phyrexian mana symbols, the player announces whether they intend to pay 2 life or a corresponding colored mana cost for each of those symbols. Previously made choices (such as choosing to cast a spell with flashback from a graveyard or choosing to cast a creature with morph face down) may restrict the player’s options when making these choices.
- [601.2f] - The player determines the total cost of the spell. Usually this is just the mana cost. Some spells have additional or alternative costs. Some effects may increase or reduce the cost to pay, or may p
...
```

## RG19. Arianna controls Possibility Storm and casts a Whetwheel for its morph cost. Ariann...

Status: **PASS**

Scenario sent (mutated):
```text
Paraphrased validation prompt. Answer from the local rules and card text, not from an exact imported question.
Relevant cards: [[Possibility Storm]], [[Whetwheel]].
Situation: Arianna has on the battlefield Possibility Storm and plays a Whetwheel for its morph cost. Arianna will exile cards from the top of their library until they exile a card of what type?
```

Expected verdict:
```text
Creature. Whetwheel is exiled face up (406.3), and is not a creature in exile. However, Possibility Storm cares about the card type of the spell on the stack (608.2h), which was a creature. (702.37a)
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
- [702.37a] - Morph is a static ability that functions in any zone from which you could play the card it’s on, and the morph effect works any time the card is face down. “Morph [cost]” means “You may cast this card as a 2/2 face-down creature with no text, no name, no subtypes, and no mana cost by paying {3} rather than paying its mana cost.” (See rule 708, “Face-Down Spells and Permanents.”)
- [406.3] - Exiled cards are, by default, kept face up and may be examined by any player at any time. Cards “exiled face down” can’t be examined by any player except when instructions allow it. However, if a player is instructed to look at a card and then exile it face down, or once a player is allowed to look at a card exiled face down, that player may continue to look at that card until it leaves the exile zone or is part of a pile of cards that are shuffled, even if the instruction allowing the player to do so no longer applies.
- [608.2h] - If an effect requires information from the game (such as the number of creatures on the battlefield), the answer is determined only once, when the effect is applied. If the effect requires information from a specific object, including the source of the ability itself, the effect uses the current information of that object if it’s in the public zone it was expected to be in; if it’s no longer in that zone, or if the effect has moved it from a public zone to a hidden zone, the effect uses the object’s last known information. See rule 113.7a. If an ability states that an object does something, it’s the object as it exists—or as it most recently existed—that does it, not the ability.
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two a
...
```

## RG20. Autumn casts a kicked Rite of Replication targeting their Hamletback Goliath. After...

Status: **PASS**

Scenario sent (mutated):
```text
Paraphrased validation prompt. Answer from the local rules and card text, not from an exact imported question.
Relevant cards: [[Rite of Replication]], [[Hamletback Goliath]].
Situation: Autumn plays a kicked Rite of Replication choosing their Hamletback Goliath. After all triggers have resolved, what is the greatest total power that they could have among all of their creatures?
```

Expected verdict:
```text
Probably 49,278.

Autumn chooses the order of the triggers on the stack. (603.3b) Each trigger checks the power of the creature that caused it to trigger when the trigger resolves (608.2h), so the number of counters it puts on its source will be modified by any changes to that power while the trigger was on the stack.

There are 15,511,210,043,330,985,984,000,000 different ways to order the triggers on the stack, so it's difficult to be certain of the maximum total power. The best that anyone has come up with though trial and error is 49,278, but the actual answer may be larger.

If you're mathematically-inclined and would like to try to find a larger value, or prove that this is the largest, you can take a look at this StackExchange page to get started. (The difficult question is how to stack the triggers from the 5 that just entered, and the best that's been found for that is 24636 = 4106*6. Then to account for the one already on the battlefield, it's obviously optimal to resolve its triggers last, so we double that number and add 6 to get 49,278.)
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
- [608.2h] - If an effect requires information from the game (such as the number of creatures on the battlefield), the answer is determined only once, when the effect is applied. If the effect requires information from a specific object, including the source of the ability itself, the effect uses the current information of that object if it’s in the public zone it was expected to be in; if it’s no longer in that zone, or if the effect has moved it from a public zone to a hidden zone, the effect uses the object’s last known information. See rule 113.7a. If an ability states that an object does something, it’s the object as it exists—or as it most recently existed—that does it, not the ability.
- [603.3b] - If multiple abilities have triggered since the last time a player received priority, the abilities are placed on the stack in a two-part process. First, each player, in APNAP order, puts each triggered ability they control with a trigger condition that isn’t another ability triggering on the stack in any order they choose. (See rule 101.4.) Second, each player, in APNAP order, puts all remaining triggered abilities they control on the stack in any order they choose. Then the game once again checks for and performs state-based actions until none are performed, then abilities that triggered during this process go on the stack. This process repeats until no new state-based actions are performed and no abilities trigger. Then the appropriate player gets priority.
- [604.3] - Some static abilities are characteristic-defining abilities. A characteristic-defining ability conveys information about an object’s characteristics that would normally be found elsewhere on that object (such as in its mana cost, type line, or power/toughness box). Characteristic-defining abilities can add to or override information found elsewhere on that object. Characteristic-defining abilities function in all zones. They also function outside the game and before the game begins.
- [613.4d] - Layer 7d: Effects that switch a creature’s power and toughness are applied. Such effects take the value of
...
```

## RG21. Nathanael controls a Leonin Arbiter. Alex activates their Shred Memory, and then bo...

Status: **PASS**

Scenario sent (mutated):
```text
Paraphrased validation prompt. Answer from the local rules and card text, not from an exact imported question.
Relevant cards: [[Leonin Arbiter]], [[Shred Memory]].
Situation: Nathanael has on the battlefield a Leonin Arbiter. Alex activates their Shred Memory, and then both players pass priority. what is the result when the ability resolves?
```

Expected verdict:
```text
Alex can't search their library. Paying {2} is a special action that must be taken when they have priority. (116.2d) Players don't receive priority while an ability is resolving. (117.3) Alex then shuffles their library.
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
- [116.2d] - Some effects from static abilities allow a player to take an action to ignore the effect from that ability for a duration. Doing so is a special action. A player can take such an action any time they have priority.
- [117.3] - Which player has priority is determined by the following rules:
- [608.2] - If the object that’s resolving is an instant spell, a sorcery spell, or an ability, its resolution may involve several steps. The steps described in rules 608.2a and 608.2b are followed first. The steps described in rules 608.2c–m are then followed as appropriate, in no specific order. The steps described in rule 608.2n and 608.2p are followed last.
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast includes Phyrexian mana symbols, the player announces whether they intend to pay 2 life or a corresponding colored mana cost for each of those symbols. Previously made choices (such as choosing to cast a spell with flashback from a graveyard or choosing to cast a creature with morph fac
...
```

## RG22. Ashton controls an animated Mishra's Factory with a -1/-1 counter on it. On their n...

Status: **PASS**

Scenario sent (mutated):
```text
Paraphrased validation prompt. Answer from the local rules and card text, not from an exact imported question.
Relevant cards: [[Mishra's Factory]], [[Earthen Arms]].
Situation: Ashton has on the battlefield an animated Mishra's Factory with a -1/-1 counter on it. On their next turn, they play Earthen Arms, to put 2 +1/+1 counters on the Mishra's Factory. After the spell has resolved and state-based actions have been checked, what counters does the Mishra's Factory have?
```

Expected verdict:
```text
A single +1/+1 counter. +1/+1 and -1/-1 counters "cancel out" whenever state-based actions are checked. (704.5q). It doesn't matter what permanent type they are on.
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
- [704.5q] - If a permanent has both a +1/+1 counter and a -1/-1 counter on it, N +1/+1 and N -1/-1 counters are removed from it, where N is the smaller of the number of +1/+1 and -1/-1 counters on it.
- [608.2] - If the object that’s resolving is an instant spell, a sorcery spell, or an ability, its resolution may involve several steps. The steps described in rules 608.2a and 608.2b are followed first. The steps described in rules 608.2c–m are then followed as appropriate, in no specific order. The steps described in rule 608.2n and 608.2p are followed last.
- [613.4c] - Layer 7c: Effects and counters that modify power and/or toughness (but don’t set power and/or toughness to a specific number or value) are applied.
- [701.8a] - To destroy a permanent, move it from the battlefield to its owner’s graveyard.
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast includes Phyrexian mana symbols, the player announces whether they intend to pay 2 life or a corresponding colored mana cost for each of
...
```

## RG24. Ari activates Phyrexian Portal's ability. Can they look at the cards in the exiled...

Status: **PASS**

Scenario sent (mutated):
```text
Paraphrased validation prompt. Answer from the local rules and card text, not from an exact imported question.
Relevant cards: [[Phyrexian Portal]].
Situation: Ari activates Phyrexian Portal's ability. is it legal for that player to look at the cards in the exiled pile before choosing what card to find from the other pile?
```

Expected verdict:
```text
Yes. Cards are always exiled face up unless otherwise stated, regardless of whether they were face up or face down in their previous zone. (406.3) The first pile is exiled before the second pile is searched, so Ari has a chance to look at it before making they decision. (608.2c)
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
- [406.3] - Exiled cards are, by default, kept face up and may be examined by any player at any time. Cards “exiled face down” can’t be examined by any player except when instructions allow it. However, if a player is instructed to look at a card and then exile it face down, or once a player is allowed to look at a card exiled face down, that player may continue to look at that card until it leaves the exile zone or is part of a pile of cards that are shuffled, even if the instruction allowing the player to do so no longer applies.
- [608.2c] - The controller of the spell or ability follows its instructions in the order written. However, replacement effects may modify these actions. In some cases, later text on the card may modify the meaning of earlier text (for example, “Destroy target creature. It can’t be regenerated” or “Counter target spell. If that spell is countered this way, put it on top of its owner’s library instead of into its owner’s graveyard.”) Don’t just apply effects step by step without thinking in these cases—read the whole text and apply the rules of English to the text.
- [608.2] - If the object that’s resolving is an instant spell, a sorcery spell, or an ability, its resolution may involve several steps. The steps described in rules 608.2a and 608.2b are followed first. The steps described in rules 608.2c–m are then followed as appropriate, in no specific order. The steps described in rule 608.2n and 608.2p are followed last.
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in 
...
```

## RG25. Avery activates Phyrexian Portal's ability. Nyla chooses to put all 10 cards into o...

Status: **PASS**

Scenario sent (mutated):
```text
Paraphrased validation prompt. Answer from the local rules and card text, not from an exact imported question.
Relevant cards: [[Phyrexian Portal]].
Situation: Avery activates Phyrexian Portal's ability. Nyla chooses to put all 10 cards into one pile, and Avery chooses to exile that pile. Does they shuffle their library?
```

Expected verdict:
```text
Yes. (701.24d)
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
- [701.24d] - If an effect would cause a player to shuffle a set of objects into a library, that library is shuffled even if there are no objects in that set.
- [608.2] - If the object that’s resolving is an instant spell, a sorcery spell, or an ability, its resolution may involve several steps. The steps described in rules 608.2a and 608.2b are followed first. The steps described in rules 608.2c–m are then followed as appropriate, in no specific order. The steps described in rule 608.2n and 608.2p are followed last.
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast includes Phyrexian mana symbols, the player announces whether they intend to pay 2 life or a corresponding colored mana cost for each of those symbols. Previously made choices (such as choosing to cast a spell with flashback from a graveyard or choosing to cast a creature with morph face down) may restrict the player’s options when making these choices.
- [700.2] - A spell or ability is modal if it has two or more options in a b
...
```

## RG26. Addilyn controls Eidolon of Rhetoric. They want to cast Lady Zhurong, Warrior Queen...

Status: **PASS**

Scenario sent (mutated):
```text
Paraphrased validation prompt. Answer from the local rules and card text, not from an exact imported question.
Relevant cards: [[Eidolon of Rhetoric]], [[Lady Zhurong, Warrior Queen]], [[Durkwood Baloth]].
Situation: Addilyn has on the battlefield Eidolon of Rhetoric. They want to play Lady Zhurong, Warrior Queen and then suspend Durkwood Baloth. is it legal for that player to?
```

Expected verdict:
```text
No. A card may only be suspended if its owner could begin to cast it. (702.62a, 702.62c)
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
- [702.62c] - While determining if you could begin to cast a card with suspend, take into consideration any effects that would prohibit that card from being cast.
- [702.61] - Split Second
- [608.2] - If the object that’s resolving is an instant spell, a sorcery spell, or an ability, its resolution may involve several steps. The steps described in rules 608.2a and 608.2b are followed first. The steps described in rules 608.2c–m are then followed as appropriate, in no specific order. The steps described in rule 608.2n and 608.2p are followed last.
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value o
...
```

## RG28. Andrew casts Commune with Lava, which exiles Kishla Village. Can they play it?

Status: **PASS**

Scenario sent (mutated):
```text
Paraphrased validation prompt. Answer from the local rules and card text, not from an exact imported question.
Relevant cards: [[Commune with Lava]], [[Kishla Village]].
Situation: Andrew plays Commune with Lava, which exiles Kishla Village. is it legal for that player to play it?
```

Expected verdict:
```text
Yes, but only if they has a land play remaining that turn. (701.18b)
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
- [701.18b] - To play a card means to play that card as a land or to cast that card as a spell, whichever is appropriate.
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast includes Phyrexian mana symbols, the player announces whether they intend to pay 2 life or a corresponding colored mana cost for each of those symbols. Previously made choices (such as choosing to cast a spell with flashback from a graveyard or choosing to cast a creature with morph face down) may restrict the player’s options when making these choices.
- [106.4] - When an effect instructs a player to add mana, that mana goes into a player’s mana pool. From there, it can be used to pay costs immediately, or it can stay in the player’s mana pool as unspent mana. Each player’s mana pool empties at the end of each step and phase, and the player is said to lose this mana. Cards with abilities that produce mana or refer to unspent mana have received errata in the Oracle™ card reference to no longer explicitly refer to the mana
...
```

## RG29. Alexzander controls a Rites of Flourishing and has played 2 lands this turn. They c...

Status: **PASS**

Scenario sent (mutated):
```text
Paraphrased validation prompt. Answer from the local rules and card text, not from an exact imported question.
Relevant cards: [[Rites of Flourishing]], [[Flicker]].
Situation: Alexzander has on the battlefield a Rites of Flourishing and has played 2 lands this turn. They plays Flicker, choosing the Rites of Flourishing. After if resolves, is it legal for that player to play a 3rd land?
```

Expected verdict:
```text
No. Alexzander has 1 land play this turn by default, which Rites of Flourishing increase to 2. Alexzander has already played 2 lands this turn, so no more lands can be played. (305.2a)
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
- [305.2a] - To determine whether a player can play a land, compare the number of lands the player can play this turn with the number of lands they have already played this turn (including lands played as special actions and lands played during the resolution of spells and abilities). If the number of lands the player can play is greater, the play is legal.
- [608.2] - If the object that’s resolving is an instant spell, a sorcery spell, or an ability, its resolution may involve several steps. The steps described in rules 608.2a and 608.2b are followed first. The steps described in rules 608.2c–m are then followed as appropriate, in no specific order. The steps described in rule 608.2n and 608.2p are followed last.
- [117.3b] - The active player receives priority after a spell or ability (other than a mana ability) resolves.
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast includes Phyrexian mana symbols, the player announces whether they intend to pay 2 life or a corresponding colored mana
...
```

## RG30. Anastasia controls Oracle of Mul Daya and has played 2 lands this turn. They casts...

Status: **PASS**

Scenario sent (mutated):
```text
Paraphrased validation prompt. Answer from the local rules and card text, not from an exact imported question.
Relevant cards: [[Oracle of Mul Daya]], [[Essence Flux]].
Situation: Anastasia has on the battlefield Oracle of Mul Daya and has played 2 lands this turn. They plays Essence Flux, choosing the Oracle of Mul Daya. once that spell finishes resolving, is it legal for that player to play a 3rd land?
```

Expected verdict:
```text
No. Anastasia has 1 land play this turn by default, which Oracle of Mul Daya increase to 2. Anastasia has already played 2 lands this turn, so no more lands can be played. (305.2a)
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
- [305.2a] - To determine whether a player can play a land, compare the number of lands the player can play this turn with the number of lands they have already played this turn (including lands played as special actions and lands played during the resolution of spells and abilities). If the number of lands the player can play is greater, the play is legal.
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hybrid mana symbols, the player announces the nonhybrid equivalent cost they intend to pay. If a cost that will be paid as the spell is being cast includes Phyrexian mana symbols, the player announces whether they intend to pay 2 life or a corresponding colored mana cost for each of those symbols. Previously made choices (such as choosing to cast a spell with flashback from a graveyard or choosing to cast a creature with morph face down) may restrict the player’s options when making these choices.
- [601.2f] - The player determines the total cost of the spell. Usually this is just the mana cost. Some spells have additional or alternative costs. Some effects may increase or reduce the cost to pay, or may provide other alternative cos
...
```

## RG31. Adriel controls Karador, Ghost Chieftain and has cast a spell with it this turn. Th...

Status: **PASS**

Scenario sent (mutated):
```text
Paraphrased validation prompt. Answer from the local rules and card text, not from an exact imported question.
Relevant cards: [[Karador, Ghost Chieftain]], [[Momentary Blink]].
Situation: Adriel has on the battlefield Karador, Ghost Chieftain and has play a spell with it this turn. They plays Momentary Blink, choosing the Karador, Ghost Chieftain. once that spell finishes resolving, is it legal for that player to play another card from their graveyard?
```

Expected verdict:
```text
Yes. Karador, Ghost Chieftain's effect allows Adriel to cast one spell with that effect. If the Karador, Ghost Chieftain leaves the battlefield and then returns, it is a completely new object, generating a new effect. (400.7) That effect counts no cards cast with it yet this turn.
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
- [400.7] - An object that moves from one zone to another becomes a new object with no memory of, or relation to, its previous existence. This rule has the following exceptions.
- [903.8] - A player may cast a commander they own from the command zone. A commander cast from the command zone costs an additional {2} for each previous time the player casting it has cast it from the command zone that game. This additional cost is informally known as the “commander tax.”
- [608.2] - If the object that’s resolving is an instant spell, a sorcery spell, or an ability, its resolution may involve several steps. The steps described in rules 608.2a and 608.2b are followed first. The steps described in rules 608.2c–m are then followed as appropriate, in no specific order. The steps described in rule 608.2n and 608.2p are followed last.
- [614.6] - If an event is replaced, it never happens. A modified event occurs instead, which may in turn trigger abilities. Note that the modified event may contain instructions that can’t be carried out, in which case the impossible instruction is simply ignored.
- [601.2b] - If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable. If the value of that variable is defined in the text of the spell by a choice that player would make later in the announcement or resolution of the spell, that player makes that choice at this time instead of that later time. If a cost that will be paid as the spell is being cast includes hy
...
```

## RG32. Autumn controls a Hero of Bladehold, a Nobilis of War, and an Akroan Hoplite. They...

Status: **PASS**

Scenario sent (mutated):
```text
Paraphrased validation prompt. Answer from the local rules and card text, not from an exact imported question.
Relevant cards: [[Hero of Bladehold]], [[Nobilis of War]], [[Akroan Hoplite]].
Situation: Autumn has on the battlefield a Hero of Bladehold, a Nobilis of War, and an Akroan Hoplite. They declares all 3 of them as attackers and no blockers are declared. What are the possible total amounts of damage that could be dealt to Nathaly?
```

Expected verdict:
```text
24, 26, or 28. Since Autumn controls all the triggers, they can choose in which order to put them onto the stack. (603.3b) Hero of Bladehold's battle cry trigger will only give +1/+0 to the soldier tokens if they are on the battlefield at that time. (611.2c) Similarly, Akroan Hoplite will only count the tokens towards X if they are on the battlefield when the trigger resolves. (608.2h) The Nobilis of War's ability is not a triggered ability, and will apply to all attacking creatures, no matter when they entered the battlefield. (611.3a)
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
- [611.2c] - If a continuous effect generated by the resolution of a spell or ability modifies the characteristics or changes the controller of any objects, the set of objects it affects is determined when that continuous effect begins. After that point, the set won’t change. (Note that this works differently than a continuous effect from a static ability.) A continuous effect generated by the resolution of a spell or ability that doesn’t modify the characteristics or change the controller of any objects modifies the rules of the game, so it can affect objects that weren’t affected when that continuous effect began. If a single continuous effect has parts that modify the characteristics or changes the controller of any objects and other parts that don’t, the set of objects each part applies to is determined independently.
- [608.2h] - If an effect requires information from the game (such as the number of creatures on the battlefield), the answer is determined only once, when the effect is applied. If the effect requires information from a specific object, including the source of the ability itself, the effect uses the current information of that object if it’s in the public zone it was expected to be in; if it’s no longer in that zone, or if the effect has moved it from a public zone to a hidden zone, the effect uses the object’s last known information. See rule 113.7a. If an ability states that an object does something, it’s the object as it exists—or as it most recently existed—that does it, not the ability.
- [603.3b] - If multiple abilities have triggered since the last time a player received priority, the abilities are placed on the stack in a two-part process. First, each player, in APNAP order, puts each triggered ability they control with a trigger condition that isn’t another ability triggering on the stack in any order they choose. (See rule 101.4.) Second, each player, in APNAP order, puts all remaining triggered abilities they control on the stack in any order they choose. Then the game once again checks for and performs state-based actions until none are 
...
```

## RG33. Augustine controls a Valakut, the Molten Pinnacle and 5 Mountains. They plays a 6th...

Status: **PASS**

Scenario sent (mutated):
```text
Paraphrased validation prompt. Answer from the local rules and card text, not from an exact imported question.
Relevant cards: [[Valakut, the Molten Pinnacle]], [[Mountain]], [[Helldozer]].
Situation: Augustine has on the battlefield a Valakut, the Molten Pinnacle and 5 Mountains. They plays a 6th Mountain and target Nathalie with Valakut, the Molten Pinnacle's trigger. In response, Nathalie activates Helldozer, choosing the Valakut, the Molten Pinnacle. Will they be dealt 3 damage?
```

Expected verdict:
```text
Yes. Removing the source of an ability on the stack does not affect that ability. (113.7a)
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
- [603.4] - A triggered ability may read “When/Whenever/At [trigger event], if [condition], [effect].” When the trigger event occurs, the ability checks whether the stated condition is true. The ability triggers only if it is; otherwise it does nothing. If the ability triggers, it checks the stated condition again as it resolves. If the condition isn’t true at that time, the ability is removed from the stack and does nothing. Note that this mirrors the check for legal targets. This rule is referred to as the “intervening ‘if’ clause” rule. (The word “if” has only its normal English meaning anywhere else in the text of a card; this rule only applies to an “if” that immediately follows a trigger condition.)
- [113.7a] - Once activated or triggered, an ability exists on the stack independently of its source. Destruction or removal of the source after that time won’t affect the ability. Note that some abilities cause a source to do something (for example, “This creature deals 1 damage to any target”) rather than the ability doing anything directly. In these cases, any activated or triggered ability that references information about the source for use while announcing an activated ability or putting a triggered ability on the stack checks that information when the ability is put onto the stack. Otherwise, it will check that information when it resolves. In both instances, if the source is no longer in the zone it’s expected to be in at that time, its last known information is used. The source can still perform the action even though it no longer exists.
- [701.8a] - To destroy a permanent, move it from the battlefield to its owner’s graveyard.
- [608.2] - If the object that’s resolving is an instant spell, a sorcery spell, or an ability, its resolution may involve several steps. The steps described in rules 608.2a and 608.2b are followed first. The steps described in rules 608.2c–m are then followed as appropriate, in no specific order. The steps described in rule 608.2n and 608.2p are followed last.
- [601.2b] - If the spell is modal, the player announces the mode choice 
...
```
