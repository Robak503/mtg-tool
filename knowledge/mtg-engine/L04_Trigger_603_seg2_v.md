# Magic: The Gathering — Triggered Abilities
## TRUE VERBATIM LAYER — SEGMENT 2
## Rule[[603.4](00_Source_CR_2026-02-27_LINKED.md#603-4)](00_Source_CR_2026-02-27_LINKED.md#603-4)–[603.7](00_Source_CR_2026-02-27_LINKED.md#603-7)
## Effective February 27, 2026

---

SOURCES: 00_cr.md (February 27, 2026)

# [603.4](00_Source_CR_2026-02-27_LINKED.md#603-4).

A triggered ability may read “When/Whenever/At [trigger event], if [condition], [effect].” When the trigger event occurs, the ability checks whether the stated condition is true. The ability triggers only if it is; otherwise it does nothing. If the ability triggers, it checks the stated condition again as it resolves. If the condition isn’t true at that time, the ability is removed from the stack and does nothing. Note that this mirrors the check for legal targets. This rule is referred to as the “intervening ‘if’ clause” rule. (The word “if” has only its normal English meaning anywhere else in the text of a card; this rule only applies to an “if” that immediately follows a trigger condition.)

> Example: Felidar Sovereign reads, “At the beginning of your upkeep, if you have 40 or more life, you win the game.” Its controller’s life total is checked as that player’s upkeep begins. If that player has 39 or less life, the ability doesn’t trigger at all. If that player has 40 or more life, the ability triggers and goes on the stack. As the ability resolves, that player’s life total is checked again. If that player has 39 or less life at this time, the ability is removed from the stack and has no effect. If that player has 40 or more life at this time, the ability resolves and that player wins the game.

---

# [603.5](00_Source_CR_2026-02-27_LINKED.md#603-5).

Some triggered abilities’ effects are optional (they contain “may,” as in “At the beginning of your upkeep, you may draw a card”). These abilities go on the stack when they trigger, regardless of whether their controller intends to exercise the ability’s option or not. The choice is made when the ability resolves. Likewise, triggered abilities that have an effect “unless” something is true or a player chooses to do something will go on the stack normally; the “unless” part of the ability is dealt with when the ability resolves.

---

# [603.6](00_Source_CR_2026-02-27_LINKED.md#603-6).

Trigger events that involve objects changing zones are called “zone-change triggers.” Many abilities with zone-change triggers attempt to do something to that object after it changes zones. During resolution, these abilities look for the object in the zone that it moved to. If the object is unable to be found in the zone it went to, the part of the ability attempting to do something to the object will fail to do anything. The ability could be unable to find the object because the object never entered the specified zone, because it left the zone before the ability resolved, or because it is in a zone that is hidden from a player, such as a library or an opponent’s hand. (This rule applies even if the object leaves the zone and returns again before the ability resolves.) The most common zone-change triggers are enters-the-battlefield triggers and leaves-the-battlefield triggers.

## [603.6a](00_Source_CR_2026-02-27_LINKED.md#603-6a)

Enters-the-battlefield abilities trigger when a permanent enters the battlefield. These are written, “When [this object] enters, . . . “ or “Whenever a [type] enters, . . .” Each time an event puts one or more permanents onto the battlefield, all permanents on the battlefield (including the newcomers) are checked for any enters-the-battlefield triggers that match the event.

## [603.6b](00_Source_CR_2026-02-27_LINKED.md#603-6b)

Continuous effects that modify characteristics of a permanent do so the moment the permanent is on the battlefield (and not before then). The permanent is never on the battlefield with its unmodified characteristics. Continuous effects don’t apply before the permanent is on the battlefield, however (see rule[[603.6d](00_Source_CR_2026-02-27_LINKED.md#603-6d)](00_Source_CR_2026-02-27_LINKED.md#603-6d)).

> Example: If an effect reads “All lands are creatures” and a land card is played, the effect makes the land card into a creature the moment it enters the battlefield, so it would trigger abilities that trigger when a creature enters the battlefield. Conversely, if an effect reads “All creatures lose all abilities” and a creature card with an enters-the-battlefield triggered ability enters the battlefield, that effect will cause it to lose its abilities the moment it enters the battlefield, so the enters-the-battlefield ability won’t trigger.

## [603.6c](00_Source_CR_2026-02-27_LINKED.md#603-6c)

Leaves-the-battlefield abilities trigger when a permanent moves from the battlefield to another zone, or when a phased-in permanent leaves the game because its owner leaves the game. These are written as, but aren’t limited to, “When [this object] leaves the battlefield, . . .” or “Whenever [something] is put into a graveyard from the battlefield, . . . .” (See also rule[[603.10](00_Source_CR_2026-02-27_LINKED.md#603-10)](00_Source_CR_2026-02-27_LINKED.md#603-10).) An ability that attempts to do something to the card that left the battlefield checks for it only in the first zone that it went to. An ability that triggers when a card is put into a certain zone “from anywhere” is never treated as a leaves-the-battlefield ability, even if an object is put into that zone from the battlefield.

## [603.6d](00_Source_CR_2026-02-27_LINKED.md#603-6d)

Some permanents have text that reads “[This permanent] enters with . . . ,” “As [this permanent] enters . . . ,” “[This permanent] enters as . . . ,” or “[This permanent] enters tapped.” Such text is a static ability—not a triggered ability—whose effect occurs as part of the event that puts the permanent onto the battlefield.

## [603.6e](00_Source_CR_2026-02-27_LINKED.md#603-6e)

Some Auras have triggered abilities that trigger on the enchanted permanent leaving the battlefield. These triggered abilities can find the new object that permanent card became in the zone it moved to; they can also find the new object the Aura card became in its owner’s graveyard after state-based actions have been checked. See rule[[400.7](00_Source_CR_2026-02-27_LINKED.md#400-7)](00_Source_CR_2026-02-27_LINKED.md#400-7).

---

# [603.7](00_Source_CR_2026-02-27_LINKED.md#603-7).

An effect may create a delayed triggered ability that can do something at a later time. A delayed triggered ability will contain “when,” “whenever,” or “at,” although that word won’t usually begin the ability.

## [603.7a](00_Source_CR_2026-02-27_LINKED.md#603-7a)

Delayed triggered abilities are created during the resolution of spells or abilities, as the result of a replacement effect being applied, or as a result of a static ability that allows a player to take an action. A delayed triggered ability won’t trigger until it has actually been created, even if its trigger event occurred just beforehand. Other events that happen earlier may make the trigger event impossible.

> Example: Part of an effect reads “When this creature leaves the battlefield,” but the creature in question leaves the battlefield before the spell or ability creating the effect resolves. In this case, the delayed ability never triggers.

> Example: If an effect reads “When this creature becomes untapped” and the named creature becomes untapped before the effect resolves, the ability waits for the next time that creature untaps.

## [603.7b](00_Source_CR_2026-02-27_LINKED.md#603-7b)

A delayed triggered ability will trigger only once—the next time its trigger event occurs—unless it has a stated duration, such as “this turn.” If its trigger event occurs more than once simultaneously and the ability doesn’t have a stated duration, the controller of the delayed triggered ability chooses which event causes the ability to trigger.

## [603.7c](00_Source_CR_2026-02-27_LINKED.md#603-7c)

A delayed triggered ability that refers to a particular object still affects it even if the object changes characteristics. However, if that object is no longer in the zone it’s expected to be in at the time the delayed triggered ability resolves, the ability won’t affect it. (Note that if that object left that zone and then returned, it’s a new object and thus won’t be affected. See rule[[400.7](00_Source_CR_2026-02-27_LINKED.md#400-7)](00_Source_CR_2026-02-27_LINKED.md#400-7).)

> Example: An ability that reads “Exile this creature at the beginning of the next end step” will exile the permanent even if it’s no longer a creature during the next end step. However, it won’t do anything if the permanent left the battlefield before then.

## [603.7d](00_Source_CR_2026-02-27_LINKED.md#603-7d)

If a spell creates a delayed triggered ability, the source of that delayed triggered ability is that spell. The controller of that delayed triggered ability is the player who controlled that spell as it resolved.

## [603.7e](00_Source_CR_2026-02-27_LINKED.md#603-7e)

If an activated or triggered ability creates a delayed triggered ability, the source of that delayed triggered ability is the same as the source of that other ability. The controller of that delayed triggered ability is the player who controlled that other ability as it resolved.

## [603.7f](00_Source_CR_2026-02-27_LINKED.md#603-7f)

If a static ability generates a replacement effect which causes a delayed triggered ability to be created, the source of that delayed triggered ability is the object with that static ability. The controller of that delayed triggered ability is the same as the controller of that object at the time the replacement effect was applied.

## [603.7g](00_Source_CR_2026-02-27_LINKED.md#603-7g)

If a static ability allows a player to take an action and creates a delayed triggered ability if that player does so, the source of that delayed triggered ability is the object with that static ability. The controller of that delayed triggered ability is the same as the controller of that object at the time the action was taken.

## [603.7h](00_Source_CR_2026-02-27_LINKED.md#603-7h)

An activated or triggered ability may create a delayed triggered ability that triggers when the ability that created it has resolved a certain number of times in a turn. In that case, that delayed triggered ability is created only once, during the appropriate resolution of that ability.

---

# END OF TRUE VERBATIM LAYER
