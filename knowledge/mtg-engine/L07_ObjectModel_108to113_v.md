# Magic: The Gathering — Cards, Objects, Permanents, Tokens, Spells, Abilities
## LAYER 7: OBJECT MODEL LAYER — Verbatim (Rules 108–113)
## Effective February 27, 2026

---

SOURCES: 00_cr.md (February 27, 2026)
FEEDS INTO: L07_ObjectModel_108to113_t.md, L00_Orchestration_game_engine.md (§5.10), L04_Trigger_engine.md

---

# 108. Cards

## 108.1.
Use the Oracle card reference when determining a card's wording. A card's Oracle text can be found using the Gatherer card database at Gatherer.Wizards.com.

## 108.2.
When a rule or text on a card refers to a "card," it means only a Magic card or an object represented by a Magic card.

### 108.2a
Most Magic games use only traditional Magic cards, which measure approximately 2.5 inches (6.3 cm) by 3.5 inches (8.8 cm). Traditional Magic cards are included in players' decks. Certain formats also use nontraditional Magic cards. Nontraditional Magic cards are not included in players' decks. They may be used in supplementary decks. Additionally, they may be oversized, have different card backs, or both.

### 108.2b
Tokens aren't considered cards—even a card-sized game supplement that represents a token isn't considered a card for rules purposes.

## 108.3.
The owner of a card in the game is the player who started the game with it in their deck. If a card is brought into the game from outside the game rather than starting in a player's deck, its owner is the player who brought it into the game. If a card starts the game in the command zone, its owner is the player who put it into the command zone to start the game. Legal ownership of a card in the game is irrelevant to the game rules except for the rules for ante. (See rule 407.)

### 108.3a
In a Planechase game using the single planar deck option, the planar controller is considered to be the owner of all cards in the planar deck. See rule 901.6.

### 108.3b
Some spells and abilities allow a player to take cards they own from outside the game and bring them into the game. (See rule 400.11b.) If a card outside that game is involved in a Magic game, its owner is determined as described in rule 108.3. If a card outside that game is in the sideboard of a Magic game (see rule 100.4), its owner is considered to be the player who started the game with it in their sideboard. In all other cases, the owner of a card outside the game is its legal owner.

## 108.4.
A card doesn't have a controller unless that card represents a permanent or spell; in those cases, its controller is determined by the rules for permanents or spells. See rules 110.2 and 112.2.

### 108.4a
If anything asks for the controller of a card that doesn't have one (because it's not a permanent or spell), use its owner instead.

## 108.5.
Nontraditional Magic cards can't start the game in any zone other than the command zone (see rule 408). If an effect would bring a nontraditional Magic card other than a dungeon card (see rule 309, "Dungeons") into the game from outside the game, it doesn't; that card remains outside the game.

## 108.6.
For more information about cards, see section 2, "Parts of a Card."

---

# 109. Objects

## 109.1.
An object is an ability on the stack, a card, a copy of a card, a token, a spell, a permanent, or an emblem.

## 109.2.
If a spell or ability uses a description of an object that includes a card type or subtype, but doesn't refer to a specific zone or include the word "card," "spell," "source," or "scheme," it means a permanent of that card type or subtype on the battlefield.

### 109.2a
If a spell or ability uses a description of an object that includes the word "card" and the name of a zone, it means a card matching that description in the stated zone.

### 109.2b
If a spell or ability uses a description of an object that includes the word "spell," it means a spell matching that description on the stack.

### 109.2c
If a spell or ability uses a description of an object that includes the word "source," it means a source matching that description—a source of an ability, of damage, or of mana—in any zone. See rules 113.7 and 609.7.

### 109.2d
If an ability of a scheme card includes the text "this scheme," it means the scheme card in the command zone on which that ability is printed.

## 109.3.
An object's characteristics are name, mana cost, color, color indicator, card type, subtype, supertype, rules text, abilities, power, toughness, loyalty, defense, hand modifier, and life modifier. Objects can have some or all of these characteristics. Any other information about an object isn't a characteristic. For example, characteristics don't include whether a permanent is tapped, a spell's target, an object's owner or controller, what an Aura enchants, and so on.

## 109.4.
Only objects on the stack or on the battlefield have a controller. Objects that are neither on the stack nor on the battlefield aren't controlled by any player. See rule 108.4. There are six exceptions to this rule:

### 109.4a
The controller of a mana ability is determined as though it were on the stack. See rule 605, "Mana Abilities."

### 109.4b
A triggered ability that has triggered but is waiting to be placed on the stack is controlled by the player who controlled its source at the time it triggered, unless it's a delayed triggered ability. To determine the controller of a delayed triggered ability, see rules 603.7d–f. See also rule 603, "Handling Triggered Abilities."

### 109.4c
An emblem is controlled by the player who puts it into the command zone. See rule 114, "Emblems."

### 109.4d
In a Planechase game, a face-up plane or phenomenon card is controlled by the player designated as the planar controller. This is usually the active player. See rule 901.6.

### 109.4e
In a Vanguard game, each vanguard card is controlled by its owner. See rule 902.6.

### 109.4f
In an Archenemy game, each scheme card is controlled by its owner. See rule 904.7.

### 109.4g
In a Conspiracy Draft game, each conspiracy card is controlled by its owner. See rule 905.5.

## 109.5.
The words "you" and "your" on an object refer to the object's controller, its would-be controller (if a player is attempting to play, cast, or activate it), or its owner (if it has no controller). For a static ability, this is the current controller of the object it's on. For an activated ability, this is the player who activated the ability. For a triggered ability, this is the controller of the object when the ability triggered, unless it's a delayed triggered ability. To determine the controller of a delayed triggered ability, see rules 603.7d–f.

---

# 110. Permanents

## 110.1.
A permanent is a card or token on the battlefield. A permanent remains on the battlefield indefinitely. A card or token becomes a permanent as it enters the battlefield and it stops being a permanent as it's moved to another zone by an effect or rule.

## 110.2.
A permanent's owner is the same as the owner of the card that represents it (unless it's a token; see rule 111.2). A permanent's controller is, by default, the player under whose control it entered the battlefield. Every permanent has a controller.

### 110.2a
If an effect instructs a player to put an object onto the battlefield, that object enters the battlefield under that player's control unless the effect states otherwise.

### 110.2b
If an effect causes a player to gain control of another player's permanent spell, the first player controls the permanent that spell becomes, but the permanent's controller by default is the player who put that spell onto the stack. (This distinction is relevant in multiplayer games; see rule 800.4c.)

## 110.3.
A nontoken permanent's characteristics are the same as those printed on its card, as modified by any continuous effects. See rule 613, "Interaction of Continuous Effects."

## 110.4.
There are six permanent types: artifact, battle, creature, enchantment, land, and planeswalker. Instant and sorcery cards can't enter the battlefield and thus can't be permanents. Some kindred cards can enter the battlefield and some can't, depending on their other card types. See section 3, "Card Types."

### 110.4a
The term "permanent card" is used to refer to a card that could be put onto the battlefield. Specifically, it means an artifact, battle, creature, enchantment, land, or planeswalker card.

### 110.4b
The term "permanent spell" is used to refer to a spell that will enter the battlefield as a permanent as part of its resolution. Specifically, it means an artifact, battle, creature, enchantment, or planeswalker spell.

### 110.4c
If a permanent somehow loses all its permanent types, it remains on the battlefield. It's still a permanent.

## 110.5.
A permanent's status is its physical state. There are four status categories, each of which has two possible values: tapped/untapped, flipped/unflipped, face up/face down, and phased in/phased out. Each permanent always has one of these values for each of these categories.

### 110.5a
Status is not a characteristic, though it may affect a permanent's characteristics.

### 110.5b
Permanents enter the battlefield untapped, unflipped, face up, and phased in unless a spell or ability says otherwise.

### 110.5c
A permanent retains its status until a spell, ability, or turn-based action changes it, even if that status is not relevant to it.

> Example: Dimir Doppelganger says "{1}{U}{B}: Exile target creature card from a graveyard. This creature becomes a copy of that card, except it has this ability." It becomes a copy of Jushi Apprentice, a flip card. Through use of Jushi Apprentice's ability, this creature flips, making it a copy of Tomoya the Revealer with the Dimir Doppelganger ability. If this permanent then becomes a copy of Runeclaw Bear, it will retain its flipped status even though that has no relevance to Runeclaw Bear. If its copy ability is activated again, this time targeting a Nezumi Shortfang card (another flip card), this permanent's flipped status means it will have the characteristics of Stabwhisker the Odious (the flipped version of Nezumi Shortfang) with the Dimir Doppelganger ability.

### 110.5d
Only permanents have status. Cards not on the battlefield do not. Although an exiled card may be face down, this has no correlation to the face-down status of a permanent. Similarly, cards not on the battlefield are neither tapped nor untapped, regardless of their physical state.

---

# 111. Tokens

## 111.1.
Some effects put tokens onto the battlefield. A token is a marker used to represent any permanent that isn't represented by a card.

## 111.2.
The player who creates a token is its owner. The token enters the battlefield under that player's control.

## 111.3.
The spell or ability that creates a token may define the values of any number of characteristics for the token. This becomes the token's "text." The characteristic values defined this way are functionally equivalent to the characteristic values that are printed on a card; for example, they define the token's copiable values. A token doesn't have any characteristics not defined by the spell or ability that created it.

> Example: Jade Mage has the ability "{2}{G}: Create a 1/1 green Saproling creature token." The resulting token has no mana cost, supertypes, rules text, or abilities.

## 111.4.
A spell or ability that creates a token sets both its name and its subtype(s). If the spell or ability doesn't specify the name of the token, its name is the same as its subtype(s) plus the word "Token." Once a token is on the battlefield, changing its name doesn't change its subtype(s), and vice versa.

## 111.5.
If a spell or ability would create a token, but a rule or effect states that a permanent with one or more of that token's characteristics can't enter the battlefield, the token is not created. Similarly, if an effect would create a token that is a copy of an instant or sorcery card, no token is created.

## 111.6.
A token is subject to anything that affects permanents in general or that affects the token's card type or subtype. A token isn't a card (even if represented by a card that has a Magic back or that came from a Magic booster pack).

## 111.7.
A token that's in a zone other than the battlefield ceases to exist. This is a state-based action; see rule 704. (Note that if a token changes zones, applicable triggered abilities will trigger before the token ceases to exist.)

## 111.8.
A token that has left the battlefield can't move to another zone or come back onto the battlefield. If such a token would change zones, it remains in its current zone instead. It ceases to exist the next time state-based actions are checked; see rule 704.

## 111.9.
Some effects instruct a player to create a legendary token. These may be written "create [name], a . . ." and list characteristics for the token. This is the same as an instruction to create a token with the listed characteristics that has the given name.

## 111.10.
Some effects instruct a player to create a predefined token. These effects use the definition below to determine the characteristics the token is created with. The effect that creates a predefined token may also modify or add to the predefined characteristics.

### 111.10a
A Treasure token is a colorless Treasure artifact token with "{T}, Sacrifice this token: Add one mana of any color."

### 111.10b
A Food token is a colorless Food artifact token with "{2}, {T}, Sacrifice this token: You gain 3 life."

### 111.10c
A Gold token is a colorless Gold artifact token with "Sacrifice this token: Add one mana of any color."

### 111.10d
A Walker token is a 2/2 black Zombie creature token named Walker.

### 111.10e
A Shard token is a colorless Shard enchantment token with "{2}, Sacrifice this token: Scry 1, then draw a card."

### 111.10f
A Clue token is a colorless Clue artifact token with "{2}, Sacrifice this token: Draw a card."

### 111.10g
A Blood token is a colorless Blood artifact token with "{1}, {T}, Discard a card, Sacrifice this token: Draw a card."

### 111.10h
A Powerstone token is a colorless Powerstone artifact token with "{T}: Add {C}. This mana can't be spent to cast a nonartifact spell."

### 111.10i
An Incubator token is a double-faced token. Its front face is a colorless Incubator artifact with "{2}: Transform this token." Its back face is a 0/0 colorless Phyrexian artifact creature named Phyrexian Token.

### 111.10j
A Cursed Role token is a colorless Aura Role enchantment token named Cursed with enchant creature and "Enchanted creature has base power and toughness 1/1."

### 111.10k
A Monster Role token is a colorless Aura Role enchantment token named Monster with enchant creature and "Enchanted creature gets +1/+1 and has trample."

### 111.10m
A Royal Role token is a colorless Aura Role enchantment token named Royal with enchant creature and "Enchanted creature gets +1/+1 and has ward {1}."

### 111.10n
A Sorcerer Role token is a colorless Aura Role enchantment token named Sorcerer with enchant creature and "Enchanted creature gets +1/+1 and has 'Whenever this creature attacks, scry 1.'"

### 111.10p
A Virtuous Role token is a colorless Aura Role enchantment token named Virtuous with enchant creature and "Enchanted creature gets +1/+1 for each enchantment you control."

### 111.10q
A Wicked Role token is a colorless Aura Role enchantment token named Wicked with enchant creature, "Enchanted creature gets +1/+1," and "When this token is put into a graveyard from the battlefield, each opponent loses 1 life."

### 111.10r
A Young Hero Role token is a colorless Aura Role enchantment token named Young Hero with enchant creature and "Enchanted creature has 'Whenever this creature attacks, if its toughness is 3 or less, put a +1/+1 counter on it.'"

### 111.10s
A Map token is a colorless Map artifact token with "{1}, {T}, Sacrifice this token: Target creature you control explores. Activate only as a sorcery." See rule 701.44, "Explore."

### 111.10t
A Junk token is a colorless Junk artifact token with "{T}, Sacrifice this token: Exile the top card of your library. You may play that card this turn. Activate only as a sorcery."

### 111.10u
A Lander token is a colorless Lander artifact token with "{2}, {T}, Sacrifice this token: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle."

### 111.10v
A Mutagen token is a colorless Mutagen artifact token with "{1}, {T}, Sacrifice this token: Put a +1/+1 counter on target creature. Activate only as a sorcery."

## 111.11.
If an effect instructs a player to create a token by name, doesn't define any other characteristics for that token, and the name is not one of the types in the predefined list, that player uses the card with that name in the Oracle card reference to determine the characteristics of that token.

## 111.12.
If an effect instructs a player to create a token that is a copy of a nonexistent object, no token is created (see rule 707, "Copying Objects"). This does not apply to an effect that would use the last known information of an object.

## 111.13.
A copy of a permanent spell becomes a token as it resolves. The token has the characteristics of the spell that became that token. The token is not "created" for the purposes of any replacement effects or triggered abilities that refer to creating a token.

---

# 112. Spells

## 112.1.
A spell is a card on the stack. As the first step of being cast (see rule 601, "Casting Spells"), the card becomes a spell and is moved to the top of the stack from the zone it was in, which is usually its owner's hand. (See rule 405, "Stack.") A spell remains on the stack as a spell until it resolves (see rule 608, "Resolving Spells and Abilities"), is countered (see rule 701.6), or otherwise leaves the stack. For more information, see section 6, "Spells, Abilities, and Effects."

### 112.1a
A copy of a spell is also a spell, even if it has no card associated with it. See rule 707.10.

### 112.1b
Some effects allow a player to cast a copy of a card; if the player does, that copy is a spell as well. See rule 707.12.

## 112.2.
A spell's owner is the same as the owner of the card that represents it, unless it's a copy. In that case, the owner of the spell is the player under whose control it was put on the stack. A spell's controller is, by default, the player who put it on the stack. Every spell has a controller.

### 112.2a
Some effects instruct a player to create a copy of a card and say they may cast it. In that case, the owner of that copy is the player who is instructed to create it and given permission to cast it.

## 112.3.
A noncopy spell's characteristics are the same as those printed on its card, as modified by any continuous effects. See rule 613, "Interaction of Continuous Effects."

## 112.4.
If an effect of a resolving spell or ability changes any characteristics of a permanent spell, the effect continues to apply to the permanent when the spell resolves. See rule 400.7.

> Example: If an effect changes a black creature spell to white, the creature is white when it enters the battlefield and remains white for the duration of the effect changing its color.

---

# 113. Abilities

## 113.1.
An ability can be one of three things:

### 113.1a
An ability can be a characteristic an object has that lets it affect the game. An object's abilities are defined by its rules text or by the effect that created it. Abilities can also be granted to objects by rules or effects. (Effects that grant abilities usually use the words "has," "have," "gains," or "gain.") Abilities generate effects. (See rule 609, "Effects.")

### 113.1b
An ability can be something that a player has that changes how the game affects the player. A player normally has no abilities unless granted to that player by effects.

### 113.1c
An ability can be an activated or triggered ability on the stack. This kind of ability is an object. (See section 6, "Spells, Abilities, and Effects.")

## 113.2.
Abilities can affect the objects they're on. They can also affect other objects and/or players.

### 113.2a
Abilities can be beneficial or detrimental.

### 113.2b
An additional cost or alternative cost to cast a card is an ability of the card.

### 113.2c
An object may have multiple abilities. If the object is represented by a card, then aside from certain defined abilities that may be strung together on a single line (see rule 702, "Keyword Abilities"), each paragraph break in a card's text marks a separate ability. If the object is not represented by a card, the effect that created it may have given it multiple abilities. An object may also be granted additional abilities by a spell or ability. If an object has multiple instances of the same ability, each instance functions independently. This may or may not produce more effects than a single instance; refer to the specific ability for more information.

### 113.2d
Abilities can generate one-shot effects or continuous effects. Some continuous effects are replacement effects or prevention effects. See rule 609, "Effects."

## 113.3.
There are four general categories of abilities:

### 113.3a
Spell abilities are abilities that are followed as instructions while an instant or sorcery spell is resolving. Any text on an instant or sorcery spell is a spell ability unless it's an activated ability, a triggered ability, or a static ability that fits the criteria described in rule 113.6.

### 113.3b
Activated abilities have a cost and an effect. They are written as "[Cost]: [Effect.] [Activation instructions (if any).]" A player may activate such an ability whenever they have priority. Doing so puts it on the stack, where it remains until it's countered, it resolves, or it otherwise leaves the stack. See rule 602, "Activating Activated Abilities."

### 113.3c
Triggered abilities have a trigger condition and an effect. They are written as "[Trigger condition], [effect]," and include (and usually begin with) the word "when," "whenever," or "at." Whenever the trigger event occurs, the ability is put on the stack the next time a player would receive priority and stays there until it's countered, it resolves, or it otherwise leaves the stack. See rule 603, "Handling Triggered Abilities."

### 113.3d
Static abilities are written as statements. They're simply true. Static abilities create continuous effects which are active while the permanent with the ability is on the battlefield and has the ability, or while the object with the ability is in the appropriate zone. See rule 604, "Handling Static Abilities."

## 113.4.
Some activated abilities and some triggered abilities are mana abilities. Mana abilities follow special rules: They don't use the stack, and, under certain circumstances, a player can activate mana abilities even if they don't have priority. See rule 605, "Mana Abilities."

## 113.5.
Some activated abilities are loyalty abilities. Loyalty abilities follow special rules: A player may activate a loyalty ability of a permanent they control any time they have priority and the stack is empty during a main phase of their turn, but only if no player has previously activated a loyalty ability of that permanent that turn. See rule 606, "Loyalty Abilities."

## 113.6.
Abilities of an instant or sorcery spell usually function only while that object is on the stack. Abilities of all other objects usually function only while that object is on the battlefield. The exceptions are as follows:

### 113.6a
Characteristic-defining abilities function everywhere, even outside the game and before the game begins. (See rule 604.3.)

### 113.6b
An ability that states which zones it functions in functions only from those zones.

### 113.6c
An ability that states which zones it doesn't function in functions everywhere except for the specified zones, even outside the game and before the game begins.

### 113.6d
An object's ability that allows a player to pay an alternative cost rather than its mana cost or otherwise modifies what that particular object costs to cast functions on the stack.

### 113.6e
An object's ability that restricts or modifies how that particular object can be played or cast functions in any zone from which it could be played or cast and also on the stack. An object's ability that grants it another ability that restricts or modifies how that particular object can be played or cast functions only on the stack.

### 113.6f
An object's ability that restricts or modifies what zones that particular object can be played or cast from functions everywhere, even outside the game.

### 113.6g
An object's ability that states it can't be countered or can't be copied functions on the stack.

### 113.6h
An object's ability that modifies how that particular object enters the battlefield functions as that object is entering the battlefield. See rule 614.12.

### 113.6i
An object's ability that states counters can't be put on that object functions as that object is entering the battlefield in addition to functioning while that object is on the battlefield.

### 113.6j
An object's activated ability that has a cost that can't be paid while the object is on the battlefield functions from any zone in which its cost can be paid.

### 113.6k
A trigger condition that can't trigger from the battlefield functions in all zones it can trigger from. Other trigger conditions of the same triggered ability may function in different zones.

> Example: Absolver Thrull has the ability "When this creature enters or the creature it haunts dies, destroy target enchantment." The first trigger condition functions from the battlefield and the second trigger condition functions from the exile zone. (See rule 702.55, "Haunt.")

### 113.6m
An ability whose cost or effect specifies that it moves the object it's on out of a particular zone functions only in that zone, unless its trigger condition or a previous part of its cost or effect specifies that the object is put into that zone or, if the object is an Aura, that the object it enchants leaves the battlefield. The same is true if the effect of that ability creates a delayed triggered ability whose effect moves the object out of a particular zone.

> Example: Reassembling Skeleton says "{1}{B}: Return this card from your graveyard to the battlefield tapped." A player may activate this ability only if Reassembling Skeleton is in their graveyard.

### 113.6n
An ability that modifies the rules for deck construction functions before the game begins. Such an ability modifies not just the Comprehensive Rules, but also the Magic: The Gathering Tournament Rules and any other documents that set the deck construction rules for a specific format. However, such an ability can't affect the format legality of a card, including whether it's banned or restricted.

### 113.6p
Abilities of emblems, plane cards, vanguard cards, scheme cards, and conspiracy cards function in the command zone. See rule 114, "Emblems"; rule 901, "Planechase"; rule 902, "Vanguard"; rule 904, "Archenemy"; and rule 905, "Conspiracy Draft."

## 113.7.
The source of an ability is the object that generated it. The source of an activated ability on the stack is the object whose ability was activated. The source of a triggered ability (other than a delayed triggered ability) on the stack, or one that has triggered and is waiting to be put on the stack, is the object whose ability triggered. To determine the source of a delayed triggered ability, see rules 603.7d–f.

### 113.7a
Once activated or triggered, an ability exists on the stack independently of its source. Destruction or removal of the source after that time won't affect the ability. Note that some abilities cause a source to do something (for example, "This creature deals 1 damage to any target") rather than the ability doing anything directly. In these cases, any activated or triggered ability that references information about the source for use while announcing an activated ability or putting a triggered ability on the stack checks that information when the ability is put onto the stack. Otherwise, it will check that information when it resolves. In both instances, if the source is no longer in the zone it's expected to be in at that time, its last known information is used. The source can still perform the action even though it no longer exists.

## 113.8.
The controller of an activated ability on the stack is the player who activated it. The controller of a triggered ability on the stack (other than a delayed triggered ability) is the player who controlled the ability's source when it triggered, or, if it had no controller, the player who owned the ability's source when it triggered. To determine the controller of a delayed triggered ability, see rules 603.7d–f.

## 113.9.
Activated and triggered abilities on the stack aren't spells, and therefore can't be countered by anything that counters only spells. Activated and triggered abilities on the stack can be countered by effects that specifically counter abilities. Static abilities don't use the stack and thus can't be countered at all.

## 113.10.
Effects can add or remove abilities of objects. An effect that adds an ability will state that the object "gains" or "has" that ability, or similar. An effect that removes an ability will state that the object "loses" that ability.

### 113.10a
An effect that adds an activated ability may include activation instructions for that ability. These instructions become part of the ability that's added to the object.

### 113.10b
Effects that remove an ability remove all instances of it.

### 113.10c
If two or more effects add and remove the same ability, in general the most recent one prevails. See rule 613 for more information about the interaction of continuous effects.

## 113.11.
Effects can stop an object from having a specified ability. These effects say that the object "can't have" that ability. If the object has that ability, it loses it. It's also impossible for an effect or keyword counter to add that ability to the object. If a resolving spell or ability creates a continuous effect that would add the specified ability to such an object, that part of that continuous effect does not apply; however, other parts of that continuous effect will still apply, and that resolving spell or ability can still create other continuous effects. Continuous effects created by static abilities that would add the specified ability won't apply to that object.

## 113.12.
An effect that sets an object's characteristic, or simply states a quality of that object, is different from an ability granted by an effect. When an object "gains" or "has" an ability, that ability can be removed by another effect. If an effect defines a characteristic of the object ("[permanent] is [characteristic value]"), it's not granting an ability. (See rule 604.3.) Similarly, if an effect states a quality of that object ("[creature] can't be blocked," for example), it's neither granting an ability nor setting a characteristic.

> Example: Muraganda Petroglyphs reads, "Creatures with no abilities get +2/+2." A Runeclaw Bear (a creature with no abilities) enchanted by an Aura that says "Enchanted creature has flying" would not get +2/+2. A Runeclaw Bear enchanted by an Aura that says "Enchanted creature is red" or "Enchanted creature can't be blocked" would get +2/+2.

---

# END OF VERBATIM LAYER
