# Arbiter Engine - RulesGuru Imported Suite
## External verified question benchmark for local Arbiter validation

Generated: 2026-05-22T23:21:13.448Z
Source: RulesGuru API (https://rulesguru.org/api/questions/)
Import settings: `{"count":500,"level":["0","1","2","3","Corner Case"],"complexity":["Simple","Intermediate","Complicated"],"legality":"all","playableOnly":false,"tags":[],"tagsConjunc":"OR","rules":[],"rulesConjunc":"OR","cards":[],"cardsConjunc":"OR","from":"mtg-tool-local-rulesguru-import","previousId":1}`

These cases are imported from RulesGuru for personal, non-commercial validation. RulesGuru is a question database, not a solver endpoint for arbitrary prompts; this file converts its approved questions and cited answers into the local Arbiter validation format.

---

# CATEGORY RG - RulesGuru Imported Questions

## RG2. Noel controls a Kruphix, God of Horizons and has 3 red mana and 2 colorless mana in...

**Scenario:**
> Noel controls a Kruphix, God of Horizons and has 3 red mana and 2 colorless mana in their mana pool. Autumn casts a Drain Power, targeting Noel. After it resolves, what mana does each player have in their mana pool?
> Cards involved: [[Kruphix, God of Horizons]], [[Drain Power]].
> RulesGuru source: https://rulesguru.org/?2RGBwnIII1VNN64GG

**Expected verdict:** Drain Power causes all mana to empty from Noel's mana pool and that much mana to be added to Autumn's mana pool. (106.13) Kruphix, God of Horizons causes the mana to turn into colorless mana instead of emptying, so no mana is added to Autumn's mana pool. The final result is that Autumn has no mana and Noel has 5 colorless mana.

**Required reasoning:**
- Match the RulesGuru cited answer for question 2.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [106.13]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Miscellaneous, Replacement effects.

## RG3. Alessandra attacks with 4 Cultivator of Blades. What is the greatest amount of dama...

**Scenario:**
> Alessandra attacks with 4 Cultivator of Blades. What is the greatest amount of damage that can be dealt to Nico in total?
> Cards involved: [[Cultivator of Blades]].
> RulesGuru source: https://rulesguru.org/?3RGBwnIIIaoXGG

**Expected verdict:** 49. Let's look at the 4 Cultivator of Blades's powers in the order their triggers resolve:
1 1 1 1
The first trigger resolves and adds 1 to the power of each other Cultivator of Blades:
1 2 2 2
The second trigger resolves and adds 2 to the power of each other Cultivator of Blades:
3 2 4 4
The third trigger, adding 4:
7 6 4 8
And the fourth trigger, adding 8:
15 14 12 8

**Required reasoning:**
- Match the RulesGuru cited answer for question 3.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: 0. Complexity: Intermediate. Tags: Trivia, Triggered abilities, Numbers and symbols.

## RG4. Abram attacks with Wild Beastmaster and Ruination Wurm. Nola casts Constricting Ten...

**Scenario:**
> Abram attacks with Wild Beastmaster and Ruination Wurm. Nola casts Constricting Tendrils, targeting the Wild Beastmaster. What happens to the Ruination Wurm when the Wild Beastmaster trigger resolves?
> Cards involved: [[Wild Beastmaster]], [[Ruination Wurm]], [[Constricting Tendrils]].
> RulesGuru source: https://rulesguru.org/?4RGBwnIIImot7P3MWGG

**Expected verdict:** Wild Beastmaster has a negative power when the trigger resolves, but the game treats it as 0 for the purpose of modifying the power and toughness of Ruination Wurm. (107.1b) Ruination Wurm gets +0/+0, and nothing happens to it.

**Required reasoning:**
- Match the RulesGuru cited answer for question 4.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [107.1b]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Numbers and symbols.

## RG5. Adrian controls Dream Halls. Can they cast Dragonlord's Prerogative by discarding P...

**Scenario:**
> Adrian controls Dream Halls. Can they cast Dragonlord's Prerogative by discarding Phantasmal Dragon, and also reveal it to make the Dragonlord's Prerogative uncounterable?
> Cards involved: [[Dream Halls]], [[Dragonlord's Prerogative]], [[Phantasmal Dragon]].
> RulesGuru source: https://rulesguru.org/?5RGBwnIIIg6M0WJ1CGG

**Expected verdict:** Yes. Revealing and discarding the Phantasmal Dragon are both costs to cast the Dragonlord's Prerogative. (118.8, 118.9) Costs can be paid in any order. (601.2h)

**Required reasoning:**
- Match the RulesGuru cited answer for question 5.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [118.8], [118.9], [601.2h]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Costs, Casting spells.

## RG6. Ari controls a Falkenrath Gorger and has 8 cards in their hand. During their cleanu...

**Scenario:**
> Ari controls a Falkenrath Gorger and has 8 cards in their hand. During their cleanup step, they discard Soul Collector. Can they cast it for its morph cost?
> Cards involved: [[Falkenrath Gorger]], [[Soul Collector]].
> RulesGuru source: https://rulesguru.org/?6RGBwnIII1KwluaGG

**Expected verdict:** No. Morph gives the card an alternative cost that allows the player to cast it for its morph cost. (702.37a) Madness also gives the card an alternative cost that allows it to be cast for its madness cost. (702.35a) Only one alternative cost can be chosen to cast a given spell. (118.9a) There is no restriction on casting spells as part of the resolution of a spell or ability during the cleanup step. (514.3)

**Required reasoning:**
- Match the RulesGuru cited answer for question 6.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [118.9a], [514.3], [702.35a], [702.37a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Casting spells, Costs, Abilities, Face-down objects, Non-evergreen keywords, Timing and priority, Turn structure.

## RG7. Nicole controls Aubrey's Whiptail Wurm enchanted with their Treachery. Aubrey casts...

**Scenario:**
> Nicole controls Aubrey's Whiptail Wurm enchanted with their Treachery. Aubrey casts their own Volition Reins, targeting Nicole's Treachery. After it resolves, who controls the Whiptail Wurm? Who controls the Treachery?
> Cards involved: [[Whiptail Wurm]], [[Treachery]], [[Volition Reins]].
> RulesGuru source: https://rulesguru.org/?7RGBwnIIImnaceS15GG

**Expected verdict:** Aubrey controls both permanents. Out of the two auras, Treachery has the earlier timestamp (613.7a, 613.7e), and would normally be applied first. (613.7) However, the effects from both auras apply in the same layer (613.1b), applying the Volition Reins's effect would change how the Treachery's effect is applied, and applying the Treachery's effect would not change how the Volition Reins's effect is applied, so the Treachery's effect is dependent on the Volition Reins's effect. (613.8a) The Volition Reins's effect applies first (613.8b), giving Aubrey control of Treachery, and then the Treachery's effect applies, giving Aubrey control of Whiptail Wurm.

**Required reasoning:**
- Match the RulesGuru cited answer for question 7.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [613.1b], [613.7], [613.7a], [613.7e], [613.8a], [613.8b]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Auras, Control-changing effects, Dependency, Layers.

## RG8. Allison controls a 2/2 green Bear Creature token. They cast Acrobatic Maneuver, tar...

**Scenario:**
> Allison controls a 2/2 green Bear Creature token. They cast Acrobatic Maneuver, targeting the token. What happens to the token when it resolves?
> Cards involved: [[Acrobatic Maneuver]], [[Cease]].
> RulesGuru source: https://rulesguru.org/?8RGBwnIII1tQzlhGG

**Expected verdict:** The token is exiled. When it tries to return to the battlefield, it can't. (111.8) It will Cease to exist when state-based actions are checked after the spell resolves. (704.5d)

**Required reasoning:**
- Match the RulesGuru cited answer for question 8.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [111.8], [704.5d]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: State-based actions, Tokens, Zone-changes.

## RG10. Alvin attacks with a Rakdos Ragemutt. Nico blocks with an Elvish Ranger. How much l...

**Scenario:**
> Alvin attacks with a Rakdos Ragemutt. Nico blocks with an Elvish Ranger. How much life does Alvin gain?
> Cards involved: [[Rakdos Ragemutt]], [[Elvish Ranger]].
> RulesGuru source: https://rulesguru.org/?10RGBwnIII2608hvGG

**Expected verdict:** 3. Lifelink means that damage the creature deals also causes its controller to gain that much life. (702.15b) Rakdos Ragemutt deals damage equal to its power to the Elvish Ranger in combat, regardless of the Elvish Ranger's toughness. (510.1a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 10.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [510.1a], [702.15b]

**Why this test matters:** Imported RulesGuru benchmark. Level: 0. Complexity: Simple. Tags: Combat, Damage, Evergreen keywords, Life.

## RG12. Arian controls a Chittering Host enchanted by Flickerform. They activate the abilit...

**Scenario:**
> Arian controls a Chittering Host enchanted by Flickerform. They activate the ability of Flickerform. What happens as the delayed triggered ability resolves?
> Cards involved: [[Chittering Host]], [[Flickerform]], [[Midnight Scavengers]], [[Graf Rats]].
> RulesGuru source: https://rulesguru.org/?12RGBwnIII2qePjg8o3fpGG

**Expected verdict:** Permanents can only be melded on the battlefield (712.8a), so the cards in exile are Midnight Scavengers and Graf Rats. The triggered ability is able to find them both and return them to the battlefield. (712.21c) Arian chooses which one to attach the Flickerform to. (303.4d)

**Required reasoning:**
- Match the RulesGuru cited answer for question 12.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [303.4d], [712.8a], [712.21c]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Auras, Meld cards.

## RG13. Armando casts Phyrexian Ingester, exiling Naomi's Optimus Prime, Autobot Leader tha...

**Scenario:**
> Armando casts Phyrexian Ingester, exiling Naomi's Optimus Prime, Autobot Leader that is currently a creature. What are the power and toughness of the Phyrexian Ingester?
> Cards involved: [[Phyrexian Ingester]], [[Optimus Prime, Autobot Leader]].
> RulesGuru source: https://rulesguru.org/?13RGBwnIII23VSljGG

**Expected verdict:** 3/3. Phyrexian Ingester refers to "the exiled creature card", and the Optimus Prime, Autobot Leader in exile is not a creature card. [700.7] and [607.2a] are both worded in ways that could apply to it, but Wizards has posted an official answer that they don't.

**Required reasoning:**
- Match the RulesGuru cited answer for question 13.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [607.2a], [700.7]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Numbers and symbols, Unsupported answers.

## RG15. Aspen casts Bishop of Binding, exiling Noor's Creeping Tar Pit that is currently a...

**Scenario:**
> Aspen casts Bishop of Binding, exiling Noor's Creeping Tar Pit that is currently a creature. On their next turn, they attack with the Bishop of Binding. What are its power and toughness after the trigger resolves?
> Cards involved: [[Bishop of Binding]], [[Creeping Tar Pit]].
> RulesGuru source: https://rulesguru.org/?15RGBwnIII1xCXDtGG

**Expected verdict:** 1/1. Bishop of Binding refers to "the exiled card", so it doesn't matter that it isn't currently a creature. However the Creeping Tar Pit in exile has no power and toughness, so the Bishop of Binding gets +0/+0. (107.2)

**Required reasoning:**
- Match the RulesGuru cited answer for question 15.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [107.2]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Miscellaneous, Linked abilities, Numbers and symbols.

## RG17. Alden has to choose a card name for Council of the Absolute. Can they choose Homura...

**Scenario:**
> Alden has to choose a card name for Council of the Absolute. Can they choose Homura's Essence?
> Cards involved: [[Council of the Absolute]], [[Homura's Essence]].
> RulesGuru source: https://rulesguru.org/?17RGBwnIII1Cp6ltGG

**Expected verdict:** Yes. The flipped characteristics of a flip card are used to determine the characteristics of its alternative name. (201.4c)

**Required reasoning:**
- Match the RulesGuru cited answer for question 17.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [201.4c]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Card names, Flip cards.

## RG19. Arianna controls Possibility Storm and casts a Whetwheel for its morph cost. Ariann...

**Scenario:**
> Arianna controls Possibility Storm and casts a Whetwheel for its morph cost. Arianna will exile cards from the top of their library until they exile a card of what type?
> Cards involved: [[Possibility Storm]], [[Whetwheel]].
> RulesGuru source: https://rulesguru.org/?19RGBwnIII24wlWWGG

**Expected verdict:** Creature. Whetwheel is exiled face up (406.3), and is not a creature in exile. However, Possibility Storm cares about the card type of the spell on the stack (608.2h), which was a creature. (702.37a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 19.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [406.3], [608.2h], [702.37a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Resolving objects, Zone-changes, Morph cards, Last known information, Face-down objects.

## RG20. Autumn casts a kicked Rite of Replication targeting their Hamletback Goliath. After...

**Scenario:**
> Autumn casts a kicked Rite of Replication targeting their Hamletback Goliath. After all triggers have resolved, what is the greatest total power that they could have among all of their creatures?
> Cards involved: [[Rite of Replication]], [[Hamletback Goliath]].
> RulesGuru source: https://rulesguru.org/?20RGBwnIII27QgKOGG

**Expected verdict:** Probably 49,278.

Autumn chooses the order of the triggers on the stack. (603.3b) Each trigger checks the power of the creature that caused it to trigger when the trigger resolves (608.2h), so the number of counters it puts on its source will be modified by any changes to that power while the trigger was on the stack.

There are 15,511,210,043,330,985,984,000,000 different ways to order the triggers on the stack, so it's difficult to be certain of the maximum total power. The best that anyone has come up with though trial and error is 49,278, but the actual answer may be larger.

If you're mathematically-inclined and would like to try to find a larger value, or prove that this is the largest, you can take a look at this StackExchange page to get started. (The difficult question is how to stack the triggers from the 5 that just entered, and the best that's been found for that is 24636 = 4106*6. Then to account for the one already on the battlefield, it's obviously optimal to resolve its triggers last, so we double that number and add 6 to get 49,278.)

**Required reasoning:**
- Match the RulesGuru cited answer for question 20.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [603.3b], [608.2h]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Complicated. Tags: Trivia, Triggered abilities, Numbers and symbols, The stack, Resolving objects.

## RG21. Nathanael controls a Leonin Arbiter. Alex activates their Shred Memory, and then bo...

**Scenario:**
> Nathanael controls a Leonin Arbiter. Alex activates their Shred Memory, and then both players pass priority. What happens when the ability resolves?
> Cards involved: [[Leonin Arbiter]], [[Shred Memory]].
> RulesGuru source: https://rulesguru.org/?21RGBwnIII1Wo6siGG

**Expected verdict:** Alex can't search their library. Paying {2} is a special action that must be taken when they have priority. (116.2d) Players don't receive priority while an ability is resolving. (117.3) Alex then shuffles their library.

**Required reasoning:**
- Match the RulesGuru cited answer for question 21.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [116.2d], [117.3]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Libraries, The stack, Special actions.

## RG22. Ashton controls an animated Mishra's Factory with a -1/-1 counter on it. On their n...

**Scenario:**
> Ashton controls an animated Mishra's Factory with a -1/-1 counter on it. On their next turn, they cast Earthen Arms, to put 2 +1/+1 counters on the Mishra's Factory. After the spell has resolved and state-based actions have been checked, what counters does the Mishra's Factory have?
> Cards involved: [[Mishra's Factory]], [[Earthen Arms]].
> RulesGuru source: https://rulesguru.org/?22RGBwnIII1ZylQWGG

**Expected verdict:** A single +1/+1 counter. +1/+1 and -1/-1 counters "cancel out" whenever state-based actions are checked. (704.5q). It doesn't matter what permanent type they are on.

**Required reasoning:**
- Match the RulesGuru cited answer for question 22.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [704.5q]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Counters, State-based actions, Type-changing effects.

## RG24. Ari activates Phyrexian Portal's ability. Can they look at the cards in the exiled...

**Scenario:**
> Ari activates Phyrexian Portal's ability. Can they look at the cards in the exiled pile before choosing what card to find from the other pile?
> Cards involved: [[Phyrexian Portal]].
> RulesGuru source: https://rulesguru.org/?24RGBwnIIIcXmGG

**Expected verdict:** Yes. Cards are always exiled face up unless otherwise stated, regardless of whether they were face up or face down in their previous zone. (406.3) The first pile is exiled before the second pile is searched, so Ari has a chance to look at it before making they decision. (608.2c)

**Required reasoning:**
- Match the RulesGuru cited answer for question 24.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [406.3], [608.2c]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Resolving objects, Zone-changes, Face-down objects.

## RG25. Avery activates Phyrexian Portal's ability. Nyla chooses to put all 10 cards into o...

**Scenario:**
> Avery activates Phyrexian Portal's ability. Nyla chooses to put all 10 cards into one pile, and Avery chooses to exile that pile. Does they shuffle their library?
> Cards involved: [[Phyrexian Portal]].
> RulesGuru source: https://rulesguru.org/?25RGBwnIIIcXmGG

**Expected verdict:** Yes. (701.24d)

**Required reasoning:**
- Match the RulesGuru cited answer for question 25.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [701.24d]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Zone-changes, Libraries, Evergreen keywords.

## RG26. Addilyn controls Eidolon of Rhetoric. They want to cast Lady Zhurong, Warrior Queen...

**Scenario:**
> Addilyn controls Eidolon of Rhetoric. They want to cast Lady Zhurong, Warrior Queen and then suspend Durkwood Baloth. Can they?
> Cards involved: [[Eidolon of Rhetoric]], [[Lady Zhurong, Warrior Queen]], [[Durkwood Baloth]].
> RulesGuru source: https://rulesguru.org/?26RGBwnIIIgeiNcs62GG

**Expected verdict:** No. A card may only be suspended if its owner could begin to cast it. (702.62a, 702.62c)

**Required reasoning:**
- Match the RulesGuru cited answer for question 26.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [702.62a], [702.62c]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Non-evergreen keywords, Casting spells, Special actions.

## RG28. Andrew casts Commune with Lava, which exiles Kishla Village. Can they play it?

**Scenario:**
> Andrew casts Commune with Lava, which exiles Kishla Village. Can they play it?
> Cards involved: [[Commune with Lava]], [[Kishla Village]].
> RulesGuru source: https://rulesguru.org/?28RGBwnIII1BTBmQGG

**Expected verdict:** Yes, but only if they has a land play remaining that turn. (701.18b)

**Required reasoning:**
- Match the RulesGuru cited answer for question 28.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [701.18b]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Casting spells, Lands, Evergreen keywords, Special actions.

## RG29. Alexzander controls a Rites of Flourishing and has played 2 lands this turn. They c...

**Scenario:**
> Alexzander controls a Rites of Flourishing and has played 2 lands this turn. They casts Flicker, targeting the Rites of Flourishing. After if resolves, can they play a 3rd land?
> Cards involved: [[Rites of Flourishing]], [[Flicker]].
> RulesGuru source: https://rulesguru.org/?29RGBwnIII27S4nQGG

**Expected verdict:** No. Alexzander has 1 land play this turn by default, which Rites of Flourishing increase to 2. Alexzander has already played 2 lands this turn, so no more lands can be played. (305.2a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 29.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [305.2a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Special actions, Lands, Static abilities.

## RG30. Anastasia controls Oracle of Mul Daya and has played 2 lands this turn. They casts...

**Scenario:**
> Anastasia controls Oracle of Mul Daya and has played 2 lands this turn. They casts Essence Flux, targeting the Oracle of Mul Daya. After it resolves, can they play a 3rd land?
> Cards involved: [[Oracle of Mul Daya]], [[Essence Flux]].
> RulesGuru source: https://rulesguru.org/?30RGBwnIII22yrQsGG

**Expected verdict:** No. Anastasia has 1 land play this turn by default, which Oracle of Mul Daya increase to 2. Anastasia has already played 2 lands this turn, so no more lands can be played. (305.2a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 30.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [305.2a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Special actions, Lands, Static abilities.

## RG31. Adriel controls Karador, Ghost Chieftain and has cast a spell with it this turn. Th...

**Scenario:**
> Adriel controls Karador, Ghost Chieftain and has cast a spell with it this turn. They casts Momentary Blink, targeting the Karador, Ghost Chieftain. After it resolves, can they cast another card from their graveyard?
> Cards involved: [[Karador, Ghost Chieftain]], [[Momentary Blink]].
> RulesGuru source: https://rulesguru.org/?31RGBwnIII1UArAkGG

**Expected verdict:** Yes. Karador, Ghost Chieftain's effect allows Adriel to cast one spell with that effect. If the Karador, Ghost Chieftain leaves the battlefield and then returns, it is a completely new object, generating a new effect. (400.7) That effect counts no cards cast with it yet this turn.

**Required reasoning:**
- Match the RulesGuru cited answer for question 31.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [400.7]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Casting spells, Static abilities, Zone-changes.

## RG32. Autumn controls a Hero of Bladehold, a Nobilis of War, and an Akroan Hoplite. They...

**Scenario:**
> Autumn controls a Hero of Bladehold, a Nobilis of War, and an Akroan Hoplite. They declares all 3 of them as attackers and no blockers are declared. What are the possible total amounts of damage that could be dealt to Nathaly?
> Cards involved: [[Hero of Bladehold]], [[Nobilis of War]], [[Akroan Hoplite]].
> RulesGuru source: https://rulesguru.org/?32RGBwnIIIhsElfJxTGG

**Expected verdict:** 24, 26, or 28. Since Autumn controls all the triggers, they can choose in which order to put them onto the stack. (603.3b) Hero of Bladehold's battle cry trigger will only give +1/+0 to the soldier tokens if they are on the battlefield at that time. (611.2c) Similarly, Akroan Hoplite will only count the tokens towards X if they are on the battlefield when the trigger resolves. (608.2h) The Nobilis of War's ability is not a triggered ability, and will apply to all attacking creatures, no matter when they entered the battlefield. (611.3a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 32.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [603.3b], [608.2h], [611.2c], [611.3a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Intermediate. Tags: Combat, Triggered abilities, The stack, Trivia, Numbers and symbols, Non-evergreen keywords.

## RG33. Augustine controls a Valakut, the Molten Pinnacle and 5 Mountains. They plays a 6th...

**Scenario:**
> Augustine controls a Valakut, the Molten Pinnacle and 5 Mountains. They plays a 6th Mountain and target Nathalie with Valakut, the Molten Pinnacle's trigger. In response, Nathalie activates Helldozer, targeting the Valakut, the Molten Pinnacle. Will they be dealt 3 damage?
> Cards involved: [[Valakut, the Molten Pinnacle]], [[Mountain]], [[Helldozer]].
> RulesGuru source: https://rulesguru.org/?33RGBwnIIIm0pFrjl7GG

**Expected verdict:** Yes. Removing the source of an ability on the stack does not affect that ability. (113.7a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 33.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [113.7a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Triggered abilities, Abilities, The stack, Resolving objects.

## RG34. Autumn controls a Valakut, the Molten Pinnacle and 5 Mountains. They plays a Blood...

**Scenario:**
> Autumn controls a Valakut, the Molten Pinnacle and 5 Mountains. They plays a Blood Crypt and targets Natalee with Valakut, the Molten Pinnacle's trigger. In response, Natalee activates their Memorial to War, targeting the Blood Crypt. Will they still be dealt 3 damage?
> Cards involved: [[Valakut, the Molten Pinnacle]], [[Mountain]], [[Blood Crypt]], [[Memorial to War]].
> RulesGuru source: https://rulesguru.org/?34RGBwnIII3u9DX2XooMUGG

**Expected verdict:** Yes. Removing the object that caused an ability to trigger does not affect that ability on the stack. Valakut, the Molten Pinnacle checks how many other cards with the "mountain" subtype are on the battlefield when the trigger resolves. (603.4) There are 5, so the damage will still be dealt.

**Required reasoning:**
- Match the RulesGuru cited answer for question 34.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [603.4]

**Why this test matters:** Imported RulesGuru benchmark. Level: 0. Complexity: Simple. Tags: Triggered abilities, Abilities, The stack, Resolving objects.

## RG35. Aisha controls Valakut, the Molten Pinnacle and five Mountains. They play Volatile...

**Scenario:**
> Aisha controls Valakut, the Molten Pinnacle and five Mountains. They play Volatile Fjord and target Niko with Valakut, the Molten Pinnacle's trigger. In response, Niko activates their Army Ants, targeting one of the five Mountain. Will they still be dealt 3 damage?
> Cards involved: [[Valakut, the Molten Pinnacle]], [[Mountain]], [[Volatile Fjord]], [[Army Ants]].
> RulesGuru source: https://rulesguru.org/?35RGBwnIII3u9DX3TvLWjGG

**Expected verdict:** No. Valakut, the Molten Pinnacle checks how many other cards with the "Mountain" subtype are on the battlefield when the trigger resolves. (603.4) There are only 4 others at that time, so the ability will be removed from the stack and will not resolve.

**Required reasoning:**
- Match the RulesGuru cited answer for question 35.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [603.4]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Triggered abilities, Abilities, The stack, Resolving objects.

## RG36. Nala controls a Darksteel Citadel enchanted with Tezzeret's Touch. Alijah casts a B...

**Scenario:**
> Nala controls a Darksteel Citadel enchanted with Tezzeret's Touch. Alijah casts a Blood Moon. Is Darksteel Citadel still a creature?
> Cards involved: [[Darksteel Citadel]], [[Tezzeret's Touch]], [[Blood Moon]].
> RulesGuru source: https://rulesguru.org/?36RGBwnIIIfJOr3lVDGG

**Expected verdict:** Yes. Blood Moon only removes all land subtypes and abilities from the Darksteel Citadel, replacing them with "mountain" and "{T}: Add {R}". It is still an artifact, and therefore Tezzeret's Touch makes it a creature.

**Required reasoning:**
- Match the RulesGuru cited answer for question 36.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Type-changing effects, Auras.

## RG37. Andy controls an Eidolon of Blossoms. They casts an Incriminating Impetus targeting...

**Scenario:**
> Andy controls an Eidolon of Blossoms. They casts an Incriminating Impetus targeting Nico's Southern Elephant. Does Andy draw a card?
> Cards involved: [[Eidolon of Blossoms]], [[Incriminating Impetus]], [[Southern Elephant]].
> RulesGuru source: https://rulesguru.org/?37RGBwnIIIgecd0XKqGG

**Expected verdict:** Yes. Auras are controlled by the player who cast them, regardless of what they're enchanting. (303.4e)

**Required reasoning:**
- Match the RulesGuru cited answer for question 37.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [303.4e]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Auras, Resolving objects.

## RG38. Natalee controls Norn's Annex. Aiden is at 7 life and controls Village Survivors an...

**Scenario:**
> Natalee controls Norn's Annex. Aiden is at 7 life and controls Village Survivors and Old Ghastbark. They declare both creatures as attackers, paying life for both. Do they have to tap the Old Ghastbark?
> Cards involved: [[Norn's Annex]], [[Village Survivors]], [[Old Ghastbark]].
> RulesGuru source: https://rulesguru.org/?38RGBwnIIIj67hb0NFGG

**Expected verdict:** Yes. As part of declaring attacks, Aiden first taps the chosen creatures. (508.1f) Costs to attack like that from Norn's Annex are paid afterwards. (508.1j)

**Required reasoning:**
- Match the RulesGuru cited answer for question 38.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [508.1f], [508.1j]

**Why this test matters:** Imported RulesGuru benchmark. Level: Corner Case. Complexity: Simple. Tags: Combat, Costs.

## RG39. Nadia controls Bramble Elemental. Aspen casts Treachery, targeting the Bramble Elem...

**Scenario:**
> Nadia controls Bramble Elemental. Aspen casts Treachery, targeting the Bramble Elemental. Who gets the tokens?
> Cards involved: [[Bramble Elemental]], [[Treachery]].
> RulesGuru source: https://rulesguru.org/?39RGBwnIII1yYTvNGG

**Expected verdict:** Aspen does. As soon as the Treachery enters the battlefield, Aspen controls the Bramble Elemental. (604.1) The triggered ability of Bramble Elemental checks immediately afterwards (603.10), at which point it is controlled by Aspen.

**Required reasoning:**
- Match the RulesGuru cited answer for question 39.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [603.10], [604.1]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Triggered abilities, Control-changing effects, Auras.

## RG40. Nevaeh controls an Eidolon of Blossoms. Augustus casts Steal Enchantment, targeting...

**Scenario:**
> Nevaeh controls an Eidolon of Blossoms. Augustus casts Steal Enchantment, targeting the Eidolon of Blossoms. Do they draw a card?
> Cards involved: [[Eidolon of Blossoms]], [[Steal Enchantment]].
> RulesGuru source: https://rulesguru.org/?40RGBwnIII1HMCXjGG

**Expected verdict:** Yes. As soon as the Steal Enchantment enters the battlefield, Augustus controls the Eidolon of Blossoms. (604.1) The triggered ability of Eidolon of Blossoms checks immediately afterwards (603.10), at which point it is controlled by Augustus.

**Required reasoning:**
- Match the RulesGuru cited answer for question 40.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [603.10], [604.1]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Triggered abilities, Auras, Control-changing effects.

## RG41. Ainsley controls Living Inferno. They activate it, targeting Natalie's Regathan Fir...

**Scenario:**
> Ainsley controls Living Inferno. They activate it, targeting Natalie's Regathan Firecat. In response, Natalie casts Downsize, targeting the Living Inferno. How much damage will be dealt to Regathan Firecat when the Living Inferno's ability resolves?
> Cards involved: [[Living Inferno]], [[Regathan Firecat]], [[Downsize]].
> RulesGuru source: https://rulesguru.org/?41RGBwnIIIikbck2v8GG

**Expected verdict:** 8. Since Living Inferno divides its damage among multiple targets, Ainsley announces the division while activating the ability. (601.2d) It won't change later, even if Living Inferno's power changes.

**Required reasoning:**
- Match the RulesGuru cited answer for question 41.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [601.2d]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Casting spells, Activated abilities, The stack, Abilities.

## RG43. Ansley controls Mikaeus, the Lunarch with 2 +1/+1 counters. Nixon casts Mikaeus, th...

**Scenario:**
> Ansley controls Mikaeus, the Lunarch with 2 +1/+1 counters. Nixon casts Mikaeus, the Lunarch with X=0. What happens when the second Mikaeus, the Lunarch enters the battlefield?
> Cards involved: [[Mikaeus, the Lunarch]].
> RulesGuru source: https://rulesguru.org/?43RGBwnIIIcq9GG

**Expected verdict:** Nixon's Mikaeus, the Lunarch will be put into the graveyard as a result of state-based actions, since it has 0 toughness. (704.5f) The legend rule does not apply, since the two Mikaeus, the Lunarchs are controlled by different players. (704.5j)

**Required reasoning:**
- Match the RulesGuru cited answer for question 43.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [704.5f], [704.5j]

**Why this test matters:** Imported RulesGuru benchmark. Level: 0. Complexity: Simple. Tags: State-based actions.

## RG44. Aniya controls a Lunarch Inquisitors that exiled an Elvish Ranger when it transform...

**Scenario:**
> Aniya controls a Lunarch Inquisitors that exiled an Elvish Ranger when it transformed. Nixon casts Moonmist. Does the Elvish Ranger return to the battlefield?
> Cards involved: [[Lunarch Inquisitors]], [[Elvish Ranger]], [[Moonmist]].
> RulesGuru source: https://rulesguru.org/?44RGBwnIIIioPDC4QHGG

**Expected verdict:** No. Whenever a card refers to itself by name, it just means "this object". (201.5) The exiled creature will return to the battlefield only when the permanent that was Lunarch Inquisitors leaves the battlefield, regardless of which face it was on at that time. (712.18)

**Required reasoning:**
- Match the RulesGuru cited answer for question 44.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [201.5], [712.18]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Double-faced cards, Card names, Non-evergreen keywords.

## RG45. Ariel controls a Withengar Unbound that they took control of from Ben using Traitor...

**Scenario:**
> Ariel controls a Withengar Unbound that they took control of from Ben using Traitorous Instinct. Ariel has 1 life. Cameron casts Thunderous Wrath targeting Ariel. After it resolves and Ariel loses the game, will Withengar Unbound get the +1/+1 counters?
> Cards involved: [[Withengar Unbound]], [[Traitorous Instinct]], [[Thunderous Wrath]].
> RulesGuru source: https://rulesguru.org/?45RGBwnIIImsU7MHyxGG

**Expected verdict:** No. As Ariel loses the game, the effect granting them control of Withengar Unbound ends, and it returns to Ben. (800.4a) "Loses the game" triggers use the game state immediately before they triggered to determine how that trigger is handled. (603.10, 603.10f) Since Ariel controlled Withengar Unbound right before losing the game, the trigger would be placed onto the stack under their control. However Ariel is no longer in the game when the trigger would be placed onto the stack, so it never is. (800.4d)

**Required reasoning:**
- Match the RulesGuru cited answer for question 45.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [603.10], [603.10f], [800.4a], [800.4d]

**Why this test matters:** Imported RulesGuru benchmark. Level: Corner Case. Complexity: Intermediate. Tags: Multiplayer, Triggered abilities, State-based actions, The stack, Abilities, Control-changing effects, Leaving the game.

## RG46. Alfred has 3 life. Blaine casts Chain Lightning, targeting Alfred. As it resolves,...

**Scenario:**
> Alfred has 3 life. Blaine casts Chain Lightning, targeting Alfred. As it resolves, Alfred pays the cost to copy it, and chooses to have the copy target Coraline. What happens?
> Cards involved: [[Chain Lightning]].
> RulesGuru source: https://rulesguru.org/?46RGBwnIIIa8WGG

**Expected verdict:** The copy is put onto the stack targeting Coraline. Then the original Chain Lightning finishes resolving and state-based actions are checked. (117.5) Alfred loses the game, and the copy of Chain Lightning is removed from the stack before it would resolve. (800.4a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 46.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [117.5], [800.4a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Multiplayer, Leaving the game, The stack, Resolving objects, State-based actions.

## RG47. Noa controls Leyline of the Void. Axel casts Hanabi Blast. Does it return to their...

**Scenario:**
> Noa controls Leyline of the Void. Axel casts Hanabi Blast. Does it return to their hand?
> Cards involved: [[Leyline of the Void]], [[Hanabi Blast]].
> RulesGuru source: https://rulesguru.org/?47RGBwnIII1WvojcGG

**Expected verdict:** Yes. Resolving spells do not leave the stack until they finish resolving. (608.2n) Returning the Hanabi Blast to its owner's hand is part of its resolution, so it is never put into exile.

**Required reasoning:**
- Match the RulesGuru cited answer for question 47.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [608.2n]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Resolving objects, Zone-changes, Replacement effects.

## RG48. Nova controls Rest in Peace. Ashley casts Redeem the Lost. As it resolves, Ashley w...

**Scenario:**
> Nova controls Rest in Peace. Ashley casts Redeem the Lost. As it resolves, Ashley wins the clash. Does Redeem the Lost return to their hand?
> Cards involved: [[Rest in Peace]], [[Redeem the Lost]].
> RulesGuru source: https://rulesguru.org/?48RGBwnIII27c1ebGG

**Expected verdict:** Yes. Resolving spells do not leave the stack until they finish resolving. (608.2n) Returning the Redeem the Lost to its owner's hand is part of its resolution, so it is never put into exile.

**Required reasoning:**
- Match the RulesGuru cited answer for question 48.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [608.2n]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Resolving objects, Zone-changes, Replacement effects, Non-evergreen keywords.

## RG49. Atticus controls Samurai of the Pale Curtain and a manifested Inner Struggle. They...

**Scenario:**
> Atticus controls Samurai of the Pale Curtain and a manifested Inner Struggle. They attack with the manifested Inner Struggle and Nico blocks with Regathan Firecat. What zone does the Inner Struggle move to?
> Cards involved: [[Samurai of the Pale Curtain]], [[Inner Struggle]], [[Regathan Firecat]].
> RulesGuru source: https://rulesguru.org/?49RGBwnIIIkf0mzvEHGG

**Expected verdict:** Exile. Samurai of the Pale Curtain's replacement effect applies to "permanents", which only exist on the battlefield. (110.1) Inner Struggle was a permanent on the battlefield, so the replacement effect will apply to it, regardless of what it might become once it's put into the graveyard.

**Required reasoning:**
- Match the RulesGuru cited answer for question 49.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [110.1]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Zone-changes, Replacement effects, Face-down objects.

## RG50. Axel controls Dryad Militant and a manifested Avacyn's Judgment. They attacks with...

**Scenario:**
> Axel controls Dryad Militant and a manifested Avacyn's Judgment. They attacks with the manifested Avacyn's Judgment and Nola blocks with Summit Prowler. What zone does the Avacyn's Judgment move to?
> Cards involved: [[Dryad Militant]], [[Avacyn's Judgment]], [[Summit Prowler]].
> RulesGuru source: https://rulesguru.org/?50RGBwnIIIg9y3LALBGG

**Expected verdict:** The graveyard. Replacement effects care about the game state immediately before the event in question. (614.4, 614.6) Right before the Avacyn's Judgment is destroyed, it's a creature, not an instant or sorcery.

**Required reasoning:**
- Match the RulesGuru cited answer for question 50.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [614.4], [614.6]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Zone-changes, Replacement effects, Face-down objects.

## RG51. Addyson attacks with a manifested Progenitus and Nico blocks with Primordial Wurm....

**Scenario:**
> Addyson attacks with a manifested Progenitus and Nico blocks with Primordial Wurm. After combat damage is dealt, what zone does the Progenitus move to?
> Cards involved: [[Progenitus]], [[Primordial Wurm]].
> RulesGuru source: https://rulesguru.org/?51RGBwnIII25161EGG

**Expected verdict:** The graveyard. Replacement effects must exist before the event they're modifying in order to apply to it. (614.4) Immediately before the Progenitus died it had no abilities, so the replacement effect didn't exist.

**Required reasoning:**
- Match the RulesGuru cited answer for question 51.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [614.4]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Zone-changes, Replacement effects, Face-down objects, Non-evergreen keywords.

## RG52. Anaya controls a manifested Nissa's Chosen. They attacks with the manifested Nissa'...

**Scenario:**
> Anaya controls a manifested Nissa's Chosen. They attacks with the manifested Nissa's Chosen and Nico blocks with a Carnage Tyrant. What zone does the Nissa's Chosen move to?
> Cards involved: [[Nissa's Chosen]], [[Carnage Tyrant]].
> RulesGuru source: https://rulesguru.org/?52RGBwnIII21xryBGG

**Expected verdict:** The graveyard. Replacement effects must exist before the event they're modifying in order to apply to it. (614.4) Immediately before the Nissa's Chosen died it had no abilities, and the replacement effect didn't exist.

**Required reasoning:**
- Match the RulesGuru cited answer for question 52.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [614.4]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Zone-changes, Replacement effects, Face-down objects.

## RG53. Avery casts Parch with its second mode, targeting Neymar's Sworn Guardian. In respo...

**Scenario:**
> Avery casts Parch with its second mode, targeting Neymar's Sworn Guardian. In response, Neymar casts Illusion, choosing red. What happens when Parch resolves?
> Cards involved: [[Parch]], [[Sworn Guardian]], [[Illusion]].
> RulesGuru source: https://rulesguru.org/?53RGBwnIIIjkQNyZuaGG

**Expected verdict:** The Sworn Guardian is now a mono-red permanent; it is no longer blue. (105.3) The game checks to see if its targets are still legal. (608.2b) Sworn Guardian is no longer a legal target for Parch, so it is removed from the stack and doesn't resolve.

**Required reasoning:**
- Match the RulesGuru cited answer for question 53.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [105.3], [608.2b]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Targets, Resolving objects, Color-changing effects.

## RG54. Autumn controls a Platinum Angel and has -1 life. Noelle has 4 life. Autumn casts P...

**Scenario:**
> Autumn controls a Platinum Angel and has -1 life. Noelle has 4 life. Autumn casts Pulse of the Forge targeting Noelle. What happens?
> Cards involved: [[Platinum Angel]], [[Pulse of the Forge]].
> RulesGuru source: https://rulesguru.org/?54RGBwnIII24mqu5GG

**Expected verdict:** Noelle goes to 0 life and Pulse of the Forge returns to Autumn's hand, since -1 is less than 0. When state-based actions are checked after the spell finishes resolving, Noelle loses the game. (704.3)

**Required reasoning:**
- Match the RulesGuru cited answer for question 54.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [704.3]

**Why this test matters:** Imported RulesGuru benchmark. Level: 0. Complexity: Simple. Tags: Resolving objects, Numbers and symbols, Leaving the game.

## RG55. Axton casts Stomping Slabs targeting Nico. As it resolves, they reveal 5 Mountains...

**Scenario:**
> Axton casts Stomping Slabs targeting Nico. As it resolves, they reveal 5 Mountains and 2 Stomping Slabs from the top of their library. How much damage is dealt to Nico?
> Cards involved: [[Stomping Slabs]], [[Mountain]].
> RulesGuru source: https://rulesguru.org/?55RGBwnIII2eF72DGG

**Expected verdict:** 7. A card named Stomping Slabs was revealed, so Stomping Slabs deals 7 damage to Nico. Nothing would cause it to deal any more damage based on how many Stomping Slabs are revealed.

**Required reasoning:**
- Match the RulesGuru cited answer for question 55.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: 0. Complexity: Simple. Tags: Resolving objects.

## RG56. Nico controls a Grothama, All-Devouring and a Sakashima the Impostor that entered t...

**Scenario:**
> Nico controls a Grothama, All-Devouring and a Sakashima the Impostor that entered the battlefield as a copy of the Grothama, All-Devouring. Alejandra casts Ovinize targeting the Grothama, All-Devouring, and then attacks with their Volunteer Militia. Which creatures can Alejandra choose to have the Volunteer Militia fight, if any?
> Cards involved: [[Grothama, All-Devouring]], [[Sakashima the Impostor]], [[Ovinize]], [[Volunteer Militia]].
> RulesGuru source: https://rulesguru.org/?56RGBwnIII2KFuq32M7mfGG

**Expected verdict:** Just the Sakashima the Impostor. Whenever an object refers to itself by name, it just means "this object". This includes an ability it grants to another object. (201.5a) The Grothama, All-Devouring has no abilities, so it's not granting any abilities to the Volunteer Militia.

**Required reasoning:**
- Match the RulesGuru cited answer for question 56.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [201.5a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Intermediate. Tags: Copy effects, Card names.

## RG57. Nico controls a Lazav, Dimir Mastermind that's currently a copy of Grothama, All-De...

**Scenario:**
> Nico controls a Lazav, Dimir Mastermind that's currently a copy of Grothama, All-Devouring. Alani attacks with Capital Guard. Can the Capital Guard fight Lazav, Dimir Mastermind?
> Cards involved: [[Lazav, Dimir Mastermind]], [[Grothama, All-Devouring]], [[Capital Guard]].
> RulesGuru source: https://rulesguru.org/?57RGBwnIIIidop6hg7GG

**Expected verdict:** Yes. Whenever an object refers to itself by name, it just means "this object". This includes an ability it grants to another object. (201.5a) Grothama, All-Devouring's ability doesn't target Lazav, Dimir Mastermind, so hexproof doesn't prevent the fight. (702.11b)

**Required reasoning:**
- Match the RulesGuru cited answer for question 57.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [201.5a], [702.11b]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Copy effects, Card names, Evergreen keywords, Targets.

## RG58. Autumn and Braelyn are playing in a multiplayer game. Braelyn has 1 life and contro...

**Scenario:**
> Autumn and Braelyn are playing in a multiplayer game. Braelyn has 1 life and controls a Lunarch Inquisitors that exiled Colin's Knight of New Benalia. Autumn casts Hornet Sting, targeting Braelyn. What happens to Knight of New Benalia as Braelyn loses the game?
> Cards involved: [[Lunarch Inquisitors]], [[Knight of New Benalia]], [[Hornet Sting]].
> RulesGuru source: https://rulesguru.org/?58RGBwnIIIioPQSby6GG

**Expected verdict:** All objects owned by Braelyn leave the game. (800.4a) Since the Lunarch Inquisitors left the battlefield, the Knight of New Benalia will return to the battlefield. (610.3)

**Required reasoning:**
- Match the RulesGuru cited answer for question 58.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [610.3], [800.4a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Leaving the game, Multiplayer, Zone-changes, Triggered abilities.

## RG59. Blaine has 1 life and controls a Fiend Hunter that exiled Crew's Tusked Colossodon....

**Scenario:**
> Blaine has 1 life and controls a Fiend Hunter that exiled Crew's Tusked Colossodon. Autumn casts Giant's Ire, targeting Blaine. What happens as Blaine loses the game?
> Cards involved: [[Fiend Hunter]], [[Tusked Colossodon]], [[Giant's Ire]].
> RulesGuru source: https://rulesguru.org/?59RGBwnIIIgAHQMEojGG

**Expected verdict:** All objects owned by Blaine leave the game. (800.4a) The Fiend Hunter's leaves-the-battlefield ability will trigger (603.10a), but cannot be placed onto the stack. (800.4d) The Tusked Colossodon will not return to the battlefield.

**Required reasoning:**
- Match the RulesGuru cited answer for question 59.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [603.10a], [800.4a], [800.4d]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Leaving the game, Multiplayer, Zone-changes, Triggered abilities.

## RG60. Baylor has 1 life and controls a phased-out Quarantine Field that exiled Camilla's...

**Scenario:**
> Baylor has 1 life and controls a phased-out Quarantine Field that exiled Camilla's Phyrexian Walker. Alfred casts Boros Charm, targeting Baylor. What happens as Baylor loses the game?
> Cards involved: [[Quarantine Field]], [[Phyrexian Walker]], [[Boros Charm]].
> RulesGuru source: https://rulesguru.org/?60RGBwnIIIjHcF4nW5GG

**Expected verdict:** All objects owned by Baylor leave the game. (800.4a, 702.26k) However the game treats phased-out permanents as nonexistent, and does not see the leaves-the-battlefield event happen. (702.26b) Phyrexian Walker will not return to the battlefield.

**Required reasoning:**
- Match the RulesGuru cited answer for question 60.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [702.26b], [702.26k], [800.4a]

**Why this test matters:** Imported RulesGuru benchmark. Level: Corner Case. Complexity: Simple. Tags: Leaving the game, Multiplayer, Zone-changes, Triggered abilities, Non-evergreen keywords.

## RG61. Brantlee has 1 life and controls a Pearled Unicorn. Casey controls an Extractor Dem...

**Scenario:**
> Brantlee has 1 life and controls a Pearled Unicorn. Casey controls an Extractor Demon. Arabella casts Tarfire, targeting Brantlee. Does the Extractor Demon trigger?
> Cards involved: [[Pearled Unicorn]], [[Extractor Demon]], [[Tarfire]].
> RulesGuru source: https://rulesguru.org/?61RGBwnIIIjmBoQLmBGG

**Expected verdict:** Yes. All objects owned by Brantlee leave the game. (800.4a) This does cause leaves-the-battlefield triggers to trigger. (603.6c)

**Required reasoning:**
- Match the RulesGuru cited answer for question 61.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [603.6c], [800.4a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Leaving the game, Multiplayer, Zone-changes, Triggered abilities.

## RG62. Noor controls a Dakmor Scorpion enchanted with a Felidar Umbra. Alan casts Annihila...

**Scenario:**
> Noor controls a Dakmor Scorpion enchanted with a Felidar Umbra. Alan casts Annihilating Fire, targeting Dakmor Scorpion. What happens?
> Cards involved: [[Dakmor Scorpion]], [[Felidar Umbra]], [[Annihilating Fire]].
> RulesGuru source: https://rulesguru.org/?62RGBwnIIIfFzfNQj3GG

**Expected verdict:** Felidar Umbra is destroyed and Dakmor Scorpion remains on the battlefield.

There are two replacement effects trying to apply to the same event. Umbra armor is attempting to replace the destruction of the creature (702.89a), while Annihilating Fire's effect is attempting to replace where the creature moves to. The "move to the graveyard" event is a part of the "destroy" event (701.8a), so the umbra armor replacement effect must apply first. (616.1g) Once that effect has been applied, the creature is no longer about to die, so there are no more effects to apply.

If the Dakmor Scorpion would die later in the turn, the Annihilating Fire's replacement effect will apply at that time and cause it to move to exile instead of the graveyard.

**Required reasoning:**
- Match the RulesGuru cited answer for question 62.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [616.1g], [701.8a], [702.89a]

**Why this test matters:** Imported RulesGuru benchmark. Level: Corner Case. Complexity: Simple. Tags: Replacement effects, Zone-changes, Non-evergreen keywords, Evergreen keywords.

## RG63. Anika has no cards in their library. They cast a Sunrise Seeker. As its enters-the-...

**Scenario:**
> Anika has no cards in their library. They cast a Sunrise Seeker. As its enters-the-battlefield trigger resolves, what happens?
> Cards involved: [[Sunrise Seeker]].
> RulesGuru source: https://rulesguru.org/?63RGBwnIIIeaCGG

**Expected verdict:** Anika can't reveal the top card of their library, so they put a +1/+1 counter on the Sunrise Seeker. (701.44) Players only lose the game due to trying to draw a card from an empty library, not from trying to take some other action with it (104.3c), so Anika does not lose the game.

**Required reasoning:**
- Match the RulesGuru cited answer for question 63.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [104.3c], [701.44]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Leaving the game, Non-evergreen keywords, Libraries.

## RG64. Addison has no cards in their library and controls a Keranos, God of Storms. What h...

**Scenario:**
> Addison has no cards in their library and controls a Keranos, God of Storms. What happens at the beginning of their draw step?
> Cards involved: [[Keranos, God of Storms]].
> RulesGuru source: https://rulesguru.org/?64RGBwnIIIc02GG

**Expected verdict:** Addison can't draw a card, so no card is revealed and neither trigger triggers. Addison loses the game before they would next get priority. (104.3c)

**Required reasoning:**
- Match the RulesGuru cited answer for question 64.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [104.3c]

**Why this test matters:** Imported RulesGuru benchmark. Level: 0. Complexity: Simple. Tags: Leaving the game, Libraries, Drawing a card.

## RG65. Alaia controls an Inventors' Fair, a Krark-Clan Ironworks, and two Metrognome. They...

**Scenario:**
> Alaia controls an Inventors' Fair, a Krark-Clan Ironworks, and two Metrognome. They want to activate the last ability of Inventors' Fair and sacrifice a Metrognome to help pay the cost. Is this legal?
> Cards involved: [[Inventors' Fair]], [[Krark-Clan Ironworks]], [[Metrognome]].
> RulesGuru source: https://rulesguru.org/?65RGBwnIIIhNfBVM2nGG

**Expected verdict:** Yes. The process for activating an ability is the same as the process for casting a spell. (602.2b) It must be legal to activate the ability in order to put it onto the stack. (601.2) Mana abilities are only activated after the legality of activating the original ability has been checked. (601.2g)

**Required reasoning:**
- Match the RulesGuru cited answer for question 65.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [601.2], [601.2g], [602.2b]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Activated abilities, Casting spells, The stack, Mana abilities.

## RG66. Asher controls Krark-Clan Ironworks, Mycosynth Lattice, and a Treachery that took c...

**Scenario:**
> Asher controls Krark-Clan Ironworks, Mycosynth Lattice, and a Treachery that took control of Scholar of Athreos from Nayeli. Asher begins activating the ability of Scholar of Athreos and sacrifices Treachery to help pay the cost. Is this legal? Who will control the ability?
> Cards involved: [[Krark-Clan Ironworks]], [[Mycosynth Lattice]], [[Treachery]], [[Scholar of Athreos]].
> RulesGuru source: https://rulesguru.org/?66RGBwnIII2THge8On3N6GG

**Expected verdict:** Yes, this is legal. Asher will control the ability. The process for activating an ability is the same as the process for casting a spell. (602.2b) The first step of activating an ability is to put it onto the stack. (601.2) Mana abilities are activated in a later step. (601.2g) The ability is already on the stack at this point (controlled by Asher), so it doesn't matter if the Scholar of Athreos changes controllers at this point.

**Required reasoning:**
- Match the RulesGuru cited answer for question 66.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [601.2], [601.2g], [602.2b]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Intermediate. Tags: Activated abilities, Casting spells, The stack, Control-changing effects, Mana abilities.

## RG67. Ashley controls a Krark-Clan Ironworks, a Mycosynth Lattice, and a Mind Control tha...

**Scenario:**
> Ashley controls a Krark-Clan Ironworks, a Mycosynth Lattice, and a Mind Control that took control of an Energizer from Noelle. Ashley begins activating the ability of Energizer and sacrifices Mind Control to help pay the cost. Is this legal? If so, who will control the ability?
> Cards involved: [[Krark-Clan Ironworks]], [[Mycosynth Lattice]], [[Mind Control]], [[Energizer]].
> RulesGuru source: https://rulesguru.org/?67RGBwnIII2THge8sX1hEGG

**Expected verdict:** Yes, this is legal, and Ashley will control the ability. The process for activating an ability is the same as the process for casting a spell. (602.2b) The first step of activating an ability is to put it onto the stack. (601.2) Mana abilities are activated in a later step. (601.2g) The ability is already on the stack at this point (controlled by Ashley), so the Energizer changing controllers won't change who controls the ability. After activating mana abilities, Ashley must pay the activation cost. (601.2h) {T} means "tap this permanent" (107.5), so Ashley can pay the cost regardless of who controls the Energizer at that time.

Legality is checked before mana abilities are activated (601.5, 601.2e), so it won't matter that Energizer gets summoning sickness when it changes controllers. (602.5a/302.6)

**Required reasoning:**
- Match the RulesGuru cited answer for question 67.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [107.5], [302.6], [601.2], [601.2e], [601.2g], [601.2h], [601.5], [602.2b], [602.5a]

**Why this test matters:** Imported RulesGuru benchmark. Level: Corner Case. Complexity: Intermediate. Tags: Activated abilities, Casting spells, The stack, Control-changing effects, Mana abilities, Numbers and symbols.

## RG68. Astrid casts a Charmed Griffin. As the trigger resolves, Nico chooses to put a Vena...

**Scenario:**
> Astrid casts a Charmed Griffin. As the trigger resolves, Nico chooses to put a Venarian Gold onto the battlefield, attached to the Charmed Griffin. What happens?
> Cards involved: [[Charmed Griffin]], [[Venarian Gold]].
> RulesGuru source: https://rulesguru.org/?68RGBwnIII1AV7F8GG

**Expected verdict:** The value of X as Nico cast Venarian Gold is undefined, so Nico puts no sleep counters on Charmed Griffin. (107.2) Nico will tap the Charmed Griffin, but it will untap normally during its controller's future untap steps.

**Required reasoning:**
- Match the RulesGuru cited answer for question 68.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [107.2]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Auras, Numbers and symbols.

## RG69. Autumn casts a Show and Tell. As it resolves, Autumn chooses to put a Merfolk Trade...

**Scenario:**
> Autumn casts a Show and Tell. As it resolves, Autumn chooses to put a Merfolk Traders onto the battlefield and Nathalie chooses to put a Treachery onto the battlefield enchanting Merfolk Traders. Who controls the enters-the-battlefield ability of Merfolk Traders?
> Cards involved: [[Show and Tell]], [[Merfolk Traders]], [[Treachery]].
> RulesGuru source: https://rulesguru.org/?69RGBwnIIIkAz50FZbGG

**Expected verdict:** This can't happen as described. Nathalie must choose a permanent that is already on the battlefield for the Treachery to enchant. (303.4f) They can't choose a permanent that is entering at the same time.

**Required reasoning:**
- Match the RulesGuru cited answer for question 69.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [303.4f]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Auras, Resolving objects, Zone-changes.

## RG70. Avery activates Nicol Bolas, the Ravager's ability while it's in their graveyard. W...

**Scenario:**
> Avery activates Nicol Bolas, the Ravager's ability while it's in their graveyard. Will it return to the battlefield transformed?
> Cards involved: [[Nicol Bolas, the Ravager]].
> RulesGuru source: https://rulesguru.org/?70RGBwnIIIcE0GG

**Expected verdict:** This can't happen as described. Nicol Bolas, the Ravager's ability can only be activated when it is on the battlefield. (113.6)

**Required reasoning:**
- Match the RulesGuru cited answer for question 70.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [113.6]

**Why this test matters:** Imported RulesGuru benchmark. Level: 0. Complexity: Simple. Tags: Abilities, Double-faced cards, Zone-changes.

## RG71. Nathanael controls an Alpine Moon naming Transguild Promenade. What happens when Am...

**Scenario:**
> Nathanael controls an Alpine Moon naming Transguild Promenade. What happens when Amy plays their Transguild Promenade?
> Cards involved: [[Alpine Moon]], [[Transguild Promenade]].
> RulesGuru source: https://rulesguru.org/?71RGBwnIII1uCA6uGG

**Expected verdict:** It enters the battlefield untapped, and its enters-the-battlefield trigger will not trigger.

"Transguild Promenade enters the battlefield tapped" is a replacement effect. (614.1d) Since the Transguild Promenade loses that ability, it enters the battlefield as though that replacement effect didn't exist. (614.12) 

"When Transguild Promenade enters the battlefield..." is a triggered ability. (113.3c) Enters-the-battlefield triggered abilities check their trigger conditions immediately after the permanent enters the battlefield. (603.10) Transguild Promenade does not have the ability at that time, so it does not trigger. (611.3c)

**Required reasoning:**
- Match the RulesGuru cited answer for question 71.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [113.3c], [603.10], [611.3c], [614.1d], [614.12]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Zone-changes, Replacement effects, Triggered abilities, Abilities, Continuous effects, Lands.

## RG72. Nikolas has cast a Gather Specimens earlier in the turn. Autumn controls a Heart of...

**Scenario:**
> Nikolas has cast a Gather Specimens earlier in the turn. Autumn controls a Heart of Kiran that is currently a creature due to its own ability, and casts a Sakashima the Impostor, choosing to have it copy Heart of Kiran. What happens?
> Cards involved: [[Gather Specimens]], [[Heart of Kiran]], [[Sakashima the Impostor]].
> RulesGuru source: https://rulesguru.org/?72RGBwnIIIgV3ayho4GG

**Expected verdict:** This can't happen as described. As Sakashima the Impostor begins to resolve, Nikolas gains control of it before any other choices are made. (616.1, 616.1b) Nikolas will make the choice of what to copy as it enters the battlefield.

**Required reasoning:**
- Match the RulesGuru cited answer for question 72.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [616.1], [616.1b]

**Why this test matters:** Imported RulesGuru benchmark. Level: Corner Case. Complexity: Simple. Tags: Copy effects, Replacement effects, Zone-changes, Resolving objects, Control-changing effects.

## RG73. Addison casts Skilled Animator and targets their True-Faith Censer with its trigger...

**Scenario:**
> Addison casts Skilled Animator and targets their True-Faith Censer with its trigger. After it resolves, Addison activates the equip ability of True-Faith Censer, targeting the True-Faith Censer. What happens?
> Cards involved: [[Skilled Animator]], [[True-Faith Censer]].
> RulesGuru source: https://rulesguru.org/?73RGBwnIII2bZgOnGG

**Expected verdict:** The ability resolves, but does not attach True-Faith Censer to itself since creatures can't be equipped to anything. (301.5c)

**Required reasoning:**
- Match the RulesGuru cited answer for question 73.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [301.5c]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Equipment, Type-changing effects.

## RG74. Autumn controls Humility and casts an Evil Twin. Can Autumn have it copy a creature...

**Scenario:**
> Autumn controls Humility and casts an Evil Twin. Can Autumn have it copy a creature as it enters the battlefield?
> Cards involved: [[Humility]], [[Evil Twin]].
> RulesGuru source: https://rulesguru.org/?74RGBwnIII1SlvEyGG

**Expected verdict:** No. The game takes into account continuous effects already on the battlefield when determining how a permanent enters the battlefield. (614.12)

**Required reasoning:**
- Match the RulesGuru cited answer for question 74.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [614.12]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Replacement effects, Zone-changes, Copy effects, Abilities, Static abilities, Continuous effects.

## RG75. Adriel controls Blood Sun and plays Jungle Basin. What happens?

**Scenario:**
> Adriel controls Blood Sun and plays Jungle Basin. What happens?
> Cards involved: [[Blood Sun]], [[Jungle Basin]].
> RulesGuru source: https://rulesguru.org/?75RGBwnIII1y9OvkGG

**Expected verdict:** Jungle Basin will enter the battlefield untapped. Its enters-the-battlefield trigger will not trigger.

"Jungle Basin enters the battlefield tapped" is a replacement effect. (614.1d) Since the Jungle Basin loses that ability, it enters the battlefield as though that replacement effect doesn't exist. (614.12) 

"When Jungle Basin enters the battlefield..." is a triggered ability. (113.3c) Enters-the-battlefield triggered abilities check their trigger conditions immediately after the permanent enters the battlefield. (603.10) Jungle Basin does not have the ability at that time, so it does not trigger. (611.3c)

**Required reasoning:**
- Match the RulesGuru cited answer for question 75.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [113.3c], [603.10], [611.3c], [614.1d], [614.12]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Zone-changes, Replacement effects, Lands, Triggered abilities, Abilities, Continuous effects.

## RG76. Atticus controls a Tree of Tales that has been animated with Skilled Animator's abi...

**Scenario:**
> Atticus controls a Tree of Tales that has been animated with Skilled Animator's ability. Nico plays an Alpine Moon naming Tree of Tales. After the Alpine Moon resolves, what characteristics does the Tree of Tales have?
> Cards involved: [[Tree of Tales]], [[Skilled Animator]], [[Alpine Moon]].
> RulesGuru source: https://rulesguru.org/?76RGBwnIIIlNFv8HbuGG

**Expected verdict:** It's a 5/5 artifact land creature named Tree of Tales with "{T}: Add one mana of any color." and no other abilities. Alpine Moon removes land subtypes (Tree of Tales has none) and abilities. It does not change any of its types or other characteristics. (205.1a) Tree of Tales is still a land because Skilled Animator doesn't remove its other types when making it an artifact creature. (205.1b)

**Required reasoning:**
- Match the RulesGuru cited answer for question 76.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [205.1a], [205.1b]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Type-changing effects, Abilities, Lands, Continuous effects.

## RG77. Alex controls an Isamaru, Hound of Konda. Nova controls a Scarwood Goblins. Alex ca...

**Scenario:**
> Alex controls an Isamaru, Hound of Konda. Nova controls a Scarwood Goblins. Alex casts Pit Fight, targeting the Isamaru, Hound of Konda and Scarwood Goblins. In response, Nova casts Searing Spear, targeting the Isamaru, Hound of Konda. What happens?
> Cards involved: [[Isamaru, Hound of Konda]], [[Scarwood Goblins]], [[Pit Fight]], [[Searing Spear]].
> RulesGuru source: https://rulesguru.org/?77RGBwnIII2PP9JzNVNEhGG

**Expected verdict:** The Searing Spear resolves, removing the Isamaru, Hound of Konda from the battlefield. Pit Fight resolves, but no damage is dealt to the Scarwood Goblins. (608.2b, 701.14b)

**Required reasoning:**
- Match the RulesGuru cited answer for question 77.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [608.2b], [701.14b]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Evergreen keywords, Resolving objects, Targets, The stack, Last known information, Damage.

## RG78. Andre attacks with a Skaab Goliath and Nico blocks with an Elite Inquisitor. How ca...

**Scenario:**
> Andre attacks with a Skaab Goliath and Nico blocks with an Elite Inquisitor. How can Andre assign combat damage?
> Cards involved: [[Skaab Goliath]], [[Elite Inquisitor]].
> RulesGuru source: https://rulesguru.org/?78RGBwnIII2bUUWKGG

**Expected verdict:** Andre must assign at least lethal damage to the Elite Inquisitor, so at least 2. They may assign more if they want. The remaining damage will be dealt to Nico. (702.19b) Protection prevents the damage from being dealt (so Elite Inquisitor won't die), but it doesn't affect how damage is assigned. (702.16e)

**Required reasoning:**
- Match the RulesGuru cited answer for question 78.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [702.16e], [702.19b]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Evergreen keywords, Combat, Damage.

## RG79. Adalyn controls Norwood Ranger, a token copy of Norwood Ranger produced by Spitting...

**Scenario:**
> Adalyn controls Norwood Ranger, a token copy of Norwood Ranger produced by Spitting Image, a 1/1 Saproling token created by Flash Foliage, Lone Wolf of the Natterknolls, and a token copy of Lone Wolf of the Natterknolls produced by Saheeli's Artistry. Noel casts Ratchet Bomb and activates its second ability. As Ratchet Bomb's ability resolves, what is destroyed?
> Cards involved: [[Norwood Ranger]], [[Spitting Image]], [[Flash Foliage]], [[Lone Wolf of the Natterknolls]], [[Saheeli's Artistry]], [[Ratchet Bomb]].
> RulesGuru source: https://rulesguru.org/?79RGBwnIII4y7j0W5g4eNSqhEXGG

**Expected verdict:** The Saproling token and the token copy of Lone Wolf of the Natterknolls. Copy effects copy mana cost (707.2), so the token Norwood Ranger doesn't have a mana value of 0. Tokens that are created by an effect that sets their characteristics only have those characteristics. The Saproling token has no mana cost, so its mana value is 0. The mana value of transformed transforming double-faced cards is determined by their front face (712.8e), so the Lone Wolf of the Natterknolls isn't destroyed. Copies of double-faced cards have a mana value of 0. (712.8e)

**Required reasoning:**
- Match the RulesGuru cited answer for question 79.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [707.2], [712.8e]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Intermediate. Tags: Tokens, Double-faced cards, Copy effects, Miscellaneous.

## RG80. Nathaly controls an Everlasting Torment. Ashley casts Invigorate for its alternativ...

**Scenario:**
> Nathaly controls an Everlasting Torment. Ashley casts Invigorate for its alternative cost, targeting their Fomori Nomad. What happens?
> Cards involved: [[Everlasting Torment]], [[Invigorate]], [[Fomori Nomad]].
> RulesGuru source: https://rulesguru.org/?80RGBwnIIIgql9dLs5GG

**Expected verdict:** This can't happen as described. Nathaly can't gain life, so Ashley can't pay the alternative cost of Invigorate. (118.3)

**Required reasoning:**
- Match the RulesGuru cited answer for question 80.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [118.3]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Costs, Life, "Can't" effects, Static abilities, Replacement effects.

## RG81. Nico controls a Sulfuric Vortex. Asa casts Invigorate for its alternative cost, tar...

**Scenario:**
> Nico controls a Sulfuric Vortex. Asa casts Invigorate for its alternative cost, targeting their Wild Jhovall. What happens?
> Cards involved: [[Sulfuric Vortex]], [[Invigorate]], [[Wild Jhovall]].
> RulesGuru source: https://rulesguru.org/?81RGBwnIIIlfDP1TmPGG

**Expected verdict:** Nico gains no life, but the Invigorate is still cast successfully. (118.11)

**Required reasoning:**
- Match the RulesGuru cited answer for question 81.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [118.11]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Costs, Life, "Can't" effects, Static abilities, Replacement effects.

## RG82. Alvin controls Walking Ballista with 1 +1/+1 counter. It also has lifelink due to a...

**Scenario:**
> Alvin controls Walking Ballista with 1 +1/+1 counter. It also has lifelink due to a Basilisk Collar. Alvin activates its ability to deal 1 damage to Nova. Does Alvin gain 1 life?
> Cards involved: [[Walking Ballista]], [[Basilisk Collar]].
> RulesGuru source: https://rulesguru.org/?82RGBwnIII2lqi50GG

**Expected verdict:** Yes. As the ability resolves, the game uses the last known information about the creature as it existed on the battlefield to determine how it deals damage. (113.7a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 82.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [113.7a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Life, Last known information, Resolving objects, Evergreen keywords, Damage.

## RG83. Alvin controls Welding Jar enchanted by Nathalia's Curse Artifact. In response to t...

**Scenario:**
> Alvin controls Welding Jar enchanted by Nathalia's Curse Artifact. In response to the trigger during Alvin's upkeep, Alvin casts Smash to Smithereens to destroy the Welding Jar. What happens as the trigger resolves?
> Cards involved: [[Welding Jar]], [[Curse Artifact]], [[Smash to Smithereens]].
> RulesGuru source: https://rulesguru.org/?83RGBwnIIImlUXO208GG

**Expected verdict:** Alvin is dealt 2 damage. Even though the Curse Artifact is put into the graveyard, the trigger will still resolve. (113.7a) Sacrificing the Welding Jar is a cost. (118.12, 118.12a) If the cost isn't paid, the default action of dealing 2 damage to Alvin happens.

**Required reasoning:**
- Match the RulesGuru cited answer for question 83.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [113.7a], [118.12], [118.12a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Resolving objects, Costs, Zone-changes.

## RG84. Autumn controls a Welding Jar enchanted by Nevaeh's Curse Artifact. In response to...

**Scenario:**
> Autumn controls a Welding Jar enchanted by Nevaeh's Curse Artifact. In response to the trigger during Autumn's upkeep, Nevaeh casts Word of Seizing to take control of the Welding Jar. What happens as the trigger resolves?
> Cards involved: [[Welding Jar]], [[Curse Artifact]], [[Word of Seizing]].
> RulesGuru source: https://rulesguru.org/?84RGBwnIIImlUXO37oGG

**Expected verdict:** Autumn is dealt 2 damage. Sacrificing the Welding Jar is a cost. (118.12, 118.12a) If the cost isn't paid, the default action of dealing 2 damage to Autumn happens. Autumn cannot sacrifice a permanent that they don't control. (701.21a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 84.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [118.12], [118.12a], [701.21a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Resolving objects, Costs, Control-changing effects, Auras.

## RG85. Ashley controls a Phyrexian Grimoire enchanted by Neymar's Curse Artifact. In respo...

**Scenario:**
> Ashley controls a Phyrexian Grimoire enchanted by Neymar's Curse Artifact. In response to the trigger during Ashley's upkeep, they cast Aura Graft to attach the Curse Artifact to Sunglasses of Urza. Which artifact does Ashley have the choice to sacrifice as the trigger resolves?
> Cards involved: [[Phyrexian Grimoire]], [[Curse Artifact]], [[Aura Graft]], [[Sunglasses of Urza]].
> RulesGuru source: https://rulesguru.org/?85RGBwnIII366iNPNn18xGG

**Expected verdict:** Phyrexian Grimoire. The "that artifact" that the trigger on the stack refers to is the one that Curse Artifact was attached to as the ability triggered.

**Required reasoning:**
- Match the RulesGuru cited answer for question 85.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Resolving objects, Control-changing effects, Auras.

## RG86. Adonis attacks Natalee with a Kederekt Creeper, which is their only creature. Natal...

**Scenario:**
> Adonis attacks Natalee with a Kederekt Creeper, which is their only creature. Natalee blocks with their Harrier Naga and Muck Rats. Will both blockers die, or just one? If there's a choice, who makes it, and when?
> Cards involved: [[Kederekt Creeper]], [[Harrier Naga]], [[Muck Rats]].
> RulesGuru source: https://rulesguru.org/?86RGBwnIIIhZZWhAL4GG

**Expected verdict:** Adonis can choose to have either blocking creature die, or to have both of them die. They make this choice as damage is assigned in the combat damage step. (510.1c, 702.2c)

**Required reasoning:**
- Match the RulesGuru cited answer for question 86.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [510.1c], [702.2c]

**Why this test matters:** Imported RulesGuru benchmark. Level: 0. Complexity: Simple. Tags: Combat, Damage, Turn structure, Evergreen keywords.

## RG87. Ashley controls Iroas, God of Victory and 3 other enchantments. Their devotion to w...

**Scenario:**
> Ashley controls Iroas, God of Victory and 3 other enchantments. Their devotion to white is 2. They cast Starfield of Nyx. After it resolves, is Iroas, God of Victory a creature? If so, what are its power and toughness?
> Cards involved: [[Iroas, God of Victory]], [[Starfield of Nyx]].
> RulesGuru source: https://rulesguru.org/?87RGBwnIII1TD0NDGG

**Expected verdict:** Iroas, God of Victory is a creature with power and toughness equal to its mana value.

In the type layer, there are 2 effects that impact Iroas, God of Victory's type. (613.1d) They are applied in timestamp order (613.7), so first Iroas, God of Victory's effect causes Iroas, God of Victory to not be a creature, then Starfield of Nyx's ability causes Iroas, God of Victory to become a creature.

In the power/toughness setting layer, Starfield of Nyx's effect sets Iroas, God of Victory's power and toughness equal to its mana value. (613.4b)

**Required reasoning:**
- Match the RulesGuru cited answer for question 87.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [613.1d], [613.4b], [613.7]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Layers, Continuous effects, Type-changing effects, Dependency.

## RG89. Adalynn has 10 life and casts Madcap Experiment. The twelfth card revealed is a Pla...

**Scenario:**
> Adalynn has 10 life and casts Madcap Experiment. The twelfth card revealed is a Platinum Emperion. Does Adalynn lose the game?
> Cards involved: [[Madcap Experiment]], [[Platinum Emperion]].
> RulesGuru source: https://rulesguru.org/?89RGBwnIII1XyaK1GG

**Expected verdict:** No. Madcap Experiment deals the damage after putting the artifact onto the battlefield. (608.2c) Adalynn's life total can't change, so it stays at 10.

**Required reasoning:**
- Match the RulesGuru cited answer for question 89.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [608.2c]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Resolving objects, Damage, Life, Static abilities, Continuous effects.

## RG90. Nico controls Platinum Emperion. Alivia attacks with Champion of Arashin, which Nic...

**Scenario:**
> Nico controls Platinum Emperion. Alivia attacks with Champion of Arashin, which Nico doesn't block. Does Alivia gain life?
> Cards involved: [[Platinum Emperion]], [[Champion of Arashin]].
> RulesGuru source: https://rulesguru.org/?90RGBwnIII24mwZgGG

**Expected verdict:** Yes. Damage can have 0 or more results. (120.3) Normally a creature with lifelink dealing damage to a player would have two results:

* Its controller gains that much life. (702.15b)
* The recipient of the damage loses that much life.

Platinum Emperion makes the second result impossible, so only the first occurs. (101.3)

**Required reasoning:**
- Match the RulesGuru cited answer for question 90.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [101.3], [120.3], [702.15b]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Damage, Life, Evergreen keywords.

## RG91. Nelson controls a 1/1 Thopter token. Ashlynn targets the token with Release the Gre...

**Scenario:**
> Nelson controls a 1/1 Thopter token. Ashlynn targets the token with Release the Gremlins (X=1). In response, Nelson casts Verdigris targeting the token. Does Ashlynn create a gremlin token?
> Cards involved: [[Release the Gremlins]], [[Verdigris]].
> RulesGuru source: https://rulesguru.org/?91RGBwnIII26TF94GG

**Expected verdict:** No. A targeted spell is countered upon resolution if all of its targets are illegal. (608.2b)

**Required reasoning:**
- Match the RulesGuru cited answer for question 91.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [608.2b]

**Why this test matters:** Imported RulesGuru benchmark. Level: 0. Complexity: Simple. Tags: Targets, Resolving objects.

## RG92. Ainsley casts Unlicensed Disintegration, targeting their Bronze Sable, which is the...

**Scenario:**
> Ainsley casts Unlicensed Disintegration, targeting their Bronze Sable, which is their only artifact. Is Ainsley dealt any damage?
> Cards involved: [[Unlicensed Disintegration]], [[Bronze Sable]].
> RulesGuru source: https://rulesguru.org/?92RGBwnIII2jzYAZGG

**Expected verdict:** No. The instructions of a resolving spell are carried out in the order written. (608.2c) The Bronze Sable has been destroyed by the time Unlicensed Disintegration checks to see if Ainsley controls an artifact.

**Required reasoning:**
- Match the RulesGuru cited answer for question 92.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [608.2c]

**Why this test matters:** Imported RulesGuru benchmark. Level: 0. Complexity: Simple. Tags: Resolving objects.

## RG93. Allan casts Sram's Expertise. As it resolves, they would like tap the tokens it cre...

**Scenario:**
> Allan casts Sram's Expertise. As it resolves, they would like tap the tokens it created to cast Collective Effort escalated twice. Can they?
> Cards involved: [[Sram's Expertise]], [[Collective Effort]].
> RulesGuru source: https://rulesguru.org/?93RGBwnIII2ebT6JGG

**Expected verdict:** Yes. The instructions of a resolving spell are carried out in the order written (608.2c), so the tokens will be on the battlefield at that time. Tapping creatures for escalate is an additional cost. ([702.120a]) Allan may still pay an additional cost for Collective Effort while casting it for the alternative cost given to it by Sram's Expertise. (118.9d)

**Required reasoning:**
- Match the RulesGuru cited answer for question 93.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [118.9d], [608.2c], [702.120a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 0. Complexity: Simple. Tags: Resolving objects, Casting spells, Costs, Non-evergreen keywords.

## RG94. Alivia casts Sram's Expertise. As it resolves, they would like sacrifice one of the...

**Scenario:**
> Alivia casts Sram's Expertise. As it resolves, they would like sacrifice one of the tokens it created to cast Bone Splinters. Can they?
> Cards involved: [[Sram's Expertise]], [[Bone Splinters]].
> RulesGuru source: https://rulesguru.org/?94RGBwnIII2ebSMhGG

**Expected verdict:** Yes. The instructions of a resolving spell are carried out in the order written (608.2c), so the tokens will be on the battlefield at that time. Alivia may still pay an additional cost for Bone Splinters while casting it for the alternative cost given to it by Sram's Expertise. (118.9d)

**Required reasoning:**
- Match the RulesGuru cited answer for question 94.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [118.9d], [608.2c]

**Why this test matters:** Imported RulesGuru benchmark. Level: 0. Complexity: Simple. Tags: Resolving objects, Casting spells, Costs.

## RG95. Aspen owns a Vigor in exile as well as a Yixlid Jailer on the battlefield. Nelson p...

**Scenario:**
> Aspen owns a Vigor in exile as well as a Yixlid Jailer on the battlefield. Nelson puts the Vigor into the graveyard with Mind Raker's ability. Does Vigor trigger?
> Cards involved: [[Vigor]], [[Yixlid Jailer]], [[Mind Raker]].
> RulesGuru source: https://rulesguru.org/?95RGBwnIIIm7uASKXZGG

**Expected verdict:** No. Triggered abilities are checked to see if they trigger immediately after the event occurs. (603.10) Vigor does not have any abilities at that time.

**Required reasoning:**
- Match the RulesGuru cited answer for question 95.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [603.10]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Triggered abilities, Zone-changes, Continuous effects.

## RG96. Nevaeh controls Tarmogoyf and has a creature and sorcery in their graveyard. Aron c...

**Scenario:**
> Nevaeh controls Tarmogoyf and has a creature and sorcery in their graveyard. Aron casts Burn the Impure targeting Tarmogoyf. Does it die?
> Cards involved: [[Tarmogoyf]], [[Burn the Impure]].
> RulesGuru source: https://rulesguru.org/?96RGBwnIII2gkSVTGG

**Expected verdict:** No. As Burn the Impure resolves, it first deals 3 damage to Tarmogoyf, then Burn the Impure is put into the graveyard and Tarmogoyf becomes a 3/4. (608.2n, 611.3a) Creatures only die due to having lethal damage marked on them when state-based actions are checked (120.5/302.7/704.5g), which doesn't happen until after Burn the Impure has finished resolving. (117.5/405.6f/704.3)

**Required reasoning:**
- Match the RulesGuru cited answer for question 96.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [117.5], [120.5], [302.7], [405.6f], [608.2n], [611.3a], [704.3], [704.5g]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Zone-changes, Resolving objects, Damage, State-based actions, Timing and priority, Abilities, Static abilities, Continuous effects.

## RG97. Anya activates Inkmoth Nexus to turn it into a creature and attacks Niko with it. N...

**Scenario:**
> Anya activates Inkmoth Nexus to turn it into a creature and attacks Niko with it. Niko doesn't block it and then casts Summoning Trap, putting Melira, Sylvok Outcast onto the battlefield. What happens during the combat damage step?
> Cards involved: [[Inkmoth Nexus]], [[Summoning Trap]], [[Melira, Sylvok Outcast]].
> RulesGuru source: https://rulesguru.org/?97RGBwnIIIhKVNiP9rGG

**Expected verdict:** Inkmoth Nexus's ability gives it infect, and Melira, Sylvok Outcast's effect makes it lose infect. The effects are applied in timestamp order (613.3), so Inkmoth Nexus does not have infect. Niko will lose 1 life when damage is dealt.

(There is no dependency here because neither effect changes the text or the existence of the other, what it applies to, or what it does to any of the things it applies to. (613.8a))

**Required reasoning:**
- Match the RulesGuru cited answer for question 97.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [613.3], [613.8a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Layers, Damage.

## RG98. Noah controls a Melira, Sylvok Outcast. Avery activates Inkmoth Nexus to turn it in...

**Scenario:**
> Noah controls a Melira, Sylvok Outcast. Avery activates Inkmoth Nexus to turn it into a creature and attacks Noah with it. Noah doesn't block. What happens during the combat damage step?
> Cards involved: [[Melira, Sylvok Outcast]], [[Inkmoth Nexus]].
> RulesGuru source: https://rulesguru.org/?98RGBwnIII1YEoC8GG

**Expected verdict:** Melira, Sylvok Outcast's effect makes Inkmoth Nexus lose infect and Inkmoth Nexus's ability gives it infect. The effects are applied in timestamp order (613.3), so Inkmoth Nexus has infect. When damage is dealt, Noah can't get a poison counter, so nothing happens. (101.3)

**Required reasoning:**
- Match the RulesGuru cited answer for question 98.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [101.3], [613.3]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Layers, Damage, Non-evergreen keywords.

## RG99. Nico controls a Burrenton Forge-Tender. Alaina casts a Glitterfang. In response, Ni...

**Scenario:**
> Nico controls a Burrenton Forge-Tender. Alaina casts a Glitterfang. In response, Nico sacrifices Burrenton Forge-Tender, choosing the Glitterfang as the source.  When Alaina attacks with the Glitterfang that turn, will it deal damage?
> Cards involved: [[Burrenton Forge-Tender]], [[Glitterfang]].
> RulesGuru source: https://rulesguru.org/?99RGBwnIII1zy5JBGG

**Expected verdict:** No. Effects that apply to damage from a spell on the stack will continue to apply to damage from the permanent that spell becomes. (400.7c)

**Required reasoning:**
- Match the RulesGuru cited answer for question 99.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [400.7c]

**Why this test matters:** Imported RulesGuru benchmark. Level: Corner Case. Complexity: Simple. Tags: Damage, Zone-changes, Continuous effects, Replacement effects, Prevention effects.

## RG100. Allison casts a Goblin Chieftain. In response, Nico casts Hallow, targeting the Gob...

**Scenario:**
> Allison casts a Goblin Chieftain. In response, Nico casts Hallow, targeting the Goblin Chieftain. When Allison attacks with the Goblin Chieftain that turn, will the damage be prevented?
> Cards involved: [[Goblin Chieftain]], [[Hallow]].
> RulesGuru source: https://rulesguru.org/?100RGBwnIII1O8uWMGG

**Expected verdict:** Yes. Effects that apply to damage from a spell on the stack continue to apply to damage from the permanent that spell becomes. (400.7c)

**Required reasoning:**
- Match the RulesGuru cited answer for question 100.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [400.7c]

**Why this test matters:** Imported RulesGuru benchmark. Level: Corner Case. Complexity: Simple. Tags: Damage, Zone-changes, Continuous effects, Prevention effects.

## RG101. Armando casts Chalice of the Void with X = 3. Can Nico counter it with Liquify?

**Scenario:**
> Armando casts Chalice of the Void with X = 3. Can Nico counter it with Liquify?
> Cards involved: [[Chalice of the Void]], [[Liquify]].
> RulesGuru source: https://rulesguru.org/?101RGBwnIII1AAQxEGG

**Expected verdict:** No. The mana value of a spell is determined by adding together the symbols in the upper right corner of the card. (202.3, 202.3d) The mana value of Chalice of the Void on the stack is 6.

**Required reasoning:**
- Match the RulesGuru cited answer for question 101.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [202.3], [202.3d]

**Why this test matters:** Imported RulesGuru benchmark. Level: 0. Complexity: Simple. Tags: Casting spells, Numbers and symbols.

## RG102. Alex and Nixon each control a Death's Shadow. Alex has 6 life and Nixon has 9. Alex...

**Scenario:**
> Alex and Nixon each control a Death's Shadow. Alex has 6 life and Nixon has 9. Alex attacks with their Death's Shadow, and Nixon blocks it with theirs. Alex casts Temur Battle Rage targeting their Death's Shadow. If Nixon is dealt as much damage as possible during combat, what is their resulting life total?
> Cards involved: [[Death's Shadow]], [[Temur Battle Rage]].
> RulesGuru source: https://rulesguru.org/?102RGBwnIII1E5z34GG

**Expected verdict:** 1. In the first combat damage step, Alex can assign 6 damage to Nixon's Death's Shadow and 1 damage to Nixon. (702.19b) Nixon's Death's Shadow will die before the second combat damage step (510.3, 704.3, 510.4), at which point Nixon will be dealt another 7 damage. (702.19d)

Assigning any other amount of damage to Death's Shadow in the first combat damage step would result in less total damage dealt to Nixon. In particular, assigning any less than 6 damage to Nixon's Death's Shadow in the first combat damage step will result in it surviving and being able to block more damage in the second combat damage step.

**Required reasoning:**
- Match the RulesGuru cited answer for question 102.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [510.3], [510.4], [702.19b], [702.19d], [704.3]

**Why this test matters:** Imported RulesGuru benchmark. Level: 0. Complexity: Intermediate. Tags: Turn structure, Damage, Evergreen keywords, Life, Combat.

## RG103. Annalee controls Painter's Servant naming "blue" and Sword of Body and Mind. What h...

**Scenario:**
> Annalee controls Painter's Servant naming "blue" and Sword of Body and Mind. What happens if Annalee tries to equip Painter's Servant with Sword of Body and Mind?
> Cards involved: [[Painter's Servant]], [[Sword of Body and Mind]].
> RulesGuru source: https://rulesguru.org/?103RGBwnIII236N9KGG

**Expected verdict:** It becomes equipped and then becomes unequipped. Nothing prevents the Sword of Body and Mind from becoming attached to Painter's Servant. Once Sword of Body and Mind is attached to the Painter's Servant, it has protection from blue, and so can't be equipped by anything blue. (702.16d) It becomes unattached as a state-based action. (704.5n)

**Required reasoning:**
- Match the RulesGuru cited answer for question 103.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [702.16d], [704.5n]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Equipment, Continuous effects, Evergreen keywords, Color-changing effects, State-based actions.

## RG104. Alberto controls Painter's Servant naming "blue" and Sword of Body and Mind. Natali...

**Scenario:**
> Alberto controls Painter's Servant naming "blue" and Sword of Body and Mind. Natalia casts Turn targeting the Painter's Servant. After it resolves, what happens if Alberto tries to equip Painter's Servant with Sword of Body and Mind?
> Cards involved: [[Painter's Servant]], [[Sword of Body and Mind]], [[Turn]].
> RulesGuru source: https://rulesguru.org/?104RGBwnIIIjj6aj8PSGG

**Expected verdict:** It becomes equipped and then becomes unequipped.

Turn makes Painter's Servant lose all abilities, but this happens after color-changing effects have applied, so all cards are still blue. (613.1) Nothing prevents the Sword of Body and Mind from becoming attached to Painter's Servant. Once Sword of Body and Mind is equipped to the Painter's Servant, it has protection from blue (the effect removing its abilities is applied before the effect giving it protection from blue (613.3), and so can't be equipped by anything blue. (702.16d) It becomes unattached as a state-based action. (704.5n)

**Required reasoning:**
- Match the RulesGuru cited answer for question 104.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [613.1], [613.3], [702.16d], [704.5n]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Intermediate. Tags: Equipment, Continuous effects, Evergreen keywords, Color-changing effects, State-based actions, Layers.

## RG105. Allen casts Kolaghan's Command targeting Allen's Omega Myr with the last 2 modes. I...

**Scenario:**
> Allen casts Kolaghan's Command targeting Allen's Omega Myr with the last 2 modes. In response, Natalee sacrifices their Goblin Chirurgeon to activate its ability, targeting the Omega Myr. Does the Omega Myr die?
> Cards involved: [[Kolaghan's Command]], [[Omega Myr]], [[Goblin Chirurgeon]].
> RulesGuru source: https://rulesguru.org/?105RGBwnIIIi6rA4pqQGG

**Expected verdict:** Yes. The Kolaghan's Command's instructions are carried out in the order that they are written. (608.2c) When it attempts to destroy the Omega Myr, it is regenerated. (701.19a/614.8) Then it is dealt 2 damage, and dies when state-based actions are checked. (704.5g) The regeneration shield no longer exists at this time.

**Required reasoning:**
- Match the RulesGuru cited answer for question 105.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [608.2c], [614.8], [701.19a], [704.5g]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Evergreen keywords, Resolving objects, Replacement effects, Damage.

## RG108. Augustus has no cards in hand and casts Twinstrike, targeting Nico's two Swans of B...

**Scenario:**
> Augustus has no cards in hand and casts Twinstrike, targeting Nico's two Swans of Bryn Argoll. What happens?
> Cards involved: [[Twinstrike]], [[Swans of Bryn Argoll]].
> RulesGuru source: https://rulesguru.org/?108RGBwnIII2j9T15GG

**Expected verdict:** Swans of Bryn Argoll is destroyed and Augustus draws no cards. Twinstrike's replacement effect is a self-replacement effect (614.15), so it applies before Swans of Bryn Argoll's effect. (616.1a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 108.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [614.15], [616.1a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Damage, Resolving objects, Replacement effects.

## RG109. Nataly controls a Silent Hallcreeper enchanted by Boar Umbra. Alex casts Multani's...

**Scenario:**
> Nataly controls a Silent Hallcreeper enchanted by Boar Umbra. Alex casts Multani's Decree. How much life do they gain?
> Cards involved: [[Silent Hallcreeper]], [[Boar Umbra]], [[Multani's Decree]].
> RulesGuru source: https://rulesguru.org/?109RGBwnIIIrj78vwimGG

**Expected verdict:** Two. There are two different instances of "destroy Boar Umbra" attempting to occur (702.89a), so Alex chooses one of them. (400.6) Only that one takes place, and only one permanent is destroyed.

**Required reasoning:**
- Match the RulesGuru cited answer for question 109.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [400.6], [702.89a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Zone-changes, Non-evergreen keywords, Replacement effects, Auras, Evergreen keywords, Resolving objects.

## RG110. Nadia controls a Wicker Witch enchanted by Eel Umbra. Avery casts Overwhelming Forc...

**Scenario:**
> Nadia controls a Wicker Witch enchanted by Eel Umbra. Avery casts Overwhelming Forces. How many cards does Avery draw?
> Cards involved: [[Wicker Witch]], [[Eel Umbra]], [[Overwhelming Forces]].
> RulesGuru source: https://rulesguru.org/?110RGBwnIIImogFi8hxGG

**Expected verdict:** None. No creatures were destroyed, only an enchantment. (702.89a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 110.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [702.89a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 0. Complexity: Simple. Tags: Zone-changes, Non-evergreen keywords, Replacement effects, Auras.

## RG111. Noelle controls a Summit Prowler enchanted by their Spider Umbra. Avery activates t...

**Scenario:**
> Noelle controls a Summit Prowler enchanted by their Spider Umbra. Avery activates the last ability of Sorin, Lord of Innistrad, targeting the Summit Prowler. What happens?
> Cards involved: [[Summit Prowler]], [[Spider Umbra]], [[Sorin, Lord of Innistrad]].
> RulesGuru source: https://rulesguru.org/?111RGBwnIIIlg6Fu32WGG

**Expected verdict:** The Spider Umbra is destroyed instead of the Summit Prowler. (702.89a) It is then returned to the battlefield by the rest of Sorin, Lord of Innistrad's ability. The only creature on the battlefield is the Summit Prowler, so the Spider Umbra must enter the battlefield enchanting the Summit Prowler. (303.4f) Spider Umbra is now controlled by Avery.

**Required reasoning:**
- Match the RulesGuru cited answer for question 111.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [303.4f], [702.89a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Zone-changes, Non-evergreen keywords, Replacement effects, Auras.

## RG112. Anderson casts Sprouting Vines. In response, Natasha casts Songs of the Damned. How...

**Scenario:**
> Anderson casts Sprouting Vines. In response, Natasha casts Songs of the Damned. How many copies of Sprouting Vines are created when the storm trigger resolves?
> Cards involved: [[Sprouting Vines]], [[Songs of the Damned]].
> RulesGuru source: https://rulesguru.org/?112RGBwnIII2e79kjGG

**Expected verdict:** 0. The storm trigger only cares about spells cast before the spell that caused it to trigger. (702.40a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 112.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [702.40a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Non-evergreen keywords, Casting spells, The stack.

## RG113. Avery casts Bitter Ordeal, targeting Nico. At their first opportunity, Avery sacrif...

**Scenario:**
> Avery casts Bitter Ordeal, targeting Nico. At their first opportunity, Avery sacrifices their Crystal Vein. How many cards will Avery be able to exile from Nico's library?
> Cards involved: [[Bitter Ordeal]], [[Crystal Vein]].
> RulesGuru source: https://rulesguru.org/?113RGBwnIII1xEnpiGG

**Expected verdict:** 2. Gravestorm cares about the number of permanents put into the graveyard before the trigger resolves. (702.69a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 113.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [702.69a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Non-evergreen keywords, Casting spells, The stack.

## RG114. Nevaeh controls a Snow-Covered Forest with a music counter on it that has previousl...

**Scenario:**
> Nevaeh controls a Snow-Covered Forest with a music counter on it that has previously been targeted by Addison's Musician. Addison casts Turn to Frog, targeting the Snow-Covered Forest. After that resolves, they activates Musician's ability, targeting the Snow-Covered Forest. On Nevaeh's next upkeep, how much mana will they have to pay in order to keep the Snow-Covered Forest on the battlefield?
> Cards involved: [[Snow-Covered Forest]], [[Musician]], [[Turn to Frog]].
> RulesGuru source: https://rulesguru.org/?114RGBwnIIIkQODzNE9GG

**Expected verdict:** {4}. When Musician's ability resolves Snow-Covered Forest has no abilities, so it gains "At the beginning of your upkeep, destroy this creature unless you pay {1} for each music counter on it.". When Turn to Frog's effect ends, it will have 2 instances of that ability. Each one will trigger and destroy the Snow-Covered Forest unless Nevaeh pays {2}.

**Required reasoning:**
- Match the RulesGuru cited answer for question 114.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: none.

## RG115. Nico controls Silvercoat Lion and Muraganda Petroglyphs. They cast and resolve Guid...

**Scenario:**
> Nico controls Silvercoat Lion and Muraganda Petroglyphs. They cast and resolve Guided Strike, targeting Silvercoat Lion. Alexa then casts Archetype of Courage. After it resolves, what are the power and toughness of Silvercoat Lion?
> Cards involved: [[Silvercoat Lion]], [[Muraganda Petroglyphs]], [[Guided Strike]], [[Archetype of Courage]].
> RulesGuru source: https://rulesguru.org/?115RGBwnIII3hM3pN4hNyyGG

**Expected verdict:** 5/4. In layer 6, Archetype of Courage makes Guided Strike unable to grant first strike to Silvercoat Lion. (113.11, 613.1f, 613.8a) Archetype of Courage isn't granting any abilities to Silvercoat Lion itself (113.12), so in layer 7 Silvercoat Lion has no abilities and gets +2/+2 from Muraganda Petroglyphs and +1/+0 from Guided Strike.

**Required reasoning:**
- Match the RulesGuru cited answer for question 115.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [113.11], [113.12], [613.1f], [613.8a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: "Can't" effects, Layers, Abilities.

## RG116. Alex casts Dream Leash targeting Nancy's tapped Merrow Grimeblotter. In response, N...

**Scenario:**
> Alex casts Dream Leash targeting Nancy's tapped Merrow Grimeblotter. In response, Nancy activates Merrow Grimeblotter's ability. What happens to the Dream Leash?
> Cards involved: [[Dream Leash]], [[Merrow Grimeblotter]].
> RulesGuru source: https://rulesguru.org/?116RGBwnIII1H0loYGG

**Expected verdict:** It resolves as normal and Alex gains control of Merrow Grimeblotter. Dream Leash's requirement to only target a tapped permanent only applies while choosing targets as its cast. It doesn't matter if the targeted permanent becomes untapped afterwards.

**Required reasoning:**
- Match the RulesGuru cited answer for question 116.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Casting spells, Targets, Auras, Resolving objects.

## RG117. Alex casts Glimmerburst. In response, Nicole casts Crafty Cutpurse. After everythin...

**Scenario:**
> Alex casts Glimmerburst. In response, Nicole casts Crafty Cutpurse. After everything resolves, Alex activates the second ability of Homeward Path. Who gains control of the token?
> Cards involved: [[Glimmerburst]], [[Crafty Cutpurse]], [[Homeward Path]].
> RulesGuru source: https://rulesguru.org/?117RGBwnIIIqQeBF7PdGG

**Expected verdict:** Alex does. Tokens are owned by the player that created them. (111.2) Alex still created the token, regardless of under whose control it entered the battlefield.

**Required reasoning:**
- Match the RulesGuru cited answer for question 117.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [111.2]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Tokens, Control-changing effects, Zone-changes, Replacement effects.

## RG118. Aubrey controls Transmogrifying Licid. They activates the first activated ability o...

**Scenario:**
> Aubrey controls Transmogrifying Licid. They activates the first activated ability of Transmogrifying Licid, targeting Markov's Servant. In response, they casts Cytoshape, both targeting Transmogrifying Licid and choosing Transmogrifying Licid to be the copied creature as it resolves. After everything has resolved, does the Transmogrifying Licid have an ability to turn itself into an aura and attach itself to target creature?
> Cards involved: [[Transmogrifying Licid]], [[Markov's Servant]], [[Cytoshape]].
> RulesGuru source: https://rulesguru.org/?118RGBwnIIIlMqFq8QrGG

**Expected verdict:** Yes. The ability on the stack references "this ability". The ability that Transmogrifying Licid currently has printed on it may have the same text as the ability on the stack, but it is not the same ability.

**Required reasoning:**
- Match the RulesGuru cited answer for question 118.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Copy effects, Abilities, Activated abilities, Continuous effects.

## RG119. Ariel attacks with Gavony Unhallowed and Nantuko Elder. Nikolas blocks them each wi...

**Scenario:**
> Ariel attacks with Gavony Unhallowed and Nantuko Elder. Nikolas blocks them each with a Wild Ceratok. What happens with Gavony Unhallowed's trigger?
> Cards involved: [[Gavony Unhallowed]], [[Nantuko Elder]], [[Wild Ceratok]].
> RulesGuru source: https://rulesguru.org/?119RGBwnIIIgVolEpY4GG

**Expected verdict:** All combat damage is dealt simultaneously. (510.2) Gavony Unhallowed's ability triggers. (603.2) State-based actions are checked, and Gavony Unhallowed and Nantuko Elder die. (704.3, 704.5g) Then the trigger is put onto the stack. (117.5) When it resolves, Gavony Unhallowed is not on the battlefield, so nothing happens.

**Required reasoning:**
- Match the RulesGuru cited answer for question 119.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [117.5], [510.2], [603.2], [704.3], [704.5g]

**Why this test matters:** Imported RulesGuru benchmark. Level: 0. Complexity: Simple. Tags: Triggered abilities, Abilities, Zone-changes, Combat, State-based actions, Timing and priority, Damage.

## RG120. Ariel attacks with a Geist of Saint Traft. Can they sacrifice the token to Carrion...

**Scenario:**
> Ariel attacks with a Geist of Saint Traft. Can they sacrifice the token to Carrion after it deals its combat damage?
> Cards involved: [[Geist of Saint Traft]], [[Carrion]].
> RulesGuru source: https://rulesguru.org/?120RGBwnIII1N5UVuGG

**Expected verdict:** Yes. The token is removed as the trigger resolves during the end of combat step. (511.2) Ariel could cast the Carrion at any time during the combat damage step or before the trigger resolves during the end of combat step.

**Required reasoning:**
- Match the RulesGuru cited answer for question 120.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [511.2]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Turn structure, Timing and priority, Triggered abilities, Tokens.

## RG122. Adele casts Obsidian Giant. Nico casts Frightful Delusion, targeting Obsidian Giant...

**Scenario:**
> Adele casts Obsidian Giant. Nico casts Frightful Delusion, targeting Obsidian Giant. Adele pays {1}. Do they have to discard a card?
> Cards involved: [[Obsidian Giant]], [[Frightful Delusion]].
> RulesGuru source: https://rulesguru.org/?122RGBwnIII228rKfGG

**Expected verdict:** Yes. Frightful Delusion says to discard a card, so Adele must do so.

**Required reasoning:**
- Match the RulesGuru cited answer for question 122.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: 0. Complexity: Simple. Tags: Resolving objects, Costs.

## RG123. Ally has 2 life and attacks with Drogskol Reaver and Gavony Ironwright. How much da...

**Scenario:**
> Ally has 2 life and attacks with Drogskol Reaver and Gavony Ironwright. How much damage will be dealt to Nico in total?
> Cards involved: [[Drogskol Reaver]], [[Gavony Ironwright]].
> RulesGuru source: https://rulesguru.org/?123RGBwnIII1H7EgPGG

**Expected verdict:** 8. Since a creature with double strike is attacking, there are two combat damage steps. (510.4) In the first one, Drogskol Reaver deals 4 damage to Nico. In the second combat damage step Ally has 6 life, so Drogskol Reaver only deals 3 more damage and Gavony Ironwright deals 1 damage.

**Required reasoning:**
- Match the RulesGuru cited answer for question 123.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [510.4]

**Why this test matters:** Imported RulesGuru benchmark. Level: 0. Complexity: Simple. Tags: Combat, Turn structure, Evergreen keywords, Continuous effects.

## RG124. Ariel casts Copy Artifact, and would like to choose the Rust Tick that they control...

**Scenario:**
> Ariel casts Copy Artifact, and would like to choose the Rust Tick that they controls. Previously this turn, Nyla has cast a Gather Specimens. What happens?
> Cards involved: [[Copy Artifact]], [[Rust Tick]], [[Gather Specimens]].
> RulesGuru source: https://rulesguru.org/?124RGBwnIIIfuBjKUroGG

**Expected verdict:** Ariel can choose to copy the Rust Tick. Once they does, the Gather Specimens replacement effect applies and the Copy Artifact will enter the battlefield under Nyla's control. (616.2) Nyla can't make a new choice of what to copy.

**Required reasoning:**
- Match the RulesGuru cited answer for question 124.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [616.2]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Copy effects, Replacement effects, Zone-changes.

## RG125. Alissa casts a Phyrexian Metamorph. They would like to copy their Grond, the Gatebr...

**Scenario:**
> Alissa casts a Phyrexian Metamorph. They would like to copy their Grond, the Gatebreaker. Previously in the turn, Nathaniel has cast a Gather Specimens. What happens?
> Cards involved: [[Phyrexian Metamorph]], [[Grond, the Gatebreaker]], [[Gather Specimens]].
> RulesGuru source: https://rulesguru.org/?125RGBwnIIIjqUfBsNMGG

**Expected verdict:** There are two replacement effects trying to affect the same event, so they must be applied in the order laid out in [616.1]. Gather Specimens's effect changes the control of the Phyrexian Metamorph entering the battlefield, so it is applied first. (616.1b) Since the Phyrexian Metamorph will now be entering under Nathaniel's control, Nathaniel can choose what it copies.

**Required reasoning:**
- Match the RulesGuru cited answer for question 125.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [616.1], [616.1b]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Copy effects, Replacement effects, Zone-changes, Type-changing effects.

## RG126. Aaron controls Life and Limb, Blood Moon, and Cinder Glade, that entered the battle...

**Scenario:**
> Aaron controls Life and Limb, Blood Moon, and Cinder Glade, that entered the battlefield in that order. Is Cinder Glade a creature?
> Cards involved: [[Life and Limb]], [[Blood Moon]], [[Cinder Glade]].
> RulesGuru source: https://rulesguru.org/?126RGBwnIIIigPVucTpGG

**Expected verdict:** No. Applying Blood Moon's effect would prevent Life and Limb's effect from applying to Cinder Glade and applying Life and Limb's effect first would not affect how Blood Moon's effect is applied or what it does, so Life and Limb's effect is dependent on Blood Moon's effect (613.8a) and waits to apply until afterwards. (613.8b) Since Blood Moon's effect makes Cinder Glade no longer a Forest (205.1a), Life and Limb doesn't apply to it at all.

**Required reasoning:**
- Match the RulesGuru cited answer for question 126.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [205.1a], [613.8a], [613.8b]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Type-changing effects, Layers, Dependency, Lands.

## RG127. Alexandra controls a Blood Moon, a Life and Limb, and a Scattered Groves, that ente...

**Scenario:**
> Alexandra controls a Blood Moon, a Life and Limb, and a Scattered Groves, that entered the battlefield in that order. Is the Scattered Groves a creature?
> Cards involved: [[Blood Moon]], [[Life and Limb]], [[Scattered Groves]].
> RulesGuru source: https://rulesguru.org/?127RGBwnIIIeQKJrU7sGG

**Expected verdict:** No. Applying Blood Moon's effect first would prevent Life and Limb's effect from applying to Scattered Groves and applying Life and Limb's effect first would not affect how Blood Moon's effect is applied or what it does, so Life and Limb's effect is dependent on Blood Moon's effect (613.8a) and waits to apply until afterwards. (613.8b) Since Blood Moon's effect makes Scattered Groves no longer a Forest (205.1a), Life and Limb doesn't apply to it at all.

**Required reasoning:**
- Match the RulesGuru cited answer for question 127.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [205.1a], [613.8a], [613.8b]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Type-changing effects, Layers, Dependency, Lands.

## RG128. Addison controls a Blood Moon, a Life and Limb, and a 1/1 Green Saproling Creature...

**Scenario:**
> Addison controls a Blood Moon, a Life and Limb, and a 1/1 Green Saproling Creature token, that entered the battlefield in that order. What is the Saproling?
> Cards involved: [[Blood Moon]], [[Life and Limb]], [[Mountain]].
> RulesGuru source: https://rulesguru.org/?128RGBwnIIIeQKJrT8zGG

**Expected verdict:** It's a 1/1 green Land Creature - Mountain Saproling with "{T}: Add {R}.". Applying Life and Limb's effect would allow Blood Moon's effect to apply to the Saproling, but applying Blood Moon's effect first would not affect how Life and Limb's effect is applied or what it does. Blood Moon's effect is therefore dependent on Life and Limb's effect (613.8a) and waits to apply until afterwards. (613.8b) Since Life and Limb's effect makes the Saproling a nonbasic land, Blood Moon then applies and turns it into a Mountain with "{T}: Add {R}." and no other abilities. (305.7)

**Required reasoning:**
- Match the RulesGuru cited answer for question 128.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [305.7], [613.8a], [613.8b]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Type-changing effects, Layers, Dependency, Lands.

## RG129. Aspen controls a Life and Limb, a Blood Moon, and a 1/1 Green Saproling Creature to...

**Scenario:**
> Aspen controls a Life and Limb, a Blood Moon, and a 1/1 Green Saproling Creature token, that entered the battlefield in that order. What is the Saproling?
> Cards involved: [[Life and Limb]], [[Blood Moon]].
> RulesGuru source: https://rulesguru.org/?129RGBwnIII1WzQdMGG

**Expected verdict:** It's a 1/1 green Land Creature - Mountain Saproling with "{T}: Add {R}.". Applying Life and Limb's effect would allow Blood Moon's effect to apply to the Saproling and applying Blood Moon's effect first would not affect how Life and Limb's effect is applied or what it does, so Blood Moon's effect is dependent on Life and Limb's effect (613.8a) and waits to apply until afterwards. (613.8b) Since Life and Limb's effect makes the Saproling a nonbasic land, Blood Moon then applies and turns it into a Mountain with "{T}: Add {R}." and no other abilities. (305.7)

**Required reasoning:**
- Match the RulesGuru cited answer for question 129.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [305.7], [613.8a], [613.8b]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Type-changing effects, Layers, Dependency, Lands.

## RG130. Alice controls a Life and Limb, a Blood Moon, a Bayou, and a 1/1 Green Saproling Cr...

**Scenario:**
> Alice controls a Life and Limb, a Blood Moon, a Bayou, and a 1/1 Green Saproling Creature token, that entered the battlefield in that order. What do the Bayou and Saproling look like?
> Cards involved: [[Life and Limb]], [[Blood Moon]], [[Bayou]].
> RulesGuru source: https://rulesguru.org/?130RGBwnIIIigPVucrUGG

**Expected verdict:** Applying Life and Limb's effect first would allow Blood Moon's effect to apply to the Saproling, and applying Blood Moon's effect first would prevent Life and Limb from applying to the Bayou, so both effects are dependent on each other (613.8a) and those dependencies are ignored. (613.8b) Life and Limb has the earlier timestamp (613.7d), so it's applied first. (613.7)

As Life and Limb's effect is applied, Bayou becomes a creature and the Saproling becomes a land. Then as Blood Moon's effect is applied, they both lose their other land types and abilities and becomes Mountains. (305.7)

Both permanents are 1/1 Green Land Creature - Mountain Saprolings, with "{T}: Add {R}".

**Required reasoning:**
- Match the RulesGuru cited answer for question 130.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [305.7], [613.7], [613.7d], [613.8a], [613.8b]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Type-changing effects, Layers, Dependency, Lands.

## RG131. Andi controls a Blood Moon, a Life and Limb, a Temple Garden, and a 1/1 Green Sapro...

**Scenario:**
> Andi controls a Blood Moon, a Life and Limb, a Temple Garden, and a 1/1 Green Saproling Creature token, that entered the battlefield in that order. What do the Temple Garden and Saproling look like?
> Cards involved: [[Blood Moon]], [[Life and Limb]], [[Temple Garden]].
> RulesGuru source: https://rulesguru.org/?131RGBwnIIIeQKJrUTmGG

**Expected verdict:** Temple Garden is a noncreature Land - Mountain with "{T}: Add {R}." and no other abilities. The Saproling is a 1/1 Green Land Creature - Forest Saproling with "{T}: Add {G}." and no other abilities.

Applying Life and Limb's effect first would allow Blood Moon's effect to apply to the Saproling, and applying Blood Moon's effect first would prevent Life and Limb from applying to the Temple Garden, so both effects are dependent on each other (613.8a) and those dependencies are ignored. (613.8b) Blood Moon has the earlier timestamp (613.7d), so it's applied first. (613.7)

As Blood Moon's effect is applied, Temple Garden becomes a Mountain and loses the "Forest" subtype. (305.7) Then Life and Limb's effect is applied, making the Saproling into a land.

**Required reasoning:**
- Match the RulesGuru cited answer for question 131.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [305.7], [613.7], [613.7d], [613.8a], [613.8b]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Type-changing effects, Layers, Dependency, Lands.

## RG132. Aubrey controls Liquimetal Torque, Life and Limb, March of the Machines, and Xenogr...

**Scenario:**
> Aubrey controls Liquimetal Torque, Life and Limb, March of the Machines, and Xenograft naming "Saproling", that entered the battlefield in that order. What is the Liquimetal Torque?
> Cards involved: [[Liquimetal Torque]], [[Life and Limb]], [[March of the Machines]], [[Xenograft]].
> RulesGuru source: https://rulesguru.org/?132RGBwnIII3P8E2lKDdfwGG

**Expected verdict:** It's a 2/2 colorless Artifact Creature - Saproling.

In layer 4, Life and Limb's effect is not dependent on March of the Machines or Xenograft (613.8a), so Life and Limb is applied first, then March of the Machines, then Xenograft. Since Life and Limb didn't apply to Liquimetal Torque in layer 4, it doesn't apply to it in later layers either. (613.6)

**Required reasoning:**
- Match the RulesGuru cited answer for question 132.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [613.6], [613.8a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Intermediate. Tags: Layers, Dependency, Lands, Type-changing effects.

## RG133. Ari controls a Caged Sun (naming "green") that is a 2/2 Artifact Land Creature - Fo...

**Scenario:**
> Ari controls a Caged Sun (naming "green") that is a 2/2 Artifact Land Creature - Forest Saproling due to Life and Limb, March of the Machines, and Conspiracy (*naming "Saproling"). Ari taps the Caged Sun for {G}. What happens?
> Cards involved: [[Caged Sun]], [[Life and Limb]], [[March of the Machines]], [[Conspiracy]].
> RulesGuru source: https://rulesguru.org/?133RGBwnIII2oeHTtwx334GG

**Expected verdict:** When the ability resolves, that is a land causing Ari to add one or more mana of the chosen color, so Caged Sun's triggered ability triggers. When that trigger resolves, it is also a land causing Ari to add one or more mana of the chosen color, so it triggers again. The triggered ability is a mana ability (605.1b), so players do not receive priority in between when it triggers and when it resolves. If the loop is not broken, the game is a draw. (104.4b)

**Required reasoning:**
- Match the RulesGuru cited answer for question 133.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [104.4b], [605.1b]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Lands, Mana abilities, Leaving the game, Timing and priority.

## RG134. Nathanael controls a Mikaeus, the Unhallowed, Samite Elder, Timber Protector, Yew S...

**Scenario:**
> Nathanael controls a Mikaeus, the Unhallowed, Samite Elder, Timber Protector, Yew Spirit, Eviscerator, and a 1/1 Vampire creature token. Aubriella casts Kirtar's Wrath. After everything has resolved, what creatures are on the battlefield?
> Cards involved: [[Mikaeus, the Unhallowed]], [[Samite Elder]], [[Timber Protector]], [[Yew Spirit]], [[Eviscerator]], [[Kirtar's Wrath]].
> RulesGuru source: https://rulesguru.org/?134RGBwnIII4sdgP1i6Qje5jfKvGG

**Expected verdict:** Timber Protector, Yew Spirit and Eviscerator. Samite Elder is a Human, regardless of what other creature types is has, so it does not have undying. (608.2j) Yew Spirit only loses indestructible after Timber Protector has left the battlefield, and all creatures are destroyed at the same time, so Yew Spirit is not destroyed. Protection does not prevent a permanent from being destroyed, so Eviscerator dies. (702.16) It's not a Human, so it has undying and returns to the battlefield with a +1/+1 counter on it. (702.93a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 134.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [608.2j], [702.16], [702.93a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 0. Complexity: Intermediate. Tags: Non-evergreen keywords, Evergreen keywords, Resolving objects.

## RG135. Abdiel controls a Memnite and has 6 cards in their graveyard. They cast a Kirtar's...

**Scenario:**
> Abdiel controls a Memnite and has 6 cards in their graveyard. They cast a Kirtar's Wrath. Does Abdiel create 2 Spirit tokens?
> Cards involved: [[Memnite]], [[Kirtar's Wrath]].
> RulesGuru source: https://rulesguru.org/?135RGBwnIII1YFmjcGG

**Expected verdict:** No. The ability to create the spirit tokens creates a self-replacement effect (614.15) that replaces the normal effect of Kirtar's Wrath if 7 or more cards are in Abdiel's graveyard. There were not 7 or more cards in their graveyard when Kirtar's Wrath began resolving, so the replacement effect doesn't apply.

**Required reasoning:**
- Match the RulesGuru cited answer for question 135.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [614.15]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Resolving objects, Replacement effects.

## RG136. Atticus controls Sylvan Library and Abundance. When Atticus moves to their draw ste...

**Scenario:**
> Atticus controls Sylvan Library and Abundance. When Atticus moves to their draw step, assuming they choose to use the abilities of both cards, what happens?
> Cards involved: [[Sylvan Library]], [[Abundance]].
> RulesGuru source: https://rulesguru.org/?136RGBwnIII2fUQW0GG

**Expected verdict:** Putting a card into Atticus's hand with Abundance's effect is not "drawing a card". (121.5) Even though the cards won't be drawn, Atticus may still choose the affirmative for Sylvan Library's "you may draw two additional cards" instruction (118.11), which will each be replaced by Abundance's effect. After the cards have been put into Atticus's hand, they are unable to choose two cards in their hand that were drawn this turn, since no cards were drawn this turn. Atticus does not have the choice to pay any life.

**Required reasoning:**
- Match the RulesGuru cited answer for question 136.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [118.11], [121.5]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Drawing a card, Replacement effects, Costs, Resolving objects.

## RG137. Nataly controls a Lifeline and 2 Jedit Ojanen. Avery casts Winds of Rath. Does Life...

**Scenario:**
> Nataly controls a Lifeline and 2 Jedit Ojanen. Avery casts Winds of Rath. Does Lifeline trigger and return the creatures to the battlefield at the beginning of the next end step?
> Cards involved: [[Lifeline]], [[Jedit Ojanen]], [[Winds of Rath]].
> RulesGuru source: https://rulesguru.org/?137RGBwnIIIihcg1CiMGG

**Expected verdict:** No. Leaves-the-battlefield triggers care about the game state immediately before the event in question occurred when determining whether they trigger. (603.10, 603.10a) There was another creature on the battlefield at that time, so Lifeline will trigger for both creatures that died. However, Lifeline has an intervening "if" clause that checks for that condition again as the trigger begins to resolve. (603.4) There is not another creature on the battlefield at that time, so the ability is removed from the stack. Neither Jedit Ojanen returns to the battlefield.

**Required reasoning:**
- Match the RulesGuru cited answer for question 137.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [603.4], [603.10], [603.10a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Triggered abilities, Zone-changes, The stack.

## RG139. Andy controls an Opal Acrolith that is currently a creature and an Icehide Golem. T...

**Scenario:**
> Andy controls an Opal Acrolith that is currently a creature and an Icehide Golem. They cast Cytoshape to turn the Icehide Golem into a copy of Opal Acrolith. Then they activate Icehide Golem's ability to turn it into an enchantment. What happens at the end of turn?
> Cards involved: [[Opal Acrolith]], [[Icehide Golem]], [[Cytoshape]].
> RulesGuru source: https://rulesguru.org/?139RGBwnIIIjdbkbvaZGG

**Expected verdict:** The effect making Icehide Golem a copy of Opal Acrolith ends, but the effect making it an enchantment does not. It's a noncreature enchantment named "Icehide Golem" with no abilities.

**Required reasoning:**
- Match the RulesGuru cited answer for question 139.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Continuous effects, Type-changing effects.

## RG140. Ariel controls a Gaea's Liege and 1 Bayou. Nico controls a Reverence and 3 Bayous....

**Scenario:**
> Ariel controls a Gaea's Liege and 1 Bayou. Nico controls a Reverence and 3 Bayous. Can Ariel attack with the Gaea's Liege?
> Cards involved: [[Gaea's Liege]], [[Bayou]], [[Reverence]].
> RulesGuru source: https://rulesguru.org/?140RGBwnIIIgT0JDYckGG

**Expected verdict:** No. Checking to see if any restrictions affect a potentially-attacking creature is done before the creature becomes an "attacking creature". (508.1c, 508.1j)

**Required reasoning:**
- Match the RulesGuru cited answer for question 140.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [508.1c], [508.1j]

**Why this test matters:** Imported RulesGuru benchmark. Level: Corner Case. Complexity: Simple. Tags: Combat, Turn structure.

## RG144. Aspen controls an Order of the Sacred Bell and a Deathrite Shaman. Nico controls a...

**Scenario:**
> Aspen controls an Order of the Sacred Bell and a Deathrite Shaman. Nico controls a Norn's Annex. Can Aspen use Deathrite Shaman's ability to pay for the Order of the Sacred Bell to attack?
> Cards involved: [[Order of the Sacred Bell]], [[Deathrite Shaman]], [[Norn's Annex]].
> RulesGuru source: https://rulesguru.org/?144RGBwnIIIjftOnXTtGG

**Expected verdict:** No. Norn's Annex imposes a cost on Order of the Sacred Bell attacking, which must be paid as a part of declaring it as an attacker. (508.1g) Deathrite Shaman's ability is not a mana ability (605.1a), so the last time it could be activated before attackers are declared is during the beginning of combat step. (506.1) At the end of that step, the mana would empty from Aspen's mana pool. (500.4)

**Required reasoning:**
- Match the RulesGuru cited answer for question 144.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [500.4], [506.1], [508.1g], [605.1a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Combat, Turn structure, Mana abilities, Activated abilities, Costs.

## RG145. Nico controls a Containment Priest. Anthony plays a Dryad Arbor. What happens?

**Scenario:**
> Nico controls a Containment Priest. Anthony plays a Dryad Arbor. What happens?
> Cards involved: [[Containment Priest]], [[Dryad Arbor]].
> RulesGuru source: https://rulesguru.org/?145RGBwnIII1C9qVHGG

**Expected verdict:** It's a nontoken creature and it wasn't cast (305.1), so it's exiled. It does not enter the battlefield. (614.6) Anthony may not play another land this turn.

**Required reasoning:**
- Match the RulesGuru cited answer for question 145.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [305.1], [614.6]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Lands, Special actions, Replacement effects, Zone-changes.

## RG146. Norah controls a Containment Priest and a Pangosaur. Alijah plays a Dryad Arbor. Wh...

**Scenario:**
> Norah controls a Containment Priest and a Pangosaur. Alijah plays a Dryad Arbor. What happens to the Dryad Arbor? Does Pangosaur trigger?
> Cards involved: [[Containment Priest]], [[Pangosaur]], [[Dryad Arbor]].
> RulesGuru source: https://rulesguru.org/?146RGBwnIIIftA9T8reGG

**Expected verdict:** Dryad Arbor is a nontoken creature and it wasn't cast (305.1), so it's exiled. It does not enter the battlefield. (614.6) A land was still played however, so Pangosaur does trigger.

**Required reasoning:**
- Match the RulesGuru cited answer for question 146.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [305.1], [614.6]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Lands, Special actions, Replacement effects.

## RG147. Noah controls Containment Priest. Aliya attempts to play Dryad Arbor, which is exil...

**Scenario:**
> Noah controls Containment Priest. Aliya attempts to play Dryad Arbor, which is exiled. Can Aliya now play Blast Zone as their land for turn?
> Cards involved: [[Containment Priest]], [[Dryad Arbor]], [[Blast Zone]].
> RulesGuru source: https://rulesguru.org/?147RGBwnIIIftzOZ9QHGG

**Expected verdict:** No. Regardless of what zone Dryad Arbor moved to, it was still played as Aliya's land play (116.2a), and Aliya can only play one land each turn. (305.2)

**Required reasoning:**
- Match the RulesGuru cited answer for question 147.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [116.2a], [305.2]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Lands, Special actions, Replacement effects.

## RG148. Ashley casts Dance of the Dead, targeting a Devoted Hero in their graveyard. After...

**Scenario:**
> Ashley casts Dance of the Dead, targeting a Devoted Hero in their graveyard. After it resolves, Nico counters the triggered ability with Disallow. What happens?
> Cards involved: [[Dance of the Dead]], [[Devoted Hero]], [[Disallow]].
> RulesGuru source: https://rulesguru.org/?148RGBwnIIIfFYHWutvGG

**Expected verdict:** Nothing. The Dance of the Dead remains on the battlefield enchanting the Devoted Hero in the graveyard.

**Required reasoning:**
- Match the RulesGuru cited answer for question 148.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: 0. Complexity: Simple. Tags: Auras, Triggered abilities, Zone-changes.

## RG153. Aubrey controls Upwelling and has 1 green mana in their mana pool. They also have a...

**Scenario:**
> Aubrey controls Upwelling and has 1 green mana in their mana pool. They also have a Wild Evocation, whose trigger reveals Skull Catapult. Nikolai controls Sphere of Resistance. What happens?
> Cards involved: [[Upwelling]], [[Wild Evocation]], [[Skull Catapult]], [[Sphere of Resistance]].
> RulesGuru source: https://rulesguru.org/?153RGBwnIII3tTVnCzViWLGG

**Expected verdict:** Casting a spell without paying its mana cost is an alternative cost (118.9), and the additional cost from Sphere of Resistance will still apply to it. (601.2f) Casting Skull Catapult isn't optional, so Aubrey must spend the green mana that's in their mana pool. However if Aubrey didn't have any mana floating, they would not be required to tap lands. (118.3c)

**Required reasoning:**
- Match the RulesGuru cited answer for question 153.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [118.3c], [118.9], [601.2f]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Non-evergreen keywords, Casting spells, Costs, Mana.

## RG155. Alden controls Kuldotha Ringleader and Omnath, Locus of Mana, and has 2 green mana...

**Scenario:**
> Alden controls Kuldotha Ringleader and Omnath, Locus of Mana, and has 2 green mana in their mana pool. Natalia controls Norn's Annex. What happens during the declare attackers step of Alden's turn?
> Cards involved: [[Kuldotha Ringleader]], [[Omnath, Locus of Mana]], [[Norn's Annex]].
> RulesGuru source: https://rulesguru.org/?155RGBwnIIIi9zklpySGG

**Expected verdict:** Alden is never required to pay a cost for a creature to attack. (508.1d) Alden can choose to not pay the mana and not attack with Kuldotha Ringleader.

**Required reasoning:**
- Match the RulesGuru cited answer for question 155.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [508.1d]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Costs, Combat, Mana.

## RG156. Allan controls a Sigil of Valor and a Hill Giant. They activate the equip ability o...

**Scenario:**
> Allan controls a Sigil of Valor and a Hill Giant. They activate the equip ability of Sigil of Valor, targeting Hill Giant. In response, Nora casts Grip of Phyresis, targeting the Sigil of Valor. What happens?
> Cards involved: [[Sigil of Valor]], [[Hill Giant]], [[Grip of Phyresis]].
> RulesGuru source: https://rulesguru.org/?156RGBwnIIIkD58Td89GG

**Expected verdict:** Nora gains control of the Sigil of Valor and attaches it to the Germ. Then when the equip ability resolves, Sigil of Valor will become attached to the Hill Giant. (702.6a) It's now controlled by Nora.

**Required reasoning:**
- Match the RulesGuru cited answer for question 156.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [702.6a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Equipment, The stack, Control-changing effects, Evergreen keywords.

## RG157. Nico controls Blood Moon. Axton plays Dark Depths and then destroys the Blood Moon...

**Scenario:**
> Nico controls Blood Moon. Axton plays Dark Depths and then destroys the Blood Moon with Elvish Hexhunter. What happens?
> Cards involved: [[Blood Moon]], [[Dark Depths]], [[Elvish Hexhunter]].
> RulesGuru source: https://rulesguru.org/?157RGBwnIIIeQKrpxBvGG

**Expected verdict:** Dark Depths entered the battlefield with no ice counters, since it didn't have the ability that would cause it to enter with them. (614.12) When Blood Moon is destroyed, Dark Depths triggers since it has no ice counters on it and creates a Marit Lage token.

**Required reasoning:**
- Match the RulesGuru cited answer for question 157.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [614.12]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Lands, Abilities, Replacement effects, Zone-changes, Triggered abilities.

## RG158. Nico controls an Iona, Shield of Emeria, naming "green". Can Avery cast Down?

**Scenario:**
> Nico controls an Iona, Shield of Emeria, naming "green". Can Avery cast Down?
> Cards involved: [[Iona, Shield of Emeria]], [[Down]].
> RulesGuru source: https://rulesguru.org/?158RGBwnIII1TAT3VGG

**Expected verdict:** Yes. When casting a half of a split card, only that half is put onto the stack and cast, the other half is considered to not exist. (709.3a) Down is not green, regardless of what colors its other half might have.

**Required reasoning:**
- Match the RulesGuru cited answer for question 158.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [709.3a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Split cards, Casting spells.

## RG159. Alex controls Gideon, Battle-Forged with 4 loyalty counters. Alex activates its abi...

**Scenario:**
> Alex controls Gideon, Battle-Forged with 4 loyalty counters. Alex activates its ability to turn into a creature. Can Nixon target it with Vassal's Duty's ability?
> Cards involved: [[Gideon, Battle-Forged]], [[Vassal's Duty]].
> RulesGuru source: https://rulesguru.org/?159RGBwnIII1NyFUvGG

**Expected verdict:** Yes. Gideon, Battle-Forged is legendary and it's a creature.

**Required reasoning:**
- Match the RulesGuru cited answer for question 159.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Type-changing effects, Planeswalkers, Resolving objects, Targets.

## RG161. Alvaro casts Show and Tell. Alvaro chooses to put Fire Elemental onto the battlefie...

**Scenario:**
> Alvaro casts Show and Tell. Alvaro chooses to put Fire Elemental onto the battlefield, and Nico chooses Containment Priest. What happens to the Fire Elemental?
> Cards involved: [[Show and Tell]], [[Fire Elemental]], [[Containment Priest]].
> RulesGuru source: https://rulesguru.org/?161RGBwnIIIkAySrYjtGG

**Expected verdict:** It enters the battlefield. Both permanents from Show and Tell enter the battlefield at the same time. Containment Priest's replacement effect must exist before a creature enters the battlefield in order to affect it. (614.4)

**Required reasoning:**
- Match the RulesGuru cited answer for question 161.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [614.4]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Replacement effects, Zone-changes.

## RG163. Amari draws a Revenge of the Hunted during their draw step and wants to cast it for...

**Scenario:**
> Amari draws a Revenge of the Hunted during their draw step and wants to cast it for its miracle cost. Does Nico have a chance to remove it from Amari's hand with Venarian Glimmer to prevent Amari from casting it?
> Cards involved: [[Revenge of the Hunted]], [[Venarian Glimmer]].
> RulesGuru source: https://rulesguru.org/?163RGBwnIII27lAsmGG

**Expected verdict:** Yes. When a miracle card is drawn, its owner may reveal it in order to put the miracle trigger onto the stack and cast Revenge of the Hunted when the trigger resolves. (702.94a) Nico could cast Venarian Glimmer before the trigger resolves.

**Required reasoning:**
- Match the RulesGuru cited answer for question 163.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [702.94a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Non-evergreen keywords, The stack.

## RG164. Which of the following cards have one or more mana abilities? Witch Engine, Charmed...

**Scenario:**
> Which of the following cards have one or more mana abilities?
> 
> Witch Engine, Charmed Pendant, Chromatic Sphere, Fertile Ground, Sarkhan Unbroken, Braid of Fire, Selvala, Explorer Returned, Brightstone Ritual, Lion's Eye Diamond, Forbidden Orchard, Spectral Searchlight
> Cards involved: [[Witch Engine]], [[Charmed Pendant]], [[Chromatic Sphere]], [[Fertile Ground]], [[Sarkhan Unbroken]], [[Braid of Fire]], [[Selvala, Explorer Returned]], [[Brightstone Ritual]], [[Lion's Eye Diamond]], [[Forbidden Orchard]], [[Spectral Searchlight]].
> RulesGuru source: https://rulesguru.org/?164RGBwnIII1WnyybBmnw7WqWhTk6rvqax3Xwiz5GG

**Expected verdict:** Charmed Pendant, Chromatic Sphere, Fertile Ground, Selvala, Explorer Returned, Lion's Eye Diamond, Forbidden Orchard, and Spectral Searchlight. (605.1a, 605.1b)

Triggered abilities are only mana abilities if they trigger from the activation or resolution of an activated mana ability, or from mana being added to a player's mana pool. (605.1b)

It doesn't matter if the ability won't produce mana on a specific game state (605.2) or has other effects or timing restrictions.

**Required reasoning:**
- Match the RulesGuru cited answer for question 164.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [605.1a], [605.1b], [605.2]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Intermediate. Tags: Mana abilities, Activated abilities, Triggered abilities, Abilities.

## RG165. Alexis casts Blood Moon. In response, Nico taps their Dryad Arbor for {G}. Can Alex...

**Scenario:**
> Alexis casts Blood Moon. In response, Nico taps their Dryad Arbor for {G}. Can Alexis cast Remand targeting their Blood Moon?
> Cards involved: [[Blood Moon]], [[Dryad Arbor]], [[Remand]].
> RulesGuru source: https://rulesguru.org/?165RGBwnIIIeQKu9pKwGG

**Expected verdict:** Yes. The top object on the stack only resolves once all players pass priority without taking any actions. (117.4) Since Nico has taken an action, Alexis gets priority again before Blood Moon resolves and can use their priority to cast Remand.

**Required reasoning:**
- Match the RulesGuru cited answer for question 165.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [117.4]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Timing and priority, Turn structure.

## RG166. Ashley controls a Phyrexian Tower and a Hostage Taker that exiled a Swaggering Cors...

**Scenario:**
> Ashley controls a Phyrexian Tower and a Hostage Taker that exiled a Swaggering Corsair. Can they cast the Swaggering Corsair, sacrificing the Hostage Taker to help pay for it?
> Cards involved: [[Phyrexian Tower]], [[Hostage Taker]], [[Swaggering Corsair]].
> RulesGuru source: https://rulesguru.org/?166RGBwnIIIjrqnmqdWGG

**Expected verdict:** Yes. The first step of casting a spell is to put it onto the stack. (601.2a) There is a later step to activate mana abilities to pay for the spell. (601.2g) If Hostage Taker leaves the battlefield at that point, the Swaggering Corsair will not be removed from the stack since it's a different object than the card that was in exile. (400.7)

**Required reasoning:**
- Match the RulesGuru cited answer for question 166.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [400.7], [601.2a], [601.2g]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Casting spells, Zone-changes, Mana abilities.

## RG167. Aliya pays {3} to remove the last ice counter from their Dark Depths and puts its t...

**Scenario:**
> Aliya pays {3} to remove the last ice counter from their Dark Depths and puts its trigger onto the stack. Nico counters the trigger with Nimble Obstructionist. What happens?
> Cards involved: [[Dark Depths]], [[Nimble Obstructionist]].
> RulesGuru source: https://rulesguru.org/?167RGBwnIII1DxAe1GG

**Expected verdict:** Dark Depths is still on the battlefield since it would only be sacrificed when the trigger resolves. So it triggers again. (603.8)

**Required reasoning:**
- Match the RulesGuru cited answer for question 167.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [603.8]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Triggered abilities.

## RG168. Ariel controls Canopy Gorger and has Bridge from Below in their graveyard. Noemi co...

**Scenario:**
> Ariel controls Canopy Gorger and has Bridge from Below in their graveyard. Noemi controls a Glory Seeker. Ariel casts End Hostilities. What happens?
> Cards involved: [[Canopy Gorger]], [[Bridge from Below]], [[Glory Seeker]], [[End Hostilities]].
> RulesGuru source: https://rulesguru.org/?168RGBwnIII2ousJ896n1BGG

**Expected verdict:** Bridge from Below triggers twice. Since both triggers are controlled by Ariel (113.8), they chooses in what order they are placed onto the stack. (603.3b) If Bridge from Below is no longer in the graveyard when the first trigger resolves, Ariel won't create a zombie token. (603.4)

**Required reasoning:**
- Match the RulesGuru cited answer for question 168.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [113.8], [603.3b], [603.4]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Triggered abilities, Zone-changes, The stack.

## RG169. Nathalie controls Counterbalance. Armando casts Sudden Shock. Can Nathalie reveal t...

**Scenario:**
> Nathalie controls Counterbalance. Armando casts Sudden Shock. Can Nathalie reveal the top card of their library to try and counter the Sudden Shock?
> Cards involved: [[Counterbalance]], [[Sudden Shock]].
> RulesGuru source: https://rulesguru.org/?169RGBwnIII1CpB4jGG

**Expected verdict:** Yes. Split second does not affect triggered abilities in any way. (702.61a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 169.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [702.61a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Non-evergreen keywords, Triggered abilities, The stack.

## RG171. Nico controls Leovold, Emissary of Trest and Notion Thief. Aminah has already drawn...

**Scenario:**
> Nico controls Leovold, Emissary of Trest and Notion Thief. Aminah has already drawn for the turn and casts Brainstorm. What happens?
> Cards involved: [[Leovold, Emissary of Trest]], [[Notion Thief]], [[Brainstorm]].
> RulesGuru source: https://rulesguru.org/?171RGBwnIIIifqLt8yPGG

**Expected verdict:** Aminah puts 2 cards from their hand on top of their library. They can't draw more than one card each turn, so Notion Thief has nothing to replace.

**Required reasoning:**
- Match the RulesGuru cited answer for question 171.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Replacement effects, Drawing a card, "Can't" effects.

## RG172. Audrina controls Leovold, Emissary of Trest and Notion Thief. Nathanael casts Brain...

**Scenario:**
> Audrina controls Leovold, Emissary of Trest and Notion Thief. Nathanael casts Brainstorm. What happens?
> Cards involved: [[Leovold, Emissary of Trest]], [[Notion Thief]], [[Brainstorm]].
> RulesGuru source: https://rulesguru.org/?172RGBwnIIIifqLt8yPGG

**Expected verdict:** Audrina draws 3 cards, then Nathanael puts 2 cards from their hand on top of their library. Cards are drawn one at a time. (121.2) The first card draw from Brainstorm is the first card that Nathanael would draw this turn, so Leovold, Emissary of Trest doesn't affect it and Notion Thief causes Audrina to draw a card instead. Nathanael still hasn't drawn a card this turn, so the same process is repeated with the next two draws. Then Nathanael finishes resolving Brainstorm.

**Required reasoning:**
- Match the RulesGuru cited answer for question 172.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [121.2]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Replacement effects, Drawing a card, "Can't" effects.

## RG173. Angelo controls Alhammarret's Archive, Thought Reflection, Blood Scrivener, Lich, a...

**Scenario:**
> Angelo controls Alhammarret's Archive, Thought Reflection, Blood Scrivener, Lich, and Words of Worship. Nico controls Chains of Mephistopheles, Alms Collector and Rain of Gore. Neither player has any cards in hand. Angelo activates Words of Worship once, then moves to their draw step. What is the greatest number of cards that Angelo can end up with in their hand, assuming they make the best possible choices? What else happens in that scenario?
> Cards involved: [[Alhammarret's Archive]], [[Thought Reflection]], [[Blood Scrivener]], [[Lich]], [[Words of Worship]], [[Chains of Mephistopheles]], [[Alms Collector]], [[Rain of Gore]].
> RulesGuru source: https://rulesguru.org/?173RGBwnIII58mDupcvvresCYfuhwSKkGG

**Expected verdict:** At most Angelo can end up with 29 cards in their hand.

Rain of Gore only applies to life gained due to a spell or ability, not a turn-based action, so it won't apply to any life gain caused by Words of Worship. Whenever multiple replacement effects apply to an event (such as Angelo drawing a card), the affected player will chose which one to apply first. (616.1) Once a replacement effect has been applied to an event, it will not apply again to that event or any events contained inside that event. (614.5)


* The event begins as "draw a card".
* Angelo chooses to apply Blood Scrivener's effect. The event is "Draw 2 cards, lose 1 life".
* Angelo must apply Alms Collector's effect. (616.1g) The event is "Draw a card, Nico draws a card, lose 1 life". (121.2c)
* Angelo chooses to apply Words of Worship's effect to their draw. The event is "Gain 5 life, Nico draws a card, lose 1 life".
* Angelo must apply Alhammarret's Archive's first effect to the life gain. The event is "Gain 10 life, Nico draws a card, lose 1 life".
* Angelo must apply Lich's effect to the life gain. The event is "Draw 10 cards, Nico draws a card, lose 1 life".
* Angelo must apply Thought Reflection's effect to the first card draw. The event is "Draw 2 cards, draw 9 cards, Nico draws a card, lose 1 life".
* Angelo draws a card. The event is "Draw a card, draw 9 cards, Nico draws a card, lose 1 life".
* Angelo chooses to apply Chains of Mephistopheles's effect to the first card draw. The event is "Discard a card, draw a card, draw 9 cards, Nico draws a card, lose 1 life".
* Angelo discards a card. The event is "Draw a card, draw 9 cards, Nico draws a card, lose 1 life".
* Angelo must apply Alhammarret's Archive's effect to the first card draw. The event is "Draw 2 cards, draw 9 cards, Nico draws a card, lose 1 life".
* Angelo draws 2 cards. The event is "Draw 9 cards, Nico draws a card, lose 1 life".
* For the next 9 cards draws, Angelo chooses to apply and perform Chains of Mephistopheles's effect followed by Alhammarret's Archive and Thought Reflection's effects, making them all "discard a card, draw 4 cards". The event is "Nico draws a card, lose 1 life".
* Nico must apply Chains of Mephistopheles's effect to the card draw, putting a card from their library into their graveyard.
* Angelo loses 1 life.


Angelo has 29 cards in their hand and 10 cards in their graveyard. Nico has 1 card in their graveyard. Angelo has lost 1 life.

**Required reasoning:**
- Match the RulesGuru cited answer for question 173.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [121.2c], [614.5], [616.1], [616.1g]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Complicated. Tags: Replacement effects, Drawing a card, Life.

## RG174. Ainsley controls 2 Thought Reflections. They move to their draw step. How many card...

**Scenario:**
> Ainsley controls 2 Thought Reflections. They move to their draw step. How many cards do they draw?
> Cards involved: [[Thought Reflection]].
> RulesGuru source: https://rulesguru.org/?174RGBwnIIIemAGG

**Expected verdict:** 4. The first Thought Reflection replaces drawing 1 card with drawing 2 cards, and the second Thought Reflection replaces each of those card draws with 2 card draws. Neither effect will apply more than once to the same event. (614.5)

**Required reasoning:**
- Match the RulesGuru cited answer for question 174.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [614.5]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Drawing a card, Replacement effects.

## RG175. Nolan controls a Lich and a Lich's Mirror. Alex attacks with Nema Siltlurker and No...

**Scenario:**
> Nolan controls a Lich and a Lich's Mirror. Alex attacks with Nema Siltlurker and Nolan doesn't block. What happens?
> Cards involved: [[Lich]], [[Lich's Mirror]], [[Nema Siltlurker]].
> RulesGuru source: https://rulesguru.org/?175RGBwnIIIiglKiByLGG

**Expected verdict:** Nolan can't sacrifice 3 permanents since they don't control that many, but they have to sacrifice as many as they can. (609.3) Nolan sacrifices the Lich and the Lich's Mirror, and then loses the game.

**Required reasoning:**
- Match the RulesGuru cited answer for question 175.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [609.3]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Leaving the game, Replacement effects, Resolving objects, Damage.

## RG178. Adelina controls Leovold, Emissary of Trest and Chains of Mephistopheles. On Adelin...

**Scenario:**
> Adelina controls Leovold, Emissary of Trest and Chains of Mephistopheles. On Adelina's turn, Nikolai has four cards in hand and casts Brainstorm. What happens as Brainstorm resolves?
> Cards involved: [[Leovold, Emissary of Trest]], [[Chains of Mephistopheles]], [[Brainstorm]].
> RulesGuru source: https://rulesguru.org/?178RGBwnIIIifqljf8VGG

**Expected verdict:** Nikolai discards a card and then draws a card. Then Nikolai puts 2 cards from their hand on the top of their library.

Cards are drawn one at a time. (121.2) For Nikolai's first draw, Leovold, Emissary of Trest doesn't apply, since it's their first draw this turn, so Chains of Mephistopheles applies and makes them discard and then draw. Now they've drawn a card this turn, so Leovold, Emissary of Trest is "active". Their next two draws can't occur, so Chains of Mephistopheles's replacement effect is never applied. (614.17c) Then they finish resolving Brainstorm by putting two cards from their hand on top of their library.

**Required reasoning:**
- Match the RulesGuru cited answer for question 178.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [121.2], [614.17c]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Drawing a card, Replacement effects, "Can't" effects.

## RG179. Nico controls a Chalice of the Void with two charge counters. Alessandro has cast 3...

**Scenario:**
> Nico controls a Chalice of the Void with two charge counters. Alessandro has cast 3 spells previously this turn and casts a Brain Freeze, targeting Nico. What happens?
> Cards involved: [[Chalice of the Void]], [[Brain Freeze]].
> RulesGuru source: https://rulesguru.org/?179RGBwnIII1AAOkeGG

**Expected verdict:** Nico's trigger resolves first (603.3b), countering the Brain Freeze. Then the storm trigger resolves, making 3 copies of it. (702.40a, 608.2h) The copies were not cast, and do not cause Chalice of the Void to trigger again.

**Required reasoning:**
- Match the RulesGuru cited answer for question 179.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [603.3b], [608.2h], [702.40a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Triggered abilities, The stack, Non-evergreen keywords, Copy effects.

## RG180. Nico controls Smoldering Spires and Wastes. Adley casts Blood Moon. After it resolv...

**Scenario:**
> Nico controls Smoldering Spires and Wastes. Adley casts Blood Moon. After it resolves, they cast Price of Progress. How much damage is dealt to Nico?
> Cards involved: [[Smoldering Spires]], [[Wastes]], [[Blood Moon]], [[Price of Progress]].
> RulesGuru source: https://rulesguru.org/?180RGBwnIII3jemvcwpm3oGG

**Expected verdict:** 2. Blood Moon does not change the supertypes of the lands it affects, it just sets their subtypes to "Mountain" and removes any others. (109.2, 205.1a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 180.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [109.2], [205.1a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Type-changing effects.

## RG181. Alberto casts Last Chance. During the extra turn, can they cast Disallow to avoid l...

**Scenario:**
> Alberto casts Last Chance. During the extra turn, can they cast Disallow to avoid losing the game?
> Cards involved: [[Last Chance]], [[Disallow]].
> RulesGuru source: https://rulesguru.org/?181RGBwnIII1W5wpEGG

**Expected verdict:** Yes. Losing the game is a delayed triggered ability. (603.7)

**Required reasoning:**
- Match the RulesGuru cited answer for question 181.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [603.7]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Triggered abilities, Turn structure.

## RG182. Ari controls Boros Garrison, Humility, Magus of the Moon, and Branch of Vitu-Ghazi...

**Scenario:**
> Ari controls Boros Garrison, Humility, Magus of the Moon, and Branch of Vitu-Ghazi that entered the battlefield in that order. What are the characteristics of the Boros Garrison and Branch of Vitu-Ghazi?
> Cards involved: [[Boros Garrison]], [[Humility]], [[Magus of the Moon]], [[Branch of Vitu-Ghazi]].
> RulesGuru source: https://rulesguru.org/?182RGBwnIII2mTq0q0k4mnGG

**Expected verdict:** They are both Mountains with no abilities other than "{T}: Add {R}". Magus of the Moon's effect applies in layer 4 (613.1d), while Humility's effect applies in layer 6 and 7. (613.1f, 613.1g) Magus of the Moon is a 1/1 with no abilities, but it still turns nonbasic lands into Mountains.

**Required reasoning:**
- Match the RulesGuru cited answer for question 182.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [613.1d], [613.1f], [613.1g]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Layers, Dependency, Type-changing effects, Abilities, Static abilities, Continuous effects.

## RG183. Aubree has 0 life and controls Transcendence and two Opalescences. Nico has 1 life...

**Scenario:**
> Aubree has 0 life and controls Transcendence and two Opalescences. Nico has 1 life and controls an Enormous Baloth. Aubree attacks with all 3 creatures and Nico blocks the Transcendence with Enormous Baloth. What happens?
> Cards involved: [[Transcendence]], [[Opalescence]], [[Enormous Baloth]].
> RulesGuru source: https://rulesguru.org/?183RGBwnIIIlMgfopueGG

**Expected verdict:** When state-based actions are checked, Transcendence has 7 damage marked on it and dies (704.5g), and Nico has less than 0 life and loses the game. (704.5a) The game ends at this point, and state-based actions are not checked again. (104.1, 104.2a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 183.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [104.1], [104.2a], [704.5a], [704.5g]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: State-based actions, Damage, Combat, Zone-changes, Leaving the game.

## RG184. Brycen controls a Lich's Mastery owned by Cara due to their earlier Scrambleverse....

**Scenario:**
> Brycen controls a Lich's Mastery owned by Cara due to their earlier Scrambleverse. Ariel attacks Cara and Cara loses the game. What happens?
> Cards involved: [[Lich's Mastery]], [[Scrambleverse]].
> RulesGuru source: https://rulesguru.org/?184RGBwnIII1Wxlh4GG

**Expected verdict:** All objects owned by Cara leave the game. (800.4a) Lich's Mastery triggers (603.10, 603.10a), and Brycen loses the game.

**Required reasoning:**
- Match the RulesGuru cited answer for question 184.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [603.10], [603.10a], [800.4a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Leaving the game, Multiplayer, Triggered abilities, Zone-changes.

## RG185. Agustin controls a Volrath's Shapeshifter. The top card of their graveyard is a Haa...

**Scenario:**
> Agustin controls a Volrath's Shapeshifter. The top card of their graveyard is a Haakon, Stromgald Scourge, and right beneath it is a Grid Monitor. Can Agustin cast the Haakon, Stromgald Scourge?
> Cards involved: [[Volrath's Shapeshifter]], [[Haakon, Stromgald Scourge]], [[Grid Monitor]].
> RulesGuru source: https://rulesguru.org/?185RGBwnIIImcrWia4lGG

**Expected verdict:** No. Agustin may put the Haakon, Stromgald Scourge onto the stack to begin casting it. (601.2, 601.2a) However when it comes time to check if the spell can be legally cast, it cannot. (601.2e)

**Required reasoning:**
- Match the RulesGuru cited answer for question 185.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [601.2], [601.2a], [601.2e]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Casting spells, Zone-changes, "Can't" effects, Text-changing effects.

## RG186. Alfred controls Volrath's Shapeshifter and Muldrotha, the Gravetide, and the top ca...

**Scenario:**
> Alfred controls Volrath's Shapeshifter and Muldrotha, the Gravetide, and the top card of their graveyard is Grid Monitor. Can Alfred cast the Grid Monitor?
> Cards involved: [[Volrath's Shapeshifter]], [[Muldrotha, the Gravetide]], [[Grid Monitor]].
> RulesGuru source: https://rulesguru.org/?186RGBwnIIImcs5ZkZXGG

**Expected verdict:** No. Alfred must be legally allowed to cast a spell in order to begin casting it. (601.2) None of the exceptions in [601.3] apply here.

**Required reasoning:**
- Match the RulesGuru cited answer for question 186.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [601.2], [601.3]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Casting spells, Zone-changes, "Can't" effects, Text-changing effects.

## RG188. Alexander controls a Volrath's Shapeshifter. The top card of their graveyard is a G...

**Scenario:**
> Alexander controls a Volrath's Shapeshifter. The top card of their graveyard is a Grid Monitor, and right beneath it is a Skaab Ruinator. Can Alexander cast the Skaab Ruinator, exiling the Grid Monitor and 2 other creature cards?
> Cards involved: [[Volrath's Shapeshifter]], [[Grid Monitor]], [[Skaab Ruinator]].
> RulesGuru source: https://rulesguru.org/?188RGBwnIIImcrVKD3pGG

**Expected verdict:** No. Costs for a spell are paid after its legality has already been checked. (601.2/601.3, 601.2h)

**Required reasoning:**
- Match the RulesGuru cited answer for question 188.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [601.2], [601.2h], [601.3]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Casting spells, Zone-changes, "Can't" effects, Text-changing effects.

## RG189. Ainsley owns an Eternal Scourge that was exiled by Nicolas's Ixalan's Binding. Can...

**Scenario:**
> Ainsley owns an Eternal Scourge that was exiled by Nicolas's Ixalan's Binding. Can Ainsley cast it?
> Cards involved: [[Eternal Scourge]], [[Ixalan's Binding]].
> RulesGuru source: https://rulesguru.org/?189RGBwnIII1JXduUGG

**Expected verdict:** No. Ainsley must be legally allowed to cast a spell in order to begin casting it. (601.2) The exceptions in [601.3] do not apply here.

**Required reasoning:**
- Match the RulesGuru cited answer for question 189.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [601.2], [601.3]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Casting spells, Zone-changes, "Can't" effects.

## RG190. Alondra controls Irrigated Farmland enchanted by Genju of the Fields. They activate...

**Scenario:**
> Alondra controls Irrigated Farmland enchanted by Genju of the Fields. They activate its ability to turn into a creature. After it resolves, they activate it again. Then they attack with it. How much life do they gain?
> Cards involved: [[Irrigated Farmland]], [[Genju of the Fields]].
> RulesGuru source: https://rulesguru.org/?190RGBwnIII1TJKprGG

**Expected verdict:** 4. It's a 2/5 with two instances of "Whenever this creature deals damage, its controller gains that much life." Each one will trigger and gain Alondra 2 life.

**Required reasoning:**
- Match the RulesGuru cited answer for question 190.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Abilities, Triggered abilities, Type-changing effects, Life.

## RG191. Anabelle controls Volrath's Shapeshifter and Yixlid Jailer. The top card of their g...

**Scenario:**
> Anabelle controls Volrath's Shapeshifter and Yixlid Jailer. The top card of their graveyard is Aven Soulgazer. Does Volrath's Shapeshifter have flying?
> Cards involved: [[Volrath's Shapeshifter]], [[Yixlid Jailer]], [[Aven Soulgazer]].
> RulesGuru source: https://rulesguru.org/?191RGBwnIIImcstb5DSGG

**Expected verdict:** Yes. Yixlid Jailer only removes abilities, not text, and text is what Volrath's Shapeshifter cares about. (113.1a) Volrath's Shapeshifter also gains the text of the Aven Soulgazer before Yixlid Jailer removes the abilities. (613.1)

**Required reasoning:**
- Match the RulesGuru cited answer for question 191.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [113.1a], [613.1]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Abilities, Text-changing effects, Copy effects, Layers.

## RG192. Nick controls a Yixlid Jailer. Ansley has a Golgari Brownscale in their graveyard a...

**Scenario:**
> Nick controls a Yixlid Jailer. Ansley has a Golgari Brownscale in their graveyard and chooses to dredge it during their draw step. Does Ansley gain 2 life?
> Cards involved: [[Yixlid Jailer]], [[Golgari Brownscale]].
> RulesGuru source: https://rulesguru.org/?192RGBwnIII2nwM9YGG

**Expected verdict:** This can't happen as described. Golgari Brownscale doesn't have dredge.

**Required reasoning:**
- Match the RulesGuru cited answer for question 192.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Abilities, Static abilities, Continuous effects, Triggered abilities, Replacement effects, Zone-changes.

## RG193. Nova controls a Yixlid Jailer. Ahmed has a Golgari Brownscale in their graveyard an...

**Scenario:**
> Nova controls a Yixlid Jailer. Ahmed has a Golgari Brownscale in their graveyard and returns it to their hand with Soul Strings. Does Ahmed gain 2 life?
> Cards involved: [[Yixlid Jailer]], [[Golgari Brownscale]], [[Soul Strings]].
> RulesGuru source: https://rulesguru.org/?193RGBwnIIImyux4OyQGG

**Expected verdict:** No. Golgari Brownscale's trigger cares about the game state immediately before it triggered. (603.10, 603.10a) At that time it was in the graveyard, and the trigger didn't exist.

**Required reasoning:**
- Match the RulesGuru cited answer for question 193.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [603.10], [603.10a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Abilities, Static abilities, Continuous effects, Triggered abilities, Zone-changes.

## RG194. Nathaly controls a Yixlid Jailer. Ayden has a Golgari Brownscale in their graveyard...

**Scenario:**
> Nathaly controls a Yixlid Jailer. Ayden has a Golgari Brownscale in their graveyard and casts Grave Exchange, returning Golgari Brownscale to their hand and making Nathaly sacrifice the Yixlid Jailer. Does Ayden gain 2 life?
> Cards involved: [[Yixlid Jailer]], [[Golgari Brownscale]], [[Grave Exchange]].
> RulesGuru source: https://rulesguru.org/?194RGBwnIIImyux4M6UGG

**Expected verdict:** No. The effects of Grave Exchange take place in the order written. (608.2c) Golgari Brownscale is returned to Ayden's hand first, then Yixlid Jailer is sacrificed. Golgari Brownscale's trigger cares about the game state immediately before it triggered. (603.10, 603.10a) At that time it was in the graveyard, and the trigger didn't exist.

**Required reasoning:**
- Match the RulesGuru cited answer for question 194.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [603.10], [603.10a], [608.2c]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Abilities, Static abilities, Continuous effects, Triggered abilities, Zone-changes, Resolving objects.

## RG195. Nico controls Psychic Battle. Aaden casts Mending Hands. Aaden has no cards in thei...

**Scenario:**
> Nico controls Psychic Battle. Aaden casts Mending Hands. Aaden has no cards in their library as the trigger resolves. Nico reveals Timberline Ridge. What happens to Mending Hands?
> Cards involved: [[Psychic Battle]], [[Mending Hands]], [[Timberline Ridge]].
> RulesGuru source: https://rulesguru.org/?195RGBwnIIIjClOoP61GG

**Expected verdict:** Nico revealed the card with the highest mana cost (0), so Nico may change the targets of the spell.

**Required reasoning:**
- Match the RulesGuru cited answer for question 195.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Resolving objects, Numbers and symbols.

## RG196. Noah controls a Yixlid Jailer. Addison cycles an Esper Sojourners. Does it trigger?

**Scenario:**
> Noah controls a Yixlid Jailer. Addison cycles an Esper Sojourners. Does it trigger?
> Cards involved: [[Yixlid Jailer]], [[Esper Sojourners]].
> RulesGuru source: https://rulesguru.org/?196RGBwnIII2nwLDoGG

**Expected verdict:** No. It does not have that ability once it is in the graveyard. (702.29c)

**Required reasoning:**
- Match the RulesGuru cited answer for question 196.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [702.29c]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Non-evergreen keywords, Zone-changes, Triggered abilities, Abilities.

## RG197. Nico controls Yixlid Jailer. Alison has Deep-Slumber Titan in their graveyard. Alis...

**Scenario:**
> Nico controls Yixlid Jailer. Alison has Deep-Slumber Titan in their graveyard. Alison casts Grave Upheaval to return the Deep-Slumber Titan to the battlefield. Does it enter tapped?
> Cards involved: [[Yixlid Jailer]], [[Deep-Slumber Titan]], [[Grave Upheaval]].
> RulesGuru source: https://rulesguru.org/?197RGBwnIIImyuoNnJMGG

**Expected verdict:** Yes. Enters-the-battlefield replacement effects care about how the permanent would exist on the battlefield for the purpose of determining whether to apply a replacement effect. (614.12) Deep-Slumber Titan would have the ability that makes it enter tapped on the battlefield, so it does apply.

**Required reasoning:**
- Match the RulesGuru cited answer for question 197.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [614.12]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Replacement effects, Zone-changes.

## RG198. Ariel controls Forerunner of the Empire with a +1/+1 counter and casts Polyraptor....

**Scenario:**
> Ariel controls Forerunner of the Empire with a +1/+1 counter and casts Polyraptor. If they always chooses to deal the damage with Forerunner of the Empire's trigger, how many Polyraptors will end up on the battlefield?
> Cards involved: [[Forerunner of the Empire]], [[Polyraptor]].
> RulesGuru source: https://rulesguru.org/?198RGBwnIII1Mb26vGG

**Expected verdict:** 11. One damage is dealt to the Forerunner of the Empire and Polyraptor. That creates a second Polyraptor, which deals one damage to each Polyraptor and Forerunner of the Empire. The first trigger to create a Polyraptor resolves and its damage trigger puts three more Polyraptor triggers onto the stack, for 4 in total. The first of those triggers resolves, dealing 1 damage to each of the 4 Polyraptor on the battlefield and putting 4 more triggers onto the stack, for 7 in total. This kills Forerunner of the Empire, so the remaining 7 Polyraptor triggers resolve without causing any more triggers.

**Required reasoning:**
- Match the RulesGuru cited answer for question 198.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Complicated. Tags: Triggered abilities, Resolving objects, Numbers and symbols.

## RG200. Nash controls Tsabo's Web. Does Addison's Slippery Karst untap during their untap s...

**Scenario:**
> Nash controls Tsabo's Web. Does Addison's Slippery Karst untap during their untap step?
> Cards involved: [[Tsabo's Web]], [[Slippery Karst]].
> RulesGuru source: https://rulesguru.org/?200RGBwnIII2j0Wv9GG

**Expected verdict:** No. (702.29b)

**Required reasoning:**
- Match the RulesGuru cited answer for question 200.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [702.29b]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Non-evergreen keywords, Activated abilities, Abilities, Mana abilities.

## RG202. Ayleen controls Drought and Andradite Leech. How many Swamps would they have to sac...

**Scenario:**
> Ayleen controls Drought and Andradite Leech. How many Swamps would they have to sacrifice in order to cast a Dark Betrayal?
> Cards involved: [[Drought]], [[Andradite Leech]], [[Dark Betrayal]].
> RulesGuru source: https://rulesguru.org/?202RGBwnIIIg8CYkYtvGG

**Expected verdict:** 1. The mana cost of a spell doesn't change, regardless of what was paid for it. (118.8d)

**Required reasoning:**
- Match the RulesGuru cited answer for question 202.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [118.8d]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Costs, Casting spells, Mana, Numbers and symbols.

## RG203. Aviana controls Drought and Edgewalker. How many Swamps would they have to sacrific...

**Scenario:**
> Aviana controls Drought and Edgewalker. How many Swamps would they have to sacrifice in order to cast a Draugr Necromancer?
> Cards involved: [[Drought]], [[Edgewalker]], [[Draugr Necromancer]].
> RulesGuru source: https://rulesguru.org/?203RGBwnIIIg8DaaqFAGG

**Expected verdict:** 1. The mana cost of a spell doesn't change, regardless of what needs to be paid for it. (118.8d)

**Required reasoning:**
- Match the RulesGuru cited answer for question 203.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [118.8d]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Costs, Casting spells, Mana, Numbers and symbols.

## RG204. Nico controls Drought. How many Swamps would Alfonso have to sacrifice in order to...

**Scenario:**
> Nico controls Drought. How many Swamps would Alfonso have to sacrifice in order to cast Beckon Apparition?
> Cards involved: [[Drought]], [[Beckon Apparition]].
> RulesGuru source: https://rulesguru.org/?204RGBwnIII1HbXZAGG

**Expected verdict:** 1. Hybrid mana symbols are the colors of their constituent mana symbols. (107.4e)

**Required reasoning:**
- Match the RulesGuru cited answer for question 204.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [107.4e]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Mana, Numbers and symbols, Costs.

## RG205. Nasir controls a Drought. How many Swamps would Ainsley have to sacrifice in order...

**Scenario:**
> Nasir controls a Drought. How many Swamps would Ainsley have to sacrifice in order to cast a Surgical Extraction?
> Cards involved: [[Drought]], [[Surgical Extraction]].
> RulesGuru source: https://rulesguru.org/?205RGBwnIII1Hc2m4GG

**Expected verdict:** 1. Phyrexian mana symbols are a mana symbol of that color. (107.4f)

**Required reasoning:**
- Match the RulesGuru cited answer for question 205.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [107.4f]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Mana, Numbers and symbols, Costs.

## RG206. Nicole controls Psychic Battle. Abel casts Lightning Helix. Neither player has any...

**Scenario:**
> Nicole controls Psychic Battle. Abel casts Lightning Helix. Neither player has any cards in their library when the trigger resolves. What happens?
> Cards involved: [[Psychic Battle]], [[Lightning Helix]].
> RulesGuru source: https://rulesguru.org/?206RGBwnIII259w49GG

**Expected verdict:** Neither player revealed a card with the highest mana value, so neither of them may change the targets of the spell.

**Required reasoning:**
- Match the RulesGuru cited answer for question 206.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Resolving objects, Numbers and symbols.

## RG209. Alessandra controls Soul-Scar Mage and casts Pillar of Flame targeting Nico's Dakmo...

**Scenario:**
> Alessandra controls Soul-Scar Mage and casts Pillar of Flame targeting Nico's Dakmor Scorpion. What zone does it move to?
> Cards involved: [[Soul-Scar Mage]], [[Pillar of Flame]], [[Dakmor Scorpion]].
> RulesGuru source: https://rulesguru.org/?209RGBwnIIIkW631dBxGG

**Expected verdict:** The graveyard. Soul-Scar Mage replaces the damage with putting that many -1/-1 counters on the Dakmor Scorpion. No creature was "dealt damage this way".

**Required reasoning:**
- Match the RulesGuru cited answer for question 209.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Damage, Replacement effects, Resolving objects.

## RG212. Amelia has taken control of a Khenra Scrapper from Nehemiah with Traitorous Blood,...

**Scenario:**
> Amelia has taken control of a Khenra Scrapper from Nehemiah with Traitorous Blood, which Amelia exerts. After Amelia ends their turn, will it untap during Nehemiah's untap step?
> Cards involved: [[Khenra Scrapper]], [[Traitorous Blood]].
> RulesGuru source: https://rulesguru.org/?212RGBwnIII1V1z0xGG

**Expected verdict:** Yes. A player exerting a permanent only causes it to not untap during that player's next untap step, not any untap step that would untap it. (701.43a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 212.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [701.43a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Non-evergreen keywords, Turn structure.

## RG213. Alanna controls Desecrated Tomb and casts Skaab Goliath from their hand, exiling cr...

**Scenario:**
> Alanna controls Desecrated Tomb and casts Skaab Goliath from their hand, exiling creature cards from their graveyard. How many Bat tokens do they create?
> Cards involved: [[Desecrated Tomb]], [[Skaab Goliath]].
> RulesGuru source: https://rulesguru.org/?213RGBwnIII1EEEsyGG

**Expected verdict:** One. The total cost to cast a spell consists of all of the individual costs. (601.2f) The individual costs may be paid in any order relative to each other, but all components of each individual cost must be paid at the same time. (601.2h) Alanna may pay the mana and then exile the creature cards or exile the creature cards and then pay the mana, but the creature cards will all be exiled at the same time. Desecrated Tomb is looking for the event of "some number of creature cards being exiled from the graveyard", so it will only trigger once. (700.1)

**Required reasoning:**
- Match the RulesGuru cited answer for question 213.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [601.2f], [601.2h], [700.1]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Costs, Casting spells, Zone-changes, Triggered abilities.

## RG214. Aubrey casts Metamorphic Alteration, targeting a crewed Weatherlight. As it resolve...

**Scenario:**
> Aubrey casts Metamorphic Alteration, targeting a crewed Weatherlight. As it resolves, they choose to copy a Scarwood Goblins. What happens at the end of the turn?
> Cards involved: [[Metamorphic Alteration]], [[Weatherlight]], [[Scarwood Goblins]].
> RulesGuru source: https://rulesguru.org/?214RGBwnIIIiDmTZ4rUGG

**Expected verdict:** The effect making Weatherlight a creature ends. Metamorphic Alteration is still enchanting it and the effect making it a copy of Scarwood Goblins still exists. (700.7) It's a Scarwood Goblins.

**Required reasoning:**
- Match the RulesGuru cited answer for question 214.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [700.7]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Copy effects, Continuous effects, Type-changing effects, Auras.

## RG215. Ainsley controls Dream Halls and activates Soul Sculptor, targeting Pitchstone Wall...

**Scenario:**
> Ainsley controls Dream Halls and activates Soul Sculptor, targeting Pitchstone Wall. Ainsley casts Balduvian Barbarians, discarding Barktooth Warbeard to pay for it. Does Pitchstone Wall trigger?
> Cards involved: [[Dream Halls]], [[Soul Sculptor]], [[Pitchstone Wall]], [[Balduvian Barbarians]], [[Barktooth Warbeard]].
> RulesGuru source: https://rulesguru.org/?215RGBwnIIIobZ8uziCKuf5SGG

**Expected verdict:** No. The final step of casting a spell is when the spell becomes "cast" (601.2i), and that is when Soul Sculptor's effect ends. Discarding Barktooth Warbeard is a cost to cast the spell, which happens earlier. (601.2h)

**Required reasoning:**
- Match the RulesGuru cited answer for question 215.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [601.2h], [601.2i]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Intermediate. Tags: Casting spells, Abilities, Triggered abilities, Continuous effects.

## RG216. Autumn activates Soul Sculptor, targeting their Glademuse. After that resolves, the...

**Scenario:**
> Autumn activates Soul Sculptor, targeting their Glademuse. After that resolves, they cast Cylian Elf. Does Glademuse trigger?
> Cards involved: [[Soul Sculptor]], [[Glademuse]], [[Cylian Elf]].
> RulesGuru source: https://rulesguru.org/?216RGBwnIIIkVlTkAz8GG

**Expected verdict:** Yes. The final step of casting a spell is when the spell becomes "cast" (601.2i), and that is when Soul Sculptor's effect ends. Triggered abilities are checked immediately after the event occurs to see if they trigger. (603.10) At that time, Glademuse has its abilities.

**Required reasoning:**
- Match the RulesGuru cited answer for question 216.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [601.2i], [603.10]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Intermediate. Tags: Casting spells, Abilities, Triggered abilities, Continuous effects.

## RG217. Aleena controls Lantern of Insight and the top card of their library is an Eldrazi...

**Scenario:**
> Aleena controls Lantern of Insight and the top card of their library is an Eldrazi Skyspawner. Aleena casts Ancient Stirrings. If they chooses to take the Eldrazi Skyspawner, what happens?
> Cards involved: [[Lantern of Insight]], [[Eldrazi Skyspawner]], [[Ancient Stirrings]].
> RulesGuru source: https://rulesguru.org/?217RGBwnIIIibwDZPfJGG

**Expected verdict:** Aleena doesn't change the order of the 5 cards on top while looking at them. (401.2) If the top card moves to their hand, they reveal the next card down. Then they put the rest on the bottom of their library.

**Required reasoning:**
- Match the RulesGuru cited answer for question 217.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [401.2]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Resolving objects, Libraries.

## RG218. Ainsley casts Incurable Ogre. Nick controls a Baral, Chief of Compliance and casts...

**Scenario:**
> Ainsley casts Incurable Ogre. Nick controls a Baral, Chief of Compliance and casts Mystic Confluence, choosing "Counter target spell unless its controller pays {3}." all three times. Ainsley does not pay any mana as Mystic Confluence resolves. How many times does Baral, Chief of Compliance trigger?
> Cards involved: [[Incurable Ogre]], [[Baral, Chief of Compliance]], [[Mystic Confluence]].
> RulesGuru source: https://rulesguru.org/?218RGBwnIIIhHHWhz73GG

**Expected verdict:** Once. If a player chooses the same mode on a spell multiple times, the instructions of those modes are followed in sequence. (700.2d) To counter a spell means to move it from the stack to the graveyard. (701.6a) Once that has been done the first time, the Incurable Ogre is in the graveyard and is no longer a legal target for Mystic Confluence. It will not be countered again.

**Required reasoning:**
- Match the RulesGuru cited answer for question 218.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [700.2d], [701.6a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: The stack, Resolving objects, Triggered abilities, Zone-changes, Targets.

## RG219. Alfred controls Solemnity and casts Highspire Artisan. What happens if Alfred choos...

**Scenario:**
> Alfred controls Solemnity and casts Highspire Artisan. What happens if Alfred chooses to not create the Servo tokens?
> Cards involved: [[Solemnity]], [[Highspire Artisan]].
> RulesGuru source: https://rulesguru.org/?219RGBwnIII2cS5gMGG

**Expected verdict:** This can't happen as described. Alfred must create the Servo tokens.

Fabricate means "When this permanent enters the battlefield, you may put N +1/+1 counters on it. If you don’t, create N 1/1 colorless Servo artifact creature tokens." ([702.123a]) Highspire Artisan can't get counters, so Alfred can't choose to put counters on it. (118.12, 614.17b)

**Required reasoning:**
- Match the RulesGuru cited answer for question 219.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [118.12], [614.17b], [702.123a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Non-evergreen keywords, "Can't" effects, Resolving objects, Counters, Tokens.

## RG220. Alexia controls a The Flame of Keld with 2 lore counters on it and Soul-Scar Mage....

**Scenario:**
> Alexia controls a The Flame of Keld with 2 lore counters on it and Soul-Scar Mage. Alexia puts the third lore counter on The Flame of Keld and resolves its final chapter ability. Alexia then casts Mugging, targeting Nathan's Ancient Crab. How many -1/-1 counters are placed on the Ancient Crab?
> Cards involved: [[The Flame of Keld]], [[Soul-Scar Mage]], [[Mugging]], [[Ancient Crab]].
> RulesGuru source: https://rulesguru.org/?220RGBwnIII3pVhTgmddZfGG

**Expected verdict:** There are two replacement effects trying to apply to the damage being dealt, so Nathan chooses which one to apply first. (616.1) If they apply The Flame of Keld's effect first, Soul-Scar Mage's effect will then apply afterwards, and 4 -1/-1 counters will be placed on the Ancient Crab. If they apply the Soul-Scar Mage's effect first, the The Flame of Keld's effect will no longer be applicable and the Ancient Crab will only receive 2 -1/-1 counters. (616.1f)

**Required reasoning:**
- Match the RulesGuru cited answer for question 220.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [616.1], [616.1f]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Intermediate. Tags: Damage, Counters, Replacement effects.

## RG221. Angelina controls a Metallic Mimic naming "Dragon" and casts a Hellkite Hatchling....

**Scenario:**
> Angelina controls a Metallic Mimic naming "Dragon" and casts a Hellkite Hatchling. If Angelina chooses to devour the Metallic Mimic, how many +1/+1 counters does the Hellkite Hatchling enter the battlefield with?
> Cards involved: [[Metallic Mimic]], [[Hellkite Hatchling]].
> RulesGuru source: https://rulesguru.org/?221RGBwnIII1YYNu0GG

**Expected verdict:** Hellkite Hatchling will enter the battlefield with 2 counters, regardless of any choices made by Angelina. As Hellkite Hatchling enters the battlefield, Angelina can choose which of the two replacement effects to apply first, devour or Metallic Mimic's effect. (616.1) Even if Angelina applies the devour effect first, that action is not performed yet- the game simply knows that that effect should be considered for the purpose of determining how Hellkite Hatchling will be affected by other replacement effects. The Metallic Mimic is still on the battlefield, so its effect will apply and give Hellkite Hatchling an additional +1/+1 counter. (614.12, 616.1f)

**Required reasoning:**
- Match the RulesGuru cited answer for question 221.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [614.12], [616.1], [616.1f]

**Why this test matters:** Imported RulesGuru benchmark. Level: Corner Case. Complexity: Simple. Tags: Zone-changes, Replacement effects, Counters, Non-evergreen keywords.

## RG222. Nikolai controls Dryad Arbor. Andi casts Overwhelming Splendor, enchanting Nikolai....

**Scenario:**
> Nikolai controls Dryad Arbor. Andi casts Overwhelming Splendor, enchanting Nikolai. After it resolves, can Nikolai tap the Dryad Arbor for {G}?
> Cards involved: [[Dryad Arbor]], [[Overwhelming Splendor]].
> RulesGuru source: https://rulesguru.org/?222RGBwnIII1Hhq5nGG

**Expected verdict:** No. It has the ability to tap for {G} due to its basic land subtype (305.6), and it loses it in layer 6. (613.1f)

**Required reasoning:**
- Match the RulesGuru cited answer for question 222.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [305.6], [613.1f]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Layers, Mana abilities, Lands, Abilities.

## RG223. Aspen controls two Plains, a Phyrexian Altar and a Hostage Taker that exiled their...

**Scenario:**
> Aspen controls two Plains, a Phyrexian Altar and a Hostage Taker that exiled their Grid Monitor. Can they cast Wretched Gryff, sacrificing the Hostage Taker to Phyrexian Altar for the {U} and sacrificing the Grid Monitor to emerge?
> Cards involved: [[Plains]], [[Phyrexian Altar]], [[Hostage Taker]], [[Grid Monitor]], [[Wretched Gryff]].
> RulesGuru source: https://rulesguru.org/?223RGBwnIIIthWFNYPVlJSvvGG

**Expected verdict:** No. Emerge reduces the cost of the Wretched Gryff by the sacrificed creature's mana value. ([702.119a]) The total cost of the Wretched Gryff must be determined before any costs are paid or mana abilities are activated (601.2f), so the creature to be sacrificed must be chosen before that point. ([601.2b], [702.119c]) It isn't on the battlefield yet, so it can't be chosen.

**Required reasoning:**
- Match the RulesGuru cited answer for question 223.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [601.2b], [601.2f], [702.119a], [702.119c]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Intermediate. Tags: Non-evergreen keywords, Casting spells, Costs.

## RG225. Nico's commander is Isamaru, Hound of Konda, which Amalia has taken control of with...

**Scenario:**
> Nico's commander is Isamaru, Hound of Konda, which Amalia has taken control of with Domestication. Nico currently has 20 life and has been dealt 20 combat damage by Isamaru, Hound of Konda over the course of previous turns. Amalia attacks with Isamaru, Hound of Konda. Does Nico lose the game?
> Cards involved: [[Isamaru, Hound of Konda]], [[Domestication]].
> RulesGuru source: https://rulesguru.org/?225RGBwnIII1TK3CtGG

**Expected verdict:** Yes. A player that's been dealt 21 or more combat damage by the same commander loses the game. (704.6c) It doesn't matter who controls or owns that commander.

**Required reasoning:**
- Match the RulesGuru cited answer for question 225.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [704.6c]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Commander, Damage, Leaving the game.

## RG226. Nataly has 9 poison counters. Avery attacks with a Glistener Elf, and Nataly casts...

**Scenario:**
> Nataly has 9 poison counters. Avery attacks with a Glistener Elf, and Nataly casts Angel's Grace before damage is dealt. What happens?
> Cards involved: [[Glistener Elf]], [[Angel's Grace]].
> RulesGuru source: https://rulesguru.org/?226RGBwnIII1NUqxUGG

**Expected verdict:** Nataly is dealt 1 damage and gets 1 poison counter. (702.90b) They can't lose the game however, so nothing else happens. When Avery ends their turn, Nataly loses the game during the cleanup step. (514.2, 514.3a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 226.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [514.2], [514.3a], [702.90b]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Non-evergreen keywords, Leaving the game, Counters, Replacement effects.

## RG227. Ahmed casts Marrow Chomper, choosing to devour Alpine Grizzly as it resolves. Does...

**Scenario:**
> Ahmed casts Marrow Chomper, choosing to devour Alpine Grizzly as it resolves. Does their Porphyry Nodes trigger?
> Cards involved: [[Marrow Chomper]], [[Alpine Grizzly]], [[Porphyry Nodes]].
> RulesGuru source: https://rulesguru.org/?227RGBwnIIIiwtvioffGG

**Expected verdict:** No. The Alpine Grizzly is sacrificed at the same time as Marrow Chomper enters the battlefield. (702.82a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 227.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [702.82a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Replacement effects, Zone-changes, Triggered abilities, Non-evergreen keywords.

## RG228. Ashley controls a Gliding Licid. They activates its first ability targeting itself....

**Scenario:**
> Ashley controls a Gliding Licid. They activates its first ability targeting itself. What happens?
> Cards involved: [[Gliding Licid]].
> RulesGuru source: https://rulesguru.org/?228RGBwnIIIbkBGG

**Expected verdict:** Gliding Licid becomes an Aura enchantment with enchant creature. It cannot become attached to itself because it is no longer a creature. (205.1a, 701.3b) When state-based actions are checked, it will be put into the graveyard. (704.5m)

**Required reasoning:**
- Match the RulesGuru cited answer for question 228.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [205.1a], [701.3b], [704.5m]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Auras, Resolving objects.

## RG229. Neymar controls Commander Eesha. Adelyn casts Elder Deep-Fiend. Can they target Com...

**Scenario:**
> Neymar controls Commander Eesha. Adelyn casts Elder Deep-Fiend. Can they target Commander Eesha with Elder Deep-Fiend's abliity?
> Cards involved: [[Commander Eesha]], [[Elder Deep-Fiend]].
> RulesGuru source: https://rulesguru.org/?229RGBwnIII1BQpg7GG

**Expected verdict:** No. Protection from creatures applies to creature cards in any zone (702.16a), and prevents abilities from a creature source from targeting the Commander Eesha. (702.16b)

**Required reasoning:**
- Match the RulesGuru cited answer for question 229.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [702.16a], [702.16b]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Evergreen keywords, Abilities, Triggered abilities, Targets.

## RG230. Ayaan controls Great Hart that's enchanted with 2 Vampiric Link. Ayaan attacks, and...

**Scenario:**
> Ayaan controls Great Hart that's enchanted with 2 Vampiric Link. Ayaan attacks, and Nico declares no blockers. How much life does Ayaan gain?
> Cards involved: [[Great Hart]], [[Vampiric Link]].
> RulesGuru source: https://rulesguru.org/?230RGBwnIII1P0iugGG

**Expected verdict:** 4. Each Vampiric Link gives Great Hart a separate triggered ability. They will each trigger and resolve independently.

**Required reasoning:**
- Match the RulesGuru cited answer for question 230.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: 0. Complexity: Simple. Tags: Combat, Damage, Triggered abilities, Life.

## RG231. Ainsley controls Bloodline Keeper and 4 2/2 Vampire creature tokens. They activate...

**Scenario:**
> Ainsley controls Bloodline Keeper and 4 2/2 Vampire creature tokens. They activate Bloodline Keeper's ability to transform it into Lord of Lineage. In response, Nyla casts Sonic Seizure targeting the Bloodline Keeper. In response, Ainsley activates the transform ability again. After everything has resolved, is the Bloodline Keeper/Lord of Lineage alive?
> Cards involved: [[Bloodline Keeper]], [[Lord of Lineage]], [[Sonic Seizure]].
> RulesGuru source: https://rulesguru.org/?231RGBwnIIIeT6krE5pGG

**Expected verdict:** Yes. The top ability on the stack will resolve first, transforming Bloodline Keeper. (405.5) Then the Sonic Seizure will resolve. When the second transform ability resolves, it does nothing since Bloodline Keeper has already transformed since the ability was put onto the stack. (701.27f)

**Required reasoning:**
- Match the RulesGuru cited answer for question 231.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [405.5], [701.27f]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Double-faced cards, The stack, Non-evergreen keywords.

## RG232. Alex has Felhide Minotaur and two Ichorids in their graveyard. On their upkeep, the...

**Scenario:**
> Alex has Felhide Minotaur and two Ichorids in their graveyard. On their upkeep, they resolve the trigger of the first Ichorid, exiling the second Ichorid. As the second trigger resolves, can Alex choose to exile the Felhide Minotaur? If so, what happens?
> Cards involved: [[Felhide Minotaur]], [[Ichorid]].
> RulesGuru source: https://rulesguru.org/?232RGBwnIII1KVkn5GG

**Expected verdict:** No. If Ichorid isn't in the graveyard when the trigger begins to resolve, it is removed from the stack. (603.4)

**Required reasoning:**
- Match the RulesGuru cited answer for question 232.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [603.4]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Zone-changes, Triggered abilities, Resolving objects.

## RG234. Nico controls Charmed Pendant. Ashley casts Wipe Away targeting the Charmed Pendant...

**Scenario:**
> Nico controls Charmed Pendant. Ashley casts Wipe Away targeting the Charmed Pendant. Can Nico activate it in response?
> Cards involved: [[Charmed Pendant]], [[Wipe Away]].
> RulesGuru source: https://rulesguru.org/?234RGBwnIII1AVhmLGG

**Expected verdict:** Yes. Charmed Pendant's ability is a mana ability. (605.1a) Split second does not prevent mana abilities from being activated. (702.61a) "Activate only as an instant" simply means that Nico must have priority, not that Nico could actually cast an instant at that time. (304.5)

**Required reasoning:**
- Match the RulesGuru cited answer for question 234.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [304.5], [605.1a], [702.61a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Non-evergreen keywords, The stack, Activated abilities, Abilities, Mana abilities, Timing and priority.

## RG235. Adrian currently has 10 life, and Noa has 8 life. Adrian casts Duplicant, exiling N...

**Scenario:**
> Adrian currently has 10 life, and Noa has 8 life. Adrian casts Duplicant, exiling Noa's Death's Shadow. What are the power and toughness of the Duplicant?
> Cards involved: [[Duplicant]], [[Death's Shadow]].
> RulesGuru source: https://rulesguru.org/?235RGBwnIII1HmDnPGG

**Expected verdict:** 13/13. Death's Shadow's ability only functions on the battlefield, so in exile it is a 13/13. (113.6) Duplicant only gains the power, toughness, and creature types of the exiled card, not its abilities.

**Required reasoning:**
- Match the RulesGuru cited answer for question 235.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [113.6]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Abilities, Static abilities, Continuous effects.

## RG236. Avalynn attacks with Daxos of Meletis and exiles Glaring Spotlight as its trigger r...

**Scenario:**
> Avalynn attacks with Daxos of Meletis and exiles Glaring Spotlight as its trigger resolves. Nikolai casts Strangling Soot targeting the Daxos of Meletis. In the postcombat main phase, Avalynn casts Necromantic Summons to return the Daxos of Meletis back to the battlefield. Can Avalynn cast the Glaring Spotlight?
> Cards involved: [[Daxos of Meletis]], [[Glaring Spotlight]], [[Strangling Soot]], [[Necromantic Summons]].
> RulesGuru source: https://rulesguru.org/?236RGBwnIII2usvlcuDDrDGG

**Expected verdict:** Yes. Being allowed to cast the Glaring Spotlight is a part of the resolution of the Daxos of Meletis's trigger. It doesn't matter if the Daxos of Meletis is on the battlefield or not.

**Required reasoning:**
- Match the RulesGuru cited answer for question 236.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Casting spells, Resolving objects, Zone-changes.

## RG237. Alonso controls Carpet of Flowers. Nico controls no Islands and controls Rayne, Aca...

**Scenario:**
> Alonso controls Carpet of Flowers. Nico controls no Islands and controls Rayne, Academy Chancellor. Can Alonso choose to add 0 mana during their first main phase in order to not have Carpet of Flowers trigger again in their second main phase?
> Cards involved: [[Carpet of Flowers]], [[Rayne, Academy Chancellor]].
> RulesGuru source: https://rulesguru.org/?237RGBwnIII1A40oJGG

**Expected verdict:** No. Alonso can choose to add 0 mana the first time the trigger resolves, but when the second main phase begins, Alonso has not "added mana with this ability", so it will trigger again.

**Required reasoning:**
- Match the RulesGuru cited answer for question 237.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Mana, Resolving objects.

## RG238. Aspen controls Village Survivors and Streetbreaker Wurm and has 6 life. Nico contro...

**Scenario:**
> Aspen controls Village Survivors and Streetbreaker Wurm and has 6 life. Nico controls Norn's Annex. If Aspen attacks with Streetbreaker Wurm, paying 2 life, will it become tapped?
> Cards involved: [[Village Survivors]], [[Streetbreaker Wurm]], [[Norn's Annex]].
> RulesGuru source: https://rulesguru.org/?238RGBwnIIIm800Ygo8GG

**Expected verdict:** Yes. Tapping creatures to attack is done before paying any costs to attack. (508.1f, 508.1j)

**Required reasoning:**
- Match the RulesGuru cited answer for question 238.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [508.1f], [508.1j]

**Why this test matters:** Imported RulesGuru benchmark. Level: Corner Case. Complexity: Simple. Tags: Combat, Costs, Turn structure, Life.

## RG239. Adan controls Gaea's Cradle and no creatures. Nico controls a Contamination. If Ada...

**Scenario:**
> Adan controls Gaea's Cradle and no creatures. Nico controls a Contamination. If Adan taps the Gaea's Cradle, what mana is produced, if any?
> Cards involved: [[Gaea's Cradle]], [[Contamination]].
> RulesGuru source: https://rulesguru.org/?239RGBwnIII1MNcflGG

**Expected verdict:** No mana is produced. Gaea's Cradle is not producing any mana, so Contamination's replacement effect doesn't apply. (106.12b)

**Required reasoning:**
- Match the RulesGuru cited answer for question 239.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [106.12b]

**Why this test matters:** Imported RulesGuru benchmark. Level: Corner Case. Complexity: Simple. Tags: Replacement effects, Mana, Mana abilities.

## RG240. Augustus controls a Gaea's Cradle enchanted by an Overgrowth and no creatures. If A...

**Scenario:**
> Augustus controls a Gaea's Cradle enchanted by an Overgrowth and no creatures. If Augustus taps the Gaea's Cradle, how much mana is produced?
> Cards involved: [[Gaea's Cradle]], [[Overgrowth]].
> RulesGuru source: https://rulesguru.org/?240RGBwnIII1MNeMwGG

**Expected verdict:** No mana is produced. Gaea's Cradle's activated ability is not producing any mana, so Overgrowth doesn't trigger. (106.12a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 240.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [106.12a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Mana, Mana abilities, Triggered abilities.

## RG241. Alijah controls Cold-Water Snapper and White Shield Crusader. Neriah controls Loomi...

**Scenario:**
> Alijah controls Cold-Water Snapper and White Shield Crusader. Neriah controls Looming Altisaur enchanted by their Dark Privilege. Alijah casts Sudden Disappearance targeting Neriah. When the trigger resolves at the beginning of the next end step, what can Dark Privilege enchant?
> Cards involved: [[Cold-Water Snapper]], [[White Shield Crusader]], [[Looming Altisaur]], [[Dark Privilege]], [[Sudden Disappearance]].
> RulesGuru source: https://rulesguru.org/?241RGBwnIIInaymYfVCO7dL5GG

**Expected verdict:** Just Cold-Water Snapper. White Shield Crusader has protection from black, so it can't be enchanted by anything black. (702.16c) Looming Altisaur isn't on the battlefield when Neriah chooses what to enchant. (303.4f) Hexproof doesn't prevent an Aura from becoming attached to the Cold-Water Snapper. (702.11b)

**Required reasoning:**
- Match the RulesGuru cited answer for question 241.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [303.4f], [702.11b], [702.16c]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Intermediate. Tags: Auras, Zone-changes, Evergreen keywords.

## RG242. Alec controls a token that's a copy of Golgari Brownscale due to Shapesharer. They...

**Scenario:**
> Alec controls a token that's a copy of Golgari Brownscale due to Shapesharer. They cast Dregs of Sorrow to destroy Golgari Brownscale. Can Alec dredge the token for Dregs of Sorrow's card draw? If so, what happens?
> Cards involved: [[Golgari Brownscale]], [[Shapesharer]], [[Dregs of Sorrow]].
> RulesGuru source: https://rulesguru.org/?242RGBwnIIIh9HzzpdjGG

**Expected verdict:** No, Alec may not dredge the token. The effect making it a copy of Golgari Brownscale ends when it leaves the battlefield, so it does not have dredge in the graveyard. (400.7)

**Required reasoning:**
- Match the RulesGuru cited answer for question 242.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [400.7]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Non-evergreen keywords, Drawing a card, Replacement effects, Tokens, Zone-changes, Copy effects.

## RG243. Abram controls Bridge from Below and Old Ghastbark. They cast Akroma's Vengeance. D...

**Scenario:**
> Abram controls Bridge from Below and Old Ghastbark. They cast Akroma's Vengeance. Do they create a Zombie token?
> Cards involved: [[Bridge from Below]], [[Old Ghastbark]], [[Akroma's Vengeance]].
> RulesGuru source: https://rulesguru.org/?243RGBwnIIIf1o34i8fGG

**Expected verdict:** No. Leaves-the-battlefield triggers care about the state of the game immediately before the event in question. (603.10a) Bridge from Below was on the battlefield at that time, and won't trigger.

**Required reasoning:**
- Match the RulesGuru cited answer for question 243.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [603.10a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Triggered abilities, Zone-changes, Resolving objects.

## RG244. Addison attacks with Dragon-Style Twins. Noe blocks with Those Who Serve and a Spel...

**Scenario:**
> Addison attacks with Dragon-Style Twins. Noe blocks with Those Who Serve and a Spell Queller that exiled a Snake Umbra. Can Addison kill the Spell Queller first and enchant Dragon-Style Twins with the Snake Umbra in order to kill the Those Who Serve?
> Cards involved: [[Dragon-Style Twins]], [[Those Who Serve]], [[Spell Queller]], [[Snake Umbra]].
> RulesGuru source: https://rulesguru.org/?244RGBwnIII2xlYZ2aEnbyGG

**Expected verdict:** Yes. Creatures with double strike deal damage in two separate combat damage steps. (702.4b) Addison can deal 3 damage to the Spell Queller in the first combat damage step and then cast the Snake Umbra before the second combat damage step begins. (510.3a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 244.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [510.3a], [702.4b]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Combat, Turn structure, Evergreen keywords.

## RG245. Alex casts Gnaw to the Bone from their graveyard for its flashback cost and Nick ex...

**Scenario:**
> Alex casts Gnaw to the Bone from their graveyard for its flashback cost and Nick exiles it with Spell Queller. If Spell Queller dies later in the turn, can Alex cast the Gnaw to the Bone? If so, what zone will it move to as it resolves?
> Cards involved: [[Gnaw to the Bone]], [[Spell Queller]].
> RulesGuru source: https://rulesguru.org/?245RGBwnIII1O2tCnGG

**Expected verdict:** Alex can cast it. It was exiled by Spell Queller's ability- flashback doesn't affect that. (702.34a) It's a different object from when it was previously on the stack (400.7), so flashback's replacement effect doesn't apply to it anymore. It will be put into the graveyard when it resolves.

**Required reasoning:**
- Match the RulesGuru cited answer for question 245.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [400.7], [702.34a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Non-evergreen keywords, Zone-changes, Replacement effects.

## RG246. Autumn controls an Angel's Tomb and casts Trusted Forcemage. Can they pair the Trus...

**Scenario:**
> Autumn controls an Angel's Tomb and casts Trusted Forcemage. Can they pair the Trusted Forcemage with the Angel's Tomb that's now a creature?
> Cards involved: [[Angel's Tomb]], [[Trusted Forcemage]].
> RulesGuru source: https://rulesguru.org/?246RGBwnIII1v0P85GG

**Expected verdict:** No. Soulbond only triggers if Autumn controls another unpaired creature when Trusted Forcemage first enters the battlefield. (702.95a, 603.4)

**Required reasoning:**
- Match the RulesGuru cited answer for question 246.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [603.4], [702.95a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Non-evergreen keywords, Triggered abilities.

## RG247. Alana controls Sylvok Explorer. Noel controls Gaea's Cradle and no creatures. If Al...

**Scenario:**
> Alana controls Sylvok Explorer. Noel controls Gaea's Cradle and no creatures. If Alana taps the Sylvok Explorer, what type(s) of mana can they produce?
> Cards involved: [[Sylvok Explorer]], [[Gaea's Cradle]].
> RulesGuru source: https://rulesguru.org/?247RGBwnIII2fWY7cGG

**Expected verdict:** None. Gaea's Cradle couldn't produce any mana, so neither can Sylvok Explorer. (106.7)

**Required reasoning:**
- Match the RulesGuru cited answer for question 247.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [106.7]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Mana, Mana abilities.

## RG248. Antoine controls Devilthorn Fox paired with Geist Trappers and an unpaired Druid's...

**Scenario:**
> Antoine controls Devilthorn Fox paired with Geist Trappers and an unpaired Druid's Familiar. They cast Venser, Shaper Savant and targets Devilthorn Fox with its triggered ability. What are the legal pairings after all triggers have resolved?
> Cards involved: [[Devilthorn Fox]], [[Geist Trappers]], [[Druid's Familiar]], [[Venser, Shaper Savant]].
> RulesGuru source: https://rulesguru.org/?248RGBwnIII2vZUF3HCMX9GG

**Expected verdict:** Either no pairings or Venser, Shaper Savant with Druid's Familiar. Geist Trappers's soulbond ability didn't trigger (702.95a) and when Druid's Familiar's ability resolves, it can only be paired with the creature that caused it to trigger. (702.95a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 248.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [702.95a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Intermediate. Tags: Non-evergreen keywords, Triggered abilities.

## RG249. Anton owns 2 Rift Bolt in exile that each have a time counter. Nico controls a Glow...

**Scenario:**
> Anton owns 2 Rift Bolt in exile that each have a time counter. Nico controls a Glowrider. During Anton's upkeep, can they cast the first Rift Bolt (paying {1}) to kill the Glowrider and then cast the second one for free?
> Cards involved: [[Rift Bolt]], [[Glowrider]].
> RulesGuru source: https://rulesguru.org/?249RGBwnIII27z7hoGG

**Expected verdict:** Yes. Anton casts each Rift Bolt as its suspend trigger resolves. (702.62a) The second trigger doesn't resolve until the first Rift Bolt has left the stack. (405.2, 405.5)

**Required reasoning:**
- Match the RulesGuru cited answer for question 249.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [405.2], [405.5], [702.62a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Non-evergreen keywords, Triggered abilities, Timing and priority.

## RG250. Ari controls Mana Reflection and Ancient Tomb. Nickolas controls Damping Sphere. If...

**Scenario:**
> Ari controls Mana Reflection and Ancient Tomb. Nickolas controls Damping Sphere. If Ari taps the Ancient Tomb for mana, how much mana is produced?
> Cards involved: [[Mana Reflection]], [[Ancient Tomb]], [[Damping Sphere]].
> RulesGuru source: https://rulesguru.org/?250RGBwnIIIitrNMqHWGG

**Expected verdict:** Either {C} or {C}{C}, Ari's choice. As the ability resolves, there are two replacement effects attempting to modify it. Ari chooses which one to apply first. (616.1) If they apply Mana Reflection first, the event will become "Add {C}{C}{C}{C}" when Damping Sphere then replaces with "Add {C}". If Ari applies Damping Sphere first, the event becomes "Add {C}", which Mana Reflection then replaces with "Add {C}{C}".

**Required reasoning:**
- Match the RulesGuru cited answer for question 250.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [616.1]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Mana abilities, Mana, Replacement effects, Activated abilities.

## RG251. Alec has cast 3 creature spells this turn, then attacks with Vengevine, which dies...

**Scenario:**
> Alec has cast 3 creature spells this turn, then attacks with Vengevine, which dies in combat. If Alec casts another creature spell, will Vengevine return to the battlefield?
> Cards involved: [[Vengevine]].
> RulesGuru source: https://rulesguru.org/?251RGBwnIIIeEZGG

**Expected verdict:** No. Vengevine triggers when the second creature spell of a turn is cast, not the 4th.

**Required reasoning:**
- Match the RulesGuru cited answer for question 251.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: 0. Complexity: Simple. Tags: Triggered abilities.

## RG252. Ari begins to suspend a Nihilith. Natalia would like to sacrifice a Grixis Panorama...

**Scenario:**
> Ari begins to suspend a Nihilith. Natalia would like to sacrifice a Grixis Panorama in response so that a time counter is not removed from Nihilith. Can they?
> Cards involved: [[Nihilith]], [[Grixis Panorama]].
> RulesGuru source: https://rulesguru.org/?252RGBwnIII21s3WpGG

**Expected verdict:** No. Suspending a card this way is a special action (116.2f), and does not go on the stack. Once Ari has priority and begins to take the action, Natalia doesn't have a chance to do anything until it's completed and Nihilith is in exile.

**Required reasoning:**
- Match the RulesGuru cited answer for question 252.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [116.2f]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Non-evergreen keywords, Special actions, The stack, Timing and priority.

## RG253. Aubrey controls an Isochron Scepter that exiled Magmaquake. Noah controls a Meddlin...

**Scenario:**
> Aubrey controls an Isochron Scepter that exiled Magmaquake. Noah controls a Meddling Mage that named "Magmaquake". As Isochron Scepter's second ability resolves, what happens?
> Cards involved: [[Isochron Scepter]], [[Magmaquake]], [[Meddling Mage]].
> RulesGuru source: https://rulesguru.org/?253RGBwnIIIhPbOquqpGG

**Expected verdict:** Aubrey copies the Magmaquake in exile. Aubrey can't cast the copy (112.1b, 601.2a), so it remains in exile. It ceases to exist as soon as Isochron Scepter's ability finishes resolving. (704.5e)

**Required reasoning:**
- Match the RulesGuru cited answer for question 253.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [112.1b], [601.2a], [704.5e]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Casting spells, "Can't" effects, Copy effects.

## RG254. Axl controls Aether Rift. While resolving its ability, they discard a Basking Rootw...

**Scenario:**
> Axl controls Aether Rift. While resolving its ability, they discard a Basking Rootwalla. What happens to it?
> Cards involved: [[Aether Rift]], [[Basking Rootwalla]].
> RulesGuru source: https://rulesguru.org/?254RGBwnIII1u4wk2GG

**Expected verdict:** It is discarded into exile. (702.35a) Any player may pay 5 life. If no player does, nothing happens, since the Basking Rootwalla is in exile and can't be returned to the battlefield from the graveyard. When the madness trigger resolves, Axl can cast the Basking Rootwalla. If they don't, it is put into the graveyard. (702.35a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 254.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [702.35a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Non-evergreen keywords, Zone-changes, Triggered abilities.

## RG255. Angelo attacks with Frenzied Goblin. Nylah controls Flameborn Viron and Ruination W...

**Scenario:**
> Angelo attacks with Frenzied Goblin. Nylah controls Flameborn Viron and Ruination Wurm. Can they pay {R}{R} to make both of Nylah's creatures unable to block?
> Cards involved: [[Frenzied Goblin]], [[Flameborn Viron]], [[Ruination Wurm]].
> RulesGuru source: https://rulesguru.org/?255RGBwnIIIgOJc50KvGG

**Expected verdict:** No. Frenzied Goblin has a triggered ability (113.3c), and it only triggers once when it attacks. Angelo chooses whether or not to pay {R} as the trigger resolves.

**Required reasoning:**
- Match the RulesGuru cited answer for question 255.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [113.3c]

**Why this test matters:** Imported RulesGuru benchmark. Level: 0. Complexity: Simple. Tags: Triggered abilities, Combat, Resolving objects.

## RG256. Avianna activates Merieke Ri Berit's ability, targeting Nehemiah's Pheres-Band Cent...

**Scenario:**
> Avianna activates Merieke Ri Berit's ability, targeting Nehemiah's Pheres-Band Centaurs. Before that ability resolves, Avianna untaps Merieke Ri Berit with Disciple of the Ring and then taps it again targeting Swab Goblin. What happens to Pheres-Band Centaurs and Swab Goblin?
> Cards involved: [[Merieke Ri Berit]], [[Pheres-Band Centaurs]], [[Disciple of the Ring]], [[Swab Goblin]].
> RulesGuru source: https://rulesguru.org/?256RGBwnIII2Yyz8rtYuryGG

**Expected verdict:** Avianna will gain control of Pheres-Band Centaurs and Swab Goblin. Neither of them will be destroyed.

Merieke Ri Berit's ability creates a delayed trigger that triggers when Merieke Ri Berit becomes untapped. When Merieke Ri Berit became untapped its ability hadn't resolved yet, so there was no delayed trigger to destroy the Pheres-Band Centaurs.

**Required reasoning:**
- Match the RulesGuru cited answer for question 256.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Intermediate. Tags: The stack, Triggered abilities, Control-changing effects, Continuous effects.

## RG257. Achilles controls Gleeful Arsonist enchanted by their Fool's Demise. They attack wi...

**Scenario:**
> Achilles controls Gleeful Arsonist enchanted by their Fool's Demise. They attack with it and Natalie blocks with Fusion Elemental. Will Gleeful Arsonist have a +1/+1 counter when it returns to the battlefield?
> Cards involved: [[Gleeful Arsonist]], [[Fool's Demise]], [[Fusion Elemental]].
> RulesGuru source: https://rulesguru.org/?257RGBwnIIIqQaflov9GG

**Expected verdict:** It's Achilles's choice. There are two triggers when Gleeful Arsonist dies (702.93a), so Achilles can choose the order to put them onto the stack. (603.3b) The first one to resolve will return the Gleeful Arsonist to the battlefield, and the second one will do nothing.

**Required reasoning:**
- Match the RulesGuru cited answer for question 257.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [603.3b], [702.93a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Non-evergreen keywords, Triggered abilities, Zone-changes, Combat.

## RG258. Ainsley controls Goblin Arsonist enchanted by Noe's Glistening Oil. When Goblin Ars...

**Scenario:**
> Ainsley controls Goblin Arsonist enchanted by Noe's Glistening Oil. When Goblin Arsonist dies at the beginning of Ainsley's upkeep, does it deal its damage with infect?
> Cards involved: [[Goblin Arsonist]], [[Glistening Oil]].
> RulesGuru source: https://rulesguru.org/?258RGBwnIII1O3JkrGG

**Expected verdict:** This can't happen as described. Glistening Oil triggers at the beginning of Noe's upkeep, not Ainsley's. (109.5, 303.4e)

When it dies in Noe's upkeep, it will deal its damage with infect, since the game looks at how it last existed on the battlefield. (113.7a/608.2h)

**Required reasoning:**
- Match the RulesGuru cited answer for question 258.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [109.5], [113.7a], [303.4e], [608.2h]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Last known information, Damage, Zone-changes, Non-evergreen keywords.

## RG259. Alma controls Regal Unicorn. Nico casts Crippling Chill targeting Regal Unicorn. Be...

**Scenario:**
> Alma controls Regal Unicorn. Nico casts Crippling Chill targeting Regal Unicorn. Before it resolves, Alma casts Cloudshift targeting the Regal Unicorn. What happens to the Regal Unicorn? Does Nico draw a card?
> Cards involved: [[Regal Unicorn]], [[Crippling Chill]], [[Cloudshift]].
> RulesGuru source: https://rulesguru.org/?259RGBwnIIIjUTCCHdQGG

**Expected verdict:** The stack resolves from the top down, so the Regal Unicorn is exiled and returned to the battlefield first. (405.5) This causes the Regal Unicorn to become a completely new permanent, unrelated to what it was before. (400.7) It's no longer being targeted by the Crippling Chill, so when Crippling Chill begins to resolve, it will not resolve due to having no legal targets. (608.2b) Nico will not draw a card.

**Required reasoning:**
- Match the RulesGuru cited answer for question 259.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [400.7], [405.5], [608.2b]

**Why this test matters:** Imported RulesGuru benchmark. Level: 0. Complexity: Simple. Tags: Targets, The stack, Resolving objects.

## RG260. Aubrey controls Treacherous Pit-Dweller enchanted with Unhallowed Pact. They attack...

**Scenario:**
> Aubrey controls Treacherous Pit-Dweller enchanted with Unhallowed Pact. They attack with it and Nikolas blocks with Kasimir the Lone Wolf. What happens to the Treacherous Pit-Dweller?
> Cards involved: [[Treacherous Pit-Dweller]], [[Unhallowed Pact]], [[Kasimir the Lone Wolf]].
> RulesGuru source: https://rulesguru.org/?260RGBwnIIIlN76ClDMGG

**Expected verdict:** When Treacherous Pit-Dweller dies, Aubrey controls both triggers to return it to the battlefield, so they can choose which one to have resolve first. (405.3) The other trigger will do nothing, since Treacherous Pit-Dweller is no longer in the graveyard when it resolves. Regardless of which trigger returned it to the battlefield, it entered the battlefield from a graveyard, so Nikolas will gain control of it.

**Required reasoning:**
- Match the RulesGuru cited answer for question 260.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [405.3]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Triggered abilities, Control-changing effects, Zone-changes, Non-evergreen keywords.

## RG261. Annabel controls a Vesuvan Shapeshifter that is currently face down. They pay {1}{U...

**Scenario:**
> Annabel controls a Vesuvan Shapeshifter that is currently face down. They pay {1}{U} to turn it face up and choose to copy a face-up Maelstrom Djinn. Does Vesuvan Shapeshifter's "when Maelstrom Djinn is turned face up" trigger trigger?
> Cards involved: [[Vesuvan Shapeshifter]], [[Maelstrom Djinn]].
> RulesGuru source: https://rulesguru.org/?261RGBwnIII2ks4aaGG

**Expected verdict:** Yes. "When Maelstrom Djinn is turned face up" really just means "When this permanent is turned face up". (201.5) Even though Vesuvan Shapeshifter didn't have that ability before it was turned face-up, triggered abilities are checked to see if they trigger immediately after the event occurred, and at that point Vesuvan Shapeshifter did have the ability. (603.10)

**Required reasoning:**
- Match the RulesGuru cited answer for question 261.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [201.5], [603.10]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Face-down objects, Copy effects, Triggered abilities, Special actions.

## RG262. Alex controls Gibbering Descent and an Undiscovered Paradise that they tapped for m...

**Scenario:**
> Alex controls Gibbering Descent and an Undiscovered Paradise that they tapped for mana during their last turn. Alex has no cards in hand as they begin their turn. Do they skip their upkeep?
> Cards involved: [[Gibbering Descent]], [[Undiscovered Paradise]].
> RulesGuru source: https://rulesguru.org/?262RGBwnIII1NvDZeGG

**Expected verdict:** No. Undiscovered Paradise is returned to Alex's hand during their untap step, at the same time as they untap their permanents. Alex's hand is not empty as the upkeep begins, so it is not skipped. (614.10)

**Required reasoning:**
- Match the RulesGuru cited answer for question 262.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [614.10]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Turn structure, Replacement effects.

## RG263. Andre controls a Containment Priest and has a Thromok the Insatiable in their grave...

**Scenario:**
> Andre controls a Containment Priest and has a Thromok the Insatiable in their graveyard. They cast Stir the Grave, targeting the Thromok the Insatiable. Can Andre devour the Containment Priest and have Thromok the Insatiable enter the battlefield?
> Cards involved: [[Containment Priest]], [[Thromok the Insatiable]], [[Stir the Grave]].
> RulesGuru source: https://rulesguru.org/?263RGBwnIIIftAohz8lGG

**Expected verdict:** No. Andre can choose to devour the Containment Priest before applying its effect. (616.1) However, that action is not performed yet- the game simply knows that that effect should be considered for the purpose of determining how Thromok the Insatiable will be affected by other replacement effects. The Containment Priest is still on the battlefield, so its effect will apply and exile the Thromok the Insatiable. (614.12, 616.1f)

**Required reasoning:**
- Match the RulesGuru cited answer for question 263.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [614.12], [616.1], [616.1f]

**Why this test matters:** Imported RulesGuru benchmark. Level: Corner Case. Complexity: Simple. Tags: Zone-changes, Replacement effects, Counters, Non-evergreen keywords.

## RG264. Adan controls Master Biomancer and casts Voracious Dragon. If Adan chooses to devou...

**Scenario:**
> Adan controls Master Biomancer and casts Voracious Dragon. If Adan chooses to devour Master Biomancer, how many +1/+1 counters does Voracious Dragon enter the battlefield with? Does Adan have any choice in the matter?
> Cards involved: [[Master Biomancer]], [[Voracious Dragon]].
> RulesGuru source: https://rulesguru.org/?264RGBwnIII1YpMyjGG

**Expected verdict:** Voracious Dragon will enter the battlefield with 3 +1/+1 counters, regardless of any choices made by Adan.

As Voracious Dragon enters the battlefield, Adan can choose which of the two replacement effects to apply to the event first, devour or Master Biomancer's effect. (616.1) Even if Adan applies the devour effect first, that action is not performed yet- the game simply knows that that effect should be considered for the purpose of determining how Voracious Dragon will be affected by other replacement effects. (The game can only perform an event once it knows what event that is. As such, the process for applying replacement effects in [616.1] is carried out in full before anything actually occurs in the game. "Apply" in this context means to apply the modification to the event, not to actually carry out any actions.) The Master Biomancer is still on the battlefield after applying Voracious Dragon's effect, the game simply knows now that it will be sacrificed as Voracious Dragon enters the battlefield, which hasn't happened yet. (400.6) Master Biomancer's effect is still around immediately before Voracious Dragon enters the battlefield, so it will apply and give Voracious Dragon the additional +1/+1 counters. (616.1f)

**Required reasoning:**
- Match the RulesGuru cited answer for question 264.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [400.6], [616.1], [616.1f]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Zone-changes, Replacement effects, Counters, Non-evergreen keywords.

## RG265. Anders has a River's Grasp in hand but has no blue mana. Can they cast it with {B}{...

**Scenario:**
> Anders has a River's Grasp in hand but has no blue mana. Can they cast it with {B}{B}{B}{B}, targeting Nylah's Cursed Monstrosity in order to make them sacrifice it?
> Cards involved: [[River's Grasp]], [[Cursed Monstrosity]].
> RulesGuru source: https://rulesguru.org/?265RGBwnIII27X0uVGG

**Expected verdict:** Yes. River's Grasp only checks to see if {U} was spent upon resolution, and only returns the targeted creature to its owner's hand if it was. Choosing a target is done as the spell is cast, regardless of what mana is paid. (601.2c)

**Required reasoning:**
- Match the RulesGuru cited answer for question 265.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [601.2c]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Casting spells, Targets, Resolving objects.

## RG267. It is currently Autumn's cleanup step, and Noel cast an Emrakul, the Promised End l...

**Scenario:**
> It is currently Autumn's cleanup step, and Noel cast an Emrakul, the Promised End last turn, taking control of Autumn's current turn. Who chooses what cards to discard to hand size?
> Cards involved: [[Emrakul, the Promised End]].
> RulesGuru source: https://rulesguru.org/?267RGBwnIIIaSBGG

**Expected verdict:** Noel does. Cards are discarded to hand size before "this turn" and "until end of turn" effects wear off. (514.1) Emrakul, the Promised End's effect is not a "this turn" or "until end of turn" effect in any case, so it lasts for the entire turn. (722.1)

**Required reasoning:**
- Match the RulesGuru cited answer for question 267.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [514.1], [722.1]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Turn structure, Control-changing effects.

## RG268. It is currently Ameer's cleanup step, and Nylah cast Worst Fears last turn. Ameer d...

**Scenario:**
> It is currently Ameer's cleanup step, and Nylah cast Worst Fears last turn. Ameer discards Purity and Serra Avatar to hand size. Which player chooses in what order to put the triggers onto the stack?
> Cards involved: [[Worst Fears]], [[Purity]], [[Serra Avatar]].
> RulesGuru source: https://rulesguru.org/?268RGBwnIIImvU7PSg5GG

**Expected verdict:** Nylah does. Only effects worded as "this turn" or "until end of turn" wear off in the cleanup step. (514.2) Nylah controls Ameer during the entire turn. (722.1)

**Required reasoning:**
- Match the RulesGuru cited answer for question 268.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [514.2], [722.1]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Turn structure, Control-changing effects, Triggered abilities.

## RG269. Abby controls a The Gitrog Monster and discards a land to hand size as their turn e...

**Scenario:**
> Abby controls a The Gitrog Monster and discards a land to hand size as their turn ends. What happens?
> Cards involved: [[The Gitrog Monster]].
> RulesGuru source: https://rulesguru.org/?269RGBwnIIIekPGG

**Expected verdict:** The trigger to draw a card is put onto the stack and resolves. Then another cleanup step begins. (514.3a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 269.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [514.3a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Turn structure, Triggered abilities, Timing and priority.

## RG270. Nataly cast Sphinx's Decree last turn. Autumn moves to their cleanup step and disca...

**Scenario:**
> Nataly cast Sphinx's Decree last turn. Autumn moves to their cleanup step and discards a Worldspine Wurm to hand size. Can they cast an instant during their cleanup step?
> Cards involved: [[Sphinx's Decree]], [[Worldspine Wurm]].
> RulesGuru source: https://rulesguru.org/?270RGBwnIII2dBr1BGG

**Expected verdict:** No. While Autumn does get priority during the cleanup step (514.3a), the effect of Sphinx's Decree is not a "this turn" or "until end of turn" effect, so it lasts until the turn ends. (514.2)

**Required reasoning:**
- Match the RulesGuru cited answer for question 270.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [514.2], [514.3a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Turn structure, Timing and priority, Continuous effects.

## RG271. Aspen attacks with Aurelia, the Warleader. Immediately after the trigger resolves,...

**Scenario:**
> Aspen attacks with Aurelia, the Warleader. Immediately after the trigger resolves, they casts Time Stop. Is there an additional combat phase? If so, when?
> Cards involved: [[Aurelia, the Warleader]], [[Time Stop]].
> RulesGuru source: https://rulesguru.org/?271RGBwnIII1weUkWGG

**Expected verdict:** There is no additional combat phase. When Aurelia, the Warleader's trigger resolves, it adds the phase to the structure of the current turn. (500.8) When Time Stop resolves, it skips all remaining steps and phases until the cleanup step. (723.1d)

**Required reasoning:**
- Match the RulesGuru cited answer for question 271.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [500.8]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Turn structure.

## RG272. Analia controls Hypersonic Dragon. In their draw step, they casts Relentless Assaul...

**Scenario:**
> Analia controls Hypersonic Dragon. In their draw step, they casts Relentless Assault. What happens?
> Cards involved: [[Hypersonic Dragon]], [[Relentless Assault]].
> RulesGuru source: https://rulesguru.org/?272RGBwnIII1Swp6HGG

**Expected verdict:** There is no "this main phase" to add the combat step after, so no additional phase is created. (500.8) The turn proceeds as normal.

**Required reasoning:**
- Match the RulesGuru cited answer for question 272.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [500.8]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Turn structure, Resolving objects, Combat.

## RG273. Ainsley controls Hypersonic Dragon. In Neymar's end step, Ainsley casts Waves of Ag...

**Scenario:**
> Ainsley controls Hypersonic Dragon. In Neymar's end step, Ainsley casts Waves of Aggression. What happens?
> Cards involved: [[Hypersonic Dragon]], [[Waves of Aggression]].
> RulesGuru source: https://rulesguru.org/?273RGBwnIII1SwqHBGG

**Expected verdict:** All creatures that attacked this turn are untapped. There is no "this main phase" to add the combat step after, so no additional phase is created. (500.8) The turn proceeds as normal.

**Required reasoning:**
- Match the RulesGuru cited answer for question 273.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [500.8]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Turn structure, Resolving objects, Combat.

## RG274. Augustine controls Hypersonic Dragon. In Nico's postcombat main phase, Augustine ca...

**Scenario:**
> Augustine controls Hypersonic Dragon. In Nico's postcombat main phase, Augustine casts Waves of Aggression. What happens?
> Cards involved: [[Hypersonic Dragon]], [[Waves of Aggression]].
> RulesGuru source: https://rulesguru.org/?274RGBwnIII1SwqHBGG

**Expected verdict:** All creatures that attacked this turn are untapped. A new combat phase is created after that main phase, during which Nico can attack again.

**Required reasoning:**
- Match the RulesGuru cited answer for question 274.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: 0. Complexity: Simple. Tags: Turn structure, Resolving objects, Combat.

## RG275. In Arianna's draw step, they tap Tolarian Academy for 8 blue mana and cast Time Sto...

**Scenario:**
> In Arianna's draw step, they tap Tolarian Academy for 8 blue mana and cast Time Stop. Arianna discards a Hostility to hand size. Can they use the two remaining {U} to cast an instant?
> Cards involved: [[Tolarian Academy]], [[Time Stop]], [[Hostility]].
> RulesGuru source: https://rulesguru.org/?275RGBwnIIIlH7H4SKDGG

**Expected verdict:** No. The mana was removed from the mana pool when the draw step ended. (703.4q)

**Required reasoning:**
- Match the RulesGuru cited answer for question 275.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [703.4q]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Turn structure, Mana.

## RG276. Aubrey moves to the cleanup step and discards a card to hand size. Can Nehemiah cas...

**Scenario:**
> Aubrey moves to the cleanup step and discards a card to hand size. Can Nehemiah cast Dream Salvage afterwards to draw a card?
> Cards involved: [[Dream Salvage]].
> RulesGuru source: https://rulesguru.org/?276RGBwnIIIaJ7GG

**Expected verdict:** No. By default players do not receive priority during the cleanup step. (514.3)

**Required reasoning:**
- Match the RulesGuru cited answer for question 276.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [514.3]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Turn structure, Timing and priority.

## RG277. Albert controls a Beetleform Mage that they activated once already. They move to th...

**Scenario:**
> Albert controls a Beetleform Mage that they activated once already. They move to their end step and discard a Hostility to hand size. Can they activate the Beetleform Mage again during the cleanup step?
> Cards involved: [[Beetleform Mage]], [[Hostility]].
> RulesGuru source: https://rulesguru.org/?277RGBwnIII1xnDisGG

**Expected verdict:** No. While Albert does get priority during the cleanup step (514.3a), the "activate this ability only once each turn" instruction of Beetleform Mage is not a "this turn" or "until end of turn" effect, so it lasts for the entire turn. (514.2)

**Required reasoning:**
- Match the RulesGuru cited answer for question 277.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [514.2], [514.3a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Turn structure, Timing and priority, Continuous effects.

## RG278. Niko has Pull from Tomorrow and no other cards in their hand, and they haven't draw...

**Scenario:**
> Niko has Pull from Tomorrow and no other cards in their hand, and they haven't drawn any other cards previously this turn. They cast Pull from Tomorrow to draw and then discard a card. The card they draw is Sister Repentia. Can they cast it for its miracle cost?
> Cards involved: [[Pull from Tomorrow]], [[Sister Repentia]].
> RulesGuru source: https://rulesguru.org/?278RGBwnIII25fcngGG

**Expected verdict:** No. Niko may reveal Sister Repentia as it's drawn (702.94a), but then it's discarded. The miracle trigger is only put onto the stack after Pull from Tomorrow has finished resolving (603.3), and the Sister Repentia isn't in Niko's hand to be cast when it resolves. (702.94a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 278.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [603.3], [702.94a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Non-evergreen keywords, Drawing a card, Resolving objects, Triggered abilities, The stack.

## RG279. Avery casts Engineered Might targeting Wu Infantry, and then attacks with the Wu In...

**Scenario:**
> Avery casts Engineered Might targeting Wu Infantry, and then attacks with the Wu Infantry. Nikolai blocks it with a Madame Vastra, which has gained infect due to their Tainted Strike and indestructible due to their Deathless Angel. What happens at the end of the turn?
> Cards involved: [[Engineered Might]], [[Wu Infantry]], [[Madame Vastra]], [[Tainted Strike]], [[Deathless Angel]].
> RulesGuru source: https://rulesguru.org/?279RGBwnIIIoxySkZoyEWy9bGG

**Expected verdict:** The effect from Engineered Might wears off (514.2), but the -1/-1 counters on Wu Infantry remain. Wu Infantry dies. (704.5f, 514.3a) It was dealt damage that turn by Madame Vastra, so Madame Vastra triggers.

**Required reasoning:**
- Match the RulesGuru cited answer for question 279.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [514.2], [514.3a], [704.5f]

**Why this test matters:** Imported RulesGuru benchmark. Level: Corner Case. Complexity: Intermediate. Tags: Turn structure, Triggered abilities, Damage, Non-evergreen keywords, Timing and priority, State-based actions.

## RG280. Avery controls a Relic Ward that was cast during their declare blockers step. Durin...

**Scenario:**
> Avery controls a Relic Ward that was cast during their declare blockers step. During Avery's end step, Nico activates Duskmantle Guildmage's first ability. Does Avery lose 1 life when the Relic Ward is sacrificed?
> Cards involved: [[Relic Ward]], [[Duskmantle Guildmage]].
> RulesGuru source: https://rulesguru.org/?280RGBwnIII26WkeUGG

**Expected verdict:** Yes. Duskmantle Guildmage creates a delayed triggered ability. (603.7) The existence of that ability is not a continuous effect, so it still exists during the cleanup step (514.2, 610.2).

**Required reasoning:**
- Match the RulesGuru cited answer for question 280.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [514.2], [603.7], [610.2]

**Why this test matters:** Imported RulesGuru benchmark. Level: Corner Case. Complexity: Simple. Tags: Triggered abilities, Turn structure.

## RG281. Ari controls an Iron Myr with a +1/+1 counter. They cast Boneyard Parley, putting D...

**Scenario:**
> Ari controls an Iron Myr with a +1/+1 counter. They cast Boneyard Parley, putting Dracoplasm and Thief of Blood onto the battlefield. Ari would like to sacrifice the Iron Myr to Dracoplasm's ability. What are the power and toughness of both creatures after they have entered the battlefield?
> Cards involved: [[Iron Myr]], [[Boneyard Parley]], [[Dracoplasm]], [[Thief of Blood]].
> RulesGuru source: https://rulesguru.org/?281RGBwnIII2PHzB5rLxTaGG

**Expected verdict:** Both Dracoplasm and Thief of Blood are 2/2. Since they are both entering the battlefield at the same time, their replacement effects take place at the same time. Thief of Blood removes the +1/+1 counter from Iron Myr at the same time as Dracoplasm sacrifices it. Thief of Blood sees that 1 counter was removed and so enters the battlefield with a +1/+1 counter, while Dracoplasm looks at the Iron Myr's last known information and sees that it was a 2/2 immediately before it left the battlefield. (608.2h)

**Required reasoning:**
- Match the RulesGuru cited answer for question 281.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [608.2h]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Zone-changes, Replacement effects, Counters, Last known information.

## RG282. Ashley casts Virulent Wound, targeting Nataly's Crimson Kobolds. In response, Natal...

**Scenario:**
> Ashley casts Virulent Wound, targeting Nataly's Crimson Kobolds. In response, Nataly casts Feral Instinct on the Crimson Kobolds. What happens at the end of the turn?
> Cards involved: [[Virulent Wound]], [[Crimson Kobolds]], [[Feral Instinct]].
> RulesGuru source: https://rulesguru.org/?282RGBwnIIIm9cu3djoGG

**Expected verdict:** The effect from Feral Instinct wears off (514.2), but the -1/-1 counter remains. Crimson Kobolds dies. (704.5f, 514.3a) The delayed triggered ability created by Virulent Wound is not a continuous effect, so it still exists during the cleanup step (514.2, 610.2), and will trigger due to Crimson Kobolds dying. Nataly gets a poison counter.

**Required reasoning:**
- Match the RulesGuru cited answer for question 282.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [514.2], [514.3a], [610.2], [704.5f]

**Why this test matters:** Imported RulesGuru benchmark. Level: Corner Case. Complexity: Simple. Tags: Triggered abilities, Turn structure.

## RG283. Nico controls Grafdigger's Cage. Achilles controls Kindercatch and has Undead Minot...

**Scenario:**
> Nico controls Grafdigger's Cage. Achilles controls Kindercatch and has Undead Minotaur in their graveyard. Achilles casts Living Death. What happens?
> Cards involved: [[Grafdigger's Cage]], [[Kindercatch]], [[Undead Minotaur]], [[Living Death]].
> RulesGuru source: https://rulesguru.org/?283RGBwnIII2JPbJ5WWAZDGG

**Expected verdict:** The Living Death resolves normally. Grafdigger's Cage only prevents creature cards from entering the battlefield from the graveyard or library. Living Death puts them onto the battlefield from exile.

**Required reasoning:**
- Match the RulesGuru cited answer for question 283.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: 0. Complexity: Simple. Tags: Zone-changes, Resolving objects.

## RG285. Ariel controls a Seal of the Guildpact with "Blue" and "Red" chosen. How much does...

**Scenario:**
> Ariel controls a Seal of the Guildpact with "Blue" and "Red" chosen. How much does it cost them to cast an Izzet Charm?
> Cards involved: [[Seal of the Guildpact]], [[Izzet Charm]].
> RulesGuru source: https://rulesguru.org/?285RGBwnIII29WhNEGG

**Expected verdict:** {U}{R}. Seal of the Guildpact only reduces the generic mana components of spells by {2}, not the colored mana. (107.4b, 118.7a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 285.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [107.4b], [118.7a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Casting spells, Costs, Mana.

## RG286. Alexzander has a Myr Superion and 2 Simian Spirit Guides in their hand. Can they ex...

**Scenario:**
> Alexzander has a Myr Superion and 2 Simian Spirit Guides in their hand. Can they exile the two Simian Spirit Guides to cast the Myr Superion?
> Cards involved: [[Myr Superion]], [[Simian Spirit Guide]].
> RulesGuru source: https://rulesguru.org/?286RGBwnIII20xCJfGG

**Expected verdict:** No. Myr Superion can only be cast with mana produced by "creatures", and a Simian Spirit Guide in a player's hand isn't a "creature", it's a "creature card". Creatures only exist on the battlefield. (109.2)

**Required reasoning:**
- Match the RulesGuru cited answer for question 286.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [109.2]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Mana, Mana abilities, Casting spells.

## RG287. Aspen controls an Arcane Adaptation naming "Rebel". Nicole controls a Brutal Suppre...

**Scenario:**
> Aspen controls an Arcane Adaptation naming "Rebel". Nicole controls a Brutal Suppression. Does Aspen have to sacrifice a land in order to cycle Gempalm Avenger?
> Cards involved: [[Arcane Adaptation]], [[Brutal Suppression]], [[Gempalm Avenger]].
> RulesGuru source: https://rulesguru.org/?287RGBwnIIIepbsXVK0GG

**Expected verdict:** No. Gempalm Avenger is a rebel, but Brutal Suppression only affects Rebels on the battlefield, not in any other zone. (109.2)

**Required reasoning:**
- Match the RulesGuru cited answer for question 287.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [109.2]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Activated abilities, Abilities, Type-changing effects.

## RG288. Ayaan has already played a land this turn and casts Flash. Can they put Dryad Arbor...

**Scenario:**
> Ayaan has already played a land this turn and casts Flash. Can they put Dryad Arbor onto the battlefield? If so, how much do they have to pay in order to not sacrifice it?
> Cards involved: [[Flash]], [[Dryad Arbor]].
> RulesGuru source: https://rulesguru.org/?288RGBwnIII1LENcnGG

**Expected verdict:** Putting a land onto the battlefield due to some effect is not "playing" a land, so Ayaan may put the Dryad Arbor onto the battlefield. (305.4) It has no mana cost, so Ayaan can't pay its mana cost. (118.6) The Dryad Arbor will be sacrificed.

**Required reasoning:**
- Match the RulesGuru cited answer for question 288.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [118.6], [305.4]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Costs, Lands.

## RG289. Anika controls Ice Cauldron. Noah controls Suppression Field. Anika activates Ice C...

**Scenario:**
> Anika controls Ice Cauldron. Noah controls Suppression Field. Anika activates Ice Cauldron's first ability with X=1, paying {C}{C}{C}. On Anika's next turn, they activate Ice Cauldron's second ability. How much mana do they add?
> Cards involved: [[Ice Cauldron]], [[Suppression Field]].
> RulesGuru source: https://rulesguru.org/?289RGBwnIII1SAKbwGG

**Expected verdict:** Just {C}. The activation cost of Ice Cauldron's first ability is "{X}, {T}". The additional cost imposed by Suppression Field is not part of the activation cost, and the mana spent on it isn't noted when the ability resolves. (602.1a, 602.2b)

**Required reasoning:**
- Match the RulesGuru cited answer for question 289.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [602.1a], [602.2b]

**Why this test matters:** Imported RulesGuru benchmark. Level: Corner Case. Complexity: Simple. Tags: Mana, Activated abilities, Costs.

## RG290. Andi controls a Mirage Mirror that, two turns ago, become a copy of Angel of Condem...

**Scenario:**
> Andi controls a Mirage Mirror that, two turns ago, become a copy of Angel of Condemnation and exiled Canal Monitor with its second activated ability. This turn, Andi activates Mirage Mirror targeting Undiscovered Paradise and taps it for mana. On Andi's next turn, will the Canal Monitor return to the battlefield? If so, can it attack?
> Cards involved: [[Mirage Mirror]], [[Angel of Condemnation]], [[Canal Monitor]], [[Undiscovered Paradise]].
> RulesGuru source: https://rulesguru.org/?290RGBwnIII2ZlgnBsfWEDGG

**Expected verdict:** It will return to the battlefield, but it can't attack. Any time an object refers to itself by name, it just means "this card" (201.5), so Mirage Mirror will return to Andi's hand during their untap step, and the Canal Monitor will return to the battlefield. During the combat phase of that turn, Canal Monitor has not been on the battlefield since the turn began, so it will not be able to attack. (302.6)

**Required reasoning:**
- Match the RulesGuru cited answer for question 290.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [201.5], [302.6]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Intermediate. Tags: Turn structure, Combat, Continuous effects, Zone-changes.

## RG291. Armando controls Kruin Outlaw enchanted by Infinite Reflection. Armando also contro...

**Scenario:**
> Armando controls Kruin Outlaw enchanted by Infinite Reflection. Armando also controls a Cloistered Youth which is currently a copy of Kruin Outlaw. No spells were cast last turn. At the beginning of their upkeep, what happens to the Kruin Outlaw and Cloistered Youth?
> Cards involved: [[Kruin Outlaw]], [[Infinite Reflection]], [[Cloistered Youth]].
> RulesGuru source: https://rulesguru.org/?291RGBwnIIIi9e9EN99GG

**Expected verdict:** Both Kruin Outlaw and Cloistered Youth transform. (701.27) Cloistered Youth's back face remains a copy of the front face of Kruin Outlaw. (707.2b, 707.8, 712.18)

**Required reasoning:**
- Match the RulesGuru cited answer for question 291.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [701.27], [707.2b], [707.8], [712.18]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Double-faced cards, Copy effects.

## RG292. Avery controls Benthic Giant and a Banishing Light that exiled Nico's Paralyze. Nic...

**Scenario:**
> Avery controls Benthic Giant and a Banishing Light that exiled Nico's Paralyze. Nico casts Frantic Purification targeting Banishing Light. What happens as the Paralyze returns to the battlefield?
> Cards involved: [[Benthic Giant]], [[Banishing Light]], [[Paralyze]], [[Frantic Purification]].
> RulesGuru source: https://rulesguru.org/?292RGBwnIII2kZXVD9eAPhGG

**Expected verdict:** It enchants Benthic Giant. Auras entering the battlefield from a zone other than the stack must enchant a legal object. (303.4f) It doesn't target anything, so hexproof doesn't matter. (702.11b)

**Required reasoning:**
- Match the RulesGuru cited answer for question 292.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [303.4f], [702.11b]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Auras, Zone-changes, Targets, Evergreen keywords.

## RG294. Alexander turns their Mirage Mirror into a copy of Old Man of the Sea and takes con...

**Scenario:**
> Alexander turns their Mirage Mirror into a copy of Old Man of the Sea and takes control of Nico's Great Hart. At the end of the turn when Mirage Mirror stops being a copy of Old Man of the Sea, will Great Hart return to Nico's control?
> Cards involved: [[Mirage Mirror]], [[Old Man of the Sea]], [[Great Hart]].
> RulesGuru source: https://rulesguru.org/?294RGBwnIIIiJmlepckGG

**Expected verdict:** Yes. Mirage Mirror has no power, so the game uses 0 instead. (107.2) Great Hart has greater than 0 power, so the control-changing effect ends.

**Required reasoning:**
- Match the RulesGuru cited answer for question 294.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [107.2]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Control-changing effects, Copy effects, Numbers and symbols.

## RG295. Aspen controls Everlasting Torment and casts Soul Burn with X = 2 targeting Nayeli'...

**Scenario:**
> Aspen controls Everlasting Torment and casts Soul Burn with X = 2 targeting Nayeli's Grizzly Bears. (Spending {B}{B}{B}{B}{B}.) How much life does Aspen gain?
> Cards involved: [[Everlasting Torment]], [[Soul Burn]], [[Grizzly Bears]].
> RulesGuru source: https://rulesguru.org/?295RGBwnIIIgqlsHC60GG

**Expected verdict:** 0. The instructions of the spell are carried out in order. (608.2c) By the time Aspen would gain life, the creature's toughness has been reduced to 0 by the -1/-1 counters, so they can't gain more than 0 life.

**Required reasoning:**
- Match the RulesGuru cited answer for question 295.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [608.2c]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Resolving objects, Numbers and symbols, Damage.

## RG296. Alison casts Embolden, targeting Vastwood Gorger and Scathe Zombies. When do they h...

**Scenario:**
> Alison casts Embolden, targeting Vastwood Gorger and Scathe Zombies. When do they have to choose how much damage to each creature will be prevented? As the Embolden is cast, as it resolves, or as the damage is dealt?
> Cards involved: [[Embolden]], [[Vastwood Gorger]], [[Scathe Zombies]].
> RulesGuru source: https://rulesguru.org/?296RGBwnIIIgiB1MchzGG

**Expected verdict:** As the Embolden is cast. Any time a spell divides or distributes an effect among multiple targets, that decision is made as it's cast. (601.2d)

**Required reasoning:**
- Match the RulesGuru cited answer for question 296.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [601.2d]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Casting spells, Prevention effects.

## RG298. Ashley controls 3 artifacts and casts Rusted Relic. Noa controls Urabrask the Hidde...

**Scenario:**
> Ashley controls 3 artifacts and casts Rusted Relic. Noa controls Urabrask the Hidden. Does Rusted Relic enter the battlefield tapped or untapped?
> Cards involved: [[Rusted Relic]], [[Urabrask the Hidden]].
> RulesGuru source: https://rulesguru.org/?298RGBwnIII28zlVZGG

**Expected verdict:** Tapped. To determine what replacement effects apply to a permanent as it enters the battlefield, the game looks at the permanent as it would exist on the battlefield. (614.12) On the battlefield Rusted Relic would be a creature, so Urabrask the Hidden's effect will apply to it.

**Required reasoning:**
- Match the RulesGuru cited answer for question 298.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [614.12]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Replacement effects, Type-changing effects, Zone-changes, Continuous effects.

## RG299. Angelina controls 3 Nylea's Disciples. Nikolas controls Authority of the Consuls. A...

**Scenario:**
> Angelina controls 3 Nylea's Disciples. Nikolas controls Authority of the Consuls. Angelina casts Rally the Ancestors, putting Nylea, God of the Hunt and Hellkite Hatchling onto the battlefield. They choose to devour all 3 of the Nylea's Disciples. Does Nylea, God of the Hunt enter the battlefield tapped? Does Authority of the Consuls trigger for it?
> Cards involved: [[Nylea's Disciple]], [[Authority of the Consuls]], [[Rally the Ancestors]], [[Nylea, God of the Hunt]], [[Hellkite Hatchling]].
> RulesGuru source: https://rulesguru.org/?299RGBwnIIIsJ5C1u2kqh4ykGG

**Expected verdict:** It enters tapped, but Authority of the Consuls does not trigger for it. The Nylea, God of the Hunt and Hellkite Hatchling enter the battlefield at the same time as the Nylea's Disciples leave the battlefield. Nylea, God of the Hunt was entering the battlefield as a creature immediately beforehand, so it enters tapped. (614.12) There are no choices involved for Angelina (other than which creatures to devour), since the two replacement effects are applying to different objects. (616.1)

Once Nylea, God of the Hunt is on the battlefield it is not a creature, so Authority of the Consuls does not trigger. (611.3c)

**Required reasoning:**
- Match the RulesGuru cited answer for question 299.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [611.3c], [614.12], [616.1]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Intermediate. Tags: Zone-changes, Non-evergreen keywords, Replacement effects.

## RG300. Adalyn casts Show and Tell. As it resolves, Nico wants to put Throne of Eldraine on...

**Scenario:**
> Adalyn casts Show and Tell. As it resolves, Nico wants to put Throne of Eldraine onto the battlefield. Do they know what Adalyn is putting onto the battlefield while making the choice for Throne of Eldraine's replacement effect?
> Cards involved: [[Show and Tell]], [[Throne of Eldraine]].
> RulesGuru source: https://rulesguru.org/?300RGBwnIII2behKZGG

**Expected verdict:** Yes. Show and Tell puts both permanents onto the battlefield at the same time. Before they change zones, both players look at each card. (400.6)

**Required reasoning:**
- Match the RulesGuru cited answer for question 300.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [400.6]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Replacement effects, Zone-changes.

## RG301. Aryana controls Adrix and Nev, Twincasters, Flamerush Rider, and Goblin Roughrider....

**Scenario:**
> Aryana controls Adrix and Nev, Twincasters, Flamerush Rider, and Goblin Roughrider. They attack with Flamerush Rider and Goblin Roughrider, targeting Goblin Roughrider with Flamerush Rider's ability and creating two tokens. Do they both get exiled at the end of combat, or only one?
> Cards involved: [[Adrix and Nev, Twincasters]], [[Flamerush Rider]], [[Goblin Roughrider]].
> RulesGuru source: https://rulesguru.org/?301RGBwnIIInLUeUZMLGG

**Expected verdict:** Both. The "the token" refers to tokens created by the original ability, regardless of number. (607.2c)

**Required reasoning:**
- Match the RulesGuru cited answer for question 301.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [607.2c]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Tokens, Linked abilities, Abilities, Triggered abilities, Evergreen keywords.

## RG302. Azaria controls Vorstclaw and Lifeline. They cast Ribtruss Roaster and choose to de...

**Scenario:**
> Azaria controls Vorstclaw and Lifeline. They cast Ribtruss Roaster and choose to devour the Vorstclaw as it enters the battlefield. Does Lifeline trigger?
> Cards involved: [[Vorstclaw]], [[Lifeline]], [[Ribtruss Roaster]].
> RulesGuru source: https://rulesguru.org/?302RGBwnIIIb6yhnwvYGG

**Expected verdict:** Yes. The Ribtruss Roaster enters the battlefield at the same time as Vorstclaw leaves the battlefield. Lifeline checks to see if it should trigger immediately afterwards (603.10), at which point Ribtruss Roaster is on the battlefield.

**Required reasoning:**
- Match the RulesGuru cited answer for question 302.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [603.10]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Triggered abilities, Zone-changes, Replacement effects.

## RG303. Adonis casts Fomori Nomad on the first turn of the game, and then passes the turn....

**Scenario:**
> Adonis casts Fomori Nomad on the first turn of the game, and then passes the turn. Can Nico target it with Premature Burial on their turn?
> Cards involved: [[Fomori Nomad]], [[Premature Burial]].
> RulesGuru source: https://rulesguru.org/?303RGBwnIII1M33roGG

**Expected verdict:** Unclear. There is no "last turn" for Nico, so a creature can't have entered the battlefield since then. However there are some similar situations (like in [726.3]) where Wizards of the Coast has ruled that it would check when the last instance of an action "would have been". It's possible that that philosophy is also meant to apply here.

**Required reasoning:**
- Match the RulesGuru cited answer for question 303.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [726.3]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Turn structure, Timing and priority, Unsupported answers.

## RG304. April controls Casey Jones, Asphalt Hooligan enchanted by Nehemiah's Lost in Though...

**Scenario:**
> April controls Casey Jones, Asphalt Hooligan enchanted by Nehemiah's Lost in Thought. April exiles 3 cards from their graveyard in order to ignore the effect from Lost in Thought. Can Nehemiah activate Casey Jones, Asphalt Hooligan's ability?
> Cards involved: [[Casey Jones, Asphalt Hooligan]], [[Lost in Thought]].
> RulesGuru source: https://rulesguru.org/?304RGBwnIII305UvUGG

**Expected verdict:** No. Only April ignores the effect. Nehemiah still treats "its activated abilities can't be activated" as true.

**Required reasoning:**
- Match the RulesGuru cited answer for question 304.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Activated abilities, Abilities, Special actions.

## RG305. Amos controls Bramble Elemental enchanted by Hyena Umbra. They cast Aura Finesse ta...

**Scenario:**
> Amos controls Bramble Elemental enchanted by Hyena Umbra. They cast Aura Finesse targeting Hyena Umbra and Bramble Elemental. Does Bramble Elemental trigger?
> Cards involved: [[Bramble Elemental]], [[Hyena Umbra]], [[Aura Finesse]].
> RulesGuru source: https://rulesguru.org/?305RGBwnIIIeZDKErlxGG

**Expected verdict:** No. Hyena Umbra was already attached to Bramble Elemental, so it can't "become" attached again. (603.2f, 701.3b)

**Required reasoning:**
- Match the RulesGuru cited answer for question 305.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [603.2f], [701.3b]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Auras, Evergreen keywords.

## RG306. Nico controls Rhystic Study. Annabella casts Clinging Darkness. As Rhystic Study's...

**Scenario:**
> Nico controls Rhystic Study. Annabella casts Clinging Darkness. As Rhystic Study's trigger resolves, who makes their choice first? Does Nico choose whether or not to draw a card, and if yes, Annabella may pay the mana to prevent it? Or does Annabella choose to pay the mana first, and if they don't, Nico has the choice to draw a card?
> Cards involved: [[Rhystic Study]], [[Clinging Darkness]].
> RulesGuru source: https://rulesguru.org/?306RGBwnIII27uBzqGG

**Expected verdict:** Annabella chooses first. (118.12a, 118.12)

**Required reasoning:**
- Match the RulesGuru cited answer for question 306.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [118.12], [118.12a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Costs, Resolving objects.

## RG307. Nico controls Charmed Pendant that's a land due to March of the Machines, Xenograft...

**Scenario:**
> Nico controls Charmed Pendant that's a land due to March of the Machines, Xenograft (naming "Saproling"), and Life and Limb. The top card of Nico's library is Absorb, which neither player is aware of. If Arian taps Quirion Explorer for mana, what colors of mana can it produce?
> Cards involved: [[Charmed Pendant]], [[March of the Machines]], [[Xenograft]], [[Life and Limb]], [[Absorb]], [[Quirion Explorer]].
> RulesGuru source: https://rulesguru.org/?307RGBwnIII3DluEAi8DvvUS2eVGG

**Expected verdict:** Unclear. Quirion Explorer cares about what mana Charmed Pendant could produce if any of its mana abilities were to resolve at that time, "ignoring whether any costs of the ability could or could not be paid". (106.7) The rules are unclear on how to handle "ignored" costs when the ability cares about them.

**Required reasoning:**
- Match the RulesGuru cited answer for question 307.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [106.7]

**Why this test matters:** Imported RulesGuru benchmark. Level: Corner Case. Complexity: Intermediate. Tags: Mana, Mana abilities, Costs, Activated abilities, Abilities, Unsupported answers.

## RG308. Ariel and Naomi are beginning the game and have just drawn 7 cards. Naomi has a Ser...

**Scenario:**
> Ariel and Naomi are beginning the game and have just drawn 7 cards. Naomi has a Serum Powder in their hand. Does Naomi get to know whether Ariel is going to mulligan before deciding whether to use Serum Powder's ability?
> Cards involved: [[Serum Powder]].
> RulesGuru source: https://rulesguru.org/?308RGBwnIIIdCCGG

**Expected verdict:** Yes. Naomi exiles their hand and draws 7 cards at the time they would normally declare if they are going to take a mulligan (103.5b), which is after Ariel has made that decision. (103.5)

**Required reasoning:**
- Match the RulesGuru cited answer for question 308.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [103.5], [103.5b]

**Why this test matters:** Imported RulesGuru benchmark. Level: Corner Case. Complexity: Simple. Tags: Starting the game.

## RG309. Aubrey controls One with the Multiverse. The top card of their library is Dinosaurs...

**Scenario:**
> Aubrey controls One with the Multiverse. The top card of their library is Dinosaurs on a Spaceship. Can they suspend it?
> Cards involved: [[One with the Multiverse]], [[Dinosaurs on a Spaceship]].
> RulesGuru source: https://rulesguru.org/?309RGBwnIII2FS28lGG

**Expected verdict:** No. A card can only be suspended from the hand. (702.62a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 309.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [702.62a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Non-evergreen keywords, Casting spells, Special actions.

## RG310. Nelson has 6 life and controls Abyssal Persecutor. Aileen has 0 life and attacks wi...

**Scenario:**
> Nelson has 6 life and controls Abyssal Persecutor. Aileen has 0 life and attacks with 2 Craw Wurm. Nelson blocks one of them with Abyssal Persecutor. Who wins the game?
> Cards involved: [[Abyssal Persecutor]], [[Craw Wurm]].
> RulesGuru source: https://rulesguru.org/?310RGBwnIII1tHYzlGG

**Expected verdict:** Aileen wins the game. Immediately after combat damage is dealt, both players have 0 life and Abyssal Persecutor has 6 damage marked on it. (302.7) When state-based actions are checked, Abyssal Persecutor dies at the same time as Nelson loses the game. (704.3) This causes Aileen to win the game (104.2a), so state-based actions aren't checked again and they never have a chance to lose.

**Required reasoning:**
- Match the RulesGuru cited answer for question 310.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [104.2a], [302.7], [704.3]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: State-based actions, Leaving the game, Life, Combat.

## RG311. Avery controls Possibility Storm and casts Curio Vendor. Nola counters it with Patr...

**Scenario:**
> Avery controls Possibility Storm and casts Curio Vendor. Nola counters it with Patron Wizard. What happens as the Possibility Storm trigger resolves?
> Cards involved: [[Possibility Storm]], [[Curio Vendor]], [[Patron Wizard]].
> RulesGuru source: https://rulesguru.org/?311RGBwnIIIjwyxWDfFGG

**Expected verdict:** Avery doesn't exile the Curio Vendor in their graveyard, since it's a new object. (400.7) However they do exile cards from the top of their library until they exile a card that shares a card type with Curio Vendor and resolve the rest of the ability normally. (608.2h)

**Required reasoning:**
- Match the RulesGuru cited answer for question 311.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [400.7], [608.2h]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: The stack, Last known information, Resolving objects.

## RG312. Abdiel, Blair, and Campbell are playing a multiplayer game. Abdiel has Erebos's Tit...

**Scenario:**
> Abdiel, Blair, and Campbell are playing a multiplayer game. Abdiel has Erebos's Titan in their graveyard and Blair has Jasmine Boreal in theirs. Abdiel attacks Blair and they lose the game. Does Erebos's Titan trigger?
> Cards involved: [[Erebos's Titan]], [[Jasmine Boreal]].
> RulesGuru source: https://rulesguru.org/?312RGBwnIII1JLd1hGG

**Expected verdict:** According to the rules, yes. When a player loses the game, the objects owned by that player also leave the game. (800.4a)

A Gatherer ruling on Erebos's Titan says that it doesn't trigger, but that may be an error.

**Required reasoning:**
- Match the RulesGuru cited answer for question 312.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [800.4a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Triggered abilities, Multiplayer, Leaving the game, Zone-changes, Unsupported answers.

## RG313. Andres controls Mairsil, the Pretender and has Hellspur Posse Boss in exile with a...

**Scenario:**
> Andres controls Mairsil, the Pretender and has Hellspur Posse Boss in exile with a cage counter on it. They activate Quicksilver Elemental, targeting Mairsil, the Pretender. Does Quicksilver Elemental gain the activated abilities of Hellspur Posse Boss? If so, can they be activated more than once that turn?
> Cards involved: [[Mairsil, the Pretender]], [[Hellspur Posse Boss]], [[Quicksilver Elemental]].
> RulesGuru source: https://rulesguru.org/?313RGBwnIIIis2vwZFeGG

**Expected verdict:** Quicksilver Elemental does gain the activated abilities of Mairsil, the Pretender, but they can only be activated once per turn. Mairsil, the Pretender's instruction of "You may activate each of those abilities only once each turn" is an activation instruction that's added to each ability it gains (113.10a), and Quicksilver Elemental retains all activation instructions on each ability that it gains.

**Required reasoning:**
- Match the RulesGuru cited answer for question 313.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [113.10a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Abilities, Activated abilities.

## RG315. Autumn casts and resolves Approach of the Second Sun. The game is then restarted wi...

**Scenario:**
> Autumn casts and resolves Approach of the Second Sun. The game is then restarted with Karn Liberated. Autumn casts and resolves Approach of the Second Sun again. Do they win the game?
> Cards involved: [[Approach of the Second Sun]], [[Karn Liberated]].
> RulesGuru source: https://rulesguru.org/?315RGBwnIII1viOfCGG

**Expected verdict:** No. The restarted game is a completely new game. (726.1)

**Required reasoning:**
- Match the RulesGuru cited answer for question 315.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [726.1]

**Why this test matters:** Imported RulesGuru benchmark. Level: 0. Complexity: Simple. Tags: Leaving the game, Miscellaneous, Starting the game, Resolving objects.

## RG316. Amir controls Blade of the Bloodchief and Atla Palani, Nest Tender, which is their...

**Scenario:**
> Amir controls Blade of the Bloodchief and Atla Palani, Nest Tender, which is their commander. Amir sacrifices Atla Palani, Nest Tender to Bound // Determined and chooses to put it into their command zone. Does Blade of the Bloodchief trigger?
> Cards involved: [[Blade of the Bloodchief]], [[Atla Palani, Nest Tender]], [[Bound // Determined]].
> RulesGuru source: https://rulesguru.org/?316RGBwnIIIeNcxXdmQGG

**Expected verdict:** Yes. Commanders do move to the graveyard when sacrificed. They may be put into the command zone when state-based actions are checked. (704.6d/903.9a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 316.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [704.6d], [903.9a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Commander, Zone-changes, Replacement effects, Evergreen keywords.

## RG317. Nylah controls Brisela, Voice of Nightmares. Can Aspen cast Crater's Claws with X = 3?

**Scenario:**
> Nylah controls Brisela, Voice of Nightmares. Can Aspen cast Crater's Claws with X = 3?
> Cards involved: [[Brisela, Voice of Nightmares]], [[Crater's Claws]].
> RulesGuru source: https://rulesguru.org/?317RGBwnIII1zfTB1GG

**Expected verdict:** Yes. While on the stack, the mana value of an object treats X as its actual value. (202.3e) Aspen is allowed to begin casting Crater's Claws and choose X's value as "3" during that process, even though Crater's Claws's mana value in their hand is 1. (601.3a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 317.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [202.3e], [601.3a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Casting spells, Costs, Mana, The stack.

## RG318. Angela controls Icetill Explorer. They plays 2 lands, then cast Blur targeting Icet...

**Scenario:**
> Angela controls Icetill Explorer. They plays 2 lands, then cast Blur targeting Icetill Explorer. After it resolves, can Angela play a third land?
> Cards involved: [[Icetill Explorer]], [[Blur]].
> RulesGuru source: https://rulesguru.org/?318RGBwnIII2ZcY4OGG

**Expected verdict:** No. Land plays are not linked to any specific permanent, the game just looks at how many lands Angela has played and how many Angela is allowed to play in total. (305.2a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 318.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [305.2a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Lands, Special actions, Zone-changes.

## RG319. Ainsley controls a token that was created as a copy of Panglacial Wurm and Archmage...

**Scenario:**
> Ainsley controls a token that was created as a copy of Panglacial Wurm and Archmage Ascension with 6 quest counters on it. Nolan casts Oblation targeting Panglacial Wurm. As Ainsley is searching their library, can they cast the token copy of Panglacial Wurm from it?
> Cards involved: [[Panglacial Wurm]], [[Archmage Ascension]], [[Oblation]].
> RulesGuru source: https://rulesguru.org/?319RGBwnIIIjjNtbKEMGG

**Expected verdict:** No. The token does continue to exist in the library until state-based actions are checked after Oblation resolves. (111.7) However, a token in a zone other than the battlefield can't change zones, so Ainsley can't put it onto the stack in order to begin casting it. (111.8)

**Required reasoning:**
- Match the RulesGuru cited answer for question 319.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [111.7], [111.8]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Casting spells, Replacement effects, Resolving objects, Tokens, Drawing a card, Zone-changes.

## RG320. Autumn controls a token that's a copy of Golgari Brownscale created by Kindle the I...

**Scenario:**
> Autumn controls a token that's a copy of Golgari Brownscale created by Kindle the Inner Flame. They cast Slay to destroy Golgari Brownscale. Can Autumn dredge the token? If so, what happens?
> Cards involved: [[Golgari Brownscale]], [[Kindle the Inner Flame]], [[Slay]].
> RulesGuru source: https://rulesguru.org/?320RGBwnIIIyjqlgjxLGG

**Expected verdict:** The token is put into the graveyard just like any other permanent (111.6), and it has dredge while it's there. However Golgari Brownscale can't leave the graveyard (111.8), so Autumn can't choose to dredge it. (702.52a, 608.2d)

**Required reasoning:**
- Match the RulesGuru cited answer for question 320.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [111.6], [111.8], [608.2d], [702.52a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Non-evergreen keywords, Drawing a card, Replacement effects, Tokens, Zone-changes, Copy effects.

## RG321. Ainsley, Brayden, and Cheyenne are playing a multiplayer game. Ainsley controls Ext...

**Scenario:**
> Ainsley, Brayden, and Cheyenne are playing a multiplayer game. Ainsley controls Extractor Demon and Brayden controls Grizzly Bears. Ainsley attacks Brayden with Extractor Demon and Brayden loses the game. Does Extractor Demon trigger?
> Cards involved: [[Extractor Demon]], [[Grizzly Bears]].
> RulesGuru source: https://rulesguru.org/?321RGBwnIII1KiKXiGG

**Expected verdict:** Yes. (603.6c)

**Required reasoning:**
- Match the RulesGuru cited answer for question 321.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [603.6c]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Leaving the game, Zone-changes, Triggered abilities, Multiplayer.

## RG323. Addison controls Strionic Resonator and plays Collector's Cage. They activate Strio...

**Scenario:**
> Addison controls Strionic Resonator and plays Collector's Cage. They activate Strionic Resonator targeting the hideaway trigger, exiling 2 cards. On their next turn, they activate Collector's Cage's ability to cast the exiled card. What happens as it resolves?
> Cards involved: [[Strionic Resonator]], [[Collector's Cage]].
> RulesGuru source: https://rulesguru.org/?323RGBwnIII2f3K0DGG

**Expected verdict:** Assuming Addison meets the stated condition, they may cast one or both exiled cards. (607.3)

**Required reasoning:**
- Match the RulesGuru cited answer for question 323.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [607.3]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Zone-changes, Casting spells, Resolving objects, Linked abilities.

## RG324. Adrien controls Sarkhan's Unsealing and 6 Mountains. They cast Maraxus of Keld tapp...

**Scenario:**
> Adrien controls Sarkhan's Unsealing and 6 Mountains. They cast Maraxus of Keld tapping those Mountains. Does Sarkhan's Unsealing trigger?
> Cards involved: [[Sarkhan's Unsealing]], [[Mountain]], [[Maraxus of Keld]].
> RulesGuru source: https://rulesguru.org/?324RGBwnIIIkhhDxs3zGG

**Expected verdict:** No. Maraxus of Keld's ability is a characteristic-defining ability (604.3a) and applies in all zones. (113.6a) Tapping lands to cast a spell comes before the game checks to see if Sarkhan's Unsealing should trigger. (601.2g, 601.2i)

**Required reasoning:**
- Match the RulesGuru cited answer for question 324.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [113.6a], [601.2g], [601.2i], [604.3a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Abilities, Continuous effects, Casting spells.

## RG325. Ainsley casts Mephitic Vapors and sees Blood Operative while surveilling. They choo...

**Scenario:**
> Ainsley casts Mephitic Vapors and sees Blood Operative while surveilling. They choose to put it into the graveyard. Does it trigger to return to Ainsley's hand?
> Cards involved: [[Mephitic Vapors]], [[Blood Operative]].
> RulesGuru source: https://rulesguru.org/?325RGBwnIII1YMh0CGG

**Expected verdict:** Yes. Triggered abilities are checked to see if they triggered immediately after the given event has occurred. (603.10) Blood Operative was in the graveyard immediately after the surveil, so it triggers.

**Required reasoning:**
- Match the RulesGuru cited answer for question 325.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [603.10]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Triggered abilities, Zone-changes, Non-evergreen keywords.

## RG326. Ariel attacks Nash with Kaalia of the Vast. As its trigger resolves, they put Maste...

**Scenario:**
> Ariel attacks Nash with Kaalia of the Vast. As its trigger resolves, they put Master of Cruelties onto the battlefield. What happens?
> Cards involved: [[Kaalia of the Vast]], [[Master of Cruelties]].
> RulesGuru source: https://rulesguru.org/?326RGBwnIII1UrEHzGG

**Expected verdict:** Nash loses the game. The ability "Master of Cruelties can only attack alone." isn't relevant here- it's being put onto the battlefield already attacking. (508.4c) Even though it never attacked, its trigger of "Whenever Master of Cruelties attacks a player and isn't blocked" will still trigger. (508.3f/509.3g) Nash's life total becomes 1, and then Kaalia of the Vast deals 2 damage to them. (508.3f)

**Required reasoning:**
- Match the RulesGuru cited answer for question 326.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [508.3f], [508.4c], [509.3g]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Combat, Zone-changes, Triggered abilities.

## RG327. Aldo casts Harm's Way, choosing Sulfurous Springs as the source of damage and Nayel...

**Scenario:**
> Aldo casts Harm's Way, choosing Sulfurous Springs as the source of damage and Nayeli as the target. After it resolves, Aldo taps Sulfurous Springs for {R}. Is Nayeli dealt 1 damage?
> Cards involved: [[Harm's Way]], [[Sulfurous Springs]].
> RulesGuru source: https://rulesguru.org/?327RGBwnIII1PWbcyGG

**Expected verdict:** Yes. The damage is redirected to Nayeli. It doesn't matter that it's coming from a source Aldo controls.

**Required reasoning:**
- Match the RulesGuru cited answer for question 327.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: 0. Complexity: Simple. Tags: Damage, Replacement effects, Mana abilities.

## RG328. Alex controls Axebane Beast equipped with Glaive of the Guildpact and no Gates. Doe...

**Scenario:**
> Alex controls Axebane Beast equipped with Glaive of the Guildpact and no Gates. Does it have vigilance and menace?
> Cards involved: [[Axebane Beast]], [[Glaive of the Guildpact]].
> RulesGuru source: https://rulesguru.org/?328RGBwnIII1wxbN3GG

**Expected verdict:** Yes. The only thing that Gates affect is how much Axebane Beast's power is increased.

**Required reasoning:**
- Match the RulesGuru cited answer for question 328.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: 0. Complexity: Simple. Tags: Abilities.

## RG329. Nick controls Alms Collector and Dictate of Kruphix. Amanda is beginning their draw...

**Scenario:**
> Nick controls Alms Collector and Dictate of Kruphix. Amanda is beginning their draw step. Does Nick draw a card?
> Cards involved: [[Alms Collector]], [[Dictate of Kruphix]].
> RulesGuru source: https://rulesguru.org/?329RGBwnIII1uAX5uGG

**Expected verdict:** No. Alms Collector's replacement effect only applies to an opponent drawing two or more cards at a time. It does not apply to drawing a card as a turn-based action and then drawing one later as the result of Dictate of Kruphix's triggered ability.

**Required reasoning:**
- Match the RulesGuru cited answer for question 329.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Drawing a card, Replacement effects, Triggered abilities, Turn structure.

## RG330. Alex controls Underrealm Lich and The Gitrog Monster. They cast Counsel of the Sora...

**Scenario:**
> Alex controls Underrealm Lich and The Gitrog Monster. They cast Counsel of the Soratami. While resolving Counsel of the Soratami, all 4 cards that are put into Alex's graveyard are lands. How many times does The Gitrog Monster trigger?
> Cards involved: [[Underrealm Lich]], [[The Gitrog Monster]], [[Counsel of the Soratami]].
> RulesGuru source: https://rulesguru.org/?330RGBwnIIIlW89W5B5GG

**Expected verdict:** Twice. The Gitrog Monster triggers when an event places one or more land cards are put into the graveyard, it doesn't matter how many. (700.1) Each card draw for Counsel of the Soratami happens one at a time (121.2), so there are 2 instances of 2 land cards being put into the graveyard.

**Required reasoning:**
- Match the RulesGuru cited answer for question 330.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [121.2], [700.1]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Resolving objects, Triggered abilities, Drawing a card, Zone-changes.

## RG331. Antoine controls Divine Visitation and Parallel Lives. They cast Sprout. How many t...

**Scenario:**
> Antoine controls Divine Visitation and Parallel Lives. They cast Sprout. How many tokens are created, of what types?
> Cards involved: [[Divine Visitation]], [[Parallel Lives]], [[Sprout]].
> RulesGuru source: https://rulesguru.org/?331RGBwnIIIg1orhVwfGG

**Expected verdict:** Two 4/4 Angels are created. There are two replacement effects attempting to apply to the same event, so Antoine must choose one to apply first, and the other will be applied second. (616.1) Once one effect has been applied to the event, it can't be applied again. (614.5/616.1f) Antoine can either double the tokens and then turn them into Angels or turn the token into an Angel and then double it, but the result is the same either way.

**Required reasoning:**
- Match the RulesGuru cited answer for question 331.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [614.5], [616.1], [616.1f]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Tokens, Replacement effects.

## RG332. Avianna casts Chaos Warp targeting Nico's commander. Nico chooses to put it into th...

**Scenario:**
> Avianna casts Chaos Warp targeting Nico's commander. Nico chooses to put it into the command zone instead of the library. Is Nico's library shuffled? Do them reveal the card of their library and put it onto the battlefield if it's a permanent card?
> Cards involved: [[Chaos Warp]].
> RulesGuru source: https://rulesguru.org/?332RGBwnIIIaaCGG

**Expected verdict:** Nico does shuffle their library. (701.24c)

Nico does reveal the top card. Chaos Warp doesn't care where the target moves to as it resolves, it simply instructs Nico to do so.

**Required reasoning:**
- Match the RulesGuru cited answer for question 332.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [701.24c]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Replacement effects, Commander, Libraries, Resolving objects, Zone-changes.

## RG334. Ana controls Leyline of the Void and casts Raven's Crime to have Nico discard a car...

**Scenario:**
> Ana controls Leyline of the Void and casts Raven's Crime to have Nico discard a card. Nico discards Dodecapod. Does it end up on the battlefield or in exile?
> Cards involved: [[Leyline of the Void]], [[Raven's Crime]], [[Dodecapod]].
> RulesGuru source: https://rulesguru.org/?334RGBwnIIIig8nwT5DGG

**Expected verdict:** Whichever Nico prefers. There are two replacement effects applying to Dodecapod going to the graveyard. Nico is the controller of the affected object, so they choose where it ends up. (614.1a, 616.1)

**Required reasoning:**
- Match the RulesGuru cited answer for question 334.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [614.1a], [616.1]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Replacement effects, Evergreen keywords, Zone-changes.

## RG335. Amira casts Smallpox. Can Nash discard Nullhide Ferox as their card to discard putt...

**Scenario:**
> Amira casts Smallpox. Can Nash discard Nullhide Ferox as their card to discard putting it onto the battlefield, then sacrifice it as their creature?
> Cards involved: [[Smallpox]], [[Nullhide Ferox]].
> RulesGuru source: https://rulesguru.org/?335RGBwnIII2czipiGG

**Expected verdict:** Yes. Spells resolve in the order they're written. (608.2c)

**Required reasoning:**
- Match the RulesGuru cited answer for question 335.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [608.2c]

**Why this test matters:** Imported RulesGuru benchmark. Level: 0. Complexity: Simple. Tags: Resolving objects, Replacement effects.

## RG336. Autumn attacks with Laccolith Titan. Nadia declares no blocks and then casts Dazzli...

**Scenario:**
> Autumn attacks with Laccolith Titan. Nadia declares no blocks and then casts Dazzling Beauty targeting Laccolith Titan. Does Laccolith Titan trigger?
> Cards involved: [[Laccolith Titan]], [[Dazzling Beauty]].
> RulesGuru source: https://rulesguru.org/?336RGBwnIII1VWLxnGG

**Expected verdict:** Yes. "Blocked" in this context refers to the state of being a blocked creature. Laccolith Titan went from being an unblocked creature to being a blocked creature, so it "became blocked". (509.3c)

**Required reasoning:**
- Match the RulesGuru cited answer for question 336.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [509.3c]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Combat, Triggered abilities.

## RG337. Arian controls Hazezon Tamar and casts Blades of Velis Vel targeting Hazezon Tamar....

**Scenario:**
> Arian controls Hazezon Tamar and casts Blades of Velis Vel targeting Hazezon Tamar. Before it resolves, Nico casts Unlicensed Disintegration targeting Hazezon Tamar. After everything has resolved, what zone is Blades of Velis Vel in?
> Cards involved: [[Hazezon Tamar]], [[Blades of Velis Vel]], [[Unlicensed Disintegration]].
> RulesGuru source: https://rulesguru.org/?337RGBwnIIIhoqyOTrNGG

**Expected verdict:** The graveyard. "Exile all Sand Warriors" only refers to Sand Warriors on the battlefield. (109.2)

**Required reasoning:**
- Match the RulesGuru cited answer for question 337.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [109.2]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Zone-changes, Resolving objects.

## RG338. Alan activates Grasslands. Before that resolves Neriah casts Aven Mindcensor. When...

**Scenario:**
> Alan activates Grasslands. Before that resolves Neriah casts Aven Mindcensor. When Alan is resolving Grasslands's ability, they find Panglacial Wurm in the top four cards of their library. Can they cast it?
> Cards involved: [[Grasslands]], [[Aven Mindcensor]], [[Panglacial Wurm]].
> RulesGuru source: https://rulesguru.org/?338RGBwnIIIhcaCxk4FGG

**Expected verdict:** Yes. Aven Mindcensor's ability is a replacement effect that replaces searching a library with searching only the top four cards of that library. (614.6) However for the purposes of Panglacial Wurm's effect, it still qualifies as "searching a library". (701.23f)

**Required reasoning:**
- Match the RulesGuru cited answer for question 338.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [614.6], [701.23f]

**Why this test matters:** Imported RulesGuru benchmark. Level: Corner Case. Complexity: Simple. Tags: Replacement effects, Libraries.

## RG344. Amia controls Muldrotha, the Gravetide, Ashnod's Altar, and has a Loxodon Line Brea...

**Scenario:**
> Amia controls Muldrotha, the Gravetide, Ashnod's Altar, and has a Loxodon Line Breaker in their graveyard. Amia would like to sacrifice Muldrotha, the Gravetide to Ashnod's Altar to pay for Loxodon Line Breaker. Can they do this?
> Cards involved: [[Muldrotha, the Gravetide]], [[Ashnod's Altar]], [[Loxodon Line Breaker]].
> RulesGuru source: https://rulesguru.org/?344RGBwnIIIiT7uogq6GG

**Expected verdict:** Yes. The game checks to see if casting the spell would be legal as part of putting it on the stack (601.2), and after all choices for the spell have been made. (601.2e) At both of these points Muldrotha, the Gravetide is still on the battlefield. A few steps later the game asks Amia to activate mana abilities to pay for the spell, which is where Amia will sacrifice Muldrotha, the Gravetide. (601.2g) The game doesn't re-check the legality of the spell afterwards.

**Required reasoning:**
- Match the RulesGuru cited answer for question 344.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [601.2], [601.2e], [601.2g]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Casting spells.

## RG345. Anson controls Icetill Explorer. Can they cast Zoetic Cavern from their graveyard f...

**Scenario:**
> Anson controls Icetill Explorer. Can they cast Zoetic Cavern from their graveyard face down?
> Cards involved: [[Icetill Explorer]], [[Zoetic Cavern]].
> RulesGuru source: https://rulesguru.org/?345RGBwnIII2ZcWzdGG

**Expected verdict:** No, they can't. Morph does function in the graveyard, since Zoetic Cavern could be played from there. (702.37a) However, as the first step to determine if Zoetic Cavern can be cast for its morph cost, it is turned face down. (702.37c) A face-down Zoetic Cavern is a creature card, not a land card, so Icetill Explorer no longer gives Anson permission to play it. (702.37a, 708.2a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 345.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [702.37a], [702.37c], [708.2a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Casting spells, Face-down objects, Lands, Special actions.

## RG346. Noel controls Yixlid Jailer. Aubrey uses Recoup to give Tezzeret's Betrayal in thei...

**Scenario:**
> Noel controls Yixlid Jailer. Aubrey uses Recoup to give Tezzeret's Betrayal in their graveyard Flashback. Is Aubrey able to cast Tezzeret's Betrayal from their graveyard to destroy Yixlid Jailer?
> Cards involved: [[Yixlid Jailer]], [[Recoup]], [[Tezzeret's Betrayal]].
> RulesGuru source: https://rulesguru.org/?346RGBwnIIImyuQaYDfGG

**Expected verdict:** Yes. Both Yixlid Jailer and Recoup are applying a continuous effect to Tezzeret's Betrayal, and both are being applied in layer 6. (613.1f) Since there is no dependency between the two effects, they are applied in timestamp order; Yixlid Jailer removes all abilities from Tezzeret's Betrayal, which is then given flashback by Recoup. (613.3/613.7)

**Required reasoning:**
- Match the RulesGuru cited answer for question 346.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [613.1f], [613.3], [613.7]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Casting spells, Graveyard, Layers, Continuous effects, Static abilities, Non-evergreen keywords.

## RG347. Armani controls Raging Poltergeist and Winding Constrictor. Nathalia casts Cannibal...

**Scenario:**
> Armani controls Raging Poltergeist and Winding Constrictor. Nathalia casts Cannibalize targeting them both. When it resolves, they choose to exile Winding Constrictor and to put +1/+1 counters on Raging Poltergeist. How many +1/+1 counters are placed on Raging Poltergeist?
> Cards involved: [[Raging Poltergeist]], [[Winding Constrictor]], [[Cannibalize]].
> RulesGuru source: https://rulesguru.org/?347RGBwnIIIjL5HV4C6GG

**Expected verdict:** 2. Spells resolve in the order printed on the card. (608.2c) Winding Constrictor is exiled before placing the counters on Raging Poltergeist.

**Required reasoning:**
- Match the RulesGuru cited answer for question 347.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [608.2c]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Replacement effects, Resolving objects, Counters.

## RG349. Nick controls Warping Wurm. Aliyah casts Dragonlord Silumgar and takes control of W...

**Scenario:**
> Nick controls Warping Wurm. Aliyah casts Dragonlord Silumgar and takes control of Warping Wurm. During Aliyah's next untap step Warping Wurm phases out. Nick then casts Deathsprout targeting Dragonlord Silumgar. When does Warping Wurm phase in, and who will control it?
> Cards involved: [[Warping Wurm]], [[Dragonlord Silumgar]], [[Deathsprout]].
> RulesGuru source: https://rulesguru.org/?349RGBwnIIImiEfJ6WEGG

**Expected verdict:** Warping Wurm will phase in during Aliyah's next untap step, since they were the player who controlled it last. (502.1/702.26a) Since the duration on Dragonlord Silumgar's continuous effect that was giving Aliyah control of Warping Wurm has expired, Aliyah no longer has any reason to control Warping Wurm. (611.2a) It will phase in under Nick's control.

**Required reasoning:**
- Match the RulesGuru cited answer for question 349.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [502.1], [611.2a], [702.26a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Phasing, Continuous effects, Non-evergreen keywords, Control-changing effects.

## RG356. Azariah casts Beacon Bolt targeting Memnite controlled by Nico. If Azariah owns no...

**Scenario:**
> Azariah casts Beacon Bolt targeting Memnite controlled by Nico. If Azariah owns no other instant or sorcery cards in their graveyard or exile, how much damage will Beacon Bolt deal?
> Cards involved: [[Beacon Bolt]], [[Memnite]].
> RulesGuru source: https://rulesguru.org/?356RGBwnIII1xhAhlGG

**Expected verdict:** Zero. Beacon Bolt remains on the stack until it's finished resolving. (608.2n)

**Required reasoning:**
- Match the RulesGuru cited answer for question 356.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [608.2n]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Casting spells, Zone-changes, Damage, Targets, Types, Resolving objects.

## RG361. Aryanna controls Watchwolf enchanted by Lignify, Figure of Destiny that's had its t...

**Scenario:**
> Aryanna controls Watchwolf enchanted by Lignify, Figure of Destiny that's had its third ability activated, and Swab Goblin. They casts Pack's Favor targeting Swab Goblin. After that resolves, they casts Mirrorweave targeting Figure of Destiny. What are the characteristics of Swab Goblin and Watchwolf?
> Cards involved: [[Watchwolf]], [[Lignify]], [[Figure of Destiny]], [[Swab Goblin]], [[Pack's Favor]], [[Mirrorweave]].
> RulesGuru source: https://rulesguru.org/?361RGBwnIII5kKeVEVEjWlQxVaoGG

**Expected verdict:** Watchwolf is a 0/4 Treefolk with no abilities. Swab Goblin is a 4/4 Kithikin with Figure of Destiny's printed abilities (not flying or first strike).

Mirrorweave confers Figure of Destiny's copiable values to the other cards. (707.2) This doesn't include the type and text-changing effects that are currently applying to it. Watchwolf will become a 1/1 in layer 1 (613.1a) but then will have its power and toughness changed in layer 7. (613.4) Swab Goblin is in a similar situation, copy effects will be applied in layer 1. Pack's Favor will be applied later in layer 7c. (613.4c)

**Required reasoning:**
- Match the RulesGuru cited answer for question 361.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [613.1a], [613.4], [613.4c], [707.2]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Intermediate. Tags: Layers, Continuous effects, Copy effects.

## RG365. Ava controls Dralnu's Crusade and Rotted Hystrix. Ava then casts Conspiracy naming...

**Scenario:**
> Ava controls Dralnu's Crusade and Rotted Hystrix. Ava then casts Conspiracy naming "Goblin". What are the creature types of Rotted Hystrix and does it get +1/+1? 
> Cards involved: [[Dralnu's Crusade]], [[Rotted Hystrix]], [[Conspiracy]].
> RulesGuru source: https://rulesguru.org/?365RGBwnIIIg5yQBlM1GG

**Expected verdict:** Rotted Hystrix is a black Goblin Zombie in addition to its other types and does get +1/+1. Dralnu's Crusade is dependent on Conspiracy, because applying Conspiracy first changes the set of permanents Dralnu's Crusade would apply to. (613.8a) Because of this, Conspiracy's effect is applied first, and then Dralnu's Crusade's effect. (613.8b)

**Required reasoning:**
- Match the RulesGuru cited answer for question 365.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [613.8a], [613.8b]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Type-changing effects, Dependency, Layers, Continuous effects.

## RG368. Noah casts Wizard's Lightning targeting Arielle, who is at 2 life. Before it resolv...

**Scenario:**
> Noah casts Wizard's Lightning targeting Arielle, who is at 2 life. Before it resolves, Arielle casts Selfless Squire, and then Angel's Grace. What happens when Wizard's Lightning resolves?
> Cards involved: [[Wizard's Lightning]], [[Selfless Squire]], [[Angel's Grace]].
> RulesGuru source: https://rulesguru.org/?368RGBwnIIImtguJWxSGG

**Expected verdict:** Selfless Squire prevents the damage and triggers. (120.4b) Angel's Grace never applies, since the damage was never dealt. (120.4c) Arielle remains at 2 life and Selfless Squire gets +1/+1 counters equal to the damage prevented.

(Angel's Grace's effect is not a prevention effect (615.1a), it's a replacement effect that modifies how the damage is dealt.)

**Required reasoning:**
- Match the RulesGuru cited answer for question 368.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [120.4b], [120.4c], [615.1a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Replacement effects, Prevention effects, Life, Damage.

## RG372. Aliyah controls Maelstrom Nexus and evokes Glarewielder. They begin to reveal cards...

**Scenario:**
> Aliyah controls Maelstrom Nexus and evokes Glarewielder. They begin to reveal cards from the top of their library and reveals Eiganjo Free-Riders. Can they cast it?
> Cards involved: [[Maelstrom Nexus]], [[Glarewielder]], [[Eiganjo Free-Riders]].
> RulesGuru source: https://rulesguru.org/?372RGBwnIIIiq9Q5vaXGG

**Expected verdict:** Yes. Cascade exiles cards until it exiles a nonland card with a lesser mana value than the spell with cascade. (702.85a) Casting a spell with evoke follows the same rules for casting spells with alternative costs, which don't change the mana value of the spell. (118.9c, 202.3)

**Required reasoning:**
- Match the RulesGuru cited answer for question 372.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [118.9c], [202.3], [702.85a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Non-evergreen keywords, Casting spells, Costs, Numbers and symbols.

## RG374. Alannah controls Amulet of Vigor and plays Gateway Plaza. Can they pay for the trig...

**Scenario:**
> Alannah controls Amulet of Vigor and plays Gateway Plaza. Can they pay for the trigger with Gateway Plaza?
> Cards involved: [[Amulet of Vigor]], [[Gateway Plaza]].
> RulesGuru source: https://rulesguru.org/?374RGBwnIII1uMEWZGG

**Expected verdict:** Yes. When Alannah plays Gateway Plaza, it and Amulet of Vigor both trigger simultaneously. Alannah can choose the order these go on the stack and have Gateway Plaza untap before they is required to pay for Gateway Plaza's ability. (603.3b)

**Required reasoning:**
- Match the RulesGuru cited answer for question 374.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [603.3b]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Triggered abilities.

## RG376. Nico controls Elesh Norn, Grand Cenobite. Alfonso controls two Starnheim Mementos a...

**Scenario:**
> Nico controls Elesh Norn, Grand Cenobite. Alfonso controls two Starnheim Mementos and casts Arcbound Ravager. Can they sacrifice the Starnheim Mementos to Arcbound Ravager to keep it alive?
> Cards involved: [[Elesh Norn, Grand Cenobite]], [[Starnheim Memento]], [[Arcbound Ravager]].
> RulesGuru source: https://rulesguru.org/?376RGBwnIIIgfNTh7WUGG

**Expected verdict:** No. Elesh Norn, Grand Cenobite has a static ability that gives all of Alfonso's creatures -2/-2. (604.1) This ability functions at all times, Arcbound Ravager enters the battlefield as a-1/-1, and before Alfonso has a chance to do anything the game will check state-based actions and it'll die. (405.6f, 704.3)

**Required reasoning:**
- Match the RulesGuru cited answer for question 376.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [405.6f], [604.1], [704.3]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: State-based actions, Static abilities, Continuous effects.

## RG378. Avery controls a Frost Walker. Avery casts Restoration Angel. Will Frost Walker be...

**Scenario:**
> Avery controls a Frost Walker. Avery casts Restoration Angel. Will Frost Walker be sacrificed?
> Cards involved: [[Frost Walker]], [[Restoration Angel]].
> RulesGuru source: https://rulesguru.org/?378RGBwnIII1Myt9ZGG

**Expected verdict:** Yes. Restoration Angel's ability goes on the stack when it enters the battlefield, and part of putting the ability on the stack involves choosing legal targets for the ability. (603.3, 601.2c) Even if Avery has no intention of exiling Frost Walker, they don't make that decision until the ability starts resolving. (608.2d, 603.5)

**Required reasoning:**
- Match the RulesGuru cited answer for question 378.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [601.2c], [603.3], [603.5], [608.2d]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Triggered abilities, Resolving objects, Targets.

## RG384. Ainsley controls two Bramblewood Paragons and casts Thunder-Thrash Elder. What is t...

**Scenario:**
> Ainsley controls two Bramblewood Paragons and casts Thunder-Thrash Elder. What is the maximum amount of counters Thunder-Thrash Elder can enter the battlefield with?
> Cards involved: [[Bramblewood Paragon]], [[Thunder-Thrash Elder]].
> RulesGuru source: https://rulesguru.org/?384RGBwnIII1yZPV9GG

**Expected verdict:** Eight. Both Bramblewood Paragon and Thunder-Thrash Elder have replacement effects that modify how Thunder-Thrash Elder enters the battlefield. (614.1c) While Thunder-Thrash Elder is entering the battlefield the game checks which replacement effects to apply, and sees that there are two Bramblewood Paragons that want to place an additional +1/+1 counter on Thunder-Thrash Elder as well as a Devour ability. If Ainsley chooses to devour the Bramblewood Paragons, they will place an additional six +1/+1 counters on Thunder-Thrash Elder.

**Required reasoning:**
- Match the RulesGuru cited answer for question 384.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [614.1c]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Intermediate. Tags: Replacement effects.

## RG386. Andy casts Hymn of Rebirth targeting Collins's Goblin Piker in their graveyard and...

**Scenario:**
> Andy casts Hymn of Rebirth targeting Collins's Goblin Piker in their graveyard and passes the turn. On Blaine's turn they cast Dark Nourishment targeting Collins, reducing them to 0 life. What will happen to Goblin Piker when Collins dies?
> Cards involved: [[Hymn of Rebirth]], [[Goblin Piker]], [[Dark Nourishment]].
> RulesGuru source: https://rulesguru.org/?386RGBwnIIIhBvNPuNOGG

**Expected verdict:** Goblin Piker will leave the game. When Collins loses the game all cards owned by them will leave the game, even if they are controlled by another player. (800.4a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 386.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [800.4a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Multiplayer, Leaving the game, Control-changing effects.

## RG387. Ari uses Necromancy to bring back Barony Vampire from Blakely's graveyard. Cristian...

**Scenario:**
> Ari uses Necromancy to bring back Barony Vampire from Blakely's graveyard. Cristian then takes control of Barony Vampire using Keldon Overseer. If Ari loses the game while Cristian controls Barony Vampire, what happens to it?
> Cards involved: [[Necromancy]], [[Barony Vampire]], [[Keldon Overseer]].
> RulesGuru source: https://rulesguru.org/?387RGBwnIIIiZcsDjUnGG

**Expected verdict:** Nothing happens to it immediately. When Keldon Overseer's effect ends and Barony Vampire tries to return to Ari's control, it will be exiled. (800.4c)

**Required reasoning:**
- Match the RulesGuru cited answer for question 387.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [800.4c]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Control-changing effects, Multiplayer, Commander, Leaving the game.

## RG391. Ashley controls Teferi, Mage of Zhalfir. Can they play Dryad Arbor during Nylah's t...

**Scenario:**
> Ashley controls Teferi, Mage of Zhalfir. Can they play Dryad Arbor during Nylah's turn?
> Cards involved: [[Teferi, Mage of Zhalfir]], [[Dryad Arbor]].
> RulesGuru source: https://rulesguru.org/?391RGBwnIII2guASdGG

**Expected verdict:** No. Even though Dryad Arbor has flash, lands can't be played during another player's turn. (702.8a, 305.3) (The second rule takes precedence over the definition of flash due to [101.2].)

**Required reasoning:**
- Match the RulesGuru cited answer for question 391.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [101.2], [305.3], [702.8a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Timing and priority, Evergreen keywords, Lands.

## RG393. Arian controls a Dirgur Nemesis with a +1/+1 counter on it. Arian casts Collected C...

**Scenario:**
> Arian controls a Dirgur Nemesis with a +1/+1 counter on it. Arian casts Collected Company and chooses to put two Avatar of the Resolute onto the battlefield. How many counters will each Avatar of the Resolute enter the battlefield with?
> Cards involved: [[Dirgur Nemesis]], [[Collected Company]], [[Avatar of the Resolute]].
> RulesGuru source: https://rulesguru.org/?393RGBwnIIIfYCPFsK8GG

**Expected verdict:** Each Avatar of the Resolute will enter with one +1/+1 counter. The Avatar of the Resolutes are entering the battlefield simultaneously, and Avatar of the Resolute's replacement effect does not take into account other permanents entering at the same time. (614.12)

**Required reasoning:**
- Match the RulesGuru cited answer for question 393.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [614.12]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Replacement effects, Zone-changes.

## RG394. Arya controls Omniscience. Without paying any mana, can they cast Ertai's Meddling...

**Scenario:**
> Arya controls Omniscience. Without paying any mana, can they cast Ertai's Meddling targeting Mox Jet?
> Cards involved: [[Omniscience]], [[Ertai's Meddling]], [[Mox Jet]].
> RulesGuru source: https://rulesguru.org/?394RGBwnIIIjca7TQnZGG

**Expected verdict:** No. When casting a spell without paying its mana cost, X must be 0. (107.3b) Since 0 isn't a legal choice for Ertai's Meddling, it can't be cast this way.

**Required reasoning:**
- Match the RulesGuru cited answer for question 394.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [107.3b]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Alternative Costs, Variables, Numbers and symbols.

## RG395. Natalia controls Worms of the Earth, and Alvin has Lotus Vale in their graveyard. A...

**Scenario:**
> Natalia controls Worms of the Earth, and Alvin has Lotus Vale in their graveyard. Alvin uses Titania, Protector of Argoth to attempt to return Lotus Vale to the battlefield. What happens?
> Cards involved: [[Worms of the Earth]], [[Lotus Vale]], [[Titania, Protector of Argoth]].
> RulesGuru source: https://rulesguru.org/?395RGBwnIIImvJZ4V2bGG

**Expected verdict:** Nothing. Worms of the Earth says that lands can't enter the battlefield, so Lotus Vale's replacement effect will never apply. (101.2, 614.17c)

**Required reasoning:**
- Match the RulesGuru cited answer for question 395.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [101.2], [614.17c]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Graveyard, "Can't" effects, Lands, Replacement effects, Zone-changes.

## RG396. Alejandro controls Armored Cancrix. Alejandro casts Heat Shimmer, copying Armored C...

**Scenario:**
> Alejandro controls Armored Cancrix. Alejandro casts Heat Shimmer, copying Armored Cancrix. After that resolves, Alejandro casts Coursers' Accord choosing to populate the token created by Heat Shimmer. Will the token created by Coursers' Accord be exiled at the beginning of the next end step?
> Cards involved: [[Armored Cancrix]], [[Heat Shimmer]], [[Coursers' Accord]].
> RulesGuru source: https://rulesguru.org/?396RGBwnIIIesytexhXGG

**Expected verdict:** Yes. Heat Shimmer creates a token that's a copy of Armored Cancrix except it has haste and "At the beginning of the end step, exile this permanent." These are part of the copiable values of the token, and therefore when the token is copied, it will also have those abilities. (707.9a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 396.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [707.9a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Intermediate. Tags: Copy effects, Non-evergreen keywords, Tokens.

## RG399. Alissa casts Runed Halo. Can they name the Bird tokens created by Nikolas's Eyes in...

**Scenario:**
> Alissa casts Runed Halo. Can they name the Bird tokens created by Nikolas's Eyes in the Skies?
> Cards involved: [[Runed Halo]], [[Eyes in the Skies]].
> RulesGuru source: https://rulesguru.org/?399RGBwnIII28u2BDGG

**Expected verdict:** No. The token's name is "Bird Token" (111.4), which is not a card name. (201.4)

**Required reasoning:**
- Match the RulesGuru cited answer for question 399.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [111.4], [201.4]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Tokens, Card names.

## RG400. Ariel controls Knight of New Benalia which is enchanted with Spirit Shackle and has...

**Scenario:**
> Ariel controls Knight of New Benalia which is enchanted with Spirit Shackle and has a +0/+2 counter on it. Ariel attacks with Knight of New Benalia. After the combat phase has ended, what counters are on Knight of New Benalia? 
> Cards involved: [[Knight of New Benalia]], [[Spirit Shackle]].
> RulesGuru source: https://rulesguru.org/?400RGBwnIII1Vm0phGG

**Expected verdict:** A +0/+2 counter and a -0/-2 counter. The rule that causes +1/+1 and -1/-1 counters to cancel out only refers to those specific types of counters and not any other type of counter. (122.3)

**Required reasoning:**
- Match the RulesGuru cited answer for question 400.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [122.3]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: State-based actions, Counters.

## RG403. Annika attacks with Mistral Charger. Nelson casts View from Above to give Brimaz, K...

**Scenario:**
> Annika attacks with Mistral Charger. Nelson casts View from Above to give Brimaz, King of Oreskos flying until end of turn and blocks Mistral Charger. Will the token created by Brimaz, King of Oreskos also be blocking Mistral Charger? 
> Cards involved: [[Mistral Charger]], [[View from Above]], [[Brimaz, King of Oreskos]].
> RulesGuru source: https://rulesguru.org/?403RGBwnIIIiLXlmk9OGG

**Expected verdict:** Yes. The only time the game checks to see if the declaration of blockers is illegal is as Nelson declares blockers. (509.1b) A creature that's put onto the battlefield blocking isn't declared as a blocker and isn't affected by requirements or restrictions that normally alter what a player is allowed to declare as a blocker. (509.4b)

**Required reasoning:**
- Match the RulesGuru cited answer for question 403.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [509.1b], [509.4b]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Combat.

## RG405. Aylin activates Mindslaver targeting Bailey. After that resolves, Cesar activates M...

**Scenario:**
> Aylin activates Mindslaver targeting Bailey. After that resolves, Cesar activates Mindslaver also targeting Bailey. When Aylin passes their turn, who will control Bailey's turn?
> Cards involved: [[Mindslaver]].
> RulesGuru source: https://rulesguru.org/?405RGBwnIIIcrlGG

**Expected verdict:** Cesar will control Bailey's turn. Cesar's player-controlling effect resolved most recently, and overwrites the player-controlling effect created by Aylin. (722.1a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 405.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: Corner Case. Complexity: Simple. Tags: Control-changing effects.

## RG407. Armani controls Rest in Peace and Muck Rats. They cast Planar Cleansing. After that...

**Scenario:**
> Armani controls Rest in Peace and Muck Rats. They cast Planar Cleansing. After that resolves, where will each card be?
> Cards involved: [[Rest in Peace]], [[Muck Rats]], [[Planar Cleansing]].
> RulesGuru source: https://rulesguru.org/?407RGBwnIIIjYyLWFq9GG

**Expected verdict:** Rest in Peace and Muck Rats will be in exile and Planar Cleansing will be in the graveyard. Rest in Peace is creating a replacement effect that causes cards that would go to the graveyard to be put into exile instead. (614.1a, 614.4) After Planar Cleansing has destroyed Rest in Peace, Planar Cleansing is put into the graveyard. (608.2n)

**Required reasoning:**
- Match the RulesGuru cited answer for question 407.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [608.2n], [614.1a], [614.4]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Zone-changes, Replacement effects, Resolving objects.

## RG411. Alondra controls Doubling Season and activates the +2 ability of Estrid, the Masked...

**Scenario:**
> Alondra controls Doubling Season and activates the +2 ability of Estrid, the Masked. How many loyalty counters are put on Estrid, the Masked?
> Cards involved: [[Doubling Season]], [[Estrid, the Masked]].
> RulesGuru source: https://rulesguru.org/?411RGBwnIII1FAuOvGG

**Expected verdict:** Just 2 loyalty counters. Doubling Season only cares about counters being placed by effects, not costs. Since the counters put on Estrid, the Masked are part of its activation cost, Doubling Season will not affect them. (609.1, 606.4)

**Required reasoning:**
- Match the RulesGuru cited answer for question 411.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [606.4], [609.1]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Costs, Planeswalkers, Replacement effects, Counters.

## RG415. Ashley has seven cards in their hand and controls Recycle. They cast Trusted Adviso...

**Scenario:**
> Ashley has seven cards in their hand and controls Recycle. They cast Trusted Advisor. After that resolves, what is Ashley's maximum hand size?
> Cards involved: [[Recycle]], [[Trusted Advisor]].
> RulesGuru source: https://rulesguru.org/?415RGBwnIII26H0hZGG

**Expected verdict:** Four. Recycle sets the maximum hand size to two, and Trusted Advisor then modifies that maximum hand size by adding two to it. (613.10, 613.7)

**Required reasoning:**
- Match the RulesGuru cited answer for question 415.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [613.7], [613.10]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Static abilities, Continuous effects.

## RG417. Alaina splice Evermind onto Torrent of Stone. Can they target Disciple of Law with...

**Scenario:**
> Alaina splice Evermind onto Torrent of Stone. Can they target Disciple of Law with the spliced spell? 
> Cards involved: [[Evermind]], [[Torrent of Stone]], [[Disciple of Law]].
> RulesGuru source: https://rulesguru.org/?417RGBwnIIIgqn4wYLbGG

**Expected verdict:** No. Evermind has a color indicator that makes it blue (204.1), and that will not be spliced onto Torrent of Stone because it's not a part of its text box. (702.47a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 417.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [204.1], [702.47a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Reading cards, Non-evergreen keywords, Text-changing effects, Color-changing effects, Additional Costs.

## RG418. Adan controls Firesong and Sunspeaker and casts Aurelia's Fury targeting Nico's fou...

**Scenario:**
> Adan controls Firesong and Sunspeaker and casts Aurelia's Fury targeting Nico's four Phyrexian Walkers with one damage each. How many times will Firesong and Sunspeaker's second ability trigger?
> Cards involved: [[Firesong and Sunspeaker]], [[Aurelia's Fury]], [[Phyrexian Walker]].
> RulesGuru source: https://rulesguru.org/?418RGBwnIIIgDxhqxWiGG

**Expected verdict:** Firesong and Sunspeaker will trigger once. Firesong and Sunspeaker grants Aurelia's Fury lifelink, which will cause Adan to gain 4 life when it resolves. (702.15b) However this happens simultaneously and is all derived from the same source (Aurelia's Fury). Therefore it will only trigger Firesong and Sunspeaker once.

**Required reasoning:**
- Match the RulesGuru cited answer for question 418.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [702.15b]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Triggered abilities, Life.

## RG421. Arturo controls Wild Cantor and cast Web of Life and Destiny. Can Arturo tap Wild C...

**Scenario:**
> Arturo controls Wild Cantor and cast Web of Life and Destiny. Can Arturo tap Wild Cantor for convoke in addition to sacrificing it for mana to cast Web of Life and Destiny?
> Cards involved: [[Wild Cantor]], [[Web of Life and Destiny]].
> RulesGuru source: https://rulesguru.org/?421RGBwnIII4KZf4XGG

**Expected verdict:** No. Mana abilities must be activated before the costs for the spell are paid (601.2g, 601.2h), which is where Wild Cantor must be tapped for convoke. (702.51a, 702.51b)

**Required reasoning:**
- Match the RulesGuru cited answer for question 421.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [601.2g], [601.2h], [702.51a], [702.51b]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Casting spells, Costs, Non-evergreen keywords, Mana abilities.

## RG426. Anabelle and Nathan are in a subgame created by Shahrazad. Anabelle is at 3 life an...

**Scenario:**
> Anabelle and Nathan are in a subgame created by Shahrazad. Anabelle is at 3 life and controls Teferi's Drake that is currently phased out. Nathan casts Lightning Helix targeting Anabelle. When the subgame ends, what happens to Teferi's Drake?
> Cards involved: [[Shahrazad]], [[Teferi's Drake]], [[Lightning Helix]].
> RulesGuru source: https://rulesguru.org/?426RGBwnIIIkvMuXz3KGG

**Expected verdict:** It gets shuffled back into the main game library. (728.5)

**Required reasoning:**
- Match the RulesGuru cited answer for question 426.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: Corner Case. Complexity: Simple. Tags: Subgame, Non-evergreen keywords, Zone-changes, Leaving the game.

## RG428. Alina has Minotaur Abomination and Body Double in their graveyard. Alina casts Ever...

**Scenario:**
> Alina has Minotaur Abomination and Body Double in their graveyard. Alina casts Ever After, can they have Body Double enter the battlefield as a copy of Minotaur Abomination?
> Cards involved: [[Minotaur Abomination]], [[Body Double]], [[Ever After]].
> RulesGuru source: https://rulesguru.org/?428RGBwnIIIiJ6TetYLGG

**Expected verdict:** Yes. Body Double has a replacement effect that modifies how it enters the battlefield. (614.1c) The game checks for any replacement effects that modify how an object will enter the battlefield before the object has changed zones. (614.4, 614.12a) Therefore while Alina is choosing a creature for Body Double to copy, both it and Minotaur Abomination are still in their graveyard, making Minotaur Abomination a legal choice for the ability.

**Required reasoning:**
- Match the RulesGuru cited answer for question 428.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [614.1c], [614.4], [614.12a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Zone-changes, Replacement effects, Copy effects.

## RG430. Ariel controls Rest in Peace and Grenzo, Dungeon Warden. What will happen if they a...

**Scenario:**
> Ariel controls Rest in Peace and Grenzo, Dungeon Warden. What will happen if they activate Grenzo, Dungeon Warden and the bottom card of their library is Woodland Druid?
> Cards involved: [[Rest in Peace]], [[Grenzo, Dungeon Warden]], [[Woodland Druid]].
> RulesGuru source: https://rulesguru.org/?430RGBwnIIIjYyzJgt5GG

**Expected verdict:** Woodland Druid will be put into exile and then onto the battlefield. Grenzo, Dungeon Warden doesn't care whether Woodland Druid actually went to the graveyard, it only cares that its power is less than two. (400.7j) If it is, it takes it from whatever zone it moved to.

**Required reasoning:**
- Match the RulesGuru cited answer for question 430.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [400.7j]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Replacement effects, Zone-changes.

## RG434. Augustus controls Plated Seastrider enchanted with Crown of Awe. Nayeli controls Te...

**Scenario:**
> Augustus controls Plated Seastrider enchanted with Crown of Awe. Nayeli controls Teysa, Envoy of Ghosts. Augustus attacks with Plated Seastrider and it isn't blocked. After combat damage has been dealt, does Teysa, Envoy of Ghosts's ability trigger and destroy Plated Seastrider?
> Cards involved: [[Plated Seastrider]], [[Crown of Awe]], [[Teysa, Envoy of Ghosts]].
> RulesGuru source: https://rulesguru.org/?434RGBwnIIIjuSWAxn5GG

**Expected verdict:** Yes. After combat damage has been dealt Teysa, Envoy of Ghosts's ability triggers, and when it resolves it will destroy Plated Seastrider. The protection granted by Crown of Awe doesn't prevent destruction. Protection means that the permanent can't be damaged, targeted, enchanted, or blocked by anything with the quality protection refers to. (702.16)

**Required reasoning:**
- Match the RulesGuru cited answer for question 434.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [702.16]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Non-evergreen keywords, Damage.

## RG436. Allie controls Kalitas, Traitor of Ghet and Anafenza, the Foremost. Allie casts Bea...

**Scenario:**
> Allie controls Kalitas, Traitor of Ghet and Anafenza, the Foremost. Allie casts Beast Within targeting Nash's Savai Sabertooth. What will happen to Savai Sabertooth after Beast Within resolves?
> Cards involved: [[Kalitas, Traitor of Ghet]], [[Anafenza, the Foremost]], [[Beast Within]], [[Savai Sabertooth]].
> RulesGuru source: https://rulesguru.org/?436RGBwnIII2S1g8Lks5lmGG

**Expected verdict:** Savai Sabertooth will be exiled and Nash chooses whether Allie creates a Zombie token.

Both Kalitas, Traitor of Ghet and Anafenza, the Foremost are attempting to apply a replacement effect to the same event (Savai Sabertooth dying). In these scenarios, the controller of the affected permanent chooses which one will apply first. (616.1) Nash therefore chooses whether to apply Kalitas, Traitor of Ghet or Anafenza, the Foremost first, after which the other effect no longer applies. (616.1f)

**Required reasoning:**
- Match the RulesGuru cited answer for question 436.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [616.1], [616.1f]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Replacement effects, Zone-changes.

## RG440. Autumn controls Chains of Mephistopheles and has Golgari Brownscale in their gravey...

**Scenario:**
> Autumn controls Chains of Mephistopheles and has Golgari Brownscale in their graveyard, and has one card in their hand. During their first main phase they cast Concentrate. What will happen when Concentrate resolves?
> Cards involved: [[Chains of Mephistopheles]], [[Golgari Brownscale]], [[Concentrate]].
> RulesGuru source: https://rulesguru.org/?440RGBwnIIIfeYkqYHnGG

**Expected verdict:** Chains of Mephistopheles is creating a replacement effect that applies to the draw from Concentrate. (614.1a) However Golgari Brownscale also has a replacement effect that Autumn can choose to apply to the draw. (702.52a) If they chooses to replace the draw with Golgari Brownscale, Chains of Mephistopheles will not do anything. However if they chooses not to dredge, then Autumn must discard a card to Chains of Mephistopheles. Afterwards they can replace the draw from Chains of Mephistopheles by dredging. Autumn will then repeat this process for each subsequent draw from Concentrate. (121.2)

**Required reasoning:**
- Match the RulesGuru cited answer for question 440.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [121.2], [614.1a], [702.52a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Intermediate. Tags: Replacement effects, Drawing a card, Static abilities.

## RG441. Ashley controls two Chains of Mephistopheles and casts Crash Through during their f...

**Scenario:**
> Ashley controls two Chains of Mephistopheles and casts Crash Through during their first main phase with seven cards in hand. What happens as Ashley begins to draw a card?
> Cards involved: [[Chains of Mephistopheles]], [[Crash Through]].
> RulesGuru source: https://rulesguru.org/?441RGBwnIII1AzFPoGG

**Expected verdict:** As Ashley resolves Crash Through and attempts to draw a card, they choose which replacement effect to apply first. (616.1) 

Drawing a card is replaced with discarding a card and then drawing a card. The second Chains of Mephistopheles will then replace that card draw with also discarding a card and then drawing a card. The first Chains of Mephistopheles will not replace this draw since it has already modified this event and will not continue to invoke itself on the same event. (614.5)

**Required reasoning:**
- Match the RulesGuru cited answer for question 441.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [614.5], [616.1]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Intermediate. Tags: Replacement effects, Drawing a card, Resolving objects.

## RG442. Anderson controls Possessed Portal and Sages of the Anima. What happens during Ande...

**Scenario:**
> Anderson controls Possessed Portal and Sages of the Anima. What happens during Anderson's draw step?
> Cards involved: [[Possessed Portal]], [[Sages of the Anima]].
> RulesGuru source: https://rulesguru.org/?442RGBwnIII24w1EzGG

**Expected verdict:** During Anderson's draw step, they will choose which replacement effect to apply to their draw. (616.1) If they choose to apply Possessed Portal they won't draw a card. If they choose to apply Sages of the Anima they'll follow the instructions on Sages of the Anima. (616.1f)

**Required reasoning:**
- Match the RulesGuru cited answer for question 442.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [616.1], [616.1f]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Replacement effects, Drawing a card.

## RG447. Ari controls Hardened Scales and Master Biomancer, and they cast Arcbound Slith. Ho...

**Scenario:**
> Ari controls Hardened Scales and Master Biomancer, and they cast Arcbound Slith. How many counters does it enter the battlefield with?
> Cards involved: [[Hardened Scales]], [[Master Biomancer]], [[Arcbound Slith]].
> RulesGuru source: https://rulesguru.org/?447RGBwnIIIhmlPhUFiGG

**Expected verdict:** Four. All three cards have replacement effects. (614.1a, 614.1c) As Arcbound Slith enters the battlefield the game will check to see if any of them are applying to it, which they are; it's getting a +1/+1 counter from its own effect (122.6) and is also getting two +1/+1 counters from Master Biomancer. This results in counters being placed on Arcbound Slith therefore Hardened Scales also applies and adds another +1/+1 counter. Ari can apply the replacement effects in any order, but each one will only apply once (614.5), and the outcome is the same either way.

**Required reasoning:**
- Match the RulesGuru cited answer for question 447.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [122.6], [614.1a], [614.1c], [614.5]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Counters, Replacement effects, Zone-changes.

## RG448. Nico casts Void Shatter targeting Athena's Darksteel Colossus. What happens as Void...

**Scenario:**
> Nico casts Void Shatter targeting Athena's Darksteel Colossus. What happens as Void Shatter resolves?
> Cards involved: [[Void Shatter]], [[Darksteel Colossus]].
> RulesGuru source: https://rulesguru.org/?448RGBwnIII2l5TS9GG

**Expected verdict:** Darksteel Colossus will be countered and exiled. Because Void Shatter has a self-replacement effect, it has to be chosen first before Darksteel Colossus's replacement effect. (616.1, 616.1a) Because Darksteel Colossus is no longer going to the graveyard, its replacement effect can no longer apply. (616.1f)

**Required reasoning:**
- Match the RulesGuru cited answer for question 448.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [616.1], [616.1a], [616.1f]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Replacement effects, Evergreen keywords, Zone-changes.

## RG451. Apollo has Dearly Departed and Cabal Evangel in their graveyard. Apollo then casts...

**Scenario:**
> Apollo has Dearly Departed and Cabal Evangel in their graveyard. Apollo then casts Command the Dreadhorde to return both Dearly Departed and Cabal Evangel from the graveyard to the battlefield. Will Cabal Evangel enter the battlefield with a +1/+1 counter on it?
> Cards involved: [[Dearly Departed]], [[Cabal Evangel]], [[Command the Dreadhorde]].
> RulesGuru source: https://rulesguru.org/?451RGBwnIIIfN2uqqf0GG

**Expected verdict:** Yes. The game checks to see what replacement effects apply before the creatures have changed zones, at which point both Dearly Departed and Cabal Evangel are still in the graveyard. (614.4) Therefore the game will see the replacement effect that Dearly Departed generates that will apply to Cabal Evangel and grant it a +1/+1 counter.

**Required reasoning:**
- Match the RulesGuru cited answer for question 451.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [614.4]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Replacement effects, Zone-changes.

## RG454. Aaliyah and Nico are playing a subgame as part of resolving Shahrazad and each have...

**Scenario:**
> Aaliyah and Nico are playing a subgame as part of resolving Shahrazad and each have 10 life. Aaliyah casts Hurricane with X=10. Which player loses half of their life in the main game?
> Cards involved: [[Shahrazad]], [[Hurricane]].
> RulesGuru source: https://rulesguru.org/?454RGBwnIII2aJ2MdGG

**Expected verdict:** Both of them. Both players simultaneously lost the game, which results in a draw. (104.4a) Neither player won the game, and therefore both players are players who "didn't win the subgame".

**Required reasoning:**
- Match the RulesGuru cited answer for question 454.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [104.4a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Subgame, Subgames, Resolving objects, Leaving the game, Reading cards.

## RG458. Amirah controls Nadu, Winged Wisdom and casts Might of Murasa to give it +3/+3. Bef...

**Scenario:**
> Amirah controls Nadu, Winged Wisdom and casts Might of Murasa to give it +3/+3. Before it resolves, Amirah casts Twincast choosing to copy Might of Murasa and changes the target to another creature. Does Nadu, Winged Wisdom trigger again? 
> Cards involved: [[Nadu, Winged Wisdom]], [[Might of Murasa]], [[Twincast]].
> RulesGuru source: https://rulesguru.org/?458RGBwnIIIr5q1S6eYGG

**Expected verdict:** No. When copying spells that allow the copies controller to change the target, the targets are changed before the spell is put onto the stack. (707.10c) There is never a point in time where the spell is targeting Nadu, Winged Wisdom before the targets are changed.

**Required reasoning:**
- Match the RulesGuru cited answer for question 458.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [707.10c]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Copy effects, Triggered abilities, Targets.

## RG463. Anderson casts Ponder using the ability of Sins of the Past. Nico casts Lapse of Ce...

**Scenario:**
> Anderson casts Ponder using the ability of Sins of the Past. Nico casts Lapse of Certainty and counters Ponder. Where does Ponder go?
> Cards involved: [[Ponder]], [[Sins of the Past]], [[Lapse of Certainty]].
> RulesGuru source: https://rulesguru.org/?463RGBwnIIIjw0xvEmfGG

**Expected verdict:** Anderson's library.

Two replacement effects are trying to replace the same event. Since Lapse of Certainty's effect is a self-replacement effect (614.15), it applies first. (616.1, 616.1a) Once it's applied, Ponder is moving to the library and Sins of the Past's effect no longer applies.

**Required reasoning:**
- Match the RulesGuru cited answer for question 463.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [614.15], [616.1], [616.1a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Replacement effects, Zone-changes.

## RG465. Aubrey casts Ancient Stirrings. Can they reveal a Dryad Arbor to put into their hand?

**Scenario:**
> Aubrey casts Ancient Stirrings. Can they reveal a Dryad Arbor to put into their hand?
> Cards involved: [[Ancient Stirrings]], [[Dryad Arbor]].
> RulesGuru source: https://rulesguru.org/?465RGBwnIII1uVOviGG

**Expected verdict:** No. Dryad Arbor is green. (204.2)

**Required reasoning:**
- Match the RulesGuru cited answer for question 465.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [204.2]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Color-changing effects, Resolving objects.

## RG466. Averi, Beverly, and Craig begin a multiplayer game. In Averi's upkeep, they use Ley...

**Scenario:**
> Averi, Beverly, and Craig begin a multiplayer game. In Averi's upkeep, they use Leyline of Anticipation, several Simian Spirit Guides and Desperate Rituals, and Goblin Charbelcher to kill Beverly. Does Averi draw a card for the turn?
> Cards involved: [[Leyline of Anticipation]], [[Simian Spirit Guide]], [[Desperate Ritual]], [[Goblin Charbelcher]].
> RulesGuru source: https://rulesguru.org/?466RGBwnIII2UYOVCbdFLDGG

**Expected verdict:** Yes. The game began with more than 2 players, so it is a multiplayer game, regardless of the current number of players remaining. (100.1a, 100.1b). Averi will draw a card during their draw step. (103.8c)

**Required reasoning:**
- Match the RulesGuru cited answer for question 466.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [100.1a], [100.1b], [103.8c]

**Why this test matters:** Imported RulesGuru benchmark. Level: Corner Case. Complexity: Simple. Tags: Leaving the game, Turn structure, Multiplayer.

## RG468. Aleah, Beverly, and Carter started playing a multiplayer game. Carter lost the game...

**Scenario:**
> Aleah, Beverly, and Carter started playing a multiplayer game. Carter lost the game, and then Aleah cast Shahrazad. Will Carter be in the subgame?
> Cards involved: [[Shahrazad]].
> RulesGuru source: https://rulesguru.org/?468RGBwnIIIdDPGG

**Expected verdict:** No. Only the players in the game when the subgame began are a part of the subgame. (728.2)

**Required reasoning:**
- Match the RulesGuru cited answer for question 468.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Leaving the game, Multiplayer.

## RG469. Avery, Boden, and Chloe started playing a multiplayer game. Chloe lost the game, an...

**Scenario:**
> Avery, Boden, and Chloe started playing a multiplayer game. Chloe lost the game, and then Avery cast Shahrazad. Will Avery draw a card on the first turn of the subgame?
> Cards involved: [[Shahrazad]].
> RulesGuru source: https://rulesguru.org/?469RGBwnIIIdDPGG

**Expected verdict:** No. The game began with 2 players (727.2), so it is a two-player game. (100.1a). Avery will skip their draw step. (103.8a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 469.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [100.1a], [103.8a], [727.2]

**Why this test matters:** Imported RulesGuru benchmark. Level: Corner Case. Complexity: Simple. Tags: Leaving the game, Multiplayer.

## RG470. Aryanna, Bobbie, and Coen started playing a multiplayer game. Coen lost the game, a...

**Scenario:**
> Aryanna, Bobbie, and Coen started playing a multiplayer game. Coen lost the game, and then Aryanna restarted the game with Karn Liberated. Will Aryanna draw a card on the first turn of the restarted game?
> Cards involved: [[Karn Liberated]].
> RulesGuru source: https://rulesguru.org/?470RGBwnIIIbY5GG

**Expected verdict:** No. The game began with 2 players (726.1), so it is a two-player game. (100.1a). Aryanna will skip their draw step. (103.8a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 470.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [100.1a], [103.8a], [726.1]

**Why this test matters:** Imported RulesGuru benchmark. Level: Corner Case. Complexity: Simple. Tags: Leaving the game, Multiplayer.

## RG471. Augustus casts Fleshbag Marauder. Does Nico know which creature Augustus is sacrifi...

**Scenario:**
> Augustus casts Fleshbag Marauder. Does Nico know which creature Augustus is sacrificing when making their choice?
> Cards involved: [[Fleshbag Marauder]].
> RulesGuru source: https://rulesguru.org/?471RGBwnIIIb7SGG

**Expected verdict:** Yes. If multiple players must make choices at the same time, the choices are made in turn order, starting with the active player. (101.4, 101.4b)

**Required reasoning:**
- Match the RulesGuru cited answer for question 471.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [101.4], [101.4b]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Resolving objects.

## RG472. Avery controls no creatures and casts Merciless Executioner. Noor controls no creat...

**Scenario:**
> Avery controls no creatures and casts Merciless Executioner. Noor controls no creatures. What happens as the trigger resolves?
> Cards involved: [[Merciless Executioner]].
> RulesGuru source: https://rulesguru.org/?472RGBwnIIIcoeGG

**Expected verdict:** Avery must sacrifice Merciless Executioner. (101.3, 609.3)

**Required reasoning:**
- Match the RulesGuru cited answer for question 472.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [101.3], [609.3]

**Why this test matters:** Imported RulesGuru benchmark. Level: 0. Complexity: Simple. Tags: Resolving objects.

## RG473. Aaron casts Martyrdom, targeting their Colossapede. After it resolves, Nico takes c...

**Scenario:**
> Aaron casts Martyrdom, targeting their Colossapede. After it resolves, Nico takes control of Colossapede with Spinal Embrace. Can Nico activate the ability it gained from Martyrdom?
> Cards involved: [[Martyrdom]], [[Colossapede]], [[Spinal Embrace]].
> RulesGuru source: https://rulesguru.org/?473RGBwnIIIixkcCwJEGG

**Expected verdict:** Yes. "Only you may activate this ability." is an activation instruction for the ability, and it is part of the ability gained by the Colossapede. (113.10a) "You" therefore refers to the permanent's current controller. (109.5)

**Required reasoning:**
- Match the RulesGuru cited answer for question 473.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [109.5], [113.10a]

**Why this test matters:** Imported RulesGuru benchmark. Level: Corner Case. Complexity: Simple. Tags: Abilities, Activated abilities, Control-changing effects.

## RG474. In a two-player game, Aubrey casts Rushblade Commander. Can they attack with it thi...

**Scenario:**
> In a two-player game, Aubrey casts Rushblade Commander. Can they attack with it this turn?
> Cards involved: [[Rushblade Commander]].
> RulesGuru source: https://rulesguru.org/?474RGBwnIIIdqfGG

**Expected verdict:** Yes. In a two-player game, "your team" means "you". (102.4)

**Required reasoning:**
- Match the RulesGuru cited answer for question 474.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [102.4]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Multiplayer, Two-Headed Giant.

## RG475. Anika casts Shahrazad. As the subgame begins, Anika wins the die roll. Can Anika ch...

**Scenario:**
> Anika casts Shahrazad. As the subgame begins, Anika wins the die roll. Can Anika choose to play second?
> Cards involved: [[Shahrazad]].
> RulesGuru source: https://rulesguru.org/?475RGBwnIIIdDPGG

**Expected verdict:** No. The starting player in a subgame is determined randomly. (728.2)

**Required reasoning:**
- Match the RulesGuru cited answer for question 475.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: Corner Case. Complexity: Simple. Tags: Starting the game.

## RG476. Anabelle and Nikolai are beginning a two-player game. Anabelle wins the die roll. C...

**Scenario:**
> Anabelle and Nikolai are beginning a two-player game. Anabelle wins the die roll. Can Anabelle choose to play second?
> RulesGuru source: https://rulesguru.org/?476RGBwnGG

**Expected verdict:** Yes. (103.1)

**Required reasoning:**
- Match the RulesGuru cited answer for question 476.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [103.1]

**Why this test matters:** Imported RulesGuru benchmark. Level: Corner Case. Complexity: Simple. Tags: Starting the game.

## RG480. Avianna and Nathan are starting a two-player game. Avianna is going first and has S...

**Scenario:**
> Avianna and Nathan are starting a two-player game. Avianna is going first and has Serum Powder in their starting hand, which they would like to use. Do they have to declare that they're using it before Nathan chooses whether to mulligan?
> Cards involved: [[Serum Powder]].
> RulesGuru source: https://rulesguru.org/?480RGBwnIIIdCCGG

**Expected verdict:** Yes. Serum Powder's ability must be declared at the same time as Avianna would declare if they are mulliganing. (103.5b) Avianna must announce that decision before Nathan does. (103.5)

**Required reasoning:**
- Match the RulesGuru cited answer for question 480.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [103.5], [103.5b]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Starting the game.

## RG483. Ana and Nico are starting a game. Nico puts a Leyline of Lightning onto the battlef...

**Scenario:**
> Ana and Nico are starting a game. Nico puts a Leyline of Lightning onto the battlefield. Can Ana now choose to put a Leyline of the Void onto the battlefield?
> Cards involved: [[Leyline of Lightning]], [[Leyline of the Void]].
> RulesGuru source: https://rulesguru.org/?483RGBwnIII1WurqAGG

**Expected verdict:** No. Each player, in turn order, gets one chance to take any opening hand actions they would like to take. (103.6) After the second player in turn order has made their choice, the first player does not get another opportunity.

**Required reasoning:**
- Match the RulesGuru cited answer for question 483.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [103.6]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Starting the game.

## RG484. Averie has restarted the game with a Karn Liberated that exiled Jaddi Offshoot. Ave...

**Scenario:**
> Averie has restarted the game with a Karn Liberated that exiled Jaddi Offshoot. Averie chooses to begin the restarted game with a Gemstone Caverns on the battlefield. Does Jaddi Offshoot trigger?
> Cards involved: [[Karn Liberated]], [[Jaddi Offshoot]], [[Gemstone Caverns]].
> RulesGuru source: https://rulesguru.org/?484RGBwnIIIhYrSzm96GG

**Expected verdict:** This can't happen as described. Averie is taking the first turn (726.1a), so they can't use Gemstone Caverns's ability.

(If it were Nico instead, the answer would be no. Cards exiled with Karn are put onto the battlefield after opening hand actions have already been taken. (726.4))

**Required reasoning:**
- Match the RulesGuru cited answer for question 484.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [726.4]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Starting the game, Triggered abilities.

## RG485. Ari has restarted the game with a Karn Liberated that exiled an Ajani's Chosen. Ari...

**Scenario:**
> Ari has restarted the game with a Karn Liberated that exiled an Ajani's Chosen. Ari chooses to begin the restarted game with a Leyline of the Meek on the battlefield. Does Ajani's Chosen trigger?
> Cards involved: [[Karn Liberated]], [[Ajani's Chosen]], [[Leyline of the Meek]].
> RulesGuru source: https://rulesguru.org/?485RGBwnIIIhYrsWcqoGG

**Expected verdict:** No. Leyline of the Meek is put onto the battlefield before the Ajani's Chosen is. (103.6, 726.4)

**Required reasoning:**
- Match the RulesGuru cited answer for question 485.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [103.6], [726.4]

**Why this test matters:** Imported RulesGuru benchmark. Level: Corner Case. Complexity: Simple. Tags: Starting the game, Triggered abilities.

## RG487. Alanna controls Convulsing Licid, March of the Machines, and Mycosynth Lattice that...

**Scenario:**
> Alanna controls Convulsing Licid, March of the Machines, and Mycosynth Lattice that entered the battlefield in that order. They activate Convulsing Licid's ability targeting itself. What happens?
> Cards involved: [[Convulsing Licid]], [[March of the Machines]], [[Mycosynth Lattice]].
> RulesGuru source: https://rulesguru.org/?487RGBwnIIIfuhBktydGG

**Expected verdict:** Convulsing Licid becomes an Aura enchantment with enchant creature. It cannot become attached to itself because it is no longer a creature. (205.1a, 613.7, 701.3b) When state-based actions are checked, it will be put into the graveyard. (704.5m)

**Required reasoning:**
- Match the RulesGuru cited answer for question 487.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [205.1a], [613.7], [701.3b], [704.5m]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Intermediate. Tags: Auras, Resolving objects, Layers.

## RG492. Nico controls a Skullbriar, the Walking Grave with 2 +1/+1 counters on it. Angela c...

**Scenario:**
> Nico controls a Skullbriar, the Walking Grave with 2 +1/+1 counters on it. Angela casts Bishop of Binding, exiling the Skullbriar, the Walking Grave. When Angela attacks with Bishop of Binding on their next turn, what will X equal in Bishop of Binding's triggered ability?
> Cards involved: [[Skullbriar, the Walking Grave]], [[Bishop of Binding]].
> RulesGuru source: https://rulesguru.org/?492RGBwnIII2c7OpNGG

**Expected verdict:** 3. +1/+1 counters on cards in exile do affect their power and toughness. (122.1a) X is determined only once, as the effect begins to apply (611.2d), so it does take into account the final power of the exiled card.

**Required reasoning:**
- Match the RulesGuru cited answer for question 492.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [122.1a], [611.2d]

**Why this test matters:** Imported RulesGuru benchmark. Level: Corner Case. Complexity: Simple. Tags: Layers, Counters, Resolving objects.

## RG493. Nancy controls Grafdigger's Cage and has a Goblin Cavaliers in their graveyard. Ant...

**Scenario:**
> Nancy controls Grafdigger's Cage and has a Goblin Cavaliers in their graveyard. Antoine casts Ghastly Conscription, targeting Nancy. What happens to the Goblin Cavaliers?
> Cards involved: [[Grafdigger's Cage]], [[Goblin Cavaliers]], [[Ghastly Conscription]].
> RulesGuru source: https://rulesguru.org/?493RGBwnIIIhbiQqBzbGG

**Expected verdict:** It is exiled face down, then manifested onto the battlefield. Grafdigger's Cage only prevents creature cards entering the battlefield from graveyards or libraries, not from exile.

**Required reasoning:**
- Match the RulesGuru cited answer for question 493.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: 0. Complexity: Simple. Tags: Zone-changes, Face-down objects, Non-evergreen keywords.

## RG494. Nico has a Fugitive Wizard and a Skullbriar, the Walking Grave with 3 +1/+1 counter...

**Scenario:**
> Nico has a Fugitive Wizard and a Skullbriar, the Walking Grave with 3 +1/+1 counters in their graveyard. Allie casts Ghastly Conscription, targeting Nico. What happens to the counters on the Skullbriar, the Walking Grave? Will Nico know which manifested card is which?
> Cards involved: [[Fugitive Wizard]], [[Skullbriar, the Walking Grave]], [[Ghastly Conscription]].
> RulesGuru source: https://rulesguru.org/?494RGBwnIIIgQkf8Ua5GG

**Expected verdict:** When in the graveyard, Skullbriar, the Walking Grave had the ability that allowed it to keep its counters, so it is exiled and shuffled with 3 +1/+1 counters. When it's moved to the battlefield, it's face down and no longer has that ability (406.3), so the counters cease to exist. (122.2) It had the counters immediately before entering the battlefield however, so Nico will know which face-down permanent is the Skullbriar, the Walking Grave and which is the Fugitive Wizard.

**Required reasoning:**
- Match the RulesGuru cited answer for question 494.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [122.2], [406.3]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Zone-changes, Face-down objects, Counters.

## RG496. Naomi controls a Containment Priest and has a Rotting Mastodon in their graveyard....

**Scenario:**
> Naomi controls a Containment Priest and has a Rotting Mastodon in their graveyard. Avery casts Ghastly Conscription, targeting Naomi. What happens to the Rotting Mastodon?
> Cards involved: [[Containment Priest]], [[Rotting Mastodon]], [[Ghastly Conscription]].
> RulesGuru source: https://rulesguru.org/?496RGBwnIIIftAeXAVbGG

**Expected verdict:** Rather than entering the battlefield, it is exiled. It was turned face down before it was put onto the battlefield (701.40a), but it then becomes a new object with no relation to its previous existence. (406.7) It will remain in exile face up.

**Required reasoning:**
- Match the RulesGuru cited answer for question 496.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [406.7], [701.40a]

**Why this test matters:** Imported RulesGuru benchmark. Level: Corner Case. Complexity: Simple. Tags: Zone-changes, Non-evergreen keywords, Face-down objects.

## RG497. Nelson has a Skullbriar, the Walking Grave in their graveyard with 2 +1/+1 counters...

**Scenario:**
> Nelson has a Skullbriar, the Walking Grave in their graveyard with 2 +1/+1 counters on it. Amaya controls Containment Priest, and casts Ghastly Conscription, targeting Nelson. What happens?
> Cards involved: [[Skullbriar, the Walking Grave]], [[Containment Priest]], [[Ghastly Conscription]].
> RulesGuru source: https://rulesguru.org/?497RGBwnIIIkKZmb3VJGG

**Expected verdict:** In order for counters to remain on Skullbriar, the Walking Grave, it needs to have that ability immediately before it changes zones. It did have that ability in the graveyard, so it is exiled face down with the +1/+1 counters remaining on it during that change. It then attempts to enter the battlefield (701.40a), but remains in exile instead due to Containment Priest. Since it becomes a new object (406.7), it will be face-up in exile. However it didn't change zones, so the counters will remain on it in exile. (122.2)

**Required reasoning:**
- Match the RulesGuru cited answer for question 497.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [122.2], [406.7], [701.40a]

**Why this test matters:** Imported RulesGuru benchmark. Level: Corner Case. Complexity: Simple. Tags: Counters, Replacement effects, Zone-changes, Non-evergreen keywords.

## RG498. Aviana controls Shinen of Life's Roar with a +1/+1 counter and Battlefront Krushok....

**Scenario:**
> Aviana controls Shinen of Life's Roar with a +1/+1 counter and Battlefront Krushok. They attack with Shinen of Life's Roar. Nico controls Agent of Stromgald and Armored Wolf-Rider. What are the legal ways that Nico can block?
> Cards involved: [[Shinen of Life's Roar]], [[Battlefront Krushok]], [[Agent of Stromgald]], [[Armored Wolf-Rider]], [[Breaking]].
> RulesGuru source: https://rulesguru.org/?498RGBwnIIIuWkNCwPuHKqmbGG

**Expected verdict:** According to the Comprehensive Rules, Nico can block Shinen of Life's Roar with Agent of Stromgald, Armored Wolf-Rider, or neither, but not both.

When choosing blockers, Nico must fulfill as many requirements as possible (509.1c), while not Breaking any restrictions. (509.1b) The requirement of "All creatures able to block Shinen of Life's Roar do so" can't be obeyed since only one creature can block Shinen of Life's Roar, so any declaration of blocks that obeys Battlefront Krushok's restriction is legal.

However, it's probably the case that [509.1b] was written incorrectly, and Shinen of Life's Roar's effect is supposed to create multiple separate requirements. This would make the "neither" option illegal, since that satisfies 0 requirements, whereas blocking with a single creature satisfies 1.

**Required reasoning:**
- Match the RulesGuru cited answer for question 498.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [509.1b], [509.1c]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Combat, Unsupported answers.

## RG499. Nancy controls Ruin Rat and 3 Sir Shandlar of Eberyns. Agustin casts Alpha Brawl, t...

**Scenario:**
> Nancy controls Ruin Rat and 3 Sir Shandlar of Eberyns. Agustin casts Alpha Brawl, targeting Ruin Rat. Which creatures survive?
> Cards involved: [[Ruin Rat]], [[Sir Shandlar of Eberyn]], [[Alpha Brawl]].
> RulesGuru source: https://rulesguru.org/?499RGBwnIIIk9Li4g2ZGG

**Expected verdict:** None of them. Ruin Rat has deathtouch, and so kills all of the Sir Shandlar of Eberyns. (702.2b) The Sir Shandlar of Eberyns deal enough damage to the Ruin Rat that it dies as well.

**Required reasoning:**
- Match the RulesGuru cited answer for question 499.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [702.2b]

**Why this test matters:** Imported RulesGuru benchmark. Level: 0. Complexity: Simple. Tags: Evergreen keywords, Damage.

## RG500. Abel controls an Alpine Grizzly. They cast Artful Dodge, targeting the Alpine Grizz...

**Scenario:**
> Abel controls an Alpine Grizzly. They cast Artful Dodge, targeting the Alpine Grizzly. After it resolves, can they flash it back, again targeting the Alpine Grizzly?
> Cards involved: [[Alpine Grizzly]], [[Artful Dodge]].
> RulesGuru source: https://rulesguru.org/?500RGBwnIII1uCcpnGG

**Expected verdict:** Yes. The only restriction on what Artful Dodge targets is that it must be a creature. It doesn't matter if the spell resolving wouldn't do anything useful.

**Required reasoning:**
- Match the RulesGuru cited answer for question 500.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: 0. Complexity: Simple. Tags: Targets, Casting spells.

## RG501. Ariel controls a Skinwing and a Wicker Witch. Nova controls a Stony Silence. Can Ar...

**Scenario:**
> Ariel controls a Skinwing and a Wicker Witch. Nova controls a Stony Silence. Can Ariel equip their Skinwing to their Wicker Witch?
> Cards involved: [[Skinwing]], [[Wicker Witch]], [[Stony Silence]].
> RulesGuru source: https://rulesguru.org/?501RGBwnIIIkJP1kHnAGG

**Expected verdict:** No. Equip is an activated ability. (702.6a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 501.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [702.6a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Evergreen keywords, Abilities, Activated abilities.

## RG503. Nico controls Yixlid Jailer and has Blood Hustler in their graveyard. Aaden control...

**Scenario:**
> Nico controls Yixlid Jailer and has Blood Hustler in their graveyard. Aaden controls Havengul Lich and activates its ability targeting the Blood Hustler. Can Aaden cast the Blood Hustler? If they can and do, can they activate the ability on Havengul Lich that it gained from the Blood Hustler?
> Cards involved: [[Yixlid Jailer]], [[Blood Hustler]], [[Havengul Lich]].
> RulesGuru source: https://rulesguru.org/?503RGBwnIIImyvwKbE0GG

**Expected verdict:** Havengul Lich doesn't give Blood Hustler an ability, it just allows it to be cast, so Aaden may do so. If they do, Havengul Lich will not gain any abilities. Havengul Lich's ability is referring to the card in the graveyard. By the time the game checks if it has any abilities, the card is on the stack and not in the graveyard, so the game uses its last known information. (608.2h) The Blood Hustler in the graveyard had no abilities, so Havengul Lich has nothing to gain.

**Required reasoning:**
- Match the RulesGuru cited answer for question 503.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [608.2h]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Intermediate. Tags: Casting spells, Abilities, Activated abilities, Zone-changes.

## RG504. Alex controls a Beguiler of Wills and 2 Goblin Piker. They activate it targeting Ni...

**Scenario:**
> Alex controls a Beguiler of Wills and 2 Goblin Piker. They activate it targeting Nico's Barony Vampire. In response, Nico casts Strangling Soot, targeting the Beguiler of Wills. What happens to Beguiler of Wills's ability?
> Cards involved: [[Beguiler of Wills]], [[Goblin Piker]], [[Barony Vampire]], [[Strangling Soot]].
> RulesGuru source: https://rulesguru.org/?504RGBwnIII2kMwcrypf4OGG

**Expected verdict:** The ability on the stack is unaffected by the removal of Beguiler of Wills. (113.7a) However when it begins to resolve, the target is no longer legal. (Alex only controls 2 creatures.) It is removed from the stack and has no effect. (608.2b)

**Required reasoning:**
- Match the RulesGuru cited answer for question 504.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [113.7a], [608.2b]

**Why this test matters:** Imported RulesGuru benchmark. Level: 0. Complexity: Simple. Tags: Resolving objects, Targets.

## RG505. Ashlynn casts Seize the Day. Does Nathaniel have an opportunity to exile it from As...

**Scenario:**
> Ashlynn casts Seize the Day. Does Nathaniel have an opportunity to exile it from Ashlynn's graveyard with Beckon Apparition before Ashlynn can flash it back?
> Cards involved: [[Seize the Day]], [[Beckon Apparition]].
> RulesGuru source: https://rulesguru.org/?505RGBwnIII2acd4rGG

**Expected verdict:** No. The Ashlynn receives priority first after the Seize the Day resolves (117.3b), and can cast it from the graveyard at that time. (702.34a) Nathaniel doesn't get a chance to cast the Beckon Apparition until they receives priority afterwards.

**Required reasoning:**
- Match the RulesGuru cited answer for question 505.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [117.3b], [702.34a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Timing and priority, Casting spells, Non-evergreen keywords.

## RG506. Autumn has a creature card in their graveyard and activates Moorland Haunt. In resp...

**Scenario:**
> Autumn has a creature card in their graveyard and activates Moorland Haunt. In response, Nathanael activates Remorseful Cleric to exile all cards in Autumn's graveyard. Will Autumn create a Spirit token?
> Cards involved: [[Moorland Haunt]], [[Remorseful Cleric]].
> RulesGuru source: https://rulesguru.org/?506RGBwnIII204LnNGG

**Expected verdict:** Yes. The creature card is exiled from Autumn's graveyard as a cost to activate Moorland Haunt (113.3b), and is already in exile when the Remorseful Cleric is activated. The Moorland Haunt's ability will still resolve normally.

**Required reasoning:**
- Match the RulesGuru cited answer for question 506.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [113.3b]

**Why this test matters:** Imported RulesGuru benchmark. Level: 0. Complexity: Simple. Tags: Resolving objects, Costs, Timing and priority.

## RG507. Noa controls a Withengar Unbound (the front face of which is Elbrus, the Binding Bl...

**Scenario:**
> Noa controls a Withengar Unbound (the front face of which is Elbrus, the Binding Blade). Avery casts Death's Caress targeting the Withengar Unbound. In response, Noa casts Undying Evil targeting the Withengar Unbound. What happens to the Withengar Unbound?
> Cards involved: [[Withengar Unbound]], [[Elbrus, the Binding Blade]], [[Death's Caress]], [[Undying Evil]].
> RulesGuru source: https://rulesguru.org/?507RGBwnIII3yFvvB6xmbEGG

**Expected verdict:** It dies and then returns to the battlefield on its front face with a +1/+1 counter on it. (702.93a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 507.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [702.93a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Non-evergreen keywords, Counters, Zone-changes.

## RG508. Avery activates Sorin, Lord of Innistrad's third ability, targeting Nickolas's Ashc...

**Scenario:**
> Avery activates Sorin, Lord of Innistrad's third ability, targeting Nickolas's Ashcloud Phoenix. What happens to it?
> Cards involved: [[Sorin, Lord of Innistrad]], [[Ashcloud Phoenix]].
> RulesGuru source: https://rulesguru.org/?508RGBwnIII2d2JYKGG

**Expected verdict:** Sorin, Lord of Innistrad's ability resolves fully before any triggers are put onto the stack. (603.3) Ashcloud Phoenix will enter the battlefield under Avery's control. When its trigger resolves, Ashcloud Phoenix is no longer in the graveyard, so nothing happens. (400.7)

**Required reasoning:**
- Match the RulesGuru cited answer for question 508.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [400.7], [603.3]

**Why this test matters:** Imported RulesGuru benchmark. Level: 0. Complexity: Simple. Tags: Resolving objects, Triggered abilities, Timing and priority, Zone-changes.

## RG509. Aria activates Golden Guardian's ability, targeting Dralnu, Lich Lord. As the abili...

**Scenario:**
> Aria activates Golden Guardian's ability, targeting Dralnu, Lich Lord. As the ability resolves and Dralnu, Lich Lord would be dealt 4 damage, they choose to sacrifice the Golden Guardian and 3 other permanents instead. Will the Golden Guardian return to the battlefield?
> Cards involved: [[Golden Guardian]], [[Dralnu, Lich Lord]].
> RulesGuru source: https://rulesguru.org/?509RGBwnIII1OvsBuGG

**Expected verdict:** No. Spells and abilities carry out their instructions in the order written (608.2c), so the fight occurs first, then the delayed trigger to return it to the battlefield is created. Normally Golden Guardian would die as state-based actions were checked after the ability finished resolving (704.5g), so the trigger to return it to the battlefield would already be in existence. However since Dralnu, Lich Lord replaces the damage with sacrificing permanents, Golden Guardian dies as the fight occurs. (701.14) The delayed triggered ability to return it to the battlefield is only created after the Golden Guardian has already died, so it will never have a chance to trigger. (603.7a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 509.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [603.7a], [608.2c], [701.14], [704.5g]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Triggered abilities, Resolving objects, Evergreen keywords, Damage, Replacement effects.

## RG510. Annika controls an Archdemon of Greed and no other creatures. During their upkeep,...

**Scenario:**
> Annika controls an Archdemon of Greed and no other creatures. During their upkeep, they cast Carrion, sacrificing the Archdemon of Greed. What happens as its triggered ability resolves?
> Cards involved: [[Archdemon of Greed]], [[Carrion]].
> RulesGuru source: https://rulesguru.org/?510RGBwnIII1vuUO5GG

**Expected verdict:** Annika can't sacrifice a Human, so Archdemon of Greed deals 9 damage to them. (It can deal damage even though it's no longer on the battlefield. (113.7a))

**Required reasoning:**
- Match the RulesGuru cited answer for question 510.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [113.7a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Resolving objects, Damage, Last known information.

## RG511. Agustin casts Mask of the Mimic, targeting an Illusion creature token created by Me...

**Scenario:**
> Agustin casts Mask of the Mimic, targeting an Illusion creature token created by Meloku the Clouded Mirror. Can Agustin find the Illusion half of the split card Illusion // Reality? If so, what happens?
> Cards involved: [[Mask of the Mimic]], [[Meloku the Clouded Mirror]], [[Illusion]], [[Illusion // Reality]].
> RulesGuru source: https://rulesguru.org/?511RGBwnIII2XNNYMa25b0GG

**Expected verdict:** This can't happen as described. Mask of the Mimic can only target nontoken creatures.

**Required reasoning:**
- Match the RulesGuru cited answer for question 511.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Targets, Zone-changes, Card names, Split cards.

## RG513. Abril attacks with a Nightveil Specter and exiles a Rhox Brute as its trigger resol...

**Scenario:**
> Abril attacks with a Nightveil Specter and exiles a Rhox Brute as its trigger resolves. Still during combat, Nathaniel casts Murderous Cut targeting the Nightveil Specter. In their postcombat main phase, Abril casts Fated Return to return the Nightveil Specter back to the battlefield. Can Abril cast the Rhox Brute?
> Cards involved: [[Nightveil Specter]], [[Rhox Brute]], [[Murderous Cut]], [[Fated Return]].
> RulesGuru source: https://rulesguru.org/?513RGBwnIII32oxMzY96PVGG

**Expected verdict:** No. "Cards exiled with Nightveil Specter" just refers to cards exiled with that specific Nightveil Specter, not any Nightveil Specter. (201.5) When Nightveil Specter dies and returns to the battlefield, it becomes a new object with no relation to its previous existence. (400.7)

**Required reasoning:**
- Match the RulesGuru cited answer for question 513.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [201.5], [400.7]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Casting spells, Resolving objects, Zone-changes.

## RG514. Alex controls a Havengul Lich and has a Kozilek's Translator in their graveyard. Th...

**Scenario:**
> Alex controls a Havengul Lich and has a Kozilek's Translator in their graveyard. They activate the ability of Havengul Lich twice, targeting the Kozilek's Translator both times. After Alex casts the Kozilek's Translator, how much {C} could they add?
> Cards involved: [[Havengul Lich]], [[Kozilek's Translator]].
> RulesGuru source: https://rulesguru.org/?514RGBwnIII1Q5Tk5GG

**Expected verdict:** 3. Each time Havengul Lich's activated ability resolves, it creates a delayed trigger that gives it the abilities of the card that was cast. (603.7) Since 2 of those triggers resolved, Havengul Lich gains 2 instances of those abilities. Each of them can be activated once this turn. The ability of the Kozilek's Translator can also be activated once, for {C}{C}{C} in total.

**Required reasoning:**
- Match the RulesGuru cited answer for question 514.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [603.7]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Abilities, Triggered abilities, Activated abilities.

## RG515. Alyssa controls a Skinshifter and activates it to turn it into a 4/4 with trample....

**Scenario:**
> Alyssa controls a Skinshifter and activates it to turn it into a 4/4 with trample. After that resolves, can they turn it into a 2/2 with flying?
> Cards involved: [[Skinshifter]].
> RulesGuru source: https://rulesguru.org/?515RGBwnIIIdNOGG

**Expected verdict:** No. Skinshifter's ability is modal (700.2), but it is still one ability. Alyssa can't activate that ability more than once per turn, regardless of which mode was chosen.

**Required reasoning:**
- Match the RulesGuru cited answer for question 515.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [700.2]

**Why this test matters:** Imported RulesGuru benchmark. Level: 0. Complexity: Simple. Tags: Abilities, Activated abilities.

## RG516. Ava controls Forbidden Orchard. Nathan controls Urborg, Tomb of Yawgmoth. Ava activ...

**Scenario:**
> Ava controls Forbidden Orchard. Nathan controls Urborg, Tomb of Yawgmoth. Ava activates the ability that 
> Forbidden Orchard gained from Urborg, Tomb of Yawgmoth to add {B}. Does Nathan create a Spirit token?
> Cards involved: [[Forbidden Orchard]], [[Urborg, Tomb of Yawgmoth]].
> RulesGuru source: https://rulesguru.org/?516RGBwnIII1M6pKjGG

**Expected verdict:** Yes. Forbidden Orchard has a trigger that triggers whenever it's tapped for mana. It doesn't matter which ability was activated.

**Required reasoning:**
- Match the RulesGuru cited answer for question 516.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Triggered abilities, Mana abilities, Mana, Linked abilities.

## RG517. Aspen controls Mana Reflection and Deathrite Shaman. They activate Deathrite Shaman...

**Scenario:**
> Aspen controls Mana Reflection and Deathrite Shaman. They activate Deathrite Shaman's first ability, exiling a Seat of the Synod from Norah's graveyard. How much mana is produced?
> Cards involved: [[Mana Reflection]], [[Deathrite Shaman]], [[Seat of the Synod]].
> RulesGuru source: https://rulesguru.org/?517RGBwnIIIitrY29CoGG

**Expected verdict:** Just 1. Deathrite Shaman's ability is not a mana ability, and activating it is not "tapping it for mana". (106.12)

**Required reasoning:**
- Match the RulesGuru cited answer for question 517.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [106.12]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Mana, Mana abilities, Replacement effects.

## RG518. Augustus controls a Clever Impersonator that is a copy of a Harvest Hand. It dies....

**Scenario:**
> Augustus controls a Clever Impersonator that is a copy of a Harvest Hand. It dies. What happens?
> Cards involved: [[Clever Impersonator]], [[Harvest Hand]].
> RulesGuru source: https://rulesguru.org/?518RGBwnIII1BopCrGG

**Expected verdict:** Clever Impersonator isn't a transforming double-faced card, so it can't enter the battlefield transformed. It remains in the graveyard. (712.14a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 518.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [712.14a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Double-faced cards, Copy effects, Zone-changes.

## RG519. Ari attacks with a Bronze Sable. Nash blocks it with a 1/1 white Spirit creature to...

**Scenario:**
> Ari attacks with a Bronze Sable. Nash blocks it with a 1/1 white Spirit creature token, then casts Ghostly Flicker, targeting the Spirit token. What happens?
> Cards involved: [[Bronze Sable]], [[Ghostly Flicker]].
> RulesGuru source: https://rulesguru.org/?519RGBwnIII1zhYW5GG

**Expected verdict:** The token is exiled, but does not return to the battlefield. (111.8) Bronze Sable remains blocked, and does not deal any damage to Nash. (509.1h, 510.1c)

**Required reasoning:**
- Match the RulesGuru cited answer for question 519.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [111.8], [509.1h], [510.1c]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Combat, Tokens, Zone-changes.

## RG520. Aspen controls a Phantasmal Image that's a copy of Imperial Outrider. There are no...

**Scenario:**
> Aspen controls a Phantasmal Image that's a copy of Imperial Outrider. There are no creatures other than Phantasmal Image on the battlefield. Aspen casts Restoration Angel. Do they have to sacrifice Phantasmal Image?
> Cards involved: [[Phantasmal Image]], [[Imperial Outrider]], [[Restoration Angel]].
> RulesGuru source: https://rulesguru.org/?520RGBwnIIIjp3dyPVoGG

**Expected verdict:** Yes. Choices such as "you may do &#91;thing&#93;" are made upon resolution. (608.2d) Aspen still has to choose a legal target for Restoration Angel's triggered ability and put it onto the stack. (603.5)

**Required reasoning:**
- Match the RulesGuru cited answer for question 520.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [603.5], [608.2d]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Triggered abilities, Targets, Resolving objects.

## RG521. Adrienne controls Doubling Season and casts Lab Rats. In response, Nolan casts Gath...

**Scenario:**
> Adrienne controls Doubling Season and casts Lab Rats. In response, Nolan casts Gather Specimens. Who creates how many tokens?
> Cards involved: [[Doubling Season]], [[Lab Rats]], [[Gather Specimens]].
> RulesGuru source: https://rulesguru.org/?521RGBwnIIIg39YaecgGG

**Expected verdict:** Nolan creates 2 tokens. There are two replacement effects trying to apply to the same event. Doubling Season is trying to apply to the creation of the tokens, while Gather Specimens is trying to apply to them entering the battlefield. Entering the battlefield is a part of creating the tokens (701.7a), so Doubling Season's effect must be applied first, followed by Gather Specimens. (616.1g)

**Required reasoning:**
- Match the RulesGuru cited answer for question 521.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [616.1g], [701.7a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Tokens, Replacement effects, Evergreen keywords, Zone-changes, Control-changing effects.

## RG522. Nico controls Leyline of the Void. Andrea casts Predict targeting themselves and na...

**Scenario:**
> Nico controls Leyline of the Void. Andrea casts Predict targeting themselves and names "Plains" when Predict resolves. They reveal Plains from the top of their library and puts it into exile. How many cards does Andrea draw from Predict?
> Cards involved: [[Leyline of the Void]], [[Predict]], [[Plains]].
> RulesGuru source: https://rulesguru.org/?522RGBwnIIIig8lW1Y2GG

**Expected verdict:** 2. Predict doesn't care whether the revealed card went to the graveyard or not, only that it was what Andrea named. (400.7j)

**Required reasoning:**
- Match the RulesGuru cited answer for question 522.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [400.7j]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Replacement effects, Resolving objects, Zone-changes.

## RG524. Noel controls Anointed Procession. Ashley casts Elephant Ambush. In response, Noel...

**Scenario:**
> Noel controls Anointed Procession. Ashley casts Elephant Ambush. In response, Noel casts Crafty Cutpurse. Who creates how many tokens?
> Cards involved: [[Anointed Procession]], [[Elephant Ambush]], [[Crafty Cutpurse]].
> RulesGuru source: https://rulesguru.org/?524RGBwnIIIemXqDi9VGG

**Expected verdict:** Noel creates 2 tokens. After the effect from Crafty Cutpurse is applied, Anointed Procession's effect becomes applicable as well. (616.2)

**Required reasoning:**
- Match the RulesGuru cited answer for question 524.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [616.2]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Tokens, Replacement effects, Evergreen keywords, Zone-changes, Control-changing effects.

## RG525. Nina controls an Anointed Procession. Ainsley casts Beast Attack. In response, Nina...

**Scenario:**
> Nina controls an Anointed Procession. Ainsley casts Beast Attack. In response, Nina casts Gather Specimens. Who creates how many tokens?
> Cards involved: [[Anointed Procession]], [[Beast Attack]], [[Gather Specimens]].
> RulesGuru source: https://rulesguru.org/?525RGBwnIIIemXh3L7zGG

**Expected verdict:** Nina creates 2 tokens. At first there is no effect that modifies how the tokens are created, so the effect from Gather Specimens that modifies how they enter the battlefield is applied. Now that they are entering under Nina's control, Anointed Procession's effect becomes applicable (616.2) and modifies how they are created. It doesn't matter that Anointed Procession applies to the creation of the tokens while Gather Specimens applies to them entering the battlefield- it's still the same event. (701.7)

**Required reasoning:**
- Match the RulesGuru cited answer for question 525.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [616.2], [701.7]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Tokens, Replacement effects, Evergreen keywords, Zone-changes, Control-changing effects.

## RG526. Amanda casts Tidal Wave. In response, Nico casts Gather Specimens. In response, Ama...

**Scenario:**
> Amanda casts Tidal Wave. In response, Nico casts Gather Specimens. In response, Amanda casts Crafty Cutpurse. Who gets the token?
> Cards involved: [[Tidal Wave]], [[Gather Specimens]], [[Crafty Cutpurse]].
> RulesGuru source: https://rulesguru.org/?526RGBwnIIIlDs0wQZOGG

**Expected verdict:** Amanda does. There is only one replacement effect applying to the original event, (Gather Specimens's) so it's applied. That causes Crafty Cutpurse's effect to become applicable (616.2), and the token goes back to being created under Amanda's control. Gather Specimens won't apply again. (614.5) It doesn't matter that Crafty Cutpurse applies to the creation of the tokens while Crafty Cutpurse applies to them entering the battlefield- it's still the same event. (701.7)

**Required reasoning:**
- Match the RulesGuru cited answer for question 526.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [614.5], [616.2], [701.7]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Tokens, Replacement effects, Evergreen keywords, Zone-changes, Control-changing effects.

## RG527. Adrien controls Primal Vigor and a Stunt Double with a +1/+1 counter. They cast Tem...

**Scenario:**
> Adrien controls Primal Vigor and a Stunt Double with a +1/+1 counter. They cast Tempt with Reflections targeting the Stunt Double to create two tokens. Can Adrien choose a different creature for each token to copy, or must each token copy the same creature?
> Cards involved: [[Primal Vigor]], [[Stunt Double]], [[Tempt with Reflections]].
> RulesGuru source: https://rulesguru.org/?527RGBwnIIIjzlSBHHmGG

**Expected verdict:** Each token may copy something different. There are two replacement effects trying to apply to the original event of creating a Stunt Double: Stunt Double's own effect and Primal Vigor's effect. Stunt Double's effect applies to it entering the battlefield however, while Primal Vigor's effect applies to it being created, so Primal Vigor's effect must be applied first. (616.1g) After that is applied the original Stunt Double's effect doesn't exist anymore, but each of the new Stunt Doubles entering the battlefield has its own copy effect, which can now be applied individually. (616.2)

**Required reasoning:**
- Match the RulesGuru cited answer for question 527.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [616.1g], [616.2]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Tokens, Replacement effects, Zone-changes, Copy effects.

## RG528. Aya controls Primal Vigor and a Gluttonous Slime. They cast Heat Shimmer targeting...

**Scenario:**
> Aya controls Primal Vigor and a Gluttonous Slime. They cast Heat Shimmer targeting the Gluttonous Slime. Can Aya apply the devour replacement effect before the Primal Vigor replacement effect, sacrificing 1 creature to have each token enter with a +1/+1 counter?
> Cards involved: [[Primal Vigor]], [[Gluttonous Slime]], [[Heat Shimmer]].
> RulesGuru source: https://rulesguru.org/?528RGBwnIIIjzlpqVzKGG

**Expected verdict:** No. There are two replacement effects trying to apply to the original event of creating a Gluttonous Slime: Gluttonous Slime's own effect and Primal Vigor's effect. Gluttonous Slime's effect applies to it entering the battlefield however, while Primal Vigor's effect applies to it being created, so Primal Vigor's effect must be applied first. (616.1g) After that is applied the original Gluttonous Slime's effect doesn't exist anymore, but each of the new Gluttonous Slimes entering the battlefield has its own effect, which can now be applied individually. (616.2)

**Required reasoning:**
- Match the RulesGuru cited answer for question 528.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [616.1g], [616.2]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Tokens, Replacement effects, Zone-changes, Counters.

## RG529. Amare and Nico each control a Coral Eel. Amare casts Pounce and targets both Coral...

**Scenario:**
> Amare and Nico each control a Coral Eel. Amare casts Pounce and targets both Coral Eels. In response, Nico casts Orcish Cannonade targeting Amare's Coral Eel. What happens as the Pounce attempts to resolve?
> Cards involved: [[Coral Eel]], [[Pounce]], [[Orcish Cannonade]].
> RulesGuru source: https://rulesguru.org/?529RGBwnIIIfuKLM3JuGG

**Expected verdict:** Pounce still has at least one legal target, so it will resolve. (608.2b) However there is nothing for the remaining Coral Eel to fight, so nothing happens. (701.14b)

**Required reasoning:**
- Match the RulesGuru cited answer for question 529.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [608.2b], [701.14b]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Targets, Resolving objects, Evergreen keywords, Last known information, Damage.

## RG531. Aubrey casts Solarion, paying {W}{U}{G} as the colored mana in its total cost. Aubr...

**Scenario:**
> Aubrey casts Solarion, paying {W}{U}{G} as the colored mana in its total cost. Aubrey then casts a Mercurial Pretender, paying {U}{R} as the colored mana in its cost and chooses to copy the Solarion as it resolves. How many +1/+1 counters does it enter the battlefield with?
> Cards involved: [[Solarion]], [[Mercurial Pretender]].
> RulesGuru source: https://rulesguru.org/?531RGBwnIII2cOn0oGG

**Expected verdict:** 2. Mercurial Pretender's copy effect copies only the base characteristics of the Solarion, not any counters on it or the colors of mana spent to cast it. (707.2) Solarion's ability cares about the colors of mana spent to cast that card, regardless of whether it changed name. (400.7d)

**Required reasoning:**
- Match the RulesGuru cited answer for question 531.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [400.7d], [707.2]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Copy effects, Casting spells, Resolving objects, Zone-changes, Replacement effects, Counters.

## RG532. Addilynn casts Foe-Razer Regent, and chooses to target Isamaru, Hound of Konda with...

**Scenario:**
> Addilynn casts Foe-Razer Regent, and chooses to target Isamaru, Hound of Konda with its triggered ability upon entering the battlefield. Before that ability resolves, Nico casts Might of Oaks targeting Isamaru, Hound of Konda. Does Foe-Razer Regent die as its ability resolves?
> Cards involved: [[Foe-Razer Regent]], [[Isamaru, Hound of Konda]], [[Might of Oaks]].
> RulesGuru source: https://rulesguru.org/?532RGBwnIIIgKvufsKeGG

**Expected verdict:** Only if Addilynn chooses to have it fight. Only the target is chosen when the ability is put onto the stack, the choice of whether to fight is made as the ability resolves. (603.5)

**Required reasoning:**
- Match the RulesGuru cited answer for question 532.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [603.5]

**Why this test matters:** Imported RulesGuru benchmark. Level: 0. Complexity: Simple. Tags: Triggered abilities, Targets, Resolving objects, Evergreen keywords.

## RG533. Amelie casts Notion Rain, and while surveilling, puts a Blood Operative from their...

**Scenario:**
> Amelie casts Notion Rain, and while surveilling, puts a Blood Operative from their library into their graveyard. Can they pay 3 life to return the Blood Operative to their hand?
> Cards involved: [[Notion Rain]], [[Blood Operative]].
> RulesGuru source: https://rulesguru.org/?533RGBwnIII21Lpn1GG

**Expected verdict:** Yes. Triggered abilities are checked to see if they trigger immediately after the event in question. At that time, Blood Operative is in the graveyard. ([603.10]

**Required reasoning:**
- Match the RulesGuru cited answer for question 533.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [603.10]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Triggered abilities, Zone-changes, Abilities, Non-evergreen keywords.

## RG534. Alberto controls an Epicure of Blood and attacks with 2 Rhox War Monks. How many ti...

**Scenario:**
> Alberto controls an Epicure of Blood and attacks with 2 Rhox War Monks. How many times will Epicure of Blood trigger as damage is dealt?
> Cards involved: [[Epicure of Blood]], [[Rhox War Monk]].
> RulesGuru source: https://rulesguru.org/?534RGBwnIII1JHcz6GG

**Expected verdict:** Twice. While there was only 1 damage event, Epicure of Blood's trigger treats it as two lifegain events. (119.9, 700.1)

**Required reasoning:**
- Match the RulesGuru cited answer for question 534.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [119.9], [700.1]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Life, Triggered abilities, Damage.

## RG535. Ainsley controls Grand Arbiter Augustin IV and wants to cast Sonic Assault from the...

**Scenario:**
> Ainsley controls Grand Arbiter Augustin IV and wants to cast Sonic Assault from their graveyard. How much does the Sonic Assault cost to cast?
> Cards involved: [[Grand Arbiter Augustin IV]], [[Sonic Assault]].
> RulesGuru source: https://rulesguru.org/?535RGBwnIII1OLfmwGG

**Expected verdict:** {U}{R}. Grand Arbiter Augustin IV's effect applies to any spell Ainsley casts, regardless of what zone it's being cast from. It can only reduce the spell's cost by {1}, not any colored mana. (118.7a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 535.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [118.7a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Non-evergreen keywords, Casting spells, Costs, Mana.

## RG536. Alivia controls Bridge from Below and Shu Foot Soldiers. They cast Austere Command,...

**Scenario:**
> Alivia controls Bridge from Below and Shu Foot Soldiers. They cast Austere Command, choosing to destroy all enchantments and all creatures with mana value 3 or less. Does they create a Zombie token?
> Cards involved: [[Bridge from Below]], [[Shu Foot Soldiers]], [[Austere Command]].
> RulesGuru source: https://rulesguru.org/?536RGBwnIIIf1oc6c2WGG

**Expected verdict:** Yes. Modes of a resolving spell or ability are carried out in the order they are written. (608.2c) Bridge from Below is already in the graveyard by the time Shu Foot Soldiers dies.

**Required reasoning:**
- Match the RulesGuru cited answer for question 536.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [608.2c]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Triggered abilities, Zone-changes, Resolving objects.

## RG537. April controls Catacomb Slug and a token that's a copy of Bridge from Below. They c...

**Scenario:**
> April controls Catacomb Slug and a token that's a copy of Bridge from Below. They cast Planar Cleansing. Do they create a Zombie token?
> Cards involved: [[Catacomb Slug]], [[Bridge from Below]], [[Planar Cleansing]].
> RulesGuru source: https://rulesguru.org/?537RGBwnIIIfbdk5Jc1GG

**Expected verdict:** No. Leaves-the-battlefield triggers care about the state of the game immediately before the event in question. (603.10a) Bridge from Below was on the battlefield at that time, and won't trigger.

**Required reasoning:**
- Match the RulesGuru cited answer for question 537.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [603.10a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Triggered abilities, Zone-changes, Resolving objects.

## RG538. Anson controls Squire and a token that's a copy of Bridge from Below. They cast Aus...

**Scenario:**
> Anson controls Squire and a token that's a copy of Bridge from Below. They cast Austere Command, choosing to destroy all enchantments and all creatures with mana value 3 or less. Does they create a Zombie token?
> Cards involved: [[Squire]], [[Bridge from Below]], [[Austere Command]].
> RulesGuru source: https://rulesguru.org/?538RGBwnIIIl5ifyEXeGG

**Expected verdict:** No. Even though Bridge from Below is a token, it still moves to the graveyard when it's destroyed. It will only cease to exist after Austere Command has finished resolving. (704.5d) Modes of a resolving spell or ability are carried out in the order they are written (608.2c), so Bridge from Below is already in the graveyard by the time Squire dies. However Bridge from Below's trigger has an intervening if clause (603.4), so it will check again if Bridge from Below is in the graveyard when the trigger attempts to resolve. The Bridge from Below has ceased to exist by that point, so no trigger is created.

**Required reasoning:**
- Match the RulesGuru cited answer for question 538.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [603.4], [608.2c], [704.5d]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Triggered abilities, Zone-changes, Resolving objects.

## RG539. Axl attacks with Goblin Banneret, Boros Challenger, Blade Instructor, Tajic, Legion...

**Scenario:**
> Axl attacks with Goblin Banneret, Boros Challenger, Blade Instructor, Tajic, Legion's Edge, Truefire Captain, and Hammer Dropper. They put the mentor triggers on the stack in the following order: Boros Challenger targets Goblin Banneret, Tajic, Legion's Edge targets Boros Challenger, Blade Instructor targets Goblin Banneret, Hammer Dropper targets Tajic, Legion's Edge, and Truefire Captain targets Blade Instructor. How much damage will be dealt to Norah in total?
> Cards involved: [[Goblin Banneret]], [[Boros Challenger]], [[Blade Instructor]], [[Tajic, Legion's Edge]], [[Truefire Captain]], [[Hammer Dropper]].
> RulesGuru source: https://rulesguru.org/?539RGBwnIII45wMsFL1JVPAymOqGG

**Expected verdict:** 23. In order:

Truefire Captain's trigger gives Blade Instructor a +1/+1 counter
Hammer Dropper's trigger gives Tajic, Legion's Edge a +1/+1 counter
Blade Instructor's trigger gives Goblin Banneret a +1/+1 counter
Tajic, Legion's Edge's trigger gives Boros Challenger a +1/+1 counter
Boros Challenger's trigger gives Goblin Banneret a +1/+1 counter

The final powers of the creatures (in order) are 3, 3, 4, 4, 4, and 5.

**Required reasoning:**
- Match the RulesGuru cited answer for question 539.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Complicated. Tags: Non-evergreen keywords, Triggered abilities, Combat.

## RG540. Angelina controls Emmara, Soul of the Accord, a Plains, and 2 Forests. Can they cas...

**Scenario:**
> Angelina controls Emmara, Soul of the Accord, a Plains, and 2 Forests. Can they cast Meditation Puzzle by tapping the 3 lands, the Emmara, Soul of the Accord, and the token created by Emmara, Soul of the Accord?
> Cards involved: [[Emmara, Soul of the Accord]], [[Plains]], [[Forest]], [[Meditation Puzzle]].
> RulesGuru source: https://rulesguru.org/?540RGBwnIII2zDjONPe2mBGG

**Expected verdict:** No. The cost to cast Meditation Puzzle must be paid as it's cast. (601.2f, 702.51a) The token is only created when the trigger resolves, after the Meditation Puzzle has been cast. (603.3, 117.4)

**Required reasoning:**
- Match the RulesGuru cited answer for question 540.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [117.4], [601.2f], [603.3], [702.51a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Casting spells, Triggered abilities, Timing and priority, Costs, Non-evergreen keywords.

## RG541. Ainsley has 3 Undead Servants in their graveyard and casts another Undead Servant....

**Scenario:**
> Ainsley has 3 Undead Servants in their graveyard and casts another Undead Servant. After it enters the battlefield but before its trigger resolves, Nico activates Remorseful Cleric to exile all cards from Ainsley's graveyard. When Undead Servant's ability resolves, how many tokens will be created?
> Cards involved: [[Undead Servant]], [[Remorseful Cleric]].
> RulesGuru source: https://rulesguru.org/?541RGBwnIII2jpkb2GG

**Expected verdict:** 0. The number of tokens to create is determined when the ability resolves, by which point the graveyard has no creatures in it.

**Required reasoning:**
- Match the RulesGuru cited answer for question 541.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: 0. Complexity: Simple. Tags: Triggered abilities, Resolving objects.

## RG542. Aubrey and Nicholas each control an Exotic Orchard. If Aubrey taps their Exotic Orc...

**Scenario:**
> Aubrey and Nicholas each control an Exotic Orchard. If Aubrey taps their Exotic Orchard, what type(s) of mana can it produce?
> Cards involved: [[Exotic Orchard]].
> RulesGuru source: https://rulesguru.org/?542RGBwnIIIaXVGG

**Expected verdict:** None. Nicholas's Exotic Orchard couldn't produce any mana, so neither can Exotic Orchard. (106.7)

**Required reasoning:**
- Match the RulesGuru cited answer for question 542.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [106.7]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Mana, Mana abilities.

## RG543. Athena controls a Squandered Resources and an Underground Sea. Nathanael controls B...

**Scenario:**
> Athena controls a Squandered Resources and an Underground Sea. Nathanael controls Blood Moon. If Athena sacrifices Underground Sea to Squandered Resources, what type(s) of mana can it produce?
> Cards involved: [[Squandered Resources]], [[Underground Sea]], [[Blood Moon]].
> RulesGuru source: https://rulesguru.org/?543RGBwnIIIl50Yw2uFGG

**Expected verdict:** Just {R}. Squandered Resources cares about what colors of mana it could produce on the battlefield.

**Required reasoning:**
- Match the RulesGuru cited answer for question 543.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Mana, Mana abilities.

## RG544. Addilyn controls Star Compass and Black Dragon Gate. If Addilyn taps Star Compass,...

**Scenario:**
> Addilyn controls Star Compass and Black Dragon Gate. If Addilyn taps Star Compass, what type(s) of mana can it produce?
> Cards involved: [[Star Compass]], [[Black Dragon Gate]].
> RulesGuru source: https://rulesguru.org/?544RGBwnIII2ekgVYGG

**Expected verdict:** None. Black Dragon Gate isn't a basic land.

**Required reasoning:**
- Match the RulesGuru cited answer for question 544.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Mana, Mana abilities.

## RG545. Antoine controls Reflecting Pool and a Deathrite Shaman that's currently a land due...

**Scenario:**
> Antoine controls Reflecting Pool and a Deathrite Shaman that's currently a land due to Arcane Adaptation (naming "Saproling") and Life and Limb. Neither player has any land cards in their graveyards. If Antoine taps Reflecting Pool, what type(s) of mana can it produce?
> Cards involved: [[Reflecting Pool]], [[Deathrite Shaman]], [[Arcane Adaptation]], [[Life and Limb]].
> RulesGuru source: https://rulesguru.org/?545RGBwnIII3an7stOaPNPGG

**Expected verdict:** Any color. Reflecting Pool checks to see what mana Deathrite Shaman could produce if any of its abilities were to resolve at that time. (106.7) If Deathrite Shaman's first ability were to resolve now it would produce any color of mana. It doesn't matter that it has no legal targets and couldn't resolve (608.2b), since the check in [106.7] takes it resolving as a premise.

**Required reasoning:**
- Match the RulesGuru cited answer for question 545.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [106.7], [608.2b]

**Why this test matters:** Imported RulesGuru benchmark. Level: Corner Case. Complexity: Simple. Tags: Mana, Mana abilities, Targets, Resolving objects.

## RG546. Angeline controls Harvester Druid and a Charmed Pendant that's currently a land due...

**Scenario:**
> Angeline controls Harvester Druid and a Charmed Pendant that's currently a land due to March of the Machines, Arcane Adaptation (naming "Saproling"), and Life and Limb. If Angeline taps Harvester Druid, what type(s) of mana can it produce?
> Cards involved: [[Harvester Druid]], [[Charmed Pendant]], [[March of the Machines]], [[Arcane Adaptation]], [[Life and Limb]].
> RulesGuru source: https://rulesguru.org/?546RGBwnIIIq7jlXweEOz3mEGG

**Expected verdict:** Unclear. Harvester Druid cares about what mana Charmed Pendant could produce if any of its mana abilities were to resolve at that time, "ignoring whether any costs of the ability could or could not be paid". (106.7) The rules are unclear on how to handle "ignored" costs when the ability cares about them.

**Required reasoning:**
- Match the RulesGuru cited answer for question 546.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [106.7]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Intermediate. Tags: Mana, Mana abilities, Costs, Activated abilities, Abilities, Unsupported answers.

## RG547. Ace controls Naga Vitalist and Nykthos, Shrine to Nyx. If Ace taps Naga Vitalist, w...

**Scenario:**
> Ace controls Naga Vitalist and Nykthos, Shrine to Nyx. If Ace taps Naga Vitalist, what type(s) of mana can it produce?
> Cards involved: [[Naga Vitalist]], [[Nykthos, Shrine to Nyx]].
> RulesGuru source: https://rulesguru.org/?547RGBwnIII20H5zdGG

**Expected verdict:** {C} or {G}. Naga Vitalist checks to see what mana Nykthos, Shrine to Nyx could produce if any of its abilities were to resolve at that time. (106.7) If Nykthos, Shrine to Nyx's first ability were to resolve now, it could produce {C}. If the second ability were to resolve now, it could produce {G}.

**Required reasoning:**
- Match the RulesGuru cited answer for question 547.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [106.7]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Mana, Mana abilities.

## RG549. Ariadne controls Quirion Explorer. Nicholas controls Crumbling Vestige. If Ariadne...

**Scenario:**
> Ariadne controls Quirion Explorer. Nicholas controls Crumbling Vestige. If Ariadne taps Quirion Explorer, what type(s) of mana can it produce?
> Cards involved: [[Quirion Explorer]], [[Crumbling Vestige]].
> RulesGuru source: https://rulesguru.org/?549RGBwnIII25HFfVGG

**Expected verdict:** Any color. Quirion Explorer checks to see what mana Crumbling Vestige could produce if any of its abilities were to resolve at that time. (106.7) That includes triggered abilities.

**Required reasoning:**
- Match the RulesGuru cited answer for question 549.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [106.7]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Mana, Mana abilities.

## RG553. Ariadne casts Phage the Untouchable. In response, Nico casts Gather Specimens. What...

**Scenario:**
> Ariadne casts Phage the Untouchable. In response, Nico casts Gather Specimens. What happens when Phage the Untouchable resolves?
> Cards involved: [[Phage the Untouchable]], [[Gather Specimens]].
> RulesGuru source: https://rulesguru.org/?553RGBwnIII23HjnoGG

**Expected verdict:** Nico didn't cast it from their hand, so they lose the game.

**Required reasoning:**
- Match the RulesGuru cited answer for question 553.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Triggered abilities, Resolving objects, Control-changing effects, Zone-changes.

## RG554. Aden casts Grave Upheaval targeting Undergrowth Scavenger in their graveyard. Assum...

**Scenario:**
> Aden casts Grave Upheaval targeting Undergrowth Scavenger in their graveyard. Assuming there are no other cards in any graveyards, how many +1/+1 counters will Undergrowth Scavenger enter the battlefield with?
> Cards involved: [[Grave Upheaval]], [[Undergrowth Scavenger]].
> RulesGuru source: https://rulesguru.org/?554RGBwnIII1OTA5hGG

**Expected verdict:** One. Undergrowth Scavenger has a replacement effect that modifies how it will enter the battlefield. (614.1c) The game needs to know how Undergrowth Scavenger will enter the battlefield, and must do that before it enters the battlefield. At that point it will be in the graveyard and will count itself.

**Required reasoning:**
- Match the RulesGuru cited answer for question 554.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [614.1c]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Replacement effects, Graveyard, Zone-changes.

## RG555. Autumn controls Skill Borrower. The top card of their library is a Twinblade Slashe...

**Scenario:**
> Autumn controls Skill Borrower. The top card of their library is a Twinblade Slasher. Autumn activates Skill Borrower's ability, then casts Dream Cache. As Dream Cache resolves, they draw Twinblade Slasher and then put Twinblade Slasher back on top of their library. Can Autumn activate Skill Borrower's ability again?
> Cards involved: [[Skill Borrower]], [[Twinblade Slasher]], [[Dream Cache]].
> RulesGuru source: https://rulesguru.org/?555RGBwnIIIkJzqv9pBGG

**Expected verdict:** Yes. The Twinblade Slasher that's now on top of the library is unrelated to the Twinblade Slasher that was there previously. (400.7) Skill Borrower has a new ability that just has the same text as the ability that was activated earlier. (602.5c)

**Required reasoning:**
- Match the RulesGuru cited answer for question 555.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [400.7], [602.5c]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Zone-changes, Activated abilities, Abilities, Libraries.

## RG556. Ahmad controls Skill Borrower and Sensei's Divining Top. The top card of their libr...

**Scenario:**
> Ahmad controls Skill Borrower and Sensei's Divining Top. The top card of their library is a Twinblade Slasher. Ahmad activates Skill Borrower's ability from Twinblade Slasher, then activates Sensei's Divining Top's first ability, leaving Twinblade Slasher on top. Can Ahmad activate Skill Borrower's ability again?
> Cards involved: [[Skill Borrower]], [[Sensei's Divining Top]], [[Twinblade Slasher]].
> RulesGuru source: https://rulesguru.org/?556RGBwnIIIkJzhHJh1GG

**Expected verdict:** Yes. [401.6] and/or [701.20d] are intended to apply to this situation, even though their current wording doesn't. (Twinblade Slasher never stopped being revealed since it never stopped being on top of the library, nor were any cards reordered.)

**Required reasoning:**
- Match the RulesGuru cited answer for question 556.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [401.6], [701.20d]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Zone-changes, Activated abilities, Abilities, Libraries, Unsupported answers.

## RG557. Addison controls Skill Borrower and Sensei's Divining Top. The top card of their li...

**Scenario:**
> Addison controls Skill Borrower and Sensei's Divining Top. The top card of their library is an Azimaet Drake. Addison activates Skill Borrower's ability, then activates Sensei's Divining Top's first ability, choosing to put Azimaet Drake second from the top. Then they activate Sensei's Divining Top again, putting Azimaet Drake back on top. Can Addison activate Skill Borrower's ability again?
> Cards involved: [[Skill Borrower]], [[Sensei's Divining Top]], [[Azimaet Drake]].
> RulesGuru source: https://rulesguru.org/?557RGBwnIIIkJzhHCqzGG

**Expected verdict:** Yes. Azimaet Drake stopped being revealed for a time, so it is no longer the same object that it was before. (401.6) Skill Borrower has a new ability that just has the same text as the ability that was activated earlier. (602.5c)

**Required reasoning:**
- Match the RulesGuru cited answer for question 557.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [401.6], [602.5c]

**Why this test matters:** Imported RulesGuru benchmark. Level: Corner Case. Complexity: Simple. Tags: Zone-changes, Activated abilities, Abilities, Libraries.

## RG559. Addison, Bria, and Cash are playing a multiplayer game. Bria controls Emissary of G...

**Scenario:**
> Addison, Bria, and Cash are playing a multiplayer game. Bria controls Emissary of Grudges. Addison casts Worst Fears to take control of Bria's next turn. After Bria begins their turn, can Addison see which player was chosen for the Emissary of Grudges?
> Cards involved: [[Emissary of Grudges]], [[Worst Fears]].
> RulesGuru source: https://rulesguru.org/?559RGBwnIII1JhP1mGG

**Expected verdict:** No. The choice was made as Emissary of Grudges entered the battlefield, which already happened- it's no longer visible to Bria. (722.4) Addison can choose to activate the ability (at which point all players will know who was chosen), but otherwise the choice is not visible to any player.

**Required reasoning:**
- Match the RulesGuru cited answer for question 559.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [722.4]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Control-changing effects.

## RG560. Adriana has no cards in their library and controls a Keranos, God of Storms and Lic...

**Scenario:**
> Adriana has no cards in their library and controls a Keranos, God of Storms and Lich's Mastery. When they begin their draw step, what happens?
> Cards involved: [[Keranos, God of Storms]], [[Lich's Mastery]].
> RulesGuru source: https://rulesguru.org/?560RGBwnIII1UY2yqGG

**Expected verdict:** Adriana can't draw a card, so no card is revealed and none of Keranos, God of Storms's triggered abilities trigger. Adriana will continue with their turn.

**Required reasoning:**
- Match the RulesGuru cited answer for question 560.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: 0. Complexity: Simple. Tags: Leaving the game, Libraries, Drawing a card, Triggered abilities.

## RG561. Avery controls Galvanic Alchemist paired with a Tasseled Dromedary. They cast Direg...

**Scenario:**
> Avery controls Galvanic Alchemist paired with a Tasseled Dromedary. They cast Diregraf Escort. What can they pair it with?
> Cards involved: [[Galvanic Alchemist]], [[Tasseled Dromedary]], [[Diregraf Escort]].
> RulesGuru source: https://rulesguru.org/?561RGBwnIIIgTwZASgfGG

**Expected verdict:** Nothing. Neither soulbond ability triggers. (702.95a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 561.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [702.95a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Non-evergreen keywords, Triggered abilities.

## RG564. Autumn controls Mana Reflection and Desert of the Fervent. Nico controls Damping Sp...

**Scenario:**
> Autumn controls Mana Reflection and Desert of the Fervent. Nico controls Damping Sphere. If Autumn taps the Desert of the Fervent for mana, how much mana is produced, and of what type(s)?
> Cards involved: [[Mana Reflection]], [[Desert of the Fervent]], [[Damping Sphere]].
> RulesGuru source: https://rulesguru.org/?564RGBwnIIIitrYxFlkGG

**Expected verdict:** {C}. As the ability resolves, Mana Reflection replaces "Add {R}" with "Add {R}{R}". Damping Sphere then applies and replaces that with "Add {C}". Mana Reflection won't apply again. (614.5)

**Required reasoning:**
- Match the RulesGuru cited answer for question 564.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [614.5]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Mana abilities, Mana, Replacement effects, Activated abilities.

## RG565. Autumn controls Canopy Vista enchanted by Utopia Sprawl. Nina controls Damping Sphe...

**Scenario:**
> Autumn controls Canopy Vista enchanted by Utopia Sprawl. Nina controls Damping Sphere. If Autumn taps the Canopy Vista for mana, how much mana is produced, of what type(s)?
> Cards involved: [[Canopy Vista]], [[Utopia Sprawl]], [[Damping Sphere]].
> RulesGuru source: https://rulesguru.org/?565RGBwnIIIf8jS4ysPGG

**Expected verdict:** Autumn adds the same amount and types of mana that they would have without the Damping Sphere. Damping Sphere only affects a permanent being tapped for more than one mana, and Canopy Vista only adds 1 mana. Utopia Sprawl's triggered ability adds the rest.

**Required reasoning:**
- Match the RulesGuru cited answer for question 565.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Mana abilities, Mana, Replacement effects, Activated abilities, Triggered abilities.

## RG566. Alessandra controls a Thought Reflection and casts Enter the Infinite. What happens...

**Scenario:**
> Alessandra controls a Thought Reflection and casts Enter the Infinite. What happens as it resolves?
> Cards involved: [[Thought Reflection]], [[Enter the Infinite]].
> RulesGuru source: https://rulesguru.org/?566RGBwnIII2hniWVGG

**Expected verdict:** Alessandra attempts to draw cards equal to twice the number of cards in their library, and can't do so, so they only draw the number of cards in the library. Alessandra then puts one back on top. Unless their library contained 0 cards before resolving Enter the Infinite, they will lose the game after Enter the Infinite has finished resolving. (704.5b)

**Required reasoning:**
- Match the RulesGuru cited answer for question 566.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [704.5b]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Drawing a card, Replacement effects, Resolving objects, Numbers and symbols.

## RG567. Ainsley activates Seasinger's ability, targeting Natalia's Eager Cadet. Before that...

**Scenario:**
> Ainsley activates Seasinger's ability, targeting Natalia's Eager Cadet. Before that ability resolves, Ainsley untaps Seasinger with Aphetto Alchemist and then taps it again targeting Natalia's Transguild Courier. Which creature(s) does Ainsley gain control of?
> Cards involved: [[Seasinger]], [[Eager Cadet]], [[Aphetto Alchemist]], [[Transguild Courier]].
> RulesGuru source: https://rulesguru.org/?567RGBwnIII3fesENtlTgvGG

**Expected verdict:** Just Transguild Courier. [611.2b] is intended to apply to this situation, even though its current wording doesn't.

**Required reasoning:**
- Match the RulesGuru cited answer for question 567.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [611.2b]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: The stack, Control-changing effects, Continuous effects, Unsupported answers.

## RG568. Autumn controls Goblin Arsonist enchanted by Nathaniel's Glistening Oil. When Gobli...

**Scenario:**
> Autumn controls Goblin Arsonist enchanted by Nathaniel's Glistening Oil. When Goblin Arsonist dies at the beginning of Nathaniel's upkeep, does it deal its damage with infect?
> Cards involved: [[Goblin Arsonist]], [[Glistening Oil]].
> RulesGuru source: https://rulesguru.org/?568RGBwnIII1O3JkrGG

**Expected verdict:** Yes. The Goblin Arsonist does not exist when it needs to deal damage, so the game uses its last known information. (113.7a) When it was last on the battlefield, it had infect.

**Required reasoning:**
- Match the RulesGuru cited answer for question 568.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [113.7a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Last known information, Damage, Zone-changes, Non-evergreen keywords.

## RG570. Aspen activates the second ability of Jarad, Golgari Lich Lord, sacrificing Frenzie...

**Scenario:**
> Aspen activates the second ability of Jarad, Golgari Lich Lord, sacrificing Frenzied Raptor. In response, Nala casts Sudden Spoiling, targeting Aspen. How much life does Nala lose?
> Cards involved: [[Jarad, Golgari Lich Lord]], [[Frenzied Raptor]], [[Sudden Spoiling]].
> RulesGuru source: https://rulesguru.org/?570RGBwnIIIhSLk1sQzGG

**Expected verdict:** Four. Frenzied Raptor is sacrificed as a cost to activate Jarad, Golgari Lich Lord's ability and is not on the battlefield when Sudden Spoiling resolves. (113.3b/602.1/602.1a, 602.2) Jarad, Golgari Lich Lord checks the power of Frenzied Raptor when it was last on the battlefield. (608.2h)

**Required reasoning:**
- Match the RulesGuru cited answer for question 570.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [113.3b], [602.1], [602.1a], [602.2], [608.2h]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Activated abilities, Casting spells, Costs, Targets, The stack, Timing and priority.

## RG575. Anya has Deadbridge Goliath in their graveyard. Anya activates the scavenge ability...

**Scenario:**
> Anya has Deadbridge Goliath in their graveyard. Anya activates the scavenge ability of Deadbridge Goliath targeting Cabal Evangel. In response, Niko activates Deathrite Shaman targeting Deadbridge Goliath. What happens?
> Cards involved: [[Deadbridge Goliath]], [[Cabal Evangel]], [[Deathrite Shaman]].
> RulesGuru source: https://rulesguru.org/?575RGBwnIIIfMnY8XUtGG

**Expected verdict:** This can't happen as described. Exiling Deadbridge Goliath is part of the costs associated with activating the scavenge ability. (702.97a) Once Anya announces their intent to scavenge, Niko doesn't have a chance to respond until Deadbridge Goliath has already been exiled from the graveyard. (602.2)

**Required reasoning:**
- Match the RulesGuru cited answer for question 575.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [602.2], [702.97a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Non-evergreen keywords, Activated abilities, Zone-changes, Costs.

## RG577. Avery controls Alpha Tyrranax, and Noelle controls Personal Sanctuary and Garruk Wi...

**Scenario:**
> Avery controls Alpha Tyrranax, and Noelle controls Personal Sanctuary and Garruk Wildspeaker. Avery attacks Garruk Wildspeaker with Alpha Tyrranax. Is damage to Garruk Wildspeaker prevented?
> Cards involved: [[Alpha Tyrranax]], [[Personal Sanctuary]], [[Garruk Wildspeaker]].
> RulesGuru source: https://rulesguru.org/?577RGBwnIIIehSo0wT2GG

**Expected verdict:** No. Garruk Wildspeaker is not Noelle.

**Required reasoning:**
- Match the RulesGuru cited answer for question 577.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: 0. Complexity: Simple. Tags: Combat, Damage, Planeswalkers, Prevention effects.

## RG578. Nico controls Barracks of the Thousand. Ainsley activates Pernicious Deed for X = 0...

**Scenario:**
> Nico controls Barracks of the Thousand. Ainsley activates Pernicious Deed for X = 0. Will Barracks of the Thousand be destroyed?
> 
> Cards involved: [[Barracks of the Thousand]], [[Pernicious Deed]].
> RulesGuru source: https://rulesguru.org/?578RGBwnIII2VaQEhGG

**Expected verdict:** Yes. Pernicious Deed specifies that it destroys artifacts. It doesn't care if the card has other types as well, only that it has one of the named types. (608.2j) Barracks of the Thousand has mana value 0, and therefore falls under the scope of what Pernicious Deed is destroying. (202.3a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 578.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [202.3a], [608.2j]

**Why this test matters:** Imported RulesGuru benchmark. Level: 0. Complexity: Simple. Tags: Mana, Lands, Mana value, Resolving objects.

## RG581. Alan attacks with War Mammoth. Nala blocks with Spectral Lynx. What is the maximum...

**Scenario:**
> Alan attacks with War Mammoth. Nala blocks with Spectral Lynx. What is the maximum damage that can be dealt to Nala? 
> Cards involved: [[War Mammoth]], [[Spectral Lynx]].
> RulesGuru source: https://rulesguru.org/?581RGBwnIII2lJ7DmGG

**Expected verdict:** Two. Alan must assign at least one damage to Spectral Lynx. The game doesn't take the protection ability into account when determining what "lethal damage" would be, when Alan is assigning damage, so they only has to assign one damage. (702.16a, 510.1d)

**Required reasoning:**
- Match the RulesGuru cited answer for question 581.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [510.1d], [702.16a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Evergreen keywords, Damage, Combat.

## RG582. Amelie casts Jeleva, Nephalia's Scourge and resolves its trigger. Amelie then casts...

**Scenario:**
> Amelie casts Jeleva, Nephalia's Scourge and resolves its trigger. Amelie then casts Personify targeting Jeleva, Nephalia's Scourge, and on their next turn attacks with it. Are they able to cast a card exiled with the first trigger?
> Cards involved: [[Jeleva, Nephalia's Scourge]], [[Personify]].
> RulesGuru source: https://rulesguru.org/?582RGBwnIII3NclsnGG

**Expected verdict:** No. The cards that were exiled by the first trigger are linked to the object that exiled them. (607.2a) The Jeleva, Nephalia's Scourge that is currently on the battlefield is a different object with different abilities than the Jeleva, Nephalia's Scourge that exiled the first set of cards. (400.7)

**Required reasoning:**
- Match the RulesGuru cited answer for question 582.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [400.7], [607.2a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Triggered abilities, Linked abilities, Casting spells, Zone-changes, Resolving objects.

## RG585. Ariel controls Stone Haven Outfitter and Eager Cadet. Ariel activates Skullclamp's...

**Scenario:**
> Ariel controls Stone Haven Outfitter and Eager Cadet. Ariel activates Skullclamp's equip ability targeting Eager Cadet. What happens when the equip ability resolves?
> Cards involved: [[Stone Haven Outfitter]], [[Eager Cadet]], [[Skullclamp]].
> RulesGuru source: https://rulesguru.org/?585RGBwnIIIlagfk3KpGG

**Expected verdict:** After Skullclamp's equip ability resolves, the game checks state-based actions. (117.5/704.3) At that point Eager Cadet is getting +1/+1 and does not die. (704.5f)

**Required reasoning:**
- Match the RulesGuru cited answer for question 585.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [117.5], [704.3], [704.5f]

**Why this test matters:** Imported RulesGuru benchmark. Level: 0. Complexity: Simple. Tags: Equipment, Continuous effects, State-based actions.

## RG595. Aubriella controls Obelisk of Urd enchanted with Disruption Aura. Can Aubriella tap...

**Scenario:**
> Aubriella controls Obelisk of Urd enchanted with Disruption Aura. Can Aubriella tap six creatures instead of paying mana for Disruption Aura's triggered ability?
> Cards involved: [[Obelisk of Urd]], [[Disruption Aura]].
> RulesGuru source: https://rulesguru.org/?595RGBwnIII225fVZGG

**Expected verdict:** No. Convoke is an ability that functions while Obelisk of Urd is on the stack that allows Aubriella to tap creatures instead of paying mana for the Obelisk of Urd. (702.51a) It does not modify the mana cost of the spell in other zones, nor does it allow Aubriella to tap creatures to pay for Disruption Aura.

**Required reasoning:**
- Match the RulesGuru cited answer for question 595.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [702.51a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Non-evergreen keywords, Mana, Costs.

## RG596. Allan uses Katilda and Lier to give Dead Drop flashback. Can they delve to pay the...

**Scenario:**
> Allan uses Katilda and Lier to give Dead Drop flashback. Can they delve to pay the flashback cost? 
> Cards involved: [[Katilda and Lier]], [[Dead Drop]].
> RulesGuru source: https://rulesguru.org/?596RGBwnIII2KWN8cGG

**Expected verdict:** Yes. Flashback is an alternative cost, but delve is simply a different way of paying mana costs. (702.34a, 702.66a, 702.66b) After the total cost of the spell has been determined, Allan can then exile cards from their graveyard instead of paying mana for the spell.

**Required reasoning:**
- Match the RulesGuru cited answer for question 596.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [702.34a], [702.66a], [702.66b]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Non-evergreen keywords, Graveyard, Casting spells.

## RG598. Nadia controls True-Name Nemesis with protection from Addison. Addison casts Mirror...

**Scenario:**
> Nadia controls True-Name Nemesis with protection from Addison. Addison casts Mirrorweave targeting their Sewer Nemesis, for which Nadia is the chosen player. After Mirrorweave resolves, if Addison casts another spell, will Nadia's True-Name Nemesis's third ability trigger?
> Cards involved: [[True-Name Nemesis]], [[Mirrorweave]], [[Sewer Nemesis]].
> RulesGuru source: https://rulesguru.org/?598RGBwnIIIlQg0toL2GG

**Expected verdict:** No. Sewer Nemesis's second and third abilities are each "linked" to its first ability, and only the player named for the first ability is considered when checking to see if it triggers. (607.1, 607.2d) Since True-Name Nemesis didn't enter the battlefield as a copy of Sewer Nemesis, there is no chosen player for that ability. Since its power and toughness can't be determined, it's a 0/0. (107.2) If it were to stay alive somehow, it's third ability could never trigger.

**Required reasoning:**
- Match the RulesGuru cited answer for question 598.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [107.2], [607.1], [607.2d]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Intermediate. Tags: Copy effects, Linked abilities.

## RG600. Ariya resolves Duplicant, and uses Strionic Resonator to exile Lagac Lizard then Si...

**Scenario:**
> Ariya resolves Duplicant, and uses Strionic Resonator to exile Lagac Lizard then Silvercoat Lion. Once all the triggers resolve, what is Duplicant's power and toughness?
> Cards involved: [[Duplicant]], [[Strionic Resonator]], [[Lagac Lizard]], [[Silvercoat Lion]].
> RulesGuru source: https://rulesguru.org/?600RGBwnIII2yfW5PS3YPqGG

**Expected verdict:** Duplicant is a 2/2. Its second ability looks at the last creature card exiled by the first ability, which was Silvercoat Lion.

**Required reasoning:**
- Match the RulesGuru cited answer for question 600.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: 0. Complexity: Simple. Tags: Triggered abilities, Linked abilities, Continuous effects.

## RG603. Ada controls Rotted Hystrix and Darksteel Garrison that's fortifying Rakdos Carnari...

**Scenario:**
> Ada controls Rotted Hystrix and Darksteel Garrison that's fortifying Rakdos Carnarium. Ada casts Bludgeon Brawl. After that resolves they activate Darksteel Garrison's equip ability targeting Rotted Hystrix. What does the battlefield look like after that ability has resolved and state-based actions have been checked?
> Cards involved: [[Rotted Hystrix]], [[Darksteel Garrison]], [[Rakdos Carnarium]], [[Bludgeon Brawl]].
> RulesGuru source: https://rulesguru.org/?603RGBwnIII3cAE7ljv0joGG

**Expected verdict:** Darksteel Garrison is attached to Rotted Hystrix and not to Rakdos Carnarium.

Bludgeon Brawl doesn't specify that the permanents it affects keep their original subtypes, so they are overwritten. (205.1a) This means that Darksteel Garrison ceases to be a Fortification as soon as Bludgeon Brawl enters the battlefield. It will become unattached the next time state-based actions are performed. (301.5, 301.5c) When its equip ability resolves, it becomes attached to Rotted Hystrix.

**Required reasoning:**
- Match the RulesGuru cited answer for question 603.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [205.1a], [301.5], [301.5c]

**Why this test matters:** Imported RulesGuru benchmark. Level: Corner Case. Complexity: Intermediate. Tags: Non-evergreen keywords, Continuous effects, Equipment, Type-changing effects.

## RG604. Avery controls their Raptor Companion enchanted with Spirespine and Flickerform. Wh...

**Scenario:**
> Avery controls their Raptor Companion enchanted with Spirespine and Flickerform. What happens when they activate Flickerform's ability?
> Cards involved: [[Raptor Companion]], [[Spirespine]], [[Flickerform]].
> RulesGuru source: https://rulesguru.org/?604RGBwnIIIjOsjnSMxGG

**Expected verdict:** Flickerform exiles the creature and all the Auras attached to it. In exile Flickerform is no longer attached to Spirespine, so it stops being an Aura. ([701.3d], [702.103a], [702.103f]). At the end of the turn, Flickerform's ability will return Spirespine and all cards that were attached to it to the battlefield. Flickerform's ability will return Spirespine as a creature. (603.7c, 303.4h)

**Required reasoning:**
- Match the RulesGuru cited answer for question 604.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [303.4h], [603.7c], [701.3d], [702.103a], [702.103f]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Auras, Non-evergreen keywords, Zone-changes.

## RG606. Amiyah controls Essence of the Wild and casts Copycrook. Can they have the Copycroo...

**Scenario:**
> Amiyah controls Essence of the Wild and casts Copycrook. Can they have the Copycrook enter the battlefield as a copy of Nikolas's Whiptail Wurm?
> Cards involved: [[Essence of the Wild]], [[Copycrook]], [[Whiptail Wurm]].
> RulesGuru source: https://rulesguru.org/?606RGBwnIIIgoPYPVruGG

**Expected verdict:** No. Essence of the Wild and Copycrook both have replacement effects that want to modify how Copycrook enters the battlefield. Amiyah, as the affected player, may apply them in whatever order they wishes. (616.1) Unfortunately neither order will result in Copycrook entering as a copy of Whiptail Wurm. If they applies Copycrook first, that ability will set Copycrook's copiable values to those of Whiptail Wurm. Then Essence of the Wild will set them to its own copiable values. If they applies Essence of the Wild first, that will set Copycrook's copiable values to Essence of the Wild. This will overwrite Copycrook's ability, so it will no longer apply.

**Required reasoning:**
- Match the RulesGuru cited answer for question 606.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [616.1]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Copy effects, Replacement effects.

## RG607. Alonso controls Urabrask the Hidden and casts Show and Tell. They choose to put in...

**Scenario:**
> Alonso controls Urabrask the Hidden and casts Show and Tell. They choose to put in a Marrow Chomper and devour their Urabrask the Hidden. Noemi would like to put Fusion Elemental onto the battlefield with Show and Tell. Will it enter tapped or untapped? 
> Cards involved: [[Urabrask the Hidden]], [[Show and Tell]], [[Marrow Chomper]], [[Fusion Elemental]].
> RulesGuru source: https://rulesguru.org/?607RGBwnIII3tUA0XPxpMgGG

**Expected verdict:** Fusion Elemental will enter tapped. The game will see that two creatures are entering the battlefield and will check to see if any replacement effects apply to either of them. Urabrask the Hidden will apply to Fusion Elemental causing it to enter tapped. Marrow Chomper also has a replacement effect, and at this point Alonso will choose which creature to Devour, but will not actually complete the action until the game is ready to progress forward. (614.1, 614.1c, 702.82a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 607.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [614.1], [614.1c], [702.82a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Replacement effects, Non-evergreen keywords.

## RG608. Nico controls Compost. Arthur controls Witch's Familiar and a token that was create...

**Scenario:**
> Nico controls Compost. Arthur controls Witch's Familiar and a token that was created as a copy of Yargle and Multani. Arthur casts Hour of Revelation. How many times does Compost trigger?
> Cards involved: [[Compost]], [[Witch's Familiar]], [[Yargle and Multani]], [[Hour of Revelation]].
> RulesGuru source: https://rulesguru.org/?608RGBwnIII2rxxLLXx7g1GG

**Expected verdict:** 0. Hour of Revelation destroys all permanents simultaneously. Compost's trigger checks immediately after the event in question to see if it should trigger. (603.10) However by that time Compost is in the graveyard, and its ability doesn't function there. (113.6)

(Compost doesn't fit the "leaves-the-battlefield" trigger exception because it's a "from anywhere" trigger. (603.6c))

**Required reasoning:**
- Match the RulesGuru cited answer for question 608.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [113.6], [603.6c], [603.10]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Triggered abilities, Zone-changes, Abilities, Resolving objects.

## RG610. Aspen is enchanted with Paradox Haze. During their first upkeep, they activate the...

**Scenario:**
> Aspen is enchanted with Paradox Haze. During their first upkeep, they activate the forecast ability of Plumes of Peace. Can they activate the same forecast ability during their second upkeep?
> Cards involved: [[Paradox Haze]], [[Plumes of Peace]].
> RulesGuru source: https://rulesguru.org/?610RGBwnIII23dsiyGG

**Expected verdict:** No. Each forecast ability can only be activated once per turn. (702.57b)

**Required reasoning:**
- Match the RulesGuru cited answer for question 610.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [702.57b]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Non-evergreen keywords, Turn structure.

## RG614. Ainsley controls a Skullbriar, the Walking Grave with 3 +1/+1 counters on it. Nikol...

**Scenario:**
> Ainsley controls a Skullbriar, the Walking Grave with 3 +1/+1 counters on it. Nikolas casts Duplicant and has it exile Skullbriar, the Walking Grave. What are Duplicant's power and toughness after the imprint ability resolves?
> Cards involved: [[Skullbriar, the Walking Grave]], [[Duplicant]].
> RulesGuru source: https://rulesguru.org/?614RGBwnIII2c7PlsGG

**Expected verdict:** Duplicant is a 1/1. Duplicant has a non-characteristic defining ability that sets its power and toughness. (604.3a) This is applied in layer 7b, at which point Skullbriar, the Walking Grave's power and toughness is still 1/1 because power and toughness changes from counters are not applied until layer 7c. (613.4b, 613.4c)

**Required reasoning:**
- Match the RulesGuru cited answer for question 614.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [604.3a], [613.4b], [613.4c]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Layers, Continuous effects.

## RG615. Armando controls Yixlid Jailer and casts Ever After targeting Dearly Departed and M...

**Scenario:**
> Armando controls Yixlid Jailer and casts Ever After targeting Dearly Departed and Moriok Reaver. Will Moriok Reaver enter with a +1/+1 counter?
> Cards involved: [[Yixlid Jailer]], [[Ever After]], [[Dearly Departed]], [[Moriok Reaver]].
> RulesGuru source: https://rulesguru.org/?615RGBwnIII3zztcu3bgL1GG

**Expected verdict:** No. Dearly Departed has no abilities while in the graveyard.

**Required reasoning:**
- Match the RulesGuru cited answer for question 615.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: 0. Complexity: Intermediate. Tags: Abilities, Static abilities.

## RG616. Abraham casts Makeshift Mannequin targeting Servant of the Scale while they control...

**Scenario:**
> Abraham casts Makeshift Mannequin targeting Servant of the Scale while they controls a Doubling Season. How many counters does Servant of the Scale enter the battlefield with?
> Cards involved: [[Makeshift Mannequin]], [[Servant of the Scale]], [[Doubling Season]].
> RulesGuru source: https://rulesguru.org/?616RGBwnIIIisfm2EinGG

**Expected verdict:** Unclear. Servant of the Scale begins to enter the battlefield with a mannequin counter. Servant of the Scale's effect and Doubling Season's effect are both replacement effects, so they both apply to that event. However it's undefined whether "receiving a +1/+1 counter" is an event contained within "entering the battlefield" as referred to by [616.1g], so it's not clear whether Abraham has the choice of which order to apply the replacement effects in or must apply Doubling Season's first.

**Required reasoning:**
- Match the RulesGuru cited answer for question 616.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [616.1g]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Counters, Replacement effects, Zone-changes, Unsupported answers.

## RG617. Aranza controls Hardened Scales, Corpsejack Menace, and a face-down Hooded Hydra. T...

**Scenario:**
> Aranza controls Hardened Scales, Corpsejack Menace, and a face-down Hooded Hydra. They turn Hooded Hydra face-up by paying its morph cost. How many +1/+1 counters will be placed on it?
> Cards involved: [[Hardened Scales]], [[Corpsejack Menace]], [[Hooded Hydra]].
> RulesGuru source: https://rulesguru.org/?617RGBwnIIIhmlucQ5xGG

**Expected verdict:** 11 or 12, depending on how Aranza applies the effects from Hardened Scales and Corpsejack Menace. (616.1)

The replacement effect from Hooded Hydra's ability creates an event that Hardened Scales and Corpsejack Menace can apply to. Aranza is able to order these however they like. (616.1) Each effect can only be applied once. (614.5)

By applying Hardened Scales then Corpsejack Menace, Hooded Hydra will get 12 counters.
By applying Corpsejack Menace then Hardened Scales, Hooded Hydra will get 11 counters.

**Required reasoning:**
- Match the RulesGuru cited answer for question 617.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [614.5], [616.1]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Counters, Replacement effects, Morph cards, Face-down objects, Special actions.

## RG619. Nikolai controls Havoc Festival. Aimee controls Nefarious Lich and casts Lone Missi...

**Scenario:**
> Nikolai controls Havoc Festival. Aimee controls Nefarious Lich and casts Lone Missionary. What happens when Lone Missionary's trigger resolves?
> Cards involved: [[Havoc Festival]], [[Nefarious Lich]], [[Lone Missionary]].
> RulesGuru source: https://rulesguru.org/?619RGBwnIIIhoduAo4MGG

**Expected verdict:** Nothing. Aimee cannot apply Nefarious Lich's replacement effect to the life gain event, because that event can't happen. (614.17c)

**Required reasoning:**
- Match the RulesGuru cited answer for question 619.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [614.17c]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Replacement effects, Life, "Can't" effects.

## RG620. Aubrey controls Mirror Gallery and two Sakashima the Impostors. One is a copy of th...

**Scenario:**
> Aubrey controls Mirror Gallery and two Sakashima the Impostors. One is a copy of their Master of the Hunt; the other is copying a wolf token created by Master of the Hunt. They attack with all four creatures. What are the possible bands that Aubrey may declare?
> Cards involved: [[Mirror Gallery]], [[Sakashima the Impostor]], [[Master of the Hunt]].
> RulesGuru source: https://rulesguru.org/?620RGBwnIIIiK114e23GG

**Expected verdict:** No bands can be declared. The only creature on the battlefield named "Wolves of the Hunt" is the token, so it cannot declare itself as in a band with anything else. The Sakashima the Impostor with "bands with other creatures named Wolves of the Hunt" is not itself named "Wolves of the Hunt", so it cannot declare itself as in a band with the token. (702.22c)

**Required reasoning:**
- Match the RulesGuru cited answer for question 620.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [702.22c]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Intermediate. Tags: Banding, Non-evergreen keywords, Abilities, Combat, Card names, Copy effects.

## RG621. Augustine activates Restless Cottage, then enchants it with Frogify. Afterwards, th...

**Scenario:**
> Augustine activates Restless Cottage, then enchants it with Frogify. Afterwards, they cast Reality Ripple on Restless Cottage. What happens?
> Cards involved: [[Restless Cottage]], [[Frogify]], [[Reality Ripple]].
> RulesGuru source: https://rulesguru.org/?621RGBwnIIIqhcirdsaGG

**Expected verdict:** Restless Cottage's status changes to "phased out". (702.26b) Being attached to Restless Cottage, Frogify also phases out indirectly. (702.26j) Before Augustine untaps on their next turn, both permanents will phase back in. By this time, Restless Cottage's effect will have worn off, so it won't be making Restless Cottage a creature anymore. (702.26f) Frogify phases in attached to Restless Cottage, so that effect will be making Restless Cottage a creature. (702.26i) In Augustine's upkeep when state-based actions are performed, Frogify will be attached to a creature, so it remains on the battlefield.

**Required reasoning:**
- Match the RulesGuru cited answer for question 621.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [702.26b], [702.26f], [702.26i], [702.26j]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Type-changing effects, Continuous effects, Phasing, Auras, Evergreen keywords.

## RG622. Avery controls a Germ token that's equipped with Saddle of the Cavalier. Nia contro...

**Scenario:**
> Avery controls a Germ token that's equipped with Saddle of the Cavalier. Nia controls two Teferi's Curses, one on the Germ, the other on the Saddle of the Cavalier. During Avery's untap step, which permanents will phase out? Which of these will phase back in?
> Cards involved: [[Saddle of the Cavalier]], [[Teferi's Curse]].
> RulesGuru source: https://rulesguru.org/?622RGBwnIII2C9niCGG

**Expected verdict:** All 4 permanents will phase out and phase back in in Ari's next untap step. Saddle of the Cavalier and both Teferi's Curses will still be attached to the permanents they were attached to previously. Phasing doesn't cause tokens to cease to exist or unattach permanents from other permanents. (702.26d)

**Required reasoning:**
- Match the RulesGuru cited answer for question 622.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [702.26d]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Non-evergreen keywords.

## RG625. Aubrey attacks with Pristine Angel. While it's tapped, Naomi activates Cephalid Sni...

**Scenario:**
> Aubrey attacks with Pristine Angel. While it's tapped, Naomi activates Cephalid Snitch's ability targeting Pristine Angel. After that resolves, Aubrey casts a spell and untaps Pristine Angel. Can Naomi now target the Pristine Angel with Dragon's Prey?
> Cards involved: [[Pristine Angel]], [[Cephalid Snitch]], [[Dragon's Prey]].
> RulesGuru source: https://rulesguru.org/?625RGBwnIIIjAmircrQGG

**Expected verdict:** Yes. "Protection from all colors" is shorthand for protection from each color individually. (702.16h) It loses protection from black, and still has protection from all the other colors.

(The timestamp of Pristine Angel's ability does not change when it becomes untapped. (613.7a))

**Required reasoning:**
- Match the RulesGuru cited answer for question 625.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [613.7a], [702.16h]

**Why this test matters:** Imported RulesGuru benchmark. Level: Corner Case. Complexity: Simple. Tags: Continuous effects, Evergreen keywords, Abilities.

## RG629. Ainsley manifests Trystan, Callous Cultivator with Disturbing Mirth. Nala casts Moo...

**Scenario:**
> Ainsley manifests Trystan, Callous Cultivator with Disturbing Mirth. Nala casts Moonmist and in response, Ainsley activates Imagecrafter to turn the face-down Trystan, Callous Cultivator into a Human. Does Trystan, Callous Cultivator or Imagecrafter transform when Moonmist resolves?
> Cards involved: [[Trystan, Callous Cultivator]], [[Disturbing Mirth]], [[Moonmist]], [[Imagecrafter]].
> RulesGuru source: https://rulesguru.org/?629RGBwnIII6OXEX8NuQqZGG

**Expected verdict:** No. 

Face-down double-faced permanents can't transform. (712.15a) Imagecrafter will not transform because that creature is not double-faced. (712.9)

**Required reasoning:**
- Match the RulesGuru cited answer for question 629.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [712.9], [712.15a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Intermediate. Tags: Transform, Double-faced cards.

## RG633. Amelie controls Highland Forest and Conversion. Amelie then casts Blood Moon. After...

**Scenario:**
> Amelie controls Highland Forest and Conversion. Amelie then casts Blood Moon. After that resolves, what color(s) of mana can Highland Forest tap for?
> Cards involved: [[Highland Forest]], [[Conversion]], [[Blood Moon]].
> RulesGuru source: https://rulesguru.org/?633RGBwnIIInBesrcPaGG

**Expected verdict:** Only {R}. Both Blood Moon and Conversion only apply in layer 4. (613.1d) The effects are applied in timestamp order, resulting in Conversion applying first to make Highland Forest a Plains, then Blood Moon applies making it a Mountain. (613.7)

**Required reasoning:**
- Match the RulesGuru cited answer for question 633.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [613.1d], [613.7]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Layers, Continuous effects, Type-changing effects.

## RG636. Nicolas and Nico are playing Two-Headed Giant, and each controls their own copy of...

**Scenario:**
> Nicolas and Nico are playing Two-Headed Giant, and each controls their own copy of Oloro, Ageless Ascetic. Antoine controls Wall of Shards, and on their next upkeep they put the third age counter on it. Can Antoine have Nicolas gain one life and Nico gain two? If so, how many triggered abilities of Oloro, Ageless Ascetic will be put on the stack?
> Cards involved: [[Oloro, Ageless Ascetic]], [[Wall of Shards]].
> RulesGuru source: https://rulesguru.org/?636RGBwnIII22jQHwGG

**Expected verdict:** Paying Wall of Shards' cumulative upkeep involves the choice of an opponent. The choice for each age counter is made individually, then the whole cost is paid at once. (702.24a) This means Antoine can make the stated choice, and the result of this is Nicolas gains one life and Nico gains two life. Because of this, each player's Oloro, Ageless Ascetic will trigger separately, causing two instances of the triggered ability to be put on the stack. Although the players share a life total, gaining life happens to each player individually. (810.9)

**Required reasoning:**
- Match the RulesGuru cited answer for question 636.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [702.24a], [810.9]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Triggered abilities, Two-Headed Giant, Costs, Multiplayer, Non-evergreen keywords.

## RG637. Ariel casts Living Death while they control Immortal Coil and Dreg Reaver. The only...

**Scenario:**
> Ariel casts Living Death while they control Immortal Coil and Dreg Reaver. The only card in their graveyard is a Blanchwood Treefolk. Does Ariel lose the game? If so, could they avoid this by countering Immortal Coil's trigger with Disallow?
> Cards involved: [[Living Death]], [[Immortal Coil]], [[Dreg Reaver]], [[Blanchwood Treefolk]], [[Disallow]].
> RulesGuru source: https://rulesguru.org/?637RGBwnIIIrwasucu0ZAYkgGG

**Expected verdict:** Ariel will lose the game unless they castDisallow. The first step in Living Death's resolution is to exile all creature cards from graveyards. At this point, Immortal Coil will trigger because Ariel has no cards in their graveyard. (603.8) Although sacrificing Dreg Reaver will ultimately put a creature card there before this trigger is put on the stack, it still will go on the stack and resolve. (603.3). Immortal Coil has a state trigger, therefore, there will only be one instance of this triggered ability on the stack. (603.8) After Living Death resolves, Ariel can Disallow Immortal Coil's ability and it won't be put on the stack again because they now have cards in their graveyard.

**Required reasoning:**
- Match the RulesGuru cited answer for question 637.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [603.3], [603.8]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Intermediate. Tags: Triggered abilities, Resolving objects.

## RG642. Avery casts Animate Dead targeting Devout Lightcaster in their graveyard. What happ...

**Scenario:**
> Avery casts Animate Dead targeting Devout Lightcaster in their graveyard. What happens?
> Cards involved: [[Animate Dead]], [[Devout Lightcaster]].
> RulesGuru source: https://rulesguru.org/?642RGBwnIII1v8fBcGG

**Expected verdict:** Both permanents end up in the graveyard.

Devout Lightcaster's protection ability doesn't function in the graveyard (113.6), so it's a legal target for Animate Dead. As Animate Dead's trigger resolves, first Animate Dead's enchant ability changes to "enchant creature put onto the battlefield with Animate Dead". Then Devout Lightcaster is returned to the battlefield. At this point the next instruction is to attach Animate Dead to Devout Lightcaster, but this is illegal to do because now that it's on the battlefield, Devout Lightcaster's protection ability is active. (702.16c, 303.4j)

After the triggered ability from Animate Dead has finished resolving, the game will check state-based actions and see that Animate Dead is an Aura that isn't enchanting anything, so it's put into its owner's graveyard. (704.5m). This causes Animate Dead's leaves-the-battlefield ability to trigger, sacrificing Devout Lightcaster.

**Required reasoning:**
- Match the RulesGuru cited answer for question 642.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [113.6], [303.4j], [702.16c], [704.5m]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: State-based actions, Triggered abilities, Evergreen keywords, Auras.

## RG646. Axton controls Cloudseeder equipped with Spy Kit. Axton activates Cloudseeder's abi...

**Scenario:**
> Axton controls Cloudseeder equipped with Spy Kit. Axton activates Cloudseeder's ability to create a token. Nico casts Bile Blight targeting the token. Does Cloudseeder die?
> Cards involved: [[Cloudseeder]], [[Spy Kit]], [[Bile Blight]].
> RulesGuru source: https://rulesguru.org/?646RGBwnIIIfobqtjEQGG

**Expected verdict:** Yes. Tokens aren't cards, but Cloud Sprite is a card, so Cloudseeder has that name (612.7) and Bile Blight affects it. (201.2b)

**Required reasoning:**
- Match the RulesGuru cited answer for question 646.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [201.2b], [612.7]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Card names, Tokens.

## RG647. Addison controls Sylvan Library, and Nico controls two Chains of Mephistopheles. Ad...

**Scenario:**
> Addison controls Sylvan Library, and Nico controls two Chains of Mephistopheles. Addison begins their turn empty handed and wants to use Sylvan Library's ability. What happens?
> Cards involved: [[Sylvan Library]], [[Chains of Mephistopheles]].
> RulesGuru source: https://rulesguru.org/?647RGBwnIII2fUSDeGG

**Expected verdict:** Addison draws a card for their turn, then then they go to draw for Sylvan Library. Chains of Mephistopheles's replacement effect will apply causing Addison to discard a card, and draw a card. However, at this point the second Chains of Mephistopheles will apply, Addison doesn't have any cards to discard, so instead they will mill a card. Addison will then go to draw their second card from Sylvan Library. Chains of Mephistopheles will replace this with they milling another card. (614.1a) Because they haven't actually drawn any cards from Sylvan Library, they won't need to pay four life.

**Required reasoning:**
- Match the RulesGuru cited answer for question 647.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [614.1a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Intermediate. Tags: Replacement effects, Drawing a card.

## RG650. Ariel controls Enduring Renewal and Keranos, God of Storms. During their upkeep Ari...

**Scenario:**
> Ariel controls Enduring Renewal and Keranos, God of Storms. During their upkeep Ariel activates Sindbad. What happens?
> Cards involved: [[Enduring Renewal]], [[Keranos, God of Storms]], [[Sindbad]].
> RulesGuru source: https://rulesguru.org/?650RGBwnIIIgkEfak7jGG

**Expected verdict:** During the resolution of Sindbad's ability, Ariel draws a card, and Enduring Renewal replaces this draw.

Sindbad's discard effect never happens, as the original event is replaced. (614.6)

If the first revealed card is a "Creature", that card is put into the graveyard through Enduring Renewal's effect, and that card never enters Ariel's hand. Keranos, God of Storms does not trigger, since the card is not drawn.

If the first revealed card is a "Land", Ariel draws that card through Enduring Renewal's effect, and triggers Keranos, God of Storms. Ariel then will attempt to draw an additional card, but must go through Enduring Renewal's replacement effect again.

If the first revealed card is neither a "Creature" nor a "Land", Ariel draws the card and triggers Keranos, God of Storms. When they next gain priority, they put the 3 damage to any target trigger onto the stack.

**Required reasoning:**
- Match the RulesGuru cited answer for question 650.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [614.6]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Complicated. Tags: Replacement effects, Drawing a card, Abilities.

## RG652. Aspen controls Cosi's Trickster and casts Waking Nightmare, targeting Nancy. They d...

**Scenario:**
> Aspen controls Cosi's Trickster and casts Waking Nightmare, targeting Nancy. They discard 2 Legacy Weapon. How many times does Cosi's Trickster trigger?
> Cards involved: [[Cosi's Trickster]], [[Waking Nightmare]], [[Legacy Weapon]].
> RulesGuru source: https://rulesguru.org/?652RGBwnIIIfvW8MTuiGG

**Expected verdict:** Twice. Both Legacy Weapons are discarded at the same time, so both are shuffled into Nancy's library at the same time. However both shuffles still occurred (701.24f), so Cosi's Trickster triggers twice.

**Required reasoning:**
- Match the RulesGuru cited answer for question 652.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [701.24f]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Replacement effects, Evergreen keywords, Libraries, Triggered abilities, Zone-changes.

## RG653. Avalyn controls Ashes of the Fallen (naming "Human") and casts Rise from the Grave...

**Scenario:**
> Avalyn controls Ashes of the Fallen (naming "Human") and casts Rise from the Grave targeting Dearly Departed in their graveyard. Does it enter the battlefield with a +1/+1 counter?
> Cards involved: [[Ashes of the Fallen]], [[Rise from the Grave]], [[Dearly Departed]].
> RulesGuru source: https://rulesguru.org/?653RGBwnIIIeuiUj88HGG

**Expected verdict:** No. The game state is evaluated immediately before the event in question to determine which replacement effects might apply to that event. (614.4) Dearly Departed is in the graveyard at that time, so its effect can apply. However, to determine which replacement effects apply as a permanent enters the battlefield, the game looks at the permanent as it would exist on the battlefield. (614.12) On the battlefield Dearly Departed would not be a Human, so its effect doesn't apply to itself.

**Required reasoning:**
- Match the RulesGuru cited answer for question 653.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [614.4], [614.12]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Zone-changes, Replacement effects, Type-changing effects.

## RG655. Athena wants to cast Fiery Confluence. They want to choose the second mode 3 times...

**Scenario:**
> Athena wants to cast Fiery Confluence. They want to choose the second mode 3 times to deal 2 damage to each of the 3 Planeswalkers Nico controls. Can they do that?
> 
> 
> Cards involved: [[Fiery Confluence]].
> RulesGuru source: https://rulesguru.org/?655RGBwnIIIb49GG

**Expected verdict:** No, Fiery Confluence can only deal damage to players, not Planeswalkers. That means that Nico is the only target available. The rules for dealing noncombat damage to planeswalkers have been updated. (306.7)

**Required reasoning:**
- Match the RulesGuru cited answer for question 655.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [306.7]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Planeswalkers, Damage.

## RG658. Azariah controls two Merfolk Secretkeepers and Omnath, Locus of Mana and has 6 {G}...

**Scenario:**
> Azariah controls two Merfolk Secretkeepers and Omnath, Locus of Mana and has 6 {G} in their mana pool. Nico controls Sphere of Safety and casts Master Warcraft. Which creatures can Nico legally declare as attackers?
> Cards involved: [[Merfolk Secretkeeper]], [[Omnath, Locus of Mana]], [[Sphere of Safety]], [[Master Warcraft]].
> RulesGuru source: https://rulesguru.org/?658RGBwnIII2YvHf4wai6hGG

**Expected verdict:** Nico may choose any of Azariah's creatures as attackers, however after this selection is made it's Azariah's choice whether they want to pay the mana to attack. Nico only chooses which creatures attack, and those choices must be legal. (508.1a) Then the game checks to see if any creatures have any costs associated with attacking. Azariah doesn't have to pay the cost (508.1d), in which case that creature can't attack.

**Required reasoning:**
- Match the RulesGuru cited answer for question 658.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [508.1a], [508.1d]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Combat, Costs, Mana.

## RG659. Augustus controls Back from the Brink and has Phyrexian Marauder in their graveyard...

**Scenario:**
> Augustus controls Back from the Brink and has Phyrexian Marauder in their graveyard. Can Augustus activate Back from the Brink's ability to create a token of Phyrexian Marauder? Can they pay more than {0} to do so? If so, will it enter the battlefield with any +1/+1 counters?
> Cards involved: [[Back from the Brink]], [[Phyrexian Marauder]].
> RulesGuru source: https://rulesguru.org/?659RGBwnIII1wEo0FGG

**Expected verdict:** Augustus may activate the ability of Phyrexian Marauder paying {0}. He does not have the ability to pay more than {0}. (107.3h) The token will not enter the battlefield with any +1/+1 counters.

**Required reasoning:**
- Match the RulesGuru cited answer for question 659.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [107.3h]

**Why this test matters:** Imported RulesGuru benchmark. Level: Corner Case. Complexity: Simple. Tags: Costs, Counters, Activated abilities, Numbers and symbols.

## RG660. Alex controls Qarsi Deceiver and a face-down Whipcorder. Nola controls Exiled Dooms...

**Scenario:**
> Alex controls Qarsi Deceiver and a face-down Whipcorder. Nola controls Exiled Doomsayer. Can Alex spend mana produced by Qarsi Deceiver to pay part of the cost to turn Whipcorder face up?
> Cards involved: [[Qarsi Deceiver]], [[Whipcorder]], [[Exiled Doomsayer]].
> RulesGuru source: https://rulesguru.org/?660RGBwnIIIjFQYOjT3GG

**Expected verdict:** Yes. Exiled Doomsayer doesn't impose an additional cost, it increases the existing morph cost by {2}. (Additional costs only apply to spells and activated abilities (118.8), not to special actions like turning a face-down permanent face up. (116.2b, 702.37e))

**Required reasoning:**
- Match the RulesGuru cited answer for question 660.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [116.2b], [118.8], [702.37e]

**Why this test matters:** Imported RulesGuru benchmark. Level: Corner Case. Complexity: Simple. Tags: Costs, Face-down objects, Special actions.

## RG661. Aspen casts False Dawn. After it resolves, they tap a Snow-Covered Island for mana....

**Scenario:**
> Aspen casts False Dawn. After it resolves, they tap a Snow-Covered Island for mana. What color of mana does it produce?
> Cards involved: [[False Dawn]], [[Snow-Covered Island]].
> RulesGuru source: https://rulesguru.org/?661RGBwnIII1KzH9jGG

**Expected verdict:** {W}. Snow-Covered Island's ability to add mana is controlled by Aspen. (109.4a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 661.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [109.4a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Mana, Mana abilities, The stack, Replacement effects.

## RG662. Nickolas controls Phyrexian Revoker that named Channel. Alexandra casts Channel. Ca...

**Scenario:**
> Nickolas controls Phyrexian Revoker that named Channel. Alexandra casts Channel. Can Alexandra pay 1 life to add {C}?
> Cards involved: [[Phyrexian Revoker]], [[Channel]].
> RulesGuru source: https://rulesguru.org/?662RGBwnIII23YAZHGG

**Expected verdict:** Yes. Channel allows Alexandra to take a special action to add mana. (116.2c) It is not an activated ability (113.3b/602.1) nor a mana ability. (605.1)

**Required reasoning:**
- Match the RulesGuru cited answer for question 662.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [113.3b], [116.2c], [602.1], [605.1]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Mana, Mana abilities, Special actions, Card names, Activated abilities.

## RG664. Nehemiah casts Word of Command targeting Amelia. As it resolves, Nehemiah has Ameli...

**Scenario:**
> Nehemiah casts Word of Command targeting Amelia. As it resolves, Nehemiah has Amelia cast Shahrazad. Does Nehemiah control Amelia in the subgame?
> Cards involved: [[Word of Command]], [[Shahrazad]].
> RulesGuru source: https://rulesguru.org/?664RGBwnIII2naj7wGG

**Expected verdict:** No. Nehemiah controls Amelia while the Shahrazad is resolving, but only in the main game. That effect does not carry over to the subgame. (728.1b)

**Required reasoning:**
- Match the RulesGuru cited answer for question 664.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: Corner Case. Complexity: Intermediate. Tags: Control-changing effects.

## RG665. Amos controls Celestial Dawn. If they exile a Yoked Ox with Stolen Strategy, can th...

**Scenario:**
> Amos controls Celestial Dawn. If they exile a Yoked Ox with Stolen Strategy, can they cast it by spending {B}?
> Cards involved: [[Celestial Dawn]], [[Yoked Ox]], [[Stolen Strategy]].
> RulesGuru source: https://rulesguru.org/?665RGBwnIIIfcWLsOAlGG

**Expected verdict:** No. Both "as though" effects apply. (609.4) Amos may spend black mana as though it were mana of any color, and also must spend it as though it were colorless.

**Required reasoning:**
- Match the RulesGuru cited answer for question 665.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [609.4]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Mana, Continuous effects, Casting spells, Costs.

## RG666. Ann taps Undiscovered Paradise for mana while Niko controls Vorinclex, Voice of Hun...

**Scenario:**
> Ann taps Undiscovered Paradise for mana while Niko controls Vorinclex, Voice of Hunger. During Ann's next untap step, will Undiscovered Paradise return to their hand?
> Cards involved: [[Undiscovered Paradise]], [[Vorinclex, Voice of Hunger]].
> RulesGuru source: https://rulesguru.org/?666RGBwnIII2ju96qGG

**Expected verdict:** Yes. Undiscovered Paradise returns to its owner's hand during the turn-based action of untapping permanents. It doesn't matter if Undiscovered Paradise itself would untap.

**Required reasoning:**
- Match the RulesGuru cited answer for question 666.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Continuous effects, Turn structure, Turn-based actions.

## RG667. Aliana controls Huntmaster of the Fells enchanted by Infinite Reflection. Aliana al...

**Scenario:**
> Aliana controls Huntmaster of the Fells enchanted by Infinite Reflection. Aliana also controls a Bloodline Keeper which is currently a copy of Huntmaster of the Fells. Aliana casts Waxing Moon targeting Bloodline Keeper. What happens?
> Cards involved: [[Huntmaster of the Fells]], [[Infinite Reflection]], [[Bloodline Keeper]], [[Waxing Moon]].
> RulesGuru source: https://rulesguru.org/?667RGBwnIII2NVfbkJmYB0GG

**Expected verdict:** Bloodline Keeper transforms. (701.27) Bloodline Keeper's back face remains a copy of Huntmaster of the Fells. (707.2b, 707.8, 712.18) Bloodline Keeper's trigger that triggers "whenever it transforms into Huntmaster of the Fells" triggers. (701.27e)

**Required reasoning:**
- Match the RulesGuru cited answer for question 667.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [701.27], [701.27e], [707.2b], [707.8], [712.18]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Double-faced cards, Copy effects, Triggered abilities, Card names.

## RG668. Albert controls Hawkeater Moth and a Hieromancer's Cage that exiled Nico's Muzzle....

**Scenario:**
> Albert controls Hawkeater Moth and a Hieromancer's Cage that exiled Nico's Muzzle. Nico casts Ray of Revelation targeting Hieromancer's Cage. What happens as the Muzzle returns to the battlefield?
> Cards involved: [[Hawkeater Moth]], [[Hieromancer's Cage]], [[Muzzle]], [[Ray of Revelation]].
> RulesGuru source: https://rulesguru.org/?668RGBwnIII2LU9nBacDHaGG

**Expected verdict:** It enchants Hawkeater Moth. Auras entering the battlefield from a zone other than the stack must enchant a legal object. (303.4f) It doesn't target anything, so shroud doesn't matter. (702.18a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 668.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [303.4f], [702.18a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Auras, Zone-changes, Targets, Non-evergreen keywords.

## RG669. Aryanna activates Gliding Licid targeting Nico's Soul Sculptor. Before that resolve...

**Scenario:**
> Aryanna activates Gliding Licid targeting Nico's Soul Sculptor. Before that resolves, Nico activates Soul Sculptor targeting Gliding Licid. When Aryanna next gets priority, they pays {U} to end the effect. What happens?
> Cards involved: [[Gliding Licid]], [[Soul Sculptor]].
> RulesGuru source: https://rulesguru.org/?669RGBwnIII1NPvzUGG

**Expected verdict:** This can't happen as described, Aryanna cannot pay {U} to end the effect until after Gliding Licid's ability resolves.

**Required reasoning:**
- Match the RulesGuru cited answer for question 669.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Layers, Continuous effects, Special actions, The stack, Type-changing effects.

## RG670. Aaliyah turns their Mirage Mirror into a copy of Old Man of the Sea and takes contr...

**Scenario:**
> Aaliyah turns their Mirage Mirror into a copy of Old Man of the Sea and takes control of Nico's Valiant Guard. At the end of the turn when Mirage Mirror stops being a copy of Old Man of the Sea, will Valiant Guard return to Nico's control?
> Cards involved: [[Mirage Mirror]], [[Old Man of the Sea]], [[Valiant Guard]].
> RulesGuru source: https://rulesguru.org/?670RGBwnIIIiJmlesn1GG

**Expected verdict:** No. Mirage Mirror has no power, so the game uses 0 instead. (107.2) Valiant Guard's power is still less than or equal to 0, so the control-changing effect doesn't end.

**Required reasoning:**
- Match the RulesGuru cited answer for question 670.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [107.2]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Control-changing effects, Copy effects, Numbers and symbols.

## RG673. Andre controls Paladin of Atonement with 3 +1/+1 counters on it. They attacks with...

**Scenario:**
> Andre controls Paladin of Atonement with 3 +1/+1 counters on it. They attacks with it and Nola blocks with Bogstomper. How much life does Andre gain?
> Cards involved: [[Paladin of Atonement]], [[Bogstomper]].
> RulesGuru source: https://rulesguru.org/?673RGBwnIII2380bkGG

**Expected verdict:** 4. Even though it's a 1/1 in the graveyard, the game cares about its toughness when it was last on the battlefield. (603.10a, 608.2h) Damage from Bogstomper didn't reduce Paladin of Atonement's toughness, it just caused that much damage to be marked on it, which caused it to die. (120.3e)

**Required reasoning:**
- Match the RulesGuru cited answer for question 673.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [120.3e], [603.10a], [608.2h]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: none.

## RG674. In a multiplayer game with a default turn order of Alexis-Beverly-Colette, Alexis c...

**Scenario:**
> In a multiplayer game with a default turn order of Alexis-Beverly-Colette, Alexis casts Emrakul, the Promised End and targets Colette. After that resolves, Colette activates Mindslaver and targets Beverly. What is the turn order and who controls whom after Alexis ends their turn?
> Cards involved: [[Emrakul, the Promised End]], [[Mindslaver]].
> RulesGuru source: https://rulesguru.org/?674RGBwnIII1JlWdnGG

**Expected verdict:** The turn order would be Beverly controlled by Colette followed by Colette's turn controlled by Alexis, then Colette taking their extra turn controlling themselves before returning to Alexis's turn again.

**Required reasoning:**
- Match the RulesGuru cited answer for question 674.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Multiplayer, Control-changing effects, Turn structure.

## RG675. Ari plays Dryad Arbor. Nova controls Uphill Battle. Does the Dryad Arbor enter the...

**Scenario:**
> Ari plays Dryad Arbor. Nova controls Uphill Battle. Does the Dryad Arbor enter the battlefield tapped?
> Cards involved: [[Dryad Arbor]], [[Uphill Battle]].
> RulesGuru source: https://rulesguru.org/?675RGBwnIII1HhrSfGG

**Expected verdict:** Yes. (701.18b)

**Required reasoning:**
- Match the RulesGuru cited answer for question 675.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [701.18b]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Lands, Special actions.

## RG679. Nico controls Blind Obedience. Aydan's devotion to black is 0 and they cast Erebos,...

**Scenario:**
> Nico controls Blind Obedience. Aydan's devotion to black is 0 and they cast Erebos, God of the Dead. Does it enter the battlefield tapped or untapped?
> Cards involved: [[Blind Obedience]], [[Erebos, God of the Dead]].
> RulesGuru source: https://rulesguru.org/?679RGBwnIII1xYXnEGG

**Expected verdict:** Untapped. To determine what replacement effects apply to a permanent as it enters the battlefield, the game looks at the permanent as it would exist on the battlefield. (614.12) On the battlefield Erebos, God of the Dead would not be a creature, so Blind Obedience's effect will not apply to it.

**Required reasoning:**
- Match the RulesGuru cited answer for question 679.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [614.12]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Replacement effects, Non-evergreen keywords, Zone-changes, Continuous effects, Type-changing effects.

## RG680. Anabelle controls Bronze Sable. They cast Genesis Wave, putting Phylactery Lich and...

**Scenario:**
> Anabelle controls Bronze Sable. They cast Genesis Wave, putting Phylactery Lich and Solemnity onto the battlefield. Does Bronze Sable get a phylactery counter?
> Cards involved: [[Bronze Sable]], [[Genesis Wave]], [[Phylactery Lich]], [[Solemnity]].
> RulesGuru source: https://rulesguru.org/?680RGBwnIII2nBuHuJFxV6GG

**Expected verdict:** Yes. Phylactery Lich and Solemnity enter the battlefield at the same time. Solemnity's effect must exist before Phylactery Lich enters the battlefield in order to prevent Bronze Sable from getting a counter. (614.17a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 680.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [614.17a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Replacement effects, "Can't" effects, Zone-changes, Counters.

## RG681. Amir controls a Suncleanser that targeted Venser's Sliver when it entered the battl...

**Scenario:**
> Amir controls a Suncleanser that targeted Venser's Sliver when it entered the battlefield. Amir casts Rally the Ancestors, putting Phylactery Lich and Skullmulcher onto the battlefield. Can they choose to sacrifice Suncleanser to the Skullmulcher and put a phylactery counter on Venser's Sliver?
> Cards involved: [[Suncleanser]], [[Venser's Sliver]], [[Rally the Ancestors]], [[Phylactery Lich]], [[Skullmulcher]].
> RulesGuru source: https://rulesguru.org/?681RGBwnIIIvY517jYs2alBmGG

**Expected verdict:** No. Phylactery Lich and Skullmulcher enter the battlefield at the same time. Even if Amir chooses to sacrifice Suncleanser as Skullmulcher enters, its effect existed immediately before the Phylactery Lich entered the battlefield, so Venser's Sliver can't have the counter placed on it. (614.17a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 681.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [614.17a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Intermediate. Tags: Replacement effects, "Can't" effects, Zone-changes, Counters.

## RG682. Ayden controls Tatterkite. Ayden casts Genesis Wave, putting Phylactery Lich and Hu...

**Scenario:**
> Ayden controls Tatterkite. Ayden casts Genesis Wave, putting Phylactery Lich and Humility onto the battlefield. Can they put a phylactery counter on Tatterkite?
> Cards involved: [[Tatterkite]], [[Genesis Wave]], [[Phylactery Lich]], [[Humility]].
> RulesGuru source: https://rulesguru.org/?682RGBwnIII3oQqKLgN41yGG

**Expected verdict:** No. Phylactery Lich and Humility enter the battlefield at the same time. Tatterkite had the ability that prevents it from getting counters immediately before Phylactery Lich entered the battlefield, which is when it matters. (614.17a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 682.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [614.17a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Replacement effects, "Can't" effects, Zone-changes, Counters.

## RG683. Arthur casts Assassin's Trophy targeting Nico's Leonin Arbiter. Assuming Nico can't...

**Scenario:**
> Arthur casts Assassin's Trophy targeting Nico's Leonin Arbiter. Assuming Nico can't pay {2}, will they get to search their library? 
> Cards involved: [[Assassin's Trophy]], [[Leonin Arbiter]].
> RulesGuru source: https://rulesguru.org/?683RGBwnIII1w33sgGG

**Expected verdict:** Yes, Nico does get to search their library. Assassin's Trophy will resolve in the order written on the card (608.2c), so first Leonin Arbiter is removed and its effect stops existing (611.3b) and then Nico will search their library for a basic land.

**Required reasoning:**
- Match the RulesGuru cited answer for question 683.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [608.2c], [611.3b]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: "Can't" effects, Resolving objects, Special actions.

## RG685. Aydin controls Slimefoot, the Stowaway and a 1/1 Saproling token. Aydin casts Deafe...

**Scenario:**
> Aydin controls Slimefoot, the Stowaway and a 1/1 Saproling token. Aydin casts Deafening Clarion choosing both modes. How much life does Aydin gain?
> Cards involved: [[Slimefoot, the Stowaway]], [[Deafening Clarion]].
> RulesGuru source: https://rulesguru.org/?685RGBwnIII2csopSGG

**Expected verdict:** Two.

Deafening Clarion deals three damage to each creature, then gives them lifelink. (608.2c) After the spell has resolved, state-based actions are checked and both creatures die. (120.5/704.5g) Slimefoot, the Stowaway's ability is a leave-the-battlefield trigger, so it sees that it existed immediately before Slimefoot, the Stowaway died and therefore triggers. (603.10, 603.10a) When it resolves, it sees that Slimefoot, the Stowaway had lifelink right before it died, so Aydin gains 1 life from the damage that's dealt to Natasha. (113.7a/702.15c)

**Required reasoning:**
- Match the RulesGuru cited answer for question 685.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [113.7a], [120.5], [603.10], [603.10a], [608.2c], [702.15c], [704.5g]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Intermediate. Tags: Triggered abilities, Last known information, Zone-changes.

## RG686. Aiyana attacks with a face-down Progenitus and Nico blocks with Besotted Knight. Wh...

**Scenario:**
> Aiyana attacks with a face-down Progenitus and Nico blocks with Besotted Knight. Where does Progenitus move?
> Cards involved: [[Progenitus]], [[Besotted Knight]].
> RulesGuru source: https://rulesguru.org/?686RGBwnIII251arrGG

**Expected verdict:** The graveyard. Replacement effects must exist before the event in question in order to affect it. (614.4) Progenitus had no abilities when it was on the battlefield (708.2), so there is no replacement effect that would apply to it moving to the graveyard.

**Required reasoning:**
- Match the RulesGuru cited answer for question 686.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [614.4], [708.2]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Replacement effects, Zone-changes, Face-down objects.

## RG688. Aldo controls 6 1/1 white Soldier tokens. Aldo casts Venerated Loxodon and would li...

**Scenario:**
> Aldo controls 6 1/1 white Soldier tokens. Aldo casts Venerated Loxodon and would like to tap all of their soldiers to pay for it. Can they do this?
> Cards involved: [[Venerated Loxodon]].
> RulesGuru source: https://rulesguru.org/?688RGBwnIIIeEKGG

**Expected verdict:** No, Aldo cannot tap more creatures than is necessary to pay for Venerated Loxodon. When casting a spell a player must pay the total cost of the spell, but cannot pay anything that the spell does not ask for. (118.3a) Convoke allows a player to tap creatures rather than pay mana for a spell, and follows the same rules for paying mana. (702.51a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 688.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [118.3a], [702.51a]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Casting spells, Costs, Non-evergreen keywords.

## RG689. Averi has no cards in their graveyard or exile and casts Beacon Bolt, targeting Nic...

**Scenario:**
> Averi has no cards in their graveyard or exile and casts Beacon Bolt, targeting Nico's Alpha Myr. Is Alpha Myr dealt 1 damage?
> Cards involved: [[Beacon Bolt]], [[Alpha Myr]].
> RulesGuru source: https://rulesguru.org/?689RGBwnIII1xhxoKGG

**Expected verdict:** No. Spells are on the stack as they resolve. They are only put into the graveyard once they finish. (608.2n)

**Required reasoning:**
- Match the RulesGuru cited answer for question 689.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [608.2n]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Resolving objects, Zone-changes.

## RG692. Anderson has 10 life and Nico has 20 life. Anderson attacks Nico with Ilharg, the R...

**Scenario:**
> Anderson has 10 life and Nico has 20 life. Anderson attacks Nico with Ilharg, the Raze-Boar and puts in Scourge of the Throne. Will they get an extra combat phase?
> Cards involved: [[Ilharg, the Raze-Boar]], [[Scourge of the Throne]].
> RulesGuru source: https://rulesguru.org/?692RGBwnIII1SKwOCGG

**Expected verdict:** No. Scourge of the Throne has a triggered ability that occurs only when it is declared as an attacking creature. (603.1) It was put onto the battlefield attacking, which doesn't meet its trigger condition. (508.4)

**Required reasoning:**
- Match the RulesGuru cited answer for question 692.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [508.4], [603.1]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Combat, Triggered abilities.

## RG693. Autumn controls Volrath's Shapeshifter and resolves Dire Fleet Interloper. Autumn r...

**Scenario:**
> Autumn controls Volrath's Shapeshifter and resolves Dire Fleet Interloper. Autumn resolves the explore trigger of Dire Fleet Interloper choosing to move Nicanzil, Current Conductor from the library to the graveyard. Does Volrath's Shapeshifter, now with the text of Nicanzil, Current Conductor, trigger from the exploring of Dire Fleet Interloper?
> Cards involved: [[Volrath's Shapeshifter]], [[Dire Fleet Interloper]], [[Nicanzil, Current Conductor]].
> RulesGuru source: https://rulesguru.org/?693RGBwnIIImcrMJP1hGG

**Expected verdict:** Yes. 

First, as part of resolving the explore trigger, Volrath's Shapeshifter gains the text of Nicanzil, Current Conductor. Then, since a permanent "explores" only after the process for exploring is complete (701.44b), Volrath's Shapeshifter's new trigger condition from the text of Nicanzil, Current Conductor exists before the trigger condition is met.

**Required reasoning:**
- Match the RulesGuru cited answer for question 693.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [701.44b]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Triggered abilities, Zone-changes.

## RG694. Arianna casts Discovery // Dispersal and puts Blood Operative into their graveyard...

**Scenario:**
> Arianna casts Discovery // Dispersal and puts Blood Operative into their graveyard while surveilling. Does Arianna have the option to pay 3 life for Blood Operative's ability?
> Cards involved: [[Discovery // Dispersal]], [[Blood Operative]].
> RulesGuru source: https://rulesguru.org/?694RGBwnIII2nW5u4GG

**Expected verdict:** Yes. Objects that exist immediately after an event are checked to see if they match any trigger conditions. (603.10) Blood Operative was in the graveyard after the surveil event, so the game checks to see if Blood Operative has any trigger conditions relating to surveil at that time.

**Required reasoning:**
- Match the RulesGuru cited answer for question 694.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [603.10]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Triggered abilities.

## RG695. Ariel controls Gran-Gran. Nicolas casts Merfolk Trickster targeting Gran-Gran. Does...

**Scenario:**
> Ariel controls Gran-Gran. Nicolas casts Merfolk Trickster targeting Gran-Gran. Does Gran-Gran's triggered ability trigger and resolve?
> Cards involved: [[Gran-Gran]], [[Merfolk Trickster]].
> RulesGuru source: https://rulesguru.org/?695RGBwnIII4upzXkGG

**Expected verdict:** Yes. Merfolk Trickster's instructions are followed in the order written. (608.2c) Gran-Gran is tapped first and it's trigger triggers. (603.2) Then Gran-Gran loses all abilities. Merfolk Trickster's ability then finishes resolving and Gran-Gran's triggered ability is placed onto the stack. (117.5/603.3) The trigger doesn't care that the permanent no longer has the ability, as it has already triggered.

**Required reasoning:**
- Match the RulesGuru cited answer for question 695.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [117.5], [603.2], [603.3], [608.2c]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Triggered abilities, Continuous effects.

## RG700. Ari controls Soulfire Grand Master and has Kozilek's Return in their graveyard. Ari...

**Scenario:**
> Ari controls Soulfire Grand Master and has Kozilek's Return in their graveyard. Ari activates Soulfire Grand Master's ability. After that resolves, Ari casts Drownyard Lurker. If Ari chooses to use Kozilek's Return's ability, how much life will Ari gain and where will Kozilek's Return be after the damage has been dealt and the stack is empty?
> Cards involved: [[Soulfire Grand Master]], [[Kozilek's Return]], [[Drownyard Lurker]].
> RulesGuru source: https://rulesguru.org/?700RGBwnIIIkWnVTEbrGG

**Expected verdict:** Ari will gain zero life, and Kozilek's Return will be in exile. The second ability on Kozilek's Return is a triggered ability. (603.1) Soulfire Grand Master only gives lifelink to instant and sorcery spells on the stack, not in the graveyard. (109.2b, 109.4) Similarly Kozilek's Return will not return to Ari's hand as its trigger resolves, since Kozilek's Return was not cast and is not on the stack.

**Required reasoning:**
- Match the RulesGuru cited answer for question 700.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [109.2b], [109.4], [603.1]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Triggered abilities, Evergreen keywords, Abilities.

## RG705. Aiyana controls Cryptolith Rite, Mentor of the Meek and Midnight Guard. Aiyana cast...

**Scenario:**
> Aiyana controls Cryptolith Rite, Mentor of the Meek and Midnight Guard. Aiyana casts Thatcher Revolt. Can Aiyana use Midnight Guard to pay for Mentor of the Meek's triggers all three times?
> Cards involved: [[Cryptolith Rite]], [[Mentor of the Meek]], [[Midnight Guard]], [[Thatcher Revolt]].
> RulesGuru source: https://rulesguru.org/?705RGBwnIII2tdZzYAAjWjGG

**Expected verdict:** Yes. When the tokens from Thatcher Revolt enter the battlefield, six triggers go on the stack, three to untap Midnight Guard and three to pay {1} and draw a card from Mentor of the Meek. Aiyana will then choose which order these triggers go on the stack. (603.3b) Aiyana chooses whether they want to pay {1} when the Mentor of the Meek triggers resolve, not when they are put onto the stack. (603.5) As long as Aiyana chooses to have an untap occur before each of the second two Mentor of the Meek triggers, they will have enough mana available.

**Required reasoning:**
- Match the RulesGuru cited answer for question 705.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [603.3b], [603.5]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Intermediate. Tags: Triggered abilities, The stack.

## RG706. Ari controls Teferi, Mage of Zhalfir and casts Hypothesizzle. After discarding a ca...

**Scenario:**
> Ari controls Teferi, Mage of Zhalfir and casts Hypothesizzle. After discarding a card but before Hypothesizzle deals four damage to a creature, Ari casts Firesong and Sunspeaker. Will Ari gain four life?
> Cards involved: [[Teferi, Mage of Zhalfir]], [[Hypothesizzle]], [[Firesong and Sunspeaker]].
> RulesGuru source: https://rulesguru.org/?706RGBwnIIIlrgE1rQEGG

**Expected verdict:** No. Hypothesizzle has a reflexive trigger. (603.12) Ari chooses to discard a card as part of the resolution of Hypothesizzle, which will cause Hypothesizzle to put a trigger on the stack after it resolves that will deal four damage to a creature. To determine whether Ari would gain life as the trigger resolves, the game checks Hypothesizzle as it last existed on the stack, at which point it did not have lifelink. (400.7, 113.7a)

(Hypothesizzle in the graveyard also doesn't have lifelink as it's not an instant or a sorcery spell (109.2b), but this doesn't matter due to the rules above.)

**Required reasoning:**
- Match the RulesGuru cited answer for question 706.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [109.2b], [113.7a], [400.7], [603.12]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Static abilities, Continuous effects, Zone-changes, Triggered abilities, Last known information, Evergreen keywords.

## RG707. Alissa casts Savage Conception. In response, Nico casts Gather Specimens. After tha...

**Scenario:**
> Alissa casts Savage Conception. In response, Nico casts Gather Specimens. After that resolves, but before Savage Conception resolves, Alissa casts Crafty Cutpurse. Who controls the token?
> Cards involved: [[Savage Conception]], [[Gather Specimens]], [[Crafty Cutpurse]].
> RulesGuru source: https://rulesguru.org/?707RGBwnIIIkhW0CnP4GG

**Expected verdict:** Nico does. Gather Specimens's effect causes the Crafty Cutpurse to enter the battlefield under Nico's control. Its effect then causes the token to be created under Nico's control.

**Required reasoning:**
- Match the RulesGuru cited answer for question 707.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Tokens, Replacement effects, Evergreen keywords, Zone-changes, Control-changing effects.

## RG708. Ashley has 3 Kalonian Tusker in their graveyard and casts Izoni, Thousand-Eyed. Aft...

**Scenario:**
> Ashley has 3 Kalonian Tusker in their graveyard and casts Izoni, Thousand-Eyed. After it enters the battlefield but before its trigger resolves, Nick activates Relic of Progenitus to exile all cards from Ashley's graveyard. When Izoni, Thousand-Eyed's ability resolves, how many tokens will be created?
> Cards involved: [[Kalonian Tusker]], [[Izoni, Thousand-Eyed]], [[Relic of Progenitus]].
> RulesGuru source: https://rulesguru.org/?708RGBwnIIIhXqN0xOpGG

**Expected verdict:** 0. The number of tokens to create is determined when the ability resolves, by which point the graveyard has no creatures in it.

**Required reasoning:**
- Match the RulesGuru cited answer for question 708.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: 0. Complexity: Simple. Tags: Triggered abilities, Resolving objects.

## RG712. Aubrey controls Illusionary Mask. Can they use it to put Dryad Arbor onto the battl...

**Scenario:**
> Aubrey controls Illusionary Mask. Can they use it to put Dryad Arbor onto the battlefield face down?
> Cards involved: [[Illusionary Mask]], [[Dryad Arbor]].
> RulesGuru source: https://rulesguru.org/?712RGBwnIII1SMJNQGG

**Expected verdict:** No. Dryad Arbor has no mana cost and therefore none of it can be paid by any amount of mana. (202.1b) Attempting to pay an unpayable cost is an illegal action. (118.6)

**Required reasoning:**
- Match the RulesGuru cited answer for question 712.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [118.6], [202.1b]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Face-down objects, Costs, Mana.

## RG713. Asa controls Library of Leng and is discarding a card due to Keldon Raider's abilit...

**Scenario:**
> Asa controls Library of Leng and is discarding a card due to Keldon Raider's ability. Can they put the discarded card on top of their library? If so, what happens?
> Cards involved: [[Library of Leng]], [[Keldon Raider]].
> RulesGuru source: https://rulesguru.org/?713RGBwnIII1WwF40GG

**Expected verdict:** Yes. Discarding a cost to the ability is a cost [118.12], but that doesn't stop it from being an effect as well. (609.1) Library of Leng only changes where the card moves to, not that it was discarded, so the cost was paid and the remainder of Keldon Raider's ability will resolve as normal.

**Required reasoning:**
- Match the RulesGuru cited answer for question 713.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [118.12], [609.1]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Costs, Resolving objects, Zone-changes, Libraries.

## RG717. Aleah controls Naban, Dean of Iteration and casts Phyrexian Ingester. Aleah exiles...

**Scenario:**
> Aleah controls Naban, Dean of Iteration and casts Phyrexian Ingester. Aleah exiles Swab Goblin and then Trained Armodon with the triggers. What are Phyrexian Ingester's power and toughness?
> Cards involved: [[Naban, Dean of Iteration]], [[Phyrexian Ingester]], [[Swab Goblin]], [[Trained Armodon]].
> RulesGuru source: https://rulesguru.org/?717RGBwnIII31f1LSaOrQSGG

**Expected verdict:** It's an 8/8.

The enter-the-battlefield ability of Phyrexian Ingester is part of a pair of linked abilities. When determining a value for Phyrexian Ingester's second ability, the sum of the powers and toughnesses from Swab Goblin and Trained Armodon is used. (607.3) This gives Phyrexian Ingester +5/+5, which makes it an 8/8.

**Required reasoning:**
- Match the RulesGuru cited answer for question 717.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [607.3]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Linked abilities, Triggered abilities.

## RG719. Armani activates Mindslaver targeting Neriah, who controls a tapped Time Vault. Can...

**Scenario:**
> Armani activates Mindslaver targeting Neriah, who controls a tapped Time Vault. Can Neriah choose to skip their next turn with Time Vault?
> Cards involved: [[Mindslaver]], [[Time Vault]].
> RulesGuru source: https://rulesguru.org/?719RGBwnIII1ZjgdHGG

**Expected verdict:** Neriah can choose to skip their turn, as skipping the turn is a replacement effect (614.1b/614.10), and the choice to replace the turn with skipping the turn must be made before the turn in question begins. (614.4) Neriah is still in control of themself at that point, since the turn has not ended yet.

**Required reasoning:**
- Match the RulesGuru cited answer for question 719.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [614.1b], [614.4], [614.10]

**Why this test matters:** Imported RulesGuru benchmark. Level: 2. Complexity: Simple. Tags: Control-changing effects, Replacement effects, Turn structure.

## RG720. Ashley is enchanted with Wheel of Sun and Moon, and casts Predict naming "Cradle Cl...

**Scenario:**
> Ashley is enchanted with Wheel of Sun and Moon, and casts Predict naming "Cradle Clearcutter (prototyped)". As Predict resolves Ashley reveals Cradle Clearcutter (prototyped) and puts it on the bottom of their library. Will Ashley get to draw two cards? 
> Cards involved: [[Wheel of Sun and Moon]], [[Predict]], [[Cradle Clearcutter (prototyped)]].
> RulesGuru source: https://rulesguru.org/?720RGBwnIIImmzVPLkoGG

**Expected verdict:** Yes. Predict doesn't care what zone the Cradle Clearcutter (prototyped) is in, only whether it's named "Cradle Clearcutter (prototyped)". It's still named "Cradle Clearcutter (prototyped)" in the library.

**Required reasoning:**
- Match the RulesGuru cited answer for question 720.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** None provided by RulesGuru.

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Replacement effects, Zone-changes.

## RG722. Ashley controls Essence of the Wild and casts Xantcha, Sleeper Agent. What happens...

**Scenario:**
> Ashley controls Essence of the Wild and casts Xantcha, Sleeper Agent. What happens as it enters the battlefield?
> Cards involved: [[Essence of the Wild]], [[Xantcha, Sleeper Agent]].
> RulesGuru source: https://rulesguru.org/?722RGBwnIII1JVlFoGG

**Expected verdict:** It enters under Nina's control and doesn't become a copy of Essence of the Wild. As it enters the battlefield, there are two replacement effects trying to apply to that event. Since Xantcha, Sleeper Agent's effect changes under whose control it would enter, it needs to be applied first. (616.1, 616.1b) Once it's been applied, it's now entering under Nina's control, and Essence of the Wild's effect doesn't apply to it.

**Required reasoning:**
- Match the RulesGuru cited answer for question 722.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [616.1], [616.1b]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Simple. Tags: Control-changing effects, Replacement effects, Zone-changes, Copy effects.

## RG725. Bruno controls Pandemonium. Aubrianna casts Riot Devils and targets Bruno's Falkenr...

**Scenario:**
> Bruno controls Pandemonium. Aubrianna casts Riot Devils and targets Bruno's Falkenrath Reaver with the Pandemonium trigger. In response Clay casts Moonrager's Slash targeting Aubrianna causing them to lose the game. Will Bruno's creature die?
> Cards involved: [[Pandemonium]], [[Riot Devils]], [[Falkenrath Reaver]], [[Moonrager's Slash]].
> RulesGuru source: https://rulesguru.org/?725RGBwnIII350qOFz1zXeGG

**Expected verdict:** The triggered ability of Pandemonium includes a choice to be made upon resolution. (608.2d) However the player that is supposed to make that choice is no longer in the game, therefore the controller of the trigger chooses another player to make that choice. (800.4g) In this case Bruno will choose another player to decide whether Pandemonium's trigger will deal damage to Falkenrath Reaver. Bruno is the controller of the trigger since they control the enchantment that generated the trigger, even though Aubrianna is the player making choices about the trigger. (603.3a)

**Required reasoning:**
- Match the RulesGuru cited answer for question 725.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [603.3a], [608.2d], [800.4g]

**Why this test matters:** Imported RulesGuru benchmark. Level: 3. Complexity: Intermediate. Tags: Multiplayer, Triggered abilities, Resolving objects, Leaving the game.

## RG727. Alisson control Pulmonic Sliver. They cast Dihada's Ploy, discarding Ward Sliver on...

**Scenario:**
> Alisson control Pulmonic Sliver. They cast Dihada's Ploy, discarding Ward Sliver on resolution. Can Alisson put Ward Sliver on top of their library?
> Cards involved: [[Pulmonic Sliver]], [[Dihada's Ploy]], [[Ward Sliver]].
> RulesGuru source: https://rulesguru.org/?727RGBwnIIIjDkrzXktGG

**Expected verdict:** No. Pulmonic Sliver's ability affects only Sliver permanents on the battlefield, and not Sliver cards in other zones. (109.2, 110.1)

**Required reasoning:**
- Match the RulesGuru cited answer for question 727.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [109.2], [110.1]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Subtypes, Zone-changes, Continuous effects, Graveyard, Replacement effects, Static abilities.

## RG729. On Addison's turn, Neil activates Time Vault. Addison then casts Stranglehold. Can...

**Scenario:**
> On Addison's turn, Neil activates Time Vault. Addison then casts Stranglehold. Can Neil choose to skip the extra turn and untap Time Vault, taking their normal turn afterwards?
> Cards involved: [[Time Vault]], [[Stranglehold]].
> RulesGuru source: https://rulesguru.org/?729RGBwnIII2hVsM0GG

**Expected verdict:** Yes. There are two replacement effects attempting to apply to the extra turn. (614.10) Neil chooses which one to apply first since they are the affected player. (616.1) If they chooses to skip the turn with Time Vault's effect, Stranglehold's effect will no longer apply since their next turn isn't an extra one.

(As per the rules as written, Time Vault won't actually untap, since its second ability prevents its third ability from working if the next turn is its controller's. But that's obviously a mistake in the rules.)

**Required reasoning:**
- Match the RulesGuru cited answer for question 729.
- Identify the governing rule path before giving the final verdict.
- Use the included card context only as support for the rules answer.

**Required citations:** [614.10], [616.1]

**Why this test matters:** Imported RulesGuru benchmark. Level: 1. Complexity: Simple. Tags: Replacement effects, Turn structure, Unsupported answers.
