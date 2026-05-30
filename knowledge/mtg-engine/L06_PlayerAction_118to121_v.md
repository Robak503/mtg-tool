# Magic: The Gathering — Costs, Life, Damage, and Drawing
## LAYER 6: PLAYER ACTION LAYER — Verbatim (Rules 118–121)
## Effective February 27, 2026

---

SOURCES: 00_cr.md (February 27, 2026)
FEEDS INTO: L06_PlayerAction_118to121_t.md, L06_PlayerAction_601_seg1_t.md (601.2f–h cost payment), L05_StateEnforcement_704_t.md (damage SBAs), L00_Orchestration_game_engine.md

---

<a id="118"></a>
# 118. Costs

<a id="118-1"></a>
### 118.1.
A cost is an action or payment necessary to take another action or to stop another action from taking place. To pay a cost, a player carries out the instructions specified by the spell, ability, or effect that contains that cost.

<a id="118-2"></a>
### 118.2.
If a cost includes a mana payment, the player paying the cost has a chance to activate mana abilities. Paying the cost to cast a spell or activate an activated ability follows the steps in rules 601.2f–h.

<a id="118-3"></a>
### 118.3.
A player can’t pay a cost without having the necessary resources to pay it fully. For example, a player with only 1 life can’t pay a cost of 2 life, and a permanent that’s already tapped can’t be tapped to pay a cost. See rule 202, “Mana Cost and Color,” and rule 602, “Activating Activated Abilities.”

<a id="118-3a"></a>
#### 118.3a
Paying mana is done by removing the indicated mana from a player’s mana pool. (Players can always pay 0 mana.) If excess mana remains in that player’s mana pool after making that payment, the player announces what mana is still there.

<a id="118-3b"></a>
#### 118.3b
Paying life is done by subtracting the indicated amount of life from a player’s life total. (Players can always pay 0 life.)

<a id="118-3c"></a>
#### 118.3c
Activating mana abilities is not mandatory, even if paying a cost is.

<a id="118-4"></a>
### 118.4.
Some costs include an {X} or an X. See [rule 107.3](#107-3).

<a id="118-5"></a>
### 118.5.
Some costs are represented by {0}, or are reduced to {0}. The action necessary for a player to pay such a cost is the player’s acknowledgment that they are paying it. Even though such a cost requires no resources, it’s not automatically paid.

<a id="118-5a"></a>
#### 118.5a
A spell whose mana cost is {0} must still be cast the same way as one with a cost greater than zero; it won’t cast itself automatically. The same is true for an activated ability whose cost is {0}.

<a id="118-6"></a>
### 118.6.
Some objects have no mana cost. This represents an unpayable cost. An ability can also have an unpayable cost if its cost is based on the mana cost of an object with no mana cost. Attempting to cast a spell or activate an ability that has an unpayable cost is a legal action. However, attempting to pay an unpayable cost is an illegal action.

<a id="118-6a"></a>
#### 118.6a
If an unpayable cost is increased by an effect or an additional cost is imposed, the cost is still unpayable. If an alternative cost is applied to an unpayable cost, including an effect that allows a player to cast a spell without paying its mana cost, the alternative cost may be paid.

<a id="118-7"></a>
### 118.7.
What a player actually needs to do to pay a cost may be changed or reduced by effects. If the mana component of a cost is reduced to nothing by cost reduction effects, it’s considered to be {0}. Paying a cost changed or reduced by an effect counts as paying the original cost.

<a id="118-7a"></a>
#### 118.7a
Effects that reduce a cost by an amount of generic mana affect only the generic mana component of that cost. They can’t affect the colored or colorless mana components of that cost.

<a id="118-7b"></a>
#### 118.7b
If a cost is reduced by an amount of colored or colorless mana, but the cost doesn’t require mana of that type, the cost is reduced by that amount of generic mana.

<a id="118-7c"></a>
#### 118.7c
If a cost is reduced by an amount of colored mana that exceeds its mana component of that color, the cost’s mana component of that color is reduced to nothing and the cost’s generic mana component is reduced by the difference.

<a id="118-7d"></a>
#### 118.7d
If a cost is reduced by an amount of colorless mana that exceeds its colorless mana component, the cost’s colorless mana component is reduced to nothing and the cost’s generic mana component is reduced by the difference.

<a id="118-7e"></a>
#### 118.7e
If a cost is reduced by an amount of mana represented by a hybrid mana symbol, the player paying that cost chooses one half of that symbol at the time the cost reduction is applied (see [rule 601.2f](#601-2f)). If a colored half is chosen, the cost is reduced by one mana of that color. If a generic half is chosen, the cost is reduced by an amount of generic mana equal to that half’s number.

<a id="118-7f"></a>
#### 118.7f
If a cost is reduced by an amount of mana represented by a Phyrexian mana symbol, the cost is reduced by one mana of that symbol’s color.

<a id="118-7g"></a>
#### 118.7g
If a cost is reduced by an amount of mana represented by one or more snow mana symbols, the cost is reduced by that much generic mana.

<a id="118-8"></a>
### 118.8.
Some spells and abilities have additional costs. An additional cost is a cost listed in a spell’s rules text, or applied to a spell or ability from another effect, that its controller must pay at the same time they pay the spell’s mana cost or the ability’s activation cost. Note that some additional costs are listed in keywords; see rule 702.

<a id="118-8a"></a>
#### 118.8a
Any number of additional costs may be applied to a spell as it’s being cast or to an ability as it’s being activated. The controller of the spell or ability announces their intentions to pay any or all of those costs as described in [rule 601.2b](#601-2b).

<a id="118-8b"></a>
#### 118.8b
Some additional costs are optional.

<a id="118-8c"></a>
#### 118.8c
If an effect instructs a player to cast a spell “if able,” and that spell has a mandatory additional cost that includes actions involving cards with a stated quality in a hidden zone, the player isn’t required to cast that spell, even if those cards are present in that zone.

<a id="118-8d"></a>
#### 118.8d
Additional costs don’t change a spell’s mana cost, only what its controller has to pay to cast it. Spells and abilities that ask for that spell’s mana cost still see the original value.

<a id="118-9"></a>
### 118.9.
Some spells have alternative costs. An alternative cost is a cost listed in a spell’s text, or applied to it from another effect, that its controller may pay rather than paying the spell’s mana cost. Alternative costs are usually phrased, “You may [action] rather than pay [this object’s] mana cost,” or “You may cast [this object] without paying its mana cost.” Note that some alternative costs are listed in keywords; see rule 702.

<a id="118-9a"></a>
#### 118.9a
Only one alternative cost can be applied to any one spell as it’s being cast. The controller of the spell announces their intentions to pay that cost as described in [rule 601.2b](#601-2b).

<a id="118-9b"></a>
#### 118.9b
Alternative costs are generally optional. An effect that allows you to cast a spell may require a certain alternative cost to be paid.

<a id="118-9c"></a>
#### 118.9c
An alternative cost doesn’t change a spell’s mana cost, only what its controller has to pay to cast it. Spells and abilities that ask for that spell’s mana cost still see the original value.

<a id="118-9d"></a>
#### 118.9d
If an alternative cost is being paid to cast a spell, any additional costs, cost increases, and cost reductions that affect that spell are applied to that alternative cost. (See [rule 601.2f](#601-2f).)

<a id="118-10"></a>
### 118.10.
Each payment of a cost applies to only one spell, ability, or effect. For example, a player can’t sacrifice just one creature to activate the activated abilities of two permanents that each require sacrificing a creature as a cost. Also, the resolution of a spell or ability doesn’t pay another spell or ability’s cost, even if part of its effect is doing the same thing the other cost asks for.

<a id="118-11"></a>
### 118.11.
The actions performed when paying a cost may be modified by effects. Even if they are, meaning the actions that are performed don’t match the actions that are called for, the cost has still been paid.
> Example: A player controls Psychic Vortex, an enchantment with a cumulative upkeep cost of “Draw a card,” and Obstinate Familiar, a creature that says “If you would draw a card, you may skip that draw instead.” The player may decide to pay Psychic Vortex’s cumulative upkeep cost and then draw no cards instead of drawing the appropriate amount. The cumulative upkeep cost has still been paid.

<a id="118-12"></a>
### 118.12.
Some spells, activated abilities, and triggered abilities read, “[Do something]. If [a player] [does, doesn’t, or can’t], [effect].” Or “[A player] may [do something]. If [that player] [does, doesn’t, or can’t], [effect].” The action [do something] is a cost, paid when the spell or ability resolves. The “If [a player] [does, doesn’t, or can’t]” clause checks whether the player chose to pay an optional cost or started to pay a mandatory cost, regardless of what events actually occurred.
> Example: You control Standstill, an enchantment that says “When a player casts a spell, sacrifice this enchantment. If you do, each of that player’s opponents draws three cards.” A spell is cast, causing Standstill’s ability to trigger. Then an ability is activated that exiles Standstill. When Standstill’s ability resolves, you’re unable to pay the “sacrifice Standstill” cost. No player will draw cards.
> Example: Your opponent has cast Gather Specimens, a spell that says “If a creature would enter the battlefield under an opponent’s control this turn, it enters under your control instead.” You control a face-down Dermoplasm, a creature with morph that says “When this creature is turned face up, you may put a creature card with morph from your hand onto the battlefield face up. If you do, return this creature to its owner’s hand.” You turn Dermoplasm face up, and you choose to put a creature card with morph from your hand onto the battlefield. Due to Gather Specimens, it enters the battlefield under your opponent’s control instead of yours. However, since you chose to pay the cost, Dermoplasm is still returned to its owner’s hand.

<a id="118-12a"></a>
#### 118.12a
Some spells, activated abilities, and triggered abilities read, “[Do something] unless [a player does something else].” This means the same thing as “[A player may do something else]. If [that player doesn’t], [do something].”

<a id="118-12b"></a>
#### 118.12b
Some effects offer a player a choice to search a zone and take additional actions with the cards found in that zone, followed by an “If [a player] does” clause. This clause checks whether the player chose to search, not whether the player took any of the additional actions.

<a id="118-13"></a>
### 118.13.
Some costs contain mana symbols that can be paid in multiple ways. These include hybrid mana symbols and Phyrexian mana symbols.

<a id="118-13a"></a>
#### 118.13a
If the mana cost of a spell or the activation cost of an activated ability contains a mana symbol that can be paid in multiple ways, the choice of how to pay for that symbol is made as its controller proposes that spell or ability (see [rule 601.2b](#601-2b)).

<a id="118-13b"></a>
#### 118.13b
If a cost paid during the resolution of a spell or ability contains a mana symbol that can be paid in multiple ways, the player paying that cost chooses how to pay for that symbol immediately before they pay that cost.

<a id="118-13c"></a>
#### 118.13c
If the cost associated with a special action contains a mana symbol that can be paid in multiple ways, the player taking the special action chooses how to pay for that symbol immediately before they pay that cost.

<a id="118-14"></a>
### 118.14.
Some effects say that “mana of any type can be spent” to pay a cost. This means that players may spend mana as though it were colorless mana or mana of any color to pay that cost. If that effect also gives a player permission to cast spells, this applies only to mana that player spends to cast spells that way. See [rule 609.4b](#609-4b).

<a id="119"></a>
# 119. Life

<a id="119-1"></a>
### 119.1.
Each player begins the game with a starting life total of 20. Some variant games have different starting life totals.

<a id="119-1a"></a>
#### 119.1a
In a Two-Headed Giant game, each team’s starting life total is 30. See rule 810, “Two-Headed Giant Variant.”

<a id="119-1b"></a>
#### 119.1b
In a Vanguard game, each player’s starting life total is 20 plus or minus the life modifier of their vanguard card. See rule 902, “Vanguard.”

<a id="119-1c"></a>
#### 119.1c
In a Commander game, each player’s starting life total is 40. See rule 903, “Commander.”

119.1d. In a two-player Brawl game, each player’s starting life total is 25. In a multiplayer Brawl game, each player’s starting life total is 30. See [rule 903.12](#903-12), “Brawl Option.”

<a id="119-1e"></a>
#### 119.1e
In an Archenemy game, the archenemy’s starting life total is 40. See rule 904, “Archenemy.”

<a id="119-2"></a>
### 119.2.
Damage dealt to a player normally causes that player to lose that much life. See [rule 120.3](#120-3).

<a id="119-3"></a>
### 119.3.
If an effect causes a player to gain life or lose life, that player’s life total is adjusted accordingly.

<a id="119-4"></a>
### 119.4.
If a cost or effect allows a player to pay an amount of life greater than 0, the player may do so only if their life total is greater than or equal to the amount of the payment. If a player pays life, the payment is subtracted from their life total; in other words, the player loses that much life.

<a id="119-4a"></a>
#### 119.4a
If a cost or effect allows a player to pay an amount of life greater than 0 in a Two-Headed Giant game, the player may do so only if their team’s life total is greater than or equal to the total amount of life both team members are paying for that cost or effect. If a player pays life, the payment is subtracted from their team’s life total.

<a id="119-4b"></a>
#### 119.4b
Players can always pay 0 life, no matter what their (or their team’s) life total is, and even if an effect says players can’t pay life.

<a id="119-5"></a>
### 119.5.
If an effect sets a player’s life total to a specific number, the player gains or loses the necessary amount of life to end up with the new total.

<a id="119-6"></a>
### 119.6.
If a player has 0 or less life, that player loses the game as a state-based action. See rule 704.

<a id="119-7"></a>
### 119.7.
If an effect says that a player can’t gain life, that player can’t make an exchange such that the player’s life total would become higher; in that case, the exchange won’t happen. Similarly, if an effect redistributes life totals, a player can’t receive a new life total such that the player’s life total would become higher. In addition, a cost that involves having that player gain life can’t be paid, and a replacement effect that would replace a life gain event affecting that player won’t do anything.

<a id="119-8"></a>
### 119.8.
If an effect says that a player can’t lose life, that player can’t make an exchange such that the player’s life total would become lower; in that case, the exchange won’t happen. Similarly, if an effect redistributes life totals, a player can’t receive a new life total such that the player’s life total would become lower. In addition, a cost that involves having that player pay life can’t be paid.

<a id="119-9"></a>
### 119.9.
Some triggered abilities are written, “Whenever [a player] gains life, . . . .” Such abilities are treated as though they are written, “Whenever a source causes [a player] to gain life, . . . .” If a player gains 0 life, no life gain event has occurred, and these abilities won’t trigger.

<a id="119-10"></a>
### 119.10.
Some replacement effects are written, “If [a player] would gain life, . . . .” Such abilities are treated as though they are written, “If a source would cause [a player] to gain life, . . . .” If a player gains 0 life, no life gain event would occur, and these effects won’t apply.

<a id="120"></a>
# 120. Damage

<a id="120-1"></a>
### 120.1.
Objects can deal damage to battles, creatures, planeswalkers, and players. This is generally detrimental to the object or player that receives that damage. An object that deals damage is the source of that damage.

<a id="120-1a"></a>
#### 120.1a
Damage can’t be dealt to an object that’s not a battle, a creature, or a planeswalker.

<a id="120-2"></a>
### 120.2.
Any object can deal damage.

<a id="120-2a"></a>
#### 120.2a
Damage may be dealt as a result of combat. Each attacking and blocking creature deals combat damage equal to its power during the combat damage step.

<a id="120-2b"></a>
#### 120.2b
Damage may be dealt as an effect of a spell or ability. The spell or ability will specify which object deals that damage.

<a id="120-3"></a>
### 120.3.
Damage may have one or more of the following results, depending on whether the recipient of the damage is a player or permanent, the characteristics of the damage’s source, and the characteristics of the damage’s recipient (if it’s a permanent).

<a id="120-3a"></a>
#### 120.3a
Damage dealt to a player by a source without infect causes that player to lose that much life.

<a id="120-3b"></a>
#### 120.3b
Damage dealt to a player by a source with infect causes that source’s controller to give the player that many poison counters.

<a id="120-3c"></a>
#### 120.3c
Damage dealt to a planeswalker causes that many loyalty counters to be removed from that planeswalker.

<a id="120-3d"></a>
#### 120.3d
Damage dealt to a creature by a source with wither and/or infect causes that source’s controller to put that many -1/-1 counters on that creature.

<a id="120-3e"></a>
#### 120.3e
Damage dealt to a creature by a source with neither wither nor infect causes that much damage to be marked on that creature.

<a id="120-3f"></a>
#### 120.3f
Damage dealt by a source with lifelink causes that source’s controller to gain that much life, in addition to the damage’s other results.

<a id="120-3g"></a>
#### 120.3g
Combat damage dealt to a player by a creature with toxic causes that creature’s controller to give the player a number of poison counters equal to that creature’s total toxic value, in addition to the damage’s other results. See [rule 702.164](#702-164), “Toxic.”

<a id="120-3h"></a>
#### 120.3h
Damage dealt to a battle causes that many defense counters to be removed from that battle.

<a id="120-4"></a>
### 120.4.
Damage is processed in a four-part sequence.

<a id="120-4a"></a>
#### 120.4a
First, if an effect that’s causing damage to be dealt states that excess damage that would be dealt to a permanent is dealt to another permanent or player instead, the damage event is modified accordingly. If the first permanent is a creature, the excess damage is the amount of damage in excess of what would be lethal damage, taking into account damage already marked on the creature and damage from other sources that would be dealt at the same time. (See [rule 120.6](#120-6).) Any amount of damage greater than 1 is excess damage if the source dealing that damage to a creature has deathtouch. (See [rule 702.2](#702-2).) If the first permanent is a planeswalker, the excess damage is the amount of damage in excess of that planeswalker’s loyalty, taking into account damage from other sources that would be dealt at the same time. If the first permanent is a battle, the excess damage is the amount of damage in excess of that battle’s defense, taking into account damage from other sources that would be dealt at the same time. If the first permanent has multiple card types from among the list of creature, planeswalker, and battle, the excess damage is the greatest of the calculated amounts for each of the card types it has.

<a id="120-4b"></a>
#### 120.4b
Second, damage is dealt, as modified by replacement and prevention effects that interact with damage. (See rule 614, “Replacement Effects,” and rule 615, “Prevention Effects.”) Abilities that trigger when damage is dealt trigger now and wait to be put on the stack.

<a id="120-4c"></a>
#### 120.4c
Third, damage that’s been dealt is processed into its results, as modified by replacement effects that interact with those results (such as life loss or counters).

<a id="120-4d"></a>
#### 120.4d
Finally, the damage event occurs.
> Example: A player who controls Boon Reflection, an enchantment that says “If you would gain life, you gain twice that much life instead,” attacks with a 3/3 creature with wither and lifelink. It’s blocked by a 2/2 creature, and the defending player casts a spell that prevents the next 2 damage that would be dealt to the blocking creature. The damage event starts out as [3 damage is dealt to the 2/2 creature, 2 damage is dealt to the 3/3 creature]. The prevention effect is applied, so the damage event becomes [1 damage is dealt to the 2/2 creature, 2 damage is dealt to the 3/3 creature]. That’s processed into its results, so the damage event is now [one -1/-1 counter is put on the 2/2 creature, the active player gains 1 life, 2 damage is marked on the 3/3 creature]. Boon Reflection’s effect is applied, so the damage event becomes [one -1/-1 counter is put on the 2/2 creature, the active player gains 2 life, 2 damage is marked on the 3/3 creature]. Then the damage event occurs.
> Example: The defending player controls a creature and Worship, an enchantment that says “If you control a creature, damage that would reduce your life total to less than 1 reduces it to 1 instead.” That player is at 2 life, and is being attacked by two unblocked 5/5 creatures. The player casts Awe Strike, which says “The next time target creature would deal damage this turn, prevent that damage. You gain life equal to the damage prevented this way,” targeting one of the attackers. The damage event starts out as [10 damage is dealt to the defending player]. Awe Strike’s effect is applied, so the damage event becomes [5 damage is dealt to the defending player, the defending player gains 5 life]. That’s processed into its results, so the damage event is now [the defending player loses 5 life, the defending player gains 5 life]. Worship’s effect sees that the damage event would not reduce the player’s life total to less than 1, so Worship’s effect is not applied. Then the damage event occurs.

<a id="120-5"></a>
### 120.5.
Damage dealt to a creature, planeswalker, or battle doesn’t destroy it. Likewise, the source of that damage doesn’t destroy it. Rather, state-based actions may destroy a creature or otherwise put a permanent into its owner’s graveyard, due to the results of the damage dealt to that permanent. See rule 704.
> Example: A player casts Lightning Bolt, an instant that says “Lightning Bolt deals 3 damage to any target,” targeting a 2/2 creature. After Lightning Bolt deals 3 damage to that creature, the creature is destroyed as a state-based action. Neither Lightning Bolt nor the damage dealt by Lightning Bolt destroyed that creature.

<a id="120-6"></a>
### 120.6.
Damage marked on a creature remains until the cleanup step, even if that permanent stops being a creature. If the total damage marked on a creature is greater than or equal to its toughness, that creature has been dealt lethal damage and is destroyed as a state-based action (see rule 704). All damage marked on a permanent is removed when it regenerates (see [rule 701.19](#701-19), “Regenerate”) and during the cleanup step (see [rule 514.2](#514-2)).

<a id="120-7"></a>
### 120.7.
The source of damage is the object that dealt it. If an effect requires a player to choose a source of damage, they may choose a permanent; a spell on the stack (including a permanent spell); any object referred to by an object on the stack, by a prevention or replacement effect that’s waiting to apply, or by a delayed triggered ability that’s waiting to trigger (even if that object is no longer in the zone it used to be in); or a face-up object in the command zone. A source doesn’t need to be capable of dealing damage to be a legal choice. See [rule 609.7](#609-7), “Sources of Damage.”

<a id="120-8"></a>
### 120.8.
If a source would deal 0 damage, it does not deal damage at all. That means abilities that trigger on damage being dealt won’t trigger. It also means that replacement effects that would increase the damage dealt by that source, or would have that source deal that damage to a different object or player, have no event to replace, so they have no effect.

<a id="120-9"></a>
### 120.9.
If an ability triggers on damage being dealt by a specific source or sources, and the effect refers to the “damage dealt,” it refers only to the damage dealt by the specified sources and not to any damage dealt at the same time by other sources.

<a id="120-10"></a>
### 120.10.
Some triggered abilities check whether a permanent has been dealt excess damage. These abilities check after the permanent has been dealt damage by one or more sources. If those sources together dealt an amount of damage to a creature greater than lethal damage, excess damage equal to the difference was dealt to that creature. If those sources together dealt an amount of damage to a planeswalker greater than that planeswalker’s loyalty before the damage was dealt, excess damage equal to the difference was dealt to that planeswalker. If those sources together dealt an amount of damage to a battle greater than that battle’s defense before the damage was dealt, excess damage equal to the difference was dealt to that battle. If a permanent has multiple card types from among the list of creature, planeswalker, and battle, the excess damage dealt to that permanent is the greatest of the calculated amounts for each of the card types it has.

<a id="121"></a>
# 121. Drawing a Card

<a id="121-1"></a>
### 121.1.
A player draws a card by putting the top card of their library into their hand. This is done as a turn-based action during each player’s draw step. It may also be done as part of a cost or effect of a spell or ability.

<a id="121-2"></a>
### 121.2.
Cards may only be drawn one at a time. If a player is instructed to draw multiple cards, that player performs that many individual card draws.

<a id="121-2a"></a>
#### 121.2a
An instruction to draw multiple cards can be modified by replacement effects that refer to the number of cards drawn. This modification occurs before considering any of the individual card draws. See [rule 616.1g](#616-1g).

<a id="121-2b"></a>
#### 121.2b
Some effects say that a player can’t draw more than one card each turn. Such an effect applies to individual card draws. Instructions to draw multiple cards may still be partially carried out. However, if an effect offers the player a choice to draw multiple cards, the affected player can’t choose to do so. Similarly, the player can’t pay a cost that includes drawing multiple cards.

<a id="121-2c"></a>
#### 121.2c
If more than one player is instructed to draw cards, the active player performs all of their draws first, then each other player in turn order does the same.

<a id="121-2d"></a>
#### 121.2d
If more than one player is instructed to draw cards in a game that’s using the shared team turns option (such as a Two-Headed Giant game), first each player on the active team, in whatever order that team likes, performs their draws, then each player on each nonactive team in turn order does the same.

<a id="121-3"></a>
### 121.3.
If there are no cards in a player’s library and an effect offers that player the choice to draw a card, that player can choose to do so. However, if an effect says that a player can’t draw cards and another effect offers that player the choice to draw a card, that player can’t choose to do so.

<a id="121-3a"></a>
#### 121.3a
The same principles apply if the player who’s making the choice is not the player who would draw the card. If the latter player has no cards in their library, the choice can be taken. If an effect says that the latter player can’t draw a card, the choice can’t be taken.

<a id="121-4"></a>
### 121.4.
A player who attempts to draw a card from a library with no cards in it loses the game the next time a player would receive priority. (This is a state-based action. See rule 704.)

<a id="121-5"></a>
### 121.5.
If an effect moves cards from a player’s library to that player’s hand without using the word “draw,” the player has not drawn those cards. This makes a difference for abilities that trigger on drawing cards and effects that replace card draws, as well as if the player’s library is empty.

<a id="121-6"></a>
### 121.6.
Some effects replace card draws.

<a id="121-6a"></a>
#### 121.6a
An effect that replaces a card draw is applied even if no cards could be drawn because there are no cards in the affected player’s library.

<a id="121-6b"></a>
#### 121.6b
If an effect replaces a draw within a sequence of card draws, the replacement effect is completed before resuming the sequence.

<a id="121-6c"></a>
#### 121.6c
Some effects perform additional actions on a card after it’s drawn. If the draw is replaced, the additional action is not performed on any cards that are drawn as a result of that replacement effect or any subsequent replacement effects.

<a id="121-7"></a>
### 121.7.
Some replacement effects and prevention effects result in one or more card draws. In such a case, if there are any parts of the original event that haven’t been replaced, those parts occur first, then the card draws happen one at a time.

<a id="121-8"></a>
### 121.8.
If a spell or ability causes a card to be drawn while another spell is being cast, the drawn card is kept face down until that spell becomes cast (see [rule 601.2i](#601-2i)) or until the casting process is reversed (see rule 732, “Handling Illegal Actions”). The same is true with relation to another ability being activated. If an effect allows or instructs a player to reveal the card as it’s being drawn, it’s revealed after the spell becomes cast or the ability becomes activated. While face down, the drawn card is considered to have no characteristics and can’t be used to pay any part of the cost of the spell or ability that would require the card to have specific characteristics.

<a id="121-9"></a>
### 121.9.
If an effect gives a player the option to reveal a card as they draw it, that player may look at that card as they draw it before choosing whether to reveal it.

<a id="122"></a>

---

# END OF VERBATIM LAYER
