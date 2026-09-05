# RUNBOOK — KILLER TURTS to 85 (70/100 · 30 non-native · needs 15)

> Umbrella: [POD-SIM-THREE-DECKS.md](POD-SIM-THREE-DECKS.md) (the capability map, the shared seams, the order).
> Deck memory: `memory/deck_raph_and_mikey.md` ("Killer Turts", Raph & Mikey's deck — verify live before deck talk).
> Measured 2026-09-05. Every non-native card below was dumped with its REAL oracle and live tier; every sizing was
> probed against the engine the same day (see the umbrella's §2). Nothing here is from memory.

---

## 0. THE DECK IN ONE PARAGRAPH (what the pod sim must be able to do)

A red-green **extra-combat** deck: ramp with rituals, land a couple of bodies, then chain combat phases —
Port Razer, Savage Beating, Full Throttle, World at War, Overpowering Attack, Grim Reaper's Sprint, Great Train
Heist, Last Night Together — with Peter Parker's Camera copying the triggers and Final Fortune / Last Chance /
Warrior's Oath (already native, V12) as the finishing extra turns. A stack of red interaction (Pyroblast,
Guttural Response, the redirect suite, Veil of Summer) protects the turn. **Plan-critical:** the extra-combat
family (7 cards) and the ritual mana (3 cards). If the sim cannot take a second combat, it is not this deck.

## 1. THE 30 NON-NATIVE CARDS — sized

Legend: **S** one arm on an existing seam · **M** a new arm plus a runtime seam · **L** a new subsystem · 🅿 park.
"Blocker" is in ENGINE terms (what the probe showed the runtime lacks), not in card terms.

### 1a. Extra-combat family (7 cards · seam S-D · plan-critical · ~M once, then S each)

| # | Card | Oracle gist | Blocker (probed) | Size | CREED note |
|---|---|---|---|---|---|
| T1 | **Port Razer** | combat damage → untap each creature you control + additional combat; can't attack a player it already attacked this turn | ✅ DONE 2026-09-05 (KT-1): a `notAlreadyAttacked` defender requirement keyed on the attacker's `attackedPlayersThisTurn` memo (stamped at declare-attacker, cleared at untap); fails closed without the memo | **S** | pinned: not offered in the second combat against the same player; a plain bear still is; offered again after untap |
| T2 | **Savage Beating** | cast only during combat on your turn; modes: double strike / untap + extra combat; entwine | ✅ DONE 2026-09-05 (KT-6): the cast window is peeled and STAMPED on the program (`castTiming`, the strive discipline); legalChoices' offer loop refuses the cast outside your combat | **S/M** | pinned: offered in your combat; never in your main phase; never in the opponent's combat; the peel-without-stamp mutant (the over-offer) died |
| T3 | **Full Throttle** | after this main phase, TWO additional combat phases; at the beginning of each combat this turn, untap all creatures that attacked this turn | ✅ DONE 2026-09-05 (KT-7b): the after-main extra combat gains a COUNT; the delayed scheduler gains a REPEATING record (fire step beginning-of-combat, yours, kept for the turn, lapsing after); the extra-combat re-entry drains it too | **M** | pinned: three combats in the turn, the attacker untapped at the start of each; nothing next turn; the fire-once and no-re-entry-drain mutants died |
| T4 | **World at War** | after the SECOND main phase, an additional combat + main; at that combat's beginning untap attackers; Rebound | "after the second main phase" insertion point + the delayed untap + rebound | **M** | rebound must actually re-offer the cast next upkeep or stay unmodeled for that line |
| T5 | **Overpowering Attack** | untap creatures that attacked this turn; if main phase, extra combat + extra main; Freerunning | ✅ DONE 2026-09-05 (KT-7a): the creature untap with an attacked-this-turn filter (the declare-attacker flag); the after-main extra combat with a RESOLUTION-TIME your-main-phase gate; freerunning credited hard-cast only (the foretell/blitz precedent — a known under-offer) | **S** | pinned: the homebody stays tapped; nothing queued outside your main phase, nor in the opponent's |
| T6 | **Grim Reaper's Sprint** | Morbid cost reduction; Aura; ETB untap each creature + extra combat if main phase; +2/+2 haste | ✅ DONE 2026-09-05 (KT-8): the aura ETB rides KT-7a's gated arm; MORBID = a fixed self cost-reduction gated on any creature having died this turn (every seat's counter, CR 700.4), read by the cast lane's self-metric seam; the aura residue check treats the modeled sentence as not-residue | **S** | pinned: castable for {R}{R} only after a death under either seat; the unconditional and your-deaths-only mutants died |
| T7 | **Great Train Heist** | Spree: untap all + extra combat if combat; +1/+0 first strike; Treasure-on-damage to target opponent this turn | spree (choose-one-or-more additional costs) + a turn-scoped delayed trigger | **M/L** | modes 1–2 parse natively as bare text; spree's cost structure is the seam — sized on approach |

### 1b. Ritual mana (4 cards · seam S-E)

| # | Card | Oracle gist | Blocker (probed) | Size | CREED note |
|---|---|---|---|---|---|
| R1 | **Rite of Flame** | add {R}{R}, then {R} for each card named Rite of Flame in each graveyard | ✅ DONE 2026-09-05 (KT-3): a per-count add-mana over the `cardsNamedInAllGraveyards` count kind (every seat's graveyard), read at resolution — the resolving Rite itself is not yet in the graveyard (CR 608.2m) | **S/M** | pinned: yours + an opponent's copy = +2; the mutant that read only your graveyard died |
| R2 | **Irencrag Feat** | add seven {R}; you can cast only one more spell this turn | ✅ DONE 2026-09-05 (KT-3): the word-number pip form + a SELF cast limit (`castLocksThisTurn[you].spellLimit`, keyed on spellsCastThisTurn at resolution, self-expiring with the turn; the caster only) | **S** | pinned: exactly one more spell offered, then none; next turn free; the opponent never locked; the from-zero mutant (no spells at all) died |
| R3 | **Geosurge** | add {R}×7, spend only on artifact or creature spells | ✅ DONE 2026-09-05 (KT-4a): the pip-pool twin of the any-combination restricted add — the splitter folds the rider onto the pip lead; an EXPLICIT pool + the parsed restriction; the same tagged `restrictedMana` entry the planner honours | **M** | pinned: the entry pays a creature and never an instant; the unrestricted mutants (parse-side and runtime-side) both died |
| R4 | **Open the Omenpaths** | modal: two mana of one colour + two of another, spend only on creature/enchantment spells / team +1/+0 | ✅ DONE 2026-09-05 (KT-4b): mode 1 = a two-colour restricted add; colours by the any-colour policy (commander identity in WUBRG order) and the next DISTINCT identity colour, else the next WUBRG colour; ONE tagged entry {c1:2, c2:2} | **M** | pinned: R/G under a red-green commander, W/R under mono-red (always two distinct colours), never more than four, the entry pays a creature and never an instant |

### 1c. Counters and protection (5 cards)

| # | Card | Oracle gist | Blocker (probed) | Size | CREED note |
|---|---|---|---|---|---|
| C1 | **Guttural Response** | counter target blue instant spell | ✅ DONE 2026-09-05 (KT-2): the two-filter counter atom; both filters enforced by the enumerator and the resolver | **S** | pinned: a red instant and a blue creature spell are never targets |
| C2 | **Pyroblast** | modes: counter target spell if it's blue / destroy target permanent if it's blue | ✅ DONE 2026-09-05 (KT-2): the "if it's <colour>" mode form is read as its RESTRICTED twin (REB's printed wording) — an honest UNDER-offer; Hydroblast rides the same rewrite | **S** | the legal-but-idle cast at a non-blue object is NOT modelled rather than mis-modelled; the sim never wastes it |
| C3 | **Avoid Fate** | counter target instant or Aura spell that targets a permanent you control | ✅ DONE 2026-09-05 (KT-9a): the targets-what predicate ALREADY existed ("a permanent you control"); the typed form adds a spell-type filter in front (`instantOrAura`, known to both evaluators) | **S** | pinned: an instant aimed at your creature is countered; a sorcery aimed at it and an instant aimed at the opponent's are never targets |
| C4 | **Not of This World** | counter target spell or ability that targets a permanent you control; costs {7} less if the target targets your 7-power creature | the same predicate + an ability target + a conditional reducer | **M** | rides C3 |
| C5 | **Veil of Summer** | draw if an opponent cast blue/black this turn; your spells can't be countered this turn; you and your permanents gain hexproof from blue and black | three effects: a colour-cast-this-turn draw, an uncounterable-this-turn flag, colour-scoped hexproof (from-colour exists? probe) | **M/L** | shared with Kinnan; each of the three halves must be real |

### 1d. Redirects (5 cards · seam S-H · L · LAST)

| # | Card | Blocker | Size |
|---|---|---|---|
| D1 | **Bolt Bend** | change the target of target spell/ability with a single target; costs {3} less with a 4-power creature | **L** |
| D2 | **Redirect Lightning** | same + additional cost 5 life or {2} | **L** |
| D3 | **Ricochet Trap** | same (spells) + trap alt cost | **L** |
| D4 | **Untimely Malfunction** | modes: destroy artifact / redirect / two creatures can't block | **M** without the redirect mode? NO — a modal spell with an unmodeled mode is not credited (all modes or nothing) → **L** |
| D5 | **Tibalt's Trickery** | counter + random mill + exile-until-nonland + free cast | **L** |

### 1e. Lands and rocks (4 cards)

| # | Card | Blocker | Size | CREED note |
|---|---|---|---|---|
| E1 | **City of Traitors** | ✅ DONE 2026-09-05 (KT-5): a landfall watcher with two new gates — `playedOnly` (the play-land dispatcher threads a `played` marker; the effect path does not, so a fetched or ramped land never fires it) and `landfallExcludeSelf` (never its own entry); both listed in the assembly | **S** | pinned: a played Mountain sacrifices City; an effect-placed Mountain does not; playing City itself does not |
| E2 | **Jeweled Amulet** | note the mana TYPE spent on the charge; later add that type | **M** | the noted type is state on the permanent |
| E3 | **Carpet of Flowers** | ✅ DONE 2026-09-05 (KT-10a): a BOTH-mains event (`anyMain`); a per-ability per-turn latch (the add-mana resolver stamps the trigger's ability key, the intervening-if reads it, untap clears it); an X-of-one-colour add over the TARGET opponent's lands of a basic type; opponent-targeted trigger effects admitted as enemy-side | **M** | pinned: three of one colour from three Islands (the Forest not counted); nothing at the second main the same turn; again next turn; nothing (and no stamp) with no Islands |
| E4 | **Gemstone Caverns** | pregame | 🅿 | umbrella §6 |

### 1f. The rest (5 cards)

| # | Card | Blocker | Size |
|---|---|---|---|
| F1 | **Last Night Together** | two targets untap + counters + keywords (native pieces) + extra combat + "only the chosen creatures can attack during that combat" | **M/L** — the attack restriction scoped to one combat |
| F2 | **World War Hulk** (Saga) | I: the next red/green creature spell this turn is free (a cast-cost replacement latch); II: counters (native); III: double P/T + trample | **M** |
| F3 | **Invasion of Ikoria** (Battle) | battles are unmodeled | **L** |
| F4 | **Scroll Rack** | exile any number from hand face down, draw that many, put exiled on top in any order | **M/L** (an ordering choice) |
| F5 | **Tezzeret, Cruel Captain** | planeswalker (loyalty from artifacts; three abilities incl. an emblem) | **L** |

---

## 2. THE SLICE PLAN (to 15)

Ordered by plan-criticality, then cost. Running total assumes each slice lands whole (flip-diff audited).

| Slice | Cards | Seam | Expected | Running |
|---|---|---|---|---|
| KT-1 | Port Razer (line 2) | attacked-players memo at declare-attackers | ✅ +1 | 1 |
| KT-2 | Guttural Response · Pyroblast | S-F two-filter counters + the "if it's blue" mode | ✅ +3 (Hydroblast too) | 3 |
| KT-3 | Irencrag Feat · Rite of Flame | S-E word-number pips + cast-lock rider; all-graveyards name count | ✅ +3 | 5 |
| KT-4 | Geosurge · Open the Omenpaths | S-E restricted spend on a spell's add-mana (+ two-colour choice) | ✅ Geosurge +2 · Omenpaths +1 | 8 |
| KT-5 | City of Traitors | land-play watcher on a land | ✅ +1 | 8 |
| KT-6 | Savage Beating | combat-only timing restriction (+ entwine honoured) | ✅ +1 | 9 |
| KT-7 | Overpowering Attack · Full Throttle · World at War | S-D: attacked-this-turn untap, two additional combats, delayed per-combat untap, after-second-main insertion; rebound + freerunning sized on approach | ✅ Overpowering Attack +1 · ✅ Full Throttle +1 · World at War ⬜ (rebound unmodeled) | 13 |
| KT-8 | Grim Reaper's Sprint | aura ETB extra combat + morbid reducer | ✅ +3 | 11 |
| KT-9 | Avoid Fate · Not of This World | targets-a-permanent-you-control predicate | ✅ Avoid Fate +2 · Not of This World ⬜ (spell-OR-ability target union + a target-conditional reducer — M) | 12 |
| KT-10 | Carpet of Flowers · Jeweled Amulet · Great Train Heist (spree) · World War Hulk | whichever lands cleanest | ✅ Carpet +8 · the rest ⬜ (Amulet L, Heist M/L, Hulk L — the Saga path credits no chapter) | 14 |

Stop the deck at ≥85. Everything unbuilt below the line (redirects, Tezzeret, Invasion, Tibalt's Trickery,
Scroll Rack, Last Night Together, Veil of Summer if unbuilt, Gemstone Caverns) → the Omnath arbiter list.

---

## 3. PER-SLICE DISCIPLINE (SHELF-85 §5, restated for this deck)

1. **Probe the real oracle** (the dump, never memory) and write the smallest honest arm.
2. **Runtime half FIRST.** The extra-combat arms are runtime seams (the phase-insertion queue, delayed triggers);
   the classifier arm comes after the runtime witness passes.
3. **Flip-diff by tier snapshot** — zero LOST; every unplanned gain audited whole-card (the ritual and counter arms
   will flip corpus twins: audit each).
4. **Witness file** per slice with the CREED negatives named in the tables above.
5. **Mutations SEEN to fail**; a survivor is documented, deleted, or gets its missing pin.
6. **Lint + FULL suite**, exit codes unpiped. **Docs** (RUN-LEDGER · CHANGELOG · this runbook's table · WAKE-REPORT).
7. **Measure the deck** (`measure-coverage.mjs "Killer Turts"`), commit, push, **CI green before the next push**.
8. Traps: no regex through heredocs; Edit for regex-bearing text; encode-before-write; stamp the real date; deck
   writes only via the app API.

## 4. THE OMNATH HAND-OFF (after 85)

Dump the remaining non-native cards and append them to `memory/orders/arbiter-nuance-queue.md` as "Pod-sim three
— Killer Turts, parked on the Arbiter", one line per card: name · blocker in engine terms · the play nuance (e.g.
"Bolt Bend: hold up with a 4-power creature; redirect removal at the Turts' commander"). COMMS line + sync-brain.
