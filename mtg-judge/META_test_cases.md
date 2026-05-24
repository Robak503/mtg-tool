# Arbiter Engine — Regression Test Cases
## Commander-focused scenarios with expected verdicts for engine validation
## Use these to verify the Arbiter is reasoning correctly before relying on it for harder questions

---

# HOW TO USE THIS FILE

Each test case below is a self-contained scenario. To run a test:

1. Open the app, switch to the Arbiter agent.
2. Paste the **Scenario** text exactly as written.
3. Compare the Arbiter's response against the **Expected verdict** and **Required rule citations**.
4. If the engine misses a required citation OR delivers a wrong verdict, that's a failure — log it and the engine prompt likely needs revision.

Tests are grouped by category. Run them in order — the easier ones validate the engine's basic structure before harder ones probe edge cases.

The **Why this test matters** field on each one explains what specifically the engine should get right that a naive LLM (or pre-engine Nissa) would likely get wrong. That's the failure mode this test is designed to catch.

---

# CATEGORY A — Replacement Effects and "Dies" Triggers

## A1. Leyline of the Void + creature death + Blood Artist

**Scenario:**
> I control [[Leyline of the Void]]. An opponent's [[Grim Lavamancer]] is dealt lethal damage in combat. Does [[Blood Artist]] trigger?

**Expected verdict:** No. Blood Artist does not trigger.

**Required reasoning:**
- The would-event is "Grim Lavamancer goes from battlefield to graveyard."
- Leyline of the Void's replacement effect substitutes "to exile" for "to graveyard" [614.6].
- The final event is that Grim Lavamancer is exiled, not put into a graveyard.
- "Dies" means going from battlefield to graveyard [700.4]. Exiled is not "died."
- Blood Artist's trigger condition is not met — the engine sees only the final event [Axiom 4].

**Required citations:** `[614.6]`, `[700.4]`, `Axiom 4`.

**Why this test matters:** Engine vs. memory divergence case. An LLM with strong intuition gets this right by feel ("Leyline exiles, doesn't die, no trigger"). But the *reason* matters — the engine must show that trigger detection runs against the **final** event, not the would-event. If the Arbiter explains it as "exile replaces graveyard, so no death" without invoking Axiom 4, the reasoning is correct but the engine structure isn't being demonstrated.

---

## A2. Anafenza + Rest in Peace + Living Death (three-way replacement)

**Scenario:**
> Three players are in the game. Player A controls [[Anafenza, the Foremost]]. Player B controls [[Rest in Peace]]. Player C casts [[Living Death]]. Player A's graveyard contains [[Phyrexian Arena]] and three creature cards. When Living Death resolves, what happens?

**Expected verdict:**
- Rest in Peace exiles all graveyards as part of its static replacement *before* Living Death attempts to resolve — but only for cards as they would enter graveyards going forward, not retroactively. Wait — Rest in Peace's continuous effect ("If a card or token would be put into a graveyard from anywhere, exile it instead") applies to events occurring while it's in play. Cards already in graveyards when Rest in Peace entered the battlefield were exiled at that ETB time per the replacement loop.
- Therefore, when Living Death resolves, all graveyards are empty — no creatures to return, no creatures sacrificed (since no players have creatures on the battlefield except Anafenza and what was already there). Living Death resolves but does nothing.

**Required reasoning:**
- Identify each replacement effect that could apply: Rest in Peace [614.6c], Anafenza's static for opponents' nontoken creatures [614.6].
- Identify the affected player for each event — under 616.1a, the affected player chooses the order of multiple replacements applying to the same event.
- Walk through Living Death's resolution step by step (sacrifice all creatures, then return all creature cards from graveyards).

**Required citations:** `[614.6]`, `[616.1a]`, `[608.2]` (resolution sequence).

**Why this test matters:** Three-way replacement is exactly where pre-engine reasoning fails. The Arbiter must apply 616.1a (controller of affected object/player chooses order) for each individual event during Living Death's resolution. If it gives a blanket answer without acknowledging that the *order* matters and is chosen by the affected player, it's collapsing the formal procedure.

---

## A3. Commander dying with shield counter and Command Zone replacement

**Scenario:**
> I control my commander [[Atraxa, Praetors' Voice]]. It has one shield counter on it (from [[Shielded by Faith]] or similar). An opponent casts [[Murder]] targeting Atraxa. Atraxa would be destroyed. What happens?

**Expected verdict:** The shield counter is removed; Atraxa is not destroyed; Atraxa remains on the battlefield with no shield counters. The Command Zone replacement (903.9a) never triggers because Atraxa never went to a graveyard.

**Required reasoning:**
- Murder's effect: "Destroy target creature." Destruction is a would-event that puts the creature into the graveyard [701.7].
- Shield counter replacement [122.1g]: "If a permanent with a shield counter would be destroyed, instead remove a shield counter from it and it isn't destroyed."
- Since shield counter is a self-replacing effect on the permanent, it applies. Atraxa is not destroyed.
- The Command Zone replacement [903.9a] only triggers when a commander *would be put into a graveyard, exile, hand, or library* from anywhere. Since destruction was prevented, no zone-change would-event reaches the replacement stack.

**Required citations:** `[122.1g]`, `[701.7]`, `[903.9a]`.

**Why this test matters:** Commander zone replacement is one of the most-confused rules. The shield counter resolves the destruction before the zone change is ever attempted — Command Zone never comes up. If the Arbiter walks through the Command Zone replacement at all, it's wrong.

---

# CATEGORY B — Triggered Abilities and Timing

## B1. Eminence ability triggering from the Command Zone

**Scenario:**
> I have [[Edgar Markov]] in the Command Zone (not cast yet). Eminence says "Whenever you cast another Vampire spell, create a 1/1 black Vampire creature token." I cast [[Bloodghast]]. Does Eminence trigger?

**Expected verdict:** No. Bloodghast is not a Vampire (it's a Vampire Spirit — wait, actually it is a Vampire). Let me reconsider. Bloodghast IS a Vampire Spirit. So Eminence does trigger because Bloodghast is a Vampire spell.

Corrected verdict: **Yes**, Eminence triggers. A 1/1 black Vampire creature token is created when Bloodghast resolves (Eminence is a triggered ability that fires when the spell is cast, and resolves through normal stack procedure).

**Required reasoning:**
- Eminence is defined as functioning while the commander is in the command zone or on the battlefield [702.106a].
- Triggered abilities trigger from the zone they currently inhabit — for Eminence, that includes the command zone [603.6 / 702.106].
- Bloodghast's type line includes "Vampire Spirit" — it is a Vampire.
- The trigger fires when the spell is cast. The 1/1 token ETBs after the trigger resolves on the stack.

**Required citations:** `[603.6]`, `[702.106]`.

**Why this test matters:** Commander-specific zone-of-origin tracking for triggers. Pre-engine reasoning sometimes misses that some abilities function in the command zone. The Arbiter must explicitly check the ability's zone permissions (702.106 for Eminence).

---

## B2. Reflexive trigger during resolution

**Scenario:**
> I activate [[Bow of Nylea]]'s second ability: "Put up to four target creature cards from your graveyard on the bottom of your library." It targets three creature cards. The ability is resolving. While it's resolving, does anything trigger?

**Expected verdict:** No reflexive trigger here (Bow of Nylea doesn't have one). For a true reflexive-trigger test, see the next case. But the test for B2 is whether the engine correctly identifies that resolution proceeds without a priority window — players cannot respond mid-resolution.

**Required reasoning:**
- During resolution, no player has priority [608.2].
- The three target cards are moved to the bottom of the library simultaneously, in any order the controller chooses.
- After the ability finishes resolving, the active player gets priority [117.3b].

**Required citations:** `[608.2]`, `[117.3b]`.

**Why this test matters:** The "no priority during resolution" rule is foundational and tested often. The Arbiter must explicitly state that no responses are possible until resolution completes.

### B2.1. Actual reflexive trigger

**Scenario:**
> I cast [[Lukka, Coppercoat Outcast]] and use his -2 ability: exile a creature I control, then reveal cards from the top of my library until I reveal a creature card with greater mana value, put that creature onto the battlefield, then shuffle. The exiled creature was a 1/1 [[Llanowar Elves]]. Does the reflexive "reveal until" trigger immediately during resolution?

**Expected verdict:** Yes. The "reveal cards until..." part is part of the resolution of Lukka's ability — it executes immediately and to completion. There is no priority window between exiling the creature and beginning the reveals. If a reflexive trigger were involved (e.g., "When you do, you may..."), it would trigger during resolution and be immediately checked [603.12].

**Required reasoning:**
- The instruction "then reveal cards" is part of Lukka's ability text, executed during 608.2 resolution.
- No priority window between sub-instructions [608.2, Axiom 5 separation].
- If reflexive trigger existed, it would create a delayed trigger checked during resolution [603.12].

**Required citations:** `[608.2]`, `[603.12]`.

**Why this test matters:** Reflexive triggers (the "When you do" pattern) are a 2020+ design addition with non-obvious timing — they trigger and resolve during the parent ability's resolution rather than waiting for the next priority pass. The Arbiter must distinguish reflexive (immediate) from delayed (next-checkpoint) triggers.

---

## B3. State trigger that's already on the stack

**Scenario:**
> [[Phage the Untouchable]] is in my graveyard. State-based actions are about to be checked. Will Phage's "if not cast from your hand, that player loses the game" trigger fire?

**Expected verdict:** This isn't a state trigger — it's a triggered ability that fires when Phage *enters the battlefield* not from being cast from your hand. So if Phage was put onto the battlefield by Reanimate, it triggers; if it's just sitting in the graveyard, no trigger.

For an actual state-trigger test, consider:

> [[Brago, King Eternal]]'s "if it has six or more counters on it" type effects. Or: A 0/0 creature is on the battlefield with no counters. SBA destroys it. Then I cast a spell that gives it +0/+1 with a static ability. Does anything re-fire?

For a state trigger like the planeswalker chapter trigger pattern: once a state trigger has been put on the stack, it does NOT trigger again from the same state until it leaves the stack and the state is no longer true (603.8).

**Expected verdict (state trigger version):** A state trigger that has already triggered and is on the stack does NOT re-trigger from the same continuous state. After it leaves the stack (resolves or is countered), if the state is still true, it triggers again.

**Required citations:** `[603.8]`.

**Why this test matters:** State trigger no-re-trigger-while-on-stack is a subtle rule. The Arbiter must distinguish state triggers (which check continuously) from event triggers (which fire once per event). State trigger handling is documented in L04_Trigger_603_seg3_t.md.

---

# CATEGORY C — Commander Format Specifics

## C1. Commander damage with a copy of a commander

**Scenario:**
> I control my commander [[Krenko, Mob Boss]]. I cast [[Mirror Image]] copying Krenko. The copy attacks an opponent and deals 6 combat damage. The original Krenko also attacked and dealt 6 damage. Does the opponent have 12 commander damage from Krenko?

**Expected verdict:** No. The opponent has 6 commander damage. Only the original Krenko is a commander. The Mirror Image copy is a permanent that has Krenko's copiable values, but it is not a commander — commander status is not a copiable value [707, 903.4].

**Required reasoning:**
- Commander designation is a property of the *card*, not of its copyable characteristics [903.4].
- Mirror Image becomes a copy of Krenko but is itself a separate object [707.2].
- Commander damage tracking [903.10] applies to combat damage from a commander. Only the original is a commander; the copy is not.

**Required citations:** `[707.2]`, `[903.4]`, `[903.10]`.

**Why this test matters:** Commander damage tracking with copies is a known confusion point. The Arbiter must not conflate "copy of a commander" with "commander."

---

## C2. Commander tax with alternative cost

**Scenario:**
> My commander [[Animar, Soul of Elements]] has died and returned to the command zone twice. I want to cast it for its evoke cost — wait, Animar doesn't have evoke. Use a generic example: my commander has been cast twice from the command zone already. I want to cast it again, but I have a [[Fist of Suns]] in play (allowing me to pay {WUBRG} as the alternative cost). Do I still pay the commander tax?

**Expected verdict:** Yes, the tax still applies. Commander tax is an additional cost that applies regardless of whether you're using the base mana cost or an alternative cost [903.7, 601.2f].

**Required reasoning:**
- Commander tax (903.7): each previous cast from the command zone adds {2} to the total cost.
- "Total cost" is the calculation in 601.2f, which combines: base cost (or alternative), cost increases, cost reductions.
- Fist of Suns provides an alternative cost ("you may pay WUBRG rather than this spell's mana cost").
- The tax is a cost increase applied to whatever base cost was chosen.
- So: {WUBRG} (alternative base) + {4} (two previous casts) = {WUBRG} + {4} = total cost.

**Required citations:** `[601.2f]`, `[903.7]`.

**Why this test matters:** Commander tax interaction with alternative costs is asked often. The Arbiter must walk through 601.2f's order: choose base cost → apply additional costs (tax) → apply reductions.

---

## C3. Partner commanders with different color identities

**Scenario:**
> I'm playing with partner commanders [[Tymna the Weaver]] and [[Thrasios, Triton Hero]]. Tymna is WB, Thrasios is GU. My deck includes [[Cyclonic Rift]]. Legal?

**Expected verdict:** Yes. With partner, the deck's color identity is the union of both commanders' identities: W ∪ B ∪ G ∪ U = WUBG. Cyclonic Rift (blue) is legal in a WUBG deck.

**Required reasoning:**
- Partner allows two commanders [702.124].
- Color identity for deck construction is the union of all commanders' color identities [903.4d].
- Cyclonic Rift's color identity is blue.
- Blue is in WUBG. Card is legal.

**Required citations:** `[702.124]`, `[903.4d]`.

**Why this test matters:** Color identity union with partner is a deck-construction rule that needs to be correct. The Arbiter should also note that commander damage is tracked separately for each partner (a player can be killed by 21 from either, not 21 combined).

---

## C4. Mutate onto a commander

**Scenario:**
> My commander is [[Brokkos, Apex of Forever]]. I cast another mutate creature, [[Auspicious Starrix]], and mutate it onto Brokkos with Auspicious Starrix going on top. The merged permanent is then destroyed. Where do the cards go?

**Expected verdict:**
- Brokkos, as a commander, has the choice (per 903.9a) to be sent to the command zone instead of the graveyard.
- Auspicious Starrix has no such option — it goes to the graveyard.
- If the player chooses to send Brokkos to the command zone, only Brokkos moves to the command zone; Starrix goes to the graveyard.
- Merged permanents separate when leaving the battlefield [729.6].

**Required reasoning:**
- Merged permanents are a single permanent on the battlefield but separate cards upon zone change [729.6].
- Commander replacement effect [903.9a] applies to the commander card individually as it would change zones.
- The player chooses whether to apply 903.9a for the commander.

**Required citations:** `[729.6]`, `[903.9a]`.

**Why this test matters:** Merged permanent + Commander zone replacement is a recent and underexplored interaction. The Arbiter must correctly apply the merge-separation rule and the per-card commander replacement.

---

# CATEGORY D — Cost Payment and Casting

## D1. Sacrifice-as-cost with cost reducer

**Scenario:**
> I control [[Heartless Summoning]] (creatures cost {2} less to cast, enter with -1/-1). I want to cast [[Massacre Wurm]] (6-cost) by sacrificing [[Diligent Excavator]] using [[High Market]]'s ability — wait, that's not relevant. Better example: I want to cast [[Eldritch Evolution]] (cost {2}{G}) by sacrificing a creature. Does Heartless Summoning reduce the cost?

**Expected verdict:** No. Heartless Summoning reduces the cost of *creature spells*. Eldritch Evolution is a sorcery, not a creature. No reduction.

For a true sacrifice-as-cost-with-reducer test:

> I want to cast [[Massacre Wurm]] under Heartless Summoning. Does Heartless Summoning reduce the cost? Yes — Massacre Wurm is a creature spell. Cost becomes {2}{B}{B} instead of {2}{2}{B}{B} — wait, original cost is {4}{B}{B}, so reduced to {2}{B}{B}.

**Required reasoning:**
- Cost lock-in [601.2f]: total cost is determined by base cost + additional costs + reductions, in that order.
- Cost reduction effects modify "total cost" but cannot reduce mana cost below the colored requirements.
- Heartless Summoning's {2} reduction is generic mana, so it reduces only generic portion of the cost.

**Required citations:** `[601.2f]`.

**Why this test matters:** Cost lock-in is one of the most-asked questions and one of the most rule-precise. The Arbiter should walk through 601.2f order explicitly: choose costs, then apply cost increases (additional costs), then apply cost reductions, then check that total cost can be paid.

---

# CATEGORY E — Continuous Effects and Layer System

## E1. Layer interaction — characteristic-defining ability and Humility

**Scenario:**
> [[Humility]] is on the battlefield: "All creatures lose all abilities and have base power and toughness 1/1." I control [[Tarmogoyf]] (a creature whose power/toughness are defined by the card types in all graveyards). What is Tarmogoyf's power and toughness?

**Expected verdict:** Tarmogoyf is 1/1.

**Required reasoning:**
- Humility's ability-removal effect applies in layer 6 (ability adding/removing) [613.1f].
- Tarmogoyf's characteristic-defining ability (CDA) applies in layer 7b (P/T defining) [613.3].
- But because layer 6 removed Tarmogoyf's CDA before layer 7b would apply it, Tarmogoyf has no P/T-defining ability in layer 7b.
- Humility's "have base power and toughness 1/1" applies in layer 7b — sets P/T to 1/1.
- Result: Tarmogoyf is 1/1.

**Required citations:** `[613.1f]`, `[613.3]`, `[604.3]` (CDAs and layer system).

**Why this test matters:** Layer system + characteristic-defining abilities is the deepest part of MTG rules. The Arbiter must correctly identify that Humility's ability-removal acts BEFORE Tarmogoyf's CDA would set its P/T, so the CDA never applies. If the Arbiter gives Tarmogoyf's P/T as anything other than 1/1, it's not applying layers correctly.

---

## E2. Timestamp interaction

**Scenario:**
> [[Crusade]] is on the battlefield (controlled by Player A, timestamp T1): "White creatures get +1/+1." Player B casts [[Glorious Anthem]] (timestamp T2): "Creatures you control get +1/+1." Player A controls a white 2/2 creature. What is its P/T?

**Expected verdict:** The white 2/2 controlled by Player A is 3/3. (Crusade buffs Player A's creature, but Glorious Anthem does not — it only buffs Player B's creatures.)

**Required reasoning:**
- Crusade applies in layer 7c (power/toughness modifications that don't set, don't change CDA, are not counters).
- Glorious Anthem also applies in layer 7c but only to creatures Player B controls.
- The 2/2 is controlled by Player A, so only Crusade applies. Result: 3/3.

**Required citations:** `[613.3c]`.

**Why this test matters:** Layer 7c with multiple buff effects from different controllers tests whether the engine correctly identifies which effects apply to which creature based on the effect's own qualifiers.

---

# CATEGORY F — Multiplayer-Specific Edge Cases

## F1. Daybound/Nightbound in 4-player Commander

**Scenario:**
> It is currently day. The most recent player (Player A) cast 0 spells last turn. Player B cast 2 spells last turn. Player C cast 1 spell last turn. Player D (the active player) is about to begin their turn. Does it become night?

**Expected verdict:** No. Day/Night transitions check the *previous player's* turn, not the current player's incoming turn. The check happens at the start of the active player's precombat main phase. Day becomes night if the previous player cast no spells during their turn.

In a 4-player game, "previous player" means the player whose turn just ended — Player C, who cast 1 spell. So day does NOT transition to night [730.3].

**Required reasoning:**
- Day/Night check [730.3]: at the start of the active player's precombat main phase, the game checks the previous player's spell count.
- "Previous player" is the player whose turn was the immediately prior turn — Player C (cast 1 spell).
- Day → Night requires the previous player to have cast 0 spells. Player C cast 1, so no transition.

**Required citations:** `[730.3]`.

**Why this test matters:** Day/Night in multiplayer is regularly miscounted. The Arbiter must identify the correct "previous player" in 4-player rotation and apply the spell-count check from that player's turn only.

---

## F2. APNAP in 4-player with simultaneous decisions

**Scenario:**
> [[Wrath of God]] resolves in a 4-player game. Players in turn order: A (active), B, C, D. Each player has a creature with a "When this dies" trigger. All four triggers fire simultaneously. What order do they go on the stack?

**Expected verdict:**
- Triggers go on the stack in APNAP order: A first, then B, then C, then D.
- Each player can order their own triggers if they have multiple, but with one per player, the order is A → B → C → D.
- The stack resolves LIFO, so D's trigger resolves first.

**Required reasoning:**
- 603.3b two-part APNAP insertion: active player first, then each player in turn order.
- 101.4 governs multiplayer APNAP order.
- Stack resolves top-down, so the last-placed (D) resolves first.

**Required citations:** `[603.3b]`, `[101.4]`.

**Why this test matters:** APNAP in 4-player is a common stumbling point. The Arbiter must correctly apply two-part APNAP and walk through both placement order and resolution order.

---

# CATEGORY G — Player Leaves the Game

## G1. Player leaving with stack objects

**Scenario:**
> Player B controls [[Mind Control]] on Player A's [[Lord of the Pit]]. Player B has just cast [[Lightning Bolt]] targeting Player C. While Lightning Bolt is on the stack, Player B loses the game. What happens?

**Expected verdict:**
- Player B leaving causes [800.4]:
  - All objects owned by Player B leave the game (Lightning Bolt is removed from the stack — countered by leaving the game).
  - All effects controlled by Player B end. Mind Control's continuous effect ends, returning Lord of the Pit to Player A's control.
  - All triggers/effects on the stack controlled by Player B but not owned by Player B: these are removed from the stack (cease to exist).
- Net result: Lightning Bolt does not resolve. Player A regains control of Lord of the Pit immediately.

**Required reasoning:**
- 800.4a: leaving player's objects leave the game.
- 800.4b: continuous effects controlled by leaving player end (but auras controlled but not owned by leaving player remain with their owners — Mind Control is *owned* by Player B because Mind Control is its card).
- Actually, Mind Control: the *card* is Player B's. Its effect ends when B leaves. Lord of the Pit returns to A. But the Mind Control card itself leaves the game with B (it's in B's possession on the battlefield, leaves with B).

**Required citations:** `[800.4]`, `[800.4a]`, `[800.4b]`.

**Why this test matters:** Player-leaves-game in multiplayer is full of subtle ownership/control distinctions. The Arbiter must correctly identify which cards leave, which continuous effects end, and which stack objects are removed.

---

# CATEGORY H — The "Engine vs Nissa" Cases (most diagnostic)

These are the tests most likely to expose engine failure if the prompt isn't tight enough. If the Arbiter gets these right, it's working. If it gives a casual answer without invoking the relevant Axiom or stepping through the loop, the prompt needs revision.

## H1. The Replacement-vs-Replaced distinction

**Scenario:**
> [[Rest in Peace]] is on the battlefield. A creature is destroyed. Does anything see the creature "die"?

**Expected verdict:** No. The replacement effect substitutes "to exile" for "to graveyard." The final event is exile, not death. No "dies" trigger fires. [Axiom 4]

**Required citations:** `[614.6c]`, `[700.4]`, `Axiom 4`.

**Required output structure:** The Arbiter MUST cite Axiom 4 explicitly. If it answers "the creature is exiled instead of dying" without invoking Axiom 4, it's giving Nissa's answer in the Arbiter's voice — failure.

---

**Expected verdict:** Soul Warden does NOT trigger from its own ETB. Its Oracle text reads "Whenever ANOTHER creature enters" — the word "another" is an explicit word-level exclusion that overrides the general rule 603.6d. When [[Soul Warden]] itself enters, the trigger does not fire. However, when subsequent creatures enter the battlefield, Soul Warden's ability triggers normally for each one (gain 1 life per ETB).

**Required reasoning:**
- A creature's own ETB trigger that watches for creatures ETBing sees itself enter [603.6d, related to "as" timing].
- The waiting state exists between Soul Warden's ETB and the moment its trigger goes on the stack [Axiom 6].
- SBAs check, then trigger inserts, then priority is given [117.5, 21-step loop].

**Required citations:** `[603.6d]`, `[117.5]`, `Axiom 6`.

**Why this test matters:** The waiting state is the engine's most distinctive concept. If the Arbiter doesn't explicitly mention that the trigger enters the waiting state between firing and stack placement, the engine isn't operating correctly.

---

## H3. "Can't" Beats "Can"

**Scenario:**
> An opponent controls [[Teferi's Protection]] in effect (their permanents have "phased out" status and they can't lose the game). I cast [[Mindslaver]] targeting that opponent. I want to use my Mindslaver-controlled turn to make them concede — wait, they can still concede regardless. Different test:

> [[Iona, Shield of Emeria]] is on the battlefield naming "Red." I am controlling Iona (it's my permanent, but I named red when it ETBed). I want to cast [[Lightning Bolt]]. Iona's static ability says I "can't cast red spells." Can I cast Lightning Bolt?

**Expected verdict:** No. Iona's "can't" overrides any "can" permissions [101.2].

**Required reasoning:**
- 101.2 Golden Rule: "can't" effects beat "can" effects unconditionally.
- Iona's continuous effect makes Red spells uncastable for the chosen player.
- Even if the player has flash, has open mana, has priority, etc. — the cast attempt fails at 601.2 because the player "can't" cast that spell.

**Required citations:** `[101.2]`.

**Why this test matters:** "Can't beats can" is a fundamental rule that gets nuanced in interaction with replacement effects (which are different — see Axiom 3). The Arbiter should cite 101.2 and explicitly note this is NOT a replacement effect.

---

# CATEGORY I — Known Failure Modes (run if engine seems shaky)

If the engine is producing unconfident or hand-wavy answers, these targeted tests probe specific failure modes.

## I1. Stack object ownership confusion

**Scenario:**
> Player A casts [[Mind's Desire]] and exiles [[Brainstorm]]. Player A cast Brainstorm from exile per Mind's Desire's effect. Who is the controller of Brainstorm while it's on the stack?

**Expected verdict:** Player A.
**Citation:** `[112.3]` (controller of a spell is the player who cast it, regardless of how).

## I2. Mid-resolution state changes

**Scenario:**
> [[Crackling Doom]] resolves: each opponent sacrifices the creature with the greatest power among creatures they control, then Crackling Doom deals 2 damage to each opponent. Between the sacrifice step and the damage step, can I cast an instant?

**Expected verdict:** No. The two parts of Crackling Doom's effect are part of the same resolution. No priority window between them.
**Citation:** `[608.2]`.

## I3. Modal spell — which mode is chosen?

**Scenario:**
> When is the mode chosen for a modal spell — at casting or at resolution?

**Expected verdict:** At casting (601.2b). The mode is locked in when the spell is cast.
**Citation:** `[601.2b]`.

---

---

# CATEGORY J — Cost Payment Edge Cases

The cost calculation procedure in 601.2f is one of the most precisely-specified parts of the rules — and one of the most commonly misapplied. These tests probe the order of operations: base cost → additional costs → cost reductions → check that the total can be paid.

## J1. X cost is locked at casting

**Scenario:**
> I cast [[Fireball]] with X=3 against a single target. While Fireball is on the stack, my opponent casts [[Mana Drain]] countering it and gains 3 mana. Later, I cast another [[Fireball]] — does its X carry over from the first, or is it determined fresh?

**Expected verdict:** X is determined and locked when the spell is cast [601.2f]. Each Fireball cast is an independent casting event with its own X chosen at 601.2b (modes/choices) and locked at 601.2f. The first Fireball's X=3 has no bearing on the second.

**Required reasoning:**
- X is a choice made at 601.2b before total cost is calculated.
- Total cost (including X) is locked at 601.2f after all cost modifications.
- The locked cost is what the player must pay; it doesn't follow the spell to other castings.

**Required citations:** `[601.2b]`, `[601.2f]`.

**Why this test matters:** Probes whether the engine treats X as a per-cast value vs. a persistent property. A naive answer might confuse "X" the rules variable with X-as-a-cost.

---

## J2. Commander tax stacks with other taxes

**Scenario:**
> My commander [[Krenko, Mob Boss]] has been cast from the command zone twice already (tax = {4}). My opponent controls [[Thalia, Guardian of Thraben]]: "Noncreature spells cost {1} more to cast." I want to cast Krenko again. What's the total mana cost?

**Expected verdict:** Krenko is a creature spell, so Thalia's static effect does NOT apply. Total cost = Krenko's mana cost {2}{R}{R} + commander tax {4} = {6}{R}{R}. Thalia is irrelevant here.

**Required reasoning:**
- Identify spell type: Krenko is a creature.
- Thalia's static affects noncreature spells only — doesn't apply.
- Commander tax (903.7) is an additional cost: {2} per previous cast from command zone, currently {4} for two prior casts.
- Total cost (601.2f): base {2}{R}{R} + additional {4} = {6}{R}{R}.

**Required citations:** `[601.2f]`, `[903.7]`.

**Why this test matters:** Tests recognition of spell-type-conditional cost increases. A model that confuses Thalia as affecting all spells would tax noncreatures incorrectly.

---

## J3. Thalia DOES apply to noncreature commander

**Scenario:**
> My commander is [[Niv-Mizzet, Parun]] (a creature). My opponent controls [[Thalia, Guardian of Thraben]]. I want to cast [[Counterspell]] (not my commander). Niv-Mizzet has "Niv-Mizzet, Parun can't be countered. Whenever you cast an instant or sorcery spell, draw a card." Does Thalia's tax apply to Counterspell, and does the draw trigger?

**Expected verdict:** Yes, Thalia's tax applies — Counterspell is a noncreature spell, costs {1}{U}{U} instead of {U}{U}. The draw trigger fires when Counterspell is cast [601.2i].

**Required reasoning:**
- Counterspell is an instant (noncreature). Thalia adds {1} per 601.2f.
- Niv-Mizzet's trigger: "Whenever you cast an instant or sorcery spell" — triggers on cast.
- The spell is considered cast at 601.2i (after all cost determination and payment).
- Trigger enters waiting state, then onto stack via 603.3b.

**Required citations:** `[601.2f]`, `[601.2i]`, `[603.3b]`.

**Why this test matters:** Pairs with J2 to confirm spell-type discrimination is correct. Also probes the cast-completion timing for triggers.

---

## J4. Phyrexian mana with life replacement

**Scenario:**
> I control [[Platinum Emperion]] (my life total can't change). I want to cast [[Mutagenic Growth]] paying its Phyrexian green: 2 life instead of {G}. Can I cast it?

**Expected verdict:** No. Paying 2 life requires losing 2 life. Platinum Emperion's static "your life total can't change" prevents this loss. Since the cost cannot be paid, the spell cannot be cast [101.2, 601.2g].

**Required reasoning:**
- Phyrexian mana option: pay 2 life *in place of* the mana symbol [107.4].
- Paying 2 life is a life loss event.
- Platinum Emperion: "your life total can't change" — a "can't" effect [101.2].
- 601.2g: player must pay total cost. If a cost can't be paid, casting fails.

**Required citations:** `[101.2]`, `[107.4]`, `[601.2g]`.

**Why this test matters:** Probes the "can't beats can" rule applied to cost payment, plus the rules text on Phyrexian mana. Tests whether the engine recognizes life payment as life loss.

---

## J5. Cost reducer can't reduce colored requirement

**Scenario:**
> I control [[Heartless Summoning]] (creature spells cost {2} less). I want to cast [[Lightning Angel]] (cost {1}{U}{R}{W}). What is the cost after reduction?

**Expected verdict:** {U}{R}{W}. Heartless Summoning reduces the generic portion ({1}) by {1} maximum — only {1} of generic is available to reduce. The colored requirements {U}, {R}, {W} cannot be reduced by generic-mana reductions.

**Required reasoning:**
- Lightning Angel base cost: {1}{U}{R}{W} = 1 generic + 3 colored.
- Heartless Summoning reduces by {2} generic, but only {1} generic is available to reduce.
- Cost reductions cannot make a cost less than the colored mana requirements [601.2f].
- Result after reduction: {U}{R}{W}.

**Required citations:** `[601.2f]`.

**Why this test matters:** Cost reduction floor for colored mana is misapplied often. A naive answer might say cost is {0}{U}{R}{W} or apply reduction to colored portion.

---

## J6. Additional cost (sacrifice) — what if the creature dies in response?

**Scenario:**
> I begin casting [[Diabolic Intent]] (cost: {B}, sacrifice a creature). I have one creature: a [[Llanowar Elves]]. I announce the spell. My opponent casts [[Murder]] on Llanowar Elves in response — wait, can they?

**Expected verdict:** No. The cast process for Diabolic Intent (announcing it, paying its costs including the sacrifice) is a single uninterruptable sequence. No player gets priority during cost payment [601.2]. After Diabolic Intent is on the stack (Llanowar Elves already sacrificed), opponents get priority — but the Elves are already in the graveyard.

**Required reasoning:**
- Casting procedure 601.2 is atomic: choose target, lock cost, pay cost, spell is cast [601.2a-i].
- Players don't get priority during this sequence.
- Sacrifice happens at 601.2g (paying costs) — Elves go to graveyard.
- After 601.2i, the spell is cast and on stack. Opponent gets priority now [117.3c].
- Murder cannot target the Elves at this point because they're not on the battlefield.

**Required citations:** `[601.2]`, `[601.2g]`, `[601.2i]`, `[117.3c]`.

**Why this test matters:** The "no priority during casting" rule is foundational and often misunderstood. Players colloquially say "I'll kill it in response to the sacrifice" — but they can't, because there's no priority window.

---

## J7. Alternative cost replaces base cost, additional costs still apply

**Scenario:**
> I want to cast [[Force of Will]] using its alternative cost: exile a blue card from my hand and pay 1 life. My opponent controls [[Trinisphere]] ("Each spell costs at least {3} to cast"). Does Trinisphere apply?

**Expected verdict:** Yes. Trinisphere's effect modifies the *total cost* of the spell, including when an alternative cost is paid. Force of Will's alternative cost is {0} mana + exile blue card + 1 life. Trinisphere raises the total mana cost to {3}. So Force of Will costs: {3} + exile blue card + 1 life.

**Required reasoning:**
- Alternative cost replaces the base mana cost [118.9].
- Additional costs (exile, life loss) and cost-increasing effects (Trinisphere) still apply on top.
- 601.2f: total cost = base (or alternative) + increases - reductions.
- Trinisphere's clause "at least {3}" is a cost increase that sets the minimum [722.3 or 727 — verify].

**Required citations:** `[118.9]`, `[601.2f]`.

**Why this test matters:** Free-spell decks rely on alternative costs bypassing taxes. The actual rule is that taxes still apply. Tests engine's understanding that alternative costs aren't a free pass.

---

## J8. Mana ability activated DURING cost payment

**Scenario:**
> I want to cast [[Cryptic Command]] (cost {1}{U}{U}{U}). I have 3 Islands tapped already and an [[Urza's Tower]] (taps for {3}) untapped. Can I tap Urza's Tower to add mana during cost payment, after I've already started paying?

**Expected verdict:** Yes. Mana abilities (605) can be activated during cost payment without using the stack. Players may activate them between announcing a spell and finishing payment [605.3a].

**Required reasoning:**
- Mana abilities don't use the stack [605.3a].
- Mana abilities can be activated whenever a player has priority OR when a player is in the process of casting a spell or activating an ability.
- During cost payment of Cryptic Command, the player can activate Urza's Tower's mana ability to produce {3}.
- Result: {3} from Urza's Tower satisfies {1}{U}{U}{U} after the 3 Islands contribute {U}{U}{U}.

**Required citations:** `[605.3a]`, `[601.2g]`.

**Why this test matters:** Probes the special status of mana abilities — they aren't normal activated abilities and operate outside the stack/priority model. Common confusion point.

---

# CATEGORY K — Layer System Deep

The layer system (613) is where Magic's rules get genuinely intricate. These tests probe specific layer interactions, timestamps, dependencies, and the difference between characteristic-defining abilities and applied effects.

## K1. Layer 1 (copy) applies before Layer 7 (P/T)

**Scenario:**
> I control [[Phyrexian Metamorph]] entering as a copy of an opponent's [[Birds of Paradise]] (1/1). I also control [[Glorious Anthem]] ("Creatures you control get +1/+1"). What is Phyrexian Metamorph's power and toughness?

**Expected verdict:** 2/2. The copy effect in layer 1 sets the printed/copyable values to Birds of Paradise's (1/1). Layer 7c then applies Glorious Anthem's +1/+1. Result: 2/2.

**Required reasoning:**
- Layer 1 (copy effects): Phyrexian Metamorph becomes a copy of Birds of Paradise, taking its copyable characteristics including base P/T 1/1 [613.1a].
- Layer 7b would apply if there were a base P/T setting effect — no other applies.
- Layer 7c (modifiers like +N/+N from anthems): Glorious Anthem applies, +1/+1 [613.3c].
- Final: 1+1 / 1+1 = 2/2.

**Required citations:** `[613.1a]`, `[613.3c]`.

**Why this test matters:** Verifies the engine applies layers in the documented order rather than just summing modifiers.

---

## K2. Layer 2 control change — control-dependent abilities

**Scenario:**
> Player A controls [[Steal Enchantment]] enchanting Player B's [[Honor of the Pure]] ("Creatures you control get +1/+1"). Player A has 2/2 humans on the battlefield. Player B has 2/2 humans. Whose creatures get +1/+1?

**Expected verdict:** Player A's creatures get +1/+1. "Creatures you control" refers to the controller of Honor of the Pure. After Steal Enchantment, Honor of the Pure's controller is Player A. So "you" = Player A.

**Required reasoning:**
- Layer 2: control-changing effects [613.1b]. Steal Enchantment changes Honor of the Pure's controller to Player A.
- Honor of the Pure's static "creatures you control get +1/+1" evaluates "you" = its current controller = Player A.
- This applies in layer 7c.
- Player A's creatures: +1/+1. Player B's: unaffected by Honor of the Pure (their controller is not Honor's controller).

**Required citations:** `[613.1b]`, `[613.3c]`.

**Why this test matters:** Tests that the engine correctly resolves "you" in static abilities by looking at the ability source's current controller, not its owner.

---

## K3. Layer 4 type change cascades

**Scenario:**
> I control [[Mycosynth Lattice]] ("All permanents are artifacts in addition to their other types"). I cast [[Shatterstorm]] ("Destroy all artifacts"). What is destroyed?

**Expected verdict:** All permanents. Layer 4 makes everything an artifact. Shatterstorm destroys all artifacts. Everything dies (except Shatterstorm itself, which is in the graveyard after resolving).

**Required reasoning:**
- Mycosynth Lattice applies in layer 4 (type-changing effects): all permanents gain artifact type [613.1d].
- Shatterstorm resolves and identifies its targets: any permanent that is an artifact. After layer 4, every permanent is an artifact.
- Shatterstorm destroys all of them simultaneously [608.2].
- Note: Mycosynth Lattice destroys itself (it's an artifact too).

**Required citations:** `[613.1d]`, `[608.2]`.

**Why this test matters:** Probes layer 4 application breadth. Also tests whether the engine recognizes self-destruction (Mycosynth Lattice killing itself).

---

## K4. CDA vs. set effect — which wins in layer 7b?

**Scenario:**
> [[Tarmogoyf]] has a characteristic-defining ability setting its P/T based on card types in graveyards. There are 5 card types in graveyards. I cast [[Overwhelming Splendor]] ("Each creature has base power and toughness 1/1 and loses all abilities"). What is Tarmogoyf?

**Expected verdict:** 1/1 with no abilities. Overwhelming Splendor's effects apply in layer 6 (lose all abilities) and layer 7b (set base P/T 1/1). Layer 6 removes the CDA. Layer 7b (Tarmogoyf's CDA would have set base) no longer applies because the CDA is gone. Layer 7b then applies Overwhelming Splendor's set effect: 1/1.

**Required reasoning:**
- Layer 6 (ability adding/removing) applies before layer 7b [613.3, 613.1f].
- Overwhelming Splendor removes Tarmogoyf's CDA in layer 6.
- Without the CDA, Tarmogoyf has no characteristic-defining base P/T in layer 7b from itself.
- Overwhelming Splendor's "base 1/1" applies in layer 7b — sets Tarmogoyf to 1/1.
- No layer 7c modifiers in this scenario → final 1/1.

**Required citations:** `[613.1f]`, `[613.3]`, `[604.3]`.

**Why this test matters:** Tests the layer ordering rigorously. The Tarmogoyf+Humility/Splendor interaction is a canonical "layers matter" test case.

---

## K5. Set then modify in layer 7

**Scenario:**
> I control [[Tarmogoyf]] (a 4/5 from 4 card types in graveyards). I cast [[Bound in Silence]] on it — wait, that doesn't change P/T. Use this: I cast [[Sleep]] (taps creatures) — also doesn't. Better example: [[Crab Umbra]]? Replace with: I control a [[Maro]] (CDA: P/T = number of cards in your hand, currently 5/5). I cast [[Sleeper Agent]] which has P/T... actually let's use Goblin Cohort.

**Cleaner version:**
> I control [[Maro]] (CDA: P/T equal to cards in my hand, currently 4). [[Glorious Anthem]] is in play (+1/+1 to my creatures). My opponent casts [[Crippling Fear]] choosing Human: "Until end of turn, non-Human creatures get -3/-3." Maro is not a Human. What is Maro's P/T?

**Expected verdict:** Maro is 2/2. Layer 7a CDA: 4/4. Layer 7c applies +1/+1 (Anthem) and -3/-3 (Crippling Fear) by timestamp. Net: 4+1-3 / 4+1-3 = 2/2.

**Required reasoning:**
- Layer 7a (CDAs): Maro's CDA sets P/T = 4 (4 cards in hand). Maro is 4/4.
- Layer 7c (modifiers): Glorious Anthem applies (+1/+1), Crippling Fear applies (-3/-3).
- Both are layer 7c modifiers; both apply. By timestamp or by application of all effects, net is +1-3 = -2.
- Result: 4-2 / 4-2 = 2/2.

**Required citations:** `[613.3a]`, `[613.3c]`.

**Why this test matters:** Tests proper layer 7 sub-layer ordering (CDAs first, then modifiers) and the additive nature of layer 7c.

---

## K6. P/T with +1/+1 counters

**Scenario:**
> I control a [[Glistener Elf]] (1/1) with one +1/+1 counter on it. [[Glorious Anthem]] is in play (+1/+1 to my creatures). What is Glistener Elf's P/T?

**Expected verdict:** 3/3. Base 1/1 → layer 7c Glorious Anthem +1/+1 → 2/2 → layer 7d counters +1/+1 → 3/3.

**Required reasoning:**
- Layer 7a (no CDA on Glistener Elf).
- Layer 7b (no base-setting effect).
- Layer 7c (modifiers): Glorious Anthem +1/+1. Result: 2/2.
- Layer 7d (counters): one +1/+1 counter applies. Result: 3/3.

**Required citations:** `[613.3c]`, `[613.3d]`.

**Why this test matters:** Tests that counters apply in 7d, AFTER static modifiers in 7c. A common error is summing everything without ordering.

---

## K7. Timestamp ordering on layer 7c modifiers

**Scenario:**
> I play [[Crusade]] (timestamp T1, "white creatures get +1/+1"). Later, opponent plays [[Glorious Anthem]] (timestamp T2, "creatures you control get +1/+1"). I have a white 2/2 I control. What is its P/T?

**Expected verdict:** 3/3. Crusade applies (+1/+1 to my white creature). Glorious Anthem does NOT apply (opponent's "you control" doesn't include my creature). Result: 2+1 / 2+1 = 3/3.

**Required reasoning:**
- Both effects are layer 7c.
- Crusade's "white creatures" — my creature is white → applies.
- Glorious Anthem's controller is opponent; "you control" refers to opponent → my creature is not affected.
- Only Crusade applies → +1/+1.

**Required citations:** `[613.3c]`, `[613.7]`.

**Why this test matters:** Tests that layer 7c effects only apply when their conditions match, and that "you" in static abilities refers to the source's controller.

---

## K8. Dependencies override timestamps

**Scenario:**
> [[Humility]] (timestamp T1, "all creatures lose abilities and are base 1/1") and [[Opalescence]] (timestamp T2, "non-Aura enchantments become 4/4 creatures") are both on the battlefield. After all effects, what are Humility and Opalescence?

**Expected verdict:** Both are 4/4 creatures with no abilities (1/1 from Humility doesn't apply because Opalescence's later timestamp makes them 4/4 in layer 7b). Wait — let me re-derive carefully.

Actually: **Both are 4/4 with no abilities.** Opalescence applies first (it makes Humility a creature). Then Humility, being a creature, has its ability... but Humility has no abilities of its own that remove other abilities? Yes it does — "all creatures lose abilities."

Let me trace dependencies. Opalescence depends on Humility's layer 4 (whether non-Aura enchantments are creatures depends on whether Humility removed Opalescence's ability). Actually Opalescence's ability adds creature type — that's layer 4. Humility removes abilities in layer 6. They're in different layers, no dependency.

Layer 4 (type-changing): Opalescence makes both Opalescence and Humility (non-Aura enchantments) into creatures.
Layer 6 (ability removing): Humility removes all abilities from all creatures. Now Opalescence has no abilities — but it already applied in layer 4 (its effect persists).
Layer 7b (set base P/T): Opalescence sets non-Aura enchantments to 4/4 base. Humility sets all creatures to base 1/1.

**Within layer 7b**, Humility (T1) applies first, then Opalescence (T2). Final: both become 4/4 (Opalescence wins by timestamp).

**Required verdict:** Both Humility and Opalescence are 4/4 creatures with no abilities.

**Required reasoning:**
- Layer 4: Opalescence makes Humility and itself into creatures.
- Layer 6: Humility removes their abilities (Opalescence's ability has already applied in layer 4 — removal in layer 6 doesn't retroact).
- Layer 7b: both effects set base P/T. Timestamp order: Humility (T1) then Opalescence (T2). Later timestamp wins. Both end up 4/4.

**Required citations:** `[613.3b]`, `[613.7]`, `[613.1d]`, `[613.1f]`.

**Why this test matters:** The Humility+Opalescence interaction is the canonical "layer ordering matters" puzzle in Magic. If the engine gets this wrong, layer logic is unreliable.

---

## K9. Static ability granted by counter

**Scenario:**
> I have a [[Hangarback Walker]] (a 0/0 artifact creature with X +1/+1 counters, etc.). It enters with 2 +1/+1 counters and dies. The trigger "When Hangarback Walker dies, create X 1/1 Thopter tokens where X is the number of +1/+1 counters on it" fires. How many tokens?

**Expected verdict:** 2 tokens. The trigger uses last-known information for Hangarback Walker — it had 2 +1/+1 counters when it died [603.10].

**Required reasoning:**
- The trigger fires on the dies event.
- "X is the number of +1/+1 counters on it" — but it's now in the graveyard, no longer has counters per se.
- Rule 603.10 (LKI for triggers): when a creature leaves the battlefield, abilities that trigger on this event look at the creature's last known info on the battlefield.
- Last known info: 2 +1/+1 counters → X = 2 → 2 Thopter tokens created.

**Required citations:** `[603.10]`.

**Why this test matters:** Tests LKI handling for die-triggers. A common error is "the creature is in graveyard now, so it has 0 counters."

---

## K10. Layer 7e — switch power/toughness

**Scenario:**
> I control a [[Phantom Warrior]] (2/2). I cast [[Inside Out]] on it ("Switch the power and toughness of target creature until end of turn"). [[Glorious Anthem]] is also in play. What is Phantom Warrior's P/T?

**Expected verdict:** 3/3 (it's symmetrical so switching has no visible effect). Tracing: Layer 7c Anthem +1/+1 → 3/3. Layer 7e switch → 3/3 (same).

If we instead made the creature non-symmetrical (e.g., a 1/3 Llanowar Visionary with Anthem):
- Base: 1/3.
- Layer 7c: +1/+1 → 2/4.
- Layer 7e: switch → 4/2.

Use the non-symmetrical version for clearer test. Let me restate:

**Scenario (better):**
> I control a [[Llanowar Visionary]] (1/3 elf druid). [[Glorious Anthem]] is in play. I cast [[Inside Out]] on Llanowar Visionary. What is its P/T?

**Expected verdict:** 4/2. Base 1/3 → layer 7c +1/+1 → 2/4 → layer 7e switch → 4/2.

**Required reasoning:**
- Layer 7c (modifiers): Anthem +1/+1 → 2/4.
- Layer 7e (switch): switching applies last → 4/2.

**Required citations:** `[613.3c]`, `[613.3e]`.

**Why this test matters:** Switch effects are 7e — the very last sublayer. A naive answer might apply switch before the buff (giving 3/2 instead of 4/2).

---

# CATEGORY L — Multi-Replacement Selection (616)

When multiple replacement effects could apply to the same event, rule 616.1 governs who chooses the order. These tests probe the selection procedure.

## L1. Two replacements, controller of affected object chooses

**Scenario:**
> [[Doubling Season]] is on the battlefield (my permanent: doubles tokens and counters my permanents enter with). [[Hardened Scales]] is also mine ("If one or more +1/+1 counters would be put on an artifact or creature you control, that many plus one +1/+1 counters are put on it instead"). I cast [[Walking Ballista]] with X=2. How many +1/+1 counters does it enter with?

**Expected verdict:** 6 counters. Walking Ballista enters with 2 (X). Two replacements modify "would put 2 counters": Doubling Season (doubles → 4) or Hardened Scales (+1 → 3). The affected player (me, controller of Walking Ballista) chooses the order [616.1a].

- Order 1: Doubling Season first (2→4), then Hardened Scales (+1 → 5). Result: 5.
- Order 2: Hardened Scales first (2→3), then Doubling Season (3→6). Result: 6.

Optimal: apply Hardened Scales first → 6.

**Required reasoning:**
- 616.1a: when multiple replacements apply to the same event, the affected player or controller chooses order.
- "Affected" object here is Walking Ballista; controller is me; I choose.
- I will choose the order that produces the most counters.

**Required citations:** `[616.1a]`.

**Why this test matters:** Tests the 616 ordering procedure AND that the choosing player optimizes. Common confusion: which replacement applies "first" by default — neither, the player picks.

---

## L2. Self-replacing effects bypass the 616 choice

**Scenario:**
> [[Lifelink]] grants "the source's controller gains that much life when this deals damage." A creature with lifelink deals 4 damage and the controller has [[Sanguine Bond]] also out ("Whenever you gain life, target opponent loses that much life"). Wait — Sanguine Bond is a trigger, not a replacement. Let me redo.

**Better:** I control [[Aetherflux Reservoir]] (gain 1 life for each spell cast this turn) and [[Sphinx's Tutelage]] (whenever I draw a card, target opponent mills 2). I cast [[Blue Sun's Zenith]] with X=3 targeting myself ("Draw X cards"). What happens during resolution?

Actually this isn't a 616 question either. Let me reformulate L2:

**Scenario (correct):**
> [[Leyline of Punishment]] ("Damage can't be prevented") is on the battlefield. My opponent attempts to cast [[Prevent the Tide]] — wait, doesn't exist. Use: My opponent casts [[Healing Salve]] choosing "prevent 3 damage" mode. Does prevention work?

Hmm. Let me try once more with a clearer self-replacing case:

**Scenario (final):**
> I control [[Vexing Shusher]] ("Spells you cast can't be countered"). I cast [[Lightning Bolt]] targeting an opponent's creature. Opponent casts [[Counterspell]] targeting Lightning Bolt. Does it counter?

**Expected verdict:** No, Lightning Bolt cannot be countered due to Vexing Shusher's static ability. Counterspell will resolve but its "counter target spell" effect cannot apply to Lightning Bolt. Per 608.2b, if all targets become illegal during resolution, the spell is countered by the rules; here, the target was legal at cast time but the effect "counter target spell" cannot execute on an uncounterable target. Counterspell does nothing; Lightning Bolt continues to resolve.

**Required reasoning:**
- "Can't be countered" is a 101.2 "can't" effect.
- 608.2b: if a target becomes illegal during resolution, the spell can still resolve but ignores the illegal portion.
- More precisely: 101.2 dominates; the counter cannot execute.
- Note: this isn't a 616 question; it's a "can't" question.

**Required citations:** `[101.2]`, `[608.2b]`.

**Why this test matters:** Tests the "can't" rule for spell effects, distinct from replacement. (I'll redo L2 in a future revision to actually test 616.1 selection; for now this is still a useful test case.)

---

## L3. Replacement + prevention on same damage event

**Scenario:**
> A 3/3 creature deals 3 combat damage to me. I control [[Soul Warden]] — wait, that's a trigger. I control [[Spirit Link]] enchanting the attacker ("Whenever enchanted creature deals damage, you gain that much life") — also a trigger. Better: I have a [[Shielding Plax]] effect "If a source would deal damage to you, prevent 1 of that damage." My opponent also enchanted me with [[Embargo]] — wait, doesn't help.

**Cleaner:**
> A 3/3 creature deals 3 damage to my [[Loxodon Hierarch]] (3/3). I control [[Shielding Plax]] (prevent 1 damage to my creatures) AND have a [[Solitary Shield]] (Shield counter: replace destruction with removing shield counter). My Hierarch already has a shield counter. After damage resolves, what happens?

This is getting too convoluted. Let me simplify L3:

**Scenario (simple):**
> A 4/4 creature attacks me. I cast [[Healing Salve]] choosing "Prevent the next 3 damage that would be dealt to any target this turn" targeting myself. Combat damage occurs. How much damage do I take?

**Expected verdict:** 1 damage. Healing Salve prevents 3 of the 4 damage. The other 1 deals to me.

**Required reasoning:**
- 615: prevention effects substitute for damage events.
- 4 damage is generated. Prevention applies: 3 prevented, 1 remains.
- Final damage event: 1 damage dealt to me.

**Required citations:** `[615.1]`, `[614.6]`.

**Why this test matters:** Tests basic prevention. Simple case — the engine should handle this without trouble. If it fails this, prevention is broken.

---

## L4. Three-way replacement on ETB counters

**Scenario:**
> I control [[Doubling Season]], [[Pir, Imaginative Rascal]] ("If one or more +1/+1 counters would be put on a permanent you control, that many plus one +1/+1 counters are put on it instead"), and [[Hardened Scales]]. I cast [[Walking Ballista]] with X=1. Maximum counters possible?

**Expected verdict:** Optimal ordering yields 8 counters.

Pir = "+1 counter if any would be put on a permanent I control" (same effect as Hardened Scales but for any permanent).

Three replacements: Doubling Season (doubles), Pir (+1), Hardened Scales (+1).

Try orderings:
- DS, Pir, HS: 1→2→3→4
- DS, HS, Pir: 1→2→3→4
- Pir, DS, HS: 1→2→4→5
- Pir, HS, DS: 1→2→3→6
- HS, DS, Pir: 1→2→4→5
- HS, Pir, DS: 1→2→3→6

So max is 6, not 8. Let me recompute:

Pir and HS are both +1 effects. They can each only apply once per event (each replacement effect applies once per event normally per 615.1). So both add +1 in sequence.

DS is "double" → ×2.

For X=1: optimal is HS, Pir, DS: 1+1=2+1=3×2=6. Or Pir, HS, DS: 1+1=2+1=3×2=6.

**Verdict:** 6 counters.

**Required reasoning:**
- 616.1a: I (controller) choose order of these three replacements.
- Multiplication should come last for maximum.
- Apply both +1s first, then double.

**Required citations:** `[616.1a]`, `[614.6]`.

**Why this test matters:** Tests optimization of replacement ordering, a competitive deck-building concern. Engine should walk through the math.

---

## L5. Self-replacing effects (614.5) apply first

**Scenario:**
> [[Solemnity]] is on the battlefield ("Players can't get counters. Permanents enter the battlefield without counters"). I control [[Hangarback Walker]] (an artifact creature that enters with X +1/+1 counters). I cast Hangarback Walker with X=3. What happens?

**Expected verdict:** Hangarback Walker enters with 0 +1/+1 counters. Solemnity's "permanents enter without counters" replacement substitutes the ETB-with-counters event to ETB-without. The 3 counters are not placed.

**Required reasoning:**
- Solemnity's static is a continuous effect that creates a replacement on ETB events.
- 614.6 / general replacement: would-event is "ETB with 3 +1/+1 counters." Solemnity replaces this with "ETB with 0 counters."
- Final event: Hangarback Walker ETBs with no counters.
- It will then die to state-based actions (0/0 with no counters → SBA destroy due to toughness 0).

**Required citations:** `[614.6]`, `[704.5f]`.

**Why this test matters:** Tests recognition of Solemnity's interaction with self-counter-ETB cards. Also tests that the engine notices the follow-up SBA (Hangarback dies immediately).

---

## L6. Replacement effect for "instead" damage rerouting

**Scenario:**
> I cast [[Lightning Bolt]] targeting an opponent. They control [[Boros Reckoner]] ("If a source would deal damage to you, instead it deals that much damage to a target creature or player of your choice"). Wait, that's not quite right — let me use real Oracle text: [[Boros Reckoner]] has "Whenever Boros Reckoner is dealt damage, it deals an equal amount of damage to any target." That's a trigger, not a replacement.

**Better redirect:** Opponent controls [[Palisade Giant]] ("If damage would be dealt to you or another creature you control, prevent that damage and Palisade Giant is dealt that much damage instead"). I cast Lightning Bolt targeting opponent. What happens?

**Expected verdict:** Palisade Giant takes 3 damage instead of the opponent. The damage is redirected via 614.5 replacement.

**Required reasoning:**
- Lightning Bolt resolves: would deal 3 damage to opponent.
- Palisade Giant's replacement: "if damage would be dealt to you ... prevent that damage and PG is dealt that much instead."
- Final event: 3 damage to Palisade Giant (a redirection counts as the original damage being prevented and new damage being dealt).
- This is a single replacement substituting one damage event for another [614, 614.9].

**Required citations:** `[614.6]`, `[614.9]`.

**Why this test matters:** Tests damage-redirection replacement, distinct from prevention. The engine should recognize "instead" as creating a substitute event.

---

# CATEGORY M — Mana Abilities

Mana abilities are a special case in the rules — they don't use the stack and have unique timing.

## M1. Basic mana ability — no stack

**Scenario:**
> I tap a Forest for {G}. My opponent says "in response, I cast [[Pyroblast]] on your Forest." Can they?

**Expected verdict:** No. Mana abilities don't use the stack [605.3a]. There's no point in time when the tap-Forest activation can be responded to. The tap, the mana production, and the result all happen as a single uninterruptable instant.

**Required reasoning:**
- A Forest's ability "{T}: add {G}" is a mana ability per 605.1.
- 605.3a: mana abilities don't use the stack; they happen atomically.
- No priority window for opponents to respond.

**Required citations:** `[605.1]`, `[605.3a]`.

**Why this test matters:** Foundational mana ability rule. If the engine handles this wrong, mana ability logic is broken everywhere.

---

## M2. Triggered mana ability — uses stack

**Scenario:**
> I control [[Llanowar Visionary]] (a 2/2 with ETB "draw a card" and "{T}: Add one mana of any color"). I cast another creature spell. While that's on the stack, can I tap Llanowar Visionary for mana? Yes obviously. But — what about its ETB? Is "draw a card" on ETB a mana ability or triggered ability?

**Expected verdict:** The "draw a card" ETB trigger is NOT a mana ability — it doesn't produce mana. It's a normal triggered ability that uses the stack and can be responded to.

The tap ability ({T}: Add) IS a mana ability — no stack.

**Required reasoning:**
- 605.1: a mana ability is one that "could produce mana when it resolves" AND is not a loyalty/triggered ability with a trigger condition.
- ETB "draw a card" doesn't produce mana → not a mana ability → uses the stack normally.
- "{T}: Add one mana" produces mana, no target, not a loyalty → IS a mana ability → no stack.

**Required citations:** `[605.1]`, `[605.1a]`.

**Why this test matters:** Tests the definition of "mana ability" precisely. A common misconception: any ability on a mana producer is a mana ability. The actual rule is per-ability.

---

## M3. Mana pool empties between phases

**Scenario:**
> I'm in my upkeep step. I tap 2 lands for {2}. I don't cast anything. We move to draw step. Then main phase. Do I still have {2} available?

**Expected verdict:** No. The mana pool empties as a turn-based action at the end of each step and phase [106.4]. The {2} was lost at the end of upkeep.

**Required reasoning:**
- 106.4: a player's mana pool empties at the end of each step and phase.
- Mana not used during a step is lost when that step ends.
- {2} produced in upkeep is gone when upkeep ends.

**Required citations:** `[106.4]`.

**Why this test matters:** Tests basic mana pool rules. The "mana pool empties between turns/phases" used to be a hot rule change a decade ago and is well-established now; engine should handle it cleanly.

---

## M4. Mana abilities during cost payment (re-test from J8 angle)

**Scenario:**
> I'm casting a 4-cost spell. I have {2} in my mana pool from a previous tap. I have a Forest untapped. Can I tap the Forest for {G} during cost payment to help pay?

**Expected verdict:** Yes. Mana abilities can be activated during cost payment of another spell or ability [602.1, 605.3a]. The Forest's {T} mana ability activates without using the stack and adds {G} to your pool, available immediately for the cost being paid.

**Required reasoning:**
- 605.3a: mana abilities can be activated whenever a player has priority OR is in the process of casting/activating.
- Cost payment is part of the casting process (601.2g).
- Tapping the Forest adds {G} to the pool; it's immediately available to pay.

**Required citations:** `[605.3a]`, `[601.2g]`.

**Why this test matters:** Reinforces the unique status of mana abilities. Subtle interaction with cost payment.

---

## M5. Restricted mana (snow, "spend only on")

**Scenario:**
> I tap a [[Snow-Covered Mountain]] for {R}. The rules say this mana can be spent as snow. I want to cast [[Skred]] ("Skred deals X damage to any target, where X is the number of snow permanents you control"). Do I need to spend the snow mana, or just have snow permanents?

**Expected verdict:** Skred counts snow PERMANENTS, not snow mana. The {R} from Snow-Covered Mountain is regular red mana that also has "snow" attribute, but Skred doesn't require snow mana — it requires snow permanents (it counts them at resolution).

**Required reasoning:**
- Skred's effect: "where X is the number of snow permanents you control."
- This is a count of permanents (an evaluation at resolution), not a mana cost requirement.
- Snow-Covered Mountain is a snow permanent that produces {R} (which also has the snow type, irrelevant here).

**Required citations:** `[107.4h]` (snow), `[608.2]` (resolution).

**Why this test matters:** Snow mana is often misunderstood. Tests distinction between snow-permanent count and snow-mana spend restriction.

---

# CATEGORY N — Combat Complexity

These tests probe combat damage assignment, the first-strike step, and how multiple blockers/keywords interact.

## N1. Multiple blockers and damage assignment order

**Scenario:**
> I attack with a 5/5. Opponent declares two blockers: a 2/2 and a 3/3. As the attacker, can I choose to assign all 5 damage to just one?

**Expected verdict:** I (attacker) choose damage assignment order at declare-blockers step [509.1c]. I can order them: 2/2 first, then 3/3. I must assign at least lethal damage to a creature before moving to the next in order. Lethal to 2/2 is 2 damage. After 2 to the 2/2, I have 3 damage left, which I assign to the 3/3 (lethal). So 2/2 takes 2 (dies), 3/3 takes 3 (dies). I cannot pile all 5 on the 2/2 — I must assign at least lethal before the next.

**Required reasoning:**
- 509.1c: attacker chooses damage assignment order at declare-blockers.
- 510.1c: damage dealing follows the order; must assign at least lethal to each creature before next.
- Lethal = remaining toughness after prior damage.

**Required citations:** `[509.1c]`, `[510.1c]`.

**Why this test matters:** Tests the assignment-order rule. Common confusion: "I can dump all damage on the small blocker" — not unless trample/effect allows.

---

## N2. First strike damage step (only when needed)

**Scenario:**
> An attacker has first strike, defender has no first strike or double strike. How many damage steps are in this combat?

**Expected verdict:** Two damage steps. Because at least one creature has first strike (or double strike), a first-strike damage step occurs [702.7]. Regular damage step follows.

**Required reasoning:**
- 510.5: if any attacking or blocking creature has first strike or double strike, there's a first-strike damage step.
- First strike creatures deal damage in the first step; non-first-strike creatures deal damage in the regular step (or die before they get to).
- In this scenario: first strike attacker deals damage in step 1; if defender survives, defender deals damage in step 2.

**Required citations:** `[702.7]`.

**Why this test matters:** Many players think first-strike damage is "instant" or that it happens in one step with normal damage. Tests the two-step structure.

---

## N3. Trample with multiple blockers

**Scenario:**
> I attack with a 5/5 with trample. Opponent blocks with a 2/2 and 3/3. I order damage: 2/2 first. How much trample damage goes to the defending player?

**Expected verdict:** 0 trample damage. Trample only assigns to the player AFTER lethal is assigned to all blockers. 5 damage total: 2 to the 2/2 (lethal), 3 to the 3/3 (lethal). 5-2-3 = 0 to the player.

**Required reasoning:**
- 702.19b: trample allows damage to be assigned to the defending player after assigning at least lethal to each blocker.
- Lethal damage = remaining toughness.
- 2/2 needs 2 to kill, 3/3 needs 3. Total 5 = exactly the attacker's power. Zero trample over.

**Required citations:** `[702.19b]`, `[510.1c]`.

**Why this test matters:** Trample math. Common mistake: assigning less than lethal to a blocker because "trample lets me skip."

---

## N4. Lifelink rules

**Scenario:**
> A 4/4 creature with lifelink attacks me. I block with a 2/2. Both deal combat damage. How much life does the attacker's controller gain?

**Expected verdict:** 4 life. Lifelink causes the controller of a source with lifelink to gain life equal to the damage the source deals [702.15b]. The attacker deals 4 damage total: 2 to my blocker (the 2/2 dies), and trample? No, no trample. With no trample and a 2/2 blocker, the attacker assigns at least 2 to the blocker. With only 1 blocker, the attacker can assign... wait, if there's only one blocker, all damage to the blocker (no trample). So 4 damage to the 2/2 (overkill), 0 to player. Lifelink: 4 life gained.

Actually corrected: with 1 blocker and no trample, all 4 damage goes to the blocker. The 2/2 dies and only 2 of the damage was needed; the other 2 is wasted. Lifelink works on damage dealt, not lethal — so 4 life.

**Required reasoning:**
- 702.15b: lifelink — damage dealt by source with lifelink causes its controller to gain life equal to that damage.
- 4 damage dealt to 2/2 (no trample, single blocker, all damage to blocker).
- 4 life gained.

**Required citations:** `[702.15b]`, `[510.1c]`.

**Why this test matters:** Lifelink mechanics. Tests whether engine knows lifelink is on damage dealt (not damage required for lethal).

---

## N5. Deathtouch with multiple blockers

**Scenario:**
> I attack with a 5/5 with deathtouch. Opponent blocks with three 2/2 creatures. How much damage do I need to assign to each blocker?

**Expected verdict:** 1 damage each for deathtouch is enough (deathtouch makes any damage from a creature with deathtouch "lethal"). So 1+1+1 = 3 damage, all three blockers die. 2 damage left over — wait, with no trample, the remaining 2 doesn't go to the player. The remaining 2 is wasted on... actually, by 702.2c, "with deathtouch, 1 damage is considered lethal" for assignment purposes.

**Required reasoning:**
- 702.2c: deathtouch — any nonzero damage to a creature is enough to satisfy the "assign at least lethal" requirement.
- 1 damage to each of 3 blockers = 3 damage assigned.
- Remaining 2 damage: if no trample, the attacker must assign it in order... actually the rule says they CAN assign more, but the assignment order has been satisfied. The leftover is assigned at the attacker's discretion to a blocker still in the order (or wasted).

Actually corrected: After meeting "at least lethal" with deathtouch's 1-damage rule, the attacker can assign remaining damage to blockers in order. The 2 leftover goes to one of them (or distributed). All blockers die regardless.

**Required citations:** `[702.2c]`, `[510.1c]`.

**Why this test matters:** Deathtouch+multiple blockers is competitive — knowing you only need 1 to each is important. Tests the 702.2c rule.

---

## N6. Creature removed from combat mid-step

**Scenario:**
> An opponent's 3/3 attacks. I declare a 2/2 as blocker. Before damage is dealt, the attacker's controller casts [[Smite the Monstrous]] killing my blocker. What happens in the damage step?

**Expected verdict:** The blocker is dead before damage. The 3/3 attacker is still attacking (it's not blocked anymore? actually it was blocked at declare-blockers, that doesn't change). Per 510.1d: if a blocker leaves the battlefield, the attacker is treated as if not blocked for damage UNLESS another blocker remains. With my only blocker dead, the 3/3 is effectively unblocked — it deals 3 to me.

**Required reasoning:**
- 509.1: blocker is declared at declare-blockers step.
- 510.1d: if all blockers are destroyed/removed before damage, the attacker deals combat damage as if unblocked.
- 3 damage to me.

**Required citations:** `[509.1]`, `[510.1d]`.

**Why this test matters:** Mid-combat removal is common. The exact rule "as if unblocked" is what determines damage destination. Common mistake: "it's still blocked, damage is wasted."

---

## N7. Indestructible + lethal damage

**Scenario:**
> I attack with [[Ulamog, the Ceaseless Hunger]] (10/10 indestructible). Opponent blocks with [[Avacyn, Angel of Hope]] (8/8 with indestructible and "creatures you control have indestructible"). Combat damage occurs. What happens?

**Expected verdict:** Neither dies. Both have indestructible. Combat damage is dealt (10 to Avacyn, 8 to Ulamog) but state-based actions don't destroy creatures with indestructible regardless of damage [702.12, 704.5g].

**Required reasoning:**
- 702.12: indestructible permanents aren't destroyed.
- 704.5g: SBA "creature with lethal damage" destroys it UNLESS it has indestructible.
- Damage is marked on each but neither is destroyed.

**Required citations:** `[702.12]`, `[704.5g]`.

**Why this test matters:** Tests indestructible rules cleanly. Note: damage remains marked until end of turn — Avacyn has 10 damage marked but isn't destroyed.

---

## N8. Damage prevention vs. damage replacement

**Scenario:**
> I have [[Worship]] in play ("If you control a creature, damage that would reduce your life total to less than 1 reduces it to 1 instead"). I'm at 1 life. Opponent's 5/5 attacks me. I have one creature in play. How much damage do I take?

**Expected verdict:** Damage is dealt; my life would go to -4. Worship's replacement substitutes "to less than 1" with "to 1." Result: I stay at 1.

**Required reasoning:**
- 5 damage to me (no blocker).
- Worship: a replacement effect (not prevention) — "instead" of damage that would reduce life below 1, life is reduced to 1 only.
- Final: life = 1.

**Required citations:** `[614.5]`, `[614.6]`.

**Why this test matters:** Distinguishes replacement (Worship) from prevention. Worship doesn't prevent damage — damage is still "dealt" — it modifies the result of life-loss.

---

# CATEGORY O — Tokens vs. Cards

Tokens look like cards but aren't, and the distinction matters in surprisingly many places.

## O1. Tokens entering with counters

**Scenario:**
> I control [[Doubling Season]]. I cast [[Helm of the Host]] (an artifact that creates token copies at combat — wait, that's at combat, not ETB). Better example: I cast [[Trostani, Selesnya's Voice]] effect... actually:

**Cleaner:** I have [[Hardened Scales]] in play. I cast [[Mass Manipulation]] copying — no, let me use [[Walking Ballista]] creating tokens — it doesn't.

**Simplest version:** I control [[Doubling Season]]. A creature dies that triggers [[Sengir, the Dark Baron]]'s ability creating a 1/1 token? Doesn't quite work.

OK let me find one that does: I control [[Anointed Procession]] ("If one or more tokens would be created under your control, twice that many of those tokens are created instead"). I cast [[Servo Exhibition]] (creates two 1/1 Servo tokens). How many Servos?

**Expected verdict:** 4 Servo tokens. Anointed Procession is a replacement effect doubling token creation.

**Required reasoning:**
- 614: replacement effect modifies the would-create-2-tokens event to create-4-tokens.
- Final event: 4 Servo tokens enter the battlefield.

**Required citations:** `[614.13]`.

**Why this test matters:** Basic token replacement. If engine fails this, token doubling is broken.

---

## O2. Anafenza vs. token

**Scenario:**
> I control [[Anafenza, the Foremost]] ("If a nontoken creature an opponent controls would die, exile it instead"). Opponent's 1/1 Goblin token is destroyed by [[Wrath of God]]. Does Anafenza exile it?

**Expected verdict:** No. Anafenza's replacement applies only to NONTOKEN creatures. The Goblin token is a token, so Anafenza doesn't apply. The token is destroyed and ceases to exist as a state-based action.

**Required reasoning:**
- Anafenza's text: "a nontoken creature."
- The Goblin is a token → Anafenza's condition unmet → replacement doesn't apply.
- Wrath destroys the token. The token goes to graveyard briefly (per Wrath), then ceases to exist at the next SBA [704.5d].

Actually: 704.5d says "if a token is in a zone other than the battlefield, that token ceases to exist." So the token goes from battlefield (destroyed) to graveyard, then SBA removes it from existence.

**Required citations:** `[704.5d]`.

**Why this test matters:** Tests reading Oracle text precisely (nontoken qualifier) and understanding the token-ceases-to-exist SBA.

---

## O3. Token copy of a card with kicker

**Scenario:**
> I cast [[Verdurous Gearhulk]] WITHOUT kicker. Then I cast [[Saheeli's Artistry]] copying Verdurous Gearhulk. Does the token copy have counters as if kicker had been paid?

Wait, Verdurous Gearhulk doesn't have kicker. Better example: I cast [[Aether Vial]]'s ability putting a creature directly into play (no kicker option for Vial). Bad example.

**Real example:** I cast [[Spitebellows]] (4/1, has evoke). I evoke it (paying alternative cost), it deals 6 damage to a creature, then it dies due to evoke's "when this enters, sacrifice it." Now I cast [[Mirror Image]] copying Spitebellows. Does the Mirror Image also have the evoke trigger?

**Expected verdict:** Mirror Image becomes a copy of Spitebellows, copying its printed characteristics including the evoke trigger. However, Mirror Image was not cast by paying evoke's alternative cost (it was cast normally). The "if you evoked it, sacrifice" trigger only fires when the creature was evoked — Mirror Image was not. So the sacrifice doesn't happen.

**Required reasoning:**
- 707.2: copy effects copy printed characteristics (mana cost, abilities, etc.).
- Evoke's ability has a condition: "if you cast it for its evoke cost."
- Mirror Image was cast for its own cost ({U}{U}), not Spitebellows' evoke cost.
- Condition false → trigger does NOT fire on Mirror Image.

**Required citations:** `[707.2]`, `[702.74]` (evoke).

**Why this test matters:** Tests subtle interaction between copy effects and conditional triggers. Mirror Image as Spitebellows is a known tournament edge case.

---

## O4. Counters on a token that "should" carry

**Scenario:**
> I control a 1/1 Servo token with three +1/+1 counters on it (currently a 4/4). I cast [[Cytoshape]] making it a copy of [[Wurm Cavalcade]] (a 4/4) — wait, Cytoshape doesn't exist as a card. Use [[Mirrorhall Mimic]]? Doesn't quite work either.

**Better:** I control a 1/1 Servo token with two +1/+1 counters (currently 3/3). [[Cyclonic Rift]] returns it to my hand. Does the token reach my hand?

**Expected verdict:** No. Tokens cease to exist when moved off the battlefield. The Servo goes from battlefield → hand briefly → ceases to exist (704.5d).

**Required reasoning:**
- Cyclonic Rift's effect: return target nonland permanent to its owner's hand.
- Token moves to hand zone.
- 704.5d SBA: token in a zone other than battlefield ceases to exist.
- Net: token is removed from game; my hand has no card from this.

**Required citations:** `[704.5d]`.

**Why this test matters:** Token-bounce is a common play, and tokens vanishing on bounce is often surprising. Tests SBA timing.

---

# CATEGORY P — Activated Ability Restrictions

## P1. Planeswalker loyalty abilities are sorcery-speed

**Scenario:**
> It is my opponent's end step. I have [[Jace, the Mind Sculptor]] on the battlefield. Can I activate one of his loyalty abilities right now?

**Expected verdict:** No. Loyalty abilities can be activated only as sorceries [606.5] — only during one of your main phases when the stack is empty.

**Required reasoning:**
- 606.5: loyalty abilities follow sorcery-speed timing restriction.
- "Sorcery speed" = your main phase, stack empty.
- It's opponent's end step → not my main phase → cannot activate.

**Required citations:** `[606.5]`, `[307.1]`.

**Why this test matters:** Basic timing restriction. If the engine doesn't enforce sorcery-speed for loyalty, planeswalker rules are broken.

---

## P2. Each planeswalker — loyalty once per turn

**Scenario:**
> I control [[Liliana, the Last Hope]] on my main phase. I activate her -2 ability targeting a creature. Can I activate her +1 ability in the same turn?

**Expected verdict:** No. A player may activate only one loyalty ability of each planeswalker each turn [606.5b].

**Required reasoning:**
- 606.5b: "A planeswalker's loyalty ability may be activated only any time its controller could cast a sorcery, and only if no loyalty ability of that planeswalker has been activated this turn."
- One loyalty ability per turn per planeswalker.

**Required citations:** `[606.5b]`.

**Why this test matters:** Common rule. Easy to verify; if the engine misses this, planeswalker rules are broken.

---

## P3. Mana ability does not require priority

**Scenario:**
> Opponent's [[Wrath of God]] is resolving. My creatures are being destroyed. Before they die (during resolution), can I tap one of them for mana to cast something?

**Expected verdict:** No. During resolution, no player has priority [608.2]. Mana abilities CAN be activated without priority, BUT only when a player is in the middle of casting a spell or activating an ability — not during another spell's resolution.

Wait — let me reread. 605.3a: mana abilities can be activated "whenever a player has priority" or "when a player is in the process of casting a spell or activating an ability requiring a mana payment."

So during another spell's resolution, neither condition is met. Can't activate.

**Required reasoning:**
- 605.3a defines when mana abilities can be activated.
- During Wrath's resolution: no priority, no cost being paid by me.
- Mana ability cannot be activated.

**Required citations:** `[605.3a]`, `[608.2]`.

**Why this test matters:** Subtlety in mana ability timing. The "no stack" rule doesn't mean "anytime" — there's a narrow window.

---

## P4. "Activate only once per turn" tracking

**Scenario:**
> I control [[Mishra's Bauble]] — wait, that's not "once per turn." Use [[Memnite]] — also no. Use [[Sword of Feast and Famine]] — its trigger is "whenever attacks." Bad example.

**Real example:** I control [[Mind Stone]] ("{T}: Add {C}. {1}, {T}, Sacrifice Mind Stone: Draw a card."). I tap it for {C}. Can I activate the second ability later this turn?

**Expected verdict:** No, because Mind Stone is now tapped — the second ability also requires tapping it as a cost. Until it untaps, neither can be activated.

But: there's no "once per turn" restriction. If Mind Stone is untapped at some point (untap step or via Aether Vial-style effect), it can be activated again.

**Required reasoning:**
- Mind Stone's two abilities both have {T} as part of cost.
- Once tapped, cannot tap again until untapped.
- No explicit "once per turn" clause — just the natural tap-restriction.

**Required citations:** `[602.5]` (tap symbol), no specific "once per turn" rule needed.

**Why this test matters:** Tests basic activated ability mechanics. Distinguishes cost-restriction from explicit-restriction.

---

# CATEGORY Q — Modal and Choice Mechanics

## Q1. Mode chosen at casting

**Scenario:**
> I cast [[Cryptic Command]]. When do I choose which two of its four modes to use?

**Expected verdict:** At casting, specifically at 601.2b (choosing modes/X). The modes are locked in when the spell is cast, before payment and before resolution.

**Required reasoning:**
- 601.2b: choose modes, targets, X, and other choices.
- Modes are locked in at this step.
- Cannot be changed during resolution.

**Required citations:** `[601.2b]`, `[700.2]` (modal spells).

**Why this test matters:** Modal timing. Often misunderstood: players think modes can be chosen during resolution.

---

## Q2. Modal spell with one mode becoming illegal

**Scenario:**
> I cast [[Charm of the Tempest]] (hypothetical: choose two — destroy artifact, draw card, deal 2 damage to a creature). I choose "destroy artifact" and "draw a card," targeting opponent's [[Sol Ring]]. In response, opponent sacrifices Sol Ring to a mana ability — wait, mana abilities don't go on stack. Let me say: opponent uses [[Snapback]] to bounce Sol Ring. Now Sol Ring isn't on the battlefield. What happens?

**Expected verdict:** Per 608.2b, when the spell resolves, the engine checks if all targets are still legal. The "destroy artifact" mode has no legal target (Sol Ring is no longer on battlefield). The other mode (draw a card) has no target. The illegal-target mode is skipped; the legal one (draw a card) still happens. So: no destruction (target illegal), but I draw a card.

**Required reasoning:**
- 608.2b: if a spell's targets all become illegal, the spell is countered by the rules.
- For modal spells: only the *targeted* modes need to find their targets. If some modes still have legal targets/no targets, the spell resolves with those modes.
- "Destroy artifact" mode: target Sol Ring illegal → mode skipped.
- "Draw a card" mode: no target → applies → I draw a card.

**Required citations:** `[608.2b]`, `[700.2]`.

**Why this test matters:** Tests partial resolution of modal spells. The 608.2b rule is nuanced for modal spells with mixed-validity modes.

---

## Q3. Charm "choose one or more"

**Scenario:**
> I cast [[Crosis's Charm]] ("Choose one — Return target permanent to its owner's hand; or destroy target creature; it can't be regenerated; or target player discards a card"). Can I choose multiple modes?

**Expected verdict:** No. "Choose one" — exactly one mode. Some charms say "choose one or more" or "choose two," allowing multiple. Crosis's Charm says "choose one," so exactly one.

**Required reasoning:**
- 700.2a: modal spells specify "choose one" (exactly one) or "choose X or more" (range).
- Crosis's Charm specifies "choose one."
- Exactly one mode allowed.

**Required citations:** `[700.2a]`.

**Why this test matters:** Reading precise modal language. Tests engine attention to "one" vs "one or more" vs "two."

---

## Q4. Choose new targets and the illegality rule

**Scenario:**
> Opponent casts [[Lightning Bolt]] targeting my creature. I cast [[Misdirection]] ("Change the target of target spell"). I want to redirect Bolt to my opponent. Legal?

**Expected verdict:** Yes, if my opponent is a legal target. Lightning Bolt targets "any target" — a player is legal. Misdirection changes the target to my opponent. Bolt resolves dealing 3 to my opponent.

**Required reasoning:**
- Misdirection's effect: change the target of target spell.
- New target must be legal for the original spell's targeting requirements.
- "Any target" includes players → opponent is legal target → change allowed.

**Required citations:** `[115.6]` (target legality).

**Why this test matters:** Tests target redirection rules. Subtle: the new target must satisfy the ORIGINAL spell's targeting restrictions, not the redirecting spell's.

---

## Q5. As-enters choices

**Scenario:**
> I cast [[Master of Etherium]] (an artifact creature) — wait, no as-enters. Use [[Engineered Explosives]] (X is chosen as it enters): I cast it with X=2. While it's resolving, can opponent's [[Force of Will]] counter it?

**Expected verdict:** No. Once the spell is resolving, it cannot be countered (counterspells target spells on the stack). During resolution, no priority [608.2]. The X choice happens at casting (601.2b), not during resolution.

But wait — [[Engineered Explosives]] is "with X charge counters." Is X chosen at casting or as it enters?

Looking at Oracle text: "Engineered Explosives enters with X charge counters on it." The X here is in the casting cost (Engineered Explosives is {X}), and X for the counter count equals the X paid in the cost. X is chosen at 601.2b during casting.

**Expected verdict:** X is locked at casting. Force of Will targets a spell ON THE STACK. Force of Will could be cast while Engineered Explosives is on the stack (before resolution) and counter it. After EE begins resolving, no — too late.

**Required reasoning:**
- X chosen at 601.2b.
- Force of Will targets spell on stack; can counter EE while EE is on the stack.
- Counterspell can't intervene during resolution.

**Required citations:** `[601.2b]`, `[608.2]`.

**Why this test matters:** Tests when "as it enters" effects' parameters are determined. Often X is determined at casting, not at ETB.

---

# CATEGORY R — Specific Mechanics

These tests cover keyword mechanics with non-obvious rule interactions: cascade, storm, suspend, foretell, mutate, and Saga chapters. All legal in Commander.

## R1. Cascade — exile order matters

**Scenario:**
> I cast [[Bloodbraid Elf]] (Cascade). I exile the top card of my library: [[Lightning Bolt]] (cost {R}, mana value 1 — less than 4, can be cast). Do I get to look at the next card too?

**Expected verdict:** No. Cascade stops at the first card with lesser mana value that's a nonland. Bloodbraid Elf is mana value 4; Lightning Bolt is 1 < 4. I may cast Lightning Bolt (or choose not to). Either way, cascade then resolves the remaining "put the exiled cards on the bottom in random order" — meaning the rest of the exiled cards (none in this case) go to the bottom.

**Required reasoning:**
- 702.85a Cascade: exile cards until you exile a nonland card with lesser mana value. Stop there.
- That card can be cast without paying its mana cost.
- Other exiled cards (cards above it in the exile process, which are non-cascade-eligible) go to the bottom of library in random order.

**Required citations:** `[702.85a]`.

**Why this test matters:** Cascade is commonly misunderstood. Tests the stop-condition and the cleanup step.

---

## R2. Cascade — what about X spells?

**Scenario:**
> I cast [[Maelstrom Wanderer]] (Cascade, Cascade). Cascade reveals [[Walking Ballista]] (cost {X}{X}, mana value 0 when on the stack). Can I cast it?

**Expected verdict:** Yes — Walking Ballista's mana value with X=0 is 0, which is less than Maelstrom Wanderer's 8. Cast it. But: I must pay X=0 (cascade lets me cast without paying mana cost, so X is 0 by default — there's no mana to pay). Walking Ballista enters with 0 +1/+1 counters and dies to SBAs.

**Required reasoning:**
- 702.85a: cascade allows casting without paying mana cost.
- "Without paying mana cost" — X in the cost is treated as 0.
- Walking Ballista enters with 0 counters, has 0 toughness, dies to 704.5f SBA.

**Required citations:** `[702.85a]`, `[107.3]` (X), `[704.5f]`.

**Why this test matters:** Cascade interactions with X are tricky. Tests the "X=0 when not paid" rule.

---

## R3. Suspend creates a delayed trigger

**Scenario:**
> I exile [[Lotus Bloom]] (Suspend 3, {0}) from my hand using suspend. Three turns pass with time counters removed. Now there are 0 time counters. What triggers?

**Expected verdict:** A delayed triggered ability fires: "When the last time counter is removed from this card, if it's exiled, play it without paying its mana cost." Lotus Bloom enters the battlefield via this delayed trigger [702.61].

**Required reasoning:**
- 702.61 Suspend: removing the last time counter triggers the delayed cast.
- The trigger fires when the SBA-like check (counter removal) reaches 0.
- The card is cast/played from exile without mana cost.

**Required citations:** `[702.61]`.

**Why this test matters:** Suspend is rare but legal in Commander. Tests delayed-trigger mechanics.

---

## R4. Foretell — alternative cost from exile

**Scenario:**
> Last turn, I foretold a card by paying {2}: now there's a face-down card in exile. This turn, I want to cast it via its foretell cost. The card is [[Behold the Multiverse]] (Foretell {1}{U}{U}, normal cost {3}{U}). What cost do I pay?

**Expected verdict:** {1}{U}{U} (the foretell cost), and I cast it from exile. Foretell cost is an alternative cost [702.143].

**Required reasoning:**
- 702.143 Foretell: when foretold, the card is exiled face-down with foretell counter.
- On a later turn, the card may be cast from exile for its foretell cost (alternative cost).
- Alternative cost = {1}{U}{U}, replaces the normal mana cost.

**Required citations:** `[702.143]`.

**Why this test matters:** Tests foretell as an alternative cost. Probes whether the engine understands the cast-from-exile mechanic.

---

## R5. Mutate creates a merged permanent

**Scenario:**
> I control [[Brokkos, Apex of Forever]] (my commander, 6/6). I cast [[Auspicious Starrix]] for its mutate cost, placing Auspicious Starrix on TOP of Brokkos. What is the merged permanent?

**Expected verdict:** A single permanent with Auspicious Starrix's printed name on top: it has the top card's name, types, P/T, mana cost, AND all abilities of all cards in the merged stack. Effectively, Auspicious Starrix is on top; the merged permanent is "Auspicious Starrix" (5/5 with Auspicious Starrix's abilities + Brokkos's abilities).

**Required reasoning:**
- 702.139 Mutate: when a creature mutates onto another, they merge into a single permanent.
- The merged permanent has the top card's name, mana cost, type line, and P/T.
- It has the abilities of every card in the merged stack.

**Required citations:** `[702.139]`, `[729.6]` (merged permanents).

**Why this test matters:** Mutate is uncommon but the merge rules are specific. Tests engine understanding of merged permanent identity.

---

---

# SCORING THE ARBITER

After running all tests, score by category:

| Score | Meaning |
|---|---|
| All correct, all axioms cited | Engine prompt is working. Trust it for everyday rulings. |
| All correct, axioms missing | Engine arrives at right answer but not through formal procedure. Tighten the prompt to require axiom citation explicitly. |
| 1-3 wrong verdicts | Engine has specific blind spots. Identify which category and revise the prompt to add an explicit handling note. |
| 4+ wrong verdicts | Engine prompt is not implementing the formal procedure. Major revision needed; possibly the model isn't following the structured-output requirement. |

The Arbiter is allowed to use `UNRESOLVED` if a test scenario is genuinely under-specified — that's not a failure. A failure is delivering a confident wrong verdict, or a correct verdict via casual reasoning without citing the rules.

---

# ADDING NEW TESTS

When you find an interaction in real play that the engine gets wrong, add it as a test case here:

```
## X.N. <one-line scenario description>

**Scenario:** <exact question to paste into Arbiter>

**Expected verdict:** <the correct answer>

**Required reasoning:** <bulleted steps the engine should take>

**Required citations:** <list of rule numbers and axioms>

**Why this test matters:** <what failure mode this catches>
```

Update the engine prompt when new tests reveal systematic gaps. The codex itself is the ground truth — if the codex says one thing and the engine says another, the engine is wrong, not the codex.

---

*Test cases v1.0 — paired with META_engine_system_prompt.md*
*Update whenever the engine prompt is revised or new edge cases surface*
