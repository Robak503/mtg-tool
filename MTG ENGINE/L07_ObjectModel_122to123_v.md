# Magic: The Gathering — Counters and Stickers
## LAYER 7: OBJECT MODEL LAYER — Verbatim (Rules 122–123)
## Effective February 27, 2026

---

SOURCES: 00_cr.md (February 27, 2026)
FEEDS INTO: L07_ObjectModel_122to123_t.md, L05_StateEnforcement_704_t.md, L00_Orchestration_game_engine.md

---

# 122. Counters

## 122.1.
A counter is a marker placed on an object or player that modifies its characteristics and/or interacts with a rule, ability, or effect. Counters are not objects and have no characteristics. Notably, a counter is not a token, and a token is not a counter. Counters with the same name or description are interchangeable.

### 122.1a
A +X/+Y counter on a creature or on a creature card in a zone other than the battlefield, where X and Y are numbers, adds X to that object's power and Y to that object's toughness. Similarly, -X/-Y counters subtract from power and toughness. See rule 613.4c.

### 122.1b
A keyword counter on a permanent or on a card in a zone other than the battlefield causes that object to gain that keyword. The keywords that a keyword counter can be are flying, first strike, double strike, deathtouch, decayed, exalted, haste, hexproof, indestructible, lifelink, menace, reach, shadow, trample, and vigilance, as well as any variants of those keywords. See rule 613.1f.

### 122.1c
One or more shield counters on a permanent create a single replacement effect and a single prevention effect that protect the permanent. These effects are "If this permanent would be destroyed as the result of an effect, instead remove a shield counter from it" and "If damage would be dealt to this permanent, prevent that damage and remove a shield counter from it." See rule 614, "Replacement Effects," and rule 615, "Prevention Effects."

### 122.1d
One or more stun counters on a permanent create a single replacement effect that stops the permanent from untapping. That effect is "If a permanent with a stun counter on it would become untapped, instead remove a stun counter from it."

### 122.1e
The number of loyalty counters on a planeswalker on the battlefield indicates how much loyalty it has. A planeswalker with 0 loyalty is put into its owner's graveyard as a state-based action. See rule 704.

### 122.1f
If a player has ten or more poison counters, that player loses the game as a state-based action. See rule 704. A player is "poisoned" if they have one or more poison counters. (See rule 810 for additional rules for Two-Headed Giant games.)

### 122.1g
The number of defense counters on a battle on the battlefield indicates how much defense it has. A battle with 0 defense is put into its owner's graveyard if it isn't the source of an ability that has triggered but not yet left the stack. This state-based action doesn't use the stack. See rule 704.

### 122.1h
One or more finality counters on a permanent create a single replacement effect that stops the permanent from going to the graveyard. That effect is "If this permanent would be put into a graveyard from the battlefield, exile it instead."

### 122.1i
One or more rad counters on a player cause a triggered ability to trigger at the beginning of that player's precombat main phase. See rule 727, "Rad Counters."

## 122.2.
Counters on an object are not retained if that object moves from one zone to another. The counters are not "removed"; they simply cease to exist. See rule 400.7.

## 122.3.
If a permanent has both a +1/+1 counter and a -1/-1 counter on it, N +1/+1 and N -1/-1 counters are removed from it as a state-based action, where N is the smaller of the number of +1/+1 and -1/-1 counters on it. See rule 704.

## 122.4.
If a permanent with an ability that says it can't have more than N counters of a certain kind on it has more than N counters of that kind on it, all but N of those counters are removed from it as a state-based action. See rule 704.

## 122.5.
If an effect says to "move" a counter, it means to remove that counter from the object it's currently on and put it onto a second object. If either of these actions isn't possible, it's not possible to move a counter, and no counter is removed from or put onto anything. This may occur if the first and second objects are the same object; if the first object doesn't have the appropriate kind of counter on it; if the second object can't have counters put onto it; or if either object is no longer in the correct zone.

## 122.6.
Some spells and abilities refer to counters being put on an object. This refers to putting counters on that object while it's on the battlefield and also to an object that's given counters as it enters the battlefield.

### 122.6a
If an object enters the battlefield with counters on it, the effect causing the object to be given counters may specify which player puts those counters on it. If the effect doesn't specify a player, the object's controller puts those counters on it.

## 122.7.
An ability that triggers "When/Whenever the Nth [kind] counter" is put on an object triggers when one or more counters of the appropriate kind are put on the object such that the object had fewer than N counters on it before the counters were put on it and N or more counters on it after.

## 122.8.
If a triggered ability instructs a player to put one object's counters on another object and that ability's trigger condition or effect checks that the object with those counters left the battlefield, the player doesn't move counters from one object to the other. Rather, the player puts the same number of each kind of counter the first object had onto the second object. If the ability specifies what kind(s) of counters to place, the player puts the same number of each of those kinds of counter the first object had onto the second object.

## 122.9.
If an activated ability of an object instructs a player to put its counters on another object and sacrificing the object with those counters is a cost to activate that ability, the player doesn't move counters from one object to the other. Rather, the player puts the same number of each kind of counter the first object had onto the second object. If the ability specified what kind(s) of counters to place, the player puts the same number of each of those kinds of counters the first object had onto the second object.

---

# 123. Stickers

## 123.1.
A sticker is a marker placed on an object that modifies its characteristics and/or interacts with a rule, ability, or effect. Stickers are not objects. Notably, a sticker is not a counter or a token. Changes to an object from stickers are not part of its copiable values. There are four kinds of stickers: name stickers; ability stickers; power and toughness stickers; and art stickers.

## 123.2.
Stickers are found in boosters of the Unfinity expansion on numbered inserts. Each insert has a predetermined combination of stickers. Any rule that refers to a sticker sheet refers to the specific combination of stickers found on one of those inserts. Sticker sheets are not cards and have no characteristics. Each sticker sheet can be found at Gatherer.Wizards.com.

### 123.2a
In constructed play, a player who chooses to play with stickers must start the game with at least ten sticker sheets selected before play begins, and each of their sticker sheets must be unique. There is no maximum number of sticker sheets a player may start the game with. Each player playing with sticker sheets reveals all of their sticker sheets and chooses three of them at random. See rule 103, "Starting the Game."

### 123.2b
In limited play, each player chooses up to three sticker sheets from among those in the sealed products they opened and reveals them. See rule 103, "Starting the Game."

### 123.2c
Each player has access to only the stickers on the chosen sheets during the game, and those sticker sheets remain revealed.

## 123.3.
If an effect instructs a player to put a sticker on an object, that player chooses a sticker that is not currently on any objects they own from among the stickers they have access to and puts it on that object.

### 123.3a
Each sticker a player has access to is discrete and is distinct from each other sticker they have access to. Two stickers are never considered to be the same sticker, even if they have the same text or information on them.

### 123.3b
A player can't put a sticker on an object that they don't own. If an effect would cause them to do so, that part of the effect does nothing.

### 123.3c
A sticker may have a ticket cost represented by a number inside a ticket symbol (see rule 107.17a). In order to put a sticker with a ticket cost on an object, the player who owns that object must pay that much {TK}. If they don't have that much {TK}, they can't put that sticker on an object.

### 123.3d
If a sticker that is already on an object is moved to another object, that sticker's ticket cost does not need to be paid again.

## 123.4.
Some rules and effects refer to a "stickered" object. An object is "stickered" if it currently has any kind of sticker on it. An object without any stickers on it is not a stickered object, even if it previously had stickers on it.

## 123.5.
Stickers on an object are not retained as that object moves to a hidden zone. Stickers are retained as that object moves to a public zone and continue to apply to the new object it becomes in that zone; this is an exception to rule 400.7.

### 123.5a
If one or more cards with stickers on them enter the battlefield as part of a melded permanent, all of those stickers are on the permanent that object becomes on the battlefield. They maintain their relative timestamp order.

### 123.5b
If an object with a sticker on it becomes a component of a merged permanent on the battlefield, that sticker is on that merged permanent.

### 123.5c
If a melded or merged permanent with one or more stickers on it moves from the battlefield to another public zone, only one of the objects it becomes will retain those stickers. Its owner chooses which of the objects it becomes in its new zone retains any stickers that are on it. Effects from those stickers will continue to apply to only that object.

## 123.6.
A name sticker consists only of one or more words. A name sticker on a permanent or on a card in a zone other than the battlefield causes the word on that sticker to be added to the text of that object's name. This is a text-changing effect. See rule 613.1c and rule 612, "Text-Changing Effects."

### 123.6a
For the purposes of rules and effects related to name stickers, a "word" in an object's name is any series of non-space characters that are separated from other non-space characters by one or more spaces. Hyphenated words and words with punctuation are considered to be one word. Blank lines, such as the one in "Wolf in ________ Clothing," are not considered words in a card's name.

### 123.6b
As a name sticker is placed on an object, that object's controller chooses a position in that object's name for the word in the name sticker to be added, then announces that object's new name. That word can be added at the beginning of the object's name or after any number of the other words that are currently in its name. The new name can be further modified by other name stickers. If that object has no name, its name becomes the word added by the name sticker. Name stickers never modify or remove any of the other words in that name.

> Example: As a player puts a name sticker with the word "Dark" printed on it onto a creature named Bear Cub, that creature's controller chooses whether its new name is "Dark Bear Cub," "Bear Dark Cub," or "Bear Cub Dark." They then announce the new name to all players.

### 123.6c
The text that a name sticker is modifying may change due to other effects and/or a permanent's face-down status (see rule 708, "Face-Down Spells and Permanents"). To determine the name of an object with one or more name stickers, start with the object's copiable values, then apply each name sticker's effect and each other text-changing effect in timestamp order. The position of each name sticker will continue to be after the number of words that were before it in the object's name when it was placed. If there are fewer words in the object's current name, the word on that sticker is added at the end of its name instead. The position and timestamp order of each name sticker on an object is remembered as the object that sticker is on moves from one public zone to another, and it continues to apply to the new object it becomes in that zone (see rule 123.5). This is an exception to rule 400.7.

> Example: Fae of Wishes, an adventurer card, is in exile with a name sticker on it adding the word "Mana" after its second word, so its name is "Fae of Mana Wishes." An effect allows that player to cast Granted, its Adventure, from exile. The name of that spell on the stack is "Granted Mana." After that card is exiled as the Adventure resolves, the sticker's position (after the second word) is remembered, so the name of the exiled card is once again "Fae of Mana Wishes."

> Example: A player owns a creature named It That Betrays on the battlefield. Using name stickers, they add the word "Eldrazi" to its name after the third word, such that its new name is "It That Betrays Eldrazi." Later, that creature becomes a copy of a creature named Seeker of the Way. The name sticker continues to apply after the third word, so its new name is "Seeker of the Eldrazi Way."

> Example: A creature with a name sticker on it becomes enchanted by Witness Protection, an Aura that changes the creature's name to "Legitimate Businessperson." Since Witness Protection is also a text-changing effect, and it has a later timestamp than the name sticker, the word on that name sticker is not part of the creature's name. Its name is "Legitimate Businessperson."

### 123.6d
Some effects refer to the number of one or more specific letters on a name sticker. A lowercase letter and its uppercase equivalent are the same letter.

### 123.6e
Some effects refer to the number of "unique vowels" on a name sticker. These count the number of different vowels that appear on that sticker, even if one or more of them appear more than once. The vowels are A, E, I, O, U, and Y. A lowercase letter and its uppercase equivalent are the same letter.

## 123.7.
An ability sticker is a sticker with one or more abilities printed on it. An ability sticker on a permanent or on a card in a zone other than the battlefield causes that object to gain the ability that is printed on that sticker. See rule 613.1f.

### 123.7a
If an effect refers to an ability of an ability sticker, it refers to the ability that sticker grants to the object it is on, even if the object it is on doesn't currently have that ability due to another effect.

## 123.8.
A power and toughness sticker is a sticker that has two numbers and a slash printed on it, resembling the power and toughness of a creature card. A power and toughness sticker on a creature or on a creature or Vehicle card in a zone other than the battlefield sets that object's power and toughness to the values printed on that sticker (see rule 613.4b). If more than one power and toughness sticker is on a creature, use timestamp order to determine which one takes precedence (see rule 613.7).

### 123.8a
An effect that refers to the power and/or toughness of a sticker refers only to the printed power and/or toughness values on a power and toughness sticker. It does not refer to any printed value on any other stickers.

## 123.9.
An art sticker on a permanent has no effect on game play other than to act as a marker that other spells and abilities can identify.

---

# END OF VERBATIM LAYER
