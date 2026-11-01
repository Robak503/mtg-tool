# ABILITY-LOSS PROGRAM — "loses all abilities" (CR layer 6), staged

Owner: Cindy (integrator). Approved by Colton 2026-11-01 ("write it … then knock it out"). Builders: Opus 5.5 xhigh.
Research input (read it before building — every file:line is there): [ABILITY-LOSS-RESEARCH.md](ABILITY-LOSS-RESEARCH.md)
(a read-only inventory taken 2026-11-01 against master 35198906 / 700b4591; line numbers drift — re-grep before editing; its table of
re-grepped lines after S0a, and the S0b hand-off list, are at its top).

**Status (2026-11-01).** S0 is built in two passes. **S0a (built):** §1 items 1–7 and 10 inside layers.js — the op, abilityLossOf and
its board fast path, the stripped view (`abilityCardOf` / `withAbilityLoss`, exported), the collection filter, the grant cutoff, the
layers.js seeds, the name tables, the four prerequisites — and the §2 shape registry (`app/src/lib/learn/abilityLossShapes.js`) with
every stage off, its predicate wired into the four consult points. Mechanics: ENGINE-SCAFFOLD.md §4.6 ("Loses all abilities").
S0a's blind review (LAND-WITH-NOTES): F1 (the view memo's key), F2 (the subtype counts inside the derive), F4 (loyalty lines), F7
(memo reads inside a loss decision), F8 (the Changeling pins) and F9 (the save format, v7) are fixed in S0a; F3 and F6 are S3
prerequisites (below, after the slice table); F5 is in S0b's hand-off (the research file's table).
**S0b (next):** §1 items 8–9 and every reader OUTSIDE layers.js routed through the view, and the §5 census witness complete. S0 lands
only when S0b's census is complete; no stage turns on before.

## 0. Why a program, not a slice
~150 engine sites read a permanent's abilities from its PRINTED card (`perm.card`, `classLiveCard(...)`, the face-up view),
collapsing into ~10 chokepoints (triggersForEvent + 32 classLiveCard sites; staticEffectsOf / collectContinuousEffects;
effectAffects; the permanentHasKeyword seed; manaSources / manaCardOf; the activated-ability enumerator; canBlockAttacker;
deathLookback; applyEnterReplacements). Every per-card memo keys on the card OBJECT or its TEXT, so a flag on the permanent
would be cached away. One missed reader = a "lost" creature that still flies / triggers / taps for mana = a forbidden false
positive. So: build and route EVERYTHING first (S0, credits nothing), then credit cards stage by stage.

## 1. The mechanism (design decisions)
1. **A layer-6 op `loseAllAbilities`** (optional `exceptMana`), emitted by Auras (fixed affects, the Aura's ATTACH timestamp),
   global statics (dynamic selector), and resolution atoms (endOfTurn / untilOwnersNextTurn / while-source-remains later).
   Grants from the SAME effect (Darksteel Mutation's indestructible, Imprisoned in the Moon's `{T}: Add {C}`, Stasis Field's
   defender) are sibling descriptors tagged `grantedWith: <loss id>`, same timestamp.
2. **`abilityLossOf(state, id)`** → the latest affecting loss `{ timestamp, keep }`, memoised per state, with a BOARD FAST PATH:
   no loss effect on the board → every consult point is a no-op → every existing game stays byte-identical (and 9c3162b3's
   perf holds). Runs on the raw collection so `effectiveTypeIdentity` stays recursion-free; re-entry guard
   (effectAffects → matchesSelector → permanentHasKeyword can loop).
3. **The stripped VIEW card, `abilityCardOf(state, perm)`:** copy-aware card (manaCardOf's logic) → Class level view → stripped
   view: `oracle` / `oracle_text` = kept text (usually ""), `keywords: []` (REQUIRED — hasKeyword reads `keywords` live,
   outside its memo key), `abilitiesLost: true`; name, type, mana, colours, P/T, layout, isCommander kept. ONE view per
   (base card, kept text), memoised like `classLevels.viewOf`, so the object- and text-keyed caches stay correct and warm.
   Never rewrite `perm.card` (copies must copy the original — CR 707.2).
4. **Post-collection filter:** drop effects whose STATIC source is a lost permanent at layer ≥ 6 or non-layer markers; KEEP
   layers 1–5 (CR 613.6 — an effect that began applying keeps applying; the God-type and colour-CDA rulings). This also drops
   7a CDAs and STATIC_REGISTRY entries of the lost permanent.
5. **Grant cutoff in `effectAffects`:** an external real-ability grant (addKeyword of a real keyword, addAbility,
   addProtection, addWard) with timestamp ≤ the loss's does not apply unless `grantedWith` that loss (CR 613.7, 613.9; the
   bundled rulings: only abilities it had AT THAT TIME are lost; later grants work). Rules-effect pseudo-keywords (cantBlock,
   mustAttack, goaded, unblockable, activatedAbilitiesLocked, …) are NEVER cut (CR 113.12).
6. **Seeds in layers.js** read the view or nothing: keywordSet, permanentHasKeyword, keywordInstanceCount, protection colours /
   classes; keyword counters count only if newer than the loss (needs counter timestamps); kicked keywords dropped;
   `suspected` by its stamp.
7. **Name tables gate on `abilitiesLost`:** KNOWN_ROCKS, BASIC_LAND_MANA, cardEffects REGISTRY, STATIC_REGISTRY, and the
   intrinsic basic-land-type mana (`grantedBasicTypeColors`, CR 305.6/305.7 — the Imprisoned-in-the-Moon Plains taps only {C}).
8. **Layer-bypassing attachment readers** (`grantedActivatedForHost`, `grantedTriggersForHost`) get the timestamp cutoff
   explicitly.
9. **Look-back (CR 603.10a):** `deathLookback` and the leave-event constructor stamp the VIEW. **Entry (CR 614.12, 603.6b):**
   `applyEnterReplacements` asks `entersWithoutAbilities` (modelled on `entersAsCreature`); ETB triggers follow from the view.
10. **Prerequisites (S0):** attach timestamps (CR 613.7e — `attachPermanent` restamps the attached Aura/Equipment); sort layer 4
    by timestamp; counter timestamps (CR 613.7c); a `setCardTypes` op and a replace-all-creature-types op, both mirrored in
    `effectiveTypeIdentity` (a Lignified Elf stops getting the Elf lord's bonus).

## 2. Staging and the classifier
A closed SHAPE REGISTRY (one module): id, stage, anchored pattern, emitted descriptors. Its one predicate is read by the
attached-clause parser, parseClause, the spell clause parser, and auraPrintedSide / auraCastIntent. A shape whose stage is off
returns null → its text stays residue → the card stays parked. Turning a stage on = its shapes + its witnesses, and the
flip-diff must EQUAL a pre-committed expected-flips list (tier-snapshot), with program- and runtime-fingerprints alongside.
NOTE the coupling: `staticEffectsOf` applies `parseAttachedBonus` to any attached Aura WHATEVER its tier — adding an arm changes
runtime at once for every Aura of that shape (body-only transformation Auras are already being cast and doing nothing).
Pins to re-point when stages turn on: bestow.test.js (Trickster's Elk), setBasePtTarget.test.js, manaModel.test.js,
hostExileAura.test.js, auraClauseSide.test.js, spree.test.js.

## 3. Slices
| Slice | Builds | Credits (EDHREC rank) |
|---|---|---|
| **S0** infrastructure | §1 entirely + prerequisites + every reader routed through the view; shape registry with ALL stages off | **nothing** — flip-diff 0/0/0, A/B 80/80 byte-identical (no game creates the effect) |
| **S1** loss with existing ops | 7b set, setColor, creature-subtype replace, 7c; EOT spell atoms | Lignify (#2322), Kasmina's Transmutation, Ichthyomorphosis, Noggle the Mind, Retro-Mutation, Fresh Start, Mystic Subdual, Turn to Frog, Humble, Ovinize, Snakeform, Gift of Tusks, Merfolk Trickster, Warkite Marauder |
| **S2** "loses all other card types" | `setCardTypes` (keeps supertypes; drops correlated subtypes, CR 205.1a/b) | **Kenrith's Transformation (#743)**, **Amphibian Downpour (#1230)**, Eaten by Piranhas, Frogify, Reprobation, Trickster's Elk, Polymorphist's Jest |
| **S3** global / dynamic | dynamic selectors, CR 603.6b, 614.12, locked group sets (611.2c) | Humility, Dress Down, **Sudden Spoiling (#2088)**, **Final Showdown (#2217, its mode)**, Curious Colossus, Vedalken Humiliator, Overwhelming Splendor |
| **S4** grants from the same effect | `grantedWith` | **Darksteel Mutation (#586)**, Spider-Man No More, Stasis Field, Deep Freeze, Dragonshift, Dance of the Skywise, Chromium |
| **S5** becomes a noncreature | backlog E6: the "creature, land, or planeswalker" Enchant union (sba.js reads it as Enchant creature today), the planeswalker attack-target check, intrinsic mana loss | **Imprisoned in the Moon (#765)**, Minimus Containment, In Too Deep, Sugar Coat |
**Out of scope:** planeswalkers (Vraska, Oko, Will Kenrith — Colton's 09-30 call: their own program); name-setting
(Witness Protection #1959, Honest Work) — later.

**Stage prerequisites from S0a's blind review (2026-11-01, `review-abloss-s0a.md`) — each lands before its stage turns on:**
- **Before S3 — F3, typed tokens get timestamps (CR 613.7d — "An object receives a timestamp at the time it enters a zone").** The
  token minters (effects/atoms/tokens.js — the create-token, named-token and copy paths), amass, fabricate and manifest put
  permanents onto the battlefield without `timestamp`, so their statics carry 0. A static loss sourced from such a token (a token copy
  of Humility or Dress Down) would read older than every grant, counter and suspicion, and cut nothing granted before it (the
  forbidden direction); a token lord's grants always read older (a safe under-read). Stamp each minter the way the living-weapon
  germ is stamped (resolvers.js, `timestamp: ts2.timestampCounter` then the counter +1). Aura and Equipment tokens (Roles) already
  get one when they attach.
- **Before S3 — F6, CR 613.6 for an effect a lost permanent had already begun to apply.** `withoutLostStatics` drops EVERY layer ≥ 6
  part of a lost permanent's static effects. CR 613.6: "If an effect starts to apply in one layer and/or sublayer, it will continue to
  be applied to the same set of objects in each other applicable layer and/or sublayer, even if the ability generating the effect is
  removed during this process." Two cases the filter gets wrong: (a) a loss that also strips its own source — Humility made a
  creature by Opalescence: its 7b "base 1/1" is dropped while the loss itself (read raw) still applies; (b) a lost permanent's
  type-and-P/T static that began in layer 4 (an animation with a set P/T) keeps its type and loses its 7b set, so the creature is
  0/0. The filter must keep the later-layer parts of an effect whose earlier-layer part already applied. Nothing emits either today.

## 4. False-positive risks (each needs a witness)
1 name tables (Sol Ring / a basic still tapping); 2 the two layer-bypassing attachment readers; 3 the ~35 board scanners
outside the layers; 4 look-back dies / leaves triggers; 5 keyword counters, kickedKeywords, suspected (no timestamps); 6 combat
text readers (canBlockAttacker's aCard / bCard, toxicValue); 7 ward and the indestructible fallback; 8 effectiveTypeIdentity
and the lords; 9 layer ordering (layer 7 runs before 6 in the derive; layer 4 unsorted); 10 the copy path.

## 5. Witness design (the S0 gate — "fails if ANY reader still sees an ability")
1. **Absolute check:** over a corpus sample (built like textReadsOnce.test.js) + a carrier for EACH reader, inject a fixed-mode
   loss through `addContinuousEffect`; assert through every PUBLIC reader: no triggers for any event, no activated actions or
   mana sources, an empty keyword set over the whole vocabulary, empty protection and ward, no collected effects sourced from it
   at layer ≥ 6, no board-scanner hits.
2. **Carrier census:** for each reader R, the cards where R(printed) is non-empty must read empty through the view.
3. **Vanilla-twin differential with a NEUTRAL name** (so name tables can't hide a leak): whole legal-action lists and block
   matrices equal a no-text twin's.
4. **Grant timing:** Equipment attached before vs after the loss; counters before vs after; same-effect grants kept.
5. **A source lint:** forbid raw `x.card` into any registry reader outside an allowlist; one mutant per consult point.

## 6. Process (every slice)
Builder (Opus 5.5 xhigh) → its own full gates → **a blind adversarial review** (the 11-01 trial's lesson: every build had FPs
the review caught) → fixes → integrator gate → land. S0 may need two builder passes (layers core + prerequisites; then reader
routing) — it lands only when the census witness is complete.
