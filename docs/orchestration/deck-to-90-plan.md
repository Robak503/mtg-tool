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
