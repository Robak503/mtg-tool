# Arbiter Engine — Test Report

Generated: 2026-05-21 15:22:02
Model: `claude-sonnet-4-6` | Engine prompt: v1.0 | CR baseline: 2026-02-27

**28/77 passed**

## Per-test results

| Test | Title | Pass | Citations Found | Citations Missing | Duration |
|---|---|---|---|---|---|
| A1 | Leyline of the Void + creature death + Blood Artist | ✓ | 700.4, Axiom-4, 614.6 | — | 15.7s |
| A2 | Anafenza + Rest in Peace + Living Death (three-way replaceme | ✗ | 616.1a (partial: 616.1), 608.2, 614.6 | — | 29.4s |
| A3 | Commander dying with shield counter and Command Zone replace | ✗ | 701.7, 122.1g (partial: 122.1) | 903.9a | 15.5s |
| B1 | Eminence ability triggering from the Command Zone | ✗ | — | 702.106, 603.6 | 13.6s |
| B2 | Reflexive trigger during resolution | ✗ | 608.2 | 117.3b | 15.3s |
| B3 | State trigger that's already on the stack | ✗ | — | 603.8 | 13.9s |
| C1 | Commander damage with a copy of a commander | ✗ | 903.10, 903.4 | 707 | 18.7s |
| C2 | Commander tax with alternative cost | ✗ | 601.2f | 903.7 | 15.6s |
| C3 | Partner commanders with different color identities | ✗ | 903.4d (partial: 903.4) | 702.124 | 9.2s |
| C4 | Mutate onto a commander | ✗ | 903.9a (partial: 903.9) | 729.6 | 20.3s |
| D1 | Sacrifice-as-cost with cost reducer | ✓ | 601.2f | — | 13.8s |
| E1 | Layer interaction — characteristic-defining ability and Humi | ✗ | 604.3, 613.3 | 613.1f | 17.5s |
| E2 | Timestamp interaction | ✓ | 613.3c | — | 9.7s |
| F1 | Daybound/Nightbound in 4-player Commander | ✗ | — | 730.3 | 9.1s |
| F2 | APNAP in 4-player with simultaneous decisions | ✗ | 603.3b | 101.4 | 13.9s |
| G1 | Player leaving with stack objects | ✓ | 800.4b (partial: 800.4), 800.4a, 800.4 | — | 17.7s |
| H1 | The Replacement-vs-Replaced distinction | ✓ | 700.4, Axiom-4, 614.6c | — | 15.2s |
| H2 | The Waiting State is Real | ✗ | 603.6d (partial: 603.6) | 117.5, Axiom-6 | 16.9s |
| H3 | "Can't" Beats "Can" | ✗ | — | 101.2 | 13.8s |
| I1 | Stack object ownership confusion | ✗ | — | 112.3 | 10.9s |
| I2 | Mid-resolution state changes | ✓ | 608.2 | — | 11.6s |
| I3 | Modal spell — which mode is chosen? | ✓ | 601.2b | — | 10.7s |
| J1 | X cost is locked at casting | ✓ | 601.2b, 601.2f | — | 23.0s |
| J2 | Commander tax stacks with other taxes | ✓ | 601.2f, 903.7 | — | 9.7s |
| J3 | Thalia DOES apply to noncreature commander | ✗ | 601.2f, 603.3b (partial: 603.3) | 601.2i | 18.7s |
| J4 | Phyrexian mana with life replacement | ✗ | — | 107.4, 101.2, 601.2g | 13.9s |
| J5 | Cost reducer can't reduce colored requirement | ✓ | 601.2f | — | 11.6s |
| J6 | Additional cost (sacrifice) — what if the creature dies in r | ✗ | 601.2, 601.2i (partial: 601.2), 601.2g | 117.3c | 14.2s |
| J7 | Alternative cost replaces base cost, additional costs still  | ✗ | 601.2f | 117.9 | 14.6s |
| J8 | Mana ability activated DURING cost payment | ✗ | 601.2g | 605.3a | 14.3s |
| K1 | Layer 1 (copy) applies before Layer 7 (P/T) | ✗ | 613.3c | 613.1a | 10.5s |
| K2 | Layer 2 control change — control-dependent abilities | ✗ | — | 613.3c, 613.1b | 9.0s |
| K3 | Layer 4 type change cascades | ✓ | 608.2 (partial: 608.2c), 613.1d | — | 12.0s |
| K4 | CDA vs. set effect — which wins in layer 7b? | ✗ | 613.3, 613.1f (partial: 613.1) | 604.3 | 14.7s |
| K5 | Set then modify in layer 7 | ✗ | — | 613.3c, 613.3a | 3.7s |
| K6 | P/T with +1/+1 counters | ✗ | — | 613.3c, 613.3d | 8.2s |
| K7 | Timestamp ordering on layer 7c modifiers | ✗ | 613.3c | 613.7 | 12.7s |
| K8 | Dependencies override timestamps | ✗ | 613.7 (partial: 613.7a), 613.3b (partial: 613.3) | 613.1d, 613.1f | 32.1s |
| K9 | Static ability granted by counter | ✓ | 603.10 | — | 11.5s |
| K10 | Layer 7e — switch power/toughness | ✓ | 613.3c, 613.3e | — | 9.3s |
| L1 | Two replacements, controller of affected object chooses | ✓ | 616.1a (partial: 616.1) | — | 16.9s |
| L2 | Self-replacing effects bypass the 616 choice | ✗ | — | 608.2b, 101.2 | 2.3s |
| L3 | Replacement + prevention on same damage event | ✗ | — | 614, 615 | 11.9s |
| L4 | Three-way replacement on ETB counters | ✓ | 614 (partial: 614.1a), 616.1a (partial: 616.1) | — | 16.0s |
| L5 | Self-replacing effects (614.5) apply first | ✓ | 704.5f, 614.6 | — | 17.7s |
| L6 | Replacement effect for "instead" damage rerouting | ✗ | — | 614, 614.9 | 6.5s |
| M1 | Basic mana ability — no stack | ✓ | 605.3a, 605.1 (partial: 605.1a) | — | 11.6s |
| M2 | Triggered mana ability — uses stack | ✓ | 605.1a, 605.1 | — | 17.0s |
| M3 | Mana pool empties between phases | ✓ | 106.4 | — | 7.6s |
| M4 | Mana abilities during cost payment (re-test from J8 angle) | ✓ | 605.3a, 601.2g | — | 10.5s |
| M5 | Restricted mana (snow, "spend only on") | ✗ | 608.2 | 107.4h | 14.1s |
| N1 | Multiple blockers and damage assignment order | ✗ | 510.1c | 509.1c | 13.2s |
| N2 | First strike damage step (only when needed) | ✓ | 510.5 | — | 9.9s |
| N3 | Trample with multiple blockers | ✓ | 702.19b, 510.1c | — | 10.3s |
| N4 | Lifelink rules | ✓ | 702.15b, 510.1c (partial: 510.1) | — | 11.9s |
| N5 | Deathtouch with multiple blockers | ✗ | — | 702.2c, 510.1c | 10.5s |
| N6 | Creature removed from combat mid-step | ✗ | — | 510.1d, 509.1 | 6.9s |
| N7 | Indestructible + lethal damage | ✓ | 704.5g, 702.12 (partial: 702.12b) | — | 15.6s |
| N8 | Damage prevention vs. damage replacement | ✗ | 614 (partial: 614.6) | 614.5 | 10.9s |
| O1 | Tokens entering with counters | ✗ | — | 614 | 3.6s |
| O2 | Anafenza vs. token | ✓ | 704.5d | — | 11.8s |
| O3 | Token copy of a card with kicker | ✗ | — | 707.2, 702.74 | 9.2s |
| O4 | Counters on a token that "should" carry | ✗ | — | 704.5d | 10.9s |
| P1 | Planeswalker loyalty abilities are sorcery-speed | ✗ | — | 606.5, 307.1 | 8.9s |
| P2 | Each planeswalker — loyalty once per turn | ✗ | — | 606.5b | 9.0s |
| P3 | Mana ability does not require priority | ✗ | 608.2 | 605.3a | 13.6s |
| P4 | "Activate only once per turn" tracking | ✗ | — | 602.5 | 3.8s |
| Q1 | Mode chosen at casting | ✓ | 601.2b, 700.2 | — | 8.8s |
| Q2 | Modal spell with one mode becoming illegal | ✗ | 608.2b | 700.2 | 16.5s |
| Q3 | Charm "choose one or more" | ✓ | 700.2a | — | 9.4s |
| Q4 | Choose new targets and the illegality rule | ✗ | — | 114.6 | 13.5s |
| Q5 | As-enters choices | ✓ | 601.2b, 608.2 | — | 14.3s |
| R1 | Cascade — exile order matters | ✗ | — | 702.85a | 9.5s |
| R2 | Cascade — what about X spells? | ✗ | 107.3 (partial: 107.3b) | 704.5f, 702.85a | 17.2s |
| R3 | Suspend creates a delayed trigger | ✗ | — | 702.61 | 15.0s |
| R4 | Foretell — alternative cost from exile | ✗ | — | 702.143 | 9.1s |
| R5 | Mutate creates a merged permanent | ✗ | — | 702.139, 729 | 19.8s |

## Failed tests — detail

### A2 — Anafenza + Rest in Peace + Living Death (three-way replacement)

**Scenario:**
```
Three players are in the game. Player A controls [[Anafenza, the Foremost]]. Player B controls [[Rest in Peace]]. Player C casts [[Living Death]]. Player A's graveyard contains [[Phyrexian Arena]] and three creature cards. When Living Death resolves, what happens?
```

**Expected:** - Rest in Peace exiles all graveyards as part of its static replacement *before* Living Death attempts to resolve — but only for cards as they would enter graveyards going forward, not retroactively. Wait — Rest in Peace's continuous effect ("If a card or token would be put into a graveyard from any

**Failures:**
- Missing RESOLUTION section

**Arbiter response:**
```
I need Oracle text for all named cards to proceed accurately. Let me work from standard Oracle text:

- **[[Anafenza, the Foremost]]**: "If a nontoken creature would be put into an opponent's graveyard from anywhere, exile it instead."
- **[[Rest in Peace]]**: "If a card would be put into a graveyard from anywhere, exile it instead."
- **[[Living Death]]**: "Each player exiles all creature cards from their graveyard, then sacrifices all creatures they control, then puts all cards they exiled this way onto the battlefield."

---

STATE

Q1 — Yes. [[Living Death]] is currently resolving.
Q2 — SBAs suspended during resolution.
Q3 — Triggers are detected but not yet inserted.
Q4 — No; resolution is ongoing.
Q5 — Priority is suspended; the spell is resolving.

---

## RESOLUTION

**1. First clause — "Each player exiles all creature cards from their graveyard."**

This is a spell instruction moving cards to exile directly. Player A exiles their three creature cards. [[Phyrexian Arena]] is not a creature card and is not affected. Player B and C exile their creature cards similarly.
No replacement effects apply to exile-to-exile; this instruction already targets the exile zone. [701.18]

**2. Second clause — "Sacrifices all creatures they control."**

Each player sacrifices all creatures they currently control. This generates a WOULD-EVENT: creatures go to graveyards.

**3. Replacement analysis — sacrifice results.**

Two replacement effects compete for each creature being sacrificed:

- **[[Rest in Peace]]** (Player B): "If a card would be put into a graveyard from anywhere, exile it instead." [614.6]
- **[[Anafenza, the Foremost]]** (Player A): "If a nontoken creature would be put into an opponent's graveyard from anywhere, exile it instead." [614.6]

Both are zone-change replacement effects applicable to creatures going to a graveyard. [616.1]

**Interaction order:**

For **Player B's and C's** creatures dying (opponents of Player A):
Both [[Rest in Peace]] and [[Anafenz
```

### A3 — Commander dying with shield counter and Command Zone replacement

**Scenario:**
```
I control my commander [[Atraxa, Praetors' Voice]]. It has one shield counter on it (from [[Shielded by Faith]] or similar). An opponent casts [[Murder]] targeting Atraxa. Atraxa would be destroyed. What happens?
```

**Expected:** The shield counter is removed; Atraxa is not destroyed; Atraxa remains on the battlefield with no shield counters. The Command Zone replacement (903.9a) never triggers because Atraxa never went to a graveyard.

**Failures:**
- Missing required citations: 903.9a

**Arbiter response:**
```
STATE
Q1 — Yes: [[Murder]] is resolving, attempting to destroy [[Atraxa, Praetors' Voice]].
Q2 — No SBAs pending yet; destruction hasn't occurred.
Q3 — No triggers waiting yet.
Q4 — Not stable; resolution in progress.
Q5 — Priority not yet returned; resolution must complete first.

RESOLUTION

1. **WOULD-EVENT:** [[Murder]] instructs "Destroy target creature." The would-event is: Atraxa is destroyed. [700.4, 701.7]

2. **"Can't" check:** No "can't be destroyed" effect applies. [614.17] Proceed.

3. **Replacement/prevention check:** Atraxa has a shield counter. Shield counters carry the replacement effect: "If damage would be dealt to this creature or it would be destroyed, remove a shield counter from it instead." This is a replacement effect that replaces the destruction event. [614.6] It applies; the shield counter is removed instead of Atraxa being destroyed.

4. **FINAL EVENT:** One shield counter is removed from Atraxa. Atraxa is **not** destroyed. Atraxa remains on the battlefield. [614.6, 122.1]

5. **Axiom 4 — The rest of the engine sees only the final event:** The event that occurred is "a counter was removed from Atraxa." No destruction event occurred. No zone change occurred. [Axiom 4]

6. **SBA check:** Atraxa has no shield counters remaining, but SBAs check for lethal damage, 0-toughness, etc. — none applicable from this event alone. [704.5]

7. **Trigger detection:** Check for any abilities that trigger on counters being removed. If none are present in this board state, no triggers. [603.2]

8. **Priority returns** to the active player after [[Murder]] finishes resolving. [117.3b]

RULE TRACE
- [700.4] "Destroy" defined.
- [701.7] Destroy instruction.
- [614.6] Zone-change replacement; shield counter replacement applies before the destruction event.
- [614.17] "Can't" check — not applicable here.
- [122.1] Counters on permanents.
- [704.5] SBAs checked; none triggered.
- [603.2] Trigger detection on final event.
- [117.3b] Priority return after resolut
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
Q1 — No process currently resolving.
Q2 — No SBAs applicable.
Q3 — No triggers in waiting state yet; question concerns whether one will enter waiting state.
Q4 — Game is at a stable checkpoint; player is about to cast.
Q5 — Active player has priority and is casting [[Bloodghast]].

RESOLUTION
1. Player initiates casting of [[Bloodghast]] [601.2].
2. All costs are paid; [[Bloodghast]] is placed on the stack [601.2i].
3. Casting is now complete. The game checks for triggered abilities that trigger on "whenever you cast" [603.3].
4. [[Edgar Markov]]'s Eminence ability reads: "Whenever you cast another Vampire spell, if Edgar Markov is in the command zone or on the battlefield, create a 1/1 black Vampire creature token." The ability checks its own condition — is [[Edgar Markov]] in the command zone or on the battlefield? Yes, he is in the command zone [903.9 establishes that Eminence functions from the command zone per the card's own text].
5. [[Bloodghast]] is a Vampire. It is "another" Vampire spell relative to [[Edgar Markov]] himself. Trigger condition is met.
6. The Eminence triggered ability enters the waiting state [603.3], then is placed on the stack above [[Bloodghast]] [603.3b].
7. Active player receives priority with the triggered ability on the stack above the spell.

RULE TRACE
- [601.2i] — Spell is cast when all costs are paid; triggers check at this point.
- [603.3] — Triggered abilities trigger when their trigger event occurs.
- [603.3b] — Triggered ability controlled by active player goes on stack above [[Bloodghast]].
- [903.9] — Commander abilities that function in the command zone do so only if the card specifically states that they do. [[Edgar Markov]]'s Eminence clause explicitly states "if Edgar Markov is in the command zone or on the battlefield," satisfying this requirement.
- Axiom 5 — Triggering and stack insertion are separate; the trigger was detected at cast, then placed on the stack.
- Axiom 6 — Waiting triggers are a real engine sta
```

### B2 — Reflexive trigger during resolution

**Scenario:**
```
I activate [[Bow of Nylea]]'s second ability: "Put up to four target creature cards from your graveyard on the bottom of your library." It targets three creature cards. The ability is resolving. While it's resolving, does anything trigger?
```

**Expected:** No reflexive trigger here (Bow of Nylea doesn't have one). For a true reflexive-trigger test, see the next case. But the test for B2 is whether the engine correctly identifies that resolution proceeds without a priority window — players cannot respond mid-resolution.

**Failures:**
- Missing required citations: 117.3b

**Arbiter response:**
```
STATE
Q1 — Yes. Bow of Nylea's second ability is resolving.
Q2 — No SBAs applicable mid-resolution.
Q3 — Unknown pending resolution analysis.
Q4 — No; engine is mid-resolution.
Q5 — Priority not yet returned; ability is still resolving.

RESOLUTION
1. **Resolution begins** [608.2]: The ability instructs: put up to four target creature cards from your graveyard on the bottom of your library. Three targets were chosen and are legal.
2. **The event is constructed**: Three creature cards move simultaneously from graveyard to library (bottom). [608.2c — simultaneous execution of a single instruction.]
3. **"Can't" check**: No applicable "can't" effect preventing this zone change.
4. **Replacement effects checked**: Any replacement effects that apply to creatures moving from graveyard to library are checked here (e.g., a [[Rest in Peace]]-style effect, if present). None specified in this scenario.
5. **Final event occurs**: All three creature cards move simultaneously to the bottom of the library.
6. **Trigger detection** [603.2]: The game scans for any triggered abilities whose trigger conditions are now satisfied by this event. Crucially, **"dies" triggers** (graveyard from battlefield) are not relevant — these cards were already in the graveyard. The relevant trigger window is graveyard-to-library.
7. **"Whenever a card is put into your graveyard" triggers do not fire** — the cards are leaving the graveyard, not entering it.
8. **"Whenever a card leaves your graveyard" triggers** (if any such ability exists on the battlefield) would fire here. None are specified in this scenario.
9. **Ability finishes resolving** [608.2k]. Priority will be returned after SBA check and trigger insertion.

RULE TRACE
- [608.2] — Ability resolution procedure.
- [608.2c] — Simultaneous execution of a single instruction produces one event.
- [603.2] — Trigger detection occurs when an event matches a trigger condition.
- [603.3] — Triggered abilities go on the stack after the current process
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
Q2 — SBAs are about to be checked.
Q3 — No triggers are in the waiting state.
Q4 — Not yet stable; SBA check is pending.
Q5 — Irrelevant at this moment.

RESOLUTION
1. **Identify the ability in question.** [[Phage the Untouchable]]'s "if it wasn't cast from your hand" clause is a triggered ability that triggers when Phage enters the battlefield. It has already fired (or failed to fire) at the moment Phage entered the battlefield. It is not an SBA.
2. **Determine Phage's current zone.** Phage is in the graveyard. It is not on the battlefield and is not entering the battlefield now.
3. **SBA check scope.** SBAs apply to the current game state [704.3]. No SBA exists that causes a trigger to fire based on a permanent being in the graveyard. The relevant SBA for Phage would be [704.6c] — the Commander zone-change replacement — but that concerns commanders changing zones, not Phage's loss-of-game ability.
4. **Trigger window has closed.** The enters-the-battlefield trigger on [[Phage the Untouchable]] had its detection window at the moment Phage entered the battlefield [603.2]. If Phage is now in the graveyard without that trigger having been placed on the stack, the window has passed. No retroactive trigger fires during an SBA check.
5. **Conclusion.** SBA checks do not cause triggered abilities to fire. They are not the same mechanism [704.1 vs. 603].

RULE TRACE
- [603.2] — Triggered abilities trigger at the moment the event occurs; detection window is not re-opened during SBA checks.
- [704.1] — SBAs are distinct from triggered abilities; they are checked and applied automatically but do not generate triggers themselves.
- [704.3] — SBAs are checked as a game function; only the enumerated SBAs in 704.5 apply.
- Axiom 5 — Triggering and stack insertion are separate events; a trigger must first be detected before it can be inserted.
- Axiom 6 — There is no waiting trigger here; one was never created.

VERDICT
No — [[Phage th
```

### C1 — Commander damage with a copy of a commander

**Scenario:**
```
I control my commander [[Krenko, Mob Boss]]. I cast [[Mirror Image]] copying Krenko. The copy attacks an opponent and deals 6 combat damage. The original Krenko also attacked and dealt 6 damage. Does the opponent have 12 commander damage from Krenko?
```

**Expected:** No. The opponent has 6 commander damage. Only the original Krenko is a commander. The Mirror Image copy is a permanent that has Krenko's copiable values, but it is not a commander — commander status is not a copiable value [707, 903.4].

**Failures:**
- Missing required citations: 707

**Arbiter response:**
```
I need Oracle text for both cards to proceed accurately, but I can work with the well-known functional text. Let me flag my assumptions.

**Assumed Oracle text:**
- [[Krenko, Mob Boss]]: Legendary Creature — Goblin Warrior. Tap: Create X 1/1 red Goblin creature tokens, where X is the number of Goblins you control.
- [[Mirror Image]]: You may have [this] enter as a copy of any creature you control.

---

STATE
Q1 — No process currently resolving.
Q2 — SBAs not yet checked at this point (combat damage has been dealt; evaluating results).
Q3 — No waiting triggers relevant to this question.
Q4 — Evaluating combat damage assignment and commander damage tracking.
Q5 — Not relevant to this ruling.

---

RESOLUTION

1. **[[Mirror Image]] copies [[Krenko, Mob Boss]].** Mirror Image enters the battlefield as a copy of Krenko. It copies copiable values: name, mana cost, type, subtypes, rules text, power/toughness [706.2]. The copy's name is "Krenko, Mob Boss."

2. **The copy is NOT your commander.** A commander is a specific object designated at game start [903.4]. The copy created by Mirror Image is a new object that was never designated as your commander. Copiable values do not include "is this player's commander" status — that designation is a property of the original object, not a copiable characteristic [903.4, 706.2].

3. **Commander damage is tracked per commander object, not per name.** CR 903.10 tracks damage dealt by a commander specifically as damage dealt by the designated commander object. The Mirror Image copy, while sharing the name "Krenko, Mob Boss," is not a commander object. Its combat damage is ordinary combat damage, not commander damage.

4. **Result of combat:** The original Krenko (your commander) dealt 6 combat damage → **6 commander damage** tracked against that opponent [903.10]. Mirror Image (not a commander) dealt 6 combat damage → **0 commander damage**; this is simply 6 ordinary damage.

5. **Total commander damage from Krenko:** 6.

---

RULE TR
```

### C2 — Commander tax with alternative cost

**Scenario:**
```
My commander [[Animar, Soul of Elements]] has died and returned to the command zone twice. I want to cast it for its evoke cost — wait, Animar doesn't have evoke. Use a generic example: my commander has been cast twice from the command zone already. I want to cast it again, but I have a [[Fist of Suns]] in play (allowing me to pay {WUBRG} as the alternative cost). Do I still pay the commander tax?
```

**Expected:** Yes, the tax still applies. Commander tax is an additional cost that applies regardless of whether you're using the base mana cost or an alternative cost [903.7, 601.2f].

**Failures:**
- Missing required citations: 903.7

**Arbiter response:**
```
STATE
Q1 — No process resolving.
Q2 — No SBAs applicable.
Q3 — No waiting triggers.
Q4 — Stable checkpoint.
Q5 — Active player has priority; question is about legal casting cost of their commander.

---

RESOLUTION

1. **Identify the costs involved.** The commander has been cast from the command zone twice previously, so the commander tax is {4} (2 × {2}) [903.10a]. The commander's base mana cost is whatever it is (generic example). [[Fist of Suns]] offers an alternative cost of {W}{U}{B}{R}{G} [601.2b].

2. **Determine whether the alternative cost replaces the mana cost.** [[Fist of Suns]] (Oracle text required — assuming standard printed text: "You may pay {W}{U}{B}{R}{G} rather than pay the mana cost of spells you cast.") provides an alternative cost. An alternative cost replaces the spell's mana cost in the payment step [601.2f]. It does not replace or interact with additional costs.

3. **Determine whether commander tax is an additional cost or part of the mana cost.** The commander tax is an additional cost imposed by rule [903.10a], not part of the spell's mana cost. It is not a mana cost; it is a cost that is added on top of whatever cost you are paying.

4. **Apply the interaction.** When you choose to pay an alternative cost, you pay that alternative cost *instead of the mana cost*, but you still pay all applicable additional costs [601.2f, 601.2g]. The commander tax is an additional cost. Therefore, using [[Fist of Suns]], the total cost to cast the commander is **{W}{U}{B}{R}{G} + {4}**.

5. **Lock in the total cost at step 601.2f.** The alternative cost substitutes for the mana cost; the {4} commander tax is added on top. This is the cost that must be paid.

---

RULE TRACE
- [903.10a] — Commander tax: for each previous time cast from command zone, cost increases by {2}.
- [601.2b] — Alternative costs defined; player may pay an alternative cost rather than the mana cost.
- [601.2f] — Total cost is locked in: start with chosen alternative cost (replacing
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
Q4 — Stable checkpoint; rules question presented.
Q5 — Deckbuilding legality question; priority irrelevant.

RESOLUTION
1. Identify the Commander color identity rule. A card's color identity is the union of all mana symbols appearing in its mana cost and rules text. [903.4]
2. In a Partner Commander pairing, the deck's permitted color identity is the union of both commanders' color identities. [903.4b]
3. [[Tymna the Weaver]] color identity: {W}{B}.
4. [[Thrasios, Triton Hero]] color identity: {G}{U}.
5. Combined permitted color identity: {W}{U}{B}{G} — all four colors, no red.
6. [[Cyclonic Rift]] oracle text contains only {U} and {2}{U} mana symbols. Color identity: {U}.
7. {U} is a subset of {W}{U}{B}{G}. [903.4]
8. [[Cyclonic Rift]] is legal in this deck.

RULE TRACE
- [903.4] — Color identity defined by mana costs and mana symbols in rules text.
- [903.4b] — Partner commanders combine color identities for deckbuilding.
- Axiom 1 — The game (here, deckbuilding) is one ordered engine; no exception applies.

VERDICT
[[Cyclonic Rift]] is legal in a [[Tymna the Weaver]] / [[Thrasios, Triton Hero]] Partner Commander deck.
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
I need the Oracle text for both cards to proceed accurately. Let me work with the standard printed Oracle text.

**[[Brokkos, Apex of Forever]]**: Mutate {2}{B/G}{G}. You may cast this card from your graveyard using its mutate cost. As long as this card is not on top of a mutated creature, it loses all abilities.

**[[Auspicious Starrix]]**: Mutate {4}{G}. Whenever this creature mutates, exile the top X cards of your library, where X is the number of times this creature has mutated. Put any number of permanent cards from among them onto the battlefield.

---

STATE
Q1 — No process resolving; the merged permanent has just been destroyed.
Q2 — SBAs caused destruction; now processing zone-change destinations for a merged permanent.
Q3 — No triggers yet evaluated.
Q4 — Not stable; zone-change destinations must be determined.
Q5 — N/A during SBA resolution.

---

RESOLUTION

1. **Destruction event fires.** The merged permanent (a mutated creature composed of [[Auspicious Starrix]] on top and [[Brokkos, Apex of Forever]] beneath) moves from the battlefield to the graveyard as a single event. [700.2], [701.7]

2. **Mutated permanent death rule.** When a mutated permanent leaves the battlefield, each card that comprised it is treated as a separate object moving to its destination zone. [721.4]

3. **Determine destination for each component card individually.** Zone-change replacement effects are applied per card. [614.6], [616.1]

4. **[[Auspicious Starrix]] is on top — it is not a commander.** No replacement effect redirects it. It goes to its owner's graveyard. [721.4]

5. **[[Brokkos, Apex of Forever]] is a commander.** The commander zone-change replacement effect applies [903.9]: its owner *may* move it to the command zone instead of the graveyard.

6. **The choice is the player's.** If the player elects the command zone replacement, [[Brokkos]] goes to the command zone. If they decline, it goes to the graveyard — but note [[Brokkos]] can be cast from the graveyard usin
```

### E1 — Layer interaction — characteristic-defining ability and Humility

**Scenario:**
```
[[Humility]] is on the battlefield: "All creatures lose all abilities and have base power and toughness 1/1." I control [[Tarmogoyf]] (a creature whose power/toughness are defined by the card types in all graveyards). What is Tarmogoyf's power and toughness?
```

**Expected:** Tarmogoyf is 1/1.

**Failures:**
- Missing required citations: 613.1f

**Arbiter response:**
```
STATE
Q1 — No process resolving.
Q2 — No SBAs immediately applicable (pending final P/T determination).
Q3 — No waiting triggers.
Q4 — Stable checkpoint; P/T layer resolution required.
Q5 — Irrelevant to this rules question.

---

RESOLUTION

**Card text provided:**
- [[Humility]]: "All creatures lose all abilities and have base power and toughness 1/1."
- [[Tarmogoyf]]: "\*/1+\* — Tarmogoyf's power is equal to the number of card types among cards in all graveyards and its toughness is equal to that number plus 1."

**Layer 7 P/T analysis [613.3, 613.7]:**

Layer 7 is subdivided:

- **7a** — Base P/T set by characteristic-defining abilities (CDAs) or rule effects.
- **7b** — P/T setting effects without "base."
- **7c** — P/T adjustments (+N/+N, etc.).
- **7d** — P/T switching.

**Step 1 — Identify Tarmogoyf's P/T-defining ability.**
Tarmogoyf's \*/1+\* is a characteristic-defining ability (CDA) [604.3]. CDAs function in all zones and define a characteristic. This applies in **Layer 7a**.

**Step 2 — Identify Humility's effect.**
[[Humility]] does two things:
- Causes creatures to **lose all abilities** (Layer 6).
- Gives creatures **base power and toughness 1/1** (Layer 7a).

**Step 3 — Apply Layer 6 first [613.3].**
In Layer 6, [[Humility]] strips [[Tarmogoyf]] of all abilities, including its CDA. The CDA is gone before Layer 7 is evaluated.

**Step 4 — Apply Layer 7a [613.3].**
With the CDA removed, [[Tarmogoyf]] has no CDA of its own to apply in 7a. [[Humility]]'s "base power and toughness 1/1" effect applies in 7a, setting base P/T to **1/1**.

**Step 5 — Layers 7b, 7c, 7d.**
No other relevant effects. P/T remains 1/1.

---

RULE TRACE
- [613.3] — Continuous effects applied in layer order: Layer 6 before Layer 7.
- [604.3] — Tarmogoyf's \*/1+\* is a CDA; it defines a characteristic and applies in Layer 7a.
- [613.3e] — Layer 6: ability-removing effects.
- [613.3f/g] — Layer 7a: CDA-based and base P/T setting effects.
- [613.7] — Timestamp order within the same l
```

### F1 — Daybound/Nightbound in 4-player Commander

**Scenario:**
```
It is currently day. The most recent player (Player A) cast 0 spells last turn. Player B cast 2 spells last turn. Player C cast 1 spell last turn. Player D (the active player) is about to begin their turn. Does it become night?
```

**Expected:** No. Day/Night transitions check the *previous player's* turn, not the current player's incoming turn. The check happens at the start of the active player's precombat main phase. Day becomes night if the previous player cast no spells during their turn.

In a 4-player game, "previous player" means th

**Failures:**
- Missing required citations: 730.3

**Arbiter response:**
```
STATE
Q1 — No process resolving.
Q2 — No SBAs applicable.
Q3 — No waiting triggers relevant yet.
Q4 — Game is at a stable checkpoint; day/night transition is checked at the beginning of each player's turn.
Q5 — Player D is the active player, about to begin their turn.

RESOLUTION
1. The day/night transition check occurs at the beginning of Player D's untap step [726.2].
2. The governing rule for day-to-night transition is: it becomes night if the *active player* cast no spells during their *most recent* turn [726.3].
3. Player D is the active player. The check looks exclusively at whether Player D cast zero spells during their most recent turn.
4. The scenario does not state how many spells Player D cast on their most recent turn. This is the only relevant data point.
5. Player A casting 0 spells, Player B casting 2, and Player C casting 1 are all irrelevant to this check. Only the active player's own prior turn matters for day-to-night transition [726.3].

RULE TRACE
- CR 726.2 — Day/night transition check occurs at the beginning of the active player's untap step.
- CR 726.3 — Day becomes night if the active player cast no spells during their most recent turn; night becomes day if the active player cast at least two spells during their most recent turn.
- Axiom 1 — The game is one ordered engine; only the specified trigger condition for the active player governs the transition.

UNRESOLVED
How many spells Player D cast on their most recent turn is not stated. If Player D cast **zero spells** on their most recent turn, it becomes night. If Player D cast **one or more spells**, it remains day. The spell counts of Players A, B, and C are irrelevant to this determination.
```

### F2 — APNAP in 4-player with simultaneous decisions

**Scenario:**
```
[[Wrath of God]] resolves in a 4-player game. Players in turn order: A (active), B, C, D. Each player has a creature with a "When this dies" trigger. All four triggers fire simultaneously. What order do they go on the stack?
```

**Expected:** - Triggers go on the stack in APNAP order: A first, then B, then C, then D.
- Each player can order their own triggers if they have multiple, but with one per player, the order is A → B → C → D.
- The stack resolves LIFO, so D's trigger resolves first.

**Failures:**
- Missing required citations: 101.4

**Arbiter response:**
```
STATE
Q1 — Wrath of God is finishing resolution; creatures are dying as part of that process.
Q2 — SBAs not yet checked (resolution completing).
Q3 — Four "When this dies" triggers are in the waiting state simultaneously.
Q4 — Not yet stable; trigger insertion pending.
Q5 — Priority not yet distributed; insertion order must be determined first.

RESOLUTION
1. **WOULD-EVENT:** [[Wrath of God]] instructs "destroy all creatures." The destruction event is processed. [608.2]
2. **Replacement/prevention check:** No applicable replacements assumed. All four creatures move to their respective owners' graveyards simultaneously as a single event. [614.6]
3. **Trigger detection:** All four "When this dies" abilities detect the same event — the simultaneous death of all creatures. All four enter the waiting state at the same moment. [603.3]
4. **Finish process:** [[Wrath of God]] is done resolving and leaves the stack. [608.2k]
5. **SBA loop:** Checked; nothing applicable. [704.3]
6. **Trigger insertion:** All waiting triggers are now placed on the stack. Placement follows [603.3b]: the active player (A) places their trigger(s) first, then each other player in turn order (B, C, D) places their trigger(s). Each player may order their own triggers if they control multiple; here each controls one.
7. **Result — stack (top to bottom):**
   - D's trigger (last placed, resolves first)
   - C's trigger
   - B's trigger
   - A's trigger (first placed, resolves last)
8. **SBA loop again:** Nothing applicable. [704.3]
9. **Priority:** Active player A receives priority. [117.3b]

RULE TRACE
- [603.3] — Trigger detection when a trigger condition is met.
- [603.3b] — Active player puts their triggers on the stack first, then each other player in turn order; last-placed trigger is on top.
- [608.2] — Spell resolution procedure.
- [704.3] — SBA check timing.
- Axiom 5 — Triggering and stack insertion are separate steps; all four triggers entered the waiting state before any were placed.
- Axi
```

### H2 — The Waiting State is Real

**Scenario:**
```
[[Mox Opal]] is in play. I cast [[Bloodbraid Elf]] (cascade), which exiles cards until I hit a non-land cheaper card and casts it for free. Cascade reveals [[Reckless Bushwhacker]] (with surge — irrelevant here). I cast Bushwhacker. Between Bloodbraid resolving and Bushwhacker resolving, Mox Opal's "metalcraft" condition becomes true (because Bushwhacker entered the battlefield as my third artifact — wait, Bushwhacker isn't an artifact. Let me restate). Forget Mox Opal.
Cleaner test: I control no creatures. I cast [[Soul Warden]] ("Whenever a creature enters the battlefield, you gain 1 life"). I follow it with [[Elvish Mystic]]. Does Soul Warden trigger from its own ETB? Does it trigger from Elvish Mystic's ETB?
```

**Expected:** Soul Warden triggers from its own ETB (it's on the battlefield when it itself enters, so the condition is met). The trigger waits, SBAs check, the trigger is placed on the stack, then the active player gets priority. After that, Elvish Mystic is cast and its ETB also triggers Soul Warden, gaining th

**Failures:**
- Missing required citations: 117.5, Axiom-6

**Arbiter response:**
```
STATE

Q1 — No process currently resolving; both spells have been cast and have resolved (or we are evaluating at the moment of each ETB event).
Q2 — No SBAs applicable.
Q3 — Trigger status is the subject of the ruling.
Q4 — Game is at stable checkpoints between events.
Q5 — Irrelevant to the core rules question.

---

RESOLUTION

**Event 1: [[Soul Warden]] enters the battlefield.**

1. The ETB event occurs: [[Soul Warden]] moves from the stack to the battlefield [400.7, 614.6].
2. The game checks for triggered abilities whose trigger conditions are met by this event [603.2].
3. [[Soul Warden]]'s trigger reads: "Whenever *a* creature enters the battlefield..." — this is a general ETB trigger with no restriction on which creature. The game asks: did a creature enter the battlefield? Yes — [[Soul Warden]] itself did [603.2].
4. A triggered ability triggers at the moment the triggering event occurs. [[Soul Warden]] is already on the battlefield when its own ETB is evaluated, so it exists as a permanent and can have triggered abilities [603.3a — the ability exists on the permanent at the time of the event].
5. The trigger is placed in the waiting state, then inserted onto the stack [603.3, 603.6 — the ability looks back to see that a creature did enter, which it did].
6. **Soul Warden DOES trigger from its own ETB. You gain 1 life.**

---

**Event 2: [[Elvish Mystic]] enters the battlefield (cast subsequently).**

1. The ETB event occurs: [[Elvish Mystic]] moves from the stack to the battlefield [614.6].
2. The game checks all triggered abilities for matching trigger conditions [603.2].
3. [[Soul Warden]] is already on the battlefield, watching. A creature entered the battlefield — the condition is met.
4. The trigger goes to the waiting state, then is inserted onto the stack controlled by [[Soul Warden]]'s controller [603.3b].
5. **Soul Warden DOES trigger from Elvish Mystic's ETB. You gain 1 life.**

---

RULE TRACE

- [603.2] — Triggered abilities trigger when their 
```

### H3 — "Can't" Beats "Can"

**Scenario:**
```
An opponent controls [[Teferi's Protection]] in effect (their permanents have "phased out" status and they can't lose the game). I cast [[Mindslaver]] targeting that opponent. I want to use my Mindslaver-controlled turn to make them concede — wait, they can still concede regardless. Different test:
[[Iona, Shield of Emeria]] is on the battlefield naming "Red." I am controlling Iona (it's my permanent, but I named red when it ETBed). I want to cast [[Lightning Bolt]]. Iona's static ability says I "can't cast red spells." Can I cast Lightning Bolt?
```

**Expected:** No. Iona's "can't" overrides any "can" permissions [101.2].

**Failures:**
- Missing required citations: 101.2

**Arbiter response:**
```
STATE
Q1 — No process is currently resolving.
Q2 — No SBAs applicable to this question.
Q3 — No waiting triggers relevant.
Q4 — Game is at a stable checkpoint; priority is active.
Q5 — You hold priority. The question is whether [[Lightning Bolt]] is a legal cast action for you.

---

RESOLUTION

1. **Identify the restriction.** [[Iona, Shield of Emeria]]'s static ability reads (per Oracle): "Players can't cast spells of the chosen color." The chosen color is Red. [[Lightning Bolt]] is a red spell. You are a player.

2. **Identify the governing rule type.** "Can't cast" is a restriction on a game action — specifically, it prohibits the casting event from occurring at all. This is governed by CR 601.4: if a player is prohibited from casting a spell, that player may not cast it.

3. **Apply Axiom 3.** "Can't" effects are not replacement effects [614.17]. They are absolute prohibitions. There is no replacement-effect interaction, no layering question, no timestamp dispute to resolve here.

4. **Check for any enabling effect.** No card text has been provided granting you permission to cast red spells despite a "can't" restriction. Without such an enabling effect, the "can't" is absolute [101.2 golden rule: "can't" beats "can"].

5. **Note that controller status is irrelevant.** Iona's ability does not say "players other than its controller" — it says "players." You control [[Iona, Shield of Emeria]]. The static ability still applies to you equally.

6. **Conclusion.** You may not legally cast [[Lightning Bolt]] while Iona is on the battlefield naming Red.

---

RULE TRACE
- CR 601.4 — A player can't cast a spell if prohibited from doing so.
- CR 114 (restrictions and permissions) — "can't" prohibitions override permissive rules.
- CR 101.2 (Golden Rule) — "Can't" takes precedence over "can."
- **Axiom 3** — "Can't" effects [614.17] are not ordinary replacement effects; they are absolute prohibitions, not subject to replacement/prevention sequencing.
- Iona, Shield of Eme
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
Q1 — Mind's Desire's storm copy/exile-and-cast effect is resolving; Brainstorm has been cast from exile and is on the stack.
Q2 — No SBAs applicable.
Q3 — No relevant waiting triggers specified.
Q4 — Not yet stable; Brainstorm is on the stack awaiting resolution.
Q5 — Active player (Player A) or opponent holds priority; irrelevant to the controller question.

RESOLUTION
1. **WOULD-EVENT:** Mind's Desire's instruction reads "you may cast that card without paying its mana cost." The "you" refers to the controller of Mind's Desire at the time the ability resolves. [608.2b — "you" in a spell or ability refers to its controller.]
2. **Casting event:** When a player is instructed to cast a spell by a resolving spell or ability, that player becomes the controller of the cast spell. [601.2 — the player who casts a spell is its controller as it's placed on the stack.] [110.2 — a spell's controller is the player who put it on the stack.]
3. **Controller determination:** Player A controlled Mind's Desire; Mind's Desire's effect instructs Player A ("you may cast that card"). Player A is therefore the one performing the cast. Player A is the controller of Brainstorm on the stack.
4. No replacement or prevention effects alter this. [Axiom 2 — no applicable replacement here.]

RULE TRACE
- [608.2b] — "You" in a resolving spell/ability refers to the controller of that spell/ability.
- [601.2] — Casting procedure; the casting player becomes the spell's controller.
- [110.2] — A spell's controller is the player who put it on the stack.
- Axiom 1 — The game is one ordered engine; controller is determined at cast time, not derivatively.

VERDICT
Player A, as the controller of [[Mind's Desire]] and the player instructed by its effect, is the controller of [[Brainstorm]] while it is on the stack.
```

### J3 — Thalia DOES apply to noncreature commander

**Scenario:**
```
My commander is [[Niv-Mizzet, Parun]] (a creature). My opponent controls [[Thalia, Guardian of Thraben]]. I want to cast [[Counterspell]] (not my commander). Niv-Mizzet has "Niv-Mizzet, Parun can't be countered. Whenever you cast an instant or sorcery spell, draw a card." Does Thalia's tax apply to Counterspell, and does the draw trigger?
```

**Expected:** Yes, Thalia's tax applies — Counterspell is a noncreature spell, costs {1}{U}{U} instead of {U}{U}. The draw trigger fires when Counterspell is cast [601.2i].

**Failures:**
- Missing required citations: 601.2i

**Arbiter response:**
```
STATE
Q1 — No process currently resolving.
Q2 — No SBAs applicable.
Q3 — No triggers in waiting state.
Q4 — Game is at a stable checkpoint.
Q5 — Active or priority player is casting [[Counterspell]]; relevant continuous effects and triggers are under evaluation.

---

RESOLUTION

1. **Casting declared.** You announce [[Counterspell]] as the spell being cast. [601.2a]

2. **Thalia's tax applies.** [[Thalia, Guardian of Thraben]] reads (per standard Oracle): "Nonland permanents enter the battlefield with an additional +1/+1 counter... Other nonCreature spells cost {1} more to cast." [[Counterspell]] is a noncreature spell (instant). Thalia's effect is a cost-increasing continuous effect active in layer 6 (cost modification). [601.2f, 613]

3. **Cost lock-in.** At the point total costs are calculated and locked in during the casting process, [[Counterspell]]'s total mana cost becomes {U}{U} + {1} = {U}{U}{1}. You must pay this. [601.2f]

4. **[[Counterspell]] is placed on the stack.** Assuming costs are paid, it becomes a spell on the stack. [601.2h]

5. **Trigger detection.** Niv-Mizzet's triggered ability reads: "Whenever **you** cast an instant or sorcery spell, draw a card." [[Counterspell]] is an instant spell cast by you. The trigger condition is met. [603.2]

6. **Niv-Mizzet's "can't be countered" clause is irrelevant here.** That clause applies only to [[Niv-Mizzet, Parun]] itself as an object on the stack. [[Counterspell]] is a separate object; the clause does not extend to it. [400.7, 101.2]

7. **Trigger enters waiting state.** The draw-a-card trigger is placed in the waiting state, then inserted onto the stack above [[Counterspell]] at the next available opportunity (after [[Counterspell]] is on the stack and SBAs are checked). [603.3, Axiom 5, Axiom 6]

8. **Priority passes.** You receive priority with both the trigger and [[Counterspell]] on the stack.

---

RULE TRACE
- [601.2f] — Total cost calculated and locked in before payment; cost-increase effects 
```

### J4 — Phyrexian mana with life replacement

**Scenario:**
```
I control [[Platinum Emperion]] (my life total can't change). I want to cast [[Mutagenic Growth]] paying its Phyrexian green: 2 life instead of {G}. Can I cast it?
```

**Expected:** No. Paying 2 life requires losing 2 life. Platinum Emperion's static "your life total can't change" prevents this loss. Since the cost cannot be paid, the spell cannot be cast [101.2, 601.2g].

**Failures:**
- Missing required citations: 107.4, 101.2, 601.2g

**Arbiter response:**
```
I need Oracle text for both cards to proceed formally. Using publicly known Oracle text:

- **Platinum Emperion**: "Your life total can't change."
- **Mutagenic Growth**: "You may pay 2 life rather than pay this spell's mana cost." / Target creature gets +2/+2 until end of turn.

---

STATE

Q1 — No process currently resolving.
Q2 — No SBAs applicable.
Q3 — No waiting triggers.
Q4 — Stable checkpoint; player holds priority in their main phase.
Q5 — Casting player has priority and is attempting to cast [[Mutagenic Growth]] using the Phyrexian mana alternative cost (pay 2 life).

---

RESOLUTION

1. **WOULD-EVENT identified**: Player declares intent to cast [[Mutagenic Growth]] and selects "pay 2 life" as the alternative cost. At cost lock-in [601.2f], the total cost is defined as "pay 2 life."
2. **"Can't" check [614.17]**: [[Platinum Emperion]]'s effect is a "can't change" restriction on the life total. This is a continuous effect that prevents the life payment from occurring. "Can't" effects are not replacement effects — they flatly prohibit the event.
3. **Cost legality**: A cost involving payment of life requires that the life total *can* change as part of that payment. Because the life total cannot change [Axiom 3], the life payment cannot be made. An alternative cost that cannot legally be paid cannot be selected.
4. **Other cost options**: The player may still cast [[Mutagenic Growth]] by paying {G} normally, if {G} is available.
5. **Result**: The Phyrexian alternative cost is an illegal choice. The spell cannot be cast using that cost.

---

RULE TRACE

- [601.2f] — Costs are locked in during casting; an unpayable cost makes that casting mode illegal.
- [614.17] — "Can't" effects prohibit an event outright; they are not replacement effects.
- [117.3] — A player may only take a legal action; choosing an unpayable cost is not a legal action.
- **Axiom 3** — "Can't" effects are not ordinary replacement effects; they flatly block the event.

---

VERDICT

You ca
```

### J6 — Additional cost (sacrifice) — what if the creature dies in response?

**Scenario:**
```
I begin casting [[Diabolic Intent]] (cost: {B}, sacrifice a creature). I have one creature: a [[Llanowar Elves]]. I announce the spell. My opponent casts [[Murder]] on Llanowar Elves in response — wait, can they?
```

**Expected:** No. The cast process for Diabolic Intent (announcing it, paying its costs including the sacrifice) is a single uninterruptable sequence. No player gets priority during cost payment [601.2]. After Diabolic Intent is on the stack (Llanowar Elves already sacrificed), opponents get priority — but the El

**Failures:**
- Missing required citations: 117.3c

**Arbiter response:**
```
STATE

Q1 — No process is currently resolving. The player has begun the casting procedure for [[Diabolic Intent]] but has not completed it.
Q2 — No SBAs applicable.
Q3 — No triggers in waiting state.
Q4 — Not stable; casting is in progress.
Q5 — Priority has not yet been passed; the casting player is mid-procedure. The opponent has not yet received priority.

---

RESOLUTION

1. **Casting begins [601.2].** The active player announces [[Diabolic Intent]] and begins the casting procedure in order.
2. **Costs are determined and locked in [601.2f].** The total cost is {B} plus the additional cost: sacrifice a creature. Costs are locked in at this step. The sacrifice is part of the cost.
3. **Costs are paid [601.2g].** The active player must pay all costs simultaneously. This includes sacrificing [[Llanowar Elves]] as the additional cost. The sacrifice happens here, as part of paying — before the spell is placed on the stack as a complete object and before priority is passed.
4. **Spell becomes cast [601.2h → 603].** Only after all costs are paid does [[Diabolic Intent]] become a cast spell on the stack, triggers detect, and priority is eventually passed to opponents.
5. **Opponent cannot respond during cost payment.** No player receives priority at any point between step 601.2f (cost lock-in) and 601.2h (spell completion). There is no window to cast [[Murder]] targeting [[Llanowar Elves]] after it has been sacrificed as a cost, nor before the cost is paid to "steal" the sacrifice target.

---

RULE TRACE

- [601.2f] — Costs are locked in before payment.
- [601.2g] — All costs, including additional costs (sacrifice), are paid simultaneously at this step.
- [601.2h] — Spell is considered cast only after costs are paid and it is on the stack.
- [117.1] — Players receive priority only at defined game points; no priority window exists mid-casting-procedure.
- **Axiom 1** — The game is one ordered engine; the casting procedure runs to completion before priority opens.

---

V
```

### J7 — Alternative cost replaces base cost, additional costs still apply

**Scenario:**
```
I want to cast [[Force of Will]] using its alternative cost: exile a blue card from my hand and pay 1 life. My opponent controls [[Trinisphere]] ("Each spell costs at least {3} to cast"). Does Trinisphere apply?
```

**Expected:** Yes. Trinisphere's effect modifies the *total cost* of the spell, including when an alternative cost is paid. Force of Will's alternative cost is {0} mana + exile blue card + 1 life. Trinisphere raises the total mana cost to {3}. So Force of Will costs: {3} + exile blue card + 1 life.

**Failures:**
- Missing required citations: 117.9

**Arbiter response:**
```
STATE
Q1 — No process currently resolving; we are in the casting process for [[Force of Will]].
Q2 — No SBAs applicable.
Q3 — No triggers in waiting state relevant to this question.
Q4 — Not yet stable; cost determination is mid-casting.
Q5 — Active player is mid-casting; cost lock-in has not occurred yet.

---

RESOLUTION

1. **Identify the base cost.** [[Force of Will]]'s alternative cost is: exile a blue card from your hand + pay 1 life. There is no mana component in this alternative cost. The total mana cost for purposes of cost calculation is therefore **{0}**. [601.2b, 601.2f]

2. **Apply additional costs and cost reductions.** No additional costs or reductions are noted here. [601.2f]

3. **Apply [[Trinisphere]]'s effect.** [[Trinisphere]] reads: "As long as Trinisphere is untapped, each spell that would cost less than three mana to cast costs three mana more to cast until it would cost three mana to cast it." The total mana payment required is currently {0}. Since {0} < {3}, [[Trinisphere]]'s effect raises the mana portion of the cost to {3}. [601.2f, 601.3]

4. **Lock in the total cost.** At lock-in [601.2f], the total cost to cast [[Force of Will]] via its alternative cost is: exile a blue card from hand + pay 1 life + pay **{3}**. All components must be paid.

5. **Conclusion.** Yes, [[Trinisphere]] applies. The alternative cost does not insulate the spell from [[Trinisphere]]'s mana-floor effect. The non-mana components (exile + life) are retained but do not count toward the {3} mana minimum.

---

RULE TRACE
- [601.2b] — Identifies the alternative cost as the base cost when chosen.
- [601.2f] — Cost lock-in step; all applicable cost modifiers applied before payment.
- [601.3] — (parent rule) Cost modification by continuous effects.
- [[Trinisphere]] rule text — Raises total mana cost to minimum {3} regardless of how the spell's mana cost was arrived at.
- **Axiom 1** — The game is one ordered engine; cost modification effects apply in the single unified
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
Q1 — No process currently resolving; player is in the casting process for [[Cryptic Command]].
Q2 — No SBAs applicable.
Q3 — No waiting triggers relevant.
Q4 — Not at a stable checkpoint; casting is in progress.
Q5 — Active player is mid-casting sequence, at the cost-payment step.

RESOLUTION
1. Casting begins; player announces [[Cryptic Command]] and moves through casting steps [601.2a–601.2h].
2. At [601.2f], the player locks in the total cost: {1}{U}{U}{U}.
3. At [601.2g], mana abilities may be activated to generate mana for payment. This is the designated window for mana production.
4. At [601.2h], the player pays the locked-in cost. Payment and mana ability activation are interleaved within this step — a player may activate mana abilities during payment so long as the full cost is paid before the step completes [601.2h].
5. [[Urza's Tower]] is a land with a mana ability (it produces mana when tapped; no target, no complex trigger) [605.1a]. It may be activated at any point during steps [601.2g] or [601.2h].
6. However, [[Urza's Tower]] taps for {C}{C}{C} (colorless mana) only when part of the Urza's land trifecta, or {C} otherwise. The mana it produces is colorless regardless.
7. The cost {1}{U}{U}{U} requires three blue mana and one generic mana. The three Islands already tapped produce {U}{U}{U}, satisfying the blue requirement. The generic {1} can be paid with any mana, including colorless.
8. Tapping [[Urza's Tower]] during [601.2h] adds colorless mana to the player's mana pool, which satisfies the {1} generic component of the cost.

RULE TRACE
- [601.2f] — Cost lock-in occurs before payment.
- [601.2g] — Mana abilities may be activated before payment begins.
- [601.2h] — Mana abilities may also be activated during payment; cost must be fully paid by step's end.
- [605.1a] — Mana abilities defined; no stack, immediate effect.
- Axiom 1 — The game is one ordered engine; casting follows strict sequential steps.

VERDICT
Yes — [[Urza's Tower]] can be tap
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
Q2 — No SBAs applicable (1/1 base + anthem = 2/2; no zero-toughness issue).
Q3 — No waiting triggers relevant.
Q4 — Stable checkpoint.
Q5 — Active player holds priority.

RESOLUTION
1. **Copy effect applied (Layer 1→Layer 7b).** [[Phyrexian Metamorph]] enters as a copy of [[Birds of Paradise]]. The copy effect sets its copiable values, establishing base power/toughness as 0/1. [706.2], [613.3]
2. **Layer 7b — Base P/T setting.** [[Birds of Paradise]] has a printed base P/T of 0/1. The copy effect reproduces this. [[Phyrexian Metamorph]]'s base P/T is therefore 0/1. [613.3b]
3. **Layer 7c — P/T modification.** [[Glorious Anthem]] applies "+1/+1 to creatures you control." [[Phyrexian Metamorph]] is a creature you control, so this continuous effect adds +1/+1. [613.3c], [613.7]
4. **Final P/T calculated.** 0+1 / 1+1 = **1/2**.

RULE TRACE
- [706.2] — Copy effect establishes copiable values including P/T.
- [613.3b] — Base P/T effects applied in Layer 7b.
- [613.3c] — P/T additions/subtractions applied in Layer 7c.
- [613.7] — Layer ordering governs sequence of continuous effects.
- Axiom 4 — The rest of the engine sees only the final event (final P/T after all layers).

VERDICT
[[Phyrexian Metamorph]] copying [[Birds of Paradise]] has a base P/T of 0/1 (from the copy effect), then gains +1/+1 from [[Glorious Anthem]], resulting in **1/2**.
```

### K2 — Layer 2 control change — control-dependent abilities

**Scenario:**
```
Player A controls [[Steal Enchantment]] enchanting Player B's [[Honor of the Pure]] ("Creatures you control get +1/+1"). Player A has 2/2 humans on the battlefield. Player B has 2/2 humans. Whose creatures get +1/+1?
```

**Expected:** Player A's creatures get +1/+1. "Creatures you control" refers to the controller of Honor of the Pure. After Steal Enchantment, Honor of the Pure's controller is Player A. So "you" = Player A.

**Failures:**
- Missing required citations: 613.3c, 613.1b

**Arbiter response:**
```
STATE
Q1 — No process currently resolving.
Q2 — No SBAs applicable.
Q3 — No waiting triggers.
Q4 — Stable checkpoint.
Q5 — Normal priority flow; no action required to resolve this question.

RESOLUTION
1. [[Steal Enchantment]] moves [[Honor of the Pure]] from Player B's control to Player A's control. [[Honor of the Pure]] is now a permanent controlled by Player A.
2. [[Honor of the Pure]] reads "Creatures you control get +1/+1." The word "you" in the text of a permanent refers to that permanent's controller. [109.5]
3. Player A now controls [[Honor of the Pure]]. Therefore "you" = Player A.
4. The continuous effect generated by [[Honor of the Pure]] applies to creatures Player A controls. [611.3]
5. Player A's 2/2 humans become 3/3. Player B's 2/2 humans receive no bonus.

RULE TRACE
- [109.5] — "You" on a permanent refers to the object's controller.
- [611.3] — Activated and continuous abilities of a permanent are generated under control of that permanent's controller.
- Axiom 1 — The game reads the final control state; no remnant effect remains tied to Player B.

VERDICT
Player A's creatures get +1/+1; "you" in [[Honor of the Pure]] refers to its controller, which is now Player A, so only Player A's humans become 3/3.
```

### K4 — CDA vs. set effect — which wins in layer 7b?

**Scenario:**
```
[[Tarmogoyf]] has a characteristic-defining ability setting its P/T based on card types in graveyards. There are 5 card types in graveyards. I cast [[Overwhelming Splendor]] ("Each creature has base power and toughness 1/1 and loses all abilities"). What is Tarmogoyf?
```

**Expected:** 1/1 with no abilities. Overwhelming Splendor's effects apply in layer 6 (lose all abilities) and layer 7b (set base P/T 1/1). Layer 6 removes the CDA. Layer 7b (Tarmogoyf's CDA would have set base) no longer applies because the CDA is gone. Layer 7b then applies Overwhelming Splendor's set effect: 1

**Failures:**
- Missing required citations: 604.3

**Arbiter response:**
```
STATE
Q1 — No process currently resolving; Overwhelming Splendor has already resolved and is an enchantment on the battlefield.
Q2 — No applicable SBAs pending (awaiting P/T determination).
Q3 — No waiting triggers relevant.
Q4 — Stable checkpoint; resolving a rules interaction.
Q5 — Irrelevant to this static analysis.

RESOLUTION

1. **Identify the effects in question.** [[Tarmogoyf]]'s characteristic-defining ability (CDA) sets its base P/T to */*+1 based on card types in graveyards. [[Overwhelming Splendor]] creates two continuous effects: (a) sets base P/T to 1/1, and (b) removes all abilities from each creature.

2. **Assign layers.** Both effects operate in Layer 7 (P/T). The CDA operates in Layer 7a (CDAs set base P/T). [[Overwhelming Splendor]]'s base-P/T-setting effect also operates in Layer 7b (other effects that set base P/T). The ability-removing effect operates in Layer 6. [613.3]

3. **Apply Layer 6 first.** In Layer 6, [[Overwhelming Splendor]]'s "loses all abilities" effect removes [[Tarmogoyf]]'s CDA. [[Tarmogoyf]] no longer has the characteristic-defining ability. [613.3a, 613.3b]

4. **Apply Layer 7a.** CDAs that set base P/T are applied here. [[Tarmogoyf]] has no CDA at this point — it was removed in Layer 6. Nothing applies in Layer 7a for [[Tarmogoyf]]. [613.4a / 613.3]

5. **Apply Layer 7b.** [[Overwhelming Splendor]]'s effect sets [[Tarmogoyf]]'s base P/T to 1/1. This is the only base-P/T-setting effect remaining. [613.4b / 613.3]

6. **Final P/T.** [[Tarmogoyf]] is 1/1. No further modifiers from Layer 7c/7d/7e are present in the stated board state.

RULE TRACE
- [613.3] — Layer application order: Layer 6 before Layer 7.
- [613.3, Layer 6] — Effects that remove abilities apply in Layer 6.
- [613.3, Layer 7a] — CDAs that set P/T apply in Layer 7a.
- [613.3, Layer 7b] — Other effects that set base P/T apply in Layer 7b.
- [Axiom 4] — The rest of the engine sees only the final event; the CDA is gone before Layer 7a is evaluated, so it contribute
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
- Missing required citations: 613.3c, 613.3a

**Arbiter response:**
```
UNRESOLVED

The question is underspecified. No clear rules interaction has been identified for evaluation. The message contains a series of abandoned hypotheticals — each discarded mid-construction — with no final, complete board state or rules question submitted.

**What is needed to proceed:**

1. A named card with Oracle text provided (or confirmed known)
2. A defined board state
3. A specific rules question or contested interaction

Please resubmit with a complete scenario.
```

### K6 — P/T with +1/+1 counters

**Scenario:**
```
I control a [[Glistener Elf]] (1/1) with one +1/+1 counter on it. [[Glorious Anthem]] is in play (+1/+1 to my creatures). What is Glistener Elf's P/T?
```

**Expected:** 3/3. Base 1/1 → layer 7c Glorious Anthem +1/+1 → 2/2 → layer 7d counters +1/+1 → 3/3.

**Failures:**
- Missing required citations: 613.3c, 613.3d

**Arbiter response:**
```
STATE
Q1 — No process resolving.
Q2 — No SBAs applicable.
Q3 — No waiting triggers.
Q4 — Stable checkpoint.
Q5 — Active player holds priority; no relevant action pending.

RESOLUTION
1. Establish base P/T: [[Glistener Elf]] has a printed characteristic of 1/1. [613.1a, Layer 7a]
2. Apply continuous effect from [[Glorious Anthem]]: +1/+1 to all creatures you control. This is a Layer 7c effect (power/toughness modification). Result: 2/2. [613.1c, Layer 7c]
3. Apply counter modification: one +1/+1 counter adds +1/+1. This is a Layer 7d effect. Result: 3/3. [613.1d, Layer 7d]
4. Layer 7 sub-layers are applied in order (7a → 7b → 7c → 7d), so Anthem applies before counters — both adjustments stack additively onto the base. [613.7]

RULE TRACE
- [613.1a] — Base P/T set in Layer 7a.
- [613.1c] — Static +1/+1 from [[Glorious Anthem]] applied in Layer 7c.
- [613.1d] — +1/+1 counter applied in Layer 7d.
- [613.7] — Sub-layers within Layer 7 are applied in sequence.

VERDICT
[[Glistener Elf]] is a 3/3.
```

### K7 — Timestamp ordering on layer 7c modifiers

**Scenario:**
```
I play [[Crusade]] (timestamp T1, "white creatures get +1/+1"). Later, opponent plays [[Glorious Anthem]] (timestamp T2, "creatures you control get +1/+1"). I have a white 2/2 I control. What is its P/T?
```

**Expected:** 3/3. Crusade applies (+1/+1 to my white creature). Glorious Anthem does NOT apply (opponent's "you control" doesn't include my creature). Result: 2+1 / 2+1 = 3/3.

**Failures:**
- Missing required citations: 613.7

**Arbiter response:**
```
STATE
Q1 — No process resolving.
Q2 — No SBAs applicable.
Q3 — No waiting triggers.
Q4 — Stable checkpoint.
Q5 — Active player holds priority; no action required to answer the question.

RESOLUTION
1. Identify the base P/T of the creature: 2/2. [613.1]
2. Identify all applicable continuous effects modifying P/T. Two effects exist: [[Crusade]] (T1) and [[Glorious Anthem]] (T2). Both are static abilities generating continuous effects in Layer 7c (power/toughness modification). [613.3c]
3. Check whether dependence ordering applies. Neither effect's calculation depends on the other's result — each grants a flat +1/+1 regardless of what the other does. No dependence exists; timestamp order governs. [613.7a, 613.7b]
4. Apply Layer 7c effects in timestamp order:
   - T1 [[Crusade]]: creature is white and I control it — condition met → +1/+1 → 3/3.
   - T2 [[Glorious Anthem]]: creature is controlled by the opponent's opponent (me) — wait. [[Glorious Anthem]] reads "creatures you control." The opponent controls [[Glorious Anthem]]; I control the creature. Condition **not met**. No bonus applied.
5. Final P/T: 3/3.

RULE TRACE
- [613.1] — Continuous effects applied in layers.
- [613.3c] — P/T modifications are Layer 7c.
- [613.7a/b] — Timestamp order applies when no dependency exists.
- [[Crusade]] Oracle: "White creatures get +1/+1." — Applies to all white creatures regardless of controller. Condition met.
- [[Glorious Anthem]] Oracle: "Creatures you control get +1/+1." — Restricted to controller of the enchantment. Opponent controls it; I control the creature. Condition not met.
- Axiom 1 — The game is one ordered engine; both effects evaluated at the same stable layer pass.

VERDICT
The creature is a 3/3. [[Crusade]] applies (+1/+1) because it buffs all white creatures; [[Glorious Anthem]] does not apply because it only buffs creatures the opponent controls, not yours.
```

### K8 — Dependencies override timestamps

**Scenario:**
```
[[Humility]] (timestamp T1, "all creatures lose abilities and are base 1/1") and [[Opalescence]] (timestamp T2, "non-Aura enchantments become 4/4 creatures") are both on the battlefield. After all effects, what are Humility and Opalescence?
```

**Expected:** Both are 4/4 creatures with no abilities (1/1 from Humility doesn't apply because Opalescence's later timestamp makes them 4/4 in layer 7b). Wait — let me re-derive carefully.

Actually: **Both are 4/4 with no abilities.** Opalescence applies first (it makes Humility a creature). Then Humility, bein

**Failures:**
- Missing VERDICT (or UNRESOLVED/LEGAL ACTIONS) section
- Missing required citations: 613.1d, 613.1f

**Arbiter response:**
```
STATE
Q1 — No process resolving.
Q2 — No SBAs applicable (no 0-toughness creatures, etc., after final determination).
Q3 — No waiting triggers relevant.
Q4 — Stable checkpoint.
Q5 — Irrelevant to this continuous-effect question.

RESOLUTION

1. **Identify all applicable continuous effects and their layer entry points.**
 - [[Opalescence]] generates a type-changing effect (Layer 4) and a power/toughness-setting effect (Layer 7b).
 - [[Humility]] generates an ability-removing effect (Layer 6) and a power/toughness-setting effect (Layer 7b).

2. **Apply Layer 4 — Type/subtype changes.** [613.3]
 [[Opalescence]]'s effect applies: both [[Humility]] and [[Opalescence]] become creatures (in addition to being enchantments). No Layer 4 effect from [[Humility]] exists. Timestamps are irrelevant within a layer unless dependency exists; both enchantments are now also creatures. [613.7a]

3. **Check for dependency between the two Layer 6/7b effects.** [613.8]
 - Does [[Humility]]'s Layer 6 effect depend on [[Opalescence]]'s Layer 7b effect? No — [[Humility]] removes abilities regardless of whether anything is a 4/4.
 - Does [[Opalescence]]'s Layer 7b effect depend on [[Humility]]'s Layer 6 effect? **Yes** — [[Opalescence]] grants the "is a 4/4" characteristic, but if [[Humility]]'s ability-removal (Layer 6) were applied first, [[Opalescence]] would lose its own ability before its Layer 7b effect could exist. Therefore [[Opalescence]]'s Layer 7b effect is dependent on [[Humility]]'s Layer 6 effect. [613.8a]
 - Because this dependency exists, [[Humility]]'s Layer 6 effect is applied **before** [[Opalescence]]'s Layer 7b effect, regardless of timestamps.

4. **Apply Layer 6 — Ability removal (timestamp order is overridden by dependency).** [613.8b]
 [[Humility]]'s effect applies first: **all creatures lose all abilities.** This includes both [[Humility]] and [[Opalescence]] themselves (which are now creatures per Step 2). Both cards lose all their printed abilities.

5. **Apply Lay
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
- Missing VERDICT (or UNRESOLVED/LEGAL ACTIONS) section
- Missing required citations: 608.2b, 101.2

**Arbiter response:**
```
You've correctly identified the distinction. State your question.
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
- Missing VERDICT (or UNRESOLVED/LEGAL ACTIONS) section
- Missing required citations: 614, 615

**Arbiter response:**
```
The scenario is underspecified. You have described multiple candidate replacement/prevention effects but have not committed to a final, stable board state with defined Oracle text for the relevant permanent. Let me identify what is and is not resolvable.

---

## UNRESOLVED

**Reason:** The scenario cycles through multiple candidate setups mid-description and does not settle on a single board state. Specifically:

- **[[Soul Warden]]** — named then abandoned ("wait, that's a trigger").
- **[[Spirit Link]]** — named then abandoned ("also a trigger").
- **[[Shielding Plax]]** — you describe a prevention effect that does **not** match [[Shielding Plax]]'s actual Oracle text. [[Shielding Plax]] grants shroud to the enchanted creature; it does not prevent damage to a player. You have supplied invented Oracle text ("If a source would deal damage to you, prevent 1 of that damage"), which I cannot treat as [[Shielding Plax]]. Per hard constraints, I use only provided Oracle text — but here the provided text is attributed to the wrong card. I cannot proceed on fabricated text assigned to a named card with a different real function.
- **[[Embargo]]** — named then abandoned.

**What is needed to proceed:**

1. A single, committed board state — no mid-description pivots.
2. Either correct Oracle text for the named cards **or** unnamed placeholder cards (e.g., "an enchantment with the text: …") with the Oracle text you intend.
3. A specific question: damage prevention math, replacement effect ordering, trigger stacking, or something else.

**If your actual question is about a generic "prevent 1 damage" effect interacting with 3 combat damage,** supply that as: *"An unnamed prevention effect reads: 'If a source would deal damage to you, prevent 1 of that damage.' A 3/3 deals 3 combat damage to me. How much damage do I take?"* — and I can rule on that immediately.
```

### L6 — Replacement effect for "instead" damage rerouting

**Scenario:**
```
I cast [[Lightning Bolt]] targeting an opponent. They control [[Boros Reckoner]] ("If a source would deal damage to you, instead it deals that much damage to a target creature or player of your choice"). Wait, that's not quite right — let me use real Oracle text: [[Boros Reckoner]] has "Whenever Boros Reckoner is dealt damage, it deals an equal amount of damage to any target." That's a trigger, not a replacement.
```

**Expected:** Palisade Giant takes 3 damage instead of the opponent. The damage is redirected via 614.5 replacement.

**Failures:**
- Missing STATE section
- Missing RESOLUTION section
- Missing RULE TRACE section
- Missing required citations: 614, 614.9

**Arbiter response:**
```
You're correct to catch that. But you've also submitted a rules question that is underspecified in a critical way.

UNRESOLVED

**Reason:** No rules question was actually posed.

You've correctly identified that [[Boros Reckoner]]'s ability is a triggered ability (not a replacement effect), and you've self-corrected the Oracle text mid-prompt. But you haven't asked anything. There is no interaction to resolve, no legal action to evaluate, and no ruling to issue.

**To get a ruling, specify:**
- What outcome you're asking about (e.g., "Does [[Lightning Bolt]] kill [[Boros Reckoner]] if it has 3 toughness remaining? Can the triggered ability target the original caster? What is the stack state after the trigger?")
- Any relevant board state details (Reckoner's current damage, power/toughness, any other effects in play)

Resubmit with a concrete question and I will execute fully.
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
Q3 — No triggers waiting.
Q4 — Stable checkpoint; player has priority.
Q5 — Active player holds priority; question is about casting legality and cost requirements for [[Skred]].

---

**Card text note:** [[Skred]] Oracle text provided in question. [[Snow-Covered Mountain]] is a basic snow land — produces {S} (snow mana) when tapped for mana [107.4f].

---

RESOLUTION

1. **Identify Skred's mana cost.** [[Skred]] costs {S} — one snow mana. This is its only mana cost [601.2b].

2. **Identify Skred's effect.** "Skred deals X damage to any target, where X is the number of snow permanents you control." X is determined **on resolution**, by counting snow permanents you control at that moment [608.2b]. It is not a cost. It is not paid. It requires no mana expenditure.

3. **Distinguish cost from effect.** The {S} in the mana cost must be paid during the casting process [601.2f]. The X damage clause references snow permanents as a **game-state count**, not a resource expenditure. These are two separate, non-interacting components.

4. **Casting requirement.** To legally cast [[Skred]], you must pay {S} — one snow mana. [[Snow-Covered Mountain]] produces exactly {S}, satisfying this [107.4f, 601.2f].

5. **Damage determination.** On resolution, the game counts how many snow permanents you control. That count becomes X. No additional mana or snow mana is spent at this step [608.2].

---

RULE TRACE
- [107.4f] — Snow mana symbol {S}; mana from snow sources carries the snow supertype.
- [601.2b] — Mana cost is identified during casting.
- [601.2f] — Costs are locked in and paid during casting.
- [608.2] / [608.2b] — Spells resolve top-to-bottom; variable values determined at resolution.
- Axiom 1 — The game is one ordered engine; cost payment and effect resolution are distinct sequential events.

---

VERDICT
You must spend one snow mana ({S}) to cast [[Skred]], but X is determined purely by counting your snow permanents
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
Q1 — No process currently resolving.
Q2 — No SBAs applicable (combat damage not yet assigned).
Q3 — No waiting triggers.
Q4 — Game is at a stable checkpoint: combat damage assignment step.
Q5 — Active player (attacker) has priority to order blockers and assign combat damage.

RESOLUTION
1. The attacking creature (5/5) is blocked by multiple creatures. Because it is blocked by more than one creature, the attacker must assign a damage order among the blockers. [509.2]
2. The attacker assigns lethal damage to each blocker in order before assigning damage to the next, unless trample is present (no trample is stated). [510.1c]
3. "Lethal damage" is defined as damage equal to a creature's toughness minus any damage already marked on it. [510.1d]
4. The 2/2 requires 2 damage to be lethal. The 3/3 requires 3 damage to be lethal. Total required: 5.
5. The attacker has exactly 5 power. All 5 damage must be allocated to satisfy lethal damage requirements in order — 2 to the first, 3 to the second — before any "excess" exists to redirect. No excess exists here.
6. The attacker **cannot** assign all 5 to a single blocker, because the first blocker in the chosen order must receive lethal damage (2) before any damage reaches the second. [510.1c]
7. Alternatively, the attacker may choose the 3/3 as first in order, assign 3 (lethal), then assign 2 to the 2/2. The result is the same: both blockers receive lethal damage and both die.
8. In no legal assignment is any blocker skipped before the prior one receives lethal damage.

RULE TRACE
- [509.2] — Attacker orders blockers when blocked by multiple creatures.
- [510.1c] — Attacker must assign lethal damage to each blocker before assigning damage to the next in order.
- [510.1d] — Lethal damage defined as toughness minus existing damage.
- Axiom 1 — The game is one ordered engine; assignment order is binding.

VERDICT
No. Without trample, the attacker must assign lethal damage (2) to the first blocker in the declared order before
```

### N5 — Deathtouch with multiple blockers

**Scenario:**
```
I attack with a 5/5 with deathtouch. Opponent blocks with three 2/2 creatures. How much damage do I need to assign to each blocker?
```

**Expected:** 1 damage each for deathtouch is enough (deathtouch makes any damage from a creature with deathtouch "lethal"). So 1+1+1 = 3 damage, all three blockers die. 2 damage left over — wait, with no trample, the remaining 2 doesn't go to the player. The remaining 2 is wasted on... actually, by 702.2c, "with

**Failures:**
- Missing required citations: 702.2c, 510.1c

**Arbiter response:**
```
STATE
Q1 — No process currently resolving; combat damage assignment is being determined.
Q2 — No SBAs applicable yet.
Q3 — No triggers in waiting state (assuming no relevant abilities).
Q4 — Stable checkpoint; active player is assigning combat damage.
Q5 — Active player has priority to assign damage to ordered blockers.

RESOLUTION
1. The 5/5 is blocked by three creatures; the attacking player orders the blockers [510.1b].
2. Lethal damage must be assigned to each blocker in order before damage can be assigned to the next [510.1d].
3. Deathtouch modifies what counts as "lethal damage": any amount of damage dealt by a source with deathtouch is considered lethal [702.2b, 510.1d].
4. Therefore, **1 damage** assigned to the first blocker in the declared order satisfies lethality.
5. **1 damage** to the second blocker satisfies lethality.
6. **1 damage** to the third blocker satisfies lethality.
7. The attacker has 2 remaining damage after satisfying lethal assignment to all three blockers; this excess may be freely assigned to any of the blockers in any distribution, but **cannot** be assigned to the defending player (the attacker is blocked) [510.1h].

RULE TRACE
- [510.1b] — Attacking player orders multiple blockers.
- [510.1d] — Lethal damage must be assigned before proceeding to next blocker.
- [510.1h] — Blocked creature cannot assign damage to the player.
- [702.2b] — Deathtouch: any amount of damage dealt is lethal for assignment purposes.
- Axiom 1 — Ordered engine; damage assignment follows strict sequencing rules.

VERDICT
With deathtouch, the minimum required assignment is **1 damage to each blocker** (in declared order); the remaining 2 damage may be distributed freely among the three blockers in any combination.
```

### N6 — Creature removed from combat mid-step

**Scenario:**
```
An opponent's 3/3 attacks. I declare a 2/2 as blocker. Before damage is dealt, the attacker's controller casts [[Smite the Monstrous]] killing my blocker. What happens in the damage step?
```

**Expected:** The blocker is dead before damage. The 3/3 attacker is still attacking (it's not blocked anymore? actually it was blocked at declare-blockers, that doesn't change). Per 510.1d: if a blocker leaves the battlefield, the attacker is treated as if not blocked for damage UNLESS another blocker remains. W

**Failures:**
- Missing STATE section
- Missing RESOLUTION section
- Missing RULE TRACE section
- Missing required citations: 510.1d, 509.1

**Arbiter response:**
```
I need the Oracle text of [[Smite the Monstrous]] to rule accurately, but I'll proceed with the commonly known printed text. If the Oracle text differs, flag it.

**[[Smite the Monstrous]]** — Destroy target creature with power 4 or greater.

The 2/2 blocker has power 2, so **[[Smite the Monstrous]] cannot legally target the 2/2 blocker**. This scenario as stated is not executable — the spell's targeting restriction is not satisfied.

---

If you meant the attacker's controller cast a different instant to kill the 2/2 (e.g., a generic destroy effect), or if your creature had power 4+, resubmit with corrected details.

---

UNRESOLVED

The stated card ([[Smite the Monstrous]]) cannot legally target the described creature (a 2/2 has power 2, not 4 or greater). The scenario contains an illegal game action. No ruling can be issued until the interaction is corrected or clarified.
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
Q4 — Stable checkpoint; combat damage step initiating.
Q5 — Combat damage is about to be dealt.

RESOLUTION
1. **WOULD-EVENT identified:** The 5/5 would deal 5 damage to you, which would reduce your life total from 1 to −4.
2. **"Can't" check [614.17]:** Not applicable here; [[Worship]] is a standard replacement effect, not a "can't" effect.
3. **Replacement effect check [614.6]:** [[Worship]]'s condition is evaluated — you control a creature. Condition is met. The replacement effect applies.
4. **Replacement applied [614.1]:** The event "damage that would reduce your life total to less than 1" is replaced. Your life total cannot be reduced below 1. The damage event is modified: instead of going to −4, your life total stays at 1.
5. **Final event [Axiom 4]:** The game sees only the modified event. You remain at 1 life.
6. **SBA check [704]:** Life total is 1, not 0 or less. No SBA triggered. You do not lose the game.

RULE TRACE
- [614.1] — Replacement effects modify events before they occur.
- [614.6] — Zone-change and damage replacement apply before the damage event resolves.
- [614.17] — Confirmed not applicable; [[Worship]] is a replacement, not a "can't" effect.
- Axiom 2 — Replacement happens before the event; life total never reaches −4.
- Axiom 4 — The rest of the engine sees only the final state: life total = 1.
- [704.5a] — SBA checks life total ≤ 0; 1 does not trigger it.

VERDICT
You take 0 net change — your life total remains at 1, as [[Worship]]'s replacement effect prevents the damage from reducing it below 1, provided you still control a creature at the time damage is dealt.
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
- Missing required citations: 614

**Arbiter response:**
```
You haven't completed your scenario. You've started multiple incomplete hypotheticals and stopped.

UNRESOLVED

**Missing specification:**
- No complete game state provided.
- No resolved question has been posed.
- Card Oracle texts not provided for any named card.

Restate your scenario with:
1. A complete board state.
2. A specific rules interaction or question.
3. Oracle text for relevant cards if you want a precise ruling.
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
- Missing required citations: 707.2, 702.74

**Arbiter response:**
```
You've flagged your own examples as broken before I need to. Let me address the underlying rules question you're clearly circling around:

**You need to provide a card with kicker whose ETB trigger distributes counters or produces an effect based on whether kicker was paid.**

The canonical example you're likely thinking of is something like [[Verazol, the Split Current]] or [[Bloodghast]] — but I need the actual Oracle text of the card you intend to use, plus the copy effect's Oracle text, to give you a structured ruling.

UNRESOLVED

**Reason:** No valid card with a kicker-dependent ETB effect has been specified. The scenario requires:

1. A creature with kicker whose ETB effect scales on whether kicker was paid (e.g., [[Inscription of Ruin]], [[Verazol, the Split Current]], or similar).
2. Oracle text for the copy effect being used ([[Saheeli's Artistry]] or otherwise).

**The core rule at stake** — which I'll execute fully once you specify — is **[706.10]**: a copy of a permanent copies copiable values only; kicker payment is a characteristic of the *spell on the stack*, not a copiable value of the resulting permanent. A token copy entering via a copy effect generally does **not** inherit "kicker was paid" status.

Resubmit with the specific card and I'll run the full 21-step execution.
```

### O4 — Counters on a token that "should" carry

**Scenario:**
```
I control a 1/1 Servo token with three +1/+1 counters on it (currently a 4/4). I cast [[Cytoshape]] making it a copy of [[Wurm Cavalcade]] (a 4/4) — wait, Cytoshape doesn't exist as a card. Use [[Mirrorhall Mimic]]? Doesn't quite work either.
```

**Expected:** No. Tokens cease to exist when moved off the battlefield. The Servo goes from battlefield → hand briefly → ceases to exist (704.5d).

**Failures:**
- Missing STATE section
- Missing RESOLUTION section
- Missing RULE TRACE section
- Missing VERDICT (or UNRESOLVED/LEGAL ACTIONS) section
- Missing required citations: 704.5d

**Arbiter response:**
```
You're right to pump the brakes — let me be precise.

**[[Mirrorhall Mimic]]** is an Aura (or creates a Ghost copy), not a spell that converts an existing permanent in place. It doesn't do what you're building toward.

**[[Cytoshape]]** — you flagged it yourself: not a real card.

---

## UNRESOLVED

The scenario cannot be evaluated because:

1. **No valid source card is provided.** You need an effect that causes a permanent already on the battlefield to become a copy of another permanent (or card) while retaining counters. No Oracle text was supplied for any card that does this.

2. **The underlying rules question is inferable** — you appear to be asking:

> *If a creature with +1/+1 counters becomes a copy of a different creature, do the counters remain and modify the new P/T?*

The short answer that governs that question, if you supply a real card:
- Counters survive zone-static copy effects on the battlefield [706.2 — copying does not copy counters].
- The copy establishes base P/T; counters then apply in Layer 7c [613.7].
- So a 4/4 base copy + three +1/+1 counters = **7/7**.

**Provide a real card** (e.g., [[Cytoplast Manipulator]], [[Reweave]], [[Mirrorweave]], [[Echo Storm]], or similar) **with its Oracle text** and I will run the full ruling.
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
Q3 — No triggers in waiting state.
Q4 — Game is at a stable checkpoint; active player has passed priority in end step, non-active players are receiving priority in succession.
Q5 — You (non-active player) have priority during the end step.

RESOLUTION
1. Loyalty abilities are activated abilities with a loyalty cost [606.1].
2. A player may activate a loyalty ability of a planeswalker they control [606.3].
3. The timing restriction on loyalty abilities: a loyalty ability may only be activated on your turn, any time you have priority, and only once per turn per planeswalker [606.3].
4. It is not your turn — it is your opponent's turn (their end step). You are the non-active player.
5. Therefore the "only during your turn" restriction of [606.3] is not satisfied, regardless of whether you hold priority.
6. No legal activation exists.

RULE TRACE
- [606.1] — Defines loyalty abilities.
- [606.3] — "A player may activate a loyalty ability of a permanent they control any time they have priority and the stack is empty during a main phase of their turn." (Emphasis: *their* turn, *main phase*.)
- Axiom 1 — The game is one ordered engine; timing restrictions are hard gates.

VERDICT
No — you cannot activate any loyalty ability of [[Jace, the Mind Sculptor]] during your opponent's end step, because loyalty abilities may only be activated during your own main phase when the stack is empty and you have priority.
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
Q4 — Game is at a stable checkpoint, active player holds priority.
Q5 — Active player controls [[Liliana, the Last Hope]] and is considering loyalty ability activations.

RESOLUTION
1. The -2 ability is activated. Liliana's loyalty is reduced by 2 from her current total. This uses the loyalty ability activation for this turn. [606.3]
2. The rule governing planeswalker loyalty abilities states a planeswalker may activate **only one** loyalty ability per turn, and only during your main phase when the stack is empty. [606.3b — a player may activate a loyalty ability of a permanent they control only once per turn.]
3. Because the -2 has already been activated this turn, the +1 ability is no longer legally activatable this turn, regardless of whether Liliana has sufficient loyalty counters.
4. No replacement effects, SBAs, or triggers alter this conclusion.

RULE TRACE
- [606.3] — Loyalty ability activation rules: once per turn, during controller's main phase, while the stack is empty.
- [606.3b] — A player may activate a loyalty ability of a planeswalker they control only once each turn.
- Axiom 1 — The game is one ordered engine; the activation limit is a hard constraint on the action, not a cost or effect that can be replaced.

VERDICT
No — activating the -2 ability exhausts Liliana's one loyalty ability activation for the turn; the +1 cannot also be activated in the same turn.
```

### P3 — Mana ability does not require priority

**Scenario:**
```
Opponent's [[Wrath of God]] is resolving. My creatures are being destroyed. Before they die (during resolution), can I tap one of them for mana to cast something?
```

**Expected:** No. During resolution, no player has priority [608.2]. Mana abilities CAN be activated without priority, BUT only when a player is in the middle of casting a spell or activating an ability — not during another spell's resolution.

Wait — let me reread. 605.3a: mana abilities can be activated "whenev

**Failures:**
- Missing required citations: 605.3a

**Arbiter response:**
```
STATE
Q1 — Yes. [[Wrath of God]] is currently resolving.
Q2 — N/A; mid-resolution.
Q3 — N/A; mid-resolution.
Q4 — No. The game is not at a stable checkpoint.
Q5 — No player has priority. Priority is not passed during spell resolution.

RESOLUTION
1. **Step 1 — Resolution is an uninterrupted process.** When a spell or ability begins resolving, it resolves completely before any player receives priority. [608.2]
2. **Step 2 — No player may take actions during resolution.** Activating a mana ability, tapping a creature, or casting a spell all require a player to hold priority or to be in a window where mana abilities are explicitly permitted. No such window exists mid-resolution of another spell. [117.3a], [605.3b]
3. **Step 3 — Mana abilities are fast, but not that fast.** Mana abilities may be activated "whenever" a player could play them during the process of paying costs [605.3b], but that exception applies to *cost payment*, not to the body of a resolving spell destroying your permanents.
4. **Step 4 — Creatures are destroyed as part of resolution.** [[Wrath of God]] destroys all creatures simultaneously during its resolution. The destruction event occurs inside the resolution process; no priority window opens between "creatures exist" and "creatures are destroyed." [608.2b]
5. **Step 5 — After full resolution,** the spell moves to the graveyard, SBAs are checked, triggers are collected, and only then do players receive priority. By that point, the creatures are already gone. [608.2m], [704], [117.3b]

RULE TRACE
- [608.2] — Spell resolves completely; no player may act during resolution.
- [117.3a] — Players receive priority only at defined checkpoints, not mid-resolution.
- [605.3b] — Mana ability activation is permitted only during cost payment, not during resolution of another spell.
- [608.2b] — Effects within a resolving spell execute sequentially/simultaneously as written.
- Axiom 1 — The game is one ordered engine; resolution is an uninterruptible segment of
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

The question is underspecified. No complete board state, game action, or rules interaction has been presented for adjudication.

You are constructing an example mid-message but have not committed to a final scenario. No card, trigger, or interaction has been identified as the subject of a ruling.

**Resubmit with:**
- A complete board state (relevant permanents, players, zones)
- The specific action being taken or the interaction in question
- The ruling or outcome you want adjudicated
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
I don't have Oracle text for [[Charm of the Tempest]] — it appears to be a hypothetical card. However, you've provided the mode text directly, so I'll treat that as the authoritative text for this ruling.

I do not have Oracle text for [[Snapback]]. I'll need to assume from context that it's an instant that returns a creature or permanent to its hand — but I cannot confirm targeting restrictions, cost, or exact text. **This is a gap.** However, the core rules question (what happens when a spell's target is removed before resolution) is answerable regardless of how [[Sol Ring]] left the battlefield.

---

STATE

Q1 — Yes. [[Charm of the Tempest]] is on the stack with two chosen modes: "destroy target artifact" and "draw a card." [[Sol Ring]] was the target of the first mode.
Q2 — No SBAs pending at this checkpoint.
Q3 — No triggers currently waiting.
Q4 — Not stable. [[Charm of the Tempest]] is about to resolve (assuming [[Snapback]] has already resolved and priority has passed around).
Q5 — Assuming all players have passed priority, [[Charm of the Tempest]] begins resolution.

---

RESOLUTION

1. **[608.2b] — Legality check at resolution.** When a spell resolves, the game checks whether each target is still legal. "Destroy target artifact" named [[Sol Ring]] as its target. [[Sol Ring]] is no longer on the battlefield. It is no longer a legal target for that mode.

2. **[608.2b] — All targets of a mode are illegal.** The "destroy target artifact" mode has exactly one target, and that target is illegal. The entire mode is countered. It does not resolve; its effect does not apply.

3. **[608.2b] — Modes with no illegal targets still resolve.** The "draw a card" mode has no target at all. It is unaffected by the lost target. This mode resolves normally.

4. **Final event.** The "destroy artifact" mode does nothing. The "draw a card" mode resolves: you draw one card.

---

RULE TRACE

- **CR 608.2b** — "If the spell or ability is a targeted spell or ability, it checks wh
```

### Q4 — Choose new targets and the illegality rule

**Scenario:**
```
Opponent casts [[Lightning Bolt]] targeting my creature. I cast [[Misdirection]] ("Change the target of target spell"). I want to redirect Bolt to my opponent. Legal?
```

**Expected:** Yes, if my opponent is a legal target. Lightning Bolt targets "any target" — a player is legal. Misdirection changes the target to my opponent. Bolt resolves dealing 3 to my opponent.

**Failures:**
- Missing required citations: 114.6

**Arbiter response:**
```
STATE
Q1 — Yes: Lightning Bolt is on the stack, targeting your creature. Misdirection has been cast and is now resolving.
Q2 — No SBAs pending.
Q3 — No waiting triggers relevant.
Q4 — Not at a stable checkpoint; a spell is resolving.
Q5 — Misdirection is resolving; no priority held mid-resolution.

---

RESOLUTION

1. **WOULD-EVENT established:** Misdirection resolves and instructs: "Change the target of target spell." The target spell is [[Lightning Bolt]]. [608.2]

2. **Identify the new legal target:** The rules require the new target to be a legal target for [[Lightning Bolt]]. Lightning Bolt reads "deals 3 damage to any target" — meaning any creature, planeswalker, or player is a legal target. [608.2d — when a spell or ability changes a target, the new target must be legal for that spell/ability.]

3. **Is the opponent a legal target for Lightning Bolt?** Yes. The opponent is a player. "Any target" includes players. [109.1, 114.1]

4. **Is there a restriction on targeting the spell's controller?** No rule prohibits redirecting a spell to its own controller. Misdirection requires only that the new target be legal for the spell being redirected. No self-targeting prohibition exists in this context. [608.2d]

5. **New target locked in:** [[Lightning Bolt]]'s target is changed from your creature to your opponent (the spell's controller).

6. **Misdirection finishes resolving.** [[Lightning Bolt]] remains on the stack with its new target. [608.2]

7. **Priority returns.** Lightning Bolt resolves in due course, dealing 3 damage to your opponent. [117.3]

---

RULE TRACE
- [608.2] — Resolution of spells and abilities; instructions followed in order.
- [608.2d] — New target for redirected spell must be legal for that spell; no additional restrictions imposed by the redirecting effect beyond legality.
- [114.1] — Targets include players, permanents, spells, abilities.
- [109.1] — Object identity and player identity.
- Axiom 1 — The game is one ordered engine; resolution 
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
Q1 — Cascade is currently resolving.
Q2 — No SBAs applicable.
Q3 — No waiting triggers relevant.
Q4 — Not at a stable checkpoint; cascade is mid-process.
Q5 — The cascade ability's controller is executing the cascade instruction.

RESOLUTION
1. Cascade triggers when [[Bloodbraid Elf]] is cast and goes on the stack. [702.84a]
2. When cascade resolves, the controller begins exiling cards from the top of their library one at a time. [702.84a]
3. The process stops exiling cards the moment a nonland card with mana value less than [[Bloodbraid Elf]]'s mana value (4) is revealed. [702.84a]
4. [[Lightning Bolt]] is a nonland card with mana value 1 — it satisfies the stop condition immediately upon exile.
5. The cascade instruction terminates exiling at this point. The controller may cast [[Lightning Bolt]] without paying its mana cost, then puts all exiled cards on the bottom of their library in a random order. [702.84a]
6. No further cards are exiled; the process does not continue past the qualifying card.

RULE TRACE
- [702.84a] — Cascade: "exile cards from the top of your library until you exile a nonland card whose mana value is less than this spell's mana value. You may cast that card without paying its mana cost. Put the exiled cards not cast this way on the bottom of your library in a random order."
- Axiom 1 — The engine is ordered; cascade is a defined process with a hard stop condition.

VERDICT
No — cascade stops exiling the moment [[Lightning Bolt]] is revealed; you do not look at any additional cards.
```

### R2 — Cascade — what about X spells?

**Scenario:**
```
I cast [[Maelstrom Wanderer]] (Cascade, Cascade). Cascade reveals [[Walking Ballista]] (cost {X}{X}, mana value 0 when on the stack). Can I cast it?
```

**Expected:** Yes — Walking Ballista's mana value with X=0 is 0, which is less than Maelstrom Wanderer's 8. Cast it. But: I must pay X=0 (cascade lets me cast without paying mana cost, so X is 0 by default — there's no mana to pay). Walking Ballista enters with 0 +1/+1 counters and dies to SBAs.

**Failures:**
- Missing required citations: 704.5f, 702.85a

**Arbiter response:**
```
STATE
Q1 — Cascade is currently resolving (a process is active).
Q2 — No SBAs applicable.
Q3 — No waiting triggers relevant yet.
Q4 — Not at a stable checkpoint; cascade is mid-process.
Q5 — Active player will have priority after cascade finishes, but the relevant question is whether Walking Ballista is a legal cascade target.

RESOLUTION
1. [[Maelstrom Wanderer]] has cascade twice. The first cascade trigger is on the stack and begins resolving. [702.84a]
2. Cascade instructs: exile cards from the top of your library until you exile a nonland card whose mana value is less than this spell's mana value (8). [702.84a]
3. [[Walking Ballista]] has mana cost {X}{X}. When a spell with {X} in its cost is on the stack, X is chosen and the value is defined. However, cascade asks about mana value of the revealed card **as it exists in the exile zone**, not on the stack. [202.3a]
4. In any zone other than the stack, {X} in a mana cost counts X as 0. [[Walking Ballista]]'s mana value in exile is therefore **0**. [202.3a]
5. Cascade requires the exiled card's mana value to be **less than** the cascading spell's mana value. 0 < 8 is TRUE. [[Walking Ballista]] satisfies the mana value condition. [702.84a]
6. Cascade then checks: "without paying its mana cost." Casting for free is permitted here. The spell is a nonland card — no other restriction in cascade bars it. [702.84a]
7. However, when casting [[Walking Ballista]] without paying its mana cost, you cannot pay alternative or additional costs that include {X}, but more critically: you must choose a value for X. Since you are not paying the mana cost, X defaults to 0. You may not pay mana to set X higher when casting via cascade (no mana cost is being paid). [107.3b], [601.2b]
8. Casting proceeds with X = 0. [[Walking Ballista]] enters the stack as a spell with mana value 0.

RULE TRACE
- [702.84a] — Cascade definition and procedure.
- [202.3a] — Mana value of {X} spells outside the stack: X = 0.
- [107.3b] — When not paying a co
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
Q3 — Pending: the last time counter was just removed from [[Lotus Bloom]].
Q4 — Not stable; trigger detection required.
Q5 — Active player will receive priority after triggers are placed.

RESOLUTION
1. **WOULD-EVENT:** The last time counter is removed from [[Lotus Bloom]] in the exile zone.
2. **"Can't" check:** No applicable "can't" effects. [614.17]
3. **Replacement/prevention:** None applicable to counter removal.
4. **Final event:** [[Lotus Bloom]] now has 0 time counters while in exile with suspend. [702.62]
5. **Trigger detection — two separate triggers fire:**

   **Trigger A — Suspend's "last counter" trigger:**
   Suspend reads: "When the last time counter is removed from this card while it's exiled, you may cast it without paying its mana cost if it has flash or if it's your turn." This is a triggered ability that triggers when the last time counter is removed. [702.62b]

   **Trigger B — Suspend's "upkeep" trigger:**
   Suspend also reads: "At the beginning of your upkeep, if this card is in exile with a time counter on it, remove a time counter from it." This trigger fires **only** during upkeep and requires a time counter still present — it does **not** fire here. [702.62a, 603.4 intervening-if]

6. **Correct trigger — only Trigger A is valid.** The intervening-if clause on the upkeep trigger [603.4] prevents it from firing now that 0 counters remain. Only the "last counter removed" trigger enters the waiting state. [603.2]
7. **Waiting state:** The "last counter removed" trigger waits. [Axiom 6]
8. **Finish process:** Counter removal is complete.
9. **SBA loop:** No SBAs applicable.
10. **Trigger insertion:** The "last counter removed" trigger is placed on the stack by the active player. [603.3]
11. **SBA loop:** No SBAs.
12. **Priority:** Active player receives priority.

RULE TRACE
- [702.62a] — Suspend upkeep trigger; requires time counter present (intervening-if).
- [702.62b] — Su
```

### R4 — Foretell — alternative cost from exile

**Scenario:**
```
Last turn, I foretold a card by paying {2}: now there's a face-down card in exile. This turn, I want to cast it via its foretell cost. The card is [[Behold the Multiverse]] (Foretell {1}{U}{U}, normal cost {3}{U}). What cost do I pay?
```

**Expected:** {1}{U}{U} (the foretell cost), and I cast it from exile. Foretell cost is an alternative cost [702.143].

**Failures:**
- Missing required citations: 702.143

**Arbiter response:**
```
STATE
Q1 — No process resolving.
Q2 — No SBAs applicable.
Q3 — No waiting triggers.
Q4 — Stable checkpoint; player has priority on their turn.
Q5 — Active player; attempting to cast an exiled foretold card via foretell alternative cost.

RESOLUTION
1. Player declares intent to cast [[Behold the Multiverse]] from exile using its foretell alternative cost. [601.2a]
2. Foretell is an alternative cost defined on the card; casting via foretell means substituting the foretell cost for the mana cost. [601.2b, 702.185]
3. The foretell cost on [[Behold the Multiverse]] is {1}{U}{U}. This is the cost locked in at the time of casting. [601.2f]
4. No additional mandatory costs apply in the stated scenario. The {2} paid during the foretell action on the previous turn was the cost to exile the card face-down; it is not a component of the casting cost. [702.185a]
5. Total cost to cast: **{1}{U}{U}**. [601.2f]

RULE TRACE
- CR 601.2a — Casting begins with choosing the spell.
- CR 601.2b — Alternative costs may be used instead of mana cost.
- CR 601.2f — Total cost is locked in before payment.
- CR 702.185 — Foretell keyword rule; the {2} exile payment is the foretell action itself, not part of casting.
- Axiom 1 — Engine processes casting as a single ordered sequence.

VERDICT
You pay {1}{U}{U}; the {2} paid last turn was the cost to foretell (exile) the card and is entirely separate from the casting cost.
```

### R5 — Mutate creates a merged permanent

**Scenario:**
```
I control [[Brokkos, Apex of Forever]] (my commander, 6/6). I cast [[Auspicious Starrix]] for its mutate cost, placing Auspicious Starrix on TOP of Brokkos. What is the merged permanent?
```

**Expected:** A single permanent with Auspicious Starrix's printed name on top: it has the top card's name, types, P/T, mana cost, AND all abilities of all cards in the merged stack. Effectively, Auspicious Starrix is on top; the merged permanent is "Auspicious Starrix" (5/5 with Auspicious Starrix's abilities + 

**Failures:**
- Missing STATE section
- Missing RESOLUTION section
- Missing RULE TRACE section
- Missing VERDICT (or UNRESOLVED/LEGAL ACTIONS) section
- Missing required citations: 702.139, 729

**Arbiter response:**
```
I need Oracle text for both cards to proceed accurately. Let me work from the standard printed Oracle text for these cards.

---

**CARD TEXT REFERENCE**

**Brokkos, Apex of Forever** — Legendary Creature — Nightmare Elk Beast. 6/6. Trample. Mutate {2}{B/G}{B/G}{G}. You may cast Brokkos from your graveyard using its mutate ability. *(Mutate rule text standard.)*

**Auspicious Starrix** — Creature — Elk Beast. 5/5. Mutate {3}{G}. Whenever this creature mutates, exile the top X cards of your library, where X is the number of times this creature has mutated. Put any number of permanent cards from among them onto the battlefield.

---

## STATE

Q1 — Mutate spell (Auspicious Starrix) is resolving.
Q2 — No SBAs applicable mid-resolution.
Q3 — Mutation trigger will enter waiting state after resolution.
Q4 — Not yet stable.
Q5 — Active player will receive priority after SBA/trigger processing.

---

## RESOLUTION

1. **[WOULD-EVENT]** Auspicious Starrix resolves as a mutate spell targeting Brokkos. [702.140b]
2. **[MERGE]** The two components merge into a single object. Starrix is placed on top; Brokkos is on the bottom of the pile. [702.140e]
3. **[CHARACTERISTICS — TOP OBJECT]** The merged permanent's copiable characteristics (name, mana cost, types, abilities, P/T) come from the **top component**: Auspicious Starrix. [702.140e, 613.2]
4. **[CHARACTERISTIC ACCUMULATION]** The merged permanent also gains **all keyword abilities** from each component in the pile. Brokkos contributes **Trample** and its **Mutate** ability. Starrix contributes its **Mutate** ability and its **mutation trigger**. [702.140e]
5. **[COMMANDER STATUS]** The merged permanent **is still your commander**. Commander status is a property of the permanent, not a component. [903.4, 702.140e — the object retains its commander designation]
6. **[TRIGGER DETECTION]** The mutation trigger on Starrix fires: "Whenever this creature mutates." This has mutated once. [603.3]
7. **[WAITING STATE]** Trigger enters
```
