# Magic: The Gathering — Effects, One-Shot Effects
## L03: LAYER — Verbatim (Rules 609–610)
## Effective February 27, 2026

---

SOURCES: 00_cr.md (February 27, 2026)
FEEDS INTO: L03_Event_609to610_t.md, L03_Event_614to616_t.md

---

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
