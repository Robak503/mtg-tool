# 13 decks → 90% native — build plan (2026-07-02, Clyde)

Colton's directive: drive every training deck (Wolverine and up) to 90% native. Fan out per-card where useful.

## Baseline (measure-coverage, slot-%, authoritative)
Sliver Hivelord 92% ✅ · Vihaan 83% · Koma 82% · Zaxara 80% · Omnath 77% · Toph 73% · Ur-Dragon 72% · Pantlaza 68% · Kinnan 64% · Yuriko 62% · Rograkh/Thrasios 60% · Wise Mothman 59% · Wolverine 58% · Captain America 57% · Kellan 56%.

**⚠️ Analysis-method bug (fixed):** `publicCard` exposes the mana cost as `.mana` (NOT `.mana_cost`). Any deck census that builds `{name,type,oracle}` and drops `.mana` falsely marks EVERY X-spell non-native (hasX derives from the cost). Always classify the FULL `publicCard(lookupCard(name))`. The measure-coverage %s above are correct (full card); early per-deck non-native *lists* that omitted `.mana` overcounted X-spells.

## Achievability (triage: Omnath/Toph/Kellan succeeded; 11 rate-limited)
- **Omnath 77% → 90% PLAUSIBLE via folds** (13 buildable; tail = cost-reduction-X, aura-granted-ability, annihilator, equipment).
- **Toph 73% → BORDERLINE** (15 buildable, but a 12-card subsystem tail: land-play-permission, Panharmonicon extra-trigger, Saga, quest-counter, granted-ability-to-team).
- **Kellan 56% → SUBSYSTEM-BLOCKED**, cannot reach 90% on folds. Dominant blocker = **top-of-library-play** (Future Sight, Mystic Forge, One with the Multiverse, Eladamri, Fblthp, Reality Chip…) + cascade-at-depth + clone + PW-loyalty + equipment/reconfigure.
- **Likely also subsystem-blocked** (not yet triaged, by card shape): Wolverine + Captain America (equipment/reconfigure — Lizard Blades, Leyline Axe, Commander's Plate; granted-abilities), Rograkh/Kinnan (cEDH: Mana Drain, Flusterstorm, Mindbreak Trap, clone, cost-reduction).
- **Likely reachable** (few non-native, near 90%): Vihaan, Koma, Zaxara (Treasure/Hydra/big-mana — need per-deck triage, rate-limit permitting).

## TOP build slices (clean-fold first, by cross-deck leverage)
1. **Cast-watcher → draw** (compound/filtered) — Up the Beanstalk, Toski, Vega, Outcaster, Chulane → Omnath/Toph/Kellan. cf. Cast-trigger + draw atom both exist; wire the compound/filtered matcher.
2. **Landfall → payoff routing** (add-any-mana / add-counter / self-power-double) — Lotus Cobra, Scythecat, Tifa → Toph. cf+ss.
3. **Earthbend two-clause co-flip** — Badgermole, Bumi, Toph-BB, Avatar Kyoshi, Earth Rumble → Toph. cf+ss.
4. **Opponent-pays-to-deny** — Smothering Tithe (draw-trigger + create-treasure), Esper Sentinel (X=power) → Kellan/Vihaan. cf. **Reuses shipped taxed-payment infra** (see corpus-levers-buildspec.md follow-on).
5. **Discover trigger + activated** — Chimil, Ellie & Alan → Kellan. cf (applyDiscoverAtom ships).
6. **Impulse/reveal-top free-cast matchers** — Rashmi, Mind's Dilation → Omnath/Kellan. cf.
7. **Reflexive "when you do" bridge** — Earth Rumble, Old One Eye → Toph/Omnath. ss.
8. **Multi-cascade (N×)** — Apex Devastator → Omnath. ss (un-park "cascade, cascade").
9. **X-spell mass-to-battlefield / create-X-tokens** — Awaken the Woods, Finale of Devastation, Genesis Wave → Omnath.
10. **Aura-granted mana ability** (Utopia Sprawl), **combat-dmg→draw** (Toski/Bonny Pall), **move-counters atom** (The Ozolith), **ETB-fight** (Kogla), **modal-on-cast/ETB** (Silverback Elder).

## Highest-value SUBSYSTEMS (for the far decks)
1. **Top-of-library-play** — unblocks Kellan's tail (7+ cards). The single largest blocker cluster.
2. **Aura-granted triggered ability** — Super State, Bear Umbra, Tale of Katara, Akroma's Will → Omnath+Toph+Kellan (3 decks).
3. **Panharmonicon extra-trigger** — Traveling Chocobo, Ancient Greenwarden → Toph land-engine core.
Runner-up: cost-reduction-{X} (The Great Henge — Omnath + Toph).

## Full triage data
`tasks/w53n5imer.output` (Omnath/Toph/Kellan full reports + 22-cluster table). Re-run the triage for the 11 rate-limited decks when the server limit clears.

---

## OMNATH — remaining non-native cards, categorized (2026-07-02, Clyde) — batch plan

**Flipped:** Up the Beanstalk (compound-triggers, shipped).
**Batch 1 (fan-out RUNNING, w5ltdoin6):** Doubling Cube, Utopia Sprawl, Silverback Elder, Kogla, Genesis Wave, Vaultborn Tyrant, Old One Eye.

### BATCH 2 — buildable slices (agent-buildable, precise briefs ready)
1. **Lurking Predators** (body-only) — cast trigger DETECTED; effect = "reveal top card; if creature → battlefield; otherwise you may put on bottom." Build the reveal-top-conditional-put effect (creature→battlefield else optional-to-bottom). Check impulse-dig / library atoms + the conditional branch.
2. **Finale of Devastation** (arbiter-spell) — {X} tutor: "search library and/or graveyard for a creature card MV≤X → battlefield; shuffle if library; if X≥10, creatures you control get +X/+X and gain haste." Build X-tutor-to-battlefield (library-and/or-graveyard) + the X≥10 conditional team-pump-haste rider.
3. **Selvala, Heart of the Wilds** (body-only) — TWO abilities: ETB "whenever another creature enters, its controller may draw a card if its power is greater than each other creature's power" (conditional-power ETB draw, any-controller); "{G},{T}: Add X mana in any combination of colors, X = greatest power among creatures you control" (variable-mana ability). Both must model.
4. **Yeva, Nature's Herald** (body-only) — "You may cast green creature spells as though they had flash." A static casting-permission (flash-grant filtered to green creature spells). Model the casting-permission static (see Leyline of Anticipation-style "as though flash").
5. **Titan of Industry** (body-only) — modal ETB "choose two —" : destroy artifact/enchantment (modeled), target player gains 5 life (modeled), create a 4/4 Rhino (modeled), **put a shield counter on it** (NEW primitive — a shield counter prevents the next damage/destruction). Build the shield-counter atom + wire the choose-two modal ETB.
6. **Kamahl, Heart of Krosa** (body-only) — combatBegin trigger DETECTED ("creatures you control get +3/+3 and gain trample") + activated "{1}{G}: target land you control becomes a 1/1 Elemental creature with haste that's still a land" (land-animate). Check the animate-land atom (earthbend-adjacent).
7. **Return of the Wildspeaker** (arbiter-spell) — modal: "draw cards equal to the greatest power among NON-HUMAN creatures you control" / "NON-HUMAN creatures you control get +3/+3." Add a creature-TYPE-negation filter ("non-Human") to the power-count source + the pump scope.
8. **Defense of the Heart** (body-only) — upkeep trigger DETECTED + intervening-if (an opponent controls 3+ creatures) + sacrifice-self + "search your library for up to two creature cards, put them onto the battlefield, shuffle." Build the multi-tutor-to-battlefield (up-to-two) + the compound (upkeep→intervening-if→sac-self→multi-fetch). Triage flagged resolverExists.

### BATCH 2b — borderline (include with "park if too deep")
9. **Awaken the Woods** (arbiter-spell) — "Create X 1/1 green Forest Dryad land creature tokens." Parked at tokens.js:400 (a LAND-creature token's intrinsic mana would be dropped). Needs the token to FUNCTION as a mana-producing Forest. Build only if the mana-token is cleanly modelable, else park.

### SUBSYSTEM BUCKET — NOT one-shot agent builds; each is a design pass (name the subsystem)
- **Bear Umbra, Super State** → aura-granted-triggered/keyword-ability (grant a templated ability to the enchanted permanent). Highest cross-deck leverage (recurs in Toph, Kellan).
- **Kozilek, Butcher of Truth** → annihilator (defending player sacrifices N on attack) + the GY-shuffle-back.
- **Apex Devastator** → multi-cascade (cascade×N — single cascade is modeled but "cascade, cascade" is parked; emit N synthesized cascade triggers).
- **The Great Henge** → cost-reduction-{X} (dynamic self-cost-reduction by greatest power).
- **Commander's Plate** → equipment + dynamic protection-from-commander-color-identity.

**Sequencing:** integrate Batch 1 → launch Batch 2 (8 slices) → integrate → the subsystems become the Omnath tail (each a dedicated design+build). After all Batch-1/2 land, re-measure Omnath; the subsystems decide whether it clears 90%.
