# BRAIN-13 Coverage Plan — make the training-set decks PLAY in the sim

> **Hans (Scout), 2026-06-19.** The brain-build training set is **13 decks**: Colton's 6 + Joe's 7
> ([[project_brain_build_path]]). This is the prioritized capability plan to take those 13 from "casts &
> attacks, engine silent" to "actually does its thing." Hand-off target: **Clyde** (verify + execute via Dex/Walt).
> Supersedes the 15-deck snapshot in `real-deck-unlock.md` for the *training-set* scope (that doc stays as the
> general DEX backlog). Personal deck URLs/lists are NOT in this repo — they live in local brain memory
> (`deck_joe_roster.md`, `deck_*.md`).

## 🔬 CLYDE VERIFICATION ADDENDUM (2026-06-20) — per-deck audit; plan needs scope rework

A 13-agent per-deck audit (each independently measured real coverage + cross-checked this plan; workflow
`wf_fb8182a0-2b3`) returned: **skeleton sound, scope incomplete.** 0 decks clean · 8 minor-corrections · 5
major-issues (Vihaan, Rograkh/Thrasios, Toph, Ur-Dragon, Mothman). The structural miss:

**🔴 ALL 13 COMMANDERS ARE NON-NATIVE, and the plan never scopes the commander engines as buildables.** In
11/13 decks the commander is the single #1 gap; in 6+ NO bucket models it. P1–P8 cover the *support shells*
(combat/counters/tokens/equipment/landfall) but not each deck's actual engine. → **Add a per-commander unlock lane.**

**Demote (over-claimed — inflated decks-unblocked counts):** **P4** token-doubling → real beneficiaries
Vihaan + Koma only (Slivers/Toph/Pantlaza have NO doublers); **P6** landfall → real Toph only (Koma/Zaxara/Omnath
= 1 fringe card each). And a token DOUBLER with no native token SOURCE doubles zero — build the source first.

**Add 5 missing buckets:** (1) death-trigger DRAIN / aristocrats (Vihaan, 9 cards + generalizes) · (2) tribal
card-DRAW triggers (Slivers, Ur-Dragon) · (3) EARTHBEND / land-animation (Toph — WALT-ANIMATE multi-PR) · (4)
RAD-COUNTER + MILL (Mothman — whole engine unmodeled) · (5) DRAGON-tribal triggers (Ur-Dragon) + damage/P-T
DOUBLING replacements (Wolverine). Re-scope **P7** into an explicit per-commander lane; **split CAST-TRIGGER-VALUE
(Kellan) out of discover/cascade** (Kellan is cast-from-non-hand, not cascade).

**Drop (ALREADY NATIVE — wasted effort if built):** Heart/Horned/Talon/Winged/Muscle/Sinew Sliver · Vihaan's
Pitiless Plunderer/Goldspan/Bastion/Elas/Dictate · Rog/Thras's entire mana base + Swan Song/Eternal Witness/Crop
Rotation · Kellan's Nature's Lore/Counterspell/Swords · Captain America's Urza's Saga (**strike Cap from P8**).

**↻ REVISED FIRST 3 (data-ranked, highest impact-per-effort):**
1. **DEATH-TRIGGER DRAIN** (Cindy) — one event-hook ("creature dies → each opp loses N / you gain N" + edict-on-death);
   flips 6+ Vihaan drains (Blood Artist/Cruel Celebrant/Zulaport/Marionette/Agent/Grave Pact) in one slice AND
   generalizes to every aristocrats deck. Pulls Vihaan out of major-issues for the least effort. **← new #1.**
2. **COMMANDER UPKEEP/ETB TOKEN-SOURCE + DISCOVER** (Cindy/Walt) — Pantlaza (Discover, the cleanest commander match
   in the set), Koma (upkeep Serpent — also makes the P4 doublers actually function), Zaxara token half.
3. **ENTERS-WITH-X COUNTERS + X-ON-STACK** (Walt) — Zaxara commander + ~7 hydras that currently resolve as 0/0 and
   die to SBA; pair with the Zaxara X-spell→Hydra trigger (same X-tracking).

**P1 (green combat, 7 decks) stays the confirmed cross-deck #1** and is already shipping (#314 OVERRUN-X). CREED:
**P7 tribal-grant + P2b/P4 replacement lanes remain highest-risk** — large-sample review before merge (Walt's
#315 already hardened the tribal selector, FPs 18→0). Full per-deck verdicts in the workflow transcript.

---

## ⚠️ Retraction — no training-set deck is incomplete

An earlier scope flagged three of Joe's decks as sub-100 ("needs finishing"): Toph (81), Wolverine (85),
Pantlaza (89). **That was bad roster data, not incomplete decks.** Colton confirmed live Moxfield lists —
**all three are a complete 100 cards.** Re-measured from the authoritative lists:

| Deck (Joe) | Cards | Non-land native | Gap shape |
|---|---|---|---|
| Wolverine, let's fight | 100 | **6%** (4/65) | 41 body-only · 20 arbiter-spell |
| Pantlaza, Jurassic Ramp | 100 | **19%** (12/62) | 40 body-only · 10 arbiter-spell |
| Toph, Earth Bent | 100 | **15%** (9/61) | 40 body-only · 12 arbiter-spell |

The other 4 Joe decks (Kellan, Captain America, Ur-Dragon, Mothman) have NOT been re-verified from live links —
do not flag any of them incomplete without a live fetch first. **Net: there is no "go chase Joe for missing
cards" action.** The bottleneck is engine coverage, not deck completeness.

## The core finding — the gap is BODY-ONLY, not un-castable

Across all three re-measured decks, ~**40 of ~50** gap cards per deck are **body-only**: the permanent enters,
sits on the board, and can attack — but its triggered/static **engine** does nothing. These decks *look*
playable in a goldfish (creatures resolve, combat happens) yet the deck's actual gameplan is inert. The
realism gate (non-land native %) is the honest measure of "does the deck do its thing," and it's low because
the **payoff/engine text** — not the casting — is unmodeled.

This sharpens the build target: prioritize the **triggered/static payoff shapes that recur across the most
decks**, because each one silently un-bricks a whole archetype, not just one card.

## Priority order (by decks-unblocked, then tractability)

### ⭐ P1 — GREEN COMBAT PAYOFFS  (7 decks: Wolverine · Pantlaza · Toph · Koma · Zaxara · Omnath · Slivers)
The single biggest cross-deck lever. This is **DEX Slice 4** in `real-deck-unlock.md` — confirmed #1 by the
13-deck data. Build the tractable subset; route replacements to the Arbiter.
- **Trample anthem / overrun** (team gains trample +X/+X until EOT): Overwhelming Stampede, Craterhoof Behemoth,
  Pathbreaker Ibex (Omnath), Garruk's Uprising (static trample anthem).
- **ETB-draw on power-4 / "creature with power ≥N enters → draw"**: Garruk's Uprising, Elemental Bond,
  Guardian Project (Slivers), Garruk's Uprising again (it's in 3+).
- **Draw = greatest power among your creatures**: Rishkar's Expertise, Return of the Wildspeaker, Inspiring Call
  (draw per +1/+1-counter creature + team indestructible).
- **Team protection grant** (hexproof+indestructible until EOT): Heroic Intervention (Wolverine, Koma, Toph, …).
- **Landmines:** counter-DOUBLING (Branching Evolution) and cost-reduction are replacements → **defer to Arbiter**;
  cherry-pick the clean static-anthem + ETB-draw + overrun + draw-equal-power shapes. "Greatest power" must read
  the live layer P/T, not printed.

### ⭐ P2 — +1/+1 COUNTER ENGINE  (5 decks: Wolverine · Toph · Zaxara · Mothman · Pantlaza)
Re-rated UP from the original draft — the 13-deck data shows counters are an engine in nearly half the set, not a
fringe mechanic. Split into a tractable slice and a deferred-hard slice.
- **P2a — proliferate + counter payoffs (tractable, build first):**
  - Proliferate action: Evolution Sage (Toph, landfall), Karn's Bastion (Wolverine/Toph), Inexorable Tide
    (Mothman), Contagion Clasp/Engine (Mothman). Needs an AI "which permanents/players to proliferate" heuristic.
  - Counter-mover / payoff statics: The Ozolith (Wolverine/Toph), Herald of Secret Streams (Zaxara — counters →
    unblockable), Sphere Grid (Zaxara/Toph), Hardened Scales-adjacent payoffs that *aren't* replacements.
  - **Poison/−1−1 already enforced** (KW-POISON #294/#298) — Mothman's infect/toxic creatures already route the
    damage correctly; proliferate is the missing multiplier on top.
- **P2b — counter-DOUBLING replacements (hard, defer):** Doubling Season, Branching Evolution, Primal Vigor,
  Corpsejack Menace, Winding Constrictor, Hardened Scales. Replacement effects on counter placement — semantics
  are subtle (interaction with proliferate, with ETB-with-X-counters). Build **after** P2a, as its own lane.

### P3 — FIGHT  (2 decks, Wolverine-dense: Wolverine · Zaxara)
"Creature fights target creature" + "deal damage = power to target creature" (Ram Through trample-over variant).
- Cards: Ulvenwald Tracker, Ancient Animus, Ram Through, Beastie Beatdown, Neyith of the Dire Hunt, Inscription
  of Abundance (modal) — Wolverine; Voracious Hydra, Gargos — Zaxara.
- The source-aware damage seam exists (combatResolution / KW-POISON routing). Fight = mutual non-combat damage at
  one timestamp + lethal SBA, no combat phase. **MEDIUM.** Single PR likely covers the clean cases.

### P4 — TOKEN DOUBLING + token payoffs  (5 decks: Koma · Vihaan · Toph · Pantlaza · Slivers)
Doubling Season, Parallel Lives, Adrix and Nev, Mondrak, Xorn — replacement effects on token creation. **Vihaan's
entire engine** (Treasure animation → aristocrats) leans on token + death triggers. Shares replacement-effect
machinery with P2b — sequence them together. **HARD** (replacement layer). Note: Vihaan's token *creation* drains
(Mirkwood Bats, Reckless Fireweaver, Nadier's Nightblade) are separate trigger work, partly shippable ahead of
the doublers.

### P5 — EQUIPMENT subsystem  (2 decks, huge card count: Captain America 20+ · Wolverine 7)
Equip cost → attach to creature → grant bonus while attached (layer 6/7). `parseEquipmentBonus` +
`equipmentAbilityClauses` hooks already exist in staticAbilityParser. **Multi-PR, like the PW framework.** Cap
America is ~dead without it. Cards: Leyline Axe, Power Fist, Conformer Shuriken, Cori-Steel Cutter, Lightning
Greaves (Wolverine); Colossus Hammer, Kaldra Compleat, Sword of X-and-Y cycle, Commander's Plate, … (Cap).

### P6 — LANDFALL  (4 decks: Toph core · Koma · Zaxara · Omnath)
"Whenever a land you control enters → {draw | +1/+1 counters | token | ramp}." Toph's commander + payoffs
(Lotus Cobra, Scute Swarm, Ashaya, Lumra, Ancient Greenwarden), Aesi (Koma), Mossborn Hydra (Zaxara/Toph). New
trigger event on land-ETB. **MEDIUM.** One PR for the trigger + the clean payoffs.

### P7 — COMMANDER-DEFINING single-deck unlocks
Each makes ONE deck's commander actually function. Worth it because the commander is in every game of that deck.
- **X-SPELL CAST TRIGGER** (Zaxara): cast a spell with {X} → make a 0/0 Hydra with X counters. Reuses cast-trigger
  infra + X-tracking. **MEDIUM.**
- **DISCOVER / CASCADE** (Pantlaza · Kellan): attack/ETB → exile-top-until-MV-≤N, cast free or to hand. Cascade
  (Apex Devastator, Kellan's free-spell engine) shares the exact exile-from-top-cast-free engine — build once,
  cover both. **MEDIUM-HARD**, 2 PRs.
- **EMINENCE / command-zone cost static** (Ur-Dragon): dragon spells cost {1} less from the command zone.
  Cost-reduction that fires before the battlefield. **MEDIUM.**
- **TRIBAL KEYWORD GRANT** (Slivers): "Sliver creatures you control have [keyword]" — stack grants, re-evaluate
  per Sliver. The clean keyword-grant subset (≈15 of 30 Slivers: Blur/Galerider/Sentinel/Lancer/Heart/Venom/…)
  is **MEDIUM**; mana-Slivers (Gemhide/Manaweft) and restriction-evasion (Shifting/Magma) defer. **Highest CREED
  risk in the plan** — a type-gated grant that's too broad mints an FP per mis-identified creature. Tag the PR
  for a large-sample Hans review before merge.

### P8 — SAGAS / LORE COUNTERS  (5 decks, ~1–2 cards each: Wolverine · Cap America · Rograkh · Toph · Pantlaza)
Lore counter on draw step → per-chapter dispatch → sacrifice after final chapter. Urza's Saga (Wolverine, Cap,
Rograkh) is a mana-rock + Construct factory in practice. **Multi-PR:** framework first, then chapter effects.
Lower priority — thin per-deck, and the framework cost is high relative to cards unblocked.

### Kellan, the Kid (Joe) — folds into existing buckets, no new top-level capability
Scoped from the roster list (partial — verify exact count with a live link): **16% non-land native**, same
body-only-dominated gap (39 body-only · 13 arbiter-spell · 2 arbiter-pw). **It is NOT a flicker deck** (a Bant
outlaws / value / free-spell goodstuff deck) — its gaps map onto work already planned:
- **Ramp** (Nature's Lore, Rampant Growth, Growth Spiral) → already shipped (DEX Slice 1). ✓
- **Counters** (Counterspell, Spell Pierce, Fierce Guardianship) → DEX Slice 3.
- **Planeswalkers** (Jace Reawakened, Tezzeret the Seeker) → **Walt's PW lane** (arbiter-pw tier today).
- **Green finishers** (Craterhoof Behemoth, Transcendent Dragon) → P1.
- **Cascade / free-spell engine** (Apex Devastator + Kellan's commander) → P7 discover/cascade (shared engine).
- **Tax / draw engines** (Esper Sentinel "opponent casts noncreature → pay or I draw", Smothering Tithe
  "opponent draws → pay or I make a Treasure") → **extend the P-existing tax-engine bucket** (DEX Slice 5,
  Rhystic/Mystic Remora) with the *opponent-casts-noncreature* and *opponent-draws* trigger events. Same
  pay-or-value shape, two new trigger hooks.
- **Defer (hard, single-deck):** clones (Visage Bandit, Sakashima's Protege — shares Koma's P4 clone package) and
  play-from-top-of-library statics (Future Sight, Mystic Forge, The Reality Chip, Bonny Pall) → Arbiter for now.

**Net: Kellan needs ZERO net-new capability** beyond two trigger hooks on the existing tax-engine bucket — every
other gap is already on the board (P1 / Slice 3 / Slice 5 / P7 / Walt). It's the cheapest of the 13 to unblock.

## Route-to-Arbiter (mark MUST_DROP_TO_LOW, don't claim coverage)
Genuinely intractable / exotic for self-play, training-set occurrences are 1–2 cards each:
Storm (Flusterstorm), Cipher (Hidden Strings), Delirium (Shifting Woodland), Warp (Starwinder), Bestow (Nyxborn
Hydra), Dash (Ragavan), Convoke (Chord of Calling, Harmonized Crescendo), Pact-upkeep (Pact of Negation),
alt-cast free counters (Force of Will / Fierce Guardianship free mode — defer until the cast-cost path lands;
DEX Slice 3 should ship the *clean* soft-counter riders first: An Offer You Can't Refuse, Swan Song, the
"unless pay {N}" family). Mana-multiplication ×3 (Nyxbloom Ancient — Omnath) is a mana-seam replacement, hard.

## Execution summary for Clyde
| Bucket | Suggested owner | ~PRs | Unblocks |
|---|---|---|---|
| P1 Green combat payoffs | DEX (Slice 4, queued) | 1–2 | 7 decks |
| P2a Proliferate + counter payoffs | Cindy / Walt (counter lane) | 1–2 | 5 decks |
| P2b Counter-doubling replacements | Cindy (after P2a) | 1–2 | 5 decks |
| P3 Fight | Cindy | 1 | Wolverine, Zaxara |
| P4 Token doubling + payoffs | Cindy (with P2b) | 2 | Koma, Vihaan, Toph, Pantlaza, Slivers |
| P5 Equipment subsystem | Cindy (multi-PR, PW-style) | 3+ | Cap America, Wolverine |
| P6 Landfall | Cindy | 1 | Toph, Koma, Zaxara, Omnath |
| P7 Commander unlocks (X-trigger / discover+cascade / eminence / tribal-grant) | Cindy + Walt | 4 | Zaxara, Pantlaza, **Kellan**, Ur-Dragon, Slivers |
| P8 Sagas | Cindy (multi-PR) | 2 | Wolverine, Cap, Rograkh, Toph, Pantlaza |
| (Kellan tax-engine extension) | DEX (Slice 5 +2 hooks) | +0–1 | Kellan (Esper Sentinel, Smothering Tithe) |

**All 13 are covered by the buckets above** (Colton's 6 + Joe's 7). Kellan, the Kid needs no net-new capability —
it's the cheapest to unblock (folds into P1 / Slice 3 / Slice 5 / P7 / Walt). If the set is later trimmed to 12,
any 12-subset is already covered.

**Acceptance for every slice = the realism gate** (non-land native % per deck), re-measured with the per-deck
scan, NOT corpus %. Re-run after each slice; P1+P2a alone should move the 13-deck aggregate from ~20% toward
~35%. **Standing Hans QA:** every merged slice touching these 13 gets the flip-diff FP sweep; tribal-keyword-grant
(P7) and the replacement-effect lanes (P2b/P4) are the highest CREED-risk — large-sample review before merge.
