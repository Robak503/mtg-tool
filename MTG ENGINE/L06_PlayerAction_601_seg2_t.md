# Magic: The Gathering — Casting Legality and Activating Abilities
## LAYER 6: PLAYER ACTION LAYER — Expansion (Rules 601.3–601.7, 602)
## Effective February 27, 2026

---

SOURCES: L06_PlayerAction_601_seg1_t.md, L06_PlayerAction_601_seg2_v.md, L07_ObjectModel_300to315_t.md, L09_Constraint_731to732_v.md, L09_Constraint_t.md
FEEDS INTO: L04_Trigger_engine.md (activation triggers), L06_PlayerAction_117_t.md, L00_Orchestration_game_engine.md

---

# 1. CASTING LEGALITY (601.3)

## 1.1 The Basic Rule

A player can only begin to cast a spell if a rule or effect **allows** it and no rule or effect **prohibits** it (601.3). Both conditions must be satisfied.

Default rules allow casting: a player with priority may cast any spell from their hand at an appropriate time (instant any time, sorcery-speed only during their main phase with empty stack). Effects can expand or restrict this.

## 1.2 Considering Future Choices to Beat Prohibitions (601.3a)

If an effect prohibits casting a spell "with certain qualities," a player may consider what choices made during the proposal phase could change those qualities. If any legal choice would remove the prohibition, the player may begin casting even though the prohibition would currently apply.

**Example:** "Can't cast spells with even mana values" — the player may begin casting a spell whose X value (announced in 601.2b) could be set to make the mana value odd. They don't have to prove the final spell will satisfy the rule; they only need a legal path that could satisfy it.

## 1.3 Considering Future Choices to Access Flash Permissions (601.3b–d)

Similarly, if an effect grants flash "to spells with certain qualities," a player may consider what proposal choices would cause that effect to apply. If any path exists, they may cast as though the spell had flash.

**601.3c:** If flash is conditional on paying an alternative/additional cost, the player may begin casting as though the spell had flash.

**601.3d:** If a spell would have flash only if certain conditions are met (e.g., "this spell has flash if you control a Forest"), the player may cast it with flash if those conditions are currently met. And per 601.5a, once casting begins under those conditions, the player may continue even if the conditions stop being met mid-cast.

## 1.4 Alternative Characteristics for Legality (601.3e)

Some effects let a player cast spells from unconventional zones (top of library, face-down exile). When checking if such a spell is legal to cast, the game may use an alternative set of characteristics — for example, a morphed creature is evaluated as a 2/2 colorless creature for legality purposes.

## 1.5 Face-Down Exile Requirement (601.3f)

To cast a face-down exiled card, the player must have permission to look at it. Without look-permission, the spell cannot legally begin.

---

# 2. THE PROPOSAL-LEGALITY INTERACTION (601.4, 601.5)

## 2.1 Mode-Before-Cost Lookahead (601.4)

When announcing modes and costs in 601.2b, a player may consider choices that would normally be made later in the process. If a later choice would make an earlier choice available, the player may make both choices simultaneously.

**Classic example:** A modal spell with kicker that reads "Choose one; if kicked, choose any number instead." The player may announce kicker and multiple modes simultaneously, even though kicker payment is formally part of 601.2f, because the choice to kick unlocks the additional modes available in 601.2b.

## 2.2 Proposal Completion vs. Cost-Payment Legality (601.5)

Legality is evaluated after the proposal (601.2a–d) is complete. If a spell is then found illegal, the game rewinds. **But:**

If a spell becomes illegal only during cost determination/payment (601.2f–h) — for example, a targeting restriction appears after targets were legally chosen — the casting is still illegal, but the rewind point is still before the proposal, not mid-costs.

Once the spell is cast (601.2i), subsequent illegality is irrelevant.

## 2.3 Flash-Condition Persistence (601.5a)

If the player began casting under a flash permission that depended on conditions, those conditions may cease to be met mid-cast. The player may still complete the casting. The permission locks in at the moment casting begins.

---

# 3. OPPONENT CHOICES DURING CASTING (601.6)

Some spells instruct an opponent to make choices that the caster would normally make. The opponent does so at the point in the 601.2 sequence where the caster would have made that choice.

If multiple opponents could make the choice, the caster decides which opponent acts (601.6a).

If the spell has both caster and opponent acting simultaneously, the caster acts first, then the opponent (601.6b) — this is an explicit exception to APNAP (rule 101.4), which would normally have the active player act first.

---

# 4. COST-ALTERATION ISOLATION (601.7)

Casting a spell that itself alters costs has no retroactive effect on existing stack objects. If you cast a spell that says "Spells cost {1} less," that reduction doesn't apply to spells already on the stack — only to spells cast after this one resolves.

---

# 5. ACTIVATING ACTIVATED ABILITIES (602)

## 5.1 What an Activated Ability Is (602.1)

The format is: `[Cost]: [Effect.] [Activation instructions.]`

Everything before the colon is the activation cost. Everything after until the period is the effect. Any instructions at the end (timing restrictions, who can activate, etc.) are activation instructions — they function at all times and are not part of the effect.

**Only activated abilities can be activated.** If something says "activate an ability" without specifying type, it means an activated ability (602.1c).

## 5.2 The Activation Process (602.2, 602.2a–b)

Activation starts with announcing the ability. The ability immediately becomes a stack object with:
- The text of the ability (and only that — no name, no color, no mana cost)
- The controller: the player who activated it
- Position: top of stack

The remainder of the process (602.2b) follows rules 601.2b–i identically, substituting "activation cost" wherever "mana cost" is referenced. This means:
- Modes and X values announced (601.2b)
- Targets chosen (601.2c)
- Division announced (601.2d)
- Legality checked (601.2e)
- Total cost determined and locked (601.2f)
- Mana activated (601.2g)
- Costs paid (601.2h)
- Ability becomes activated, triggers fire (601.2i analog)

If activation is revealed from a hidden zone, the card is revealed first (602.2a).

## 5.3 Who Can Activate (602.2)

Only the object's controller (or its owner if it has no controller) may activate an activated ability, unless the object specifically says otherwise. This is a default that effects may override.

## 5.4 Activation Prohibitions (602.5)

### Summoning Sickness (602.5a)

A creature's {T} or {Q} activated ability cannot be activated unless the creature has been under its controller's control continuously since the start of their most recent turn. Haste overrides this restriction.

**Critical precision:** This applies only to activated abilities that use {T} or {Q} in the *cost*. It does not apply to activated abilities that merely involve tapping in other ways, and it does not apply to the attack declaration (which has its own summoning sickness rules).

### Restriction Persistence on Controller Change (602.5b)

If an ability has a "Activate only once each turn" (or similar) restriction, that restriction follows the object even if control changes. The restriction tracks the object, not the player.

### Acquired-Ability Restrictions Scoped to Source (602.5c)

If a permanent acquires an ability from another object (e.g., via a copy effect or an effect that grants abilities), and that ability has a restriction, the restriction applies only to the ability as acquired from that source. It doesn't infect other copies of the same ability from different sources.

### Sorcery-Speed and Instant-Speed Activation (602.5d–e)

"Activate only as a sorcery" — the player must follow sorcery timing (main phase, stack empty, own turn). The ability is not actually a sorcery and doesn't interact with sorcery-specific effects.

"Activate only as an instant" — the player must follow instant timing. Again, not actually an instant.

## 5.5 Cost-Alteration Isolation (602.4)

Same as 601.7: activating a cost-altering ability has no retroactive effect on existing stack objects.

---

# 6. CASTING vs. ACTIVATION — KEY DIFFERENCES

| Property | Casting a Spell | Activating an Ability |
|---|---|---|
| Object type | Spell (has card) | Ability (no card) |
| Characteristics | All characteristics of card | Text only |
| Can be countered by | Counterspell, Negate, etc. | Stifle, etc. (abilities only) |
| "When cast" triggers | Yes | No |
| "When activated" triggers | No | Yes |
| Controller | Player who cast | Player who activated |
| Reference rule | 601.2a–i | 601.2b–i (via 602.2b) |

---

# 7. CROSS-LAYER CONNECTIONS

**→ Layer 4 (Trigger):** Cast triggers (601.2i) and activation triggers go through the standard 603 / 117.5 insertion process. When-targeted triggers (601.2c) enter the waiting state during casting and are placed on the stack at 601.2i, same insertion pass.

**→ Layer 6 (Priority, 117):** After casting or activating, if the acting player had priority before the action, they retain priority. Other players then get the option to respond after the acting player passes.

**→ Layer 6 (Resolution, 608):** After a spell or ability resolves, the rules in 608 govern what happens. The casting/activation procedure ends at 601.2i — everything after is resolution (608).

**→ Layer 7 (Object Model, 113.3b–c):** The distinction between activated and triggered abilities is established in 113.3b–c. Rule 602 covers the activation side; rule 603 covers triggers.

---

FEEDS INTO: L04_Trigger_engine.md (cast triggers, when-activated triggers), L06_PlayerAction_117_t.md (priority after casting/activation), L06_PlayerAction_608_t.md (resolution follows casting), L00_Orchestration_game_engine.md
