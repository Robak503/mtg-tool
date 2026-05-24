# Arbiter Engine - Expanded Knowledge Suite
## Generated rule-anchor scenarios for broad engine coverage
## Target: 424 expansion cases + 76 core cases = 500 total cases

Generated from local CR JSON and connected to the MTG ENGINE layer docs.
These are broad coverage tests, not replacements for the handcrafted core boss-fight scenarios in META_test_cases.md.

---

# CATEGORY S - Core Rules, Mana, Costs, Life, Damage, Counters

**Connected docs:**
- `L09_Constraint_100to104_v/t.md`
- `L06_PlayerAction_106_v/t.md`
- `L06_PlayerAction_118to121_v/t.md`
- `L07_ObjectModel_122to123_v/t.md`

## S1. Rule 101.4 anchor - If multiple players would make choices and/or take

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 101.4. Apply this rule text to the dispute: "If multiple players would make choices and/or take actions at the same time, the active player (the player whose turn it is) makes any choices required, then the next player in turn order (usually the player seated to the active player’s left) makes any choices required, followed by the remaining nonactive players in turn order. Then the actions happen simultaneously. This rule is often referred to as the “Active Player, Nonactive Player (APNAP) order” rule." Example to consider: A card reads “Each player sacrifices a creature.” First, the active player chooses a creature they control. Then each of the nonactive players, in turn order, chooses a creature they control. Then all creatures chosen this way are sacrificed simultaneously. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [101.4]: If multiple players would make choices and/or take actions at the same time, the active player (the player whose turn it is) makes any choices required, then the next player in turn order (usually the player seated to the active player’s left) makes any choices required, followed by the remaining nonactive players in turn order. Then the actions happen simultaneously. This rule is often referred to as the “Active Player, Nonactive Player (APNAP) order” rule. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [101.4].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[101.4]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S2. Rule 106.6 anchor - Some spells or abilities that produce mana restrict

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 106.6. Apply this rule text to the dispute: "Some spells or abilities that produce mana restrict how that mana can be spent, have an additional effect that affects the spell or ability that mana is spent on, or create a delayed triggered ability (see rule 603.7a) that triggers when that mana is spent. This doesn’t affect the mana’s type." Example to consider: A player’s mana pool contains {R}{G} which can be spent only to cast creature spells. That player activates Doubling Cube’s ability, which reads “{3}, {T}: Double the amount of each type of unspent mana you have.” The player’s mana pool now has {R}{R}{G}{G} in it, {R}{G} of which can be spent on anything. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [106.6]: Some spells or abilities that produce mana restrict how that mana can be spent, have an additional effect that affects the spell or ability that mana is spent on, or create a delayed triggered ability (see rule 603.7a) that triggers when that mana is spent. This doesn’t affect the mana’s type. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [106.6].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[106.6]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S3. Rule 118.12 anchor - Some spells activated abilities and triggered abilities read

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 118.12. Apply this rule text to the dispute: "Some spells, activated abilities, and triggered abilities read, “[Do something]. If [a player] [does, doesn’t, or can’t], [effect].” Or “[A player] may [do something]. If [that player] [does, doesn’t, or can’t], [effect].” The action [do something] is a cost, paid when the spell or ability resolves. The “If [a player] [does, doesn’t, or can’t]” clause checks whether the player chose to pay an optional cost or started to pay a mandatory cost, regardless of what events actually occurred." Example to consider: You control Standstill, an enchantment that says “When a player casts a spell, sacrifice this enchantment. If you do, each of that player’s opponents draws three cards.” A spell is cast, causing Standstill’s ability to trigger. Then an ability is activated that exiles Standstill. When Standstill’s ability resolves, you’re unable to pay the “sacrifice Stan... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [118.12]: Some spells, activated abilities, and triggered abilities read, “[Do something]. If [a player] [does, doesn’t, or can’t], [effect].” Or “[A player] may [do something]. If [that player] [does, doesn’t, or can’t], [effect].” The action [do something] is a cost, paid when the spell or ability resolves. The “If [a player] [does, doesn’t, or can’t]” clause checks whether the player chose to pay an optional cost or started to pay a mandatory cost, regardless of what events actually occurred. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [118.12].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[118.12]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S4. Rule 100.4 anchor - Each player may also have a sideboard which

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 100.4. Apply this rule text to the dispute: "Each player may also have a sideboard, which is a group of additional cards the player may use to modify their deck between games of a match. Sideboard rules and restrictions for some formats are modified by the Magic: The Gathering Tournament Rules (found at WPN.Wizards.com/en/rules-documents)." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [100.4]: Each player may also have a sideboard, which is a group of additional cards the player may use to modify their deck between games of a match. Sideboard rules and restrictions for some formats are modified by the Magic: The Gathering Tournament Rules (found at WPN.Wizards.com/en/rules-documents). The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [100.4].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[100.4]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S5. Rule 106.13 anchor - One card Drain Power causes one player to

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 106.13. Apply this rule text to the dispute: "One card (Drain Power) causes one player to lose unspent mana and another to add “the mana lost this way.” (Note that these may be the same player.) This empties the former player’s mana pool and causes the mana emptied this way to be put into the latter player’s mana pool. Which permanents, spells, and/or abilities produced that mana are unchanged, as are any restrictions or additional effects associated with any of that mana." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [106.13]: One card (Drain Power) causes one player to lose unspent mana and another to add “the mana lost this way.” (Note that these may be the same player.) This empties the former player’s mana pool and causes the mana emptied this way to be put into the latter player’s mana pool. Which permanents, spells, and/or abilities produced that mana are unchanged, as are any restrictions or additional effects associated with any of that mana. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [106.13].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[106.13]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S6. Rule 107.5 anchor - The tap symbol is T The tap symbol

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 107.5. Apply this rule text to the dispute: "The tap symbol is {T}. The tap symbol in an activation cost means “Tap this permanent.” A permanent that’s already tapped can’t be tapped again to pay the cost. A creature’s activated ability with the tap symbol in its activation cost can’t be activated unless the creature has been under its controller’s control continuously since their most recent turn began. See rule 302.6." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [107.5]: The tap symbol is {T}. The tap symbol in an activation cost means “Tap this permanent.” A permanent that’s already tapped can’t be tapped again to pay the cost. A creature’s activated ability with the tap symbol in its activation cost can’t be activated unless the creature has been under its controller’s control continuously since their most recent turn began. See rule 302.6. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [107.5].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[107.5]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S7. Rule 107.6 anchor - The untap symbol is Q The untap symbol

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 107.6. Apply this rule text to the dispute: "The untap symbol is {Q}. The untap symbol in an activation cost means “Untap this permanent.” A permanent that’s already untapped can’t be untapped again to pay the cost. A creature’s activated ability with the untap symbol in its activation cost can’t be activated unless the creature has been under its controller’s control continuously since their most recent turn began. See rule 302.6." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [107.6]: The untap symbol is {Q}. The untap symbol in an activation cost means “Untap this permanent.” A permanent that’s already untapped can’t be untapped again to pay the cost. A creature’s activated ability with the untap symbol in its activation cost can’t be activated unless the creature has been under its controller’s control continuously since their most recent turn began. See rule 302.6. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [107.6].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[107.6]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S8. Rule 108.5 anchor - Nontraditional Magic cards can’t start the game in

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 108.5. Apply this rule text to the dispute: "Nontraditional Magic cards can’t start the game in any zone other than the command zone (see rule 408). If an effect would bring a nontraditional Magic card other than a dungeon card (see rule 309, “Dungeons”) into the game from outside the game, it doesn’t; that card remains outside the game." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [108.5]: Nontraditional Magic cards can’t start the game in any zone other than the command zone (see rule 408). If an effect would bring a nontraditional Magic card other than a dungeon card (see rule 309, “Dungeons”) into the game from outside the game, it doesn’t; that card remains outside the game. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [108.5].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[108.5]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S9. Rule 109.5 anchor - The words “you” and “your” on an object

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 109.5. Apply this rule text to the dispute: "The words “you” and “your” on an object refer to the object’s controller, its would-be controller (if a player is attempting to play, cast, or activate it), or its owner (if it has no controller). For a static ability, this is the current controller of the object it’s on. For an activated ability, this is the player who activated the ability. For a triggered ability, this is the controller of the object when the ability triggered, unless it’s a delayed triggered ability. To determine the controller of a delayed..." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [109.5]: The words “you” and “your” on an object refer to the object’s controller, its would-be controller (if a player is attempting to play, cast, or activate it), or its owner (if it has no controller). For a static ability, this is the current controller of the object it’s on. For an activated ability, this is the player who activated the ability. For a triggered ability, this is the controller of the object when the ability triggered, unless it’s a delayed triggered ability. To determine the controller of a delayed triggered ability, see rules 603.7d–f. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [109.5].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[109.5]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S10. Rule 111.5 anchor - If a spell or ability would create a

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 111.5. Apply this rule text to the dispute: "If a spell or ability would create a token, but a rule or effect states that a permanent with one or more of that token’s characteristics can’t enter the battlefield, the token is not created. Similarly, if an effect would create a token that is a copy of an instant or sorcery card, no token is created." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [111.5]: If a spell or ability would create a token, but a rule or effect states that a permanent with one or more of that token’s characteristics can’t enter the battlefield, the token is not created. Similarly, if an effect would create a token that is a copy of an instant or sorcery card, no token is created. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [111.5].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[111.5]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S11. Rule 111.8 anchor - A token that has left the battlefield can’t

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 111.8. Apply this rule text to the dispute: "A token that has left the battlefield can’t move to another zone or come back onto the battlefield. If such a token would change zones, it remains in its current zone instead. It ceases to exist the next time state-based actions are checked; see rule 704." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [111.8]: A token that has left the battlefield can’t move to another zone or come back onto the battlefield. If such a token would change zones, it remains in its current zone instead. It ceases to exist the next time state-based actions are checked; see rule 704. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [111.8].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[111.8]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S12. Rule 111.12 anchor - If an effect instructs a player to create

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 111.12. Apply this rule text to the dispute: "If an effect instructs a player to create a token that is a copy of a nonexistent object, no token is created (see rule 707, “Copying Objects”). This does not apply to an effect that would use the last known information of an object." Example to consider: Mimic Vat has a triggered ability whose effect gives you the option to exile a card and an activated ability that says “Create a token that’s a copy of a card exiled with this artifact. It gains haste. Exile it at the beginning of the next end step.” If no card has been exiled with Mimic Vat’s triggered ability, no token is created. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [111.12]: If an effect instructs a player to create a token that is a copy of a nonexistent object, no token is created (see rule 707, “Copying Objects”). This does not apply to an effect that would use the last known information of an object. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [111.12].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[111.12]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S13. Rule 112.2 anchor - A spell’s owner is the same as the

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 112.2. Apply this rule text to the dispute: "A spell’s owner is the same as the owner of the card that represents it, unless it’s a copy. In that case, the owner of the spell is the player under whose control it was put on the stack. A spell’s controller is, by default, the player who put it on the stack. Every spell has a controller." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [112.2]: A spell’s owner is the same as the owner of the card that represents it, unless it’s a copy. In that case, the owner of the spell is the player under whose control it was put on the stack. A spell’s controller is, by default, the player who put it on the stack. Every spell has a controller. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [112.2].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[112.2]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S14. Rule 112.4 anchor - If an effect of a resolving spell or

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 112.4. Apply this rule text to the dispute: "If an effect of a resolving spell or ability changes any characteristics of a permanent spell, the effect continues to apply to the permanent when the spell resolves. See rule 400.7." Example to consider: If an effect changes a black creature spell to white, the creature is white when it enters the battlefield and remains white for the duration of the effect changing its color. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [112.4]: If an effect of a resolving spell or ability changes any characteristics of a permanent spell, the effect continues to apply to the permanent when the spell resolves. See rule 400.7. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [112.4].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[112.4]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S15. Rule 115.2 anchor - Only permanents are legal targets for spells and

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 115.2. Apply this rule text to the dispute: "Only permanents are legal targets for spells and abilities, unless a spell or ability (a) specifies that it can target an object in another zone or a player, or (b) targets an object that can’t exist on the battlefield, such as a spell or ability. See also rule 115.4." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [115.2]: Only permanents are legal targets for spells and abilities, unless a spell or ability (a) specifies that it can target an object in another zone or a player, or (b) targets an object that can’t exist on the battlefield, such as a spell or ability. See also rule 115.4. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [115.2].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[115.2]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S16. Rule 115.3 anchor - The same target can’t be chosen multiple times

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 115.3. Apply this rule text to the dispute: "The same target can’t be chosen multiple times for any one instance of the word “target” on a spell or ability. If the spell or ability uses the word “target” in multiple places, the same object or player can be chosen once for each instance of the word “target” (as long as it fits the targeting criteria). This rule applies both when choosing targets for a spell or ability and when changing targets or choosing new targets for a spell or ability (see rule 115.7)." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [115.3]: The same target can’t be chosen multiple times for any one instance of the word “target” on a spell or ability. If the spell or ability uses the word “target” in multiple places, the same object or player can be chosen once for each instance of the word “target” (as long as it fits the targeting criteria). This rule applies both when choosing targets for a spell or ability and when changing targets or choosing new targets for a spell or ability (see rule 115.7). The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [115.3].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[115.3]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S17. Rule 115.4 anchor - Some spells and abilities that refer to damage

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 115.4. Apply this rule text to the dispute: "Some spells and abilities that refer to damage require “any target,” “another target,” “two targets,” or similar rather than “target [something].” These targets may be creatures, players, planeswalkers, or battles. Other game objects, such as noncreature artifacts or spells, can’t be chosen." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [115.4]: Some spells and abilities that refer to damage require “any target,” “another target,” “two targets,” or similar rather than “target [something].” These targets may be creatures, players, planeswalkers, or battles. Other game objects, such as noncreature artifacts or spells, can’t be chosen. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [115.4].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[115.4]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S18. Rule 115.5 anchor - A spell or ability on the stack is

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 115.5. Apply this rule text to the dispute: "A spell or ability on the stack is an illegal target for itself." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [115.5]: A spell or ability on the stack is an illegal target for itself. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [115.5].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[115.5]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S19. Rule 118.6 anchor - Some objects have no mana cost This represents

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 118.6. Apply this rule text to the dispute: "Some objects have no mana cost. This represents an unpayable cost. An ability can also have an unpayable cost if its cost is based on the mana cost of an object with no mana cost. Attempting to cast a spell or activate an ability that has an unpayable cost is a legal action. However, attempting to pay an unpayable cost is an illegal action." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [118.6]: Some objects have no mana cost. This represents an unpayable cost. An ability can also have an unpayable cost if its cost is based on the mana cost of an object with no mana cost. Attempting to cast a spell or activate an ability that has an unpayable cost is a legal action. However, attempting to pay an unpayable cost is an illegal action. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [118.6].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[118.6]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S20. Rule 118.8 anchor - Some spells and abilities have additional costs An

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 118.8. Apply this rule text to the dispute: "Some spells and abilities have additional costs. An additional cost is a cost listed in a spell’s rules text, or applied to a spell or ability from another effect, that its controller must pay at the same time they pay the spell’s mana cost or the ability’s activation cost. Note that some additional costs are listed in keywords; see rule 702." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [118.8]: Some spells and abilities have additional costs. An additional cost is a cost listed in a spell’s rules text, or applied to a spell or ability from another effect, that its controller must pay at the same time they pay the spell’s mana cost or the ability’s activation cost. Note that some additional costs are listed in keywords; see rule 702. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [118.8].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[118.8]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S21. Rule 118.9 anchor - Some spells have alternative costs An alternative cost

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 118.9. Apply this rule text to the dispute: "Some spells have alternative costs. An alternative cost is a cost listed in a spell’s text, or applied to it from another effect, that its controller may pay rather than paying the spell’s mana cost. Alternative costs are usually phrased, “You may [action] rather than pay [this object’s] mana cost,” or “You may cast [this object] without paying its mana cost.” Note that some alternative costs are listed in keywords; see rule 702." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [118.9]: Some spells have alternative costs. An alternative cost is a cost listed in a spell’s text, or applied to it from another effect, that its controller may pay rather than paying the spell’s mana cost. Alternative costs are usually phrased, “You may [action] rather than pay [this object’s] mana cost,” or “You may cast [this object] without paying its mana cost.” Note that some alternative costs are listed in keywords; see rule 702. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [118.9].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[118.9]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S22. Rule 118.10 anchor - Each payment of a cost applies to only

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 118.10. Apply this rule text to the dispute: "Each payment of a cost applies to only one spell, ability, or effect. For example, a player can’t sacrifice just one creature to activate the activated abilities of two permanents that each require sacrificing a creature as a cost. Also, the resolution of a spell or ability doesn’t pay another spell or ability’s cost, even if part of its effect is doing the same thing the other cost asks for." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [118.10]: Each payment of a cost applies to only one spell, ability, or effect. For example, a player can’t sacrifice just one creature to activate the activated abilities of two permanents that each require sacrificing a creature as a cost. Also, the resolution of a spell or ability doesn’t pay another spell or ability’s cost, even if part of its effect is doing the same thing the other cost asks for. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [118.10].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[118.10]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S23. Rule 119.7 anchor - If an effect says that a player can’t

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 119.7. Apply this rule text to the dispute: "If an effect says that a player can’t gain life, that player can’t make an exchange such that the player’s life total would become higher; in that case, the exchange won’t happen. Similarly, if an effect redistributes life totals, a player can’t receive a new life total such that the player’s life total would become higher. In addition, a cost that involves having that player gain life can’t be paid, and a replacement effect that would replace a life gain event affecting that player won’t do anything." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [119.7]: If an effect says that a player can’t gain life, that player can’t make an exchange such that the player’s life total would become higher; in that case, the exchange won’t happen. Similarly, if an effect redistributes life totals, a player can’t receive a new life total such that the player’s life total would become higher. In addition, a cost that involves having that player gain life can’t be paid, and a replacement effect that would replace a life gain event affecting that player won’t do anything. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [119.7].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[119.7]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S24. Rule 120.5 anchor - Damage dealt to a creature planeswalker or battle

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 120.5. Apply this rule text to the dispute: "Damage dealt to a creature, planeswalker, or battle doesn’t destroy it. Likewise, the source of that damage doesn’t destroy it. Rather, state-based actions may destroy a creature or otherwise put a permanent into its owner’s graveyard, due to the results of the damage dealt to that permanent. See rule 704." Example to consider: A player casts Lightning Bolt, an instant that says “Lightning Bolt deals 3 damage to any target,” targeting a 2/2 creature. After Lightning Bolt deals 3 damage to that creature, the creature is destroyed as a state-based action. Neither Lightning Bolt nor the damage dealt by Lightning Bolt destroyed that creature. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [120.5]: Damage dealt to a creature, planeswalker, or battle doesn’t destroy it. Likewise, the source of that damage doesn’t destroy it. Rather, state-based actions may destroy a creature or otherwise put a permanent into its owner’s graveyard, due to the results of the damage dealt to that permanent. See rule 704. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [120.5].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[120.5]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S25. Rule 122.4 anchor - If a permanent with an ability that says

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 122.4. Apply this rule text to the dispute: "If a permanent with an ability that says it can’t have more than N counters of a certain kind on it has more than N counters of that kind on it, all but N of those counters are removed from it as a state-based action. See rule 704." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [122.4]: If a permanent with an ability that says it can’t have more than N counters of a certain kind on it has more than N counters of that kind on it, all but N of those counters are removed from it as a state-based action. See rule 704. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [122.4].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[122.4]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S26. Rule 122.5 anchor - If an effect says to “move” a counter

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 122.5. Apply this rule text to the dispute: "If an effect says to “move” a counter, it means to remove that counter from the object it’s currently on and put it onto a second object. If either of these actions isn’t possible, it’s not possible to move a counter, and no counter is removed from or put onto anything. This may occur if the first and second objects are the same object; if the first object doesn’t have the appropriate kind of counter on it; if the second object can’t have counters put onto it; or if either object is no longer in the correct zone." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [122.5]: If an effect says to “move” a counter, it means to remove that counter from the object it’s currently on and put it onto a second object. If either of these actions isn’t possible, it’s not possible to move a counter, and no counter is removed from or put onto anything. This may occur if the first and second objects are the same object; if the first object doesn’t have the appropriate kind of counter on it; if the second object can’t have counters put onto it; or if either object is no longer in the correct zone. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [122.5].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[122.5]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S27. Rule 123.5 anchor - Stickers on an object are not retained as

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 123.5. Apply this rule text to the dispute: "Stickers on an object are not retained as that object moves to a hidden zone. Stickers are retained as that object moves to a public zone and continue to apply to the new object it becomes in that zone; this is an exception to rule 400.7." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [123.5]: Stickers on an object are not retained as that object moves to a hidden zone. Stickers are retained as that object moves to a public zone and continue to apply to the new object it becomes in that zone; this is an exception to rule 400.7. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [123.5].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[123.5]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S28. Rule 100.5 anchor - If a deck must contain at least a

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 100.5. Apply this rule text to the dispute: "If a deck must contain at least a certain number of cards, that number is referred to as a minimum deck size. There is no maximum deck size for non-Commander decks." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [100.5]: If a deck must contain at least a certain number of cards, that number is referred to as a minimum deck size. There is no maximum deck size for non-Commander decks. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [100.5].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[100.5]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S29. Rule 101.2 anchor - When a rule or effect allows or directs

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 101.2. Apply this rule text to the dispute: "When a rule or effect allows or directs something to happen, and another effect states that it can’t happen, the “can’t” effect takes precedence." Example to consider: If one effect reads “You may play an additional land this turn” and another reads “You can’t play lands this turn,” the effect that precludes you from playing lands wins. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [101.2]: When a rule or effect allows or directs something to happen, and another effect states that it can’t happen, the “can’t” effect takes precedence. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [101.2].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[101.2]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S30. Rule 102.1 anchor - A player is one of the people in

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 102.1. Apply this rule text to the dispute: "A player is one of the people in the game. The active player is the player whose turn it is. The other players are nonactive players." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [102.1]: A player is one of the people in the game. The active player is the player whose turn it is. The other players are nonactive players. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [102.1].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[102.1]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S31. Rule 102.4 anchor - A spell or ability may use the term

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 102.4. Apply this rule text to the dispute: "A spell or ability may use the term “your team” as shorthand for “you and/or your teammates.” In a game that isn’t a multiplayer game between teams, “your team” means the same thing as “you.”" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [102.4]: A spell or ability may use the term “your team” as shorthand for “you and/or your teammates.” In a game that isn’t a multiplayer game between teams, “your team” means the same thing as “you.” The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [102.4].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[102.4]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S32. Rule 103.1 anchor - At the start of a game the players

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 103.1. Apply this rule text to the dispute: "At the start of a game, the players determine which one of them will choose who takes the first turn. In the first game of a match (including a single-game match), the players may use any mutually agreeable method (flipping a coin, rolling dice, etc.) to do so. In a match of several games, the loser of the previous game chooses who takes the first turn. If the previous game was a draw, the player who made the choice in that game makes the choice in this game. The player chosen to take the first turn is the start..." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [103.1]: At the start of a game, the players determine which one of them will choose who takes the first turn. In the first game of a match (including a single-game match), the players may use any mutually agreeable method (flipping a coin, rolling dice, etc.) to do so. In a match of several games, the loser of the previous game chooses who takes the first turn. If the previous game was a draw, the player who made the choice in that game makes the choice in this game. The player chosen to take the first turn is the starting player. The game’s default turn order begins with the starting player and proceeds clockwise. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [103.1].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[103.1]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S33. Rule 103.5 anchor - Each player draws a number of cards equal

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 103.5. Apply this rule text to the dispute: "Each player draws a number of cards equal to their starting hand size, which is normally seven. (Some effects can modify a player’s starting hand size.) A player who is dissatisfied with their initial hand may take a mulligan. First, the starting player declares whether they will take a mulligan. Then each other player in turn order does the same. Once each player has made a declaration, all players who decided to take mulligans do so at the same time. To take a mulligan, a player shuffles the cards in their han..." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [103.5]: Each player draws a number of cards equal to their starting hand size, which is normally seven. (Some effects can modify a player’s starting hand size.) A player who is dissatisfied with their initial hand may take a mulligan. First, the starting player declares whether they will take a mulligan. Then each other player in turn order does the same. Once each player has made a declaration, all players who decided to take mulligans do so at the same time. To take a mulligan, a player shuffles the cards in their hand back into their library, draws a new hand of cards equal to their starting hand size, then puts a number of those cards equal to the number of times that player has taken a mulli... The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [103.5].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[103.5]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S34. Rule 103.6 anchor - Some cards allow a player to take actions

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 103.6. Apply this rule text to the dispute: "Some cards allow a player to take actions with them from their opening hand. Once the mulligan process (see rule 103.5) is complete, the starting player may take any such actions in any order. Then each other player in turn order may do the same." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [103.6]: Some cards allow a player to take actions with them from their opening hand. Once the mulligan process (see rule 103.5) is complete, the starting player may take any such actions in any order. Then each other player in turn order may do the same. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [103.6].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[103.6]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S35. Rule 123.6c anchor - The text that a name sticker is modifying

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 123.6c. Apply this rule text to the dispute: "The text that a name sticker is modifying may change due to other effects and/or a permanent’s face-down status (see rule 708, “Face-Down Spells and Permanents”). To determine the name of an object with one or more name stickers, start with the object’s copiable values, then apply each name sticker’s effect and each other text-changing effect in timestamp order. The position of each name sticker will continue to be after the number of words that were before it in the object’s name when it was placed. If there ar..." Example to consider: Fae of Wishes, an adventurer card, is in exile with a name sticker on it adding the word “Mana” after its second word, so its name is “Fae of Mana Wishes.” An effect allows that player to cast Granted, its Adventure, from exile. The name of that spell on the stack is “Granted Mana.” After that card is exiled as the Adventure resolves, the sticker’s positi... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [123.6c]: The text that a name sticker is modifying may change due to other effects and/or a permanent’s face-down status (see rule 708, “Face-Down Spells and Permanents”). To determine the name of an object with one or more name stickers, start with the object’s copiable values, then apply each name sticker’s effect and each other text-changing effect in timestamp order. The position of each name sticker will continue to be after the number of words that were before it in the object’s name when it was placed. If there are fewer words in the object’s current name, the word on that sticker is added at the end of its name instead. The position and timestamp order of each name sticker on an object is... The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [123.6c].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[123.6c]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S36. Rule 107.1b anchor - Most of the time the Magic game uses

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 107.1b. Apply this rule text to the dispute: "Most of the time, the Magic game uses only positive numbers and zero. You can’t choose a negative number, deal negative damage, gain negative life, and so on. However, it’s possible for a game value, such as a creature’s power, to be less than zero. If a calculation or comparison needs to use a negative value, it does so. If a calculation that would determine the result of an effect yields a negative number, zero is used instead, unless that effect doubles, triples, or sets to a specific value a player’s life to..." Example to consider: If a 3/4 creature gets -5/-0, it’s a -2/4 creature. It doesn’t assign damage in combat. Its total power and toughness is 2. Giving it +3/+0 would raise its power to 1. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [107.1b]: Most of the time, the Magic game uses only positive numbers and zero. You can’t choose a negative number, deal negative damage, gain negative life, and so on. However, it’s possible for a game value, such as a creature’s power, to be less than zero. If a calculation or comparison needs to use a negative value, it does so. If a calculation that would determine the result of an effect yields a negative number, zero is used instead, unless that effect doubles, triples, or sets to a specific value a player’s life total or the power and/or toughness of a creature or creature card. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [107.1b].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[107.1b]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S37. Rule 113.6m anchor - An ability whose cost or effect specifies that

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 113.6m. Apply this rule text to the dispute: "An ability whose cost or effect specifies that it moves the object it’s on out of a particular zone functions only in that zone, unless its trigger condition or a previous part of its cost or effect specifies that the object is put into that zone or, if the object is an Aura, that the object it enchants leaves the battlefield. The same is true if the effect of that ability creates a delayed triggered ability whose effect moves the object out of a particular zone." Example to consider: Reassembling Skeleton says “{1}{B}: Return this card from your graveyard to the battlefield tapped.” A player may activate this ability only if Reassembling Skeleton is in their graveyard. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [113.6m]: An ability whose cost or effect specifies that it moves the object it’s on out of a particular zone functions only in that zone, unless its trigger condition or a previous part of its cost or effect specifies that the object is put into that zone or, if the object is an Aura, that the object it enchants leaves the battlefield. The same is true if the effect of that ability creates a delayed triggered ability whose effect moves the object out of a particular zone. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [113.6m].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[113.6m]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S38. Rule 120.4d anchor - Finally the damage event occurs

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 120.4d. Apply this rule text to the dispute: "Finally, the damage event occurs." Example to consider: A player who controls Boon Reflection, an enchantment that says “If you would gain life, you gain twice that much life instead,” attacks with a 3/3 creature with wither and lifelink. It’s blocked by a 2/2 creature, and the defending player casts a spell that prevents the next 2 damage that would be dealt to the blocking creature. The damage event starts o... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [120.4d]: Finally, the damage event occurs. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [120.4d].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[120.4d]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S39. Rule 110.5c anchor - A permanent retains its status until a spell

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 110.5c. Apply this rule text to the dispute: "A permanent retains its status until a spell, ability, or turn-based action changes it, even if that status is not relevant to it." Example to consider: Dimir Doppelganger says “{1}{U}{B}: Exile target creature card from a graveyard. This creature becomes a copy of that card, except it has this ability.” It becomes a copy of Jushi Apprentice, a flip card. Through use of Jushi Apprentice’s ability, this creature flips, making it a copy of Tomoya the Revealer with the Dimir Doppelganger ability. If this per... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [110.5c]: A permanent retains its status until a spell, ability, or turn-based action changes it, even if that status is not relevant to it. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [110.5c].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[110.5c]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S40. Rule 113.6k anchor - A trigger condition that can’t trigger from the

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 113.6k. Apply this rule text to the dispute: "A trigger condition that can’t trigger from the battlefield functions in all zones it can trigger from. Other trigger conditions of the same triggered ability may function in different zones." Example to consider: Absolver Thrull has the ability “When this creature enters or the creature it haunts dies, destroy target enchantment.” The first trigger condition functions from the battlefield and the second trigger condition functions from the exile zone. (See rule 702.55, “Haunt.”) What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [113.6k]: A trigger condition that can’t trigger from the battlefield functions in all zones it can trigger from. Other trigger conditions of the same triggered ability may function in different zones. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [113.6k].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[113.6k]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S41. Rule 115.1a anchor - An instant or sorcery spell is targeted if

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 115.1a. Apply this rule text to the dispute: "An instant or sorcery spell is targeted if its spell ability identifies something it will affect by using the phrase “target [something],” where the “something” is a phrase that describes an object and/or player. The target(s) are chosen as the spell is cast; see rule 601.2c. (If an activated or triggered ability of an instant or sorcery uses the word target, that ability is targeted, but the spell is not.)" Example to consider: A sorcery card has the ability “When you cycle this card, target creature gets -1/-1 until end of turn.” This triggered ability is targeted, but that doesn’t make the card it’s on targeted. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [115.1a]: An instant or sorcery spell is targeted if its spell ability identifies something it will affect by using the phrase “target [something],” where the “something” is a phrase that describes an object and/or player. The target(s) are chosen as the spell is cast; see rule 601.2c. (If an activated or triggered ability of an instant or sorcery uses the word target, that ability is targeted, but the spell is not.) The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [115.1a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[115.1a]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S42. Rule 115.7e anchor - When changing targets or choosing new targets for

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 115.7e. Apply this rule text to the dispute: "When changing targets or choosing new targets for a spell or ability, only the final set of targets is evaluated to determine whether the change is legal." Example to consider: Arc Trail is a sorcery that reads “Arc Trail deals 2 damage to any target and 1 damage to any other target.” The current targets of Arc Trail are Runeclaw Bear and Llanowar Elves, in that order. You cast Redirect, an instant that reads “You may choose new targets for target spell,” targeting Arc Trail. You can change the first target to Llanowar Elves and... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [115.7e]: When changing targets or choosing new targets for a spell or ability, only the final set of targets is evaluated to determine whether the change is legal. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [115.7e].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[115.7e]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S43. Rule 107.3a anchor - If a spell or activated ability has a

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 107.3a. Apply this rule text to the dispute: "If a spell or activated ability has a mana cost, alternative cost, additional cost, and/or activation cost with an {X}, [-X], or X in it, and the value of X isn’t defined by the text of that spell or ability, the controller of that spell or ability chooses and announces the value of X as part of casting the spell or activating the ability. (See rule 601, “Casting Spells.”) While a spell is on the stack, any X in its mana cost or in any alternative cost or additional cost it has equals the announced value. While..." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [107.3a]: If a spell or activated ability has a mana cost, alternative cost, additional cost, and/or activation cost with an {X}, [-X], or X in it, and the value of X isn’t defined by the text of that spell or ability, the controller of that spell or ability chooses and announces the value of X as part of casting the spell or activating the ability. (See rule 601, “Casting Spells.”) While a spell is on the stack, any X in its mana cost or in any alternative cost or additional cost it has equals the announced value. While an activated ability is on the stack, any X in its activation cost equals the announced value. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [107.3a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[107.3a]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S44. Rule 113.7a anchor - Once activated or triggered an ability exists on

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 113.7a. Apply this rule text to the dispute: "Once activated or triggered, an ability exists on the stack independently of its source. Destruction or removal of the source after that time won’t affect the ability. Note that some abilities cause a source to do something (for example, “This creature deals 1 damage to any target”) rather than the ability doing anything directly. In these cases, any activated or triggered ability that references information about the source for use while announcing an activated ability or putting a triggered ability on the stac..." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [113.7a]: Once activated or triggered, an ability exists on the stack independently of its source. Destruction or removal of the source after that time won’t affect the ability. Note that some abilities cause a source to do something (for example, “This creature deals 1 damage to any target”) rather than the ability doing anything directly. In these cases, any activated or triggered ability that references information about the source for use while announcing an activated ability or putting a triggered ability on the stack checks that information when the ability is put onto the stack. Otherwise, it will check that information when it resolves. In both instances, if the source is no longer in the z... The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [113.7a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[113.7a]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S45. Rule 107.3f anchor - Sometimes X appears in the text of a

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 107.3f. Apply this rule text to the dispute: "Sometimes X appears in the text of a spell or ability but not in a mana cost, alternative cost, additional cost, or activation cost. If the value of X isn’t defined, the controller of the spell or ability chooses the value of X at the appropriate time (either as it’s put on the stack or as it resolves)." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [107.3f]: Sometimes X appears in the text of a spell or ability but not in a mana cost, alternative cost, additional cost, or activation cost. If the value of X isn’t defined, the controller of the spell or ability chooses the value of X at the appropriate time (either as it’s put on the stack or as it resolves). The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [107.3f].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[107.3f]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S46. Rule 113.3b anchor - Activated abilities have a cost and an effect

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 113.3b. Apply this rule text to the dispute: "Activated abilities have a cost and an effect. They are written as “[Cost]: [Effect.] [Activation instructions (if any).]” A player may activate such an ability whenever they have priority. Doing so puts it on the stack, where it remains until it’s countered, it resolves, or it otherwise leaves the stack. See rule 602, “Activating Activated Abilities.”" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [113.3b]: Activated abilities have a cost and an effect. They are written as “[Cost]: [Effect.] [Activation instructions (if any).]” A player may activate such an ability whenever they have priority. Doing so puts it on the stack, where it remains until it’s countered, it resolves, or it otherwise leaves the stack. See rule 602, “Activating Activated Abilities.” The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [113.3b].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[113.3b]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S47. Rule 101.4a anchor - If an effect has each player choose a

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 101.4a. Apply this rule text to the dispute: "If an effect has each player choose a card in a hidden zone, such as their hand or library, those cards may remain face down as they’re chosen. However, each player must clearly indicate which face-down card they are choosing." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [101.4a]: If an effect has each player choose a card in a hidden zone, such as their hand or library, those cards may remain face down as they’re chosen. However, each player must clearly indicate which face-down card they are choosing. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [101.4a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[101.4a]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S48. Rule 107.4f anchor - Phyrexian mana symbols are colored mana symbols W/P

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 107.4f. Apply this rule text to the dispute: "Phyrexian mana symbols are colored mana symbols: {W/P} is white, {U/P} is blue, {B/P} is black, {R/P} is red, and {G/P} is green. A Phyrexian mana symbol represents a cost that can be paid either with one mana of its color or by paying 2 life. There are also ten hybrid Phyrexian mana symbols. A hybrid Phyrexian mana symbol represents a cost that can be paid with one mana of either of its component colors or by paying 2 life. A hybrid Phyrexian mana symbol is both of its component colors." Example to consider: {W/P}{W/P} can be paid by spending {W}{W}, by spending {W} and paying 2 life, or by paying 4 life. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [107.4f]: Phyrexian mana symbols are colored mana symbols: {W/P} is white, {U/P} is blue, {B/P} is black, {R/P} is red, and {G/P} is green. A Phyrexian mana symbol represents a cost that can be paid either with one mana of its color or by paying 2 life. There are also ten hybrid Phyrexian mana symbols. A hybrid Phyrexian mana symbol represents a cost that can be paid with one mana of either of its component colors or by paying 2 life. A hybrid Phyrexian mana symbol is both of its component colors. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [107.4f].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[107.4f]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S49. Rule 113.3c anchor - Triggered abilities have a trigger condition and an

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 113.3c. Apply this rule text to the dispute: "Triggered abilities have a trigger condition and an effect. They are written as “[Trigger condition], [effect],” and include (and usually begin with) the word “when,” “whenever,” or “at.” Whenever the trigger event occurs, the ability is put on the stack the next time a player would receive priority and stays there until it’s countered, it resolves, or it otherwise leaves the stack. See rule 603, “Handling Triggered Abilities.”" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [113.3c]: Triggered abilities have a trigger condition and an effect. They are written as “[Trigger condition], [effect],” and include (and usually begin with) the word “when,” “whenever,” or “at.” Whenever the trigger event occurs, the ability is put on the stack the next time a player would receive priority and stays there until it’s countered, it resolves, or it otherwise leaves the stack. See rule 603, “Handling Triggered Abilities.” The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [113.3c].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[113.3c]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S50. Rule 117.3a anchor - The active player receives priority at the beginning

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 117.3a. Apply this rule text to the dispute: "The active player receives priority at the beginning of most steps and phases, after any turn-based actions (such as drawing a card during the draw step; see rule 703) have been dealt with and abilities that trigger at the beginning of that phase or step have been put on the stack. No player receives priority during the untap step. Players usually don’t get priority during the cleanup step (see rule 514.3)." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [117.3a]: The active player receives priority at the beginning of most steps and phases, after any turn-based actions (such as drawing a card during the draw step; see rule 703) have been dealt with and abilities that trigger at the beginning of that phase or step have been put on the stack. No player receives priority during the untap step. Players usually don’t get priority during the cleanup step (see rule 514.3). The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [117.3a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[117.3a]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S51. Rule 122.1c anchor - One or more shield counters on a permanent

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 122.1c. Apply this rule text to the dispute: "One or more shield counters on a permanent create a single replacement effect and a single prevention effect that protect the permanent. These effects are “If this permanent would be destroyed as the result of an effect, instead remove a shield counter from it” and “If damage would be dealt to this permanent, prevent that damage and remove a shield counter from it.” See rule 614, “Replacement Effects,” and rule 615, “Prevention Effects.”" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [122.1c]: One or more shield counters on a permanent create a single replacement effect and a single prevention effect that protect the permanent. These effects are “If this permanent would be destroyed as the result of an effect, instead remove a shield counter from it” and “If damage would be dealt to this permanent, prevent that damage and remove a shield counter from it.” See rule 614, “Replacement Effects,” and rule 615, “Prevention Effects.” The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [122.1c].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[122.1c]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S52. Rule 106.6a anchor - Some replacement effects increase the amount of mana

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 106.6a. Apply this rule text to the dispute: "Some replacement effects increase the amount of mana produced by a spell or ability. In these cases, any restrictions or additional effects created by the spell or ability will apply to all mana produced. If the spell or ability creates a delayed triggered ability that triggers when the mana is spent, a separate delayed triggered ability is created for each mana produced. If the spell or ability creates a continuous effect or replacement effect if the mana is spent, a separate effect is created once for each man..." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [106.6a]: Some replacement effects increase the amount of mana produced by a spell or ability. In these cases, any restrictions or additional effects created by the spell or ability will apply to all mana produced. If the spell or ability creates a delayed triggered ability that triggers when the mana is spent, a separate delayed triggered ability is created for each mana produced. If the spell or ability creates a continuous effect or replacement effect if the mana is spent, a separate effect is created once for each mana produced. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [106.6a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[106.6a]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

## S53. Rule 116.2f anchor - A player who has a card with suspend

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a core rules, mana, costs, life, damage, counters dispute governed by rule 116.2f. Apply this rule text to the dispute: "A player who has a card with suspend in their hand may exile that card. This is a special action. A player can take this action any time they have priority, but only if they could begin to cast that card by putting it onto the stack. See rule 702.62, “Suspend.”" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [116.2f]: A player who has a card with suspend in their hand may exile that card. This is a special action. A player can take this action any time they have priority, but only if they could begin to cast that card by putting it onto the stack. See rule 702.62, “Suspend.” The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [116.2f].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[116.2f]`.

**Why this test matters:** Broad coverage anchor for Core Rules, Mana, Costs, Life, Damage, Counters. Source docs: L09_Constraint_100to104_v/t.md, L06_PlayerAction_106_v/t.md, L06_PlayerAction_118to121_v/t.md, L07_ObjectModel_122to123_v/t.md.

---

# CATEGORY T - Turn Structure, Priority, and Timing Windows

**Connected docs:**
- `L02_Time_500to514_v/t.md`
- `L02_Time_703_v/t.md`
- `L06_PlayerAction_117_v/t.md`
- `L00_Orchestration_game_engine.md`

## T1. Rule 502.1 anchor - First all phased-in permanents with phasing that the

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 502.1. Apply this rule text to the dispute: "First, all phased-in permanents with phasing that the active player controls phase out, and all phased-out permanents that the active player controlled when they phased out phase in. This all happens simultaneously. This turn-based action doesn’t use the stack. See rule 702.26, “Phasing.”" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [502.1]: First, all phased-in permanents with phasing that the active player controls phase out, and all phased-out permanents that the active player controlled when they phased out phase in. This all happens simultaneously. This turn-based action doesn’t use the stack. See rule 702.26, “Phasing.” The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [502.1].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[502.1]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T2. Rule 502.3 anchor - Third the active player determines which permanents they

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 502.3. Apply this rule text to the dispute: "Third, the active player determines which permanents they control will untap. Then they untap them all simultaneously. This turn-based action doesn’t use the stack. Normally, all of a player’s permanents untap, but effects can keep one or more of a player’s permanents from untapping." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [502.3]: Third, the active player determines which permanents they control will untap. Then they untap them all simultaneously. This turn-based action doesn’t use the stack. Normally, all of a player’s permanents untap, but effects can keep one or more of a player’s permanents from untapping. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [502.3].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[502.3]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T3. Rule 508.1 anchor - First the active player declares attackers This turn-based

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 508.1. Apply this rule text to the dispute: "First, the active player declares attackers. This turn-based action doesn’t use the stack. To declare attackers, the active player follows the steps below, in order. If at any point during the declaration of attackers, the active player is unable to comply with any of the steps listed below, the declaration is illegal; the game returns to the moment before the declaration (see rule 733, “Handling Illegal Actions”)." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [508.1]: First, the active player declares attackers. This turn-based action doesn’t use the stack. To declare attackers, the active player follows the steps below, in order. If at any point during the declaration of attackers, the active player is unable to comply with any of the steps listed below, the declaration is illegal; the game returns to the moment before the declaration (see rule 733, “Handling Illegal Actions”). The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [508.1].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[508.1]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T4. Rule 509.1 anchor - First the defending player declares blockers This turn-based

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 509.1. Apply this rule text to the dispute: "First, the defending player declares blockers. This turn-based action doesn’t use the stack. To declare blockers, the defending player follows the steps below, in order. If at any point during the declaration of blockers, the defending player is unable to comply with any of the steps listed below, the declaration is illegal; the game returns to the moment before the declaration (see rule 733, “Handling Illegal Actions”)." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [509.1]: First, the defending player declares blockers. This turn-based action doesn’t use the stack. To declare blockers, the defending player follows the steps below, in order. If at any point during the declaration of blockers, the defending player is unable to comply with any of the steps listed below, the declaration is illegal; the game returns to the moment before the declaration (see rule 733, “Handling Illegal Actions”). The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [509.1].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[509.1]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T5. Rule 510.2 anchor - Second all combat damage that’s been assigned is

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 510.2. Apply this rule text to the dispute: "Second, all combat damage that’s been assigned is dealt simultaneously. This turn-based action doesn’t use the stack. No player has the chance to cast spells or activate abilities between the time combat damage is assigned and the time it’s dealt." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [510.2]: Second, all combat damage that’s been assigned is dealt simultaneously. This turn-based action doesn’t use the stack. No player has the chance to cast spells or activate abilities between the time combat damage is assigned and the time it’s dealt. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [510.2].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[510.2]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T6. Rule 510.4 anchor - If at least one attacking or blocking creature

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 510.4. Apply this rule text to the dispute: "If at least one attacking or blocking creature has first strike (see rule 702.7) or double strike (see rule 702.4) as the combat damage step begins, the only creatures that assign combat damage in that step are those with first strike or double strike. After that step, instead of proceeding to the end of combat step, the phase gets a second combat damage step. The only creatures that assign combat damage in that step are the remaining attackers and blockers that had neither first strike nor double strike as the..." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [510.4]: If at least one attacking or blocking creature has first strike (see rule 702.7) or double strike (see rule 702.4) as the combat damage step begins, the only creatures that assign combat damage in that step are those with first strike or double strike. After that step, instead of proceeding to the end of combat step, the phase gets a second combat damage step. The only creatures that assign combat damage in that step are the remaining attackers and blockers that had neither first strike nor double strike as the first combat damage step began, as well as the remaining attackers and blockers that currently have double strike. After that step, the phase proceeds to the end of combat step. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [510.4].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[510.4]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T7. Rule 514.2 anchor - Second the following actions happen simultaneously all damage

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 514.2. Apply this rule text to the dispute: "Second, the following actions happen simultaneously: all damage marked on permanents (including phased-out permanents) is removed and all “until end of turn” and “this turn” effects end. This turn-based action doesn’t use the stack." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [514.2]: Second, the following actions happen simultaneously: all damage marked on permanents (including phased-out permanents) is removed and all “until end of turn” and “this turn” effects end. This turn-based action doesn’t use the stack. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [514.2].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[514.2]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T8. Rule 514.3 anchor - Normally no player receives priority during the cleanup

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 514.3. Apply this rule text to the dispute: "Normally, no player receives priority during the cleanup step, so no spells can be cast and no abilities can be activated. However, this rule is subject to the following exception:" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [514.3]: Normally, no player receives priority during the cleanup step, so no spells can be cast and no abilities can be activated. However, this rule is subject to the following exception: The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [514.3].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[514.3]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T9. Rule 117.4 anchor - If all players pass in succession that is

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 117.4. Apply this rule text to the dispute: "If all players pass in succession (that is, if all players pass without taking any actions in between passing), the spell or ability on top of the stack resolves or, if the stack is empty, the phase or step ends." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [117.4]: If all players pass in succession (that is, if all players pass without taking any actions in between passing), the spell or ability on top of the stack resolves or, if the stack is empty, the phase or step ends. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [117.4].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[117.4]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T10. Rule 117.5 anchor - Each time a player would get priority the

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 117.5. Apply this rule text to the dispute: "Each time a player would get priority, the game first performs all applicable state-based actions as a single event (see rule 704, “State-Based Actions”), then repeats this process until no state-based actions are performed. Then triggered abilities are put on the stack (see rule 603, “Handling Triggered Abilities”). These steps repeat in order until no further state-based actions are performed and no abilities trigger. Then the player who would have received priority does so." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [117.5]: Each time a player would get priority, the game first performs all applicable state-based actions as a single event (see rule 704, “State-Based Actions”), then repeats this process until no state-based actions are performed. Then triggered abilities are put on the stack (see rule 603, “Handling Triggered Abilities”). These steps repeat in order until no further state-based actions are performed and no abilities trigger. Then the player who would have received priority does so. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [117.5].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[117.5]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T11. Rule 500.1 anchor - A turn consists of five phases in this

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 500.1. Apply this rule text to the dispute: "A turn consists of five phases, in this order: beginning, precombat main, combat, postcombat main, and ending. Each of these phases takes place every turn, even if nothing happens during the phase. The beginning, combat, and ending phases are further broken down into steps, which proceed in order." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [500.1]: A turn consists of five phases, in this order: beginning, precombat main, combat, postcombat main, and ending. Each of these phases takes place every turn, even if nothing happens during the phase. The beginning, combat, and ending phases are further broken down into steps, which proceed in order. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [500.1].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[500.1]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T12. Rule 500.5 anchor - As a step or phase ends if there

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 500.5. Apply this rule text to the dispute: "As a step or phase ends, if there are effects that last until the end of that step or phase, those effects expire. Then any unspent mana left in a player’s mana pool empties. This is a turn-based action that doesn’t use the stack (see rule 703.4q)." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [500.5]: As a step or phase ends, if there are effects that last until the end of that step or phase, those effects expire. Then any unspent mana left in a player’s mana pool empties. This is a turn-based action that doesn’t use the stack (see rule 703.4q). The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [500.5].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[500.5]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T13. Rule 500.7 anchor - Some effects can give a player extra turns

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 500.7. Apply this rule text to the dispute: "Some effects can give a player extra turns. They do this by adding the turns directly after the specified turn. If a player is given multiple extra turns, the extra turns are added one at a time. If multiple players are given extra turns, the extra turns are added one at a time, in APNAP order (see rule 101.4). The most recently created turn will be taken first." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [500.7]: Some effects can give a player extra turns. They do this by adding the turns directly after the specified turn. If a player is given multiple extra turns, the extra turns are added one at a time. If multiple players are given extra turns, the extra turns are added one at a time, in APNAP order (see rule 101.4). The most recently created turn will be taken first. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [500.7].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[500.7]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T14. Rule 500.8 anchor - Some effects can add phases to a turn

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 500.8. Apply this rule text to the dispute: "Some effects can add phases to a turn. They do this by adding the phases directly after the specified phase. If multiple extra phases are created after the same phase, the most recently created phase will occur first." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [500.8]: Some effects can add phases to a turn. They do this by adding the phases directly after the specified phase. If multiple extra phases are created after the same phase, the most recently created phase will occur first. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [500.8].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[500.8]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T15. Rule 500.11 anchor - Some effects can cause a step phase or

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 500.11. Apply this rule text to the dispute: "Some effects can cause a step, phase, or turn to be skipped. To skip a step, phase, or turn is to proceed past it as though it didn’t exist. See rule 614.10." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [500.11]: Some effects can cause a step, phase, or turn to be skipped. To skip a step, phase, or turn is to proceed past it as though it didn’t exist. See rule 614.10. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [500.11].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[500.11]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T16. Rule 502.2 anchor - Second if it’s day and the previous turn’s

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 502.2. Apply this rule text to the dispute: "Second, if it’s day and the previous turn’s active player didn’t cast any spells during that turn, it becomes night. If it’s night and the previous turn’s active player cast two or more spells during that turn, it becomes day. If it’s neither day nor night, this check doesn’t happen and it remains neither. This turn-based action doesn’t use the stack. See rule 731, “Day and Night.”" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [502.2]: Second, if it’s day and the previous turn’s active player didn’t cast any spells during that turn, it becomes night. If it’s night and the previous turn’s active player cast two or more spells during that turn, it becomes day. If it’s neither day nor night, this check doesn’t happen and it remains neither. This turn-based action doesn’t use the stack. See rule 731, “Day and Night.” The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [502.2].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[502.2]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T17. Rule 502.4 anchor - No player receives priority during the untap step

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 502.4. Apply this rule text to the dispute: "No player receives priority during the untap step, so no spells can be cast or resolve and no abilities can be activated or resolve. Any ability that triggers during this step will be held until the next time a player would receive priority, which is usually during the upkeep step. (See rule 503, “Upkeep Step.”)" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [502.4]: No player receives priority during the untap step, so no spells can be cast or resolve and no abilities can be activated or resolve. Any ability that triggers during this step will be held until the next time a player would receive priority, which is usually during the upkeep step. (See rule 503, “Upkeep Step.”) The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [502.4].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[502.4]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T18. Rule 503.1 anchor - The upkeep step has no turn-based actions Once

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 503.1. Apply this rule text to the dispute: "The upkeep step has no turn-based actions. Once it begins, the active player gets priority. (See rule 117, “Timing and Priority.”)" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [503.1]: The upkeep step has no turn-based actions. Once it begins, the active player gets priority. (See rule 117, “Timing and Priority.”) The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [503.1].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[503.1]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T19. Rule 503.2 anchor - If a spell states that it may be

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 503.2. Apply this rule text to the dispute: "If a spell states that it may be cast only “after [a player’s] upkeep step,” and the turn has multiple upkeep steps, that spell may be cast any time after the first upkeep step ends." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [503.2]: If a spell states that it may be cast only “after [a player’s] upkeep step,” and the turn has multiple upkeep steps, that spell may be cast any time after the first upkeep step ends. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [503.2].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[503.2]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T20. Rule 504.1 anchor - First the active player draws a card This

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 504.1. Apply this rule text to the dispute: "First, the active player draws a card. This turn-based action doesn’t use the stack." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [504.1]: First, the active player draws a card. This turn-based action doesn’t use the stack. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [504.1].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[504.1]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T21. Rule 505.1 anchor - There are two main phases in a turn

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 505.1. Apply this rule text to the dispute: "There are two main phases in a turn. In each turn, the first main phase (also known as the precombat main phase) and the second main phase (also known as the postcombat main phase) are separated by the combat phase (see rule 506, “Combat Phase”). The precombat and postcombat main phases are individually and collectively known as the main phase." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [505.1]: There are two main phases in a turn. In each turn, the first main phase (also known as the precombat main phase) and the second main phase (also known as the postcombat main phase) are separated by the combat phase (see rule 506, “Combat Phase”). The precombat and postcombat main phases are individually and collectively known as the main phase. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [505.1].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[505.1]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T22. Rule 505.3 anchor - First but only if the players are playing

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 505.3. Apply this rule text to the dispute: "First, but only if the players are playing an Archenemy game (see rule 904), the active player is the archenemy, and it’s the active player’s precombat main phase, the active player sets the top card of their scheme deck in motion (see rule 701.32). This turn-based action doesn’t use the stack." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [505.3]: First, but only if the players are playing an Archenemy game (see rule 904), the active player is the archenemy, and it’s the active player’s precombat main phase, the active player sets the top card of their scheme deck in motion (see rule 701.32). This turn-based action doesn’t use the stack. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [505.3].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[505.3]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T23. Rule 505.4 anchor - Second if the active player controls one or

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 505.4. Apply this rule text to the dispute: "Second, if the active player controls one or more Saga enchantments and it’s the active player’s precombat main phase, the active player puts a lore counter on each Saga they control with one or more chapter abilities. (See rule 714, “Saga Cards.”) This turn-based action doesn’t use the stack." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [505.4]: Second, if the active player controls one or more Saga enchantments and it’s the active player’s precombat main phase, the active player puts a lore counter on each Saga they control with one or more chapter abilities. (See rule 714, “Saga Cards.”) This turn-based action doesn’t use the stack. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [505.4].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[505.4]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T24. Rule 505.5 anchor - Third if the active player controls one or

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 505.5. Apply this rule text to the dispute: "Third, if the active player controls one or more Attractions and it’s the active player’s precombat main phase, the active player rolls to visit their Attractions. (See rule 701.52, “Roll to Visit Your Attractions.”) This turn-based action doesn’t use the stack." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [505.5]: Third, if the active player controls one or more Attractions and it’s the active player’s precombat main phase, the active player rolls to visit their Attractions. (See rule 701.52, “Roll to Visit Your Attractions.”) This turn-based action doesn’t use the stack. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [505.5].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[505.5]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T25. Rule 506.1 anchor - The combat phase has five steps which proceed

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 506.1. Apply this rule text to the dispute: "The combat phase has five steps, which proceed in order: beginning of combat, declare attackers, declare blockers, combat damage, and end of combat. The declare blockers and combat damage steps are skipped if no creatures are declared as attackers or put onto the battlefield attacking (see rule 508.8). There are two combat damage steps if any attacking or blocking creature has first strike (see rule 702.7) or double strike (see rule 702.4)." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [506.1]: The combat phase has five steps, which proceed in order: beginning of combat, declare attackers, declare blockers, combat damage, and end of combat. The declare blockers and combat damage steps are skipped if no creatures are declared as attackers or put onto the battlefield attacking (see rule 508.8). There are two combat damage steps if any attacking or blocking creature has first strike (see rule 702.7) or double strike (see rule 702.4). The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [506.1].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[506.1]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T26. Rule 506.7 anchor - Some spells state that they may be cast

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 506.7. Apply this rule text to the dispute: "Some spells state that they may be cast “only [before/after] [a particular point in the combat phase],” in which that point may be “attackers are declared,” “blockers are declared,” “the combat damage step,” “the end of combat step,” “the combat phase,” or “combat.”" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [506.7]: Some spells state that they may be cast “only [before/after] [a particular point in the combat phase],” in which that point may be “attackers are declared,” “blockers are declared,” “the combat damage step,” “the end of combat step,” “the combat phase,” or “combat.” The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [506.7].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[506.7]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T27. Rule 507.1 anchor - First if the game being played is a

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 507.1. Apply this rule text to the dispute: "First, if the game being played is a multiplayer game in which the active player’s opponents don’t all automatically become defending players, the active player chooses one of their opponents. That player becomes the defending player. This turn-based action doesn’t use the stack. (See rule 506.2.)" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [507.1]: First, if the game being played is a multiplayer game in which the active player’s opponents don’t all automatically become defending players, the active player chooses one of their opponents. That player becomes the defending player. This turn-based action doesn’t use the stack. (See rule 506.2.) The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [507.1].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[507.1]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T28. Rule 508.8 anchor - If no creatures are declared as attackers or

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 508.8. Apply this rule text to the dispute: "If no creatures are declared as attackers or put onto the battlefield attacking, skip the declare blockers and combat damage steps." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [508.8]: If no creatures are declared as attackers or put onto the battlefield attacking, skip the declare blockers and combat damage steps. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [508.8].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[508.8]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T29. Rule 510.1 anchor - First the active player announces how each attacking

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 510.1. Apply this rule text to the dispute: "First, the active player announces how each attacking creature assigns its combat damage, then the defending player announces how each blocking creature assigns its combat damage. This turn-based action doesn’t use the stack. A player assigns a creature’s combat damage according to the following rules:" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [510.1]: First, the active player announces how each attacking creature assigns its combat damage, then the defending player announces how each blocking creature assigns its combat damage. This turn-based action doesn’t use the stack. A player assigns a creature’s combat damage according to the following rules: The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [510.1].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[510.1]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T30. Rule 511.1 anchor - The end of combat step has no turn-based

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 511.1. Apply this rule text to the dispute: "The end of combat step has no turn-based actions. Once it begins, the active player gets priority. (See rule 117, “Timing and Priority.”)" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [511.1]: The end of combat step has no turn-based actions. Once it begins, the active player gets priority. (See rule 117, “Timing and Priority.”) The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [511.1].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[511.1]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T31. Rule 513.1 anchor - The end step has no turn-based actions Once

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 513.1. Apply this rule text to the dispute: "The end step has no turn-based actions. Once it begins, the active player gets priority. (See rule 117, “Timing and Priority.”)" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [513.1]: The end step has no turn-based actions. Once it begins, the active player gets priority. (See rule 117, “Timing and Priority.”) The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [513.1].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[513.1]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T32. Rule 513.2 anchor - If a permanent with an ability that triggers

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 513.2. Apply this rule text to the dispute: "If a permanent with an ability that triggers “at the beginning of the end step” enters the battlefield during this step, that ability won’t trigger until the next turn’s end step. Likewise, if a delayed triggered ability that triggers “at the beginning of the next end step” is created during this step, that ability won’t trigger until the next turn’s end step. In other words, the step doesn’t “back up” so those abilities can go on the stack. This rule applies only to triggered abilities; it doesn’t apply to cont..." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [513.2]: If a permanent with an ability that triggers “at the beginning of the end step” enters the battlefield during this step, that ability won’t trigger until the next turn’s end step. Likewise, if a delayed triggered ability that triggers “at the beginning of the next end step” is created during this step, that ability won’t trigger until the next turn’s end step. In other words, the step doesn’t “back up” so those abilities can go on the stack. This rule applies only to triggered abilities; it doesn’t apply to continuous effects whose durations say “until end of turn” or “this turn.” (See rule 514, “Cleanup Step.”) The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [513.2].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[513.2]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T33. Rule 514.1 anchor - First if the active player’s hand contains more

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 514.1. Apply this rule text to the dispute: "First, if the active player’s hand contains more cards than their maximum hand size (normally seven), they discard enough cards to reduce their hand size to that number. This turn-based action doesn’t use the stack." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [514.1]: First, if the active player’s hand contains more cards than their maximum hand size (normally seven), they discard enough cards to reduce their hand size to that number. This turn-based action doesn’t use the stack. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [514.1].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[514.1]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T34. Rule 703.1 anchor - Turn-based actions are game actions that happen automatically

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 703.1. Apply this rule text to the dispute: "Turn-based actions are game actions that happen automatically when certain steps or phases begin, or when each step and phase ends. Turn-based actions don’t use the stack." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [703.1]: Turn-based actions are game actions that happen automatically when certain steps or phases begin, or when each step and phase ends. Turn-based actions don’t use the stack. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [703.1].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[703.1]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T35. Rule 509.1c anchor - The defending player checks each creature they control

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 509.1c. Apply this rule text to the dispute: "The defending player checks each creature they control to see whether it’s affected by any requirements (effects that say a creature must block, or that it must block if some condition is met). If the number of requirements that are being obeyed is fewer than the maximum possible number of requirements that could be obeyed without disobeying any restrictions, the declaration of blockers is illegal. If a creature can’t block unless a player pays a cost, that player is not required to pay that cost, even if blocki..." Example to consider: A player controls one creature that “blocks if able” and another creature with no abilities. If a creature with menace attacks that player, the player must block with both creatures. Having only the first creature block violates the restriction created by menace (the attacking creature can’t be blocked except by two or more creatures). Having only the sec... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [509.1c]: The defending player checks each creature they control to see whether it’s affected by any requirements (effects that say a creature must block, or that it must block if some condition is met). If the number of requirements that are being obeyed is fewer than the maximum possible number of requirements that could be obeyed without disobeying any restrictions, the declaration of blockers is illegal. If a creature can’t block unless a player pays a cost, that player is not required to pay that cost, even if blocking with that creature would increase the number of requirements being obeyed. If a requirement that says a creature blocks if able during a certain turn refers to a turn with multi... The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [509.1c].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[509.1c]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T36. Rule 508.1d anchor - The active player checks each creature they control

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 508.1d. Apply this rule text to the dispute: "The active player checks each creature they control to see whether it’s affected by any requirements (effects that say a creature attacks if able, or that it attacks if some condition is met). If the number of requirements that are being obeyed is fewer than the maximum possible number of requirements that could be obeyed without disobeying any restrictions, the declaration of attackers is illegal. If a creature can’t attack unless a player pays a cost, that player is not required to pay that cost, even if attac..." Example to consider: A player controls two creatures: one that “attacks if able” and one with no abilities. An effect states “No more than one creature can attack each turn.” The only legal attack is for just the creature that “attacks if able” to attack. It’s illegal to attack with the other creature, attack with both, or attack with neither. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [508.1d]: The active player checks each creature they control to see whether it’s affected by any requirements (effects that say a creature attacks if able, or that it attacks if some condition is met). If the number of requirements that are being obeyed is fewer than the maximum possible number of requirements that could be obeyed without disobeying any restrictions, the declaration of attackers is illegal. If a creature can’t attack unless a player pays a cost, that player is not required to pay that cost, even if attacking with that creature would increase the number of requirements being obeyed. If a requirement that says a creature attacks if able during a certain turn refers to a turn with mu... The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [508.1d].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[508.1d]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T37. Rule 509.1b anchor - The defending player checks each creature they control

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 509.1b. Apply this rule text to the dispute: "The defending player checks each creature they control to see whether it’s affected by any restrictions (effects that say a creature can’t block, or that it can’t block unless some condition is met). If any restrictions are being disobeyed, the declaration of blockers is illegal. A restriction may be created by an evasion ability (a static ability an attacking creature has that restricts what can block it). If an attacking creature gains or loses an evasion ability after a legal block has been declared, it doesn..." Example to consider: An attacking creature with flying and shadow can’t be blocked by a creature with flying but without shadow. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [509.1b]: The defending player checks each creature they control to see whether it’s affected by any restrictions (effects that say a creature can’t block, or that it can’t block unless some condition is met). If any restrictions are being disobeyed, the declaration of blockers is illegal. A restriction may be created by an evasion ability (a static ability an attacking creature has that restricts what can block it). If an attacking creature gains or loses an evasion ability after a legal block has been declared, it doesn’t affect that block. Different evasion abilities are cumulative. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [509.1b].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[509.1b]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T38. Rule 509.3f anchor - If an ability triggers when a creature with

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 509.3f. Apply this rule text to the dispute: "If an ability triggers when a creature with certain characteristics blocks, it will trigger only if the creature has those characteristics at the point blockers are declared, or at the point an effect causes it to block. If an ability triggers when a creature with certain characteristics becomes blocked, it will trigger only if the creature has those characteristics at the point it becomes a blocked creature. If an ability triggers when a creature becomes blocked by a creature with certain characteristics, it wi..." Example to consider: A creature has the ability “Whenever this creature becomes blocked by a white creature, destroy that creature at end of combat.” If the creature becomes blocked by a black creature that is later turned white, the ability will not trigger. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [509.3f]: If an ability triggers when a creature with certain characteristics blocks, it will trigger only if the creature has those characteristics at the point blockers are declared, or at the point an effect causes it to block. If an ability triggers when a creature with certain characteristics becomes blocked, it will trigger only if the creature has those characteristics at the point it becomes a blocked creature. If an ability triggers when a creature becomes blocked by a creature with certain characteristics, it will trigger only if the latter creature has those characteristics at the point it becomes a blocking creature. None of those abilities will trigger if the relevant creature’s charac... The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [509.3f].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[509.3f]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T39. Rule 508.2a anchor - Abilities that trigger on a creature attacking trigger

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 508.2a. Apply this rule text to the dispute: "Abilities that trigger on a creature attacking trigger only at the point the creature is declared as an attacker. They will not trigger if a creature attacks and then that creature’s characteristics change to match the ability’s trigger condition." Example to consider: A permanent has the ability “Whenever a green creature attacks, destroy that creature at end of combat.” If a blue creature attacks and is later turned green, the ability will not trigger. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [508.2a]: Abilities that trigger on a creature attacking trigger only at the point the creature is declared as an attacker. They will not trigger if a creature attacks and then that creature’s characteristics change to match the ability’s trigger condition. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [508.2a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[508.2a]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T40. Rule 505.6b anchor - During either main phase the active player may

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 505.6b. Apply this rule text to the dispute: "During either main phase, the active player may play one land card from their hand if the stack is empty, if the player has priority, and if they haven’t played a land this turn (unless an effect states the player may play additional lands). This action doesn’t use the stack. Neither the land nor the action of playing the land is a spell or ability, so it can’t be countered, and players can’t respond to it with instants or activated abilities. (See rule 305, “Lands.”)" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [505.6b]: During either main phase, the active player may play one land card from their hand if the stack is empty, if the player has priority, and if they haven’t played a land this turn (unless an effect states the player may play additional lands). This action doesn’t use the stack. Neither the land nor the action of playing the land is a spell or ability, so it can’t be countered, and players can’t respond to it with instants or activated abilities. (See rule 305, “Lands.”) The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [505.6b].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[505.6b]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T41. Rule 506.2a anchor - During the combat phase of a multiplayer game

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 506.2a. Apply this rule text to the dispute: "During the combat phase of a multiplayer game, there may be one or more defending players, depending on the variant being played and the options chosen for it. Unless all the attacking player’s opponents automatically become defending players during the combat phase, the attacking player chooses one of their opponents as a turn-based action during the beginning of combat step. (Note that the choice may be dictated by the variant being played or the options chosen for it.) That player becomes the defending player..." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [506.2a]: During the combat phase of a multiplayer game, there may be one or more defending players, depending on the variant being played and the options chosen for it. Unless all the attacking player’s opponents automatically become defending players during the combat phase, the attacking player chooses one of their opponents as a turn-based action during the beginning of combat step. (Note that the choice may be dictated by the variant being played or the options chosen for it.) That player becomes the defending player. See rule 802, “Attack Multiple Players Option,” rule 803, “Attack Left and Attack Right Options,” and rule 809, “Emperor Variant.” The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [506.2a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[506.2a]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T42. Rule 508.1c anchor - The active player checks each creature they control

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 508.1c. Apply this rule text to the dispute: "The active player checks each creature they control to see whether it’s affected by any restrictions (effects that say a creature can’t attack, or that it can’t attack unless some condition is met). If any restrictions are being disobeyed, the declaration of attackers is illegal." Example to consider: A player controls two creatures, each with a restriction that states “This creature can’t attack alone.” It’s legal to declare both as attackers. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [508.1c]: The active player checks each creature they control to see whether it’s affected by any restrictions (effects that say a creature can’t attack, or that it can’t attack unless some condition is met). If any restrictions are being disobeyed, the declaration of attackers is illegal. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [508.1c].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[508.1c]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T43. Rule 510.1c anchor - A blocked creature assigns its combat damage to

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 510.1c. Apply this rule text to the dispute: "A blocked creature assigns its combat damage to the creatures blocking it. If no creatures are currently blocking it (if, for example, they were destroyed or removed from combat), it assigns no combat damage. If exactly one creature is blocking it, it assigns all its combat damage to that creature. If two or more creatures are blocking it, it assigns its combat damage to those creatures divided as its controller chooses among them." Example to consider: An attacking Elvish Regrower (a 4/3 creature) is blocked by Vampire Spawn (a 2/3 creature) and Helpful Hunter (a 1/1 creature). Elvish Regrower’s controller can assign all 4 damage to the Hunter, 1 damage to the Spawn and 3 damage to the Hunter, 2 damage to each creature, 3 damage to the Spawn and 1 damage to the Hunter, or all 4 damage to the Spawn. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [510.1c]: A blocked creature assigns its combat damage to the creatures blocking it. If no creatures are currently blocking it (if, for example, they were destroyed or removed from combat), it assigns no combat damage. If exactly one creature is blocking it, it assigns all its combat damage to that creature. If two or more creatures are blocking it, it assigns its combat damage to those creatures divided as its controller chooses among them. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [510.1c].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[510.1c]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T44. Rule 514.3a anchor - At this point the game checks to see

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 514.3a. Apply this rule text to the dispute: "At this point, the game checks to see if any state-based actions would be performed and/or any triggered abilities are waiting to be put onto the stack (including those that trigger “at the beginning of the next cleanup step”). If so, those state-based actions are performed, then those triggered abilities are put on the stack, then the active player gets priority. Players may cast spells and activate abilities. Once the stack is empty and all players pass in succession, another cleanup step begins." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [514.3a]: At this point, the game checks to see if any state-based actions would be performed and/or any triggered abilities are waiting to be put onto the stack (including those that trigger “at the beginning of the next cleanup step”). If so, those state-based actions are performed, then those triggered abilities are put on the stack, then the active player gets priority. Players may cast spells and activate abilities. Once the stack is empty and all players pass in succession, another cleanup step begins. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [514.3a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[514.3a]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T45. Rule 117.3a anchor - The active player receives priority at the beginning

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 117.3a. Apply this rule text to the dispute: "The active player receives priority at the beginning of most steps and phases, after any turn-based actions (such as drawing a card during the draw step; see rule 703) have been dealt with and abilities that trigger at the beginning of that phase or step have been put on the stack. No player receives priority during the untap step. Players usually don’t get priority during the cleanup step (see rule 514.3)." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [117.3a]: The active player receives priority at the beginning of most steps and phases, after any turn-based actions (such as drawing a card during the draw step; see rule 703) have been dealt with and abilities that trigger at the beginning of that phase or step have been put on the stack. No player receives priority during the untap step. Players usually don’t get priority during the cleanup step (see rule 514.3). The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [117.3a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[117.3a]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T46. Rule 510.1e anchor - Once a player has assigned combat damage from

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 510.1e. Apply this rule text to the dispute: "Once a player has assigned combat damage from each attacking or blocking creature they control, the total damage assignment (not solely the damage assignment of any individual attacking or blocking creature) is checked to see if it complies with the above rules. If it doesn’t, the combat damage assignment is illegal; the game returns to the moment before that player began to assign combat damage. (See rule 733, “Handling Illegal Actions.”)" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [510.1e]: Once a player has assigned combat damage from each attacking or blocking creature they control, the total damage assignment (not solely the damage assignment of any individual attacking or blocking creature) is checked to see if it complies with the above rules. If it doesn’t, the combat damage assignment is illegal; the game returns to the moment before that player began to assign combat damage. (See rule 733, “Handling Illegal Actions.”) The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [510.1e].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[510.1e]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T47. Rule 506.4c anchor - If a creature is attacking a planeswalker or

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 506.4c. Apply this rule text to the dispute: "If a creature is attacking a planeswalker or battle, removing that planeswalker or battle from combat doesn’t remove that creature from combat. It continues to be an attacking creature, although it is not attacking any player, planeswalker, or battle. It may be blocked. If it is unblocked, it will deal no combat damage." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [506.4c]: If a creature is attacking a planeswalker or battle, removing that planeswalker or battle from combat doesn’t remove that creature from combat. It continues to be an attacking creature, although it is not attacking any player, planeswalker, or battle. It may be blocked. If it is unblocked, it will deal no combat damage. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [506.4c].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[506.4c]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T48. Rule 509.3c anchor - An ability that reads “Whenever a creature becomes

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 509.3c. Apply this rule text to the dispute: "An ability that reads “Whenever [a creature] becomes blocked, . . .” generally triggers only once each combat for that creature, even if it’s blocked by multiple creatures. It will trigger if that creature becomes blocked by at least one creature declared as a blocker. It will also trigger if that creature becomes blocked by an effect or by a creature that’s put onto the battlefield as a blocker, but only if the attacking creature was an unblocked creature at that time. (See rule 509.1h.)" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [509.3c]: An ability that reads “Whenever [a creature] becomes blocked, . . .” generally triggers only once each combat for that creature, even if it’s blocked by multiple creatures. It will trigger if that creature becomes blocked by at least one creature declared as a blocker. It will also trigger if that creature becomes blocked by an effect or by a creature that’s put onto the battlefield as a blocker, but only if the attacking creature was an unblocked creature at that time. (See rule 509.1h.) The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [509.3c].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[509.3c]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T49. Rule 510.3a anchor - Any abilities that triggered on damage being dealt

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 510.3a. Apply this rule text to the dispute: "Any abilities that triggered on damage being dealt or while state-based actions are performed afterward are put onto the stack before the active player gets priority; the order in which they triggered doesn’t matter. (See rule 603, “Handling Triggered Abilities.”)" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [510.3a]: Any abilities that triggered on damage being dealt or while state-based actions are performed afterward are put onto the stack before the active player gets priority; the order in which they triggered doesn’t matter. (See rule 603, “Handling Triggered Abilities.”) The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [510.3a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[510.3a]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T50. Rule 503.1a anchor - Any abilities that triggered during the untap step

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 503.1a. Apply this rule text to the dispute: "Any abilities that triggered during the untap step and any abilities that triggered at the beginning of the upkeep are put onto the stack before the active player gets priority; the order in which they triggered doesn’t matter. (See rule 603, “Handling Triggered Abilities.”)" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [503.1a]: Any abilities that triggered during the untap step and any abilities that triggered at the beginning of the upkeep are put onto the stack before the active player gets priority; the order in which they triggered doesn’t matter. (See rule 603, “Handling Triggered Abilities.”) The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [503.1a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[503.1a]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T51. Rule 506.7e anchor - If a spell states that it may be

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 506.7e. Apply this rule text to the dispute: "If a spell states that it may be cast “only before [a particular point in the combat phase],” but the stated point doesn’t exist within the relevant combat phase because the declare blockers step and the combat damage step are skipped (see rule 508.8), then the spell may be cast only before the declare attackers step ends. If the stated point doesn’t exist because the relevant combat phase has been skipped, then the spell may be cast only before the precombat main phase ends." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [506.7e]: If a spell states that it may be cast “only before [a particular point in the combat phase],” but the stated point doesn’t exist within the relevant combat phase because the declare blockers step and the combat damage step are skipped (see rule 508.8), then the spell may be cast only before the declare attackers step ends. If the stated point doesn’t exist because the relevant combat phase has been skipped, then the spell may be cast only before the precombat main phase ends. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [506.7e].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[506.7e]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T52. Rule 509.1a anchor - The defending player chooses which creatures they control

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 509.1a. Apply this rule text to the dispute: "The defending player chooses which creatures they control, if any, will block. The chosen creatures must be untapped and they can’t also be battles. For each of the chosen creatures, the defending player chooses one creature for it to block that’s attacking that player, a planeswalker they control, or a battle they protect." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [509.1a]: The defending player chooses which creatures they control, if any, will block. The chosen creatures must be untapped and they can’t also be battles. For each of the chosen creatures, the defending player chooses one creature for it to block that’s attacking that player, a planeswalker they control, or a battle they protect. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [509.1a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[509.1a]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

## T53. Rule 509.3d anchor - An ability that reads “Whenever a creature becomes

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a turn structure, priority, and timing windows dispute governed by rule 509.3d. Apply this rule text to the dispute: "An ability that reads “Whenever [a creature] becomes blocked by a creature, . . .” triggers once for each creature that blocks the specified creature. It triggers if a creature is declared as a blocker for the attacking creature. It will also trigger if an effect causes a creature to block the attacking creature, but only if it wasn’t already blocking that attacking creature at that time. In addition, it will trigger if a creature is put onto the battlefield blocking that creature. It won’t trigger if the creatu..." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [509.3d]: An ability that reads “Whenever [a creature] becomes blocked by a creature, . . .” triggers once for each creature that blocks the specified creature. It triggers if a creature is declared as a blocker for the attacking creature. It will also trigger if an effect causes a creature to block the attacking creature, but only if it wasn’t already blocking that attacking creature at that time. In addition, it will trigger if a creature is put onto the battlefield blocking that creature. It won’t trigger if the creature becomes blocked by an effect rather than a creature. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [509.3d].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[509.3d]`.

**Why this test matters:** Broad coverage anchor for Turn Structure, Priority, and Timing Windows. Source docs: L02_Time_500to514_v/t.md, L02_Time_703_v/t.md, L06_PlayerAction_117_v/t.md, L00_Orchestration_game_engine.md.

---

# CATEGORY U - Casting, Activation, Targets, Mana Abilities, Resolution

**Connected docs:**
- `L06_PlayerAction_114to115_v/t.md`
- `L06_PlayerAction_116_v/t.md`
- `L06_PlayerAction_600to606_v/t.md`
- `L06_PlayerAction_601_seg1/2_v/t.md`
- `L06_PlayerAction_608_v/t.md`

## U1. Rule 115.2 anchor - Only permanents are legal targets for spells and

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 115.2. Apply this rule text to the dispute: "Only permanents are legal targets for spells and abilities, unless a spell or ability (a) specifies that it can target an object in another zone or a player, or (b) targets an object that can’t exist on the battlefield, such as a spell or ability. See also rule 115.4." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [115.2]: Only permanents are legal targets for spells and abilities, unless a spell or ability (a) specifies that it can target an object in another zone or a player, or (b) targets an object that can’t exist on the battlefield, such as a spell or ability. See also rule 115.4. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [115.2].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[115.2]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U2. Rule 115.3 anchor - The same target can’t be chosen multiple times

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 115.3. Apply this rule text to the dispute: "The same target can’t be chosen multiple times for any one instance of the word “target” on a spell or ability. If the spell or ability uses the word “target” in multiple places, the same object or player can be chosen once for each instance of the word “target” (as long as it fits the targeting criteria). This rule applies both when choosing targets for a spell or ability and when changing targets or choosing new targets for a spell or ability (see rule 115.7)." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [115.3]: The same target can’t be chosen multiple times for any one instance of the word “target” on a spell or ability. If the spell or ability uses the word “target” in multiple places, the same object or player can be chosen once for each instance of the word “target” (as long as it fits the targeting criteria). This rule applies both when choosing targets for a spell or ability and when changing targets or choosing new targets for a spell or ability (see rule 115.7). The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [115.3].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[115.3]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U3. Rule 115.4 anchor - Some spells and abilities that refer to damage

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 115.4. Apply this rule text to the dispute: "Some spells and abilities that refer to damage require “any target,” “another target,” “two targets,” or similar rather than “target [something].” These targets may be creatures, players, planeswalkers, or battles. Other game objects, such as noncreature artifacts or spells, can’t be chosen." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [115.4]: Some spells and abilities that refer to damage require “any target,” “another target,” “two targets,” or similar rather than “target [something].” These targets may be creatures, players, planeswalkers, or battles. Other game objects, such as noncreature artifacts or spells, can’t be chosen. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [115.4].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[115.4]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U4. Rule 115.5 anchor - A spell or ability on the stack is

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 115.5. Apply this rule text to the dispute: "A spell or ability on the stack is an illegal target for itself." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [115.5]: A spell or ability on the stack is an illegal target for itself. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [115.5].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[115.5]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U5. Rule 601.2 anchor - To cast a spell is to take it

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 601.2. Apply this rule text to the dispute: "To cast a spell is to take it from where it is (usually the hand), put it on the stack, and pay its costs, so that it will eventually resolve and have its effect. Casting a spell includes proposal of the spell (rules 601.2a–d) and determination and payment of costs (rules 601.2f–h). To cast a spell, a player follows the steps listed below, in order. A player must be legally allowed to cast the spell to begin this process (see rule 601.3). If a player is unable to comply with the requirements of a step listed bel..." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [601.2]: To cast a spell is to take it from where it is (usually the hand), put it on the stack, and pay its costs, so that it will eventually resolve and have its effect. Casting a spell includes proposal of the spell (rules 601.2a–d) and determination and payment of costs (rules 601.2f–h). To cast a spell, a player follows the steps listed below, in order. A player must be legally allowed to cast the spell to begin this process (see rule 601.3). If a player is unable to comply with the requirements of a step listed below while performing that step, the casting of the spell is illegal; the game returns to the moment before the casting of that spell was proposed (see rule 733, “Handling Illegal Ac... The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [601.2].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[601.2]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U6. Rule 601.5 anchor - If a player is no longer allowed to

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 601.5. Apply this rule text to the dispute: "If a player is no longer allowed to cast a spell after completing its proposal (see rules 601.2a–d), the casting of the spell is illegal and the game returns to the moment before the casting of that spell was proposed (see rule 733, “Handling Illegal Actions”). It doesn’t matter if a rule or effect would make the casting of the spell illegal while determining and paying that spell’s costs (see rules 601.2f–h) or any time after the spell has been cast." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [601.5]: If a player is no longer allowed to cast a spell after completing its proposal (see rules 601.2a–d), the casting of the spell is illegal and the game returns to the moment before the casting of that spell was proposed (see rule 733, “Handling Illegal Actions”). It doesn’t matter if a rule or effect would make the casting of the spell illegal while determining and paying that spell’s costs (see rules 601.2f–h) or any time after the spell has been cast. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [601.5].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[601.5]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U7. Rule 602.2 anchor - To activate an ability is to put it

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 602.2. Apply this rule text to the dispute: "To activate an ability is to put it onto the stack and pay its costs, so that it will eventually resolve and have its effect. Only an object’s controller (or its owner, if it doesn’t have a controller) can activate its activated ability unless the object specifically says otherwise. Activating an ability follows the steps listed below, in order. If, at any point during the activation of an ability, a player is unable to comply with any of those steps, the activation is illegal; the game returns to the moment bef..." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [602.2]: To activate an ability is to put it onto the stack and pay its costs, so that it will eventually resolve and have its effect. Only an object’s controller (or its owner, if it doesn’t have a controller) can activate its activated ability unless the object specifically says otherwise. Activating an ability follows the steps listed below, in order. If, at any point during the activation of an ability, a player is unable to comply with any of those steps, the activation is illegal; the game returns to the moment before that ability started to be activated (see rule 733, “Handling Illegal Actions”). Announcements and payments can’t be altered after they’ve been made. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [602.2].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[602.2]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U8. Rule 602.5 anchor - A player can’t begin to activate an ability

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 602.5. Apply this rule text to the dispute: "A player can’t begin to activate an ability that’s prohibited from being activated." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [602.5]: A player can’t begin to activate an ability that’s prohibited from being activated. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [602.5].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[602.5]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U9. Rule 606.5 anchor - If the total cost to activate a loyalty

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 606.5. Apply this rule text to the dispute: "If the total cost to activate a loyalty ability contains multiple costs to add or remove loyalty counters, those costs are combined into a single cost to add or remove loyalty counters, as appropriate." Example to consider: A player controls Carth the Lion, which says, in part, “Planeswalkers’ loyalty abilities you control cost an additional [+1] to activate. That player also controls a planeswalker with three loyalty counters. To activate one of that planeswalker’s abilities that normally costs [+1], they put two loyalty counters on it. To activate one of its abilities that... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [606.5]: If the total cost to activate a loyalty ability contains multiple costs to add or remove loyalty counters, those costs are combined into a single cost to add or remove loyalty counters, as appropriate. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [606.5].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[606.5]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U10. Rule 114.1 anchor - Some effects put emblems into the command zone

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 114.1. Apply this rule text to the dispute: "Some effects put emblems into the command zone. An emblem is a marker used to represent an object that has one or more abilities, but usually no other characteristics." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [114.1]: Some effects put emblems into the command zone. An emblem is a marker used to represent an object that has one or more abilities, but usually no other characteristics. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [114.1].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[114.1]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U11. Rule 114.2 anchor - An effect that creates an emblem is written

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 114.2. Apply this rule text to the dispute: "An effect that creates an emblem is written “[Player] gets an emblem with [ability].” This means that [player] puts an emblem with [ability] into the command zone. The emblem is both owned and controlled by that player." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [114.2]: An effect that creates an emblem is written “[Player] gets an emblem with [ability].” This means that [player] puts an emblem with [ability] into the command zone. The emblem is both owned and controlled by that player. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [114.2].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[114.2]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U12. Rule 114.4 anchor - Abilities of emblems function in the command zone

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 114.4. Apply this rule text to the dispute: "Abilities of emblems function in the command zone." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [114.4]: Abilities of emblems function in the command zone. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [114.4].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[114.4]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U13. Rule 115.7 anchor - Some effects allow a player to change the

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 115.7. Apply this rule text to the dispute: "Some effects allow a player to change the target(s) of a spell or ability, and other effects allow a player to choose new targets for a spell or ability." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [115.7]: Some effects allow a player to change the target(s) of a spell or ability, and other effects allow a player to choose new targets for a spell or ability. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [115.7].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[115.7]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U14. Rule 115.8 anchor - Modal spells and abilities may have different targeting

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 115.8. Apply this rule text to the dispute: "Modal spells and abilities may have different targeting requirements for each mode. An effect that allows a player to change the target(s) of a modal spell or ability, or to choose new targets for a modal spell or ability, doesn’t allow that player to change its mode. (See rule 700.2.)" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [115.8]: Modal spells and abilities may have different targeting requirements for each mode. An effect that allows a player to change the target(s) of a modal spell or ability, or to choose new targets for a modal spell or ability, doesn’t allow that player to change its mode. (See rule 700.2.) The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [115.8].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[115.8]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U15. Rule 115.10 anchor - Spells and abilities can affect objects and players

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 115.10. Apply this rule text to the dispute: "Spells and abilities can affect objects and players they don’t target. In general, those objects and players aren’t chosen until the spell or ability resolves. See rule 608, “Resolving Spells and Abilities.”" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [115.10]: Spells and abilities can affect objects and players they don’t target. In general, those objects and players aren’t chosen until the spell or ability resolves. See rule 608, “Resolving Spells and Abilities.” The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [115.10].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[115.10]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U16. Rule 116.1 anchor - Special actions are actions a player may take

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 116.1. Apply this rule text to the dispute: "Special actions are actions a player may take when they have priority that don’t use the stack. These are not to be confused with turn-based actions and state-based actions, which the game generates automatically. (See rule 703, “Turn-Based Actions,” and rule 704, “State-Based Actions.”)" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [116.1]: Special actions are actions a player may take when they have priority that don’t use the stack. These are not to be confused with turn-based actions and state-based actions, which the game generates automatically. (See rule 703, “Turn-Based Actions,” and rule 704, “State-Based Actions.”) The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [116.1].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[116.1]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U17. Rule 116.3 anchor - If a player takes a special action that

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 116.3. Apply this rule text to the dispute: "If a player takes a special action, that player receives priority afterward." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [116.3]: If a player takes a special action, that player receives priority afterward. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [116.3].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[116.3]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U18. Rule 601.3 anchor - A player can begin to cast a spell

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 601.3. Apply this rule text to the dispute: "A player can begin to cast a spell only if a rule or effect allows that player to cast it and no rule or effect prohibits that player from casting it." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [601.3]: A player can begin to cast a spell only if a rule or effect allows that player to cast it and no rule or effect prohibits that player from casting it. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [601.3].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[601.3]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U19. Rule 601.4 anchor - While announcing the choices of any modes alternative

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 601.4. Apply this rule text to the dispute: "While announcing the choices of any modes, alternative costs, and/or additional costs as described in rule 601.2b, some options may be available to a player only if other choices are made that would normally be made later in that rule’s instructions. In that case, the spell’s controller may consider any other choices to be made in that step. If any such choices could allow them to choose a particular mode, alternative cost, or additional cost, they may do so." Example to consider: Inscription of Abundance is a modal spell with kicker and the text “Choose one. If this spell was kicked, choose any number instead.” When announcing the chosen modes for the spell, its controller may choose any number of modes, even though choosing to pay the kicker cost is normally done later in the announcement process. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [601.4]: While announcing the choices of any modes, alternative costs, and/or additional costs as described in rule 601.2b, some options may be available to a player only if other choices are made that would normally be made later in that rule’s instructions. In that case, the spell’s controller may consider any other choices to be made in that step. If any such choices could allow them to choose a particular mode, alternative cost, or additional cost, they may do so. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [601.4].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[601.4]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U20. Rule 605.4a anchor - A triggered mana ability doesn’t go on the

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 605.4a. Apply this rule text to the dispute: "A triggered mana ability doesn’t go on the stack, so it can’t be targeted, countered, or otherwise responded to. Rather, it resolves immediately after the mana ability that triggered it, without waiting for priority." Example to consider: An enchantment reads, “Whenever a player taps a land for mana, that player adds one mana of any type that land produced.” If a player taps lands for mana while casting a spell, the additional mana is added immediately and can be used to pay for the spell. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [605.4a]: A triggered mana ability doesn’t go on the stack, so it can’t be targeted, countered, or otherwise responded to. Rather, it resolves immediately after the mana ability that triggered it, without waiting for priority. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [605.4a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[605.4a]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U21. Rule 606.2 anchor - An activated ability with a loyalty symbol in

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 606.2. Apply this rule text to the dispute: "An activated ability with a loyalty symbol in its cost is a loyalty ability. Normally, only planeswalkers have loyalty abilities." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [606.2]: An activated ability with a loyalty symbol in its cost is a loyalty ability. Normally, only planeswalkers have loyalty abilities. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [606.2].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[606.2]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U22. Rule 606.3 anchor - A player may activate a loyalty ability of

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 606.3. Apply this rule text to the dispute: "A player may activate a loyalty ability of a permanent they control any time they have priority and the stack is empty during a main phase of their turn, but only if no player has previously activated a loyalty ability of that permanent that turn." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [606.3]: A player may activate a loyalty ability of a permanent they control any time they have priority and the stack is empty during a main phase of their turn, but only if no player has previously activated a loyalty ability of that permanent that turn. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [606.3].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[606.3]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U23. Rule 606.4 anchor - The cost to activate a loyalty ability of

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 606.4. Apply this rule text to the dispute: "The cost to activate a loyalty ability of a permanent is to put on or remove from that permanent a certain number of loyalty counters, as shown by the loyalty symbol in the ability’s cost. This cost may be modified by other effects." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [606.4]: The cost to activate a loyalty ability of a permanent is to put on or remove from that permanent a certain number of loyalty counters, as shown by the loyalty symbol in the ability’s cost. This cost may be modified by other effects. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [606.4].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[606.4]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U24. Rule 608.1 anchor - Each time all players pass in succession the

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 608.1. Apply this rule text to the dispute: "Each time all players pass in succession, the spell or ability on top of the stack resolves. (See rule 609, “Effects.”)" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [608.1]: Each time all players pass in succession, the spell or ability on top of the stack resolves. (See rule 609, “Effects.”) The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [608.1].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[608.1]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U25. Rule 608.3 anchor - If the object that’s resolving is a permanent

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 608.3. Apply this rule text to the dispute: "If the object that’s resolving is a permanent spell, its resolution may involve several steps. The instructions in rules 608.3a and b are always performed first. Then one of the steps in rule 608.3c–e is performed, if appropriate." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [608.3]: If the object that’s resolving is a permanent spell, its resolution may involve several steps. The instructions in rules 608.3a and b are always performed first. Then one of the steps in rule 608.3c–e is performed, if appropriate. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [608.3].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[608.3]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U26. Rule 115.1 anchor - Some spells and abilities require their controller to

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 115.1. Apply this rule text to the dispute: "Some spells and abilities require their controller to choose one or more targets for them. The targets are object(s) and/or player(s) the spell or ability will affect. These targets are declared as part of the process of putting the spell or ability on the stack. The targets can’t be changed except by another spell or ability that explicitly says it can do so." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [115.1]: Some spells and abilities require their controller to choose one or more targets for them. The targets are object(s) and/or player(s) the spell or ability will affect. These targets are declared as part of the process of putting the spell or ability on the stack. The targets can’t be changed except by another spell or ability that explicitly says it can do so. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [115.1].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[115.1]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U27. Rule 115.1a anchor - An instant or sorcery spell is targeted if

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 115.1a. Apply this rule text to the dispute: "An instant or sorcery spell is targeted if its spell ability identifies something it will affect by using the phrase “target [something],” where the “something” is a phrase that describes an object and/or player. The target(s) are chosen as the spell is cast; see rule 601.2c. (If an activated or triggered ability of an instant or sorcery uses the word target, that ability is targeted, but the spell is not.)" Example to consider: A sorcery card has the ability “When you cycle this card, target creature gets -1/-1 until end of turn.” This triggered ability is targeted, but that doesn’t make the card it’s on targeted. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [115.1a]: An instant or sorcery spell is targeted if its spell ability identifies something it will affect by using the phrase “target [something],” where the “something” is a phrase that describes an object and/or player. The target(s) are chosen as the spell is cast; see rule 601.2c. (If an activated or triggered ability of an instant or sorcery uses the word target, that ability is targeted, but the spell is not.) The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [115.1a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[115.1a]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U28. Rule 115.7a anchor - If an effect allows a player to “change

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 115.7a. Apply this rule text to the dispute: "If an effect allows a player to “change the target(s)” of a spell or ability, each target can be changed only to another legal target. If a target can’t be changed to another legal target, the original target is unchanged, even if the original target is itself illegal by then. If all the targets aren’t changed to other legal targets, none of them are changed." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [115.7a]: If an effect allows a player to “change the target(s)” of a spell or ability, each target can be changed only to another legal target. If a target can’t be changed to another legal target, the original target is unchanged, even if the original target is itself illegal by then. If all the targets aren’t changed to other legal targets, none of them are changed. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [115.7a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[115.7a]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U29. Rule 115.10a anchor - Just because an object or player is being

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 115.10a. Apply this rule text to the dispute: "Just because an object or player is being affected by a spell or ability doesn’t make that object or player a target of that spell or ability. Unless that object or player is identified by the word “target” in the text of that spell or ability, or the rule for that keyword ability, it’s not a target." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [115.10a]: Just because an object or player is being affected by a spell or ability doesn’t make that object or player a target of that spell or ability. Unless that object or player is identified by the word “target” in the text of that spell or ability, or the rule for that keyword ability, it’s not a target. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [115.10a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[115.10a]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U30. Rule 601.3a anchor - If an effect prohibits a player from casting

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 601.3a. Apply this rule text to the dispute: "If an effect prohibits a player from casting a spell with certain qualities, that player may consider any choices to be made during that spell’s proposal that may cause those qualities to change. If any such choices could cause that effect to no longer prohibit that player from casting that spell, the player may begin to cast the spell, ignoring the effect." Example to consider: A player controls Void Winnower, which reads, in part, “Your opponents can’t cast spells with even mana values.” That player’s opponent may begin to cast Rolling Thunder, a card whose mana cost is {X}{R}{R}, because the chosen value of X may cause the spell’s mana value to become odd. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [601.3a]: If an effect prohibits a player from casting a spell with certain qualities, that player may consider any choices to be made during that spell’s proposal that may cause those qualities to change. If any such choices could cause that effect to no longer prohibit that player from casting that spell, the player may begin to cast the spell, ignoring the effect. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [601.3a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[601.3a]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U31. Rule 602.5a anchor - A creature’s activated ability with the tap symbol

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 602.5a. Apply this rule text to the dispute: "A creature’s activated ability with the tap symbol ({T}) or the untap symbol ({Q}) in its activation cost can’t be activated unless the creature has been under its controller’s control since the start of their most recent turn. Ignore this rule for creatures with haste (see rule 702.10)." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [602.5a]: A creature’s activated ability with the tap symbol ({T}) or the untap symbol ({Q}) in its activation cost can’t be activated unless the creature has been under its controller’s control since the start of their most recent turn. Ignore this rule for creatures with haste (see rule 702.10). The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [602.5a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[602.5a]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U32. Rule 605.2 anchor - A mana ability remains a mana ability even

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 605.2. Apply this rule text to the dispute: "A mana ability remains a mana ability even if the game state doesn’t allow it to produce mana." Example to consider: A permanent has an ability that reads “{T}: Add {G} for each creature you control.” The ability is still a mana ability even if you control no creatures or if the permanent is already tapped. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [605.2]: A mana ability remains a mana ability even if the game state doesn’t allow it to produce mana. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [605.2].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[605.2]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U33. Rule 605.4 anchor - Triggered mana abilities follow all the rules for

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 605.4. Apply this rule text to the dispute: "Triggered mana abilities follow all the rules for other triggered abilities (see rule 603, “Handling Triggered Abilities”), with the following exception:" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [605.4]: Triggered mana abilities follow all the rules for other triggered abilities (see rule 603, “Handling Triggered Abilities”), with the following exception: The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [605.4].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[605.4]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U34. Rule 606.6 anchor - A loyalty ability with a negative loyalty cost

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 606.6. Apply this rule text to the dispute: "A loyalty ability with a negative loyalty cost, taking into account any additional costs, can’t be activated unless the permanent has at least that many loyalty counters on it." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [606.6]: A loyalty ability with a negative loyalty cost, taking into account any additional costs, can’t be activated unless the permanent has at least that many loyalty counters on it. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [606.6].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[606.6]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U35. Rule 601.2c anchor - The player announces their choice of an appropriate

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 601.2c. Apply this rule text to the dispute: "The player announces their choice of an appropriate object or player for each target the spell requires. A spell may require some targets only if an alternative or additional cost (such as a kicker cost) or a particular mode was chosen for it; otherwise, the spell is cast as though it did not require those targets. Similarly, a spell may require alternative targets only if an alternative or additional cost was chosen for it. If the spell has a variable number of targets, the player announces how many targets the..." Example to consider: If a spell says “Tap two target creatures,” then the same creature can’t be chosen twice; the spell requires two different legal targets. A spell that says “Destroy target artifact and target land,” however, can target the same artifact land twice because it uses the word “target” in multiple places. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [601.2c]: The player announces their choice of an appropriate object or player for each target the spell requires. A spell may require some targets only if an alternative or additional cost (such as a kicker cost) or a particular mode was chosen for it; otherwise, the spell is cast as though it did not require those targets. Similarly, a spell may require alternative targets only if an alternative or additional cost was chosen for it. If the spell has a variable number of targets, the player announces how many targets they will choose before they announce those targets. In some cases, the number of targets will be defined by the spell’s text. Once the number of targets the spell has is determined,... The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [601.2c].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[601.2c]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U36. Rule 608.2d anchor - If an effect of a spell or ability

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 608.2d. Apply this rule text to the dispute: "If an effect of a spell or ability offers any choices other than choices already made as part of casting the spell, activating the ability, or otherwise putting the spell or ability on the stack, the player announces these while applying the effect. The player can’t choose an option that’s illegal or impossible, with the exception that having a library with no cards in it doesn’t make drawing a card an impossible action (see rule 121.3). If an effect divides or distributes something, such as damage or counters,..." Example to consider: A spell’s instruction reads, “You may sacrifice a creature. If you don’t, you lose 4 life.” A player who controls no creatures can’t choose the sacrifice option. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [608.2d]: If an effect of a spell or ability offers any choices other than choices already made as part of casting the spell, activating the ability, or otherwise putting the spell or ability on the stack, the player announces these while applying the effect. The player can’t choose an option that’s illegal or impossible, with the exception that having a library with no cards in it doesn’t make drawing a card an impossible action (see rule 121.3). If an effect divides or distributes something, such as damage or counters, as a player chooses among any number of untargeted players and/or objects, the player chooses the amount and division such that each chosen player or object receives at least one o... The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [608.2d].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[608.2d]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U37. Rule 608.2b anchor - If the spell or ability specifies targets it

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 608.2b. Apply this rule text to the dispute: "If the spell or ability specifies targets, it checks whether the targets are still legal. A target that’s no longer in the zone it was in when it was targeted is illegal. Other changes to the game state may cause a target to no longer be legal; for example, its characteristics may have changed or an effect may have changed the text of the spell. If the source of an ability has left the zone it was in, its last known information is used during this process. If all its targets, for every instance of the word “targ..." Example to consider: Sorin’s Thirst is a black instant that reads, “Sorin’s Thirst deals 2 damage to target creature and you gain 2 life.” If the creature isn’t a legal target during the resolution of Sorin’s Thirst (say, if the creature has gained protection from black or left the battlefield), then Sorin’s Thirst doesn’t resolve. Its controller doesn’t gain any life. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [608.2b]: If the spell or ability specifies targets, it checks whether the targets are still legal. A target that’s no longer in the zone it was in when it was targeted is illegal. Other changes to the game state may cause a target to no longer be legal; for example, its characteristics may have changed or an effect may have changed the text of the spell. If the source of an ability has left the zone it was in, its last known information is used during this process. If all its targets, for every instance of the word “target,” are now illegal, the spell or ability doesn’t resolve. It’s removed from the stack and, if it’s a spell, put into its owner’s graveyard. Otherwise, the spell or ability will r... The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [608.2b].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[608.2b]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U38. Rule 608.2f anchor - Some spells and abilities include actions taken on

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 608.2f. Apply this rule text to the dispute: "Some spells and abilities include actions taken on multiple players and/or objects. In most cases, each such action is processed simultaneously. If the action can’t be processed simultaneously, it’s instead processed considering each affected player or object individually. APNAP order is used to make the primary determination of the order of those actions. Secondarily, if the action is to be taken on both a player and an object they control or on multiple objects controlled by the same player, the player who con..." Example to consider: Blatant Thievery says “For each opponent, gain control of target permanent that player controls.” As Blatant Thievery resolves, its controller gains control of all permanents chosen as targets simultaneously. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [608.2f]: Some spells and abilities include actions taken on multiple players and/or objects. In most cases, each such action is processed simultaneously. If the action can’t be processed simultaneously, it’s instead processed considering each affected player or object individually. APNAP order is used to make the primary determination of the order of those actions. Secondarily, if the action is to be taken on both a player and an object they control or on multiple objects controlled by the same player, the player who controls the resolving spell or ability chooses the relative order of those actions. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [608.2f].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[608.2f]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U39. Rule 601.2b anchor - If the spell is modal the player announces

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 601.2b. Apply this rule text to the dispute: "If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a si..." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [601.2b]: If the spell is modal, the player announces the mode choice (see rule 700.2). If the player wishes to splice any cards onto the spell (see rule 702.47), they reveal those cards in their hand. If the spell has alternative or additional costs that will be paid as it’s being cast such as buyback or kicker costs (see rules 118.8 and 118.9), the player announces their intentions to pay any or all of those costs (see rule 601.2f). A player can’t apply two alternative methods of casting or two alternative costs to a single spell. If the spell has a variable cost that will be paid as it’s being cast (such as an {X} in its mana cost; see rule 107.3), the player announces the value of that variable... The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [601.2b].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[601.2b]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U40. Rule 601.3e anchor - Some rules and effects state that an alternative

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 601.3e. Apply this rule text to the dispute: "Some rules and effects state that an alternative set of characteristics or a subset of characteristics are considered to determine if a card or copy of a card is legal to cast. These alternative characteristics replace the object’s characteristics for this determination. Continuous effects that would apply to that object once it has those characteristics are also considered." Example to consider: Garruk’s Horde says, in part, “You may cast creature spells from the top of your library.” If you control Garruk’s Horde and the top card of your library is a noncreature card with morph, you may cast it using its morph ability. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [601.3e]: Some rules and effects state that an alternative set of characteristics or a subset of characteristics are considered to determine if a card or copy of a card is legal to cast. These alternative characteristics replace the object’s characteristics for this determination. Continuous effects that would apply to that object once it has those characteristics are also considered. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [601.3e].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[601.3e]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U41. Rule 608.2k anchor - If an ability’s effect refers to a specific

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 608.2k. Apply this rule text to the dispute: "If an ability’s effect refers to a specific untargeted object that has been previously referred to by that ability’s cost or trigger condition, it still affects that object even if the object has changed characteristics." Example to consider: Wall of Tears says “Whenever this creature blocks a creature, return that creature to its owner’s hand at end of combat.” If Wall of Tears blocks a creature, then that creature ceases to be a creature before the triggered ability resolves, the permanent will still be returned to its owner’s hand. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [608.2k]: If an ability’s effect refers to a specific untargeted object that has been previously referred to by that ability’s cost or trigger condition, it still affects that object even if the object has changed characteristics. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [608.2k].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[608.2k]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U42. Rule 608.3e anchor - If a permanent spell resolves but its controller

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 608.3e. Apply this rule text to the dispute: "If a permanent spell resolves but its controller can’t put it onto the battlefield, that player puts it into its owner’s graveyard." Example to consider: Worms of the Earth has the ability “Lands can’t enter the battlefield.” Clone says “You may have this creature enter as a copy of any creature on the battlefield.” If a player casts Clone and chooses to copy Dryad Arbor (a land creature) while Worms of the Earth is on the battlefield, Clone can’t enter the battlefield from the stack. It’s put into its own... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [608.3e]: If a permanent spell resolves but its controller can’t put it onto the battlefield, that player puts it into its owner’s graveyard. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [608.3e].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[608.3e]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U43. Rule 601.2h anchor - The player pays the total cost First they

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 601.2h. Apply this rule text to the dispute: "The player pays the total cost. First, they pay all costs that don’t involve random elements or moving objects from the library to a public zone, in any order. Then they pay all remaining costs in any order. Partial payments are not allowed. Unpayable costs can’t be paid." Example to consider: You cast Altar’s Reap, which costs {1}{B} and has an additional cost of sacrificing a creature. You sacrifice Thunderscape Familiar, whose effect makes your black spells cost {1} less to cast. Because a spell’s total cost is “locked in” before payments are actually made, you pay {B}, not {1}{B}, even though you’re sacrificing the Familiar. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [601.2h]: The player pays the total cost. First, they pay all costs that don’t involve random elements or moving objects from the library to a public zone, in any order. Then they pay all remaining costs in any order. Partial payments are not allowed. Unpayable costs can’t be paid. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [601.2h].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[601.2h]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U44. Rule 608.2i anchor - Some effects look back in time and require

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 608.2i. Apply this rule text to the dispute: "Some effects look back in time and require information about previous game states and actions rather than considering the current game state. If such an effect requires information from the game about an object or group of objects, and that effect is not taking any actions on those objects, they don’t need to be currently in the zone they were in at the time of that previous game state or action, nor do they need to currently meet the criteria described in the action, as long as they did so at the specified time..." Example to consider: A player attacks with Bear Cub. Later in the turn, an effect causes Bear Cub to become a noncreature permanent. The same player then casts Search Party Captain, a spell that says in part “This spell costs {1} less to cast for each creature you attacked with this turn.” That spell costs {1} less because the player attacked with a creature, even though the... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [608.2i]: Some effects look back in time and require information about previous game states and actions rather than considering the current game state. If such an effect requires information from the game about an object or group of objects, and that effect is not taking any actions on those objects, they don’t need to be currently in the zone they were in at the time of that previous game state or action, nor do they need to currently meet the criteria described in the action, as long as they did so at the specified time. This is an exception to 608.2h. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [608.2i].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[608.2i]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U45. Rule 115.7e anchor - When changing targets or choosing new targets for

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 115.7e. Apply this rule text to the dispute: "When changing targets or choosing new targets for a spell or ability, only the final set of targets is evaluated to determine whether the change is legal." Example to consider: Arc Trail is a sorcery that reads “Arc Trail deals 2 damage to any target and 1 damage to any other target.” The current targets of Arc Trail are Runeclaw Bear and Llanowar Elves, in that order. You cast Redirect, an instant that reads “You may choose new targets for target spell,” targeting Arc Trail. You can change the first target to Llanowar Elves and... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [115.7e]: When changing targets or choosing new targets for a spell or ability, only the final set of targets is evaluated to determine whether the change is legal. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [115.7e].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[115.7e]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U46. Rule 602.1a anchor - The activation cost is everything before the colon

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 602.1a. Apply this rule text to the dispute: "The activation cost is everything before the colon (:). An ability’s activation cost must be paid by the player who is activating it." Example to consider: The activation cost of an ability that reads “{2}, {T}: You gain 1 life” is two mana of any type plus tapping the permanent that has the ability. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [602.1a]: The activation cost is everything before the colon (:). An ability’s activation cost must be paid by the player who is activating it. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [602.1a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[602.1a]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U47. Rule 608.2c anchor - The controller of the spell or ability follows

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 608.2c. Apply this rule text to the dispute: "The controller of the spell or ability follows its instructions in the order written. However, replacement effects may modify these actions. In some cases, later text on the card may modify the meaning of earlier text (for example, “Destroy target creature. It can’t be regenerated” or “Counter target spell. If that spell is countered this way, put it on top of its owner’s library instead of into its owner’s graveyard.”) Don’t just apply effects step by step without thinking in these cases—read the whole text and..." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [608.2c]: The controller of the spell or ability follows its instructions in the order written. However, replacement effects may modify these actions. In some cases, later text on the card may modify the meaning of earlier text (for example, “Destroy target creature. It can’t be regenerated” or “Counter target spell. If that spell is countered this way, put it on top of its owner’s library instead of into its owner’s graveyard.”) Don’t just apply effects step by step without thinking in these cases—read the whole text and apply the rules of English to the text. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [608.2c].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[608.2c]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U48. Rule 601.2f anchor - The player determines the total cost of the

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 601.2f. Apply this rule text to the dispute: "The player determines the total cost of the spell. Usually this is just the mana cost. Some spells have additional or alternative costs. Some effects may increase or reduce the cost to pay, or may provide other alternative costs. Costs may include paying mana, tapping permanents, sacrificing permanents, discarding cards, and so on. The total cost is the mana cost or alternative cost (as determined in rule 601.2b), plus all additional costs and cost increases, and minus all cost reductions. If multiple cost reduc..." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [601.2f]: The player determines the total cost of the spell. Usually this is just the mana cost. Some spells have additional or alternative costs. Some effects may increase or reduce the cost to pay, or may provide other alternative costs. Costs may include paying mana, tapping permanents, sacrificing permanents, discarding cards, and so on. The total cost is the mana cost or alternative cost (as determined in rule 601.2b), plus all additional costs and cost increases, and minus all cost reductions. If multiple cost reductions apply, the player may apply them in any order. If the mana component of the total cost is reduced to nothing by cost reduction effects, it is considered to be {0}. It can’t b... The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [601.2f].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[601.2f]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U49. Rule 601.3b anchor - If an effect allows a player to cast

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 601.3b. Apply this rule text to the dispute: "If an effect allows a player to cast a spell with certain qualities as though it had flash, that player may consider any choices to be made during that spell’s proposal that may cause that spell’s qualities to change. If any such choices could cause that effect to apply, that player may begin to cast that spell as though it had flash." Example to consider: An effect says that you may cast Aura spells as though they had flash, and you have a creature card with bestow in your hand. Because choosing the bestow ability’s alternative cost causes that spell to become an Aura spell, you may legally begin to cast that spell as though it had flash. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [601.3b]: If an effect allows a player to cast a spell with certain qualities as though it had flash, that player may consider any choices to be made during that spell’s proposal that may cause that spell’s qualities to change. If any such choices could cause that effect to apply, that player may begin to cast that spell as though it had flash. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [601.3b].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[601.3b]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U50. Rule 608.2j anchor - If an effect refers to certain characteristics it

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 608.2j. Apply this rule text to the dispute: "If an effect refers to certain characteristics, it checks only for the value of the specified characteristics, regardless of any related ones an object may also have." Example to consider: An effect that reads “Destroy all black creatures” destroys a white-and-black creature, but one that reads “Destroy all nonblack creatures” doesn’t. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [608.2j]: If an effect refers to certain characteristics, it checks only for the value of the specified characteristics, regardless of any related ones an object may also have. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [608.2j].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[608.2j]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U51. Rule 601.2a anchor - To propose the casting of a spell a

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 601.2a. Apply this rule text to the dispute: "To propose the casting of a spell, a player first moves that card (or that copy of a card) from where it is to the stack. It becomes the topmost object on the stack. It has all the characteristics of the card (or the copy of a card) associated with it, and that player becomes its controller. Any continuous effects that modify the characteristics of the spell as you start casting it begin as it is put on the stack (see rule 611.2f). Any one-shot effects that cause the spell to gain abilities as you cast it apply..." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [601.2a]: To propose the casting of a spell, a player first moves that card (or that copy of a card) from where it is to the stack. It becomes the topmost object on the stack. It has all the characteristics of the card (or the copy of a card) associated with it, and that player becomes its controller. Any continuous effects that modify the characteristics of the spell as you start casting it begin as it is put on the stack (see rule 611.2f). Any one-shot effects that cause the spell to gain abilities as you cast it apply as it is put on the stack (see rule 610.5). The spell remains on the stack until it resolves, it’s countered, or a rule or effect moves it elsewhere. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [601.2a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[601.2a]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U52. Rule 608.3b anchor - If the object that’s resolving has a target

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 608.3b. Apply this rule text to the dispute: "If the object that’s resolving has a target, it checks whether the target is still legal, as described in 608.2b. If a spell with an illegal target is a bestowed Aura spell (see rule 702.103e) or a mutating creature spell (see rule 702.140b), it becomes a creature spell and will resolve as described in rule 608.3a. Otherwise, the spell doesn’t resolve. It is removed from the stack and put into its owner’s graveyard." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [608.3b]: If the object that’s resolving has a target, it checks whether the target is still legal, as described in 608.2b. If a spell with an illegal target is a bestowed Aura spell (see rule 702.103e) or a mutating creature spell (see rule 702.140b), it becomes a creature spell and will resolve as described in rule 608.3a. Otherwise, the spell doesn’t resolve. It is removed from the stack and put into its owner’s graveyard. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [608.3b].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[608.3b]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

## U53. Rule 116.2f anchor - A player who has a card with suspend

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a casting, activation, targets, mana abilities, resolution dispute governed by rule 116.2f. Apply this rule text to the dispute: "A player who has a card with suspend in their hand may exile that card. This is a special action. A player can take this action any time they have priority, but only if they could begin to cast that card by putting it onto the stack. See rule 702.62, “Suspend.”" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [116.2f]: A player who has a card with suspend in their hand may exile that card. This is a special action. A player can take this action any time they have priority, but only if they could begin to cast that card by putting it onto the stack. See rule 702.62, “Suspend.” The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [116.2f].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[116.2f]`.

**Why this test matters:** Broad coverage anchor for Casting, Activation, Targets, Mana Abilities, Resolution. Source docs: L06_PlayerAction_114to115_v/t.md, L06_PlayerAction_116_v/t.md, L06_PlayerAction_600to606_v/t.md, L06_PlayerAction_601_seg1/2_v/t.md, L06_PlayerAction_608_v/t.md.

---

# CATEGORY V - Triggered Abilities and State-Based Actions

**Connected docs:**
- `L04_Trigger_603_seg1/2/3_v/t.md`
- `L04_Trigger_engine.md`
- `L05_StateEnforcement_704_v/t.md`

## V1. Rule 603.4 anchor - A triggered ability may read “When/Whenever/At trigger event

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 603.4. Apply this rule text to the dispute: "A triggered ability may read “When/Whenever/At [trigger event], if [condition], [effect].” When the trigger event occurs, the ability checks whether the stated condition is true. The ability triggers only if it is; otherwise it does nothing. If the ability triggers, it checks the stated condition again as it resolves. If the condition isn’t true at that time, the ability is removed from the stack and does nothing. Note that this mirrors the check for legal targets. This rule is referred to as the “intervening ‘i..." Example to consider: Felidar Sovereign reads, “At the beginning of your upkeep, if you have 40 or more life, you win the game.” Its controller’s life total is checked as that player’s upkeep begins. If that player has 39 or less life, the ability doesn’t trigger at all. If that player has 40 or more life, the ability triggers and goes on the stack. As the ability resolves, th... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [603.4]: A triggered ability may read “When/Whenever/At [trigger event], if [condition], [effect].” When the trigger event occurs, the ability checks whether the stated condition is true. The ability triggers only if it is; otherwise it does nothing. If the ability triggers, it checks the stated condition again as it resolves. If the condition isn’t true at that time, the ability is removed from the stack and does nothing. Note that this mirrors the check for legal targets. This rule is referred to as the “intervening ‘if’ clause” rule. (The word “if” has only its normal English meaning anywhere else in the text of a card; this rule only applies to an “if” that immediately follows a trigger condit... The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [603.4].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[603.4]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V2. Rule 603.5 anchor - Some triggered abilities’ effects are optional they contain

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 603.5. Apply this rule text to the dispute: "Some triggered abilities’ effects are optional (they contain “may,” as in “At the beginning of your upkeep, you may draw a card”). These abilities go on the stack when they trigger, regardless of whether their controller intends to exercise the ability’s option or not. The choice is made when the ability resolves. Likewise, triggered abilities that have an effect “unless” something is true or a player chooses to do something will go on the stack normally; the “unless” part of the ability is dealt with when the a..." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [603.5]: Some triggered abilities’ effects are optional (they contain “may,” as in “At the beginning of your upkeep, you may draw a card”). These abilities go on the stack when they trigger, regardless of whether their controller intends to exercise the ability’s option or not. The choice is made when the ability resolves. Likewise, triggered abilities that have an effect “unless” something is true or a player chooses to do something will go on the stack normally; the “unless” part of the ability is dealt with when the ability resolves. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [603.5].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[603.5]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V3. Rule 603.8 anchor - Some triggered abilities trigger when a game state

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 603.8. Apply this rule text to the dispute: "Some triggered abilities trigger when a game state (such as a player controlling no permanents of a particular card type) is true, rather than triggering when an event occurs. These abilities trigger as soon as the game state matches the condition. They’ll go onto the stack at the next available opportunity. These are called state triggers. (Note that state triggers aren’t the same as state-based actions.) A state-triggered ability doesn’t trigger again until the ability has resolved, has been countered, or has..." Example to consider: A permanent’s ability reads, “Whenever you have no cards in hand, draw a card.” If its controller plays the last card from their hand, the ability will trigger once and won’t trigger again until it has left the stack. If its controller casts a spell that reads “Discard your hand, then draw that many cards,” the ability will trigger during the spell’s reso... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [603.8]: Some triggered abilities trigger when a game state (such as a player controlling no permanents of a particular card type) is true, rather than triggering when an event occurs. These abilities trigger as soon as the game state matches the condition. They’ll go onto the stack at the next available opportunity. These are called state triggers. (Note that state triggers aren’t the same as state-based actions.) A state-triggered ability doesn’t trigger again until the ability has resolved, has been countered, or has otherwise left the stack. Then, if the object with the ability is still in the same zone and the game state still matches its trigger condition, the ability will trigger again. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [603.8].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[603.8]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V4. Rule 603.11 anchor - Some objects have a static ability that’s linked

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 603.11. Apply this rule text to the dispute: "Some objects have a static ability that’s linked to one or more triggered abilities. (See rule 607, “Linked Abilities.”) These objects combine the abilities into one paragraph, with the static ability first, followed by each triggered ability that’s linked to it. A very few objects have triggered abilities which are written with the trigger condition in the middle of the ability, rather than at the beginning." Example to consider: An ability that reads “Reveal the first card you draw each turn. Whenever you reveal a basic land card this way, draw a card” is a static ability linked to a triggered ability. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [603.11]: Some objects have a static ability that’s linked to one or more triggered abilities. (See rule 607, “Linked Abilities.”) These objects combine the abilities into one paragraph, with the static ability first, followed by each triggered ability that’s linked to it. A very few objects have triggered abilities which are written with the trigger condition in the middle of the ability, rather than at the beginning. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [603.11].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[603.11]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V5. Rule 603.12 anchor - A resolving spell or ability may allow or

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 603.12. Apply this rule text to the dispute: "A resolving spell or ability may allow or instruct a player to take an action and create a triggered ability that triggers “when [a player] [does or doesn’t]” take that action or “when [something happens] this way.” These reflexive triggered abilities follow the rules for delayed triggered abilities (see rule 603.7), except that they’re checked immediately after being created and trigger based on whether the trigger event or events occurred earlier during the resolution of the spell or ability that created them." Example to consider: Heart-Piercer Manticore has an ability that reads “When this creature enters, you may sacrifice another creature. When you do, this creature deals damage equal to that creature’s power to any target.” The reflexive triggered ability triggers only when you sacrifice another creature due to the original triggered ability, and not if you sacrifice a creature... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [603.12]: A resolving spell or ability may allow or instruct a player to take an action and create a triggered ability that triggers “when [a player] [does or doesn’t]” take that action or “when [something happens] this way.” These reflexive triggered abilities follow the rules for delayed triggered abilities (see rule 603.7), except that they’re checked immediately after being created and trigger based on whether the trigger event or events occurred earlier during the resolution of the spell or ability that created them. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [603.12].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[603.12]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V6. Rule 704.3 anchor - Whenever a player would get priority see rule

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 704.3. Apply this rule text to the dispute: "Whenever a player would get priority (see rule 117, “Timing and Priority”), the game checks for any of the listed conditions for state-based actions, then performs all applicable state-based actions simultaneously as a single event. If any state-based actions are performed as a result of a check, the check is repeated; otherwise all triggered abilities that are waiting to be put on the stack are put on the stack, then the check is repeated. Once no more state-based actions have been performed as the result of a..." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [704.3]: Whenever a player would get priority (see rule 117, “Timing and Priority”), the game checks for any of the listed conditions for state-based actions, then performs all applicable state-based actions simultaneously as a single event. If any state-based actions are performed as a result of a check, the check is repeated; otherwise all triggered abilities that are waiting to be put on the stack are put on the stack, then the check is repeated. Once no more state-based actions have been performed as the result of a check and no triggered abilities are waiting to be put on the stack, the appropriate player gets priority. This process also occurs during the cleanup step (see rule 514), except t... The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [704.3].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[704.3]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V7. Rule 704.4 anchor - Unlike triggered abilities state-based actions pay no attention

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 704.4. Apply this rule text to the dispute: "Unlike triggered abilities, state-based actions pay no attention to what happens during the resolution of a spell or ability." Example to consider: A player controls Maro, a creature with the ability “Maro’s power and toughness are each equal to the number of cards in your hand” and casts a spell whose effect is “Discard your hand, then draw seven cards.” Maro will temporarily have toughness 0 in the middle of the spell’s resolution but will be back up to toughness 7 when the spell finishes resolving... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [704.4]: Unlike triggered abilities, state-based actions pay no attention to what happens during the resolution of a spell or ability. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [704.4].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[704.4]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V8. Rule 704.6 anchor - Some variant games include additional state-based actions that

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 704.6. Apply this rule text to the dispute: "Some variant games include additional state-based actions that aren’t normally applicable:" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [704.6]: Some variant games include additional state-based actions that aren’t normally applicable: The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [704.6].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[704.6]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V9. Rule 704.7 anchor - If multiple state-based actions would have the same

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 704.7. Apply this rule text to the dispute: "If multiple state-based actions would have the same result at the same time, a single replacement effect will replace all of them." Example to consider: You control Lich’s Mirror, which says “If you would lose the game, instead shuffle your hand, your graveyard, and all permanents you own into your library, then draw seven cards and your life total becomes 20.” There’s one card in your library and your life total is 1. A spell causes you to draw two cards and lose 2 life. The next time state-based actions... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [704.7]: If multiple state-based actions would have the same result at the same time, a single replacement effect will replace all of them. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [704.7].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[704.7]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V10. Rule 704.8 anchor - If a state-based action results in a permanent

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 704.8. Apply this rule text to the dispute: "If a state-based action results in a permanent leaving the battlefield at the same time other state-based actions were performed, that permanent’s last known information is derived from the game state before any of those state-based actions were performed." Example to consider: You control Young Wolf, a 1/1 creature with undying, and it has a +1/+1 counter on it. A spell puts three -1/-1 counters on Young Wolf. Before state-based actions are performed, Young Wolf has one +1/+1 counter and three -1/-1 counters on it. After state-based actions are performed, Young Wolf is in the graveyard. When it was last on the battlefield, it h... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [704.8]: If a state-based action results in a permanent leaving the battlefield at the same time other state-based actions were performed, that permanent’s last known information is derived from the game state before any of those state-based actions were performed. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [704.8].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[704.8]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V11. Rule 603.2 anchor - Whenever a game event or game state matches

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 603.2. Apply this rule text to the dispute: "Whenever a game event or game state matches a triggered ability’s trigger event, that ability automatically triggers. The ability doesn’t do anything at this point." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [603.2]: Whenever a game event or game state matches a triggered ability’s trigger event, that ability automatically triggers. The ability doesn’t do anything at this point. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [603.2].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[603.2]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V12. Rule 603.3 anchor - Once an ability has triggered its controller puts

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 603.3. Apply this rule text to the dispute: "Once an ability has triggered, its controller puts it on the stack as an object that’s not a card the next time a player would receive priority. See rule 117, “Timing and Priority.” The ability becomes the topmost object on the stack. It has the text of the ability that created it, and no other characteristics. It remains on the stack until it’s countered, it resolves, a rule causes it to be removed from the stack, or an effect moves it elsewhere." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [603.3]: Once an ability has triggered, its controller puts it on the stack as an object that’s not a card the next time a player would receive priority. See rule 117, “Timing and Priority.” The ability becomes the topmost object on the stack. It has the text of the ability that created it, and no other characteristics. It remains on the stack until it’s countered, it resolves, a rule causes it to be removed from the stack, or an effect moves it elsewhere. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [603.3].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[603.3]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V13. Rule 603.6 anchor - Trigger events that involve objects changing zones are

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 603.6. Apply this rule text to the dispute: "Trigger events that involve objects changing zones are called “zone-change triggers.” Many abilities with zone-change triggers attempt to do something to that object after it changes zones. During resolution, these abilities look for the object in the zone that it moved to. If the object is unable to be found in the zone it went to, the part of the ability attempting to do something to the object will fail to do anything. The ability could be unable to find the object because the object never entered the specifi..." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [603.6]: Trigger events that involve objects changing zones are called “zone-change triggers.” Many abilities with zone-change triggers attempt to do something to that object after it changes zones. During resolution, these abilities look for the object in the zone that it moved to. If the object is unable to be found in the zone it went to, the part of the ability attempting to do something to the object will fail to do anything. The ability could be unable to find the object because the object never entered the specified zone, because it left the zone before the ability resolved, or because it is in a zone that is hidden from a player, such as a library or an opponent’s hand. (This rule applies... The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [603.6].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[603.6]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V14. Rule 603.7 anchor - An effect may create a delayed triggered ability

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 603.7. Apply this rule text to the dispute: "An effect may create a delayed triggered ability that can do something at a later time. A delayed triggered ability will contain “when,” “whenever,” or “at,” although that word won’t usually begin the ability." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [603.7]: An effect may create a delayed triggered ability that can do something at a later time. A delayed triggered ability will contain “when,” “whenever,” or “at,” although that word won’t usually begin the ability. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [603.7].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[603.7]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V15. Rule 603.10 anchor - Normally objects that exist immediately after an event

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 603.10. Apply this rule text to the dispute: "Normally, objects that exist immediately after an event are checked to see if the event matched any trigger conditions, and continuous effects that exist at that time are used to determine what the trigger conditions are and what the objects involved in the event look like. However, some triggered abilities are exceptions to this rule; the game “looks back in time” to determine if those abilities trigger, using the existence of those abilities and the appearance of objects immediately prior to the event. The lis..." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [603.10]: Normally, objects that exist immediately after an event are checked to see if the event matched any trigger conditions, and continuous effects that exist at that time are used to determine what the trigger conditions are and what the objects involved in the event look like. However, some triggered abilities are exceptions to this rule; the game “looks back in time” to determine if those abilities trigger, using the existence of those abilities and the appearance of objects immediately prior to the event. The list of exceptions is as follows: The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [603.10].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[603.10]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V16. Rule 704.1 anchor - State-based actions are game actions that happen automatically

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 704.1. Apply this rule text to the dispute: "State-based actions are game actions that happen automatically whenever certain conditions (listed below) are met. State-based actions don’t use the stack." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [704.1]: State-based actions are game actions that happen automatically whenever certain conditions (listed below) are met. State-based actions don’t use the stack. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [704.1].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[704.1]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V17. Rule 704.2 anchor - State-based actions are checked throughout the game and

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 704.2. Apply this rule text to the dispute: "State-based actions are checked throughout the game and are not controlled by any player." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [704.2]: State-based actions are checked throughout the game and are not controlled by any player. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [704.2].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[704.2]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V18. Rule 603.1a anchor - A triggered ability may include instructions after its

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 603.1a. Apply this rule text to the dispute: "A triggered ability may include instructions after its effects that limit what the ability may target or state that it can’t be countered. This text is not part of the ability’s effect. It functions while the ability is on the stack." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [603.1a]: A triggered ability may include instructions after its effects that limit what the ability may target or state that it can’t be countered. This text is not part of the ability’s effect. It functions while the ability is on the stack. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [603.1a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[603.1a]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V19. Rule 603.3a anchor - A triggered ability is controlled by the player

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 603.3a. Apply this rule text to the dispute: "A triggered ability is controlled by the player who controlled its source at the time it triggered, unless it’s a delayed triggered ability. To determine the controller of a delayed triggered ability, see rules 603.7d–f." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [603.3a]: A triggered ability is controlled by the player who controlled its source at the time it triggered, unless it’s a delayed triggered ability. To determine the controller of a delayed triggered ability, see rules 603.7d–f. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [603.3a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[603.3a]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V20. Rule 603.7a anchor - Delayed triggered abilities are created during the resolution

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 603.7a. Apply this rule text to the dispute: "Delayed triggered abilities are created during the resolution of spells or abilities, as the result of a replacement effect being applied, or as a result of a static ability that allows a player to take an action. A delayed triggered ability won’t trigger until it has actually been created, even if its trigger event occurred just beforehand. Other events that happen earlier may make the trigger event impossible." Example to consider: Part of an effect reads “When this creature leaves the battlefield,” but the creature in question leaves the battlefield before the spell or ability creating the effect resolves. In this case, the delayed ability never triggers. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [603.7a]: Delayed triggered abilities are created during the resolution of spells or abilities, as the result of a replacement effect being applied, or as a result of a static ability that allows a player to take an action. A delayed triggered ability won’t trigger until it has actually been created, even if its trigger event occurred just beforehand. Other events that happen earlier may make the trigger event impossible. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [603.7a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[603.7a]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V21. Rule 603.9 anchor - Some triggered abilities trigger specifically when a player

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 603.9. Apply this rule text to the dispute: "Some triggered abilities trigger specifically when a player loses the game. These abilities trigger when a player loses or leaves the game, regardless of the reason, unless that player leaves the game as the result of a draw. See rule 104.3." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [603.9]: Some triggered abilities trigger specifically when a player loses the game. These abilities trigger when a player loses or leaves the game, regardless of the reason, unless that player leaves the game as the result of a draw. See rule 104.3. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [603.9].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[603.9]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V22. Rule 603.10a anchor - Some zone-change triggers look back in time These

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 603.10a. Apply this rule text to the dispute: "Some zone-change triggers look back in time. These are leaves-the-battlefield abilities, abilities that trigger when a player sacrifices a permanent, abilities that trigger when a card leaves a graveyard, and abilities that trigger when an object that all players can see is put into a hand or library." Example to consider: Two creatures are on the battlefield along with an artifact that has the ability “Whenever a creature dies, you gain 1 life.” Someone casts a spell that destroys all artifacts, creatures, and enchantments. The artifact’s ability triggers twice, even though the artifact goes to its owner’s graveyard at the same time as the creatures. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [603.10a]: Some zone-change triggers look back in time. These are leaves-the-battlefield abilities, abilities that trigger when a player sacrifices a permanent, abilities that trigger when a card leaves a graveyard, and abilities that trigger when an object that all players can see is put into a hand or library. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [603.10a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[603.10a]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V23. Rule 603.1 anchor - Triggered abilities have a trigger condition and an

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 603.1. Apply this rule text to the dispute: "Triggered abilities have a trigger condition and an effect. They are written as “[When/Whenever/At] [trigger condition or event], [effect]. [Instructions (if any).]”" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [603.1]: Triggered abilities have a trigger condition and an effect. They are written as “[When/Whenever/At] [trigger condition or event], [effect]. [Instructions (if any).]” The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [603.1].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[603.1]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V24. Rule 603.2a anchor - Because they aren’t cast or activated triggered abilities

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 603.2a. Apply this rule text to the dispute: "Because they aren’t cast or activated, triggered abilities can trigger even when it isn’t legal to cast spells and activate abilities. Effects that preclude abilities from being activated don’t affect them." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [603.2a]: Because they aren’t cast or activated, triggered abilities can trigger even when it isn’t legal to cast spells and activate abilities. Effects that preclude abilities from being activated don’t affect them. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [603.2a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[603.2a]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V25. Rule 603.6a anchor - Enters-the-battlefield abilities trigger when a permanent enters the

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 603.6a. Apply this rule text to the dispute: "Enters-the-battlefield abilities trigger when a permanent enters the battlefield. These are written, “When [this object] enters, . . . “ or “Whenever a [type] enters, . . .” Each time an event puts one or more permanents onto the battlefield, all permanents on the battlefield (including the newcomers) are checked for any enters-the-battlefield triggers that match the event." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [603.6a]: Enters-the-battlefield abilities trigger when a permanent enters the battlefield. These are written, “When [this object] enters, . . . “ or “Whenever a [type] enters, . . .” Each time an event puts one or more permanents onto the battlefield, all permanents on the battlefield (including the newcomers) are checked for any enters-the-battlefield triggers that match the event. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [603.6a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[603.6a]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V26. Rule 603.12a anchor - Normally if the trigger event or events occur

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 603.12a. Apply this rule text to the dispute: "Normally, if the trigger event or events occur multiple times during the resolution of the spell or ability that created it, the reflexive triggered ability will trigger once for each of those times. However, if a resolving spell or ability includes a choice to pay a cost “any number of times” and creates a triggered ability that triggers “when [a player] pays [that cost] one or more times,” paying that cost one or more times causes the reflexive triggered ability to trigger only once." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [603.12a]: Normally, if the trigger event or events occur multiple times during the resolution of the spell or ability that created it, the reflexive triggered ability will trigger once for each of those times. However, if a resolving spell or ability includes a choice to pay a cost “any number of times” and creates a triggered ability that triggers “when [a player] pays [that cost] one or more times,” paying that cost one or more times causes the reflexive triggered ability to trigger only once. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [603.12a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[603.12a]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V27. Rule 704.1a anchor - Abilities that watch for a specified game state

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 704.1a. Apply this rule text to the dispute: "Abilities that watch for a specified game state are triggered abilities, not state-based actions. (See rule 603, “Handling Triggered Abilities.”)" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [704.1a]: Abilities that watch for a specified game state are triggered abilities, not state-based actions. (See rule 603, “Handling Triggered Abilities.”) The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [704.1a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[704.1a]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V28. Rule 603.2d anchor - An ability may state that a triggered ability

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 603.2d. Apply this rule text to the dispute: "An ability may state that a triggered ability triggers additional times. In this case, rather than simply determining that such an ability has triggered, determine how many times it should trigger, then that ability triggers that many times. An effect that states that an ability triggers additional times doesn’t invoke itself repeatedly and doesn’t apply to other effects that affect how many times an ability triggers. An effect that states a triggered ability of an object triggers additional times refers only to..." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [603.2d]: An ability may state that a triggered ability triggers additional times. In this case, rather than simply determining that such an ability has triggered, determine how many times it should trigger, then that ability triggers that many times. An effect that states that an ability triggers additional times doesn’t invoke itself repeatedly and doesn’t apply to other effects that affect how many times an ability triggers. An effect that states a triggered ability of an object triggers additional times refers only to triggered abilities that object has, not to any delayed or reflexive triggered abilities (see rule 603.7 and rule 603.12) that may be created by abilities the object has. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [603.2d].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[603.2d]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V29. Rule 603.3c anchor - If a triggered ability is modal its controller

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 603.3c. Apply this rule text to the dispute: "If a triggered ability is modal, its controller announces the mode choice when putting the ability on the stack. If one of the modes would be illegal (due to an inability to choose legal targets, for example), that mode can’t be chosen. If no mode is chosen, the ability is removed from the stack. (See rule 700.2.)" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [603.3c]: If a triggered ability is modal, its controller announces the mode choice when putting the ability on the stack. If one of the modes would be illegal (due to an inability to choose legal targets, for example), that mode can’t be chosen. If no mode is chosen, the ability is removed from the stack. (See rule 700.2.) The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [603.3c].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[603.3c]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V30. Rule 603.3d anchor - The remainder of the process for putting a

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 603.3d. Apply this rule text to the dispute: "The remainder of the process for putting a triggered ability on the stack is identical to the process for casting a spell listed in rules 601.2c–d. If a choice is required when the triggered ability goes on the stack but no legal choices can be made for it, or if a rule or a continuous effect otherwise makes the ability illegal, the ability is simply removed from the stack." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [603.3d]: The remainder of the process for putting a triggered ability on the stack is identical to the process for casting a spell listed in rules 601.2c–d. If a choice is required when the triggered ability goes on the stack but no legal choices can be made for it, or if a rule or a continuous effect otherwise makes the ability illegal, the ability is simply removed from the stack. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [603.3d].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[603.3d]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V31. Rule 603.7b anchor - A delayed triggered ability will trigger only once—the

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 603.7b. Apply this rule text to the dispute: "A delayed triggered ability will trigger only once—the next time its trigger event occurs—unless it has a stated duration, such as “this turn.” If its trigger event occurs more than once simultaneously and the ability doesn’t have a stated duration, the controller of the delayed triggered ability chooses which event causes the ability to trigger." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [603.7b]: A delayed triggered ability will trigger only once—the next time its trigger event occurs—unless it has a stated duration, such as “this turn.” If its trigger event occurs more than once simultaneously and the ability doesn’t have a stated duration, the controller of the delayed triggered ability chooses which event causes the ability to trigger. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [603.7b].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[603.7b]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V32. Rule 603.7c anchor - A delayed triggered ability that refers to a

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 603.7c. Apply this rule text to the dispute: "A delayed triggered ability that refers to a particular object still affects it even if the object changes characteristics. However, if that object is no longer in the zone it’s expected to be in at the time the delayed triggered ability resolves, the ability won’t affect it. (Note that if that object left that zone and then returned, it’s a new object and thus won’t be affected. See rule 400.7.)" Example to consider: An ability that reads “Exile this creature at the beginning of the next end step” will exile the permanent even if it’s no longer a creature during the next end step. However, it won’t do anything if the permanent left the battlefield before then. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [603.7c]: A delayed triggered ability that refers to a particular object still affects it even if the object changes characteristics. However, if that object is no longer in the zone it’s expected to be in at the time the delayed triggered ability resolves, the ability won’t affect it. (Note that if that object left that zone and then returned, it’s a new object and thus won’t be affected. See rule 400.7.) The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [603.7c].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[603.7c]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V33. Rule 704.5a anchor - If a player has 0 or less life

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 704.5a. Apply this rule text to the dispute: "If a player has 0 or less life, that player loses the game." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [704.5a]: If a player has 0 or less life, that player loses the game. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [704.5a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[704.5a]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V34. Rule 704.6a anchor - In a Two-Headed Giant game if a team

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 704.6a. Apply this rule text to the dispute: "In a Two-Headed Giant game, if a team has 0 or less life, that team loses the game. See rule 810, “Two-Headed Giant Variant.”" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [704.6a]: In a Two-Headed Giant game, if a team has 0 or less life, that team loses the game. See rule 810, “Two-Headed Giant Variant.” The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [704.6a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[704.6a]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V35. Rule 603.2e anchor - Some trigger events use the word “becomes” for

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 603.2e. Apply this rule text to the dispute: "Some trigger events use the word “becomes” (for example, “becomes attached” or “becomes blocked”). These trigger only at the time the named event happens—they don’t trigger if that state already exists or retrigger if it persists. An ability that triggers when a permanent “becomes tapped” or “becomes untapped” doesn’t trigger if the permanent enters the battlefield in that state." Example to consider: An ability that triggers when a permanent “becomes tapped” triggers only when the status of a permanent that’s already on the battlefield changes from untapped to tapped. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [603.2e]: Some trigger events use the word “becomes” (for example, “becomes attached” or “becomes blocked”). These trigger only at the time the named event happens—they don’t trigger if that state already exists or retrigger if it persists. An ability that triggers when a permanent “becomes tapped” or “becomes untapped” doesn’t trigger if the permanent enters the battlefield in that state. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [603.2e].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[603.2e]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V36. Rule 603.3b anchor - If multiple abilities have triggered since the last

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 603.3b. Apply this rule text to the dispute: "If multiple abilities have triggered since the last time a player received priority, the abilities are placed on the stack in a two-part process. First, each player, in APNAP order, puts each triggered ability they control with a trigger condition that isn’t another ability triggering on the stack in any order they choose. (See rule 101.4.) Second, each player, in APNAP order, puts all remaining triggered abilities they control on the stack in any order they choose. Then the game once again checks for and perfor..." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [603.3b]: If multiple abilities have triggered since the last time a player received priority, the abilities are placed on the stack in a two-part process. First, each player, in APNAP order, puts each triggered ability they control with a trigger condition that isn’t another ability triggering on the stack in any order they choose. (See rule 101.4.) Second, each player, in APNAP order, puts all remaining triggered abilities they control on the stack in any order they choose. Then the game once again checks for and performs state-based actions until none are performed, then abilities that triggered during this process go on the stack. This process repeats until no new state-based actions are perfor... The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [603.3b].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[603.3b]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V37. Rule 603.2g anchor - An ability triggers only if its trigger event

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 603.2g. Apply this rule text to the dispute: "An ability triggers only if its trigger event actually occurs. An event that’s prevented or replaced won’t trigger anything." Example to consider: An ability that triggers on damage being dealt won’t trigger if all the damage is prevented. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [603.2g]: An ability triggers only if its trigger event actually occurs. An event that’s prevented or replaced won’t trigger anything. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [603.2g].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[603.2g]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V38. Rule 603.2c anchor - An ability triggers only once each time its

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 603.2c. Apply this rule text to the dispute: "An ability triggers only once each time its trigger event occurs. However, it can trigger repeatedly if one event contains multiple occurrences." Example to consider: A permanent has an ability whose trigger condition reads, “Whenever a land is put into a graveyard from the battlefield, . . . .” If someone casts a spell that destroys all lands, the ability will trigger once for each land put into the graveyard during the spell’s resolution. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [603.2c]: An ability triggers only once each time its trigger event occurs. However, it can trigger repeatedly if one event contains multiple occurrences. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [603.2c].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[603.2c]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V39. Rule 603.6b anchor - Continuous effects that modify characteristics of a permanent

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 603.6b. Apply this rule text to the dispute: "Continuous effects that modify characteristics of a permanent do so the moment the permanent is on the battlefield (and not before then). The permanent is never on the battlefield with its unmodified characteristics. Continuous effects don’t apply before the permanent is on the battlefield, however (see rule 603.6d)." Example to consider: If an effect reads “All lands are creatures” and a land card is played, the effect makes the land card into a creature the moment it enters the battlefield, so it would trigger abilities that trigger when a creature enters the battlefield. Conversely, if an effect reads “All creatures lose all abilities” and a creature card with an enters-the-battlefield... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [603.6b]: Continuous effects that modify characteristics of a permanent do so the moment the permanent is on the battlefield (and not before then). The permanent is never on the battlefield with its unmodified characteristics. Continuous effects don’t apply before the permanent is on the battlefield, however (see rule 603.6d). The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [603.6b].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[603.6b]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V40. Rule 603.6c anchor - Leaves-the-battlefield abilities trigger when a permanent moves from

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 603.6c. Apply this rule text to the dispute: "Leaves-the-battlefield abilities trigger when a permanent moves from the battlefield to another zone, or when a phased-in permanent leaves the game because its owner leaves the game. These are written as, but aren’t limited to, “When [this object] leaves the battlefield, . . .” or “Whenever [something] is put into a graveyard from the battlefield, . . . .” (See also rule 603.10.) An ability that attempts to do something to the card that left the battlefield checks for it only in the first zone that it went to. A..." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [603.6c]: Leaves-the-battlefield abilities trigger when a permanent moves from the battlefield to another zone, or when a phased-in permanent leaves the game because its owner leaves the game. These are written as, but aren’t limited to, “When [this object] leaves the battlefield, . . .” or “Whenever [something] is put into a graveyard from the battlefield, . . . .” (See also rule 603.10.) An ability that attempts to do something to the card that left the battlefield checks for it only in the first zone that it went to. An ability that triggers when a card is put into a certain zone “from anywhere” is never treated as a leaves-the-battlefield ability, even if an object is put into that zone from th... The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [603.6c].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[603.6c]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V41. Rule 704.6d anchor - In a Commander game if a commander is

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 704.6d. Apply this rule text to the dispute: "In a Commander game, if a commander is in a graveyard or in exile and that object was put into that zone since the last time state-based actions were checked, its owner may put it into the command zone. See rule 903, “Commander.”" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [704.6d]: In a Commander game, if a commander is in a graveyard or in exile and that object was put into that zone since the last time state-based actions were checked, its owner may put it into the command zone. See rule 903, “Commander.” The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [704.6d].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[704.6d]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V42. Rule 603.6e anchor - Some Auras have triggered abilities that trigger on

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 603.6e. Apply this rule text to the dispute: "Some Auras have triggered abilities that trigger on the enchanted permanent leaving the battlefield. These triggered abilities can find the new object that permanent card became in the zone it moved to; they can also find the new object the Aura card became in its owner’s graveyard after state-based actions have been checked. See rule 400.7." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [603.6e]: Some Auras have triggered abilities that trigger on the enchanted permanent leaving the battlefield. These triggered abilities can find the new object that permanent card became in the zone it moved to; they can also find the new object the Aura card became in its owner’s graveyard after state-based actions have been checked. See rule 400.7. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [603.6e].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[603.6e]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V43. Rule 704.6e anchor - In an Archenemy game if a non-ongoing scheme

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 704.6e. Apply this rule text to the dispute: "In an Archenemy game, if a non-ongoing scheme card is face up in the command zone, and no triggered abilities of any scheme are on the stack or waiting to be put on the stack, that scheme card is turned face down and put on the bottom of its owner’s scheme deck. See rule 904, “Archenemy.”" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [704.6e]: In an Archenemy game, if a non-ongoing scheme card is face up in the command zone, and no triggered abilities of any scheme are on the stack or waiting to be put on the stack, that scheme card is turned face down and put on the bottom of its owner’s scheme deck. See rule 904, “Archenemy.” The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [704.6e].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[704.6e]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V44. Rule 704.5m anchor - If an Aura is attached to an illegal

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 704.5m. Apply this rule text to the dispute: "If an Aura is attached to an illegal object or player, or is not attached to an object or player, that Aura is put into its owner’s graveyard." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [704.5m]: If an Aura is attached to an illegal object or player, or is not attached to an object or player, that Aura is put into its owner’s graveyard. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [704.5m].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[704.5m]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V45. Rule 704.5s anchor - If the number of lore counters on a

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 704.5s. Apply this rule text to the dispute: "If the number of lore counters on a Saga permanent with one or more chapter abilities is greater than or equal to its final chapter number and it isn’t the source of a chapter ability that has triggered but not yet left the stack, that Saga’s controller sacrifices it. See rule 714, “Saga Cards.”" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [704.5s]: If the number of lore counters on a Saga permanent with one or more chapter abilities is greater than or equal to its final chapter number and it isn’t the source of a chapter ability that has triggered but not yet left the stack, that Saga’s controller sacrifices it. See rule 714, “Saga Cards.” The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [704.5s].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[704.5s]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V46. Rule 704.5b anchor - If a player attempted to draw a card

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 704.5b. Apply this rule text to the dispute: "If a player attempted to draw a card from a library with no cards in it since the last time state-based actions were checked, that player loses the game." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [704.5b]: If a player attempted to draw a card from a library with no cards in it since the last time state-based actions were checked, that player loses the game. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [704.5b].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[704.5b]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V47. Rule 704.5c anchor - If a player has ten or more poison

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 704.5c. Apply this rule text to the dispute: "If a player has ten or more poison counters, that player loses the game. Ignore this rule in Two-Headed Giant games; see rule 704.6b instead." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [704.5c]: If a player has ten or more poison counters, that player loses the game. Ignore this rule in Two-Headed Giant games; see rule 704.6b instead. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [704.5c].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[704.5c]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V48. Rule 704.5e anchor - If a copy of a spell is in

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 704.5e. Apply this rule text to the dispute: "If a copy of a spell is in a zone other than the stack, it ceases to exist. If a copy of a card is in any zone other than the stack or the battlefield, it ceases to exist." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [704.5e]: If a copy of a spell is in a zone other than the stack, it ceases to exist. If a copy of a card is in any zone other than the stack or the battlefield, it ceases to exist. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [704.5e].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[704.5e]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V49. Rule 704.5n anchor - If an Equipment or Fortification is attached to

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 704.5n. Apply this rule text to the dispute: "If an Equipment or Fortification is attached to an illegal permanent or to a player, it becomes unattached from that permanent or player. It remains on the battlefield." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [704.5n]: If an Equipment or Fortification is attached to an illegal permanent or to a player, it becomes unattached from that permanent or player. It remains on the battlefield. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [704.5n].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[704.5n]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V50. Rule 704.5v anchor - If a battle has defense 0 and it

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 704.5v. Apply this rule text to the dispute: "If a battle has defense 0 and it isn’t the source of an ability that has triggered but not yet left the stack, it’s put into its owner’s graveyard." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [704.5v]: If a battle has defense 0 and it isn’t the source of an ability that has triggered but not yet left the stack, it’s put into its owner’s graveyard. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [704.5v].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[704.5v]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V51. Rule 704.6c anchor - In a Commander game a player who’s been

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 704.6c. Apply this rule text to the dispute: "In a Commander game, a player who’s been dealt 21 or more combat damage by the same commander over the course of the game loses the game. See rule 903, “Commander.”" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [704.6c]: In a Commander game, a player who’s been dealt 21 or more combat damage by the same commander over the course of the game loses the game. See rule 903, “Commander.” The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [704.6c].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[704.6c]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V52. Rule 704.6f anchor - In a Planechase game if a phenomenon card

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 704.6f. Apply this rule text to the dispute: "In a Planechase game, if a phenomenon card is face up in the command zone, and it isn’t the source of a triggered ability that has triggered but not yet left the stack, the planar controller planeswalks. See rule 901, “Planechase.”" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [704.6f]: In a Planechase game, if a phenomenon card is face up in the command zone, and it isn’t the source of a triggered ability that has triggered but not yet left the stack, the planar controller planeswalks. See rule 901, “Planechase.” The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [704.6f].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[704.6f]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

## V53. Rule 603.7f anchor - If a static ability generates a replacement effect

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a triggered abilities and state-based actions dispute governed by rule 603.7f. Apply this rule text to the dispute: "If a static ability generates a replacement effect which causes a delayed triggered ability to be created, the source of that delayed triggered ability is the object with that static ability. The controller of that delayed triggered ability is the same as the controller of that object at the time the replacement effect was applied." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [603.7f]: If a static ability generates a replacement effect which causes a delayed triggered ability to be created, the source of that delayed triggered ability is the object with that static ability. The controller of that delayed triggered ability is the same as the controller of that object at the time the replacement effect was applied. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [603.7f].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[603.7f]`.

**Why this test matters:** Broad coverage anchor for Triggered Abilities and State-Based Actions. Source docs: L04_Trigger_603_seg1/2/3_v/t.md, L04_Trigger_engine.md, L05_StateEnforcement_704_v/t.md.

---

# CATEGORY W - Events, Effects, Replacement, Prevention, Layers

**Connected docs:**
- `L03_Event_609to610_v/t.md`
- `L03_Event_614to616_v/t.md`
- `L08_ContinuousEffects_604_v/t.md`
- `L08_ContinuousEffects_611to613_v/t.md`

## W1. Rule 604.5 anchor - Some static abilities apply while a spell is

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 604.5. Apply this rule text to the dispute: "Some static abilities apply while a spell is on the stack. These are often abilities that refer to countering the spell. Also, abilities that say “As an additional cost to cast . . . ,” “You may pay [cost] rather than pay [this object]’s mana cost,” and “You may cast [this object] without paying its mana cost” work while a spell is on the stack." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [604.5]: Some static abilities apply while a spell is on the stack. These are often abilities that refer to countering the spell. Also, abilities that say “As an additional cost to cast . . . ,” “You may pay [cost] rather than pay [this object]’s mana cost,” and “You may cast [this object] without paying its mana cost” work while a spell is on the stack. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [604.5].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[604.5]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W2. Rule 604.6 anchor - Some static abilities apply while a card is

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 604.6. Apply this rule text to the dispute: "Some static abilities apply while a card is in any zone that you could cast or play it from (usually your hand). These are limited to those that read, “You may [cast/play] [this card] . . . ,” “You can’t [cast/play] [this card] . . . ,” and “[Cast/Play] [this card] only . . . .”" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [604.6]: Some static abilities apply while a card is in any zone that you could cast or play it from (usually your hand). These are limited to those that read, “You may [cast/play] [this card] . . . ,” “You can’t [cast/play] [this card] . . . ,” and “[Cast/Play] [this card] only . . . .” The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [604.6].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[604.6]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W3. Rule 613.5 anchor - The application of continuous effects as described by

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 613.5. Apply this rule text to the dispute: "The application of continuous effects as described by the layer system is continually and automatically performed by the game. All resulting changes to an object’s characteristics are instantaneous." Example to consider: Honor of the Pure is an enchantment that reads “White creatures you control get +1/+1.” Honor of the Pure and a 2/2 black creature are on the battlefield under your control. If an effect then turns the creature white (layer 5), it gets +1/+1 from Honor of the Pure (layer 7c), becoming 3/3. If the creature’s color is later changed to red (layer 5), Honor o... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [613.5]: The application of continuous effects as described by the layer system is continually and automatically performed by the game. All resulting changes to an object’s characteristics are instantaneous. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [613.5].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[613.5]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W4. Rule 613.6 anchor - If an effect should be applied in different

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 613.6. Apply this rule text to the dispute: "If an effect should be applied in different layers and/or sublayers, the parts of the effect each apply in their appropriate ones. If an effect starts to apply in one layer and/or sublayer, it will continue to be applied to the same set of objects in each other applicable layer and/or sublayer, even if the ability generating the effect is removed during this process." Example to consider: An effect that reads “This creature gets +1/+1 and becomes the color of your choice until end of turn” is both a power- and toughness-changing effect and a color-changing effect. The “becomes the color of your choice” part is applied in layer 5, and then the “gets +1/+1” part is applied in layer 7c. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [613.6]: If an effect should be applied in different layers and/or sublayers, the parts of the effect each apply in their appropriate ones. If an effect starts to apply in one layer and/or sublayer, it will continue to be applied to the same set of objects in each other applicable layer and/or sublayer, even if the ability generating the effect is removed during this process. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [613.6].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[613.6]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W5. Rule 614.5 anchor - A replacement effect doesn’t invoke itself repeatedly it

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 614.5. Apply this rule text to the dispute: "A replacement effect doesn’t invoke itself repeatedly; it gets only one opportunity to affect an event or any modified events that may replace that event." Example to consider: A player controls two permanents, each with an ability that reads “If a creature you control would deal damage to a permanent or player, it deals double that damage to that permanent or player instead.” A creature that normally deals 2 damage will deal 8 damage—not just 4, and not an infinite amount. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [614.5]: A replacement effect doesn’t invoke itself repeatedly; it gets only one opportunity to affect an event or any modified events that may replace that event. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [614.5].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[614.5]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W6. Rule 614.6 anchor - If an event is replaced it never happens

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 614.6. Apply this rule text to the dispute: "If an event is replaced, it never happens. A modified event occurs instead, which may in turn trigger abilities. Note that the modified event may contain instructions that can’t be carried out, in which case the impossible instruction is simply ignored." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [614.6]: If an event is replaced, it never happens. A modified event occurs instead, which may in turn trigger abilities. Note that the modified event may contain instructions that can’t be carried out, in which case the impossible instruction is simply ignored. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [614.6].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[614.6]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W7. Rule 614.8 anchor - Regeneration is a destruction-replacement effect The word “instead”

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 614.8. Apply this rule text to the dispute: "Regeneration is a destruction-replacement effect. The word “instead” doesn’t appear on the card but is implicit in the definition of regeneration. “Regenerate [permanent]” means “The next time [permanent] would be destroyed this turn, instead remove all damage marked on it and its controller taps it. If it’s an attacking or blocking creature, remove it from combat.” Abilities that trigger from damage being dealt still trigger even if the permanent regenerates. See rule 701.19." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [614.8]: Regeneration is a destruction-replacement effect. The word “instead” doesn’t appear on the card but is implicit in the definition of regeneration. “Regenerate [permanent]” means “The next time [permanent] would be destroyed this turn, instead remove all damage marked on it and its controller taps it. If it’s an attacking or blocking creature, remove it from combat.” Abilities that trigger from damage being dealt still trigger even if the permanent regenerates. See rule 701.19. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [614.8].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[614.8]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W8. Rule 614.10 anchor - An effect that causes a player to skip

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 614.10. Apply this rule text to the dispute: "An effect that causes a player to skip an event, step, phase, or turn is a replacement effect. “Skip [something]” is the same as “Instead of doing [something], do nothing.” Once a step, phase, or turn has started, it can no longer be skipped—any skip effects will wait until the next occurrence." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [614.10]: An effect that causes a player to skip an event, step, phase, or turn is a replacement effect. “Skip [something]” is the same as “Instead of doing [something], do nothing.” Once a step, phase, or turn has started, it can no longer be skipped—any skip effects will wait until the next occurrence. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [614.10].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[614.10]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W9. Rule 614.14 anchor - An object may have one ability printed on

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 614.14. Apply this rule text to the dispute: "An object may have one ability printed on it that generates a replacement effect which causes one or more cards to be exiled, and another ability that refers either to “the exiled cards” or to cards “exiled with [this object].” These abilities are linked: the second refers only to cards in the exile zone that were put there as a direct result of the replacement event caused by the first. If another object gains a pair of linked abilities, the abilities will be similarly linked on that object. They can’t be linke..." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [614.14]: An object may have one ability printed on it that generates a replacement effect which causes one or more cards to be exiled, and another ability that refers either to “the exiled cards” or to cards “exiled with [this object].” These abilities are linked: the second refers only to cards in the exile zone that were put there as a direct result of the replacement event caused by the first. If another object gains a pair of linked abilities, the abilities will be similarly linked on that object. They can’t be linked to any other ability, regardless of what other abilities the object may currently have or may have had in the past. See rule 607, “Linked Abilities.” The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [614.14].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[614.14]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W10. Rule 615.6 anchor - If damage that would be dealt is prevented

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 615.6. Apply this rule text to the dispute: "If damage that would be dealt is prevented, it never happens. A modified event may occur instead, which may in turn trigger abilities. Note that the modified event may contain instructions that can’t be carried out, in which case the impossible instruction is simply ignored." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [615.6]: If damage that would be dealt is prevented, it never happens. A modified event may occur instead, which may in turn trigger abilities. Note that the modified event may contain instructions that can’t be carried out, in which case the impossible instruction is simply ignored. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [615.6].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[615.6]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W11. Rule 615.11 anchor - Some prevention effects prevent the next N damage

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 615.11. Apply this rule text to the dispute: "Some prevention effects prevent the next N damage that would be dealt to each of a number of untargeted creatures. Such an effect creates a prevention shield for each applicable creature when the spell or ability that generates that effect resolves." Example to consider: Wojek Apothecary has an ability that says “{T}: Prevent the next 1 damage that would be dealt to target creature and each other creature that shares a color with it this turn.” When the ability resolves, it gives the target creature and each other creature on the battlefield that shares a color with it at that time a shield preventing the next 1 damage th... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [615.11]: Some prevention effects prevent the next N damage that would be dealt to each of a number of untargeted creatures. Such an effect creates a prevention shield for each applicable creature when the spell or ability that generates that effect resolves. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [615.11].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[615.11]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W12. Rule 604.2 anchor - Static abilities create continuous effects some of which

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 604.2. Apply this rule text to the dispute: "Static abilities create continuous effects, some of which are prevention effects or replacement effects. These effects are active as long as the permanent with the ability remains on the battlefield and has the ability, or as long as the object with the ability remains in the appropriate zone, as described in rule 113.6." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [604.2]: Static abilities create continuous effects, some of which are prevention effects or replacement effects. These effects are active as long as the permanent with the ability remains on the battlefield and has the ability, or as long as the object with the ability remains in the appropriate zone, as described in rule 113.6. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [604.2].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[604.2]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W13. Rule 604.4 anchor - Many Auras Equipment and Fortifications have static abilities

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 604.4. Apply this rule text to the dispute: "Many Auras, Equipment, and Fortifications have static abilities that modify the object they’re attached to, but those abilities don’t target that object. If an Aura, Equipment, or Fortification is moved to a different object, the ability stops applying to the original object and starts modifying the new one." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [604.4]: Many Auras, Equipment, and Fortifications have static abilities that modify the object they’re attached to, but those abilities don’t target that object. If an Aura, Equipment, or Fortification is moved to a different object, the ability stops applying to the original object and starts modifying the new one. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [604.4].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[604.4]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W14. Rule 609.1 anchor - An effect is something that happens in the

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 609.1. Apply this rule text to the dispute: "An effect is something that happens in the game as a result of a spell or ability. When a spell, activated ability, or triggered ability resolves, it may create one or more one-shot or continuous effects. Static abilities may create one or more continuous effects. Text itself is never an effect." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [609.1]: An effect is something that happens in the game as a result of a spell or ability. When a spell, activated ability, or triggered ability resolves, it may create one or more one-shot or continuous effects. Static abilities may create one or more continuous effects. Text itself is never an effect. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [609.1].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[609.1]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W15. Rule 609.2 anchor - Effects apply only to permanents unless the instruction’s

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 609.2. Apply this rule text to the dispute: "Effects apply only to permanents unless the instruction’s text states otherwise or they clearly can apply only to objects in one or more other zones." Example to consider: An effect that changes all lands into creatures won’t alter land cards in players’ graveyards. But an effect that says spells cost more to cast will apply only to spells on the stack, since a spell is always on the stack while a player is casting it. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [609.2]: Effects apply only to permanents unless the instruction’s text states otherwise or they clearly can apply only to objects in one or more other zones. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [609.2].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[609.2]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W16. Rule 609.7 anchor - Some effects apply to damage from a source—for

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 609.7. Apply this rule text to the dispute: "Some effects apply to damage from a source—for example, “The next time a red source of your choice would deal damage to you this turn, prevent that damage.”" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [609.7]: Some effects apply to damage from a source—for example, “The next time a red source of your choice would deal damage to you this turn, prevent that damage.” The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [609.7].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[609.7]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W17. Rule 610.1 anchor - A one-shot effect does something just once and

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 610.1. Apply this rule text to the dispute: "A one-shot effect does something just once and doesn’t have a duration. Examples include dealing damage, destroying a permanent, creating a token, and moving an object from one zone to another." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [610.1]: A one-shot effect does something just once and doesn’t have a duration. Examples include dealing damage, destroying a permanent, creating a token, and moving an object from one zone to another. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [610.1].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[610.1]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W18. Rule 610.2 anchor - Some one-shot effects create a delayed triggered ability

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 610.2. Apply this rule text to the dispute: "Some one-shot effects create a delayed triggered ability, which instructs a player to do something later in the game (usually at a specific time) rather than as the spell or ability that’s creating the one-shot effect resolves. See rule 603.7." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [610.2]: Some one-shot effects create a delayed triggered ability, which instructs a player to do something later in the game (usually at a specific time) rather than as the spell or ability that’s creating the one-shot effect resolves. See rule 603.7. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [610.2].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[610.2]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W19. Rule 610.3 anchor - Some one-shot effects cause an object to change

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 610.3. Apply this rule text to the dispute: "Some one-shot effects cause an object to change zones “until” a specified event occurs. A second one-shot effect is created immediately after the specified event. This second one-shot effect returns the object to its previous zone." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [610.3]: Some one-shot effects cause an object to change zones “until” a specified event occurs. A second one-shot effect is created immediately after the specified event. This second one-shot effect returns the object to its previous zone. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [610.3].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[610.3]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W20. Rule 612.1 anchor - Some continuous effects change an object’s text This

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 612.1. Apply this rule text to the dispute: "Some continuous effects change an object’s text. This can apply to any words or symbols printed on that object, but generally affects only that object’s rules text (which appears in its text box) and/or the text that appears in its type line. Such an effect is a text-changing effect." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [612.1]: Some continuous effects change an object’s text. This can apply to any words or symbols printed on that object, but generally affects only that object’s rules text (which appears in its text box) and/or the text that appears in its type line. Such an effect is a text-changing effect. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [612.1].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[612.1]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W21. Rule 613.1 anchor - The values of an object’s characteristics are determined

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 613.1. Apply this rule text to the dispute: "The values of an object’s characteristics are determined by starting with the actual object. For a card, that means the values of the characteristics printed on that card. For a token or a copy of a spell or card, that means the values of the characteristics defined by the effect that created it. Then all applicable continuous effects are applied in a series of layers in the following order:" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [613.1]: The values of an object’s characteristics are determined by starting with the actual object. For a card, that means the values of the characteristics printed on that card. For a token or a copy of a spell or card, that means the values of the characteristics defined by the effect that created it. Then all applicable continuous effects are applied in a series of layers in the following order: The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [613.1].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[613.1]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W22. Rule 613.2 anchor - Within layer 1 apply effects in a series

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 613.2. Apply this rule text to the dispute: "Within layer 1, apply effects in a series of sublayers in the order described below. Within each sublayer, apply effects in timestamp order (see rule 613.7). Note that dependency may alter the order in which effects are applied within a sublayer. (See rule 613.8.)" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [613.2]: Within layer 1, apply effects in a series of sublayers in the order described below. Within each sublayer, apply effects in timestamp order (see rule 613.7). Note that dependency may alter the order in which effects are applied within a sublayer. (See rule 613.8.) The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [613.2].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[613.2]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W23. Rule 613.3 anchor - Within layers 2–6 apply effects from characteristic-defining abilities

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 613.3. Apply this rule text to the dispute: "Within layers 2–6, apply effects from characteristic-defining abilities first (see rule 604.3), then all other effects in timestamp order (see rule 613.7). Note that dependency may alter the order in which effects are applied within a layer. (See rule 613.8.)" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [613.3]: Within layers 2–6, apply effects from characteristic-defining abilities first (see rule 604.3), then all other effects in timestamp order (see rule 613.7). Note that dependency may alter the order in which effects are applied within a layer. (See rule 613.8.) The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [613.3].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[613.3]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W24. Rule 613.4 anchor - Within layer 7 apply effects in a series

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 613.4. Apply this rule text to the dispute: "Within layer 7, apply effects in a series of sublayers in the order described below. Within each sublayer, apply effects in timestamp order. (See rule 613.7.) Note that dependency may alter the order in which effects are applied within a sublayer. (See rule 613.8.)" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [613.4]: Within layer 7, apply effects in a series of sublayers in the order described below. Within each sublayer, apply effects in timestamp order. (See rule 613.7.) Note that dependency may alter the order in which effects are applied within a sublayer. (See rule 613.8.) The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [613.4].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[613.4]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W25. Rule 613.7 anchor - Within a layer or sublayer determining which order

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 613.7. Apply this rule text to the dispute: "Within a layer or sublayer, determining which order effects are applied in is usually done using a timestamp system. An effect with an earlier timestamp is applied before an effect with a later timestamp." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [613.7]: Within a layer or sublayer, determining which order effects are applied in is usually done using a timestamp system. An effect with an earlier timestamp is applied before an effect with a later timestamp. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [613.7].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[613.7]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W26. Rule 613.8 anchor - Within a layer or sublayer determining which order

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 613.8. Apply this rule text to the dispute: "Within a layer or sublayer, determining which order effects are applied in is sometimes done using a dependency system. If a dependency exists, it will override the timestamp system." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [613.8]: Within a layer or sublayer, determining which order effects are applied in is sometimes done using a dependency system. If a dependency exists, it will override the timestamp system. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [613.8].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[613.8]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W27. Rule 613.11 anchor - Some continuous effects affect game rules rather than

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 613.11. Apply this rule text to the dispute: "Some continuous effects affect game rules rather than objects. For example, effects may modify a player’s maximum hand size, or say that a creature must attack this turn if able. These effects are applied after all other continuous effects have been applied. Continuous effects that affect the costs of spells or abilities are applied according to the order specified in rule 601.2f. All other such effects are applied in timestamp order. See also the rules for timestamp order and dependency (rules 613.7 and 613.8)." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [613.11]: Some continuous effects affect game rules rather than objects. For example, effects may modify a player’s maximum hand size, or say that a creature must attack this turn if able. These effects are applied after all other continuous effects have been applied. Continuous effects that affect the costs of spells or abilities are applied according to the order specified in rule 601.2f. All other such effects are applied in timestamp order. See also the rules for timestamp order and dependency (rules 613.7 and 613.8). The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [613.11].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[613.11]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W28. Rule 614.3 anchor - There are no special restrictions on casting a

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 614.3. Apply this rule text to the dispute: "There are no special restrictions on casting a spell or activating an ability that generates a replacement effect. Such effects last until they’re used up or their duration has expired." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [614.3]: There are no special restrictions on casting a spell or activating an ability that generates a replacement effect. Such effects last until they’re used up or their duration has expired. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [614.3].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[614.3]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W29. Rule 614.4 anchor - Replacement effects must exist before the appropriate event

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 614.4. Apply this rule text to the dispute: "Replacement effects must exist before the appropriate event occurs—they can’t “go back in time” and change something that’s already happened. Spells or abilities that generate these effects are often cast or activated in response to whatever would produce the event and thus resolve before that event would occur." Example to consider: A player can activate an ability to regenerate a creature in response to a spell that would destroy it. Once the spell resolves, though, it’s too late to regenerate the creature. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [614.4]: Replacement effects must exist before the appropriate event occurs—they can’t “go back in time” and change something that’s already happened. Spells or abilities that generate these effects are often cast or activated in response to whatever would produce the event and thus resolve before that event would occur. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [614.4].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[614.4]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W30. Rule 614.7 anchor - If a replacement effect would replace an event

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 614.7. Apply this rule text to the dispute: "If a replacement effect would replace an event, but that event never happens, the replacement effect simply doesn’t do anything." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [614.7]: If a replacement effect would replace an event, but that event never happens, the replacement effect simply doesn’t do anything. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [614.7].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[614.7]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W31. Rule 614.15 anchor - Some replacement effects are not continuous effects Rather

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 614.15. Apply this rule text to the dispute: "Some replacement effects are not continuous effects. Rather, they are an effect of a resolving spell or ability that replace part or all of that spell or ability’s own effect(s). Such effects are called self-replacement effects. The text creating a self-replacement effect is usually part of the ability whose effect is being replaced, but the text can be a separate ability, particularly when preceded by an ability word. When applying replacement effects to an event, self-replacement effects are applied before oth..." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [614.15]: Some replacement effects are not continuous effects. Rather, they are an effect of a resolving spell or ability that replace part or all of that spell or ability’s own effect(s). Such effects are called self-replacement effects. The text creating a self-replacement effect is usually part of the ability whose effect is being replaced, but the text can be a separate ability, particularly when preceded by an ability word. When applying replacement effects to an event, self-replacement effects are applied before other replacement effects. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [614.15].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[614.15]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W32. Rule 615.4 anchor - Prevention effects must exist before the appropriate damage

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 615.4. Apply this rule text to the dispute: "Prevention effects must exist before the appropriate damage event occurs—they can’t “go back in time” and change something that’s already happened. Spells or abilities that generate these effects are often cast or activated in response to whatever would produce the event and thus resolve before that event would occur." Example to consider: A player can activate an ability that prevents damage in response to a spell that would deal damage. Once the spell resolves, though, it’s too late to prevent the damage. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [615.4]: Prevention effects must exist before the appropriate damage event occurs—they can’t “go back in time” and change something that’s already happened. Spells or abilities that generate these effects are often cast or activated in response to whatever would produce the event and thus resolve before that event would occur. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [615.4].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[615.4]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W33. Rule 615.7 anchor - Some prevention effects generated by the resolution of

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 615.7. Apply this rule text to the dispute: "Some prevention effects generated by the resolution of a spell or ability refer to a specific amount of damage—for example, “Prevent the next 3 damage that would be dealt to any target this turn.” These work like shields. Each 1 damage that would be dealt to the “shielded” permanent or player is prevented. Preventing 1 damage reduces the remaining shield by 1. If damage would be dealt to the shielded permanent or player by two or more applicable sources at the same time, the player or the controller of the perma..." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [615.7]: Some prevention effects generated by the resolution of a spell or ability refer to a specific amount of damage—for example, “Prevent the next 3 damage that would be dealt to any target this turn.” These work like shields. Each 1 damage that would be dealt to the “shielded” permanent or player is prevented. Preventing 1 damage reduces the remaining shield by 1. If damage would be dealt to the shielded permanent or player by two or more applicable sources at the same time, the player or the controller of the permanent chooses which damage the shield prevents. Once the shield has been reduced to 0, any remaining damage is dealt normally. Such effects count only the amount of damage; the numb... The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [615.7].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[615.7]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W34. Rule 604.7 anchor - Unlike spells and other kinds of abilities static

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 604.7. Apply this rule text to the dispute: "Unlike spells and other kinds of abilities, static abilities can’t use an object’s last known information for purposes of determining how their effects are applied." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [604.7]: Unlike spells and other kinds of abilities, static abilities can’t use an object’s last known information for purposes of determining how their effects are applied. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [604.7].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[604.7]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W35. Rule 616.1f anchor - Once the chosen effect has been applied this

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 616.1f. Apply this rule text to the dispute: "Once the chosen effect has been applied, this process is repeated (taking into account only replacement or prevention effects that would now be applicable) until there are no more left to apply." Example to consider: Two permanents are on the battlefield. One is an enchantment that reads “If a card would be put into a graveyard from anywhere, instead exile it,” and the other is a creature that reads “If this creature would die, instead shuffle it into its owner’s library.” If the creature is destroyed, its controller decides which replacement to apply first; the other... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [616.1f]: Once the chosen effect has been applied, this process is repeated (taking into account only replacement or prevention effects that would now be applicable) until there are no more left to apply. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [616.1f].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[616.1f]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W36. Rule 616.1g anchor - While following the steps in 6161a–f one replacement

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 616.1g. Apply this rule text to the dispute: "While following the steps in 616.1a–f, one replacement or prevention effect may apply to an event, and another may apply to an event contained within the first event. In this case, the second effect can’t be chosen until after the first effect has been chosen." Example to consider: A player is instructed to create a token that’s a copy of Voice of All, which has the ability “As this creature enters, choose a color.” Doubling Season has an ability that reads “If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.” Because entering the battlefield is an event contained with... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [616.1g]: While following the steps in 616.1a–f, one replacement or prevention effect may apply to an event, and another may apply to an event contained within the first event. In this case, the second effect can’t be chosen until after the first effect has been chosen. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [616.1g].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[616.1g]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W37. Rule 614.13c anchor - While applying a replacement effect that modifies how

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 614.13c. Apply this rule text to the dispute: "While applying a replacement effect that modifies how a permanent enters the battlefield, another replacement effect may cause a player to mill cards or exile cards from the top of a library. In that case, any card that is entering the battlefield from that library won’t be included in that effect, even though those cards are in the library as the effect is applied." Example to consider: Ashiok, Wicked Manipulator has an ability that reads “If you would pay life while your library has at least that many cards in it, exile that many cards from the top of your library instead.” Breeding Pool is a land that reads, in part, “As this land enters, you may pay 2 life.” If an effect allows a player to play Breeding Pool from the top of their libr... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [614.13c]: While applying a replacement effect that modifies how a permanent enters the battlefield, another replacement effect may cause a player to mill cards or exile cards from the top of a library. In that case, any card that is entering the battlefield from that library won’t be included in that effect, even though those cards are in the library as the effect is applied. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [614.13c].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[614.13c]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W38. Rule 611.2c anchor - If a continuous effect generated by the resolution

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 611.2c. Apply this rule text to the dispute: "If a continuous effect generated by the resolution of a spell or ability modifies the characteristics or changes the controller of any objects, the set of objects it affects is determined when that continuous effect begins. After that point, the set won’t change. (Note that this works differently than a continuous effect from a static ability.) A continuous effect generated by the resolution of a spell or ability that doesn’t modify the characteristics or change the controller of any objects modifies the rules o..." Example to consider: An effect that reads “All white creatures get +1/+1 until end of turn” gives the bonus to all permanents that are white creatures when the spell or ability resolves—even if they change color later—and doesn’t affect those that enter the battlefield or turn white afterward. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [611.2c]: If a continuous effect generated by the resolution of a spell or ability modifies the characteristics or changes the controller of any objects, the set of objects it affects is determined when that continuous effect begins. After that point, the set won’t change. (Note that this works differently than a continuous effect from a static ability.) A continuous effect generated by the resolution of a spell or ability that doesn’t modify the characteristics or change the controller of any objects modifies the rules of the game, so it can affect objects that weren’t affected when that continuous effect began. If a single continuous effect has parts that modify the characteristics or changes the... The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [611.2c].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[611.2c]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W39. Rule 609.7a anchor - If an effect requires a player to choose

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 609.7a. Apply this rule text to the dispute: "If an effect requires a player to choose a source of damage, they may choose a permanent; a spell on the stack (including a permanent spell); any object referred to by an object on the stack, by a replacement or prevention effect that’s waiting to apply, or by a delayed triggered ability that’s waiting to trigger (even if that object is no longer in the zone it used to be in); or a face-up object in the command zone. A source doesn’t need to be capable of dealing damage to be a legal choice. The source is chosen..." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [609.7a]: If an effect requires a player to choose a source of damage, they may choose a permanent; a spell on the stack (including a permanent spell); any object referred to by an object on the stack, by a replacement or prevention effect that’s waiting to apply, or by a delayed triggered ability that’s waiting to trigger (even if that object is no longer in the zone it used to be in); or a face-up object in the command zone. A source doesn’t need to be capable of dealing damage to be a legal choice. The source is chosen when the effect is created. If the player chooses a permanent, the effect will apply to the next damage dealt by that permanent, regardless of whether it’s combat damage or damage... The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [609.7a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[609.7a]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W40. Rule 614.13a anchor - While applying an effect that modifies how a

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 614.13a. Apply this rule text to the dispute: "While applying an effect that modifies how a permanent enters the battlefield, you may have to choose a number of objects that will also change zones. You can’t choose the object that will become that permanent or any other object entering the battlefield at the same time as that object." Example to consider: Sutured Ghoul says, in part, “As this creature enters, exile any number of creature cards from your graveyard.” If Sutured Ghoul and Runeclaw Bear enter the battlefield from your graveyard at the same time, you can’t choose to exile either of them when applying Sutured Ghoul’s replacement effect. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [614.13a]: While applying an effect that modifies how a permanent enters the battlefield, you may have to choose a number of objects that will also change zones. You can’t choose the object that will become that permanent or any other object entering the battlefield at the same time as that object. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [614.13a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[614.13a]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W41. Rule 611.3c anchor - Continuous effects that modify characteristics of permanents do

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 611.3c. Apply this rule text to the dispute: "Continuous effects that modify characteristics of permanents do so simultaneously with the permanent entering the battlefield. They don’t wait until the permanent is on the battlefield and then change it. Because such effects apply as the permanent enters the battlefield, they are applied before determining whether the permanent will cause an ability to trigger when it enters the battlefield." Example to consider: A permanent with the static ability “All white creatures get +1/+1” is on the battlefield. A creature spell that would normally create a 1/1 white creature instead creates a 2/2 white creature. The creature doesn’t enter the battlefield as 1/1 and then change to 2/2. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [611.3c]: Continuous effects that modify characteristics of permanents do so simultaneously with the permanent entering the battlefield. They don’t wait until the permanent is on the battlefield and then change it. Because such effects apply as the permanent enters the battlefield, they are applied before determining whether the permanent will cause an ability to trigger when it enters the battlefield. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [611.3c].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[611.3c]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W42. Rule 611.2e anchor - If a resolving spell or ability both puts

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 611.2e. Apply this rule text to the dispute: "If a resolving spell or ability both puts a nontoken permanent onto the battlefield and creates a continuous effect stating that the permanent “is [characteristic],” that it “has [characteristic],” or that it doesn’t have a particular characteristic, that continuous effect applies simultaneously with the permanent entering the battlefield. This characteristic is usually a color or a creature type. If the continuous effect says the permanent “becomes [characteristic]” or “gains [an ability],” that effect applies..." Example to consider: Arbiter of the Ideal puts an artifact, creature, or land card onto the battlefield and says, in part, “That permanent is an enchantment in addition to its other types.” An ability that triggers whenever an enchantment enters the battlefield would trigger. The permanent doesn’t enter the battlefield and then become an enchantment. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [611.2e]: If a resolving spell or ability both puts a nontoken permanent onto the battlefield and creates a continuous effect stating that the permanent “is [characteristic],” that it “has [characteristic],” or that it doesn’t have a particular characteristic, that continuous effect applies simultaneously with the permanent entering the battlefield. This characteristic is usually a color or a creature type. If the continuous effect says the permanent “becomes [characteristic]” or “gains [an ability],” that effect applies after the permanent is on the battlefield. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [611.2e].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[611.2e]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W43. Rule 614.12 anchor - Some replacement effects modify how a permanent enters

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 614.12. Apply this rule text to the dispute: "Some replacement effects modify how a permanent enters the battlefield. (See rules 614.1c–d.) Such effects may come from the permanent itself if they affect only that permanent (as opposed to a general subset of permanents that includes it). They may also come from other sources. To determine which replacement effects apply and how they apply, check the characteristics of the permanent as it would exist on the battlefield, taking into account replacement effects that have already modified how it enters the battl..." Example to consider: Voice of All says “As this creature enters, choose a color” and “This creature has protection from the chosen color.” An effect creates a token that’s a copy of Voice of All. As that token is created, the token’s controller chooses a color for it. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [614.12]: Some replacement effects modify how a permanent enters the battlefield. (See rules 614.1c–d.) Such effects may come from the permanent itself if they affect only that permanent (as opposed to a general subset of permanents that includes it). They may also come from other sources. To determine which replacement effects apply and how they apply, check the characteristics of the permanent as it would exist on the battlefield, taking into account replacement effects that have already modified how it enters the battlefield (see rule 616.1), continuous effects from the permanent’s own static abilities that would apply to it once it’s on the battlefield, and continuous effects that already exist... The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [614.12].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[614.12]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W44. Rule 614.13b anchor - The same object can’t be chosen to change

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 614.13b. Apply this rule text to the dispute: "The same object can’t be chosen to change zones more than once when applying replacement effects that modify how one or more permanents enter the battlefield." Example to consider: Jund (a plane card) says, “Whenever a player casts a black, red, or green creature spell, it gains devour 5.” A player controls Runeclaw Bear and casts Thunder-Thrash Elder, a red creature spell with devour 3. As Thunder-Thrash Elder enters the battlefield, its controller can choose to sacrifice Runeclaw Bear when applying the devour 3 effect or when appl... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [614.13b]: The same object can’t be chosen to change zones more than once when applying replacement effects that modify how one or more permanents enter the battlefield. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [614.13b].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[614.13b]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W45. Rule 609.4a anchor - If two effects state that a player may

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 609.4a. Apply this rule text to the dispute: "If two effects state that a player may (or a creature can) do the same thing “as though” different conditions were true, both conditions could apply. If one “as though” effect satisfies the requirements for another “as though” effect, then both effects will apply." Example to consider: A player controls Vedalken Orrery, an artifact that says “You may cast spells as though they had flash.” That player casts Shaman’s Trance, an instant that says, in part, “You may play lands and cast spells from other players’ graveyards this turn as though those cards were in your graveyard.” The player may cast a sorcery with flashback from another play... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [609.4a]: If two effects state that a player may (or a creature can) do the same thing “as though” different conditions were true, both conditions could apply. If one “as though” effect satisfies the requirements for another “as though” effect, then both effects will apply. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [609.4a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[609.4a]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W46. Rule 611.2b anchor - Some continuous effects generated by the resolution of

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 611.2b. Apply this rule text to the dispute: "Some continuous effects generated by the resolution of a spell or ability have durations worded “for as long as . . . .” If the “for as long as” duration never starts, the effect does nothing. Similarly, if that duration ends before the moment the effect would first be applied and doesn’t begin again during that spell or ability’s resolution, the effect does nothing. It doesn’t start and immediately stop again, and it doesn’t last forever." Example to consider: Master Thief has the ability “When this creature enters, gain control of target artifact for as long as you control this creature.” If you lose control of Master Thief before the ability resolves, it does nothing, because its duration—as long as you control Master Thief—was over before the effect began. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [611.2b]: Some continuous effects generated by the resolution of a spell or ability have durations worded “for as long as . . . .” If the “for as long as” duration never starts, the effect does nothing. Similarly, if that duration ends before the moment the effect would first be applied and doesn’t begin again during that spell or ability’s resolution, the effect does nothing. It doesn’t start and immediately stop again, and it doesn’t last forever. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [611.2b].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[611.2b]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W47. Rule 613.4d anchor - Layer 7d Effects that switch a creature’s power

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 613.4d. Apply this rule text to the dispute: "Layer 7d: Effects that switch a creature’s power and toughness are applied. Such effects take the value of power and apply it to the creature’s toughness, and take the value of toughness and apply it to the creature’s power." Example to consider: A 1/3 creature is given +0/+1 by an effect. Then another effect switches the creature’s power and toughness. Its new power and toughness is 4/1. A new effect gives the creature +5/+0. Its “unswitched” power and toughness would be 6/4, so its actual power and toughness is 4/6. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [613.4d]: Layer 7d: Effects that switch a creature’s power and toughness are applied. Such effects take the value of power and apply it to the creature’s toughness, and take the value of toughness and apply it to the creature’s power. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [613.4d].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[613.4d]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W48. Rule 613.7a anchor - A continuous effect generated by a static ability

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 613.7a. Apply this rule text to the dispute: "A continuous effect generated by a static ability has the same timestamp as the object the static ability is on, or the timestamp of the effect that created the ability, whichever is later. If the effect that created the ability has the later timestamp and the object the ability is on receives a new timestamp, each continuous effect generated by static abilities of that object receives a new timestamp as well, but the relative order of those timestamps remains the same." Example to consider: Rune of Flight is an Aura that grants enchanted Equipment “Equipped creature has flying.” A player attaches Rune of Flight to Colossus Hammer, an Equipment with “Equipped creature gets +10/+10 and loses flying.” The ability granted by Rune of Flight shares Rune of Flight’s timestamp because it is later than Colossus Hammer’s timestamp. If Colossus Hammer... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [613.7a]: A continuous effect generated by a static ability has the same timestamp as the object the static ability is on, or the timestamp of the effect that created the ability, whichever is later. If the effect that created the ability has the later timestamp and the object the ability is on receives a new timestamp, each continuous effect generated by static abilities of that object receives a new timestamp as well, but the relative order of those timestamps remains the same. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [613.7a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[613.7a]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W49. Rule 616.2 anchor - A replacement or prevention effect can become applicable

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 616.2. Apply this rule text to the dispute: "A replacement or prevention effect can become applicable to an event as the result of another replacement or prevention effect that modifies the event." Example to consider: One effect reads “If you would gain life, draw that many cards instead,” and another reads “If you would draw a card, return a card from your graveyard to your hand instead.” Both effects combine (regardless of the order they came into existence): Instead of gaining 1 life, the player puts a card from their graveyard into their hand. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [616.2]: A replacement or prevention effect can become applicable to an event as the result of another replacement or prevention effect that modifies the event. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [616.2].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[616.2]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W50. Rule 614.12b anchor - If multiple replacement effects that require choices from

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 614.12b. Apply this rule text to the dispute: "If multiple replacement effects that require choices from a player would modify how multiple permanents enter the battlefield simultaneously, that player may not make choices for those effects that would cause the combined costs of those effects to not be payable." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [614.12b]: If multiple replacement effects that require choices from a player would modify how multiple permanents enter the battlefield simultaneously, that player may not make choices for those effects that would cause the combined costs of those effects to not be payable. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [614.12b].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[614.12b]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W51. Rule 614.17d anchor - Some “can’t” effects modify how a permanent enters

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 614.17d. Apply this rule text to the dispute: "Some “can’t” effects modify how a permanent enters the battlefield or whether it can enter the battlefield. Such effects may come from the permanent itself if they affect only that permanent (as opposed to a general subset of permanents that includes it). They may also come from other sources. To determine which “can’t” effects apply, check the characteristics of the permanent as it would exist on the battlefield, taking into account replacement effects that have already modified how it enters the battlefield (s..." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [614.17d]: Some “can’t” effects modify how a permanent enters the battlefield or whether it can enter the battlefield. Such effects may come from the permanent itself if they affect only that permanent (as opposed to a general subset of permanents that includes it). They may also come from other sources. To determine which “can’t” effects apply, check the characteristics of the permanent as it would exist on the battlefield, taking into account replacement effects that have already modified how it enters the battlefield (see rule 616.1), continuous effects from the permanent’s own static abilities that would apply to it once it’s on the battlefield, and continuous effects that already exist and woul... The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [614.17d].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[614.17d]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W52. Rule 604.3a anchor - A static ability is a characteristic-defining ability if

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 604.3a. Apply this rule text to the dispute: "A static ability is a characteristic-defining ability if it meets the following criteria: (1) It defines an object’s colors, subtypes, power, or toughness; (2) it is printed on the card it affects, it was granted to the token it affects by the effect that created the token, or it was acquired by the object it affects as the result of a copy effect or text-changing effect; (3) it does not directly affect the characteristics of any other objects; (4) it is not an ability that an object grants to itself; and (5) it..." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [604.3a]: A static ability is a characteristic-defining ability if it meets the following criteria: (1) It defines an object’s colors, subtypes, power, or toughness; (2) it is printed on the card it affects, it was granted to the token it affects by the effect that created the token, or it was acquired by the object it affects as the result of a copy effect or text-changing effect; (3) it does not directly affect the characteristics of any other objects; (4) it is not an ability that an object grants to itself; and (5) it does not set the values of such characteristics only if certain conditions are met. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [604.3a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[604.3a]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

## W53. Rule 613.9 anchor - One continuous effect can override another Sometimes the

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a events, effects, replacement, prevention, layers dispute governed by rule 613.9. Apply this rule text to the dispute: "One continuous effect can override another. Sometimes the results of one effect determine whether another effect applies or what another effect does." Example to consider: Two effects are affecting the same creature: one from an Aura that says “Enchanted creature has flying” and one from an Aura that says “Enchanted creature loses flying.” Neither of these depends on the other, since nothing changes what they affect or what they’re doing to it. Applying them in timestamp order means the one that was generated last “wins.” T... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [613.9]: One continuous effect can override another. Sometimes the results of one effect determine whether another effect applies or what another effect does. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [613.9].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[613.9]`.

**Why this test matters:** Broad coverage anchor for Events, Effects, Replacement, Prevention, Layers. Source docs: L03_Event_609to610_v/t.md, L03_Event_614to616_v/t.md, L08_ContinuousEffects_604_v/t.md, L08_ContinuousEffects_611to613_v/t.md.

---

# CATEGORY X - Object Model, Zones, Copies, Linked Abilities, Merged Permanents

**Connected docs:**
- `L07_ObjectModel_200to213_v/t.md`
- `L07_ObjectModel_300to315_v/t.md`
- `L07_ObjectModel_400to408_v/t.md`
- `L07_ObjectModel_607_v/t.md`
- `L07_ObjectModel_707to729_v/t.md`

## X1. Rule 707.2 anchor - When copying an object the copy acquires the

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 707.2. Apply this rule text to the dispute: "When copying an object, the copy acquires the copiable values of the original object’s characteristics and, for an object on the stack, choices made when casting or activating it (mode, targets, the value of X, whether it was kicked, how it will affect multiple targets, and so on). The copiable values are the values derived from the text printed on the object (that text being name, mana cost, color indicator, card type, subtype, supertype, rules text, power, toughness, and/or loyalty), as modified by other copy..." Example to consider: Chimeric Staff is an artifact that reads, “{X}: This artifact becomes an X/X Construct artifact creature until end of turn.” Clone is a creature that reads, “You may have this creature enter as a copy of any creature on the battlefield.” After a Staff has become a 5/5 Construct artifact creature, a Clone enters the battlefield as a copy of it. The Clone i... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [707.2]: When copying an object, the copy acquires the copiable values of the original object’s characteristics and, for an object on the stack, choices made when casting or activating it (mode, targets, the value of X, whether it was kicked, how it will affect multiple targets, and so on). The copiable values are the values derived from the text printed on the object (that text being name, mana cost, color indicator, card type, subtype, supertype, rules text, power, toughness, and/or loyalty), as modified by other copy effects, by its face-down status, and by “as . . . enters” and “as . . . is turned face up” abilities that set power and toughness (and may also set additional characteristics). Ot... The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [707.2].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[707.2]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X2. Rule 707.6 anchor - When copying a permanent any choices that have

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 707.6. Apply this rule text to the dispute: "When copying a permanent, any choices that have been made for that permanent aren’t copied. Instead, if an object enters the battlefield as a copy of another permanent, the object’s controller will get to make any “as [this] enters the battlefield” choices for it." Example to consider: A Clone enters the battlefield as a copy of Adaptive Automaton. Adaptive Automaton reads, in part, “As this creature enters, choose a creature type.” The Clone won’t copy the creature type choice of the Automaton; rather, the controller of the Clone will get to make a new choice. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [707.6]: When copying a permanent, any choices that have been made for that permanent aren’t copied. Instead, if an object enters the battlefield as a copy of another permanent, the object’s controller will get to make any “as [this] enters the battlefield” choices for it. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [707.6].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[707.6]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X3. Rule 707.10 anchor - To copy a spell activated ability or triggered

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 707.10. Apply this rule text to the dispute: "To copy a spell, activated ability, or triggered ability means to put a copy of it onto the stack; a copy of a spell isn’t cast and a copy of an activated ability isn’t activated. A copy of a spell or ability copies both the characteristics of the spell or ability and all decisions made for it, including modes, targets, the value of X, and additional or alternative costs. (See rule 601, “Casting Spells.”) Choices that are normally made on resolution are not copied. If an effect of the copy refers to objects used..." Example to consider: A player casts Fork, targeting an Emerald Charm. Fork reads, “Copy target instant or sorcery spell, except that the copy is red. You may choose new targets for the copy.” Emerald Charm is a modal green instant. When the Fork resolves, it puts a copy of the Emerald Charm on the stack except the copy is red, not green. The copy has the same mode that was ch... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [707.10]: To copy a spell, activated ability, or triggered ability means to put a copy of it onto the stack; a copy of a spell isn’t cast and a copy of an activated ability isn’t activated. A copy of a spell or ability copies both the characteristics of the spell or ability and all decisions made for it, including modes, targets, the value of X, and additional or alternative costs. (See rule 601, “Casting Spells.”) Choices that are normally made on resolution are not copied. If an effect of the copy refers to objects used to pay its costs, it uses the objects used to pay the costs of the original spell or ability. A copy of a spell is owned by the player under whose control it was put on the stack.... The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [707.10].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[707.10]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X4. Rule 710.2 anchor - In every zone other than the battlefield and

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 710.2. Apply this rule text to the dispute: "In every zone other than the battlefield, and also on the battlefield before the permanent flips, a flip card has only the normal characteristics of the card. Once a permanent is flipped, its normal name, text box, type line, power, and toughness don’t apply and the alternative versions of those characteristics apply instead." Example to consider: Akki Lavarunner is a nonlegendary creature that flips into a legendary creature named Tok-Tok, Volcano Born. An effect that says “Search your library for a legendary card” can’t find this flip card. An effect that says “Legendary creatures get +2/+2” doesn’t affect Akki Lavarunner, but it does affect Tok-Tok. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [710.2]: In every zone other than the battlefield, and also on the battlefield before the permanent flips, a flip card has only the normal characteristics of the card. Once a permanent is flipped, its normal name, text box, type line, power, and toughness don’t apply and the alternative versions of those characteristics apply instead. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [710.2].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[710.2]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X5. Rule 202.3 anchor - The mana value of an object is a

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 202.3. Apply this rule text to the dispute: "The mana value of an object is a number equal to the total amount of mana in its mana cost, regardless of color." Example to consider: A mana cost of {3}{U}{U} translates to a mana value of 5. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [202.3]: The mana value of an object is a number equal to the total amount of mana in its mana cost, regardless of color. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [202.3].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[202.3]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X6. Rule 206.2 anchor - The color of the expansion symbol indicates the

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 206.2. Apply this rule text to the dispute: "The color of the expansion symbol indicates the rarity of the card within its set. A red-orange symbol indicates the card is mythic rare. A gold symbol indicates the card is rare. A silver symbol indicates the card is uncommon. A black or white symbol indicates the card is common or is a basic land. A purple symbol signifies a special rarity; to date, only the Time Spiral™ “timeshifted” cards, which were rarer than that set’s rare cards, have had purple expansion symbols. (Prior to the Exodus™ set, all expansion..." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [206.2]: The color of the expansion symbol indicates the rarity of the card within its set. A red-orange symbol indicates the card is mythic rare. A gold symbol indicates the card is rare. A silver symbol indicates the card is uncommon. A black or white symbol indicates the card is common or is a basic land. A purple symbol signifies a special rarity; to date, only the Time Spiral™ “timeshifted” cards, which were rarer than that set’s rare cards, have had purple expansion symbols. (Prior to the Exodus™ set, all expansion symbols were black, regardless of rarity. Also, prior to the Sixth Edition core set, with the exception of the Simplified Chinese Fifth Edition core set, Magic core sets didn’t ha... The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [206.2].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[206.2]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X7. Rule 302.6 anchor - A creature’s activated ability with the tap symbol

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 302.6. Apply this rule text to the dispute: "A creature’s activated ability with the tap symbol or the untap symbol in its activation cost can’t be activated unless the creature has been under its controller’s control continuously since their most recent turn began. A creature can’t attack unless it has been under its controller’s control continuously since their most recent turn began. This rule is informally called the “summoning sickness” rule." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [302.6]: A creature’s activated ability with the tap symbol or the untap symbol in its activation cost can’t be activated unless the creature has been under its controller’s control continuously since their most recent turn began. A creature can’t attack unless it has been under its controller’s control continuously since their most recent turn began. This rule is informally called the “summoning sickness” rule. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [302.6].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[302.6]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X8. Rule 304.4 anchor - Instants can’t enter the battlefield If an instant

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 304.4. Apply this rule text to the dispute: "Instants can’t enter the battlefield. If an instant would enter the battlefield, it remains in its previous zone instead." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [304.4]: Instants can’t enter the battlefield. If an instant would enter the battlefield, it remains in its previous zone instead. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [304.4].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[304.4]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X9. Rule 304.5 anchor - If text states that a player may do

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 304.5. Apply this rule text to the dispute: "If text states that a player may do something “any time they could cast an instant” or “only as an instant,” it means only that the player must have priority. The player doesn’t need to have an instant card they could cast. Effects that would preclude that player from casting an instant spell don’t affect the player’s capability to perform that action (unless the action is actually casting an instant spell)." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [304.5]: If text states that a player may do something “any time they could cast an instant” or “only as an instant,” it means only that the player must have priority. The player doesn’t need to have an instant card they could cast. Effects that would preclude that player from casting an instant spell don’t affect the player’s capability to perform that action (unless the action is actually casting an instant spell). The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [304.5].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[304.5]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X10. Rule 305.1 anchor - A player who has priority may play a

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 305.1. Apply this rule text to the dispute: "A player who has priority may play a land card from their hand during a main phase of their turn when the stack is empty. Playing a land is a special action; it doesn’t use the stack (see rule 116). Rather, the player simply puts the land onto the battlefield. Since the land doesn’t go on the stack, it is never a spell, and players can’t respond to it with instants or activated abilities." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [305.1]: A player who has priority may play a land card from their hand during a main phase of their turn when the stack is empty. Playing a land is a special action; it doesn’t use the stack (see rule 116). Rather, the player simply puts the land onto the battlefield. Since the land doesn’t go on the stack, it is never a spell, and players can’t respond to it with instants or activated abilities. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [305.1].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[305.1]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X11. Rule 305.3 anchor - A player can’t play a land for any

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 305.3. Apply this rule text to the dispute: "A player can’t play a land, for any reason, if it isn’t their turn. Ignore any part of an effect that instructs a player to do so." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [305.3]: A player can’t play a land, for any reason, if it isn’t their turn. Ignore any part of an effect that instructs a player to do so. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [305.3].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[305.3]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X12. Rule 307.4 anchor - Sorceries can’t enter the battlefield If a sorcery

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 307.4. Apply this rule text to the dispute: "Sorceries can’t enter the battlefield. If a sorcery would enter the battlefield, it remains in its previous zone instead." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [307.4]: Sorceries can’t enter the battlefield. If a sorcery would enter the battlefield, it remains in its previous zone instead. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [307.4].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[307.4]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X13. Rule 307.5 anchor - If a spell ability or effect states that

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 307.5. Apply this rule text to the dispute: "If a spell, ability, or effect states that a player can do something only “any time they could cast a sorcery” or “only as a sorcery,” it means only that the player must have priority, it must be during the main phase of their turn, and the stack must be empty. The player doesn’t need to have a sorcery card they could cast. Effects that would preclude that player from casting a sorcery spell don’t affect the player’s capability to perform that action (unless the action is actually casting a sorcery spell)." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [307.5]: If a spell, ability, or effect states that a player can do something only “any time they could cast a sorcery” or “only as a sorcery,” it means only that the player must have priority, it must be during the main phase of their turn, and the stack must be empty. The player doesn’t need to have a sorcery card they could cast. Effects that would preclude that player from casting a sorcery spell don’t affect the player’s capability to perform that action (unless the action is actually casting a sorcery spell). The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [307.5].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[307.5]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X14. Rule 309.3 anchor - A player can own only one dungeon card

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 309.3. Apply this rule text to the dispute: "A player can own only one dungeon card in the command zone at a time, and they can’t bring a dungeon card into the game if a dungeon card they own is in the command zone." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [309.3]: A player can own only one dungeon card in the command zone at a time, and they can’t bring a dungeon card into the game if a dungeon card they own is in the command zone. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [309.3].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[309.3]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X15. Rule 310.9 anchor - A battle can’t be attached to players or

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 310.9. Apply this rule text to the dispute: "A battle can’t be attached to players or permanents, even if it is also an Aura, Equipment, or Fortification. If a battle is somehow attached to a permanent, it becomes unattached. This is a state-based action (see rule 704)." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [310.9]: A battle can’t be attached to players or permanents, even if it is also an Aura, Equipment, or Fortification. If a battle is somehow attached to a permanent, it becomes unattached. This is a state-based action (see rule 704). The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [310.9].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[310.9]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X16. Rule 310.10 anchor - If a battle that isn’t being attacked has

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 310.10. Apply this rule text to the dispute: "If a battle that isn’t being attacked has no player designated as its protector, or its protector is a player who can’t be its protector based on its battle type, its controller chooses an appropriate player to be its protector. If no player can be chosen this way, the battle is put into its owner’s graveyard. This is a state-based action (see rule 704)." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [310.10]: If a battle that isn’t being attacked has no player designated as its protector, or its protector is a player who can’t be its protector based on its battle type, its controller chooses an appropriate player to be its protector. If no player can be chosen this way, the battle is put into its owner’s graveyard. This is a state-based action (see rule 704). The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [310.10].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[310.10]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X17. Rule 311.2 anchor - Plane cards remain in the command zone throughout

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 311.2. Apply this rule text to the dispute: "Plane cards remain in the command zone throughout the game, both while they’re part of a planar deck and while they’re face up. They’re not permanents. They can’t be cast. If a plane card would leave the command zone, it remains in the command zone." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [311.2]: Plane cards remain in the command zone throughout the game, both while they’re part of a planar deck and while they’re face up. They’re not permanents. They can’t be cast. If a plane card would leave the command zone, it remains in the command zone. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [311.2].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[311.2]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X18. Rule 311.5 anchor - The controller of a face-up plane card is

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 311.5. Apply this rule text to the dispute: "The controller of a face-up plane card is the player designated as the planar controller. Normally, the planar controller is whoever the active player is. However, if the current planar controller would leave the game, instead the next player in turn order that wouldn’t leave the game becomes the planar controller, then the old planar controller leaves the game. The new planar controller retains that designation until they leave the game or a different player becomes the active player, whichever comes first." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [311.5]: The controller of a face-up plane card is the player designated as the planar controller. Normally, the planar controller is whoever the active player is. However, if the current planar controller would leave the game, instead the next player in turn order that wouldn’t leave the game becomes the planar controller, then the old planar controller leaves the game. The new planar controller retains that designation until they leave the game or a different player becomes the active player, whichever comes first. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [311.5].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[311.5]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X19. Rule 312.2 anchor - Phenomenon cards remain in the command zone throughout

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 312.2. Apply this rule text to the dispute: "Phenomenon cards remain in the command zone throughout the game, both while they’re part of a planar deck and while they’re face up. They’re not permanents. They can’t be cast. If a phenomenon card would leave the command zone, it remains in the command zone." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [312.2]: Phenomenon cards remain in the command zone throughout the game, both while they’re part of a planar deck and while they’re face up. They’re not permanents. They can’t be cast. If a phenomenon card would leave the command zone, it remains in the command zone. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [312.2].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[312.2]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X20. Rule 312.4 anchor - The controller of a face-up phenomenon card is

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 312.4. Apply this rule text to the dispute: "The controller of a face-up phenomenon card is the player designated as the planar controller. Normally, the planar controller is whoever the active player is. However, if the current planar controller would leave the game, instead the next player in turn order that wouldn’t leave the game becomes the planar controller, then the old planar controller leaves the game. The new planar controller retains that designation until they leave the game or a different player becomes the active player, whichever comes first." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [312.4]: The controller of a face-up phenomenon card is the player designated as the planar controller. Normally, the planar controller is whoever the active player is. However, if the current planar controller would leave the game, instead the next player in turn order that wouldn’t leave the game becomes the planar controller, then the old planar controller leaves the game. The new planar controller retains that designation until they leave the game or a different player becomes the active player, whichever comes first. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [312.4].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[312.4]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X21. Rule 313.2 anchor - Vanguard cards remain in the command zone throughout

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 313.2. Apply this rule text to the dispute: "Vanguard cards remain in the command zone throughout the game. They’re not permanents. They can’t be cast. If a vanguard card would leave the command zone, it remains in the command zone." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [313.2]: Vanguard cards remain in the command zone throughout the game. They’re not permanents. They can’t be cast. If a vanguard card would leave the command zone, it remains in the command zone. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [313.2].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[313.2]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X22. Rule 314.2 anchor - Scheme cards remain in the command zone throughout

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 314.2. Apply this rule text to the dispute: "Scheme cards remain in the command zone throughout the game, both while they’re part of a scheme deck and while they’re face up. They’re not permanents. They can’t be cast. If a scheme card would leave the command zone, it remains in the command zone." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [314.2]: Scheme cards remain in the command zone throughout the game, both while they’re part of a scheme deck and while they’re face up. They’re not permanents. They can’t be cast. If a scheme card would leave the command zone, it remains in the command zone. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [314.2].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[314.2]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X23. Rule 314.7 anchor - If an ability of a scheme card includes

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 314.7. Apply this rule text to the dispute: "If an ability of a scheme card includes the text “this scheme,” it means the scheme card in the command zone that’s the source of that ability. This is an exception to rule 109.2." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [314.7]: If an ability of a scheme card includes the text “this scheme,” it means the scheme card in the command zone that’s the source of that ability. This is an exception to rule 109.2. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [314.7].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[314.7]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X24. Rule 315.3 anchor - Conspiracy cards remain in the command zone throughout

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 315.3. Apply this rule text to the dispute: "Conspiracy cards remain in the command zone throughout the game. They’re not permanents. They can’t be cast or included in a deck. If a conspiracy card would leave the command zone, it remains in the command zone. Conspiracy cards that aren’t in the game can’t be brought into the game." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [315.3]: Conspiracy cards remain in the command zone throughout the game. They’re not permanents. They can’t be cast or included in a deck. If a conspiracy card would leave the command zone, it remains in the command zone. Conspiracy cards that aren’t in the game can’t be brought into the game. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [315.3].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[315.3]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X25. Rule 400.6 anchor - If an object would move from one zone

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 400.6. Apply this rule text to the dispute: "If an object would move from one zone to another, determine what event is moving the object. If the object is moving to a public zone and its owner will be able to look at it in that zone, its owner looks at it to see if it has any abilities that would affect the move. If the object is moving to the battlefield, each other player who will be able to look at it in that zone does so. Then any appropriate replacement effects, whether they come from that object or from elsewhere, are applied to that event. If any ef..." Example to consider: Exquisite Archangel has an ability which reads “If you would lose the game, instead exile this creature and your life total becomes equal to your starting life total.” A spell deals 5 damage to a player with 5 life and 5 damage to an Exquisite Archangel under that player’s control. As state-based actions are performed, that player’s life total becomes equ... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [400.6]: If an object would move from one zone to another, determine what event is moving the object. If the object is moving to a public zone and its owner will be able to look at it in that zone, its owner looks at it to see if it has any abilities that would affect the move. If the object is moving to the battlefield, each other player who will be able to look at it in that zone does so. Then any appropriate replacement effects, whether they come from that object or from elsewhere, are applied to that event. If any effects or rules try to do two or more contradictory or mutually exclusive things to a particular object, that object’s controller—or its owner if it has no controller—chooses which... The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [400.6].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[400.6]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X26. Rule 403.2 anchor - A spell or ability affects and checks only

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 403.2. Apply this rule text to the dispute: "A spell or ability affects and checks only the battlefield unless it specifically mentions a player or another zone." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [403.2]: A spell or ability affects and checks only the battlefield unless it specifically mentions a player or another zone. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [403.2].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[403.2]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X27. Rule 405.4 anchor - Each spell has all the characteristics of the

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 405.4. Apply this rule text to the dispute: "Each spell has all the characteristics of the card associated with it. Each activated or triggered ability that’s on the stack has the text of the ability that created it and no other characteristics. The controller of a spell is the player who cast it. The controller of an activated ability is the player who activated it. The controller of a triggered ability is the player who controlled the ability’s source when it triggered, unless it’s a delayed triggered ability. To determine the controller of a delayed tri..." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [405.4]: Each spell has all the characteristics of the card associated with it. Each activated or triggered ability that’s on the stack has the text of the ability that created it and no other characteristics. The controller of a spell is the player who cast it. The controller of an activated ability is the player who activated it. The controller of a triggered ability is the player who controlled the ability’s source when it triggered, unless it’s a delayed triggered ability. To determine the controller of a delayed triggered ability, see rules 603.7d–f. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [405.4].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[405.4]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X28. Rule 406.3 anchor - Exiled cards are by default kept face up

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 406.3. Apply this rule text to the dispute: "Exiled cards are, by default, kept face up and may be examined by any player at any time. Cards “exiled face down” can’t be examined by any player except when instructions allow it. However, if a player is instructed to look at a card and then exile it face down, or once a player is allowed to look at a card exiled face down, that player may continue to look at that card until it leaves the exile zone or is part of a pile of cards that are shuffled, even if the instruction allowing the player to do so no longer..." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [406.3]: Exiled cards are, by default, kept face up and may be examined by any player at any time. Cards “exiled face down” can’t be examined by any player except when instructions allow it. However, if a player is instructed to look at a card and then exile it face down, or once a player is allowed to look at a card exiled face down, that player may continue to look at that card until it leaves the exile zone or is part of a pile of cards that are shuffled, even if the instruction allowing the player to do so no longer applies. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [406.3].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[406.3]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X29. Rule 407.3 anchor - A few cards have the text “Remove this

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 407.3. Apply this rule text to the dispute: "A few cards have the text “Remove this card from your deck before playing if you’re not playing for ante.” These are the only cards that can add or remove cards from the ante zone or change a card’s owner. When not playing for ante, players can’t include these cards in their decks or sideboards, and these cards can’t be brought into the game from outside the game." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [407.3]: A few cards have the text “Remove this card from your deck before playing if you’re not playing for ante.” These are the only cards that can add or remove cards from the ante zone or change a card’s owner. When not playing for ante, players can’t include these cards in their decks or sideboards, and these cards can’t be brought into the game from outside the game. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [407.3].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[407.3]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X30. Rule 707.3 anchor - The copy’s copiable values become the copied information

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 707.3. Apply this rule text to the dispute: "The copy’s copiable values become the copied information, as modified by the copy’s status (see rule 110.5). Objects that copy the object will use the new copiable values." Example to consider: Vesuvan Doppelganger reads, “You may have this creature enter as a copy of any creature on the battlefield, except it doesn’t copy that creature’s color and it has ‘At the beginning of your upkeep, you may have this creature become a copy of target creature, except it doesn’t copy that creature’s color and it has this ability.’” A Vesuvan Doppelganger ent... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [707.3]: The copy’s copiable values become the copied information, as modified by the copy’s status (see rule 110.5). Objects that copy the object will use the new copiable values. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [707.3].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[707.3]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X31. Rule 707.4 anchor - Some effects cause a permanent that’s copying a

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 707.4. Apply this rule text to the dispute: "Some effects cause a permanent that’s copying a permanent to copy a different object while remaining on the battlefield. The change doesn’t cause enters-the-battlefield or leaves-the-battlefield abilities to trigger. This also doesn’t change any noncopy effects presently affecting the permanent." Example to consider: Unstable Shapeshifter reads, “Whenever another creature enters, this creature becomes a copy of that creature, except it has this ability.” It’s affected by Giant Growth, which reads “Target creature gets +3/+3 until end of turn.” If a creature enters the battlefield later this turn, Unstable Shapeshifter will become a copy of that creature, but it will s... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [707.4]: Some effects cause a permanent that’s copying a permanent to copy a different object while remaining on the battlefield. The change doesn’t cause enters-the-battlefield or leaves-the-battlefield abilities to trigger. This also doesn’t change any noncopy effects presently affecting the permanent. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [707.4].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[707.4]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X32. Rule 707.5 anchor - An object that enters the battlefield “as a

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 707.5. Apply this rule text to the dispute: "An object that enters the battlefield “as a copy” or “that’s a copy” of another object becomes a copy as it enters the battlefield. It doesn’t enter the battlefield, and then become a copy of that permanent. If the text that’s being copied includes any abilities that replace the enters-the-battlefield event (such as “enters with” or “as [this] enters” abilities), those abilities will take effect. Also, any enters-the-battlefield triggered abilities of the copy will have a chance to trigger." Example to consider: Skyshroud Behemoth reads, “Fading 2 (This creature enters with two fade counters on it. At the beginning of your upkeep, remove a fade counter from it. If you can’t, sacrifice it.)” and “This creature enters tapped.” A Clone that enters the battlefield as a copy of a Skyshroud Behemoth will also enter the battlefield tapped with two fade counters on it. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [707.5]: An object that enters the battlefield “as a copy” or “that’s a copy” of another object becomes a copy as it enters the battlefield. It doesn’t enter the battlefield, and then become a copy of that permanent. If the text that’s being copied includes any abilities that replace the enters-the-battlefield event (such as “enters with” or “as [this] enters” abilities), those abilities will take effect. Also, any enters-the-battlefield triggered abilities of the copy will have a chance to trigger. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [707.5].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[707.5]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X33. Rule 707.7 anchor - If a pair of linked abilities are copied

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 707.7. Apply this rule text to the dispute: "If a pair of linked abilities are copied, those abilities will be similarly linked to one another on the object that copied them. One ability refers only to actions that were taken or objects that were affected by the other. They can’t be linked to any other ability, regardless of what other abilities the copy may currently have or may have had in the past. See rule 607, “Linked Abilities.”" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [707.7]: If a pair of linked abilities are copied, those abilities will be similarly linked to one another on the object that copied them. One ability refers only to actions that were taken or objects that were affected by the other. They can’t be linked to any other ability, regardless of what other abilities the copy may currently have or may have had in the past. See rule 607, “Linked Abilities.” The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [707.7].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[707.7]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X34. Rule 707.11 anchor - If an effect refers to a permanent by

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 707.11. Apply this rule text to the dispute: "If an effect refers to a permanent by name, the effect still tracks that permanent even if it changes names or becomes a copy of something else." Example to consider: An Unstable Shapeshifter copies an Olivia Voldaren. Olivia Voldaren reads, “{1}{R}: Olivia Voldaren deals 1 damage to another target creature. That creature becomes a Vampire in addition to its other types. Put a +1/+1 counter on Olivia Voldaren.” If this ability of the Shapeshifter is activated, the Shapeshifter will deal 1 damage and you will put a +1/+... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [707.11]: If an effect refers to a permanent by name, the effect still tracks that permanent even if it changes names or becomes a copy of something else. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [707.11].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[707.11]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X35. Rule 712.21d anchor - If multiple replacement effects could be applied to

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 712.21d. Apply this rule text to the dispute: "If multiple replacement effects could be applied to the event of a melded permanent leaving the battlefield or being put into the new zone, applying one of those replacement effects to one of the two cards affects both cards. If the melded permanent is a commander, it may be exempt from this rule; see rules 903.9b–c." Example to consider: Leyline of the Void is an enchantment that reads, in part, “If a card would be put into an opponent’s graveyard from anywhere, exile it instead.” Wheel of Sun and Moon is an Aura with enchant player and the ability “If a card would be put into enchanted player’s graveyard from anywhere, instead that card is revealed and put on the bottom of its owner’s li... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [712.21d]: If multiple replacement effects could be applied to the event of a melded permanent leaving the battlefield or being put into the new zone, applying one of those replacement effects to one of the two cards affects both cards. If the melded permanent is a commander, it may be exempt from this rule; see rules 903.9b–c. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [712.21d].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[712.21d]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X36. Rule 707.10e anchor - Some effects copy a spell or ability and

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 707.10e. Apply this rule text to the dispute: "Some effects copy a spell or ability and specify a new target for the copy. If the spell or ability has more than one target, each of the copy’s targets must be that player or object. If that player or object isn’t a legal target for each instance of the word “target,” the copy isn’t created. In the case where a replacement effect causes the copy to target more than one object, the copy’s controller chooses one of them to be the new target. The chosen target must be a legal target for that spell or ability." Example to consider: Frontline Heroism is an enchantment with the ability “Whenever you cast a spell that targets only a single creature you control, create a 1/1 red Soldier creature token with haste, then copy that spell. The copy targets that token.” Anointed Procession is an enchantment with the ability “If an effect would create one or more tokens under your control, it... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [707.10e]: Some effects copy a spell or ability and specify a new target for the copy. If the spell or ability has more than one target, each of the copy’s targets must be that player or object. If that player or object isn’t a legal target for each instance of the word “target,” the copy isn’t created. In the case where a replacement effect causes the copy to target more than one object, the copy’s controller chooses one of them to be the new target. The chosen target must be a legal target for that spell or ability. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [707.10e].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[707.10e]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X37. Rule 712.21c anchor - If an effect can find the new object

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 712.21c. Apply this rule text to the dispute: "If an effect can find the new object that a melded permanent becomes as it leaves the battlefield, it finds both cards. (See rule 400.7.) If that effect causes actions to be taken upon those cards, the same actions are taken upon each of them." Example to consider: Otherworldly Journey is an instant that reads “Exile target creature. At the beginning of the next end step, return that card to the battlefield under its owner’s control with a +1/+1 counter on it.” A player casts Otherworldly Journey targeting Chittering Host, a melded permanent. Chittering Host is exiled. At the beginning of the next end step, Midnight... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [712.21c]: If an effect can find the new object that a melded permanent becomes as it leaves the battlefield, it finds both cards. (See rule 400.7.) If that effect causes actions to be taken upon those cards, the same actions are taken upon each of them. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [712.21c].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[712.21c]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X38. Rule 712.13a anchor - Some abilities may cause a double-faced spell with

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 712.13a. Apply this rule text to the dispute: "Some abilities may cause a double-faced spell with its front face up on the stack to enter the battlefield transformed or converted. If the back face of the card that represents that spell is an instant or sorcery face, or that spell is a copy of a double-faced card created with an instant or sorcery back face, it doesn’t enter the battlefield, and is instead put into its owner’s graveyard." Example to consider: A player controls both Mycosynth Lattice and March of the Machines, the combined effects of which make all permanents artifact creatures in addition to their other types. They also control a Clone on the battlefield that is a copy of Bird Admirer, a creature with daybound. It is currently night, but that permanent can’t transform because it isn’t represen... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [712.13a]: Some abilities may cause a double-faced spell with its front face up on the stack to enter the battlefield transformed or converted. If the back face of the card that represents that spell is an instant or sorcery face, or that spell is a copy of a double-faced card created with an instant or sorcery back face, it doesn’t enter the battlefield, and is instead put into its owner’s graveyard. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [712.13a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[712.13a]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X39. Rule 201.5b anchor - If an ability of an object refers to

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 201.5b. Apply this rule text to the dispute: "If an ability of an object refers to that object by name, and an object with a different name gains that ability, each instance of the first name in the gained ability that refers to the first object by name should be treated as the second name." Example to consider: Quicksilver Elemental says, in part, “{U}: This creature gains all activated abilities of target creature until end of turn.” If it gains an ability that says “{BB}: Regenerate Skithiryx,” activating that ability will regenerate Quicksilver Elemental, not the Skithiryx, the Blight Dragon it gained the ability from. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [201.5b]: If an ability of an object refers to that object by name, and an object with a different name gains that ability, each instance of the first name in the gained ability that refers to the first object by name should be treated as the second name. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [201.5b].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[201.5b]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X40. Rule 707.9e anchor - Some replacement effects that generate copy effects include

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 707.9e. Apply this rule text to the dispute: "Some replacement effects that generate copy effects include an exception that’s an additional effect rather than a modification of the affected object’s characteristics. If another copy effect is applied to that object after applying the copy effect with that exception, the exception’s effect doesn’t happen." Example to consider: Altered Ego reads, “You may have this creature enter as a copy of any creature on the battlefield, except it enters with X additional +1/+1 counters on it.” You choose for it to enter the battlefield as a copy of Clone, which reads “You may have this creature enter as a copy of any creature on the battlefield,” for which no creature was chosen as it enter... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [707.9e]: Some replacement effects that generate copy effects include an exception that’s an additional effect rather than a modification of the affected object’s characteristics. If another copy effect is applied to that object after applying the copy effect with that exception, the exception’s effect doesn’t happen. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [707.9e].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[707.9e]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X41. Rule 707.9f anchor - Some exceptions to the copying process apply only

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 707.9f. Apply this rule text to the dispute: "Some exceptions to the copying process apply only if the copy is or has certain characteristics. To determine whether such an exception applies, consider what the resulting permanent’s characteristics would be if the copy effect were applied without that exception, taking into account any other exceptions that effect includes." Example to consider: Moritte of the Frost says, in part, “You may have Moritte enter as a copy of a permanent you control, except it’s legendary and snow in addition to its other types and, if it’s a creature, it enters with two additional +1/+1 counters on it and it has changeling.” Moritte of the Frost copies a land that has become a creature until end of turn. It would ent... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [707.9f]: Some exceptions to the copying process apply only if the copy is or has certain characteristics. To determine whether such an exception applies, consider what the resulting permanent’s characteristics would be if the copy effect were applied without that exception, taking into account any other exceptions that effect includes. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [707.9f].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[707.9f]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X42. Rule 201.5a anchor - If an ability’s effect grants another ability to

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 201.5a. Apply this rule text to the dispute: "If an ability’s effect grants another ability to an object, and that second ability refers to that first ability’s source by name, the name refers only to the specific object which is that first ability’s source. The second ability does not refer to any other object with the same name as the first ability’s source. However, if the second ability also moved the first ability’s source to a different public zone, the name refers to the object the source became in its new zone. This is also true if the second abilit..." Example to consider: Gutter Grime has an ability that reads “Whenever a nontoken creature you control dies, put a slime counter on this enchantment, then create a green Ooze creature token with ‘This token’s power and toughness are each equal to the number of slime counters on Gutter Grime.’” The ability granted to the token only looks at the Gutter Grime that created the tok... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [201.5a]: If an ability’s effect grants another ability to an object, and that second ability refers to that first ability’s source by name, the name refers only to the specific object which is that first ability’s source. The second ability does not refer to any other object with the same name as the first ability’s source. However, if the second ability also moved the first ability’s source to a different public zone, the name refers to the object the source became in its new zone. This is also true if the second ability is copied onto a new object. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [201.5a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[201.5a]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X43. Rule 208.3a anchor - If an effect would be created that sets

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 208.3a. Apply this rule text to the dispute: "If an effect would be created that sets the base power and/or toughness of a noncreature permanent, or otherwise modifies its power and/or toughness, that effect is created even though it doesn’t do anything unless that permanent becomes a creature." Example to consider: Veteran Motorist has the ability “Whenever this creature crews a Vehicle, that Vehicle gets +1/+1 until end of turn,” and it’s tapped to pay the crew cost of a Vehicle. This triggered ability resolves while the Vehicle it crewed isn’t yet a creature. The continuous effect is created and will apply to the Vehicle once it becomes a creature. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [208.3a]: If an effect would be created that sets the base power and/or toughness of a noncreature permanent, or otherwise modifies its power and/or toughness, that effect is created even though it doesn’t do anything unless that permanent becomes a creature. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [208.3a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[208.3a]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X44. Rule 707.8a anchor - If an effect creates a token that is

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 707.8a. Apply this rule text to the dispute: "If an effect creates a token that is a copy of a double-faced permanent or a double-faced card not on the battlefield, the resulting token is a double-faced token that has both a front face and a back face. The characteristics of each face are determined by the copiable values of the same face of the permanent or card it is a copy of, as modified by any other copy effects that apply to that object. If the token is a copy of a double-faced permanent with its back face up, the token enters the battlefield with its..." Example to consider: Afflicted Deserter is the front face of a double-faced card, and the name of its back face is Werewolf Ransacker. If an effect creates a token that is a copy of that permanent, the token also has the same two faces and can transform. It enters the battlefield with the same face up as the permanent that it is a copy of. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [707.8a]: If an effect creates a token that is a copy of a double-faced permanent or a double-faced card not on the battlefield, the resulting token is a double-faced token that has both a front face and a back face. The characteristics of each face are determined by the copiable values of the same face of the permanent or card it is a copy of, as modified by any other copy effects that apply to that object. If the token is a copy of a double-faced permanent with its back face up, the token enters the battlefield with its back face up. This rule does not apply to tokens that are created with their own set of characteristics and enter the battlefield as a copy of a double-faced object due to a repla... The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [707.8a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[707.8a]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X45. Rule 607.2i anchor - If an object has an ability printed on

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 607.2i. Apply this rule text to the dispute: "If an object has an ability printed on it that allows an additional cost to be paid and an ability printed on it that refers to whether that cost was paid, those abilities are linked. The second refers only to whether the intent to pay the additional cost listed in the first was declared as the object was cast as a spell. If an ability lists multiple such costs, it may have multiple abilities linked to it. Each of those abilities will specify which cost it refers to." Example to consider: Stormscape Battlemage has “Kicker {W} and/or {2}{B}” and two abilities that may trigger when it enters the battlefield. The first triggers if it was kicked with its {W} kicker, and the second triggers if it was kicked with its {2}{B} kicker. Each of those triggered abilities is linked to its kicker ability. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [607.2i]: If an object has an ability printed on it that allows an additional cost to be paid and an ability printed on it that refers to whether that cost was paid, those abilities are linked. The second refers only to whether the intent to pay the additional cost listed in the first was declared as the object was cast as a spell. If an ability lists multiple such costs, it may have multiple abilities linked to it. Each of those abilities will specify which cost it refers to. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [607.2i].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[607.2i]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X46. Rule 712.21b anchor - If a player exiles a melded permanent that

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 712.21b. Apply this rule text to the dispute: "If a player exiles a melded permanent, that player determines the relative timestamp order of the two cards at that time. This is an exception to the procedure described in rule 613.7m." Example to consider: Duplicant is a card with the abilities “When Duplicant enters, you may exile target nontoken creature” and “As long as a card exiled with Duplicant is a creature card, Duplicant has the power, toughness, and creature types of the last creature card exiled with Duplicant. It’s still a Shapeshifter.” As Duplicant’s first ability exiles Chittering Host, a me... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [712.21b]: If a player exiles a melded permanent, that player determines the relative timestamp order of the two cards at that time. This is an exception to the procedure described in rule 613.7m. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [712.21b].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[712.21b]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X47. Rule 202.3b anchor - The mana value of the back face of

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 202.3b. Apply this rule text to the dispute: "The mana value of the back face of a nonmodal double-faced permanent or spell’s back face is calculated as though it had the mana cost of its front face. If a permanent or spell is a copy of the back face of a nonmodal double-faced object (even if the card representing that copy is itself a double-faced card), the mana value of the copy is 0." Example to consider: Huntmaster of the Fells is a nonmodal double-faced card with mana cost {2}{R}{G}. Its mana value is 4. After it transforms to its other face (Ravager of the Fells), its mana value remains 4. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [202.3b]: The mana value of the back face of a nonmodal double-faced permanent or spell’s back face is calculated as though it had the mana cost of its front face. If a permanent or spell is a copy of the back face of a nonmodal double-faced object (even if the card representing that copy is itself a double-faced card), the mana value of the copy is 0. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [202.3b].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[202.3b]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X48. Rule 707.9d anchor - When applying a copy effect that doesn’t copy

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 707.9d. Apply this rule text to the dispute: "When applying a copy effect that doesn’t copy a certain characteristic, retains one or more original values for a certain characteristic, or provides a specific set of values for a certain characteristic, any characteristic-defining ability (see rule 604.3) of the object being copied that defines that characteristic is not copied. If that characteristic is color, any color indicator (see rule 204) of that object is also not copied. This rule does not apply to copy effects with exceptions that state the object is..." Example to consider: Quicksilver Gargantuan is a creature that reads, “You may have this creature enter as a copy of any creature on the battlefield, except it’s 7/7.” Quicksilver Gargantuan enters the battlefield as a copy of Tarmogoyf, which has a characteristic-defining ability that defines its power and toughness. Quicksilver Gargantuan does not have that ability. It will... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [707.9d]: When applying a copy effect that doesn’t copy a certain characteristic, retains one or more original values for a certain characteristic, or provides a specific set of values for a certain characteristic, any characteristic-defining ability (see rule 604.3) of the object being copied that defines that characteristic is not copied. If that characteristic is color, any color indicator (see rule 204) of that object is also not copied. This rule does not apply to copy effects with exceptions that state the object is a certain card type, supertype, and/or subtype “in addition to its other types.” In those cases, any characteristic-defining ability that defines card type, supertype, and/or subt... The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [707.9d].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[707.9d]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X49. Rule 208.2a anchor - The card may have a characteristic-defining ability that

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 208.2a. Apply this rule text to the dispute: "The card may have a characteristic-defining ability that sets its power and/or toughness according to some stated condition. (See rule 604.3.) Such an ability is worded “[This creature’s] [power or toughness] is equal to . . .” or “[This creature’s] power and toughness are each equal to . . .” This ability functions everywhere, even outside the game. If the ability needs to use a number that can’t be determined, including inside a calculation, use 0 instead of that number." Example to consider: Lost Order of Jarkeld has power and toughness each equal to 1+*. It has the abilities “As this creature enters, choose an opponent” and “Lost Order of Jarkeld’s power and toughness are each equal to 1 plus the number of creatures the chosen player controls.” While Lost Order of Jarkeld isn’t on the battlefield, there won’t be a chosen player. Its power an... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [208.2a]: The card may have a characteristic-defining ability that sets its power and/or toughness according to some stated condition. (See rule 604.3.) Such an ability is worded “[This creature’s] [power or toughness] is equal to . . .” or “[This creature’s] power and toughness are each equal to . . .” This ability functions everywhere, even outside the game. If the ability needs to use a number that can’t be determined, including inside a calculation, use 0 instead of that number. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [208.2a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[208.2a]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X50. Rule 607.5a anchor - If an object gains an ability that refers

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 607.5a. Apply this rule text to the dispute: "If an object gains an ability that refers to a choice, but either (a) doesn’t copy that ability’s linked ability or (b) does copy the linked ability but no choice is made for it, then the choice is considered to be “undefined.” If an ability refers to an undefined choice, that part of the ability won’t do anything." Example to consider: Voice of All enters the battlefield and Unstable Shapeshifter copies it. Voice of All reads, in part, “As this creature enters, choose a color.” and “This creature has protection from the chosen color.” Unstable Shapeshifter never had a chance for a color to be chosen for it, because it didn’t enter the battlefield as Voice of All so it doesn’t gain a pro... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [607.5a]: If an object gains an ability that refers to a choice, but either (a) doesn’t copy that ability’s linked ability or (b) does copy the linked ability but no choice is made for it, then the choice is considered to be “undefined.” If an ability refers to an undefined choice, that part of the ability won’t do anything. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [607.5a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[607.5a]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X51. Rule 303.4i anchor - If an effect attempts to put an Aura

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 303.4i. Apply this rule text to the dispute: "If an effect attempts to put an Aura onto the battlefield attached to either an object or player it can’t legally enchant or an object or player that is undefined, the Aura remains in its current zone, unless that zone is the stack. In that case, the Aura is put into its owner’s graveyard instead of entering the battlefield. If the Aura is a token, it isn’t created." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [303.4i]: If an effect attempts to put an Aura onto the battlefield attached to either an object or player it can’t legally enchant or an object or player that is undefined, the Aura remains in its current zone, unless that zone is the stack. In that case, the Aura is put into its owner’s graveyard instead of entering the battlefield. If the Aura is a token, it isn’t created. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [303.4i].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[303.4i]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X52. Rule 205.1b anchor - Some effects change an object’s card type supertype

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 205.1b. Apply this rule text to the dispute: "Some effects change an object’s card type, supertype, or subtype but specify that the object retains a prior card type, supertype, or subtype. In such cases, all the object’s prior card types, supertypes, and subtypes are retained. This rule applies to effects that use phrases such as “in addition to its other types” or that state that something is “still a [type, supertype, or subtype].” Some effects state that an object becomes an “artifact creature”; these effects also allow the object to retain all of its pr..." Example to consider: An ability reads, “All lands are 1/1 creatures that are still lands.” The affected lands now have two card types: creature and land. If there were any lands that were also artifacts before the ability’s effect applied to them, those lands would become “artifact land creatures,” not just “creatures,” or “land creatures.” The effect allows them to retain bo... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [205.1b]: Some effects change an object’s card type, supertype, or subtype but specify that the object retains a prior card type, supertype, or subtype. In such cases, all the object’s prior card types, supertypes, and subtypes are retained. This rule applies to effects that use phrases such as “in addition to its other types” or that state that something is “still a [type, supertype, or subtype].” Some effects state that an object becomes an “artifact creature”; these effects also allow the object to retain all of its prior card types and subtypes. Some effects state that an object becomes a “[creature type or types] artifact creature”; these effects also allow the object to retain all of its prio... The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [205.1b].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[205.1b]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

## X53. Rule 301.5c anchor - An Equipment that’s also a creature can’t equip

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a object model, zones, copies, linked abilities, merged permanents dispute governed by rule 301.5c. Apply this rule text to the dispute: "An Equipment that’s also a creature can’t equip a creature unless that Equipment has reconfigure (see rule 702.151, “Reconfigure”). An Equipment that loses the subtype “Equipment” can’t equip a creature. An Equipment can’t equip itself. An Equipment that equips an illegal or nonexistent permanent becomes unattached from that permanent but remains on the battlefield. (This is a state-based action. See rule 704.) An Equipment can’t equip more than one creature. If a spell or ability would cause an Equipment to equ..." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [301.5c]: An Equipment that’s also a creature can’t equip a creature unless that Equipment has reconfigure (see rule 702.151, “Reconfigure”). An Equipment that loses the subtype “Equipment” can’t equip a creature. An Equipment can’t equip itself. An Equipment that equips an illegal or nonexistent permanent becomes unattached from that permanent but remains on the battlefield. (This is a state-based action. See rule 704.) An Equipment can’t equip more than one creature. If a spell or ability would cause an Equipment to equip more than one creature, the Equipment’s controller chooses which creature it equips. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [301.5c].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[301.5c]`.

**Why this test matters:** Broad coverage anchor for Object Model, Zones, Copies, Linked Abilities, Merged Permanents. Source docs: L07_ObjectModel_200to213_v/t.md, L07_ObjectModel_300to315_v/t.md, L07_ObjectModel_400to408_v/t.md, L07_ObjectModel_607_v/t.md, L07_ObjectModel_707to729_v/t.md.

---

# CATEGORY Y - Keyword Actions and Keyword Abilities

**Connected docs:**
- `L06_PlayerAction_701_v.md`
- `L07_ObjectModel_700_v/t.md`
- `L07_ObjectModel_702_v/t.md`
- `L06_PlayerAction_705to706_v/t.md`

## Y1. Rule 700.7 anchor - If an ability uses a phrase such as

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 700.7. Apply this rule text to the dispute: "If an ability uses a phrase such as “this [something]” to identify an object, where [something] is a characteristic or other quality, it is referring to that particular object, even if it isn’t the appropriate quality at the time." Example to consider: An ability reads “Target creature gets +2/+2 until end of turn. Destroy that creature at the beginning of the next end step.” The ability will destroy the object it gave +2/+2 to even if that object isn’t a creature at the beginning of the next end step. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [700.7]: If an ability uses a phrase such as “this [something]” to identify an object, where [something] is a characteristic or other quality, it is referring to that particular object, even if it isn’t the appropriate quality at the time. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [700.7].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[700.7]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y2. Rule 700.14 anchor - Some abilities trigger “Whenever you expend N” A

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 700.14. Apply this rule text to the dispute: "Some abilities trigger “Whenever you expend N.” A player expends N if they pay a cost to cast a spell and the amount of mana that player spent this turn to cast spells prior to paying that cost was less than N and became at least N after paying that cost." Example to consider: A player casts Bark-Knuckle Boxer, which costs {1}{G} and reads “Whenever you expend 4, this creature gains indestructible until end of turn.” After it resolves, that player casts Divination, a spell that costs {2}{U}. Prior to paying the cost to cast Divination, that player has spent two mana to cast spells this turn. After paying the cost, they have spe... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [700.14]: Some abilities trigger “Whenever you expend N.” A player expends N if they pay a cost to cast a spell and the amount of mana that player spent this turn to cast spells prior to paying that cost was less than N and became at least N after paying that cost. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [700.14].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[700.14]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y3. Rule 700.2 anchor - A spell or ability is modal if it

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 700.2. Apply this rule text to the dispute: "A spell or ability is modal if it has two or more options in a bulleted list preceded by instructions for a player to choose a number of those options, such as “Choose one —.” Each of those options is a mode. Modal cards printed prior to the Khans of Tarkir™ set didn’t use bulleted lists for the modes; these cards have received errata in the Oracle card reference so the modes do appear in a bulleted list." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [700.2]: A spell or ability is modal if it has two or more options in a bulleted list preceded by instructions for a player to choose a number of those options, such as “Choose one —.” Each of those options is a mode. Modal cards printed prior to the Khans of Tarkir™ set didn’t use bulleted lists for the modes; these cards have received errata in the Oracle card reference so the modes do appear in a bulleted list. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [700.2].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[700.2]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y4. Rule 700.4 anchor - The term dies means “is put into a

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 700.4. Apply this rule text to the dispute: "The term dies means “is put into a graveyard from the battlefield.”" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [700.4]: The term dies means “is put into a graveyard from the battlefield.” The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [700.4].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[700.4]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y5. Rule 700.5a anchor - A player’s devotion to each color and combination

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 700.5a. Apply this rule text to the dispute: "A player’s devotion to each color and combination of colors, taking into account any effects that modify devotion, is calculated after considering any copy, control, or text-changing effects but before any other effects that modify the characteristics of permanents. This is an exception to 613.10. See also rule 613, “Interaction of Continuous Effects.”" Example to consider: Altar of the Pantheon is an artifact with no colored mana in its cost and an ability that says “Your devotion to each color and each combination of colors is increased by one.” Purphoros, God of the Forge is a permanent mana cost {3}{R} and an ability that says “As long as your devotion to red is less than five, Purphoros isn’t a creature.” If a player co... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [700.5a]: A player’s devotion to each color and combination of colors, taking into account any effects that modify devotion, is calculated after considering any copy, control, or text-changing effects but before any other effects that modify the characteristics of permanents. This is an exception to 613.10. See also rule 613, “Interaction of Continuous Effects.” The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [700.5a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[700.5a]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y6. Rule 700.10 anchor - Some cards refer to a permanent “that was

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 700.10. Apply this rule text to the dispute: "Some cards refer to a permanent “that was activated this turn.” This means that the permanent was the source of an ability that was activated this turn, regardless of whether that permanent still has that activated ability or the player who activated it is still in the game." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [700.10]: Some cards refer to a permanent “that was activated this turn.” This means that the permanent was the source of an ability that was activated this turn, regardless of whether that permanent still has that activated ability or the player who activated it is still in the game. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [700.10].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[700.10]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y7. Rule 700.11 anchor - Some cards refer to whether a player has

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 700.11. Apply this rule text to the dispute: "Some cards refer to whether a player has “descended this turn.” This means that a permanent card has been put into that player’s graveyard from anywhere this turn. “The number of times [a player] descended this turn” means “the number of permanent cards put into [that player’s] graveyard from anywhere this turn.” In both cases, no permanent cards put into the player’s graveyard that turn are required to still be in that graveyard." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [700.11]: Some cards refer to whether a player has “descended this turn.” This means that a permanent card has been put into that player’s graveyard from anywhere this turn. “The number of times [a player] descended this turn” means “the number of permanent cards put into [that player’s] graveyard from anywhere this turn.” In both cases, no permanent cards put into the player’s graveyard that turn are required to still be in that graveyard. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [700.11].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[700.11]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y8. Rule 700.13 anchor - Some cards refer to committing a crime A

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 700.13. Apply this rule text to the dispute: "Some cards refer to committing a crime. A player commits a crime as that player casts a spell, activates an ability, or puts a triggered ability on the stack and that spell or ability targets at least one opponent; at least one permanent, spell, or ability an opponent controls; and/or at least one card in an opponent’s graveyard." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [700.13]: Some cards refer to committing a crime. A player commits a crime as that player casts a spell, activates an ability, or puts a triggered ability on the stack and that spell or ability targets at least one opponent; at least one permanent, spell, or ability an opponent controls; and/or at least one card in an opponent’s graveyard. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [700.13].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[700.13]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y9. Rule 701.12a anchor - A spell or ability may instruct players to

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 701.12a. Apply this rule text to the dispute: "A spell or ability may instruct players to exchange something (for example, life totals or control of two permanents) as part of its resolution. When such a spell or ability resolves, if the entire exchange can’t be completed, no part of the exchange occurs." Example to consider: If a spell attempts to exchange control of two target creatures but one of those creatures is destroyed before the spell resolves, the spell does nothing to the other creature. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [701.12a]: A spell or ability may instruct players to exchange something (for example, life totals or control of two permanents) as part of its resolution. When such a spell or ability resolves, if the entire exchange can’t be completed, no part of the exchange occurs. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [701.12a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[701.12a]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y10. Rule 702.47a anchor - Splice is a static ability that functions while

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 702.47a. Apply this rule text to the dispute: "Splice is a static ability that functions while a card is in your hand. “Splice onto [quality] [cost]” means “You may reveal this card from your hand as you cast a [quality] spell. If you do, that spell gains the text of this card’s rules text and you pay [cost] as an additional cost to cast that spell.” Paying a card’s splice cost follows the rules for paying additional costs in rules 601.2b and 601.2f–h." Example to consider: Since the card with splice remains in the player’s hand, it can later be cast normally or spliced onto another spell. It can even be discarded to pay a “discard a card” cost of the spell it’s spliced onto. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [702.47a]: Splice is a static ability that functions while a card is in your hand. “Splice onto [quality] [cost]” means “You may reveal this card from your hand as you cast a [quality] spell. If you do, that spell gains the text of this card’s rules text and you pay [cost] as an additional cost to cast that spell.” Paying a card’s splice cost follows the rules for paying additional costs in rules 601.2b and 601.2f–h. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [702.47a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[702.47a]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y11. Rule 705.1 anchor - Some cards refer to flipping a coin A

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 705.1. Apply this rule text to the dispute: "Some cards refer to flipping a coin. A coin used in a flip must be a two-sided object with easily distinguished sides and equal likelihood that either side lands face up. If the coin that’s being flipped doesn’t have an obvious “heads” or “tails,” designate one side to be “heads,” and the other side to be “tails.” Other methods of randomization may be substituted for flipping a coin as long as there are two possible outcomes of equal likelihood and all players agree to the substitution. For example, the player m..." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [705.1]: Some cards refer to flipping a coin. A coin used in a flip must be a two-sided object with easily distinguished sides and equal likelihood that either side lands face up. If the coin that’s being flipped doesn’t have an obvious “heads” or “tails,” designate one side to be “heads,” and the other side to be “tails.” Other methods of randomization may be substituted for flipping a coin as long as there are two possible outcomes of equal likelihood and all players agree to the substitution. For example, the player may roll an even-sided die and call “odds” or “evens,” or roll an even-sided die and designate that “odds” means “heads” and “evens” means “tails.” The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [705.1].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[705.1]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y12. Rule 700.1 anchor - Anything that happens in a game is an

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 700.1. Apply this rule text to the dispute: "Anything that happens in a game is an event. Multiple events may take place during the resolution of a spell or ability. The text of triggered abilities and replacement effects defines the event they’re looking for. One “happening” may be treated as a single event by one ability and as multiple events by another." Example to consider: If an attacking creature is blocked by two creatures, this is one event for a triggered ability that reads “Whenever this creature becomes blocked” but two events for a triggered ability that reads “Whenever this creature becomes blocked by a creature.” What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [700.1]: Anything that happens in a game is an event. Multiple events may take place during the resolution of a spell or ability. The text of triggered abilities and replacement effects defines the event they’re looking for. One “happening” may be treated as a single event by one ability and as multiple events by another. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [700.1].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[700.1]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y13. Rule 701.2a anchor - To activate an activated ability is to put

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 701.2a. Apply this rule text to the dispute: "To activate an activated ability is to put it onto the stack and pay its costs, so that it will eventually resolve and have its effect. Only an object’s controller (or its owner, if it doesn’t have a controller) can activate its activated ability unless the object specifically says otherwise. A player may activate an ability if they have priority. See rule 602, “Activating Activated Abilities.”" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [701.2a]: To activate an activated ability is to put it onto the stack and pay its costs, so that it will eventually resolve and have its effect. Only an object’s controller (or its owner, if it doesn’t have a controller) can activate its activated ability unless the object specifically says otherwise. A player may activate an ability if they have priority. See rule 602, “Activating Activated Abilities.” The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [701.2a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[701.2a]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y14. Rule 701.3a anchor - To attach an Aura Equipment or Fortification to

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 701.3a. Apply this rule text to the dispute: "To attach an Aura, Equipment, or Fortification to an object or player means to take it from where it currently is and put it onto that object or player. If something is attached to a permanent on the battlefield, it’s customary to place it so that it’s physically touching the permanent. An Aura, Equipment, or Fortification can’t be attached to an object or player it couldn’t enchant, equip, or fortify, respectively." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [701.3a]: To attach an Aura, Equipment, or Fortification to an object or player means to take it from where it currently is and put it onto that object or player. If something is attached to a permanent on the battlefield, it’s customary to place it so that it’s physically touching the permanent. An Aura, Equipment, or Fortification can’t be attached to an object or player it couldn’t enchant, equip, or fortify, respectively. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [701.3a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[701.3a]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y15. Rule 701.19a anchor - If the effect of a resolving spell or

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 701.19a. Apply this rule text to the dispute: "If the effect of a resolving spell or ability regenerates a permanent, it creates a replacement effect that protects the permanent the next time it would be destroyed this turn. In this case, “Regenerate [permanent]” means “The next time [permanent] would be destroyed this turn, instead remove all damage marked on it and its controller taps it. If it’s an attacking or blocking creature, remove it from combat.”" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [701.19a]: If the effect of a resolving spell or ability regenerates a permanent, it creates a replacement effect that protects the permanent the next time it would be destroyed this turn. In this case, “Regenerate [permanent]” means “The next time [permanent] would be destroyed this turn, instead remove all damage marked on it and its controller taps it. If it’s an attacking or blocking creature, remove it from combat.” The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [701.19a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[701.19a]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y16. Rule 701.34a anchor - To proliferate means to choose any number of

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 701.34a. Apply this rule text to the dispute: "To proliferate means to choose any number of permanents and/or players that have a counter, then give each one additional counter of each kind that permanent or player already has." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [701.34a]: To proliferate means to choose any number of permanents and/or players that have a counter, then give each one additional counter of each kind that permanent or player already has. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [701.34a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[701.34a]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y17. Rule 701.35a anchor - Certain spells and abilities can detain a permanent

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 701.35a. Apply this rule text to the dispute: "Certain spells and abilities can detain a permanent. Until the next turn of the controller of that spell or ability, that permanent can’t attack or block and its activated abilities can’t be activated." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [701.35a]: Certain spells and abilities can detain a permanent. Until the next turn of the controller of that spell or ability, that permanent can’t attack or block and its activated abilities can’t be activated. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [701.35a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[701.35a]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y18. Rule 702.16a anchor - Protection is a static ability written “Protection from

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 702.16a. Apply this rule text to the dispute: "Protection is a static ability, written “Protection from [quality].” This quality is usually a color (as in “protection from black”) but can be any characteristic value or information. If the quality happens to be a card name, it is treated as such only if the protection ability specifies that the quality is a name. If the quality is a card type, subtype, or supertype, the ability applies to sources that are permanents with that card type, subtype, or supertype and to any sources not on the battlefield that are..." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [702.16a]: Protection is a static ability, written “Protection from [quality].” This quality is usually a color (as in “protection from black”) but can be any characteristic value or information. If the quality happens to be a card name, it is treated as such only if the protection ability specifies that the quality is a name. If the quality is a card type, subtype, or supertype, the ability applies to sources that are permanents with that card type, subtype, or supertype and to any sources not on the battlefield that are of that card type, subtype, or supertype. This is an exception to rule 109.2. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [702.16a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[702.16a]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y19. Rule 702.18a anchor - Shroud is a static ability “Shroud” means “This

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 702.18a. Apply this rule text to the dispute: "Shroud is a static ability. “Shroud” means “This permanent or player can’t be the target of spells or abilities.”" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [702.18a]: Shroud is a static ability. “Shroud” means “This permanent or player can’t be the target of spells or abilities.” The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [702.18a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[702.18a]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y20. Rule 702.21a anchor - Ward is a triggered ability Ward cost means

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 702.21a. Apply this rule text to the dispute: "Ward is a triggered ability. Ward [cost] means “Whenever this permanent becomes the target of a spell or ability an opponent controls, counter that spell or ability unless that player pays [cost].”" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [702.21a]: Ward is a triggered ability. Ward [cost] means “Whenever this permanent becomes the target of a spell or ability an opponent controls, counter that spell or ability unless that player pays [cost].” The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [702.21a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[702.21a]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y21. Rule 702.24a anchor - Cumulative upkeep is a triggered ability that imposes

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 702.24a. Apply this rule text to the dispute: "Cumulative upkeep is a triggered ability that imposes an increasing cost on a permanent. “Cumulative upkeep [cost]” means “At the beginning of your upkeep, if this permanent is on the battlefield, put an age counter on this permanent. Then you may pay [cost] for each age counter on it. If you don’t, sacrifice it.” If [cost] has choices associated with it, each choice is made separately for each age counter, then either the entire set of costs is paid, or none of them is paid. Partial payments aren’t allowed." Example to consider: A creature has “Cumulative upkeep {W} or {U}” and two age counters on it. When its ability next triggers and resolves, the creature’s controller puts an age counter on it and then may pay {W}{W}{W}, {W}{W}{U}, {W}{U}{U}, or {U}{U}{U} to keep the creature on the battlefield. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [702.24a]: Cumulative upkeep is a triggered ability that imposes an increasing cost on a permanent. “Cumulative upkeep [cost]” means “At the beginning of your upkeep, if this permanent is on the battlefield, put an age counter on this permanent. Then you may pay [cost] for each age counter on it. If you don’t, sacrifice it.” If [cost] has choices associated with it, each choice is made separately for each age counter, then either the entire set of costs is paid, or none of them is paid. Partial payments aren’t allowed. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [702.24a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[702.24a]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y22. Rule 702.26a anchor - Phasing is a static ability that modifies the

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 702.26a. Apply this rule text to the dispute: "Phasing is a static ability that modifies the rules of the untap step. During each player’s untap step, before the active player untaps permanents, all phased-in permanents with phasing that player controls “phase out.” Simultaneously, all phased-out permanents that had phased out under that player’s control “phase in.”" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [702.26a]: Phasing is a static ability that modifies the rules of the untap step. During each player’s untap step, before the active player untaps permanents, all phased-in permanents with phasing that player controls “phase out.” Simultaneously, all phased-out permanents that had phased out under that player’s control “phase in.” The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [702.26a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[702.26a]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y23. Rule 702.27a anchor - Buyback appears on some instants and sorceries It

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 702.27a. Apply this rule text to the dispute: "Buyback appears on some instants and sorceries. It represents two static abilities that function while the spell is on the stack. “Buyback [cost]” means “You may pay an additional [cost] as you cast this spell” and “If the buyback cost was paid, put this spell into its owner’s hand instead of into that player’s graveyard as it resolves.” Paying a spell’s buyback cost follows the rules for paying additional costs in rules 601.2b and 601.2f–h." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [702.27a]: Buyback appears on some instants and sorceries. It represents two static abilities that function while the spell is on the stack. “Buyback [cost]” means “You may pay an additional [cost] as you cast this spell” and “If the buyback cost was paid, put this spell into its owner’s hand instead of into that player’s graveyard as it resolves.” Paying a spell’s buyback cost follows the rules for paying additional costs in rules 601.2b and 601.2f–h. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [702.27a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[702.27a]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y24. Rule 702.30a anchor - Echo is a triggered ability “Echo cost” means

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 702.30a. Apply this rule text to the dispute: "Echo is a triggered ability. “Echo [cost]” means “At the beginning of your upkeep, if this permanent came under your control since the beginning of your last upkeep, sacrifice it unless you pay [cost].”" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [702.30a]: Echo is a triggered ability. “Echo [cost]” means “At the beginning of your upkeep, if this permanent came under your control since the beginning of your last upkeep, sacrifice it unless you pay [cost].” The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [702.30a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[702.30a]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y25. Rule 702.32a anchor - Fading is a keyword that represents two abilities

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 702.32a. Apply this rule text to the dispute: "Fading is a keyword that represents two abilities. “Fading N” means “This permanent enters with N fade counters on it” and “At the beginning of your upkeep, remove a fade counter from this permanent. If you can’t, sacrifice the permanent.”" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [702.32a]: Fading is a keyword that represents two abilities. “Fading N” means “This permanent enters with N fade counters on it” and “At the beginning of your upkeep, remove a fade counter from this permanent. If you can’t, sacrifice the permanent.” The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [702.32a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[702.32a]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y26. Rule 702.33a anchor - Kicker is a static ability that functions while

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 702.33a. Apply this rule text to the dispute: "Kicker is a static ability that functions while the spell with kicker is on the stack. “Kicker [cost]” means “You may pay an additional [cost] as you cast this spell.” Paying a spell’s kicker cost(s) follows the rules for paying additional costs in rules 601.2b and 601.2f–h." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [702.33a]: Kicker is a static ability that functions while the spell with kicker is on the stack. “Kicker [cost]” means “You may pay an additional [cost] as you cast this spell.” Paying a spell’s kicker cost(s) follows the rules for paying additional costs in rules 601.2b and 601.2f–h. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [702.33a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[702.33a]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y27. Rule 702.34a anchor - Flashback appears on some instants and sorceries It

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 702.34a. Apply this rule text to the dispute: "Flashback appears on some instants and sorceries. It represents two static abilities: one that functions while the card is in a player’s graveyard and another that functions while the card is on the stack. “Flashback [cost]” means “You may cast this card from your graveyard if the resulting spell is an instant or sorcery spell by paying [cost] rather than paying its mana cost” and “If the flashback cost was paid, exile this card instead of putting it anywhere else any time it would leave the stack.” Casting a sp..." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [702.34a]: Flashback appears on some instants and sorceries. It represents two static abilities: one that functions while the card is in a player’s graveyard and another that functions while the card is on the stack. “Flashback [cost]” means “You may cast this card from your graveyard if the resulting spell is an instant or sorcery spell by paying [cost] rather than paying its mana cost” and “If the flashback cost was paid, exile this card instead of putting it anywhere else any time it would leave the stack.” Casting a spell using its flashback ability follows the rules for paying alternative costs in rules 601.2b and 601.2f–h. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [702.34a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[702.34a]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y28. Rule 702.35a anchor - Madness is a keyword that represents two abilities

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 702.35a. Apply this rule text to the dispute: "Madness is a keyword that represents two abilities. The first is a static ability that functions while the card with madness is in a player’s hand. The second is a triggered ability that functions when the first ability is applied. “Madness [cost]” means “If a player would discard this card, that player discards it, but exiles it instead of putting it into their graveyard” and “When this card is exiled this way, its owner may cast it by paying [cost] rather than paying its mana cost. If that player doesn’t, they..." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [702.35a]: Madness is a keyword that represents two abilities. The first is a static ability that functions while the card with madness is in a player’s hand. The second is a triggered ability that functions when the first ability is applied. “Madness [cost]” means “If a player would discard this card, that player discards it, but exiles it instead of putting it into their graveyard” and “When this card is exiled this way, its owner may cast it by paying [cost] rather than paying its mana cost. If that player doesn’t, they put this card into their graveyard.” The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [702.35a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[702.35a]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y29. Rule 702.38a anchor - Amplify is a static ability “Amplify N” means

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 702.38a. Apply this rule text to the dispute: "Amplify is a static ability. “Amplify N” means “As this object enters, reveal any number of cards from your hand that share a creature type with it. This permanent enters with N +1/+1 counters on it for each card revealed this way. You can’t reveal this card or any other cards that are entering the battlefield at the same time as this card.”" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [702.38a]: Amplify is a static ability. “Amplify N” means “As this object enters, reveal any number of cards from your hand that share a creature type with it. This permanent enters with N +1/+1 counters on it for each card revealed this way. You can’t reveal this card or any other cards that are entering the battlefield at the same time as this card.” The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [702.38a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[702.38a]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y30. Rule 702.42a anchor - Entwine is a static ability of modal spells

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 702.42a. Apply this rule text to the dispute: "Entwine is a static ability of modal spells (see rule 700.2) that functions while the spell is on the stack. “Entwine [cost]” means “You may choose all modes of this spell instead of just the number specified. If you do, you pay an additional [cost].” Using the entwine ability follows the rules for choosing modes and paying additional costs in rules 601.2b and 601.2f–h." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [702.42a]: Entwine is a static ability of modal spells (see rule 700.2) that functions while the spell is on the stack. “Entwine [cost]” means “You may choose all modes of this spell instead of just the number specified. If you do, you pay an additional [cost].” Using the entwine ability follows the rules for choosing modes and paying additional costs in rules 601.2b and 601.2f–h. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [702.42a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[702.42a]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y31. Rule 702.48a anchor - Offering is a static ability that functions while

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 702.48a. Apply this rule text to the dispute: "Offering is a static ability that functions while the spell with offering is on the stack. “[Quality] offering” means “As an additional cost to cast this spell, you may sacrifice a [quality] permanent. If you chose to pay the additional cost, this spell’s total cost is reduced by the sacrificed permanent’s mana cost, and you may cast this spell any time you could cast an instant.”" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [702.48a]: Offering is a static ability that functions while the spell with offering is on the stack. “[Quality] offering” means “As an additional cost to cast this spell, you may sacrifice a [quality] permanent. If you chose to pay the additional cost, this spell’s total cost is reduced by the sacrificed permanent’s mana cost, and you may cast this spell any time you could cast an instant.” The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [702.48a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[702.48a]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y32. Rule 702.50a anchor - Epic represents two spell abilities one of which

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 702.50a. Apply this rule text to the dispute: "Epic represents two spell abilities, one of which creates a delayed triggered ability. “Epic” means “For the rest of the game, you can’t cast spells,” and “At the beginning of each of your upkeeps for the rest of the game, copy this spell except for its epic ability. If the spell has any targets, you may choose new targets for the copy.” See rule 707.10." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [702.50a]: Epic represents two spell abilities, one of which creates a delayed triggered ability. “Epic” means “For the rest of the game, you can’t cast spells,” and “At the beginning of each of your upkeeps for the rest of the game, copy this spell except for its epic ability. If the spell has any targets, you may choose new targets for the copy.” See rule 707.10. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [702.50a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[702.50a]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y33. Rule 702.52a anchor - Dredge is a static ability that functions only

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 702.52a. Apply this rule text to the dispute: "Dredge is a static ability that functions only while the card with dredge is in a player’s graveyard. “Dredge N” means “As long as you have at least N cards in your library, if you would draw a card, you may instead mill N cards and return this card from your graveyard to your hand.”" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [702.52a]: Dredge is a static ability that functions only while the card with dredge is in a player’s graveyard. “Dredge N” means “As long as you have at least N cards in your library, if you would draw a card, you may instead mill N cards and return this card from your graveyard to your hand.” The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [702.52a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[702.52a]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y34. Rule 702.56a anchor - Replicate is a keyword that represents two abilities

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 702.56a. Apply this rule text to the dispute: "Replicate is a keyword that represents two abilities. The first is a static ability that functions while the spell with replicate is on the stack. The second is a triggered ability that functions while the spell with replicate is on the stack. “Replicate [cost]” means “As an additional cost to cast this spell, you may pay [cost] any number of times” and “When you cast this spell, if a replicate cost was paid for it, copy it for each time its replicate cost was paid. If the spell has any targets, you may choose n..." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [702.56a]: Replicate is a keyword that represents two abilities. The first is a static ability that functions while the spell with replicate is on the stack. The second is a triggered ability that functions while the spell with replicate is on the stack. “Replicate [cost]” means “As an additional cost to cast this spell, you may pay [cost] any number of times” and “When you cast this spell, if a replicate cost was paid for it, copy it for each time its replicate cost was paid. If the spell has any targets, you may choose new targets for any of the copies.” Paying a spell’s replicate cost follows the rules for paying additional costs in rules 601.2b and 601.2f–h. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [702.56a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[702.56a]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y35. Rule 702.19b anchor - The controller of an attacking creature with trample

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 702.19b. Apply this rule text to the dispute: "The controller of an attacking creature with trample first assigns damage to the creature(s) blocking it. Once all those blocking creatures are assigned lethal damage, any excess damage is assigned as its controller chooses among those blocking creatures and the player, planeswalker, or battle the creature is attacking. When checking for assigned lethal damage, take into account damage already marked on the creature and damage from other creatures that’s being assigned during the same combat damage step, but not..." Example to consider: A 2/2 creature that can block an additional creature blocks two attackers: a 1/1 with no abilities and a 3/3 with trample. The active player could assign 1 damage from the first attacker and 1 damage from the second to the blocking creature, and 2 damage to the defending player from the creature with trample. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [702.19b]: The controller of an attacking creature with trample first assigns damage to the creature(s) blocking it. Once all those blocking creatures are assigned lethal damage, any excess damage is assigned as its controller chooses among those blocking creatures and the player, planeswalker, or battle the creature is attacking. When checking for assigned lethal damage, take into account damage already marked on the creature and damage from other creatures that’s being assigned during the same combat damage step, but not any abilities or effects that might change the amount of damage that’s actually dealt. The attacking creature’s controller need not assign lethal damage to all those blocking crea... The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [702.19b].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[702.19b]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y36. Rule 702.19c anchor - Trample over planeswalkers is a variant of trample

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 702.19c. Apply this rule text to the dispute: "Trample over planeswalkers is a variant of trample that modifies the rules for assigning combat damage to planeswalkers. The controller of a creature with trample over planeswalkers assigns that creature’s combat damage as described in rule 702.19b, with one exception. If that creature is attacking a planeswalker, after lethal damage is assigned to all blocking creatures and damage at least equal to the loyalty of the planeswalker the creature is attacking is assigned to that planeswalker, further excess damage..." Example to consider: A player controls a planeswalker with three loyalty counters that is being attacked by a 1/1 with no abilities and a 7/7 with trample over planeswalkers. The active player could assign 1 damage from the first attacker and 2 damage from the second to the planeswalker and 5 damage to the defending player from the creature with trample over planeswalkers. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [702.19c]: Trample over planeswalkers is a variant of trample that modifies the rules for assigning combat damage to planeswalkers. The controller of a creature with trample over planeswalkers assigns that creature’s combat damage as described in rule 702.19b, with one exception. If that creature is attacking a planeswalker, after lethal damage is assigned to all blocking creatures and damage at least equal to the loyalty of the planeswalker the creature is attacking is assigned to that planeswalker, further excess damage may be assigned as the attacking creature’s controller chooses among those blocking creatures, that planeswalker, and that planeswalker’s controller. When checking for assigned dam... The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [702.19c].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[702.19c]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y37. Rule 701.23b anchor - If a player is searching a hidden zone

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 701.23b. Apply this rule text to the dispute: "If a player is searching a hidden zone for cards with a stated quality, such as a card with a certain card type or color, that player isn’t required to find some or all of those cards even if they’re present in that zone." Example to consider: Splinter says “Exile target artifact. Search its controller’s graveyard, hand, and library for all cards with the same name as that artifact and exile them. Then that player shuffles their library.” A player casts Splinter targeting Howling Mine (an artifact). Howling Mine’s controller has another Howling Mine in her graveyard and two more in her library.... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [701.23b]: If a player is searching a hidden zone for cards with a stated quality, such as a card with a certain card type or color, that player isn’t required to find some or all of those cards even if they’re present in that zone. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [701.23b].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[701.23b]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y38. Rule 701.23c anchor - If a player is instructed to search a

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 701.23c. Apply this rule text to the dispute: "If a player is instructed to search a hidden zone for cards that match an undefined quality, that player may still search that zone but can’t find any cards." Example to consider: Lobotomy says “Target player reveals their hand, then you choose a card other than a basic land card from it. Search that player’s graveyard, hand, and library for all cards with the same name as the chosen card and exile them. Then that player shuffles their library.” If the target player has no cards in their hand when Lobotomy resolves, the player who... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [701.23c]: If a player is instructed to search a hidden zone for cards that match an undefined quality, that player may still search that zone but can’t find any cards. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [701.23c].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[701.23c]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y39. Rule 702.62a anchor - Suspend is a keyword that represents three abilities

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 702.62a. Apply this rule text to the dispute: "Suspend is a keyword that represents three abilities. The first is a static ability that functions while the card with suspend is in a player’s hand. The second and third are triggered abilities that function in the exile zone. “Suspend N—[cost]” means “If you could begin to cast this card by putting it onto the stack from your hand, you may pay [cost] and exile it with N time counters on it. This action doesn’t use the stack,” and “At the beginning of your upkeep, if this card is suspended, remove a time counte..." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [702.62a]: Suspend is a keyword that represents three abilities. The first is a static ability that functions while the card with suspend is in a player’s hand. The second and third are triggered abilities that function in the exile zone. “Suspend N—[cost]” means “If you could begin to cast this card by putting it onto the stack from your hand, you may pay [cost] and exile it with N time counters on it. This action doesn’t use the stack,” and “At the beginning of your upkeep, if this card is suspended, remove a time counter from it,” and “When the last time counter is removed from this card, if it’s exiled, you may play it without paying its mana cost if able. If you don’t, it remains exiled. If you... The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [702.62a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[702.62a]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y40. Rule 702.176a anchor - Impending is a keyword that represents four abilities

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 702.176a. Apply this rule text to the dispute: "Impending is a keyword that represents four abilities. The first is a static ability that functions while the spell with impending is on the stack. The second is static ability that creates a replacement effect that may apply to the permanent with impending as it enters the battlefield from the stack. The third is a static ability that functions on the battlefield. The fourth is a triggered ability that functions on the battlefield. “Impending N—[cost]” means “You may choose to pay [cost] rather than pay this sp..." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [702.176a]: Impending is a keyword that represents four abilities. The first is a static ability that functions while the spell with impending is on the stack. The second is static ability that creates a replacement effect that may apply to the permanent with impending as it enters the battlefield from the stack. The third is a static ability that functions on the battlefield. The fourth is a triggered ability that functions on the battlefield. “Impending N—[cost]” means “You may choose to pay [cost] rather than pay this spell’s mana cost,” “If you chose to pay this permanent’s impending cost, it enters with N time counters on it,” “As long as this permanent’s impending cost was paid and it has a tim... The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [702.176a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[702.176a]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y41. Rule 701.24c anchor - If an effect would cause a player to

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 701.24c. Apply this rule text to the dispute: "If an effect would cause a player to shuffle one or more specific objects into a library, that library is shuffled even if none of those objects are in the zone they’re expected to be in or an effect causes all of those objects to be moved to another zone or remain in their current zone." Example to consider: Guile says, in part, “When Guile is put into a graveyard from anywhere, shuffle it into its owner’s library.” It’s put into a graveyard and its ability triggers, then a player exiles it from that graveyard in response. When the ability resolves, the library is shuffled. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [701.24c]: If an effect would cause a player to shuffle one or more specific objects into a library, that library is shuffled even if none of those objects are in the zone they’re expected to be in or an effect causes all of those objects to be moved to another zone or remain in their current zone. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [701.24c].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[701.24c]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y42. Rule 702.1b anchor - An effect that grants an object a keyword

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 702.1b. Apply this rule text to the dispute: "An effect that grants an object a keyword ability may define a variable in that ability based on characteristics of that object or other information about the game state. For these abilities, the value of that variable is constantly reevaluated." Example to consider: Volcano Hellion has the ability “This creature has echo {X}, where X is your life total.” If your life total is 10 when Volcano Hellion’s echo ability triggers but 5 when it resolves, the echo cost to pay is {5}. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [702.1b]: An effect that grants an object a keyword ability may define a variable in that ability based on characteristics of that object or other information about the game state. For these abilities, the value of that variable is constantly reevaluated. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [702.1b].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[702.1b]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y43. Rule 702.180a anchor - Harmonize represents three static abilities one that functions

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 702.180a. Apply this rule text to the dispute: "Harmonize represents three static abilities: one that functions while the card is in a player’s graveyard and two that function while the spell with harmonize is on the stack. “Harmonize [cost]” means “You may cast this card from your graveyard by paying [cost] and tapping up to one untapped creature you control rather than paying this spell’s mana cost,” “If you cast this spell using its harmonize ability, its total cost is reduced by an amount of generic mana equal to the tapped creature’s power,” and “If the..." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [702.180a]: Harmonize represents three static abilities: one that functions while the card is in a player’s graveyard and two that function while the spell with harmonize is on the stack. “Harmonize [cost]” means “You may cast this card from your graveyard by paying [cost] and tapping up to one untapped creature you control rather than paying this spell’s mana cost,” “If you cast this spell using its harmonize ability, its total cost is reduced by an amount of generic mana equal to the tapped creature’s power,” and “If the harmonize cost was paid, exile this card instead of putting it anywhere else any time it would leave the stack.” Casting a spell using its harmonize ability follows the rules for p... The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [702.180a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[702.180a]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y44. Rule 702.24b anchor - If a permanent has multiple instances of cumulative

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 702.24b. Apply this rule text to the dispute: "If a permanent has multiple instances of cumulative upkeep, each triggers separately. However, the age counters are not connected to any particular ability; each cumulative upkeep ability will count the total number of age counters on the permanent at the time that ability resolves." Example to consider: A creature has two instances of “Cumulative upkeep—Pay 1 life.” The creature has no age counters, and both cumulative upkeep abilities trigger. When the first ability resolves, the controller adds a counter and then chooses to pay 1 life. When the second ability resolves, the controller adds another counter and then chooses to pay an additional 2 life. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [702.24b]: If a permanent has multiple instances of cumulative upkeep, each triggers separately. However, the age counters are not connected to any particular ability; each cumulative upkeep ability will count the total number of age counters on the permanent at the time that ability resolves. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [702.24b].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[702.24b]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y45. Rule 702.78a anchor - Conspire is a keyword that represents two abilities

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 702.78a. Apply this rule text to the dispute: "Conspire is a keyword that represents two abilities. The first is a static ability that functions while the spell with conspire is on the stack. The second is a triggered ability that functions while the spell with conspire is on the stack. “Conspire” means “As an additional cost to cast this spell, you may tap two untapped creatures you control that each share a color with it” and “When you cast this spell, if its conspire cost was paid, copy it. If the spell has any targets, you may choose new targets for the..." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [702.78a]: Conspire is a keyword that represents two abilities. The first is a static ability that functions while the spell with conspire is on the stack. The second is a triggered ability that functions while the spell with conspire is on the stack. “Conspire” means “As an additional cost to cast this spell, you may tap two untapped creatures you control that each share a color with it” and “When you cast this spell, if its conspire cost was paid, copy it. If the spell has any targets, you may choose new targets for the copy.” Paying a spell’s conspire cost follows the rules for paying additional costs in rules 601.2b and 601.2f–h. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [702.78a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[702.78a]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y46. Rule 700.3c anchor - Objects grouped into piles don’t leave the zone

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 700.3c. Apply this rule text to the dispute: "Objects grouped into piles don’t leave the zone they’re currently in. If cards in a graveyard are split into piles, the order of the graveyard must be maintained." Example to consider: Fact or Fiction reads, “Reveal the top five cards of your library. An opponent separates those cards into two piles. Put one pile into your hand and the other into your graveyard.” While an opponent is separating the revealed cards into piles, they’re still in their owner’s library. They don’t leave the library until they’re put into their owner’s hand or... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [700.3c]: Objects grouped into piles don’t leave the zone they’re currently in. If cards in a graveyard are split into piles, the order of the graveyard must be maintained. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [700.3c].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[700.3c]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y47. Rule 701.23f anchor - If searching a zone is replaced with searching

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 701.23f. Apply this rule text to the dispute: "If searching a zone is replaced with searching a portion of that zone, any other instructions that refer to searching the zone still apply. Any abilities that trigger on a library being searched will trigger." Example to consider: Aven Mindcensor says, in part, “If an opponent would search a library, that player searches the top four cards of that library instead.” Veteran Explorer says “When this creature dies, each player may search their library for up to two basic land cards, put them onto the battlefield, then shuffle.” An opponent who searched the top four cards of their libr... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [701.23f]: If searching a zone is replaced with searching a portion of that zone, any other instructions that refer to searching the zone still apply. Any abilities that trigger on a library being searched will trigger. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [701.23f].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[701.23f]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y48. Rule 702.44c anchor - Sunburst can also be used to set a

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 702.44c. Apply this rule text to the dispute: "Sunburst can also be used to set a variable number for another ability. If the keyword is used in this way, it doesn’t matter whether the ability is on a creature spell or on a noncreature spell." Example to consider: The ability “Modular—Sunburst” means “This permanent enters with a +1/+1 counter on it for each color of mana spent to cast it” and “When this permanent is put into a graveyard from the battlefield, you may put a +1/+1 counter on target artifact creature for each +1/+1 counter on this permanent.” What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [702.44c]: Sunburst can also be used to set a variable number for another ability. If the keyword is used in this way, it doesn’t matter whether the ability is on a creature spell or on a noncreature spell. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [702.44c].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[702.44c]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y49. Rule 702.47c anchor - The spell has the characteristics of the main

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 702.47c. Apply this rule text to the dispute: "The spell has the characteristics of the main spell, plus the rules text of each of the spliced cards. This is a text-changing effect (see rule 612, “Text-Changing Effects”). The spell doesn’t gain any other characteristics (name, mana cost, color, supertypes, card types, subtypes, etc.) of the spliced cards. Text gained by the spell that refers to a card by name refers to the spell on the stack, not the card from which the text was copied." Example to consider: Glacial Ray is a red card with splice onto Arcane that reads, “Glacial Ray deals 2 damage to any target.” Suppose Glacial Ray is spliced onto Reach Through Mists, a blue spell. The spell is still blue, and Reach Through Mists deals the damage. This means that the ability can target a creature with protection from red and deal 2 damage to that creature. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [702.47c]: The spell has the characteristics of the main spell, plus the rules text of each of the spliced cards. This is a text-changing effect (see rule 612, “Text-Changing Effects”). The spell doesn’t gain any other characteristics (name, mana cost, color, supertypes, card types, subtypes, etc.) of the spliced cards. Text gained by the spell that refers to a card by name refers to the spell on the stack, not the card from which the text was copied. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [702.47c].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[702.47c]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y50. Rule 702.99a anchor - Cipher appears on some instants and sorceries It

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 702.99a. Apply this rule text to the dispute: "Cipher appears on some instants and sorceries. It represents two abilities. The first is a spell ability that functions while the spell with cipher is on the stack. The second is a static ability that functions while the card with cipher is in the exile zone. “Cipher” means “If this spell is represented by a card, you may exile this card encoded on a creature you control” and “For as long as this card is encoded on that creature, that creature has ‘Whenever this creature deals combat damage to a player, you may..." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [702.99a]: Cipher appears on some instants and sorceries. It represents two abilities. The first is a spell ability that functions while the spell with cipher is on the stack. The second is a static ability that functions while the card with cipher is in the exile zone. “Cipher” means “If this spell is represented by a card, you may exile this card encoded on a creature you control” and “For as long as this card is encoded on that creature, that creature has ‘Whenever this creature deals combat damage to a player, you may copy the encoded card and you may cast the copy without paying its mana cost.’” The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [702.99a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[702.99a]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y51. Rule 701.42c anchor - If an effect instructs a player to meld

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 701.42c. Apply this rule text to the dispute: "If an effect instructs a player to meld objects that can’t be melded, they stay in their current zone." Example to consider: A player owns and controls Midnight Scavengers and a token that’s a copy of Graf Rats. At the beginning of combat, both are exiled but can’t be melded. Midnight Scavengers remains exiled and the exiled token ceases to exist. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [701.42c]: If an effect instructs a player to meld objects that can’t be melded, they stay in their current zone. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [701.42c].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[701.42c]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y52. Rule 702.88a anchor - Rebound appears on some instants and sorceries It

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 702.88a. Apply this rule text to the dispute: "Rebound appears on some instants and sorceries. It represents a static ability that functions while the spell is on the stack and may create a delayed triggered ability. “Rebound” means “If this spell was cast from your hand, instead of putting it into your graveyard as it resolves, exile it and, at the beginning of your next upkeep, you may cast this card from exile without paying its mana cost.”" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [702.88a]: Rebound appears on some instants and sorceries. It represents a static ability that functions while the spell is on the stack and may create a delayed triggered ability. “Rebound” means “If this spell was cast from your hand, instead of putting it into your graveyard as it resolves, exile it and, at the beginning of your next upkeep, you may cast this card from exile without paying its mana cost.” The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [702.88a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[702.88a]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

## Y53. Rule 702.153a anchor - Casualty is a keyword that represents two abilities

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a keyword actions and keyword abilities dispute governed by rule 702.153a. Apply this rule text to the dispute: "Casualty is a keyword that represents two abilities. The first is a static ability that functions while the spell with casualty is on the stack. The second is a triggered ability that functions while the spell with casualty is on the stack. Casualty N means “As an additional cost to cast this spell, you may sacrifice a creature with power N or greater,” and “When you cast this spell, if a casualty cost was paid for it, copy it. If the spell has any targets, you may choose new targets for the copy.” Paying a spel..." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [702.153a]: Casualty is a keyword that represents two abilities. The first is a static ability that functions while the spell with casualty is on the stack. The second is a triggered ability that functions while the spell with casualty is on the stack. Casualty N means “As an additional cost to cast this spell, you may sacrifice a creature with power N or greater,” and “When you cast this spell, if a casualty cost was paid for it, copy it. If the spell has any targets, you may choose new targets for the copy.” Paying a spell’s casualty cost follows the rules for paying additional costs in rules 601.2b and 601.2f–h. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [702.153a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[702.153a]`.

**Why this test matters:** Broad coverage anchor for Keyword Actions and Keyword Abilities. Source docs: L06_PlayerAction_701_v.md, L07_ObjectModel_700_v/t.md, L07_ObjectModel_702_v/t.md, L06_PlayerAction_705to706_v/t.md.

---

# CATEGORY Z - Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules

**Connected docs:**
- `L09_Constraint_731to732_v.md`
- `L10_Variant_724to730_v/t.md`
- `L10_Variant_800to811_v/t.md`
- `L10_Variant_900to905_v/t.md`
- `L10_Variant_903_v/t.md`

## Z1. Rule 801.7 anchor - A triggered ability doesn’t trigger unless its trigger

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 801.7. Apply this rule text to the dispute: "A triggered ability doesn’t trigger unless its trigger event happens entirely within the range of influence of its source’s controller." Example to consider: In a game in which all players have range of influence 1, Alex is seated to the left of Rob. Rob controls two Auras attached to Alex’s Runeclaw Bear: One with the trigger condition “Whenever enchanted creature becomes blocked,” and one with the trigger condition “Whenever enchanted creature becomes blocked by a creature.” Alex’s Runeclaw Bear attacks the... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [801.7]: A triggered ability doesn’t trigger unless its trigger event happens entirely within the range of influence of its source’s controller. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [801.7].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[801.7]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z2. Rule 725.2 anchor - There are two inherent triggered abilities associated with

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 725.2. Apply this rule text to the dispute: "There are two inherent triggered abilities associated with being the monarch. These triggered abilities have no source and are controlled by the player who was the monarch at the time the abilities triggered. This is an exception to rule 113.8. The full texts of these abilities are “At the beginning of the monarch’s end step, that player draws a card” and “Whenever a creature deals combat damage to the monarch, its controller becomes the monarch.”" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [725.2]: There are two inherent triggered abilities associated with being the monarch. These triggered abilities have no source and are controlled by the player who was the monarch at the time the abilities triggered. This is an exception to rule 113.8. The full texts of these abilities are “At the beginning of the monarch’s end step, that player draws a card” and “Whenever a creature deals combat damage to the monarch, its controller becomes the monarch.” The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [725.2].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[725.2]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z3. Rule 726.2 anchor - There are three inherent triggered abilities associated with

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 726.2. Apply this rule text to the dispute: "There are three inherent triggered abilities associated with having the initiative. These triggered abilities have no source and are controlled by the player who had the initiative at the time the abilities triggered. This is an exception to rule 113.8. The full text of these abilities are “At the beginning of the upkeep of the player who has the initiative, that player ventures into Undercity,” “Whenever one or more creatures a player controls deal combat damage to the player who has the initiative, the control..." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [726.2]: There are three inherent triggered abilities associated with having the initiative. These triggered abilities have no source and are controlled by the player who had the initiative at the time the abilities triggered. This is an exception to rule 113.8. The full text of these abilities are “At the beginning of the upkeep of the player who has the initiative, that player ventures into Undercity,” “Whenever one or more creatures a player controls deal combat damage to the player who has the initiative, the controller of those creatures takes the initiative,” and “Whenever a player takes the initiative, that player ventures into Undercity.” See rule 701.49, “Venture into the Dungeon.” The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [726.2].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[726.2]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z4. Rule 727.4 anchor - The effect that restarts the game finishes resolving

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 727.4. Apply this rule text to the dispute: "The effect that restarts the game finishes resolving just before the first turn’s untap step. If the spell or ability that generated that effect has additional instructions, those instructions are followed at this time. No player has priority, and any triggered abilities that trigger as a result will go on the stack the next time a player receives priority, usually during the first turn’s upkeep step." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [727.4]: The effect that restarts the game finishes resolving just before the first turn’s untap step. If the spell or ability that generated that effect has additional instructions, those instructions are followed at this time. No player has priority, and any triggered abilities that trigger as a result will go on the stack the next time a player receives priority, usually during the first turn’s upkeep step. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [727.4].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[727.4]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z5. Rule 728.1 anchor - Rad counters are a kind of counter a

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 728.1. Apply this rule text to the dispute: "Rad counters are a kind of counter a player can have (see rule 122, “Counters”). There is an inherent triggered ability associated with rad counters. This ability has no source and is controlled by the active player. This is an exception to rule 113.8. The full text of this ability is “At the beginning of each player’s precombat main phase, if that player has one or more rad counters, that player mills a number of cards equal to the number of rad counters they have. For each nonland card milled this way, that pl..." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [728.1]: Rad counters are a kind of counter a player can have (see rule 122, “Counters”). There is an inherent triggered ability associated with rad counters. This ability has no source and is controlled by the active player. This is an exception to rule 113.8. The full text of this ability is “At the beginning of each player’s precombat main phase, if that player has one or more rad counters, that player mills a number of cards equal to the number of rad counters they have. For each nonland card milled this way, that player loses 1 life and removes one rad counter from themselves.” The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [728.1].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[728.1]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z6. Rule 729.5 anchor - At the end of a subgame each player

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 729.5. Apply this rule text to the dispute: "At the end of a subgame, each player takes all traditional cards they own that are in the subgame other than those in the subgame command zone, puts them into their main-game library, then shuffles them. This includes cards in the subgame’s exile zone and cards that represent phased-out permanents as the subgame ends. Except as specified in rules 729.5a–c, all other objects in the subgame cease to exist, as do the zones created for the subgame. The main game continues from the point at which it was discontinued:..." Example to consider: If a card was brought into the subgame either from the main game or from outside the main game, that card will be put into its owner’s main-game library when the subgame ends. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [729.5]: At the end of a subgame, each player takes all traditional cards they own that are in the subgame other than those in the subgame command zone, puts them into their main-game library, then shuffles them. This includes cards in the subgame’s exile zone and cards that represent phased-out permanents as the subgame ends. Except as specified in rules 729.5a–c, all other objects in the subgame cease to exist, as do the zones created for the subgame. The main game continues from the point at which it was discontinued: First, the spell or ability that created the subgame finishes resolving, even if it was created by a spell card that’s no longer on the stack. Then, if any main-game abilities tri... The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [729.5].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[729.5]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z7. Rule 732.3 anchor - Sometimes a loop can be fragmented meaning that

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 732.3. Apply this rule text to the dispute: "Sometimes a loop can be fragmented, meaning that each player involved in the loop performs an independent action that results in the same game state being reached multiple times. If that happens, the active player (or, if the active player is not involved in the loop, the first player in turn order who is involved) must then make a different game choice so the loop does not continue." Example to consider: In a two-player game, the active player controls a creature with the ability “{0}: This creature gains flying,” the nonactive player controls a permanent with the ability “{0}: Target creature loses flying,” and nothing in the game cares how many times an ability has been activated. Say the active player activates his creature’s ability, it resolves, then... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [732.3]: Sometimes a loop can be fragmented, meaning that each player involved in the loop performs an independent action that results in the same game state being reached multiple times. If that happens, the active player (or, if the active player is not involved in the loop, the first player in turn order who is involved) must then make a different game choice so the loop does not continue. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [732.3].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[732.3]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z8. Rule 800.1 anchor - A multiplayer game is a game that begins

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 800.1. Apply this rule text to the dispute: "A multiplayer game is a game that begins with more than two players. This section contains additional optional rules that can be used for multiplayer play." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [800.1]: A multiplayer game is a game that begins with more than two players. This section contains additional optional rules that can be used for multiplayer play. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [800.1].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[800.1]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z9. Rule 801.8 anchor - An Aura can’t enchant an object or player

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 801.8. Apply this rule text to the dispute: "An Aura can’t enchant an object or player outside its controller’s range of influence. If an Aura is attached to an illegal object or player, the Aura is put into its owner’s graveyard as a state-based action. See rule 704." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [801.8]: An Aura can’t enchant an object or player outside its controller’s range of influence. If an Aura is attached to an illegal object or player, the Aura is put into its owner’s graveyard as a state-based action. See rule 704. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [801.8].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[801.8]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z10. Rule 801.9 anchor - An Equipment can’t equip an object outside its

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 801.9. Apply this rule text to the dispute: "An Equipment can’t equip an object outside its controller’s range of influence, and a Fortification can’t fortify an object outside its controller’s range of influence. If an Equipment or Fortification is attached to an illegal permanent, it becomes unattached from that permanent but remains on the battlefield. This is a state-based action. See rule 704." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [801.9]: An Equipment can’t equip an object outside its controller’s range of influence, and a Fortification can’t fortify an object outside its controller’s range of influence. If an Equipment or Fortification is attached to an illegal permanent, it becomes unattached from that permanent but remains on the battlefield. This is a state-based action. See rule 704. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [801.9].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[801.9]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z11. Rule 805.6 anchor - The Active Player Nonactive Player order rule see

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 805.6. Apply this rule text to the dispute: "The Active Player, Nonactive Player order rule (see rule 101.4) is modified if the shared team turns option is used. If multiple teams would make choices and/or take actions at the same time, first the active team makes any choices required, then each nonactive team in turn order makes any choices required. If multiple players would make choices and/or take actions at the same time, first each player on the active team makes any choices required in whatever order they like, then the players on each nonactive tea..." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [805.6]: The Active Player, Nonactive Player order rule (see rule 101.4) is modified if the shared team turns option is used. If multiple teams would make choices and/or take actions at the same time, first the active team makes any choices required, then each nonactive team in turn order makes any choices required. If multiple players would make choices and/or take actions at the same time, first each player on the active team makes any choices required in whatever order they like, then the players on each nonactive team in turn order do the same. Once all choices have been made, the actions happen simultaneously. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [805.6].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[805.6]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z12. Rule 900.1 anchor - This section contains additional optional rules that can

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 900.1. Apply this rule text to the dispute: "This section contains additional optional rules that can be used for certain casual game variants. It is by no means comprehensive." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [900.1]: This section contains additional optional rules that can be used for certain casual game variants. It is by no means comprehensive. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [900.1].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[900.1]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z13. Rule 901.6 anchor - The owner of a plane or phenomenon card

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 901.6. Apply this rule text to the dispute: "The owner of a plane or phenomenon card is the player who started the game with it in their planar deck. The controller of a face-up plane or phenomenon card is the player designated as the planar controller. Normally, the planar controller is whoever the active player is. However, if the current planar controller would leave the game, instead the next player in turn order that wouldn’t leave the game becomes the planar controller, then the old planar controller leaves the game. The new planar controller retains..." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [901.6]: The owner of a plane or phenomenon card is the player who started the game with it in their planar deck. The controller of a face-up plane or phenomenon card is the player designated as the planar controller. Normally, the planar controller is whoever the active player is. However, if the current planar controller would leave the game, instead the next player in turn order that wouldn’t leave the game becomes the planar controller, then the old planar controller leaves the game. The new planar controller retains that designation until they leave the game or a different player becomes the active player, whichever comes first. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [901.6].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[901.6]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z14. Rule 901.8 anchor - Planechase games have an inherent triggered ability known

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 901.8. Apply this rule text to the dispute: "Planechase games have an inherent triggered ability known as the “planeswalking ability.” The full text of this ability is “Whenever you roll the Planeswalker symbol on the planar die, planeswalk.” (See rule 701.31, “Planeswalk.”) This ability has no source and is controlled by the player whose planar die roll caused it to trigger. This is an exception to rule 113.8." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [901.8]: Planechase games have an inherent triggered ability known as the “planeswalking ability.” The full text of this ability is “Whenever you roll the Planeswalker symbol on the planar die, planeswalk.” (See rule 701.31, “Planeswalk.”) This ability has no source and is controlled by the player whose planar die roll caused it to trigger. This is an exception to rule 113.8. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [901.8].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[901.8]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z15. Rule 903.3 anchor - Each deck has a legendary card designated as

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 903.3. Apply this rule text to the dispute: "Each deck has a legendary card designated as its commander. That card must be either (a) a creature card, (b) a Vehicle card, or (c) a Spacecraft card with one or more power/toughness boxes. This designation is not a characteristic of the object represented by the card; rather, it is an attribute of the card itself. The card retains this designation even when it changes zones." Example to consider: A commander that’s been turned face down (due to Ixidron’s effect, for example) is still a commander. A commander that’s copying another card (due to Cytoshape’s effect, for example) is still a commander. A permanent that’s copying a commander (such as a Body Double, for example, copying a commander in a player’s graveyard) is not a commander. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [903.3]: Each deck has a legendary card designated as its commander. That card must be either (a) a creature card, (b) a Vehicle card, or (c) a Spacecraft card with one or more power/toughness boxes. This designation is not a characteristic of the object represented by the card; rather, it is an attribute of the card itself. The card retains this designation even when it changes zones. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [903.3].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[903.3]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z16. Rule 903.4 anchor - The Commander variant uses color identity to determine

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 903.4. Apply this rule text to the dispute: "The Commander variant uses color identity to determine what cards can be in a deck with a certain commander. The color identity of a card is the color or colors of any mana symbols in that card’s mana cost or rules text, plus any colors defined by its characteristic-defining abilities (see rule 604.3) or color indicator (see rule 204)." Example to consider: Bosh, Iron Golem is a legendary artifact creature with mana cost {8} and the ability “{3}{R}, Sacrifice an artifact: Bosh, Iron Golem deals damage equal to the sacrificed artifact’s mana value to any target.” Bosh’s color identity is red. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [903.4]: The Commander variant uses color identity to determine what cards can be in a deck with a certain commander. The color identity of a card is the color or colors of any mana symbols in that card’s mana cost or rules text, plus any colors defined by its characteristic-defining abilities (see rule 604.3) or color indicator (see rule 204). The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [903.4].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[903.4]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z17. Rule 903.8 anchor - A player may cast a commander they own

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 903.8. Apply this rule text to the dispute: "A player may cast a commander they own from the command zone. A commander cast from the command zone costs an additional {2} for each previous time the player casting it has cast it from the command zone that game. This additional cost is informally known as the “commander tax.”" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [903.8]: A player may cast a commander they own from the command zone. A commander cast from the command zone costs an additional {2} for each previous time the player casting it has cast it from the command zone that game. This additional cost is informally known as the “commander tax.” The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [903.8].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[903.8]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z18. Rule 724.1 anchor - Some cards end the turn When an effect

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 724.1. Apply this rule text to the dispute: "Some cards end the turn. When an effect ends the turn, follow these steps in order, as they differ from the normal process for resolving spells and abilities (see rule 608, “Resolving Spells and Abilities”)." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [724.1]: Some cards end the turn. When an effect ends the turn, follow these steps in order, as they differ from the normal process for resolving spells and abilities (see rule 608, “Resolving Spells and Abilities”). The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [724.1].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[724.1]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z19. Rule 725.1 anchor - The monarch is a designation a player can

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 725.1. Apply this rule text to the dispute: "The monarch is a designation a player can have. There is no monarch in a game until an effect instructs a player to become the monarch." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [725.1]: The monarch is a designation a player can have. There is no monarch in a game until an effect instructs a player to become the monarch. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [725.1].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[725.1]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z20. Rule 725.4 anchor - If the monarch leaves the game the active

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 725.4. Apply this rule text to the dispute: "If the monarch leaves the game, the active player becomes the monarch at the same time as that player leaves the game. If the active player is leaving the game or if there is no active player, the next player in turn order who can become the monarch becomes the monarch. If no player still in the game can become the monarch, the game continues with no monarch." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [725.4]: If the monarch leaves the game, the active player becomes the monarch at the same time as that player leaves the game. If the active player is leaving the game or if there is no active player, the next player in turn order who can become the monarch becomes the monarch. If no player still in the game can become the monarch, the game continues with no monarch. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [725.4].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[725.4]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z21. Rule 726.1 anchor - The initiative is a designation a player can

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 726.1. Apply this rule text to the dispute: "The initiative is a designation a player can have. There is no initiative in a game until an effect instructs a player to take the initiative. A player who currently has the initiative designation is said to have the initiative." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [726.1]: The initiative is a designation a player can have. There is no initiative in a game until an effect instructs a player to take the initiative. A player who currently has the initiative designation is said to have the initiative. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [726.1].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[726.1]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z22. Rule 726.4 anchor - If the player who has the initiative leaves

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 726.4. Apply this rule text to the dispute: "If the player who has the initiative leaves the game, the active player takes the initiative at the same time that player leaves the game. If the active player is leaving the game or if there is no active player, the next player in turn order takes the initiative." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [726.4]: If the player who has the initiative leaves the game, the active player takes the initiative at the same time that player leaves the game. If the active player is leaving the game or if there is no active player, the next player in turn order takes the initiative. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [726.4].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[726.4]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z23. Rule 726.5 anchor - If the player who currently has the initiative

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 726.5. Apply this rule text to the dispute: "If the player who currently has the initiative is instructed to take the initiative, this causes the last triggered ability in 726.2 to trigger but does not create a second initiative designation." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [726.5]: If the player who currently has the initiative is instructed to take the initiative, this causes the last triggered ability in 726.2 to trigger but does not create a second initiative designation. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [726.5].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[726.5]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z24. Rule 727.3 anchor - Because each player draws seven cards when the

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 727.3. Apply this rule text to the dispute: "Because each player draws seven cards when the new game begins, any player with fewer than seven cards in their library will lose the game when state-based actions are checked during the upkeep step of the first turn, regardless of any mulligans that player takes. (See rule 704, “State-Based Actions.”)" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [727.3]: Because each player draws seven cards when the new game begins, any player with fewer than seven cards in their library will lose the game when state-based actions are checked during the upkeep step of the first turn, regardless of any mulligans that player takes. (See rule 704, “State-Based Actions.”) The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [727.3].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[727.3]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z25. Rule 729.2 anchor - As the subgame starts an entirely new set

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 729.2. Apply this rule text to the dispute: "As the subgame starts, an entirely new set of game zones is created. Each player takes all the cards in their main-game library, moves them to their subgame library, and shuffles them. No other cards in a main-game zone are moved to their corresponding subgame zone, except as specified in rules 729.2a–c. Randomly determine which player goes first. The subgame proceeds like a normal game, following all other rules in rule 103, “Starting the Game.”" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [729.2]: As the subgame starts, an entirely new set of game zones is created. Each player takes all the cards in their main-game library, moves them to their subgame library, and shuffles them. No other cards in a main-game zone are moved to their corresponding subgame zone, except as specified in rules 729.2a–c. Randomly determine which player goes first. The subgame proceeds like a normal game, following all other rules in rule 103, “Starting the Game.” The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [729.2].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[729.2]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z26. Rule 729.3 anchor - Because each player draws seven cards when a

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 729.3. Apply this rule text to the dispute: "Because each player draws seven cards when a game begins, any player with fewer than seven cards in their deck will lose the subgame when state-based actions are checked during the upkeep step of the first turn, regardless of any mulligans that player takes. (See rule 704, “State-Based Actions.”)" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [729.3]: Because each player draws seven cards when a game begins, any player with fewer than seven cards in their deck will lose the subgame when state-based actions are checked during the upkeep step of the first turn, regardless of any mulligans that player takes. (See rule 704, “State-Based Actions.”) The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [729.3].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[729.3]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z27. Rule 730.2 anchor - To merge an object with a permanent place

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 730.2. Apply this rule text to the dispute: "To merge an object with a permanent, place that object on top of or under that permanent. That permanent becomes a merged permanent represented by the card or copy that represented that object in addition to any other components that were representing it." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [730.2]: To merge an object with a permanent, place that object on top of or under that permanent. That permanent becomes a merged permanent represented by the card or copy that represented that object in addition to any other components that were representing it. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [730.2].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[730.2]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z28. Rule 730.3 anchor - If a merged permanent leaves the battlefield one

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 730.3. Apply this rule text to the dispute: "If a merged permanent leaves the battlefield, one permanent leaves the battlefield and each of the individual components are put into the appropriate zone." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [730.3]: If a merged permanent leaves the battlefield, one permanent leaves the battlefield and each of the individual components are put into the appropriate zone. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [730.3].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[730.3]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z29. Rule 731.2 anchor - As the second part of the untap step

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 731.2. Apply this rule text to the dispute: "As the second part of the untap step, the game checks the previous turn to see if the game’s day/night designation should change. See rule 502, “Untap Step.”" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [731.2]: As the second part of the untap step, the game checks the previous turn to see if the game’s day/night designation should change. See rule 502, “Untap Step.” The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [731.2].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[731.2]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z30. Rule 732.4 anchor - If a loop contains only mandatory actions the

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 732.4. Apply this rule text to the dispute: "If a loop contains only mandatory actions, the game is a draw. (See rules 104.4b and 104.4f.)" What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [732.4]: If a loop contains only mandatory actions, the game is a draw. (See rules 104.4b and 104.4f.) The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [732.4].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[732.4]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z31. Rule 800.7 anchor - In a multiplayer game other than a Two-Headed

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 800.7. Apply this rule text to the dispute: "In a multiplayer game other than a Two-Headed Giant game, the starting player doesn’t skip the draw step of their first turn. In a Two-Headed Giant game, the team who plays first skips the draw step of their first turn. See rule 103.8." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [800.7]: In a multiplayer game other than a Two-Headed Giant game, the starting player doesn’t skip the draw step of their first turn. In a Two-Headed Giant game, the team who plays first skips the draw step of their first turn. See rule 103.8. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [800.7].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[800.7]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z32. Rule 801.10 anchor - Spells and abilities can’t affect objects or players

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 801.10. Apply this rule text to the dispute: "Spells and abilities can’t affect objects or players outside their controller’s range of influence. The parts of the effect that attempt to affect an out-of-range object or player will do nothing. The rest of the effect will work normally." Example to consider: In a six-player game in which each player has range of influence 1, Alex casts Pyroclasm, which reads, “Pyroclasm deals 2 damage to each creature.” Pyroclasm deals 2 damage to each creature controlled by Alex, the player to Alex’s left, and the player to Alex’s right. No other creatures are dealt damage. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [801.10]: Spells and abilities can’t affect objects or players outside their controller’s range of influence. The parts of the effect that attempt to affect an out-of-range object or player will do nothing. The rest of the effect will work normally. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [801.10].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[801.10]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z33. Rule 801.15 anchor - If the effect of a spell or ability

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 801.15. Apply this rule text to the dispute: "If the effect of a spell or ability states that the game is a draw, the game is a draw for that spell or ability’s controller and all players within that player’s range of influence. They leave the game. All remaining players continue to play the game." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [801.15]: If the effect of a spell or ability states that the game is a draw, the game is a draw for that spell or ability’s controller and all players within that player’s range of influence. They leave the game. All remaining players continue to play the game. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [801.15].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[801.15]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z34. Rule 801.16 anchor - If the game somehow enters a “loop” of

**Track:** Core.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 801.16. Apply this rule text to the dispute: "If the game somehow enters a “loop” of mandatory actions, repeating a sequence of events with no way to stop, the game is a draw for each player who controls an object that’s involved in that loop, as well as for each player within the range of influence of any of those players. They leave the game. All remaining players continue to play the game." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [801.16]: If the game somehow enters a “loop” of mandatory actions, repeating a sequence of events with no way to stop, the game is a draw for each player who controls an object that’s involved in that loop, as well as for each player within the range of influence of any of those players. They leave the game. All remaining players continue to play the game. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [801.16].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[801.16]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z35. Rule 800.4a anchor - When a player leaves the game all objects

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 800.4a. Apply this rule text to the dispute: "When a player leaves the game, all objects (see rule 109) owned by that player leave the game and any effects which give that player control of any objects or players end. Then, if that player controlled any objects on the stack not represented by cards, those objects cease to exist. Then, if there are any objects still controlled by that player, those objects are exiled. This is not a state-based action. It happens as soon as the player leaves the game. If the player who left the game had priority at the time t..." Example to consider: Alex casts Mind Control, an Aura that reads, “You control enchanted creature,” on Bianca’s Assault Griffin. If Alex leaves the game, so does Mind Control, and Assault Griffin reverts to Bianca’s control. If, instead, Bianca leaves the game, so does Assault Griffin, and Mind Control is put into Alex’s graveyard. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [800.4a]: When a player leaves the game, all objects (see rule 109) owned by that player leave the game and any effects which give that player control of any objects or players end. Then, if that player controlled any objects on the stack not represented by cards, those objects cease to exist. Then, if there are any objects still controlled by that player, those objects are exiled. This is not a state-based action. It happens as soon as the player leaves the game. If the player who left the game had priority at the time they left, priority passes to the next player in turn order who’s still in the game. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [800.4a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[800.4a]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z36. Rule 732.2a anchor - At any point in the game the player

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 732.2a. Apply this rule text to the dispute: "At any point in the game, the player with priority may suggest a shortcut by describing a sequence of game choices, for all players, that may be legally taken based on the current game state and the predictable results of the sequence of choices. This sequence may be a non-repetitive series of choices, a loop that repeats a specified number of times, multiple loops, or nested loops, and may even cross multiple turns. It can’t include conditional actions, where the outcome of a game event determines the next acti..." Example to consider: A player controls a creature enchanted by Presence of Gond, which grants the creature the ability “{T}: Create a 1/1 green Elf Warrior creature token,” and another player controls Intruder Alarm, which reads, in part, “Whenever a creature enters, untap all creatures.” When the player has priority, they may suggest “I’ll create a million tokens,” indicatin... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [732.2a]: At any point in the game, the player with priority may suggest a shortcut by describing a sequence of game choices, for all players, that may be legally taken based on the current game state and the predictable results of the sequence of choices. This sequence may be a non-repetitive series of choices, a loop that repeats a specified number of times, multiple loops, or nested loops, and may even cross multiple turns. It can’t include conditional actions, where the outcome of a game event determines the next action a player takes. The ending point of this sequence must be a place where a player has priority, though it need not be the player proposing the shortcut. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [732.2a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[732.2a]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z37. Rule 802.2a anchor - Any rule object or effect that refers to

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 802.2a. Apply this rule text to the dispute: "Any rule, object, or effect that refers to a “defending player” refers to one specific defending player, not to all of the defending players. If an ability of an attacking creature refers to a defending player, or a spell or ability refers to both an attacking creature and a defending player, then unless otherwise specified, the defending player it’s referring to is the player that creature is attacking, the controller of the planeswalker that creature is attacking, or the protector of the battle that player is..." Example to consider: Rob attacks Alex with Runeclaw Bear and attacks Carissa with a creature with mountainwalk. Whether the creature with mountainwalk can be blocked depends only on whether Carissa controls a Mountain. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [802.2a]: Any rule, object, or effect that refers to a “defending player” refers to one specific defending player, not to all of the defending players. If an ability of an attacking creature refers to a defending player, or a spell or ability refers to both an attacking creature and a defending player, then unless otherwise specified, the defending player it’s referring to is the player that creature is attacking, the controller of the planeswalker that creature is attacking, or the protector of the battle that player is attacking. If that creature is no longer attacking, the defending player it’s referring to is the player that creature was attacking before it was removed from combat, the controll... The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [802.2a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[802.2a]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z38. Rule 801.13b anchor - If a spell or ability creates an effect

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 801.13b. Apply this rule text to the dispute: "If a spell or ability creates an effect that prevents damage that would be dealt by a source, it can affect only sources within the spell or ability’s controller’s range of influence. If a spell or ability creates an effect that prevents damage that would be dealt to a permanent or player, it can affect only permanents and players within the spell or ability’s controller’s range of influence. If a spell or ability creates an effect that prevents damage, but neither the source nor the would-be recipient of the da..." Example to consider: Rob is within Alex’s range of influence, but Carissa is not. Alex controls an enchantment that says, “Prevent all damage that would be dealt by creatures.” Carissa attacks Rob with a creature. The creature deals combat damage to Rob. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [801.13b]: If a spell or ability creates an effect that prevents damage that would be dealt by a source, it can affect only sources within the spell or ability’s controller’s range of influence. If a spell or ability creates an effect that prevents damage that would be dealt to a permanent or player, it can affect only permanents and players within the spell or ability’s controller’s range of influence. If a spell or ability creates an effect that prevents damage, but neither the source nor the would-be recipient of the damage is specified, it prevents damage only if both the source and recipient of that damage are within the spell or ability’s controller’s range of influence. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [801.13b].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[801.13b]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z39. Rule 800.4d anchor - If an object that would be owned by

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 800.4d. Apply this rule text to the dispute: "If an object that would be owned by a player who has left the game would be created in any zone, it isn’t created. If a triggered ability that would be controlled by a player who has left the game would be put onto the stack, it isn’t put on the stack." Example to consider: Astral Slide is an enchantment that reads, “Whenever a player cycles a card, you may exile target creature. If you do, return that creature to the battlefield under its owner’s control at the beginning of the next end step.” During Alex’s turn, Bianca uses Astral Slide’s ability to exile Alex’s Hypnotic Specter. Before the end of that turn, Bianca leaves... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [800.4d]: If an object that would be owned by a player who has left the game would be created in any zone, it isn’t created. If a triggered ability that would be controlled by a player who has left the game would be put onto the stack, it isn’t put on the stack. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [800.4d].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[800.4d]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z40. Rule 732.2b anchor - Each other player in turn order starting after

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 732.2b. Apply this rule text to the dispute: "Each other player, in turn order starting after the player who suggested the shortcut, may either accept the proposed sequence, or shorten it by naming a place where they will make a game choice that’s different than what’s been proposed. (The player doesn’t need to specify at this time what the new choice will be.) This place becomes the new ending point of the proposed sequence." Example to consider: The active player draws a card during her draw step, then says, “Go.” The nonactive player is holding Into the Fray (an instant that says “Target creature attacks this turn if able”) and says, “I’d like to cast a spell during your beginning of combat step.” The current proposed shortcut is that all players pass priority at all opportunities during the tur... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [732.2b]: Each other player, in turn order starting after the player who suggested the shortcut, may either accept the proposed sequence, or shorten it by naming a place where they will make a game choice that’s different than what’s been proposed. (The player doesn’t need to specify at this time what the new choice will be.) This place becomes the new ending point of the proposed sequence. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [732.2b].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[732.2b]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z41. Rule 810.8a anchor - Players win and lose the game only as

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 810.8a. Apply this rule text to the dispute: "Players win and lose the game only as a team, not as individuals. If either player on a team loses the game, the team loses the game. If either player on a team wins the game, the entire team wins the game. If an effect says that a player can’t win the game, that player’s team can’t win the game. If an effect says that a player can’t lose the game, that player’s team can’t lose the game." Example to consider: In a Two-Headed Giant game, a player controls Transcendence, which reads, in part, “You don’t lose the game for having 0 or less life.” If that player’s team’s life total is 0 or less, that team doesn’t lose the game. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [810.8a]: Players win and lose the game only as a team, not as individuals. If either player on a team loses the game, the team loses the game. If either player on a team wins the game, the entire team wins the game. If an effect says that a player can’t win the game, that player’s team can’t win the game. If an effect says that a player can’t lose the game, that player’s team can’t lose the game. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [810.8a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[810.8a]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z42. Rule 810.9a anchor - If a cost or effect needs to know

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 810.9a. Apply this rule text to the dispute: "If a cost or effect needs to know the value of an individual player’s life total, that cost or effect uses the team’s life total instead." Example to consider: In a Two-Headed Giant game, a player on a team that has 17 life is targeted by Beacon of Immortality, which reads, in part, “Double target player’s life total.” That player gains 17 life, so the team winds up at 34 life. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [810.9a]: If a cost or effect needs to know the value of an individual player’s life total, that cost or effect uses the team’s life total instead. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [810.9a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[810.9a]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z43. Rule 801.7a anchor - If a trigger event includes an object moving

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 801.7a. Apply this rule text to the dispute: "If a trigger event includes an object moving out of or into a player’s range of influence, use the game state before or after the event as appropriate to determine whether the triggered ability will trigger. See rules 603.6 and 603.10." Example to consider: Carissa and Alex are outside each other’s range of influence. Carissa controls a Runeclaw Bear owned by Alex and they each control an Extractor Demon, a creature which reads, in part, “Whenever another creature leaves the battlefield, you may have target player mill two cards.” The Runeclaw Bear is destroyed and is put into Alex’s graveyard. The ability o... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [801.7a]: If a trigger event includes an object moving out of or into a player’s range of influence, use the game state before or after the event as appropriate to determine whether the triggered ability will trigger. See rules 603.6 and 603.10. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [801.7a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[801.7a]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z44. Rule 801.13a anchor - If a replacement effect tries to cause a

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 801.13a. Apply this rule text to the dispute: "If a replacement effect tries to cause a spell or ability to affect an object or player outside its controller’s range of influence, that portion of the event does nothing." Example to consider: Alex casts Lava Axe (“Lava Axe deals 5 damage to target player or planeswalker.”) targeting Rob. In response, Rob casts Captain’s Maneuver (“The next X damage that would be dealt to target creature, planeswalker, or player this turn is dealt to another target creature, planeswalker, or player instead.”) with X equal to 3, targeting Carissa. Carissa isn’t... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [801.13a]: If a replacement effect tries to cause a spell or ability to affect an object or player outside its controller’s range of influence, that portion of the event does nothing. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [801.13a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[801.13a]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z45. Rule 801.5b anchor - If a player is asked to choose between

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 801.5b. Apply this rule text to the dispute: "If a player is asked to choose between one or more options (and not between one or more objects or players), they can choose between those options even if those options refer to objects or players outside the player’s range of influence." Example to consider: Alex, who has a range of influence of 2, is seated to the left of Rob, and Carissa, who has a range of influence of 1, is seated to the right of Rob. Alex casts a spell that reads, “An opponent chooses one — You draw two cards; or each creature you control gets +2/+2 until end of turn,” and chooses Carissa to make that choice. Carissa can choose the mode... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [801.5b]: If a player is asked to choose between one or more options (and not between one or more objects or players), they can choose between those options even if those options refer to objects or players outside the player’s range of influence. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [801.5b].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[801.5b]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z46. Rule 805.10e anchor - Any rule object or effect that refers to

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 805.10e. Apply this rule text to the dispute: "Any rule, object, or effect that refers to a “defending player” refers to one specific defending player, not to all of the defending players. If an ability of an attacking creature refers to a defending player, or a spell or ability refers to both an attacking creature and a defending player, then unless otherwise specified, the defending player it’s referring to is the player that creature is attacking, the controller of the planeswalker that creature is attacking, or the protector of the battle that creature i..." What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [805.10e]: Any rule, object, or effect that refers to a “defending player” refers to one specific defending player, not to all of the defending players. If an ability of an attacking creature refers to a defending player, or a spell or ability refers to both an attacking creature and a defending player, then unless otherwise specified, the defending player it’s referring to is the player that creature is attacking, the controller of the planeswalker that creature is attacking, or the protector of the battle that creature is attacking. If that creature is no longer attacking, the defending player it’s referring to is the player that creature was attacking before it was removed from combat, the contro... The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [805.10e].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[805.10e]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z47. Rule 807.4j anchor - If an effect would cause a player to

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 807.4j. Apply this rule text to the dispute: "If an effect would cause a player to take an extra turn after the current turn, but that player wouldn’t have a turn marker at the start of that turn, that player will take the extra turn immediately before their next turn instead." Example to consider: During Alex’s turn, he casts Time Walk, which causes him to take an extra turn after this one. During the same turn, the player to Alex’s left leaves the game, which causes the number of turn markers to be reduced. After Alex’s current turn ends, his turn marker is removed. He won’t take the extra turn from Time Walk until just before his normal turn the... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [807.4j]: If an effect would cause a player to take an extra turn after the current turn, but that player wouldn’t have a turn marker at the start of that turn, that player will take the extra turn immediately before their next turn instead. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [807.4j].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[807.4j]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z48. Rule 903.5c anchor - A card can be included in a Commander

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 903.5c. Apply this rule text to the dispute: "A card can be included in a Commander deck only if every color in its color identity is also found in the color identity of the deck’s commander." Example to consider: Wort, the Raidmother is a legendary creature with mana cost {4}{R/G}{R/G}. Wort’s color identity is red and green. Each card in a Wort Commander deck must be only red, only green, both red and green, or have no color. Each mana symbol in the mana cost or rules text of a card in this deck must be only red, only green, both red and green, or have no color. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [903.5c]: A card can be included in a Commander deck only if every color in its color identity is also found in the color identity of the deck’s commander. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [903.5c].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[903.5c]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z49. Rule 903.5d anchor - A card with a basic land type may

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 903.5d. Apply this rule text to the dispute: "A card with a basic land type may be included in a Commander deck only if each color of mana it could produce is included in the commander’s color identity." Example to consider: Wort, the Raidmother’s color identity is red and green. A Wort Commander deck may include land cards with the basic land types Mountain and/or Forest. It can’t include any land cards with the basic land types Plains, Island, or Swamp. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [903.5d]: A card with a basic land type may be included in a Commander deck only if each color of mana it could produce is included in the commander’s color identity. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [903.5d].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[903.5d]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z50. Rule 801.5a anchor - If a player is asked to choose an

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 801.5a. Apply this rule text to the dispute: "If a player is asked to choose an object or player, they must choose one within their range of influence." Example to consider: In a game with a range of influence of 1, Alex is seated to the left of Rob. Alex activates the ability of Cuombajj Witches, which reads, “{T}: Cuombajj Witches deals 1 damage to any target and 1 damage to any target of an opponent’s choice,” targeting Rob and choosing Rob as the opponent who picks the other target. Rob must choose a target that’s in both... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [801.5a]: If a player is asked to choose an object or player, they must choose one within their range of influence. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [801.5a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[801.5a]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z51. Rule 810.9c anchor - If an effect sets a single player’s life

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 810.9c. Apply this rule text to the dispute: "If an effect sets a single player’s life total to a specific number, the player gains or loses the necessary amount of life to end up with the new total. The team’s life total is adjusted by the amount of life that player gained or lost." Example to consider: In a Two-Headed Giant game, a player on a team that has 25 life is targeted by an ability that reads, “Target player’s life total becomes 10.” That player’s life total is considered to be 25, so that player loses 15 life. The team winds up at 10 life. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [810.9c]: If an effect sets a single player’s life total to a specific number, the player gains or loses the necessary amount of life to end up with the new total. The team’s life total is adjusted by the amount of life that player gained or lost. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [810.9c].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[810.9c]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z52. Rule 810.9d anchor - If an effect would set the life total

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 810.9d. Apply this rule text to the dispute: "If an effect would set the life total of each player on a team to a number, that team chooses one of its members. On that team, only that player is affected." Example to consider: In a Two-Headed Giant game, one team has 7 life and the other team has 13 life. A player casts Repay in Kind, which reads, “Each player’s life total becomes the lowest life total among all players.” Each team chooses one of its members to be affected. The result is that the chosen player on the team that has 13 life loses 6 life, so that team’s life total... What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [810.9d]: If an effect would set the life total of each player on a team to a number, that team chooses one of its members. On that team, only that player is affected. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [810.9d].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[810.9d]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

## Z53. Rule 801.2a anchor - The most commonly chosen limited ranges of influence

**Track:** Edge.

**Scenario:**
> A Commander table asks Arbiter to adjudicate a commander, multiplayer, variants, shortcuts, loops, niche rules dispute governed by rule 801.2a. Apply this rule text to the dispute: "The most commonly chosen limited ranges of influence are 1 seat and 2 seats. Different players may have different ranges of influence." Example to consider: A range of influence of 1 means that only you and the players seated directly next to you are within your range of influence. What is the ruling and where does the engine route it?

**Expected verdict:** Apply rule [801.2a]: The most commonly chosen limited ranges of influence are 1 seat and 2 seats. Different players may have different ranges of influence. The ruling must follow that rule exactly before moving to any later checkpoint.

**Required reasoning:**
- Identify the governing rule as [801.2a].
- Route the question through the relevant engine layer before giving priority or a final ruling.
- If the rule creates a timing, replacement, trigger, SBA, layer, zone, or Commander interaction, name that interaction explicitly.

**Required citations:** `[801.2a]`.

**Why this test matters:** Broad coverage anchor for Commander, Multiplayer, Variants, Shortcuts, Loops, Niche Rules. Source docs: L09_Constraint_731to732_v.md, L10_Variant_724to730_v/t.md, L10_Variant_800to811_v/t.md, L10_Variant_900to905_v/t.md, L10_Variant_903_v/t.md.

---

# SUITE SUMMARY

Generated expansion cases: 424.
Combined with the 76 core cases, the Arbiter suite has 500 total cases.

