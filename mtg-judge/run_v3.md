# Arbiter Engine — Test Report

Generated: 2026-05-21 23:54:17
Model: `claude-sonnet-4-6` | Engine prompt: v1.0 | CR baseline: 2026-02-27

**31/76 passed**

## Per-test results

| Test | Title | Pass | Citations Found | Citations Missing | Duration |
|---|---|---|---|---|---|
| A1 | Leyline of the Void + creature death + Blood Artist | ✓ | Axiom-4, 614.6, 700.4 | — | 15.8s |
| A2 | Anafenza + Rest in Peace + Living Death (three-way replaceme | ✓ | 608.2 (partial: 608.2c), 614.6, 616.1a (partial: 616.1) | — | 36.0s |
| A3 | Commander dying with shield counter and Command Zone replace | ✗ | 903.9a | 701.7, 122.1g | 15.9s |
| B1 | Eminence ability triggering from the Command Zone | ✗ | — | 702.106, 603.6 | 13.0s |
| B2 | Reflexive trigger during resolution | ✓ | 608.2, 117.3b | — | 11.2s |
| B3 | State trigger that's already on the stack | ✗ | — | 603.8 | 12.3s |
| C1 | Commander damage with a copy of a commander | ✓ | 903.4, 707.2, 903.10 (partial: 903.10a) | — | 11.9s |
| C2 | Commander tax with alternative cost | ✓ | 903.7, 601.2f | — | 13.6s |
| C3 | Partner commanders with different color identities | ✗ | 903.4d (partial: 903.4) | 702.124 | 9.1s |
| C4 | Mutate onto a commander | ✗ | 903.9a | 729.6 | 17.2s |
| D1 | Sacrifice-as-cost with cost reducer | ✓ | 601.2f | — | 11.2s |
| E1 | Layer interaction — characteristic-defining ability and Humi | ✗ | 613.1f, 613.3 (partial: 613.3b) | 604.3 | 14.9s |
| E2 | Timestamp interaction | ✓ | 613.3c | — | 9.4s |
| F1 | Daybound/Nightbound in 4-player Commander | ✓ | 730.3 | — | 9.2s |
| F2 | APNAP in 4-player with simultaneous decisions | ✓ | 603.3b, 101.4 | — | 11.8s |
| G1 | Player leaving with stack objects | ✓ | 800.4a, 800.4, 800.4b (partial: 800.4) | — | 21.8s |
| H1 | The Replacement-vs-Replaced distinction | ✓ | Axiom-4, 614.6c (partial: 614.6), 700.4 | — | 14.1s |
| H3 | "Can't" Beats "Can" | ✓ | 101.2 | — | 13.4s |
| I1 | Stack object ownership confusion | ✗ | — | 112.3 | 9.8s |
| I2 | Mid-resolution state changes | ✓ | 608.2 | — | 12.0s |
| I3 | Modal spell — which mode is chosen? | ✗ | — | 601.2b | 1.3s |
| J1 | X cost is locked at casting | ✓ | 601.2f, 601.2b | — | 15.6s |
| J2 | Commander tax stacks with other taxes | ✓ | 903.7, 601.2f | — | 9.8s |
| J3 | Thalia DOES apply to noncreature commander | ✓ | 601.2i (partial: 601.2), 603.3b, 601.2f (partial: 601.2) | — | 18.3s |
| J4 | Phyrexian mana with life replacement | ✗ | — | 107.4, 601.2g, 101.2 | 11.8s |
| J5 | Cost reducer can't reduce colored requirement | ✓ | 601.2f | — | 12.3s |
| J6 | Additional cost (sacrifice) — what if the creature dies in r | ✓ | 601.2i, 117.3c, 601.2, 601.2g (partial: 601.2) | — | 14.2s |
| J7 | Alternative cost replaces base cost, additional costs still  | ✗ | 601.2f | 118.9 | 15.5s |
| J8 | Mana ability activated DURING cost payment | ✗ | 601.2g | 605.3a | 14.3s |
| K1 | Layer 1 (copy) applies before Layer 7 (P/T) | ✗ | 613.3c | 613.1a | 12.4s |
| K2 | Layer 2 control change — control-dependent abilities | ✗ | 613.1b (partial: 613.1) | 613.3c | 12.7s |
| K3 | Layer 4 type change cascades | ✓ | 608.2, 613.1d (partial: 613.1) | — | 15.2s |
| K4 | CDA vs. set effect — which wins in layer 7b? | ✗ | 613.3 | 613.1f, 604.3 | 18.4s |
| K5 | Set then modify in layer 7 | ✗ | — | 613.3a, 613.3c | 6.8s |
| K6 | P/T with +1/+1 counters | ✗ | — | 613.3d, 613.3c | 6.9s |
| K7 | Timestamp ordering on layer 7c modifiers | ✓ | 613.7 (partial: 613.7a), 613.3c | — | 8.5s |
| K8 | Dependencies override timestamps | ✗ | 613.1f (partial: 613.1), 613.1d (partial: 613.1), 613.7 | 613.3b | 28.1s |
| K9 | Static ability granted by counter | ✓ | 603.10 | — | 12.2s |
| K10 | Layer 7e — switch power/toughness | ✗ | — | 613.3e, 613.3c | 10.0s |
| L1 | Two replacements, controller of affected object chooses | ✓ | 616.1a (partial: 616.1) | — | 14.7s |
| L2 | Self-replacing effects bypass the 616 choice | ✗ | — | 608.2b, 101.2 | 3.9s |
| L3 | Replacement + prevention on same damage event | ✗ | — | 614.6, 615.1 | 10.0s |
| L4 | Three-way replacement on ETB counters | ✗ | 616.1a (partial: 616.1) | 614.6 | 18.4s |
| L5 | Self-replacing effects (614.5) apply first | ✗ | 704.5f | 614.6 | 16.2s |
| L6 | Replacement effect for "instead" damage rerouting | ✗ | — | 614.6, 614.9 | 11.8s |
| M1 | Basic mana ability — no stack | ✓ | 605.1 (partial: 605.1a), 605.3a | — | 10.4s |
| M2 | Triggered mana ability — uses stack | ✓ | 605.1 (partial: 605.1a), 605.1a | — | 15.6s |
| M3 | Mana pool empties between phases | ✓ | 106.4 | — | 7.3s |
| M4 | Mana abilities during cost payment (re-test from J8 angle) | ✗ | 605.3a | 601.2g | 11.8s |
| M5 | Restricted mana (snow, "spend only on") | ✗ | 608.2 | 107.4h | 8.5s |
| N1 | Multiple blockers and damage assignment order | ✗ | 510.1c | 509.1c | 17.1s |
| N2 | First strike damage step (only when needed) | ✗ | — | 702.7 | 9.0s |
| N3 | Trample with multiple blockers | ✓ | 702.19b, 510.1c | — | 10.0s |
| N4 | Lifelink rules | ✗ | 510.1c | 702.15b | 11.2s |
| N5 | Deathtouch with multiple blockers | ✗ | 510.1c | 702.2c | 12.2s |
| N6 | Creature removed from combat mid-step | ✗ | 509.1 (partial: 509.1h) | 510.1d | 14.7s |
| N7 | Indestructible + lethal damage | ✓ | 702.12, 704.5g | — | 17.5s |
| N8 | Damage prevention vs. damage replacement | ✗ | 614.6 | 614.5 | 10.8s |
| O1 | Tokens entering with counters | ✗ | — | 614.13 | 3.7s |
| O2 | Anafenza vs. token | ✗ | — | 704.5d | 10.7s |
| O3 | Token copy of a card with kicker | ✗ | 707.2 | 702.74 | 12.3s |
| O4 | Counters on a token that "should" carry | ✗ | — | 704.5d | 17.4s |
| P1 | Planeswalker loyalty abilities are sorcery-speed | ✗ | — | 606.5, 307.1 | 10.0s |
| P2 | Each planeswalker — loyalty once per turn | ✗ | — | 606.5b | 10.1s |
| P3 | Mana ability does not require priority | ✓ | 608.2, 605.3a | — | 11.8s |
| P4 | "Activate only once per turn" tracking | ✗ | — | 602.5 | 2.7s |
| Q1 | Mode chosen at casting | ✗ | 601.2b | 700.2 | 8.8s |
| Q2 | Modal spell with one mode becoming illegal | ✗ | 608.2b | 700.2 | 16.9s |
| Q3 | Charm "choose one or more" | ✓ | 700.2a | — | 9.0s |
| Q4 | Choose new targets and the illegality rule | ✗ | — | 115.6 | 10.8s |
| Q5 | As-enters choices | ✓ | 608.2, 601.2b | — | 11.3s |
| R1 | Cascade — exile order matters | ✗ | — | 702.85a | 9.0s |
| R2 | Cascade — what about X spells? | ✗ | 107.3 (partial: 107.3b), 704.5f | 702.85a | 15.4s |
| R3 | Suspend creates a delayed trigger | ✗ | — | 702.61 | 16.2s |
| R4 | Foretell — alternative cost from exile | ✓ | 702.143 | — | 10.7s |
| R5 | Mutate creates a merged permanent | ✗ | — | 702.139, 729.6 | 25.6s |

## Failed tests — detail

### A3 — Commander dying with shield counter and Command Zone replacement

**Scenario:**
```
I control my commander [[Atraxa, Praetors' Voice]]. It has one shield counter on it (from [[Shielded by Faith]] or similar). An opponent casts [[Murder]] targeting Atraxa. Atraxa would be destroyed. What happens?
```

**Expected:** The shield counter is removed; Atraxa is not destroyed; Atraxa remains on the battlefield with no shield counters. The Command Zone replacement (903.9a) never triggers because Atraxa never went to a graveyard.

**Failures:**
- Missing required citations: 701.7, 122.1g

**Arbiter response:**
```
STATE
Q1 — Murder is resolving; the destroy event is being applied to Atraxa.
Q2 — No SBAs currently applicable (process is mid-resolution).
Q3 — No triggers in waiting state yet.
Q4 — Not at a stable checkpoint.
Q5 — Priority has not yet been returned; resolution is in progress.

RESOLUTION

1. **WOULD-EVENT identified.** [[Murder]] resolves and attempts to destroy [[Atraxa, Praetors' Voice]]. [608.2]

2. **"Can't" check.** No "can't be destroyed" effect is present. Proceed.

3. **Replacement/prevention check.** The shield counter on Atraxa generates a replacement effect: "If a source would deal damage to this creature, prevent that damage and remove a shield counter from it. If this permanent would be destroyed, instead remove a shield counter from it." The destroy event is replaced: instead of being destroyed, a shield counter is removed from Atraxa. [614.6], [Axiom 2]

4. **Final event applied.** One shield counter is removed from Atraxa. Atraxa remains on the battlefield. The "destroy" instruction from [[Murder]] is fully consumed and produces no further effect. [614.6], [Axiom 4]

5. **Murder finishes resolving.** It moves to the graveyard. [608.2k]

6. **SBA loop.** Atraxa has no damage marked (shield counters prevent damage replacement, not relevant here), has 0 or more toughness? Atraxa is a 4/4 — no issue. No SBAs apply. [704.3]

7. **Trigger detection.** Any abilities that trigger on a counter being removed or a creature surviving destruction are checked. None specified in the scenario. If any exist, they enter the waiting state. [603.3]

8. **Priority returned to Active Player.** Game continues normally with Atraxa on the battlefield, now bearing zero shield counters (the one it had has been consumed). [117.3b]

RULE TRACE
- [608.2] — Spell resolution procedure.
- [614.6] — Replacement effect modifying a zone-change (destruction) event.
- [614.3] — Replacement effect applies before the event occurs.
- [704.3] — SBA check after resolution.
- [603.3] — Tri
```

### B1 — Eminence ability triggering from the Command Zone

**Scenario:**
```
I have [[Edgar Markov]] in the Command Zone (not cast yet). Eminence says "Whenever you cast another Vampire spell, create a 1/1 black Vampire creature token." I cast [[Bloodghast]]. Does Eminence trigger?
```

**Expected:** No. Bloodghast is not a Vampire (it's a Vampire Spirit — wait, actually it is a Vampire). Let me reconsider. Bloodghast IS a Vampire Spirit. So Eminence does trigger because Bloodghast is a Vampire spell.

Corrected verdict: **Yes**, Eminence triggers. A 1/1 black Vampire creature token is created w

**Failures:**
- Missing required citations: 702.106, 603.6

**Arbiter response:**
```
STATE
Q1 — No process currently resolving; casting is being declared.
Q2 — No SBAs applicable.
Q3 — No waiting triggers yet.
Q4 — Not yet stable; cast event is occurring.
Q5 — Active player is casting [[Bloodghast]].

RESOLUTION
1. Active player announces cast of [[Bloodghast]], a Vampire spell. [601.2]
2. Costs are paid; [[Bloodghast]] is placed on the stack. [601.2g]
3. WOULD-EVENT: A Vampire spell has been cast.
4. "Can't" check: none applicable. [614.17]
5. No replacement effects modify this cast event.
6. Final event: [[Bloodghast]] is now cast and on the stack.
7. Trigger detection: [[Edgar Markov]]'s Eminence ability checks — "Whenever you cast another Vampire spell." [[Bloodghast]] is a Vampire spell; it is not [[Edgar Markov]] himself, so "another" is satisfied. The source of the ability ([[Edgar Markov]]) is in the Command Zone; Eminence explicitly functions from the Command Zone. Condition met. [603.3]
8. Trigger enters waiting state. [Axiom 6]
9. Casting process finishes.
10. SBA check: none applicable. [704]
11. Waiting trigger is placed on the stack by the controller of [[Edgar Markov]]. [603.3b]
12. SBA check: still none.
13. Priority passes; trigger resolves: create a 1/1 black Vampire creature token.

RULE TRACE
- [601.2] — Casting procedure.
- [603.3] — Triggered ability detection at time of triggering event; Command Zone is a valid location for Eminence triggers per card text (golden rule override). [101.2]
- [603.3b] — Trigger insertion after SBAs.
- [903.4] — [[Edgar Markov]] retains its designation and identity in the Command Zone.
- Axiom 5 — Triggering and stack insertion are separate steps.
- Axiom 6 — Trigger enters waiting state before being placed on stack.

VERDICT
Yes — [[Edgar Markov]]'s Eminence trigger fires. [[Bloodghast]] is a Vampire spell that is not [[Edgar Markov]] himself, satisfying "another Vampire spell," and Eminence functions from the Command Zone by explicit card text. A 1/1 black Vampire token is created when the trigge
```

### B3 — State trigger that's already on the stack

**Scenario:**
```
[[Phage the Untouchable]] is in my graveyard. State-based actions are about to be checked. Will Phage's "if not cast from your hand, that player loses the game" trigger fire?
```

**Expected:** This isn't a state trigger — it's a triggered ability that fires when Phage *enters the battlefield* not from being cast from your hand. So if Phage was put onto the battlefield by Reanimate, it triggers; if it's just sitting in the graveyard, no trigger.

For an actual state-trigger test, consider:

**Failures:**
- Missing required citations: 603.8

**Arbiter response:**
```
STATE

Q1 — No process is currently resolving.
Q2 — SBAs are about to be checked. Phage is in the graveyard — no SBA applies to a creature card in the graveyard (704.5 does not trigger on graveyard objects).
Q3 — No triggered abilities are in the waiting state.
Q4 — The game is at a stable checkpoint proceeding to SBA check.
Q5 — Irrelevant to this question.

RESOLUTION

1. Identify the ability in question. [[Phage the Untouchable]] has an enters-the-battlefield triggered ability: "When Phage enters the battlefield, if you didn't cast it from your hand, you lose the game."
2. Triggered abilities only trigger when they detect their trigger event [603.1]. The trigger event here is Phage **entering the battlefield** — a zone change from any zone to the battlefield.
3. Phage is currently in the **graveyard**, not entering the battlefield. No zone-change event is occurring. No ETB event is being detected.
4. Triggered abilities do not monitor passive states of objects sitting in zones; they detect discrete events [603.2]. "Being in the graveyard" is not an event — it is a static state.
5. SBA checks examine the current board state for conditions defined in 704.5. None of those conditions reference Phage's triggered ability or its graveyard presence.
6. Therefore, no trigger fires during this SBA check.

RULE TRACE

- [603.1] — Triggered abilities trigger when their event occurs.
- [603.2] — Triggers monitor for events; static states do not constitute trigger events.
- [704.5] — SBA list; none apply to a creature card in a graveyard on these facts.
- Axiom 5 — Triggering and stack insertion are separate; triggering requires an event first.
- Axiom 6 — No trigger is in a waiting state because no event occurred.

VERDICT

No. [[Phage the Untouchable]]'s triggered ability does not fire during an SBA check while she sits in the graveyard — the trigger requires an ETB event, which has not occurred.
```

### C3 — Partner commanders with different color identities

**Scenario:**
```
I'm playing with partner commanders [[Tymna the Weaver]] and [[Thrasios, Triton Hero]]. Tymna is WB, Thrasios is GU. My deck includes [[Cyclonic Rift]]. Legal?
```

**Expected:** Yes. With partner, the deck's color identity is the union of both commanders' identities: W ∪ B ∪ G ∪ U = WUBG. Cyclonic Rift (blue) is legal in a WUBG deck.

**Failures:**
- Missing required citations: 702.124

**Arbiter response:**
```
STATE
Q1 — No process resolving.
Q2 — No SBAs applicable.
Q3 — No triggers waiting.
Q4 — Stable checkpoint; deck-legality question.
Q5 — Irrelevant to this question.

RESOLUTION
1. Determine the commander pair's combined color identity.
2. [[Tymna the Weaver]] has mana symbols W and B in her rules text/cost → color identity includes W, B.
3. [[Thrasios, Triton Hero]] has mana symbols G and U in his rules text/cost → color identity includes G, U.
4. Partner commanders share a combined color identity [903.4b]: {W}{B}{G}{U} — four colors.
5. Determine [[Cyclonic Rift]]'s color identity: mana cost is {1}{U} → color identity is U only.
6. U is present in the combined commander color identity {W}{B}{G}{U}.
7. [[Cyclonic Rift]]'s color identity is a subset of the deck's legal color identity → inclusion is legal [903.5b].

RULE TRACE
- [903.4b] — Partner commanders share a combined color identity for deck construction.
- [903.5b] — Each card in the deck must have a color identity that is a subset of the commander's color identity.
- [707] / [903.4] — Not implicated here; cited only for completeness re: commander designation.
- **Axiom 1** — Single ordered engine; color identity check is deterministic.

VERDICT
Yes, [[Cyclonic Rift]] is legal in this deck — its color identity (U) is a subset of the combined Tymna + Thrasios color identity (WBGU).
```

### C4 — Mutate onto a commander

**Scenario:**
```
My commander is [[Brokkos, Apex of Forever]]. I cast another mutate creature, [[Auspicious Starrix]], and mutate it onto Brokkos with Auspicious Starrix going on top. The merged permanent is then destroyed. Where do the cards go?
```

**Expected:** - Brokkos, as a commander, has the choice (per 903.9a) to be sent to the command zone instead of the graveyard.
- Auspicious Starrix has no such option — it goes to the graveyard.
- If the player chooses to send Brokkos to the command zone, only Brokkos moves to the command zone; Starrix goes to the

**Failures:**
- Missing required citations: 729.6

**Arbiter response:**
```
I need the Oracle text for both cards to rule precisely. I have canonical knowledge of these cards; I'll state the relevant text and proceed.

**[[Brokkos, Apex of Forever]]** — Legendary Creature. Has the Mutate ability. Has the keyword: *"You may cast Brokkos, Apex of Forever from your graveyard using its mutate ability."*

**[[Auspicious Starrix]]** — Creature. Has the Mutate ability. No special zone-change rules.

---

STATE

Q1 — No process is currently resolving.
Q2 — SBA check: the merged permanent has been destroyed; it is moving to a zone.
Q3 — Possible triggers pending zone-change; evaluated after final event.
Q4 — Not yet stable; zone-change replacement effects must be assessed first.
Q5 — Priority is suspended; zone-change is being processed.

---

RESOLUTION

1. **The merged permanent is destroyed.** Under mutate rules, all components of a mutated creature are treated as a single object on the battlefield. When that object leaves the battlefield, all components move together as a unit initially, then separate into individual cards in the destination zone [721.4].

2. **Zone-change replacement effect check for Brokkos.** Brokkos is a Commander. A Commander's owner may apply the Commander replacement effect, redirecting it from the graveyard (or any zone) to the Command Zone [903.9a]. This is a replacement effect applied before the final event [614.6].

3. **Zone-change replacement effect check for Auspicious Starrix.** Auspicious Starrix is NOT a Commander. No replacement effect applies. It proceeds to the graveyard.

4. **Multi-replacement interaction.** Each component card is evaluated independently for replacement effects when the merged permanent separates. Brokkos's owner chooses whether to apply [903.9a] to Brokkos. The two cards are not in competition for the same replacement effect — they are separate objects resolving their own zone-change destinations [616.1].

5. **Final event:** [[Auspicious Starrix]] goes to its owner's **graveyard**. [[Brok
```

### E1 — Layer interaction — characteristic-defining ability and Humility

**Scenario:**
```
[[Humility]] is on the battlefield: "All creatures lose all abilities and have base power and toughness 1/1." I control [[Tarmogoyf]] (a creature whose power/toughness are defined by the card types in all graveyards). What is Tarmogoyf's power and toughness?
```

**Expected:** Tarmogoyf is 1/1.

**Failures:**
- Missing required citations: 604.3

**Arbiter response:**
```
STATE
Q1 — No process resolving.
Q2 — No SBAs pending (will evaluate after we determine P/T).
Q3 — No waiting triggers.
Q4 — Stable checkpoint.
Q5 — Irrelevant to this rules question.

RESOLUTION

1. **Identify the relevant continuous effects.**
 - [[Humility]]: sets base power and toughness to 1/1 (layer 7b), and removes all abilities (layer 6).
 - [[Tarmogoyf]]: has a characteristic-defining ability (CDA) that sets its power and toughness based on card types in all graveyards (layer 7a).

2. **Apply Layer 6 — Ability removal.**
 [[Humility]] removes all abilities from all creatures [613.1f / layer 6]. [[Tarmogoyf]]'s CDA is an ability printed on the card. It is removed in layer 6. [[Tarmogoyf]] loses its CDA at this layer. [613.3b — CDAs are applied in layer 7a, but the *ability itself* is stripped in layer 6.]

3. **Apply Layer 7a — CDAs.**
 CDAs are applied in layer 7a [613.1g]. However, [[Tarmogoyf]]'s CDA was already removed in layer 6. Because the ability no longer exists on the object when layer 7a is evaluated, it contributes **nothing** in layer 7a. There is no CDA to apply.

4. **Apply Layer 7b — Base P/T setting effects.**
 [[Humility]]'s effect sets base power and toughness to 1/1 [613.1g, layer 7b]. This applies normally.

5. **No layer 7c or 7d modifications are present.**

6. **Final P/T: 1/1.**

RULE TRACE
- [613.1f] — Layer 6: effects that remove abilities.
- [613.1g] — Layer 7a: CDAs; layer 7b: effects that set P/T to specific values.
- [613.3b] — CDAs define characteristics of the object they're on; evaluated in layer 7a.
- The critical interaction: layer 6 is evaluated before layer 7a in the dependency/layer sequence. [[Humility]] strips the CDA in layer 6, so when layer 7a is evaluated, the CDA is absent. [[Humility]]'s base-P/T setter in layer 7b then governs.
- Axiom 1 — The game is one ordered engine; layers apply in sequence, not simultaneously.

VERDICT
[[Tarmogoyf]] is 1/1: [[Humility]] removes its CDA in layer 6 before layer 7a can apply
```

### I1 — Stack object ownership confusion

**Scenario:**
```
Player A casts [[Mind's Desire]] and exiles [[Brainstorm]]. Player A cast Brainstorm from exile per Mind's Desire's effect. Who is the controller of Brainstorm while it's on the stack?
```

**Expected:** Player A.

**Failures:**
- Missing required citations: 112.3

**Arbiter response:**
```
STATE
Q1 — Mind's Desire's storm copy has resolved; its effect is actively processing (exile and cast clause).
Q2 — No SBAs applicable.
Q3 — No triggers in waiting state relevant to this question.
Q4 — Not at a stable checkpoint; a spell is being cast via a resolving effect.
Q5 — The cast instruction is mandatory; controller identity is the question.

RESOLUTION
1. [[Mind's Desire]] resolves. Its effect instructs "you may cast" the exiled card without paying its mana cost. [608.2]
2. "You" in a spell or ability's text refers to that object's controller at the time of resolution. [109.5]
3. [[Mind's Desire]] is controlled by Player A. Therefore "you" = Player A throughout the resolution of Mind's Desire's effect.
4. When Player A casts [[Brainstorm]] via this effect, Player A is the one performing the cast action. The controller of a spell on the stack is the player who put it there. [108.4]
5. Player A cast Brainstorm; Player A is its controller on the stack.

RULE TRACE
- [109.5] — "You" in an object's text refers to that object's controller.
- [108.4] — A spell's controller is the player who cast it (put it onto the stack).
- [608.2] — Resolution of a spell or ability follows the text in order; the controller of the resolving object executes all instructions.
- Axiom 1 — The game is one ordered engine; controller identity propagates consistently through resolution.

VERDICT
Player A controls [[Brainstorm]] on the stack, because Player A controlled [[Mind's Desire]] when it resolved, and "you" in its effect instructs Player A to perform the cast.
```

### I3 — Modal spell — which mode is chosen?

**Scenario:**
```
When is the mode chosen for a modal spell — at casting or at resolution?
```

**Expected:** At casting (601.2b). The mode is locked in when the spell is cast.

**Failures:**
- Missing STATE section
- Missing RESOLUTION section
- Missing RULE TRACE section
- Missing VERDICT (or UNRESOLVED/LEGAL ACTIONS) section
- Missing required citations: 601.2b

**Arbiter response:**
```
"[Hand off to Nissa]"
```

### J4 — Phyrexian mana with life replacement

**Scenario:**
```
I control [[Platinum Emperion]] (my life total can't change). I want to cast [[Mutagenic Growth]] paying its Phyrexian green: 2 life instead of {G}. Can I cast it?
```

**Expected:** No. Paying 2 life requires losing 2 life. Platinum Emperion's static "your life total can't change" prevents this loss. Since the cost cannot be paid, the spell cannot be cast [101.2, 601.2g].

**Failures:**
- Missing required citations: 107.4, 601.2g, 101.2

**Arbiter response:**
```
STATE
Q1 — No process currently resolving.
Q2 — No SBAs applicable.
Q3 — No waiting triggers.
Q4 — Stable checkpoint; player has priority.
Q5 — Active player holds priority and wishes to cast [[Mutagenic Growth]] by paying 2 life instead of {G}.

RESOLUTION
1. **Identify the cost.** [[Mutagenic Growth]] has a Phyrexian mana symbol ({G/P}). The caster may pay either {G} or 2 life to satisfy that symbol. Paying 2 life is a cost option declared during the casting process. [601.2b, 601.2f]
2. **Lock in cost choice.** At the point costs are locked in during casting [601.2f], the player chooses to pay 2 life rather than {G}.
3. **Apply "can't" check before the event.** [[Platinum Emperion]]'s text states "your life total can't change." This is a "can't" effect under [614.17]. It prevents any event that would change the player's life total. Paying 2 life *is* a life total change event.
4. **"Can't" effects are not ordinary replacement effects — they prohibit the event entirely.** [614.17] The life payment cannot occur. The cost cannot be paid as chosen.
5. **Cost is unpayable.** Since the player has no {G} available (or chooses not to pay it, and the life payment is prohibited), the chosen cost structure fails. If {G} is also unavailable, the spell cannot be cast at all. If {G} *is* available, the player may instead pay {G} legally.

RULE TRACE
- [601.2b] — choosing how to pay Phyrexian mana symbols during casting.
- [601.2f] — cost lock-in point during casting.
- [614.17] — "can't" effects; the life payment is a life total change and is prohibited.
- **Axiom 3** — "Can't" effects are not replacement effects; they categorically prevent the event.
- **Axiom 2** — Replacement/prevention checked before the event occurs.

VERDICT
While [[Platinum Emperion]] is on the battlefield under your control, you cannot pay 2 life for [[Mutagenic Growth]]'s Phyrexian cost because your life total can't change [614.17]; you may only cast it by paying {G} instead.
```

### J7 — Alternative cost replaces base cost, additional costs still apply

**Scenario:**
```
I want to cast [[Force of Will]] using its alternative cost: exile a blue card from my hand and pay 1 life. My opponent controls [[Trinisphere]] ("Each spell costs at least {3} to cast"). Does Trinisphere apply?
```

**Expected:** Yes. Trinisphere's effect modifies the *total cost* of the spell, including when an alternative cost is paid. Force of Will's alternative cost is {0} mana + exile blue card + 1 life. Trinisphere raises the total mana cost to {3}. So Force of Will costs: {3} + exile blue card + 1 life.

**Failures:**
- Missing required citations: 118.9

**Arbiter response:**
```
STATE
Q1 — No process currently resolving; we are in the casting declaration phase.
Q2 — No SBAs applicable.
Q3 — No waiting triggers relevant.
Q4 — Stable checkpoint; player is attempting to cast a spell.
Q5 — Active player has priority and is attempting to cast [[Force of Will]] via alternative cost.

---

RESOLUTION

1. **Declare the spell and choose alternative cost.** The player announces [[Force of Will]] and selects the alternative cost (exile a blue card from hand + pay 1 life) instead of the normal mana cost {3}{U}{U}. [601.2b]

2. **Lock in the total cost.** The total cost is calculated as: start with the chosen cost basis (alternative cost = {0} mana + the exile/life payment), then apply cost increases and reductions. [[Trinisphere]] imposes a cost increase requirement: if the total mana component of a spell's cost is less than {3}, it is raised to {3}. [601.2f], [601.2e]

3. **Apply Trinisphere's effect.** [[Trinisphere]]'s Oracle text reads: "Each spell costs at least {3} to cast." The alternative cost here has a mana component of {0}. [[Trinisphere]] checks the total mana that will be paid; since {0} < {3}, it raises the mana cost component to {3}. This is a cost-increase continuous effect applied during cost assembly. [601.2f], [613]

4. **Final cost assembly.** The player must pay: {3} (mana, mandated by [[Trinisphere]]) + exile a blue card from hand + pay 1 life. The non-mana components of the alternative cost are unaffected — [[Trinisphere]] only affects the mana component. [601.2f]

5. **Payment required.** The spell is only legally cast if the player can and does pay {3} in mana plus the alternative cost's non-mana components. If the player cannot pay {3}, the spell cannot be cast this way.

---

RULE TRACE
- [601.2b] — Choosing an alternative cost during spell announcement.
- [601.2e] — Additional costs, alternative costs, and cost modifications all applied before payment.
- [601.2f] — Total cost is locked in; mana component and non-mana compone
```

### J8 — Mana ability activated DURING cost payment

**Scenario:**
```
I want to cast [[Cryptic Command]] (cost {1}{U}{U}{U}). I have 3 Islands tapped already and an [[Urza's Tower]] (taps for {3}) untapped. Can I tap Urza's Tower to add mana during cost payment, after I've already started paying?
```

**Expected:** Yes. Mana abilities (605) can be activated during cost payment without using the stack. Players may activate them between announcing a spell and finishing payment [605.3a].

**Failures:**
- Missing required citations: 605.3a

**Arbiter response:**
```
STATE
Q1 — No process currently resolving; player is in the process of casting a spell.
Q2 — No SBAs applicable.
Q3 — No waiting triggers relevant.
Q4 — Not at a stable checkpoint; casting is in progress.
Q5 — Active player is in the middle of declaring costs/paying for [[Cryptic Command]].

RESOLUTION
1. Casting a spell proceeds through the steps of CR 601.2. The relevant sub-steps here are cost determination and payment.
2. **601.2f — Cost lock-in.** At this step, the total cost is calculated and locked in. For [[Cryptic Command]], the total cost is {1}{U}{U}{U}.
3. **601.2g — Mana abilities may be activated.** After costs are locked in, the player may activate mana abilities to add mana to their mana pool. Tapping [[Urza's Tower]] is a mana ability [605.1a] and may be activated here. It produces {3} (assuming Urzatron is not assembled; if it is, it produces more — but the exact output does not affect the legal analysis).
4. **601.2h — Costs are paid.** The player pays the locked-in cost using available mana. There is no rule requiring that mana be "pre-arranged" before 601.2g; mana abilities can be activated during 601.2g in any order and combination.
5. The player already has {U}{U}{U} from the three tapped Islands. Tapping [[Urza's Tower]] adds {3} (colorless). Total available: {3}{U}{U}{U}. The cost {1}{U}{U}{U} is fully payable: {1} from the colorless {3}, {U}{U}{U} from the Islands.
6. There is no rule prohibiting activating a mana ability mid-payment sequence. 601.2g explicitly exists to allow this.

RULE TRACE
- [601.2f] — Cost lock-in step; total cost calculated before payment begins.
- [601.2g] — Player may activate mana abilities after lock-in and before/during payment.
- [601.2h] — Costs are paid using mana in pool.
- [605.1a] — Tapping a land for mana is a mana ability, not a spell or activated ability that uses the stack.
- Axiom 1 — The game is one ordered engine; 601.2 sub-steps are sequential and well-defined.

VERDICT
Yes — [[Urza's Tower]] can b
```

### K1 — Layer 1 (copy) applies before Layer 7 (P/T)

**Scenario:**
```
I control [[Phyrexian Metamorph]] entering as a copy of an opponent's [[Birds of Paradise]] (1/1). I also control [[Glorious Anthem]] ("Creatures you control get +1/+1"). What is Phyrexian Metamorph's power and toughness?
```

**Expected:** 2/2. The copy effect in layer 1 sets the printed/copyable values to Birds of Paradise's (1/1). Layer 7c then applies Glorious Anthem's +1/+1. Result: 2/2.

**Failures:**
- Missing required citations: 613.1a

**Arbiter response:**
```
STATE
Q1 — No process currently resolving.
Q2 — No SBAs applicable (1/1 base +1/1 anthem = 2/2; no zero-toughness issue).
Q3 — No relevant waiting triggers.
Q4 — Stable checkpoint after ETB.
Q5 — Active player holds priority.

RESOLUTION
1. [[Phyrexian Metamorph]] enters as a copy of [[Birds of Paradise]]. The copy effect establishes the copiable values of the Metamorph: name, mana cost, type, color, power/toughness, and rules text all become those of [[Birds of Paradise]] — a 0/1. [707.2, 707.3]
2. The copy effect operates in Layer 1 (copiable values) but is applied as a characteristic-defining effect in Layer 7a (base power/toughness). The result: Metamorph's base power/toughness is **0/1**. [613.3, 707.3]
3. [[Glorious Anthem]] applies in Layer 7c (+1/+1 to all creatures you control). Metamorph is a creature you control, so it receives +1/+1. [613.3c]
4. Layers apply in order 7a → 7c. Final result: 0+1 / 1+1 = **1/2**. [613.7]

RULE TRACE
- [707.2] — Copy effect duplicates copiable values of the chosen permanent.
- [707.3] — Copiable values include printed values and previous copy effects; base P/T is 0/1 from [[Birds of Paradise]].
- [613.3] — Continuous effects applied in layers.
- [613.3a/c] — Layer 7a sets base P/T; Layer 7c applies +1/+1 modifications.
- [613.7] — Layers applied in order; 7a before 7c.
- Axiom 4 — The rest of the engine (including anthem) sees the final post-copy object.

VERDICT
[[Phyrexian Metamorph]] copying [[Birds of Paradise]] under [[Glorious Anthem]] is a **1/2**: base 0/1 from the copy effect (Layer 7a), then +1/+1 from the Anthem (Layer 7c).
```

### K2 — Layer 2 control change — control-dependent abilities

**Scenario:**
```
Player A controls [[Steal Enchantment]] enchanting Player B's [[Honor of the Pure]] ("Creatures you control get +1/+1"). Player A has 2/2 humans on the battlefield. Player B has 2/2 humans. Whose creatures get +1/+1?
```

**Expected:** Player A's creatures get +1/+1. "Creatures you control" refers to the controller of Honor of the Pure. After Steal Enchantment, Honor of the Pure's controller is Player A. So "you" = Player A.

**Failures:**
- Missing required citations: 613.3c

**Arbiter response:**
```
I need the Oracle text of both cards to give a precise ruling. Let me work with the standard Oracle text for these cards.

**[[Steal Enchantment]]** — Enchant enchantment. You control enchanted enchantment.
**[[Honor of the Pure]]** — Creatures you control that are white get +1/+1.

*(Note: The question paraphrases Honor of the Pure as "Creatures you control get +1/+1" — I am using actual Oracle text which includes the white restriction. If your version differs, flag it.)*

---

STATE
Q1 — No process resolving; static abilities are applying continuously.
Q2 — No SBAs applicable.
Q3 — No triggers waiting.
Q4 — Stable checkpoint; continuous effects are layered.
Q5 — Irrelevant to this static-effect question.

---

RESOLUTION

1. **[[Steal Enchantment]] grants control of [[Honor of the Pure]] to Player A.** The enchantment's controller is now Player A. [301.5 / Aura rules — controller of an Aura is the controller of the Aura itself, not the enchanted permanent.]

2. **[[Honor of the Pure]]'s ability is a static ability generating a continuous effect.** It reads: "Creatures *you* control that are white get +1/+1." The word "you" refers to the object's current controller. [109.5 — "You" in an object's text refers to that object's controller.]

3. **Player A controls [[Honor of the Pure]].** Therefore "you" = Player A. The effect applies to white creatures Player A controls.

4. **Player A's 2/2 humans receive +1/+1 if they are white.** Player B's creatures receive nothing, because Player B does not control [[Honor of the Pure]].

---

RULE TRACE
- [109.5] — "You" refers to the object's controller.
- [301.5] — Controller of an Aura is separate from controller of enchanted permanent.
- [613.1] — Continuous effects apply in layers; this is a layer 7c power/toughness effect.
- Axiom 1 — The game sees the final state: Honor of the Pure's controller is Player A.

---

VERDICT
Player A controls [[Honor of the Pure]] via [[Steal Enchantment]], so "you" refers to Player A — **Pla
```

### K4 — CDA vs. set effect — which wins in layer 7b?

**Scenario:**
```
[[Tarmogoyf]] has a characteristic-defining ability setting its P/T based on card types in graveyards. There are 5 card types in graveyards. I cast [[Overwhelming Splendor]] ("Each creature has base power and toughness 1/1 and loses all abilities"). What is Tarmogoyf?
```

**Expected:** 1/1 with no abilities. Overwhelming Splendor's effects apply in layer 6 (lose all abilities) and layer 7b (set base P/T 1/1). Layer 6 removes the CDA. Layer 7b (Tarmogoyf's CDA would have set base) no longer applies because the CDA is gone. Layer 7b then applies Overwhelming Splendor's set effect: 1

**Failures:**
- Missing required citations: 613.1f, 604.3

**Arbiter response:**
```
STATE

Q1 — No process resolving (Overwhelming Splendor has already resolved and is an enchantment on the battlefield).
Q2 — No SBAs currently triggered by this query.
Q3 — No waiting triggers relevant.
Q4 — Stable checkpoint; examining continuous effect interaction.
Q5 — Not priority-relevant; this is a static effect layer question.

---

RESOLUTION

1. **Identify the two continuous effects.**
 - [[Tarmogoyf]]'s characteristic-defining ability (CDA): sets base P/T to \*/\*+1 where \* = number of card types in all graveyards. [208.3]
 - [[Overwhelming Splendor]]: (a) sets base P/T to 1/1 and (b) causes Tarmogoyf to lose all abilities.

2. **Layer 7 analysis — P/T.** Both effects set *base* P/T. Apply layer ordering rules. [613.3]

3. **Determine timestamps.** Tarmogoyf's CDA is a static ability of a permanent on the battlefield. Overwhelming Splendor entered the battlefield later (it was just cast). Therefore Overwhelming Splendor has the later timestamp. [613.7b]

4. **CDAs receive special treatment.** A characteristic-defining ability that sets P/T applies in layer 7a *regardless of timestamp* — but only while the object is in a zone where the ability functions AND the ability still exists on the object. [613.5, 208.3]

5. **Critical interaction — ability removal precedes P/T setting within the same object's evaluation.** Overwhelming Splendor applies in two layers:
 - Layer 6: Tarmogoyf **loses all abilities** (including its CDA). [613.3f]
 - Layer 7a: Overwhelming Splendor sets base P/T to 1/1. [613.3g / 208.3]

6. **Because the CDA is stripped in Layer 6 before Layer 7a is evaluated,** Tarmogoyf's CDA does not apply in Layer 7a at all. Only Overwhelming Splendor's base P/T effect exists in Layer 7a. [613.5 — a CDA only applies while the ability exists on the object]

7. **Result:** Tarmogoyf is a 1/1 with no abilities.

---

RULE TRACE

- [208.3] — CDA sets P/T in layer 7a; functions only while the ability exists on the object.
- [613.3f] — Layer 6: ability-rem
```

### K5 — Set then modify in layer 7

**Scenario:**
```
I control [[Tarmogoyf]] (a 4/5 from 4 card types in graveyards). I cast [[Bound in Silence]] on it — wait, that doesn't change P/T. Use this: I cast [[Sleep]] (taps creatures) — also doesn't. Better example: [[Crab Umbra]]? Replace with: I control a [[Maro]] (CDA: P/T = number of cards in your hand, currently 5/5). I cast [[Sleeper Agent]] which has P/T... actually let's use Goblin Cohort.
```

**Expected:** Maro is 2/2. Layer 7a CDA: 4/4. Layer 7c applies +1/+1 (Anthem) and -3/-3 (Crippling Fear) by timestamp. Net: 4+1-3 / 4+1-3 = 2/2.

**Failures:**
- Missing STATE section
- Missing RESOLUTION section
- Missing RULE TRACE section
- Missing required citations: 613.3a, 613.3c

**Arbiter response:**
```
UNRESOLVED

The question is underspecified in multiple ways:

1. **No stable scenario has been presented.** The prompt contains a chain of self-corrections that never terminates in a single, well-formed board state and question. The final card named ([[Goblin Cohort]]) is mentioned without a question being posed about it.

2. **No Oracle text has been provided** for [[Maro]], [[Goblin Cohort]], or any other card in the final attempted scenario. Per hard constraints, Oracle text must be provided to proceed.

3. **No rules question has been stated.** Even if a board state were locked in, the engine requires a defined interaction or question to process (e.g., "what is Maro's P/T after X resolves?" or "does Y trigger when Z enters?").

---

**To receive a ruling, resubmit with:**

- A single, stable board state (no mid-prompt corrections)
- Oracle text for every relevant card
- A specific, answerable rules question
```

### K6 — P/T with +1/+1 counters

**Scenario:**
```
I control a [[Glistener Elf]] (1/1) with one +1/+1 counter on it. [[Glorious Anthem]] is in play (+1/+1 to my creatures). What is Glistener Elf's P/T?
```

**Expected:** 3/3. Base 1/1 → layer 7c Glorious Anthem +1/+1 → 2/2 → layer 7d counters +1/+1 → 3/3.

**Failures:**
- Missing required citations: 613.3d, 613.3c

**Arbiter response:**
```
STATE
Q1 — No process resolving.
Q2 — No SBAs applicable.
Q3 — No waiting triggers.
Q4 — Stable checkpoint.
Q5 — Irrelevant to this P/T calculation.

RESOLUTION
1. Base P/T: [[Glistener Elf]] has a printed base of 1/1. [613.1a]
2. Layer 6 (P/T setting): No layer-6 effects present. Base remains 1/1.
3. Layer 7a (switching): Not applicable.
4. Layer 7b (P/T modification from characteristic-defining abilities): Not applicable.
5. Layer 7c (counters): One +1/+1 counter adds +1/+1 → 2/2. [613.7c / 122.2]
6. Layer 7d (other effects): [[Glorious Anthem]] applies +1/+1 → 3/3. [613.7d]

RULE TRACE
- [613.1a] — Base P/T from printed values.
- [613.7c] — Counters applied in layer 7c.
- [613.7d] — Continuous P/T-modifying effects (Glorious Anthem) applied in layer 7d.
- Axiom 1 — Ordered engine; layers resolve in sequence.

VERDICT
[[Glistener Elf]] is a 3/3.
```

### K8 — Dependencies override timestamps

**Scenario:**
```
[[Humility]] (timestamp T1, "all creatures lose abilities and are base 1/1") and [[Opalescence]] (timestamp T2, "non-Aura enchantments become 4/4 creatures") are both on the battlefield. After all effects, what are Humility and Opalescence?
```

**Expected:** Both are 4/4 creatures with no abilities (1/1 from Humility doesn't apply because Opalescence's later timestamp makes them 4/4 in layer 7b). Wait — let me re-derive carefully.

Actually: **Both are 4/4 with no abilities.** Opalescence applies first (it makes Humility a creature). Then Humility, bein

**Failures:**
- Missing required citations: 613.3b

**Arbiter response:**
```
STATE
Q1 — No process resolving.
Q2 — No SBAs applicable (both objects are legal on the battlefield).
Q3 — No waiting triggers.
Q4 — Stable checkpoint.
Q5 — Irrelevant to this layer analysis.

RESOLUTION

**Layer framework governs.** [613.1] All continuous effects are applied in layer order. The critical layers here are Layer 4 (type-changing) and Layer 7 (power/toughness).

---

**Step 1 — Establish the effects.**

- [[Humility]] (T1): Layer 4 effect — creatures lose all abilities. Layer 7b effect — sets base P/T to 1/1.
- [[Opalescence]] (T2): Layer 4 effect — non-Aura enchantments become creature types (among others) and are 4/4.

Both effects apply in all relevant layers. Dependency must be checked before timestamp order is used. [613.7a]

---

**Step 2 — Check dependency. [613.7]**

An effect X is *dependent* on effect Y if applying Y first would change what X applies to, or change the text of X itself.

- **Does Humility depend on Opalescence?** Opalescence makes Humility a creature. Humility's Layer 4 component says "all creatures lose abilities." If Opalescence applies first, Humility itself becomes a creature — which means Humility then falls within the scope of its *own* Layer 4 ability ("all creatures lose abilities"). Applying Opalescence first **changes what Humility's Layer 4 effect affects** (now includes Humility itself). Therefore **Humility's Layer 4 effect is dependent on Opalescence.** [613.7a]

- **Does Opalescence depend on Humility?** Humility's Layer 4 strips abilities. Opalescence is an enchantment; if Humility applies first and strips Opalescence's ability, Opalescence would no longer generate its own effect — this would change what Opalescence does entirely. Therefore **Opalescence's effect is dependent on Humility's Layer 4 effect.** [613.7a]

**Circular dependency detected.** Each effect is dependent on the other. When a dependency loop exists, the dependency rule does not reorder them — you fall back to **timestamp order** to break the 
```

### K10 — Layer 7e — switch power/toughness

**Scenario:**
```
I control a [[Phantom Warrior]] (2/2). I cast [[Inside Out]] on it ("Switch the power and toughness of target creature until end of turn"). [[Glorious Anthem]] is also in play. What is Phantom Warrior's P/T?
```

**Expected:** 3/3 (it's symmetrical so switching has no visible effect). Tracing: Layer 7c Anthem +1/+1 → 3/3. Layer 7e switch → 3/3 (same).

If we instead made the creature non-symmetrical (e.g., a 1/3 Llanowar Visionary with Anthem):
- Base: 1/3.
- Layer 7c: +1/+1 → 2/4.
- Layer 7e: switch → 4/2.

Use the non-s

**Failures:**
- Missing required citations: 613.3e, 613.3c

**Arbiter response:**
```
STATE
Q1 — No process currently resolving.
Q2 — No SBAs applicable (creature is alive).
Q3 — No waiting triggers.
Q4 — Stable checkpoint.
Q5 — Active player has priority; no action required to resolve the question.

RESOLUTION
1. Establish base P/T. [[Phantom Warrior]] has a printed P/T of 2/2. Base values: 2/2. [613.1a, Layer 7a]
2. Apply [[Glorious Anthem]]-type effect (+1/+1 to all creatures you control). This is a static continuous effect applying in Layer 7c. P/T is now 3/3. [613.1c, Layer 7c]
3. Apply [[Inside Out]] switch effect. This is a switch effect applying in Layer 7e (power/toughness switching). The switch sees the values as they exist after all earlier layers — i.e., 3/3 after the Anthem — and swaps them. Result: 3/3 → 3/3. [613.1e, Layer 7e]

RULE TRACE
- [613.1] — Seven-layer system for continuous effects.
- [613.1a] — Layer 7a: set P/T from characteristic-defining abilities.
- [613.1c] — Layer 7c: effects that modify P/T (Anthem +1/+1 applied here).
- [613.1e] — Layer 7e: switching effects applied last within Layer 7.
- Axiom 1 — The game is one ordered engine; layers apply in sequence.

VERDICT
[[Phantom Warrior]] is 3/3: the [[Glorious Anthem]] bonus raises it to 3/3 in Layer 7c, and the [[Inside Out]] switch in Layer 7e swaps equal values, leaving it at 3/3.
```

### L2 — Self-replacing effects bypass the 616 choice

**Scenario:**
```
[[Lifelink]] grants "the source's controller gains that much life when this deals damage." A creature with lifelink deals 4 damage and the controller has [[Sanguine Bond]] also out ("Whenever you gain life, target opponent loses that much life"). Wait — Sanguine Bond is a trigger, not a replacement. Let me redo.
```

**Expected:** No, Lightning Bolt cannot be countered due to Vexing Shusher's static ability. Counterspell will resolve but its "counter target spell" effect cannot apply to Lightning Bolt. Per 608.2b, if all targets become illegal during resolution, the spell is countered by the rules; here, the target was legal 

**Failures:**
- Missing STATE section
- Missing RESOLUTION section
- Missing RULE TRACE section
- Missing required citations: 608.2b, 101.2

**Arbiter response:**
```
You've correctly identified the error mid-question. Let me note what's happening and wait for your actual question.

UNRESOLVED

You have not submitted a complete, answerable scenario. You began constructing a board state, identified an error in your own framing, and stopped.

**What is needed:**
- The complete board state (creatures, life totals, relevant permanents)
- The specific rules interaction or outcome you want resolved
- Whose turn it is / what action was taken

Resubmit when ready.
```

### L3 — Replacement + prevention on same damage event

**Scenario:**
```
A 3/3 creature deals 3 combat damage to me. I control [[Soul Warden]] — wait, that's a trigger. I control [[Spirit Link]] enchanting the attacker ("Whenever enchanted creature deals damage, you gain that much life") — also a trigger. Better: I have a [[Shielding Plax]] effect "If a source would deal damage to you, prevent 1 of that damage." My opponent also enchanted me with [[Embargo]] — wait, doesn't help.
```

**Expected:** 1 damage. Healing Salve prevents 3 of the 4 damage. The other 1 deals to me.

**Failures:**
- Missing STATE section
- Missing RESOLUTION section
- Missing RULE TRACE section
- Missing required citations: 614.6, 615.1

**Arbiter response:**
```
The scenario as stated is **underspecified**. I need you to specify which card or effect you actually want ruled on before I can execute.

---

UNRESOLVED

**Reason:** The prompt presents three or four candidate scenarios and abandons each one mid-description. No single coherent board state or rules question is locked in. Specifically:

- **[[Soul Warden]]** — you flagged it and moved on. No question stated.
- **[[Spirit Link]]** — you flagged it and moved on. No question stated.
- **[[Shielding Plax]] "prevent 1 damage"** — this is not [[Shielding Plax]]'s Oracle text. [[Shielding Plax]] does not have a damage-prevention ability. If you are describing a *different* card or a hypothetical effect, I cannot rule on unnamed/fabricated card text without you specifying it explicitly.
- **[[Embargo]]** — you abandoned this yourself.

**Additionally:** I do not have Oracle text on file for a "prevent 1 of that damage" static prevention effect anchored to you as a player (rather than a permanent). If you mean [[Rune of Protection]], [[Circle of Protection]], [[Kor Firewalker]], or a similar card, name it.

---

**To get a ruling, resubmit with:**

1. The single specific card or effect you want analyzed.
2. Its exact Oracle text (or confirm I should use the named card's official text).
3. A clean board state: who controls what, what event is occurring, what interaction you are asking about.
```

### L4 — Three-way replacement on ETB counters

**Scenario:**
```
I control [[Doubling Season]], [[Pir, Imaginative Rascal]] ("If one or more +1/+1 counters would be put on a permanent you control, that many plus one +1/+1 counters are put on it instead"), and [[Hardened Scales]]. I cast [[Walking Ballista]] with X=1. Maximum counters possible?
```

**Expected:** Optimal ordering yields 8 counters.

Pir = "+1 counter if any would be put on a permanent I control" (same effect as Hardened Scales but for any permanent).

Three replacements: Doubling Season (doubles), Pir (+1), Hardened Scales (+1).

Try orderings:
- DS, Pir, HS: 1→2→3→4
- DS, HS, Pir: 1→2→3→4
-

**Failures:**
- Missing RESOLUTION section
- Missing RULE TRACE section
- Missing VERDICT (or UNRESOLVED/LEGAL ACTIONS) section
- Missing required citations: 614.6

**Arbiter response:**
```
STATE
Q1 — Yes: [[Walking Ballista]] is being cast and will resolve.
Q2 — No SBAs applicable yet (Ballista enters with counters, so 0/0 SBA is not triggered).
Q3 — No waiting triggers yet.
Q4 — Not stable; resolving a spell.
Q5 — Active player will have priority after resolution.

---

## RESOLUTION

**The base event:** Walking Ballista enters with X=1, meaning the instruction is "put 1 +1/+1 counter on it as it enters."

We now process the three replacement effects against the single would-event: **"1 counter would be placed."**

---

### Step 1 — Identify all applicable replacement effects

Three replacements apply to "counters being placed on a permanent you control":

- **[[Hardened Scales]]** (HS): "If one or more +1/+1 counters would be placed on a permanent you control, put one additional counter on it."
- **[[Pir, Imaginative Rascal]]** (Pir): "If one or more +1/+1 counters would be placed on a permanent you control, that many plus one are placed instead."
- **[[Doubling Season]]** (DS): "If one or more counters would be placed on a permanent you control, double them."

All three apply. [614.1]

---

### Step 2 — Determine application order [616.1]

The affected player (you) chooses the order to apply layered replacement effects that modify the same event. [616.1c]

You want to **maximize** counters. Evaluate all six orderings of three effects:

| Order | Calculation | Result |
|---|---|---|
| HS → Pir → DS | (1+1=2) → (2+1=3) → (3×2=6) | **6** |
| HS → DS → Pir | (1+1=2) → (2×2=4) → (4+1=5) | 5 |
| Pir → HS → DS | (1+1=2) → (2+1=3) → (3×2=6) | **6** |
| Pir → DS → HS | (1+1=2) → (2×2=4) → (4+1=5) | 5 |
| DS → HS → Pir | (1×2=2) → (2+1=3) → (3+1=4) | 4 |
| DS → Pir → HS | (1×2=2) → (2+1=3) → (3+1=4) | 4 |

The maximum achievable is **6**, reached by applying DS **last**.

---

### Step 3 — Final event

[[Walking Ballista]] enters the battlefield with **6 +1/+1 counters**.

---

### Step 4 — SBA check [704.5f]

Ballista is a 0/0 creature base, but it has 6 co
```

### L5 — Self-replacing effects (614.5) apply first

**Scenario:**
```
[[Solemnity]] is on the battlefield ("Players can't get counters. Permanents enter the battlefield without counters"). I control [[Hangarback Walker]] (an artifact creature that enters with X +1/+1 counters). I cast Hangarback Walker with X=3. What happens?
```

**Expected:** Hangarback Walker enters with 0 +1/+1 counters. Solemnity's "permanents enter without counters" replacement substitutes the ETB-with-counters event to ETB-without. The 3 counters are not placed.

**Failures:**
- Missing required citations: 614.6

**Arbiter response:**
```
STATE
Q1 — No process currently resolving (casting is being evaluated).
Q2 — No SBAs applicable yet.
Q3 — No triggers in waiting state.
Q4 — Not at a stable checkpoint; spell is being cast.
Q5 — Active player is casting [[Hangarback Walker]]; X=3 chosen.

RESOLUTION

1. **Cost lock-in [601.2f]:** X is declared as 3. The total mana cost is {6} (2X). This cost is paid and locked in. X=3 is part of the spell's characteristics on the stack.

2. **[[Hangarback Walker]] resolves and would enter the battlefield with three +1/+1 counters** — its printed text says "enters the battlefield with X +1/+1 counters on it," where X=3.

3. **"Can't" check [614.17]:** [[Solemnity]] creates a replacement effect that says permanents enter the battlefield without counters. This is a "can't" effect — it overrides any instruction to place counters as part of an ETB event. No counters are placed.

4. **Final event [Axiom 4]:** [[Hangarback Walker]] enters the battlefield with zero +1/+1 counters. The engine sees only this final event — it entered with no counters.

5. **SBA check [704.5f]:** A creature with toughness 0 or less is put into its owner's graveyard as a state-based action. [[Hangarback Walker]] is 0/0 (its power and toughness are each defined as X, but X on the battlefield is evaluated from counters — it has none). Toughness = 0. SBA fires immediately.

6. **[[Hangarback Walker]]'s death trigger:** Its printed ability ("When Hangarback Walker dies, create a 1/1 colorless Thopter artifact creature token with flying for each +1/+1 counter on it") triggers. There are zero +1/+1 counters on it at the time of death. Zero Thopter tokens are created.

7. [[Hangarback Walker]] is put into the graveyard. No tokens enter.

RULE TRACE
- [601.2f] — X locked in at cast time (X=3), determines cost paid.
- [614.17] — "Can't" effects are not ordinary replacement effects; they override would-be instructions unconditionally.
- [Axiom 2] — Replacement happens before the event; counters never exis
```

### L6 — Replacement effect for "instead" damage rerouting

**Scenario:**
```
I cast [[Lightning Bolt]] targeting an opponent. They control [[Boros Reckoner]] ("If a source would deal damage to you, instead it deals that much damage to a target creature or player of your choice"). Wait, that's not quite right — let me use real Oracle text: [[Boros Reckoner]] has "Whenever Boros Reckoner is dealt damage, it deals an equal amount of damage to any target." That's a trigger, not a replacement.
```

**Expected:** Palisade Giant takes 3 damage instead of the opponent. The damage is redirected via 614.5 replacement.

**Failures:**
- Missing required citations: 614.6, 614.9

**Arbiter response:**
```
You're correct to self-correct. Let me process the actual board state.

---

STATE

Q1 — Yes. [[Lightning Bolt]] is resolving.
Q2 — No SBAs applicable mid-resolution.
Q3 — No triggers yet; [[Lightning Bolt]] has not yet produced its final event.
Q4 — No. A spell is mid-resolution.
Q5 — N/A mid-resolution.

---

RESOLUTION

1. **WOULD-EVENT:** [[Lightning Bolt]] would deal 3 damage to the opponent. The opponent does not control [[Boros Reckoner]] — the *opponent* is the target. [[Boros Reckoner]] is on the opponent's side and its trigger watches for damage dealt *to Boros Reckoner itself*, not to its controller. No replacement effects apply to this damage event.

2. **Final event:** [[Lightning Bolt]] deals 3 damage to the opponent. [608.2]

3. **Trigger detection:** [[Boros Reckoner]]'s triggered ability watches for "Boros Reckoner is dealt damage." The damage was dealt to the *opponent*, not to [[Boros Reckoner]]. The trigger condition is **not met**. No trigger is placed in the waiting state. [603.2]

4. **SBA loop:** Opponent has taken 3 damage. If this reduces their life total to 0, SBAs will apply on the next check. No other SBAs triggered by this event. [704]

5. **Priority returns** to the active player after the spell finishes resolving. [117.3b]

---

RULE TRACE

- [608.2] — Spell resolves by following its instructions.
- [603.2] — A trigger only triggers when its specific condition is met.
- [704] — SBAs checked after spell resolves.
- Axiom 4 — The rest of the engine sees only the final event (3 damage to the opponent).

---

VERDICT

[[Lightning Bolt]] deals 3 damage to the opponent; [[Boros Reckoner]]'s triggered ability does not trigger because [[Boros Reckoner]] itself was not dealt damage.
```

### M4 — Mana abilities during cost payment (re-test from J8 angle)

**Scenario:**
```
I'm casting a 4-cost spell. I have {2} in my mana pool from a previous tap. I have a Forest untapped. Can I tap the Forest for {G} during cost payment to help pay?
```

**Expected:** Yes. Mana abilities can be activated during cost payment of another spell or ability [602.1, 605.3a]. The Forest's {T} mana ability activates without using the stack and adds {G} to your pool, available immediately for the cost being paid.

**Failures:**
- Missing required citations: 601.2g

**Arbiter response:**
```
STATE
Q1 — Yes: casting process is in progress, at the cost-payment step [601.2h].
Q2 — No SBAs applicable.
Q3 — No triggers in waiting state.
Q4 — Not a stable checkpoint; casting is mid-process.
Q5 — Active player is executing a casting action; mana abilities may be activated during cost payment.

RESOLUTION
1. Casting has reached the point of paying costs [601.2h].
2. Before and during cost payment, the active player may activate mana abilities [605.3a]. A Forest's tap ability is a mana ability [605.1a].
3. Player activates Forest's mana ability: tap Forest → {G} enters mana pool.
4. Mana pool now contains {2}{G}. Total available: 3 mana.
5. Player pays the {4} cost using {2}{G} — however, {2}{G} = 3 mana total, which is **insufficient** to pay {4} (generic requires 4 mana of any type).
6. If the spell costs exactly {2}{G} or {3}, this works. If it costs {4} generic, player is 1 mana short and cannot complete payment without additional mana sources.

RULE TRACE
- [601.2h] — Costs are paid during this sub-step; mana abilities may be activated to generate mana.
- [605.3a] — Mana abilities can be activated at any time another player could cast an instant, and also during the process of paying a cost.
- [605.1a] — A Forest's tap-for-mana ability qualifies as a mana ability.
- Axiom 1 — The game processes cost payment as an ordered engine step; mana generation precedes payment execution.

VERDICT
Yes, you may tap the Forest during cost payment to add {G} to your mana pool — but {2}{G} totals only 3 mana, which is insufficient to pay a cost of {4}. You can tap the Forest; you simply cannot complete payment of a 4-generic cost with only 3 mana available.
```

### M5 — Restricted mana (snow, "spend only on")

**Scenario:**
```
I tap a [[Snow-Covered Mountain]] for {R}. The rules say this mana can be spent as snow. I want to cast [[Skred]] ("Skred deals X damage to any target, where X is the number of snow permanents you control"). Do I need to spend the snow mana, or just have snow permanents?
```

**Expected:** Skred counts snow PERMANENTS, not snow mana. The {R} from Snow-Covered Mountain is regular red mana that also has "snow" attribute, but Skred doesn't require snow mana — it requires snow permanents (it counts them at resolution).

**Failures:**
- Missing required citations: 107.4h

**Arbiter response:**
```
STATE
Q1 — No process resolving.
Q2 — No SBAs applicable.
Q3 — No waiting triggers.
Q4 — Stable checkpoint; player has priority in main phase.
Q5 — Active player may cast [[Skred]].

RESOLUTION
1. Player announces casting [[Skred]], choosing a target. [601.2]
2. Costs are determined. [[Skred]]'s mana cost is {R}. No additional costs apply.
3. Player pays {R} — satisfied by the {R} floating from [[Snow-Covered Mountain]]. [601.2h]
4. [[Skred]] resolves. X is calculated at resolution as the number of snow permanents the casting player controls. [608.2]
5. [[Skred]] deals X damage to the target.

RULE TRACE
- [601.2] — Casting procedure; costs are defined by the spell's mana cost and applicable additional costs only.
- [608.2] — At resolution, X is evaluated from the current game state.
- [107.4b] — Snow mana ({S}) is a mana type; it is only required when a cost specifically includes {S}.
- Axiom 1 — The game engine only requires snow mana when a cost symbol {S} appears.

VERDICT
No. [[Skred]]'s only cost is {R}; it contains no {S} symbol. Snow mana is irrelevant to casting it. X is determined at resolution by counting your snow permanents — a separate, independent calculation from how you paid for the spell.
```

### N1 — Multiple blockers and damage assignment order

**Scenario:**
```
I attack with a 5/5. Opponent declares two blockers: a 2/2 and a 3/3. As the attacker, can I choose to assign all 5 damage to just one?
```

**Expected:** I (attacker) choose damage assignment order at declare-blockers step [509.1c]. I can order them: 2/2 first, then 3/3. I must assign at least lethal damage to a creature before moving to the next in order. Lethal to 2/2 is 2 damage. After 2 to the 2/2, I have 3 damage left, which I assign to the 3/3 

**Failures:**
- Missing required citations: 509.1c

**Arbiter response:**
```
STATE
Q1 — No process currently resolving; we are in the declare blockers step, proceeding to combat damage assignment.
Q2 — No SBAs applicable yet.
Q3 — No waiting triggers relevant to this question.
Q4 — Stable checkpoint reached after blocker declaration; attacker must assign combat damage.
Q5 — Attacker has the right to order and assign combat damage to declared blockers.

RESOLUTION
1. The 5/5 is blocked by two creatures. It is therefore a blocked creature for combat damage purposes. [510.1]
2. Because there are multiple blockers, the attacker must first declare a damage assignment order among the blockers. [510.1b]
3. The attacker then assigns combat damage. A blocked creature must assign lethal damage to each blocker earlier in the order before assigning any damage to the next blocker in the order. [510.1c]
4. "Lethal damage" means damage equal to the blocker's toughness minus any damage already marked on it (and accounting for deathtouch if applicable). [510.1d]
5. The attacker assigns the 2/2 first in order. Lethal damage to the 2/2 = 2. The attacker must assign at least 2 damage to it before proceeding.
6. Remaining damage = 3. The 3/3 is next. Lethal damage to the 3/3 = 3. The attacker may assign all remaining 3 damage to it.
7. Therefore: the attacker **cannot** assign all 5 to one blocker freely — at minimum, 2 must go to whichever blocker is placed first in order, and 3 to the second, OR the attacker places the 3/3 first (requiring 3 to it) and assigns the remaining 2 to the 2/2. Both distributions destroy both blockers exactly.
8. **However:** if the attacker places the 3/3 first and assigns 3 to it, the remaining 2 goes to the 2/2 — still splits. If the attacker places the 2/2 first and assigns 2 to it, the remaining 3 goes to the 3/3. In either ordering, all 5 damage is consumed by lethal assignments and **zero** can be redirected entirely onto one creature alone.
9. Conclusion: no legal assignment concentrates all 5 damage on a single blocker, beca
```

### N2 — First strike damage step (only when needed)

**Scenario:**
```
An attacker has first strike, defender has no first strike or double strike. How many damage steps are in this combat?
```

**Expected:** Two damage steps. Because at least one creature has first strike (or double strike), a first-strike damage step occurs [702.7]. Regular damage step follows.

**Failures:**
- Missing required citations: 702.7

**Arbiter response:**
```
STATE
Q1 — No process currently resolving.
Q2 — No SBAs applicable (no damage yet).
Q3 — No triggers in waiting state.
Q4 — Stable checkpoint; combat damage step question.
Q5 — Not a priority question; structural combat step question.

RESOLUTION
1. Combat damage is divided into two potential steps: the first strike damage step and the regular damage step [310.1].
2. The first strike damage step occurs when at least one attacking or blocking creature has first strike OR double strike [310.2].
3. Here, the attacker has first strike — the first strike damage step occurs. The attacker deals damage; the defender does not (it has neither first strike nor double strike) [310.4].
4. After the first strike damage step resolves, the game checks whether any creatures that have not yet dealt combat damage remain. The defender is still alive (assuming it survived) and has not yet dealt damage, so the regular damage step occurs [310.5].
5. In the regular damage step, the defender deals its combat damage. The attacker does NOT deal damage again — it has first strike only, not double strike [310.5].
6. Result: **two combat damage steps**.

RULE TRACE
- [310.1] — Combat damage step structure.
- [310.2] — First strike damage step condition (any creature with first strike or double strike).
- [310.4] — Only creatures with first strike or double strike deal damage in the first step.
- [310.5] — Regular damage step occurs if any creature with neither ability is still in combat and hasn't dealt damage.

VERDICT
There are two combat damage steps: one first strike step (attacker deals damage only) and one regular step (defender deals damage only), because the attacker has first strike but not double strike, and the defender has neither ability.
```

### N4 — Lifelink rules

**Scenario:**
```
A 4/4 creature with lifelink attacks me. I block with a 2/2. Both deal combat damage. How much life does the attacker's controller gain?
```

**Expected:** 4 life. Lifelink causes the controller of a source with lifelink to gain life equal to the damage the source deals [702.15b]. The attacker deals 4 damage total: 2 to my blocker (the 2/2 dies), and trample? No, no trample. With no trample and a 2/2 blocker, the attacker assigns at least 2 to the bloc

**Failures:**
- Missing required citations: 702.15b

**Arbiter response:**
```
STATE
Q1 — Combat damage step is resolving; damage assignment is being processed.
Q2 — SBAs will apply after damage is dealt (creatures may die), not yet.
Q3 — No triggers in waiting state yet.
Q4 — Not stable; damage is being processed.
Q5 — N/A; damage is simultaneous, not a priority action.

RESOLUTION
1. The 4/4 and 2/2 are blocked. Each deals combat damage simultaneously. [510.1]
2. The 4/4 assigns 2 damage to the 2/2 blocker (lethal) and may assign excess; as a blocked creature it must assign lethal damage to the blocker before assigning elsewhere. The 4/4 assigns all 4 damage to the 2/2. [510.1c]
3. The 2/2 assigns 2 damage to the 4/4 attacker. [510.1]
4. Damage is dealt simultaneously. [510.2]
5. Lifelink means damage dealt by the 4/4 causes its controller to gain that much life. The 4/4 dealt **4 damage** to the 2/2. [702.15a]
6. The attacker's controller gains **4 life**. [702.15a]
7. SBAs are checked: the 2/2 has 2 damage ≥ its toughness (dies); the 4/4 has 2 damage, which is less than its toughness (survives). [704.5g]

RULE TRACE
- [510.1] — Blocked attacker assigns damage to blockers.
- [510.1c] — Must assign lethal damage to blocker before assigning elsewhere.
- [510.2] — Combat damage dealt simultaneously.
- [702.15a] — Lifelink: damage dealt causes controller to gain that much life.
- [704.5g] — SBA: creature with damage ≥ toughness is destroyed.
- Axiom 4 — The rest of the engine (lifelink life gain) sees only the final damage event.

VERDICT
The attacker's controller gains **4 life** — lifelink applies to all damage the 4/4 deals, which is 4 (the full damage assigned to the blocking 2/2).
```

### N5 — Deathtouch with multiple blockers

**Scenario:**
```
I attack with a 5/5 with deathtouch. Opponent blocks with three 2/2 creatures. How much damage do I need to assign to each blocker?
```

**Expected:** 1 damage each for deathtouch is enough (deathtouch makes any damage from a creature with deathtouch "lethal"). So 1+1+1 = 3 damage, all three blockers die. 2 damage left over — wait, with no trample, the remaining 2 doesn't go to the player. The remaining 2 is wasted on... actually, by 702.2c, "with

**Failures:**
- Missing required citations: 702.2c

**Arbiter response:**
```
STATE
Q1 — No process currently resolving; combat damage assignment is being determined.
Q2 — No SBAs applicable yet.
Q3 — No triggers in waiting state relevant to this question.
Q4 — Stable checkpoint; attacker's controller is assigning combat damage.
Q5 — Attacking player is assigning combat damage to multiple blockers.

RESOLUTION
1. When a creature is blocked by multiple creatures, the attacking player orders the blockers and assigns damage to them in that order. [510.1b]
2. Normally, lethal damage must be assigned to each blocker before damage can be assigned to the next. Lethal damage is damage equal to the blocker's toughness minus any damage already marked on it. [510.1c]
3. Deathtouch modifies the definition of "lethal damage." Any amount of damage dealt by a source with deathtouch is considered lethal damage. Therefore, assigning **1 damage** to each blocker satisfies the lethal damage requirement for that blocker. [702.2b, 510.1c]
4. The attacker must still assign at least 1 damage to the first blocker in the chosen order before proceeding to assign damage to the next, and at least 1 to the second before the third. [510.1b]
5. The attacker has 5 damage total to assign. The **minimum legal assignment** is 1 damage to each of the three blockers (satisfying lethality via deathtouch), with the remaining 2 damage distributed freely among the blockers in any combination. No excess damage can be assigned to a player or planeswalker while the creature is still blocked. [510.1d]

RULE TRACE
- [510.1b] — Ordering and sequential assignment requirement for multiple blockers.
- [510.1c] — Lethal damage definition; must assign lethal before moving to next blocker.
- [702.2b] — Deathtouch: any amount of damage from this source is lethal.
- [510.1d] — Excess damage cannot trample over to player while still blocked (no trample stated).
- Axiom 4 — The rest of the engine sees only the final damage event after assignment is locked in.

VERDICT
You must assign at least 1 dam
```

### N6 — Creature removed from combat mid-step

**Scenario:**
```
An opponent's 3/3 attacks. I declare a 2/2 as blocker. Before damage is dealt, the attacker's controller casts [[Smite the Monstrous]] killing my blocker. What happens in the damage step?
```

**Expected:** The blocker is dead before damage. The 3/3 attacker is still attacking (it's not blocked anymore? actually it was blocked at declare-blockers, that doesn't change). Per 510.1d: if a blocker leaves the battlefield, the attacker is treated as if not blocked for damage UNLESS another blocker remains. W

**Failures:**
- Missing required citations: 510.1d

**Arbiter response:**
```
STATE
Q1 — No process currently resolving; we are in the declare blockers step or moving toward combat damage.
Q2 — No SBAs pending (blocker is dead and removed; attacker is alive).
Q3 — No relevant waiting triggers specified.
Q4 — Not yet stable; combat damage step has not occurred.
Q5 — Active player has priority in combat; we are resolving the sequence leading to the combat damage step.

---

**Key setup clarification:** [[Smite the Monstrous]] destroys the blocking creature before the combat damage step. The blocker is removed from combat and the battlefield. The attacker (3/3) remains in combat, previously blocked.

---

RESOLUTION

1. **Declare Blockers Step:** The 2/2 was legally declared as a blocker. The 3/3 becomes a "blocked creature." [509.1h]

2. **Before the combat damage step**, [[Smite the Monstrous]] is cast and resolves, destroying the 2/2 blocker. The blocker leaves the battlefield.

3. **Critical rule — creature remains "blocked":** Once a creature has been declared as blocked, it *remains* a blocked creature for the rest of combat even if the blocking creature leaves the battlefield. The 3/3 does **not** become unblocked. [509.1h, 702.77 (trample notwithstanding)]

4. **Combat damage step:** The 3/3 is still a "blocked creature" with no legal damage assignment targets (no blockers remain). Unless the 3/3 has **trample**, it must assign its combat damage to nothing — it deals **0 damage**. [510.1c — a blocked creature with no remaining blockers assigns no damage unless it has trample]

5. **No damage is dealt to the defending player** from the 3/3, because it is still "blocked." The defending player takes 0 combat damage from this creature. [510.1c]

6. **The 2/2 is already dead** — it deals no damage.

---

RULE TRACE
- [509.1h] — Once blocked, a creature remains blocked even if the blocker leaves combat or the battlefield.
- [510.1c] — A blocked creature with no remaining blockers assigns no combat damage (absent trample or similar).
- Axiom 1 
```

### N8 — Damage prevention vs. damage replacement

**Scenario:**
```
I have [[Worship]] in play ("If you control a creature, damage that would reduce your life total to less than 1 reduces it to 1 instead"). I'm at 1 life. Opponent's 5/5 attacks me. I have one creature in play. How much damage do I take?
```

**Expected:** Damage is dealt; my life would go to -4. Worship's replacement substitutes "to less than 1" with "to 1." Result: I stay at 1.

**Failures:**
- Missing required citations: 614.5

**Arbiter response:**
```
STATE
Q1 — No process resolving.
Q2 — No SBAs pending.
Q3 — No waiting triggers.
Q4 — Stable checkpoint; combat damage step is about to occur.
Q5 — Combat damage is being assigned; [[Worship]] replacement effect is relevant.

RESOLUTION
1. WOULD-EVENT: The 5/5 deals 5 damage to you, which would reduce your life total from 1 to −4.
2. "CAN'T" CHECK: No "can't" effect applies. [614.17]
3. REPLACEMENT/PREVENTION CHECK: [[Worship]]'s replacement effect applies. You control a creature, so the condition is met. The effect modifies the damage event: damage that would reduce your life total to less than 1 instead reduces it to 1. Your life total is already at 1, so the damage is prevented from reducing it below 1. [614.6]
4. FINAL EVENT: Your life total remains at 1. You effectively take 0 net change in life total.
5. SBA CHECK: Your life total is 1, which is not ≤ 0. No SBA fires. [704.5a]

RULE TRACE
- [614.6] — Zone-change replacement inapplicable; general replacement effect applies to the damage event before it occurs.
- [614.1] — Replacement effects modify events as they would occur.
- [704.5a] — SBA: a player with 0 or less life loses the game; not triggered here.
- Axiom 2 — Replacement happens before the event; the life total reduction is intercepted by [[Worship]] before it resolves.
- Axiom 4 — The rest of the engine sees only the final event: life total stays at 1.

VERDICT
You take 5 damage, but [[Worship]]'s replacement effect caps your life total reduction so your life remains at 1 — no net change.
```

### O1 — Tokens entering with counters

**Scenario:**
```
I control [[Doubling Season]]. I cast [[Helm of the Host]] (an artifact that creates token copies at combat — wait, that's at combat, not ETB). Better example: I cast [[Trostani, Selesnya's Voice]] effect... actually:
```

**Expected:** 4 Servo tokens. Anointed Procession is a replacement effect doubling token creation.

**Failures:**
- Missing STATE section
- Missing RESOLUTION section
- Missing RULE TRACE section
- Missing required citations: 614.13

**Arbiter response:**
```
You haven't completed a question. The scenario is underspecified — no complete board state, no specific interaction, and no actual rules question has been stated.

UNRESOLVED

Restate with:
1. Complete board state (relevant permanents, zones, players).
2. The specific action being taken.
3. The specific rules question you want adjudicated.
```

### O2 — Anafenza vs. token

**Scenario:**
```
I control [[Anafenza, the Foremost]] ("If a nontoken creature an opponent controls would die, exile it instead"). Opponent's 1/1 Goblin token is destroyed by [[Wrath of God]]. Does Anafenza exile it?
```

**Expected:** No. Anafenza's replacement applies only to NONTOKEN creatures. The Goblin token is a token, so Anafenza doesn't apply. The token is destroyed and ceases to exist as a state-based action.

**Failures:**
- Missing required citations: 704.5d

**Arbiter response:**
```
STATE
Q1 — Wrath of God is resolving; the Goblin token's destruction is being processed.
Q2 — SBAs not yet checked (mid-resolution).
Q3 — No triggers pending yet.
Q4 — Not stable; resolution in progress.
Q5 — No priority during resolution.

RESOLUTION
1. **WOULD-EVENT:** Wrath of God's effect would move the Goblin token to the graveyard (destroy it). [608.2]
2. **"Can't" check / Replacement scan:** Anafenza's replacement effect reads: "If a nontoken creature an opponent controls would die, exile it instead." The target is a **Goblin token**. A token is, by definition, a token — not a nontoken creature. The condition of the replacement effect is not satisfied. [614.6, 614.1]
3. **No replacement applies.** The would-event proceeds as written.
4. **Final event:** The Goblin token is destroyed and moves to the graveyard. It ceases to exist immediately upon leaving the battlefield (tokens cannot exist in zones other than the battlefield). [110.5g]

RULE TRACE
- [614.1] — A replacement effect modifies an event only when the condition it specifies is met.
- [614.6] — Zone-change replacement effects intercept the would-move event.
- [110.5g] — A token that leaves the battlefield ceases to exist; it reaches the graveyard momentarily but is immediately removed from the game.
- Axiom 2 — Replacement happens before the event, but only when the trigger condition is satisfied. Here it is not.
- Anafenza's Oracle text specifies "nontoken creature" — tokens are explicitly outside the scope of this replacement effect.

VERDICT
[[Anafenza, the Foremost]]'s replacement effect does not apply; the Goblin token is destroyed and ceases to exist, because Anafenza only affects **nontoken** creatures and a Goblin token fails that condition.
```

### O3 — Token copy of a card with kicker

**Scenario:**
```
I cast [[Verdurous Gearhulk]] WITHOUT kicker. Then I cast [[Saheeli's Artistry]] copying Verdurous Gearhulk. Does the token copy have counters as if kicker had been paid?

Wait, Verdurous Gearhulk doesn't have kicker. Better example: I cast [[Aether Vial]]'s ability putting a creature directly into play (no kicker option for Vial). Bad example.
```

**Expected:** Mirror Image becomes a copy of Spitebellows, copying its printed characteristics including the evoke trigger. However, Mirror Image was not cast by paying evoke's alternative cost (it was cast normally). The "if you evoked it, sacrifice" trigger only fires when the creature was evoked — Mirror Image

**Failures:**
- Missing STATE section
- Missing RESOLUTION section
- Missing RULE TRACE section
- Missing required citations: 702.74

**Arbiter response:**
```
You're right to flag your own examples — both are underspecified or malformed. Let me address what you're actually asking about.

UNRESOLVED

The question as stated does not contain a valid scenario to rule on. Here's why:

- **[[Verdurous Gearhulk]]** has no kicker mechanic. There is no kicker cost to have paid or not paid, so the premise "without kicker" is inapplicable to this card. Oracle text would need to be provided and verified regardless.
- **[[Saheeli's Artistry]]** Oracle text was not provided. I cannot rule on its copy effect without confirmed Oracle text.
- **[[Aether Vial]]** — you correctly self-identified this as a bad example and withdrew it.

---

**What you appear to be building toward** is a well-formed question in this family:

> *If I copy a creature that entered with kicker paid (e.g., [[Vesuvan Shapeshifter]], [[Rishkar, Peema Renegade]] — no, bad examples again) — does a token copy have counters reflecting kicker?*

The **real question** you likely want answered is:

> *Does a token that is a copy of a permanent reflect choices made during casting (like kicker) that affected how the original entered?*

The governing rule would be **[707.2]** — a copy of a permanent copies the copiable values of that object, which are derived from its printed characteristics and copy effects, **not** from how it was cast. Kicker payments are not copiable values. A token copy does **not** inherit counters placed by a kicker ETB trigger — those counters are not part of the permanent's copiable characteristics.

**Please resubmit with:**
1. Confirmed Oracle text for the creature with kicker.
2. Confirmed Oracle text for the copy effect being used.
3. A clear statement of which event you want ruled on.
```

### O4 — Counters on a token that "should" carry

**Scenario:**
```
I control a 1/1 Servo token with three +1/+1 counters on it (currently a 4/4). I cast [[Cytoshape]] making it a copy of [[Wurm Cavalcade]] (a 4/4) — wait, Cytoshape doesn't exist as a card. Use [[Mirrorhall Mimic]]? Doesn't quite work either.
```

**Expected:** No. Tokens cease to exist when moved off the battlefield. The Servo goes from battlefield → hand briefly → ceases to exist (704.5d).

**Failures:**
- Missing required citations: 704.5d

**Arbiter response:**
```
You're right to flag both of those — let me work through why each fails, then identify what you'd actually need.

[Hand off to Nissa]

---

Wait — that flag applies to "explain this" requests. You've posed a **rules/card-selection problem**, not a pure explanation. Let me treat this as an **underspecified scenario** and return the structured output.

---

STATE
Q1 — No process currently resolving.
Q2 — No SBAs applicable yet; scenario is hypothetical.
Q3 — No waiting triggers identified.
Q4 — Stable checkpoint; question is about card legality for an effect.
Q5 — Irrelevant; question is card-identification, not priority.

RESOLUTION
1. You are attempting to find a card that: **(a)** targets a creature you control, **(b)** causes it to become a copy of a named permanent, while **(c)** retaining counters already on it.
2. **[[Cytoshape]]** — does not exist as a printed Magic card. Cannot be cited. [No Oracle text available.]
3. **[[Mirrorhall Mimic]]** — is an enchantment that enters as a copy of a creature; it does not modify an existing permanent you control to become a copy of something else. Wrong effect vector.
4. Counters survive copy effects: a copy effect overwrites copiable values [707.2] but does **not** remove counters, which are not copiable values [707.2, 707.3]. So a card that makes your Servo *become a copy* of [[Wurm Cavalcade]] would leave the +1/+1 counters in place — the Servo would be a 4/4 base stat creature with three +1/+1 counters, ending as a 7/7.
5. Closest real cards for this effect vector: **[[Cytoplast Manipulator]]** (no), **[[Volatile Claws]]** (no) — the actual closest is **[[Mordenkainen]]**'s copy token effect, **[[Echoes of Eternity]]** (no). The real answer is **[[Mirrorweave]]** (makes all creatures copies) or **[[Renegade Doppelganger]]** (wrong direction).

RULE TRACE
- [707.2] — Copy effect sets copiable values; counters are not copiable values.
- [707.3] — Counters remain on a permanent that becomes a copy.
- No Oracle text avai
```

### P1 — Planeswalker loyalty abilities are sorcery-speed

**Scenario:**
```
It is my opponent's end step. I have [[Jace, the Mind Sculptor]] on the battlefield. Can I activate one of his loyalty abilities right now?
```

**Expected:** No. Loyalty abilities can be activated only as sorceries [606.5] — only during one of your main phases when the stack is empty.

**Failures:**
- Missing required citations: 606.5, 307.1

**Arbiter response:**
```
STATE
Q1 — No process currently resolving.
Q2 — No SBAs applicable.
Q3 — No waiting triggers noted.
Q4 — Game is at a stable checkpoint; active player has passed priority, triggering end step; priority is now being distributed.
Q5 — You are a non-active player (NAP). Priority passes to you during the end step.

RESOLUTION
1. The active player (your opponent) receives priority at the start of their end step. [117.3b]
2. Assuming the active player passes, priority passes to you as the next player in turn order. [117.3d]
3. Loyalty abilities are activated abilities with a loyalty cost. They follow standard activation rules, with one restriction: a loyalty ability may only be activated on your own turn. [606.3]
4. Because it is your opponent's turn, you do not meet the condition in [606.3], regardless of whether you hold priority.
5. You cannot legally activate any loyalty ability of [[Jace, the Mind Sculptor]] at this time.

RULE TRACE
- [606.3] — A player may activate a loyalty ability of a permanent they control any time they have priority and the stack is empty during a main phase of their turn.
- Axiom 1 — The game is one ordered engine; the turn structure constraint is not waivable by priority alone.

VERDICT
No — loyalty abilities can only be activated during your own main phase while the stack is empty, so you cannot activate any of [[Jace, the Mind Sculptor]]'s abilities during your opponent's end step.
```

### P2 — Each planeswalker — loyalty once per turn

**Scenario:**
```
I control [[Liliana, the Last Hope]] on my main phase. I activate her -2 ability targeting a creature. Can I activate her +1 ability in the same turn?
```

**Expected:** No. A player may activate only one loyalty ability of each planeswalker each turn [606.5b].

**Failures:**
- Missing required citations: 606.5b

**Arbiter response:**
```
STATE
Q1 — No process currently resolving.
Q2 — No SBAs applicable.
Q3 — No waiting triggers.
Q4 — Game is at a stable checkpoint, main phase, your priority.
Q5 — You have priority. Liliana is on the battlefield with some loyalty counter total (unspecified, but assumed to have entered this turn or a prior turn).

---

RESOLUTION

1. **Loyalty ability activation rules:** A loyalty ability may be activated only once per turn, and only at sorcery speed, during your turn. [606.3]

2. **The critical constraint:** You may activate **only one loyalty ability of a given planeswalker per turn.** [606.3b] — activating the −2 consumes that single activation slot for [[Liliana, the Last Hope]] this turn.

3. **Order does not matter.** Whether you activated the −2 first or attempt the +1 first is irrelevant — once any loyalty ability of Liliana has been activated this turn, no further loyalty abilities of that same permanent may be activated this turn. [606.3b]

4. **The +1 activation is therefore illegal** for the remainder of this turn.

---

RULE TRACE
- [606.3] — Loyalty abilities have the activation restriction of once per turn, during your turn, at sorcery speed.
- [606.3b] — A player may activate a loyalty ability of a permanent only if no loyalty ability of that permanent has been activated this turn.
- Axiom 1 — The game is one ordered engine; the constraint is tracked for the turn.

---

VERDICT
No — activating the −2 expends the single loyalty-ability activation permitted on [[Liliana, the Last Hope]] this turn; the +1 cannot also be activated in the same turn.
```

### P4 — "Activate only once per turn" tracking

**Scenario:**
```
I control [[Mishra's Bauble]] — wait, that's not "once per turn." Use [[Memnite]] — also no. Use [[Sword of Feast and Famine]] — its trigger is "whenever attacks." Bad example.
```

**Expected:** No, because Mind Stone is now tapped — the second ability also requires tapping it as a cost. Until it untaps, neither can be activated.

But: there's no "once per turn" restriction. If Mind Stone is untapped at some point (untap step or via Aether Vial-style effect), it can be activated again.

**Failures:**
- Missing STATE section
- Missing RESOLUTION section
- Missing RULE TRACE section
- Missing required citations: 602.5

**Arbiter response:**
```
UNRESOLVED

The question is underspecified. No board state, game action, rules interaction, or ruling request has been submitted. You have listed three cards and discarded each before forming a question.

Submit a complete scenario: board state, action taken, and the specific rules question you want resolved.
```

### Q1 — Mode chosen at casting

**Scenario:**
```
I cast [[Cryptic Command]]. When do I choose which two of its four modes to use?
```

**Expected:** At casting, specifically at 601.2b (choosing modes/X). The modes are locked in when the spell is cast, before payment and before resolution.

**Failures:**
- Missing required citations: 700.2

**Arbiter response:**
```
STATE
Q1 — No process currently resolving; [[Cryptic Command]] is being cast.
Q2 — No SBAs applicable.
Q3 — No triggers in waiting state.
Q4 — Not at a stable checkpoint; casting is in progress.
Q5 — Active player is casting [[Cryptic Command]]; mode selection is part of the casting procedure.

RESOLUTION
1. Casting begins at the point the player announces [[Cryptic Command]] as the spell being cast. [601.2a]
2. Mode selection occurs immediately after announcing the spell — it is one of the first declarations made, before targeting or cost determination. [601.2b]
3. Specifically: modes are chosen during the "choose modes" sub-step of casting, which precedes choosing targets [601.2c], determining and paying costs [601.2f], and any other spell decisions.
4. Once modes are chosen and the spell is placed on the stack with those modes locked in, they cannot be changed. [601.2b]

RULE TRACE
- [601.2a] — Casting begins with announcement.
- [601.2b] — Mode selection is the first declaration after announcement; modes are locked in when the spell is placed on the stack.
- [601.2c] — Targets are chosen after modes.
- [601.2f] — Costs are locked in after targets.
- Axiom 1 — The game is one ordered engine; casting follows a fixed sequence.

VERDICT
Mode selection for [[Cryptic Command]] happens at the very beginning of the casting process — immediately after announcing the spell — before targets are chosen or costs are paid, and the chosen modes are locked in for the spell's lifetime on the stack.
```

### Q2 — Modal spell with one mode becoming illegal

**Scenario:**
```
I cast [[Charm of the Tempest]] (hypothetical: choose two — destroy artifact, draw card, deal 2 damage to a creature). I choose "destroy artifact" and "draw a card," targeting opponent's [[Sol Ring]]. In response, opponent sacrifices Sol Ring to a mana ability — wait, mana abilities don't go on stack. Let me say: opponent uses [[Snapback]] to bounce Sol Ring. Now Sol Ring isn't on the battlefield. What happens?
```

**Expected:** Per 608.2b, when the spell resolves, the engine checks if all targets are still legal. The "destroy artifact" mode has no legal target (Sol Ring is no longer on battlefield). The other mode (draw a card) has no target. The illegal-target mode is skipped; the legal one (draw a card) still happens. So

**Failures:**
- Missing required citations: 700.2

**Arbiter response:**
```
I don't have Oracle text for [[Charm of the Tempest]] — it appears to be a hypothetical card. However, the scenario is fully specified by the modes and target you've described, so I can rule on the interaction directly using those parameters.

I also don't have Oracle text for [[Snapback]], but its effect is stated in the scenario: it bounces [[Sol Ring]] to its owner's hand before [[Charm of the Tempest]] resolves. I'll proceed on that basis.

---

STATE

Q1 — Yes. [[Charm of the Tempest]] is on the stack, resolving after [[Snapback]] has already resolved.
Q2 — No SBAs pending.
Q3 — No triggers in waiting state relevant here.
Q4 — Not yet stable; spell is mid-resolution.
Q5 — Charm is resolving; no player has priority during resolution.

---

RESOLUTION

1. **[[Snapback]] resolves** — [[Sol Ring]] moves from battlefield to its owner's hand. It is no longer a legal target for "destroy artifact."

2. **[[Charm of the Tempest]] is now on top of the stack and begins resolving** [608.1].

3. **Target legality is checked at resolution** [608.2b] — the "destroy artifact" mode targeted [[Sol Ring]], which is no longer on the battlefield. A permanent that has left the battlefield is not a legal target for a spell that requires a target on the battlefield. That target is now **illegal**.

4. **Evaluate how many targets the spell has and how many are legal.** The spell has two modes. "Destroy artifact" has one target (now illegal). "Draw a card" has zero targets — it is untargeted. [608.2b] states: if a spell has multiple targets and *all* of them are illegal, the spell is countered. However, if *some* targets are illegal and *some* are legal, the spell resolves but does nothing to the illegal targets.

5. **Critical distinction:** "Draw a card" is **not a targeted mode** — it has no target to be illegal or legal. The question is therefore whether *all targets* of the spell are illegal. The spell has exactly **one target total** (Sol Ring, now illegal). [608.2b]: "If all targ
```

### Q4 — Choose new targets and the illegality rule

**Scenario:**
```
Opponent casts [[Lightning Bolt]] targeting my creature. I cast [[Misdirection]] ("Change the target of target spell"). I want to redirect Bolt to my opponent. Legal?
```

**Expected:** Yes, if my opponent is a legal target. Lightning Bolt targets "any target" — a player is legal. Misdirection changes the target to my opponent. Bolt resolves dealing 3 to my opponent.

**Failures:**
- Missing required citations: 115.6

**Arbiter response:**
```
STATE
Q1 — Yes: [[Lightning Bolt]] is on the stack; [[Misdirection]] is being cast targeting it.
Q2 — No SBAs applicable.
Q3 — No waiting triggers.
Q4 — Not stable; stack is active.
Q5 — Active player is you (casting [[Misdirection]]); legality of the redirection is the question.

RESOLUTION
1. **Cast declaration** — [[Misdirection]] is placed on the stack targeting [[Lightning Bolt]]. [601.2c]
2. **Misdirection resolves** — its effect reads "Change the target of target spell to a new legal target." You are choosing a new target for [[Lightning Bolt]]. [608.2]
3. **New target legality check** — [[Lightning Bolt]]'s only target requirement is "any target," defined as any creature, planeswalker, or player. [601.2c, 114.4]
4. **Your opponent is a player** — players are always legal targets for "any target" unless a protection or prevention effect applies (none stated). [114.4]
5. **Redirection is valid** — the new target (your opponent) satisfies [[Lightning Bolt]]'s target requirement; the change is legal.
6. **[[Lightning Bolt]] resolves** dealing 3 damage to your opponent. [608.2b]

RULE TRACE
- [114.4] — "Any target" means creature, planeswalker, or player.
- [601.2c] — Target legality evaluated at time of targeting and on resolution.
- [608.2] — Spell resolution; targets must be legal at resolution.
- [608.2b] — If the chosen target is legal at resolution, the spell resolves normally.
- Axiom 1 — The game is one ordered engine; Misdirection's effect replaces the target before Bolt resolves.

VERDICT
Yes, legal — your opponent is a valid "any target" for [[Lightning Bolt]], so [[Misdirection]] may redirect it to deal 3 damage to your opponent.
```

### R1 — Cascade — exile order matters

**Scenario:**
```
I cast [[Bloodbraid Elf]] (Cascade). I exile the top card of my library: [[Lightning Bolt]] (cost {R}, mana value 1 — less than 4, can be cast). Do I get to look at the next card too?
```

**Expected:** No. Cascade stops at the first card with lesser mana value that's a nonland. Bloodbraid Elf is mana value 4; Lightning Bolt is 1 < 4. I may cast Lightning Bolt (or choose not to). Either way, cascade then resolves the remaining "put the exiled cards on the bottom in random order" — meaning the rest 

**Failures:**
- Missing required citations: 702.85a

**Arbiter response:**
```
STATE
Q1 — Cascade is currently resolving as part of Bloodbraid Elf's spell resolution.
Q2 — No SBAs applicable.
Q3 — No waiting triggers relevant.
Q4 — Not at a stable checkpoint; mid-resolution.
Q5 — Irrelevant; priority is suspended during resolution.

RESOLUTION
1. Cascade instructs you to exile cards from the top of your library one at a time, face-up, until you exile a nonland card with mana value less than [[Bloodbraid Elf]]'s mana value (4). [702.84a]
2. [[Lightning Bolt]] is a nonland card with mana value 1 — it satisfies the stop condition immediately.
3. The exile-and-reveal loop **terminates** the moment the qualifying card is exiled. You do not exile any further cards.
4. You may cast [[Lightning Bolt]] without paying its mana cost, or not. [702.84a]
5. All exiled cards that were **not** cast (none in this case, since only one card was exiled) are put on the bottom of your library in a random order. [702.84a]

RULE TRACE
- [702.84a] — Cascade: exile cards one at a time until a nonland card with lesser mana value is exiled; stop there; may cast it; remaining exiled cards go to bottom in random order.
- Axiom 1 — The process is one ordered engine; the stop condition ends the loop, no further action within that loop is permitted.

VERDICT
No — [[Lightning Bolt]] satisfies the stop condition on the first card exiled, so Cascade halts immediately; you do not look at or exile any additional cards.
```

### R2 — Cascade — what about X spells?

**Scenario:**
```
I cast [[Maelstrom Wanderer]] (Cascade, Cascade). Cascade reveals [[Walking Ballista]] (cost {X}{X}, mana value 0 when on the stack). Can I cast it?
```

**Expected:** Yes — Walking Ballista's mana value with X=0 is 0, which is less than Maelstrom Wanderer's 8. Cast it. But: I must pay X=0 (cascade lets me cast without paying mana cost, so X is 0 by default — there's no mana to pay). Walking Ballista enters with 0 +1/+1 counters and dies to SBAs.

**Failures:**
- Missing required citations: 702.85a

**Arbiter response:**
```
STATE
Q1 — Yes: Cascade trigger is resolving.
Q2 — Not relevant mid-resolution.
Q3 — Not applicable mid-resolution.
Q4 — No; in the middle of a resolving triggered ability.
Q5 — No priority; Cascade is resolving.

RESOLUTION

1. **Cascade triggers and begins resolving.** The instruction is: exile cards from the top of library until a nonland card with mana value *strictly less than* the cascade source's mana value is exiled, then you *may* cast it without paying its mana cost. [[Maelstrom Wanderer]] has mana value 8, so the target threshold is MV < 8. [702.84]

2. **Determine [[Walking Ballista]]'s mana value.** [[Walking Ballista]]'s mana cost is {X}{X}. When a spell or ability is not on the stack, X is treated as 0 for the purposes of determining mana value. However, the Cascade instruction asks you to cast the revealed card — which means evaluating whether you *may* cast it, not evaluating it while it is on the stack. At the moment of the Cascade check (the card is exiled face-up, not yet on the stack), X = 0, so MV = 0. MV 0 < MV 8 — the condition is met. [202.3b]

3. **Casting without paying mana cost.** Cascade allows you to cast the spell "without paying its mana cost." When a spell with {X} in its cost is cast without paying its mana cost, X must be chosen as 0. [107.3b] You may not pay an alternative or additional cost that includes mana in lieu of the "without paying its mana cost" instruction. [601.2b]

4. **Result.** You *may* cast [[Walking Ballista]] via Cascade, but X is locked in at 0. The spell goes on the stack as a 0/0 creature. After it resolves, Walking Ballista enters the battlefield with 0 counters and is immediately destroyed by a state-based action. [704.5f]

RULE TRACE
- [702.84] — Cascade definition and "mana value less than" condition.
- [202.3b] — X = 0 for mana value when not on the stack.
- [107.3b] — X = 0 when casting without paying mana cost.
- [601.2b] — Cannot pay an alternative mana cost when already casting without paying mana c
```

### R3 — Suspend creates a delayed trigger

**Scenario:**
```
I exile [[Lotus Bloom]] (Suspend 3, {0}) from my hand using suspend. Three turns pass with time counters removed. Now there are 0 time counters. What triggers?
```

**Expected:** A delayed triggered ability fires: "When the last time counter is removed from this card, if it's exiled, play it without paying its mana cost." Lotus Bloom enters the battlefield via this delayed trigger [702.61].

**Failures:**
- Missing required citations: 702.61

**Arbiter response:**
```
STATE
Q1 — No process currently resolving.
Q2 — No SBAs applicable.
Q3 — Evaluating — the last time counter was just removed from [[Lotus Bloom]] in exile.
Q4 — Not yet stable; trigger detection required.
Q5 — Pending trigger resolution.

---

RESOLUTION

1. **The last time counter is removed from [[Lotus Bloom]] in exile.** This is the final event.
2. **Trigger detection [603.1]:** Suspend's second triggered ability watches for "the last time counter being removed from this card while it's exiled." That condition is now met.
3. **Trigger text (CR 702.62b):** "When the last time counter is removed from [this card] while it's in exile, if it doesn't have suspend, you may cast it without paying its mana cost if it has flash or if it's your turn. Otherwise, cast it without paying its mana cost."
   - Actually, the precise Oracle trigger is: **"When the last time counter is removed from this card, if it's in exile, you may cast it without paying its mana cost."** [702.62b]
4. **This trigger enters the waiting state [603.2].** It will be placed on the stack when a player would receive priority [603.3].
5. **SBA check [704.3] — no SBAs apply.**
6. **Trigger is placed on the stack** under APNAP order [603.3b, 101.4]. Since this is your card and your turn (or the controller's turn), you own the trigger.
7. **Priority passes.** You may let it resolve.
8. **On resolution [608.2]:** You cast [[Lotus Bloom]] without paying its mana cost. Its mana cost is {0}, so no payment is required regardless — but the "without paying its mana cost" clause is what allows casting from exile via suspend. [[Lotus Bloom]] is an artifact with no other casting restriction, so the cast proceeds normally.

---

RULE TRACE
- [702.62a] — Suspend: exile the card with N time counters; at beginning of upkeep, remove a time counter.
- [702.62b] — When the last time counter is removed from a suspended card in exile, cast it without paying its mana cost.
- [603.2] — Triggered abilities trigger when their co
```

### R5 — Mutate creates a merged permanent

**Scenario:**
```
I control [[Brokkos, Apex of Forever]] (my commander, 6/6). I cast [[Auspicious Starrix]] for its mutate cost, placing Auspicious Starrix on TOP of Brokkos. What is the merged permanent?
```

**Expected:** A single permanent with Auspicious Starrix's printed name on top: it has the top card's name, types, P/T, mana cost, AND all abilities of all cards in the merged stack. Effectively, Auspicious Starrix is on top; the merged permanent is "Auspicious Starrix" (5/5 with Auspicious Starrix's abilities + 

**Failures:**
- Missing required citations: 702.139, 729.6

**Arbiter response:**
```
I need the Oracle text of both cards to proceed accurately. Let me work with the standard Oracle text I can cite.

**Oracle text in use:**

- **Brokkos, Apex of Forever** — Legendary Creature — Nightmare Elk Beast. 6/6. Trample. Mutate cost. You may cast Brokkos from your graveyard using its mutate ability. *(The full mutate reminder text applies.)*
- **Auspicious Starrix** — Creature — Elk Beast. 6/6. Mutate cost. Whenever this creature mutates, exile the top X cards of your library, where X is the number of times it has mutated. Put any number of permanent cards from among them onto the battlefield, then put the rest on the bottom of your library in a random order.

---

STATE
Q1 — Yes. [[Auspicious Starrix]] is resolving as a mutating spell. The merge process is executing.
Q2 — SBAs not yet checked; process not finished.
Q3 — Mutate trigger will enter waiting state once the event completes.
Q4 — Not stable; merge event is mid-resolution.
Q5 — No priority until resolution finishes and SBAs/triggers are handled.

---

RESOLUTION

1. **[701.38a] Mutate resolution — top placement.** [[Auspicious Starrix]] is placed on top of the pile. The merged permanent's characteristics are taken from the top object: [[Auspicious Starrix]] supplies the name, power/toughness (6/6), creature type (Elk Beast), and rules text.

2. **[701.38c] Pile assembly.** All objects in the pile are part of one permanent. The permanent has the characteristics of the top component ([[Auspicious Starrix]]), PLUS all abilities granted by each component in the pile.

3. **[701.38d] Bottom component identity.** [[Brokkos]] is on the bottom. Its abilities — Trample, the "cast from graveyard" mutate ability, and any other printed abilities — are added to the merged permanent's ability set.

4. **[903.4] Commander designation.** The merged permanent retains its commander status because [[Brokkos]] (the bottom component, which was designated as the commander) is part of the pile. Commander designation foll
```
