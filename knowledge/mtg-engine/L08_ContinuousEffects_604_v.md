# Magic: The Gathering — Static Abilities
## LAYER 8: CONTINUOUS EFFECTS LAYER — Verbatim (Rule 604)
## Effective February 27, 2026

---

SOURCES: 00_cr.md (February 27, 2026)
FEEDS INTO: L08_ContinuousEffects_604_t.md, L08_ContinuousEffects_611to613_v.md

---

<a id="604"></a>
# 604. Handling Static Abilities

<a id="604-1"></a>
### 604.1.
Static abilities do something all the time rather than being activated or triggered. They are written as statements, and they’re simply true.

<a id="604-2"></a>
### 604.2.
Static abilities create continuous effects, some of which are prevention effects or replacement effects. These effects are active as long as the permanent with the ability remains on the battlefield and has the ability, or as long as the object with the ability remains in the appropriate zone, as described in [rule 113.6](#113-6).

<a id="604-3"></a>
### 604.3.
Some static abilities are characteristic-defining abilities. A characteristic-defining ability conveys information about an object’s characteristics that would normally be found elsewhere on that object (such as in its mana cost, type line, or power/toughness box). Characteristic-defining abilities can add to or override information found elsewhere on that object. Characteristic-defining abilities function in all zones. They also function outside the game and before the game begins.

<a id="604-3a"></a>
#### 604.3a
A static ability is a characteristic-defining ability if it meets the following criteria: (1) It defines an object’s colors, subtypes, power, or toughness; (2) it is printed on the card it affects, it was granted to the token it affects by the effect that created the token, or it was acquired by the object it affects as the result of a copy effect or text-changing effect; (3) it does not directly affect the characteristics of any other objects; (4) it is not an ability that an object grants to itself; and (5) it does not set the values of such characteristics only if certain conditions are met.

<a id="604-4"></a>
### 604.4.
Many Auras, Equipment, and Fortifications have static abilities that modify the object they’re attached to, but those abilities don’t target that object. If an Aura, Equipment, or Fortification is moved to a different object, the ability stops applying to the original object and starts modifying the new one.

<a id="604-5"></a>
### 604.5.
Some static abilities apply while a spell is on the stack. These are often abilities that refer to countering the spell. Also, abilities that say “As an additional cost to cast . . . ,” “You may pay [cost] rather than pay [this object]’s mana cost,” and “You may cast [this object] without paying its mana cost” work while a spell is on the stack.

<a id="604-6"></a>
### 604.6.
Some static abilities apply while a card is in any zone that you could cast or play it from (usually your hand). These are limited to those that read, “You may [cast/play] [this card] . . . ,” “You can’t [cast/play] [this card] . . . ,” and “[Cast/Play] [this card] only . . . .”

<a id="604-7"></a>
### 604.7.
Unlike spells and other kinds of abilities, static abilities can’t use an object’s last known information for purposes of determining how their effects are applied.

<a id="605"></a>
# 605. Mana Abilities

<a id="605-1"></a>
### 605.1.
Some activated abilities and some triggered abilities are mana abilities, which are subject to special rules. Only abilities that meet either of the following two sets of criteria are mana abilities, regardless of what other effects they may generate or what timing restrictions (such as “Activate only as an instant”) they may have.

<a id="605-1a"></a>
#### 605.1a
An activated ability is a mana ability if it meets all of the following criteria: it doesn’t require a target (see [rule 115.6](#115-6)), it could add mana to a player’s mana pool when it resolves, and it’s not a loyalty ability. (See rule 606, “Loyalty Abilities.”)

<a id="605-1b"></a>
#### 605.1b
A triggered ability is a mana ability if it meets all of the following criteria: it doesn’t require a target (see [rule 115.6](#115-6)), it triggers from the activation or resolution of an activated mana ability (see [rule 605.1a](#605-1a)) or from mana being added to a player’s mana pool, and it could add mana to a player’s mana pool when it resolves.

<a id="605-2"></a>
### 605.2.
A mana ability remains a mana ability even if the game state doesn’t allow it to produce mana.
> Example: A permanent has an ability that reads “{T}: Add {G} for each creature you control.” The ability is still a mana ability even if you control no creatures or if the permanent is already tapped.

<a id="605-3"></a>
### 605.3.
Activating an activated mana ability follows the rules for activating any other activated ability (see [rule 602.2](#602-2)), with the following exceptions:

<a id="605-3a"></a>
#### 605.3a
A player may activate an activated mana ability whenever they have priority, whenever they are casting a spell or activating an ability that requires a mana payment, or whenever a rule or effect asks for a mana payment, even if it’s in the middle of casting or resolving a spell or activating or resolving an ability.

<a id="605-3b"></a>
#### 605.3b
An activated mana ability doesn’t go on the stack, so it can’t be targeted, countered, or otherwise responded to. Rather, it resolves immediately after it is activated. (See [rule 405.6c](#405-6c).)

<a id="605-3c"></a>
#### 605.3c
Once a player begins to activate a mana ability, that ability can’t be activated again until it has resolved.

<a id="605-4"></a>
### 605.4.
Triggered mana abilities follow all the rules for other triggered abilities (see rule 603, “Handling Triggered Abilities”), with the following exception:

<a id="605-4a"></a>
#### 605.4a
A triggered mana ability doesn’t go on the stack, so it can’t be targeted, countered, or otherwise responded to. Rather, it resolves immediately after the mana ability that triggered it, without waiting for priority.
> Example: An enchantment reads, “Whenever a player taps a land for mana, that player adds one mana of any type that land produced.” If a player taps lands for mana while casting a spell, the additional mana is added immediately and can be used to pay for the spell.

<a id="605-5"></a>
### 605.5.
Abilities that don’t meet the criteria specified in rules 605.1a–b and spells aren’t mana abilities.

<a id="605-5a"></a>
#### 605.5a
An ability with a target is not a mana ability, even if it could put mana into a player’s mana pool when it resolves. The same is true for a triggered ability that could produce mana but triggers from an event other than activating a mana ability, or a triggered ability that triggers from activating a mana ability but couldn’t produce mana. These follow the normal rules for activated or triggered abilities, as appropriate.

<a id="605-5b"></a>
#### 605.5b
A spell can never be a mana ability, even if it could put mana into a player’s mana pool when it resolves. It’s cast and resolves just like any other spell. Some older cards were printed with the card type “mana source”; these cards have received errata in the Oracle card reference and are now instants.

<a id="606"></a>
# 606. Loyalty Abilities

<a id="606-1"></a>
### 606.1.
Some activated abilities are loyalty abilities, which are subject to special rules.

<a id="606-2"></a>
### 606.2.
An activated ability with a loyalty symbol in its cost is a loyalty ability. Normally, only planeswalkers have loyalty abilities.

<a id="606-3"></a>
### 606.3.
A player may activate a loyalty ability of a permanent they control any time they have priority and the stack is empty during a main phase of their turn, but only if no player has previously activated a loyalty ability of that permanent that turn.

<a id="606-4"></a>
### 606.4.
The cost to activate a loyalty ability of a permanent is to put on or remove from that permanent a certain number of loyalty counters, as shown by the loyalty symbol in the ability’s cost. This cost may be modified by other effects.

606.5 If the total cost to activate a loyalty ability contains multiple costs to add or remove loyalty counters, those costs are combined into a single cost to add or remove loyalty counters, as appropriate.
> Example: A player controls Carth the Lion, which says, in part, “Planeswalkers’ loyalty abilities you control cost an additional [+1] to activate. That player also controls a planeswalker with three loyalty counters. To activate one of that planeswalker’s abilities that normally costs [+1], they put two loyalty counters on it. To activate one of its abilities that normally costs [−4], they remove three loyalty counters from it.

<a id="606-6"></a>
### 606.6.
A loyalty ability with a negative loyalty cost, taking into account any additional costs, can’t be activated unless the permanent has at least that many loyalty counters on it.

<a id="607"></a>
# 607. Linked Abilities

<a id="607-1"></a>
### 607.1.
An object may have two abilities printed on it such that one of them causes actions to be taken or objects or players to be affected and the other one directly refers to those actions, objects, or players. If so, these two abilities are linked: the second refers only to actions that were taken or objects or players that were affected by the first, and not by any other ability.

<a id="607-1a"></a>
#### 607.1a
An ability printed on an object within another ability that grants that ability to that object is considered to be “printed on” that object for these purposes.

<a id="607-1b"></a>
#### 607.1b
An ability printed on either face of a nonmodal double-faced object (see rule 712) is considered to be “printed on” that object for these purposes, regardless of which face is up.

<a id="607-1c"></a>
#### 607.1c
An ability printed on an object that fulfills both criteria described in [rule 607.1](#607-1) is linked to itself.

<a id="607-1d"></a>
#### 607.1d
Abilities printed on two objects can be linked if one object is a token, emblem, or nontoken permanent and the second object was the source of the ability that either created the token or emblem or put that nontoken permanent onto the battlefield. In these cases, the abilities fit the criteria listed for one of the different kinds of linked abilities in [rule 607.2](#607-2) except they are printed on two objects rather than one.

<a id="607-2"></a>
### 607.2.
There are different kinds of linked abilities.

<a id="607-2a"></a>
#### 607.2a
If an object has an activated or triggered ability printed on it that instructs a player to exile one or more cards and an ability printed on it that refers either to “the exiled cards” or to cards “exiled with [this object],” these abilities are linked. The second ability refers only to cards in the exile zone that were put there as a result of an instruction to exile them in the first ability.

<a id="607-2b"></a>
#### 607.2b
If an object has an ability printed on it that generates a replacement effect which causes one or more cards to be exiled and an ability printed on it that refers either to “the exiled cards” or to cards “exiled with [this object],” these abilities are linked. The second ability refers only to cards in the exile zone that were put there as a direct result of a replacement event caused by the first ability. See rule 614, “Replacement Effects.”

<a id="607-2c"></a>
#### 607.2c
If an object has an activated or triggered ability printed on it that puts one or more objects onto the battlefield and an ability printed on it that refers to objects “put onto the battlefield with [this object]” or “created with [this object],” those abilities are linked. The second can refer only to objects put onto the battlefield as a result of the first.

<a id="607-2d"></a>
#### 607.2d
If an object has an ability printed on it that causes a player to “choose a [value]” and an ability printed on it that refers to “the chosen [value],” “the last chosen [value],” or similar, those abilities are linked. The second ability refers only to a choice made as a result of the first ability.

<a id="607-2e"></a>
#### 607.2e
If an object has an ability printed on it that allows some information to be noted and another ability which refers to information noted for that object, those abilities are linked. The second ability refers only to information noted as a result of the first ability.

<a id="607-2f"></a>
#### 607.2f
If an object has an ability printed on it that causes a player to choose from between two or more words that otherwise have no rules meaning and an ability printed on it that refers to a choice involving one or more of those words, those abilities are linked. The second can refer only to a choice made as a result of the first ability.

<a id="607-2g"></a>
#### 607.2g
If an object has an ability printed on it that causes a player to pay a cost as it enters the battlefield and an ability printed on it that refers to the cost paid “as [this object] entered,” these abilities are linked. The second ability refers only to a cost paid as a result of the first ability.

<a id="607-2h"></a>
#### 607.2h
If an object has both a static ability and one or more triggered abilities printed on it in the same paragraph, each of those triggered abilities is linked to the static ability. Each triggered ability refers only to actions taken as a result of the static ability. See [rule 603.11](#603-11).

<a id="607-2i"></a>
#### 607.2i
If an object has an ability printed on it that allows an additional cost to be paid and an ability printed on it that refers to whether that cost was paid, those abilities are linked. The second refers only to whether the intent to pay the additional cost listed in the first was declared as the object was cast as a spell. If an ability lists multiple such costs, it may have multiple abilities linked to it. Each of those abilities will specify which cost it refers to.
> Example: Stormscape Battlemage has “Kicker {W} and/or {2}{B}” and two abilities that may trigger when it enters the battlefield. The first triggers if it was kicked with its {W} kicker, and the second triggers if it was kicked with its {2}{B} kicker. Each of those triggered abilities is linked to its kicker ability.

<a id="607-2j"></a>
#### 607.2j
If an object has an ability printed on it that causes a player to pay a variable additional cost as it’s cast and an ability printed on it that refers to the cost paid “as [this object] was cast,” these abilities are linked. The second refers only to the value chosen for the cost listed in the first as the object was cast as a spell. See [rule 601.2b](#601-2b).

<a id="607-2k"></a>
#### 607.2k
The two abilities represented by the champion keyword are linked abilities. See [rule 702.72](#702-72), “Champion.”

<a id="607-2m"></a>
#### 607.2m
Abilities preceded by an anchor word are linked to the ability that allows a player to choose that anchor word. See [rule 614.12b](#614-12b).

<a id="607-2n"></a>
#### 607.2n
If an object has a static ability printed on it that allows a player to exile one or more cards “before you shuffle your deck to start the game” and an ability printed on it that refers to cards “exiled with cards named [this object’s name],” the second ability is linked to the first ability of any objects that had the specified name before the game began.

<a id="607-2p"></a>
#### 607.2p
If an object has both a static ability that causes a player to make a choice for a characteristic-defining ability before the game begins and that characteristic-defining ability printed on it in the same paragraph, those abilities are linked. The second ability refers only to the choice made as a result of the first ability and continues to refer to that choice as the object changes zones during the game.

<a id="607-2q"></a>
#### 607.2q
If a permanent spell has an ability printed on it that allows one or more cards to be exiled while paying a cost to cast it and the permanent that spell becomes has an ability that refers to cards “exiled with [this object],” those abilities are linked. The second ability refers only to cards exiled to pay the cost of the spell that became that permanent.

<a id="607-3"></a>
### 607.3.
If, within a pair of linked abilities, one ability refers to a single object as “the exiled card,” “a card exiled with [this object],” or a similar phrase, and the other ability has exiled multiple cards (usually because it was copied), the ability refers to each of the exiled cards. If that ability asks for any information about the exiled card, such as a characteristic or mana value, it gets multiple answers. If these answers are used to determine the value of a variable, the sum of the answers is used. If that ability performs any actions on “the” card, it performs that action on each exiled card. If that ability creates a token that is a copy of “the” card, then for each exiled card, it creates a token that is a copy of that card. If that ability performs any actions on “a” card, the controller of the ability chooses which card is affected.

<a id="607-4"></a>
### 607.4.
An ability may be part of more than one pair of linked abilities.
> Example: Paradise Plume has the following three abilities: “As this artifact enters, choose a color,” “Whenever a player casts a spell of the chosen color, you may gain 1 life,” and “{T}: Add one mana of the chosen color.” The first and second abilities are linked. The first and third abilities are linked.

<a id="607-5"></a>
### 607.5.
If an object acquires a pair of linked abilities as part of the same effect, the abilities will be similarly linked to one another on that object even though they weren’t printed on that object. They can’t be linked to any other ability, regardless of what other abilities the object may currently have or may have had in the past.
> Example: Arc-Slogger has the ability “{R}, Exile the top ten cards of your library: This creature deals 2 damage to any target.” Sisters of Stone Death has the ability “{B}{G}: Exile target creature blocking or blocked by Sisters of Stone Death” and the ability “{2}{B}: Put a creature card exiled with Sisters of Stone Death onto the battlefield under your control.” Quicksilver Elemental has the ability “{U}: This creature gains all activated abilities of target creature until end of turn.” If a player has Quicksilver Elemental gain Arc-Slogger’s ability, activates it, then has Quicksilver Elemental gain Sisters of Stone Death’s abilities, activates the exile ability, and then activates the return-to-the-battlefield ability, only the creature card Quicksilver Elemental exiled with Sisters of Stone Death’s ability can be returned to the battlefield. Creature cards Quicksilver Elemental exiled with Arc-Slogger’s ability can’t be returned.

<a id="607-5a"></a>
#### 607.5a
If an object gains an ability that refers to a choice, but either (a) doesn’t copy that ability’s linked ability or (b) does copy the linked ability but no choice is made for it, then the choice is considered to be “undefined.” If an ability refers to an undefined choice, that part of the ability won’t do anything.
> Example: Voice of All enters the battlefield and Unstable Shapeshifter copies it. Voice of All reads, in part, “As this creature enters, choose a color.” and “This creature has protection from the chosen color.” Unstable Shapeshifter never had a chance for a color to be chosen for it, because it didn’t enter the battlefield as Voice of All so it doesn’t gain a protection ability.
> Example: A Vesuvan Doppelganger enters the battlefield as a copy of Voice of All, and the Doppelganger’s controller chooses blue. Later, the Doppelganger copies Quirion Elves, which has the ability, “{T}: Add one mana of the chosen color.” Even though a color was chosen for the Doppelganger, it wasn’t chosen for the ability linked to the mana ability copied from the Elves. If that mana ability of the Doppelganger is activated, it will not produce mana.

<a id="608"></a>
# 608. Resolving Spells and Abilities

<a id="608-1"></a>
### 608.1.
Each time all players pass in succession, the spell or ability on top of the stack resolves. (See rule 609, “Effects.”)

<a id="608-2"></a>
### 608.2.
If the object that’s resolving is an instant spell, a sorcery spell, or an ability, its resolution may involve several steps. The steps described in rules 608.2a and 608.2b are followed first. The steps described in rules 608.2c–m are then followed as appropriate, in no specific order. The steps described in [rule 608.2n](#608-2n) and 608.2p are followed last.

<a id="608-2a"></a>
#### 608.2a
If a triggered ability has an intervening “if” clause, it checks whether the clause’s condition is true. If it isn’t, the ability is removed from the stack and does nothing. Otherwise, it continues to resolve. See [rule 603.4](#603-4).

<a id="608-2b"></a>
#### 608.2b
If the spell or ability specifies targets, it checks whether the targets are still legal. A target that’s no longer in the zone it was in when it was targeted is illegal. Other changes to the game state may cause a target to no longer be legal; for example, its characteristics may have changed or an effect may have changed the text of the spell. If the source of an ability has left the zone it was in, its last known information is used during this process. If all its targets, for every instance of the word “target,” are now illegal, the spell or ability doesn’t resolve. It’s removed from the stack and, if it’s a spell, put into its owner’s graveyard. Otherwise, the spell or ability will resolve normally. Illegal targets, if any, won’t be affected by parts of a resolving spell’s effect for which they’re illegal. Other parts of the effect for which those targets are not illegal may still affect them. If the spell or ability creates any continuous effects that affect game rules (see [rule 613.11](#613-11)), those effects don’t apply to illegal targets. If part of the effect requires information about an illegal target, it fails to determine any such information. Any part of the effect that requires that information won’t happen.
> Example: Sorin’s Thirst is a black instant that reads, “Sorin’s Thirst deals 2 damage to target creature and you gain 2 life.” If the creature isn’t a legal target during the resolution of Sorin’s Thirst (say, if the creature has gained protection from black or left the battlefield), then Sorin’s Thirst doesn’t resolve. Its controller doesn’t gain any life.
> Example: Plague Spores reads, “Destroy target nonblack creature and target land. They can’t be regenerated.” Suppose the same creature land is chosen both as the nonblack creature and as the land, and the color of the creature land is changed to black before Plague Spores resolves. Plague Spores still resolves because the black creature land is still a legal target for the “target land” part of the spell. The “destroy target nonblack creature” part of the spell won’t affect that permanent, but the “destroy target land” part of the spell will still destroy it. It can’t be regenerated.

<a id="608-2c"></a>
#### 608.2c
The controller of the spell or ability follows its instructions in the order written. However, replacement effects may modify these actions. In some cases, later text on the card may modify the meaning of earlier text (for example, “Destroy target creature. It can’t be regenerated” or “Counter target spell. If that spell is countered this way, put it on top of its owner’s library instead of into its owner’s graveyard.”) Don’t just apply effects step by step without thinking in these cases—read the whole text and apply the rules of English to the text.

<a id="608-2d"></a>
#### 608.2d
If an effect of a spell or ability offers any choices other than choices already made as part of casting the spell, activating the ability, or otherwise putting the spell or ability on the stack, the player announces these while applying the effect. The player can’t choose an option that’s illegal or impossible, with the exception that having a library with no cards in it doesn’t make drawing a card an impossible action (see [rule 121.3](#121-3)). If an effect divides or distributes something, such as damage or counters, as a player chooses among any number of untargeted players and/or objects, the player chooses the amount and division such that each chosen player or object receives at least one of whatever is being divided. (Note that if an effect divides or distributes something, such as damage or counters, as a player chooses among some number of target objects and/or players, the amount and division were determined as the spell or ability was put onto the stack rather than at this time; see [rule 601.2d](#601-2d).)
> Example: A spell’s instruction reads, “You may sacrifice a creature. If you don’t, you lose 4 life.” A player who controls no creatures can’t choose the sacrifice option.

<a id="608-2e"></a>
#### 608.2e
Some spells and abilities have multiple steps or actions, denoted by separate sentences or clauses, that involve multiple players. In these cases, the choices for the first action are made in APNAP order, and then the first action is processed simultaneously. Then the choices for the second action are made in APNAP order, and then that action is processed simultaneously, and so on. See [rule 101.4](#101-4).

<a id="608-2f"></a>
#### 608.2f
Some spells and abilities include actions taken on multiple players and/or objects. In most cases, each such action is processed simultaneously. If the action can’t be processed simultaneously, it’s instead processed considering each affected player or object individually. APNAP order is used to make the primary determination of the order of those actions. Secondarily, if the action is to be taken on both a player and an object they control or on multiple objects controlled by the same player, the player who controls the resolving spell or ability chooses the relative order of those actions.
> Example: Blatant Thievery says “For each opponent, gain control of target permanent that player controls.” As Blatant Thievery resolves, its controller gains control of all permanents chosen as targets simultaneously.
> Example: Soulfire Eruption says, in part, “Choose any number of target creatures, planeswalkers, and/or players. For each of them, exile the top card of your library, then Soulfire Eruption deals damage equal to that card’s mana value to that permanent or player.” A player casts Soulfire Eruption targeting an opponent and a creature that opponent controls. As Soulfire Eruption resolves, the player can’t exile the top card of their library multiple times at the same time, so they first choose which target they are considering, then they exile the top card of their library, and finally Soulfire Eruption deals damage to that target. They then repeat this process for the remaining target.

<a id="608-2g"></a>
#### 608.2g
If an effect gives a player the option to pay mana, they may activate mana abilities before taking that action. If an effect specifically instructs or allows a player to cast a spell during resolution, they do so by following the steps in rules 601.2a–i, except no player receives priority after it’s cast. That spell becomes the topmost object on the stack, and the currently resolving spell or ability continues to resolve, which may include casting other spells this way. No other spells can normally be cast and no other abilities can normally be activated during resolution.

<a id="608-2h"></a>
#### 608.2h
If an effect requires information from the game (such as the number of creatures on the battlefield), the answer is determined only once, when the effect is applied. If the effect requires information from a specific object, including the source of the ability itself, the effect uses the current information of that object if it’s in the public zone it was expected to be in; if it’s no longer in that zone, or if the effect has moved it from a public zone to a hidden zone, the effect uses the object’s last known information. See [rule 113.7a](#113-7a). If an ability states that an object does something, it’s the object as it exists—or as it most recently existed—that does it, not the ability.

<a id="608-2i"></a>
#### 608.2i
Some effects look back in time and require information about previous game states and actions rather than considering the current game state. If such an effect requires information from the game about an object or group of objects, and that effect is not taking any actions on those objects, they don’t need to be currently in the zone they were in at the time of that previous game state or action, nor do they need to currently meet the criteria described in the action, as long as they did so at the specified time. This is an exception to 608.2h.
> Example: A player attacks with Bear Cub. Later in the turn, an effect causes Bear Cub to become a noncreature permanent. The same player then casts Search Party Captain, a spell that says in part “This spell costs {1} less to cast for each creature you attacked with this turn.” That spell costs {1} less because the player attacked with a creature, even though the Bear Cub they attacked with is no longer a creature.

<a id="608-2j"></a>
#### 608.2j
If an effect refers to certain characteristics, it checks only for the value of the specified characteristics, regardless of any related ones an object may also have.
> Example: An effect that reads “Destroy all black creatures” destroys a white-and-black creature, but one that reads “Destroy all nonblack creatures” doesn’t.

<a id="608-2k"></a>
#### 608.2k
If an ability’s effect refers to a specific untargeted object that has been previously referred to by that ability’s cost or trigger condition, it still affects that object even if the object has changed characteristics.
> Example: Wall of Tears says “Whenever this creature blocks a creature, return that creature to its owner’s hand at end of combat.” If Wall of Tears blocks a creature, then that creature ceases to be a creature before the triggered ability resolves, the permanent will still be returned to its owner’s hand.

<a id="608-2m"></a>
#### 608.2m
If an instant spell, sorcery spell, or ability that can legally resolve leaves the stack once it starts to resolve, it will continue to resolve fully.

<a id="608-2n"></a>
#### 608.2n
As the final part of an instant or sorcery spell’s resolution, the spell is put into its owner’s graveyard. As the final part of an ability’s resolution, the ability is removed from the stack and ceases to exist.

<a id="608-2p"></a>
#### 608.2p
Once all possible steps described in 608.2c–n are completed, any abilities that trigger when that spell or ability resolves trigger.

<a id="608-3"></a>
### 608.3.
If the object that’s resolving is a permanent spell, its resolution may involve several steps. The instructions in rules 608.3a and b are always performed first. Then one of the steps in [rule 608.3c](#608-3c)–e is performed, if appropriate.

<a id="608-3a"></a>
#### 608.3a
If the object that’s resolving has no targets, it becomes a permanent and enters the battlefield under the control of the spell’s controller.

<a id="608-3b"></a>
#### 608.3b
If the object that’s resolving has a target, it checks whether the target is still legal, as described in 608.2b. If a spell with an illegal target is a bestowed Aura spell (see [rule 702.103e](#702-103e)) or a mutating creature spell (see [rule 702.140b](#702-140b)), it becomes a creature spell and will resolve as described in [rule 608.3a](#608-3a). Otherwise, the spell doesn’t resolve. It is removed from the stack and put into its owner’s graveyard.

<a id="608-3c"></a>
#### 608.3c
If the object that’s resolving is an Aura spell, it becomes a permanent and is put onto the battlefield under the control of the spell’s controller attached to the player or object it was targeting.

<a id="608-3d"></a>
#### 608.3d
If the object that’s resolving is a mutating creature spell, the object representing that spell merges with the permanent it is targeting (see rule 729, “Merging with Permanents”).

<a id="608-3e"></a>
#### 608.3e
If a permanent spell resolves but its controller can’t put it onto the battlefield, that player puts it into its owner’s graveyard.
> Example: Worms of the Earth has the ability “Lands can’t enter the battlefield.” Clone says “You may have this creature enter as a copy of any creature on the battlefield.” If a player casts Clone and chooses to copy Dryad Arbor (a land creature) while Worms of the Earth is on the battlefield, Clone can’t enter the battlefield from the stack. It’s put into its owner’s graveyard.

<a id="608-3f"></a>
#### 608.3f
If the object that’s resolving is a copy of a permanent spell, it will become a token permanent as it is put onto the battlefield in any of the steps above. A token put onto the battlefield this way is no longer a copy of a spell and is not “created” for the purposes of any rules or effects that refer to creating a token.

<a id="608-3g"></a>
#### 608.3g
If the object that’s resolving has a static ability that functions on the stack and creates a delayed triggered ability, that delayed triggered ability is created as that permanent is put onto the battlefield in any of the steps above. (See rules 702.109, “Dash,” 702.152, “Blitz,” and 702.185, “Warp.”)

<a id="609"></a>
# 609. Effects

<a id="609-1"></a>
### 609.1.
An effect is something that happens in the game as a result of a spell or ability. When a spell, activated ability, or triggered ability resolves, it may create one or more one-shot or continuous effects. Static abilities may create one or more continuous effects. Text itself is never an effect.

<a id="609-2"></a>
### 609.2.
Effects apply only to permanents unless the instruction’s text states otherwise or they clearly can apply only to objects in one or more other zones.
> Example: An effect that changes all lands into creatures won’t alter land cards in players’ graveyards. But an effect that says spells cost more to cast will apply only to spells on the stack, since a spell is always on the stack while a player is casting it.

<a id="609-3"></a>
### 609.3.
If an effect attempts to do something impossible, it does only as much as possible.
> Example: If a player is holding only one card, an effect that reads “Discard two cards” causes them to discard only that card. If an effect moves cards out of the library (as opposed to drawing), it moves as many as possible.

<a id="609-4"></a>
### 609.4.
Some effects state that a player may do something “as though” some condition were true or a creature can do something “as though” some condition were true. This applies only to the stated effect. For purposes of that effect, treat the game exactly as if the stated condition were true. For all other purposes, treat the game normally.

<a id="609-4a"></a>
#### 609.4a
If two effects state that a player may (or a creature can) do the same thing “as though” different conditions were true, both conditions could apply. If one “as though” effect satisfies the requirements for another “as though” effect, then both effects will apply.
> Example: A player controls Vedalken Orrery, an artifact that says “You may cast spells as though they had flash.” That player casts Shaman’s Trance, an instant that says, in part, “You may play lands and cast spells from other players’ graveyards this turn as though those cards were in your graveyard.” The player may cast a sorcery with flashback from another player’s graveyard as though it were in that player’s graveyard and as though it had flash.

<a id="609-4b"></a>
#### 609.4b
If an effect allows a player to spend mana “as though it were mana of any [type or color],” this affects only how the player may pay a cost. It doesn’t change that cost, and it doesn’t change what mana was actually spent to pay that cost. The same is true for effects that say “mana of any type can be spent.”

<a id="609-5"></a>
### 609.5.
If an effect could result in a tie, the text of the spell or ability that created the effect will specify what to do in the event of a tie. The Magic game has no default for ties.

<a id="609-6"></a>
### 609.6.
Some continuous effects are replacement effects or prevention effects. See rules 614 and 615.

<a id="609-7"></a>
### 609.7.
Some effects apply to damage from a source—for example, “The next time a red source of your choice would deal damage to you this turn, prevent that damage.”

<a id="609-7a"></a>
#### 609.7a
If an effect requires a player to choose a source of damage, they may choose a permanent; a spell on the stack (including a permanent spell); any object referred to by an object on the stack, by a replacement or prevention effect that’s waiting to apply, or by a delayed triggered ability that’s waiting to trigger (even if that object is no longer in the zone it used to be in); or a face-up object in the command zone. A source doesn’t need to be capable of dealing damage to be a legal choice. The source is chosen when the effect is created. If the player chooses a permanent, the effect will apply to the next damage dealt by that permanent, regardless of whether it’s combat damage or damage dealt as the result of a spell or ability. If the player chooses a permanent spell, the effect will apply to any damage dealt by that spell and any damage dealt by the permanent that spell becomes when it resolves.

<a id="609-7b"></a>
#### 609.7b
Some effects from resolved spells and abilities prevent or replace damage from sources with certain properties, such as a creature or a source of a particular color. When the source would deal damage, the “shield” rechecks the source’s properties. If the properties no longer match, the damage isn’t prevented or replaced. If for any reason the shield prevents no damage or replaces no damage, the shield isn’t used up.

<a id="609-7c"></a>
#### 609.7c
Some effects from static abilities prevent or replace damage from sources with certain properties. For these effects, the prevention or replacement applies to sources that are permanents with that property and to any sources that aren’t on the battlefield that have that property.

<a id="610"></a>
# 610. One-Shot Effects

<a id="610-1"></a>
### 610.1.
A one-shot effect does something just once and doesn’t have a duration. Examples include dealing damage, destroying a permanent, creating a token, and moving an object from one zone to another.

<a id="610-2"></a>
### 610.2.
Some one-shot effects create a delayed triggered ability, which instructs a player to do something later in the game (usually at a specific time) rather than as the spell or ability that’s creating the one-shot effect resolves. See [rule 603.7](#603-7).

<a id="610-3"></a>
### 610.3.
Some one-shot effects cause an object to change zones “until” a specified event occurs. A second one-shot effect is created immediately after the specified event. This second one-shot effect returns the object to its previous zone.

<a id="610-3a"></a>
#### 610.3a
If a resolving spell or activated ability creates the initial one-shot effect that causes the object to change zones, and the specified event has already occurred before that one-shot effect would occur but after that spell or ability was put onto the stack, the object doesn’t move.

<a id="610-3b"></a>
#### 610.3b
If a resolving triggered ability creates the initial one-shot effect that causes the object to change zones, and the specified event has already occurred before that one-shot effect would occur but after that ability triggered, the object doesn’t move.

<a id="610-3c"></a>
#### 610.3c
An object returned to the battlefield this way returns under its owner’s control unless otherwise specified.

<a id="610-3d"></a>
#### 610.3d
If multiple one-shot effects are created this way immediately after one or more simultaneous events, those one-shot effects are also simultaneous.
> Example: Two Banisher Priests have each exiled a card. All creatures are destroyed at the same time by Day of Judgment. The two exiled cards are returned to the battlefield at the same time.

<a id="610-4"></a>
### 610.4.
Some one-shot effects cause a permanent to phase out “until” a specified event occurs. A second one-shot effect is created immediately after the specified event. This second one-shot effect causes the permanent to phase in.

<a id="610-4a"></a>
#### 610.4a
A permanent phased out this way doesn’t phase in as a result of the turn-based action during a player’s untap step (see [rule 502.1](#502-1)). Other effects may cause it to phase in. If a permanent phased out this way phases in due to another effect, the second one-shot effect doesn’t happen, even if that permanent has phased out again.

<a id="610-4b"></a>
#### 610.4b
If a resolving spell or activated ability creates the initial one-shot effect that causes the permanent to phase out, and the specified event has already occurred before that one-shot effect would occur but after that spell or ability was put onto the stack, the permanent doesn’t phase out.

<a id="610-4c"></a>
#### 610.4c
If a resolving triggered ability creates the initial one-shot effect that causes the permanent to phase out, and the specified event has already occurred before that one-shot effect would occur but after that ability triggered, the permanent doesn’t phase out.

<a id="610-4d"></a>
#### 610.4d
If multiple one-shot effects are created this way immediately after one or more simultaneous events, those one-shot effects are also simultaneous.

<a id="610-5"></a>
### 610.5.
Some static abilities create one-shot effects that cause spells a player casts to gain an ability as that player casts them. These effects begin to apply to appropriate spells at the time the player puts such a spell on the stack. See [rule 601.2a](#601-2a).

<a id="611"></a>

---

# END OF VERBATIM LAYER
